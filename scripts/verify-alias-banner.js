#!/usr/bin/env node
'use strict';

/**
 * 用途：输出 verify 兼容命令的别名提示（中性命名）。
 */

function printVerifyAliasBanner(aliasCommand, replaceReadyCommand) {
  const alias = String(aliasCommand ?? '').trim();
  const target = String(replaceReadyCommand ?? '').trim();
  if (!alias || !target) {
    throw new Error(`invalid verify alias banner args: alias=${alias} target=${target}`);
  }
  process.stdout.write(`[${alias}] alias -> ${target}\n`);
}

module.exports = {
  printVerifyAliasBanner,
};
