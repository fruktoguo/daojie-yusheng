/** 阵盘左键详情、右键布阵及详情丢弃入口结构证明。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(clientRoot, 'src/ui/panels/inventory-panel.ts'), 'utf8');

function sliceBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `未找到结构起点：${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `未找到结构终点：${endMarker}`);
  return source.slice(start, end);
}

const paneBindings = sliceBetween(
  '  private bindPaneEvents(): void {',
  '  /** bindTooltipEvents：',
);
const primaryActionHandler = sliceBetween(
  '  private handlePrimaryAction(',
  '  private repairMissingInventoryItemInstanceIds()',
);
const detailActions = sliceBetween(
  '  private renderItemDetailActionsHtml(',
  '  private bindItemDetailActions(',
);

const clickBindingStart = paneBindings.indexOf("this.pane.addEventListener('click'");
const contextMenuBindingStart = paneBindings.indexOf("this.pane.addEventListener('contextmenu'");
assert.ok(clickBindingStart >= 0 && contextMenuBindingStart > clickBindingStart, '背包左右键委托结构缺失');
const clickBinding = paneBindings.slice(clickBindingStart, contextMenuBindingStart);
const contextMenuBinding = paneBindings.slice(contextMenuBindingStart);

assert.match(clickBinding, /this\.renderModal\(\)/, '左键必须打开物品详情');
assert.doesNotMatch(clickBinding, /openFormationDialog|handlePrimaryAction/, '左键不得绕过详情直接执行阵盘主操作');
assert.match(contextMenuBinding, /handlePrimaryAction/, '右键必须继续进入物品主操作');
assert.match(primaryActionHandler, /isFormationDiskItem\(item\)[\s\S]*openFormationDialog\(slotIndex\)/, '阵盘主操作必须继续打开布阵界面');
assert.match(detailActions, /data-inventory-detail-action="drop"/, '物品详情必须保留丢下入口');

console.log('REPAIR_PROOF:ISSUE-000029:PASS');
