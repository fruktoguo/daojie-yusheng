#!/usr/bin/env node
'use strict';

require('./load-local-runtime-env');

/**
 * 用途：执行 release 主链的带数据库验证流程。
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

if (!databaseUrl) {
  process.stderr.write('release with-db requires DATABASE_URL or SERVER_DATABASE_URL\n');
  process.stderr.write('run pnpm verify:release:doctor first, then set DATABASE_URL or SERVER_DATABASE_URL and rerun pnpm verify:release:with-db\n');
  process.exit(1);
}

/**
 * 汇总子进程环境变量。
 */
const childEnv = {
  ...process.env,
  SERVER_ALLOW_UNREADY_TRAFFIC: '',
  SERVER_SMOKE_ALLOW_UNREADY: '',
  ...(databaseEnvSource === 'SERVER_DATABASE_URL' ? null : { SERVER_DATABASE_URL: databaseUrl }),
};
/**
 * 汇总需要串行执行的步骤。
 */
const steps = [
  { label: 'build:client', args: ['build:client'] },
  { label: 'verify:release:with-db', args: ['--filter', '@mud/server', 'verify:release:with-db'] },
  { label: 'audit:protocol', args: ['audit:protocol'] },
];

process.stdout.write('[release:with-db] steps=build:client -> verify:release:with-db -> audit:protocol\n');
process.stdout.write('[release:with-db] gate=with-db\n');

const status = runVerificationSteps({
  command: 'pnpm verify:release:with-db',
  gate: 'release:with-db',
  cwd: repoRoot,
  env: childEnv,
  dbEnabled: true,
  shadowEnabled: Boolean(process.env.SERVER_SHADOW_URL || process.env.SERVER_URL),
  steps,
});

if (status !== 0) {
  process.exit(status);
}

process.stdout.write('[release:with-db] completed\n');
process.stdout.write('[release:with-db] boundary=with-db automated proof only; this includes local destructive gm-database restore proof, but still does not include shadow or acceptance/full environment proof\n');
process.stdout.write('[release:with-db] next=run pnpm verify:release:acceptance or pnpm verify:release:full when shadow + GM env are ready\n');
process.exit(0);
