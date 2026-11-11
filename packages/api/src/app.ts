import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { BOOKS, bucketThresholds, chapterReads, coverage, getBook, isTimezone, localDate, parse, streak, weekOf, TOTAL_CHAPTERS, verseReads, yearDays, YEAR_DAYS, type VerseRange } from '@biblecommit/core';
import type { Context } from 'hono';
import { hashGuestToken, newGuestToken } from './guest-token';

export const CanonTotals = z
  .object({
    books: z.number().int(),
    chapters: z.number().int(),
    verses: z.number().int(),
  })
  .openapi('CanonTotals');

export type CanonTotals = z.infer<typeof CanonTotals>;

export const Commit = z
  .object({
    id: z.string().uuid(),
    /** The user's local date the reading counts for. */
    readOn: z.iso.date(),
    rawInput: z.string(),
    /** Normalized passage, e.g. "John 3". */
    display: z.string(),
    verseCount: z.number().int(),
    createdAt: z.iso.datetime(),
  })
  .openapi('Commit');

export type Commit = z.infer<typeof Commit>;

export const Segment = z
  .object({
    bookId: z.number().int().openapi({ description: '1..66 in canonical order' }),
    startChapter: z.number().int(),
    startVerse: z.number().int(),
    endChapter: z.number().int(),
    endVerse: z.number().int(),
  })
  .openapi('Segment', { description: 'A contiguous passage within one book, inclusive.' });

export const Parsed = z
  .object({
    /** Merged, in canonical order. */
    segments: z.array(Segment),
    display: z.string().openapi({ example: 'John 3' }),
    verseCount: z.number().int(),
    readOn: z.iso.date(),
    summary: z.string().openapi({ example: 'John 3 · 36 verses · today' }),
  })
  .openapi('Parsed');

export const ModePref = z.enum(['system', 'dark', 'light']).openapi('ModePref');
export type ModePref = z.infer<typeof ModePref>;

export interface User {
  id: string;
  timezone: string;
  /** Null until chosen. */
  modePref: ModePref | null;
}

export const Me = z
  .object({
    /** IANA timezone; the user's local days (streak, today, readOn defaults) are in it. */
    timezone: z.string().openapi({ example: 'America/Chicago' }),
    /** Null until the user has chosen; clients then send the mode they're showing. */
    modePref: ModePref.nullable(),
  })
  .openapi('Me');

export const TodaySummary = z
  .object({
    /** The user's local date right now. */
    today: z.iso.date(),
    /** Consecutive days with a commit, ending today, or yesterday while today is pending. */
    streak: z.number().int(),
    committedToday: z.boolean(),
    /** Sunday through Saturday of this week; days after today are never committed. */
    week: z.array(z.object({ date: z.iso.date(), committed: z.boolean() })).length(7),
    /** Commits that count for today, newest first. */
    commits: z.array(Commit),
  })
  .openapi('TodaySummary');

export const Year = z
  .object({
    /** The user's local date right now. Days after it are always 0. */
    today: z.iso.date(),
    /** 53 Sunday–Saturday weeks, oldest first, ending with the week of `end`. */
    days: z
      .array(
        z.object({
          date: z.iso.date(),
          /** Verses read that day, repeats counted. */
          verses: z.number().int(),
        }),
      )
      .length(YEAR_DAYS),
    /**
     * The fewest verses for intensity buckets 1–4 (0 verses is bucket 0): quartiles of the
     * window's reading days, or 1 / 11 / 31 / 81 with fewer than 8 of them.
     */
    thresholds: z.array(z.number().int()).length(4),
  })
  .openapi('Year');

