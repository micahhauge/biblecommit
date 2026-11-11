'use client';

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '@/api/client';
import type { components } from '@/api/schema';
import { browserTimezone, useHasGuest } from '@/guest';

export type TodaySummary = components['schemas']['TodaySummary'];
export type Year = components['schemas']['Year'];

export const meKey = ['me'] as const;
/** Streak, this week, and today's commits. */
export const todayKey = ['me', 'today'] as const;
/** The year heatmap. */
export const yearKey = ['me', 'year'] as const;

/** Refetches everything derived from the user's commits (streak, week, heatmap). Call after anything that adds or removes a commit. */
export function invalidateReading(queryClient: QueryClient) {
  return Promise.all([queryClient.invalidateQueries({ queryKey: todayKey }), queryClient.invalidateQueries({ queryKey: yearKey })]);
}

/** Streak and this week. Never fetches until this browser has a guest (or account). */
export function useToday() {
  const hasGuest = useHasGuest();
  return useQuery({
    queryKey: todayKey,
    enabled: hasGuest,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/me/today');
      if (error || !data) throw new Error('could not load your streak');
      return data;
    },
  });
}

/** The year heatmap ending this week. Never fetches until this browser has a guest (or account). */
export function useYear() {
  const hasGuest = useHasGuest();
  return useQuery({
    queryKey: yearKey,
    enabled: hasGuest,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/me/year');
      if (error || !data) throw new Error('could not load your year');
      return data;
    },
  });
}

/**
 * Keeps the stored timezone in step with the browser's, so "today" means the same day
 * to the server as to the user. Checks once per load, and only once there is a user.
 */
export function useTimezoneSync() {
  const hasGuest = useHasGuest();
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: meKey,
    enabled: hasGuest,
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
