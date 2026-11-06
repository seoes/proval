import { homedir } from "node:os";
import { join } from "node:path";
import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";

export interface Credentials {
    url: string;
    token: string;
}

/** What a credential came from, so `auth status` can say why it is in effect. */
export type CredentialSource = "environment" | "file" | "none";

export interface ResolvedCredentials {
    credentials: Credentials | null;
    source: CredentialSource;
}

export function configDirectory(env: NodeJS.ProcessEnv = process.env): string {
    const base = env.XDG_CONFIG_HOME?.trim();
    return base ? join(base, "proval") : join(homedir(), ".config", "proval");
}

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
    return join(configDirectory(env), "config.json");
}

function cleanUrl(raw: string): string {
    return raw.trim().replace(/\/+$/, "");
}

/**
 * The environment wins over the file, so a CI job or a container can set
 * PROVAL_API_URL and PROVAL_API_TOKEN without writing to a home directory that
 * may not survive the container. Both are required together: a URL with no
 * token would otherwise silently fall back to a stored token for a different
 * instance, which is the kind of mistake that sends a write to the wrong place.
 */
export function resolveCredentials(
    env: NodeJS.ProcessEnv,
    stored: Partial<Credentials> | null,
): ResolvedCredentials {
    const envUrl = env.PROVAL_API_URL?.trim();
    const envToken = env.PROVAL_API_TOKEN?.trim();
    if (envUrl && envToken) {
        return { credentials: { url: cleanUrl(envUrl), token: envToken }, source: "environment" };
    }
    const fileUrl = stored?.url?.trim();
    const fileToken = stored?.token?.trim();
    if (fileUrl && fileToken) {
        return { credentials: { url: cleanUrl(fileUrl), token: fileToken }, source: "file" };
    }
    return { credentials: null, source: "none" };
}

export async function readStoredCredentials(
    env: NodeJS.ProcessEnv = process.env,
): Promise<Partial<Credentials> | null> {
    try {
        const raw = await readFile(configPath(env), "utf8");
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        const { url, token } = parsed as Partial<Credentials>;
        return { url, token };
    } catch {
        // No file, unreadable, or not JSON. All mean "not logged in", which the
        // caller reports; none is worth failing the whole command over.
        return null;
    }
}

/** Written 0600 because it holds a bearer token that grants its whole scope set. */
export async function writeStoredCredentials(
    credentials: Credentials,
    env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
    const directory = configDirectory(env);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const path = configPath(env);
    await writeFile(path, JSON.stringify({ url: cleanUrl(credentials.url), token: credentials.token }, null, 2) + "\n", {
        mode: 0o600,
    });
    await chmod(path, 0o600);
    return path;
}

export async function clearStoredCredentials(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
    try {
        await unlink(configPath(env));
        return true;
    } catch {
        return false;
    }
}

/** Shows enough of a token to recognise it, never enough to use it. */
export function maskToken(token: string): string {
    if (token.length <= 8) return "*".repeat(token.length);
    return token.slice(0, 6) + "…" + token.slice(-4);
}
