#!/usr/bin/env node
'use strict';

/**
 * 用途：兼容旧命令名，转发到 replace-ready 的环境自检流程。
 */

const { printVerifyAliasBanner } = require('./verify-alias-banner.js');

printVerifyAliasBanner('verify:server-next:doctor', 'pnpm verify:replace-ready:doctor');

require('./replace-ready-doctor.js');
