import { config } from 'dotenv';
import { canonTotals, createDb, seedCanon } from './index';

config({ path: ['.env.local', '.env'].map((f) => new URL(`../../../${f}`, import.meta.url).pathname), quiet: true });

const db = createDb();
await seedCanon(db);
console.log('seeded', await canonTotals(db));
