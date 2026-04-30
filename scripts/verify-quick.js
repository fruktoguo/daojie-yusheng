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
  SERVER_ALLOW_UNREADY_TRAFFIC: '',
  SERVER_SMOKE_ALLOW_UNREADY: '',
  SERVER_SKIP_LOCAL_ENV_AUTOLOAD: '1',
};

const status = runVerificationSteps({
  command: 'pnpm verify:quick',
  gate: 'verify:quick',
  cwd: repoRoot,
  env,
  dbEnabled: false,
  shadowEnabled: Boolean(process.env.SERVER_SHADOW_URL || process.env.SERVER_URL),
  steps: [
    { label: 'server compile', args: ['--filter', '@mud/server', 'compile'] },
    { label: 'production boundaries', args: ['--filter', '@mud/server', 'proof:production-boundaries'] },
    { label: 'release gate contract', args: ['proof:release-gates'] },
    {
      label: 'quick smoke',
      command: process.execPath,
      args: [
        'packages/server/dist/tools/run-stable-smoke-suite.js',
        '--case',
        'readiness-gate',
        '--case',
        'runtime',
        '--case',
        'session',
      ],
      shell: false,
    },
  ],
});

process.exit(status);
