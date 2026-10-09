import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const timeStamp = {
    createdAt: integer({ mode: "timestamp" })
        .notNull()
        .default(sql`(unixepoch())`),
    updatedAt: integer({ mode: "timestamp" })
        .notNull()
        .default(sql`(unixepoch())`)
        .$onUpdateFn(() => sql`(unixepoch())`),
};

export const instanceSettingTable = sqliteTable("instance_setting", {
    id: integer().primaryKey(),
    authEnabled: integer({ mode: "boolean" }).notNull().default(false),
    registrationEnabled: integer({ mode: "boolean" }).notNull().default(false),
    ...timeStamp,
});

export const userTable = sqliteTable("user", {
    id: text().primaryKey(),
    email: text().notNull().unique(),
    passwordHash: text().notNull(),
    role: text({ enum: ["admin", "user"] })
        .notNull()
        .default("user"),
    ...timeStamp,
});

export const sessionTable = sqliteTable(
    "session",
    {
        token: text().primaryKey(),
        userId: text()
            .notNull()
            .references(() => userTable.id, { onDelete: "cascade" }),
        expiresAt: integer({ mode: "timestamp" }).notNull(),
        ...timeStamp,
    },
    (table) => [index("session_user_id_idx").on(table.userId)],
);

export const apiTokenTable = sqliteTable(
    "api_token",
    {
        id: integer().primaryKey({ autoIncrement: true }),
        name: text().notNull(),
        // SHA-256 of the secret. The secret itself is shown once and never stored.
        tokenHash: text().notNull().unique(),
        // Leading characters of the secret, kept so the dashboard can identify a
        // token without holding anything usable.
        tokenPrefix: text().notNull(),
        // Comma separated scope list. Empty means the token can reach nothing.
        scopeList: text().notNull().default(""),
        userId: text()
            .notNull()
            .references(() => userTable.id, { onDelete: "cascade" }),
        expiresAt: integer({ mode: "timestamp" }),
        lastUsedAt: integer({ mode: "timestamp" }),
        ...timeStamp,
    },
    (table) => [index("api_token_user_id_idx").on(table.userId)],
);

export const modelProviderTable = sqliteTable("model_provider", {
    id: integer().primaryKey({ autoIncrement: true }),
    provider: text({ enum: ["openai", "anthropic"] }).notNull(), // TODO: add ollama, llama.cpp
    label: text().notNull(),
    baseUrl: text().notNull(),
    apiKey: text().notNull(),
    timeoutSecond: integer().notNull().default(600),
    ...timeStamp,
});

export const githubAppTable = sqliteTable("github_app", {
    id: integer().primaryKey({ autoIncrement: true }),
    appId: integer().notNull().unique(),
    slug: text().notNull().unique(),
    privateKey: text().notNull(),
    webhookSecret: text().notNull().default(""),
    ...timeStamp,
});

export const githubInstallationTable = sqliteTable("github_installation", {
    id: integer().primaryKey({ autoIncrement: true }),
    installationId: integer().notNull().unique(),
    appId: integer().references(() => githubAppTable.id, { onDelete: "cascade" }),
    ...timeStamp,
});

export const gitProviderAccessTable = sqliteTable(
    "git_provider_access",
    {
        id: integer().primaryKey({ autoIncrement: true }),
        provider: text({ enum: ["gitlab", "forgejo"] }).notNull(),
        name: text().notNull(),
        baseUrl: text().notNull(),
        accessToken: text().notNull(),
        autoCreateEnabled: integer({ mode: "boolean" }).notNull().default(false),
        defaultWebhookSecret: text(),
        defaultWebhookSigningToken: text(),
        defaultModelProviderId: integer().references(() => modelProviderTable.id, { onDelete: "set null" }),
        defaultModelName: text(),
        defaultLanguage: text(),
        defaultPrEnabled: integer({ mode: "boolean" }),
        defaultPrMinAccessLevel: integer(),
        defaultPrReviewEnabled: integer({ mode: "boolean" }),
        defaultPrInlineReview: integer({ mode: "boolean" }),
        defaultPrReviewOnPush: text({ enum: ["on_first_push", "on_every_push"] }),
        defaultPrIgnoreDraft: integer({ mode: "boolean" }),
        defaultPrReplyEnabled: integer({ mode: "boolean" }),
        defaultPrMentionOnly: integer({ mode: "boolean" }),
        defaultIssueEnabled: integer({ mode: "boolean" }),
        defaultIssueMinAccessLevel: integer(),
        defaultIssueCommentOnOpenEnabled: integer({ mode: "boolean" }),
        defaultIssueLabelOnOpenEnabled: integer({ mode: "boolean" }),
        defaultIssueReplyEnabled: integer({ mode: "boolean" }),
        defaultIssueMentionOnly: integer({ mode: "boolean" }),
        ...timeStamp,
    },
    (table) => [unique().on(table.provider, table.baseUrl)],
);

