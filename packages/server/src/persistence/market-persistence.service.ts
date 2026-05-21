/**
 * 坊市（市场）持久化服务。
 * 管理 server_market_order、server_market_trade_history 和 player_market_storage_item 表，
 * 支持订单/成交/托管仓的事务性写入、结构化加载和恢复水位推进。
 */
import { Injectable, Logger, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { isValidMarketPrice } from '@mud/shared';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from './database-pool.provider';
import { ensureBigintColumnType } from './schema-bigint-migration';

const MARKET_ORDER_TABLE = 'server_market_order';
const MARKET_TRADE_TABLE = 'server_market_trade_history';
const PLAYER_MARKET_STORAGE_ITEM_TABLE = 'player_market_storage_item';
const PLAYER_RECOVERY_WATERMARK_TABLE = 'player_recovery_watermark';

/** 坊市持久化服务：管理订单、交易历史和仓库数据的持久化一致性。 */
@Injectable()
export class MarketPersistenceService {
/**
 * logger：日志器引用。
 */

    logger = new Logger(MarketPersistenceService.name);
    /**
 * pool：缓存或索引容器。
 */

    pool = null;
    /**
 * enabled：启用开关或状态标识。
 */

    enabled = false;

    databasePoolProvider;

    constructor(@Inject(DatabasePoolProvider) databasePoolProvider: any = undefined) {
        this.databasePoolProvider = databasePoolProvider;
    }

    /**
 * onModuleInit：执行on模块Init相关逻辑。
 * @returns 无返回值，直接更新on模块Init相关状态。
 */

    async onModuleInit() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const databaseUrl = resolveServerDatabaseUrl();
        if (!databaseUrl.trim()) {
            this.logger.log('坊市持久化已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
            return;
        }
        const sharedPool = this.databasePoolProvider?.getPool?.('market');
        if (!sharedPool) {
            this.logger.warn('坊市持久化已禁用：数据库连接池提供者未提供连接池');
            return;
        }
        this.pool = sharedPool;
        try {
            await ensureMarketTables(this.pool);
            this.enabled = true;
            this.logger.log('坊市持久化已启用（server_market_order + server_market_trade_history + player_market_storage_item）');
        }
        catch (error) {
            this.logger.error('坊市持久化初始化失败，已回退为禁用模式', error instanceof Error ? error.stack : String(error));
            this.releasePoolReference();
        }
    }
    /**
 * onModuleDestroy：执行on模块Destroy相关逻辑。
 * @returns 无返回值，直接更新on模块Destroy相关状态。
 */

    async onModuleDestroy() {
        this.releasePoolReference();
    }

    /** 检查数据库可用性，用于上游交易流程决定是否执行持久化。 */
    isEnabled() {
        return this.enabled && this.pool !== null;
    }

    /** 加载活跃订单列表，按创建时间+ID排序。 */
    async loadOpenOrders() {

        if (!this.pool || !this.enabled) {
            return [];
        }
        const result = await this.pool.query(`
          SELECT raw_payload
          FROM ${MARKET_ORDER_TABLE}
          WHERE status = 'open'
          ORDER BY created_at_ms ASC, order_id ASC
        `);
        const rows = result.rows ?? [];
        return rows
            .map((row) => normalizeMarketOrder(row.raw_payload))
            .filter((entry) => Boolean(entry))
            .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
    }
    /**
 * loadTradeHistory：读取Trade历史并返回结果。
 * @returns 无返回值，完成TradeHistory的读取/组装。
 */

    async loadTradeHistory() {

        if (!this.pool || !this.enabled) {
            return [];
        }
        const result = await this.pool.query(`
          SELECT raw_payload
          FROM ${MARKET_TRADE_TABLE}
          ORDER BY created_at_ms DESC, trade_id ASC
        `);
        const rows = result.rows ?? [];
        return rows
            .map((row) => normalizeTradeRecord(row.raw_payload))
            .filter((entry) => Boolean(entry))
            .sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id));
    }
    /** 按玩家与来源读取最近成交历史，避免把全表成交记录常驻在运行时内存。 */
    async loadTradeHistoryForPlayer(playerId, source, limit) {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        const normalizedSource = source === 'auction' ? 'auction' : 'market';
        const normalizedLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(500, Math.trunc(Number(limit)))) : 100;
        if (!this.pool || !this.enabled || !normalizedPlayerId) {
            return [];
        }
        const result = await this.pool.query(`
          SELECT raw_payload
          FROM ${MARKET_TRADE_TABLE}
          WHERE (buyer_id = $1 OR seller_id = $1)
            AND COALESCE(raw_payload->>'source', 'market') = $2
          ORDER BY created_at_ms DESC, trade_id ASC
          LIMIT $3
        `, [normalizedPlayerId, normalizedSource, normalizedLimit]);
        const rows = result.rows ?? [];
        return rows
            .map((row) => normalizeTradeRecord(row.raw_payload))
            .filter((entry) => Boolean(entry))
            .sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id));
    }
    /** 按来源读取全服最近成交历史，供拍卖行全服成交榜这类低频面板使用。 */
    async loadTradeHistoryBySource(source, limit) {
        const normalizedSource = source === 'auction' ? 'auction' : 'market';
        const normalizedLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(500, Math.trunc(Number(limit)))) : 20;
        if (!this.pool || !this.enabled) {
            return [];
        }
        const result = await this.pool.query(`
          SELECT raw_payload
          FROM ${MARKET_TRADE_TABLE}
          WHERE COALESCE(raw_payload->>'source', 'market') = $1
          ORDER BY created_at_ms DESC, trade_id ASC
          LIMIT $2
        `, [normalizedSource, normalizedLimit]);
        const rows = result.rows ?? [];
        return rows
            .map((row) => normalizeTradeRecord(row.raw_payload))
            .filter((entry) => Boolean(entry))
            .sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id));
    }
    /**
 * loadStorages：读取Storage并返回结果。
 * @returns 无返回值，完成Storage的读取/组装。
 */

    async loadStorages() {
        return this.loadStructuredStorages();
    }
    /**
 * loadStorageForPlayer：按玩家 ID 按需加载坊市托管仓行，避免一次性灌入全部历史玩家的仓库。
 * @param playerId 玩家 ID。
 * @returns 单个玩家的托管仓物品快照，若无行返回空仓库。
 */
    async loadStorageForPlayer(playerId) {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!this.pool || !this.enabled || !normalizedPlayerId) {
            return { items: [] };
        }
        const result = await this.pool.query(`
          SELECT player_id, slot_index, item_id, count, raw_payload
          FROM ${PLAYER_MARKET_STORAGE_ITEM_TABLE}
          WHERE player_id = $1
          ORDER BY slot_index ASC, storage_item_id ASC
        `, [normalizedPlayerId]);
        const rows = Array.isArray(result.rows) ? result.rows : [];
        if (rows.length === 0) {
            return { items: [] };
        }
        const items = rows.map((row) => normalizeStructuredStorageItem(row));
        return { items };
    }
    /**
 * persistMutation：判断persistMutation是否满足条件。
 * @param input 输入参数。
 * @returns 无返回值，直接更新persistMutation相关状态。
 */

    async persistMutation(input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.pool || !this.enabled) {
            return;
        }

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await this.persistOrders(client, input.upsertOrders, input.deleteOrderIds);
            await this.persistStorages(client, input.upsertStorages, input.deleteStoragePlayerIds);
            await this.persistTrades(client, input.tradeRecords);
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw error;
        }
        finally {
            client.release();
        }
    }

    /** 读取某 scope 下所有持久化行，供订单/历史/仓库读取入口复用。 */
    async loadScopeRows(_scope) {
        return [];
    }

    async loadCompatScopeRows(_scopes) {
        return [];
    }
    /**
 * loadStructuredStorages：读取结构化Storage并返回结果。
 * @returns 无返回值，完成结构化Storage的读取/组装。
 */

    async loadStructuredStorages() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.pool || !this.enabled) {
            return [];
        }

        const result = await this.pool.query(`
          SELECT player_id, slot_index, item_id, count, raw_payload
          FROM ${PLAYER_MARKET_STORAGE_ITEM_TABLE}
          ORDER BY player_id ASC, slot_index ASC, storage_item_id ASC
        `);
