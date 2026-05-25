/**
 * 本文件定义前后端共享的玩法常量，是协议和运行规则共同依赖的稳定来源。
 *
 * 维护时要同步检查客户端展示、服务端结算和配置编辑器，避免同一数值在多端分叉。
 */
/**
 * 市场交易系统常量。
 */

/** 市场价格预设值 */
export const MARKET_PRICE_PRESET_VALUES = [0.01, 1, 100, 10_000, 1_000_000] as const;

/** 市场最低单价 */
export const MARKET_MIN_UNIT_PRICE = MARKET_PRICE_PRESET_VALUES[0];

/** 市场最高单价 */
export const MARKET_MAX_UNIT_PRICE = 10_000_000_000;

/** 天道商店消耗的专属货币物品 ID */
export const HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID = 'merit';

/** 天道商店固定商品表；价格由服务端按此表权威结算。 */
export const HEAVENLY_DAO_SHOP_ITEMS = [
  { itemId: 'spirit_stone', count: 240, price: 100 },
  { itemId: 'root_seed.heaven', count: 1, price: 2_000 },
  { itemId: 'root_seed.divine', count: 1, price: 10_000 },
  { itemId: 'sect_founding_token', count: 1, price: 2_000 },
  { itemId: 'wudao_yujian', count: 1, price: 1_000 },
  { itemId: 'pill.ningxiang', count: 1, price: 100 },
  { itemId: 'pill.wangsheng', count: 1, price: 100 },
  { itemId: 'pill.shatter_spirit', count: 1, price: 10 },
] as const;

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
