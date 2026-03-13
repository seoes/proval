import { defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: "./src/db/schema.ts",
    out: "./src/db/migration",
    dialect: "sqlite",
    casing: "snake_case",
    dbCredentials: {
        url: process.env.DB_FILE_NAME || "file:local.db",
    },
});
