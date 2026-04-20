#!/usr/bin/env node
'use strict';

require('./load-local-runtime-env');

/**
 * 用途：执行 server-next 替换链路的环境自检流程。
 */
const {
  resolveServerNextDatabaseUrl,
  resolveServerNextGmPassword,
  resolveServerNextShadowUrl,
} = require('./server-next-env-alias');
const { probeShadowTarget } = require('./shadow-target-probe');


const hasDatabase = Boolean(resolveServerNextDatabaseUrl());
const hasShadowUrl = Boolean(resolveServerNextShadowUrl());

const hasGmPassword = Boolean(resolveServerNextGmPassword());

const hasShadowDestructiveGate = process.env.SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE === '1';

function buildMissingShadowMessage() {
  return [
    hasShadowUrl ? null : 'SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL',
    hasGmPassword ? null : 'SERVER_NEXT_GM_PASSWORD/GM_PASSWORD',
  ].filter(Boolean).join(' + ');
}

async function main() {
  const lines = [];
  const shadowProbe = hasShadowUrl ? await probeShadowTarget(resolveServerNextShadowUrl()) : null;
  const shadowReady = hasShadowUrl && hasGmPassword && shadowProbe?.ok === true;

  lines.push('replace-ready doctor');
  lines.push('');
  lines.push('说明: doctor 只回答环境是否齐备，不回答门禁已经通过，更不代表完整替换完成。');
  lines.push('');
  lines.push(`- local replace-ready: ready`);
  lines.push(`- with-db replace-ready: ${hasDatabase ? 'ready' : 'missing DATABASE_URL/SERVER_NEXT_DATABASE_URL'}`);
  lines.push(`- proof with-db: ${hasDatabase ? 'ready (minimal auth/token/bootstrap proof chain)' : 'missing DATABASE_URL/SERVER_NEXT_DATABASE_URL'}`);
  lines.push(`- shadow target probe: ${!hasShadowUrl ? 'missing SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL' : shadowProbe?.ok === true ? `ready (${shadowProbe.reason})` : `not-ready (${shadowProbe?.reason ?? 'probe_unavailable'})`}`);
  lines.push(`- shadow replace-ready: ${shadowReady ? 'ready' : hasShadowUrl && hasGmPassword ? `blocked by shadow target (${shadowProbe?.reason ?? 'probe_unavailable'})` : 'missing ' + buildMissingShadowMessage()}`);
  lines.push(`- shadow destructive gm-database proof: ${shadowReady && hasShadowDestructiveGate ? 'gated-ready (still requires remote maintenance window)' : hasShadowUrl && hasGmPassword ? 'missing SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1 + maintenance-active shadow target' : 'missing ' + [
    hasShadowUrl ? null : 'SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL',
    hasGmPassword ? null : 'SERVER_NEXT_GM_PASSWORD/GM_PASSWORD',
    hasShadowDestructiveGate ? null : 'SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1',
  ].filter(Boolean).join(' + ') + ' + maintenance-active shadow target'}`);
  lines.push(`- acceptance replace-ready: ${shadowReady ? 'ready' : hasShadowUrl && hasGmPassword ? `blocked by shadow target (${shadowProbe?.reason ?? 'probe_unavailable'})` : 'missing ' + buildMissingShadowMessage()}`);
  lines.push(`- full replace-ready: ${hasDatabase && shadowReady ? 'ready (with-db + gm-database + shadow + gm-next)' : hasDatabase && hasShadowUrl && hasGmPassword ? `blocked by shadow target (${shadowProbe?.reason ?? 'probe_unavailable'})` : 'missing ' + [
    hasDatabase ? null : 'DATABASE_URL/SERVER_NEXT_DATABASE_URL',
    hasShadowUrl ? null : 'SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL',
    hasGmPassword ? null : 'SERVER_NEXT_GM_PASSWORD/GM_PASSWORD',
  ].filter(Boolean).join(' + ')}`);
  lines.push('');
  lines.push('recommended commands:');
  lines.push('- local: pnpm verify:replace-ready');
  if (hasDatabase) {
    lines.push('- with-db: pnpm verify:replace-ready:with-db');
    lines.push('- proof with-db: pnpm verify:replace-ready:proof:with-db  # minimal auth/token/bootstrap proof chain');
  } else {
    lines.push('- with-db: export DATABASE_URL or SERVER_NEXT_DATABASE_URL first, then run pnpm verify:replace-ready:with-db');
    lines.push('- proof with-db: export DATABASE_URL or SERVER_NEXT_DATABASE_URL first, then run pnpm verify:replace-ready:proof:with-db  # minimal auth/token/bootstrap proof chain');
  }
  if (shadowReady) {
    lines.push('- shadow: pnpm verify:replace-ready:shadow');
    if (hasShadowDestructiveGate) {
      lines.push('- shadow destructive preflight: pnpm verify:replace-ready:shadow:destructive:preflight');
      lines.push('- shadow destructive: pnpm verify:replace-ready:shadow:destructive  # only after preflight says maintenance-active');
    } else {
      lines.push('- shadow destructive preflight: export SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1 during a maintenance window, then run pnpm verify:replace-ready:shadow:destructive:preflight');
      lines.push('- shadow destructive: after preflight says maintenance-active, run pnpm verify:replace-ready:shadow:destructive');
    }
    lines.push('- acceptance: pnpm verify:replace-ready:acceptance');
  } else {
    lines.push('- shadow: fix SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL so /health is reachable and /api/auth/gm/login is not 404, then run pnpm verify:replace-ready:shadow');
    lines.push('- shadow destructive preflight: after the shadow target is correct, export SERVER_NEXT_SHADOW_ALLOW_DESTRUCTIVE=1 during a maintenance window, then run pnpm verify:replace-ready:shadow:destructive:preflight');
    lines.push('- shadow destructive: only after preflight says maintenance-active, run pnpm verify:replace-ready:shadow:destructive');
    lines.push('- acceptance: fix the shadow target first, then run pnpm verify:replace-ready:acceptance');
  }
  if (hasDatabase && shadowReady) {
    lines.push('- full: pnpm verify:replace-ready:full');
  } else if (hasDatabase && hasShadowUrl && hasGmPassword) {
    lines.push('- full: fix the shadow target first, then run pnpm verify:replace-ready:full');
  } else {
    lines.push('- full: export DATABASE_URL/SERVER_NEXT_DATABASE_URL, SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL and SERVER_NEXT_GM_PASSWORD/GM_PASSWORD first, then run pnpm verify:replace-ready:full');
  }
  lines.push('');
  lines.push('package-level current commands:');
  lines.push('- pnpm verify:replace-ready');
  lines.push('- pnpm verify:replace-ready:doctor');
  lines.push('- pnpm verify:replace-ready:with-db');
  lines.push('- pnpm verify:replace-ready:proof:with-db');
  lines.push('- pnpm verify:replace-ready:shadow');
  lines.push('- pnpm verify:replace-ready:shadow:destructive:preflight');
  lines.push('- pnpm verify:replace-ready:shadow:destructive');
  lines.push('- pnpm verify:replace-ready:acceptance');
  lines.push('- pnpm verify:replace-ready:full');
  lines.push('compat aliases still available: pnpm verify:server-next*');
  lines.push('');
  lines.push('boundary summary:');
  lines.push('- local/with-db: 自动 proof');
  lines.push('- acceptance: local + shadow + gm-next');
  lines.push('- full: with-db + gm-database + backup-persistence + shadow + gm-next');
  lines.push('- shadow-destructive: 维护窗口 destructive proof；不等于日常替换完成');

  process.stdout.write(lines.join('\n') + '\n');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
