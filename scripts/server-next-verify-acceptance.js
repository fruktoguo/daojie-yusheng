#!/usr/bin/env node
'use strict';

const { printServerNextVerifyAliasBanner } = require('./server-next-verify-alias-banner.js');

printServerNextVerifyAliasBanner('verify:server-next:acceptance', 'pnpm verify:replace-ready:acceptance');

require('./replace-ready-acceptance.js');
