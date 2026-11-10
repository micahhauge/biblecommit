import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderPage, useTestServer } from '@/test/harness';
import { setPointer } from '@/test/setup';
import { Today } from './Today';

const server = await useTestServer();

const input = () => screen.getByRole('textbox', { name: /what did you read/i });
const preview = () => screen.getByRole('status');

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
    await waitFor(() => expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['todayJohn 3']));
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
