#!/usr/bin/env node
'use strict';

require('./load-local-runtime-env');

/**
 * 用途：执行 server 替换链路的破坏性 shadow流程。
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { runVerificationSteps } = require('./verification-timing');

const repoRoot = path.resolve(__dirname, '..');
const {
  resolveServerGmPassword,
  resolveServerGmPasswordEnvSource,
  resolveServerShadowUrl,
  resolveServerShadowUrlEnvSource,
} = require('./server-env-alias');
const { normalizeBooleanEnv } = require('../packages/server/src/tools/gm-database-proof-lib');

/**
 * 记录shadow 环境地址。
 */
const shadowUrl = resolveServerShadowUrl();
/**
 * 记录shadow 环境环境变量来源地址。
 */
const shadowUrlEnvSource = resolveServerShadowUrlEnvSource();
/**
 * 记录GMpassword。
 */
const gmPassword = resolveServerGmPassword();
/**
 * 记录GMpassword环境变量来源。
 */
const gmPasswordEnvSource = resolveServerGmPasswordEnvSource();
/**
 * 记录allowdestructive。
 */
const allowDestructive = normalizeBooleanEnv(process.env.SERVER_SHADOW_ALLOW_DESTRUCTIVE);

if (!shadowUrl) {
  process.stderr.write('release shadow destructive requires SERVER_SHADOW_URL or SERVER_URL\n');
  process.stderr.write('run pnpm verify:release:doctor first, then set SERVER_SHADOW_URL or SERVER_URL and rerun pnpm verify:release:shadow:destructive\n');
  process.exit(1);
}

if (!gmPassword) {
  process.stderr.write('release shadow destructive requires SERVER_GM_PASSWORD or GM_PASSWORD\n');
  process.stderr.write('run pnpm verify:release:doctor first, then set SERVER_GM_PASSWORD or GM_PASSWORD and rerun pnpm verify:release:shadow:destructive\n');
  process.exit(1);
}

if (!allowDestructive) {
  process.stderr.write('release shadow destructive requires SERVER_SHADOW_ALLOW_DESTRUCTIVE=1\n');
  process.stderr.write('only run this during a maintenance window after you explicitly allow destructive GM database proof\n');
  process.exit(1);
}

process.stdout.write('[release:shadow:destructive] steps=preflight -> smoke:shadow:gm-database\n');
process.stdout.write('[release:shadow:destructive] gate=shadow-destructive\n');
const status = runVerificationSteps({
  command: 'pnpm verify:release:shadow:destructive',
  gate: 'release:shadow:destructive',
  cwd: repoRoot,
  dbEnabled: false,
  shadowEnabled: true,
  destructiveEnabled: true,
  env: {
    ...process.env,
    ...(shadowUrlEnvSource === 'SERVER_SHADOW_URL' ? null : { SERVER_SHADOW_URL: shadowUrl }),
    ...(gmPasswordEnvSource === 'SERVER_GM_PASSWORD' ? null : { SERVER_GM_PASSWORD: gmPassword }),
    SERVER_SHADOW_ALLOW_DESTRUCTIVE: '1',
  },
  steps: [
    { label: 'preflight', command: process.execPath, args: [path.join(repoRoot, 'scripts/release-shadow-destructive-preflight.js')], shell: false },
    { label: 'smoke:shadow:gm-database', args: ['--filter', '@mud/server', 'smoke:shadow:gm-database'] },
  ],
});

if (status !== 0) {
  process.exit(status);
}

process.stdout.write('[release:shadow:destructive] done step=smoke:shadow:gm-database\n');
process.stdout.write('[release:shadow:destructive] completed\n');
process.stdout.write('[release:shadow:destructive] boundary=maintenance-window destructive proof only; this does not imply daily release gates or complete replacement completion\n');
process.stdout.write('[release:shadow:destructive] next=write the real maintenance-window evidence back into ops/runbook records after execution\n');
process.exit(0);
