import { describe, expect, it } from 'vitest';
import { parse } from './parse';

const today = '2026-11-09';

/** One-line preview, or the error. */
function summary(text: string, options: { readOn?: string } = {}) {
  const r = parse(text, { today, ...options });
  return r.ok ? r.summary : `error: ${r.error}`;
}

// Every example in the parser table of docs/spec.md §2. Verse counts are from the KJV; today is Mon Nov 9, 2026.
describe('spec examples', () => {
  it.each([
    ['today I read 2 Samuel 21', '2 Samuel 21 · 22 verses · today'],
    ['1 Kings 1:5-9', '1 Kings 1:5–9 · 5 verses · today'],
    ['gen 1-3', 'Genesis 1–3 · 80 verses · today'],
    // John 3 has 36 verses: 3:16–36 is 21, plus 4:1–2
    ['jn 3:16-4:2', 'John 3:16–4:2 · 23 verses · today'],
    // 6 + 8 + 12
    ['ps 1, 3, 5', 'Psalms 1, 3, 5 · 26 verses · today'],
    ['john 3:16, 18', 'John 3:16, 3:18 · 2 verses · today'],
    // 39 + 13
    ['romans 8 and 1 cor 13', 'Romans 8; 1 Corinthians 13 · 52 verses · today'],
    ['jude 3-5', 'Jude 3–5 · 3 verses · today'],
    ['i kings 2', '1 Kings 2 · 46 verses · today'],
    ['2 samuel chapter 21', '2 Samuel 21 · 22 verses · today'],
    ['yesterday I read psalm 23', 'Psalm 23 · 6 verses · yesterday'],
    ['3 days ago gen 5', 'Genesis 5 · 32 verses · nov 6'],
    ['nov 7 john 1', 'John 1 · 51 verses · nov 7'],
    ['november 7 john 1', 'John 1 · 51 verses · nov 7'],
    ['jude', 'Jude · 25 verses · today'],
    ['jude 1', 'Jude · 25 verses · today'],
    // the list inherits the verse level: 4 is 3:4. Passages display in canonical order.
    ['john 3:16, 4', 'John 3:4, 3:16 · 2 verses · today'],
  ])('%s → %s', (text, expected) => {
    expect(summary(text)).toBe(expected);
  });
});

