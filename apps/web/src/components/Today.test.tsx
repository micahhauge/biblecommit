import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderPage, useTestServer } from '@/test/harness';
import { api } from '@/api/client';
import { guestAuthorization, setGuestToken } from '@/guest';
import { NOW, setPointer } from '@/test/setup';
import { Today } from './Today';

const server = await useTestServer();

const input = () => screen.getByRole('textbox', { name: /what did you read/i });
const preview = () => screen.getByRole('status');
const recentList = () => screen.findByRole('list', { name: /recent commits/i });

/** The passages in the recent list, top to bottom. */
async function passages() {
  const list = await recentList();
  return within(list)
    .queryAllByRole('listitem')
    .map((li) => within(li).getByTestId('passage').textContent);
}

/** Commits each reading in turn through the input, waiting for each to land. */
async function commitAll(user: ReturnType<typeof userEvent.setup>, ...texts: string[]) {
  for (const text of texts) {
    const before = server.requests.length;
    await user.type(input(), `${text}{Enter}`);
    await waitFor(() => expect(server.requests.slice(before)).toContain('POST /api/commits'));
  }
}

describe('a first-time visitor', () => {
  it('sees example chips instead of history, and nothing is fetched', async () => {
    renderPage(<Today />);
    const chips = screen.getByRole('group', { name: /examples/i });
    expect(within(chips).getAllByRole('button').map((b) => b.textContent)).toEqual(['john 1', 'psalm 23', 'gen 1-3']);
    expect(screen.queryByRole('list', { name: /recent commits/i })).toBeNull();
    // Give any stray effects a chance to fire.
    await new Promise((r) => setTimeout(r, 50));
    expect(server.requests).toEqual([]);
  });
});

describe('the live preview', () => {
  it('updates as you type, before anything is committed', async () => {
    const user = userEvent.setup();
    renderPage(<Today />);
    await user.type(input(), 'john');
    expect(preview()).toHaveTextContent('✓ John · 879 verses · today');
    await user.type(input(), ' 3');
    expect(preview()).toHaveTextContent('✓ John 3 · 36 verses · today');
    await user.clear(input());
    await user.type(input(), 'hezekiah 1');
    expect(preview()).toHaveTextContent('? unknown book “hezekiah”');
    expect(server.requests).toEqual([]);
  });

  it('fills the input from an example chip', async () => {
    const user = userEvent.setup();
    renderPage(<Today />);
    await user.click(screen.getByRole('button', { name: 'gen 1-3' }));
    expect(input()).toHaveValue('gen 1-3');
    expect(input()).toHaveFocus();
    expect(preview()).toHaveTextContent('✓ Genesis 1–3 · 80 verses · today');
    expect(screen.queryByRole('group', { name: /examples/i })).toBeNull();
  });
});

