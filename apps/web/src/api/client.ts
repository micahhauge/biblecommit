import createClient from 'openapi-fetch';
import { authorization } from '@/session';
import type { paths } from './schema';

/** Typed client generated from the API's OpenAPI document (`pnpm gen:api`). */
export const api = createClient<paths>({
  baseUrl: typeof window === 'undefined' ? '' : window.location.origin,
  // Resolve fetch per call rather than capturing it at import time.
  fetch: (req) => globalThis.fetch(req),
});

api.use({
  async onRequest({ request }) {
    if (request.headers.has('authorization')) return request;
    const value = await authorization();
    if (value) request.headers.set('authorization', value);
    return request;
  },
});
