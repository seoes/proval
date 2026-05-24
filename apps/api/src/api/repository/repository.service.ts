import type { Repository, RepositoryResponse, RepositoryInsert, RepositoryUpdateInput } from "@proval/types";
import db from "../../db/index.js";
import { repositoryTable } from "@proval/db";
import { desc, eq } from "drizzle-orm";
import { generateUnusedRepositoryWebhookSecret } from "../../util/webhook-secret.js";

export class RepositoryService {
    public async findAll(): Promise<Repository[]> {
        const repositoryList = await db.select().from(repositoryTable).orderBy(desc(repositoryTable.updatedAt));
        return repositoryList;
    }

    public async findById(repositoryId: number): Promise<Repository> {
        const repositoryList = await db.select().from(repositoryTable).where(eq(repositoryTable.id, repositoryId));
        if (repositoryList.length === 0) {
            throw new Error("Repository not found");
        }
        return repositoryList[0];
    }

    public async create(data: RepositoryInsert): Promise<Repository> {
        const isGitHub = data.provider === "github";
        const isWebhookSecretEmpty =
            data.webhookSecret === undefined || data.webhookSecret === null || data.webhookSecret.trim() === "";
        const values =
            isGitHub && isWebhookSecretEmpty
                ? { ...data, webhookSecret: generateUnusedRepositoryWebhookSecret() }
                : data;
        const result = await db.insert(repositoryTable).values(values).returning();
        return result[0];
    }

    public async update(repositoryId: number, data: RepositoryUpdateInput): Promise<Repository> {
        const cleanData = this.removeUndefined(data);
        const result = await db
            .update(repositoryTable)
            .set(cleanData)
            .where(eq(repositoryTable.id, repositoryId))
            .returning();
        if (result.length === 0) {
            throw new Error("Repository not found");
        }
        return result[0];
    }

    public async updateWebhookSecret(repositoryId: number, webhookSecret: string): Promise<void> {
        await db.update(repositoryTable).set({ webhookSecret }).where(eq(repositoryTable.id, repositoryId));
    }

    public toResponse(repository: Repository): RepositoryResponse {
        const { webhookSecret: _webhookSecret, ...rest } = repository;
        return rest;
    }

    public async remove(id: number): Promise<void> {
        await db.delete(repositoryTable).where(eq(repositoryTable.id, id));
    }

    private removeUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
        return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined)) as Partial<T>;
    }
}
