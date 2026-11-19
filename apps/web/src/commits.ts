'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { components } from '@/api/schema';
import { browserTimezone, getGuestToken, guestAuthorization, setGuestToken } from '@/guest';
import { isSignedIn, useHasUser } from '@/session';
import { invalidateReading, todayKey, type TodaySummary } from '@/me';

export type Commit = components['schemas']['Commit'];
type Page = components['schemas']['CommitList'];
type Recent = InfiniteData<Page, string | null>;

const recentKey = ['commits', 'recent'] as const;
/** Prefix of every single-day commit list (the day sheet). */
const dayCommitsKey = ['commits', 'day'] as const;
/** Refetches every commit list: recent, and any day. */
const invalidateCommitLists = (queryClient: ReturnType<typeof useQueryClient>) =>
  Promise.all([recentKey, dayCommitsKey].map((queryKey) => queryClient.invalidateQueries({ queryKey })));

/**
 * Recent commits, a page at a time (`fetchNextPage` for "load more").
 * Never fetches until this browser has a guest (or account).
 */
export function useRecentCommits() {
  const hasUser = useHasUser();
  return useInfiniteQuery({
    queryKey: recentKey,
    enabled: hasUser,
    initialPageParam: null as string | null,
    getNextPageParam: (last: Page) => last.nextCursor,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await api.GET('/api/commits', { params: { query: pageParam ? { cursor: pageParam } : {} } });
      if (error || !data) throw new Error('could not load your commits');
      return data;
    },
    select: (data) => data.pages.flatMap((p) => p.commits),
  });
}

export async function createGuest(): Promise<string> {
  const { data, error } = await api.POST('/api/guests', { body: { timezone: browserTimezone() } });
  if (error || !data) throw new Error('could not start a guest session');
  return data.token;
}

/** fetch rejects with a TypeError when the network fails; turn that into a readable error. */
export function networkError(e: unknown, what: string) {
  return e instanceof TypeError ? new Error(`could not ${what}; check your connection`) : e;
}

/** Commits as the current user, or as `newGuestToken` for a guest whose token isn't stored yet. */
async function postCommit(text: string, newGuestToken?: string): Promise<Commit> {
  try {
    const headers = newGuestToken ? { authorization: guestAuthorization(newGuestToken) } : {};
    const { data, error } = await api.POST('/api/commits', { body: { text }, headers });
    if (data) return data;
    throw new Error(error?.error ?? 'could not save that commit');
  } catch (e) {
    throw networkError(e, 'save that commit');
  }
}

/**
 * Commits a reading, creating the guest first if this is a signed-out browser's first commit.
 * `onSaved` runs as soon as the server has the commit, before the recent list updates.
 */
export function useCommit({ onSaved }: { onSaved?: (commit: Commit) => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (text: string) => {
      if (isSignedIn() || getGuestToken()) {
        const commit = await postCommit(text);
        onSaved?.(commit);
        // Show it in today's list at once; the refetch below confirms it.
        queryClient.setQueryData<TodaySummary>(todayKey, (t) =>
          t && commit.readOn === t.today && !t.commits.some((c) => c.id === commit.id) ? { ...t, commits: [commit, ...t.commits] } : t,
        );
        await Promise.all([invalidateCommitLists(queryClient), invalidateReading(queryClient)]);
        return commit;
      }

      const token = await createGuest();
      try {
        const commit = await postCommit(text, token);
        onSaved?.(commit);
        // Seed the list before storing the token: storing it enables the recent-commits
        // query, and seeding first saves a request and keeps the example chips from flashing back.
        // The streak and year queries are enabled by the same token and fetch fresh.
        queryClient.setQueryData<Recent>(recentKey, { pages: [{ commits: [commit], nextCursor: null }], pageParams: [null] });
        return commit;
      } finally {
        // Keep the guest even if the commit failed, so a retry doesn't create another.
        setGuestToken(token);
      }
    },
  });
}

/**
 * Deletes a commit (soft, server-side). The row leaves the recent list at once and
 * comes back if the server can't be reached.
 */
export function useDeleteCommit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      try {
        const { error, response } = await api.DELETE('/api/commits/{id}', { params: { path: { id } } });
        // Already gone counts as done.
        if (error && response.status !== 404) throw new Error(error.error);
      } catch (e) {
        throw networkError(e, 'delete that commit');
      }
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: recentKey });
      // Remember just this row and where it was, so a failure puts back only it and
      // leaves other deletes or commits made in the meantime alone.
      let removed: { page: number; index: number; commit: Commit } | undefined;
      queryClient.setQueryData<Recent>(recentKey, (data) =>
        data && {
          ...data,
          pages: data.pages.map((p, page) => {
            const index = p.commits.findIndex((c) => c.id === id);
            if (index < 0) return p;
            removed = { page, index, commit: p.commits[index]! };
            return { ...p, commits: p.commits.filter((c) => c.id !== id) };
          }),
        },
      );
      // Today's list and any open day's list drop it too.
      await Promise.all([todayKey, dayCommitsKey].map((queryKey) => queryClient.cancelQueries({ queryKey })));
      const today = queryClient.getQueryData<TodaySummary>(todayKey);
      const days = queryClient.getQueriesData<Commit[]>({ queryKey: dayCommitsKey });
      queryClient.setQueryData<TodaySummary>(todayKey, (t) => t && { ...t, commits: t.commits.filter((c) => c.id !== id) });
      queryClient.setQueriesData<Commit[]>({ queryKey: dayCommitsKey }, (list) => list?.filter((c) => c.id !== id));
      return { removed, today, days };
    },
    onError: (_e, _id, context) => {
      if (context?.today) queryClient.setQueryData(todayKey, context.today);
      context?.days.forEach(([key, data]) => queryClient.setQueryData(key, data));
      const removed = context?.removed;
      if (!removed) return;
      queryClient.setQueryData<Recent>(recentKey, (data) =>
        data && {
          ...data,
          pages: data.pages.map((p, page) =>
            page === removed.page && !p.commits.some((c) => c.id === removed.commit.id)
              ? { ...p, commits: [...p.commits.slice(0, removed.index), removed.commit, ...p.commits.slice(removed.index)] }
              : p,
          ),
        },
      );
    },
    onSettled: () => Promise.all([invalidateCommitLists(queryClient), invalidateReading(queryClient)]),
  });
}

/** One day's commits, newest first. Never fetches until this browser has a guest (or account). */
export function useCommitsOn(date: string, enabled = true) {
  const hasUser = useHasUser();
  return useQuery({
    queryKey: [...dayCommitsKey, date],
    enabled: hasUser && enabled,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/commits', { params: { query: { on: date } } });
      if (error || !data) throw new Error('could not load that day');
      return data.commits;
    },
  });
}
