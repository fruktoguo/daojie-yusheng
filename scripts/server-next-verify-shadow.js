#!/usr/bin/env node
'use strict';

const { printServerNextVerifyAliasBanner } = require('./server-next-verify-alias-banner.js');

printServerNextVerifyAliasBanner('verify:server-next:shadow', 'pnpm verify:replace-ready:shadow');

require('./replace-ready-shadow.js');
