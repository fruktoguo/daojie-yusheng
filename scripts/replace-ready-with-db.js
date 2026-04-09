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

if (!databaseUrl) {
  process.stderr.write('replace-ready with-db requires DATABASE_URL or SERVER_NEXT_DATABASE_URL\n');
  process.stderr.write('set DATABASE_URL or SERVER_NEXT_DATABASE_URL first, then run pnpm verify:replace-ready:with-db\n');
  process.exit(1);
}

const childEnv = {
  ...process.env,
  ...(databaseEnvSource === 'SERVER_NEXT_DATABASE_URL' ? null : { SERVER_NEXT_DATABASE_URL: databaseUrl }),
};
const steps = [
  { label: 'build:client-next', args: ['build:client-next'] },
  { label: 'verify:replace-ready:with-db', args: ['--filter', '@mud/server-next', 'verify:replace-ready:with-db'] },
  { label: 'audit:server-next-protocol', args: ['audit:server-next-protocol'] },
];

process.stdout.write('[replace-ready:with-db] steps=build:client-next -> verify:replace-ready:with-db -> audit:server-next-protocol\n');

for (const step of steps) {
  process.stdout.write(`[replace-ready:with-db] start step=${step.label}\n`);
  const result = spawnSync('pnpm', step.args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: childEnv,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.stderr.write(`[replace-ready:with-db] failed step=${step.label} status=${result.status ?? 1}\n`);
    process.exit(result.status ?? 1);
  }
  process.stdout.write(`[replace-ready:with-db] done step=${step.label}\n`);
}

process.stdout.write('[replace-ready:with-db] completed\n');
process.exit(0);
