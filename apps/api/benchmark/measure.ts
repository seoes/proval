import type { AgentLoopEvent, LlmSender } from "../src/agent/llm/loop.js";
import type { ReviewMeasureEvent } from "../src/agent/pull-request/index.js";

export const ATTEMPT_STATUS_LIST = [
    "completed",
    "incomplete",
    "failed",
    "prepareFailed",
    "canceled",
    "interrupted",
] as const;

export type AttemptStatus = (typeof ATTEMPT_STATUS_LIST)[number];

export type PhaseName = "setup" | "plan" | "sub" | "writing" | "finalize";

export type PhaseTiming = {
    prepareMs: number | null;
    reviewMs: number | null;
    setupMs: number | null;
    planMs: number | null;
    subWallMs: number | null;
    writingMs: number | null;
    finalizeMs: number | null;
};

export type SubAgentMeasure = {
    index: number;
    durationMs: number | null;
    ok: boolean | null;
    fileCount: number;
    stepCount: number | null;
    toolCallCount: number | null;
    inputToken: number | null;
    outputToken: number | null;
    cachedInputToken: number | null;
};

export type SenderStat = {
    requestCount: number;
    retryCount: number;
    compressionCount: number;
    inputToken: number;
    outputToken: number;
    cachedInputToken: number;
    /** Sum of per request wall time. Requests overlap, so this can exceed reviewMs. */
    requestMsSum: number;
    /** The wrapper sits outside the concurrency limiter, so request timing includes queue wait. */
    includesConcurrencyWait: true;
};

export type TimedEvent = { at: number; event: ReviewMeasureEvent };

/** Wrap the sender returned by createSender so usage capture includes compression requests. */
export function measureSender(sender: LlmSender): { sender: LlmSender; stat: SenderStat } {
    const stat: SenderStat = {
        requestCount: 0,
        retryCount: 0,
        compressionCount: 0,
        inputToken: 0,
        outputToken: 0,
        cachedInputToken: 0,
        requestMsSum: 0,
        includesConcurrencyWait: true,
    };
    return {
        stat,
        sender: {
            async send(messageList, toolList) {
                const startedAt = performance.now();
                try {
                    const response = await sender.send(messageList, toolList);
                    stat.requestCount++;
                    stat.inputToken += response.usage.inputToken;
                    stat.outputToken += response.usage.outputToken;
                    stat.cachedInputToken += response.usage.cachedInputToken;
                    return response;
                } finally {
                    stat.requestMsSum += performance.now() - startedAt;
                }
            },
            getModel: () => sender.getModel(),
        },
    };
}

export class MeasureCollector {
    public readonly eventList: TimedEvent[] = [];
    private readonly phaseStartAt = new Map<PhaseName, number>();
    private readonly subStartAt = new Map<number, number>();
    private readonly subOkMap = new Map<number, boolean>();
    private readonly loopEndByAgent = new Map<string, Extract<AgentLoopEvent, { type: "loop-end" }>>();
    private retryCount = 0;
    private compressionCount = 0;
    private lastPhase: PhaseName | "none" = "none";

    public readonly timing: PhaseTiming = {
        prepareMs: null,
        reviewMs: null,
        setupMs: null,
        planMs: null,
        subWallMs: null,
        writingMs: null,
        finalizeMs: null,
    };

    public handleEvent = (event: ReviewMeasureEvent): void => {
        const at = performance.now();
        this.eventList.push({ at, event });
        if (event.type === "phase-start") {
            this.phaseStartAt.set(event.phase, at);
            this.lastPhase = event.phase;
            return;
        }
        if (event.type === "phase-end") {
            const startedAt = this.phaseStartAt.get(event.phase);
            if (startedAt !== undefined) {
                const key = event.phase === "sub" ? "subWallMs" : (`${event.phase}Ms` as keyof PhaseTiming);
                this.timing[key] = Math.round(at - startedAt);
            }
            return;
        }
        if (event.type === "sub-start") {
            this.subStartAt.set(event.index, at);
            return;
        }
        if (event.type === "sub-end") {
            this.subOkMap.set(event.index, event.ok);
            return;
        }
        if (event.type === "agent") {
            if (event.event.type === "loop-end") {
                this.loopEndByAgent.set(event.agent, event.event);
            } else if (event.event.type === "request-retry") {
                this.retryCount++;
            } else if (event.event.type === "compression") {
                this.compressionCount++;
            }
        }
    };

    public currentPhase(): string {
        return this.lastPhase;
    }

    public hasMaxStepsLoop(): boolean {
        for (const loopEnd of this.loopEndByAgent.values()) {
            if (loopEnd.outcome === "max-steps") return true;
        }
        return false;
    }

    public loopStepCountTotal(): number {
        let total = 0;
        for (const loopEnd of this.loopEndByAgent.values()) {
            total += loopEnd.stepCount;
        }
        return total;
    }

    public toolCallCountTotal(): number {
        let total = 0;
        for (const loopEnd of this.loopEndByAgent.values()) {
            for (const count of Object.values(loopEnd.toolCallCount)) {
                total += count;
            }
        }
        return total;
    }

    public aggregateRetryCount(): number {
        return this.retryCount;
    }

    public aggregateCompressionCount(): number {
        return this.compressionCount;
    }

    public subDurationMs(index: number): number | null {
        const startedAt = this.subStartAt.get(index);
        if (startedAt === undefined) return null;
        const endEvent = [...this.eventList]
            .reverse()
            .find((entry) => entry.event.type === "sub-end" && entry.event.index === index);
        if (!endEvent) return null;
        return Math.round(endEvent.at - startedAt);
    }

    public subOk(index: number): boolean | null {
        return this.subOkMap.get(index) ?? null;
    }

    public loopStepCount(agent: string): number | null {
        return this.loopEndByAgent.get(agent)?.stepCount ?? null;
    }

    public loopToolCallCount(agent: string): number | null {
        const loopEnd = this.loopEndByAgent.get(agent);
        if (!loopEnd) return null;
        return Object.values(loopEnd.toolCallCount).reduce((acc, count) => acc + count, 0);
    }
}

export function sumToolCallCount(toolCallCount: Record<string, number>): number {
    return Object.values(toolCallCount).reduce((acc, count) => acc + count, 0);
}
