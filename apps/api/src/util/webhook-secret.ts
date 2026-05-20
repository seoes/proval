import { randomBytes } from "node:crypto";

export function normalizeWebhookSecret(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/** Satisfies repository.webhookSecret notNull for GitHub (column unused by webhook middleware). */
export function generateUnusedRepositoryWebhookSecret(): string {
    return randomBytes(32).toString("hex");
}
