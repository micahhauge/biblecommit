// Prints the OpenAPI document without a database, for client type generation.
// The deps connect lazily, and serving the document never touches them.
import { createApp } from './app';
import { createDbDeps } from './deps';

const res = await createApp(createDbDeps()).request('/api/openapi.json');
process.stdout.write(JSON.stringify(await res.json(), null, 2) + '\n');
