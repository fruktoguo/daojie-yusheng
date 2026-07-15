/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
import {
  MARKET_PRICE_PRESET_VALUES,
  MARKET_MIN_UNIT_PRICE,
  MARKET_MAX_UNIT_PRICE,
} from './constants/gameplay/market';

/** MARKET_FRACTIONAL_PRICE_SCALE：市场FRACTIONAL价格缩放。 */
const MARKET_FRACTIONAL_PRICE_SCALE = 100;
/** MARKET_PRICE_EPSILON：市场价格EPSILON。 */
const MARKET_PRICE_EPSILON = 1e-9;
/** 低于 1 灵石时，只允许能用整数件数恰好凑成 1 灵石的分价。 */
const MARKET_FRACTIONAL_LISTING_PRICE_UNITS = [1, 2, 4, 5, 10, 20, 25, 50] as const;

/** MarketPriceBand：价格档位。 */
type MarketPriceBand = {
/**
 * start：start相关字段。
 */

  start: number;  
  /**
 * end：end相关字段。
 */

  end: number;  
  /**
 * step：step相关字段。
 */

  step: number;
};

/** normalizeFractionalPriceUnits：规范化Fractional价格Units。 */
function normalizeFractionalPriceUnits(value: number): number | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isFinite(value) || value < MARKET_MIN_UNIT_PRICE || value >= 1) {
    return null;
  }
  const scaled = Math.round(value * MARKET_FRACTIONAL_PRICE_SCALE);
  if (Math.abs((value * MARKET_FRACTIONAL_PRICE_SCALE) - scaled) > MARKET_PRICE_EPSILON) {
    return null;
  }
  if (scaled <= 0 || scaled >= MARKET_FRACTIONAL_PRICE_SCALE) {
    return null;
  }
  return scaled;
}

/** normalizeBasePrice：规范化基础价格。 */
function normalizeBasePrice(value: number): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isFinite(value) || value <= 1) {
    return 1;
  }
  return 10 ** Math.floor(Math.log10(value));
}

/** getMarketPriceBand：读取市场价格Band。 */
function getMarketPriceBand(value: number): MarketPriceBand {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const price = Math.max(1, Math.floor(value));
  const base = normalizeBasePrice(price);
  const normalized = price / base;
  if (normalized < 3) {
    return {
      start: base,
      end: base * 3,
      step: Math.max(1, base / 20),
    };
  }
  if (normalized < 5) {
    return {
      start: base * 3,
      end: base * 5,
      step: Math.max(1, base / 10),
    };
  }
  return {
    start: base * 5,
    end: base * 10,
    step: Math.max(1, base / 5),
  };
}

/** getMarketPriceStep：读取市场价格Step。 */
export function getMarketPriceStep(value: number): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (value < 1) {
    return MARKET_MIN_UNIT_PRICE;
  }
  return getMarketPriceBand(value).step;
}

/** isValidMarketPrice：判断是否Valid市场价格。 */
export function isValidMarketPrice(value: number): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isFinite(value) || value <= 0 || value > MARKET_MAX_UNIT_PRICE) {
    return false;
  }
  if (value < 1) {
    return normalizeFractionalPriceUnits(value) !== null;
  }
  if (!Number.isInteger(value)) {
    return false;
  }
  const band = getMarketPriceBand(value);
  return (value - band.start) % band.step === 0;
}

/** 判断单价是否允许用于新建坊市挂单。历史订单仍可保留其他两位小数价用于兼容结算。 */
export function isValidMarketListingPrice(value: number): boolean {
  if (!isValidMarketPrice(value)) {
    return false;
  }
  if (value >= 1) {
    return true;
  }
  const scaled = normalizeFractionalPriceUnits(value);
  return scaled !== null && MARKET_FRACTIONAL_PRICE_SCALE % scaled === 0;
}

/** 判断单价是否属于旧规则允许、但新挂单已禁止的小数价。 */
export function isLegacyMarketPrice(value: number): boolean {
  return value < 1 && isValidMarketPrice(value) && !isValidMarketListingPrice(value);
}

/** normalizeMarketPriceUp：规范化市场价格Up。 */
export function normalizeMarketPriceUp(value: number): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isFinite(value)) {
    return MARKET_MIN_UNIT_PRICE;
  }
  const bounded = Math.max(MARKET_MIN_UNIT_PRICE, Math.min(MARKET_MAX_UNIT_PRICE, value));
  if (bounded < 1) {
    const minimumUnits = Math.ceil((bounded * MARKET_FRACTIONAL_PRICE_SCALE) - MARKET_PRICE_EPSILON);
    for (const units of MARKET_FRACTIONAL_LISTING_PRICE_UNITS) {
      if (units >= minimumUnits) {
        return units / MARKET_FRACTIONAL_PRICE_SCALE;
      }
    }
    return 1;
  }
  let current = Math.max(1, Math.ceil(bounded));
  while (true) {
    if (isValidMarketPrice(current)) {
      return current;
    }
    const band = getMarketPriceBand(current);
    const offset = current - band.start;
    const alignedOffset = Math.ceil(offset / band.step) * band.step;
    const candidate = band.start + alignedOffset;
    if (candidate < band.end) {
      return candidate;
    }
    /** current：当前。 */
    current = band.end;
  }
}

