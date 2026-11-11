import { createApp, createDbDeps } from '@biblecommit/api';
import { createTestDb } from '@biblecommit/db/testing';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterAll, afterEach, beforeEach, vi } from 'vitest';
import { createQueryClient } from '@/query-client';
import { endSession, startSession } from '@/session';

/**
 * The real API (routes, validation, SQL) on an in-memory Postgres, served to the
 * UI through a stubbed `fetch`. Call once at the top of a test file.
 *
 * `requests` records every API call as "METHOD /path", so tests can assert on
 * network behavior (e.g. "nothing is fetched before the first commit").
 */
export async function useTestServer() {
  const t = await createTestDb();
  // Stands in for Clerk: a session JWT here is "clerk:<clerk user id>".
  const app = createApp(createDbDeps(t.db), { verifySession: async (jwt) => jwt.match(/^clerk:(.+)$/)?.[1] });
  const requests: string[] = [];
  const failures = new Set<string>();

  beforeEach(async () => {
    await t.reset();
    requests.length = 0;
    failures.clear();
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      const call = `${req.method} ${new URL(req.url).pathname}`;
      requests.push(call);
      const failure = [...failures].find((f) => call === f || call.startsWith(`${f}/`));
      if (failure) {
        failures.delete(failure);
        throw new TypeError('Failed to fetch');
      }
      return app.request(req);
    });
  });
  afterAll(() => t.close());
  // The session store is module state; leave every test signed out.
  afterEach(() => endSession(createQueryClient()));

  return {
    db: t.db,
    requests,
    /**
     * Make the next matching call fail as if the network dropped. Matches the exact call
     * ("POST /api/commits") or anything under it ("DELETE /api/commits" matches "DELETE /api/commits/<id>").
     */
    failNext: (call: string) => failures.add(call),
  };
}

/** Renders UI the way the app does, with a fresh query cache (as after a page load). */
export function renderPage(ui: ReactElement) {
  // Same settings as the app, minus retries so failures surface immediately.
  const client = createQueryClient({ retry: false });
  return { ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>), client };
}

/** What Clerk reports on sign-in, as the app's Clerk bridge would pass it on. */
export function signInAs(clerkUserId: string, client: QueryClient) {
  return act(() => startSession({ getToken: async () => `clerk:${clerkUserId}` }, client));
}

/** What Clerk reports on sign-out. */
export function signOut(client: QueryClient) {
  return act(() => endSession(client));
}
