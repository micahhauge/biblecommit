'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { components } from '@/api/schema';
import { createGuest, networkError } from '@/commits';
import { getGuestToken, guestAuthorization, setGuestToken } from '@/guest';
import { canonKey, yearKey } from '@/me';
import { isSignedIn, useHasUser } from '@/session';

export type Note = components['schemas']['Note'];

/** Prefix of every notes query. */
const notesKey = ['notes'] as const;
const dayKey = (date: string) => [...notesKey, 'day', date] as const;
const chapterKey = (bookId: number, chapter: number) => [...notesKey, 'chapter', bookId, chapter] as const;

/** Refetches every notes list, and the views that mark notes (heatmap days, verse counts). */
function invalidateNotes(queryClient: QueryClient) {
  return Promise.all([notesKey, yearKey, canonKey].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

/** A day's notes, oldest first. Never fetches until this browser has a guest (or account). */
export function useNotesOn(date: string) {
  const hasUser = useHasUser();
  return useQuery({
    queryKey: dayKey(date),
    enabled: hasUser,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/notes', { params: { query: { on: date } } });
      if (error || !data) throw new Error('could not load your notes');
      return data.notes;
    },
  });
}

/** Notes linked to any verse of one chapter, oldest first. */
export function useChapterNotes(bookId: number, chapter: number, enabled = true) {
  const hasUser = useHasUser();
  return useQuery({
    queryKey: chapterKey(bookId, chapter),
    enabled: hasUser && enabled,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/notes', { params: { query: { bookId, chapter } } });
      if (error || !data) throw new Error('could not load notes');
      return data.notes;
    },
  });
}

export interface NoteDraft {
  body: string;
  verses: string;
}

/** Writes as the current user, or as `newGuestToken` for a guest whose token isn't stored yet. */
async function postNote(writtenOn: string, { body, verses }: NoteDraft, newGuestToken?: string): Promise<Note> {
  try {
    const headers = newGuestToken ? { authorization: guestAuthorization(newGuestToken) } : {};
    const { data, error } = await api.POST('/api/notes', { body: { writtenOn, body, verses }, headers });
    if (data) return data;
    throw new Error(error?.error ?? 'could not save that note');
  } catch (e) {
    throw networkError(e, 'save that note');
  }
}

/** Writes a note on a day, creating the guest first if this is a signed-out browser's first write. */
export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ writtenOn, draft }: { writtenOn: string; draft: NoteDraft }) => {
      if (isSignedIn() || getGuestToken()) return postNote(writtenOn, draft);
      const token = await createGuest();
      try {
        return await postNote(writtenOn, draft, token);
      } finally {
        // Keep the guest even if the note failed, so a retry doesn't create another.
        setGuestToken(token);
      }
    },
    onSuccess: () => invalidateNotes(queryClient),
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, draft }: { id: string; draft: NoteDraft }) => {
      try {
        const { data, error } = await api.PATCH('/api/notes/{id}', { params: { path: { id } }, body: draft });
        if (data) return data;
        throw new Error(error?.error ?? 'could not save that note');
      } catch (e) {
        throw networkError(e, 'save that note');
      }
    },
    onSuccess: () => invalidateNotes(queryClient),
  });
}

/** Deletes a note (soft). It leaves its lists at once and comes back if the server can't be reached. */
export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      try {
        const { error, response } = await api.DELETE('/api/notes/{id}', { params: { path: { id } } });
        if (error && response.status !== 404) throw new Error(error.error);
      } catch (e) {
        throw networkError(e, 'delete that note');
      }
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notesKey });
      const before = queryClient.getQueriesData<Note[]>({ queryKey: notesKey });
      queryClient.setQueriesData<Note[]>({ queryKey: notesKey }, (notes) => notes?.filter((n) => n.id !== id));
      return { before };
    },
    onError: (_e, _id, context) => context?.before.forEach(([key, data]) => queryClient.setQueryData(key, data)),
    onSettled: () => invalidateNotes(queryClient),
  });
}

/** Undoes a delete. */
export function useRestoreNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      try {
        const { error } = await api.POST('/api/notes/{id}/restore', { params: { path: { id } } });
        if (error) throw new Error(error.error);
      } catch (e) {
        throw networkError(e, 'restore that note');
      }
    },
    onSettled: () => invalidateNotes(queryClient),
  });
}

/** Unsaved editor text survives a reload: one draft per new-note day or edited note. */
const draftKey = (slot: string) => `biblecommit.noteDraft.${slot}`;

export function loadDraft(slot: string): NoteDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(slot));
    const d = raw ? (JSON.parse(raw) as Partial<NoteDraft>) : null;
    return d && typeof d.body === 'string' && typeof d.verses === 'string' ? { body: d.body, verses: d.verses } : null;
  } catch {
    return null;
  }
}

export function saveDraft(slot: string, draft: NoteDraft) {
  try {
    localStorage.setItem(draftKey(slot), JSON.stringify(draft));
  } catch {
    // Storage full or blocked: the draft just won't survive a reload.
  }
}

export function clearDraft(slot: string) {
  try {
    localStorage.removeItem(draftKey(slot));
  } catch {
    // Nothing to do.
  }
}
