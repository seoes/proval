#!/usr/bin/env bun
import { parseCommandLine } from "./args.js";
import { ApiClient, ApiError } from "./client.js";
import { readStoredCredentials, resolveCredentials } from "./config.js";
import { HELP_TEXT } from "./help.js";
import { runActivityCommand } from "./commands/activity.js";
import { runAuthCommand } from "./commands/auth.js";
import { runRepoCommand } from "./commands/repo.js";
import { runReviewCommand } from "./commands/review.js";
import { runSettingsCommand } from "./commands/settings.js";
import { runTokenCommand } from "./commands/token.js";
import { UsageError, type CommandContext } from "./commands/shared.js";

const commandMap = {
    repo: runRepoCommand,
    review: runReviewCommand,
    activity: runActivityCommand,
    token: runTokenCommand,
    settings: runSettingsCommand,
} as const;

type CommandName = keyof typeof commandMap;

export async function main(argvList: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
    const parsed = parseCommandLine(argvList);
    const write = (line: string) => {
        if (line.length > 0) process.stdout.write(line + "\n");
    };

    if (parsed.help || parsed.pathList.length === 0) {
        write(HELP_TEXT.trimEnd());
        return 0;
    }

    const [noun, ...rest] = parsed.pathList;

    try {
        if (noun === "auth") {
            await runAuthCommand({ mode: parsed.mode, flagMap: parsed.flagMap, argumentList: rest, write, env });
            return 0;
        }

        const command = commandMap[noun as CommandName];
        if (!command) {
            throw new UsageError(`unknown command: ${noun}. Run 'proval --help'.`);
        }

        const resolved = resolveCredentials(env, await readStoredCredentials(env));
        if (!resolved.credentials) {
            throw new UsageError(
                "Not authenticated. Run 'proval auth login --url <instance> --token <token>', " +
                    "or set PROVAL_API_URL and PROVAL_API_TOKEN.",
            );
        }

        const context: CommandContext = {
            client: new ApiClient(resolved.credentials),
            mode: parsed.mode,
            flagMap: parsed.flagMap,
            argumentList: rest,
            write,
        };
        await command(context);
        return 0;
    } catch (error) {
        return reportError(error);
    }
}

/** Errors go to stderr so --json and --agent output stays machine readable. */
function reportError(error: unknown): number {
    if (error instanceof UsageError) {
        process.stderr.write(error.message + "\n");
        return 2;
    }
    if (error instanceof ApiError) {
        process.stderr.write(error.message + "\n");
        if (error.hint) process.stderr.write(error.hint + "\n");
        return 1;
    }
    process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
    return 1;
}

if (import.meta.main) {
    process.exit(await main(process.argv.slice(2)));
}