/** normalizeMarketPriceDown：规范化市场价格Down。 */
export function normalizeMarketPriceDown(value: number): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isFinite(value)) {
    return MARKET_MIN_UNIT_PRICE;
  }
  const bounded = Math.max(MARKET_MIN_UNIT_PRICE, Math.min(MARKET_MAX_UNIT_PRICE, value));
  if (bounded < 1) {
    const maximumUnits = Math.floor((bounded * MARKET_FRACTIONAL_PRICE_SCALE) + MARKET_PRICE_EPSILON);
    for (let index = MARKET_FRACTIONAL_LISTING_PRICE_UNITS.length - 1; index >= 0; index -= 1) {
      const units = MARKET_FRACTIONAL_LISTING_PRICE_UNITS[index];
      if (units !== undefined && units <= maximumUnits) {
        return units / MARKET_FRACTIONAL_PRICE_SCALE;
      }
    }
    return MARKET_MIN_UNIT_PRICE;
  }
  let current = Math.max(1, Math.floor(bounded));
  while (true) {
    if (isValidMarketPrice(current)) {
      return current;
    }
    const band = getMarketPriceBand(current);
    const offset = current - band.start;
    const alignedOffset = Math.floor(offset / band.step) * band.step;
    const candidate = band.start + alignedOffset;
    if (candidate >= band.start) {
      return candidate;
    }
    /** current：当前。 */
    current = band.start - 1;
  }
}

/** getMarketMinimumTradeQuantity：读取市场Minimum交易Quantity。 */
export function getMarketMinimumTradeQuantity(unitPrice: number): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const scaled = normalizeFractionalPriceUnits(unitPrice);
  if (scaled === null) {
    return 1;
  }
  return Math.ceil(MARKET_FRACTIONAL_PRICE_SCALE / scaled);
}

/** isValidMarketTradeQuantity：判断是否Valid市场交易Quantity。 */
export function isValidMarketTradeQuantity(unitPrice: number, quantity: number): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
    return false;
  }
  return isValidMarketListingPrice(unitPrice)
    && quantity % getMarketMinimumTradeQuantity(unitPrice) === 0;
}

/** calculateMarketTradeTotalCost：计算市场交易总量Cost。 */
export function calculateMarketTradeTotalCost(quantity: number, unitPrice: number): number | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0 || !isValidMarketPrice(unitPrice)) {
    return null;
  }
  if (unitPrice >= 1) {
    const total = quantity * unitPrice;
    return Number.isSafeInteger(total) ? total : null;
  }
  const scaled = normalizeFractionalPriceUnits(unitPrice);
  if (scaled === null) {
    return null;
  }
  const totalScaled = quantity * scaled;
  if (!Number.isSafeInteger(totalScaled) || totalScaled % MARKET_FRACTIONAL_PRICE_SCALE !== 0) {
    return null;
  }
  const total = totalScaled / MARKET_FRACTIONAL_PRICE_SCALE;
  return Number.isSafeInteger(total) ? total : null;
}

/** 计算需要整数灵石结算的向上取整总价。 */
export function calculateMarketRoundedTotalCost(quantity: number, unitPrice: number): number | null {
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity < 0 || !isValidMarketPrice(unitPrice)) {
    return null;
  }
  if (unitPrice >= 1) {
    const total = quantity * unitPrice;
    return Number.isSafeInteger(total) ? total : null;
  }
  const scaled = normalizeFractionalPriceUnits(unitPrice);
  if (scaled === null) {
    return null;
  }
  const totalScaled = quantity * scaled;
  if (!Number.isSafeInteger(totalScaled)) {
    return null;
  }
  const total = Math.ceil(totalScaled / MARKET_FRACTIONAL_PRICE_SCALE);
  return Number.isSafeInteger(total) ? total : null;
}

/** 计算开放求购单当前仍托管的整数灵石；旧小数价按累计价值向上取整。 */
export function calculateMarketOrderReservedCost(quantity: number, unitPrice: number): number | null {
  return calculateMarketRoundedTotalCost(quantity, unitPrice);
}

/**
 * 计算订单本次成交应转移的灵石。
 * 使用成交前后剩余托管价值之差，让旧异常价多次成交与最终退款严格守恒。
 */
export function calculateMarketOrderTradeTotalCost(
  remainingQuantity: number,
  tradeQuantity: number,
  unitPrice: number,
): number | null {
  if (!Number.isInteger(remainingQuantity)
    || !Number.isInteger(tradeQuantity)
    || remainingQuantity <= 0
    || tradeQuantity <= 0
    || tradeQuantity > remainingQuantity) {
    return null;
  }
  const before = calculateMarketOrderReservedCost(remainingQuantity, unitPrice);
  const after = calculateMarketOrderReservedCost(remainingQuantity - tradeQuantity, unitPrice);
  if (before === null || after === null) {
    return null;
  }
  const total = before - after;
  return Number.isSafeInteger(total) && total > 0 ? total : null;
}
