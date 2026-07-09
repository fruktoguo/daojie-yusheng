/**
 * 坊市列表请求的跨端归一化规则。
 *
 * 这些函数只处理分页和搜索输入，不参与交易裁定，供客户端请求标识与服务端查询口径保持一致。
 */

export const MARKET_LISTINGS_PAGE_SIZE_DEFAULT = 20;
export const MARKET_LISTINGS_PAGE_SIZE_MAX = 100;
export const MARKET_AUCTION_PAGE_SIZE_DEFAULT = 10;
export const MARKET_AUCTION_PAGE_SIZE_MAX = 10;
export const MARKET_AUCTION_QUERY_MAX_LENGTH = 32;

/** 将页码归一到从 1 开始的有限整数。 */
export function normalizeMarketRequestPage(value: unknown): number {
  const requested = Number(value);
  return Number.isFinite(requested) ? Math.max(1, Math.trunc(requested)) : 1;
}

/** 将普通坊市每页数量收敛到服务端允许范围。 */
export function normalizeMarketListingsPageSize(value: unknown): number {
  const requested = Number(value);
  return Number.isFinite(requested)
    ? Math.min(MARKET_LISTINGS_PAGE_SIZE_MAX, Math.max(1, Math.trunc(requested)))
    : MARKET_LISTINGS_PAGE_SIZE_DEFAULT;
}

/** 将拍卖行和传法台每页数量收敛到服务端允许范围。 */
export function normalizeMarketAuctionPageSize(value: unknown): number {
  const requested = Number(value);
  return Number.isFinite(requested)
    ? Math.min(MARKET_AUCTION_PAGE_SIZE_MAX, Math.max(1, Math.trunc(requested)))
    : MARKET_AUCTION_PAGE_SIZE_DEFAULT;
}

/** 清理拍卖行和传法台搜索词，并保持与服务端 32 字符上限一致。 */
export function normalizeMarketAuctionQuery(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().slice(0, MARKET_AUCTION_QUERY_MAX_LENGTH)
    : '';
}

/** 按回包总量计算服务端实际会返回的页码。 */
export function resolveClampedMarketResponsePage(requestedPage: unknown, total: unknown, pageSize: unknown): number {
  const normalizedPage = normalizeMarketRequestPage(requestedPage);
  const normalizedPageSize = Math.max(1, Math.trunc(Number(pageSize)) || 1);
  const normalizedTotal = Math.max(0, Math.trunc(Number(total)) || 0);
  const totalPages = Math.max(1, Math.ceil(normalizedTotal / normalizedPageSize));
  return Math.min(totalPages, normalizedPage);
}
