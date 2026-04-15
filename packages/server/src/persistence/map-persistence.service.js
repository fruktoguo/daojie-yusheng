"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var MapPersistenceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapPersistenceService = void 0;

const common_1 = require("@nestjs/common");

const pg_1 = require("pg");

const persistent_document_table_1 = require("./persistent-document-table");

const env_alias_1 = require("../config/env-alias");

const MAP_SNAPSHOT_SCOPE = 'server_next_map_aura_v1';

/** 地图快照持久化服务：保存/读取地图环境快照并进行脏数据规整。 */
let MapPersistenceService = MapPersistenceService_1 = class MapPersistenceService {
    logger = new common_1.Logger(MapPersistenceService_1.name);
    pool = null;
    enabled = false;
    async onModuleInit() {

        const databaseUrl = (0, env_alias_1.resolveServerNextDatabaseUrl)();
        if (!databaseUrl.trim()) {
            return;
        }
        this.pool = new pg_1.Pool({
            connectionString: databaseUrl,
        });
        try {
            await (0, persistent_document_table_1.ensurePersistentDocumentsTable)(this.pool);
            this.enabled = true;
            this.logger.log('地图持久化已启用（persistent_documents）');
        }
        catch (error) {
            this.logger.error('地图持久化初始化失败，已回退为禁用模式', error instanceof Error ? error.stack : String(error));
            await this.safeClosePool();
        }
    }
    async onModuleDestroy() {
        await this.safeClosePool();
    }
    /** 判断数据库后端是否可用。 */
    isEnabled() {
        return this.enabled && this.pool !== null;
    }

    /** 按实例 ID 加载地图快照；无记录返回 null。 */
    async loadMapSnapshot(instanceId) {
        if (!this.pool || !this.enabled) {
            return null;
        }

        const result = await this.pool.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2', [MAP_SNAPSHOT_SCOPE, instanceId]);
        if (result.rowCount === 0) {
            return null;
        }
        return normalizeMapSnapshot(result.rows[0]?.payload);
    }
    async saveMapSnapshot(instanceId, snapshot) {
        if (!this.pool || !this.enabled) {
            return;
        }
        await this.pool.query(`
        INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
        VALUES ($1, $2, $3::jsonb, now())
        ON CONFLICT (scope, key)
        DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
      `, [MAP_SNAPSHOT_SCOPE, instanceId, JSON.stringify(snapshot)]);
    }

    /** 关闭池并释放连接，持久化失败会进入不可用态。 */
    async safeClosePool() {

        const pool = this.pool;
        this.pool = null;
        this.enabled = false;
        if (pool) {
            await pool.end().catch(() => undefined);
        }
    }
};
exports.MapPersistenceService = MapPersistenceService;
exports.MapPersistenceService = MapPersistenceService = MapPersistenceService_1 = __decorate([
    (0, common_1.Injectable)()
], MapPersistenceService);

/** 清洗并标准化地图快照，过滤无效容器/道具条目。 */
function normalizeMapSnapshot(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const snapshot = raw;
    if (snapshot.version !== 1 || typeof snapshot.templateId !== 'string') {
        return null;
    }
    return {
        version: 1,

        savedAt: typeof snapshot.savedAt === 'number' && Number.isFinite(snapshot.savedAt) ? Math.trunc(snapshot.savedAt) : Date.now(),
        templateId: snapshot.templateId,
        auraEntries: Array.isArray(snapshot.auraEntries)
            ? snapshot.auraEntries
                .filter((entry) => Boolean(entry)
                && typeof entry === 'object'
                && Number.isFinite(entry.tileIndex)
                && Number.isFinite(entry.value))
                .map((entry) => ({
                tileIndex: Math.trunc(entry.tileIndex),
                value: Math.max(0, Math.trunc(entry.value)),
            }))
            : [],
        groundPileEntries: Array.isArray(snapshot.groundPileEntries)
            ? snapshot.groundPileEntries
                .filter((entry) => Boolean(entry)
                && typeof entry === 'object'
                && Number.isFinite(entry.tileIndex)
                && Array.isArray(entry.items))
                .map((entry) => ({
                tileIndex: Math.trunc(entry.tileIndex),
                items: entry.items
                    .map((item) => normalizePersistedGroundItem(item))
                    .filter((item) => Boolean(item)),
            }))
                .filter((entry) => entry.items.length > 0)
            : [],
        containerStates: Array.isArray(snapshot.containerStates)
            ? snapshot.containerStates
                .map((entry) => normalizeContainerState(entry))
                .filter((entry) => Boolean(entry))
            : [],
    };
}
function normalizeContainerState(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const state = raw;

    const sourceId = typeof state.sourceId === 'string' ? state.sourceId.trim() : '';

    const containerId = typeof state.containerId === 'string' ? state.containerId.trim() : '';
    if (!sourceId || !containerId || !Array.isArray(state.entries)) {
        return null;
    }

    const entries = state.entries
        .map((entry) => normalizeContainerItemEntry(entry))
        .filter((entry) => Boolean(entry));

    const activeSearch = normalizeContainerSearchState(state.activeSearch);
    return {
        sourceId,
        containerId,

        generatedAtTick: typeof state.generatedAtTick === 'number' && Number.isFinite(state.generatedAtTick)
            ? Math.max(0, Math.trunc(state.generatedAtTick))
            : undefined,

        refreshAtTick: typeof state.refreshAtTick === 'number' && Number.isFinite(state.refreshAtTick)
            ? Math.max(0, Math.trunc(state.refreshAtTick))
            : undefined,
        entries,
        activeSearch,
    };
}
function normalizeContainerItemEntry(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const entry = raw;

    const item = normalizePersistedGroundItem(entry.item);
    if (!item) {
        return null;
    }
    return {
        item,

        createdTick: typeof entry.createdTick === 'number' && Number.isFinite(entry.createdTick)
            ? Math.max(0, Math.trunc(entry.createdTick))
            : 0,

        visible: entry.visible === true,
    };
}
function normalizeContainerSearchState(raw) {
    if (!raw || typeof raw !== 'object') {
        return undefined;
    }

    const search = raw;

    const itemKey = typeof search.itemKey === 'string' ? search.itemKey.trim() : '';
    if (!itemKey) {
        return undefined;
    }

    const totalTicks = typeof search.totalTicks === 'number' && Number.isFinite(search.totalTicks)
        ? Math.max(1, Math.trunc(search.totalTicks))
        : 1;

    const remainingTicks = typeof search.remainingTicks === 'number' && Number.isFinite(search.remainingTicks)
        ? Math.max(0, Math.min(totalTicks, Math.trunc(search.remainingTicks)))
        : totalTicks;
    if (remainingTicks <= 0) {
        return undefined;
    }
    return {
        itemKey,
        totalTicks,
        remainingTicks,
    };
}
function normalizePersistedGroundItem(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const item = raw;
    if (typeof item.itemId !== 'string' || !item.itemId.trim()) {
        return null;
    }
    return {
        ...item,
        itemId: item.itemId.trim(),

        count: typeof item.count === 'number' && Number.isFinite(item.count)
            ? Math.max(1, Math.trunc(item.count))
            : 1,
    };
}
//# sourceMappingURL=map-persistence.service.js.map


