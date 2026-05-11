/**
 * 市场交易系统常量。
 */

/** 市场价格预设值 */
export const MARKET_PRICE_PRESET_VALUES = [0.01, 1, 100, 10_000, 1_000_000] as const;

/** 市场最低单价 */
export const MARKET_MIN_UNIT_PRICE = MARKET_PRICE_PRESET_VALUES[0];

/** 市场最高单价 */
export const MARKET_MAX_UNIT_PRICE = 10_000_000_000;
