import type {
    activityTable,
    repositoryTable,
    modelProviderTable,
    gitProviderAccessTable,
    githubAppTable,
    githubInstallationTable,
} from "@proval/db";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

// Select types (for reading from DB)

export type Repository = InferSelectModel<typeof repositoryTable>; // Omit gitlabAccess, webhookSecret

export type ModelProvider = InferSelectModel<typeof modelProviderTable>;

export type Access = InferSelectModel<typeof gitProviderAccessTable>;

export type GitHubApp = InferSelectModel<typeof githubAppTable>;

export type GitHubInstallation = InferSelectModel<typeof githubInstallationTable>;

export type Activity = InferSelectModel<typeof activityTable>;

// Insert types (for creating new records)
export type RepositoryInsert = InferInsertModel<typeof repositoryTable>;
export type ModelProviderInsert = InferInsertModel<typeof modelProviderTable>;
export type AccessInsert = InferInsertModel<typeof gitProviderAccessTable>;
export type GitHubAppInsert = InferInsertModel<typeof githubAppTable>;
export type GitHubInstallationInsert = InferInsertModel<typeof githubInstallationTable>;
export type ActivityInsert = InferInsertModel<typeof activityTable>;

// API response types (sensitive fields omitted)
export type RepositoryResponse = Omit<Repository, "webhookSecret" | "accessToken" | "accessTokenId"> & {
    lastUsedAt: Date | null;
};
export type ModelProviderResponse = Omit<ModelProvider, "apiKey">;
export type AccessResponse = Omit<Access, "accessToken">;
export type GitHubAppResponse = Omit<GitHubApp, "privateKey" | "webhookSecret">;
export type GitHubInstallationResponse = GitHubInstallation & {
    accountName: string;
    accountType: "User" | "Organization";
};

export type GitHubRepositoryResponse = {
    id: number;
    fullName: string;
    private: boolean;
    alreadyConnected: boolean;
};

// Update types (for PUT - excludes sensitive fields)
export type RepositoryUpdateInput = Partial<
    Omit<RepositoryInsert, "webhookSecret" | "createdAt" | "updatedAt" | "accessToken" | "accessTokenId">
>;
export type ModelProviderUpdateInput = Partial<Omit<ModelProviderInsert, "apiKey" | "createdAt" | "updatedAt">>;
export type AccessUpdateInput = Partial<Omit<AccessInsert, "accessToken" | "createdAt" | "updatedAt">>;
export type GitHubAppUpdateInput = Partial<
    Omit<GitHubAppInsert, "privateKey" | "webhookSecret" | "createdAt" | "updatedAt">
>;
export type GitHubInstallationUpdateInput = Partial<Omit<GitHubInstallationInsert, "createdAt" | "updatedAt">>;

// Create input types (sensitive fields included)
export type GitHubAppCreateInput = Pick<GitHubAppInsert, "appId" | "slug" | "privateKey" | "webhookSecret">;

// Secret input types (for PATCH - sensitive fields only)
export type SecretInput = { value: string };

// Domain enums (derived from schema)
export type RepositoryProvider = Repository["provider"];
export type AccessProvider = Access["provider"];
export type LlmApiProvider = ModelProvider["provider"];
export type ReplyThreadPolicy = Repository["replyToPullRequestComment"];

// Composite / list API types
export type GitProviderRepositoryListResponse = {
    id: number;
    name: string;
    fullName: string;
    description: string | null;
    defaultBranch: string;
    alreadyConnected: boolean;
};

export type RepositorySelectItem = {
    id: number;
    path: string;
    isConnected?: boolean;
};

export type GitHubInstallationOption = {
    type: Extract<RepositoryProvider, "github">;
    githubInstallationId: number;
    label: string;
};

export type AccessOption = {
    type: AccessProvider;
    accessId: number;
    label: string;
    baseUrl: string;
};

export type ProviderOption = GitHubInstallationOption | AccessOption;

export type ActivityTokenUsage = {
    inputToken: number;
    outputToken: number;
    cachedInputToken: number;
};

export type ModelProviderModelListResponse = {
    models: { id: string }[];
    source: "openai_compatible" | "unavailable";
};
