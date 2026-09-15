/**
 * inventory-panel.cells.ts
 *
 * 从 inventory-panel.ts 拆出的格子域实现：格子创建、引用缓存、渲染签名、
 * 网格同步、格子 patch、ribbon/标签计算和功法书残卷判断。所有函数以
 * InventoryPanel 实例为第一参数（self），由主类方法以一行委托壳调用，
 * 不改变任何 DOM id/class、事件绑定或面板行为。
 */
import type { ItemStack, InventoryItemCooldownState } from '@mud/shared';
import { getTechniqueMaxLevel } from '@mud/shared';
import { getItemDecorClassName, getItemDisplayMeta, type ItemDisplayMeta } from '../item-display';
import { getItemTypeLabel } from '../../domain-labels';
import { formatDisplayCountBadge, formatDisplayInteger } from '../../utils/number';
import { getLocalTechniqueTemplate } from '../../content/local-templates';
import type { InventoryCellRibbon, InventoryCellRefs } from './inventory-panel';
import type { InventoryPanel } from './inventory-panel';

export function createInventoryCellImpl(self: InventoryPanel, slotIndex: number): HTMLDivElement {
  const cell = document.createElement('div');
  cell.dataset.openItem = String(slotIndex);
  cell.dataset.itemSlot = String(slotIndex);

  const cooldown = document.createElement('div');
  cooldown.className = 'inventory-cell-cooldown';
  cooldown.dataset.itemCooldown = 'true';
  cooldown.hidden = true;

  const cooldownPie = document.createElement('span');
  cooldownPie.className = 'inventory-cell-cooldown-pie';
  cooldownPie.dataset.itemCooldownPie = 'true';
  cooldown.append(cooldownPie);

  const cooldownLabel = document.createElement('span');
  cooldownLabel.className = 'inventory-cell-cooldown-label';
  cooldownLabel.dataset.itemCooldownLabel = 'true';
  cooldown.append(cooldownLabel);

  const head = document.createElement('div');
  head.className = 'inventory-cell-head';
  const type = document.createElement('span');
  type.className = 'inventory-cell-type';
  type.dataset.itemType = 'true';
  type.hidden = true;
  head.append(type);
  const count = document.createElement('span');
  count.className = 'inventory-cell-count';
  count.dataset.itemCount = 'true';
  head.append(count);

  const learnedRibbon = document.createElement('span');
  learnedRibbon.className = 'inventory-cell-learned-ribbon';
  learnedRibbon.dataset.itemLearnedRibbon = 'true';
  learnedRibbon.hidden = true;

  const gradeLine = document.createElement('div');
  gradeLine.className = 'inventory-cell-grade-line';
  gradeLine.dataset.itemGradeLine = 'true';
  gradeLine.hidden = true;

  const name = document.createElement('div');
  name.className = 'inventory-cell-name';
  name.dataset.itemName = 'true';

  const actionHint = document.createElement('span');
  actionHint.className = 'inventory-cell-action-hint';
  actionHint.dataset.itemActionHintNode = 'true';
  actionHint.hidden = true;

  cell.append(cooldown, head, learnedRibbon, gradeLine, name, actionHint);
  self.cellRefs.set(cell, {
    type,
    learnedRibbon,
    count,
    gradeLine,
    name,
    cooldown,
    cooldownPie,
    cooldownLabel,
  });
  return cell;
}

export function getInventoryCellRefsImpl(self: InventoryPanel, cell: HTMLElement): InventoryCellRefs | null {
  const cached = self.cellRefs.get(cell);
  if (cached) {
    return cached;
  }
  const type = cell.querySelector<HTMLElement>('[data-item-type="true"]');
  const learnedRibbon = cell.querySelector<HTMLElement>('[data-item-learned-ribbon="true"]');
  const count = cell.querySelector<HTMLElement>('[data-item-count="true"]');
  const gradeLine = cell.querySelector<HTMLElement>('[data-item-grade-line="true"]');
  const name = cell.querySelector<HTMLElement>('[data-item-name="true"]');
  const cooldown = cell.querySelector<HTMLElement>('[data-item-cooldown="true"]');
  const cooldownPie = cell.querySelector<HTMLElement>('[data-item-cooldown-pie="true"]');
  const cooldownLabel = cell.querySelector<HTMLElement>('[data-item-cooldown-label="true"]');
  if (!type || !learnedRibbon || !count || !gradeLine || !name || !cooldown || !cooldownPie || !cooldownLabel) {
    return null;
  }
  const refs = { type, learnedRibbon, count, gradeLine, name, cooldown, cooldownPie, cooldownLabel };
  self.cellRefs.set(cell, refs);
  return refs;
}

