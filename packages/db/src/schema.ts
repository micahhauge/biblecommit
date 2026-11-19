import { sql } from 'drizzle-orm';
import { date, index, integer, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkUserId: text('clerk_user_id').unique(),
  guestTokenHash: text('guest_token_hash').unique(),
  timezone: text('timezone').notNull(),
  /** 'system' | 'dark' | 'light'; null until the user (or their browser) has chosen. */
  modePref: text('mode_pref'),
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

/** Markdown a user writes on a day. Separate from commits: notes never count as reading. */
export const notes = pgTable(
  'notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The user's local calendar date the note is written on. */
    writtenOn: date('written_on').notNull(),
    /** Markdown, at most 20,000 characters. */
    body: text('body').notNull(),
    /** The verses field as typed, so editing shows it back. */
    versesInput: text('verses_input').notNull().default(''),
    /** Normalized passage, e.g. "Romans 8:28–30"; empty with no verses. */
    versesDisplay: text('verses_display').notNull().default(''),
    createdAt: timestamptz('created_at'),
    updatedAt: timestamptz('updated_at'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('notes_user_id_written_on_idx').on(t.userId, t.writtenOn)],
);

/** Joins notes to the verses they're about, as inclusive verse-ID ranges. */
export const noteRanges = pgTable(
  'note_ranges',
  {
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    startVerseId: integer('start_verse_id').notNull(),
    /** Inclusive. */
    endVerseId: integer('end_verse_id').notNull(),
  },
  (t) => [
    index('note_ranges_note_id_idx').on(t.noteId),
    index('note_ranges_verses_idx').on(t.startVerseId, t.endVerseId),
  ],
);

function timestamptz(name: string) {
  return timestamp(name, { withTimezone: true }).notNull().default(sql`now()`);
}
