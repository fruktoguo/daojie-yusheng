#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assertIncludes(content, pattern, message) {
  if (!pattern.test(content)) {
    throw new Error(message);
  }
}

function assertMissing(content, pattern, message) {
  if (pattern.test(content)) {
    throw new Error(message);
  }
}

const gmHtml = read('packages/client/gm.html');
const gmTs = read('packages/client/src/gm.ts');
const gmPureTs = read('packages/client/src/gm/helpers/pure.ts');

assertIncludes(
  gmHtml,
  /<form\s+id="gm-login-form"\s+autocomplete="on">/,
  'GM 登录表单必须显式允许浏览器自动填充。',
);
assertIncludes(
  gmHtml,
  /<input\s+id="gm-username"[^>]*name="username"[^>]*value="gm"[^>]*autocomplete="username"[^>]*>/,
  'GM 登录表单必须提供稳定 username 锚点，供浏览器密码管理器匹配密码。',
);
assertIncludes(
  gmHtml,
  /<input\s+id="gm-password"[^>]*type="password"[^>]*name="password"[^>]*autocomplete="current-password"[^>]*>/,
  'GM 登录密码框必须保留 current-password 自动填充语义。',
);
assertMissing(
  gmTs,
  /localStorage\.getItem\(['"]mud:gm-password/,
  'GM 登录模块不得从 localStorage 读取明文密码。',
);
assertMissing(
  gmPureTs,
  /readPersistedGmPassword/,
  'GM 纯函数助手不得保留废弃的 readPersistedGmPassword 残留。',
);
assertMissing(
  gmPureTs,
  /persistGmPassword/,
  'GM 纯函数助手不得保留废弃的 persistGmPassword 残留。',
);

console.log('[proof:gm-login-autofill] ok');
