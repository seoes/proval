import { gitProviderAccessTable, modelProviderTable, repositoryTable } from "@proval/db";
import type { Access, ModelProvider, Repository, RepositoryInsert } from "@proval/types";
import db from "../db/index.js";
import { and, eq, getTableColumns } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { RepositoryService } from "../api/repository/repository.service.js";
import { decrypt } from "../util/encrypt.js";

export type WebhookRepositoryRow = {
    repository: Repository;
    modelProvider: ModelProvider;
    access: Access;
};

export function originFromWebhookUrl(url: string): string {
    try {
        const parsed = new URL(url);
        return `${parsed.protocol}//${parsed.host}`;
    } catch {
        return "";
    }
}

type WebhookRepositoryCreate = {
    access: Access;
    provider: "gitlab" | "forgejo";
    gitProviderRepositoryId: number;
    path: string;
    description?: string | null;
};

const repositoryService = new RepositoryService();

export async function fetchWebhookContextRow(
    gitProviderRepositoryId: number,
    provider: "gitlab" | "forgejo",
    gitProviderAccessId?: number,
): Promise<WebhookRepositoryRow | null> {
    const conditionList = [
        eq(repositoryTable.gitProviderRepositoryId, gitProviderRepositoryId),
        eq(repositoryTable.provider, provider),
    ];
    if (gitProviderAccessId !== undefined) {
        conditionList.push(eq(repositoryTable.gitProviderAccessId, gitProviderAccessId));
    }

    const result = await db
        .select({
            repository: repositoryTable,
            modelProvider: modelProviderTable,
            access: gitProviderAccessTable,
        })
        .from(repositoryTable)
        .innerJoin(modelProviderTable, eq(repositoryTable.modelProviderId, modelProviderTable.id))
        .innerJoin(gitProviderAccessTable, eq(repositoryTable.gitProviderAccessId, gitProviderAccessTable.id))
        .where(and(...conditionList))
        .limit(1);

    return result[0] ?? null;
}

export const loadRepository = createMiddleware(async (c, next) => {
    let row = c.get("webhookRepositoryRow") as WebhookRepositoryRow | undefined;
    const createInput = c.get("webhookRepositoryCreate") as WebhookRepositoryCreate | undefined;

    if (!row && !createInput) {
        return c.json({ error: "Repository not found" }, 404);
    }

    if (!row && createInput) {
        const access = createInput.access;
        const webhookSecret = access.defaultWebhookSecret ? decrypt(access.defaultWebhookSecret).trim() : null;
        const webhookSigningToken =
            createInput.provider === "gitlab" && access.defaultWebhookSigningToken
                ? decrypt(access.defaultWebhookSigningToken).trim()
                : null;
        const repositoryColumnKeySet = new Set(Object.keys(getTableColumns(repositoryTable)));
        const defaultConfigPolicy: Record<string, unknown> = {};
        for (const defaultKey of Object.keys(getTableColumns(gitProviderAccessTable))) {
            if (
                !defaultKey.startsWith("default") ||
                defaultKey === "defaultWebhookSecret" ||
                defaultKey === "defaultWebhookSigningToken"
            ) {
                continue;
            }
            const rest = defaultKey.slice("default".length);
            const repositoryKey = rest.charAt(0).toLowerCase() + rest.slice(1);
            if (!repositoryColumnKeySet.has(repositoryKey)) {
                continue;
            }
            defaultConfigPolicy[repositoryKey] = access[defaultKey as keyof Access];
        }
        const insert: RepositoryInsert = {
            ...defaultConfigPolicy,
            path: createInput.path,
            description: createInput.description ?? null,
            provider: createInput.provider,
            webhookSecret,
            webhookSigningToken,
            gitProviderAccessId: access.id,
            gitProviderRepositoryId: createInput.gitProviderRepositoryId,
        };

        try {
            await repositoryService.create(insert);
        } catch (error) {
            const existing = await fetchWebhookContextRow(
                createInput.gitProviderRepositoryId,
                createInput.provider,
                access.id,
            );
            if (!existing) {
                throw error;
            }
        }

        const loaded = await fetchWebhookContextRow(
            createInput.gitProviderRepositoryId,
            createInput.provider,
            access.id,
        );
        if (!loaded) {
            return c.json({ error: "Repository not found" }, 404);
        }
        row = loaded;
    }

    if (!row) {
        return c.json({ error: "Repository not found" }, 404);
    }

    const { repository, modelProvider, access } = row;
    if (repository.provider === "gitlab") {
        c.set("repository", {
            ...repository,
            accessToken: repository.accessToken ? decrypt(repository.accessToken) : repository.accessToken,
        });
    } else {
        c.set("repository", repository);
    }
    c.set("modelProvider", modelProvider);
    c.set("access", { ...access, accessToken: decrypt(access.accessToken) });

    await next();
});
