import { sql } from 'drizzle-orm';
import { date, index, integer, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkUserId: text('clerk_user_id').unique(),
  guestTokenHash: text('guest_token_hash').unique(),
  timezone: text('timezone').notNull(),
  modePref: text('mode_pref').notNull().default('system'),
  createdAt: timestamptz('created_at'),
});

export const books = pgTable('books', {
  id: smallint('id').primaryKey(),
  name: text('name').notNull(),
  shortName: text('short_name').notNull(),
  section: text('section').notNull(),
  chapterCount: smallint('chapter_count').notNull(),
  firstVerseId: integer('first_verse_id').notNull(),
  lastVerseId: integer('last_verse_id').notNull(),
});

export const chapters = pgTable(
  'chapters',
  {
    id: smallint('id').primaryKey(),
    bookId: smallint('book_id').notNull().references(() => books.id),
    number: smallint('number').notNull(),
    verseCount: smallint('verse_count').notNull(),
    firstVerseId: integer('first_verse_id').notNull(),
    lastVerseId: integer('last_verse_id').notNull(),
  },
  (t) => [index('chapters_book_id_idx').on(t.bookId)],
);

export const commits = pgTable(
  'commits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The user's local calendar date this reading counts for. */
    readOn: date('read_on').notNull(),
    rawInput: text('raw_input').notNull(),
    /** Normalized passage, e.g. "2 Samuel 21". */
    display: text('display').notNull(),
    createdAt: timestamptz('created_at'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('commits_user_id_read_on_idx').on(t.userId, t.readOn)],
);

export const commitRanges = pgTable(
  'commit_ranges',
  {
    commitId: uuid('commit_id')
      .notNull()
      .references(() => commits.id, { onDelete: 'cascade' }),
    startVerseId: integer('start_verse_id').notNull(),
    /** Inclusive. */
    endVerseId: integer('end_verse_id').notNull(),
  },
  (t) => [index('commit_ranges_commit_id_idx').on(t.commitId)],
);

function timestamptz(name: string) {
  return timestamp(name, { withTimezone: true }).notNull().default(sql`now()`);
}
