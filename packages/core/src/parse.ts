import { findBook } from './book-names';
import { getBook, getChapter, verseRef, type Book } from './canon';
import { addDays, dayLabel } from './dates';

/** A contiguous passage within one book, from start verse to end verse inclusive. Whole chapters run from verse 1 to their last verse. */
export interface Segment {
  bookId: number;
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
}

/** Inclusive range of verse IDs (1..31102). */
export interface VerseRange {
  start: number;
  end: number;
}

export type ParseResult =
  | {
      ok: true;
      /** Merged and in canonical order. */
      segments: Segment[];
      /** Merged, non-overlapping, in canonical order. */
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
  /** The date to use when the text has no date phrase. Defaults to `today`. */
  readOn?: string;
}

type Failure = { ok: false; error: string };
const fail = (error: string): Failure => ({ ok: false, error });

/**
 * Parses what someone read (spec §2): passages, lists, ranges, and an optional date phrase.
 * Deterministic: the same text and options always give the same result.
 */
export function parse(text: string, { today, readOn }: ParseOptions): ParseResult {
  const tokens = tokenize(text);
  if (!Array.isArray(tokens)) return tokens;
  if (tokens.length === 0) return fail('which passage?');

  const dated = extractDate(tokens, today);
  if (!dated.ok) return dated;
  const passage = readPassage(dated.tokens);
  if (!passage.ok) return passage;

  const date = dated.date ?? readOn ?? today;
  if (date > today) return fail('that date is in the future');

  const ranges = merge(passage.ranges);
  const segments = ranges.flatMap(splitByBook);
  const display = displaySegments(segments);
  const verseCount = ranges.reduce((n, r) => n + r.end - r.start + 1, 0);
  const summary = `${display} · ${verseCount} ${verseCount === 1 ? 'verse' : 'verses'} · ${dayLabel(date, today)}`;
  return { ok: true, segments, ranges, display, verseCount, readOn: date, summary };
}

// ── tokens ──────────────────────────────────────────────────────────────

type Token = { kind: 'num'; n: number; text: string } | { kind: 'word'; text: string } | { kind: 'punct'; text: string };

function tokenize(text: string): Token[] | Failure {
  const input = text.toLowerCase().replace(/[–—]/g, '-').replace(/[’']/g, '');
  const tokens: Token[] = [];
  for (const [t] of input.matchAll(/\d+|[a-z]+|\S/g)) {
    if (/^\d/.test(t)) tokens.push({ kind: 'num', n: Number(t), text: t });
    else if (/^[a-z]/.test(t)) tokens.push({ kind: 'word', text: t });
    else if (t === '.') continue;
    else if (/^[:,;-]$/.test(t)) tokens.push({ kind: 'punct', text: t });
    else return fail(`couldn’t read “${t}”`);
  }
  return tokens;
}

const isNum = (t: Token | undefined): t is Token & { kind: 'num' } => t?.kind === 'num';
const isWord = (t: Token | undefined, ...words: string[]) => t?.kind === 'word' && (words.length === 0 || words.includes(t.text));
const isPunct = (t: Token | undefined, p: string) => t?.kind === 'punct' && t.text === p;

// ── dates ───────────────────────────────────────────────────────────────

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function month(word: string): number | undefined {
  const i = MONTHS.indexOf(word);
  if (i >= 0) return i + 1;
  const j = MONTH_NAMES.indexOf(word);
  if (j >= 0) return j + 1;
  return word === 'sept' ? 9 : undefined;
}

/** Finds the date phrase (at most one, anywhere) and returns the tokens without it. */
function extractDate(tokens: Token[], today: string): { ok: true; tokens: Token[]; date?: string } | Failure {
  const rest: Token[] = [];
  const dates: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const next = tokens[i + 1];
    if (isWord(t, 'today')) {
      dates.push(today);
    } else if (isWord(t, 'yesterday')) {
      dates.push(addDays(today, -1));
    } else if (isNum(t) && isWord(next, 'day', 'days') && isWord(tokens[i + 2], 'ago')) {
      dates.push(addDays(today, -t.n));
      i += 2;
    } else if (t.kind === 'word' && month(t.text) && isNum(next) && !isPunct(tokens[i + 2], ':') && !isPunct(tokens[i + 2], '-')) {
      const date = mostRecent(month(t.text)!, next.n, today);
      if (!date) return fail(`there’s no ${t.text} ${next.n}`);
      dates.push(date);
      i += isWord(tokens[i + 2], 'st', 'nd', 'rd', 'th') ? 2 : 1;
    } else {
      rest.push(t);
    }
  }
  if (dates.length > 1) return fail('more than one date');
  return { ok: true, tokens: rest, date: dates[0] };
}

/** The most recent past-or-today occurrence of a month and day, or undefined if there is no such day. */
function mostRecent(m: number, d: number, today: string): string | undefined {
  const year = Number(today.slice(0, 4));
  // Feb 29 can be up to 8 years back (across a skipped century leap year).
  for (let y = year; y >= year - 8; y--) {
    const date = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const t = new Date(`${date}T00:00:00Z`);
    if (t.getUTCMonth() + 1 === m && t.getUTCDate() === d && date <= today) return date;
  }
  return undefined;
}

// ── passages ────────────────────────────────────────────────────────────

/** Dropped wherever they appear. Any other word that isn't a book is an error. */
const FILLER = new Set([
  'i', 'ive', 'im', 'just', 'read', 'reading', 'chapter', 'chapters', 'ch', 'and', 'also', 'plus', 'then', 'the', 'book', 'books', 'of', 'a', 'in', 'on',
]);

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3 };

