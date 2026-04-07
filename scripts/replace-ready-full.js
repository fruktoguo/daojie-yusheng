#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const nodeBin = process.execPath;
const {
  resolveServerNextDatabaseEnvSource,
  resolveServerNextDatabaseUrl,
  resolveServerNextGmPassword,
  resolveServerNextGmPasswordEnvSource,
  resolveServerNextShadowUrl,
  resolveServerNextShadowUrlEnvSource,
} = require('../packages/server-next/src/config/env-alias');

const databaseUrl = resolveServerNextDatabaseUrl();
const databaseEnvSource = resolveServerNextDatabaseEnvSource();
const shadowUrl = resolveServerNextShadowUrl();
const shadowUrlEnvSource = resolveServerNextShadowUrlEnvSource();
const gmPassword = resolveServerNextGmPassword();
const gmPasswordEnvSource = resolveServerNextGmPasswordEnvSource();

if (!databaseUrl || !shadowUrl || !gmPassword) {
  const missing = [
    databaseUrl ? null : 'DATABASE_URL/SERVER_NEXT_DATABASE_URL',
    shadowUrl ? null : 'SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL',
    gmPassword ? null : 'SERVER_NEXT_GM_PASSWORD/GM_PASSWORD',
  ].filter(Boolean);
  process.stderr.write(`replace-ready full requires: ${missing.join(' + ')}\n`);
  process.stderr.write('run pnpm verify:replace-ready:doctor first, then set the missing env and rerun pnpm verify:replace-ready:full\n');
  process.exit(1);
}

const steps = [
  { label: 'with-db', kind: 'node', args: ['scripts/replace-ready-with-db.js'] },
  {
    label: 'gm-database',
    kind: 'pnpm',
    args: ['--filter', '@mud/server-next', 'smoke:gm-database'],
  },
  {
    label: 'gm-database-backup-persistence',
    kind: 'pnpm',
    args: ['--filter', '@mud/server-next', 'smoke:gm-database:backup-persistence'],
  },
  { label: 'shadow', kind: 'node', args: ['scripts/replace-ready-shadow.js'] },
  {
    label: 'gm-compat',
    kind: 'pnpm',
    args: ['--filter', '@mud/server-next', 'smoke:gm-compat'],
    extraEnv: {
      SERVER_NEXT_URL: shadowUrl,
    },
  },
];
const childEnv = {
  ...process.env,
  ...(databaseEnvSource === 'SERVER_NEXT_DATABASE_URL' ? null : { SERVER_NEXT_DATABASE_URL: databaseUrl }),
  ...(shadowUrlEnvSource === 'SERVER_NEXT_SHADOW_URL' ? null : { SERVER_NEXT_SHADOW_URL: shadowUrl }),
  ...(gmPasswordEnvSource === 'SERVER_NEXT_GM_PASSWORD' ? null : { SERVER_NEXT_GM_PASSWORD: gmPassword }),
};

process.stdout.write('[replace-ready:full] steps=with-db -> gm-database -> gm-database-backup-persistence -> shadow -> gm-compat\n');

for (const step of steps) {
  const command = step.kind === 'pnpm' ? 'pnpm' : nodeBin;
  process.stdout.write(`[replace-ready:full] start step=${step.label}\n`);
  const result = spawnSync(command, step.args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: step.kind === 'pnpm' ? process.platform === 'win32' : false,
    env: {
      ...childEnv,
      ...(step.extraEnv ?? null),
    },
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.stderr.write(`[replace-ready:full] failed step=${step.label} status=${result.status ?? 1}\n`);
    process.exit(result.status ?? 1);
  }
  process.stdout.write(`[replace-ready:full] done step=${step.label}\n`);
}

process.stdout.write('[replace-ready:full] completed\n');
process.stdout.write('[replace-ready:full] boundary=strictest automated gate only; this still does not equal complete GM/admin manual regression\n');
process.exit(0);
