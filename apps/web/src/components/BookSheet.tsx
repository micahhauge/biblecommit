'use client';

import { chapterLabel, chapterLevel, dayLabel, getBook, getChapter, localDate, readLabel, verseLabel, verseReads, type ChapterReads } from '@biblecommit/core';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { browserTimezone, useHasGuest } from '@/guest';
import { useChapterNotes } from '@/notes';
import { Markdown } from './Markdown';
import { useBookReads } from '@/me';
import { useSheet } from '@/use-sheet';
import { useWidth } from '@/use-width';
import styles from './BookSheet.module.css';

interface Props {
  bookId: number;
  /** Reads of each of the book's chapters, in order. */
  chapters: readonly ChapterReads[];
  /** The chapter whose verses to show on open, if any. */
  chapter?: number | null;
  onClose(): void;
}

/** Width assumed until the sheet has been measured (tests). */
const DEFAULT_WIDTH = 552;

/** A verse read `n` times, as the depth levels of the grid: 0 unread, then 1×, 2×, 3+. */
const verseAsReads = (n: number): ChapterReads => ({ times: n, versesRead: n > 0 ? 1 : 0 });

/** Enter or space on a focusable cell acts like a tap. */
const onActivate = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  fn();
};

/**
 * One book: a numbered cell per chapter at the canon grid's depths, and for the chosen
 * chapter a strip of its verses showing which were read and how often. A bottom sheet on
 * mobile, a centered dialog on desktop; closes on esc, the close button, or the scrim.
 */
export function BookSheet({ bookId, chapters, chapter: initialChapter = null, onClose }: Props) {
  const book = getBook(bookId)!;
  const titleId = useId();
  const [chapter, setChapter] = useState<number | null>(initialChapter);
  const [readout, setReadout] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const width = useWidth(body, DEFAULT_WIDTH);

  useSheet(dialog, onClose);

  const hasGuest = useHasGuest();
  const verses = useBookReads(bookId);
  const bookVerses = hasGuest ? verses.data?.chapters.map((c) => c.verses) : verseReads([], bookId);
  // How many notes link to each verse, by chapter.
  const bookNotes = hasGuest ? verses.data?.chapters.map((c) => c.notes) : undefined;
  const chapterHasNotes = (n: number) => !!bookNotes?.[n - 1]?.some((x) => x > 0);

  const read = chapters.filter((c) => c.times >= 1).length;
  const readings = chapters.reduce((sum, c) => sum + c.times, 0);

  // Chapter cells: 40px squares, as many per line as fit.
  const size = 40;
  const gap = 7;
  const cols = Math.max(4, Math.floor((width + gap) / (size + gap)));
  const rows = Math.ceil(book.chapterCount / cols);

  const select = (n: number) => {
    setChapter(n);
    setReadout(`${chapterLabel(bookId, n)} · ${readLabel(chapters[n - 1]!)}`);
  };

  // Above everything, including the tab bar: <main> is its own stacking context.
  return createPortal(
    <>
      <div className={styles.scrim} data-testid="scrim" onClick={onClose} />
      <div ref={dialog} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className={styles.grab} aria-hidden="true" />
        <button type="button" className={styles.close} onClick={onClose}>
          close
        </button>
        <h3 id={titleId}>{book.name}</h3>
        <div className={styles.sub} data-testid="book-sub">
          {read} of {book.chapterCount} chapter{book.chapterCount === 1 ? '' : 's'} read
          {readings > read && ` · ${readings} chapter-readings in all`}
        </div>

        <div ref={body}>
        <svg
          className={styles.chapters}
          role="group"
          aria-label={`chapters of ${book.name}`}
          viewBox={`0 0 ${cols * (size + gap) - gap} ${rows * (size + gap) - gap}`}
        >
          {chapters.map((reads, i) => {
            const n = i + 1;
            const level = chapterLevel(reads);
            const noted = chapterHasNotes(n);
            const label = `${chapterLabel(bookId, n)} · ${readLabel(reads)}${noted ? ' · notes' : ''}`;
            const x = (i % cols) * (size + gap);
            const y = Math.floor(i / cols) * (size + gap);
            return (
              <g
                key={n}
                role="button"
                tabIndex={0}
                aria-label={label}
                aria-pressed={chapter === n}
                data-level={level}
                className={`${styles.ch} ${chapter === n ? styles.on : ''}`}
                onClick={() => select(n)}
                onKeyDown={onActivate(() => select(n))}
                onMouseEnter={() => setReadout(label)}
              >
                <rect className={`${styles.c} ${styles[`l${level}`]}`} x={x} y={y} width={size} height={size} rx={5} />
                <text className={`${styles.cn} ${level >= 3 ? styles.light : ''}`} x={x + size / 2} y={y + size / 2 + 4} textAnchor="middle">
                  {n}
                </text>
                {noted && <circle className={styles.noteMark} data-note-chapter={n} cx={x + size - 6} cy={y + 6} r={2.6} />}
              </g>
            );
          })}
        </svg>

        {chapter !== null && (
          <VerseStrip
            bookId={bookId}
            chapter={chapter}
            verses={bookVerses?.[chapter - 1]}
            notes={bookNotes?.[chapter - 1]}
            error={hasGuest && verses.error ? verses.error.message : null}
            width={width}
            onReadout={setReadout}
          />
        )}
        </div>

        <p className={styles.status} data-testid="sheet-status">
          {readout ?? (chapter === null ? 'tap a chapter to see its verses' : ' ')}
        </p>
      </div>
    </>,
    document.body,
  );
}

