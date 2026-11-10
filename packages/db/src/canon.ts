import { BOOKS, CHAPTERS } from '@biblecommit/core';
import { sql } from 'drizzle-orm';
import type { Db } from './index';
import { books, chapters } from './schema';

/** Upserts the canon (books and chapters) from core. Idempotent. */
export async function seedCanon(db: Db) {
  await db
    .insert(books)
    .values(BOOKS.map(({ id, name, shortName, section, chapterCount, firstVerseId, lastVerseId }) => ({ id, name, shortName, section, chapterCount, firstVerseId, lastVerseId })))
    .onConflictDoUpdate({
      target: books.id,
      set: {
        name: sql`excluded.name`,
        shortName: sql`excluded.short_name`,
        section: sql`excluded.section`,
        chapterCount: sql`excluded.chapter_count`,
        firstVerseId: sql`excluded.first_verse_id`,
        lastVerseId: sql`excluded.last_verse_id`,
      },
    });

  for (let i = 0; i < CHAPTERS.length; i += 400) {
    await db
      .insert(chapters)
      .values(CHAPTERS.slice(i, i + 400).map((c) => ({ ...c })))
      .onConflictDoUpdate({
        target: chapters.id,
        set: {
          bookId: sql`excluded.book_id`,
          number: sql`excluded.number`,
          verseCount: sql`excluded.verse_count`,
          firstVerseId: sql`excluded.first_verse_id`,
          lastVerseId: sql`excluded.last_verse_id`,
        },
      });
  }
}
