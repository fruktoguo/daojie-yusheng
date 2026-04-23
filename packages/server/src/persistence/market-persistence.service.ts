// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var MarketPersistenceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketPersistenceService = void 0;

const common_1 = require("@nestjs/common");

const pg_1 = require("pg");

const shared_1 = require("@mud/shared");

const persistent_document_table_1 = require("./persistent-document-table");

const env_alias_1 = require("../config/env-alias");

const MARKET_ORDER_SCOPE = 'server_market_orders_v1';
const LEGACY_MARKET_ORDER_SCOPE = 'server_next_market_orders_v1';

const MARKET_TRADE_SCOPE = 'server_market_trade_history_v1';
const LEGACY_MARKET_TRADE_SCOPE = 'server_next_market_trade_history_v1';

const MARKET_STORAGE_SCOPE = 'server_market_storage_v1';
const LEGACY_MARKET_STORAGE_SCOPE = 'server_next_market_storage_v1';

const PLAYER_MARKET_STORAGE_ITEM_TABLE = 'player_market_storage_item';
const PLAYER_RECOVERY_WATERMARK_TABLE = 'player_recovery_watermark';

/** 坊市持久化服务：管理订单、交易历史和仓库数据的持久化一致性。 */
let MarketPersistenceService = MarketPersistenceService_1 = class MarketPersistenceService {
/**
 * logger：日志器引用。
 */

    logger = new common_1.Logger(MarketPersistenceService_1.name);
    /**
 * pool：缓存或索引容器。
 */

    pool = null;
    /**
 * enabled：启用开关或状态标识。
 */

    enabled = false;
    /**
 * onModuleInit：执行on模块Init相关逻辑。
 * @returns 无返回值，直接更新on模块Init相关状态。
 */

    async onModuleInit() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const databaseUrl = (0, env_alias_1.resolveServerDatabaseUrl)();
        if (!databaseUrl.trim()) {
            this.logger.log('坊市持久化已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
            return;
        }
        this.pool = new pg_1.Pool({
            connectionString: databaseUrl,
        });
        try {
            await (0, persistent_document_table_1.ensurePersistentDocumentsTable)(this.pool);
            await ensurePlayerMarketStorageItemTable(this.pool);
            this.enabled = true;
            this.logger.log('坊市持久化已启用（player_market_storage_item + persistent_documents compat）');
        }
        catch (error) {
            this.logger.error('坊市持久化初始化失败，已回退为禁用模式', error instanceof Error ? error.stack : String(error));
            await this.safeClosePool();
        }
    }
    /**
 * onModuleDestroy：执行on模块Destroy相关逻辑。
 * @returns 无返回值，直接更新on模块Destroy相关状态。
 */

    async onModuleDestroy() {
        await this.safeClosePool();
    }

    /** 检查数据库可用性，用于上游交易流程决定是否执行持久化。 */
    isEnabled() {
        return this.enabled && this.pool !== null;
    }

    /** 加载活跃订单列表，按创建时间+ID排序。 */
    async loadOpenOrders() {

        const rows = await this.loadCompatScopeRows([MARKET_ORDER_SCOPE, LEGACY_MARKET_ORDER_SCOPE]);
        return rows
            .map((row) => normalizeMarketOrder(row.payload))
            .filter((entry) => Boolean(entry))
            .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
    }
    /**
 * loadTradeHistory：读取Trade历史并返回结果。
 * @returns 无返回值，完成TradeHistory的读取/组装。
 */

    async loadTradeHistory() {

        const rows = await this.loadCompatScopeRows([MARKET_TRADE_SCOPE, LEGACY_MARKET_TRADE_SCOPE]);
        return rows
            .map((row) => normalizeTradeRecord(row.payload))
            .filter((entry) => Boolean(entry))
            .sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id));
    }
    /**
 * loadStorages：读取Storage并返回结果。
 * @returns 无返回值，完成Storage的读取/组装。
 */

    async loadStorages() {
        const structuredStorages = await this.loadStructuredStorages();
        if (structuredStorages.length > 0) {
            return structuredStorages;
        }

        const rows = await this.loadCompatScopeRows([MARKET_STORAGE_SCOPE, LEGACY_MARKET_STORAGE_SCOPE]);
        return rows
            .map((row) => ({
            playerId: row.key,
            storage: normalizeStorage(row.payload),
        }))
            .filter((entry) => entry.playerId.trim().length > 0 && entry.storage.items.length > 0)
            .sort((left, right) => left.playerId.localeCompare(right.playerId, 'zh-Hans-CN'));
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
    async loadScopeRows(scope) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.pool || !this.enabled) {
            return [];
        }

        const result = await this.pool.query('SELECT key, payload FROM persistent_documents WHERE scope = $1', [scope]);
        return result.rows;
    }
    /**
 * loadCompatScopeRows：按 scope 优先级回读兼容持久化文档，并按 key 去重。
 * @param scopes 参数说明。
 * @returns 无返回值，完成兼容Scope文档的读取/组装。
 */

    async loadCompatScopeRows(scopes) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const merged = new Map();
        for (const scope of Array.isArray(scopes) ? scopes : []) {
            const normalizedScope = typeof scope === 'string' ? scope.trim() : '';
            if (!normalizedScope) {
                continue;
            }
            const rows = await this.loadScopeRows(normalizedScope);
            for (const row of rows) {
                const key = typeof row?.key === 'string' ? row.key : '';
                if (!key || merged.has(key)) {
                    continue;
                }
                merged.set(key, row);
            }
        }
        return Array.from(merged.values());
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
          INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
          VALUES ($1, $2, $3::jsonb, now())
          ON CONFLICT (scope, key)
          DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
        `, [MARKET_ORDER_SCOPE, order.id, JSON.stringify(order)]);
        }
        if (deletions.length > 0) {
            await client.query('DELETE FROM persistent_documents WHERE scope = $1 AND key = ANY($2::varchar[])', [MARKET_ORDER_SCOPE, deletions]);
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

        for (const entry of upserts) {
            await client.query(`
          INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
          VALUES ($1, $2, $3::jsonb, now())
          ON CONFLICT (scope, key)
          DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
        `, [MARKET_STORAGE_SCOPE, entry.playerId, JSON.stringify(entry.storage)]);
        }
        if (deletions.length > 0) {
            await client.query('DELETE FROM persistent_documents WHERE scope = $1 AND key = ANY($2::varchar[])', [MARKET_STORAGE_SCOPE, deletions]);
        }
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
        if (upsertPlayerIds.length > 0) {
            await client.query(`DELETE FROM ${PLAYER_MARKET_STORAGE_ITEM_TABLE} WHERE player_id = ANY($1::varchar[])`, [upsertPlayerIds]);
        }
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
          INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
          VALUES ($1, $2, $3::jsonb, now())
          ON CONFLICT (scope, key)
          DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
        `, [MARKET_TRADE_SCOPE, trade.id, JSON.stringify(trade)]);
        }
    }
    /**
 * safeClosePool：执行safeClosePool相关逻辑。
 * @returns 无返回值，直接更新safeClosePool相关状态。
 */

    async safeClosePool() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const pool = this.pool;
        this.pool = null;
        this.enabled = false;
        if (pool) {
            await pool.end().catch(() => undefined);
        }
    }
};
exports.MarketPersistenceService = MarketPersistenceService;
exports.MarketPersistenceService = MarketPersistenceService = MarketPersistenceService_1 = __decorate([
    (0, common_1.Injectable)()
], MarketPersistenceService);
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
    };
}
export { MarketPersistenceService };
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
        buyerId: candidate.buyerId,
        sellerId: candidate.sellerId,
        itemId: candidate.itemId,
        quantity: Number.isFinite(candidate.quantity) ? Math.max(1, Math.trunc(Number(candidate.quantity ?? 1))) : 1,
        unitPrice: normalizeUnitPrice(candidate.unitPrice),
        createdAt: Number.isFinite(candidate.createdAt) ? Math.trunc(Number(candidate.createdAt ?? Date.now())) : Date.now(),
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
    if (!(0, shared_1.isValidMarketPrice)(unitPrice)) {
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
 * ensurePlayerMarketStorageItemTable：创建玩家市场托管仓结构化表。
 * @param pool 参数说明。
 * @returns 无返回值，直接更新玩家市场托管仓结构化表相关状态。
 */
async function ensurePlayerMarketStorageItemTable(pool) {
/**
 * 记录client。
 */
    const client = await pool.connect();
    try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS ${PLAYER_MARKET_STORAGE_ITEM_TABLE} (
            storage_item_id varchar(160) PRIMARY KEY,
            player_id varchar(100) NOT NULL,
            slot_index integer NOT NULL,
            item_id varchar(160) NOT NULL,
            count integer NOT NULL DEFAULT 1,
            enhance_level integer,
            raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            updated_at timestamptz NOT NULL DEFAULT now()
          )
        `);
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
        if (Number.isFinite(value)) {
            return Math.max(0, Math.trunc(Number(value)));
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
//# sourceMappingURL=market-persistence.service.js.map
