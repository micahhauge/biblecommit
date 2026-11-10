import { afterAll, describe, expect, it } from 'vitest';
import { canonTotals } from './index';
import { createTestDb } from './testing';

const t = await createTestDb();
afterAll(() => t.close());

describe('test database', () => {
  it('has the migrated schema and the seeded canon', async () => {
    expect(await canonTotals(t.db)).toEqual({ books: 66, chapters: 1189, verses: 31102 });
  });
});
