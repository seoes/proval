import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
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

export const modelTable = sqliteTable("model", {
    id: integer().primaryKey({ autoIncrement: true }),
    provider: text({ enum: ["openai"] }).notNull(), // TODO: add claude, ollama, llama.cpp
    name: text().notNull(),
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

export const repositoryTable = sqliteTable("repository", {
    id: integer().primaryKey({ autoIncrement: true }),

    name: text().notNull(),
    provider: text({ enum: ["gitlab", "github", "gitea", "forgejo"] }).notNull(),
    baseUrl: text().notNull(),
    gitlabAccessToken: text(),
    webhookSecret: text(),
    botUsername: text(),
    language: text().notNull().default("English"),

    // github
    githubInstallationId: integer().references(() => githubInstallationTable.id),
    githubRepositoryPath: text(),
    githubRepositoryId: integer(),

    // gitlab
    gitlabRepositoryId: integer(),

    // merge request
    reviewOnMergeRequestOpen: integer({ mode: "boolean" }).notNull().default(true),
    inlineReview: integer({ mode: "boolean" }).notNull().default(true),
    replyToMergeRequestComment: text({ enum: ["all", "mentioned_only", "off"] })
        .notNull()
        .default("all"),
    deepResearchOnMergeRequest: integer({ mode: "boolean" }).notNull().default(false),

    // issue
    commentOnIssueOpen: integer({ mode: "boolean" }).notNull().default(true),
    replyToIssueComment: text({ enum: ["all", "mentioned_only", "off"] })
        .notNull()
        .default("all"),

    modelId: integer().references(() => modelTable.id),

    ...timeStamp,
});
