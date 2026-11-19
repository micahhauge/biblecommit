'use client';

import { NOTE_MAX_LENGTH, parseVerses, readingsAsVerses } from '@biblecommit/core';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useCommitsOn } from '@/commits';
import { useHasGuest } from '@/guest';
import { useToday } from '@/me';
import {
  clearDraft,
  loadDraft,
  saveDraft,
  useCreateNote,
  useDeleteNote,
  useNotesOn,
  useRestoreNote,
  useUpdateNote,
  type Note,
  type NoteDraft,
} from '@/notes';
import { Markdown } from './Markdown';
import styles from './Notes.module.css';

/** How long "undo" stays up after deleting a note. */
const UNDO_MS = 6000;

/** Show the character count once a note gets this close to the limit. */
const COUNT_FROM = NOTE_MAX_LENGTH - 2000;

const isMac = () => typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform);

interface Props {
  /** The local date the notes are written on. */
  date: string;
  /** Section heading level: a page section (Today) or inside a sheet. */
  heading: 'h2' | 'h4';
  /** Open a new note with this verses field filled in (from a commit's "note" action). Changes reopen it. */
  prefill?: { verses: string; key: number } | null;
}

/** A day's notes: each rendered, with edit and delete, and "+ note" to write another. */
export function Notes({ date, heading: Heading, prefill }: Props) {
  const hasGuest = useHasGuest();
  const notes = useNotesOn(date);
  const create = useCreateNote();
  const update = useUpdateNote();
  const deletion = useDeleteNote();
  const restore = useRestoreNote();
  // 'new', the id of the note being edited, or nothing.
  const [editing, setEditing] = useState<string | null>(null);
  const [newSeed, setNewSeed] = useState<NoteDraft | null>(null);
  const [deleted, setDeleted] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headingId = useId();

  useEffect(() => {
    if (!prefill) return;
    setNewSeed({ body: '', verses: prefill.verses });
    setEditing('new');
  }, [prefill]);

  const list = hasGuest ? (notes.data ?? []) : [];
  // A new note is about everything read that day, unless a draft or a commit says otherwise.
  // Today's commits come with the streak (already loaded on Today); other days are fetched.
  const summary = useToday();
  const isToday = summary.data?.today === date;
  const dayCommits = useCommitsOn(date, summary.isSuccess && !isToday);
  const commitsThatDay = isToday ? summary.data?.commits : dayCommits.data;
  const readThatDay = readingsAsVerses((hasGuest ? (commitsThatDay ?? []) : []).map((c) => c.display));
  const newSlot = `new.${date}`;

  function openNew() {
    setNewSeed(null);
    setEditing('new');
  }

  function remove(note: Note) {
    setError(null);
    setDeleted(note);
    deletion.mutate(note.id, {
      onError: (e) => {
        setDeleted(null);
        setError(e.message);
      },
    });
  }

  return (
    <section aria-labelledby={headingId} className={styles.notes}>
      <Heading id={headingId} className={Heading === 'h4' ? styles.sheetHeading : undefined}>
        notes
      </Heading>
      {notes.error && hasGuest ? <p className="empty">{notes.error.message}</p> : null}
      {list.length > 0 && (
        <ul aria-label={`notes on ${date}`} className={styles.list}>
          {list.map((note) =>
            editing === note.id ? (
              <li key={note.id}>
                <NoteEditor
                  slot={`edit.${note.id}`}
                  initial={{ body: note.body, verses: note.verses }}
                  pending={update.isPending}
                  onCancel={() => setEditing(null)}
                  onSave={(draft, done) =>
                    update.mutate({ id: note.id, draft }, { onSuccess: () => (done(), setEditing(null)) })
                  }
                  error={update.error?.message}
                />
              </li>
            ) : (
              <NoteItem key={note.id} note={note} onEdit={() => (update.reset(), setEditing(note.id))} onDelete={() => remove(note)} />
            ),
          )}
        </ul>
      )}
      {error && <p className={styles.err}>? {error}</p>}
      {editing === 'new' ? (
        <NoteEditor
          key={newSeed ? `seed.${prefill?.key}` : 'blank'}
          slot={newSlot}
          initial={newSeed ?? { body: '', verses: readThatDay }}
          seeded={!!newSeed}
          pending={create.isPending}
          onCancel={() => setEditing(null)}
          onSave={(draft, done) =>
            create.mutate({ writtenOn: date, draft }, { onSuccess: () => (done(), setEditing(null)) })
          }
          error={create.error?.message}
        />
      ) : (
        <button type="button" className={styles.add} onClick={() => (create.reset(), openNew())}>
          + note
        </button>
      )}
      {deleted &&
        createPortal(
          <UndoToast
            key={deleted.id}
            onUndo={() => {
              restore.mutate(deleted.id, { onError: (e) => setError(e.message) });
              setDeleted(null);
            }}
            onExpire={() => setDeleted(null)}
          />,
          document.body,
        )}
    </section>
  );
}