type BookRead = { ok: true; book: Book; next: number } | Failure;

/** Reads a book name starting at token i: an optional 1/2/3 or i/ii/iii, then up to four words. */
function readBook(tokens: Token[], i: number): BookRead | undefined {
  const t = tokens[i];
  const ordinal = isNum(t) && t.n >= 1 && t.n <= 3 ? t.n : t?.kind === 'word' ? ROMAN[t.text] : undefined;
  if (ordinal && isWord(tokens[i + 1])) {
    const found = readWords(tokens, i + 1, `${ordinal} `);
    if (found.ok) return found;
  }
  return t?.kind === 'word' ? readWords(tokens, i, '') : undefined;
}

function readWords(tokens: Token[], start: number, prefix: string): BookRead {
  let end = start;
  while (end < start + 4 && isWord(tokens[end])) end++;
  for (let e = end; e > start + 1; e--) {
    const found = findBook(prefix + tokens.slice(start, e).map((t) => t.text).join(' '));
    if (found.ok) return { ok: true, book: found.book, next: e };
  }
  const found = findBook(prefix + tokens[start]!.text);
  return found.ok ? { ok: true, book: found.book, next: start + 1 } : found;
}

/** A point in a book: a whole chapter (no verse) or a verse. */
type Ref = { chapter: number; verse?: number };

function readPassage(tokens: Token[]): { ok: true; ranges: VerseRange[] } | Failure {
  const ranges: VerseRange[] = [];
  let book: Book | undefined;
  let bookHasRefs = false;
  // What a bare number in a list means: a chapter, or a verse in `chapter`.
  let level: 'chapter' | 'verse' = 'chapter';
  let chapter = 1;

  const wholeBook = (b: Book) => ranges.push({ start: b.firstVerseId, end: b.lastVerseId });
  const resetLevel = (b: Book) => {
    // Single-chapter books take verse numbers.
    level = b.chapterCount === 1 ? 'verse' : 'chapter';
    chapter = 1;
  };

  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i]!;
    const named = readBook(tokens, i);
    if (named?.ok) {
      if (book && !bookHasRefs) wholeBook(book);
      book = named.book;
      bookHasRefs = false;
      resetLevel(book);
      i = named.next;
      continue;
    }

    if (t.kind === 'word') {
      if (FILLER.has(t.text)) {
        i++;
        continue;
      }
      // Before any book, an unknown word is most likely a misspelled book; after one, it's just unreadable.
      if (named && (!book || !named.error.startsWith('unknown book'))) return named;
      return fail(`couldn’t read “${t.text}”`);
    }

    if (isPunct(t, ',')) {
      i++;
      continue;
    }
    if (isPunct(t, ';')) {
      if (book) resetLevel(book);
      i++;
      continue;
    }
    if (!isNum(t)) return fail(`couldn’t read “${t.text}”`);
    if (!book) return fail('which book?');

    // start: c:v, or a bare number at the current level
    let start: Ref;
    if (isPunct(tokens[i + 1], ':')) {
      const v = tokens[i + 2];
      if (!isNum(v)) return fail(`couldn’t read “${tokens[i + 1]!.text}”`);
      start = { chapter: t.n, verse: v.n };
      i += 3;
    } else {
      start = level === 'verse' ? { chapter, verse: t.n } : { chapter: t.n };
      i += 1;
    }

    // end: -c:v, or -n at the start's level
    let end = start;
    if (isPunct(tokens[i], '-')) {
      const a = tokens[i + 1];
      if (!isNum(a)) return fail('couldn’t read “-”');
      if (isPunct(tokens[i + 2], ':')) {
        const v = tokens[i + 3];
        if (!isNum(v)) return fail(`couldn’t read “:”`);
        end = { chapter: a.n, verse: v.n };
        i += 4;
      } else {
        end = start.verse === undefined ? { chapter: a.n } : { chapter: start.chapter, verse: a.n };
        i += 2;
      }
    }

    bookHasRefs = true;
    // A bare 1 in a single-chapter book is the whole book.
    if (book.chapterCount === 1 && start === end && start.verse !== undefined && t.n === 1 && !isPunct(tokens[i - 2], ':')) {
      wholeBook(book);
      continue;
    }
    const range = toRange(book, start, end);
    if (!range.ok) return range;
    ranges.push(range.range);
    if (end.verse !== undefined) level = 'verse';
    chapter = end.chapter;
  }

  if (!book) return fail('which passage?');
  if (!bookHasRefs) wholeBook(book);
  return { ok: true, ranges };
}

