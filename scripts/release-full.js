#!/usr/bin/env node
'use strict';

require('./load-local-runtime-env');

/**
 * 用途：执行 server 替换链路的全量验证流程。
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { runVerificationSteps } = require('./verification-timing');

const repoRoot = path.resolve(__dirname, '..');
const nodeBin = process.execPath;
const {
  resolveServerDatabaseEnvSource,
  resolveServerDatabaseUrl,
  resolveServerGmPassword,
  resolveServerGmPasswordEnvSource,
  resolveServerShadowUrl,
  resolveServerShadowUrlEnvSource,
} = require('./server-env-alias');
const { probeShadowTarget } = require('./shadow-target-probe');

/**
 * 记录数据库地址。
 */
const databaseUrl = resolveServerDatabaseUrl();
/**
 * 记录数据库环境变量来源。
 */
const databaseEnvSource = resolveServerDatabaseEnvSource();
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
const rerunGmDatabase = process.argv.includes('--rerun-gm-database');

if (!databaseUrl || !shadowUrl || !gmPassword) {
/**
 * 记录missing。
 */
  const missing = [
    databaseUrl ? null : 'DATABASE_URL/SERVER_DATABASE_URL',
    shadowUrl ? null : 'SERVER_SHADOW_URL/SERVER_URL',
    gmPassword ? null : 'SERVER_GM_PASSWORD/GM_PASSWORD',
  ].filter(Boolean);
  process.stderr.write(`release full requires: ${missing.join(' + ')}\n`);
  process.stderr.write('run pnpm verify:release:doctor first, then set the missing env and rerun pnpm verify:release:full\n');
  process.exit(1);
}

/**
 * 汇总需要串行执行的步骤。
 */
const steps = [
  { label: 'with-db', kind: 'node', args: ['scripts/release-with-db.js'] },
  ...(rerunGmDatabase ? [{
    label: 'gm-database',
    kind: 'pnpm',
    args: ['--filter', '@mud/server', 'smoke:gm-database'],
  }] : []),
  {
    label: 'gm-database-backup-persistence',
    kind: 'pnpm',
    args: ['--filter', '@mud/server', 'smoke:gm-database:backup-persistence'],
  },
  { label: 'shadow', kind: 'node', args: ['scripts/release-shadow.js'] },
  {
    label: 'gm',
    kind: 'pnpm',
    args: ['--filter', '@mud/server', 'smoke:gm'],
    extraEnv: {
      SERVER_URL: shadowUrl,
    },
  },
];
/**
 * 汇总子进程环境变量。
 */
const childEnv = {
  ...process.env,
  SERVER_ALLOW_UNREADY_TRAFFIC: '',
  SERVER_SMOKE_ALLOW_UNREADY: '',
  ...(databaseEnvSource === 'SERVER_DATABASE_URL' ? null : { SERVER_DATABASE_URL: databaseUrl }),
  ...(shadowUrlEnvSource === 'SERVER_SHADOW_URL' ? null : { SERVER_SHADOW_URL: shadowUrl }),
  ...(gmPasswordEnvSource === 'SERVER_GM_PASSWORD' ? null : { SERVER_GM_PASSWORD: gmPassword }),
};

async function main() {
  const shadowProbe = await probeShadowTarget(shadowUrl, { gmPassword });
  if (!shadowProbe.ok) {
    process.stderr.write(`release full blocked by shadow target: ${shadowProbe.reason}\n`);
    process.stderr.write(`current /health payload=${JSON.stringify(shadowProbe.healthPayload ?? null)}\n`);
    process.stderr.write(`current /api/gm/state payload=${JSON.stringify(shadowProbe.gmStatePayload ?? null)}\n`);
    process.stderr.write('fix SERVER_SHADOW_URL/SERVER_URL first, then rerun pnpm verify:release:full\n');
    process.exit(1);
  }

  process.stdout.write(`[release:full] steps=${steps.map((step) => step.label).join(' -> ')}\n`);
  process.stdout.write('[release:full] gate=full\n');

  const status = runVerificationSteps({
    command: 'pnpm verify:release:full',
    gate: 'release:full',
    cwd: repoRoot,
    env: childEnv,
    dbEnabled: true,
    shadowEnabled: true,
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

  process.stdout.write('[release:full] completed\n');
  process.stdout.write('[release:full] boundary=strictest automated gate only; this still does not equal complete GM/admin manual regression\n');
  process.stdout.write('[release:full] next=if you need destructive proof, run pnpm verify:release:shadow:destructive during a maintenance window with explicit approval\n');
  process.exit(0);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
