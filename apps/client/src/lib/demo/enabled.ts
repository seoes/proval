import { env } from "$env/dynamic/public";

export function isDemoMode(): boolean {
    return env.PUBLIC_DEMO === "true";
}
