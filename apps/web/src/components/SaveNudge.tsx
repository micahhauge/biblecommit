'use client';

import { useSyncExternalStore } from 'react';
import { signIn, useHasUser, useSignedIn } from '@/session';
import styles from './Streak.module.css';

const KEY = 'biblecommit.saveNudgeDismissed';
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function dismiss() {
  localStorage.setItem(KEY, '1');
  listeners.forEach((l) => l());
}

/**
 * "Sign in to save", once a guest has committed (a guest only exists after the first commit).
 * Dismissed for good with ×; never shown when signed in.
 */
export function SaveNudge() {
  const signedIn = useSignedIn();
  const hasUser = useHasUser();
  const dismissed = useSyncExternalStore(subscribe, () => localStorage.getItem(KEY) !== null, () => true);
  if (signedIn || !hasUser || dismissed) return null;
  return (
    <p role="note" className={styles.nudge}>
      <span>
        your reading lives in this browser.{' '}
        <button type="button" className={styles.nudgeLink} onClick={signIn}>
          sign in to save it
        </button>
      </span>
      <button type="button" className={styles.nudgeX} aria-label="dismiss" onClick={dismiss}>
        ×
      </button>
    </p>
  );
}
