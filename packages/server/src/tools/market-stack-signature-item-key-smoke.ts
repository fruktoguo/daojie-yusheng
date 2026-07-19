import assert from 'node:assert/strict';

import { ITEM_INSTANCE_PAYLOAD_KEYS, createItemStackSignature } from '@mud/shared';
import { parseMarketStackSignatureItemKey } from '../runtime/market/market-item-key.helpers';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

const clientItemKey = createItemStackSignature({
  itemId: 'iron_sword',
  count: 1,
  type: 'equipment',
  enhanceLevel: 5,
});

assert.equal(
  clientItemKey.split('#').length,
  ITEM_INSTANCE_PAYLOAD_KEYS.length + 1,
  '证明测试输入来自共享层当前完整堆叠签名，而不是手写历史格式',
);
assert.deepEqual(
  parseMarketStackSignatureItemKey(clientItemKey),
  { itemId: 'iron_sword', enhanceLevel: 5 },
  '客户端本地补齐的强化装备行必须能还原为求购物品',
);
assert.deepEqual(
  parseMarketStackSignatureItemKey('iron_sword#5'),
  { itemId: 'iron_sword', enhanceLevel: 5 },
  '已存在的历史两段签名必须继续兼容',
);
assert.deepEqual(
  parseMarketStackSignatureItemKey(createItemStackSignature({ itemId: 'iron_sword', count: 1, enhanceLevel: 0 })),
  { itemId: 'iron_sword', enhanceLevel: 0 },
  '零强化完整签名必须保留明确的零级身份',
);

for (const invalidItemKey of [
  '',
  '#5',
  'iron_sword',
  'iron_sword#',
  'iron_sword#five',
  `iron_sword#${Number.MAX_SAFE_INTEGER + 1}`,
]) {
  assert.equal(parseMarketStackSignatureItemKey(invalidItemKey), null, `非法签名必须被拒绝：${invalidItemKey}`);
}

console.log(JSON.stringify({
  ok: true,
  case: 'market-stack-signature-item-key',
  clientItemKey,
}, null, 2));