export function buildCellRenderKeyImpl(
  self: InventoryPanel,
  itemIdentity: string,
  item: ItemStack,
  slotIndex: number,
  cooldownState: InventoryItemCooldownState | null,
  cooldownRemaining: number,
): string {
  return [
    'ribbon-v7',
    String(slotIndex),
    itemIdentity,
    String(item.count),
    String(item.grade ?? ''),
    String(item.level ?? ''),
    String(item.learnTechniqueId ?? ''),
    String(item.learnTechniqueMaxLevel ?? ''),
    String(self.playerContextRevision),
    cooldownState
      ? `${cooldownState.startedAtTick}:${cooldownState.cooldown}:${cooldownRemaining}`
      : '',
  ].join('|');
}

export function syncGridChildrenImpl(self: InventoryPanel, grid: HTMLElement, orderedCells: HTMLElement[]): void {
  const allowed = new Set(orderedCells);
  for (const child of Array.from(grid.children)) {
    if (!(child instanceof HTMLElement) || !allowed.has(child)) {
      child.remove();
    }
  }
  let reference: ChildNode | null = grid.firstChild;
  for (const cell of orderedCells) {
    if (reference !== cell) {
      grid.insertBefore(cell, reference);
    }
    reference = cell.nextSibling;
  }
}

export function patchInventoryCellImpl(
  self: InventoryPanel,
  cell: HTMLElement,
  item: ItemStack,
  slotIndex: number,
  cooldownState: InventoryItemCooldownState | null,
): boolean {
  const cooldownRemaining = self.getItemCooldownRemainingTicks(cooldownState);
  const itemIdentity = self.getItemIdentity(item);
  const renderKey = buildCellRenderKeyImpl(self, itemIdentity, item, slotIndex, cooldownState, cooldownRemaining);
  if (cell.dataset.itemRenderKey === renderKey) {
    return true;
  }

  const refs = getInventoryCellRefsImpl(self, cell);
  if (!refs) {
    return false;
  }

  const itemMeta = getItemDisplayMeta(item);
  const displayName = itemMeta.displayItem.name;
  const primaryAction = self.getPrimaryAction(item, cooldownState);
  const primaryActionHint = self.getPrimaryActionHint(primaryAction);
  cell.querySelector<HTMLElement>('[data-item-affinity="true"]')?.remove();

  let levelNode = cell.querySelector<HTMLElement>('[data-item-level="true"]');
  if (itemMeta.levelLabel) {
    if (!levelNode) {
      levelNode = document.createElement('span');
      levelNode.className = 'item-card-chip item-card-chip--level';
      levelNode.dataset.itemLevel = 'true';
      cell.append(levelNode);
    }
    levelNode.textContent = itemMeta.levelLabel;
  } else {
    levelNode?.remove();
  }

  let enhanceNode = cell.querySelector<HTMLElement>('[data-item-enhance="true"]');
  if (itemMeta.enhanceLabel) {
    if (!enhanceNode) {
      enhanceNode = document.createElement('span');
      enhanceNode.className = 'item-card-chip item-card-chip--enhance';
      enhanceNode.dataset.itemEnhance = 'true';
      cell.append(enhanceNode);
    }
    enhanceNode.textContent = itemMeta.enhanceLabel;
  } else {
    enhanceNode?.remove();
  }

  cell.dataset.itemKey = itemIdentity;
  cell.dataset.itemRenderKey = renderKey;
  cell.dataset.openItem = String(slotIndex);
  cell.dataset.itemSlot = String(slotIndex);
  cell.dataset.itemType = item.type;
  if (itemMeta.grade) {
    cell.dataset.itemGrade = itemMeta.grade;
  } else {
    delete cell.dataset.itemGrade;
  }
  const gradeLineLabel = self.getInventoryGradeLineLabel(item);
  if (gradeLineLabel) {
    cell.dataset.itemGradeLineVisible = 'true';
  } else {
    delete cell.dataset.itemGradeLineVisible;
  }
  cell.className = getItemDecorClassName('inventory-cell', item);
  cell.classList.toggle('inventory-cell--cooldown', cooldownState !== null);
  cell.classList.toggle('inventory-cell--actionable', primaryActionHint !== null);
  if (primaryActionHint) {
    cell.dataset.itemActionHint = primaryActionHint;
  } else {
    delete cell.dataset.itemActionHint;
  }

  const ribbon = getInventoryCellRibbonImpl(self, item, itemMeta);
  const learnedRibbon = getInventoryLearnedRibbonImpl(self, item);
  refs.type.hidden = !ribbon;
  refs.type.textContent = ribbon?.label ?? '';
  if (ribbon?.title) {
    refs.type.setAttribute('aria-label', ribbon.title);
  } else {
    refs.type.removeAttribute('aria-label');
  }
  refs.learnedRibbon.hidden = !learnedRibbon;
  refs.learnedRibbon.textContent = learnedRibbon?.label ?? '';
  if (learnedRibbon?.title) {
    refs.learnedRibbon.setAttribute('aria-label', learnedRibbon.title);
  } else {
    refs.learnedRibbon.removeAttribute('aria-label');
  }
  refs.gradeLine.hidden = !gradeLineLabel;
  refs.gradeLine.textContent = gradeLineLabel ?? '';
  refs.count.textContent = formatDisplayCountBadge(item.count);
  refs.name.textContent = displayName;
  refs.name.setAttribute('aria-label', displayName);
  refs.name.className = 'inventory-cell-name';
  let actionHintNode = cell.querySelector<HTMLElement>('[data-item-action-hint-node="true"]');
  if (!actionHintNode) {
    actionHintNode = document.createElement('span');
    actionHintNode.className = 'inventory-cell-action-hint';
    actionHintNode.dataset.itemActionHintNode = 'true';
    cell.append(actionHintNode);
  }
  actionHintNode.hidden = !primaryActionHint;
  actionHintNode.textContent = primaryActionHint ?? '';

  refs.cooldown.hidden = cooldownState === null;
  if (cooldownState) {
    refs.cooldown.setAttribute('aria-label', self.getItemCooldownTitle(cooldownState, cooldownRemaining));
    refs.cooldownPie.style.setProperty('--inventory-cooldown-progress', self.getItemCooldownRatio(cooldownState, cooldownRemaining).toFixed(4));
    refs.cooldownLabel.textContent = formatDisplayInteger(cooldownRemaining);
  } else {
    refs.cooldown.removeAttribute('aria-label');
    refs.cooldownPie.style.setProperty('--inventory-cooldown-progress', '0');
    refs.cooldownLabel.textContent = '';
  }
  return true;
}

