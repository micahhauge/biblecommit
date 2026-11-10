'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { components } from '@/api/schema';
import { browserTimezone, getGuestToken, guestAuthorization, setGuestToken, useHasGuest } from '@/guest';

export type Commit = components['schemas']['Commit'];

const recentKey = ['commits', 'recent'] as const;

/** Recent commits. Never fetches until this browser has a guest (or account). */
export function useRecentCommits() {
  const hasGuest = useHasGuest();
  return useQuery({
    queryKey: recentKey,
    enabled: hasGuest,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/commits');
      if (error || !data) throw new Error('could not load your commits');
      return data.commits;
    },
  });
}

async function createGuest(): Promise<string> {
  const { data, error } = await api.POST('/api/guests', { body: { timezone: browserTimezone() } });
  if (error || !data) throw new Error('could not start a guest session');
  return data.token;
}

async function postCommit(text: string, token: string): Promise<Commit> {
  try {
    const { data, error } = await api.POST('/api/commits', { body: { text }, headers: { authorization: guestAuthorization(token) } });
    if (data) return data;
    throw new Error(error?.error ?? 'could not save that commit');
  } catch (e) {
    // fetch rejects with a TypeError when the network fails
    throw e instanceof TypeError ? new Error('could not save that commit; check your connection') : e;
  }
}

/**
 * Commits a reading, creating the guest first if this is the browser's first commit.
 * `onSaved` runs as soon as the server has the commit, before the recent list updates.
 */
export function useCommit({ onSaved }: { onSaved?: (commit: Commit) => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (text: string) => {
      const existing = getGuestToken();
      if (existing) {
        const commit = await postCommit(text, existing);
        onSaved?.(commit);
        await queryClient.invalidateQueries({ queryKey: recentKey });
        return commit;
      }

      const token = await createGuest();
      try {
        const commit = await postCommit(text, token);
        onSaved?.(commit);
        // Seed the list before storing the token: storing it enables the recent-commits
        // query, and seeding first saves a request and keeps the example chips from flashing back.
        queryClient.setQueryData<Commit[]>(recentKey, [commit]);
        return commit;
      } finally {
        // Keep the guest even if the commit failed, so a retry doesn't create another.
        setGuestToken(token);
      }
    },
  });
}
