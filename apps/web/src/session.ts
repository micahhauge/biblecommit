'use client';

import type { QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { clearGuestToken, getGuestToken, guestAuthorization, subscribeGuest } from '@/guest';

/**
 * Who this browser is to the API: a signed-in account (a Clerk session), a guest (a token in
 * localStorage), or nobody yet. Clerk feeds this through `ClerkSession`; everything else reads
 * it, so the rest of the app (and its tests) never touches Clerk directly.
 */
export interface Session {
  /** A fresh Clerk session JWT, sent as `Authorization: Bearer <jwt>`. */
  getToken: () => Promise<string | null>;
}

let session: Session | null = null;
let openSignIn: (() => void) | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function subscribe(listener: () => void) {
  listeners.add(listener);
  const unsubscribeGuest = subscribeGuest(listener);
  return () => {
    listeners.delete(listener);
    unsubscribeGuest();
  };
}

/** The `Authorization` header for the current user, or null before there is one. An account beats a guest token. */
export async function authorization(): Promise<string | null> {
  const jwt = session && (await session.getToken());
  if (jwt) return `Bearer ${jwt}`;
  const token = getGuestToken();
  return token && guestAuthorization(token);
}

export function isSignedIn() {
  return session !== null;
}

/** Whether the browser is signed in. False on the server and while Clerk loads. */
export function useSignedIn(): boolean {
  return useSyncExternalStore(subscribe, isSignedIn, () => false);
}

/** Whether the browser has a user (an account or a guest) whose data can be fetched. False on the server. */
export function useHasUser(): boolean {
  return useSyncExternalStore(subscribe, () => isSignedIn() || getGuestToken() !== null, () => false);
}

/**
 * Just signed in (or loaded signed in): claim this browser's guest, if any, then switch every
 * request to the account and refetch. The claim goes first so a new account adopts the guest
 * rather than getting an empty row of its own. If it fails, the token is kept for the next load.
 */
export async function startSession(next: Session, queryClient: QueryClient) {
  const guestToken = getGuestToken();
  if (guestToken) {
    try {
      const jwt = await next.getToken();
      const res = await fetch(`${apiOrigin()}/api/me/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) },
        body: JSON.stringify({ guestToken }),
      });
      if (res.ok) clearGuestToken();
    } catch {
      // Offline or similar: keep the token and try again next time.
    }
  }
  session = next;
  notify();
  await queryClient.resetQueries();
}

/** Signed out: back to a fresh, empty guest. Claimed data is only reachable by signing in again. */
export async function endSession(queryClient: QueryClient) {
  session = null;
  clearGuestToken();
  notify();
  await queryClient.resetQueries();
}

/** Lets the sign-in nudge open Clerk's sign-in without depending on Clerk itself. */
export function setSignIn(open: (() => void) | null) {
  openSignIn = open;
}

export function signIn() {
  openSignIn?.();
}

function apiOrigin() {
  return typeof window === 'undefined' ? '' : window.location.origin;
}