/**
 * 记录rows。
 */
        const rows = Array.isArray(result.rows) ? result.rows : [];
        if (rows.length === 0) {
            return [];
        }
/**
 * 记录grouped。
 */
        const grouped = new Map();
        for (const row of rows) {
/**
 * 记录playerId。
 */
            const playerId = typeof row?.player_id === 'string' ? row.player_id.trim() : '';
            if (!playerId) {
                continue;
            }
/**
 * 记录current。
 */
            const current = grouped.get(playerId) ?? { playerId, storage: { items: [] } };
            current.storage.items.push(normalizeStructuredStorageItem(row));
            grouped.set(playerId, current);
        }
        return Array.from(grouped.values())
            .filter((entry) => entry.storage.items.length > 0)
            .sort((left, right) => left.playerId.localeCompare(right.playerId, 'zh-Hans-CN'));
    }
    /**
 * persistOrders：判断persist订单是否满足条件。
 * @param client 参数说明。
 * @param upserts 参数说明。
 * @param deletions 参数说明。
 * @returns 无返回值，直接更新persist订单相关状态。
 */

    async persistOrders(client, upserts, deletions) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        for (const order of upserts) {
            await client.query(`
          INSERT INTO ${MARKET_ORDER_TABLE}(
            order_id,
            owner_id,
            side,
            status,
            item_key,
            item_id,
            remaining_quantity,
            unit_price,
            created_at_ms,
            updated_at_ms,
            raw_payload,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::numeric, $9, $10, $11::jsonb, now())
          ON CONFLICT (order_id)
          DO UPDATE SET
            owner_id = EXCLUDED.owner_id,
            side = EXCLUDED.side,
            status = EXCLUDED.status,
            item_key = EXCLUDED.item_key,
            item_id = EXCLUDED.item_id,
            remaining_quantity = EXCLUDED.remaining_quantity,
            unit_price = EXCLUDED.unit_price,
            created_at_ms = EXCLUDED.created_at_ms,
            updated_at_ms = EXCLUDED.updated_at_ms,
            raw_payload = EXCLUDED.raw_payload,
            updated_at = now()
        `, [
                order.id,
                order.ownerId,
                order.side,
                order.status,
                order.itemKey,
                order.item?.itemId ?? '',
                Math.max(0, Math.trunc(Number(order.remainingQuantity ?? 0))),
                normalizeUnitPrice(order.unitPrice),
                Math.trunc(Number(order.createdAt ?? Date.now())),
                Math.trunc(Number(order.updatedAt ?? Date.now())),
                JSON.stringify(order),
            ]);
        }
        if (deletions.length > 0) {
            await client.query(`DELETE FROM ${MARKET_ORDER_TABLE} WHERE order_id = ANY($1::varchar[])`, [deletions]);
        }
    }
    /**
 * persistStorages：判断persistStorage是否满足条件。
 * @param client 参数说明。
 * @param upserts 参数说明。
 * @param deletions 参数说明。
 * @returns 无返回值，直接更新persistStorage相关状态。
 */

    async persistStorages(client, upserts, deletions) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        await this.persistStructuredStorages(client, upserts, deletions);
    }
    /**
 * persistStructuredStorages：判断persistStructuredStorage是否满足条件。
 * @param client 参数说明。
 * @param upserts 参数说明。
 * @param deletions 参数说明。
 * @returns 无返回值，直接更新persistStructuredStorage相关状态。
 */

    async persistStructuredStorages(client, upserts, deletions) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录upsertplayerids。
 */
        const upsertPlayerIds = upserts
            .map((entry) => typeof entry?.playerId === 'string' ? entry.playerId.trim() : '')
            .filter((entry, index, list) => entry.length > 0 && list.indexOf(entry) === index);
