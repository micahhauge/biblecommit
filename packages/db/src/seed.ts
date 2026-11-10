import { config } from 'dotenv';
import { BOOKS, CHAPTERS } from '@biblecommit/core';
import { sql } from 'drizzle-orm';
import { books, chapters, createDb } from './index';

config({ path: ['.env.local', '.env'].map((f) => new URL(`../../../${f}`, import.meta.url).pathname), quiet: true });

const db = createDb();

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

const [counts] = await db.execute<{ books: number; chapters: number; verses: number }>(
  sql`select (select count(*) from books)::int as books, (select count(*) from chapters)::int as chapters, (select coalesce(sum(verse_count),0) from chapters)::int as verses`,
).then((r) => r.rows);
console.log('seeded', counts);
