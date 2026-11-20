import { drizzle } from "drizzle-orm/bun-sqlite";
import Database from "bun:sqlite";
import * as schema from "@proval/db";

const database = new Database(process.env.DB_FILE_NAME ?? "local.db");
database.run("PRAGMA foreign_keys = ON");
database.run("PRAGMA journal_mode = WAL");
database.run("PRAGMA synchronous = NORMAL");
// A cancellation can write the activity row while the agent writes logs.
// Wait for the lock instead of failing the review with SQLITE_BUSY.
database.run("PRAGMA busy_timeout = 5000");
const db = drizzle({
    client: database,
    schema,
    casing: "snake_case",
});

export default db;