/**
 * 记录affectedplayerids。
 */
        const affectedPlayerIds = Array.from(new Set([...upsertPlayerIds, ...deletions.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)]));
        if (deletions.length > 0) {
            await client.query(`DELETE FROM ${PLAYER_MARKET_STORAGE_ITEM_TABLE} WHERE player_id = ANY($1::varchar[])`, [deletions]);
        }
        for (const entry of upserts) {
/**
 * 记录playerId。
 */
            const playerId = typeof entry?.playerId === 'string' ? entry.playerId.trim() : '';
            if (!playerId) {
                continue;
            }
/**
 * 记录items。
 */
            const items = normalizeStorage(entry.storage).items;
            const slotIndicesJson = JSON.stringify(items.map((_, slotIndex) => ({ slot_index: slotIndex })));
            for (let slotIndex = 0; slotIndex < items.length; slotIndex += 1) {
/**
 * 记录item。
 */
                const item = items[slotIndex];
                await client.query(`
                  INSERT INTO ${PLAYER_MARKET_STORAGE_ITEM_TABLE}(
                    storage_item_id,
                    player_id,
                    slot_index,
                    item_id,
                    count,
                    enhance_level,
                    raw_payload,
                    updated_at
                  )
                  VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now())
                  ON CONFLICT (storage_item_id)
                  DO UPDATE SET
                    player_id = EXCLUDED.player_id,
                    slot_index = EXCLUDED.slot_index,
                    item_id = EXCLUDED.item_id,
                    count = EXCLUDED.count,
                    enhance_level = EXCLUDED.enhance_level,
                    raw_payload = EXCLUDED.raw_payload,
                    updated_at = now()
                `, [
                    buildMarketStorageItemId(playerId, slotIndex),
                    playerId,
                    slotIndex,
                    item.itemId,
                    Math.max(1, Math.trunc(Number(item.count ?? 1))),
                    normalizeEnhanceLevel(item),
                    JSON.stringify(item),
                ]);
            }
            await client.query(`
              WITH incoming AS (
                SELECT slot_index
                FROM jsonb_to_recordset($2::jsonb) AS entry(slot_index bigint)
              )
              DELETE FROM ${PLAYER_MARKET_STORAGE_ITEM_TABLE} target
              WHERE target.player_id = $1
                AND NOT EXISTS (
                  SELECT 1
                  FROM incoming
                  WHERE incoming.slot_index = target.slot_index
                )
            `, [
                playerId,
                slotIndicesJson,
            ]);
        }
        if (affectedPlayerIds.length > 0) {
            await upsertMarketStorageWatermarks(client, affectedPlayerIds);
        }
    }
    /**
 * persistTrades：判断persistTrade是否满足条件。
 * @param client 参数说明。
 * @param trades 参数说明。
 * @returns 无返回值，直接更新persistTrade相关状态。
 */

    async persistTrades(client, trades) {
        for (const trade of trades) {
            await client.query(`
          INSERT INTO ${MARKET_TRADE_TABLE}(
            trade_id,
            buyer_id,
            seller_id,
            item_id,
            quantity,
            unit_price,
            created_at_ms,
            raw_payload,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::numeric, $7, $8::jsonb, now())
          ON CONFLICT (trade_id)
          DO UPDATE SET
            buyer_id = EXCLUDED.buyer_id,
            seller_id = EXCLUDED.seller_id,
            item_id = EXCLUDED.item_id,
            quantity = EXCLUDED.quantity,
            unit_price = EXCLUDED.unit_price,
            created_at_ms = EXCLUDED.created_at_ms,
            raw_payload = EXCLUDED.raw_payload,
            updated_at = now()
        `, [
                trade.id,
                trade.buyerId,
                trade.sellerId,
                trade.itemId,
                Math.max(1, Math.trunc(Number(trade.quantity ?? 1))),
                normalizeUnitPrice(trade.unitPrice),
                Math.trunc(Number(trade.createdAt ?? Date.now())),
                JSON.stringify(trade),
            ]);
        }
    }
    /**
 * releasePoolReference：释放对共享连接池的引用，由 DatabasePoolProvider 统一关闭真正的连接池。
 * @returns 无返回值，直接更新连接池引用相关状态。
 */

    releasePoolReference() {
        this.pool = null;
        this.enabled = false;
    }
    /**
     * 按"双玩家最近 N 条 ∩ M 天保留期"窗口删除老旧 trade 行：
     * 同时满足"对买卖双方而言都已经不在最近 keepPerPlayer 条之内"和"created_at_ms < cutoff"的行才会被删除。
     * 单批最多删除 batchLimit 行，调用方按需循环以分批限速、降低锁冲突。
     */
    async pruneTradeHistoryByDualKeepWindow(input) {
        if (!this.pool || !this.enabled) {
            return 0;
        }
        const cutoffMs = Number.isFinite(Number(input?.cutoffMs))
            ? Math.max(0, Math.trunc(Number(input.cutoffMs)))
            : Date.now() - 7 * 24 * 60 * 60 * 1000;
        const keepPerPlayer = Math.max(
            1,
            Math.trunc(Number.isFinite(Number(input?.keepPerPlayer)) ? Number(input.keepPerPlayer) : 100),
        );
        const batchLimit = Math.max(
            1,
            Math.min(
                10_000,
                Math.trunc(Number.isFinite(Number(input?.batchLimit)) ? Number(input.batchLimit) : 500),
            ),
        );
        const result = await this.pool.query(
            `
              WITH ranked AS (
                SELECT
                  trade_id,
                  buyer_id,
                  seller_id,
                  created_at_ms,
                  ROW_NUMBER() OVER (
                    PARTITION BY buyer_id ORDER BY created_at_ms DESC, trade_id ASC
                  ) AS buyer_rank,
                  ROW_NUMBER() OVER (
                    PARTITION BY seller_id ORDER BY created_at_ms DESC, trade_id ASC
                  ) AS seller_rank
                FROM ${MARKET_TRADE_TABLE}
              ),
              candidate AS (
                SELECT trade_id
                FROM ranked
                WHERE created_at_ms < $1::bigint
                  AND buyer_rank > $2::bigint
                  AND seller_rank > $2::bigint
                ORDER BY created_at_ms ASC, trade_id ASC
                LIMIT $3::bigint
              )
              DELETE FROM ${MARKET_TRADE_TABLE}
              WHERE trade_id IN (SELECT trade_id FROM candidate)
            `,
            [cutoffMs, keepPerPlayer, batchLimit],
        );
        return Number.isFinite(Number(result?.rowCount)) ? Math.max(0, Math.trunc(Number(result.rowCount))) : 0;
    }
    /**
     * GM 控制台用：按玩家关键字（playerId 精确 / player_no 数字）与物品 ID 集合分页查询交易记录。
     * - playerIdMatches: 精确匹配 buyer_id 或 seller_id 的 playerId 列表
     * - itemIds: WHERE item_id = ANY，调用方负责通过 itemKeyword -> contentTemplateRepository 解析
     * - 没有任何条件时，按时间倒序返回最近一页
     */
    async queryTradeHistoryForGm(input) {
        if (!this.pool || !this.enabled) {
            return { items: [], total: 0 };
        }
        const page = Math.max(1, Math.trunc(Number(input?.page) > 0 ? Number(input.page) : 1));
        const pageSize = Math.max(
            1,
            Math.min(200, Math.trunc(Number(input?.pageSize) > 0 ? Number(input.pageSize) : 20)),
        );
        const playerIdMatches = Array.isArray(input?.playerIdMatches)
            ? input.playerIdMatches
                .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
                .filter((entry) => entry.length > 0)
            : [];
        const itemIds = Array.isArray(input?.itemIds)
            ? input.itemIds
                .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
                .filter((entry) => entry.length > 0)
            : [];
        const itemIdRequested = Array.isArray(input?.itemIds);
        // 调用方传了 itemIds 但解析后为空，意味着没有匹配的物品，直接空结果而不是退化为全表。
        if (itemIdRequested && itemIds.length === 0) {
            return { items: [], total: 0 };
        }
        const playerKeywordRequested = Array.isArray(input?.playerIdMatches);
        if (playerKeywordRequested && playerIdMatches.length === 0) {
            return { items: [], total: 0 };
        }
        const conditions = [];
        const values = [];
        let paramIndex = 1;
        if (playerIdMatches.length > 0) {
            conditions.push(`(buyer_id = ANY($${paramIndex}::varchar[]) OR seller_id = ANY($${paramIndex}::varchar[]))`);
            values.push(playerIdMatches);
            paramIndex += 1;
        }
        if (itemIds.length > 0) {
            conditions.push(`item_id = ANY($${paramIndex}::varchar[])`);
            values.push(itemIds);
            paramIndex += 1;
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const totalRes = await this.pool.query(
            `SELECT COUNT(*)::bigint AS total FROM ${MARKET_TRADE_TABLE} ${whereClause}`,
            values,
        );
        const total = Math.max(0, Math.trunc(Number(totalRes.rows?.[0]?.total ?? 0)));
        if (total === 0) {
            return { items: [], total };
        }
        const offset = (page - 1) * pageSize;
        const listValues = [...values, pageSize, offset];
        const listRes = await this.pool.query(
            `
              SELECT trade_id, buyer_id, seller_id, item_id, quantity, unit_price, created_at_ms, raw_payload
              FROM ${MARKET_TRADE_TABLE}
              ${whereClause}
              ORDER BY created_at_ms DESC, trade_id ASC
              LIMIT $${paramIndex}::bigint OFFSET $${paramIndex + 1}::bigint
            `,
            listValues,
        );
        const rows = listRes.rows ?? [];
        const items = rows.map((row) => normalizeGmTradeRow(row)).filter((entry) => Boolean(entry));
        return { items, total };
    }
}
/**
 * normalizeMarketOrder：规范化或转换坊市订单。
 * @param raw 参数说明。
 * @returns 无返回值，直接更新坊市订单相关状态。
 */

