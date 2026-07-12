/** 背包物品操作弹窗状态、实例身份与玩家上下文失效证明。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadStateModule() {
  const sourcePath = path.join(clientRoot, 'src/ui/panels/inventory-item-action-dialog-state.ts');
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

const { InventoryItemActionDialogState } = loadStateModule();
const state = new InventoryItemActionDialogState();

assert.equal(state.open('use', '', 1), false, '没有稳定物品身份时不得打开操作弹窗');
assert.equal(state.open('use', 'item-instance-a', 10), true);
assert.equal(state.matchesItem('item-instance-a'), true);
assert.equal(state.matchesItem('item-instance-b'), false, '背包换位后不得把操作状态套到另一实例');

const stableContextKey = state.buildRenderKey({
  itemKey: 'item-instance-a',
  itemCount: 10,
  playerContextRevision: 1,
  contextDependent: false,
});
const stableContextKeyAfterPlayerUpdate = state.buildRenderKey({
  itemKey: 'item-instance-a',
  itemCount: 10,
  playerContextRevision: 2,
  contextDependent: false,
});
assert.equal(stableContextKeyAfterPlayerUpdate, stableContextKey, '普通数量弹窗不应被无关玩家状态打断');

const specialContextKey = state.buildRenderKey({
  itemKey: 'item-instance-a',
  itemCount: 10,
  playerContextRevision: 1,
  contextDependent: true,
});
const specialContextKeyAfterPlayerUpdate = state.buildRenderKey({
  itemKey: 'item-instance-a',
  itemCount: 10,
  playerContextRevision: 2,
  contextDependent: true,
});
assert.notEqual(specialContextKeyAfterPlayerUpdate, specialContextKey, '特殊使用确认必须随成本依赖的玩家状态失效');

state.setCountDraft('');
assert.equal(state.snapshot()?.countDraft, '', '编辑中的空数量草稿必须保留，避免输入被重绘打断');
state.setCountDraft('6');
state.setDestroyConfirmation(true);
const destroyKey = state.buildRenderKey({
  itemKey: 'item-instance-a',
  itemCount: 10,
  playerContextRevision: 2,
  contextDependent: false,
});
assert.match(destroyKey ?? '', /\|1\|6\|/, '摧毁二次确认和已提交数量必须进入渲染代际');

state.reset();
assert.equal(state.isOpen(), false);
assert.equal(state.buildRenderKey({
  itemKey: 'item-instance-a',
  itemCount: 10,
  playerContextRevision: 2,
  contextDependent: true,
}), null);

console.log(JSON.stringify({ ok: true, case: 'inventory-action-dialog-lifecycle' }, null, 2));
