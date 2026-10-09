import { writable } from "svelte/store";
import { USER_PROMPT_MAX_LENGTH } from "@proval/types";

/**
 * Effective custom instruction limit announced by the instance. Falls back to
 * the build-time constant when the API does not announce one.
 */
export const userPromptMaxLength = writable<number>(USER_PROMPT_MAX_LENGTH);

export function setUserPromptMaxLength(value: unknown): void {
    if (typeof value === "number" && Number.isInteger(value) && value > 0) {
        userPromptMaxLength.set(value);
    }
}
