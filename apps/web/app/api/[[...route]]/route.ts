import { createApp, createDbDeps, verifyClerkSession } from '@biblecommit/api';
import { handle } from 'hono/vercel';

const app = createApp(createDbDeps(), { verifySession: verifyClerkSession() });

export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
