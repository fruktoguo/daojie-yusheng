#!/usr/bin/env node
'use strict';

require('./load-local-runtime-env');

/**
 * 用途：执行 server-next 替换链路的验收验证流程。
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

if (!shadowUrl || !gmPassword) {
/**
 * 记录missing。
 */
  const missing = [
    shadowUrl ? null : 'SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL',
    gmPassword ? null : 'SERVER_NEXT_GM_PASSWORD/GM_PASSWORD',
  ].filter(Boolean);
  process.stderr.write(`replace-ready acceptance requires shadow env: ${missing.join(' + ')}\n`);
  process.stderr.write('run pnpm verify:replace-ready:doctor first, then set the missing env and rerun pnpm verify:replace-ready:acceptance\n');
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
    label: 'replace-ready',
    kind: 'node',
    args: ['scripts/replace-ready.js'],
    extraEnv: {
      DATABASE_URL: '',
      SERVER_NEXT_DATABASE_URL: '',
      SERVER_NEXT_SKIP_LOCAL_ENV_AUTOLOAD: '1',
    },
  },
  {
    label: 'shadow',
    kind: 'node',
    args: ['scripts/replace-ready-shadow.js'],
    extraEnv: null,
  },
  {
    label: 'gm-next',
    kind: 'pnpm',
    args: ['--filter', '@mud/server-next', 'smoke:gm-next'],
    extraEnv: {
      DATABASE_URL: '',
      SERVER_NEXT_DATABASE_URL: '',
      SERVER_NEXT_URL: shadowUrl,
    },
  },
];

process.stdout.write('[replace-ready:acceptance] steps=replace-ready -> shadow -> gm-next\n');

for (const step of steps) {
/**
 * 记录命令。
 */
  const command = step.kind === 'pnpm' ? 'pnpm' : nodeBin;
  process.stdout.write(`[replace-ready:acceptance] start step=${step.label}\n`);
/**
 * 累计当前结果。
 */
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
