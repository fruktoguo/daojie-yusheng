#!/usr/bin/env node
'use strict';

/**
 * 用途：兼容旧命令名，转发到 replace-ready 的带数据库验证流程。
 */

const { printServerNextVerifyAliasBanner } = require('./server-next-verify-alias-banner.js');

printServerNextVerifyAliasBanner('verify:server-next:with-db', 'pnpm verify:replace-ready:with-db');

require('./replace-ready-with-db.js');
