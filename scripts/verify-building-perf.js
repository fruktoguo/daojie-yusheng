#!/usr/bin/env node
'use strict';

require('./load-local-runtime-env');

const path = require('node:path');
const { runVerificationSteps } = require('./verification-timing');

const repoRoot = path.resolve(__dirname, '..');
const env = {
  ...process.env,
  DATABASE_URL: '',
  SERVER_DATABASE_URL: '',
  DATABASE_POOLER_URL: '',
  SERVER_DATABASE_POOLER_URL: '',
  SERVER_ALLOW_UNREADY_TRAFFIC: '',
  SERVER_SMOKE_ALLOW_UNREADY: '',
  SERVER_SKIP_LOCAL_ENV_AUTOLOAD: '1',
};

const status = runVerificationSteps({
  command: 'pnpm verify:building:perf',
  gate: 'verify:building:perf',
  cwd: repoRoot,
  env,
  dbEnabled: false,
  shadowEnabled: Boolean(process.env.SERVER_SHADOW_URL || process.env.SERVER_URL),
  steps: [
    { label: 'server compile', args: ['--filter', '@mud/server', 'compile'] },
    {
      label: 'building room fengshui bench',
      command: process.execPath,
      args: ['packages/server/dist/tools/bench-building-room-fengshui.js'],
      shell: false,
    },
  ],
});

process.exit(status);
