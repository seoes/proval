import { resolveUserPromptMaxLength } from "@proval/types";

/**
 * Effective custom instructions limit of this deployment. The repository update
 * enforces it and GET /api/auth/me announces it, so both read the limit from
 * this single call site instead of resolving the environment twice.
 */
export function currentUserPromptMaxLength(): number {
    return resolveUserPromptMaxLength(process.env.PROVAL_USER_PROMPT_MAX_LENGTH);
}
