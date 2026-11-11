'use client';

import { useState } from 'react';
import { useMode, useResolvedMode, useSetMode } from '@/mode';
import { MODES, type ModePref } from '@/mode-pref';
import styles from './ModeControls.module.css';
import { Sheet } from './Sheet';

/** Flips between dark and light (whatever "system" currently shows counts as that). */
export function ModeToggle({ initial }: { initial: ModePref }) {
  const next = useResolvedMode(initial) === 'dark' ? 'light' : 'dark';
  const setMode = useSetMode();
  return (
    <button type="button" className={styles.hbtn} aria-label={`switch to ${next} mode`} onClick={() => setMode(next)}>
      <svg viewBox="0 0 16 16" aria-hidden="true" className={styles.modeIcon}>
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8 1.5a6.5 6.5 0 0 1 0 13z" />
      </svg>
      <span>{next}</span>
    </button>
  );
}

/** The settings button and its sheet. Mode is the only setting in v1. */
export function Settings({ initial }: { initial: ModePref }) {
  const [open, setOpen] = useState(false);
  const mode = useMode(initial);
  const setMode = useSetMode();
  return (
    <>
      <button type="button" className={styles.hbtn} aria-label="settings" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 16 16" aria-hidden="true" className={styles.setIcon}>
          <path d="M2 4h12M2 8h12M2 12h12" />
          <circle cx="5" cy="4" r="1.6" />
          <circle cx="11" cy="8" r="1.6" />
          <circle cx="7" cy="12" r="1.6" />
        </svg>
        <span>settings</span>
      </button>
      {open && (
        <Sheet title="Settings" onClose={() => setOpen(false)}>
          <h4>appearance</h4>
          <div className={styles.set}>
            <span id="mode-label">mode</span>
            <div role="group" aria-labelledby="mode-label" className={styles.seg}>
              {MODES.map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} className={mode === m ? styles.on : undefined} onClick={() => setMode(m)}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
