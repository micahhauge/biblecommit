import createClient from 'openapi-fetch';
import { getGuestToken, guestAuthorization } from '@/guest';
import type { paths } from './schema';

/** Typed client generated from the API's OpenAPI document (`pnpm gen:api`). */
export const api = createClient<paths>({
  baseUrl: typeof window === 'undefined' ? '' : window.location.origin,
  // Resolve fetch per call rather than capturing it at import time.
  fetch: (req) => globalThis.fetch(req),
});

api.use({
  onRequest({ request }) {
    const token = getGuestToken();
    if (token && !request.headers.has('authorization')) request.headers.set('authorization', guestAuthorization(token));
    return request;
  },
});
