import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  console.log("Applying committed database migrations...");
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("Database migrations complete.");
} finally {
  await pool.end();
}
