import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { api } from '@/api/client';
import { guestAuthorization, setGuestToken } from '@/guest';
import { renderPage, useTestServer } from '@/test/harness';
import { CanonOverview } from './CanonOverview';
import { Today } from './Today';

const server = await useTestServer();

const notesOnToday = () => screen.getByRole('region', { name: 'notes' });
const editor = () => ({
  /** "verses" when nothing was read that day, "other verses" beside the reading chips. */
  verses: screen.getByRole('textbox', { name: /^(other )?verses$/ }),
  body: screen.getByRole('textbox', { name: 'note' }),
  save: screen.getByRole('button', { name: /^save/ }),
});
/** The reading chips in the open editor (within `container`), as "passage" or "✓ passage" when selected. */
const chips = (container: HTMLElement = document.body) =>
  within(within(container).getByRole('group', { name: 'verses read that day' }))
    .getAllByRole('button')
    .map((b) => `${b.getAttribute('aria-pressed') === 'true' ? '✓ ' : ''}${b.textContent}`);
/** The titles of the notes listed in a container, top to bottom. */
const titles = (container: HTMLElement) =>
  within(container)
    .queryAllByRole('listitem')
    .map((li) => li.getAttribute('aria-label'));

/** A guest with these commits and notes (today unless dated), loading the page in this browser. */
async function guestWith({ commits = [], notes = [] }: { commits?: string[]; notes?: Array<{ body: string; verses?: string; writtenOn?: string }> }) {
  const { data } = await api.POST('/api/guests', { body: { timezone: 'America/Chicago' } });
  const authorization = guestAuthorization(data!.token);
  for (const text of commits) await api.POST('/api/commits', { body: { text }, headers: { authorization } });
  for (const note of notes) await api.POST('/api/notes', { body: note, headers: { authorization } });
  setGuestToken(data!.token);
  server.requests.length = 0;
}

