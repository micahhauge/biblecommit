import { createTestDb } from '@biblecommit/db/testing';
import { commitRanges, commits, users } from '@biblecommit/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createDbDeps } from './deps';

const t = await createTestDb();
afterAll(() => t.close());
beforeEach(() => t.reset());

// 03:00 UTC on Nov 10 is still the evening of Nov 9 in Chicago.
let now = new Date('2026-11-10T03:00:00Z');
// Stands in for Clerk: a session JWT here is "clerk:<clerk user id>".
const verifySession = async (jwt: string) => jwt.match(/^clerk:(.+)$/)?.[1];
const app = createApp(createDbDeps(t.db), { now: () => now, verifySession });
beforeEach(() => {
  now = new Date('2026-11-10T03:00:00Z');
});

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });
}

async function newGuest(timezone = 'America/Chicago') {
  const { token } = await (await post('/api/guests', { timezone })).json();
  return { Authorization: `Guest ${token}` };
}

function signedIn(clerkUserId: string) {
  return { Authorization: `Bearer clerk:${clerkUserId}` };
}

function tokenOf(guest: Record<string, string>) {
  return guest.Authorization!.replace(/^Guest /, '');
}

async function list(auth: Record<string, string>) {
  const res = await app.request('/api/commits', { headers: auth });
  expect(res.status).toBe(200);
  return (await res.json()).commits as Array<Record<string, unknown>>;
}

describe('canon', () => {
  it('serves canon totals', async () => {
    const res = await app.request('/api/canon/totals');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ books: 66, chapters: 1189, verses: 31102 });
  });

  it('serves an OpenAPI document describing its routes', async () => {
    const res = await app.request('/api/openapi.json');
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining(['/api/canon/totals', '/api/guests', '/api/parse', '/api/commits']));
  });
});

describe('POST /api/guests', () => {
  it('creates a guest and returns a secret token, storing only its hash', async () => {
    const res = await post('/api/guests', { timezone: 'America/Chicago' });
    expect(res.status).toBe(201);
    const { token } = await res.json();
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);

    // The raw token must never be persisted; only observable in storage.
    const rows = await t.db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.timezone).toBe('America/Chicago');
    expect(rows[0]!.guestTokenHash).not.toBe(token);
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it('gives every guest a different token', async () => {
    const a = await (await post('/api/guests', { timezone: 'UTC' })).json();
    const b = await (await post('/api/guests', { timezone: 'UTC' })).json();
    expect(a.token).not.toBe(b.token);
  });

  it('rejects an unknown timezone', async () => {
    const res = await post('/api/guests', { timezone: 'Mars/Olympus' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/commits', () => {
  it('commits a chapter for the guest\'s local date', async () => {
    const auth = await newGuest('America/Chicago');
    const res = await post('/api/commits', { text: 'john 3' }, auth);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      id: expect.any(String),
      readOn: '2026-11-09',
      rawInput: 'john 3',
      display: 'John 3',
      verseCount: 36,
      createdAt: expect.any(String),
    });
  });

  it('stores the verse ranges the server parsed', async () => {
    const auth = await newGuest();
    await post('/api/commits', { text: 'gen 1-3' }, auth);
    // Not exposed by any v1 endpoint yet; derived views (heatmap, canon) read these.
    expect(await t.db.select({ start: commitRanges.startVerseId, end: commitRanges.endVerseId }).from(commitRanges)).toEqual([
      { start: 1, end: 80 },
    ]);
  });

  it('re-parses the text and rejects what it cannot read', async () => {
    const auth = await newGuest();
    const res = await post('/api/commits', { text: 'hezekiah 3' }, auth);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'unknown book “hezekiah”' });
    expect(await list(auth)).toEqual([]);
  });

  it('accepts a past readOn and rejects a future one', async () => {
    const auth = await newGuest('America/Chicago');
    const past = await post('/api/commits', { text: 'ruth', readOn: '2026-11-01' }, auth);
    expect(past.status).toBe(201);
    expect(await past.json()).toMatchObject({ readOn: '2026-11-01' });

    // Nov 10 is already today in UTC, but not yet in Chicago.
    const future = await post('/api/commits', { text: 'ruth', readOn: '2026-11-10' }, auth);
    expect(future.status).toBe(422);
    expect(await future.json()).toEqual({ error: 'that date is in the future' });
  });

  it('lets a date in the text beat readOn', async () => {
    const auth = await newGuest('America/Chicago');
    const res = await post('/api/commits', { text: 'yesterday psalm 23', readOn: '2026-11-01' }, auth);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ readOn: '2026-11-08', display: 'Psalm 23' });
  });

  it('stores merged ranges for a multi-passage commit', async () => {
    const auth = await newGuest();
    const res = await post('/api/commits', { text: 'gen 2, gen 1, john 1:1', readOn: '2026-11-01' }, auth);
    expect(await res.json()).toMatchObject({ display: 'Genesis 1–2; John 1:1', verseCount: 57 });
    expect(await list(auth)).toMatchObject([{ display: 'Genesis 1–2; John 1:1', verseCount: 57 }]);
  });

  it('requires a valid guest token', async () => {
    expect((await post('/api/commits', { text: 'john 3' })).status).toBe(401);
    expect((await post('/api/commits', { text: 'john 3' }, { Authorization: 'Guest not-a-real-token' })).status).toBe(401);
    expect((await post('/api/commits', { text: 'john 3' }, { Authorization: 'Bearer something' })).status).toBe(401);
  });
});

