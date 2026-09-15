/**
 * market-panel.render.ts
 *
 * 从 market-panel.ts 拆出的纯构建/估价/tooltip/背包查询域函数：强化预估、
 * 物品提示构建、价格/耗时格式化和背包匹配统计。所有函数以 MarketPanel
 * 实例为第一参数（self），由主类方法以一行委托壳调用，不改变任何
 * DOM id/class、事件绑定或面板行为。
 */
import type { ItemStack, MarketListedItemView, S2C_MarketUpdate } from '@mud/shared';
import {
  calculateMarketTradeTotalCost,
  computeBestEnhancementExpectedCost,
  createItemStackSignature,
  getItemDisplayName,
  MARKET_MAX_ENHANCE_LEVEL,
} from '@mud/shared';
import { formatDisplayInteger, formatDisplayNumber } from '../../utils/number';
import { buildItemTooltipPayload } from '../equipment-tooltip';
import { getPlayerOwnedItemCount } from '../../utils/player-wallet';
import { t } from '../i18n';
import type { MarketEnhancementEstimateView } from './market-panel-types';
import type { MarketPanel } from './market-panel';

/** 强化任务的基础耗时。 */
const ENHANCEMENT_BASE_JOB_TICKS = 5;
/** 物品等级每升一级额外增加的强化耗时。 */
const ENHANCEMENT_JOB_TICKS_PER_ITEM_LEVEL = 1;

/** 把普通文本转成可安全插入 HTML 的内容。 */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&')
    .replaceAll('<', '<')
    .replaceAll('>', '>')
    .replaceAll('"', '"')
    .replaceAll("'", '&#39;');
}

