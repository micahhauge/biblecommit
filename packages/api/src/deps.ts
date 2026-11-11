import { canonTotals, commitRanges, commits, createDb, users, type Db } from '@biblecommit/db';
import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import type { Commit, Deps, ModePref } from './app';

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
  };
}
