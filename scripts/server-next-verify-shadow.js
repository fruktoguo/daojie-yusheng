#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const shadowUrl = String(process.env.SERVER_NEXT_SHADOW_URL ?? process.env.SERVER_NEXT_URL ?? '').trim();

if (!shadowUrl) {
  process.stderr.write('server-next shadow verify requires SERVER_NEXT_SHADOW_URL or SERVER_NEXT_URL\n');
  process.exit(1);
}

const result = spawnSync('pnpm', ['--filter', '@mud/server-next', 'smoke:shadow'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
