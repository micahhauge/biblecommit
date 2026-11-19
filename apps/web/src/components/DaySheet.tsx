'use client';

import { dayLabel } from '@biblecommit/core';
import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useCommitsOn } from '@/commits';
import { useHasGuest } from '@/guest';
import { useSheet } from '@/use-sheet';
import sheet from './BookSheet.module.css';
import { Notes } from './Notes';
import styles from './DaySheet.module.css';

interface Props {
  /** The local date to show. */
  date: string;
  /** The user's local today, for labels like "yesterday". */
  today: string;
  /** Open a new note with these verses filled in. */
  prefill?: { verses: string; key: number } | null;
  onClose(): void;
}

/** "wednesday, november 18, 2026" */
function longDate(date: string) {
  return new Date(`${date}T00:00:00Z`)
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .toLowerCase();
}

/** One day: what was committed, and its notes (read, write, edit). A sheet like the book sheet. */
export function DaySheet({ date, today, prefill, onClose }: Props) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  useSheet(dialog, onClose);
  const hasGuest = useHasGuest();
  const commits = useCommitsOn(date);
  const list = hasGuest ? commits.data : [];
  const verses = list?.reduce((n, c) => n + c.verseCount, 0) ?? 0;

  return createPortal(
    <>
      <div className={sheet.scrim} data-testid="scrim" onClick={onClose} />
      <div ref={dialog} className={`${sheet.sheet} ${styles.full}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className={sheet.grab} aria-hidden="true" />
        <button type="button" className={sheet.close} onClick={onClose}>
          close
        </button>
        <h3 id={titleId}>{dayLabel(date, today)}</h3>
        <div className={sheet.sub}>
          {longDate(date)}
          {list && list.length > 0 && ` · ${verses.toLocaleString()} verse${verses === 1 ? '' : 's'}`}
        </div>

        <h4 className={styles.heading}>read</h4>
        {commits.error && hasGuest ? (
          <p className="empty">{commits.error.message}</p>
        ) : !list ? (
          <p className={styles.quiet}>·</p>
        ) : list.length === 0 ? (
          <p className={styles.quiet}>nothing committed</p>
        ) : (
          <ul aria-label={`read on ${date}`} className={styles.read}>
            {list.map((c) => (
              <li key={c.id}>{c.display}</li>
            ))}
          </ul>
        )}

        <Notes date={date} heading="h4" prefill={prefill} />
      </div>
    </>,
    document.body,
  );
}
