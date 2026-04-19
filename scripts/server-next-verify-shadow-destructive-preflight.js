#!/usr/bin/env node
'use strict';

const { printServerNextVerifyAliasBanner } = require('./server-next-verify-alias-banner.js');

printServerNextVerifyAliasBanner(
  'verify:server-next:shadow:destructive:preflight',
  'pnpm verify:replace-ready:shadow:destructive:preflight',
);

require('./replace-ready-shadow-destructive-preflight.js');
