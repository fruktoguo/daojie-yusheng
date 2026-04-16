#!/usr/bin/env node
'use strict';

/**
 * 用途：执行 server-next 替换链路的环境自检流程。
 */
const {
  resolveServerNextDatabaseUrl,
  resolveServerNextGmPassword,
  resolveServerNextShadowUrl,
} = require('../packages/server/src/config/env-alias');/**
 * 标记是否已数据库。
 */


const hasDatabase = Boolean(resolveServerNextDatabaseUrl());
const hasShadowUrl = Boolean(resolveServerNextShadowUrl());/**
 * 标记是否已GMpassword。
 */

const hasGmPassword = Boolean(resolveServerNextGmPassword());/**
 * 标记是否已shadow 环境destructivegate。
 */

const hasShadowDestructiveGate = process.env.SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE === '1';

const lines = [];

lines.push('replace-ready doctor');
lines.push('');
lines.push('说明: doctor 只回答环境是否齐备，不回答门禁已经通过，更不代表完整替换完成。');
lines.push('');
lines.push(`- local replace-ready: ready`);
lines.push(`- with-db replace-ready: ${hasDatabase ? 'ready' : 'missing DATABASE_URL/SERVER_NEXT_DATABASE_URL'}`);
lines.push(`- proof with-db: ${hasDatabase ? 'ready (minimal auth/token/bootstrap proof chain)' : 'missing DATABASE_URL/SERVER_NEXT_DATABASE_URL'}`);
lines.push(`- shadow replace-ready: ${hasShadowUrl && hasGmPassword ? 'ready' : 'missing ' + [
  hasShadowUrl ? null : 'SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL',
  hasGmPassword ? null : 'SERVER_NEXT_GM_PASSWORD/GM_PASSWORD',
].filter(Boolean).join(' + ')}`);
lines.push(`- shadow destructive gm-database proof: ${hasShadowUrl && hasGmPassword && hasShadowDestructiveGate ? 'gated-ready (still requires remote maintenance window)' : 'missing ' + [
  hasShadowUrl ? null : 'SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL',
  hasGmPassword ? null : 'SERVER_NEXT_GM_PASSWORD/GM_PASSWORD',
  hasShadowDestructiveGate ? null : 'SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1',
].filter(Boolean).join(' + ') + ' + maintenance-active shadow target'}`);
lines.push(`- acceptance replace-ready: ${hasShadowUrl && hasGmPassword ? 'ready' : 'missing ' + [
  hasShadowUrl ? null : 'SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL',
  hasGmPassword ? null : 'SERVER_NEXT_GM_PASSWORD/GM_PASSWORD',
].filter(Boolean).join(' + ')}`);
lines.push(`- full replace-ready: ${hasDatabase && hasShadowUrl && hasGmPassword ? 'ready (with-db + gm-database + shadow + gm-next)' : 'missing ' + [
  hasDatabase ? null : 'DATABASE_URL/SERVER_NEXT_DATABASE_URL',
  hasShadowUrl ? null : 'SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL',
  hasGmPassword ? null : 'SERVER_NEXT_GM_PASSWORD/GM_PASSWORD',
].filter(Boolean).join(' + ')}`);
lines.push('');
lines.push('recommended commands:');
lines.push('- local: pnpm verify:server-next');
if (hasDatabase) {
  lines.push('- with-db: pnpm verify:server-next:with-db');
  lines.push('- proof with-db: pnpm verify:server-next:proof:with-db  # minimal auth/token/bootstrap proof chain');
} else {
  lines.push('- with-db: export DATABASE_URL or SERVER_NEXT_DATABASE_URL first, then run pnpm verify:server-next:with-db');
  lines.push('- proof with-db: export DATABASE_URL or SERVER_NEXT_DATABASE_URL first, then run pnpm verify:server-next:proof:with-db  # minimal auth/token/bootstrap proof chain');
}
if (hasShadowUrl && hasGmPassword) {
  lines.push('- shadow: pnpm verify:server-next:shadow');
  if (hasShadowDestructiveGate) {
    lines.push('- shadow destructive: pnpm verify:server-next:shadow:destructive  # requires maintenance-active shadow target');
  } else {
    lines.push('- shadow destructive: export SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1 during a maintenance window, then run pnpm verify:server-next:shadow:destructive');
  }
  lines.push('- acceptance: pnpm verify:server-next:acceptance');
} else {
  lines.push('- shadow: export SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL and SERVER_NEXT_GM_PASSWORD/GM_PASSWORD first, then run pnpm verify:server-next:shadow');
  lines.push('- shadow destructive: export SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL, SERVER_NEXT_GM_PASSWORD/GM_PASSWORD and SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1 during a maintenance window, then run pnpm verify:server-next:shadow:destructive');
  lines.push('- acceptance: export SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL and SERVER_NEXT_GM_PASSWORD/GM_PASSWORD first, then run pnpm verify:server-next:acceptance');
}
if (hasDatabase && hasShadowUrl && hasGmPassword) {
  lines.push('- full: pnpm verify:server-next:full');
} else {
  lines.push('- full: export DATABASE_URL/SERVER_NEXT_DATABASE_URL, SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL and SERVER_NEXT_GM_PASSWORD/GM_PASSWORD first, then run pnpm verify:server-next:full');
}
lines.push('');
lines.push('package-level historical names:');
lines.push('- pnpm verify:replace-ready');
lines.push('- pnpm verify:replace-ready:doctor');
lines.push('- pnpm verify:replace-ready:with-db');
lines.push('- pnpm verify:replace-ready:proof:with-db');
lines.push('- pnpm verify:replace-ready:shadow');
lines.push('- pnpm verify:replace-ready:shadow:destructive');
lines.push('- pnpm verify:replace-ready:acceptance');
lines.push('- pnpm verify:replace-ready:full');
lines.push('');
lines.push('boundary summary:');
lines.push('- local/with-db: 自动 proof');
lines.push('- acceptance: local + shadow + gm-next');
lines.push('- full: with-db + gm-database + backup-persistence + shadow + gm-next');
lines.push('- shadow-destructive: 维护窗口 destructive proof；不等于日常替换完成');

process.stdout.write(lines.join('\n') + '\n');
