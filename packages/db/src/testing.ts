import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { seedCanon, type Db } from './index';
import * as schema from './schema';

// import.meta.dirname rather than URL: jsdom test environments replace the global URL.
const migrationsFolder = path.join(import.meta.dirname, '../migrations');

export interface TestDb {
  db: Db;
  /** Empties user data (users, commits, ranges); the canon stays. Call between tests. */
  reset(): Promise<void>;
  close(): Promise<void>;
}

/**
 * A real Postgres (PGlite, in-process and in-memory) with the app's migrations
 * applied and the canon seeded. Create one per test file; `reset()` between tests.
 */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Db;
  await migrate(drizzle(client, { schema }), { migrationsFolder });
  await seedCanon(db);
  return {
    db,
    reset: async () => {
      await db.execute(sql`truncate users, commits, commit_ranges cascade`);
    },
    close: () => client.close(),
  };
}
