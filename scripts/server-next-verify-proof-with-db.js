#!/usr/bin/env node
'use strict';

const { printServerNextVerifyAliasBanner } = require('./server-next-verify-alias-banner.js');

printServerNextVerifyAliasBanner('verify:server-next:proof:with-db', 'pnpm verify:replace-ready:proof:with-db');

require('./replace-ready-proof-with-db.js');