describe('parse', () => {
  it('reads a book and a whole chapter', () => {
    expect(parse('john 3', { today })).toEqual({
      ok: true,
      segments: [{ bookId: 43, startChapter: 3, startVerse: 1, endChapter: 3, endVerse: 36 }],
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
    expect(r.ok && r.segments).toEqual([{ bookId: 1, startChapter: 1, startVerse: 1, endChapter: 3, endVerse: 24 }]);
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
    ['john three', 'couldn’t read “three”'],
    ['3', 'which book?'],
  ])('%j → %s', (text, error) => {
    expect(parse(text, { today })).toEqual({ ok: false, error });
  });
});

describe('ranges and lists', () => {
  it.each([
    ['gen 1:1-3', 'Genesis 1:1–3 · 3'],
    // a chapter-level start with a c:v end runs from verse 1: 31 + 3
    ['gen 1-2:3', 'Genesis 1:1–2:3 · 34'],
    ['john 3:16-18, 20', 'John 3:16–18, 3:20 · 4'],
    // `;` resets the list to chapters: 1 + 54
    ['john 3:16; 4', 'John 3:16; 4 · 55'],
    // an explicit c:v moves the chapter the list inherits
    ['john 3:16, 4:1, 3', 'John 3:16, 4:1, 4:3 · 3'],
    ['gen 1, 2:3, 5', 'Genesis 1, 2:3, 2:5 · 33'],
    // commas are optional: 31 + 24
    ['gen 1 3', 'Genesis 1, 3 · 55'],
  ])('%s → %s', (text, expected) => {
    expect(passage(text)).toBe(expected);
  });
});

describe('several books', () => {
  it.each([
    // 31 + 25
    ['gen 1, exodus 2', 'Genesis 1; Exodus 2 · 56'],
    // a book with no numbers is the whole book: 433 + 13
    ['romans; 1 cor 13', 'Romans; 1 Corinthians 13 · 446'],
    ['ps 23 and john 1', 'Psalm 23; John 1 · 57'],
    // displayed in canonical order: 51 + 31
    ['john 1 gen 1', 'Genesis 1; John 1 · 82'],
  ])('%s → %s', (text, expected) => {
    expect(passage(text)).toBe(expected);
  });
});

describe('roman numerals and filler words', () => {
  it.each([
    ['ii kings 2', '2 Kings 2 · 25'],
    ['iii john', '3 John · 14'],
    ['i read i kings 2', '1 Kings 2 · 46'],
    ['1 cor. 13', '1 Corinthians 13 · 13'],
    ['i read the book of ruth', 'Ruth · 85'],
    ['also read john chapters 1-2', 'John 1–2 · 76'],
    ['I’ve just read Psalm 23', 'Psalm 23 · 6'],
  ])('%s → %s', (text, expected) => {
    expect(passage(text)).toBe(expected);
  });
});

describe('single-chapter books', () => {
  it.each([
    ['jude 1:1', 'Jude 1:1 · 1'],
    ['jude 1-3', 'Jude 1–3 · 3'],
    ['jude 2', 'Jude 2 · 1'],
    ['obadiah 3, 5', 'Obadiah 3, 5 · 2'],
    ['philemon 1:1-25', 'Philemon · 25'],
    // in a list, 1 is a verse like any other number
    ['jude 1, 3', 'Jude 1, 3 · 2'],
    ['jude 3, 1', 'Jude 1, 3 · 2'],
    ['jude 1; 3', 'Jude 1, 3 · 2'],
    ['jude 26', 'error: Jude has 25 verses'],
    ['jude 2:1', 'error: Jude has 1 chapter'],
  ])('%s → %s', (text, expected) => {
    expect(passage(text)).toBe(expected);
  });
});

describe('dates', () => {
  it.each([
    ['gen 1 yesterday', 'Genesis 1 · 31 verses · yesterday'],
    ['gen 1, 1 day ago', 'Genesis 1 · 31 verses · yesterday'],
    ['0 days ago gen 1', 'Genesis 1 · 31 verses · today'],
    ['NOV 7TH john 1', 'John 1 · 51 verses · nov 7'],
    ['sept 1 gen 1', 'Genesis 1 · 31 verses · sep 1'],
    ['nov 9 gen 1', 'Genesis 1 · 31 verses · today'],
    // the most recent past occurrence
    ['nov 10 gen 1', 'Genesis 1 · 31 verses · nov 10, 2025'],
    ['dec 25 gen 1', 'Genesis 1 · 31 verses · dec 25, 2025'],
    ['feb 29 gen 1', 'Genesis 1 · 31 verses · feb 29, 2024'],
    // "mar" followed by a chapter:verse is Mark, not March
    ['mar 1:5', 'Mark 1:5 · 1 verse · today'],
    ['mar 3 mark 1', 'Mark 1 · 45 verses · mar 3'],
    ['nov 31 gen 1', 'error: there’s no nov 31'],
    ['today gen 1 yesterday', 'error: more than one date'],
    ['yesterday', 'error: which passage?'],
  ])('%s → %s', (text, expected) => {
    expect(summary(text)).toBe(expected);
  });

  it('uses readOn when the text has no date', () => {
    expect(summary('gen 1', { readOn: '2026-11-01' })).toBe('Genesis 1 · 31 verses · nov 1');
    expect(parse('gen 1', { today, readOn: '2026-11-01' })).toMatchObject({ readOn: '2026-11-01' });
  });

  it('prefers a date in the text over readOn', () => {
    expect(summary('yesterday gen 1', { readOn: '2026-11-01' })).toBe('Genesis 1 · 31 verses · yesterday');
  });

  it('rejects a future date', () => {
    expect(summary('gen 1', { readOn: '2026-11-10' })).toBe('error: that date is in the future');
  });
});

describe('overlap merging', () => {
  it.each([
    ['gen 1, gen 1', 'Genesis 1 · 31'],
    ['gen 1-3, 2', 'Genesis 1–3 · 80'],
    ['john 3:16-18, 3:17-20', 'John 3:16–20 · 5'],
    // touching ranges join too: 31 + 25
    ['gen 1, 2', 'Genesis 1–2 · 56'],
  ])('%s → %s', (text, expected) => {
    expect(passage(text)).toBe(expected);
  });

  it('returns merged ranges in canonical order', () => {
    const r = parse('gen 2, gen 1, gen 1:5, john 1:1', { today });
    // John 1:1 is verse 26,046
    expect(r.ok && r.ranges).toEqual([
      { start: 1, end: 56 },
      { start: 26046, end: 26046 },
    ]);
  });
});

describe('more errors', () => {
  it.each([
    ['jud', 'Judges or Jude?'],
    ['john 3:37', 'John 3 has 36 verses'],
    ['john 3:0', 'John 3 has 36 verses'],
    ['ps 23:7', 'Psalm 23 has 6 verses'],
    ['john 3:18-16', 'that range runs backwards'],
    ['jn 4:2-3:16', 'that range runs backwards'],
    ['gen 1 to 3', 'couldn’t read “to”'],
    ['john 3 verse 16', 'couldn’t read “verse”'],
    ['gen 1:', 'couldn’t read “:”'],
    ['gen 1-', 'couldn’t read “-”'],
    ['john 3!', 'couldn’t read “!”'],
    ['i read', 'which passage?'],
    ['ps 23 hezekiah 3', 'couldn’t read “hezekiah”'],
    ['ps 23 and jud 3', 'Judges or Jude?'],
  ])('%j → %s', (text, error) => {
    expect(parse(text, { today })).toEqual({ ok: false, error });
  });
});
