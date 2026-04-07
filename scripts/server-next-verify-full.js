#!/usr/bin/env node
'use strict';

const { printServerNextVerifyAliasBanner } = require('./server-next-verify-alias-banner.js');

printServerNextVerifyAliasBanner('verify:server-next:full', 'pnpm verify:replace-ready:full');

require('./replace-ready-full.js');
