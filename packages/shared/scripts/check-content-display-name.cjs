'use strict';

const assert = require('node:assert/strict');
const {
  getItemDisplayName,
  isUsableContentDisplayName,
  resolvePlayerFacingContentName,
} = require('../dist');

assert.equal(resolvePlayerFacingContentName('item.internal_id', '未知物品', '灵石'), '灵石');
assert.equal(resolvePlayerFacingContentName('item.internal_id', '未知物品', 'item.internal_id'), '未知物品');
assert.equal(resolvePlayerFacingContentName('tech.internal_id', '未知功法', '未知功法', '太虚诀'), '太虚诀');
assert.equal(isUsableContentDisplayName('buff.internal_id', '未知增益', 'buff.internal_id'), false);
assert.equal(getItemDisplayName({ itemId: 'item.internal_id' }), '未知物品');
assert.equal(getItemDisplayName({ itemId: 'item.internal_id', name: 'item.internal_id', enhanceLevel: 3 }), '+3 未知物品');

console.log(JSON.stringify({ ok: true, case: 'content-display-name' }, null, 2));
