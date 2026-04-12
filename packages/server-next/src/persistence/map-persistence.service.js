"use strict";
/** __decorate：定义该变量以承载业务值。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** MapPersistenceService_1：定义该变量以承载业务值。 */
var MapPersistenceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapPersistenceService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** pg_1：定义该变量以承载业务值。 */
const pg_1 = require("pg");
/** persistent_document_table_1：定义该变量以承载业务值。 */
const persistent_document_table_1 = require("./persistent-document-table");
/** env_alias_1：定义该变量以承载业务值。 */
const env_alias_1 = require("../config/env-alias");
/** MAP_SNAPSHOT_SCOPE：定义该变量以承载业务值。 */
const MAP_SNAPSHOT_SCOPE = 'server_next_map_aura_v1';
/** MapPersistenceService：定义该变量以承载业务值。 */
let MapPersistenceService = MapPersistenceService_1 = class MapPersistenceService {
    logger = new common_1.Logger(MapPersistenceService_1.name);
    pool = null;
    enabled = false;
/** onModuleInit：执行对应的业务逻辑。 */
    async onModuleInit() {
/** databaseUrl：定义该变量以承载业务值。 */
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
            this.logger.log('Map persistence enabled via persistent_documents');
        }
        catch (error) {
            this.logger.error('Map persistence init failed, fallback to disabled mode', error instanceof Error ? error.stack : String(error));
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
/** loadMapSnapshot：执行对应的业务逻辑。 */
    async loadMapSnapshot(instanceId) {
        if (!this.pool || !this.enabled) {
            return null;
        }
/** result：定义该变量以承载业务值。 */
        const result = await this.pool.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2', [MAP_SNAPSHOT_SCOPE, instanceId]);
        if (result.rowCount === 0) {
            return null;
        }
        return normalizeMapSnapshot(result.rows[0]?.payload);
    }
/** saveMapSnapshot：执行对应的业务逻辑。 */
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
exports.MapPersistenceService = MapPersistenceService;
exports.MapPersistenceService = MapPersistenceService = MapPersistenceService_1 = __decorate([
    (0, common_1.Injectable)()
], MapPersistenceService);
/** normalizeMapSnapshot：执行对应的业务逻辑。 */
function normalizeMapSnapshot(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
/** snapshot：定义该变量以承载业务值。 */
    const snapshot = raw;
    if (snapshot.version !== 1 || typeof snapshot.templateId !== 'string') {
        return null;
    }
    return {
        version: 1,
/** savedAt：定义该变量以承载业务值。 */
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
/** normalizeContainerState：执行对应的业务逻辑。 */
function normalizeContainerState(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
/** state：定义该变量以承载业务值。 */
    const state = raw;
/** sourceId：定义该变量以承载业务值。 */
    const sourceId = typeof state.sourceId === 'string' ? state.sourceId.trim() : '';
/** containerId：定义该变量以承载业务值。 */
    const containerId = typeof state.containerId === 'string' ? state.containerId.trim() : '';
    if (!sourceId || !containerId || !Array.isArray(state.entries)) {
        return null;
    }
/** entries：定义该变量以承载业务值。 */
    const entries = state.entries
        .map((entry) => normalizeContainerItemEntry(entry))
        .filter((entry) => Boolean(entry));
/** activeSearch：定义该变量以承载业务值。 */
    const activeSearch = normalizeContainerSearchState(state.activeSearch);
    return {
        sourceId,
        containerId,
/** generatedAtTick：定义该变量以承载业务值。 */
        generatedAtTick: typeof state.generatedAtTick === 'number' && Number.isFinite(state.generatedAtTick)
            ? Math.max(0, Math.trunc(state.generatedAtTick))
            : undefined,
/** refreshAtTick：定义该变量以承载业务值。 */
        refreshAtTick: typeof state.refreshAtTick === 'number' && Number.isFinite(state.refreshAtTick)
            ? Math.max(0, Math.trunc(state.refreshAtTick))
            : undefined,
        entries,
        activeSearch,
    };
}
/** normalizeContainerItemEntry：执行对应的业务逻辑。 */
function normalizeContainerItemEntry(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
/** entry：定义该变量以承载业务值。 */
    const entry = raw;
/** item：定义该变量以承载业务值。 */
    const item = normalizePersistedGroundItem(entry.item);
    if (!item) {
        return null;
    }
    return {
        item,
/** createdTick：定义该变量以承载业务值。 */
        createdTick: typeof entry.createdTick === 'number' && Number.isFinite(entry.createdTick)
            ? Math.max(0, Math.trunc(entry.createdTick))
            : 0,
/** visible：定义该变量以承载业务值。 */
        visible: entry.visible === true,
    };
}
/** normalizeContainerSearchState：执行对应的业务逻辑。 */
function normalizeContainerSearchState(raw) {
    if (!raw || typeof raw !== 'object') {
        return undefined;
    }
/** search：定义该变量以承载业务值。 */
    const search = raw;
/** itemKey：定义该变量以承载业务值。 */
    const itemKey = typeof search.itemKey === 'string' ? search.itemKey.trim() : '';
    if (!itemKey) {
        return undefined;
    }
/** totalTicks：定义该变量以承载业务值。 */
    const totalTicks = typeof search.totalTicks === 'number' && Number.isFinite(search.totalTicks)
        ? Math.max(1, Math.trunc(search.totalTicks))
        : 1;
/** remainingTicks：定义该变量以承载业务值。 */
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
/** normalizePersistedGroundItem：执行对应的业务逻辑。 */
function normalizePersistedGroundItem(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
/** item：定义该变量以承载业务值。 */
    const item = raw;
    if (typeof item.itemId !== 'string' || !item.itemId.trim()) {
        return null;
    }
    return {
        ...item,
        itemId: item.itemId.trim(),
/** count：定义该变量以承载业务值。 */
        count: typeof item.count === 'number' && Number.isFinite(item.count)
            ? Math.max(1, Math.trunc(item.count))
            : 1,
    };
}
//# sourceMappingURL=map-persistence.service.js.map
