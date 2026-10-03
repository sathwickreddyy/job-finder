import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

let pool: Pool | undefined;
let database: ReturnType<typeof createDatabase> | undefined;

function createDatabase() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is missing. Copy .env.example to .env and start PostgreSQL.");
  pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
  return drizzle(pool, { schema });
}

// Build-time imports never create a pool, connect, or require local configuration.
export const db = new Proxy({} as ReturnType<typeof createDatabase>, {
  get(_target, property) {
    database ??= createDatabase();
    const value: unknown = Reflect.get(database, property);
    return typeof value === "function" ? value.bind(database) : value;
  },
});

export async function closeDatabase() {
  await pool?.end();
  pool = undefined;
  database = undefined;
}

/** A reserved session lets advisory locks span multiple independent page commits. */
export type SessionDatabase = Omit<typeof db, "$client">;
export async function withDatabaseSession<T>(work: (database: SessionDatabase) => Promise<T>) {
  database ??= createDatabase();
  const client = await pool!.connect();
  let broken = false;
  try {
    return await work(drizzle(client, { schema }));
  } finally {
    // Session locks must never leak into the pool, even if the callback throws.
    try {
      await client.query("SELECT pg_advisory_unlock_all()");
    } catch {
      broken = true;
    }
    client.release(broken);
  }
}
