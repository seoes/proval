/** A hundred years. Far beyond any real use, and keeps Date arithmetic finite. */
export const MAX_EXPIRES_IN_DAY = 36500;

/**
 * Returns an error message when expiresInDay is unusable, or null when it is
 * fine. Null and undefined both mean "never expires" and are accepted.
 *
 * This exists because the service reads a non positive or unparseable value as
 * no expiry, so without a check here a caller who asked for a 30 day token and
 * mistyped it receives a permanent credential with no indication of it. The
 * upper bound matters for a different reason: a large enough day count makes
 * the millisecond arithmetic overflow into an Invalid Date, which reaches the
 * insert as a null or a failure rather than a clean 400.
 */
export function validateExpiresInDay(value: unknown): string | null {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > MAX_EXPIRES_IN_DAY) {
        return `expiresInDay must be a whole number between 1 and ${MAX_EXPIRES_IN_DAY}, or null for no expiry`;
    }
    return null;
}
