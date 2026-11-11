'use client';

import { useAuth, useClerk } from '@clerk/nextjs';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { endSession, setSignIn, startSession } from '@/session';

/**
 * Feeds Clerk's sign-in state into the session store: claims the guest and switches to the
 * account on sign-in, back to a fresh guest on sign-out. Mount once inside Clerk and the query provider.
 */
export function ClerkSession() {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const clerk = useClerk();
  const queryClient = useQueryClient();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  // The Clerk user the session store was last started for.
  const active = useRef<string | null>(null);

  useEffect(() => {
    setSignIn(() => clerk.openSignIn());
    return () => setSignIn(null);
  }, [clerk]);

  useEffect(() => {
    if (!isLoaded) return;
    const id = isSignedIn ? userId : null;
    if (id === active.current) return;
    const was = active.current;
    active.current = id;
    if (id) void startSession({ getToken: () => getTokenRef.current() }, queryClient);
    else if (was) void endSession(queryClient);
  }, [isLoaded, isSignedIn, userId, queryClient]);

  return null;
}
