#!/usr/bin/env node
'use strict';

/**
 * 用途：执行 server-next 替换链路的全量验证流程。
 */

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
} = require('../packages/server/src/config/env-alias');

/**
 * 记录数据库地址。
 */
const databaseUrl = resolveServerNextDatabaseUrl();
/**
 * 记录数据库环境变量来源。
 */
const databaseEnvSource = resolveServerNextDatabaseEnvSource();
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

if (!databaseUrl || !shadowUrl || !gmPassword) {
/**
 * 记录missing。
 */
  const missing = [
    databaseUrl ? null : 'DATABASE_URL/SERVER_NEXT_DATABASE_URL',
    shadowUrl ? null : 'SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL',
    gmPassword ? null : 'SERVER_NEXT_GM_PASSWORD/GM_PASSWORD',
  ].filter(Boolean);
  process.stderr.write(`replace-ready full requires: ${missing.join(' + ')}\n`);
  process.stderr.write('run pnpm verify:server-next:doctor first, then set the missing env and rerun pnpm verify:server-next:full\n');
  process.exit(1);
}

/**
 * 汇总需要串行执行的步骤。
 */
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
    label: 'gm-next',
    kind: 'pnpm',
    args: ['--filter', '@mud/server-next', 'smoke:gm-next'],
    extraEnv: {
      SERVER_NEXT_URL: shadowUrl,
    },
  },
];
/**
 * 汇总子进程环境变量。
 */
const childEnv = {
  ...process.env,
  ...(databaseEnvSource === 'SERVER_NEXT_DATABASE_URL' ? null : { SERVER_NEXT_DATABASE_URL: databaseUrl }),
  ...(shadowUrlEnvSource === 'SERVER_NEXT_SHADOW_URL' ? null : { SERVER_NEXT_SHADOW_URL: shadowUrl }),
  ...(gmPasswordEnvSource === 'SERVER_NEXT_GM_PASSWORD' ? null : { SERVER_NEXT_GM_PASSWORD: gmPassword }),
};

process.stdout.write('[replace-ready:full] steps=with-db -> gm-database -> gm-database-backup-persistence -> shadow -> gm-next\n');

for (const step of steps) {
/**
 * 记录命令。
 */
  const command = step.kind === 'pnpm' ? 'pnpm' : nodeBin;
  process.stdout.write(`[replace-ready:full] start step=${step.label}\n`);
/**
 * 累计当前结果。
 */
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
