#!/usr/bin/env node
'use strict';

require('./load-local-runtime-env');

/**
 * 用途：执行 server 替换链路的shadow流程。
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { runVerificationSteps } = require('./verification-timing');

const repoRoot = path.resolve(__dirname, '..');
const {
  resolveServerGmPassword,
  resolveServerGmPasswordEnvSource,
  resolveServerShadowUrl,
  resolveServerShadowUrlEnvSource,
} = require('./server-env-alias');
const { probeShadowTarget } = require('./shadow-target-probe');

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

if (!shadowUrl) {
  process.stderr.write('release shadow requires SERVER_SHADOW_URL or SERVER_URL\n');
  process.stderr.write('run pnpm verify:release:doctor first, then set SERVER_SHADOW_URL or SERVER_URL and rerun pnpm verify:release:shadow\n');
  process.exit(1);
}

if (!gmPassword) {
  process.stderr.write('release shadow requires SERVER_GM_PASSWORD or GM_PASSWORD\n');
  process.stderr.write('run pnpm verify:release:doctor first, then set SERVER_GM_PASSWORD or GM_PASSWORD and rerun pnpm verify:release:shadow\n');
  process.exit(1);
}

async function main() {
  const shadowProbe = await probeShadowTarget(shadowUrl, { gmPassword });
  if (!shadowProbe.ok) {
    throw new Error(`shadow target ${shadowProbe.reason}; current /health payload=${JSON.stringify(shadowProbe.healthPayload ?? null)}; current /api/gm/state payload=${JSON.stringify(shadowProbe.gmStatePayload ?? null)}`);
  }

  process.stdout.write('[release:shadow] steps=smoke:shadow\n');
  process.stdout.write('[release:shadow] gate=shadow\n');
  const status = runVerificationSteps({
    command: 'pnpm verify:release:shadow',
    gate: 'release:shadow',
    cwd: repoRoot,
    dbEnabled: Boolean(process.env.DATABASE_URL || process.env.SERVER_DATABASE_URL),
    shadowEnabled: true,
    env: {
      ...process.env,
      ...(shadowUrlEnvSource === 'SERVER_SHADOW_URL' ? null : { SERVER_SHADOW_URL: shadowUrl }),
      ...(gmPasswordEnvSource === 'SERVER_GM_PASSWORD' ? null : { SERVER_GM_PASSWORD: gmPassword }),
    },
    steps: [
      { label: 'smoke:shadow', args: ['--filter', '@mud/server', 'smoke:shadow'] },
    ],
  });

  if (status !== 0) {
    process.exit(status);
  }

  process.stdout.write('[release:shadow] done step=smoke:shadow\n');
  process.stdout.write('[release:shadow] completed\n');
  process.stdout.write('[release:shadow] boundary=shadow automated acceptance only; this does not include gm, full database regression, or destructive proof\n');
  process.stdout.write('[release:shadow] next=run pnpm verify:release:acceptance for shadow + gm, or pnpm verify:release:shadow:destructive during a maintenance window\n');
  process.exit(0);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
