'use client';

import { dayLabel, localDate, parse } from '@biblecommit/core';
import { useEffect, useRef, useState } from 'react';
import { useCommit, useDeleteCommit, useRecentCommits, type Commit } from '@/commits';
import { browserTimezone, useHasGuest } from '@/guest';
import { Streak } from './Streak';
import styles from './Today.module.css';
import { YearHeatmap } from './YearHeatmap';

const EXAMPLES = ['john 1', 'psalm 23', 'gen 1-3'];

function today() {
  return localDate(new Date(), browserTimezone());
}

/** How long the commit animation (ink sinking, pigment bloom) runs. */
const INK_MS = 1800;

/** How long "undo" stays up after a commit (unless another commit replaces it). */
const UNDO_MS = 6000;

/** What the preview line shows after a commit, until the input is edited. */
type Outcome = { kind: 'committed' } | { kind: 'failed'; message: string };

const finePointer = () => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;

export function Today() {
  const hasGuest = useHasGuest();
  const recent = useRecentCommits();
  // The commit that just landed; its row in the recent list washes in.
  const [freshId, setFreshId] = useState<string | null>(null);
  // The latest commit, while it can still be undone.
  const [undoable, setUndoable] = useState<Commit | null>(null);
  const commit = useCommit({
    onSaved: (c) => {
      setFreshId(c.id);
      setUndoable(c);
    },
  });
  const deletion = useDeleteCommit();
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
    setUndoable(null);
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

  function deleteCommit(id: string) {
    setUndoable((u) => (u?.id === id ? null : u));
    deletion.mutate(id, { onError: (e) => setOutcome({ kind: 'failed', message: e.message }) });
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

      <Streak />

      <YearHeatmap />

      {undoable && <UndoToast key={undoable.id} commit={undoable} onUndo={() => deleteCommit(undoable.id)} onExpire={() => setUndoable(null)} />}

      {!isNew && (
        <section>
          <h2>recent commits</h2>
          {recent.error ? (
            <p className="empty">{recent.error.message}</p>
          ) : (
            <ul aria-label="recent commits" className={styles.log}>
              {recent.data?.map((c) => (
                <CommitRow key={c.id} commit={c} fresh={c.id === freshId} onDelete={() => deleteCommit(c.id)} />
              ))}
            </ul>
          )}
          {recent.hasNextPage && (
            <button type="button" className={styles.more} disabled={recent.isFetchingNextPage} onClick={() => recent.fetchNextPage()}>
              {recent.isFetchingNextPage ? 'loading…' : 'load more'}
            </button>
          )}
        </section>
      )}
    </>
  );
}

/** "John 3 committed · undo", for UNDO_MS after a commit. Remount (new key) to restart the clock. */
function UndoToast({ commit, onUndo, onExpire }: { commit: Commit; onUndo: () => void; onExpire: () => void }) {
  const expire = useRef(onExpire);
  expire.current = onExpire;
  useEffect(() => {
    const t = setTimeout(() => expire.current(), UNDO_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={styles.toast} aria-live="polite">
      <span>{commit.display} committed</span>
      <button type="button" onClick={onUndo}>
        undo
      </button>
    </div>
  );
}

/** One recent commit. × asks "delete?" in place; only "yes" deletes. */
function CommitRow({ commit, fresh, onDelete }: { commit: Commit; fresh: boolean; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li className={fresh ? styles.fresh : undefined}>
      <span className={styles.when}>{dayLabel(commit.readOn, today())}</span>
      <span className={styles.passage} data-testid="passage">
        {commit.display}
      </span>
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
        <button type="button" className={styles.x} aria-label={`delete ${commit.display}`} onClick={() => setConfirming(true)}>
          ×
        </button>
      )}
    </li>
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
