import { createApp, createDbDeps } from '@biblecommit/api';
import { createTestDb } from '@biblecommit/db/testing';
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterAll, beforeEach, vi } from 'vitest';
import { createQueryClient } from '@/query-client';

/**
 * The real API (routes, validation, SQL) on an in-memory Postgres, served to the
 * UI through a stubbed `fetch`. Call once at the top of a test file.
 *
 * `requests` records every API call as "METHOD /path", so tests can assert on
 * network behavior (e.g. "nothing is fetched before the first commit").
 */
export async function useTestServer() {
  const t = await createTestDb();
  const app = createApp(createDbDeps(t.db));
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
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
