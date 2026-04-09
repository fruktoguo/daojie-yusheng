#!/usr/bin/env node
'use strict';

/**
 * 用途：兼容旧命令名，转发到 replace-ready 的环境自检流程。
 */

const { printServerNextVerifyAliasBanner } = require('./server-next-verify-alias-banner.js');

printServerNextVerifyAliasBanner('verify:server-next:doctor', 'pnpm verify:replace-ready:doctor');

require('./replace-ready-doctor.js');