describe('writing a note on Today', () => {
  it('lets a first-time visitor write one, creating the guest, and renders the markdown', async () => {
    const user = userEvent.setup();
    renderPage(<Today />);
    await user.click(screen.getByRole('button', { name: '+ note' }));
    await user.type(editor().verses, 'rom 8:28-30');
    expect(screen.getByTestId('note-verses-preview')).toHaveTextContent('✓ Romans 8:28–30');
    await user.type(editor().body, '# Called{Enter}all things **together**');
    await user.click(editor().save);

    const list = await screen.findByRole('list', { name: 'notes on 2026-11-09' });
    expect(titles(list)).toEqual(['Called']);
    expect(within(list).getByRole('heading', { name: 'Called' })).toBeInTheDocument();
    expect(within(list).getByText('together').tagName).toBe('STRONG');
    expect(within(list).getByText('Romans 8:28–30')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'note' })).toBeNull();
    expect(server.requests.slice(0, 2)).toEqual(['POST /api/guests', 'POST /api/notes']);
    // Writing a note isn't reading: no streak.
    expect(await screen.findByText(/nothing committed yet today/i)).toBeInTheDocument();
  });

  it('saves with ⌘/ctrl+enter, and esc cancels without closing anything else', async () => {
    await guestWith({});
    const user = userEvent.setup();
    renderPage(<Today />);
    await user.click(screen.getByRole('button', { name: '+ note' }));
    await user.type(editor().body, 'thrown away');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: 'note' })).toBeNull();

    await user.click(screen.getByRole('button', { name: '+ note' }));
    expect(editor().body).toHaveValue('');
    await user.type(editor().body, 'kept');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(titles(screen.getByRole('list', { name: 'notes on 2026-11-09' }))).toEqual(['kept']));
  });

  it('blocks saving while the verses don\'t parse, or name a date', async () => {
    await guestWith({});
    const user = userEvent.setup();
    renderPage(<Today />);
    await user.click(screen.getByRole('button', { name: '+ note' }));
    await user.type(editor().body, 'hello');
    await user.type(editor().verses, 'jud 1');
    expect(screen.getByTestId('note-verses-preview')).toHaveTextContent('? Judges or Jude?');
    expect(editor().save).toBeDisabled();
    await user.clear(editor().verses);
    await user.type(editor().verses, 'yesterday rom 8');
    expect(screen.getByTestId('note-verses-preview')).toHaveTextContent('notes take their day from where you write them');
    expect(editor().save).toBeDisabled();
    await user.clear(editor().verses);
    expect(editor().save).toBeEnabled();
    expect(server.requests.filter((r) => r.startsWith('POST'))).toEqual([]);
  });

  it('keeps an unsaved draft across a reload', async () => {
    await guestWith({});
    const user = userEvent.setup();
    const page = renderPage(<Today />);
    await user.click(screen.getByRole('button', { name: '+ note' }));
    await user.type(editor().verses, 'ps 23');
    await user.type(editor().body, 'half a thought');
    page.unmount();

    renderPage(<Today />);
    await user.click(screen.getByRole('button', { name: '+ note' }));
    expect(editor().body).toHaveValue('half a thought');
    expect(editor().verses).toHaveValue('ps 23');
  });

  it('never renders raw HTML, and opens links in a new tab', async () => {
    await guestWith({ notes: [{ body: 'see <img src=x onerror="alert(1)"> [this](https://example.com) <b>bold</b>' }] });
    renderPage(<Today />);
    const list = await screen.findByRole('list', { name: 'notes on 2026-11-09' });
    expect(list.querySelector('img, b, script')).toBeNull();
    const link = within(list).getByRole('link', { name: 'this' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

describe('editing and deleting notes', () => {
  it('edits a note\'s body and verses in place', async () => {
    await guestWith({ notes: [{ body: 'first draft', verses: 'gen 1' }] });
    const user = userEvent.setup();
    renderPage(<Today />);
    await user.click(await screen.findByRole('button', { name: 'edit first draft' }));
    expect(editor().verses).toHaveValue('gen 1');
    await user.clear(editor().body);
    await user.type(editor().body, 'second draft');
    await user.clear(editor().verses);
    await user.type(editor().verses, 'ex 3');
    await user.click(editor().save);
    const list = screen.getByRole('list', { name: 'notes on 2026-11-09' });
    await waitFor(() => expect(titles(list)).toEqual(['second draft']));
    expect(within(list).getByText('Exodus 3')).toBeInTheDocument();
  });

  it('deletes after an inline confirm, and undo brings it back', async () => {
    await guestWith({ notes: [{ body: 'keep me' }, { body: 'drop me' }] });
    const user = userEvent.setup();
    renderPage(<Today />);
    await user.click(await screen.findByRole('button', { name: 'delete drop me' }));
    await user.click(screen.getByRole('button', { name: 'yes' }));
    const list = screen.getByRole('list', { name: 'notes on 2026-11-09' });
    expect(titles(list)).toEqual(['keep me']);
    await waitFor(() => expect(server.requests.some((r) => r.startsWith('DELETE /api/notes/'))).toBe(true));
    await user.click(screen.getByRole('button', { name: 'undo' }));
    // Both were written in the same instant, so their order is a tie.
    await waitFor(() => expect(titles(screen.getByRole('list', { name: 'notes on 2026-11-09' })).sort()).toEqual(['drop me', 'keep me']));
  });
});

describe('notes from commits and other days', () => {
  it('offers each of the day\'s readings as a chip, all selected; one click leaves one out', async () => {
    await guestWith({ commits: ['john 3:16-18', 'gen 1', 'gen 2-3', 'yesterday ps 1'] });
    const user = userEvent.setup();
    renderPage(<Today />);
    await screen.findByText(/committed today/i);
    await user.click(screen.getByRole('button', { name: '+ note' }));
    // Commits in the same instant (the test clock is frozen) tie on order, so compare sorted.
    expect(chips().sort()).toEqual(['✓ Genesis 1', '✓ Genesis 2–3', '✓ John 3:16–18']);
    expect(editor().verses).toHaveValue('');
    expect(editor().body).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Genesis 1' }));
    expect(chips().sort()).toEqual(['Genesis 1', '✓ Genesis 2–3', '✓ John 3:16–18']);
    await user.type(editor().verses, 'isa 53');
    await user.type(editor().body, 'just a thought');
    await user.click(editor().save);
    const list = await within(notesOnToday()).findByRole('list');
    await waitFor(() => expect(titles(list)).toEqual(['just a thought']));
    expect(within(list).getByText('Genesis 2–3; Isaiah 53; John 3:16–18')).toBeInTheDocument();

    // Editing shows the same chips: the note's readings selected, the rest as other verses.
    await user.click(screen.getByRole('button', { name: 'edit just a thought' }));
    expect(chips().sort()).toEqual(['Genesis 1', '✓ Genesis 2–3', '✓ John 3:16–18']);
    expect(editor().verses).toHaveValue('Isaiah 53');
    await user.keyboard('{Escape}');

    // A past day's sheet offers that day's readings.
    await user.click(screen.getByRole('button', { name: 'open yesterday' }));
    const sheet = screen.getByRole('dialog', { name: 'yesterday' });
    await within(sheet).findByRole('list', { name: 'read on 2026-11-08' });
    await user.click(within(sheet).getByRole('button', { name: '+ note' }));
    expect(chips(sheet)).toEqual(['✓ Psalm 1']);
  });

  it('starts with no verses when nothing was read, and a draft beats the default', async () => {
    await guestWith({});
    const user = userEvent.setup();
    const page = renderPage(<Today />);
    await screen.findByText(/nothing committed yet today/i);
    await user.click(screen.getByRole('button', { name: '+ note' }));
    expect(editor().verses).toHaveValue('');
    await user.type(editor().verses, 'isa 53');
    page.unmount();

    await api.POST('/api/commits', { body: { text: 'john 1' } });
    renderPage(<Today />);
    await screen.findByText(/committed today/i);
    await user.click(screen.getByRole('button', { name: '+ note' }));
    expect(chips()).toEqual(['John 1']);
    expect(editor().verses).toHaveValue('isa 53');
  });

  it('starts a note from today\'s commit with its verses filled in', async () => {
    await guestWith({ commits: ['yesterday ps 1', 'john 3:16-18'] });
    const user = userEvent.setup();
    renderPage(<Today />);
    await user.click(await screen.findByRole('button', { name: 'note on John 3:16–18' }));
    expect(chips()).toEqual(['✓ John 3:16–18']);
    expect(editor().verses).toHaveValue('');
    expect(editor().body).toHaveFocus();
    await user.type(editor().body, 'so loved');
    await user.click(editor().save);
    await waitFor(() => expect(titles(within(notesOnToday()).getByRole('list'))).toEqual(['so loved']));
  });

  it('opens a past day from a commit\'s date, with what was read and its notes', async () => {
    await guestWith({ commits: ['yesterday ps 1', 'yesterday ps 2'], notes: [{ body: 'blessed is the man', writtenOn: '2026-11-08' }] });
    const user = userEvent.setup();
    renderPage(<Today />);
    await user.click(await screen.findByRole('button', { name: 'open yesterday, has notes' }));
    const sheet = screen.getByRole('dialog', { name: 'yesterday' });
    expect(within(sheet).getByText(/sunday, november 8, 2026/)).toBeInTheDocument();
    const read = await within(sheet).findByRole('list', { name: 'read on 2026-11-08' });
    await waitFor(() => expect(within(read).getAllByTestId('passage').map((p) => p.textContent).sort()).toEqual(['Psalm 1', 'Psalm 2']));

    // A reading's "note" starts a note in the sheet with its passage.
    await user.click(within(sheet).getByRole('button', { name: 'note on Psalm 2' }));
    // Same-instant commits tie on order, so compare as a set.
    expect(chips(sheet).sort()).toEqual(['Psalm 1', '✓ Psalm 2']);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(titles(within(sheet).getByRole('list', { name: 'notes on 2026-11-08' }))).toEqual(['blessed is the man']));

    // A note written here is on that day; esc in the editor leaves the sheet open.
    await user.click(within(sheet).getByRole('button', { name: '+ note' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: '+ note' }));
    await user.type(editor().body, 'the wicked are like chaff');
    await user.click(editor().save);
    await waitFor(() =>
      // Same instant (the test clock is frozen), so sort rather than rely on the tie-break.
      expect(titles(within(sheet).getByRole('list', { name: 'notes on 2026-11-08' })).sort()).toEqual(['blessed is the man', 'the wicked are like chaff']),
    );
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('marks days with notes on the heatmap, and opens a day from it', async () => {
    await guestWith({ notes: [{ body: 'a quiet day', writtenOn: '2026-11-02' }] });
    const user = userEvent.setup();
    renderPage(<Today />);
    const year = screen.getByRole('img', { name: /the last 53 weeks/ });
    await waitFor(() => expect(year.querySelector('[data-note="2026-11-02"]')).not.toBeNull());
    const cell = [...year.querySelectorAll('rect[data-i]')].find((r) => r.querySelector('title')!.textContent!.includes('· notes'))!;
    await user.click(cell);
    const sheet = screen.getByRole('dialog', { name: 'nov 2' });
    await waitFor(() => expect(titles(within(sheet).getByRole('list', { name: 'notes on 2026-11-02' }))).toEqual(['a quiet day']));
  });
});

describe('today, then earlier', () => {
  it('lists today\'s readings oldest first with its notes, and earlier days grouped, dated once', async () => {
    await guestWith({
      commits: ['3 days ago gen 1', '3 days ago gen 2', 'yesterday ps 1', 'john 1', 'john 2'],
      notes: [{ body: 'today\'s thought' }, { body: 'older thought', writtenOn: '2026-11-06' }],
    });
    renderPage(<Today />);
    const today = await screen.findByRole('list', { name: 'read today' });
    await waitFor(() => expect(within(today).getAllByTestId('passage').map((p) => p.textContent).sort()).toEqual(['John 1', 'John 2']));
    expect(screen.getByRole('heading', { name: /today\s*76 verses/ })).toBeInTheDocument();
    await waitFor(() => expect(titles(within(notesOnToday()).getByRole('list'))).toEqual(['today\'s thought']));

    const earlier = await screen.findByRole('list', { name: 'earlier' });
    await waitFor(() => expect(within(earlier).getAllByTestId('passage')).toHaveLength(3));
    expect(within(earlier).queryByText('John 1')).toBeNull();
    const dates = within(earlier).getAllByRole('button', { name: /^open / });
    await waitFor(() => expect(dates.map((d) => d.getAttribute('aria-label'))).toEqual(['open yesterday', 'open nov 6, has notes']));
  });
});

describe('notes in the canon', () => {
  it('marks noted chapters and verses, and lists a verse\'s notes on tap', async () => {
    await guestWith({ notes: [{ body: 'the shepherd', verses: 'ps 23:1-2' }, { body: 'still waters', verses: 'ps 23:2' }] });
    const user = userEvent.setup();
    renderPage(<CanonOverview />);
    await user.click(await screen.findByRole('button', { name: 'open Psalms' }));
    const sheet = screen.getByRole('dialog');
    const chapter = await within(sheet).findByRole('button', { name: /^Psalm 23 · .* · notes$/ });
    expect(chapter.querySelector('[data-note-chapter="23"]')).not.toBeNull();
    await user.click(chapter);
    const strip = await within(sheet).findByRole('img', { name: /verses of Psalm 23/ });
    expect([...strip.querySelectorAll('[data-note-verse]')].map((c) => c.getAttribute('data-note-verse'))).toEqual(['1', '2']);

    await user.click(strip.querySelector('[data-v="2"]')!);
    const notes = await within(sheet).findByRole('region', { name: 'notes on Psalm 23:2' });
    await waitFor(() => expect(within(notes).getAllByRole('listitem')).toHaveLength(2));
    expect(screen.getByTestId('sheet-status')).toHaveTextContent(/^Psalm 23:2 · .* · 2 notes$/);

    await user.click(strip.querySelector('[data-v="1"]')!);
    await waitFor(() => expect(within(within(sheet).getByRole('region', { name: 'notes on Psalm 23:1' })).getAllByRole('listitem')).toHaveLength(1));
  });
});
