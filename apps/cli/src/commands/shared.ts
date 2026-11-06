import type { ApiClient } from "../client.js";
import type { OutputMode } from "../output.js";

export { flagBoolean, flagString } from "../args.js";

export interface CommandContext {
    client: ApiClient;
    mode: OutputMode;
    flagMap: Record<string, string | boolean>;
    /** The command path with the noun removed, so ["list"] for "repo list". */
    argumentList: string[];
    write: (line: string) => void;
}

/** A mistake the user can fix by reading the message. Never a stack trace. */
export class UsageError extends Error {}
