#!/usr/bin/env bash
# Vercel's build command (see vercel.json). Migrates the database only for a production
# deploy of main, i.e. after a merge, so PR previews never touch the prod schema.
# A failed migration fails the build, so code never ships ahead of its schema.
# Migrations run while the previous deploy still serves traffic: keep them backward compatible.
set -euo pipefail

if [ "${VERCEL_ENV:-}" = production ] && [ "${VERCEL_GIT_COMMIT_REF:-}" = main ]; then
  echo "Migrating the production database"
  pnpm --filter @biblecommit/db db:migrate
else
  echo "Skipping migrations (VERCEL_ENV=${VERCEL_ENV:-unset}, ref=${VERCEL_GIT_COMMIT_REF:-unset})"
fi

pnpm build
