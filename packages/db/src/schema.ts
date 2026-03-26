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

export const repositoryTable = sqliteTable("repository", {
    id: integer().primaryKey({ autoIncrement: true }),

    name: text().notNull(),
    provider: text({ enum: ["gitlab", "github", "gitea", "forgejo"] }).notNull(),
    baseUrl: text().notNull(),
    apiToken: text().notNull(),
    webhookSecret: text(),
    botUsername: text(),

    reviewMode: text({ enum: ["assigned_only", "off"] })
        .notNull()
        .default("off"),
    replyMode: text({ enum: ["assigned_only", "mentioned_only", "off"] })
        .notNull()
        .default("off"),

    autoAssign: integer({ mode: "boolean" }).notNull().default(false),
    language: text().notNull().default("English"),

    gitlabRepositoryId: integer(),
    modelId: integer().references(() => modelTable.id),

    ...timeStamp,
});
