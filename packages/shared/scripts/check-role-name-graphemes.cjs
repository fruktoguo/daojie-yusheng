'use strict';

const assert = require('node:assert/strict');
const {
  getRoleNameLengthUnits,
  isRoleNameWithinLimit,
  truncateRoleName,
} = require('../dist');

const familyEmoji = '👨‍👩‍👧';
const emojiName = `${familyEmoji}${familyEmoji}${familyEmoji}${familyEmoji}${familyEmoji}${familyEmoji}${familyEmoji}`;

assert.equal(getRoleNameLengthUnits(familyEmoji), 2, '一个可见 emoji 字素应按一个全角字计算');
assert.equal(isRoleNameWithinLimit(emojiName), true, '7 个复合 emoji 应满足角色名长度上限');
assert.equal(isRoleNameWithinLimit(`${emojiName}${familyEmoji}`), false, '8 个复合 emoji 应超出角色名长度上限');
assert.equal(truncateRoleName(`${emojiName}${familyEmoji}`), emojiName, '截断不得拆开 emoji 字素序列');
assert.equal(getRoleNameLengthUnits('abc道友'), 7, '英文与中文的旧权重规则必须保持');

console.log(JSON.stringify({ ok: true, case: 'role-name-graphemes' }, null, 2));
