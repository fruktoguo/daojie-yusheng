/**
 * inventory-panel.cooldowns.ts
 *
 * 从 inventory-panel.ts 拆出的冷却域实现：冷却状态读取、分组恢复冷却、
 * tick 基准同步、缓存清理和冷却比率/标题格式化。所有函数以
 * InventoryPanel 实例为第一参数（self），由主类方法以一行委托壳调用，
 * 不改变任何 DOM id/class、事件绑定或面板行为。
 */
import type { Inventory, ItemStack } from '@mud/shared';
import type { InventoryItemCooldownState } from '@mud/shared';
import type { ItemTooltipCooldownState } from '../equipment-tooltip';
import { resolvePreviewItem } from '../../content/local-templates';
import { formatDisplayInteger } from '../../utils/number';
import type { InventoryPanel } from './inventory-panel';

export function getCooldownStateMapImpl(self: InventoryPanel, inventory: Inventory): Map<string, InventoryItemCooldownState> {
  pruneInventoryCooldownStateCacheImpl(self);
  const activeCooldowns = new Map(self.inventoryCooldownStateCache);
  for (const entry of inventory.cooldowns ?? []) {
    if (getItemCooldownRemainingTicksImpl(self, entry) > 0) {
      activeCooldowns.set(entry.itemId, entry);
    }
  }
  const cooldownsByItemId = new Map(activeCooldowns);
  for (const item of inventory.items ?? []) {
    if (!item?.itemId || cooldownsByItemId.has(item.itemId)) {
      continue;
    }
    const groupedCooldown = resolveGroupedRecoveryCooldownStateImpl(self, item, activeCooldowns);
    if (groupedCooldown) {
      cooldownsByItemId.set(item.itemId, groupedCooldown);
    }
  }
  return cooldownsByItemId;
}

export function getItemCooldownStateImpl(
  self: InventoryPanel,
  item: ItemStack,
  inventory: Inventory | null = self.lastInventory,
): InventoryItemCooldownState | null {
  if (!inventory) {
    return null;
  }
  const cooldownState = getCooldownStateMapImpl(self, inventory).get(item.itemId) ?? null;
  return getItemCooldownRemainingTicksImpl(self, cooldownState) > 0 ? cooldownState : null;
}

export function resolveGroupedRecoveryCooldownStateImpl(
  self: InventoryPanel,
  item: ItemStack,
  activeCooldowns: Map<string, InventoryItemCooldownState>,
): InventoryItemCooldownState | null {
  let selected: InventoryItemCooldownState | null = null;
  let maxRemainingTicks = 0;
  for (const group of resolveRecoveryCooldownGroupsImpl(self, item)) {
    const cooldownState = activeCooldowns.get(group) ?? null;
    const remainingTicks = getItemCooldownRemainingTicksImpl(self, cooldownState);
    if (remainingTicks > maxRemainingTicks) {
      selected = cooldownState;
      maxRemainingTicks = remainingTicks;
    }
  }
  return selected;
}

export function resolveRecoveryCooldownGroupsImpl(self: InventoryPanel, item: ItemStack): Array<'hp' | 'qi'> {
  const previewItem = resolvePreviewItem(item);
  const groups: Array<'hp' | 'qi'> = [];
  if (hasPositiveRecoveryValueImpl(self, previewItem.healAmount)
    || hasPositiveRecoveryValueImpl(self, previewItem.healPercent)
    || hasPositiveRecoveryValueImpl(self, previewItem.baselineHealPercent)) {
    groups.push('hp');
  }
  if (hasPositiveRecoveryValueImpl(self, previewItem.baselineQiPercent)
    || hasPositiveRecoveryValueImpl(self, previewItem.qiPercent)) {
    groups.push('qi');
  }
  return groups;
}

