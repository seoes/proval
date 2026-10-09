import { reasoningEffortValueList } from "@proval/db";
import type {
    activityTable,
    repositoryTable,
    modelProviderTable,
    gitProviderAccessTable,
    githubAppTable,
    githubInstallationTable,
    instanceSettingTable,
    userTable,
    sessionTable,
} from "@proval/db";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

export { reasoningEffortValueList };

// Select types (for reading from DB)

export type Repository = InferSelectModel<typeof repositoryTable>; // Omit gitlabAccess, webhookSecret

export type ModelProvider = InferSelectModel<typeof modelProviderTable>;

export type Access = InferSelectModel<typeof gitProviderAccessTable>;

export type GitHubApp = InferSelectModel<typeof githubAppTable>;

export type GitHubInstallation = InferSelectModel<typeof githubInstallationTable>;

export type Activity = InferSelectModel<typeof activityTable>;

export type InstanceSetting = InferSelectModel<typeof instanceSettingTable>;

export type User = InferSelectModel<typeof userTable>;

export type Session = InferSelectModel<typeof sessionTable>;

// Insert types (for creating new records)
export type RepositoryInsert = InferInsertModel<typeof repositoryTable>;
export type ModelProviderInsert = InferInsertModel<typeof modelProviderTable>;
export type AccessInsert = InferInsertModel<typeof gitProviderAccessTable>;
export type GitHubAppInsert = InferInsertModel<typeof githubAppTable>;
export type GitHubInstallationInsert = InferInsertModel<typeof githubInstallationTable>;
export type ActivityInsert = InferInsertModel<typeof activityTable>;
export type InstanceSettingInsert = InferInsertModel<typeof instanceSettingTable>;
export type UserInsert = InferInsertModel<typeof userTable>;
export type SessionInsert = InferInsertModel<typeof sessionTable>;

// API response types (sensitive fields omitted)
export type RepositoryResponse = Omit<
    Repository,
    "webhookSecret" | "webhookSigningToken" | "accessToken" | "accessTokenId"
> & {
    lastUsedAt: Date | null;
};
export type ModelProviderResponse = Pick<
    ModelProvider,
    "id" | "provider" | "label" | "baseUrl" | "timeoutSecond" | "authMethod" | "oauthStatus" | "createdAt" | "updatedAt"
>;
export type ModelProviderCreateInput = Pick<ModelProvider, "provider" | "label" | "baseUrl"> & {
    apiKey: string;
    timeoutSecond?: number;
};
export type XaiOAuthAttemptInput = Pick<ModelProvider, "label" | "timeoutSecond"> & { modelProviderId?: number };
export type XaiOAuthAttemptResponse = {
    id: string;
    label: string;
    timeoutSecond: number;
    status: "pending" | "authorized" | "denied" | "expired" | "cancelled" | "failed";
    userCode: string;
    verificationUri: string;
    expiresAt: number;
    modelProviderId?: number;
    error?: string;
};
export type AccessResponse = Omit<Access, "accessToken" | "defaultWebhookSecret" | "defaultWebhookSigningToken"> & {
    hasDefaultWebhookSecret: boolean;
    hasDefaultWebhookSigningToken: boolean;
};

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
    Omit<RepositoryInsert, "webhookSecret" | "webhookSigningToken" | "createdAt" | "updatedAt">
>;
export type ModelProviderUpdateInput = Partial<Pick<ModelProvider, "provider" | "label" | "baseUrl" | "timeoutSecond">>;
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
export type PrReviewOnPush = Repository["prReviewOnPush"];
export type ReasoningEffort = Repository["reasoningEffort"];

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

export type UserRole = User["role"];

export type UserResponse = Omit<User, "passwordHash">;

export type AuthMeResponse = {
    user: UserResponse | null;
    isAuthEnabled: boolean;
    isRegistrationEnabled: boolean;
    isSetupRequired: boolean;
};

export type InstanceSettingResponse = {
    isAuthEnabled: boolean;
    isRegistrationEnabled: boolean;
};

export type InstanceSettingUpdateInput = {
    isAuthEnabled: boolean;
    isRegistrationEnabled: boolean;
};

export type AuthCredentialInput = {
    email: string;
    password: string;
};
