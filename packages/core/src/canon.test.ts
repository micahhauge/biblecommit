import { describe, expect, it } from 'vitest';
import { BOOKS, CHAPTERS, TOTAL_CHAPTERS, TOTAL_VERSES, getBook, getChapter, verseId, verseRef } from './canon';
import { SECTIONS } from './sections';

describe('canon', () => {
  it('has the Protestant canon in KJV versification', () => {
    expect(BOOKS).toHaveLength(66);
    expect(TOTAL_CHAPTERS).toBe(1189);
    expect(TOTAL_VERSES).toBe(31102);
  });

  it('numbers verses contiguously from 1 to 31102', () => {
    let expected = 1;
    for (const c of CHAPTERS) {
      expect(c.firstVerseId).toBe(expected);
      expect(c.lastVerseId - c.firstVerseId + 1).toBe(c.verseCount);
      expected = c.lastVerseId + 1;
    }
    expect(expected).toBe(31103);
  });

  it('book verse ranges match their chapters', () => {
    for (const b of BOOKS) {
      const cs = CHAPTERS.filter((c) => c.bookId === b.id);
      expect(cs).toHaveLength(b.chapterCount);
      expect(b.firstVerseId).toBe(cs[0]!.firstVerseId);
      expect(b.lastVerseId).toBe(cs[cs.length - 1]!.lastVerseId);
    }
  });

  it('assigns every book to a known section, in canonical order', () => {
    const order = SECTIONS.map((s) => s.id);
    const idx = BOOKS.map((b) => order.indexOf(b.section));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(getBook(1)!.section).toBe('law');
    expect(getBook(66)!.section).toBe('apocalypse');
  });

  it.each([
    ['Psalms', 119, 176],
    ['2 Samuel', 21, 22],
    ['John', 3, 36],
    ['3 John', 1, 14],
    ['Malachi', 4, 6],
  ])('%s %i has %i verses', (name, chapter, count) => {
    const book = BOOKS.find((b) => b.name === name)!;
    expect(getChapter(book.id, chapter)!.verseCount).toBe(count);
  });

  it('round-trips verse IDs', () => {
    expect(verseId(1, 1, 1)).toBe(1);
    expect(verseId(66, 22, 21)).toBe(31102);
    expect(verseRef(31102)).toEqual({ bookId: 66, chapter: 22, verse: 21 });
    for (const id of [1, 31, 32, 1533, 15000, 23145, 31102]) {
      const r = verseRef(id)!;
      expect(verseId(r.bookId, r.chapter, r.verse)).toBe(id);
    }
  });

  it('rejects references outside the canon', () => {
    expect(verseId(1, 1, 32)).toBeUndefined();
    expect(verseId(1, 51, 1)).toBeUndefined();
    expect(verseId(67, 1, 1)).toBeUndefined();
    expect(verseRef(0)).toBeUndefined();
    expect(verseRef(31103)).toBeUndefined();
  });
});
