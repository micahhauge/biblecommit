'use client';

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '@/api/client';
import type { components } from '@/api/schema';
import { browserTimezone } from '@/guest';
import { useHasUser } from '@/session';

export type TodaySummary = components['schemas']['TodaySummary'];
export type Year = components['schemas']['Year'];
export type Canon = components['schemas']['Canon'];
export type BookReads = components['schemas']['BookReads'];

export const meKey = ['me'] as const;
/** Streak, this week, and today's commits. */
export const todayKey = ['me', 'today'] as const;
/** The year heatmap. */
export const yearKey = ['me', 'year'] as const;
/** Per-chapter reads and coverage. Also the prefix of every book's verse reads, so invalidating it refreshes those too. */
export const canonKey = ['me', 'canon'] as const;
/** Per-verse reads of one book. */
export const bookKey = (bookId: number) => [...canonKey, bookId] as const;

/** Refetches everything derived from the user's commits (streak, week, heatmap, canon). Call after anything that adds or removes a commit. */
export function invalidateReading(queryClient: QueryClient) {
  return Promise.all([todayKey, yearKey, canonKey].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

/** Streak and this week. Never fetches until this browser has a guest (or account). */
export function useToday() {
  const hasUser = useHasUser();
  return useQuery({
    queryKey: todayKey,
    enabled: hasUser,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/me/today');
      if (error || !data) throw new Error('could not load your streak');
      return data;
    },
  });
}

/** The year heatmap ending this week. Never fetches until this browser has a guest (or account). */
export function useYear() {
  const hasUser = useHasUser();
  return useQuery({
    queryKey: yearKey,
    enabled: hasUser,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/me/year');
      if (error || !data) throw new Error('could not load your year');
      return data;
    },
  });
}

/** How much of the canon has been read. Never fetches until this browser has a guest (or account). */
export function useCanon() {
  const hasUser = useHasUser();
  return useQuery({
    queryKey: canonKey,
    enabled: hasUser,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/me/canon');
      if (error || !data) throw new Error('could not load your canon');
      return data;
    },
  });
}

/**
 * Keeps the stored timezone in step with the browser's, so "today" means the same day
 * to the server as to the user. Checks once per load, and only once there is a user.
 */
export function useTimezoneSync() {
  const hasUser = useHasUser();
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: meKey,
    enabled: hasUser,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/me');
      if (error || !data) throw new Error('could not load your profile');
      return data;
    },
  });

  const stored = me.data?.timezone;
  useEffect(() => {
    const timezone = browserTimezone();
    if (!stored || stored === timezone) return;
    let cancelled = false;
    api.PATCH('/api/me', { body: { timezone } }).then(({ data }) => {
      if (cancelled || !data) return;
      queryClient.setQueryData(meKey, data);
      // Today may now be a different date.
      invalidateReading(queryClient);
    });
    return () => {
      cancelled = true;
    };
  }, [stored, queryClient]);
}

/** Mount once inside the query provider. */
export function TimezoneSync() {
  useTimezoneSync();
  return null;
}

/** How often each verse of one book has been read. Never fetches until this browser has a guest (or account). */
export function useBookReads(bookId: number) {
  const hasUser = useHasUser();
  return useQuery({
    queryKey: bookKey(bookId),
    enabled: hasUser,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/me/canon/{bookId}', { params: { path: { bookId } } });
      if (error || !data) throw new Error('could not load this book');
      return data;
    },
  });
}
