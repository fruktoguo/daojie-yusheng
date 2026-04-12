"use strict";
/** __decorate：定义该变量以承载业务值。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** MarketPersistenceService_1：定义该变量以承载业务值。 */
var MarketPersistenceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketPersistenceService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** pg_1：定义该变量以承载业务值。 */
const pg_1 = require("pg");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** persistent_document_table_1：定义该变量以承载业务值。 */
const persistent_document_table_1 = require("./persistent-document-table");
/** env_alias_1：定义该变量以承载业务值。 */
const env_alias_1 = require("../config/env-alias");
/** MARKET_ORDER_SCOPE：定义该变量以承载业务值。 */
const MARKET_ORDER_SCOPE = 'server_next_market_orders_v1';
/** MARKET_TRADE_SCOPE：定义该变量以承载业务值。 */
const MARKET_TRADE_SCOPE = 'server_next_market_trade_history_v1';
/** MARKET_STORAGE_SCOPE：定义该变量以承载业务值。 */
const MARKET_STORAGE_SCOPE = 'server_next_market_storage_v1';
/** MarketPersistenceService：定义该变量以承载业务值。 */
let MarketPersistenceService = MarketPersistenceService_1 = class MarketPersistenceService {
    logger = new common_1.Logger(MarketPersistenceService_1.name);
    pool = null;
    enabled = false;
/** onModuleInit：执行对应的业务逻辑。 */
    async onModuleInit() {
/** databaseUrl：定义该变量以承载业务值。 */
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
/** onModuleDestroy：执行对应的业务逻辑。 */
    async onModuleDestroy() {
        await this.safeClosePool();
    }
/** isEnabled：执行对应的业务逻辑。 */
    isEnabled() {
        return this.enabled && this.pool !== null;
    }
/** loadOpenOrders：执行对应的业务逻辑。 */
    async loadOpenOrders() {
/** rows：定义该变量以承载业务值。 */
        const rows = await this.loadScopeRows(MARKET_ORDER_SCOPE);
        return rows
            .map((row) => normalizeMarketOrder(row.payload))
            .filter((entry) => Boolean(entry))
            .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
    }
/** loadTradeHistory：执行对应的业务逻辑。 */
    async loadTradeHistory() {
/** rows：定义该变量以承载业务值。 */
        const rows = await this.loadScopeRows(MARKET_TRADE_SCOPE);
        return rows
            .map((row) => normalizeTradeRecord(row.payload))
            .filter((entry) => Boolean(entry))
            .sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id));
    }
/** loadStorages：执行对应的业务逻辑。 */
    async loadStorages() {
/** rows：定义该变量以承载业务值。 */
        const rows = await this.loadScopeRows(MARKET_STORAGE_SCOPE);
        return rows
            .map((row) => ({
            playerId: row.key,
            storage: normalizeStorage(row.payload),
        }))
            .filter((entry) => entry.playerId.trim().length > 0 && entry.storage.items.length > 0)
            .sort((left, right) => left.playerId.localeCompare(right.playerId, 'zh-Hans-CN'));
    }
/** persistMutation：执行对应的业务逻辑。 */
    async persistMutation(input) {
        if (!this.pool || !this.enabled) {
            return;
        }
/** client：定义该变量以承载业务值。 */
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
/** loadScopeRows：执行对应的业务逻辑。 */
    async loadScopeRows(scope) {
        if (!this.pool || !this.enabled) {
            return [];
        }
/** result：定义该变量以承载业务值。 */
        const result = await this.pool.query('SELECT key, payload FROM persistent_documents WHERE scope = $1', [scope]);
        return result.rows;
    }
/** persistOrders：执行对应的业务逻辑。 */
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
/** persistStorages：执行对应的业务逻辑。 */
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
/** persistTrades：执行对应的业务逻辑。 */
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
/** safeClosePool：执行对应的业务逻辑。 */
    async safeClosePool() {
/** pool：定义该变量以承载业务值。 */
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
/** normalizeMarketOrder：执行对应的业务逻辑。 */
function normalizeMarketOrder(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
/** candidate：定义该变量以承载业务值。 */
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
/** normalizeTradeRecord：执行对应的业务逻辑。 */
function normalizeTradeRecord(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
/** candidate：定义该变量以承载业务值。 */
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
/** normalizeUnitPrice：执行对应的业务逻辑。 */
function normalizeUnitPrice(value) {
/** unitPrice：定义该变量以承载业务值。 */
    const unitPrice = Number(value ?? 1);
    if (!(0, shared_1.isValidMarketPrice)(unitPrice)) {
        return 1;
    }
    return unitPrice;
}
/** normalizeStorage：执行对应的业务逻辑。 */
function normalizeStorage(raw) {
/** source：定义该变量以承载业务值。 */
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