export const Canon = z
  .object({
    /**
     * One entry per chapter (1,189), in canonical order: index `i` is chapter ID `i + 1`.
     * All time, deleted commits excluded.
     */
    chapters: z
      .array(
        z.object({
          /** Times the whole chapter has been read: the fewest reads of any of its verses (repeats count). */
          times: z.number().int(),
          /** Distinct verses read at least once. A chapter with `times` 0 and some verses read is partly read. */
          versesRead: z.number().int(),
        }),
      )
      .length(TOTAL_CHAPTERS),
    /** Chapters with every verse read at least once. */
    chaptersRead: z.number().int(),
    /** Chapters read through at least twice. */
    readMoreThanOnce: z.number().int(),
    /** `chaptersRead` ÷ 1,189, from 0 to 1. */
    coverage: z.number(),
  })
  .openapi('Canon');

export const BookReads = z
  .object({
    /** 1..66 in canonical order. */
    bookId: z.number().int(),
    /** One entry per chapter of the book, in order: index `c` is chapter `c + 1`. All time, deleted commits excluded. */
    chapters: z.array(
      z.object({
        /** Read count of each verse (repeats count): index `v` is verse `v + 1`. */
        verses: z.array(z.number().int()),
      }),
    ),
  })
  .openapi('BookReads');

export interface NewCommit {
  id: string;
  userId: string;
  readOn: string;
  rawInput: string;
  display: string;
  createdAt: Date;
  ranges: VerseRange[];
  verseCount: number;
}

/** Where a commit sits in the recent-list order. */
export interface CommitPosition {
  readOn: string;
  createdAt: string;
  id: string;
}

const CursorPosition = z.tuple([z.iso.date(), z.iso.datetime(), z.string().uuid()]);

/** Opaque to clients: base64url of the last commit's position. */
function encodeCursor({ readOn, createdAt, id }: Commit): string {
  // Plain ASCII, so btoa is safe; base64url keeps it query-string friendly.
  return btoa(JSON.stringify([readOn, createdAt, id])).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeCursor(cursor: string): CommitPosition | undefined {
  try {
    const parsed = CursorPosition.safeParse(JSON.parse(atob(cursor.replace(/-/g, '+').replace(/_/g, '/'))));
    if (!parsed.success) return undefined;
    const [readOn, createdAt, id] = parsed.data;
    return { readOn, createdAt, id };
  } catch {
    return undefined;
  }
}

export interface Deps {
  getCanonTotals(): Promise<CanonTotals>;
  createGuest(guest: { tokenHash: string; timezone: string }): Promise<{ id: string }>;
  findUserByGuestTokenHash(tokenHash: string): Promise<User | undefined>;
  /** The user signed in as this Clerk user, created with `timezone` if they have no row yet. */
  findOrCreateClerkUser(clerkUserId: string, timezone: string): Promise<User>;
  /**
   * Moves the guest with this token hash to the Clerk user, atomically. If the Clerk user
   * has no row, the guest row adopts the Clerk id and loses its token. Otherwise the guest's
   * commits are reassigned to the existing row (whose timezone and prefs are kept) and the
   * guest row is deleted. No guest with that hash: does nothing.
   */
  claimGuest(clerkUserId: string, guestTokenHash: string): Promise<void>;
  /** Stores a commit and its verse ranges atomically. */
  createCommit(commit: NewCommit): Promise<Commit>;
  /**
   * The user's non-deleted commits: latest `readOn` first, then latest created, then by id.
   * With `after`, only commits strictly after that position in this order.
   */
  listCommits(userId: string, limit: number, after?: CommitPosition): Promise<Commit[]>;
  /** The user's non-deleted commits that count for one local date, newest first. */
  listCommitsOn(userId: string, readOn: string): Promise<Commit[]>;
  /** Every distinct `readOn` among the user's non-deleted commits. */
  listReadDays(userId: string): Promise<string[]>;
  /** Verses read per local date from `from` to `to` inclusive, repeats counted; days with none are left out. */
  dailyVerses(userId: string, from: string, to: string): Promise<Array<{ readOn: string; verses: number }>>;
  /** Every verse range in the user's non-deleted commits, all time; only those overlapping `within`, if given. */
  listReadRanges(userId: string, within?: VerseRange): Promise<VerseRange[]>;
  updateUser(userId: string, changes: { timezone?: string; modePref?: ModePref }): Promise<void>;
  /**
   * Soft-deletes one of the user's commits by setting `deleted_at`. Returns false if the
   * commit doesn't exist, isn't theirs, or is already deleted.
   *
   * Every read (the recent list and all derived views: streak, heatmap, canon) must
   * exclude commits whose `deleted_at` is set.
   */
  deleteCommit(userId: string, id: string, deletedAt: Date): Promise<boolean>;
}

export interface Options {
  /** Clock, injectable for tests. */
  now?: () => Date;
  /**
   * Verifies a Clerk session JWT (`Authorization: Bearer <jwt>`) and returns its Clerk user id,
   * or undefined if it isn't valid. Without one, no Bearer token is accepted.
   */
  verifySession?: (jwt: string) => Promise<string | undefined>;
}

const RECENT_LIMIT = 10;

const ErrorBody = z.object({ error: z.string() }).openapi('Error');
const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});
const unauthorized = json(ErrorBody, 'Missing or unknown credentials');
/** Either a guest token or a Clerk session. */
const anyUser: Array<Record<string, string[]>> = [{ guest: [] }, { clerk: [] }];
/** New users are created in UTC; clients then send their timezone (PATCH /api/me). */
const DEFAULT_TIMEZONE = 'UTC';

