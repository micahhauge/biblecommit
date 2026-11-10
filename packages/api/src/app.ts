import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { isTimezone, localDate, parse, type VerseRange } from '@biblecommit/core';
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

export interface User {
  id: string;
  timezone: string;
}

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

export interface Deps {
  getCanonTotals(): Promise<CanonTotals>;
  createGuest(guest: { tokenHash: string; timezone: string }): Promise<{ id: string }>;
  findUserByGuestTokenHash(tokenHash: string): Promise<User | undefined>;
  /** Stores a commit and its verse ranges atomically. */
  createCommit(commit: NewCommit): Promise<Commit>;
  /** The user's most recent non-deleted commits: latest `readOn` first, then latest created. */
  listCommits(userId: string, limit: number): Promise<Commit[]>;
}

export interface Options {
  /** Clock, injectable for tests. */
  now?: () => Date;
}

const RECENT_LIMIT = 10;

const ErrorBody = z.object({ error: z.string() }).openapi('Error');
const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});
const unauthorized = json(ErrorBody, 'Missing or unknown credentials');

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
  security: [{ guest: [] }],
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
  summary: 'Recent commits, newest first',
  security: [{ guest: [] }],
  responses: {
    200: json(z.object({ commits: z.array(Commit) }).openapi('CommitList'), 'Recent commits'),
    401: unauthorized,
  },
});

export function createApp(deps: Deps, { now = () => new Date() }: Options = {}) {
  const app = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) return c.json({ error: result.error.issues.map((i) => i.message).join('; ') }, 400);
    },
  }).basePath('/api');

  /** The caller from `Authorization: Guest <token>`, or undefined. */
  async function caller(c: Context): Promise<User | undefined> {
    const token = c.req.header('authorization')?.match(/^Guest\s+(\S+)$/)?.[1];
    if (!token) return undefined;
    return deps.findUserByGuestTokenHash(await hashGuestToken(token));
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
    return c.json({ commits: await deps.listCommits(user.id, RECENT_LIMIT) }, 200);
  });

  app.openAPIRegistry.registerComponent('securitySchemes', 'guest', {
    type: 'apiKey',
    in: 'header',
    name: 'Authorization',
    description: '`Guest <token>` from POST /api/guests',
  });

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'biblecommit API', version: '0.1.0' },
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
