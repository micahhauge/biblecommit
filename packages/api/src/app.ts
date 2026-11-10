import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

export const CanonTotals = z
  .object({
    books: z.number().int(),
    chapters: z.number().int(),
    verses: z.number().int(),
  })
  .openapi('CanonTotals');

export type CanonTotals = z.infer<typeof CanonTotals>;

export interface Deps {
  getCanonTotals(): Promise<CanonTotals>;
}

const canonTotalsRoute = createRoute({
  method: 'get',
  path: '/canon/totals',
  summary: 'Canon totals as seeded in the database',
  responses: {
    200: { description: 'Totals', content: { 'application/json': { schema: CanonTotals } } },
  },
});

export function createApp(deps: Deps) {
  const app = new OpenAPIHono().basePath('/api');

  app.openapi(canonTotalsRoute, async (c) => c.json(await deps.getCanonTotals(), 200));

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'biblecommit API', version: '0.1.0' },
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