const Timezone = z.string().refine(isTimezone, 'unknown timezone').openapi({ example: 'America/Chicago' });

const canonTotalsRoute = createRoute({
  method: 'get',
  path: '/canon/totals',
  summary: 'Canon totals as seeded in the database',
  responses: { 200: json(CanonTotals, 'Totals') },
});

const createGuestRoute = createRoute({
  method: 'post',
  path: '/guests',
  summary: 'Create a guest user. Called once, right before the first commit.',
  request: { body: { required: true, ...json(z.object({ timezone: Timezone }), 'Browser timezone') } },
  responses: {
    201: json(
      z.object({ token: z.string() }).openapi('GuestToken'),
      'The guest token. Send it as `Authorization: Guest <token>`; it cannot be recovered.',
    ),
    400: json(ErrorBody, 'Invalid body'),
  },
});

const parseRoute = createRoute({
  method: 'post',
  path: '/parse',
  summary: 'Parse a reading without committing it',
  description:
    'Sign-in is optional. Today is the caller\'s local date when an `Authorization` header is sent, else the date in `timezone` (default UTC).',
  request: {
    body: {
      required: true,
      ...json(
        z.object({
          text: z.string().max(500).openapi({ example: 'yesterday john 3:16-18' }),
          /** Used when the text has no date phrase. */
          readOn: z.iso.date().optional(),
          timezone: Timezone.optional(),
        }),
        'What was read',
      ),
    },
  },
  responses: {
    200: json(Parsed, 'The parsed reading'),
    400: json(ErrorBody, 'Invalid body'),
    401: unauthorized,
    422: json(ErrorBody, 'The text could not be parsed, or the date is in the future'),
  },
});

const createCommitRoute = createRoute({
  method: 'post',
  path: '/commits',
  summary: 'Commit a reading. The server re-parses the text.',
  security: anyUser,
  request: {
    body: {
      required: true,
      ...json(
        z.object({
          text: z.string().max(500).openapi({ example: 'john 3' }),
          /** Used when the text has no date phrase. Defaults to the user's local today. */
          readOn: z.iso.date().optional(),
        }),
        'What was read',
      ),
    },
  },
  responses: {
    201: json(Commit, 'The created commit'),
    400: json(ErrorBody, 'Invalid body'),
    401: unauthorized,
    422: json(ErrorBody, 'The text could not be parsed, or the date is in the future'),
  },
});

