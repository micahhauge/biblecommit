'use client';

import { BOOKS, CHAPTERS, chapterLabel, getBook, getChapter, chapterLevel, chapterReads, coverage, readLabel, SECTIONS, TOTAL_CHAPTERS, type ChapterReads } from '@biblecommit/core';
import { useRef, useState } from 'react';
import { useHasGuest } from '@/guest';
import { useCanon, type Canon } from '@/me';
import { useWidth } from '@/use-width';
import { BookSheet } from './BookSheet';
import styles from './CanonOverview.module.css';

/** Before the first commit: the whole canon, unread, without a request. */
function emptyCanon(): Canon {
  const chapters = chapterReads([]);
  return { chapters, ...coverage(chapters) };
}

/** Width assumed until the grid has been measured (server render, tests). */
const DEFAULT_WIDTH = 720;

/** The grid's geometry for a container `width` px wide, in SVG units (1 unit = 1 px). */
function layout(width: number) {
  const w = Math.max(300, width);
  const small = w < 560;
  const label = small ? 92 : 118;
  const step = small ? 10 : 11;
  // Chapters per line before a book wraps: Psalms (150) takes a few lines.
  const perLine = Math.max(10, Math.min(60, Math.floor((w - label) / step)));
  return { small, label, step, cell: step - 2, perLine };
}

const percent = (fraction: number) => (fraction === 0 ? '0%' : `${(fraction * 100).toFixed(1)}%`);

/**
 * Coverage of the canon, and a grid of every chapter: one row per book (wrapping to the
 * screen width), grouped by section. Deeper wash for chapters read more times; partly
 * read chapters sit lighter than 1×. Hover (or tap) a chapter for e.g. "Genesis 12 · read 2×".
 */
export function CanonOverview() {
  const hasGuest = useHasGuest();
  const canon = useCanon();
  const data = hasGuest ? canon.data : emptyCanon();
  const [active, setActive] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box, DEFAULT_WIDTH);
  /** The book open in the sheet, and the chapter to show first. */
  const [open, setOpen] = useState<{ bookId: number; chapter: number | null } | null>(null);

  const chapters = data?.chapters ?? [];
  const { small, label, step, cell, perLine } = layout(width);

  const texts: React.ReactNode[] = [];
  const cells: React.ReactNode[] = [];
  let y = 0;
  let section: string | undefined;
  let chapterId = 0;
  for (const book of BOOKS) {
    if (book.section !== section) {
      y += section ? 22 : 6;
      section = book.section;
      texts.push(
        <text key={section} className={styles.sec} x={0} y={y}>
          {SECTIONS.find((s) => s.id === section)!.name.toLowerCase()}
        </text>,
      );
      y += 10;
    }
    texts.push(
      <text
        key={book.id}
        data-book={book.id}
        role="button"
        tabIndex={0}
        aria-label={`open ${book.name}`}
        className={styles.bk}
        x={label - 10}
        y={y + cell - 0.5}
        textAnchor="end"
        style={{ fontSize: small ? 11 : 12.5 }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          setOpen({ bookId: book.id, chapter: null });
        }}
      >
        {book.name}
      </text>,
    );
    for (let n = 1; n <= book.chapterCount; n++, chapterId++) {
      const reads = chapters[chapterId];
      if (!reads) continue;
      const level = chapterLevel(reads);
      cells.push(
        <rect
          key={chapterId}
          data-i={chapterId}
          data-level={level}
          className={`${styles.c} ${styles[`l${level}`]}`}
          x={label + ((n - 1) % perLine) * step}
          y={y + Math.floor((n - 1) / perLine) * step}
          width={cell}
          height={cell}
          rx={2}
        >
          <title>{describe(chapterId, reads)}</title>
        </rect>,
      );
    }
    y += Math.ceil(book.chapterCount / perLine) * step + 3;
  }

  /** The chapter under a pointer event, from the cell's data-i. */
  const chapterAt = (target: EventTarget) => {
    const i = target instanceof Element ? target.getAttribute('data-i') : null;
    return i === null ? null : Number(i);
  };
  const activeReads = active === null ? undefined : chapters[active];

  const unread = data?.chaptersRead === 0 && chapters.every((c) => c.versesRead === 0);

  return (
    <section aria-labelledby="canon-heading">
      <h2 id="canon-heading">canon</h2>
      {canon.error && hasGuest ? (
        <p className="empty">{canon.error.message}</p>
      ) : (
        <div className={styles.covrow}>
          <div>
            <div className={styles.big} data-testid="coverage">
              {data ? percent(data.coverage) : '·'}
            </div>
            <div className={styles.sub} data-testid="coverage-sub">
              of the canon read
              <br />
              {data &&
                (data.chaptersRead
                  ? `${data.chaptersRead.toLocaleString()} of ${TOTAL_CHAPTERS.toLocaleString()} chapters`
                  : `${TOTAL_CHAPTERS.toLocaleString()} chapters await`)}
            </div>
          </div>
          {!!data?.readMoreThanOnce && (
            <div className={`${styles.sub} ${styles.right}`} data-testid="read-again">
              {data.readMoreThanOnce.toLocaleString()} chapter{data.readMoreThanOnce === 1 ? '' : 's'}
              <br />
              read more than once
            </div>
          )}
        </div>
      )}
      {unread && <p className="empty">Nothing read yet. Your canon fills in as you commit.</p>}
      <div ref={box} className={styles.grid}>
        {data && (
          <svg
            role="img"
            aria-label={`every chapter of the bible: ${data.chaptersRead} of ${TOTAL_CHAPTERS} read`}
            viewBox={`0 0 ${label + perLine * step} ${y}`}
            onMouseOver={(e) => setActive(chapterAt(e.target))}
            onMouseLeave={() => setActive(null)}
            onClick={(e) => {
              const i = chapterAt(e.target);
              setActive(i);
              if (i !== null) setOpen({ bookId: CHAPTERS[i]!.bookId, chapter: CHAPTERS[i]!.number });
              const book = e.target instanceof Element ? e.target.getAttribute('data-book') : null;
              if (book !== null) setOpen({ bookId: Number(book), chapter: null });
            }}
          >
            {texts}
            <g className={styles.cells}>{cells}</g>
          </svg>
        )}
      </div>
      <p className={styles.status} data-testid="canon-status">
        {activeReads && active !== null ? describe(active, activeReads) : ' '}
      </p>
      {open && (
        <BookSheet
          key={open.bookId}
          bookId={open.bookId}
          chapter={open.chapter}
          chapters={bookChapters(chapters, open.bookId)}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}

/** One book's slice of the per-chapter reads. */
function bookChapters(chapters: readonly ChapterReads[], bookId: number) {
  const first = getChapter(bookId, 1)!.id - 1;
  return chapters.slice(first, first + getBook(bookId)!.chapterCount);
}

/** "Genesis 12 · read 2×" for the chapter at index `i` (chapter ID − 1). */
function describe(i: number, reads: ChapterReads) {
  const chapter = CHAPTERS[i]!;
  return `${chapterLabel(chapter.bookId, chapter.number)} · ${readLabel(reads)}`;
}
