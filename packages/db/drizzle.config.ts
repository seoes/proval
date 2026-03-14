import { defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: "./src/schema.ts",
    out: "./src/migration",
    dialect: "sqlite",
    casing: "snake_case",
});
