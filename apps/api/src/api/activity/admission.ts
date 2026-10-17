/**
 * Admits reviews to run a few at a time instead of all at once.
 *
 * The model call limiter bounds requests in flight, not reviews. With it alone, a
 * burst of webhooks (a restacked branch set, a group of merge requests opened
 * together) starts every review immediately and they share the call budget, so
 * each one runs several times slower and any provider quota is reached with all
 * of them half done, which loses every token they spent. This gate holds the
 * later ones until a slot frees, in arrival order, so the same burst finishes
 * one review after another and a quota failure costs at most the reviews that
 * were actually running.
 *
 * The limit comes from PROVAL_REVIEW_CONCURRENCY. Unset or 0 means unlimited,
 * which is the behaviour before this gate existed.
 */
export class ReviewAdmission {
    private active = 0;
    private readonly waitingList: Array<{ id: number; grant: () => void }> = [];

    constructor(private max: number) {}

    /** The configured limit, or Infinity when unlimited. */
    public get limit(): number {
        return this.max > 0 ? this.max : Infinity;
    }

    public get running(): number {
        return this.active;
    }

    public get waiting(): number {
        return this.waitingList.length;
    }

    public setMax(max: number): void {
        this.max = max;
        this.drain();
    }

    /**
     * Resolves when the activity may run. `onWait` is called once, before waiting,
     * with how many reviews are running and how many are queued ahead, so the
     * activity log can say why nothing is happening yet.
     */
    public acquire(id: number, onWait?: (running: number, ahead: number) => void): Promise<void> {
        if (this.active < this.limit) {
            this.active++;
            return Promise.resolve();
        }
        onWait?.(this.active, this.waitingList.length);
        return new Promise<void>((resolve) => {
            this.waitingList.push({
                id,
                grant: () => {
                    this.active++;
                    resolve();
                },
            });
        });
    }

    public release(): void {
        if (this.active > 0) this.active--;
        this.drain();
    }

    /** Drops a waiting activity so a cancelled review never takes a slot later. */
    public withdraw(id: number): boolean {
        const index = this.waitingList.findIndex((entry) => entry.id === id);
        if (index === -1) return false;
        this.waitingList.splice(index, 1);
        return true;
    }

    private drain(): void {
        while (this.active < this.limit && this.waitingList.length > 0) {
            const next = this.waitingList.shift();
            next?.grant();
        }
    }
}

export function reviewConcurrencyFromEnv(env: Record<string, string | undefined> = process.env): number {
    const raw = (env.PROVAL_REVIEW_CONCURRENCY ?? "").trim();
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

let shared: ReviewAdmission | null = null;

/** The process wide gate every pull request review passes through. */
export function reviewAdmission(): ReviewAdmission {
    if (shared === null) shared = new ReviewAdmission(reviewConcurrencyFromEnv());
    return shared;
}
