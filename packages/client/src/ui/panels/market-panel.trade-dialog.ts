/**
 * market-panel.trade-dialog.ts
 *
 * 从 market-panel.ts 拆出的交易弹窗域辅助函数：价格/数量规范化、步长计算、
 * 默认价格、冲突挂单查找和价格预设格式化。所有函数以 MarketPanel 实例为
 * 第一参数（self），由主类方法以一行委托壳调用，不改变任何 DOM id/class、
 * 事件绑定或面板行为。
 */
import type { MarketListedItemView, MarketOwnOrderView } from '@mud/shared';
import {
  getMarketMinimumTradeQuantity,
  getMarketPriceStep,
  isLegacyMarketPrice,
  normalizeMarketPriceDown,
  normalizeMarketPriceUp,
} from '@mud/shared';
import { formatDisplayInteger } from '../../utils/number';
import type {
  AuctionLotView,
  MarketPriceAction,
  MarketTradeDialogKind,
  MarketTradeDialogState,
} from './market-panel-types';
import type { MarketPanel } from './market-panel';

/** 交易弹窗允许输入的最低单价。 */
const MARKET_DIALOG_MIN_PRICE = 0.0001;
/** 交易弹窗允许输入的最高单价。 */
const MARKET_DIALOG_MAX_PRICE = 999_999_999;
/** 交易弹窗允许输入的最大数量。 */
const MARKET_DIALOG_MAX_QUANTITY = 999_900_000_000;

export function findConflictingOwnOrderImpl(
  self: MarketPanel,
  itemKey: string,
  nextSide: MarketTradeDialogKind,
): MarketOwnOrderView | null {
  const oppositeSide = nextSide === 'sell' ? 'buy' : 'sell';
  return self.marketUpdate?.myOrders.find((order) =>
    order.itemKey === itemKey
    && order.side === oppositeSide
    && order.remainingQuantity > 0
    && order.status === 'open') ?? null;
}

export function getDefaultTradeDialogPriceImpl(
  self: MarketPanel,
  entry: MarketListedItemView,
  kind: MarketTradeDialogKind,
  preferredPrice?: number | null,
): number {
  const fallback = kind === 'buy'
    ? (entry.lowestSellPrice ?? entry.highestBuyPrice ?? MARKET_DIALOG_MIN_PRICE)
    : (entry.highestBuyPrice ?? entry.lowestSellPrice ?? MARKET_DIALOG_MIN_PRICE);
  const source = preferredPrice && preferredPrice > 0 ? preferredPrice : fallback;
  return normalizeTradeDialogPriceImpl(self, source, kind === 'buy' ? 'up' : 'down');
}

export function getAuctionMinimumBidPriceImpl(self: MarketPanel, lot: AuctionLotView): number {
  if (lot.currentPrice >= MARKET_DIALOG_MAX_PRICE) {
    return MARKET_DIALOG_MAX_PRICE;
  }
  return normalizeTradeDialogPriceImpl(self, lot.currentPrice + getMarketPriceStep(lot.currentPrice), 'up');
}

export function getTradeDialogMinUnitPriceImpl(self: MarketPanel, dialog: MarketTradeDialogState): number {
  if (dialog.source !== 'auction-bid') {
    return MARKET_DIALOG_MIN_PRICE;
  }
  return normalizeTradeDialogPriceImpl(self, dialog.minUnitPrice ?? MARKET_DIALOG_MIN_PRICE, 'up');
}

export function normalizeTradeDialogQuantityImpl(
  self: MarketPanel,
  value: string | number,
  entry: MarketListedItemView,
  kind: MarketTradeDialogKind,
  unitPrice = self.tradeDialog?.unitPrice ?? MARKET_DIALOG_MIN_PRICE,
): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  const quantityStep = getTradeDialogQuantityStepImpl(self, unitPrice);
  const minimumQuantity = getTradeDialogMinimumQuantityImpl(self, entry, kind, unitPrice);
  const max = getTradeDialogQuantityMaxImpl(self, entry, kind, unitPrice);
  if (max <= 0) {
    return minimumQuantity;
  }
  if (!Number.isFinite(parsed)) {
    return minimumQuantity;
  }
  const bounded = Math.max(minimumQuantity, Math.min(max, Math.ceil(parsed)));
  const alignedUp = Math.ceil(bounded / quantityStep) * quantityStep;
  if (alignedUp <= max) {
    return alignedUp;
  }
  return Math.max(minimumQuantity, Math.floor(max / quantityStep) * quantityStep);
}

export function getTradeDialogQuantityStepImpl(self: MarketPanel, unitPrice: number): number {
  return Math.max(1, getMarketMinimumTradeQuantity(unitPrice));
}

