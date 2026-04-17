"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};

var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toPlayerSnapshotFromMigrationRow = exports.WorldPlayerSourceService = void 0;

const common_1 = require("@nestjs/common");

const shared_1 = require("@mud/shared-next");

const pg_1 = require("pg");

const env_alias_1 = require("../config/env-alias");

const next_player_auth_store_service_1 = require("../http/next/next-player-auth-store.service");

const player_identity_persistence_service_1 = require("../persistence/player-identity-persistence.service");

const player_persistence_service_1 = require("../persistence/player-persistence.service");

const DISABLE_MIGRATION_SOURCE_ENV_KEYS = [
    'SERVER_NEXT_AUTH_DISABLE_COMPAT_MIGRATION_SOURCE',
    'NEXT_AUTH_DISABLE_COMPAT_MIGRATION_SOURCE',
];
/** 是否关闭 migration-only 源入口。 */
function isMigrationSourceDisabled() {
    for (const key of DISABLE_MIGRATION_SOURCE_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
        if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
            return true;
        }
    }
    return false;
}
/** 是否显式允许 migration-only 身份来源。 */
function isMigrationAccessExplicit(options) {
    return options?.allowMigrationSource === true;
}
/** 迁移入口必须显式声明，避免继续把 legacy 源当常规真源。 */
function assertExplicitMigrationAccess(options, logger, action) {
    if (isMigrationAccessExplicit(options)) {
        return true;
    }
    logger?.warn?.(`旧玩家源 ${action} 已拦截：reason=explicit_migration_access_required`);
    return false;
}

