import { createDb, type Db } from '@biblecommit/db';
import { sql } from 'drizzle-orm';
import type { Deps } from './app';

/** Database-backed deps. The connection is created on first use, so importing this never needs DATABASE_URL. */
export function createDbDeps(provided?: Db): Deps {
  let cached = provided;
  const db = () => (cached ??= createDb());
  return {
    async getCanonTotals() {
      const { rows } = await db().execute<{ books: number; chapters: number; verses: number }>(
        sql`select (select count(*) from books)::int as books,
                   (select count(*) from chapters)::int as chapters,
                   (select coalesce(sum(verse_count), 0) from chapters)::int as verses`,
      );
      return rows[0]!;
    },
  };
}
