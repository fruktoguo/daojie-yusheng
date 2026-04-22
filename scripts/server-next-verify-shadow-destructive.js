#!/usr/bin/env node
'use strict';

/**
 * 用途：兼容旧命令名，转发到 replace-ready 的破坏性 shadow流程。
 */

const { printVerifyAliasBanner } = require('./verify-alias-banner.js');

printVerifyAliasBanner('verify:server-next:shadow:destructive', 'pnpm verify:replace-ready:shadow:destructive');

require('./replace-ready-shadow-destructive.js');
