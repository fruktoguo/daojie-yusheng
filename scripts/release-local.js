#!/usr/bin/env node
'use strict';

require('./load-local-runtime-env');

/**
 * 用途：执行 release 主链的默认验证流程。
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { runVerificationSteps } = require('./verification-timing');

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
  ? 'verify:release:with-db'
  : 'verify:release:local';
const verifyDisplayScriptName = databaseUrl
  ? 'verify:release:with-db'
  : 'verify:release:local';
/**
 * 记录replace就绪状态mode。
 */
const releaseMode = databaseUrl ? 'with-db' : 'local';
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
  { label: 'audit:protocol', args: ['--filter', '@mud/server', 'audit:protocol:compiled'] },
];

process.stdout.write(`[release:local] mode=${releaseMode}\n`);
process.stdout.write(`[release:local] gate=${releaseMode}\n`);
process.stdout.write(`[release:local] steps=${steps.map((step) => step.label).join(' -> ')}\n`);

const status = runVerificationSteps({
  command: 'pnpm verify:release:local',
  gate: `release:${releaseMode}`,
  cwd: repoRoot,
  env: childEnv,
  dbEnabled: Boolean(databaseUrl),
  shadowEnabled: Boolean(process.env.SERVER_SHADOW_URL || process.env.SERVER_URL),
  steps,
});

if (status !== 0) {
  process.exit(status);
}

process.stdout.write(`[release:local] completed mode=${releaseMode}\n`);
process.stdout.write('[release:local] boundary=local/with-db automated proof only; this does not include shadow acceptance, destructive proof, or complete GM/admin manual regression\n');
process.stdout.write('[release:local] next=run pnpm verify:release:acceptance for shadow + gm, pnpm verify:release:full for the strictest automated gate, or pnpm verify:release:doctor to inspect missing env\n');
process.exit(0);
