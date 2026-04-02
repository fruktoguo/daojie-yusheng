#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const databaseUrl = String(process.env.SERVER_NEXT_DATABASE_URL ?? process.env.DATABASE_URL ?? '').trim();
const scriptName = databaseUrl
  ? 'verify:replace-ready:with-db'
  : 'verify:replace-ready';

const result = spawnSync('pnpm', ['--filter', '@mud/server-next', scriptName], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
