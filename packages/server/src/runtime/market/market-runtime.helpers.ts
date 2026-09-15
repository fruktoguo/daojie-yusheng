/**
 * market-runtime.helpers.ts
 *
 * 从 market-runtime.service.ts 拆出的克隆/归一化游离函数集合。
 * 包含仓库克隆、拍卖出价/计时克隆、背包克隆、钱包克隆、会话栅栏重试判定与
 * 交易历史运行时缓存裁剪等纯函数，供 MarketRuntimeService 委托调用。
 */
import { MARKET_TRADE_HISTORY_RUNTIME_CACHE_LIMIT } from '../../constants/gameplay/market';

export function cloneStorage(storage) {
    return {
        items: (storage?.items ?? []).map((item) => ({ ...item })),
    };
}

export function cloneAuctionBidsMap(source) {
    const next = new Map();
    for (const [itemKey, bids] of source.entries()) {
        next.set(itemKey, Array.isArray(bids) ? bids.map((entry) => ({ ...entry })) : []);
    }
    return next;
}

export function cloneAuctionTimingMap(source) {
    const next = new Map();
    for (const [itemKey, timing] of source.entries()) {
        next.set(itemKey, { ...timing });
    }
    return next;
}

export function cloneInventoryItems(items) {
    return Array.isArray(items)
        ? items.map((item) => ({ ...item }))
        : [];
}

export function normalizeInventoryItemInstanceId(value) {
    return typeof value === 'string' ? value.trim() : '';
}

export function cloneWalletBalances(existingBalances) {
    return Array.isArray(existingBalances)
        ? existingBalances.map((entry) => ({
            walletType: typeof entry?.walletType === 'string' ? entry.walletType.trim() : '',
            balance: Math.max(0, Math.trunc(Number(entry?.balance ?? 0))),
            frozenBalance: Math.max(0, Math.trunc(Number(entry?.frozenBalance ?? 0))),
            version: Math.max(0, Math.trunc(Number(entry?.version ?? 0))),
        })).filter((entry) => entry.walletType)
        : [];
}

export function shouldRetryMarketSessionFence(error) {
    const message = String(error instanceof Error ? error.message : error);
    return message.startsWith('player_session_fencing_conflict');
}

export function trimTradeHistoryRuntimeCache(records) {
    return (Array.isArray(records) ? records : [])
        .slice()
        .sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id))
        .slice(0, MARKET_TRADE_HISTORY_RUNTIME_CACHE_LIMIT);
}
