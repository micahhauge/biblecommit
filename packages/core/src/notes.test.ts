import { describe, expect, it } from 'vitest';
import { noteTitle } from './notes';
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
