'use client';

import { dayLabel, localDate, parse } from '@biblecommit/core';
import { useEffect, useRef, useState } from 'react';
import { useCommit, useRecentCommits } from '@/commits';
import { browserTimezone, useHasGuest } from '@/guest';
import styles from './Today.module.css';

const EXAMPLES = ['john 1', 'psalm 23', 'gen 1-3'];

function today() {
  return localDate(new Date(), browserTimezone());
}

/** How long the commit animation (ink sinking, pigment bloom) runs. */
const INK_MS = 1800;

/** What the preview line shows after a commit, until the input is edited. */
type Outcome = { kind: 'committed' } | { kind: 'failed'; message: string };

const finePointer = () => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;

export function Today() {
  const hasGuest = useHasGuest();
  const recent = useRecentCommits();
  // The commit that just landed; its row in the recent list washes in.
  const [freshId, setFreshId] = useState<string | null>(null);
  const commit = useCommit({ onSaved: (c) => setFreshId(c.id) });
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [lastCommitted, setLastCommitted] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // The text being committed, replayed as ink sinking into the page.
  const [ink, setInk] = useState<{ key: number; text: string } | null>(null);

  const parsed = text.trim() ? parse(text, { today: today() }) : null;
  const isNew = !hasGuest || (recent.isSuccess && recent.data.length === 0);

  // Desktop: focus on load, and typing anywhere lands in the input.
  useEffect(() => {
    if (finePointer()) inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function edit(value: string) {
    setText(value);
    setOutcome(null);
  }

  function submit() {
    if (!parsed?.ok || commit.isPending) return;
    const raw = text;
    commit.mutate(raw, {
      onSuccess: () => setOutcome({ kind: 'committed' }),
      onError: (e) => {
        setText(raw);
        setOutcome({ kind: 'failed', message: e.message });
      },
    });
    setLastCommitted(raw);
    setInk({ key: Date.now(), text: raw });
    setText('');
    setOutcome(null);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      submit();
      if (!finePointer()) e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      edit('');
    } else if (e.key === 'ArrowUp' && lastCommitted) {
      e.preventDefault();
      edit(lastCommitted);
    }
  }

  return (
    <>
      <section className={styles.entry}>
        <div className={styles.inrow}>
          {ink && <CommitInk key={ink.key} text={ink.text} onDone={() => setInk(null)} />}
          <input
            ref={inputRef}
            className={ink ? `${styles.input} ${styles.inking}` : styles.input}
            aria-label="what did you read today?"
            placeholder="what did you read today?"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="done"
            value={text}
            onChange={(e) => edit(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {parsed?.ok && (
            <button
              type="button"
              className={styles.commitBtn}
              onClick={() => {
                submit();
                inputRef.current?.blur();
              }}
            >
              commit ↵
            </button>
          )}
        </div>
        <div role="status" className={styles.preview}>
          {outcome?.kind === 'failed' ? (
            <span className={styles.err}>? {outcome.message}</span>
          ) : outcome?.kind === 'committed' ? (
            <span className={styles.done}>
              <svg className={styles.tick} viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2.5 8.8l3.6 3.4L13.5 4" />
              </svg>
              <span className={styles.doneText}>committed.</span>
            </span>
          ) : parsed?.ok ? (
            <span className={styles.ok}>✓ {parsed.summary}</span>
          ) : parsed ? (
            <span className={styles.err}>? {parsed.error}</span>
          ) : null}
        </div>
        {isNew && !text && (
          <div role="group" aria-label="examples" className={styles.tries}>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  edit(ex);
                  inputRef.current?.focus();
                }}
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </section>

      {!isNew && (
        <section>
          <h2>recent commits</h2>
          {recent.error ? (
            <p className="empty">{recent.error.message}</p>
          ) : (
            <ul aria-label="recent commits" className={styles.log}>
              {recent.data?.map((c) => (
                <li key={c.id} className={c.id === freshId ? styles.fresh : undefined}>
                  <span className={styles.when}>{dayLabel(c.readOn, today())}</span>
                  <span className={styles.passage}>{c.display}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

/** The committed text dissolving into the paper over a spreading pigment bloom. Decorative only. */
function CommitInk({ text, onDone }: { text: string; onDone: () => void }) {
  // Typing re-renders Today with a new onDone; the timer should still run once from mount.
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => done.current(), INK_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={styles.ink} aria-hidden="true">
      <span className={styles.bloom} />
      <span className={styles.ghost}>
        {[...text.trim()].map((ch, i) => (
          <span key={i} style={{ '--i': Math.min(i, 40) } as React.CSSProperties}>
            {ch}
          </span>
        ))}
      </span>
    </div>
  );
}
