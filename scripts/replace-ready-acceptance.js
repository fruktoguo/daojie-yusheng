#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const {
  resolveServerNextGmPassword,
  resolveServerNextGmPasswordEnvSource,
  resolveServerNextShadowUrl,
  resolveServerNextShadowUrlEnvSource,
} = require('../packages/server-next/src/config/env-alias');

const shadowUrl = resolveServerNextShadowUrl();
const shadowUrlEnvSource = resolveServerNextShadowUrlEnvSource();
const gmPassword = resolveServerNextGmPassword();
const gmPasswordEnvSource = resolveServerNextGmPasswordEnvSource();

if (!shadowUrl || !gmPassword) {
  const missing = [
    shadowUrl ? null : 'SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL',
    gmPassword ? null : 'SERVER_NEXT_GM_PASSWORD/GM_PASSWORD',
  ].filter(Boolean);
  process.stderr.write(`replace-ready acceptance requires shadow env: ${missing.join(' + ')}\n`);
  process.stderr.write('run pnpm verify:replace-ready:doctor first, then set the missing env and rerun pnpm verify:replace-ready:acceptance\n');
  process.exit(1);
}

const nodeBin = process.execPath;
const steps = [
  {
    label: 'replace-ready',
    kind: 'node',
    args: ['scripts/replace-ready.js'],
    extraEnv: null,
  },
  {
    label: 'shadow',
    kind: 'node',
    args: ['scripts/replace-ready-shadow.js'],
    extraEnv: null,
  },
  {
    label: 'gm-compat',
    kind: 'pnpm',
    args: ['--filter', '@mud/server-next', 'smoke:gm-compat'],
    extraEnv: {
      SERVER_NEXT_URL: shadowUrl,
    },
  },
];

process.stdout.write('[replace-ready:acceptance] steps=replace-ready -> shadow -> gm-compat\n');

for (const step of steps) {
  const command = step.kind === 'pnpm' ? 'pnpm' : nodeBin;
  process.stdout.write(`[replace-ready:acceptance] start step=${step.label}\n`);
  const result = spawnSync(command, step.args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: step.kind === 'pnpm' ? process.platform === 'win32' : false,
    env: {
      ...process.env,
      ...(shadowUrlEnvSource === 'SERVER_NEXT_SHADOW_URL' ? null : { SERVER_NEXT_SHADOW_URL: shadowUrl }),
      ...(gmPasswordEnvSource === 'SERVER_NEXT_GM_PASSWORD' ? null : { SERVER_NEXT_GM_PASSWORD: gmPassword }),
      ...(step.extraEnv ?? null),
    },
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.stderr.write(`[replace-ready:acceptance] failed step=${step.label} status=${result.status ?? 1}\n`);
    process.exit(result.status ?? 1);
  }
  process.stdout.write(`[replace-ready:acceptance] done step=${step.label}\n`);
}

process.stdout.write('[replace-ready:acceptance] completed\n');
process.stdout.write('[replace-ready:acceptance] boundary=enhanced gate only; this still does not equal complete GM/admin manual regression\n');
process.stdout.write('[replace-ready:acceptance] next=run pnpm verify:replace-ready:full when database, shadow and GM env are all ready and you want the strictest automated gate\n');
process.exit(0);
