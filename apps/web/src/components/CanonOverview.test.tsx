import { screen, waitFor, within } from '@testing-library/react';
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

describe('the book sheet', () => {
  const sheet = () => screen.getByRole('dialog');
  const chapterCells = () => within(sheet()).getAllByRole('button', { name: / · / });
  const chapterCell = (name: string) => within(sheet()).getByRole('button', { name: new RegExp(`^${name} · `) });
  /** Verse number → read count, from the verse strip. */
  const verseReads = () =>
    Object.fromEntries(
      [...within(sheet()).getByRole('img', { name: /verses of/ }).querySelectorAll('rect')].map((r) => [r.dataset.v, Number(r.dataset.reads)]),
    );
  const sheetStatus = () => screen.getByTestId('sheet-status');

  it('opens from a book name with a numbered cell per chapter, at the grid\'s depths', async () => {
    await readerOf('ruth 1', 'ruth 1', 'ruth 2:1-4', 'ruth 4');
    const user = userEvent.setup();
    renderPage(<CanonOverview />);
    await waitFor(() => expect(read()).toHaveProperty('Ruth 1'));

    await user.click(screen.getByRole('button', { name: 'open Ruth' }));
    expect(sheet()).toHaveAccessibleName('Ruth');
    expect(screen.getByTestId('book-sub')).toHaveTextContent('2 of 4 chapters read · 3 chapter-readings in all');
    expect(chapterCells().map((c) => [c.textContent, c.dataset.level])).toEqual([
      ['1', '3'],
      ['2', '1'],
      ['3', '0'],
      ['4', '2'],
    ]);
    expect(sheetStatus()).toHaveTextContent('tap a chapter to see its verses');
    expect(within(sheet()).queryByRole('img', { name: /verses of/ })).toBeNull();
  });

  it('shows which verses of a chapter were read and how often', async () => {
    await readerOf('ps 23', 'ps 23:1-2', 'ps 23:2');
    const user = userEvent.setup();
    renderPage(<CanonOverview />);
    await waitFor(() => expect(read()).toHaveProperty('Psalm 23'));

    await user.click(screen.getByRole('button', { name: 'open Psalms' }));
    expect(chapterCells()).toHaveLength(150);
    await user.click(chapterCell('Psalm 23'));
    expect(chapterCell('Psalm 23')).toHaveAttribute('aria-pressed', 'true');
    expect(sheetStatus()).toHaveTextContent('Psalm 23 · read 1×');
    await waitFor(() => expect(verseReads()).toEqual({ 1: 2, 2: 3, 3: 1, 4: 1, 5: 1, 6: 1 }));
    expect(screen.getByTestId('verse-sub')).toHaveTextContent('6 of 6 verses read');
    expect(server.requests).toEqual(['GET /api/me/canon', 'GET /api/me/canon/19']);

    await user.hover(within(sheet()).getByRole('img', { name: /verses of/ }).querySelector('[data-v="2"]')!);
    expect(sheetStatus()).toHaveTextContent('Psalm 23:2 · read 3×');

    await user.click(chapterCell('Psalm 24'));
    await waitFor(() => expect(screen.getByTestId('verse-sub')).toHaveTextContent('0 of 10 verses read'));
    expect(server.requests).toHaveLength(2);
  });

  it('opens on the tapped chapter\'s verses, from the grid', async () => {
    await readerOf('jude 1-3');
    const user = userEvent.setup();
    renderPage(<CanonOverview />);
    await waitFor(() => expect(read()).toEqual({ Jude: 1 }));
    setPointer('coarse');
    await user.pointer({ keys: '[TouchA]', target: cellFor('Jude') });
    expect(sheet()).toHaveAccessibleName('Jude');
    await waitFor(() => expect(screen.getByTestId('verse-sub')).toHaveTextContent('3 of 25 verses read'));
    await user.hover(within(sheet()).getByRole('img', { name: /verses of/ }).querySelector('[data-v="3"]')!);
    expect(sheetStatus()).toHaveTextContent('Jude 3 · read 1×');
  });

  it('closes on esc, the close button, and a tap outside, returning focus', async () => {
    const user = userEvent.setup();
    renderPage(<CanonOverview />);
    const genesis = screen.getByRole('button', { name: 'open Genesis' });

    genesis.focus();
    await user.keyboard('{Enter}');
    expect(sheet()).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(genesis).toHaveFocus();

    await user.click(genesis);
    await user.click(within(sheet()).getByRole('button', { name: 'close' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    setPointer('coarse');
    await user.pointer({ keys: '[TouchA]', target: genesis });
    await user.pointer({ keys: '[TouchA]', target: screen.getByTestId('scrim') });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('works by keyboard, and shows an unread book without fetching for a new visitor', async () => {
    const user = userEvent.setup();
    renderPage(<CanonOverview />);
    screen.getByRole('button', { name: 'open Ruth' }).focus();
    await user.keyboard(' ');
    expect(screen.getByTestId('book-sub')).toHaveTextContent('0 of 4 chapters read');
    await user.tab({ shift: true });
    expect(chapterCell('Ruth 4')).toHaveFocus();
    await user.tab();
    expect(within(sheet()).getByRole('button', { name: 'close' })).toHaveFocus();
    await user.tab();
    expect(chapterCell('Ruth 1')).toHaveFocus();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(chapterCell('Ruth 2')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('verse-sub')).toHaveTextContent('0 of 23 verses read');
    await new Promise((r) => setTimeout(r, 50));
    expect(server.requests).toEqual([]);
  });
});
