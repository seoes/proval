export class Limiter {
    private active: number = 0;
    private queue: Array<() => void> = [];
    private max: number;

    constructor(max: number | null) {
        this.max = max ?? Infinity;
    }

    public setMax(max: number | null) {
        this.max = max ?? Infinity;
        this.drain();
    }

    public async run<T>(fn: () => Promise<T>): Promise<T> {
        await this.acquire();

        try {
            return await fn();
        } finally {
            this.release();
        }
    }

    private acquire(): Promise<void> {
        if (this.active < this.max) {
            this.active++;
            return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
            this.queue.push(() => {
                this.active++;
                resolve();
            });
        });
    }

    private release(): void {
        this.active--;

        this.drain();
    }

    private drain(): void {
        while (this.active < this.max && this.queue.length > 0) {
            const next = this.queue.shift();
            if (next) {
                next();
            }
        }
    }
}

const DEFAULT_LLM_CONCURRENCY = 4;

function readLlmConcurrency(): number {
    const raw = process.env.PROVAL_LLM_CONCURRENCY;
    if (!raw) {
        return DEFAULT_LLM_CONCURRENCY;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return DEFAULT_LLM_CONCURRENCY;
    }
    return parsed;
}

/**
 * Bounds how many model call may be in flight across the whole process.
 * Shared by every agent and every review, so a burst of concurrent review
 * cannot exceed the provider concurrency allowance and trigger rate limit
 * failure.
 */
export const llmCallLimiter = new Limiter(readLlmConcurrency());
