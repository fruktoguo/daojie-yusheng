#!/usr/bin/env node
'use strict';

require('./load-local-runtime-env');

const {
  resolveServerGmPassword,
  resolveServerGmPasswordEnvSource,
  resolveServerShadowUrl,
  resolveServerShadowUrlEnvSource,
} = require('./server-env-alias');
const {
  fetchHealth,
  normalizeBooleanEnv,
} = require('../packages/server/src/tools/gm-database-proof-lib');

const shadowUrl = resolveServerShadowUrl();
const shadowUrlEnvSource = resolveServerShadowUrlEnvSource();
const gmPassword = resolveServerGmPassword();
const gmPasswordEnvSource = resolveServerGmPasswordEnvSource();
const allowDestructive = normalizeBooleanEnv(process.env.SERVER_SHADOW_ALLOW_DESTRUCTIVE);

async function main() {
  if (!shadowUrl) {
    process.stderr.write('release shadow destructive preflight requires SERVER_SHADOW_URL or SERVER_URL\n');
    process.exit(1);
  }
  if (!gmPassword) {
    process.stderr.write('release shadow destructive preflight requires SERVER_GM_PASSWORD or GM_PASSWORD\n');
    process.exit(1);
  }
  if (!allowDestructive) {
    process.stderr.write('release shadow destructive preflight requires SERVER_SHADOW_ALLOW_DESTRUCTIVE=1\n');
    process.stderr.write('only run destructive proof during a maintenance window after explicit approval\n');
    process.exit(1);
  }

  const health = await fetchHealth(shadowUrl);
  const maintenanceActive = health.body?.readiness?.maintenance?.active === true;

  if (!maintenanceActive) {
    process.stderr.write('[release:shadow:destructive:preflight] blocked reason=target_not_maintenance_active\n');
    process.stderr.write(`[release:shadow:destructive:preflight] url=${shadowUrl}\n`);
    process.stderr.write(`[release:shadow:destructive:preflight] status=${health.status}\n`);
    process.stderr.write(`[release:shadow:destructive:preflight] shadowUrlSource=${shadowUrlEnvSource}\n`);
    process.stderr.write(`[release:shadow:destructive:preflight] gmPasswordSource=${gmPasswordEnvSource}\n`);
    process.exit(1);
  }

  process.stdout.write('[release:shadow:destructive:preflight] ready\n');
  process.stdout.write(`[release:shadow:destructive:preflight] url=${shadowUrl}\n`);
  process.stdout.write(`[release:shadow:destructive:preflight] status=${health.status}\n`);
  process.stdout.write('[release:shadow:destructive:preflight] maintenance=active\n');
  process.stdout.write(`[release:shadow:destructive:preflight] shadowUrlSource=${shadowUrlEnvSource}\n`);
  process.stdout.write(`[release:shadow:destructive:preflight] gmPasswordSource=${gmPasswordEnvSource}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