describe('POST /api/parse', () => {
  it('parses without writing anything', async () => {
    const auth = await newGuest('America/Chicago');
    const res = await post('/api/parse', { text: 'jn 3:16-18, 20' }, auth);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      segments: [
        { bookId: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 18 },
        { bookId: 43, startChapter: 3, startVerse: 20, endChapter: 3, endVerse: 20 },
      ],
      display: 'John 3:16–18, 3:20',
      verseCount: 4,
      // Still Nov 9 in Chicago.
      readOn: '2026-11-09',
      summary: 'John 3:16–18, 3:20 · 4 verses · today',
    });
    expect(await list(auth)).toEqual([]);
  });

  it('needs no sign-in, using the given timezone or UTC', async () => {
    expect(await (await post('/api/parse', { text: 'gen 1' })).json()).toMatchObject({ readOn: '2026-11-10' });
    expect(await (await post('/api/parse', { text: 'gen 1', timezone: 'America/Chicago' })).json()).toMatchObject({ readOn: '2026-11-09' });
  });

  it('applies readOn, but a date in the text wins', async () => {
    const body = (text: string) => ({ text, readOn: '2026-11-01', timezone: 'UTC' });
    expect(await (await post('/api/parse', body('gen 1'))).json()).toMatchObject({ readOn: '2026-11-01' });
    expect(await (await post('/api/parse', body('3 days ago gen 1'))).json()).toMatchObject({ readOn: '2026-11-07' });
  });

  it('returns the parse error', async () => {
    const res = await post('/api/parse', { text: 'jud 1' });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'Judges or Jude?' });
  });
});

