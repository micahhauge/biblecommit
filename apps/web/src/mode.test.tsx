import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/api/client';
import { ModeToggle, Settings } from '@/components/ModeControls';
import { guestAuthorization, setGuestToken } from '@/guest';
import { ModeSync } from '@/mode';
import { parseModePref } from '@/mode-pref';
import { renderPage, signInAs, useTestServer } from '@/test/harness';

const server = await useTestServer();

const shown = () => document.documentElement.dataset.mode;
const cookie = () => document.cookie.match(/(?:^|; )mode=([^;]*)/)?.[1];

/** The chrome as the layout renders it for a browser whose cookie says `mode`. */
function renderChrome(mode: 'system' | 'dark' | 'light' = 'dark') {
  document.documentElement.dataset.mode = mode;
  return renderPage(
    <>
      <ModeSync />
      <ModeToggle initial={mode} />
      <Settings initial={mode} />
    </>,
  );
}

async function guestWithMode(modePref?: 'system' | 'dark' | 'light') {
  const { data } = await api.POST('/api/guests', { body: { timezone: 'America/Chicago' } });
  const headers = { authorization: guestAuthorization(data!.token) };
  if (modePref) await api.PATCH('/api/me', { body: { modePref }, headers });
  setGuestToken(data!.token);
  server.requests.length = 0;
  return headers;
}

async function storedMode(headers: Record<string, string>) {
  return (await api.GET('/api/me', { headers })).data?.modePref;
}

beforeEach(() => {
  document.cookie = 'mode=; max-age=0; path=/';
});

describe('the default', () => {
  it('is system until a mode is chosen (no cookie, or an unknown value)', () => {
    expect(parseModePref(undefined)).toBe('system');
    expect(parseModePref('sepia')).toBe('system');
    expect(parseModePref('light')).toBe('light');
  });
});

describe('the mode toggle', () => {
  it('flips dark and light, and remembers it in a cookie, without calling the API for a visitor', async () => {
    const user = userEvent.setup();
    renderChrome('dark');

    await user.click(screen.getByRole('button', { name: 'switch to light mode' }));
    expect(shown()).toBe('light');
    expect(cookie()).toBe('light');

    await user.click(screen.getByRole('button', { name: 'switch to dark mode' }));
    expect(shown()).toBe('dark');
    expect(cookie()).toBe('dark');
    expect(server.requests).toEqual([]);
  });

  it('treats "system" as what it shows: dark when the device states no preference', async () => {
    renderChrome('system');
    expect(screen.getByRole('button', { name: 'switch to light mode' })).toBeInTheDocument();
  });
});

describe('the settings sheet', () => {
  it('chooses system, dark, or light', async () => {
    const user = userEvent.setup();
    renderChrome('dark');
    await user.click(screen.getByRole('button', { name: 'settings' }));
    const modes = within(screen.getByRole('dialog', { name: 'Settings' })).getByRole('group', { name: 'mode' });
    expect(within(modes).getByRole('button', { name: 'dark' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(modes).getByRole('button', { name: 'system' }));
    expect(shown()).toBe('system');
    expect(cookie()).toBe('system');
    expect(within(modes).getByRole('button', { name: 'system' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(modes).getByRole('button', { name: 'dark' })).toHaveAttribute('aria-pressed', 'false');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('syncing with the stored preference', () => {
  it('stores a change for a user with a row, so it follows them to other devices', async () => {
    const headers = await guestWithMode('dark');
    const user = userEvent.setup();
    renderChrome('dark');

    await user.click(screen.getByRole('button', { name: 'switch to light mode' }));

    await waitFor(async () => expect(await storedMode(headers)).toBe('light'));
  });

  it('applies the stored mode on load when this browser shows another', async () => {
    await guestWithMode('light');
    renderChrome('dark');
    await waitFor(() => expect(shown()).toBe('light'));
    expect(cookie()).toBe('light');
    expect(screen.getByRole('button', { name: 'switch to dark mode' })).toBeInTheDocument();
  });

  it('stores this browser\'s mode when none is stored yet', async () => {
    const headers = await guestWithMode();
    renderChrome('light');
    await waitFor(async () => expect(await storedMode(headers)).toBe('light'));
    expect(shown()).toBe('light');
  });

  it('switches to the account\'s mode on sign-in', async () => {
    await api.PATCH('/api/me', { body: { modePref: 'light' }, headers: { authorization: 'Bearer clerk:user_a' } });
    const { client } = renderChrome('dark');

    await signInAs('user_a', client);

    await waitFor(() => expect(shown()).toBe('light'));
  });
});
