import { describe, expect, it } from 'vitest';
import { joinVerses, noteTitle, splitVerses } from './notes';
import { parseVerses } from './parse';

describe('noteTitle', () => {
  it.each([
    ['plain first line\nmore', 'plain first line'],
    ['\n\n  second para first', 'second para first'],
    ['intro\n\n## The **heading**', 'The heading'],
    ['- [x] a *task* item', 'a task item'],
    ['> quoted [link](https://x.y) and `code`', 'quoted link and code'],
    ['```\ncode\n```', 'code'],
    ['', ''],
    ['   \n\n', ''],
  ])('%j → %j', (body, title) => {
    expect(noteTitle(body)).toBe(title);
  });
});

describe('parseVerses', () => {
  const show = (text: string) => {
    const r = parseVerses(text);
    return r.ok ? `${r.display} · ${r.verseCount}` : `error: ${r.error}`;
  };

  it.each([
    ['', ' · 0'],
    ['   ', ' · 0'],
    ['rom 8:28-30, jn 3:16', 'John 3:16; Romans 8:28–30 · 4'],
    ['gen 1, gen 1', 'Genesis 1 · 31'],
    ['isaiah 53', 'Isaiah 53 · 12'],
    ['yesterday rom 8', 'error: notes take their day from where you write them'],
    ['today john 1', 'error: notes take their day from where you write them'],
    ['nov 7 john 1', 'error: notes take their day from where you write them'],
    ['jud 1', 'error: Judges or Jude?'],
    ['gen 51', 'error: Genesis has 50 chapters'],
  ])('%j → %j', (text, expected) => {
    expect(show(text)).toBe(expected);
  });

  it('returns merged verse-ID ranges', () => {
    const r = parseVerses('gen 1:1-3, gen 1:2-5');
    expect(r.ok && r.ranges).toEqual([{ start: 1, end: 5 }]);
  });
});

describe('splitVerses', () => {
  const readings = ['Genesis 1–3', 'John 3:16–18', 'Psalm 23'];
  it.each([
    ['Genesis 1–3; John 3:16–18; Psalm 23', [true, true, true], ''],
    ['', [false, false, false], ''],
    ['John 3:16–18', [false, true, false], ''],
    ['gen 1-3, isa 53', [true, false, false], 'Isaiah 53'],
    // Part of a reading isn't the reading.
    ['gen 1', [false, false, false], 'gen 1'],
    // A reading inside a bigger passage counts, and the rest is left over.
    ['john 3', [false, true, false], 'John 3:1–15, 3:19–36'],
    ['jud 1', [false, false, false], 'jud 1'],
  ])('%j', (verses, selected, extra) => {
    expect(splitVerses(verses, readings)).toEqual({ selected, extra });
  });

  it('round-trips through joinVerses', () => {
    const verses = joinVerses(['Genesis 1–3', 'Psalm 23'], 'isa 53');
    expect(verses).toBe('Genesis 1–3; Psalm 23; isa 53');
    expect(splitVerses(verses, readings)).toEqual({ selected: [true, false, true], extra: 'Isaiah 53' });
  });
});