function normalizeMarketOrder(raw) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const candidate = raw;
    if (candidate.version !== 1
        || typeof candidate.id !== 'string'
        || typeof candidate.ownerId !== 'string'
        || (candidate.side !== 'buy' && candidate.side !== 'sell')
        || (candidate.status !== 'open' && candidate.status !== 'filled' && candidate.status !== 'cancelled')
        || typeof candidate.itemKey !== 'string'
        || !candidate.item
        || typeof candidate.item.itemId !== 'string') {
        return null;
    }
    return {
        version: 1,
        id: candidate.id,
        ownerId: candidate.ownerId,
        side: candidate.side,
        status: candidate.status,
        itemKey: candidate.itemKey,
        item: {
            ...candidate.item,
            count: 1,
        },
        remainingQuantity: Number.isFinite(candidate.remainingQuantity) ? Math.max(0, Math.trunc(Number(candidate.remainingQuantity ?? 0))) : 0,
        unitPrice: normalizeUnitPrice(candidate.unitPrice),
        createdAt: Number.isFinite(candidate.createdAt) ? Math.trunc(Number(candidate.createdAt ?? Date.now())) : Date.now(),
        updatedAt: Number.isFinite(candidate.updatedAt) ? Math.trunc(Number(candidate.updatedAt ?? Date.now())) : Date.now(),
        auction: normalizeAuctionPayload(candidate.auction),
    };
}
/** 规范化订单 raw_payload 中的拍卖状态。 */
function normalizeAuctionPayload(raw) {
    if (!raw || typeof raw !== 'object') {
        return undefined;
    }
    if (raw.mode !== 'auction') {
        return undefined;
    }
    const startAtMs = Number.isFinite(Number(raw.startAtMs)) ? Math.max(0, Math.trunc(Number(raw.startAtMs))) : 0;
    const normalDurationSeconds = Number.isFinite(Number(raw.normalDurationSeconds))
        ? Math.max(1, Math.trunc(Number(raw.normalDurationSeconds)))
        : 1;
    const normalEndAtMs = startAtMs + normalDurationSeconds * 1000;
    const endAtMs = Number.isFinite(Number(raw.endAtMs)) ? Math.max(normalEndAtMs, Math.trunc(Number(raw.endAtMs))) : normalEndAtMs;
    const maxEndAtMs = Number.isFinite(Number(raw.maxEndAtMs)) ? Math.max(endAtMs, Math.trunc(Number(raw.maxEndAtMs))) : endAtMs;
    const bids = Array.isArray(raw.bids)
        ? raw.bids.map((entry) => ({
            bidderId: typeof entry?.bidderId === 'string' ? entry.bidderId.trim() : '',
            bidderLabel: normalizePlayerLabelText(entry?.bidderLabel),
            unitPrice: normalizeUnitPrice(entry?.unitPrice),
            createdAt: Number.isFinite(Number(entry?.createdAt)) ? Math.max(0, Math.trunc(Number(entry.createdAt))) : Date.now(),
            reservedCost: Math.max(0, Math.trunc(Number(entry?.reservedCost ?? 0))),
        })).filter((entry) => entry.bidderId.length > 0)
        : [];
    bids.sort((left, right) => right.unitPrice - left.unitPrice || left.createdAt - right.createdAt || left.bidderId.localeCompare(right.bidderId));
    return {
        version: 1,
        mode: 'auction',
        buyoutPrice: normalizeAuctionBuyoutPrice(raw.buyoutPrice),
        startAtMs,
        normalDurationSeconds,
        endAtMs,
        maxEndAtMs,
        bids,
    };
}
function normalizeAuctionBuyoutPrice(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return null;
    }
    const normalized = normalizeUnitPrice(numericValue);
    return normalized && normalized > 0 ? normalized : null;
}
/**
 * normalizeTradeRecord：规范化或转换TradeRecord。
 * @param raw 参数说明。
 * @returns 无返回值，直接更新TradeRecord相关状态。
 */

