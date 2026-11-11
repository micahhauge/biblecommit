import { verifyToken } from '@clerk/backend';

/**
 * Verifies Clerk session JWTs with the instance's secret key (read on each call, so importing
 * this never needs it). Returns the Clerk user id, or undefined for any invalid token.
 */
export function verifyClerkSession(secretKey: () => string | undefined = () => process.env.CLERK_SECRET_KEY) {
  return async (jwt: string): Promise<string | undefined> => {
    const key = secretKey();
    if (!key) {
      console.error('CLERK_SECRET_KEY is not set; rejecting Clerk session tokens');
      return undefined;
    }
    try {
      return (await verifyToken(jwt, { secretKey: key })).sub;
    } catch {
      return undefined;
    }
  };
}
