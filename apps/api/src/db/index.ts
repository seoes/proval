import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";

const database = new Database(process.env.DB_FILE_NAME || "file:local.db");
const db = drizzle({
    client: database,
    casing: "snake_case",
});

export default db;
