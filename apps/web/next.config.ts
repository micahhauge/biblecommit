import { loadEnvConfig } from '@next/env';
import path from 'node:path';
import type { NextConfig } from 'next';

// Secrets live in the repo-root .env.local, shared with the db scripts.
// forceReload: Next has already loaded (and cached) env from apps/web by now.
loadEnvConfig(path.resolve(process.cwd(), '../..'), process.env.NODE_ENV !== 'production', console, true);

const config: NextConfig = {
  transpilePackages: ['@biblecommit/api', '@biblecommit/core', '@biblecommit/db'],
  // The service worker must never be cached, or deploys can't replace it.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },
};

export default config;
