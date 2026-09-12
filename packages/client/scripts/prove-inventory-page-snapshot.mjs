/** 背包当前页快照：revision 推进时原地回绑，不得整页丢掉。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadSnapshotModule() {
  const sourcePath = path.join(clientRoot, 'src/ui/panels/inventory-page-snapshot.ts');
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

const { buildInventoryCellIdentity, patchInventoryPageSnapshotFromItems } = loadSnapshotModule();

function matchesAll() {
  return true;
}

function getInstanceId(item) {
  return typeof item.itemInstanceId === 'string' ? item.itemInstanceId : '';
}

function getItemId(item) {
  return item.itemId;
}

assert.equal(
  buildInventoryCellIdentity({ itemInstanceId: ' uuid-sword ', slotIndex: 7, itemId: 'sword' }),
  'instance:uuid-sword',
  '有实例 ID 的格子必须跟随实例，而不是槽位号',
);
assert.equal(
  buildInventoryCellIdentity({ itemInstanceId: '', slotIndex: 3, itemId: 'ore' }),
  'slot:3:ore',
  '没有实例 ID 时才能退回槽位+itemId',
);

const page = {
  filter: 'all',
  search: '',
  revision: 10,
  totalItems: 3,
  totalVisibleItems: 3,
  capacity: 200,
  offset: 0,
  limit: 30,
  items: [
    { slotIndex: 0, item: { itemId: 'ore', itemInstanceId: '', count: 20 } },
    { slotIndex: 1, item: { itemId: 'sword', itemInstanceId: 'uuid-sword', count: 1 } },
    { slotIndex: 2, item: { itemId: 'book', itemInstanceId: 'uuid-book', count: 1 } },
  ],
};

const afterCraftCount = patchInventoryPageSnapshotFromItems({
  snapshot: page,
  items: [
    { itemId: 'ore', itemInstanceId: '', count: 10 },
    { itemId: 'sword', itemInstanceId: 'uuid-sword', count: 1 },
    { itemId: 'book', itemInstanceId: 'uuid-book', count: 1 },
    { itemId: 'product', itemInstanceId: 'uuid-product', count: 1 },
  ],
  capacity: 200,
  matches: matchesAll,
  getInstanceId,
  getItemId,
});

assert.equal(afterCraftCount.snapshot.revision, 10, '本地补丁不得把分页 revision 改成当前背包版本');
assert.equal(afterCraftCount.snapshot.totalItems, 4, '标题容量必须用本地占用数，不能退回旧页的 totalItems');
assert.equal(afterCraftCount.snapshot.totalVisibleItems, 4);
assert.equal(afterCraftCount.needsImmediateRefresh, false);
assert.deepEqual(
  afterCraftCount.snapshot.items.map((entry) => ({
    slotIndex: entry.slotIndex,
    itemId: entry.item.itemId,
    count: entry.item.count,
    itemInstanceId: entry.item.itemInstanceId,
  })),
  [
    { slotIndex: 0, itemId: 'ore', count: 10, itemInstanceId: '' },
    { slotIndex: 1, itemId: 'sword', count: 1, itemInstanceId: 'uuid-sword' },
    { slotIndex: 2, itemId: 'book', count: 1, itemInstanceId: 'uuid-book' },
  ],
  '同槽位材料只更新数量，实例物品按 ID 回绑，新品不得挤进当前页',
);

const afterCompact = patchInventoryPageSnapshotFromItems({
  snapshot: page,
  items: [
    { itemId: 'sword', itemInstanceId: 'uuid-sword', count: 1 },
    { itemId: 'book', itemInstanceId: 'uuid-book', count: 1 },
    { itemId: 'other', itemInstanceId: '', count: 1 },
  ],
  capacity: 200,
  matches: matchesAll,
  getInstanceId,
  getItemId,
});

assert.deepEqual(
  afterCompact.snapshot.items.map((entry) => [entry.slotIndex, entry.item.itemInstanceId || entry.item.itemId]),
  [[0, 'uuid-sword'], [1, 'uuid-book']],
  '槽位被不同物品挤占时，无实例 ID 的旧格子必须丢掉，不能把点击目标换成邻格',
);
assert.equal(afterCompact.snapshot.items.some((entry) => entry.item.itemId === 'other'), false, '当前页不得插入尚未分页确认的物品');

const afterConsumeInstance = patchInventoryPageSnapshotFromItems({
  snapshot: page,
  items: [
    { itemId: 'ore', itemInstanceId: '', count: 20 },
    { itemId: 'book', itemInstanceId: 'uuid-book', count: 1 },
  ],
  capacity: 200,
  matches: matchesAll,
  getInstanceId,
  getItemId,
});
assert.equal(
  afterConsumeInstance.snapshot.items.some((entry) => entry.item.itemInstanceId === 'uuid-sword'),
  false,
  '已消耗的实例必须从当前页移除',
);

const emptiedLastPage = patchInventoryPageSnapshotFromItems({
  snapshot: {
    ...page,
    offset: 30,
    totalVisibleItems: 31,
    items: [{ slotIndex: 30, item: { itemId: 'sword', itemInstanceId: 'uuid-sword', count: 1 } }],
  },
  items: [
    { itemId: 'ore', itemInstanceId: '', count: 1 },
  ],
  capacity: 200,
  matches: matchesAll,
  getInstanceId,
  getItemId,
});
assert.equal(emptiedLastPage.snapshot.items.length, 0);
assert.equal(emptiedLastPage.needsImmediateRefresh, true, '当前页被扣空但背包仍有可见物品时必须立刻重新要页');

console.log(JSON.stringify({ ok: true, case: 'inventory-page-snapshot' }, null, 2));
