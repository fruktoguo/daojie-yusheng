#!/usr/bin/env node
'use strict';

/**
 * 用途：输出 server-next verify 兼容命令的别名提示（兼容转发层）。
 */

const { printVerifyAliasBanner } = require('./verify-alias-banner.js');

function printServerNextVerifyAliasBanner(aliasCommand, replaceReadyCommand) {
  return printVerifyAliasBanner(aliasCommand, replaceReadyCommand);
}

module.exports = {
  printServerNextVerifyAliasBanner,
};