function normalizeInventoryItemInstanceId(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

/** 拼出一行普通提示文本，供 tooltip 复用。 */
function renderPlainTooltipLine(label: string, value: string): string {
  return `<span class="skill-tooltip-label">${escapeHtml(label)}：</span>${escapeHtml(value)}`;
}

export function formatMarketUnitPriceImpl(value: number): string {
  return formatDisplayNumber(value, {
    maximumFractionDigits: value < 1 ? 2 : 0,
    compactMaximumFractionDigits: 2,
  });
}

export function formatEnhancementEstimateCostImpl(value: number): string {
  return formatDisplayNumber(value, {
    maximumFractionDigits: 2,
    compactMaximumFractionDigits: 2,
  });
}

export function formatEnhancementAttemptCountImpl(value: number): string {
  return formatDisplayNumber(value, {
    maximumFractionDigits: 0,
    compactMaximumFractionDigits: 1,
  });
}

export function computeEnhancementJobBaseTicksImpl(itemLevel: number | undefined): number {
  const normalizedLevel = Math.max(1, Math.floor(Number(itemLevel) || 1));
  return ENHANCEMENT_BASE_JOB_TICKS + Math.max(0, normalizedLevel - 1) * ENHANCEMENT_JOB_TICKS_PER_ITEM_LEVEL;
}

export function formatEnhancementDurationFromTicksImpl(value: number): string {
  const totalSeconds = Math.max(0, Math.round(value));
  if (totalSeconds < 60) {
    return `${formatDisplayInteger(totalSeconds)}息`;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${formatDisplayInteger(hours)}时${formatDisplayInteger(minutes)}分${formatDisplayInteger(seconds)}秒`;
  }
  return `${formatDisplayInteger(minutes)}分${formatDisplayInteger(seconds)}秒`;
}

export function getMarketTradeTotalCostImpl(quantity: number, unitPrice: number): number | null {
  return calculateMarketTradeTotalCost(quantity, unitPrice);
}

export function getMarketEnhanceLevelImpl(item: ItemStack): number {
  return item.type === 'equipment'
    ? Math.max(0, Math.floor(Number(item.enhanceLevel) || 0))
    : 0;
}

export function getMarketDisplayNameImpl(item: ItemStack): string {
  return getItemDisplayName(item);
}

export function getLocalZeroEnhancementLowestSellPriceImpl(self: MarketPanel, itemId: string): number | undefined {
  return self.getKnownListedItems(self.marketUpdate).find((entry) =>
    entry.item.itemId === itemId
    && getMarketEnhanceLevelImpl(entry.item) === 0
  )?.lowestSellPrice;
}

export function buildMarketItemTooltipPayloadImpl(self: MarketPanel, item: ItemStack) {
  const tooltip = buildItemTooltipPayload(item, { playerRealmLv: self.player?.realm?.realmLv ?? self.player?.realmLv });
  const title = getMarketDisplayNameImpl(item);
  const estimate = buildEnhancementEstimateImpl(self, item);
  if (!estimate) {
    return {
      ...tooltip,
      title,
    };
  }
  return {
    ...tooltip,
    title,
    lines: [
      ...tooltip.lines,
      renderPlainTooltipLine(t('market.enhance.title', undefined), estimate.costLine),
      renderPlainTooltipLine(t('market.enhance.attempts', undefined), estimate.attemptsLine),
      renderPlainTooltipLine(t('market.enhance.time', undefined), estimate.timeLine),
    ],
  };
}

export function resolveMarketTooltipPayloadImpl(self: MarketPanel, node: HTMLElement) {
  const key = node.dataset.marketItemTooltip;
  if (!key) {
    return null;
  }
  if (key === 'selected') {
    const selected = self.getSelectedListedItem(self.marketUpdate)
      ?? (self.selectedItemKey ? resolveMarketTooltipEntryImpl(self, self.selectedItemKey) : null);
    return selected ? buildMarketItemTooltipPayloadImpl(self, selected.item) : null;
  }
  if (key.startsWith('heavenly-dao-shop:')) {
    const entry = self.getHeavenlyDaoShopEntry(key.slice('heavenly-dao-shop:'.length));
    const item = entry ? self.buildHeavenlyDaoShopItemStack(entry.itemId, entry.count) : null;
    return item ? buildMarketItemTooltipPayloadImpl(self, item) : null;
  }
  if (key.startsWith('transmission:')) {
    const itemKey = key.slice('transmission:'.length);
    const lot = self.transmissionListings?.items.find((entry) => entry.itemKey === itemKey) ?? null;
    return lot?.item ? buildMarketItemTooltipPayloadImpl(self, lot.item) : null;
  }
  if (key.startsWith('transmission-consign-item:')) {
    const itemInstanceId = normalizeInventoryItemInstanceId(key.slice('transmission-consign-item:'.length));
    const item = itemInstanceId
      ? self.inventory.items.find((entry) => normalizeInventoryItemInstanceId(entry.itemInstanceId) === itemInstanceId) ?? null
      : null;
    return item ? buildMarketItemTooltipPayloadImpl(self, item) : null;
  }
  if (key.startsWith('auction-consign-item:')) {
    const itemInstanceId = normalizeInventoryItemInstanceId(key.slice('auction-consign-item:'.length));
    const item = itemInstanceId
      ? self.inventory.items.find((entry) => normalizeInventoryItemInstanceId(entry.itemInstanceId) === itemInstanceId) ?? null
      : null;
    return item ? buildMarketItemTooltipPayloadImpl(self, item) : null;
  }
  const listed = resolveMarketTooltipEntryImpl(self, key);
  return listed ? buildMarketItemTooltipPayloadImpl(self, listed.item) : null;
}

export function resolveMarketTooltipEntryImpl(self: MarketPanel, itemKey: string): MarketListedItemView | null {
  const listed = self.getKnownListedItems(self.marketUpdate).find((entry) => entry.itemKey === itemKey) ?? null;
  if (listed) {
    return listed;
  }
  for (const group of self.getVisibleListingGroups(self.marketUpdate)) {
    const variant = group.variants.find((entry) => entry.itemKey === itemKey) ?? null;
    if (variant) {
      return variant;
    }
  }
  const auctionLot = self.getCurrentAuctionLots().find((lot) => lot.itemKey === itemKey || lot.id === itemKey) ?? null;
  if (auctionLot) {
    return self.buildMarketListingFromAuctionLot(auctionLot);
  }
  return null;
}

export function getKnownListedItemsImpl(update: S2C_MarketUpdate | null): MarketListedItemView[] {
  return update?.listedItems ?? [];
}

export function buildEnhancementEstimateImpl(self: MarketPanel, item: ItemStack): MarketEnhancementEstimateView | null {
  if (item.type !== 'equipment') {
    return null;
  }
  const targetLevel = getMarketEnhanceLevelImpl(item);
  if (targetLevel <= 0) {
    return null;
  }
  if (targetLevel > MARKET_MAX_ENHANCE_LEVEL) {
    return null;
  }
  const itemLevel = Math.max(1, Math.floor(Number(item.level) || 1));
  const localBaseUnitPrice = getLocalZeroEnhancementLowestSellPriceImpl(self, item.itemId);
  const baseUnitPrice = localBaseUnitPrice;
  const basePricePending = false;
  let analysis: ReturnType<typeof computeBestEnhancementExpectedCost>;
  try {
    analysis = computeBestEnhancementExpectedCost({
      targetLevel,
      itemLevel,
      protectionUnitPrice: baseUnitPrice,
      targetItemUnitPrice: baseUnitPrice,
      selfProtection: true,
    });
  } catch {
    return null;
  }
  const strategy = analysis.bestStrategy ?? analysis.strategies[0] ?? null;
  if (!strategy) {
    return null;
  }
  const usesMarketBasePrice = baseUnitPrice !== undefined;
  const expectedProtectionCost = strategy.expectedProtectionCost ?? 0;
  const expectedTotalCost = strategy.expectedSpiritStones + expectedProtectionCost;
  const protectionStartText = strategy.protectionStartLevel === null ? t('market.enhance.no-protection', undefined) : `+${strategy.protectionStartLevel}`;
  const zeroPriceText = baseUnitPrice !== undefined
    ? formatMarketUnitPriceImpl(baseUnitPrice)
    : basePricePending
      ? t('market.enhance.pending', undefined)
      : t('market.enhance.none', undefined);
  const baseTicksPerAttempt = computeEnhancementJobBaseTicksImpl(itemLevel);
  const expectedBaseDurationTicks = strategy.expectedAttempts * baseTicksPerAttempt;
  const costLine = `总灵石 ${formatEnhancementEstimateCostImpl(expectedTotalCost)} · 强化消耗 ${formatEnhancementEstimateCostImpl(strategy.expectedSpiritStones)} · 保护消耗 ${formatEnhancementEstimateCostImpl(expectedProtectionCost)} · +0价格 ${zeroPriceText}`;
  const attemptsLine = `${formatEnhancementAttemptCountImpl(strategy.expectedAttempts)} 次 · 从${protectionStartText}开始保护 · 期望保护 ${formatEnhancementEstimateCostImpl(strategy.expectedProtectionCount)} 个`;
  const timeLine = `${formatEnhancementDurationFromTicksImpl(expectedBaseDurationTicks)}（基准每次 ${formatEnhancementDurationFromTicksImpl(baseTicksPerAttempt)}）`;
  return {
    strategy,
    costLine,
    attemptsLine,
    timeLine,
    baseUnitPrice,
    usesMarketBasePrice,
    basePricePending,
  };
}

export function findMatchingInventoryItemInstanceIdImpl(self: MarketPanel, item: ItemStack): string | null {
  let matchedItem: ItemStack | null = null;
  if (item.type === 'equipment') {
    const targetLevel = getMarketEnhanceLevelImpl(item);
    matchedItem = self.inventory.items.find((entry) =>
      entry.itemId === item.itemId
      && entry.type === 'equipment'
      && getMarketEnhanceLevelImpl(entry) === targetLevel
    ) ?? null;
  } else {
    const targetKey = createItemStackSignature({ ...item, count: 1 });
    matchedItem = self.inventory.items.find((entry) => createItemStackSignature({ ...entry, count: 1 }) === targetKey) ?? null;
    if (!matchedItem) {
      matchedItem = self.inventory.items.find((entry) => entry.itemId === item.itemId) ?? null;
    }
  }
  return typeof matchedItem?.itemInstanceId === 'string' && matchedItem.itemInstanceId.trim().length > 0
    ? matchedItem.itemInstanceId.trim()
    : null;
}

export function findMatchingInventoryCountImpl(self: MarketPanel, item: ItemStack): number {
  if (item.type === 'equipment') {
    return findEquipmentInventoryCountByLevelImpl(self, item.itemId, getMarketEnhanceLevelImpl(item));
  }
  const targetKey = createItemStackSignature({ ...item, count: 1 });
  const exactMatches = self.inventory.items.filter((entry) => createItemStackSignature({ ...entry, count: 1 }) === targetKey);
  if (exactMatches.length > 0) {
    return exactMatches.reduce((sum, entry) => sum + entry.count, 0);
  }
  return self.inventory.items
    .filter((entry) => entry.itemId === item.itemId)
    .reduce((sum, entry) => sum + entry.count, 0);
}

export function findInventoryItemCountByItemIdImpl(self: MarketPanel, itemId: string): number {
  return getPlayerOwnedItemCount(self.player, self.inventory, itemId);
}

export function findEquipmentInventoryCountByLevelImpl(self: MarketPanel, itemId: string, enhanceLevel: number): number {
  const targetLevel = Math.max(0, Math.floor(Number(enhanceLevel) || 0));
  return self.inventory.items
    .filter((entry) =>
      entry.itemId === itemId
      && entry.type === 'equipment'
      && getMarketEnhanceLevelImpl(entry) === targetLevel
    )
    .reduce((sum, entry) => sum + entry.count, 0);
}
