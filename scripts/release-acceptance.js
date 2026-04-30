#!/usr/bin/env node
'use strict';

require('./load-local-runtime-env');

/**
 * 用途：执行 server 替换链路的验收验证流程。
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

if (!shadowUrl || !gmPassword) {
/**
 * 记录missing。
 */
  const missing = [
    shadowUrl ? null : 'SERVER_SHADOW_URL/SERVER_URL',
    gmPassword ? null : 'SERVER_GM_PASSWORD/GM_PASSWORD',
  ].filter(Boolean);
  process.stderr.write(`release acceptance requires shadow env: ${missing.join(' + ')}\n`);
  process.stderr.write('run pnpm verify:release:doctor first, then set the missing env and rerun pnpm verify:release:acceptance\n');
  process.exit(1);
}

/**
 * 记录节点bin。
 */
const nodeBin = process.execPath;
/**
 * 汇总需要串行执行的步骤。
 */
const steps = [
  {
    label: 'release:local',
    kind: 'node',
    args: ['scripts/release-local.js'],
    extraEnv: {
      DATABASE_URL: '',
      SERVER_DATABASE_URL: '',
      SERVER_ALLOW_UNREADY_TRAFFIC: '',
      SERVER_SMOKE_ALLOW_UNREADY: '',
      SERVER_SKIP_LOCAL_ENV_AUTOLOAD: '1',
    },
  },
  {
    label: 'shadow',
    kind: 'node',
    args: ['scripts/release-shadow.js'],
    extraEnv: null,
  },
  {
    label: 'gm',
    kind: 'pnpm',
    args: ['--filter', '@mud/server', 'smoke:gm'],
    extraEnv: {
      DATABASE_URL: '',
      SERVER_DATABASE_URL: '',
      SERVER_ALLOW_UNREADY_TRAFFIC: '',
      SERVER_SMOKE_ALLOW_UNREADY: '',
      SERVER_URL: shadowUrl,
    },
  },
];

process.stdout.write('[release:acceptance] steps=release:local -> shadow -> gm\n');

const status = runVerificationSteps({
  command: 'pnpm verify:release:acceptance',
  gate: 'release:acceptance',
  cwd: repoRoot,
  dbEnabled: false,
  shadowEnabled: true,
  env: {
    ...process.env,
    ...(shadowUrlEnvSource === 'SERVER_SHADOW_URL' ? null : { SERVER_SHADOW_URL: shadowUrl }),
    ...(gmPasswordEnvSource === 'SERVER_GM_PASSWORD' ? null : { SERVER_GM_PASSWORD: gmPassword }),
  },
  steps: steps.map((step) => ({
    label: step.label,
    command: step.kind === 'pnpm' ? 'pnpm' : nodeBin,
    args: step.args,
    shell: step.kind === 'pnpm' ? process.platform === 'win32' : false,
    env: step.extraEnv ?? null,
  })),
});

if (status !== 0) {
  process.exit(status);
}

process.stdout.write('[release:acceptance] completed\n');
process.stdout.write('[release:acceptance] boundary=enhanced gate only; this still does not equal complete GM/admin manual regression\n');
process.stdout.write('[release:acceptance] next=run pnpm verify:release:full when database, shadow and GM env are all ready and you want the strictest automated gate\n');
process.exit(0);
