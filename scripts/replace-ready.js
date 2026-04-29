#!/usr/bin/env node
'use strict';

require('./load-local-runtime-env');

/**
 * 用途：执行 replace-ready 主链的默认验证流程。
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const {
  resolveServerDatabaseEnvSource,
  resolveServerDatabaseUrl,
} = require('./server-env-alias');

/**
 * 记录数据库地址。
 */
const databaseUrl = resolveServerDatabaseUrl();
/**
 * 记录数据库环境变量来源。
 */
const databaseEnvSource = resolveServerDatabaseEnvSource();
/**
 * 记录校验script名称。
 */
const verifyPackageScriptName = databaseUrl
  ? 'verify:replace-ready:with-db'
  : 'verify:replace-ready';
const verifyDisplayScriptName = databaseUrl
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
  SERVER_ALLOW_UNREADY_TRAFFIC: '',
  SERVER_SMOKE_ALLOW_UNREADY: '',
  ...(databaseEnvSource === 'SERVER_DATABASE_URL'
    ? null
    : (databaseUrl ? { SERVER_DATABASE_URL: databaseUrl } : null)),
};

/**
 * 汇总需要串行执行的步骤。
 */
const steps = [
  { label: 'build:client', args: ['build:client'] },
  { label: verifyDisplayScriptName, args: ['--filter', '@mud/server', verifyPackageScriptName] },
  { label: 'audit:protocol', args: ['audit:protocol'] },
];

process.stdout.write(`[replace-ready] mode=${replaceReadyMode}\n`);
process.stdout.write(`[replace-ready] gate=${replaceReadyMode}\n`);
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
process.stdout.write('[replace-ready] boundary=local/with-db automated proof only; this does not include shadow acceptance, destructive proof, or complete GM/admin manual regression\n');
process.stdout.write('[replace-ready] next=run pnpm verify:replace-ready:acceptance for shadow + gm, pnpm verify:replace-ready:full for the strictest automated gate, or pnpm verify:replace-ready:doctor to inspect missing env\n');
process.exit(0);
