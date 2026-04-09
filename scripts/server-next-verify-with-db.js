#!/usr/bin/env node
'use strict';

const { printServerNextVerifyAliasBanner } = require('./server-next-verify-alias-banner.js');

printServerNextVerifyAliasBanner('verify:server-next:with-db', 'pnpm verify:replace-ready:with-db');

require('./replace-ready-with-db.js');