function normalizeTradeRecord(raw) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const candidate = raw;
    if (candidate.version !== 1
        || typeof candidate.id !== 'string'
        || typeof candidate.buyerId !== 'string'
        || typeof candidate.sellerId !== 'string'
        || typeof candidate.itemId !== 'string') {
        return null;
    }
    return {
        version: 1,
        id: candidate.id,
        source: candidate.source === 'auction' ? 'auction' : 'market',
        buyerId: candidate.buyerId,
        sellerId: candidate.sellerId,
        buyerName: normalizePlayerLabelText(candidate.buyerName),
        sellerName: normalizePlayerLabelText(candidate.sellerName),
        itemId: candidate.itemId,
        quantity: Number.isFinite(candidate.quantity) ? Math.max(1, Math.trunc(Number(candidate.quantity ?? 1))) : 1,
        unitPrice: normalizeUnitPrice(candidate.unitPrice),
        createdAt: Number.isFinite(candidate.createdAt) ? Math.trunc(Number(candidate.createdAt ?? Date.now())) : Date.now(),
    };
}

function normalizePlayerLabelText(value) {
    const normalized = typeof value === 'string' ? value.trim().normalize('NFC') : '';
    return normalized.length > 0 ? normalized : null;
}
/**
 * normalizeGmTradeRow：把 server_market_trade_history 的 SQL 行规范化成 GM 控制台条目。
 * raw_payload 优先（携带 source 等字段），列字段兜底，缺关键值则丢弃。
 */

