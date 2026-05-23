import { drizzle } from "drizzle-orm/bun-sqlite";
import Database from "bun:sqlite";
import * as schema from "@proval/db";

const database = new Database(process.env.DB_FILE_NAME ?? "local.db");
const db = drizzle({
    client: database,
    schema,
    casing: "snake_case",
});

export default db;
