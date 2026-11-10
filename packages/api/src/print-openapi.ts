// Prints the OpenAPI document without a database, for client type generation.
import { createApp } from './app';

const app = createApp({
  getCanonTotals: () => Promise.reject(new Error('not available')),
});
const res = await app.request('/api/openapi.json');
process.stdout.write(JSON.stringify(await res.json(), null, 2) + '\n');
