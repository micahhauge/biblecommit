'use client';

/** The browser's guest token (see spec §4, Guest mode). Created on the first commit, never before. */
const KEY = 'biblecommit.guestToken';
const listeners = new Set<() => void>();

/** The Authorization header value for a guest token; the server parses the same scheme. */
export function guestAuthorization(token: string) {
  return `Guest ${token}`;
}

/** The browser's IANA timezone, which the server uses for the guest's local dates. */
export function browserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function getGuestToken(): string | null {
  return typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
}

export function setGuestToken(token: string) {
  localStorage.setItem(KEY, token);
  listeners.forEach((l) => l());
}

/** Dropped once the guest is claimed by an account, and on sign-out. */
export function clearGuestToken() {
  localStorage.removeItem(KEY);
  listeners.forEach((l) => l());
}

/** Calls `listener` whenever the token changes, in this tab or another. */
export function subscribeGuest(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === KEY && listener();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}
