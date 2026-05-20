#!/usr/bin/env node
'use strict';

require('./load-local-runtime-env');

const path = require('node:path');
const {
  resolveServerDatabaseUrl,
  resolveServerGmPassword,
  resolveServerShadowUrl,
} = require('./server-env-alias');
const { runReleaseVerificationSteps } = require('./release-verification-mode');

const repoRoot = path.resolve(__dirname, '..');
const databaseUrl = resolveServerDatabaseUrl();
const shadowUrl = resolveServerShadowUrl();
const gmPassword = resolveServerGmPassword();

async function main() {
  const status = await runReleaseVerificationSteps({
    command: 'pnpm verify:release',
    gate: 'verify:release',
    cwd: repoRoot,
    dbEnabled: Boolean(databaseUrl),
    shadowEnabled: Boolean(shadowUrl),
    steps: [
      { label: 'doctor', command: process.execPath, args: ['scripts/release-doctor.js'], shell: false },
      { label: 'standard', command: process.execPath, args: ['scripts/verify-standard.js'], shell: false },
      { label: 'with-db', command: process.execPath, args: ['scripts/release-with-db.js'], shell: false, serial: true },
      { label: 'shadow', command: process.execPath, args: ['scripts/release-shadow.js'], shell: false, serial: true },
      {
        label: 'gm',
        args: ['--filter', '@mud/server', 'smoke:gm'],
        env: shadowUrl ? { SERVER_URL: shadowUrl } : null,
        serial: true,
      },
    ],
    env: {
      ...process.env,
      ...(databaseUrl ? { SERVER_DATABASE_URL: databaseUrl } : null),
      ...(shadowUrl ? { SERVER_SHADOW_URL: shadowUrl } : null),
      ...(gmPassword ? { SERVER_GM_PASSWORD: gmPassword } : null),
    },
  });

  process.exit(status);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
