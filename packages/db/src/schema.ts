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
    ...timeStamp,
});

export const repositoryTable = sqliteTable("repository", {
    id: integer().primaryKey({ autoIncrement: true }),

    name: text().notNull(),
    provider: text({ enum: ["gitlab", "github", "gitea", "forgejo"] }).notNull(),
    baseUrl: text().notNull(),
    apiToken: text().notNull(),
    webhookSecret: text(),
    botUsername: text(),

    // github
    githubAppId: integer().references(() => githubAppTable.id),
    githubInstallationId: integer(),
    githubRepositoryPath: text(),

    // gitlab
    gitlabRepositoryId: integer(),

    // common fields
    reviewMode: text({ enum: ["assigned_only", "off"] })
        .notNull()
        .default("off"),
    replyMode: text({ enum: ["assigned_only", "mentioned_only", "off"] })
        .notNull()
        .default("off"),

    autoAssign: integer({ mode: "boolean" }).notNull().default(false),
    allowApproval: integer({ mode: "boolean" }).notNull().default(false),
    language: text().notNull().default("English"),

    /** Inline MR comments: off | important_only (Critical/Warning, capped) | balanced (+ some Suggestions) */
    inlineReviewMode: text({ enum: ["off", "important_only", "balanced"] })
        .notNull()
        .default("important_only"),
    /** Agent exploration depth: standard vs more steps + deeper prompt */
    reviewDepth: text({ enum: ["standard", "deep"] }).notNull().default("standard"),

    modelId: integer().references(() => modelTable.id),

    ...timeStamp,
});
