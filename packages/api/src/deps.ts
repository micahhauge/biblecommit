import { canonTotals, commitRanges, commits, createDb, noteRanges, notes, users, type Db } from '@biblecommit/db';
import type { VerseRange } from '@biblecommit/core';
import { and, asc, between, desc, eq, exists, gte, inArray, isNotNull, isNull, lte, sql, type SQL } from 'drizzle-orm';
import type { Commit, Deps, ModePref, StoredNote } from './app';

/** Database-backed deps. The connection is created on first use, so importing this never needs DATABASE_URL. */
export function createDbDeps(provided?: Db): Deps {
  let cached = provided;
  const db = () => (cached ??= createDb());

  const totalVerses = sql<number>`coalesce(sum(${commitRanges.endVerseId} - ${commitRanges.startVerseId} + 1), 0)`.mapWith(Number);

  /** The user's non-deleted commits matching `where`, in recent-list order. */
  async function selectCommits(userId: string, where: SQL | undefined, limit?: number): Promise<Commit[]> {
    const query = db()
      .select({
        id: commits.id,
        readOn: commits.readOn,
        rawInput: commits.rawInput,
        display: commits.display,
        verseCount: totalVerses,
        createdAt: commits.createdAt,
      })
      .from(commits)
      .leftJoin(commitRanges, eq(commitRanges.commitId, commits.id))
      .where(and(eq(commits.userId, userId), isNull(commits.deletedAt), where))
      .groupBy(commits.id)
      .orderBy(desc(commits.readOn), desc(commits.createdAt), desc(commits.id));
    const rows = await (limit === undefined ? query : query.limit(limit));
    return rows.map((r): Commit => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }

  /** `(start, end)` rows for an insert … select; never empty (Postgres has no empty VALUES). */
  const rangeValues = (ranges: VerseRange[]) =>
    sql.join(
      ranges.map((r) => sql`(${r.start}::int, ${r.end}::int)`),
      sql`, `,
    );

  /** The user's non-deleted notes matching `where`, oldest first, with their ranges. */
  async function selectNotes(userId: string, where: SQL | undefined): Promise<StoredNote[]> {
    const rows = await db()
      .select({
        id: notes.id,
        writtenOn: notes.writtenOn,
        body: notes.body,
        verses: notes.versesInput,
        versesDisplay: notes.versesDisplay,
        createdAt: notes.createdAt,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .where(and(eq(notes.userId, userId), isNull(notes.deletedAt), where))
      .orderBy(asc(notes.writtenOn), asc(notes.createdAt), asc(notes.id));
    if (rows.length === 0) return [];
    const ranges = await db()
      .select({ noteId: noteRanges.noteId, start: noteRanges.startVerseId, end: noteRanges.endVerseId })
      .from(noteRanges)
      .where(
        inArray(
          noteRanges.noteId,
          rows.map((r) => r.id),
        ),
      )
      .orderBy(asc(noteRanges.startVerseId));
    return rows.map((r) => ({
      ...r,
      ranges: ranges.filter((x) => x.noteId === r.id).map(({ start, end }) => ({ start, end })),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  const touching = (within: VerseRange) =>
    and(lte(noteRanges.startVerseId, within.end), gte(noteRanges.endVerseId, within.start));

  return {
    getCanonTotals: () => canonTotals(db()),

    async createGuest({ tokenHash, timezone }) {
      const [row] = await db().insert(users).values({ guestTokenHash: tokenHash, timezone }).returning({ id: users.id });
      return row!;
    },

    async findUserByGuestTokenHash(tokenHash) {
      const [row] = await db()
        .select({ id: users.id, timezone: users.timezone, modePref: users.modePref })
        .from(users)
        .where(eq(users.guestTokenHash, tokenHash));
      return row && { ...row, modePref: row.modePref as ModePref };
    },

    async createCommit({ id, userId, readOn, rawInput, display, createdAt, ranges, verseCount }) {
      // One statement, so the commit and its ranges land together (neon-http has no transactions).
      const values = sql.join(
        ranges.map((r) => sql`(${r.start}::int, ${r.end}::int)`),
        sql`, `,
      );
      await db().execute(sql`
        with c as (
          insert into ${commits} (id, user_id, read_on, raw_input, display, created_at)
          values (${id}, ${userId}, ${readOn}, ${rawInput}, ${display}, ${createdAt.toISOString()})
          returning id
        )
        insert into ${commitRanges} (commit_id, start_verse_id, end_verse_id)
        select c.id, r.s, r.e from c, (values ${values}) as r(s, e)`);
      return { id, readOn, rawInput, display, verseCount, createdAt: createdAt.toISOString() };
    },

    listCommits: (userId, limit, after) =>
      selectCommits(
        userId,
        after &&
          sql`(${commits.readOn}, ${commits.createdAt}, ${commits.id}) < (${after.readOn}::date, ${after.createdAt}::timestamptz, ${after.id}::uuid)`,
        limit,
      ),

    listCommitsOn: (userId, readOn) => selectCommits(userId, eq(commits.readOn, readOn)),

    async listReadDays(userId) {
      const rows = await db()
        .selectDistinct({ readOn: commits.readOn })
        .from(commits)
        .where(and(eq(commits.userId, userId), isNull(commits.deletedAt)));
      return rows.map((r) => r.readOn);
    },

    async dailyVerses(userId, from, to) {
      return db()
        .select({ readOn: commits.readOn, verses: totalVerses })
        .from(commits)
        .innerJoin(commitRanges, eq(commitRanges.commitId, commits.id))
        .where(and(eq(commits.userId, userId), isNull(commits.deletedAt), between(commits.readOn, from, to)))
        .groupBy(commits.readOn);
    },

    async listReadRanges(userId, within) {
      return db()
        .select({ start: commitRanges.startVerseId, end: commitRanges.endVerseId })
        .from(commitRanges)
        .innerJoin(commits, eq(commits.id, commitRanges.commitId))
        .where(
          and(
            eq(commits.userId, userId),
            isNull(commits.deletedAt),
            within && and(lte(commitRanges.startVerseId, within.end), gte(commitRanges.endVerseId, within.start)),
          ),
        );
    },

    async updateUser(userId, { timezone }) {
      if (timezone === undefined) return;
      await db().update(users).set({ timezone }).where(eq(users.id, userId));
    },

    async deleteCommit(userId, id, deletedAt) {
      const rows = await db()
        .update(commits)
        .set({ deletedAt })
        .where(and(eq(commits.id, id), eq(commits.userId, userId), isNull(commits.deletedAt)))
        .returning({ id: commits.id });
      return rows.length > 0;
    },

    async createNote({ id, userId, writtenOn, body, versesInput, versesDisplay, ranges, createdAt }) {
      const at = createdAt.toISOString();
      const insertNote = sql`
        insert into ${notes} (id, user_id, written_on, body, verses_input, verses_display, created_at, updated_at)
        values (${id}, ${userId}, ${writtenOn}, ${body}, ${versesInput}, ${versesDisplay}, ${at}, ${at})
        returning id`;
      // One statement, so the note and its ranges land together (neon-http has no transactions).
      await db().execute(
        ranges.length === 0
          ? insertNote
          : sql`with n as (${insertNote})
              insert into ${noteRanges} (note_id, start_verse_id, end_verse_id)
              select n.id, r.s, r.e from n, (values ${rangeValues(ranges)}) as r(s, e)`,
      );
      return { id, writtenOn, body, verses: versesInput, versesDisplay, ranges, createdAt: at, updatedAt: at };
    },

    listNotesOn: (userId, writtenOn) => selectNotes(userId, eq(notes.writtenOn, writtenOn)),

    listNotesTouching: (userId, within) =>
      selectNotes(
        userId,
        exists(
          db()
            .select({ one: sql`1` })
            .from(noteRanges)
            .where(and(eq(noteRanges.noteId, notes.id), touching(within))),
        ),
      ),

    async listNoteDays(userId, from, to) {
      const rows = await db()
        .selectDistinct({ writtenOn: notes.writtenOn })
        .from(notes)
        .where(and(eq(notes.userId, userId), isNull(notes.deletedAt), between(notes.writtenOn, from, to)));
      return rows.map((r) => r.writtenOn);
    },

    async listNoteRanges(userId, within) {
      return db()
        .select({ start: noteRanges.startVerseId, end: noteRanges.endVerseId })
        .from(noteRanges)
        .innerJoin(notes, eq(notes.id, noteRanges.noteId))
        .where(and(eq(notes.userId, userId), isNull(notes.deletedAt), touching(within)));
    },

    async updateNote(userId, id, { body, verses }, updatedAt) {
      const set = [sql`updated_at = ${updatedAt.toISOString()}`];
      if (body !== undefined) set.push(sql`body = ${body}`);
      if (verses) set.push(sql`verses_input = ${verses.input}`, sql`verses_display = ${verses.display}`);
      const update = sql`
        update ${notes} set ${sql.join(set, sql`, `)}
        where id = ${id} and user_id = ${userId} and deleted_at is null
        returning id`;
      // One statement: the update, and when verses change, swapping all the note's ranges.
      const statement = !verses
        ? update
        : verses.ranges.length === 0
          ? sql`with u as (${update}) delete from ${noteRanges} where note_id in (select id from u)`
          : sql`with u as (${update}),
                d as (delete from ${noteRanges} where note_id in (select id from u))
              insert into ${noteRanges} (note_id, start_verse_id, end_verse_id)
              select u.id, r.s, r.e from u, (values ${rangeValues(verses.ranges)}) as r(s, e)`;
      await db().execute(statement);
      const [note] = await selectNotes(userId, eq(notes.id, id));
      return note;
    },

    async deleteNote(userId, id, deletedAt) {
      const rows = await db()
        .update(notes)
        .set({ deletedAt })
        .where(and(eq(notes.id, id), eq(notes.userId, userId), isNull(notes.deletedAt)))
        .returning({ id: notes.id });
      return rows.length > 0;
    },

    async restoreNote(userId, id) {
      const rows = await db()
        .update(notes)
        .set({ deletedAt: null })
        .where(and(eq(notes.id, id), eq(notes.userId, userId), isNotNull(notes.deletedAt)))
        .returning({ id: notes.id });
      return rows.length > 0;
    },
  };
}
