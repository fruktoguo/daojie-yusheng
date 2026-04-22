#!/usr/bin/env node
'use strict';

/**
 * 用途：兼容旧命令名，转发到 replace-ready 的全量验证流程。
 */

const { printVerifyAliasBanner } = require('./verify-alias-banner.js');

printVerifyAliasBanner('verify:server-next:full', 'pnpm verify:replace-ready:full');

require('./replace-ready-full.js');