export function getTradeDialogMinimumQuantityImpl(
  self: MarketPanel,
  entry: MarketListedItemView,
  kind: MarketTradeDialogKind,
  unitPrice: number,
): number {
  const quantityStep = getTradeDialogQuantityStepImpl(self, unitPrice);
  const opposingPrice = kind === 'buy' ? entry.lowestSellPrice : entry.highestBuyPrice;
  const crossesOpposingPrice = opposingPrice !== undefined
    && (kind === 'buy' ? opposingPrice <= unitPrice : opposingPrice >= unitPrice);
  if (!crossesOpposingPrice || opposingPrice === undefined || !isLegacyMarketPrice(opposingPrice)) {
    return quantityStep;
  }
  const legacyMinimum = getMarketMinimumTradeQuantity(opposingPrice);
  return Math.ceil(legacyMinimum / quantityStep) * quantityStep;
}

export function getTradeDialogQuantityMaxImpl(
  self: MarketPanel,
  entry: MarketListedItemView,
  kind: MarketTradeDialogKind,
  unitPrice: number,
): number {
  const quantityStep = getTradeDialogQuantityStepImpl(self, unitPrice);
  const minimumQuantity = getTradeDialogMinimumQuantityImpl(self, entry, kind, unitPrice);
  const cap = kind === 'sell'
    ? self.findMatchingInventoryCount(entry.item)
    : getAffordableBuyQuantityImpl(self, unitPrice, self.marketUpdate?.currencyItemId ?? '');
  if (cap < minimumQuantity) {
    return 0;
  }
  return Math.floor(Math.min(cap, MARKET_DIALOG_MAX_QUANTITY) / quantityStep) * quantityStep;
}

export function getTradeDialogMaxButtonQuantityImpl(
  self: MarketPanel,
  entry: MarketListedItemView,
  _currencyItemId: string,
  dialog: MarketTradeDialogState,
): number {
  return getTradeDialogQuantityMaxImpl(self, entry, dialog.kind, dialog.unitPrice);
}

export function getAffordableBuyQuantityImpl(self: MarketPanel, unitPrice: number, currencyItemId: string): number {
  if (unitPrice <= 0) {
    return 0;
  }
  const ownedCurrency = self.findInventoryItemCountByItemId(currencyItemId);
  const quantityStep = getTradeDialogQuantityStepImpl(self, unitPrice);
  const stepCost = self.getMarketTradeTotalCost(quantityStep, unitPrice);
  if (!stepCost || stepCost <= 0) {
    return 0;
  }
  const affordableSteps = Math.floor(ownedCurrency / stepCost);
  return Math.min(MARKET_DIALOG_MAX_QUANTITY, affordableSteps * quantityStep);
}

export function getNextTradeDialogPriceImpl(
  self: MarketPanel,
  currentPrice: number,
  action: MarketPriceAction,
  preset?: number | null,
  minPrice: number = MARKET_DIALOG_MIN_PRICE,
): number {
  const clamp = (price: number, direction: 'up' | 'down'): number =>
    normalizeTradeDialogPriceImpl(self, Math.max(minPrice, price), direction);
  if (action === 'preset') {
    return clamp(preset ?? MARKET_DIALOG_MIN_PRICE, 'up');
  }
  if (action === 'double') {
    return clamp(currentPrice * 2, 'up');
  }
  if (action === 'half') {
    return clamp(currentPrice / 2, 'down');
  }
  if (action === 'increase') {
    const step = currentPrice < 1
      ? getMarketPriceStep(currentPrice)
      : getMarketPriceStep(Math.min(MARKET_DIALOG_MAX_PRICE, currentPrice + 1));
    return clamp(currentPrice + step, 'up');
  }
  const probe = Math.max(minPrice, currentPrice - 1);
  return clamp(currentPrice - getMarketPriceStep(probe), 'down');
}

export function normalizeTradeDialogPriceImpl(
  self: MarketPanel,
  value: number,
  direction: 'up' | 'down',
): number {
  const bounded = Math.max(MARKET_DIALOG_MIN_PRICE, Math.min(MARKET_DIALOG_MAX_PRICE, value));
  if (direction === 'up') {
    return Math.min(MARKET_DIALOG_MAX_PRICE, normalizeMarketPriceUp(bounded));
  }
  return Math.max(MARKET_DIALOG_MIN_PRICE, normalizeMarketPriceDown(bounded));
}

export function formatPricePresetLabelImpl(self: MarketPanel, value: number): string {
  if (value < 1) {
    return self.formatMarketUnitPrice(value);
  }
  if (value >= 1_000_000) {
    return '一百万';
  }
  if (value >= 10_000) {
    return '一万';
  }
  return formatDisplayInteger(value);
}

export function readDatasetNumberImpl(value: string | undefined): number | null {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : null;
}
