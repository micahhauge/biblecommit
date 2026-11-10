import createClient from 'openapi-fetch';
import type { paths } from './schema';

/** Typed client generated from the API's OpenAPI document (`pnpm gen:api`). */
export const api = createClient<paths>({ baseUrl: '' });
