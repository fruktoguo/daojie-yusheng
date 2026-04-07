#!/usr/bin/env node
'use strict';

const { printServerNextVerifyAliasBanner } = require('./server-next-verify-alias-banner.js');

printServerNextVerifyAliasBanner('verify:server-next:shadow:destructive', 'pnpm verify:replace-ready:shadow:destructive');

require('./replace-ready-shadow-destructive.js');
