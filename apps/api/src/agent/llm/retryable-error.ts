/**
 * Which model call failures are worth retrying, as opposed to failing the activity.
 *
 * A failed model call fails the whole review, and a review that fails starts again
 * from nothing, so every token it had spent is lost. Over two weeks of one instance,
 * ten reviews were lost this way to a request timeout or a reset socket, about 21M
 * input tokens, when the same request a few seconds later would have succeeded.
 *
 * "rate" failures (429, and the 400 that some providers send for an overloaded
 * model) were always retried. "transient" failures are the network and server side
 * ones: a timeout, a dropped or refused connection, a 5xx, a 408 or 409. Anything
 * else, such as a 401 or a malformed request, fails at once as it always has.
 */
export type RetryableKind = "rate" | "transient" | null;

const TRANSIENT_STATUS = new Set([408, 409, 500, 502, 503, 504, 520, 522, 524, 529]);
const TRANSIENT_CODE = new Set([
    "ECONNRESET",
    "ECONNREFUSED",
    "ECONNABORTED",
    "ETIMEDOUT",
    "EPIPE",
    "ENOTFOUND",
    "EAI_AGAIN",
    "UND_ERR_SOCKET",
    "UND_ERR_CONNECT_TIMEOUT",
    "ConnectionRefused",
    "ConnectionClosed",
]);
const TRANSIENT_NAME = new Set(["APIConnectionError", "APIConnectionTimeoutError", "TimeoutError"]);
const TRANSIENT_MESSAGE =
    /request timed out|timed out|socket connection was closed|socket hang up|ECONNRESET|ECONNREFUSED|network (error|failure)|fetch failed|stream ended without a finish reason/i;

function readField(value: unknown, key: string): unknown {
    return value !== null && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

export function classifyModelError(error: unknown): RetryableKind {
    const status = readField(error, "status");
    if (typeof status === "number") {
        if (status === 429 || status === 400) return "rate";
        if (TRANSIENT_STATUS.has(status)) return "transient";
        return null;
    }
    // No HTTP status: the request never got a response. Look at the error and its cause.
    for (let current: unknown = error, depth = 0; current != null && depth < 4; depth++) {
        const code = readField(current, "code");
        if (typeof code === "string" && TRANSIENT_CODE.has(code)) return "transient";
        const name = readField(current, "name");
        if (typeof name === "string" && TRANSIENT_NAME.has(name)) return "transient";
        if (current instanceof Error && current.constructor && TRANSIENT_NAME.has(current.constructor.name)) {
            return "transient";
        }
        const message = readField(current, "message");
        if (typeof message === "string" && TRANSIENT_MESSAGE.test(message)) return "transient";
        current = readField(current, "cause");
    }
    return null;
}
