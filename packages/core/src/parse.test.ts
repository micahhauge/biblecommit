import { describe, expect, it } from 'vitest';
import { parse } from './parse';

const today = '2026-11-09';

describe('parse', () => {
  it('reads a book and a whole chapter', () => {
    expect(parse('john 3', { today })).toEqual({
      ok: true,
      segments: [{ bookId: 43, startChapter: 3, endChapter: 3 }],
      // John 1:1 is verse 26,046 and John 1–2 have 51 + 25 verses, so John 3 is 26,122..26,157
      ranges: [{ start: 26122, end: 26157 }],
      display: 'John 3',
      verseCount: 36,
      readOn: today,
      summary: 'John 3 · 36 verses · today',
    });
  });
});

/** Display and verse count only; expected counts are from the KJV. */
function passage(text: string) {
  const r = parse(text, { today });
  return r.ok ? `${r.display} · ${r.verseCount}` : `error: ${r.error}`;
}

describe('book names', () => {
  it.each([
    ['gen 1', 'Genesis 1 · 31'],
    ['GEN 1', 'Genesis 1 · 31'],
    ['  rev 22 ', 'Revelation 22 · 21'],
    ['lamentations 3', 'Lamentations 3 · 66'],
    // alias table beats prefix matching
    ['jn 3', 'John 3 · 36'],
    ['ps 119', 'Psalm 119 · 176'],
    ['psalm 23', 'Psalm 23 · 6'],
    ['psalms 23', 'Psalm 23 · 6'],
    ['song 2', 'Song of Solomon 2 · 17'],
    ['song of solomon 2', 'Song of Solomon 2 · 17'],
    ['1 corinthians 13', '1 Corinthians 13 · 13'],
    ['phil 4', 'Philippians 4 · 23'],
    ['phm 1', 'Philemon · 25'],
    // numbered books, with or without a space
    ['1 cor 13', '1 Corinthians 13 · 13'],
    ['1cor 13', '1 Corinthians 13 · 13'],
    ['2 samuel 21', '2 Samuel 21 · 22'],
    ['3 jn 1', '3 John · 14'],
  ])('%s → %s', (text, expected) => {
    expect(passage(text)).toBe(expected);
  });
});

describe('whole chapters and books', () => {
  it.each([
    ['gen 1-3', 'Genesis 1–3 · 80'],
    ['gen 1–3', 'Genesis 1–3 · 80'],
    ['gen 1 - 3', 'Genesis 1–3 · 80'],
    ['ps 1-2', 'Psalms 1–2 · 18'],
    ['ruth', 'Ruth · 85'],
    ['jude', 'Jude · 25'],
    ['jude 1', 'Jude · 25'],
  ])('%s → %s', (text, expected) => {
    expect(passage(text)).toBe(expected);
  });

  it('expands a chapter range to one contiguous verse range', () => {
    const r = parse('gen 1-3', { today });
    expect(r.ok && r.ranges).toEqual([{ start: 1, end: 80 }]);
    expect(r.ok && r.segments).toEqual([{ bookId: 1, startChapter: 1, endChapter: 3 }]);
  });

  it('pluralizes the summary', () => {
    expect(parse('gen 1-3', { today })).toMatchObject({ summary: 'Genesis 1–3 · 80 verses · today' });
  });
});

describe('errors', () => {
  it.each([
    ['', 'which passage?'],
    ['   ', 'which passage?'],
    ['hezekiah 3', 'unknown book “hezekiah”'],
    ['j 3', 'unknown book “j”'],
    ['jud 1', 'Judges or Jude?'],
    ['ma 1', 'Malachi, Matthew, or Mark?'],
    ['john 22', 'John has 21 chapters'],
    ['john 0', 'John has 21 chapters'],
    ['gen 3-1', 'that range runs backwards'],
    ['gen 49-51', 'Genesis has 50 chapters'],
    ['john 3 foo', 'couldn’t read “foo”'],
    ['john three', 'unknown book “john three”'],
    ['3', 'which book?'],
  ])('%j → %s', (text, error) => {
    expect(parse(text, { today })).toEqual({ ok: false, error });
  });
});