function normalizeGmTradeRow(row) {
    if (!row || typeof row !== 'object') {
        return null;
    }
    const tradeId = typeof row.trade_id === 'string' ? row.trade_id.trim() : '';
    const buyerId = typeof row.buyer_id === 'string' ? row.buyer_id.trim() : '';
    const sellerId = typeof row.seller_id === 'string' ? row.seller_id.trim() : '';
    const itemId = typeof row.item_id === 'string' ? row.item_id.trim() : '';
    if (!tradeId || !buyerId || !sellerId || !itemId) {
        return null;
    }
    const rawPayload = row.raw_payload && typeof row.raw_payload === 'object' ? row.raw_payload : null;
    const source = rawPayload && rawPayload.source === 'auction' ? 'auction' : 'market';
    const quantity = Math.max(1, Math.trunc(Number(row.quantity ?? rawPayload?.quantity ?? 1)));
    const unitPrice = normalizeUnitPrice(row.unit_price ?? rawPayload?.unitPrice);
    const createdAt = Math.max(0, Math.trunc(Number(row.created_at_ms ?? rawPayload?.createdAt ?? 0)));
    return {
        id: tradeId,
        source,
        buyerId,
        sellerId,
        itemId,
        quantity,
        unitPrice,
        createdAt,
    };
}
/**
 * normalizeUnitPrice：规范化或转换Unit价格。
 * @param value 参数说明。
 * @returns 无返回值，直接更新Unit价格相关状态。
 */