const listCommitsRoute = createRoute({
  method: 'get',
  path: '/commits',
  summary: 'Recent commits, newest first, a page at a time',
  security: anyUser,
  request: {
    query: z.object({
      cursor: z.string().optional().openapi({ description: '`nextCursor` from the previous page; omit for the first page' }),
    }),
  },
  responses: {
    200: json(
      z
        .object({
          commits: z.array(Commit),
          /** Pass as `cursor` to get the next page; null on the last page. */
          nextCursor: z.string().nullable(),
        })
        .openapi('CommitList'),
      'Recent commits',
    ),
    400: json(ErrorBody, 'Malformed cursor'),
    401: unauthorized,
  },
});

const deleteCommitRoute = createRoute({
  method: 'delete',
  path: '/commits/{id}',
  summary: 'Delete a commit (soft). Powers undo and the delete in the recent list.',
  security: anyUser,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    204: { description: 'Deleted' },
    400: json(ErrorBody, 'Invalid id'),
    401: unauthorized,
    404: json(ErrorBody, 'No such commit for this user, or already deleted'),
  },
});

const claimRoute = createRoute({
  method: 'post',
  path: '/me/claim',
  summary: 'Move a guest\'s data to the signed-in account',
  description:
    'Call right after sign-in while holding a guest token, then drop the token. A new account adopts the guest ' +
    '(its commits, timezone, and prefs); an existing account gets the guest\'s commits merged in and keeps its own ' +
    'timezone and prefs. Idempotent: an unknown or already-claimed token does nothing.',
  security: [{ clerk: [] }],
  request: { body: { required: true, ...json(z.object({ guestToken: z.string().min(1) }), 'The guest token to claim') } },
  responses: {
    204: { description: 'Claimed, or nothing to claim' },
    400: json(ErrorBody, 'Invalid body'),
    401: json(ErrorBody, 'Not signed in with a Clerk session'),
  },
});

const getMeRoute = createRoute({
  method: 'get',
  path: '/me',
  summary: 'The caller\'s profile and preferences',
  security: anyUser,
  responses: { 200: json(Me, 'Profile'), 401: unauthorized },
});

const patchMeRoute = createRoute({
  method: 'patch',
  path: '/me',
  summary: 'Update the caller\'s timezone or mode',
  description:
    'Clients send the browser/device timezone on load when it differs from the stored one, and the mode whenever ' +
    'the user changes it (or on load, while none is stored).',
  security: anyUser,
  request: {
    body: { required: true, ...json(z.object({ timezone: Timezone.optional(), modePref: ModePref.optional() }), 'Fields to change') },
  },
  responses: { 200: json(Me, 'The updated profile'), 400: json(ErrorBody, 'Invalid body'), 401: unauthorized },
});

const todayRoute = createRoute({
  method: 'get',
  path: '/me/today',
  summary: 'Streak, this week, and today\'s commits, in the caller\'s timezone',
  security: anyUser,
  responses: { 200: json(TodaySummary, 'Today'), 401: unauthorized },
});

const yearRoute = createRoute({
  method: 'get',
  path: '/me/year',
  summary: 'The year heatmap: daily verse totals for 53 weeks, and intensity thresholds',
  security: anyUser,
  request: {
    query: z.object({
      end: z.iso.date().optional().openapi({ description: 'A day in the last week shown. Defaults to the caller\'s today.' }),
    }),
  },
  responses: { 200: json(Year, 'The year'), 400: json(ErrorBody, 'Invalid end date'), 401: unauthorized },
});

const canonRoute = createRoute({
  method: 'get',
  path: '/me/canon',
  summary: 'How much of the canon the caller has read: per-chapter reads and coverage',
  security: anyUser,
  responses: { 200: json(Canon, 'The canon'), 401: unauthorized },
});

const bookReadsRoute = createRoute({
  method: 'get',
  path: '/me/canon/{bookId}',
  summary: 'How often the caller has read each verse of one book',
  security: anyUser,
  request: {
    params: z.object({
      bookId: z.coerce
        .number({ message: 'bookId must be a number from 1 to 66' })
        .int({ message: 'bookId must be a number from 1 to 66' })
        .min(1, { message: 'bookId must be a number from 1 to 66' })
        .max(BOOKS.length, { message: 'bookId must be a number from 1 to 66' })
        .openapi({ param: { name: 'bookId', in: 'path' }, example: 1 }),
    }),
  },
  responses: { 200: json(BookReads, 'The book'), 400: json(ErrorBody, 'Invalid book'), 401: unauthorized },
});

