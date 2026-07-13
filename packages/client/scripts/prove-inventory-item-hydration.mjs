/**
 * 背包轻量物品水合回归证明。
 *
 * 直接执行纯水合模块，锁定旧槽位隔离、实例字段完整保留和模板合并优先级。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadHydrationModule() {
  const sourcePath = path.join(clientRoot, 'src/content/inventory-item-hydration.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  const module = { exports: {} };
  const execute = new Function('exports', 'module', output);
  execute(module.exports, module);
  return module.exports;
}

const { hydrateSyncedInventoryItem } = loadHydrationModule();
const options = {
  cloneValue: (value) => structuredClone(value),
  resolvePreviewItem: (item) => ({
    name: item.itemId,
    type: 'material',
    desc: '',
    ...item,
  }),
};

const sameInstance = hydrateSyncedInventoryItem({
  itemId: 'equipment.test',
  itemInstanceId: 'instance:old',
  count: 2,
  enhanceLevel: 2,
}, options);
assert.equal(sameInstance.equipAttrs, undefined, '完整实例回包缺失的字段不得从旧槽位补回');
assert.equal(sameInstance.count, 2, '当前回包数量必须覆盖上一版数量');
assert.equal(sameInstance.name, '未知物品', '解析出的名称等于 itemId 时必须改用玩家可见占位名');

const replacement = hydrateSyncedInventoryItem({
  itemId: 'equipment.test',
  itemInstanceId: 'instance:new',
  count: 1,
  enhanceLevel: 2,
}, options);
assert.equal(replacement.equipAttrs, undefined, '同模板新实例不得继承旧实例属性');
assert.equal(replacement.equipSpecialStats, undefined, '同模板新实例不得继承旧实例特殊属性');

const missingIdentity = hydrateSyncedInventoryItem({
  itemId: 'equipment.test',
  count: 1,
  enhanceLevel: 2,
}, options);
assert.equal(missingIdentity.itemInstanceId, undefined, '缺失身份的回包不得借用上一件物品的稳定 ID');

const incoming = {
  itemId: 'equipment.test',
  itemInstanceId: 'instance:complete',
  count: 1,
  equipSpecialStats: { comprehension: 5 },
  consumeBuffs: [{ buffId: 'buff.test', name: '测试增益', durationTicks: 10 }],
  contextActions: [{ id: 'craft:test', name: '测试操作', type: 'craft', desc: '', cooldownLeft: 0 }],
};
const complete = hydrateSyncedInventoryItem(incoming, options);
assert.deepEqual(complete.equipSpecialStats, incoming.equipSpecialStats, '特殊属性必须进入客户端物品');
assert.deepEqual(complete.consumeBuffs, incoming.consumeBuffs, '消耗品 Buff 必须进入客户端物品');
assert.deepEqual(complete.contextActions, incoming.contextActions, '物品上下文动作必须进入客户端物品');
incoming.equipSpecialStats.comprehension = 99;
incoming.consumeBuffs[0].name = '已污染';
assert.equal(complete.equipSpecialStats?.comprehension, 5, '水合结果不得共享回包对象引用');
assert.equal(complete.consumeBuffs?.[0]?.name, '测试增益', '水合结果不得共享回包数组引用');

const localTemplatesSource = fs.readFileSync(path.join(clientRoot, 'src/content/local-templates.ts'), 'utf8');
assert.match(
  localTemplatesSource,
  /equipSpecialStats:\s*sourceItem\.equipSpecialStats\s*\?\?\s*template\.equipSpecialStats/,
  '实例特殊属性必须优先于本地模板默认值',
);

console.log(JSON.stringify({ ok: true, case: 'inventory-item-hydration' }, null, 2));
