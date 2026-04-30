#!/usr/bin/env node
'use strict';

require('./load-local-runtime-env');

/**
 * 用途：执行 server 替换链路的带数据库 proof流程。
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
 * 记录traceenabled价值。
 */
const traceEnabledValue = process.env.SERVER_AUTH_TRACE_ENABLED || process.env.SERVER_AUTH_TRACE_ENABLED || '1';

if (!databaseUrl) {
  process.stderr.write('release proof with-db requires DATABASE_URL or SERVER_DATABASE_URL\n');
  process.stderr.write('run pnpm verify:release:doctor first, then set DATABASE_URL or SERVER_DATABASE_URL and rerun pnpm verify:release:proof:with-db\n');
  process.exit(1);
}

/**
 * 汇总子进程环境变量。
 */
const childEnv = {
  ...process.env,
  SERVER_AUTH_TRACE_ENABLED: traceEnabledValue,
  SERVER_AUTH_TRACE_ENABLED: traceEnabledValue,
  SERVER_ALLOW_UNREADY_TRAFFIC: '',
  SERVER_SMOKE_ALLOW_UNREADY: '',
  ...(databaseEnvSource === 'SERVER_DATABASE_URL' ? null : { SERVER_DATABASE_URL: databaseUrl }),
};

process.stdout.write('[release:proof:with-db] steps=verify:release:proof:with-db\n');
process.stdout.write('[release:proof:with-db] gate=proof-with-db\n');
const status = runVerificationSteps({
  command: 'pnpm verify:release:proof:with-db',
  gate: 'release:proof:with-db',
  cwd: repoRoot,
  env: childEnv,
  dbEnabled: true,
  shadowEnabled: Boolean(process.env.SERVER_SHADOW_URL || process.env.SERVER_URL),
  steps: [
    { label: 'verify:release:proof:with-db', args: ['--filter', '@mud/server', 'verify:release:proof:with-db'] },
  ],
});

if (status !== 0) {
  process.exit(status);
}

process.stdout.write('[release:proof:with-db] done step=verify:release:proof:with-db\n');
process.stdout.write('[release:proof:with-db] completed\n');
process.stdout.write('[release:proof:with-db] boundary=minimal auth/token/bootstrap proof only; this does not replace full with-db, acceptance, or full gate\n');
process.stdout.write('[release:proof:with-db] next=run pnpm verify:release:with-db for the broader local database gate\n');
process.exit(0);
