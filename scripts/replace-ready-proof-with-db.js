#!/usr/bin/env node
'use strict';

require('./load-local-runtime-env');

/**
 * 用途：执行 server-next 替换链路的带数据库 proof流程。
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const {
  resolveServerNextDatabaseEnvSource,
  resolveServerNextDatabaseUrl,
} = require('./server-next-env-alias');

/**
 * 记录数据库地址。
 */
const databaseUrl = resolveServerNextDatabaseUrl();
/**
 * 记录数据库环境变量来源。
 */
const databaseEnvSource = resolveServerNextDatabaseEnvSource();
/**
 * 记录traceenabled价值。
 */
const traceEnabledValue = process.env.SERVER_NEXT_AUTH_TRACE_ENABLED || process.env.NEXT_AUTH_TRACE_ENABLED || '1';

if (!databaseUrl) {
  process.stderr.write('replace-ready proof with-db requires DATABASE_URL or SERVER_NEXT_DATABASE_URL\n');
  process.stderr.write('run pnpm verify:replace-ready:doctor first, then set DATABASE_URL or SERVER_NEXT_DATABASE_URL and rerun pnpm verify:replace-ready:proof:with-db\n');
  process.exit(1);
}

/**
 * 汇总子进程环境变量。
 */
const childEnv = {
  ...process.env,
  NEXT_AUTH_TRACE_ENABLED: traceEnabledValue,
  SERVER_NEXT_AUTH_TRACE_ENABLED: traceEnabledValue,
  SERVER_NEXT_ALLOW_UNREADY_TRAFFIC: '',
  SERVER_NEXT_SMOKE_ALLOW_UNREADY: '',
  ...(databaseEnvSource === 'SERVER_NEXT_DATABASE_URL' ? null : { SERVER_NEXT_DATABASE_URL: databaseUrl }),
};

process.stdout.write('[replace-ready:proof:with-db] steps=verify:proof:with-db\n');
process.stdout.write('[replace-ready:proof:with-db] gate=proof-with-db\n');
process.stdout.write('[replace-ready:proof:with-db] start step=verify:proof:with-db\n');

/**
 * 累计当前结果。
 */
const result = spawnSync('pnpm', ['--filter', '@mud/server-next', 'verify:proof:with-db'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: childEnv,
});

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  process.stderr.write(`[replace-ready:proof:with-db] failed step=verify:proof:with-db status=${result.status ?? 1}\n`);
  process.exit(result.status ?? 1);
}

process.stdout.write('[replace-ready:proof:with-db] done step=verify:proof:with-db\n');
process.stdout.write('[replace-ready:proof:with-db] completed\n');
process.stdout.write('[replace-ready:proof:with-db] boundary=minimal auth/token/bootstrap proof only; this does not replace full with-db, acceptance, or full gate\n');
process.stdout.write('[replace-ready:proof:with-db] next=run pnpm verify:replace-ready:with-db for the broader local database gate\n');
process.exit(0);