describe('GET /api/commits', () => {
  it('lists the caller\'s recent commits, newest first', async () => {
    const auth = await newGuest();
    const other = await newGuest();
    await post('/api/commits', { text: 'gen 1' }, auth);
    await post('/api/commits', { text: 'exodus 1' }, other);
    await post('/api/commits', { text: 'psalm 23', readOn: '2026-11-02' }, auth);
    now = new Date(now.getTime() + 60_000);
    await post('/api/commits', { text: 'john 1' }, auth);

    expect((await list(auth)).map((c) => [c.readOn, c.display])).toEqual([
      ['2026-11-09', 'John 1'],
      ['2026-11-09', 'Genesis 1'],
      ['2026-11-02', 'Psalm 23'],
    ]);
  });

  it('returns the 10 most recent', async () => {
    const auth = await newGuest();
    for (let c = 1; c <= 12; c++) {
      now = new Date(now.getTime() + 1000);
      await post('/api/commits', { text: `gen ${c}` }, auth);
    }
    const commits = await list(auth);
    expect(commits).toHaveLength(10);
    expect(commits[0]).toMatchObject({ display: 'Genesis 12' });
  });

  it('pages through everything with a cursor, without skipping or repeating', async () => {
    const auth = await newGuest();
    const expected: string[] = [];
    // Several share a readOn and a createdAt, so the cursor has to break ties.
    for (let c = 1; c <= 23; c++) {
      if (c % 3 === 0) now = new Date(now.getTime() + 1000);
      await post('/api/commits', { text: `gen ${c}`, readOn: c % 2 ? '2026-11-01' : '2026-11-05' }, auth);
    }
    for (let c = 23; c >= 1; c--) if (c % 2 === 0) expected.push(`Genesis ${c}`);
    for (let c = 23; c >= 1; c--) if (c % 2) expected.push(`Genesis ${c}`);

    const seen: string[] = [];
    const sizes: number[] = [];
    let cursor: string | null = null;
    do {
      const res = await app.request(`/api/commits${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { headers: auth });
      expect(res.status).toBe(200);
      const page = (await res.json()) as { commits: Array<{ display: string }>; nextCursor: string | null };
      sizes.push(page.commits.length);
      seen.push(...page.commits.map((c) => c.display));
      cursor = page.nextCursor;
    } while (cursor);

    expect(sizes).toEqual([10, 10, 3]);
    // Same readOn and createdAt can come back in any stable order; compare as sets per day.
    expect(seen.slice(0, 11).sort()).toEqual(expected.slice(0, 11).sort());
    expect(seen.slice(11).sort()).toEqual(expected.slice(11).sort());
    expect(new Set(seen).size).toBe(23);
  });

  it('has no next cursor when everything fits on one page', async () => {
    const auth = await newGuest();
    await post('/api/commits', { text: 'gen 1' }, auth);
    const res = await app.request('/api/commits', { headers: auth });
    expect(await res.json()).toMatchObject({ nextCursor: null });
  });

  it('rejects a malformed cursor', async () => {
    const auth = await newGuest();
    expect((await app.request('/api/commits?cursor=garbage', { headers: auth })).status).toBe(400);
  });

  it('requires a valid guest token', async () => {
    expect((await app.request('/api/commits')).status).toBe(401);
  });
});

describe('DELETE /api/commits/:id', () => {
  function del(id: string, auth: Record<string, string> = {}) {
    return app.request(`/api/commits/${id}`, { method: 'DELETE', headers: auth });
  }

  it('deletes the caller\'s commit so it leaves the list', async () => {
    const auth = await newGuest();
    const { id } = await (await post('/api/commits', { text: 'gen 1' }, auth)).json();
    await post('/api/commits', { text: 'gen 2' }, auth);

    expect((await del(id, auth)).status).toBe(204);
    expect((await list(auth)).map((c) => c.display)).toEqual(['Genesis 2']);
  });

  it('only deletes the caller\'s own commits', async () => {
    const auth = await newGuest();
    const other = await newGuest();
    const { id } = await (await post('/api/commits', { text: 'gen 1' }, auth)).json();

    expect((await del(id, other)).status).toBe(404);
    expect((await del(id)).status).toBe(401);
    expect((await list(auth)).map((c) => c.display)).toEqual(['Genesis 1']);
  });

  it('404s on a commit that is already deleted or never existed', async () => {
    const auth = await newGuest();
    const { id } = await (await post('/api/commits', { text: 'gen 1' }, auth)).json();
    expect((await del(id, auth)).status).toBe(204);
    expect((await del(id, auth)).status).toBe(404);
    expect((await del(crypto.randomUUID(), auth)).status).toBe(404);
    expect((await del('not-a-uuid', auth)).status).toBe(400);
  });
});

describe('GET /api/me and PATCH /api/me', () => {
  function patch(body: unknown, auth: Record<string, string>) {
    return app.request('/api/me', { method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...auth } });
  }

  it('returns the caller\'s timezone and mode', async () => {
    const auth = await newGuest('America/Chicago');
    const res = await app.request('/api/me', { headers: auth });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ timezone: 'America/Chicago', modePref: null });
  });

  it('stores the mode once chosen, and changes it after', async () => {
    const auth = await newGuest();
    expect(await (await patch({ modePref: 'light' }, auth)).json()).toMatchObject({ modePref: 'light' });
    expect(await (await app.request('/api/me', { headers: auth })).json()).toMatchObject({ modePref: 'light' });
    await patch({ modePref: 'system' }, auth);
    expect(await (await app.request('/api/me', { headers: auth })).json()).toMatchObject({ modePref: 'system' });
  });

  it('rejects an unknown mode', async () => {
    const auth = await newGuest();
    expect((await patch({ modePref: 'sepia' }, auth)).status).toBe(400);
  });

  it('updates the timezone, which then decides the user\'s local day', async () => {
    const auth = await newGuest('America/Chicago');
    const res = await patch({ timezone: 'Asia/Tokyo' }, auth);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ timezone: 'Asia/Tokyo', modePref: null });
    expect(await (await app.request('/api/me', { headers: auth })).json()).toMatchObject({ timezone: 'Asia/Tokyo' });
    // Nov 10 already in Tokyo.
    expect(await (await post('/api/commits', { text: 'gen 1' }, auth)).json()).toMatchObject({ readOn: '2026-11-10' });
  });

  it('rejects an unknown timezone and requires a guest token', async () => {
    const auth = await newGuest();
    expect((await patch({ timezone: 'Mars/Olympus' }, auth)).status).toBe(400);
    expect((await patch({ timezone: 'UTC' }, {})).status).toBe(401);
    expect((await app.request('/api/me')).status).toBe(401);
  });
});

describe('GET /api/me/today', () => {
  async function today(auth: Record<string, string>) {
    const res = await app.request('/api/me/today', { headers: auth });
    expect(res.status).toBe(200);
    return res.json();
  }
  const commitOn = (auth: Record<string, string>, readOn: string, text = 'gen 1') => post('/api/commits', { text, readOn }, auth);

  it('is an empty week and no streak for a new guest', async () => {
    const auth = await newGuest('America/Chicago');
    expect(await today(auth)).toEqual({
      // Still Monday, Nov 9 in Chicago.
      today: '2026-11-09',
      streak: 0,
      committedToday: false,
      week: ['08', '09', '10', '11', '12', '13', '14'].map((d) => ({ date: `2026-11-${d}`, committed: false })),
      commits: [],
    });
  });

  it('counts the run ending today, with today\'s commits and this week\'s days', async () => {
    const auth = await newGuest('America/Chicago');
    for (const d of ['2026-11-04', '2026-11-06', '2026-11-07', '2026-11-08']) await commitOn(auth, d);
    await post('/api/commits', { text: 'john 3' }, auth);
    now = new Date(now.getTime() + 1000);
    await post('/api/commits', { text: 'ruth' }, auth);

    const body = await today(auth);
    expect(body).toMatchObject({ today: '2026-11-09', streak: 4, committedToday: true });
    expect(body.week.filter((d: { committed: boolean }) => d.committed).map((d: { date: string }) => d.date)).toEqual(['2026-11-08', '2026-11-09']);
    expect(body.commits.map((c: { display: string }) => c.display)).toEqual(['Ruth', 'John 3']);
  });

  it('keeps the streak while today is pending, and loses it after a missed day', async () => {
    const auth = await newGuest('America/Chicago');
    await commitOn(auth, '2026-11-07');
    await commitOn(auth, '2026-11-08');
    expect(await today(auth)).toMatchObject({ streak: 2, committedToday: false, commits: [] });

    // A day later with nothing on Nov 9: broken.
    now = new Date(now.getTime() + 24 * 3600_000);
    expect(await today(auth)).toMatchObject({ today: '2026-11-10', streak: 0 });
  });

  it('leaves out deleted commits', async () => {
    const auth = await newGuest('America/Chicago');
    await commitOn(auth, '2026-11-08');
    const { id } = await (await post('/api/commits', { text: 'gen 2' }, auth)).json();
    expect(await today(auth)).toMatchObject({ streak: 2, committedToday: true });

    await app.request(`/api/commits/${id}`, { method: 'DELETE', headers: auth });
    expect(await today(auth)).toMatchObject({ streak: 1, committedToday: false, commits: [] });
  });

  it('uses the caller\'s timezone for today', async () => {
    const auth = await newGuest('Asia/Tokyo');
    await commitOn(auth, '2026-11-09');
    // 03:00 UTC is Nov 10 in Tokyo: Nov 9 is yesterday, today pending.
    expect(await today(auth)).toMatchObject({ today: '2026-11-10', streak: 1, committedToday: false });
  });

  it('only counts the caller\'s commits, and requires a guest token', async () => {
    const auth = await newGuest();
    const other = await newGuest();
    await post('/api/commits', { text: 'gen 1' }, other);
    expect(await today(auth)).toMatchObject({ streak: 0, commits: [] });
    expect((await app.request('/api/me/today')).status).toBe(401);
  });
});

describe('GET /api/me/year', () => {
  async function year(auth: Record<string, string>, query = '') {
    const res = await app.request(`/api/me/year${query}`, { headers: auth });
    expect(res.status).toBe(200);
    return res.json() as Promise<{ today: string; days: Array<{ date: string; verses: number }>; thresholds: number[] }>;
  }
  const commitOn = (auth: Record<string, string>, readOn: string, text: string) => post('/api/commits', { text, readOn }, auth);
  const versesOn = (days: Array<{ date: string; verses: number }>, date: string) => days.find((d) => d.date === date)?.verses;

  it('is 371 empty days ending with this week, with the fixed thresholds, for a new guest', async () => {
    const auth = await newGuest('America/Chicago');
    const body = await year(auth);
    expect(body.today).toBe('2026-11-09');
    expect(body.days).toHaveLength(371);
    expect(body.days[0]!.date).toBe('2025-11-09');
    expect(body.days.at(-1)!.date).toBe('2026-11-14');
    expect(body.days.every((d) => d.verses === 0)).toBe(true);
    expect(body.thresholds).toEqual([1, 11, 31, 81]);
  });

  it('totals each day\'s verses, counting repeats', async () => {
    const auth = await newGuest('America/Chicago');
    await commitOn(auth, '2026-11-09', 'john 3'); // 36
    await commitOn(auth, '2026-11-09', 'john 3:16'); // the same verse again: +1
    await commitOn(auth, '2026-11-02', 'gen 1, ps 23'); // 31 + 6
    const { days } = await year(auth);
    expect(versesOn(days, '2026-11-09')).toBe(37);
    expect(versesOn(days, '2026-11-02')).toBe(37);
    expect(days.filter((d) => d.verses > 0)).toHaveLength(2);
  });

  it('buckets by quartiles of the window\'s reading days once there are 8', async () => {
    const auth = await newGuest('America/Chicago');
    // Day i reads i verses.
    for (let i = 1; i <= 8; i++) await commitOn(auth, `2026-10-0${i}`, `ps 119:1-${i}`);
    expect((await year(auth)).thresholds).toEqual([1, 3, 5, 7]);
    // A day outside the window doesn't move them.
    await commitOn(auth, '2025-01-01', 'ps 119');
    expect((await year(auth)).thresholds).toEqual([1, 3, 5, 7]);
  });

  it('shows the 53 weeks around `end`', async () => {
    const auth = await newGuest('America/Chicago');
    await commitOn(auth, '2025-01-01', 'ruth 1');
    const { today, days } = await year(auth, '?end=2025-01-01');
    expect(today).toBe('2026-11-09');
    expect(days.at(-1)!.date).toBe('2025-01-04');
    expect(versesOn(days, '2025-01-01')).toBe(22);
    expect((await app.request('/api/me/year?end=nope', { headers: auth })).status).toBe(400);
  });

  it('leaves out deleted commits and other users\' commits, and requires a guest token', async () => {
    const auth = await newGuest('America/Chicago');
    const other = await newGuest('America/Chicago');
    await commitOn(other, '2026-11-09', 'gen 1');
    const { id } = await (await commitOn(auth, '2026-11-08', 'gen 2')).json();
    expect(versesOn((await year(auth)).days, '2026-11-08')).toBe(25);
    await app.request(`/api/commits/${id}`, { method: 'DELETE', headers: auth });
    expect((await year(auth)).days.every((d) => d.verses === 0)).toBe(true);
    expect((await app.request('/api/me/year')).status).toBe(401);
  });
});

describe('GET /api/me/canon', () => {
  type Canon = { chapters: Array<{ times: number; versesRead: number }>; chaptersRead: number; readMoreThanOnce: number; coverage: number };
  async function canon(auth: Record<string, string>): Promise<Canon> {
    const res = await app.request('/api/me/canon', { headers: auth });
    expect(res.status).toBe(200);
    return res.json();
  }
  // Indexes into `chapters` (chapter ID − 1): Genesis 12 is ID 12, Psalm 23 is 501, John 3 is 1000.
  const GEN_12 = 11;
  const PS_23 = 500;
  const JOHN_3 = 999;

  it('is 1,189 unread chapters and 0 coverage for a new guest', async () => {
    const body = await canon(await newGuest());
    expect(body.chapters).toHaveLength(1189);
    expect(body.chapters.every((c) => c.times === 0 && c.versesRead === 0)).toBe(true);
    expect(body).toMatchObject({ chaptersRead: 0, readMoreThanOnce: 0, coverage: 0 });
  });

  it('counts whole-chapter reads all time, with repeats, and partly read chapters', async () => {
    const auth = await newGuest();
    await post('/api/commits', { text: 'gen 12' }, auth);
    await post('/api/commits', { text: 'john 3', readOn: '2024-01-01' }, auth);
    await post('/api/commits', { text: 'yesterday john 3' }, auth);
    await post('/api/commits', { text: 'ps 23:1-4' }, auth);
    const body = await canon(auth);
    expect(body.chapters[GEN_12]).toEqual({ times: 1, versesRead: 20 });
    expect(body.chapters[JOHN_3]).toEqual({ times: 2, versesRead: 36 });
    expect(body.chapters[PS_23]).toEqual({ times: 0, versesRead: 4 });
    expect(body).toMatchObject({ chaptersRead: 2, readMoreThanOnce: 1, coverage: 2 / 1189 });
  });

  it('leaves out deleted commits and other users\' commits, and requires a guest token', async () => {
    const auth = await newGuest();
    const other = await newGuest();
    await post('/api/commits', { text: 'gen 1' }, other);
    const { id } = await (await post('/api/commits', { text: 'gen 2' }, auth)).json();
    expect((await canon(auth)).chaptersRead).toBe(1);
    await app.request(`/api/commits/${id}`, { method: 'DELETE', headers: auth });
    expect((await canon(auth)).chaptersRead).toBe(0);
    expect((await app.request('/api/me/canon')).status).toBe(401);
  });
});

describe('GET /api/me/canon/:bookId', () => {
  type BookReads = { bookId: number; chapters: Array<{ verses: number[] }> };
  async function book(bookId: number | string, auth: Record<string, string>): Promise<BookReads> {
    const res = await app.request(`/api/me/canon/${bookId}`, { headers: auth });
    expect(res.status).toBe(200);
    return res.json();
  }

  it('is every verse of the book, unread, for a new guest', async () => {
    const body = await book(8, await newGuest()); // Ruth
    expect(body.bookId).toBe(8);
    expect(body.chapters.map((c) => c.verses.length)).toEqual([22, 23, 18, 22]);
    expect(body.chapters.flatMap((c) => c.verses).every((n) => n === 0)).toBe(true);
  });

  it('counts reads of each verse all time, with repeats, and only within the book', async () => {
    const auth = await newGuest();
    await post('/api/commits', { text: 'ps 23' }, auth);
    await post('/api/commits', { text: 'ps 23:1-3', readOn: '2024-01-01' }, auth);
    await post('/api/commits', { text: 'job 42, ps 1-2:2, prov 1' }, auth);
    const { chapters } = await book(19, auth);
    expect(chapters).toHaveLength(150);
    expect(chapters[22]!.verses).toEqual([2, 2, 2, 1, 1, 1]);
    expect(chapters[0]!.verses.every((n) => n === 1)).toBe(true);
    expect(chapters[1]!.verses.slice(0, 3)).toEqual([1, 1, 0]);
    expect(chapters.flatMap((c) => c.verses).reduce((a, b) => a + b)).toBe(6 + 3 + 6 + 2);
  });

  it('leaves out deleted commits and other users\' commits', async () => {
    const auth = await newGuest();
    await post('/api/commits', { text: 'gen 1:1' }, await newGuest());
    const { id } = await (await post('/api/commits', { text: 'gen 1:2' }, auth)).json();
    expect((await book(1, auth)).chapters[0]!.verses.slice(0, 3)).toEqual([0, 1, 0]);
    await app.request(`/api/commits/${id}`, { method: 'DELETE', headers: auth });
    expect((await book(1, auth)).chapters[0]!.verses.slice(0, 3)).toEqual([0, 0, 0]);
  });

  it('rejects unknown books and requires a guest token', async () => {
    const auth = await newGuest();
    for (const bad of [0, 67, 'genesis', 1.5]) {
      expect((await app.request(`/api/me/canon/${bad}`, { headers: auth })).status).toBe(400);
    }
    expect((await book(66, auth)).chapters).toHaveLength(22);
    expect((await app.request('/api/me/canon/1')).status).toBe(401);
  });
});

describe('Clerk sessions', () => {
  it('creates a row on a Clerk user\'s first authenticated request, and reuses it after', async () => {
    const res = await app.request('/api/me', { headers: signedIn('user_a') });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ timezone: 'UTC', modePref: null });

    await post('/api/commits', { text: 'john 3' }, signedIn('user_a'));
    expect(await list(signedIn('user_a'))).toMatchObject([{ display: 'John 3' }]);
    expect(await t.db.select({ clerkUserId: users.clerkUserId, guestTokenHash: users.guestTokenHash }).from(users)).toEqual([
      { clerkUserId: 'user_a', guestTokenHash: null },
    ]);
  });

  it('keeps each Clerk user\'s data separate', async () => {
    await post('/api/commits', { text: 'john 3' }, signedIn('user_a'));
    expect(await list(signedIn('user_b'))).toEqual([]);
  });

  it('rejects a session token that does not verify', async () => {
    expect((await app.request('/api/me', { headers: { Authorization: 'Bearer forged' } })).status).toBe(401);
    expect(await t.db.select().from(users)).toEqual([]);
  });
});

describe('POST /api/me/claim', () => {
  const claim = (clerkUserId: string, guestToken: string) => post('/api/me/claim', { guestToken }, signedIn(clerkUserId));

  it('adopts the guest row when the account has none: same commits, timezone, and prefs; the token stops working', async () => {
    const guest = await newGuest('America/Chicago');
    await post('/api/commits', { text: 'john 3' }, guest);
    const [before] = await t.db.select().from(users);

    expect((await claim('user_a', tokenOf(guest))).status).toBe(204);

    const rows = await t.db.select().from(users);
    expect(rows).toEqual([{ ...before, clerkUserId: 'user_a', guestTokenHash: null }]);
    expect(await list(signedIn('user_a'))).toMatchObject([{ display: 'John 3' }]);
    const me = await app.request('/api/me', { headers: signedIn('user_a') });
    expect(await me.json()).toEqual({ timezone: 'America/Chicago', modePref: null });
    expect((await app.request('/api/commits', { headers: guest })).status).toBe(401);
  });

  it('merges into an existing account: the guest\'s commits join the account\'s, the account\'s timezone wins, the guest row goes', async () => {
    await app.request('/api/me', { method: 'PATCH', body: JSON.stringify({ timezone: 'Asia/Tokyo', modePref: 'light' }), headers: { 'content-type': 'application/json', ...signedIn('user_a') } });
    await post('/api/commits', { text: 'gen 1', readOn: '2026-11-01' }, signedIn('user_a'));
    const guest = await newGuest('America/Chicago');
    await post('/api/commits', { text: 'john 3', readOn: '2026-11-02' }, guest);
    await app.request('/api/me', { method: 'PATCH', body: JSON.stringify({ modePref: 'dark' }), headers: { 'content-type': 'application/json', ...guest } });
    // A deleted guest commit moves too, and stays deleted.
    const gone = await (await post('/api/commits', { text: 'ruth', readOn: '2026-11-03' }, guest)).json();
    await app.request(`/api/commits/${gone.id}`, { method: 'DELETE', headers: guest });

    expect((await claim('user_a', tokenOf(guest))).status).toBe(204);

    expect(await t.db.select({ clerkUserId: users.clerkUserId, timezone: users.timezone, modePref: users.modePref }).from(users)).toEqual([
      { clerkUserId: 'user_a', timezone: 'Asia/Tokyo', modePref: 'light' },
    ]);
    expect((await list(signedIn('user_a'))).map((c) => c.display)).toEqual(['John 3', 'Genesis 1']);
    expect(await t.db.select().from(commits)).toHaveLength(3);
    expect(await t.db.select().from(commitRanges)).toHaveLength(3);
    expect((await app.request('/api/commits', { headers: guest })).status).toBe(401);
  });

  it('is a no-op for an unknown or already-claimed token', async () => {
    expect((await claim('user_a', 'never-issued')).status).toBe(204);
    expect(await t.db.select().from(users)).toEqual([]);

    const guest = await newGuest();
    await post('/api/commits', { text: 'john 3' }, guest);
    await claim('user_a', tokenOf(guest));
    const after = await t.db.select().from(users);

    // Again by the same account, and by a different one: nothing moves.
    expect((await claim('user_a', tokenOf(guest))).status).toBe(204);
    expect((await claim('user_b', tokenOf(guest))).status).toBe(204);
    expect(await t.db.select().from(users)).toEqual(after);
    expect(await list(signedIn('user_a'))).toHaveLength(1);
  });

  it('leaves other guests alone', async () => {
    const mine = await newGuest();
    const other = await newGuest();
    await post('/api/commits', { text: 'john 3' }, other);
    await claim('user_a', tokenOf(mine));
    expect(await list(other)).toMatchObject([{ display: 'John 3' }]);
    expect(await list(signedIn('user_a'))).toEqual([]);
  });

  it('requires a Clerk session, not a guest token', async () => {
    const guest = await newGuest();
    expect((await post('/api/me/claim', { guestToken: tokenOf(guest) }, guest)).status).toBe(401);
    expect((await post('/api/me/claim', { guestToken: tokenOf(guest) })).status).toBe(401);
    expect((await post('/api/me/claim', {}, signedIn('user_a'))).status).toBe(400);
  });
});
