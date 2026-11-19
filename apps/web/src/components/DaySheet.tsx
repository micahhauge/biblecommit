'use client';

import { dayLabel } from '@biblecommit/core';
import { useState } from 'react';
import { useCommitsOn, useDeleteCommit } from '@/commits';
import { Notes } from './Notes';
import { ReadList } from './ReadList';
import { Sheet } from './Sheet';
import styles from './DaySheet.module.css';
import { useHasUser } from '@/session';

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
  const hasUser = useHasUser();
  const commits = useCommitsOn(date);
  const deletion = useDeleteCommit();
  // Oldest first, as on Today.
  const list = hasUser ? commits.data && [...commits.data].reverse() : [];
  // A commit's "note" starts a note here with its passage.
  const [notePrefill, setNotePrefill] = useState(prefill ?? null);
  const [error, setError] = useState<string | null>(null);
  const verses = list?.reduce((n, c) => n + c.verseCount, 0) ?? 0;

  return (
    <Sheet title={dayLabel(date, today)} onClose={onClose} className={styles.full}>
        <div className={styles.sub}>
          {longDate(date)}
          {list && list.length > 0 && ` · ${verses.toLocaleString()} verse${verses === 1 ? '' : 's'}`}
        </div>

        <h4 className={styles.heading}>read</h4>
        {commits.error && hasUser ? (
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
    </Sheet>
  );
}