export function hasPositiveRecoveryValueImpl(self: InventoryPanel, value: unknown): boolean {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

export function getItemCooldownRemainingTicksImpl(
  self: InventoryPanel,
  cooldownState: InventoryItemCooldownState | null,
): number {
  if (!cooldownState) {
    return 0;
  }
  const cooldown = Math.max(0, Math.floor(Number(cooldownState.cooldown) || 0));
  if (cooldown <= 0) {
    return 0;
  }
  const currentTick = getEstimatedInventoryCooldownTickImpl(self);
  if (currentTick === null) {
    return cooldown;
  }
  const startedAtTick = Math.max(0, Math.floor(Number(cooldownState.startedAtTick) || 0));
  const elapsedTicks = Math.max(0, currentTick - startedAtTick);
  return Math.max(0, cooldown - elapsedTicks);
}

export function syncInventoryCooldownTickBaseImpl(self: InventoryPanel, inventory: Inventory): void {
  const serverTick = Number(inventory.serverTick);
  if (!Number.isFinite(serverTick)) {
    return;
  }
  const normalizedTick = Math.max(0, Math.floor(serverTick));
  if (self.inventoryCooldownBaseSourceTick === normalizedTick) {
    return;
  }
  self.inventoryCooldownBaseTick = normalizedTick;
  self.inventoryCooldownBaseSourceTick = normalizedTick;
  self.inventoryCooldownBaseSyncedAtMs = performance.now();
}

export function syncInventoryCooldownStateCacheImpl(
  self: InventoryPanel,
  cooldowns: InventoryItemCooldownState[],
): void {
  for (const entry of cooldowns) {
    if (!entry?.itemId) {
      continue;
    }
    if (getItemCooldownRemainingTicksImpl(self, entry) > 0) {
      self.inventoryCooldownStateCache.set(entry.itemId, { ...entry });
    } else {
      self.inventoryCooldownStateCache.delete(entry.itemId);
    }
  }
  pruneInventoryCooldownStateCacheImpl(self);
}

export function pruneInventoryCooldownStateCacheImpl(self: InventoryPanel): void {
  for (const [itemId, entry] of self.inventoryCooldownStateCache) {
    if (getItemCooldownRemainingTicksImpl(self, entry) <= 0) {
      self.inventoryCooldownStateCache.delete(itemId);
    }
  }
}

export function getEstimatedInventoryCooldownTickImpl(self: InventoryPanel, now = performance.now()): number | null {
  if (self.inventoryCooldownBaseTick === null) {
    return null;
  }
  const elapsedTicks = Math.floor(Math.max(0, now - self.inventoryCooldownBaseSyncedAtMs) / 1000);
  return self.inventoryCooldownBaseTick + elapsedTicks;
}

export function getItemTooltipCooldownStateImpl(self: InventoryPanel, item: ItemStack): ItemTooltipCooldownState | null {
  const cooldownState = getItemCooldownStateImpl(self, item);
  if (!cooldownState) {
    return null;
  }
  const cooldownLeft = getItemCooldownRemainingTicksImpl(self, cooldownState);
  return cooldownLeft > 0
    ? { cooldown: cooldownState.cooldown, cooldownLeft }
    : null;
}

export function getItemCooldownRatioImpl(
  self: InventoryPanel,
  cooldownState: InventoryItemCooldownState | null,
  remainingTicks?: number,
): number {
  if (!cooldownState) {
    return 0;
  }
  const cooldown = Math.max(1, cooldownState.cooldown);
  const remaining = remainingTicks ?? getItemCooldownRemainingTicksImpl(self, cooldownState);
  return Math.max(0, Math.min(1, remaining / cooldown));
}

export function getItemCooldownTitleImpl(
  self: InventoryPanel,
  cooldownState: InventoryItemCooldownState,
  remainingTicks?: number,
): string {
  const remaining = remainingTicks ?? getItemCooldownRemainingTicksImpl(self, cooldownState);
  return `使用冷却 ${formatDisplayInteger(remaining)} / ${formatDisplayInteger(cooldownState.cooldown)} 息`;
}
