import type { repositoryTable, llmConfigTable } from "@code-review/db";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

// Select types (for reading from DB)
export type Repository = InferSelectModel<typeof repositoryTable>;
export type LLMConfig = InferSelectModel<typeof llmConfigTable>;

// Insert types (for creating new records)
export type RepositoryInsert = InferInsertModel<typeof repositoryTable>;
export type LLMConfigInsert = InferInsertModel<typeof llmConfigTable>;

// API response types (sensitive fields omitted)
export type RepositoryResponse = Omit<Repository, "apiToken" | "webhookSecret">;
export type LLMConfigResponse = Omit<LLMConfig, "apiKey">;