describe('committing', () => {
  it('creates a guest on the first commit, then shows the commit in the recent list', async () => {
    const user = userEvent.setup();
    renderPage(<Today />);
    await user.type(input(), 'john 3{Enter}');

    const list = await screen.findByRole('list', { name: /recent commits/i });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1));
    expect(within(list).getByRole('listitem')).toHaveTextContent('todayJohn 3');
    expect(input()).toHaveValue('');
    expect(preview()).toHaveTextContent('committed.');
    expect(screen.queryByRole('group', { name: /examples/i })).toBeNull();
    expect(server.requests).toEqual(['POST /api/guests', 'POST /api/commits']);
  });

  it('reuses the guest for later commits', async () => {
    const user = userEvent.setup();
    renderPage(<Today />);
    await user.type(input(), 'john 3{Enter}');
    await screen.findByText('John 3');
    await user.type(input(), 'ruth{Enter}');
    await screen.findByText('Ruth');
    expect(server.requests.filter((r) => r === 'POST /api/guests')).toHaveLength(1);
  });

  it('survives a reload', async () => {
    const user = userEvent.setup();
    const first = renderPage(<Today />);
    await user.type(input(), 'psalm 23{Enter}');
    await screen.findByText('Psalm 23');
    first.unmount();

    renderPage(<Today />);
    const list = await screen.findByRole('list', { name: /recent commits/i });
    expect(await within(list).findByText('Psalm 23')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /examples/i })).toBeNull();
  });

  it('keeps the new guest when the first commit fails, so a retry does not create another', async () => {
    const user = userEvent.setup();
    renderPage(<Today />);
    server.failNext('POST /api/commits');
    await user.type(input(), 'john 3{Enter}');
    expect(await screen.findByText(/could not save/i)).toBeInTheDocument();
    expect(input()).toHaveValue('john 3');

    await user.type(input(), '{Enter}');
    expect(await screen.findByText('John 3')).toBeInTheDocument();
    expect(server.requests.filter((r) => r === 'POST /api/guests')).toHaveLength(1);
  });

  it('does not commit text that does not parse', async () => {
    const user = userEvent.setup();
    renderPage(<Today />);
    await user.type(input(), 'hezekiah 1{Enter}');
    expect(input()).toHaveValue('hezekiah 1');
    expect(server.requests).toEqual([]);
  });
});

describe('the keyboard', () => {
  it('esc clears the input', async () => {
    const user = userEvent.setup();
    renderPage(<Today />);
    await user.type(input(), 'john 3{Escape}');
    expect(input()).toHaveValue('');
    expect(preview()).toHaveTextContent('');
  });

  it('↑ recalls the last committed input', async () => {
    const user = userEvent.setup();
    renderPage(<Today />);
    await user.type(input(), 'gen 1-3{Enter}');
    await screen.findByText('Genesis 1–3');
    await user.type(input(), '{ArrowUp}');
    expect(input()).toHaveValue('gen 1-3');
  });

  it('focuses the input on desktop, and typing anywhere lands in it', async () => {
    const user = userEvent.setup();
    renderPage(<Today />);
    expect(input()).toHaveFocus();
    input().blur();
    await user.keyboard('j');
    expect(input()).toHaveFocus();
  });
});

describe('on a touch device', () => {
  it('does not auto-focus, and offers a commit button once the input parses', async () => {
    setPointer('coarse');
    const user = userEvent.setup();
    renderPage(<Today />);
    expect(input()).not.toHaveFocus();
    expect(screen.queryByRole('button', { name: /commit/i })).toBeNull();
    await user.type(input(), 'jude');
    await user.click(screen.getByRole('button', { name: /commit/i }));
    expect(await screen.findByText('Jude')).toBeInTheDocument();
  });
});

describe('deleting from the recent list', () => {
  it('asks inline before deleting; "no" keeps the row, "yes" removes it for good', async () => {
    const user = userEvent.setup();
    renderPage(<Today />);
    await commitAll(user, 'yesterday gen 1', 'gen 2');
    await waitFor(async () => expect(await passages()).toEqual(['Genesis 2', 'Genesis 1']));

    await user.click(screen.getByRole('button', { name: 'delete Genesis 1' }));
    const row = screen.getByText('Genesis 1').closest('li')!;
    expect(within(row).getByText('delete?')).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'no' }));
    expect(within(row).queryByText('delete?')).toBeNull();
    expect(await passages()).toEqual(['Genesis 2', 'Genesis 1']);
    expect(server.requests.some((r) => r.startsWith('DELETE'))).toBe(false);

    await user.click(screen.getByRole('button', { name: 'delete Genesis 1' }));
    await user.click(within(row).getByRole('button', { name: 'yes' }));
    expect(await passages()).toEqual(['Genesis 2']);
    await waitFor(() => expect(server.requests.filter((r) => r.startsWith('DELETE'))).toHaveLength(1));
  });

  it('puts the row back and says so when the delete fails', async () => {
    const user = userEvent.setup();
    renderPage(<Today />);
    await commitAll(user, 'yesterday gen 1', 'gen 2');
    await waitFor(async () => expect(await passages()).toEqual(['Genesis 2', 'Genesis 1']));

    server.failNext('DELETE /api/commits');
    await user.click(screen.getByRole('button', { name: 'delete Genesis 1' }));
    await user.click(screen.getByRole('button', { name: 'yes' }));
    expect(await screen.findByText(/could not delete/i)).toBeInTheDocument();
    expect(await passages()).toEqual(['Genesis 2', 'Genesis 1']);
  });
});

