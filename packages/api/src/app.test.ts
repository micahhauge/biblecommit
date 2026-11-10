import { createTestDb } from '@biblecommit/db/testing';
import { commitRanges, users } from '@biblecommit/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createDbDeps } from './deps';

const t = await createTestDb();
afterAll(() => t.close());
beforeEach(() => t.reset());

// 03:00 UTC on Nov 10 is still the evening of Nov 9 in Chicago.
let now = new Date('2026-11-10T03:00:00Z');
const app = createApp(createDbDeps(t.db), { now: () => now });
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
    expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining(['/api/canon/totals', '/api/guests', '/api/commits']));
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

  it('requires a valid guest token', async () => {
    expect((await post('/api/commits', { text: 'john 3' })).status).toBe(401);
    expect((await post('/api/commits', { text: 'john 3' }, { Authorization: 'Guest not-a-real-token' })).status).toBe(401);
    expect((await post('/api/commits', { text: 'john 3' }, { Authorization: 'Bearer something' })).status).toBe(401);
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

  it('requires a valid guest token', async () => {
    expect((await app.request('/api/commits')).status).toBe(401);
  });
});
