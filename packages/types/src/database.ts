import type { repositoryTable, modelTable } from "@code-review/db";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

// Select types (for reading from DB)
export type Repository = InferSelectModel<typeof repositoryTable>;
export type Model = InferSelectModel<typeof modelTable>;

// Insert types (for creating new records)
export type RepositoryInsert = InferInsertModel<typeof repositoryTable>;
export type ModelInsert = InferInsertModel<typeof modelTable>;

// API response types (sensitive fields omitted)
export type RepositoryResponse = Omit<Repository, "apiToken" | "webhookSecret">;
export type ModelResponse = Omit<Model, "apiKey">;

// Update types (for PUT - excludes sensitive fields)
export type RepositoryUpdateInput = Partial<
    Omit<RepositoryInsert, "apiToken" | "webhookSecret" | "createdAt" | "updatedAt">
>;
export type ModelUpdateInput = Partial<Omit<ModelInsert, "apiKey" | "createdAt" | "updatedAt">>;

// Secret input types (for PATCH - sensitive fields only)
export type SecretInput = { value: string };
