// @ts-nocheck
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
const shared_1 = require("@mud/shared");

const pg_1 = require("pg");

const persistent_document_table_1 = require("./persistent-document-table");

const env_alias_1 = require("../config/env-alias");

const MAP_SNAPSHOT_SCOPE = 'server_map_aura_v1';
const DEFAULT_TILE_AURA_RESOURCE_KEY = (0, shared_1.buildQiResourceKey)(shared_1.DEFAULT_QI_RESOURCE_DESCRIPTOR);

/** 地图快照持久化服务：保存/读取地图环境快照并进行脏数据规整。 */
let MapPersistenceService = MapPersistenceService_1 = class MapPersistenceService {
/**
 * logger：日志器引用。
 */

    logger = new common_1.Logger(MapPersistenceService_1.name);    
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
    /**
 * onModuleDestroy：执行on模块Destroy相关逻辑。
 * @returns 无返回值，直接更新on模块Destroy相关状态。
 */

    async onModuleDestroy() {
        await this.safeClosePool();
    }
    /** 判断数据库后端是否可用。 */
    isEnabled() {
        return this.enabled && this.pool !== null;
    }

    /** 按实例 ID 加载地图快照；无记录返回 null。 */
    async loadMapSnapshot(instanceId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.pool || !this.enabled) {
            return null;
        }

        const result = await this.pool.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2', [MAP_SNAPSHOT_SCOPE, instanceId]);
        if (result.rowCount === 0) {
            return null;
        }
        return normalizeMapSnapshot(result.rows[0]?.payload);
    }    
    /**
 * saveMapSnapshot：执行save地图快照相关逻辑。
 * @param instanceId instance ID。
 * @param snapshot 参数说明。
 * @returns 无返回值，直接更新save地图快照相关状态。
 */

    async saveMapSnapshot(instanceId, snapshot) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const snapshot = raw;
    if (snapshot.version !== 1 || typeof snapshot.templateId !== 'string') {
        return null;
    }
    const normalizedAuraEntries = Array.isArray(snapshot.auraEntries)
        ? snapshot.auraEntries
            .filter((entry) => Boolean(entry)
            && typeof entry === 'object'
            && Number.isFinite(entry.tileIndex)
            && Number.isFinite(entry.value))
            .map((entry) => ({
            tileIndex: Math.trunc(entry.tileIndex),
            value: Math.max(0, Math.trunc(entry.value)),
        }))
        : [];
    const normalizedTileResourceEntries = normalizeTileResourceEntries(snapshot.tileResourceEntries, snapshot.auraEntries);
    return {
        version: 1,

        savedAt: typeof snapshot.savedAt === 'number' && Number.isFinite(snapshot.savedAt) ? Math.trunc(snapshot.savedAt) : Date.now(),
        templateId: snapshot.templateId,
        tick: Number.isFinite(Number(snapshot.tick)) ? Math.max(0, Math.trunc(Number(snapshot.tick))) : 0,
        persistenceRevision: Number.isFinite(Number(snapshot.persistenceRevision)) ? Math.max(0, Math.trunc(Number(snapshot.persistenceRevision))) : undefined,
        runtimeTileEntries: Array.isArray(snapshot.runtimeTileEntries)
            ? snapshot.runtimeTileEntries
                .map((entry) => normalizeRuntimeTileEntry(entry))
                .filter((entry) => Boolean(entry))
            : [],
        auraEntries: normalizedAuraEntries.length > 0
            ? normalizedAuraEntries
            : normalizedTileResourceEntries
                .filter((entry) => entry.resourceKey === DEFAULT_TILE_AURA_RESOURCE_KEY)
                .map((entry) => ({
                tileIndex: entry.tileIndex,
                value: entry.value,
            })),
        tileResourceEntries: normalizedTileResourceEntries,
        tileDamageEntries: Array.isArray(snapshot.tileDamageEntries)
            ? snapshot.tileDamageEntries
                .map((entry) => normalizeTileDamageEntry(entry))
                .filter((entry) => Boolean(entry))
            : [],
        temporaryTileEntries: Array.isArray(snapshot.temporaryTileEntries)
            ? snapshot.temporaryTileEntries
                .map((entry) => normalizeTemporaryTileEntry(entry))
                .filter((entry) => Boolean(entry))
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
function normalizeRuntimeTileEntry(raw) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!raw || typeof raw !== 'object' || !Number.isFinite(Number(raw.x)) || !Number.isFinite(Number(raw.y))) {
        return null;
    }
    const tileType = typeof raw.tileType === 'string' && raw.tileType.trim().length > 0
        ? raw.tileType.trim()
        : '';
    if (!tileType) {
        return null;
    }
    return {
        x: Math.trunc(Number(raw.x)),
        y: Math.trunc(Number(raw.y)),
        tileType,
    };
}
/** normalizeTileResourceEntries：规范化或转换地块资源持久化条目。 */
function normalizeTileResourceEntries(rawTileResourceEntries, rawAuraEntries) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (Array.isArray(rawTileResourceEntries)) {
        return rawTileResourceEntries
            .filter((entry) => Boolean(entry)
            && typeof entry === 'object'
            && typeof entry.resourceKey === 'string'
            && entry.resourceKey.trim().length > 0
            && Number.isFinite(entry.tileIndex)
            && Number.isFinite(entry.value))
            .map((entry) => ({
            resourceKey: entry.resourceKey.trim(),
            tileIndex: Math.trunc(entry.tileIndex),
            value: Math.max(0, Math.trunc(entry.value)),
        }))
            .filter((entry) => entry.value > 0 || entry.resourceKey === DEFAULT_TILE_AURA_RESOURCE_KEY);
    }
    if (!Array.isArray(rawAuraEntries)) {
        return [];
    }
    return rawAuraEntries
        .filter((entry) => Boolean(entry)
        && typeof entry === 'object'
        && Number.isFinite(entry.tileIndex)
        && Number.isFinite(entry.value))
        .map((entry) => ({
        resourceKey: DEFAULT_TILE_AURA_RESOURCE_KEY,
        tileIndex: Math.trunc(entry.tileIndex),
        value: Math.max(0, Math.trunc(entry.value)),
    }));
}
/** normalizeTileDamageEntry：规范化可破坏地块持久化条目。 */
function normalizeTileDamageEntry(raw) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!raw || typeof raw !== 'object' || !Number.isFinite(Number(raw.tileIndex))) {
        return null;
    }
    const tileIndex = Math.trunc(Number(raw.tileIndex));
    if (tileIndex < 0) {
        return null;
    }
    const destroyed = raw.destroyed === true;
    const maxHp = Math.max(1, Math.trunc(Number(raw.maxHp) || 1));
    const hp = destroyed
        ? 0
        : Math.max(0, Math.min(maxHp, Math.trunc(Number(raw.hp) || maxHp)));
    if (!destroyed && hp >= maxHp) {
        return null;
    }
    return {
        tileIndex,
        hp,
        maxHp,
        destroyed,
        respawnLeft: destroyed ? Math.max(0, Math.trunc(Number(raw.respawnLeft) || 0)) : 0,
        modifiedAt: Number.isFinite(Number(raw.modifiedAt)) ? Math.max(0, Math.trunc(Number(raw.modifiedAt))) : 0,
    };
}
/** normalizeTemporaryTileEntry：规范化技能生成临时地块持久化条目。 */
function normalizeTemporaryTileEntry(raw) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!raw || typeof raw !== 'object' || !Number.isFinite(Number(raw.tileIndex))) {
        return null;
    }
    const tileIndex = Math.trunc(Number(raw.tileIndex));
    if (tileIndex < 0) {
        return null;
    }
    const tileType = typeof raw.tileType === 'string' && raw.tileType.trim().length > 0 ? raw.tileType.trim() : 'stone';
    return {
        tileIndex,
        x: Number.isFinite(Number(raw.x)) ? Math.trunc(Number(raw.x)) : null,
        y: Number.isFinite(Number(raw.y)) ? Math.trunc(Number(raw.y)) : null,
        tileType,
        hp: Math.max(1, Math.trunc(Number(raw.hp) || 1)),
        maxHp: Math.max(1, Math.trunc(Number(raw.maxHp) || 1)),
        expiresAtTick: Math.max(1, Math.trunc(Number(raw.expiresAtTick) || 1)),
        ownerPlayerId: typeof raw.ownerPlayerId === 'string' && raw.ownerPlayerId.trim() ? raw.ownerPlayerId.trim() : null,
        sourceSkillId: typeof raw.sourceSkillId === 'string' && raw.sourceSkillId.trim() ? raw.sourceSkillId.trim() : null,
        createdAt: Number.isFinite(Number(raw.createdAt)) ? Math.max(0, Math.trunc(Number(raw.createdAt))) : 0,
        modifiedAt: Number.isFinite(Number(raw.modifiedAt)) ? Math.max(0, Math.trunc(Number(raw.modifiedAt))) : 0,
    };
}
export { MapPersistenceService };
/**
 * normalizeContainerState：规范化或转换Container状态。
 * @param raw 参数说明。
 * @returns 无返回值，直接更新Container状态相关状态。
 */

function normalizeContainerState(raw) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * normalizeContainerItemEntry：规范化或转换Container道具条目。
 * @param raw 参数说明。
 * @returns 无返回值，直接更新Container道具条目相关状态。
 */

function normalizeContainerItemEntry(raw) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * normalizeContainerSearchState：规范化或转换ContainerSearch状态。
 * @param raw 参数说明。
 * @returns 无返回值，直接更新ContainerSearch状态相关状态。
 */

function normalizeContainerSearchState(raw) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * normalizePersistedGroundItem：判断Persisted地面道具是否满足条件。
 * @param raw 参数说明。
 * @returns 无返回值，直接更新PersistedGround道具相关状态。
 */

function normalizePersistedGroundItem(raw) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