function toRange(book: Book, start: Ref, end: Ref): { ok: true; range: VerseRange } | Failure {
  const first = verseIdOf(book, start, 'first');
  if (!first.ok) return first;
  const last = verseIdOf(book, end, 'last');
  if (!last.ok) return last;
  if (last.id < first.id) return fail('that range runs backwards');
  return { ok: true, range: { start: first.id, end: last.id } };
}

function verseIdOf(book: Book, { chapter, verse }: Ref, side: 'first' | 'last'): { ok: true; id: number } | Failure {
  const c = getChapter(book.id, chapter);
  if (!c) return fail(`${book.name} has ${plural(book.chapterCount, 'chapter')}`);
  if (verse === undefined) return { ok: true, id: side === 'first' ? c.firstVerseId : c.lastVerseId };
  if (verse < 1 || verse > c.verseCount) {
    const where = book.chapterCount === 1 ? book.name : `${chapterName(book, true)} ${chapter}`;
    return fail(`${where} has ${plural(c.verseCount, 'verse')}`);
  }
  return { ok: true, id: c.firstVerseId + verse - 1 };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ── merging and display ─────────────────────────────────────────────────

/** Sorts ranges and merges any that overlap or touch. */
function merge(ranges: VerseRange[]): VerseRange[] {
  const merged: VerseRange[] = [];
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end + 1) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

function splitByBook({ start, end }: VerseRange): Segment[] {
  const segments: Segment[] = [];
  while (start <= end) {
    const from = verseRef(start)!;
    const segmentEnd = Math.min(end, getBook(from.bookId)!.lastVerseId);
    const to = verseRef(segmentEnd)!;
    segments.push({ bookId: from.bookId, startChapter: from.chapter, startVerse: from.verse, endChapter: to.chapter, endVerse: to.verse });
    start = segmentEnd + 1;
  }
  return segments;
}

/** "Psalm 23" for one chapter, "Psalms 1–2" for more. */
function chapterName(book: Book, single: boolean): string {
  return book.name === 'Psalms' && single ? 'Psalm' : book.name;
}

const isWholeChapters = (s: Segment) => s.startVerse === 1 && s.endVerse === getChapter(s.bookId, s.endChapter)!.verseCount;

/** e.g. "Romans 8; 1 Corinthians 13", "Psalms 1, 3, 5", "John 3:16; 4". */
function displaySegments(segments: Segment[]): string {
  const groups: Segment[][] = [];
  for (const s of segments) {
    const group = groups[groups.length - 1];
    if (group && group[0]!.bookId === s.bookId) group.push(s);
    else groups.push([s]);
  }
  return groups.map(displayBook).join('; ');
}

function displayBook(segments: Segment[]): string {
  const book = getBook(segments[0]!.bookId)!;
  const first = segments[0]!;
  if (segments.length === 1 && isWholeChapters(first) && first.startChapter === 1 && first.endChapter === book.chapterCount) return book.name;

  const single = segments.length === 1 && first.startChapter === first.endChapter;
  let text = `${chapterName(book, single)} `;
  segments.forEach((s, i) => {
    // After a verse, a bare number reads as a verse, so a whole chapter needs `;`.
    if (i > 0) text += isWholeChapters(s) && !isWholeChapters(segments[i - 1]!) ? '; ' : ', ';
    text += displayRefs(book, s);
  });
  return text;
}

function displayRefs(book: Book, s: Segment): string {
  if (isWholeChapters(s)) return s.startChapter === s.endChapter ? `${s.startChapter}` : `${s.startChapter}–${s.endChapter}`;
  if (book.chapterCount === 1) {
    // A bare "Jude 1" would mean the whole book.
    if (s.startVerse === 1 && s.endVerse === 1) return '1:1';
    return s.startVerse === s.endVerse ? `${s.startVerse}` : `${s.startVerse}–${s.endVerse}`;
  }
  const start = `${s.startChapter}:${s.startVerse}`;
  if (s.startChapter !== s.endChapter) return `${start}–${s.endChapter}:${s.endVerse}`;
  return s.startVerse === s.endVerse ? start : `${start}–${s.endVerse}`;
}
