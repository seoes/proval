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

export const modelProviderTable = sqliteTable("model_provider", {
    id: integer().primaryKey({ autoIncrement: true }),
    provider: text({ enum: ["openai", "anthropic"] }).notNull(), // TODO: add ollama, llama.cpp
    label: text().notNull(),
    baseUrl: text().notNull(),
    apiKey: text().notNull(),
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
        ...timeStamp,
    },
    (table) => [unique().on(table.provider, table.baseUrl)],
);

export const repositoryTable = sqliteTable(
    "repository",
    {
        id: integer().primaryKey({ autoIncrement: true }),

        path: text().notNull(),
        description: text(),
        provider: text({ enum: ["gitlab", "github", "forgejo"] }).notNull(),
        webhookSecret: text().notNull(),
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

        // pull request
        reviewOnPullRequestOpen: integer({ mode: "boolean" }).notNull().default(true),
        inlineReview: integer({ mode: "boolean" }).notNull().default(true),
        replyToPullRequestComment: text({ enum: ["all", "mentioned_only", "off"] })
            .notNull()
            .default("all"),

        // issue
        commentOnIssueOpen: integer({ mode: "boolean" }).notNull().default(true),
        replyToIssueComment: text({ enum: ["all", "mentioned_only", "off"] })
            .notNull()
            .default("all"),

        modelProviderId: integer().references(() => modelProviderTable.id),
        modelName: text().notNull().default(""),

        ...timeStamp,
    },
    (table) => [unique().on(table.gitProviderRepositoryId, table.gitProviderAccessId)],
);

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
        status: text({ enum: ["started", "completed", "failed"] }).notNull(),
        targetIid: integer().notNull(),
        inputToken: integer(),
        cachedInputToken: integer(),
        outputToken: integer(),
        errorMessage: text(),
        completedAt: integer({ mode: "timestamp" }),
        ...timeStamp,
    },
    (table) => [
        index("activity_repository_id_created_at_idx").on(table.repositoryId, table.createdAt),
        index("activity_model_provider_id_created_at_idx").on(table.modelProviderId, table.createdAt),
    ],
);
