import { debug } from "../../util/log.js";

function formatMax(max: number | null): string {
    if (max == null || !Number.isFinite(max)) return "unlimited";
    return String(max);
}

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
            debug(`granted active ${this.active} max ${formatMax(this.max)}`, "Limiter");
            return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
            this.queue.push(() => {
                this.active++;
                resolve();
            });
            debug(
                `queued active ${this.active} max ${formatMax(this.max)} waiting ${this.queue.length}`,
                "Limiter",
            );
        });
    }

    private release(): void {
        this.active--;

        this.drain();
    }

    private drain(): void {
        while (this.active < this.max && this.queue.length > 0) {
            debug(`resume waiting ${this.queue.length}`, "Limiter");
            const next = this.queue.shift();
            if (next) {
                next();
            }
        }
    }
}

// A removed provider id keeps its limiter until the process restarts.
const limiterByProviderId = new Map<number, Limiter>();

export function loadLimiter(providerId: number | undefined, concurrency: number | null | undefined): Limiter {
    const max = concurrency ?? null;
    if (providerId == null) {
        return new Limiter(max);
    }
    const existing = limiterByProviderId.get(providerId);
    if (existing) {
        existing.setMax(max);
        debug(`provider ${providerId} reused max ${formatMax(max)}`, "Limiter");
        return existing;
    }
    const created = new Limiter(max);
    limiterByProviderId.set(providerId, created);
    debug(`provider ${providerId} created max ${formatMax(max)}`, "Limiter");
    return created;
}
