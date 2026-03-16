import type { Repository, RepositoryResponse } from "@code-review/types";
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

    public toResponse(repository: Repository): RepositoryResponse {
        const { webhookSecret, apiToken, ...rest } = repository;
        return rest;
    }
}