export const reasoningEffortValueList = ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export const repositoryTable = sqliteTable(
    "repository",
    {
        id: integer().primaryKey({ autoIncrement: true }),

        path: text().notNull(),
        description: text(),
        provider: text({ enum: ["gitlab", "github", "forgejo"] }).notNull(),
        webhookSecret: text(),
        webhookSigningToken: text(),
        language: text().notNull().default("English"),

        // github access configs
        githubInstallationId: integer().references(() => githubInstallationTable.id),
        githubRepositoryId: integer(),

        // gitlab/forgejo provider access configs
        gitProviderAccessId: integer().references(() => gitProviderAccessTable.id, {
            onDelete: "restrict",
        }),
        gitProviderRepositoryId: integer(),

        // gitlab access configs
        accessToken: text(),
        accessTokenId: integer(),

        // @@@@@@@@@@@@@@@
        // Pull Request
        // @@@@@@@@@@@@@@@

        prEnabled: integer({ mode: "boolean" }).notNull().default(true),
        prMinAccessLevel: integer().notNull().default(0),

        // Pull Request Review
        prReviewEnabled: integer({ mode: "boolean" }).notNull().default(true),
        prInlineReview: integer({ mode: "boolean" }).notNull().default(true),
        prReviewOnPush: text({ enum: ["on_first_push", "on_every_push"] })
            .notNull()
            .default("on_every_push"),
        prIgnoreDraft: integer({ mode: "boolean" }).notNull().default(true),
        userPrompt: text(),

        // Pull Request Reply
        prReplyEnabled: integer({ mode: "boolean" }).notNull().default(true),
        prMentionOnly: integer({ mode: "boolean" }).notNull().default(false),

        // @@@@@@@@@@@@@@@
        // Issue
        // @@@@@@@@@@@@@@@

        issueEnabled: integer({ mode: "boolean" }).notNull().default(true),
        issueMinAccessLevel: integer().notNull().default(0),

        // Issue Comment on Open
        issueCommentOnOpenEnabled: integer({ mode: "boolean" }).notNull().default(true),
        issueLabelOnOpenEnabled: integer({ mode: "boolean" }).notNull().default(true),

        // Issue Reply
        issueReplyEnabled: integer({ mode: "boolean" }).notNull().default(true),
        issueMentionOnly: integer({ mode: "boolean" }).notNull().default(false),

        modelProviderId: integer().references(() => modelProviderTable.id),
        modelName: text().notNull().default(""),
        reasoningEffort: text({ enum: reasoningEffortValueList }),

        ...timeStamp,
    },
    (table) => [unique().on(table.gitProviderRepositoryId, table.gitProviderAccessId)],
);

export type ActivityLogEntryJson = {
    type?: "common" | "tool-call" | "tool-result" | "tool-error";
    timestamp: string;
    level: "info" | "warn" | "error" | "debug";
    label?: string;
    step?: string;
    message: string;
    toolName?: string;
    toolCallId?: string;
};

export const activityTable = sqliteTable(
    "activity",
    {
        id: integer().primaryKey({ autoIncrement: true }),
        repositoryId: integer().references(() => repositoryTable.id, { onDelete: "set null" }),
        repositoryPath: text().notNull(),
        provider: text({ enum: ["gitlab", "github", "forgejo"] }).notNull(),
        modelProviderId: integer().references(() => modelProviderTable.id, { onDelete: "set null" }),
        modelName: text().notNull(),
        type: text({ enum: ["pr_review", "pr_reply", "issue_open", "issue_reply"] }).notNull(),
        status: text({ enum: ["started", "completed", "failed", "canceled"] }).notNull(),
        targetIid: integer().notNull(),
        headSha: text(),
        inputToken: integer(),
        cachedInputToken: integer(),
        outputToken: integer(),
        errorMessage: text(),
        logVersion: text({ enum: ["1"] }),
        logs: text({ mode: "json" }).$type<ActivityLogEntryJson[]>().notNull().default([]),
        completedAt: integer({ mode: "timestamp" }),
        ...timeStamp,
    },
    (table) => [
        index("activity_repository_id_created_at_idx").on(table.repositoryId, table.createdAt),
        index("activity_model_provider_id_created_at_idx").on(table.modelProviderId, table.createdAt),
    ],
);

export const commentTable = sqliteTable(
    "comment",
    {
        id: integer().primaryKey({ autoIncrement: true }),
        activityId: integer()
            .references(() => activityTable.id, { onDelete: "cascade" })
            .notNull(),
        body: text().notNull(),
        type: text({ enum: ["comment", "inline_review"] }).notNull(),
        commentId: integer().notNull(),
        ...timeStamp,
    },
    (table) => [
        unique().on(table.activityId, table.type, table.commentId),
        index("comment_comment_id_type_idx").on(table.commentId, table.type),
    ],
);
