import { BOOK_DATA } from './canon-data';
import type { SectionId } from './sections';

export interface Book {
  /** 1..66 in canonical order */
  id: number;
  name: string;
  shortName: string;
  section: SectionId;
  chapterCount: number;
  firstVerseId: number;
  lastVerseId: number;
}

export interface Chapter {
  /** 1..1189 in canonical order */
  id: number;
  bookId: number;
  number: number;
  verseCount: number;
  firstVerseId: number;
  lastVerseId: number;
}

const books: Book[] = [];
const chapters: Chapter[] = [];

{
  let verseId = 1;
  let chapterId = 1;
  BOOK_DATA.forEach((b, i) => {
    const firstVerseId = verseId;
    b.verses.forEach((verseCount, ci) => {
      chapters.push({
        id: chapterId++,
        bookId: i + 1,
        number: ci + 1,
        verseCount,
        firstVerseId: verseId,
        lastVerseId: verseId + verseCount - 1,
      });
      verseId += verseCount;
    });
    books.push({
      id: i + 1,
      name: b.name,
      shortName: b.shortName,
      section: b.section,
      chapterCount: b.verses.length,
      firstVerseId,
      lastVerseId: verseId - 1,
    });
  });
}

export const BOOKS: readonly Book[] = books;
export const CHAPTERS: readonly Chapter[] = chapters;
export const TOTAL_VERSES = chapters[chapters.length - 1]!.lastVerseId;
export const TOTAL_CHAPTERS = chapters.length;

const chapterIndex = new Map<string, Chapter>(chapters.map((c) => [`${c.bookId}:${c.number}`, c]));

export function getBook(bookId: number): Book | undefined {
  return books[bookId - 1];
}

export function getChapter(bookId: number, chapter: number): Chapter | undefined {
  return chapterIndex.get(`${bookId}:${chapter}`);
}

/** Verse ID for a reference, or undefined if it doesn't exist in the canon. */
export function verseId(bookId: number, chapter: number, verse: number): number | undefined {
  const c = getChapter(bookId, chapter);
  if (!c || !Number.isInteger(verse) || verse < 1 || verse > c.verseCount) return undefined;
  return c.firstVerseId + verse - 1;
}

export interface VerseRef {
  bookId: number;
  chapter: number;
  verse: number;
}

/** Reference for a verse ID, or undefined if out of range. */
export function verseRef(id: number): VerseRef | undefined {
  if (!Number.isInteger(id) || id < 1 || id > TOTAL_VERSES) return undefined;
  let lo = 0;
  let hi = chapters.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (chapters[mid]!.firstVerseId <= id) lo = mid;
    else hi = mid - 1;
  }
  const c = chapters[lo]!;
  return { bookId: c.bookId, chapter: c.number, verse: id - c.firstVerseId + 1 };
}
