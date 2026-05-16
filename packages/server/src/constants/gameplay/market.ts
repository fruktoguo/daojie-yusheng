/**
 * 坊市（市场）玩法常量：定义交易货币、挂单上限和历史记录分页参数。
 */

/** 坊市交易使用的货币物品 ID */
export const MARKET_CURRENCY_ITEM_ID = 'spirit_stone';
/** 单笔挂单最大数量 */
export const MARKET_MAX_ORDER_QUANTITY = 999_900_000_000;
/** 交易历史可见条数上限 */
export const MARKET_TRADE_HISTORY_VISIBLE_LIMIT = 100;
/** 交易历史每页条数 */
export const MARKET_TRADE_HISTORY_PAGE_SIZE = 10;
/** 运行时内存中保留的最近成交记录上限，完整历史以数据库为真源按需查询。 */
export const MARKET_TRADE_HISTORY_RUNTIME_CACHE_LIMIT = 500;
/** 运行时内存中保留的玩家坊市仓库 LRU 上限，超过后驱逐离线/无挂单玩家的缓存条目。 */
export const MARKET_STORAGE_RUNTIME_CACHE_LIMIT = 5000;
