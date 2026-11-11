import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { api } from '@/api/client';
import { guestAuthorization, setGuestToken } from '@/guest';
import { renderPage, useTestServer } from '@/test/harness';
import { TimezoneSync } from './me';

const server = await useTestServer();

/** A guest created elsewhere, in `timezone`, now loading in this browser (America/Chicago). */
async function guestFrom(timezone: string) {
  const { data } = await api.POST('/api/guests', { body: { timezone } });
  setGuestToken(data!.token);
  server.requests.length = 0;
  return { authorization: guestAuthorization(data!.token) };
}

describe('timezone sync on load', () => {
  it('sends the browser timezone when it differs from the stored one', async () => {
    const headers = await guestFrom('Asia/Tokyo');
    renderPage(<TimezoneSync />);
    await waitFor(() => expect(server.requests).toEqual(['GET /api/me', 'PATCH /api/me']));
    const { data } = await api.GET('/api/me', { headers });
    expect(data).toMatchObject({ timezone: 'America/Chicago' });
  });

  it('sends nothing when they match', async () => {
    await guestFrom('America/Chicago');
    renderPage(<TimezoneSync />);
    await waitFor(() => expect(server.requests).toEqual(['GET /api/me']));
    await new Promise((r) => setTimeout(r, 50));
    expect(server.requests).toEqual(['GET /api/me']);
  });

  it('fetches nothing before there is a guest', async () => {
    renderPage(<TimezoneSync />);
    await new Promise((r) => setTimeout(r, 50));
    expect(server.requests).toEqual([]);
  });
});
