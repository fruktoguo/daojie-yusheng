#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { runVerificationSteps } = require('./verification-timing');

const repoRoot = path.resolve(__dirname, '..');

const status = runVerificationSteps({
  command: 'pnpm verify:client',
  gate: 'verify:client',
  cwd: repoRoot,
  dbEnabled: false,
  shadowEnabled: false,
  steps: [
    { label: 'build:client', args: ['build:client'] },
  ],
});

process.exit(status);
