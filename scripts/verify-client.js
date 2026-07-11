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
    { label: 'proof:gm-login-autofill', args: ['proof:gm-login-autofill'] },
    { label: 'build:client', args: ['build:client'] },
    { label: 'proof:technique-preview', args: ['proof:technique-preview'] },
  ],
});

process.exit(status);
