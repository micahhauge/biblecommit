import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { api } from '@/api/client';
import { guestAuthorization, setGuestToken } from '@/guest';
import { renderPage, useTestServer } from '@/test/harness';
import { setPointer } from '@/test/setup';
import { CanonOverview } from './CanonOverview';

const server = await useTestServer();

const grid = () => screen.getByRole('img', { name: /every chapter of the bible/i });
const cells = () => [...grid().querySelectorAll('rect')];
const cellFor = (name: string) => cells().find((c) => c.querySelector('title')!.textContent!.startsWith(`${name} ·`))!;
/** Chapter → depth, for every chapter with any reading. */
const read = () =>
  Object.fromEntries(
    cells()
      .filter((c) => c.dataset.level !== '0')
      .map((c) => [c.querySelector('title')!.textContent!.split(' · ')[0], Number(c.dataset.level)]),
  );
const status = () => screen.getByTestId('canon-status');

/** A guest who has committed these readings, now loading the page in this browser. */
async function readerOf(...texts: string[]) {
  const { data } = await api.POST('/api/guests', { body: { timezone: 'America/Chicago' } });
  const authorization = guestAuthorization(data!.token);
  for (const text of texts) await api.POST('/api/commits', { body: { text }, headers: { authorization } });
  setGuestToken(data!.token);
  server.requests.length = 0;
}

describe('the canon', () => {
  it('is empty for a new visitor, without fetching', async () => {
    renderPage(<CanonOverview />);
    expect(screen.getByTestId('coverage')).toHaveTextContent('0%');
    expect(screen.getByTestId('coverage-sub')).toHaveTextContent('1,189 chapters await');
    expect(screen.getByText(/nothing read yet/i)).toBeInTheDocument();
    expect(cells()).toHaveLength(1189);
    expect(read()).toEqual({});
    expect(screen.queryByTestId('read-again')).toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    expect(server.requests).toEqual([]);
  });

  it('shows coverage and shades chapters by depth, with partly read lighter than 1×', async () => {
    await readerOf('gen 12', 'john 3', 'john 3', 'ps 23:1-3', 'jude', 'jude', 'jude');
    renderPage(<CanonOverview />);
    await waitFor(() => expect(screen.getByTestId('coverage')).toHaveTextContent('0.3%'));
    expect(screen.getByTestId('coverage-sub')).toHaveTextContent('3 of 1,189 chapters');
    expect(screen.getByTestId('read-again')).toHaveTextContent(/2 chapters\s*read more than once/);
    expect(screen.queryByText(/nothing read yet/i)).toBeNull();
    expect(read()).toEqual({ 'Genesis 12': 2, 'Psalm 23': 1, 'John 3': 3, Jude: 4 });
    expect(server.requests).toEqual(['GET /api/me/canon']);
  });

  it('groups books into sections, in canonical order', async () => {
    renderPage(<CanonOverview />);
    const labels = [...grid().querySelectorAll('text')].map((t) => t.textContent);
    const sections = ['law', 'history', 'wisdom & poetry', 'major prophets', 'minor prophets', 'gospels & acts', 'epistles', 'apocalypse'];
    expect(labels.filter((l) => sections.includes(l!))).toEqual(sections);
    expect(labels.indexOf('law')).toBeLessThan(labels.indexOf('Genesis'));
    expect(labels.indexOf('Malachi')).toBeLessThan(labels.indexOf('gospels & acts'));
    expect(labels.at(-1)).toBe('Revelation');
  });

  it('names a chapter and how often it was read, on hover and on tap', async () => {
    await readerOf('gen 12', 'gen 12', 'gen 13:1-4');
    const user = userEvent.setup();
    renderPage(<CanonOverview />);
    await waitFor(() => expect(read()).toEqual({ 'Genesis 12': 3, 'Genesis 13': 1 }));

    await user.hover(cellFor('Genesis 12'));
    expect(status()).toHaveTextContent('Genesis 12 · read 2×');
    await user.hover(cellFor('Genesis 13'));
    expect(status()).toHaveTextContent('Genesis 13 · partly read');
    await user.unhover(grid());
    expect(status()).toHaveTextContent(/^\s*$/);

    setPointer('coarse');
    await user.pointer({ keys: '[TouchA]', target: cellFor('Psalm 23') });
    expect(status()).toHaveTextContent('Psalm 23 · not yet read');
  });
});