export function getInventoryCellRibbonImpl(self: InventoryPanel, item: ItemStack, itemMeta: ItemDisplayMeta): InventoryCellRibbon | null {
  if (item.type === 'skill_book') {
    const isFragment = isTechniqueBookFragmentImpl(self, item);
    return {
      label: isFragment ? '残卷' : '功法',
      title: isFragment ? '功法残卷' : '完整功法书',
    };
  }
  if (itemMeta.affinityBadge) {
    return {
      label: itemMeta.affinityBadge.label,
      title: itemMeta.affinityBadge.title,
    };
  }
  if (item.type === 'material') {
    return {
      label: getInventoryMaterialRibbonLabelImpl(self, item),
      title: getItemTypeLabel(item.type),
    };
  }
  if (item.type === 'consumable' || item.type === 'equipment' || item.type === 'artifact') {
    return { label: getItemTypeLabel(item.type) };
  }
  return null;
}

export function getInventoryLearnedRibbonImpl(self: InventoryPanel, item: ItemStack): InventoryCellRibbon | null {
  if (item.type !== 'skill_book' || !item.learnTechniqueId) {
    return null;
  }
  const techniqueId = self.getTechniqueIdFromBookItem(item);
  if (!techniqueId) {
    return null;
  }
  if (self.learnedTechniqueIds.has(techniqueId)) {
    return { label: '已学' };
  }
  return null;
}

export function getInventoryMaterialRibbonLabelImpl(self: InventoryPanel, item: ItemStack): string {
  return getItemTypeLabel(item.type);
}

export function getInventoryGradeLineLabelImpl(self: InventoryPanel, _item: ItemStack): string | null {
  return null;
}

export function isTechniqueBookFragmentImpl(self: InventoryPanel, item: ItemStack): boolean {
  if (item.type !== 'skill_book') {
    return false;
  }
  const techniqueId = self.getTechniqueIdFromBookItem(item);
  const rawLearnMaxLevel = Number(item.learnTechniqueMaxLevel);
  if (!Number.isFinite(rawLearnMaxLevel)) {
    return false;
  }
  if (!techniqueId) {
    return true;
  }
  const technique = getLocalTechniqueTemplate(techniqueId);
  if (!technique) {
    return true;
  }
  const templateMaxLevel = getTechniqueMaxLevel(
    Array.isArray(technique.layers) ? technique.layers : undefined,
    1,
  );
  const learnMaxLevel = Math.max(1, Math.min(templateMaxLevel, Math.floor(rawLearnMaxLevel)));
  return learnMaxLevel < templateMaxLevel;
}
