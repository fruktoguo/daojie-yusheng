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
const shared_1 = require("@mud/shared-next");
const persistent_document_table_1 = require("./persistent-document-table");
const env_alias_1 = require("../config/env-alias");
const MARKET_ORDER_SCOPE = 'server_next_market_orders_v1';
const MARKET_TRADE_SCOPE = 'server_next_market_trade_history_v1';
const MARKET_STORAGE_SCOPE = 'server_next_market_storage_v1';
let MarketPersistenceService = MarketPersistenceService_1 = class MarketPersistenceService {
    logger = new common_1.Logger(MarketPersistenceService_1.name);
    pool = null;
    enabled = false;
    async onModuleInit() {
        const databaseUrl = (0, env_alias_1.resolveServerNextDatabaseUrl)();
        if (!databaseUrl.trim()) {
            this.logger.log('Market persistence disabled: no SERVER_NEXT_DATABASE_URL/DATABASE_URL');
            return;
        }
        this.pool = new pg_1.Pool({
            connectionString: databaseUrl,
        });
        try {
            await (0, persistent_document_table_1.ensurePersistentDocumentsTable)(this.pool);
            this.enabled = true;
            this.logger.log('Market persistence enabled via persistent_documents');
        }
        catch (error) {
            this.logger.error('Market persistence init failed, fallback to disabled mode', error instanceof Error ? error.stack : String(error));
            await this.safeClosePool();
        }
    }
    async onModuleDestroy() {
        await this.safeClosePool();
    }
    isEnabled() {
        return this.enabled && this.pool !== null;
    }
    async loadOpenOrders() {
        const rows = await this.loadScopeRows(MARKET_ORDER_SCOPE);
        return rows
            .map((row) => normalizeMarketOrder(row.payload))
            .filter((entry) => Boolean(entry))
            .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
    }
    async loadTradeHistory() {
        const rows = await this.loadScopeRows(MARKET_TRADE_SCOPE);
        return rows
            .map((row) => normalizeTradeRecord(row.payload))
            .filter((entry) => Boolean(entry))
            .sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id));
    }
    async loadStorages() {
        const rows = await this.loadScopeRows(MARKET_STORAGE_SCOPE);
        return rows
            .map((row) => ({
            playerId: row.key,
            storage: normalizeStorage(row.payload),
        }))
            .filter((entry) => entry.playerId.trim().length > 0 && entry.storage.items.length > 0)
            .sort((left, right) => left.playerId.localeCompare(right.playerId, 'zh-Hans-CN'));
    }
    async persistMutation(input) {
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
    async loadScopeRows(scope) {
        if (!this.pool || !this.enabled) {
            return [];
        }
        const result = await this.pool.query('SELECT key, payload FROM persistent_documents WHERE scope = $1', [scope]);
        return result.rows;
    }
    async persistOrders(client, upserts, deletions) {
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
    async persistStorages(client, upserts, deletions) {
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
    async safeClosePool() {
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
function normalizeMarketOrder(raw) {
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
function normalizeTradeRecord(raw) {
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
function normalizeUnitPrice(value) {
    const unitPrice = Number(value ?? 1);
    if (!(0, shared_1.isValidMarketPrice)(unitPrice)) {
        return 1;
    }
    return unitPrice;
}
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
//# sourceMappingURL=market-persistence.service.js.map
