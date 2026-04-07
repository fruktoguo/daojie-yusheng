#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const {
  resolveServerNextDatabaseEnvSource,
  resolveServerNextDatabaseUrl,
} = require('../packages/server-next/src/config/env-alias');

const databaseUrl = resolveServerNextDatabaseUrl();
const databaseEnvSource = resolveServerNextDatabaseEnvSource();
const traceEnabledValue = process.env.SERVER_NEXT_AUTH_TRACE_ENABLED || process.env.NEXT_AUTH_TRACE_ENABLED || '1';

if (!databaseUrl) {
  process.stderr.write('replace-ready proof with-db requires DATABASE_URL or SERVER_NEXT_DATABASE_URL\n');
  process.stderr.write('set DATABASE_URL or SERVER_NEXT_DATABASE_URL first, then run pnpm verify:replace-ready:proof:with-db\n');
  process.exit(1);
}

const childEnv = {
  ...process.env,
  NEXT_AUTH_TRACE_ENABLED: traceEnabledValue,
  SERVER_NEXT_AUTH_TRACE_ENABLED: traceEnabledValue,
  ...(databaseEnvSource === 'SERVER_NEXT_DATABASE_URL' ? null : { SERVER_NEXT_DATABASE_URL: databaseUrl }),
};

process.stdout.write('[replace-ready:proof:with-db] steps=verify:proof:with-db\n');
process.stdout.write('[replace-ready:proof:with-db] start step=verify:proof:with-db\n');

const result = spawnSync('pnpm', ['--filter', '@mud/server-next', 'verify:proof:with-db'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: childEnv,
});

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  process.stderr.write(`[replace-ready:proof:with-db] failed step=verify:proof:with-db status=${result.status ?? 1}\n`);
  process.exit(result.status ?? 1);
}

process.stdout.write('[replace-ready:proof:with-db] done step=verify:proof:with-db\n');
process.stdout.write('[replace-ready:proof:with-db] completed\n');
process.exit(0);
