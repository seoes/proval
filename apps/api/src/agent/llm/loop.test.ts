import { describe, expect, it, mock } from "bun:test";

mock.module("../../api/activity/activity.service.js", () => ({
    ActivityService: class {
        async isCanceled() {
            return false;
        }
    },
}));

mock.module("../../util/log.js", () => ({
    logAgent: () => {},
    logAgentError: () => {},
    logAgentResult: () => {},
    logAgentTool: () => {},
}));

import type { AgentTool, LlmResponse, LlmSender } from "./loop.js";

const { runAgentLoop } = await import("./loop.js");

function assistantDone(content: string, inputToken = 100): LlmResponse {
    return {
        message: { role: "assistant", content, toolCalls: undefined },
        finishReason: "stop",
        requestId: null,
        usage: { inputToken, cachedInputToken: 0, outputToken: 10 },
    };
}

function assistantWithTool(inputToken = 100): LlmResponse {
    return {
        message: {
            role: "assistant",
            content: null,
            toolCalls: [{ id: "tc1", name: "noop", arguments: "{}" }],
        },
        finishReason: "tool_calls",
        requestId: null,
        usage: { inputToken, cachedInputToken: 0, outputToken: 10 },
    };
}

const noopTool: AgentTool = {
    name: "noop",
    description: "noop",
    parameters: { type: "object", properties: {} },
    execute: async () => "ok",
};

describe("runAgentLoop context compression", () => {
    it("recovers from overflow by compacting and keeps system plus original user", async () => {
        let agentSendCount = 0;
        let compressSendCount = 0;

        const sender: LlmSender = {
            getModel: () => ({ model: "test", provider: "openai", baseUrl: "http://localhost" }),
            async send(_messages, tools) {
                if (tools.length === 0) {
                    compressSendCount++;
                    return assistantDone("inspected src/a.ts", 50);
                }

                agentSendCount++;
                if (agentSendCount === 1) {
                    return assistantWithTool(200);
                }
                if (agentSendCount === 2) {
                    throw new Error("maximum context length exceeded");
                }
                return assistantDone("finished", 300);
            },
        };

        const result = await runAgentLoop(sender, "sys", "task", "test", {
            activityId: -1,
            toolList: [noopTool],
            maxSteps: 5,
        });

        expect(result.finalMessage).toBe("finished");
        expect(compressSendCount).toBe(1);
        expect(result.messages).toHaveLength(3);
        expect(result.messages[0].role).toBe("system");
        expect(result.messages[1].content).toBe("task");
        expect(result.messages[2].role).toBe("user");
        expect(result.messages[2].content).toContain("Compressed working memory:");
        expect(result.messages[2].content).toContain("inspected src/a.ts");
    });

    it("compresses proactively when current context exceeds ratio of maximum", async () => {
        let agentSendCount = 0;
        let compressSendCount = 0;

        const sender: LlmSender = {
            getModel: () => ({ model: "test", provider: "openai", baseUrl: "http://localhost" }),
            async send(_messages, tools) {
                if (tools.length === 0) {
                    compressSendCount++;
                    return assistantDone("proactive summary", 40);
                }

                agentSendCount++;
                if (agentSendCount === 1) {
                    return assistantWithTool(600_000);
                }
                return assistantDone("done after proactive compress", 200);
            },
        };

        const result = await runAgentLoop(sender, "sys", "task", "test", {
            activityId: -1,
            toolList: [noopTool],
            maxSteps: 5,
        });

        expect(compressSendCount).toBe(1);
        expect(result.finalMessage).toBe("done after proactive compress");
        expect(result.messages.some((message) => message.content?.includes("proactive summary"))).toBe(true);
    });

    it("drops turns during summarize when compress send overflows twice", async () => {
        let agentSendCount = 0;
        let compressSendCount = 0;

        const sender: LlmSender = {
            getModel: () => ({ model: "test", provider: "openai", baseUrl: "http://localhost" }),
            async send(_messages, tools) {
                if (tools.length === 0) {
                    compressSendCount++;
                    if (compressSendCount <= 2) {
                        throw new Error("prompt is too long");
                    }
                    return assistantDone("summary after drops", 30);
                }

                agentSendCount++;
                if (agentSendCount <= 3) {
                    return assistantWithTool(200);
                }
                if (agentSendCount === 4) {
                    throw new Error("maximum context length exceeded");
                }
                return assistantDone("done", 100);
            },
        };

        const result = await runAgentLoop(sender, "sys", "task", "test", {
            activityId: -1,
            toolList: [noopTool],
            maxSteps: 8,
        });

        expect(compressSendCount).toBe(3);
        expect(result.messages[2].content).toContain("summary after drops");
        expect(result.finalMessage).toBe("done");
    });
});
