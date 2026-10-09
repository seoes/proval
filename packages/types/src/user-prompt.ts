export const USER_PROMPT_MAX_LENGTH = 2000;

/**
 * Effective limit for the custom instructions of a repository.
 * A deployment can raise or lower it with PROVAL_USER_PROMPT_MAX_LENGTH; any
 * value that is not a positive integer is ignored and the default applies.
 */
export function resolveUserPromptMaxLength(raw?: string | number | null): number {
    const value = typeof raw === "string" ? Number(raw.trim()) : raw;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
        return USER_PROMPT_MAX_LENGTH;
    }
    return value;
}
