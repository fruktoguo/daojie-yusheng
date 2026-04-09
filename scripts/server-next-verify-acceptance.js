#!/usr/bin/env node
'use strict';

/**
 * 用途：兼容旧命令名，转发到 replace-ready 的验收验证流程。
 */

const { printServerNextVerifyAliasBanner } = require('./server-next-verify-alias-banner.js');

printServerNextVerifyAliasBanner('verify:server-next:acceptance', 'pnpm verify:replace-ready:acceptance');

require('./replace-ready-acceptance.js');