/** One saved note: its verses, the rendered body, and edit / delete (with an inline confirm). */
function NoteItem({ note, onEdit, onDelete }: { note: Note; onEdit: () => void; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const label = note.title || 'note';
  return (
    <li className={styles.note} aria-label={label}>
      {note.versesDisplay && <div className={styles.verses}>{note.versesDisplay}</div>}
      <Markdown>{note.body}</Markdown>
      <div className={styles.actions}>
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
          <>
            <button type="button" aria-label={`edit ${label}`} onClick={onEdit}>
              edit
            </button>
            <button type="button" aria-label={`delete ${label}`} onClick={() => setConfirming(true)}>
              ×
            </button>
          </>
        )}
      </div>
    </li>
  );
}

interface EditorProps {
  /** Where the unsaved draft is kept (localStorage), so a reload doesn't lose it. */
  slot: string;
  initial: NoteDraft;
  /** The initial values were handed in (a commit's verses) and beat any stored draft. */
  seeded?: boolean;
  pending: boolean;
  error?: string;
  /** Call `done` once saved, to drop the draft. */
  onSave(draft: NoteDraft, done: () => void): void;
  onCancel(): void;
}

/**
 * Markdown in a plain textarea, plus an optional verses field read by the commit parser.
 * ⌘/ctrl+enter saves; esc cancels (and drops the draft). While it's open, it owns typing.
 */
export function NoteEditor({ slot, initial, seeded, pending, error, onSave, onCancel }: EditorProps) {
  const [draft, setDraft] = useState<NoteDraft>(() => (!seeded && loadDraft(slot)) || initial);
  const body = useRef<HTMLTextAreaElement>(null);
  const verses = parseVerses(draft.verses);
  const blank = draft.body.trim() === '';
  const tooLong = draft.body.length > NOTE_MAX_LENGTH;
  const canSave = !blank && !tooLong && verses.ok && !pending;

  useEffect(() => {
    const el = body.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  function change(next: Partial<NoteDraft>) {
    const d = { ...draft, ...next };
    setDraft(d);
    saveDraft(slot, d);
  }

  function save() {
    if (!canSave) return;
    onSave({ body: draft.body, verses: draft.verses.trim() }, () => clearDraft(slot));
  }

  function cancel() {
    clearDraft(slot);
    onCancel();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      // Esc is the editor's, not the sheet's.
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      cancel();
    }
  }

  return (
    <div className={styles.editor} data-note-editor="" onKeyDown={onKeyDown}>
      <input
        className={styles.versesInput}
        aria-label="verses"
        placeholder="verses (optional), e.g. rom 8:28-30"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={draft.verses}
        onChange={(e) => change({ verses: e.target.value })}
      />
      <div className={styles.parse} aria-live="polite" data-testid="note-verses-preview">
        {!draft.verses.trim() ? null : verses.ok ? (
          <span className={styles.ok}>✓ {verses.display}</span>
        ) : (
          <span className={styles.err}>? {verses.error}</span>
        )}
      </div>
      <textarea
        ref={body}
        className={styles.body}
        aria-label="note"
        placeholder="write in markdown…"
        rows={6}
        value={draft.body}
        onChange={(e) => change({ body: e.target.value })}
      />
      <div className={styles.bar}>
        <span className={styles.hint}>
          {draft.body.length >= COUNT_FROM && (
            <span className={tooLong ? styles.err : undefined}>
              {draft.body.length.toLocaleString()} / {NOTE_MAX_LENGTH.toLocaleString()}
            </span>
          )}
          {error && <span className={styles.err}>? {error}</span>}
        </span>
        <button type="button" onClick={cancel}>
          cancel
        </button>
        <button type="button" className={styles.save} disabled={!canSave} onClick={save}>
          {pending ? 'saving…' : `save ${isMac() ? '⌘' : 'ctrl '}↵`}
        </button>
      </div>
    </div>
  );
}

/** "note deleted · undo", for UNDO_MS. */
function UndoToast({ onUndo, onExpire }: { onUndo: () => void; onExpire: () => void }) {
  const expire = useRef(onExpire);
  expire.current = onExpire;
  useEffect(() => {
    const t = setTimeout(() => expire.current(), UNDO_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={styles.toast} aria-live="polite">
      <span>note deleted</span>
      <button type="button" onClick={onUndo}>
        undo
      </button>
    </div>
  );
}
