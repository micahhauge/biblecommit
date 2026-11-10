import { count, sum } from 'drizzle-orm';
import type { Db } from './index';
import { books, chapters } from './schema';

/** Book, chapter, and verse totals as stored in the database. */
export async function canonTotals(db: Db) {
  const [bookRow] = await db.select({ n: count() }).from(books);
  const [chapterRow] = await db.select({ n: count(), verses: sum(chapters.verseCount).mapWith(Number) }).from(chapters);
  return { books: bookRow!.n, chapters: chapterRow!.n, verses: chapterRow!.verses ?? 0 };
}