interface StripProps {
  bookId: number;
  chapter: number;
  /** Read count of each verse; undefined while loading. */
  verses: readonly number[] | undefined;
  /** How many notes link to each verse; undefined while loading. */
  notes?: readonly number[];
  error: string | null;
  width: number;
  onReadout(text: string): void;
}

/** One small cell per verse of a chapter, wrapping to the sheet's width, deeper for verses read more. */
function VerseStrip({ bookId, chapter, verses, notes, error, width, onReadout }: StripProps) {
  // The tapped verse with notes, whose notes show under the strip.
  const [noteVerse, setNoteVerse] = useState<number | null>(null);
  useEffect(() => setNoteVerse(null), [chapter]);
  const name = chapterLabel(bookId, chapter);
  const size = 14;
  const gap = 4;
  const cols = Math.max(10, Math.floor((width + gap) / (size + gap)));
  const read = verses?.filter((n) => n > 0).length ?? 0;

  // In a long book (Psalms) the strip starts below the fold; bring it up when a chapter is picked.
  const strip = useRef<HTMLElement>(null);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    strip.current?.scrollIntoView?.({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [chapter, verses === undefined]);

  /** The verse under a pointer event, from the cell's data-v. */
  const describe = (target: EventTarget) => {
    const v = target instanceof Element ? target.getAttribute('data-v') : null;
    if (v === null || !verses) return null;
    const count = notes?.[Number(v) - 1] ?? 0;
    const noted = count ? ` · ${count} note${count === 1 ? '' : 's'}` : '';
    onReadout(`${verseLabel(bookId, chapter, Number(v))} · ${readLabel(verseAsReads(verses[Number(v) - 1]!))}${noted}`);
    return Number(v);
  };
  const tap = (target: EventTarget) => {
    const v = describe(target);
    if (v !== null) setNoteVerse(notes?.[v - 1] ? v : null);
  };

  return (
    <section ref={strip} className={styles.verses} aria-label={`verses of ${name}`}>
      <h4>{name.toLowerCase()}</h4>
      {error ? (
        <p className="empty">{error}</p>
      ) : !verses ? (
        <div className={styles.sub}>·</div>
      ) : (
        <>
          <div className={styles.sub} data-testid="verse-sub">
            {read} of {verses.length} verse{verses.length === 1 ? '' : 's'} read
          </div>
          <svg
            role="img"
            aria-label={`${read} of ${verses.length} verses of ${name} read`}
            viewBox={`0 0 ${cols * (size + gap) - gap} ${Math.ceil(verses.length / cols) * (size + gap) - gap}`}
            onMouseOver={(e) => describe(e.target)}
            onClick={(e) => tap(e.target)}
          >
            <g className={styles.cells}>
              {verses.map((n, i) => {
                const level = chapterLevel(verseAsReads(n));
                return (
                  <rect
                    key={i}
                    data-v={i + 1}
                    data-reads={n}
                    className={`${styles.c} ${styles[`l${level}`]}`}
                    x={(i % cols) * (size + gap)}
                    y={Math.floor(i / cols) * (size + gap)}
                    width={size}
                    height={size}
                    rx={2}
                  >
                    <title>{`${verseLabel(bookId, chapter, i + 1)} · ${readLabel(verseAsReads(n))}`}</title>
                  </rect>
                );
              })}
            </g>
            <g aria-hidden="true">
              {notes?.map((count, i) =>
                count > 0 ? (
                  <circle
                    key={i}
                    className={styles.noteMark}
                    data-note-verse={i + 1}
                    cx={(i % cols) * (size + gap) + size / 2}
                    cy={Math.floor(i / cols) * (size + gap) + size + 1.6}
                    r={1.5}
                  />
                ) : null,
              )}
            </g>
          </svg>
          {notes?.some((n) => n > 0) && noteVerse === null && <div className={styles.sub}>dotted verses have notes · tap one</div>}
          {noteVerse !== null && <VerseNotes bookId={bookId} chapter={chapter} verse={noteVerse} />}
        </>
      )}
    </section>
  );
}

/** The notes linked to one verse, read-only, oldest first. */
function VerseNotes({ bookId, chapter, verse }: { bookId: number; chapter: number; verse: number }) {
  const notes = useChapterNotes(bookId, chapter);
  const id = getChapter(bookId, chapter)!.firstVerseId + verse - 1;
  const today = localDate(new Date(), browserTimezone());
  const touching = notes.data?.filter((n) => n.ranges.some((r) => r.start <= id && id <= r.end));
  const name = verseLabel(bookId, chapter, verse);
  return (
    <section className={styles.verseNotes} aria-label={`notes on ${name}`}>
      <h4>notes on {name.toLowerCase()}</h4>
      {notes.error ? (
        <p className="empty">{notes.error.message}</p>
      ) : !touching ? (
        <div className={styles.sub}>·</div>
      ) : (
        <ul>
          {touching.map((n) => (
            <li key={n.id}>
              <div className={styles.noteMeta}>
                {dayLabel(n.writtenOn, today)} · {n.versesDisplay}
              </div>
              <Markdown>{n.body}</Markdown>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
