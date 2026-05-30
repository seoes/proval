import type {
    activityTable,
    repositoryTable,
    modelTable,
    gitProviderAccessTable,
    githubAppTable,
    githubInstallationTable,
} from "@proval/db";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

// Select types (for reading from DB)

export type Repository = InferSelectModel<typeof repositoryTable>; // Omit gitlabAccess, webhookSecret

export type Model = InferSelectModel<typeof modelTable>;

export type Access = InferSelectModel<typeof gitProviderAccessTable>;

export type GitHubApp = InferSelectModel<typeof githubAppTable>;

export type GitHubInstallation = InferSelectModel<typeof githubInstallationTable>;

export type Activity = InferSelectModel<typeof activityTable> & {
    repositoryPath: string;
    modelLabel: string;
    provider: Repository["provider"];
};

// Insert types (for creating new records)
export type RepositoryInsert = InferInsertModel<typeof repositoryTable>;
export type ModelInsert = InferInsertModel<typeof modelTable>;
export type AccessInsert = InferInsertModel<typeof gitProviderAccessTable>;
export type GitHubAppInsert = InferInsertModel<typeof githubAppTable>;
export type GitHubInstallationInsert = InferInsertModel<typeof githubInstallationTable>;
export type ActivityInsert = InferInsertModel<typeof activityTable>;

// API response types (sensitive fields omitted)
export type RepositoryResponse = Omit<Repository, "webhookSecret">;
export type ModelResponse = Omit<Model, "apiKey">;
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
export type RepositoryUpdateInput = Partial<Omit<RepositoryInsert, "webhookSecret" | "createdAt" | "updatedAt">>;
export type ModelUpdateInput = Partial<Omit<ModelInsert, "apiKey" | "createdAt" | "updatedAt">>;
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
export type ModelProvider = Model["provider"];
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
    fullName: string;
    alreadyConnected?: boolean;
};

export type LoadRepositoryListInput =
    | { provider: AccessProvider; accessId: number }
    | { provider: "github"; appId: number; installationId: number };

export type UnifiedAccessOption =
    | { kind: "git-provider"; provider: AccessProvider; id: number; label: string; baseUrl: string }
    | {
          kind: "github-installation";
          provider: "github";
          id: number;
          label: string;
          accountType: GitHubInstallationResponse["accountType"];
      };

export type ActivityTokenUsage = {
    inputToken: number;
    outputToken: number;
};
