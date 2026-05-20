/**
 * 市场交易系统常量。
 */

/** 市场价格预设值 */
export const MARKET_PRICE_PRESET_VALUES = [0.01, 1, 100, 10_000, 1_000_000] as const;

/** 市场最低单价 */
export const MARKET_MIN_UNIT_PRICE = MARKET_PRICE_PRESET_VALUES[0];

/** 市场最高单价 */
export const MARKET_MAX_UNIT_PRICE = 10_000_000_000;

/** 拍卖上架费基础值 */
export const AUCTION_LISTING_FEE_BASE = 10;

/** 拍卖上架费费率（起拍总价的百分比） */
export const AUCTION_LISTING_FEE_RATE = 0.01;

/** 拍卖最短持续时间（小时） */
export const AUCTION_MIN_DURATION_HOURS = 1;

/** 拍卖最长持续时间（小时） */
export const AUCTION_MAX_DURATION_HOURS = 48;

/** 拍卖默认持续时间（小时） */
export const AUCTION_DEFAULT_DURATION_HOURS = 12;
