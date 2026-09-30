import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, closeDatabase } from '../src/db';

async function main() {
  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('JobOps database migrations applied.');
  } finally { await closeDatabase(); }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Migration failed.');
  process.exitCode = 1;
});
