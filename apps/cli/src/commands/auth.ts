import { ApiClient } from "../client.js";
import {
    clearStoredCredentials,
    configPath,
    maskToken,
    readStoredCredentials,
    resolveCredentials,
    writeStoredCredentials,
} from "../config.js";
import { renderOne, type OutputMode } from "../output.js";
import { flagString, UsageError } from "./shared.js";

export interface AuthCommandInput {
    mode: OutputMode;
    flagMap: Record<string, string | boolean>;
    argumentList: string[];
    write: (line: string) => void;
    env: NodeJS.ProcessEnv;
}

export async function runAuthCommand(input: AuthCommandInput): Promise<void> {
    const [verb] = input.argumentList;

    if (verb === "login") {
        const url = flagString(input.flagMap, "url");
        const token = flagString(input.flagMap, "token") ?? input.env.PROVAL_API_TOKEN;
        if (!url || !token) {
            throw new UsageError(
                "proval auth login --url <instance> --token <token>. " +
                    "Create the token in the dashboard under Settings; it is shown once.",
            );
        }
        // Verify before writing, so a typo fails here rather than on the next
        // command with a confusing error about something unrelated.
        const client = new ApiClient({ url, token });
        await client.get("/settings");
        const path = await writeStoredCredentials({ url, token }, input.env);
        input.write(renderOne(input.mode, { url, token: maskToken(token), storedAt: path }));
        return;
    }

    if (verb === "status") {
        const resolved = resolveCredentials(input.env, await readStoredCredentials(input.env));
        if (!resolved.credentials) {
            input.write(renderOne(input.mode, { authenticated: false, configPath: configPath(input.env) }));
            return;
        }
        let reachable = true;
        try {
            await new ApiClient(resolved.credentials).get("/settings");
        } catch {
            reachable = false;
        }
        input.write(
            renderOne(input.mode, {
                authenticated: reachable,
                url: resolved.credentials.url,
                token: maskToken(resolved.credentials.token),
                source: resolved.source,
            }),
        );
        return;
    }

    if (verb === "logout") {
        const removed = await clearStoredCredentials(input.env);
        input.write(renderOne(input.mode, { removed, configPath: configPath(input.env) }));
        return;
    }

    throw new UsageError("proval auth login | status | logout");
}
