'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { api } from '@/api/client';
import { getGuestToken } from '@/guest';
import { meKey, useMe } from '@/me';
import { MODE_COOKIE, PAPER, parseModePref, type ModePref } from '@/mode-pref';
import { isSignedIn } from '@/session';

/**
 * The mode lives on `<html data-mode>` (which the CSS keys off) and in a cookie (so the
 * server renders it next time). This module keeps both in step and notifies subscribers.
 */
const listeners = new Set<() => void>();
const YEAR_S = 60 * 60 * 24 * 365;
/** How long colors ease when the mode changes; matches the body's transition. */
const EASE_MS = 600;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentMode(): ModePref {
  return parseModePref(document.documentElement.dataset.mode);
}

/** What "system" means right now: the OS preference, or dark when it states none. */
export function resolveMode(mode: ModePref): 'dark' | 'light' {
  if (mode !== 'system') return mode;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** Shows `mode` now, eased rather than flashed, and remembers it in this browser. */
export function applyMode(mode: ModePref) {
  const root = document.documentElement;
  if (root.dataset.mode === mode) return;
  root.classList.add('easing');
  setTimeout(() => root.classList.remove('easing'), EASE_MS);
  root.dataset.mode = mode;
  document.cookie = `${MODE_COOKIE}=${mode}; path=/; max-age=${YEAR_S}; samesite=lax`;
  const paper = PAPER[resolveMode(mode)];
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.removeAttribute('media');
    m.setAttribute('content', paper);
  });
  listeners.forEach((l) => l());
}

/** The current mode. `initial` is what the server rendered (from the cookie), for hydration. */
export function useMode(initial: ModePref): ModePref {
  return useSyncExternalStore(subscribe, currentMode, () => initial);
}

function subscribeResolved(listener: () => void) {
  const unsubscribe = subscribe(listener);
  const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;
  media?.addEventListener('change', listener);
  return () => {
    unsubscribe();
    media?.removeEventListener('change', listener);
  };
}

/** Dark or light as shown right now, following the OS live under "system". */
export function useResolvedMode(initial: ModePref): 'dark' | 'light' {
  // The server can't see the OS preference; "system" renders as dark until hydrated.
  return useSyncExternalStore(subscribeResolved, () => resolveMode(currentMode()), () => (initial === 'light' ? 'light' : 'dark'));
}

/** Changes the mode, and stores it on the user's row if there is one, so it follows them to other devices. */
export function useSetMode() {
  const queryClient = useQueryClient();
  return (mode: ModePref) => {
    applyMode(mode);
    if (!isSignedIn() && !getGuestToken()) return;
    api.PATCH('/api/me', { body: { modePref: mode } }).then(({ data }) => {
      if (data) queryClient.setQueryData(meKey, data);
    });
  };
}

/**
 * On load (and after signing in or out): a stored mode wins over this browser's, since it may
 * have been changed on another device; with none stored yet (a new guest or account), this
 * browser's is stored. Once per load, so later profile updates never undo a fresh choice.
 */
export function ModeSync() {
  const me = useMe();
  const queryClient = useQueryClient();
  const synced = useRef(false);
  const stored = me.data?.modePref;
  const loaded = me.isSuccess;
  useEffect(() => {
    if (!loaded) {
      synced.current = false;
      return;
    }
    if (synced.current) return;
    synced.current = true;
    if (stored) return applyMode(stored);
    api.PATCH('/api/me', { body: { modePref: currentMode() } }).then(({ data }) => {
      if (data) queryClient.setQueryData(meKey, data);
    });
  }, [loaded, stored, queryClient]);
  return null;
}
