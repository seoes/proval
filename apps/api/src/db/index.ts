import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "@code-review/db";

const database = new Database(process.env.DB_FILE_NAME || "local.db");
const db = drizzle({
    client: database,
    schema,
    casing: "snake_case",
});

export default db;
