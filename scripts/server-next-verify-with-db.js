#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const databaseUrl = String(process.env.SERVER_NEXT_DATABASE_URL ?? process.env.DATABASE_URL ?? '').trim();

if (!databaseUrl) {
  process.stderr.write('server-next verify-with-db requires DATABASE_URL or SERVER_NEXT_DATABASE_URL\n');
  process.exit(1);
}

const result = spawnSync('pnpm', ['--filter', '@mud/server-next', 'verify:replace-ready:with-db'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
