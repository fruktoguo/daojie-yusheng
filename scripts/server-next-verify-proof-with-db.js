#!/usr/bin/env node
'use strict';

/**
 * 用途：兼容旧命令名，转发到 replace-ready 的带数据库 proof流程。
 */

const { printVerifyAliasBanner } = require('./verify-alias-banner.js');

printVerifyAliasBanner('verify:server-next:proof:with-db', 'pnpm verify:replace-ready:proof:with-db');

require('./replace-ready-proof-with-db.js');