function normalizeUnitPrice(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const unitPrice = Number(value ?? 1);
    if (!isValidMarketPrice(unitPrice)) {
        return 1;
    }
    return unitPrice;
}
/**
 * normalizeStorage：规范化或转换Storage。
 * @param raw 参数说明。
 * @returns 无返回值，直接更新Storage相关状态。
 */

function normalizeStorage(raw) {

    const source = (typeof raw === 'object' && raw !== null ? raw : {});
    return {
        items: Array.isArray(source.items)
            ? source.items
                .filter((entry) => typeof entry === 'object'
                && entry !== null
                && typeof entry.itemId === 'string')
                .map((entry) => ({
                ...entry,
                count: Math.max(1, Math.trunc(Number(entry.count ?? 1))),
            }))
            : [],
    };
}

/**
 * ensureMarketTables：创建坊市订单、成交历史和玩家托管仓结构化表。
 * @param pool 参数说明。
 * @returns 无返回值，直接更新玩家市场托管仓结构化表相关状态。
 */
async function ensureMarketTables(pool) {
/**
 * 记录client。
 */
    const client = await pool.connect();
    try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS ${MARKET_ORDER_TABLE} (
            order_id varchar(160) PRIMARY KEY,
            owner_id varchar(100) NOT NULL,
            side varchar(16) NOT NULL,
            status varchar(24) NOT NULL,
            item_key varchar(240) NOT NULL,
            item_id varchar(160) NOT NULL,
            remaining_quantity bigint NOT NULL DEFAULT 0,
            unit_price numeric(20, 2) NOT NULL DEFAULT 1,
            created_at_ms bigint NOT NULL,
            updated_at_ms bigint NOT NULL,
            raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            updated_at timestamptz NOT NULL DEFAULT now()
          )
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS server_market_order_open_idx
          ON ${MARKET_ORDER_TABLE}(status, item_key, side, unit_price, created_at_ms)
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS server_market_order_owner_idx
          ON ${MARKET_ORDER_TABLE}(owner_id, status, updated_at_ms DESC)
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS ${MARKET_TRADE_TABLE} (
            trade_id varchar(160) PRIMARY KEY,
            buyer_id varchar(100) NOT NULL,
            seller_id varchar(100) NOT NULL,
            item_id varchar(160) NOT NULL,
            quantity bigint NOT NULL DEFAULT 1,
            unit_price numeric(20, 2) NOT NULL DEFAULT 1,
            created_at_ms bigint NOT NULL,
            raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            updated_at timestamptz NOT NULL DEFAULT now()
          )
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS server_market_trade_created_idx
          ON ${MARKET_TRADE_TABLE}(created_at_ms DESC, trade_id ASC)
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS server_market_trade_party_idx
          ON ${MARKET_TRADE_TABLE}(buyer_id, seller_id, created_at_ms DESC)
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS server_market_trade_buyer_created_idx
          ON ${MARKET_TRADE_TABLE}(buyer_id, created_at_ms DESC)
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS server_market_trade_seller_created_idx
          ON ${MARKET_TRADE_TABLE}(seller_id, created_at_ms DESC)
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS ${PLAYER_MARKET_STORAGE_ITEM_TABLE} (
            storage_item_id varchar(160) PRIMARY KEY,
            player_id varchar(100) NOT NULL,
            slot_index bigint NOT NULL,
            item_id varchar(160) NOT NULL,
            count bigint NOT NULL DEFAULT 1,
            enhance_level bigint,
            raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            updated_at timestamptz NOT NULL DEFAULT now()
          )
        `);
        await ensureBigintColumnType(client, PLAYER_MARKET_STORAGE_ITEM_TABLE, 'slot_index');
        await ensureBigintColumnType(client, PLAYER_MARKET_STORAGE_ITEM_TABLE, 'count');
        await ensureBigintColumnType(client, PLAYER_MARKET_STORAGE_ITEM_TABLE, 'enhance_level');
        await client.query(`
          CREATE INDEX IF NOT EXISTS player_market_storage_item_player_idx
          ON ${PLAYER_MARKET_STORAGE_ITEM_TABLE}(player_id, slot_index ASC)
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS player_market_storage_item_item_idx
          ON ${PLAYER_MARKET_STORAGE_ITEM_TABLE}(item_id, player_id ASC)
        `);
    }
    finally {
        client.release();
    }
}

/**
 * upsertMarketStorageWatermarks：推进市场仓域的恢复水位。
 * @param client 数据库事务客户端。
 * @param playerIds 受影响的玩家列表。
 * @returns 无返回值，直接更新 market_storage_version。
 */
async function upsertMarketStorageWatermarks(client, playerIds) {
/**
 * 记录normalizedplayerids。
 */
    const normalizedPlayerIds = playerIds
        .map((entry) => typeof entry === 'string' ? entry.trim() : '')
        .filter((entry, index, list) => entry.length > 0 && list.indexOf(entry) === index);
    if (normalizedPlayerIds.length === 0) {
        return;
    }
/**
 * 记录versionseed。
 */
    const versionSeed = Date.now();
    const placeholders = normalizedPlayerIds.map((_, index) => `($${index + 1}, $${normalizedPlayerIds.length + index + 1}, now())`);
    await client.query(`
      INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(
        player_id,
        market_storage_version,
        updated_at
      )
      VALUES ${placeholders.join(',\n')}
      ON CONFLICT (player_id)
      DO UPDATE SET
        market_storage_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.market_storage_version, EXCLUDED.market_storage_version),
        updated_at = now()
    `, [
        ...normalizedPlayerIds,
        ...normalizedPlayerIds.map((_, index) => versionSeed + index),
    ]);
}

/**
 * buildMarketStorageItemId：构建市场仓行主键。
 * @param playerId 玩家 ID。
 * @param slotIndex 槽位索引。
 * @returns 返回市场仓行主键。
 */
function buildMarketStorageItemId(playerId, slotIndex) {
    return `market_storage:${playerId}:${Math.max(0, Math.trunc(Number(slotIndex ?? 0)))}`;
}

/**
 * normalizeEnhanceLevel：规范化强化等级。
 * @param item 参数说明。
 * @returns 无返回值，直接更新强化等级相关状态。
 */
function normalizeEnhanceLevel(item) {
/**
 * 记录candidates。
 */
    const candidates = [item?.enhanceLevel, item?.enhancementLevel, item?.level];
    for (const value of candidates) {
        if (value == null || value === '') {
            continue;
        }
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
            return Math.max(0, Math.trunc(numeric));
        }
    }
    return null;
}

/**
 * normalizeStructuredStorageItem：规范化结构化Storage道具。
 * @param row 参数说明。
 * @returns 无返回值，直接更新结构化Storage道具相关状态。
 */
function normalizeStructuredStorageItem(row) {
/**
 * 记录rawPayload。
 */
    const rawPayload = typeof row?.raw_payload === 'object' && row.raw_payload !== null ? row.raw_payload : null;
/**
 * 记录itemId。
 */
    const itemId = typeof rawPayload?.itemId === 'string'
        ? rawPayload.itemId
        : (typeof row?.item_id === 'string' ? row.item_id : 'unknown_item');
/**
 * 记录count。
 */
    const count = Math.max(1, Math.trunc(Number(rawPayload?.count ?? row?.count ?? 1)));
    return rawPayload
        ? {
            ...rawPayload,
            itemId,
            count,
        }
        : {
            itemId,
            count,
            enhanceLevel: normalizeEnhanceLevel(row),
        };
}
