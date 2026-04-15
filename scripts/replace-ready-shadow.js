#!/usr/bin/env node
'use strict';

/**
 * 用途：执行 server-next 替换链路的shadow流程。
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const {
  resolveServerNextGmPassword,
  resolveServerNextGmPasswordEnvSource,
  resolveServerNextShadowUrl,
  resolveServerNextShadowUrlEnvSource,
} = require('../packages/server/src/config/env-alias');

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

if (!shadowUrl) {
  process.stderr.write('replace-ready shadow requires SERVER_NEXT_SHADOW_URL or SERVER_NEXT_URL\n');
  process.stderr.write('set SERVER_NEXT_SHADOW_URL or SERVER_NEXT_URL first, then run pnpm verify:server-next:shadow\n');
  process.exit(1);
}

if (!gmPassword) {
  process.stderr.write('replace-ready shadow requires SERVER_NEXT_GM_PASSWORD or GM_PASSWORD\n');
  process.stderr.write('set SERVER_NEXT_GM_PASSWORD or GM_PASSWORD first, then run pnpm verify:server-next:shadow\n');
  process.exit(1);
}

process.stdout.write('[replace-ready:shadow] steps=smoke:shadow\n');
process.stdout.write('[replace-ready:shadow] start step=smoke:shadow\n');

/**
 * 累计当前结果。
 */
const result = spawnSync('pnpm', ['--filter', '@mud/server-next', 'smoke:shadow'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    ...(shadowUrlEnvSource === 'SERVER_NEXT_SHADOW_URL' ? null : { SERVER_NEXT_SHADOW_URL: shadowUrl }),
    ...(gmPasswordEnvSource === 'SERVER_NEXT_GM_PASSWORD' ? null : { SERVER_NEXT_GM_PASSWORD: gmPassword }),
  },
});

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.stderr.write(`[replace-ready:shadow] failed step=smoke:shadow status=${result.status ?? 1}\n`);
  process.exit(result.status ?? 1);
}

process.stdout.write('[replace-ready:shadow] done step=smoke:shadow\n');
process.stdout.write('[replace-ready:shadow] completed\n');
process.exit(0);
