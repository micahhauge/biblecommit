'use client';

import { useAuth, useClerk } from '@clerk/nextjs';

/** The header's account link: a quiet "sign in to save" for guests, "sign out" once signed in. */
export function Account() {
  const { isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();
  if (!isLoaded) return null;
  return isSignedIn ? (
    <button type="button" className="hlink" onClick={() => clerk.signOut()}>
      sign out
    </button>
  ) : (
    <button type="button" className="hlink" onClick={() => clerk.openSignIn()}>
      sign in to save
    </button>
  );
}
