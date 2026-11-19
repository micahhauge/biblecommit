'use client';

import { joinVerses, NOTE_MAX_LENGTH, parseVerses, splitVerses } from '@biblecommit/core';
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useCommitsOn } from '@/commits';
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
import { useHasUser } from '@/session';

/** How long "undo" stays up after deleting a note. */
const UNDO_MS = 6000;

/** Show the character count once a note gets this close to the limit. */
const COUNT_FROM = NOTE_MAX_LENGTH - 2000;

const isMac = () => typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform);

interface Props {
  /** The local date the notes are written on. */
  date: string;
  /** Section heading level: a page section, inside a sheet, or none (inside a day's block). */
  heading: 'h2' | 'h4' | null;
  /** Open a new note with this verses field filled in (from a commit's "note" action). Changes reopen it. */
  prefill?: { verses: string; key: number } | null;
}

/** A day's notes: each rendered, with edit and delete, and "+ note" to write another. */
export function Notes({ date, heading: Heading, prefill }: Props) {
  const hasUser = useHasUser();
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

  const list = hasUser ? (notes.data ?? []) : [];
  // A new note is about everything read that day, unless a draft or a commit says otherwise.
  // Today's commits come with the streak (already loaded on Today); other days are fetched.
  const summary = useToday();
  const isToday = summary.data?.today === date;
  const dayCommits = useCommitsOn(date, summary.isSuccess && !isToday);
  const commitsThatDay = isToday ? summary.data?.commits : dayCommits.data;
  // The day's readings, oldest first, each once: the editor's chips.
  const readings = [...new Set((hasUser ? (commitsThatDay ?? []) : []).map((c) => c.display).reverse())];
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
    <section aria-labelledby={Heading ? headingId : undefined} aria-label={Heading ? undefined : 'notes'} className={styles.notes}>
      {Heading && (
        <Heading id={headingId} className={Heading === 'h4' ? styles.sheetHeading : undefined}>
          notes
        </Heading>
      )}
      {notes.error && hasUser ? <p className="empty">{notes.error.message}</p> : null}
      {list.length > 0 && (
        <ul aria-label={`notes on ${date}`} className={styles.list}>
          {list.map((note) =>
            editing === note.id ? (
              <li key={note.id}>
                <NoteEditor
                  slot={`edit.${note.id}`}
                  initial={{ body: note.body, verses: note.verses }}
                  readings={readings}
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
          initial={newSeed ?? { body: '', verses: '' }}
          seeded={!!newSeed}
          readings={readings}
          allByDefault={!newSeed}
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
      <Clamped>
        <Markdown>{note.body}</Markdown>
      </Clamped>
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

/** Long notes show about six lines, fading out, with "more" to read the rest. */
function Clamped({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [open, setOpen] = useState(false);
  // Measure while clamped; once open, keep the answer.
  useLayoutEffect(() => {
    const el = box.current;
    if (el && !open) setOverflows(el.scrollHeight > el.clientHeight + 1);
  });
  return (
    <>
      <div ref={box} className={`${open ? '' : styles.clampBox} ${overflows && !open ? styles.faded : ''}`}>
        {children}
      </div>
      {overflows && (
        <button type="button" className={styles.more} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'less' : 'more'}
        </button>
      )}
    </>
  );
}

interface EditorProps {
  /** Where the unsaved draft is kept (localStorage), so a reload doesn't lose it. */
  slot: string;
  initial: NoteDraft;
  /** The initial values were handed in (a commit's verses) and beat any stored draft. */
  seeded?: boolean;
  /** The day's readings (normalized passages, oldest first), offered as one-click chips. */
  readings: readonly string[];
  /** A fresh new note: select every reading, including ones that load after it opens, until touched. */
  allByDefault?: boolean;
  pending: boolean;
  error?: string;
  /** Call `done` once saved, to drop the draft. */
  onSave(draft: NoteDraft, done: () => void): void;
  onCancel(): void;
}

/**
 * Markdown in a plain textarea. Verses are the day's readings as chips (click to toggle)
 * plus optional other verses typed for the commit parser.
 * ⌘/ctrl+enter saves; esc cancels (and drops the draft). While it's open, it owns typing.
 */
export function NoteEditor({ slot, initial, seeded, readings, allByDefault, pending, error, onSave, onCancel }: EditorProps) {
  const [start] = useState(() => {
    const draft = !seeded && loadDraft(slot);
    return { draft: draft || initial, fromDraft: !!draft };
  });
  const [body, setBody] = useState(start.draft.body);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => {
    const { selected } = splitVerses(start.draft.verses, readings);
    return new Set(readings.filter((_, i) => selected[i]));
  });
  const [extra, setExtra] = useState(() => splitVerses(start.draft.verses, readings).extra);
  // Once the verses are touched (or came from a draft), the default stops applying.
  const [touched, setTouched] = useState(start.fromDraft);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const readingsKey = readings.join('|');
  useEffect(() => {
    // Keyed on the readings' text, not the array, which is new every render.
    if (allByDefault && !touched) setChosen(new Set(readingsKey ? readingsKey.split('|') : []));
  }, [readingsKey, allByDefault, touched]);

  const verses = joinVerses(
    readings.filter((r) => chosen.has(r)),
    extra,
  );
  const extraParsed = parseVerses(extra);
  const blank = body.trim() === '';
  const tooLong = body.length > NOTE_MAX_LENGTH;
  const canSave = !blank && !tooLong && extraParsed.ok && !pending;

  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  // Keep the draft (body and the combined verses) as things change.
  useEffect(() => {
    if (body || touched) saveDraft(slot, { body, verses });
  }, [slot, body, verses, touched]);

  function toggle(reading: string) {
    setTouched(true);
    setChosen((c) => {
      const next = new Set(c);
      if (next.has(reading)) next.delete(reading);
      else next.add(reading);
      return next;
    });
  }

  function save() {
    if (!canSave) return;
    onSave({ body, verses }, () => clearDraft(slot));
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
      {readings.length > 0 && (
        <div role="group" aria-label="verses read that day" className={styles.chips}>
          {readings.map((r) => (
            <button key={r} type="button" aria-pressed={chosen.has(r)} className={styles.chip} onClick={() => toggle(r)}>
              {r}
            </button>
          ))}
        </div>
      )}
      <input
        className={styles.versesInput}
        aria-label={readings.length ? 'other verses' : 'verses'}
        placeholder={readings.length ? '+ other verses, e.g. isa 53' : 'verses (optional), e.g. rom 8:28-30'}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={extra}
        onChange={(e) => {
          setTouched(true);
          setExtra(e.target.value);
        }}
      />
      <div className={styles.parse} aria-live="polite" data-testid="note-verses-preview">
        {!extra.trim() ? null : extraParsed.ok ? (
          <span className={styles.ok}>✓ {extraParsed.display}</span>
        ) : (
          <span className={styles.err}>? {extraParsed.error}</span>
        )}
      </div>
      <textarea
        ref={textarea}
        className={styles.body}
        aria-label="note"
        placeholder="write in markdown…"
        rows={6}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className={styles.bar}>
        <span className={styles.hint}>
          {body.length >= COUNT_FROM && (
            <span className={tooLong ? styles.err : undefined}>
              {body.length.toLocaleString()} / {NOTE_MAX_LENGTH.toLocaleString()}
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
