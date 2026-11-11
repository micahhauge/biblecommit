import { users } from '@biblecommit/db';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { api } from '@/api/client';
import { Today } from '@/components/Today';
import { getGuestToken } from '@/guest';
import { renderPage, signInAs, signOut, useTestServer } from '@/test/harness';

const server = await useTestServer();

const input = () => screen.getByRole('textbox', { name: /what did you read/i });
const nudge = () => screen.queryByRole('note');

async function passages() {
  const list = await screen.findByRole('list', { name: /recent commits/i });
  return within(list)
    .queryAllByRole('listitem')
    .map((li) => within(li).getByTestId('passage').textContent);
}

async function commit(user: ReturnType<typeof userEvent.setup>, text: string) {
  const before = server.requests.length;
  await user.type(input(), `${text}{Enter}`);
  await waitFor(() => expect(server.requests.slice(before)).toContain('POST /api/commits'));
}

/** An account that already has data, from another device. */
async function existingAccount(clerkUserId: string, text: string) {
  const headers = { authorization: `Bearer clerk:${clerkUserId}` };
  await api.POST('/api/commits', { body: { text, readOn: '2026-11-01' }, headers });
  server.requests.length = 0;
}

describe('signing in', () => {
  it('claims the guest before anything else, so a new account adopts it, then drops the token', async () => {
    const user = userEvent.setup();
    const { client } = renderPage(<Today />);
    await commit(user, 'john 3');
    await waitFor(async () => expect(await passages()).toEqual(['John 3']));
    server.requests.length = 0;

    await signInAs('user_a', client);

    expect(server.requests[0]).toBe('POST /api/me/claim');
    expect(getGuestToken()).toBeNull();
    await waitFor(async () => expect(await passages()).toEqual(['John 3']));
    expect(await server.db.select({ clerkUserId: users.clerkUserId, guestTokenHash: users.guestTokenHash }).from(users)).toEqual([
      { clerkUserId: 'user_a', guestTokenHash: null },
    ]);
  });

  it('merges the guest\'s commits into an existing account', async () => {
    await existingAccount('user_a', 'gen 1');
    const user = userEvent.setup();
    const { client } = renderPage(<Today />);
    await commit(user, 'john 3');
    // The guest token is stored once the commit lands; sign in only after that.
    await waitFor(async () => expect(await passages()).toEqual(['John 3']));

    await signInAs('user_a', client);

    await waitFor(async () => expect(await passages()).toEqual(['John 3', 'Genesis 1']));
    expect(await server.db.select().from(users)).toHaveLength(1);
  });

  it('claims nothing without a guest, and commits go straight to the account', async () => {
    await existingAccount('user_a', 'gen 1');
    const user = userEvent.setup();
    const { client } = renderPage(<Today />);
    await signInAs('user_a', client);
    await waitFor(async () => expect(await passages()).toEqual(['Genesis 1']));

    await commit(user, 'john 3');

    await waitFor(async () => expect(await passages()).toEqual(['John 3', 'Genesis 1']));
    expect(server.requests).not.toContain('POST /api/me/claim');
    expect(server.requests).not.toContain('POST /api/guests');
    expect(getGuestToken()).toBeNull();
  });
});

describe('signing out', () => {
  it('leaves a fresh, empty guest with no way back to the account\'s data', async () => {
    const user = userEvent.setup();
    const { client } = renderPage(<Today />);
    await commit(user, 'john 3');
    await signInAs('user_a', client);
    await waitFor(async () => expect(await passages()).toEqual(['John 3']));

    await signOut(client);

    expect(await screen.findByRole('group', { name: /examples/i })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /recent commits/i })).toBeNull();
    expect(screen.getByTestId('streak')).toHaveTextContent('0');
    expect(getGuestToken()).toBeNull();

    // The next commit starts a new guest that sees only its own.
    server.requests.length = 0;
    await commit(user, 'ruth 1');
    expect(server.requests).toContain('POST /api/guests');
    await waitFor(async () => expect(await passages()).toEqual(['Ruth 1']));
  });
});

describe('the sign-in nudge', () => {
  it('appears under the streak after a guest\'s first commit, and stays gone once dismissed', async () => {
    const user = userEvent.setup();
    const first = renderPage(<Today />);
    expect(nudge()).toBeNull();

    await commit(user, 'john 3');
    expect(await screen.findByRole('note')).toHaveTextContent(/sign in to save/);

    await user.click(screen.getByRole('button', { name: 'dismiss' }));
    expect(nudge()).toBeNull();

    // Not on the next load either.
    first.unmount();
    renderPage(<Today />);
    await screen.findByRole('list', { name: /recent commits/i });
    expect(nudge()).toBeNull();
  });

  it('is never shown when signed in', async () => {
    const user = userEvent.setup();
    const { client } = renderPage(<Today />);
    await commit(user, 'john 3');
    await screen.findByRole('note');

    await signInAs('user_a', client);

    expect(nudge()).toBeNull();
  });
});
