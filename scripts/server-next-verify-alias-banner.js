#!/usr/bin/env node
'use strict';

function printServerNextVerifyAliasBanner(aliasCommand, replaceReadyCommand) {
  const alias = String(aliasCommand ?? '').trim();
  const target = String(replaceReadyCommand ?? '').trim();
  if (!alias || !target) {
    throw new Error(`invalid server-next verify alias banner args: alias=${alias} target=${target}`);
  }
  process.stdout.write(`[${alias}] alias -> ${target}\n`);
}

module.exports = {
  printServerNextVerifyAliasBanner,
};
