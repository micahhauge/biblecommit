'use client';

import { dayLabel } from '@biblecommit/core';
import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCommitsOn, useDeleteCommit } from '@/commits';
import { useHasGuest } from '@/guest';
import { useSheet } from '@/use-sheet';
import sheet from './BookSheet.module.css';
import { Notes } from './Notes';
import { ReadList } from './ReadList';
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
  const deletion = useDeleteCommit();
  // Oldest first, as on Today.
  const list = hasGuest ? commits.data && [...commits.data].reverse() : [];
  // A commit's "note" starts a note here with its passage.
  const [notePrefill, setNotePrefill] = useState(prefill ?? null);
  const [error, setError] = useState<string | null>(null);
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
          <ReadList
            label={`read on ${date}`}
            commits={list}
            onDelete={(c) => {
              setError(null);
              deletion.mutate(c.id, { onError: (e) => setError(e.message) });
            }}
            onNote={(c) => setNotePrefill({ verses: c.display, key: Date.now() })}
          />
        )}
        {error && <p className={styles.quiet}>? {error}</p>}

        <Notes date={date} heading="h4" prefill={notePrefill} />
      </div>
    </>,
    document.body,
  );
}
