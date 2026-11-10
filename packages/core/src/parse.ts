import { findBook } from './book-names';
import { getBook, getChapter } from './canon';
import { dayLabel } from './dates';

/** A run of whole chapters within one book. */
export interface Segment {
  bookId: number;
  startChapter: number;
  endChapter: number;
}

/** Inclusive range of verse IDs (1..31102). */
export interface VerseRange {
  start: number;
  end: number;
}

export type ParseResult =
  | {
      ok: true;
      segments: Segment[];
      ranges: VerseRange[];
      /** Normalized passage, e.g. "John 3". */
      display: string;
      verseCount: number;
      /** Local calendar date (YYYY-MM-DD) the reading counts for. */
      readOn: string;
      /** One-line preview, e.g. "John 3 · 36 verses · today". */
      summary: string;
    }
  | { ok: false; error: string };

export interface ParseOptions {
  /** The user's local date, YYYY-MM-DD. */
  today: string;
}

export function parse(text: string, { today }: ParseOptions): ParseResult {
  const input = text.trim().toLowerCase().replace(/[–—]/g, '-').replace(/\s*-\s*/g, '-');
  if (!input) return { ok: false, error: 'which passage?' };
  const match = input.match(/^((?:[1-3]\s*)?[a-z](?:[a-z ]*[a-z])?)(?:\s*(\d+)(?:-(\d+))?)?(?:\s+(.+))?$/);
  if (!match) return { ok: false, error: /^[\d\s-]+$/.test(input) ? 'which book?' : `couldn’t read “${input}”` };
  if (match[4]) return { ok: false, error: `couldn’t read “${match[4]}”` };
  const found = findBook(match[1]!);
  if (!found.ok) return found;
  const { book } = found;

  const whole = match[2] === undefined || (book.chapterCount === 1 && match[2] === '1' && match[3] === undefined);
  const startChapter = whole ? 1 : Number(match[2]);
  const endChapter = whole ? book.chapterCount : Number(match[3] ?? match[2]);
  const outOfRange = `${book.name} has ${book.chapterCount} chapter${book.chapterCount === 1 ? '' : 's'}`;
  if (startChapter < 1 || endChapter > book.chapterCount) return { ok: false, error: outOfRange };
  if (endChapter < startChapter) return { ok: false, error: 'that range runs backwards' };
  const segment: Segment = { bookId: book.id, startChapter, endChapter };

  const first = getChapter(book.id, startChapter)!;
  const last = getChapter(book.id, endChapter)!;
  const ranges = [{ start: first.firstVerseId, end: last.lastVerseId }];
  const verseCount = last.lastVerseId - first.firstVerseId + 1;
  const display = displaySegment(segment);
  const summary = `${display} · ${verseCount} ${verseCount === 1 ? 'verse' : 'verses'} · ${dayLabel(today, today)}`;
  return { ok: true, segments: [segment], ranges, display, verseCount, readOn: today, summary };
}

function displaySegment({ bookId, startChapter, endChapter }: Segment): string {
  const book = getBook(bookId)!;
  if (startChapter === 1 && endChapter === book.chapterCount) return book.name;
  if (startChapter === endChapter) return `${book.name === 'Psalms' ? 'Psalm' : book.name} ${startChapter}`;
  return `${book.name} ${startChapter}–${endChapter}`;
}
