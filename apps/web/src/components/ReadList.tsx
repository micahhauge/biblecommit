'use client';

import { useState } from 'react';
import type { Commit } from '@/commits';
import styles from './ReadList.module.css';

interface Props {
  /** Accessible name, e.g. "read today". */
  label: string;
  /** The day's commits, oldest first. */
  commits: readonly Commit[];
  /** The commit that just landed; it washes in. */
  freshId?: string | null;
  onDelete(commit: Commit): void;
  /** Start a note with this commit's passage. */
  onNote(commit: Commit): void;
}

/** One day's readings: each passage, with "note" and × (inline "delete?" confirm). */
export function ReadList({ label, commits, freshId, onDelete, onNote }: Props) {
  return (
    <ul aria-label={label} className={styles.read}>
      {commits.map((c) => (
        <ReadRow key={c.id} commit={c} fresh={c.id === freshId} onDelete={() => onDelete(c)} onNote={() => onNote(c)} />
      ))}
    </ul>
  );
}

function ReadRow({ commit, fresh, onDelete, onNote }: { commit: Commit; fresh: boolean; onDelete(): void; onNote(): void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li className={fresh ? styles.fresh : undefined}>
      <span className={styles.passage} data-testid="passage">
        {commit.display}
      </span>
      <span className={styles.count}>{commit.verseCount.toLocaleString()} v</span>
      {confirming ? (
        <span className={styles.confirm}>
          delete?
          <button type="button" onClick={onDelete}>
            yes
          </button>
          <button type="button" autoFocus onClick={() => setConfirming(false)}>
            no
          </button>
        </span>
      ) : (
        <span className={styles.actions}>
          <button type="button" aria-label={`note on ${commit.display}`} onClick={onNote}>
            note
          </button>
          <button type="button" aria-label={`delete ${commit.display}`} onClick={() => setConfirming(true)}>
            ×
          </button>
        </span>
      )}
    </li>
  );
}
