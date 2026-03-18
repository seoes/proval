import type { Repository, RepositoryResponse, RepositoryInsert, RepositoryUpdateInput } from "@code-review/types";
import db from "../../db/index.js";
import { repositoryTable } from "@code-review/db";
import { desc, eq } from "drizzle-orm";

export class RepositoryService {
    public async findAll(): Promise<Repository[]> {
        const repositories = await db.select().from(repositoryTable).orderBy(desc(repositoryTable.createdAt));
        return repositories;
    }

    public async findById(repositoryId: number): Promise<Repository> {
        const repository = await db.select().from(repositoryTable).where(eq(repositoryTable.id, repositoryId));
        if (repository.length === 0) {
            throw new Error("Repository not found");
        }
        return repository[0];
    }

    public async create(data: RepositoryInsert): Promise<Repository> {
        const result = await db.insert(repositoryTable).values(data).returning();
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

    public async updateApiToken(repositoryId: number, apiToken: string): Promise<void> {
        await db
            .update(repositoryTable)
            .set({ apiToken })
            .where(eq(repositoryTable.id, repositoryId));
    }

    public async updateWebhookSecret(repositoryId: number, webhookSecret: string): Promise<void> {
        await db
            .update(repositoryTable)
            .set({ webhookSecret })
            .where(eq(repositoryTable.id, repositoryId));
    }

    public toResponse(repository: Repository): RepositoryResponse {
        const { webhookSecret, apiToken, ...rest } = repository;
        return rest;
    }

    private removeUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
        return Object.fromEntries(
            Object.entries(obj).filter(([_, v]) => v !== undefined),
        ) as Partial<T>;
    }
}
