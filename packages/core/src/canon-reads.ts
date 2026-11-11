import { CHAPTERS, getBook, TOTAL_CHAPTERS, TOTAL_VERSES } from './canon';
import type { VerseRange } from './parse';

/** How much of one chapter has been read. */
export interface ChapterReads {
  /** Times the whole chapter has been read: the fewest reads of any of its verses (repeats count). */
  times: number;
  /** Distinct verses read at least once. */
  versesRead: number;
}

/**
 * Per-chapter reads from every verse range a reader has committed (all time, repeats counted).
 * One entry per chapter, in canonical order: index `i` is chapter ID `i + 1`.
 */
export function chapterReads(ranges: Iterable<VerseRange>): ChapterReads[] {
  // Difference array over verse IDs: +1 at each range start, -1 just past its end.
  const delta = new Int32Array(TOTAL_VERSES + 2);
  for (const { start, end } of ranges) {
    if (start < 1 || end > TOTAL_VERSES || start > end) continue;
    delta[start]!++;
    delta[end + 1]!--;
  }
  const reads: ChapterReads[] = [];
  let count = 0;
  let verse = 1;
  for (const chapter of CHAPTERS) {
    let times = Infinity;
    let versesRead = 0;
    for (; verse <= chapter.lastVerseId; verse++) {
      count += delta[verse]!;
      if (count < times) times = count;
      if (count > 0) versesRead++;
    }
    reads.push({ times, versesRead });
  }
  return reads;
}

/**
 * A chapter's depth on the canon grid: 0 unread, 1 partly read (lighter than 1×),
 * then 2 / 3 / 4 for read 1× / 2× / 3+.
 */
export type ChapterLevel = 0 | 1 | 2 | 3 | 4;

export function chapterLevel({ times, versesRead }: ChapterReads): ChapterLevel {
  if (times >= 1) return Math.min(4, times + 1) as ChapterLevel;
  return versesRead > 0 ? 1 : 0;
}

/** "read 2×", "partly read", or "not yet read". */
export function readLabel({ times, versesRead }: ChapterReads): string {
  if (times >= 1) return `read ${times}×`;
  return versesRead > 0 ? 'partly read' : 'not yet read';
}

/** "Genesis 12", "Psalm 23", or "Jude" for a single-chapter book. */
export function chapterLabel(bookId: number, chapter: number): string {
  const book = getBook(bookId);
  if (!book) return '';
  if (book.chapterCount === 1) return book.name;
  return `${book.name === 'Psalms' ? 'Psalm' : book.name} ${chapter}`;
}

export interface Coverage {
  /** Chapters with every verse read at least once. */
  chaptersRead: number;
  /** Chapters read through at least twice. */
  readMoreThanOnce: number;
  /** `chaptersRead` ÷ 1,189, from 0 to 1. */
  coverage: number;
}

export function coverage(reads: readonly ChapterReads[]): Coverage {
  const chaptersRead = reads.filter((r) => r.times >= 1).length;
  const readMoreThanOnce = reads.filter((r) => r.times >= 2).length;
  return { chaptersRead, readMoreThanOnce, coverage: chaptersRead / TOTAL_CHAPTERS };
}
