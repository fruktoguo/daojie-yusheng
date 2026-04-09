#!/usr/bin/env node
'use strict';

const { printServerNextVerifyAliasBanner } = require('./server-next-verify-alias-banner.js');

printServerNextVerifyAliasBanner('verify:server-next:doctor', 'pnpm verify:replace-ready:doctor');

require('./replace-ready-doctor.js');