export function createApp(deps: Deps, { now = () => new Date(), verifySession = async () => undefined }: Options = {}) {
  const app = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) return c.json({ error: result.error.issues.map((i) => i.message).join('; ') }, 400);
    },
  }).basePath('/api');

  /** The Clerk user id from a valid `Authorization: Bearer <jwt>`, or undefined. */
  async function clerkUserId(c: Context): Promise<string | undefined> {
    const jwt = c.req.header('authorization')?.match(/^Bearer\s+(\S+)$/)?.[1];
    return jwt ? verifySession(jwt) : undefined;
  }

  /**
   * The caller from `Authorization: Guest <token>` or `Bearer <clerk jwt>`, or undefined.
   * A signed-in Clerk user gets a row on their first request.
   */
  async function caller(c: Context): Promise<User | undefined> {
    const token = c.req.header('authorization')?.match(/^Guest\s+(\S+)$/)?.[1];
    if (token) return deps.findUserByGuestTokenHash(await hashGuestToken(token));
    const clerkId = await clerkUserId(c);
    return clerkId ? deps.findOrCreateClerkUser(clerkId, DEFAULT_TIMEZONE) : undefined;
  }

  app.openapi(canonTotalsRoute, async (c) => c.json(await deps.getCanonTotals(), 200));

  app.openapi(createGuestRoute, async (c) => {
    const { timezone } = c.req.valid('json');
    const token = newGuestToken();
    await deps.createGuest({ tokenHash: await hashGuestToken(token), timezone });
    return c.json({ token }, 201);
  });

  app.openapi(parseRoute, async (c) => {
    const { text, readOn, timezone } = c.req.valid('json');
    let tz = timezone ?? 'UTC';
    if (c.req.header('authorization')) {
      const user = await caller(c);
      if (!user) return c.json({ error: 'sign in or start as a guest' }, 401);
      tz = user.timezone;
    }
    const parsed = parse(text, { today: localDate(now(), tz), readOn });
    if (!parsed.ok) return c.json({ error: parsed.error }, 422);
    const { segments, display, verseCount, readOn: date, summary } = parsed;
    return c.json({ segments, display, verseCount, readOn: date, summary }, 200);
  });

  app.openapi(createCommitRoute, async (c) => {
    const user = await caller(c);
    if (!user) return c.json({ error: 'sign in or start as a guest' }, 401);
    const { text, readOn } = c.req.valid('json');
    const createdAt = now();
    const parsed = parse(text, { today: localDate(createdAt, user.timezone), readOn });
    if (!parsed.ok) return c.json({ error: parsed.error }, 422);
    const commit = await deps.createCommit({
      id: crypto.randomUUID(),
      userId: user.id,
      readOn: parsed.readOn,
      rawInput: text,
      display: parsed.display,
      createdAt,
      ranges: parsed.ranges,
      verseCount: parsed.verseCount,
    });
    return c.json(commit, 201);
  });

  app.openapi(listCommitsRoute, async (c) => {
    const user = await caller(c);
    if (!user) return c.json({ error: 'sign in or start as a guest' }, 401);
    const { cursor } = c.req.valid('query');
    const after = cursor === undefined ? undefined : decodeCursor(cursor);
    if (cursor !== undefined && !after) return c.json({ error: 'malformed cursor' }, 400);
    // One extra tells us whether there's another page.
    const rows = await deps.listCommits(user.id, RECENT_LIMIT + 1, after);
    const commits = rows.slice(0, RECENT_LIMIT);
    const nextCursor = rows.length > RECENT_LIMIT ? encodeCursor(commits.at(-1)!) : null;
    return c.json({ commits, nextCursor }, 200);
  });

  app.openapi(deleteCommitRoute, async (c) => {
    const user = await caller(c);
    if (!user) return c.json({ error: 'sign in or start as a guest' }, 401);
    const deleted = await deps.deleteCommit(user.id, c.req.valid('param').id, now());
    if (!deleted) return c.json({ error: 'no such commit' }, 404);
    return c.body(null, 204);
  });

  app.openapi(claimRoute, async (c) => {
    // Deliberately no row is created here, so a brand-new account adopts the guest.
    const clerkId = await clerkUserId(c);
    if (!clerkId) return c.json({ error: 'sign in to claim a guest' }, 401);
    await deps.claimGuest(clerkId, await hashGuestToken(c.req.valid('json').guestToken));
    return c.body(null, 204);
  });

  app.openapi(getMeRoute, async (c) => {
    const user = await caller(c);
    if (!user) return c.json({ error: 'sign in or start as a guest' }, 401);
    return c.json({ timezone: user.timezone, modePref: user.modePref }, 200);
  });

  app.openapi(patchMeRoute, async (c) => {
    const user = await caller(c);
    if (!user) return c.json({ error: 'sign in or start as a guest' }, 401);
    const { timezone = user.timezone, modePref = user.modePref } = c.req.valid('json');
    const changes = {
      ...(timezone !== user.timezone && { timezone }),
      ...(modePref !== user.modePref && modePref !== null && { modePref }),
    };
    if (Object.keys(changes).length > 0) await deps.updateUser(user.id, changes);
    return c.json({ timezone, modePref }, 200);
  });

  app.openapi(todayRoute, async (c) => {
    const user = await caller(c);
    if (!user) return c.json({ error: 'sign in or start as a guest' }, 401);
    const today = localDate(now(), user.timezone);
    const [days, commits] = await Promise.all([deps.listReadDays(user.id), deps.listCommitsOn(user.id, today)]);
    const read = new Set(days);
    const { length, committedToday } = streak(read, today);
    const week = weekOf(today).map((date) => ({ date, committed: date <= today && read.has(date) }));
    return c.json({ today, streak: length, committedToday, week, commits }, 200);
  });

  app.openapi(yearRoute, async (c) => {
    const user = await caller(c);
    if (!user) return c.json({ error: 'sign in or start as a guest' }, 401);
    const today = localDate(now(), user.timezone);
    const dates = yearDays(c.req.valid('query').end ?? today);
    const rows = await deps.dailyVerses(user.id, dates[0]!, dates.at(-1)!);
    const verses = new Map(rows.map((r) => [r.readOn, r.verses]));
    const days = dates.map((date) => ({ date, verses: verses.get(date) ?? 0 }));
    return c.json({ today, days, thresholds: bucketThresholds(verses.values()) }, 200);
  });

  app.openapi(canonRoute, async (c) => {
    const user = await caller(c);
    if (!user) return c.json({ error: 'sign in or start as a guest' }, 401);
    const chapters = chapterReads(await deps.listReadRanges(user.id));
    return c.json({ chapters, ...coverage(chapters) }, 200);
  });

  app.openapi(bookReadsRoute, async (c) => {
    const user = await caller(c);
    if (!user) return c.json({ error: 'sign in or start as a guest' }, 401);
    const { bookId } = c.req.valid('param');
    const book = getBook(bookId)!;
    const ranges = await deps.listReadRanges(user.id, { start: book.firstVerseId, end: book.lastVerseId });
    return c.json({ bookId, chapters: verseReads(ranges, bookId).map((verses) => ({ verses })) }, 200);
  });

  app.openAPIRegistry.registerComponent('securitySchemes', 'guest', {
    type: 'apiKey',
    in: 'header',
    name: 'Authorization',
    description: '`Guest <token>` from POST /api/guests',
  });
  app.openAPIRegistry.registerComponent('securitySchemes', 'clerk', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'A Clerk session token',
  });

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'biblecommit API', version: '0.1.0' },
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
