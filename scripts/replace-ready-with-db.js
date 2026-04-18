#!/usr/bin/env node
'use strict';

/**
 * 用途：执行 server-next 替换链路的带数据库验证流程。
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const {
  resolveServerNextDatabaseEnvSource,
  resolveServerNextDatabaseUrl,
} = require('../packages/server/src/config/env-alias');

/**
 * 记录数据库地址。
 */
const databaseUrl = resolveServerNextDatabaseUrl();
/**
 * 记录数据库环境变量来源。
 */
const databaseEnvSource = resolveServerNextDatabaseEnvSource();

if (!databaseUrl) {
  process.stderr.write('replace-ready with-db requires DATABASE_URL or SERVER_NEXT_DATABASE_URL\n');
  process.stderr.write('run pnpm verify:replace-ready:doctor first, then set DATABASE_URL or SERVER_NEXT_DATABASE_URL and rerun pnpm verify:replace-ready:with-db\n');
  process.exit(1);
}

/**
 * 汇总子进程环境变量。
 */
const childEnv = {
  ...process.env,
  ...(databaseEnvSource === 'SERVER_NEXT_DATABASE_URL' ? null : { SERVER_NEXT_DATABASE_URL: databaseUrl }),
};
/**
 * 汇总需要串行执行的步骤。
 */
const steps = [
  { label: 'build:client-next', args: ['build:client-next'] },
  { label: 'verify:replace-ready:with-db', args: ['--filter', '@mud/server-next', 'verify:replace-ready:with-db'] },
  { label: 'audit:server-next-protocol', args: ['audit:server-next-protocol'] },
];

process.stdout.write('[replace-ready:with-db] steps=build:client-next -> verify:replace-ready:with-db -> audit:server-next-protocol\n');
process.stdout.write('[replace-ready:with-db] gate=with-db\n');

for (const step of steps) {
  process.stdout.write(`[replace-ready:with-db] start step=${step.label}\n`);
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
    process.stderr.write(`[replace-ready:with-db] failed step=${step.label} status=${result.status ?? 1}\n`);
    process.exit(result.status ?? 1);
  }
  process.stdout.write(`[replace-ready:with-db] done step=${step.label}\n`);
}

process.stdout.write('[replace-ready:with-db] completed\n');
process.stdout.write('[replace-ready:with-db] boundary=with-db automated proof only; this still does not include shadow acceptance or destructive proof\n');
process.stdout.write('[replace-ready:with-db] next=run pnpm verify:replace-ready:acceptance or pnpm verify:replace-ready:full when shadow + GM env are ready\n');
process.exit(0);
