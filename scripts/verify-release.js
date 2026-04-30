#!/usr/bin/env node
'use strict';

require('./load-local-runtime-env');

const path = require('node:path');
const {
  resolveServerDatabaseUrl,
  resolveServerGmPassword,
  resolveServerShadowUrl,
} = require('./server-env-alias');
const { runVerificationSteps } = require('./verification-timing');

const repoRoot = path.resolve(__dirname, '..');
const databaseUrl = resolveServerDatabaseUrl();
const shadowUrl = resolveServerShadowUrl();
const gmPassword = resolveServerGmPassword();

const status = runVerificationSteps({
  command: 'pnpm verify:release',
  gate: 'verify:release',
  cwd: repoRoot,
  dbEnabled: Boolean(databaseUrl),
  shadowEnabled: Boolean(shadowUrl),
  steps: [
    { label: 'doctor', command: process.execPath, args: ['scripts/release-doctor.js'], shell: false },
    { label: 'standard', command: process.execPath, args: ['scripts/verify-standard.js'], shell: false },
    { label: 'with-db', command: process.execPath, args: ['scripts/release-with-db.js'], shell: false },
    { label: 'shadow', command: process.execPath, args: ['scripts/release-shadow.js'], shell: false },
    {
      label: 'gm',
      args: ['--filter', '@mud/server', 'smoke:gm'],
      env: shadowUrl ? { SERVER_URL: shadowUrl } : null,
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
