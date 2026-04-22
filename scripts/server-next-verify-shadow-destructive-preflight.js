#!/usr/bin/env node
'use strict';

const { printVerifyAliasBanner } = require('./verify-alias-banner.js');

printVerifyAliasBanner(
  'verify:server-next:shadow:destructive:preflight',
  'pnpm verify:replace-ready:shadow:destructive:preflight',
);

require('./replace-ready-shadow-destructive-preflight.js');
