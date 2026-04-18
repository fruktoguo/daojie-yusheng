#!/usr/bin/env node
'use strict';

/**
 * 用途：执行 server-next 替换链路的破坏性 shadow流程。
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const {
  resolveServerNextGmPassword,
  resolveServerNextGmPasswordEnvSource,
  resolveServerNextShadowUrl,
  resolveServerNextShadowUrlEnvSource,
} = require('../packages/server/src/config/env-alias');
const { normalizeBooleanEnv } = require('../packages/server/src/tools/gm-database-proof-lib');

/**
 * 记录shadow 环境地址。
 */
const shadowUrl = resolveServerNextShadowUrl();
/**
 * 记录shadow 环境环境变量来源地址。
 */
const shadowUrlEnvSource = resolveServerNextShadowUrlEnvSource();
/**
 * 记录GMpassword。
 */
const gmPassword = resolveServerNextGmPassword();
/**
 * 记录GMpassword环境变量来源。
 */
const gmPasswordEnvSource = resolveServerNextGmPasswordEnvSource();
/**
 * 记录allowdestructive。
 */
const allowDestructive = normalizeBooleanEnv(process.env.SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE);

if (!shadowUrl) {
  process.stderr.write('replace-ready shadow destructive requires SERVER_NEXT_SHADOW_URL or SERVER_NEXT_URL\n');
  process.stderr.write('run pnpm verify:replace-ready:doctor first, then set SERVER_NEXT_SHADOW_URL or SERVER_NEXT_URL and rerun pnpm verify:replace-ready:shadow:destructive\n');
  process.exit(1);
}

if (!gmPassword) {
  process.stderr.write('replace-ready shadow destructive requires SERVER_NEXT_GM_PASSWORD or GM_PASSWORD\n');
  process.stderr.write('run pnpm verify:replace-ready:doctor first, then set SERVER_NEXT_GM_PASSWORD or GM_PASSWORD and rerun pnpm verify:replace-ready:shadow:destructive\n');
  process.exit(1);
}

if (!allowDestructive) {
  process.stderr.write('replace-ready shadow destructive requires SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1\n');
  process.stderr.write('only run this during a maintenance window after you explicitly allow destructive GM database proof\n');
  process.exit(1);
}

process.stdout.write('[replace-ready:shadow:destructive] steps=smoke:shadow:gm-database\n');
process.stdout.write('[replace-ready:shadow:destructive] gate=shadow-destructive\n');
process.stdout.write('[replace-ready:shadow:destructive] start step=smoke:shadow:gm-database\n');

/**
 * 累计当前结果。
 */
const result = spawnSync('pnpm', ['--filter', '@mud/server-next', 'smoke:shadow:gm-database'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    ...(shadowUrlEnvSource === 'SERVER_NEXT_SHADOW_URL' ? null : { SERVER_NEXT_SHADOW_URL: shadowUrl }),
    ...(gmPasswordEnvSource === 'SERVER_NEXT_GM_PASSWORD' ? null : { SERVER_NEXT_GM_PASSWORD: gmPassword }),
    SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE: '1',
  },
});

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.stderr.write(`[replace-ready:shadow:destructive] failed step=smoke:shadow:gm-database status=${result.status ?? 1}\n`);
  process.exit(result.status ?? 1);
}

process.stdout.write('[replace-ready:shadow:destructive] done step=smoke:shadow:gm-database\n');
process.stdout.write('[replace-ready:shadow:destructive] completed\n');
process.stdout.write('[replace-ready:shadow:destructive] boundary=maintenance-window destructive proof only; this does not imply daily replace-ready gates or complete replacement completion\n');
process.stdout.write('[replace-ready:shadow:destructive] next=write the real maintenance-window evidence back into ops/runbook records after execution\n');
process.exit(0);
