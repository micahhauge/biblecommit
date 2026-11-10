import { describe, expect, it } from 'vitest';
import { createApp } from './app';

const app = createApp({
  getCanonTotals: async () => ({ books: 66, chapters: 1189, verses: 31102 }),
});

describe('api', () => {
  it('serves canon totals', async () => {
    const res = await app.request('/api/canon/totals');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ books: 66, chapters: 1189, verses: 31102 });
  });

  it('serves an OpenAPI document describing its routes', async () => {
    const res = await app.request('/api/openapi.json');
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.paths).toHaveProperty('/api/canon/totals');
  });
});
