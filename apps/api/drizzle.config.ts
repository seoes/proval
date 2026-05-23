import { defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: "../../packages/db/src/schema.ts",
    out: "../../packages/db/src/migration",
    dialect: "sqlite",
    casing: "snake_case",
    dbCredentials: {
        url: process.env.DB_FILE_NAME ?? "local.db",
    },
});
