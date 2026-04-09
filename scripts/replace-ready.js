#!/usr/bin/env node
'use strict';

/**
 * 用途：执行 server-next 替换链路的默认验证流程。
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const {
  resolveServerNextDatabaseEnvSource,
  resolveServerNextDatabaseUrl,
} = require('../packages/server-next/src/config/env-alias');

/**
 * 记录数据库地址。
 */
const databaseUrl = resolveServerNextDatabaseUrl();
/**
 * 记录数据库环境变量来源。
 */
const databaseEnvSource = resolveServerNextDatabaseEnvSource();
/**
 * 记录校验script名称。
 */
const verifyScriptName = databaseUrl
  ? 'verify:replace-ready:with-db'
  : 'verify:replace-ready';
/**
 * 记录replace就绪状态mode。
 */
const replaceReadyMode = databaseUrl ? 'with-db' : 'local';
/**
 * 汇总子进程环境变量。
 */
const childEnv = {
  ...process.env,
  ...(databaseEnvSource === 'SERVER_NEXT_DATABASE_URL'
    ? null
    : (databaseUrl ? { SERVER_NEXT_DATABASE_URL: databaseUrl } : null)),
};

/**
 * 汇总需要串行执行的步骤。
 */
const steps = [
  { label: 'build:client-next', args: ['build:client-next'] },
  { label: verifyScriptName, args: ['--filter', '@mud/server-next', verifyScriptName] },
  { label: 'audit:server-next-protocol', args: ['audit:server-next-protocol'] },
];

process.stdout.write(`[replace-ready] mode=${replaceReadyMode}\n`);
process.stdout.write(`[replace-ready] steps=${steps.map((step) => step.label).join(' -> ')}\n`);

for (const step of steps) {
  process.stdout.write(`[replace-ready] start step=${step.label}\n`);
/**
 * 累计当前结果。
 */
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
    process.stderr.write(`[replace-ready] failed step=${step.label} status=${result.status ?? 1}\n`);
    process.exit(result.status ?? 1);
  }
  process.stdout.write(`[replace-ready] done step=${step.label}\n`);
}

process.stdout.write(`[replace-ready] completed mode=${replaceReadyMode}\n`);
process.stdout.write('[replace-ready] boundary=local proof only; this does not include shadow acceptance or complete GM/admin regression\n');
process.stdout.write('[replace-ready] next=run pnpm verify:replace-ready:acceptance for shadow + gm-compat, or pnpm verify:replace-ready:full for the strictest automated gate\n');
process.exit(0);
