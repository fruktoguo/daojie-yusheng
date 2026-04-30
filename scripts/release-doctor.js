#!/usr/bin/env node
'use strict';

require('./load-local-runtime-env');

/**
 * 用途：执行 server 替换链路的环境自检流程。
 */
const {
  resolveServerDatabaseUrl,
  resolveServerGmPassword,
  resolveServerShadowUrl,
} = require('./server-env-alias');
const { probeShadowTarget } = require('./shadow-target-probe');


const hasDatabase = Boolean(resolveServerDatabaseUrl());
const hasShadowUrl = Boolean(resolveServerShadowUrl());

const hasGmPassword = Boolean(resolveServerGmPassword());

const hasShadowDestructiveGate = process.env.SERVER_SHADOW_ALLOW_DESTRUCTIVE === '1';

function buildMissingShadowMessage() {
  return [
    hasShadowUrl ? null : 'SERVER_SHADOW_URL/SERVER_URL',
    hasGmPassword ? null : 'SERVER_GM_PASSWORD/GM_PASSWORD',
  ].filter(Boolean).join(' + ');
}

async function main() {
  const lines = [];
  const shadowProbe = hasShadowUrl ? await probeShadowTarget(resolveServerShadowUrl()) : null;
  const shadowReady = hasShadowUrl && hasGmPassword && shadowProbe?.ok === true;

  lines.push('release doctor');
  lines.push('');
  lines.push('说明: doctor 只回答环境是否齐备，不回答门禁已经通过，更不代表完整发布完成。');
  lines.push('');
  lines.push(`- local release: ready`);
  lines.push(`- with-db release: ${hasDatabase ? 'ready' : 'missing DATABASE_URL/SERVER_DATABASE_URL'}`);
  lines.push(`- proof with-db: ${hasDatabase ? 'ready (minimal auth/token/bootstrap proof chain)' : 'missing DATABASE_URL/SERVER_DATABASE_URL'}`);
  lines.push(`- shadow target probe: ${!hasShadowUrl ? 'missing SERVER_SHADOW_URL/SERVER_URL' : shadowProbe?.ok === true ? `ready (${shadowProbe.reason})` : `not-ready (${shadowProbe?.reason ?? 'probe_unavailable'})`}`);
  lines.push(`- shadow release: ${shadowReady ? 'ready' : hasShadowUrl && hasGmPassword ? `blocked by shadow target (${shadowProbe?.reason ?? 'probe_unavailable'})` : 'missing ' + buildMissingShadowMessage()}`);
  lines.push(`- shadow destructive gm-database proof: ${shadowReady && hasShadowDestructiveGate ? 'gated-ready (still requires remote maintenance window)' : hasShadowUrl && hasGmPassword ? 'missing SERVER_SHADOW_ALLOW_DESTRUCTIVE=1 + maintenance-active shadow target' : 'missing ' + [
    hasShadowUrl ? null : 'SERVER_SHADOW_URL/SERVER_URL',
    hasGmPassword ? null : 'SERVER_GM_PASSWORD/GM_PASSWORD',
    hasShadowDestructiveGate ? null : 'SERVER_SHADOW_ALLOW_DESTRUCTIVE=1',
  ].filter(Boolean).join(' + ') + ' + maintenance-active shadow target'}`);
  lines.push(`- acceptance release: ${shadowReady ? 'ready' : hasShadowUrl && hasGmPassword ? `blocked by shadow target (${shadowProbe?.reason ?? 'probe_unavailable'})` : 'missing ' + buildMissingShadowMessage()}`);
  lines.push(`- full release: ${hasDatabase && shadowReady ? 'ready (with-db + backup-persistence + shadow + gm)' : hasDatabase && hasShadowUrl && hasGmPassword ? `blocked by shadow target (${shadowProbe?.reason ?? 'probe_unavailable'})` : 'missing ' + [
    hasDatabase ? null : 'DATABASE_URL/SERVER_DATABASE_URL',
    hasShadowUrl ? null : 'SERVER_SHADOW_URL/SERVER_URL',
    hasGmPassword ? null : 'SERVER_GM_PASSWORD/GM_PASSWORD',
  ].filter(Boolean).join(' + ')}`);
  lines.push('');
  lines.push('recommended commands:');
  lines.push('- quick: pnpm verify:quick');
  lines.push('- standard: pnpm verify:standard');
  lines.push('- release: pnpm verify:release');
  lines.push('- local: pnpm verify:release:local');
  if (hasDatabase) {
    lines.push('- with-db: pnpm verify:release:with-db');
    lines.push('- proof with-db: pnpm verify:release:proof:with-db  # minimal auth/token/bootstrap proof chain');
  } else {
    lines.push('- with-db: export DATABASE_URL or SERVER_DATABASE_URL first, then run pnpm verify:release:with-db');
    lines.push('- proof with-db: export DATABASE_URL or SERVER_DATABASE_URL first, then run pnpm verify:release:proof:with-db  # minimal auth/token/bootstrap proof chain');
  }
  if (shadowReady) {
    lines.push('- shadow: pnpm verify:release:shadow');
    if (hasShadowDestructiveGate) {
      lines.push('- shadow destructive preflight: pnpm verify:release:shadow:destructive:preflight');
      lines.push('- shadow destructive: pnpm verify:release:shadow:destructive  # only after preflight says maintenance-active');
    } else {
      lines.push('- shadow destructive preflight: export SERVER_SHADOW_ALLOW_DESTRUCTIVE=1 during a maintenance window, then run pnpm verify:release:shadow:destructive:preflight');
      lines.push('- shadow destructive: after preflight says maintenance-active, run pnpm verify:release:shadow:destructive');
    }
    lines.push('- acceptance: pnpm verify:release:acceptance');
  } else {
    lines.push('- shadow: fix SERVER_SHADOW_URL/SERVER_URL so /health is reachable and /api/auth/gm/login is not 404, then run pnpm verify:release:shadow');
    lines.push('- shadow destructive preflight: after the shadow target is correct, export SERVER_SHADOW_ALLOW_DESTRUCTIVE=1 during a maintenance window, then run pnpm verify:release:shadow:destructive:preflight');
    lines.push('- shadow destructive: only after preflight says maintenance-active, run pnpm verify:release:shadow:destructive');
    lines.push('- acceptance: fix the shadow target first, then run pnpm verify:release:acceptance');
  }
  if (hasDatabase && shadowReady) {
    lines.push('- full: pnpm verify:release:full');
  } else if (hasDatabase && hasShadowUrl && hasGmPassword) {
    lines.push('- full: fix the shadow target first, then run pnpm verify:release:full');
  } else {
    lines.push('- full: export DATABASE_URL/SERVER_DATABASE_URL, SERVER_SHADOW_URL/SERVER_URL and SERVER_GM_PASSWORD/GM_PASSWORD first, then run pnpm verify:release:full');
  }
  lines.push('');
  lines.push('package-level current commands:');
  lines.push('- pnpm verify:quick');
  lines.push('- pnpm verify:standard');
  lines.push('- pnpm verify:release');
  lines.push('- pnpm verify:release:local');
  lines.push('- pnpm verify:release:doctor');
  lines.push('- pnpm verify:release:with-db');
  lines.push('- pnpm verify:release:proof:with-db');
  lines.push('- pnpm verify:release:shadow');
  lines.push('- pnpm verify:release:shadow:destructive:preflight');
  lines.push('- pnpm verify:release:shadow:destructive');
  lines.push('- pnpm verify:release:acceptance');
  lines.push('- pnpm verify:release:full');
  lines.push('');
  lines.push('boundary summary:');
  lines.push('- quick: 快速本地反馈，不证明 DB/shadow');
  lines.push('- standard: 固定 local 门禁，不随 DB 环境自动升级');
  lines.push('- local/with-db: 自动 proof');
  lines.push('- acceptance: local + shadow + gm');
  lines.push('- full: with-db + backup-persistence + shadow + gm；如需重跑 gm-database 可追加 --rerun-gm-database');
  lines.push('- shadow-destructive: 维护窗口 destructive proof；不等于日常发布完成');

  process.stdout.write(lines.join('\n') + '\n');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