describe('undo', () => {
  const undo = () => screen.queryByRole('button', { name: 'undo' });

  it('offers undo right after a commit, and undoing deletes it', async () => {
    const user = userEvent.setup();
    renderPage(<Today />);
    await commitAll(user, 'yesterday gen 1', 'gen 2');
    await waitFor(async () => expect(await passages()).toEqual(['Genesis 2', 'Genesis 1']));

    await user.click(await screen.findByRole('button', { name: 'undo' }));
    expect(await passages()).toEqual(['Genesis 1']);
    expect(undo()).toBeNull();
    await waitFor(() => expect(server.requests.filter((r) => r.startsWith('DELETE'))).toHaveLength(1));
  });

  it('goes away after about 6 seconds', async () => {
    // Fake timers that still run in real time, so we can jump ahead without stalling the API.
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true, now: NOW });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage(<Today />);
    await commitAll(user, 'gen 1');
    await screen.findByRole('button', { name: 'undo' });

    await act(() => vi.advanceTimersByTimeAsync(4000));
    expect(undo()).not.toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(2500));
    expect(undo()).toBeNull();
    expect(await passages()).toEqual(['Genesis 1']);
  });

  it('only ever undoes the latest commit; committing again replaces it', async () => {
    const user = userEvent.setup();
    renderPage(<Today />);
    await commitAll(user, 'yesterday gen 1');
    await screen.findByRole('button', { name: 'undo' });
    await commitAll(user, 'gen 2');
    await waitFor(async () => expect(await passages()).toEqual(['Genesis 2', 'Genesis 1']));

    expect(screen.getAllByRole('button', { name: 'undo' })).toHaveLength(1);
    expect(screen.getByText('Genesis 2 committed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'undo' }));
    expect(await passages()).toEqual(['Genesis 1']);
  });
});

describe('load more', () => {
  /** Commits straight through the API as a returning guest would have, one per day going back. */
  async function seedCommits(count: number) {
    const { data } = await api.POST('/api/guests', { body: { timezone: 'America/Chicago' } });
    const token = data!.token;
    for (let i = 0; i < count; i++) {
      const readOn = new Date(Date.UTC(2026, 10, 9 - i)).toISOString().slice(0, 10);
      await api.POST('/api/commits', { body: { text: `gen ${i + 1}`, readOn }, headers: { authorization: guestAuthorization(token) } });
    }
    setGuestToken(token);
    server.requests.length = 0;
  }

  it('shows the latest 10, then the rest on "load more"', async () => {
    await seedCommits(12);
    const user = userEvent.setup();
    renderPage(<Today />);
    await waitFor(async () => expect(await passages()).toHaveLength(10));
    expect((await passages())[0]).toBe('Genesis 1');

    await user.click(screen.getByRole('button', { name: 'load more' }));
    await waitFor(async () => expect(await passages()).toHaveLength(12));
    expect((await passages()).at(-1)).toBe('Genesis 12');
    expect(screen.queryByRole('button', { name: 'load more' })).toBeNull();
    expect(server.requests).toEqual(['GET /api/commits', 'GET /api/commits']);
  });

  it('has no "load more" when everything fits', async () => {
    await seedCommits(3);
    renderPage(<Today />);
    await waitFor(async () => expect(await passages()).toHaveLength(3));
    expect(screen.queryByRole('button', { name: 'load more' })).toBeNull();
  });
});