/** 玩家来源服务：主链只认 next 真源，legacy 数据库只保留给显式 migration 入口。 */
let WorldPlayerSourceService = class WorldPlayerSourceService {
    /** 记录来源解析与迁移入口行为。 */
    logger = new common_1.Logger(WorldPlayerSourceService.name);
    /** 保留注入位，避免迁移期外部 provider 断裂。 */
    authStore;
    /** next 身份持久化入口。 */
    playerIdentityPersistenceService;
    /** next 快照持久化入口。 */
    playerPersistenceService;
    /** 懒加载的 legacy 数据库连接。 */
    pool = null;
    /** 记录 legacy 连接池初始化中状态。 */
    poolInitPromise = null;
    /** 标记 legacy 数据源是否不可用。 */
    poolUnavailable = false;
    /** 避免重复打印 pool 不可用告警。 */
    poolUnavailableLogged = false;
    constructor(authStore, playerIdentityPersistenceService, playerPersistenceService) {
        this.authStore = authStore;
        this.playerIdentityPersistenceService = playerIdentityPersistenceService;
        this.playerPersistenceService = playerPersistenceService;
    }
    async onModuleInit() {
        return;
    }
    /** 释放 legacy 数据库连接。 */
    async onModuleDestroy() {

        const pool = this.pool;
        this.pool = null;
        this.poolInitPromise = null;
        if (pool) {
            await pool.end().catch(() => undefined);
        }
    }
    /** next 身份持久化源是否可用。 */
    isNextIdentitySourceEnabled() {
        return typeof this.playerIdentityPersistenceService?.isEnabled === 'function'
            && this.playerIdentityPersistenceService.isEnabled();
    }
    /** next 快照持久化源是否可用。 */
    isNextSnapshotSourceEnabled() {
        return typeof this.playerPersistenceService?.isEnabled === 'function'
            && this.playerPersistenceService.isEnabled();
    }
    /** 直接从 next 身份持久化层读取玩家身份。 */
    async loadNextPlayerIdentity(userId) {
        if (!this.isNextIdentitySourceEnabled()
            || typeof this.playerIdentityPersistenceService?.loadPlayerIdentity !== 'function') {
            return null;
        }
        return this.playerIdentityPersistenceService.loadPlayerIdentity(userId);
    }
    /** 直接从 next 快照持久化层读取玩家快照记录。 */
    async loadNextPlayerSnapshotRecord(playerId) {
        if (!this.isNextSnapshotSourceEnabled()
            || typeof this.playerPersistenceService?.loadPlayerSnapshotRecord !== 'function') {
            return null;
        }
        return this.playerPersistenceService.loadPlayerSnapshotRecord(playerId);
    }
    /** 直接从 next 快照持久化层读取玩家快照。 */
    async loadNextPlayerSnapshot(playerId) {

        const record = await this.loadNextPlayerSnapshotRecord(playerId);
        return record?.snapshot ?? null;
    }
    /** 判断是否允许进入 migration-only 源。 */
    isMigrationSourceEnabled(options = undefined) {
        return isMigrationAccessExplicit(options)
            && !isMigrationSourceDisabled();
    }
    /** 显式 migration 身份来源查询。 */
    async queryMigrationIdentityRow(pool, userId) {
        const result = await pool.query(`
        SELECT
          u.id AS "userId",
          u.username AS "username",
          u."displayName" AS "displayName",
          u."pendingRoleName" AS "pendingRoleName",
          p.id AS "playerId",
          p.name AS "playerName"
        FROM users u
        LEFT JOIN players p ON p."userId" = u.id
        WHERE u.id::text = $1
        LIMIT 1
      `, [userId]);
        return result.rows[0] ?? null;
    }
    /** 显式 migration 快照来源查询。 */
    async queryMigrationSnapshotRow(pool, playerId) {
        const result = await pool.query(`
        SELECT
          id,
          "mapId",
          x,
          y,
          facing,
          hp,
          "maxHp",
          qi,
          "pendingLogbookMessages",
          inventory,
          "temporaryBuffs",
          equipment,
          techniques,
          quests,
          bonuses,
          "bodyTraining",
          foundation,
          "combatExp",
          "boneAgeBaseYears",
          "lifeElapsedTicks",
          "lifespanYears",
          "heavenGate",
          "spiritualRoots",
          "unlockedMinimapIds",
          "autoBattle",
          "autoBattleSkills",
          "combatTargetId",
          "combatTargetLocked",
          "autoRetaliate",
          "autoBattleStationary",
          "allowAoePlayerHit",
          "autoIdleCultivation",
          "autoSwitchCultivation",
          "cultivatingTechId"
        FROM players
        WHERE id = $1
        LIMIT 1
      `, [playerId]);
        return result.rows[0] ?? null;
    }
    /** 从 legacy 数据库源恢复玩家身份。 */
    async resolvePlayerIdentityFromMigrationSource(payload, options = undefined) {
        if (!assertExplicitMigrationAccess(options, this.logger, 'identity_source')) {
            return null;
        }

        const pool = await this.ensurePool();
        if (!pool) {
            this.logger.warn(`旧玩家源 migration 身份迁移已拦截：reason=pool_unavailable migration_only=true userId=${typeof payload?.sub === 'string' ? payload.sub : '未知'}`);
            return null;
        }

        let row;
        try {
            row = await this.queryMigrationIdentityRow(pool, payload.sub);
        }
        catch (error) {
            if (isMissingLegacySchemaError(error)) {
                this.logger.warn(`旧玩家源 migration 身份迁移已拦截：reason=missing_legacy_schema migration_only=true userId=${typeof payload?.sub === 'string' ? payload.sub : '未知'}`);
                return null;
            }
            throw error;
        }
        if (!row) {
            this.logger.warn(`旧玩家源 migration 身份迁移已拦截：reason=missing_legacy_row migration_only=true userId=${typeof payload?.sub === 'string' ? payload.sub : '未知'}`);
            return null;
        }
        return {
            userId: row?.userId ?? payload.sub,
            username: row?.username ?? payload.username,
            displayName: resolveDisplayName(row?.displayName, row?.username ?? payload.username, payload.displayName),
            playerId: row?.playerId ?? buildFallbackPlayerId(payload.sub),
            playerName: resolvePlayerName(row?.playerName ?? row?.pendingRoleName ?? null, row?.username ?? payload.username, payload.displayName),
        };
    }
    /** 从 legacy 数据库源恢复玩家快照。 */
    async loadPlayerSnapshotFromMigrationSource(playerId, options = undefined) {
        if (!assertExplicitMigrationAccess(options, this.logger, 'snapshot_source')) {
            return null;
        }

        const pool = await this.ensurePool();
        if (!pool) {
            return null;
        }

        let row;
        try {
            row = await this.queryMigrationSnapshotRow(pool, playerId);
        }
        catch (error) {
            if (isMissingLegacySchemaError(error)) {

                const message = `World legacy player source snapshot fallback blocked: playerId=${playerId} users/players tables unavailable`;
                this.logger.error(message);
                throw new Error(message);
            }
            throw error;
        }
        if (!row) {
            return null;
        }
        return toPlayerSnapshotFromMigrationRow(row);
    }
    /** 懒加载 legacy 数据库连接。 */
    async ensurePool() {
        if (this.poolUnavailable) {
            return null;
        }
        if (this.pool) {
            return this.pool;
        }
        if (this.poolInitPromise) {
            return this.poolInitPromise;
        }

        const databaseUrl = (0, env_alias_1.resolveServerNextDatabaseUrl)();
        if (!databaseUrl.trim()) {
            this.poolUnavailable = true;
            if (!this.poolUnavailableLogged) {
                this.poolUnavailableLogged = true;
                this.logger.warn('旧玩家源已降级：未提供 SERVER_NEXT_DATABASE_URL/DATABASE_URL，改用纯 token 身份');
            }
            return null;
        }
        this.poolInitPromise = (async () => {

            const pool = new pg_1.Pool({ connectionString: databaseUrl });
            try {
                await pool.query('SELECT 1');
                this.pool = pool;
                return pool;
            }
            catch (error) {
                this.poolUnavailable = true;
                this.logger.error('旧玩家源数据库初始化失败', error instanceof Error ? error.stack : String(error));
                await pool.end().catch(() => undefined);
                return null;
            }
            finally {
                this.poolInitPromise = null;
            }
        })();
        return this.poolInitPromise;
    }
    async resolvePlayerIdentityForMigration(payload, options = undefined) {
        if (!this.isMigrationSourceEnabled(options)) {
            return null;
        }
        return this.resolvePlayerIdentityFromMigrationSource(payload, options);
    }
    async loadPlayerSnapshotForMigration(playerId, options = undefined) {
        if (!this.isMigrationSourceEnabled(options)) {
            return null;
        }
        return this.loadPlayerSnapshotFromMigrationSource(playerId, options);
    }
};
exports.WorldPlayerSourceService = WorldPlayerSourceService;
exports.WorldPlayerSourceService = WorldPlayerSourceService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [next_player_auth_store_service_1.NextPlayerAuthStoreService,
        player_identity_persistence_service_1.PlayerIdentityPersistenceService,
        player_persistence_service_1.PlayerPersistenceService])
], WorldPlayerSourceService);
function isMissingLegacySchemaError(error) {
    return Boolean(error && typeof error === 'object' && error.code === '42P01');
}
function resolveDisplayName(displayName, username, fallback) {

    const normalized = typeof displayName === 'string' ? displayName.normalize('NFC') : '';
    if (isValidVisibleDisplayName(normalized)) {
        return normalized;
    }

    const normalizedFallback = typeof fallback === 'string' ? fallback.trim().normalize('NFC') : '';
    if (isValidVisibleDisplayName(normalizedFallback)) {
        return normalizedFallback;
    }
    return (0, shared_1.resolveDefaultVisibleDisplayName)(username.normalize('NFC'));
}
function resolvePlayerName(playerName, username, fallback) {

    const normalized = typeof playerName === 'string' ? playerName.trim().normalize('NFC') : '';
    if (normalized) {
        return normalized;
    }
    if (typeof fallback === 'string' && fallback.trim()) {
        return fallback.trim().normalize('NFC');
    }
    return username.normalize('NFC');
}
function buildFallbackPlayerId(userId) {

    const normalized = userId.trim();
    return normalized ? `p_${normalized}` : 'p_guest';
}
function isValidVisibleDisplayName(value) {
    return typeof value === 'string'
        && value.length > 0
        && (0, shared_1.getGraphemeCount)(value) === 1
        && (0, shared_1.hasVisibleNameGrapheme)(value)
        && !(0, shared_1.containsInvisibleOnlyNameGrapheme)(value);
}
function toPlayerSnapshotFromMigrationRow(row) {

    const currentMapId = resolveRequiredCompatMapId(row.mapId);

    const inventory = normalizeInventory(row.inventory);

    const buffs = normalizeTemporaryBuffs(row.temporaryBuffs);

    const equipment = normalizeEquipment(row.equipment);

    const techniques = normalizeTechniques(row.techniques);

    const quests = normalizeQuests(row.quests);

    const unlockedMapIds = normalizeUnlockedMapIds(row.unlockedMinimapIds);
    return {
        version: 1,
        savedAt: Date.now(),
        placement: {
            templateId: currentMapId,
            x: toFiniteInt(row.x, 0),
            y: toFiniteInt(row.y, 0),
            facing: normalizeDirection(row.facing),
        },
        vitals: {
            hp: Math.max(0, toFiniteInt(row.hp, 100)),
            maxHp: Math.max(1, toFiniteInt(row.maxHp, 100)),
            qi: Math.max(0, toFiniteInt(row.qi, 0)),
            maxQi: 0,
        },
        progression: {
            foundation: Math.max(0, toFiniteInt(row.foundation, 0)),
            combatExp: Math.max(0, toFiniteInt(row.combatExp, 0)),

            bodyTraining: typeof row.bodyTraining === 'object' && row.bodyTraining ? row.bodyTraining : null,
            boneAgeBaseYears: Math.max(1, toFiniteInt(row.boneAgeBaseYears, shared_1.DEFAULT_BONE_AGE_YEARS)),
            lifeElapsedTicks: Math.max(0, toFiniteNumber(row.lifeElapsedTicks, 0)),
            lifespanYears: toNullablePositiveInt(row.lifespanYears),
            realm: normalizeLegacyRealmState(row.bonuses),
            heavenGate: normalizeHeavenGateState(row.heavenGate),
            spiritualRoots: normalizeHeavenGateRoots(row.spiritualRoots),
        },
        unlockedMapIds,
        inventory,
        equipment,
        techniques: {
            revision: 1,
            techniques,

            cultivatingTechId: typeof row.cultivatingTechId === 'string' && row.cultivatingTechId.trim()
                ? row.cultivatingTechId
                : null,
        },
        buffs: {
            revision: 1,
            buffs,
        },
        runtimeBonuses: normalizeRuntimeBonuses(row.bonuses),
        pendingLogbookMessages: normalizePendingLogbookMessages(row.pendingLogbookMessages),
        quests: {
            revision: 1,
            entries: quests,
        },
        combat: {

            autoBattle: row.autoBattle === true,

            combatTargetId: typeof row.combatTargetId === 'string' && row.combatTargetId.trim()
                ? row.combatTargetId.trim()
                : null,

            combatTargetLocked: row.combatTargetLocked === true
                && typeof row.combatTargetId === 'string'
                && row.combatTargetId.trim().length > 0,

            autoRetaliate: row.autoRetaliate !== false,

            autoBattleStationary: row.autoBattleStationary === true,

            allowAoePlayerHit: row.allowAoePlayerHit === true,

            autoIdleCultivation: row.autoIdleCultivation !== false,

            autoSwitchCultivation: row.autoSwitchCultivation === true,
            senseQiActive: false,
            autoBattleSkills: normalizeAutoBattleSkills(row.autoBattleSkills),
        },
    };
}
exports.toPlayerSnapshotFromMigrationRow = toPlayerSnapshotFromMigrationRow;
function resolveRequiredCompatMapId(value) {

    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) {
        throw new Error('Migration player snapshot invalid mapId');
    }
    return normalized;
}
function normalizeInventory(value) {
    if (!value || typeof value !== 'object') {
        return {
            revision: 1,
            capacity: shared_1.DEFAULT_INVENTORY_CAPACITY,
            items: [],
        };
    }

    const inventory = value;
    return {
        revision: 1,
        capacity: Math.max(shared_1.DEFAULT_INVENTORY_CAPACITY, toFiniteInt(inventory.capacity, shared_1.DEFAULT_INVENTORY_CAPACITY)),
        items: Array.isArray(inventory.items)
            ? inventory.items.map(normalizeItem).filter((entry) => entry !== null)
            : [],
    };
}
function normalizeEquipment(value) {

    const equipment = value && typeof value === 'object'
        ? value
        : {};

    const slots = [];
    for (const slot of shared_1.EQUIP_SLOTS) {
        slots.push({
            slot,
            item: normalizeItem(equipment[slot]),
        });
    }
    return {
        revision: 1,
        slots,
    };
}
function normalizeTemporaryBuffs(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    const buffs = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }

        const buff = entry;

        const buffId = typeof buff.buffId === 'string' ? buff.buffId.trim() : '';

        const name = typeof buff.name === 'string' ? buff.name.trim() : '';
        if (!buffId || !name) {
            continue;
        }
        buffs.push({
            ...buff,
            buffId,
            name,
            remainingTicks: Math.max(0, toFiniteInt(buff.remainingTicks, 0)),
            duration: Math.max(0, toFiniteInt(buff.duration, 0)),
            stacks: Math.max(1, toFiniteInt(buff.stacks, 1)),
            maxStacks: Math.max(1, toFiniteInt(buff.maxStacks, 1)),
        });
    }
    return buffs;
}
function normalizeTechniques(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    const techniques = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }

        const technique = entry;

        const techId = typeof technique.techId === 'string' ? technique.techId.trim() : '';
        if (!techId) {
            continue;
        }
        techniques.push({
            techId,
            level: Math.max(1, toFiniteInt(technique.level, 1)),
            exp: Math.max(0, toFiniteInt(technique.exp, 0)),
            expToNext: Math.max(0, toFiniteInt(technique.expToNext, 0)),
            realmLv: Math.max(0, toFiniteInt(technique.realmLv, 0)),
            realm: normalizeTechniqueRealm(technique.realm),

            name: typeof technique.name === 'string' ? technique.name : undefined,

            grade: typeof technique.grade === 'string' ? technique.grade : undefined,

            category: typeof technique.category === 'string' ? technique.category : undefined,
            skills: Array.isArray(technique.skills) ? technique.skills.map((entry) => ({ ...entry })) : [],
            layers: Array.isArray(technique.layers)
                ? technique.layers.map((layer) => ({
                    level: Math.max(1, toFiniteInt(layer?.level, 1)),
                    expToNext: Math.max(0, toFiniteInt(layer?.expToNext, 0)),

                    attrs: layer?.attrs && typeof layer.attrs === 'object' ? { ...layer.attrs } : undefined,
                }))
                : undefined,

            attrCurves: technique.attrCurves && typeof technique.attrCurves === 'object' ? { ...technique.attrCurves } : undefined,
        });
    }
    techniques.sort((left, right) => left.techId.localeCompare(right.techId, 'zh-Hans-CN'));
    return techniques;
}
function normalizeQuests(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((entry) => Boolean(entry && typeof entry === 'object'))
        .map((entry) => ({
        ...entry,
        rewardItemIds: Array.isArray(entry.rewardItemIds) ? entry.rewardItemIds.slice() : [],
        rewards: Array.isArray(entry.rewards) ? entry.rewards.map((reward) => ({ ...reward })) : [],
    }));
}
function normalizeUnlockedMapIds(value) {
    if (!Array.isArray(value)) {
        throw new Error('Migration player snapshot invalid unlockedMinimapIds');
    }

    const result = new Set();
    for (const entry of value) {
        if (typeof entry === 'string' && entry.trim()) {
            result.add(entry);
        }
    }
    return Array.from(result).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
}
function normalizeAutoBattleSkills(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    const result = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }

        const config = entry;

        const skillId = typeof config.skillId === 'string' ? config.skillId.trim() : '';
        if (!skillId) {
            continue;
        }
        result.push({
            skillId,

            enabled: config.enabled !== false,
            skillEnabled: config.skillEnabled,
            autoBattleOrder: Number.isFinite(config.autoBattleOrder) ? Math.max(0, Math.trunc(config.autoBattleOrder)) : undefined,
        });
    }
    return result;
}
function normalizeItem(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const item = value;

    const itemId = typeof item.itemId === 'string' ? item.itemId.trim() : '';
    if (!itemId) {
        return null;
    }
    return {
        ...item,
        itemId,
        count: Math.max(1, toFiniteInt(item.count, 1)),
    };
}
function normalizeDirection(value) {
    if (typeof value === 'number' && value in shared_1.Direction) {
        return value;
    }
    return shared_1.Direction.South;
}
function normalizeTechniqueRealm(value) {
    if (typeof value === 'number' && value in shared_1.TechniqueRealm) {
        return value;
    }
    return undefined;
}
function toFiniteInt(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.trunc(value)
        : fallback;
}
function toFiniteNumber(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Number(value)
        : fallback;
}
function toNullablePositiveInt(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? Math.trunc(value)
        : null;
}
function normalizeLegacyRealmState(value) {
    if (!Array.isArray(value)) {
        return createRealmState();
    }

    const entry = value.find((bonus) => (bonus
        && typeof bonus === 'object'
        && (bonus.source === 'realm:state' || bonus.source === 'runtime:realm_state')));

    const stage = typeof entry?.meta?.stage === 'number' && entry.meta.stage in shared_1.PlayerRealmStage
        ? entry.meta.stage
        : shared_1.DEFAULT_PLAYER_REALM_STAGE;

    const config = shared_1.PLAYER_REALM_CONFIG[stage];
    return {
        stage,
        realmLv: Math.max(1, toFiniteInt(entry?.meta?.realmLv, resolveRealmLevelFromStage(stage))),
        displayName: config.name,
        name: config.name,
        shortName: config.shortName,
        path: config.path,
        narrative: config.narrative,
        review: undefined,
        lifespanYears: null,
        progress: Math.max(0, toFiniteInt(entry?.meta?.progress, 0)),
        progressToNext: config.progressToNext,
        breakthroughReady: false,
        nextStage: shared_1.PLAYER_REALM_ORDER[shared_1.PLAYER_REALM_ORDER.indexOf(stage) + 1],
        breakthroughItems: [],
        minTechniqueLevel: config.minTechniqueLevel,
        minTechniqueRealm: config.minTechniqueRealm,
        heavenGate: normalizeHeavenGateState(null),
    };
}
function normalizePendingLogbookMessages(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    const normalized = [];

    const indexById = new Map();
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }

        const candidate = {

            id: typeof entry.id === 'string' ? entry.id.trim() : '',
            kind: normalizePendingLogbookKind(entry.kind),

            text: typeof entry.text === 'string' ? entry.text.trim() : '',

            from: typeof entry.from === 'string' && entry.from.trim().length > 0 ? entry.from.trim() : undefined,
            at: Number.isFinite(entry.at) ? Math.max(0, Math.trunc(entry.at)) : 0,
        };
        if (!candidate.id || !candidate.text) {
            continue;
        }

        const existingIndex = indexById.get(candidate.id);
        if (existingIndex !== undefined) {
            normalized.splice(existingIndex, 1);
        }
        indexById.clear();
        normalized.push(candidate);
        while (normalized.length > 100) {
            normalized.shift();
        }
        normalized.forEach((item, index) => indexById.set(item.id, index));
    }
    return normalized;
}
function normalizePendingLogbookKind(value) {
    switch (value) {
        case 'system':
        case 'chat':
        case 'quest':
        case 'combat':
        case 'loot':
        case 'grudge':
            return value;
        default:
            return 'grudge';
    }
}
function normalizeRuntimeBonuses(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({

        source: canonicalizeRuntimeBonusSource(typeof entry.source === 'string' ? entry.source : ''),

        label: typeof entry.label === 'string' ? entry.label : undefined,

        attrs: entry.attrs && typeof entry.attrs === 'object' ? { ...entry.attrs } : undefined,

        stats: entry.stats && typeof entry.stats === 'object' ? { ...entry.stats } : undefined,
        qiProjection: Array.isArray(entry.qiProjection) ? entry.qiProjection.map((item) => ({ ...item })) : undefined,

        meta: entry.meta && typeof entry.meta === 'object' ? { ...entry.meta } : undefined,
    }))
        .filter((entry) => entry.source.length > 0);
}
function canonicalizeRuntimeBonusSource(source) {

    const normalized = typeof source === 'string' ? source.trim() : '';
    if (!normalized) {
        return '';
    }
    if (normalized === 'technique:aggregate') {
        return 'runtime:technique_aggregate';
    }
    if (normalized === 'realm:state') {
        return 'runtime:realm_state';
    }
    if (normalized === 'realm:stage') {
        return 'runtime:realm_stage';
    }
    if (normalized === 'heaven_gate:roots') {
        return 'runtime:heaven_gate_roots';
    }
    if (normalized.startsWith('equip:')) {
        return `equipment:${normalized.slice('equip:'.length)}`;
    }
    return normalized;
}
function createRealmState() {

    const stage = shared_1.DEFAULT_PLAYER_REALM_STAGE;

    const config = shared_1.PLAYER_REALM_CONFIG[stage];
    return {
        stage,
        realmLv: 1,
        displayName: config.name,
        name: config.name,
        shortName: config.shortName,
        path: config.path,
        narrative: config.narrative,
        review: undefined,
        lifespanYears: null,
        progress: 0,
        progressToNext: config.progressToNext,
        breakthroughReady: false,
        nextStage: shared_1.PLAYER_REALM_ORDER[shared_1.PLAYER_REALM_ORDER.indexOf(stage) + 1],
        breakthroughItems: [],
        minTechniqueLevel: config.minTechniqueLevel,
        minTechniqueRealm: config.minTechniqueRealm,
        heavenGate: null,
    };
}
function normalizeHeavenGateState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const raw = value;
    return {

        unlocked: raw.unlocked === true,
        severed: Array.isArray(raw.severed)
            ? raw.severed.filter((entry) => typeof entry === 'string')
            : [],
        roots: normalizeHeavenGateRoots(raw.roots),

        entered: raw.entered === true,
        averageBonus: toFiniteInt(raw.averageBonus, 0),
    };
}
function normalizeHeavenGateRoots(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const raw = value;
    return {
        metal: Math.max(0, Math.min(100, toFiniteInt(raw.metal, 0))),
        wood: Math.max(0, Math.min(100, toFiniteInt(raw.wood, 0))),
        water: Math.max(0, Math.min(100, toFiniteInt(raw.water, 0))),
        fire: Math.max(0, Math.min(100, toFiniteInt(raw.fire, 0))),
        earth: Math.max(0, Math.min(100, toFiniteInt(raw.earth, 0))),
    };
}
function resolveRealmLevelFromStage(stage) {
    switch (stage) {
        case shared_1.PlayerRealmStage.BodyTempering:
            return 6;
        case shared_1.PlayerRealmStage.BoneForging:
            return 9;
        case shared_1.PlayerRealmStage.Meridian:
            return 13;
        case shared_1.PlayerRealmStage.Innate:
            return 16;
        case shared_1.PlayerRealmStage.QiRefining:
            return 19;
        case shared_1.PlayerRealmStage.Foundation:
            return 31;
        case shared_1.PlayerRealmStage.Mortal:
        default:
            return 1;
    }
}
