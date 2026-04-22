import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import * as shared_1 from '@mud/shared';

import { NativePlayerAuthStoreService } from '../http/native/native-player-auth-store.service';
import { PlayerIdentityPersistenceService } from '../persistence/player-identity-persistence.service';
import { PlayerPersistenceService } from '../persistence/player-persistence.service';

interface PlayerIdentityPersistencePort {
    isEnabled(): boolean;
    loadPlayerIdentity(userId: string): Promise<unknown>;
}

interface PlayerSnapshotPersistencePort {
    isEnabled(): boolean;
    loadPlayerSnapshotRecord(playerId: string): Promise<{ snapshot?: unknown } | null>;
}

const DISABLE_MIGRATION_SOURCE_ENV_KEYS = [
    'SERVER_AUTH_DISABLE_COMPAT_MIGRATION_SOURCE',
];
/** 是否关闭 migration-only 源入口。 */
function isMigrationSourceDisabled() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (isMigrationAccessExplicit(options)) {
        return true;
    }
    logger?.warn?.(`旧玩家源 ${action} 已拦截：reason=explicit_migration_access_required`);
    return false;
}

/** 玩家来源服务：主链只认主线真源，legacy 数据库只保留给显式 migration 入口。 */
@Injectable()
export class WorldPlayerSourceService {
    /** 记录来源解析与迁移入口行为。 */
    private readonly logger = new Logger(WorldPlayerSourceService.name);
    /** 主线身份持久化入口。 */
    private readonly playerIdentityPersistenceService: PlayerIdentityPersistencePort;
    /** 主线快照持久化入口。 */
    private readonly playerPersistenceService: PlayerSnapshotPersistencePort;

    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param authStore 参数说明。
 * @param playerIdentityPersistenceService 参数说明。
 * @param playerPersistenceService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Optional() _authStore: NativePlayerAuthStoreService | null,
        @Inject(PlayerIdentityPersistenceService)
        playerIdentityPersistenceService: unknown,
        @Inject(PlayerPersistenceService)
        playerPersistenceService: unknown,
    ) {
        this.playerIdentityPersistenceService = playerIdentityPersistenceService as PlayerIdentityPersistencePort;
        this.playerPersistenceService = playerPersistenceService as PlayerSnapshotPersistencePort;
    }

    /**
 * onModuleInit：执行on模块Init相关逻辑。
 * @returns 无返回值，直接更新on模块Init相关状态。
 */

    async onModuleInit() {
        return;
    }

    /**
 * onModuleDestroy：执行on模块Destroy相关逻辑。
 * @returns 无返回值，直接更新on模块Destroy相关状态。
 */

    async onModuleDestroy() {
        return;
    }
    /** 主线身份持久化源是否可用。 */
    isPrimaryIdentitySourceEnabled() {
        return typeof this.playerIdentityPersistenceService?.isEnabled === 'function'
            && this.playerIdentityPersistenceService.isEnabled();
    }
    /** 主线快照持久化源是否可用。 */
    isPrimarySnapshotSourceEnabled() {
        return typeof this.playerPersistenceService?.isEnabled === 'function'
            && this.playerPersistenceService.isEnabled();
    }
    /** 直接从主线身份持久化层读取玩家身份。 */
    async loadPersistedPlayerIdentity(userId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isPrimaryIdentitySourceEnabled()) {
            return null;
        }
        return this.playerIdentityPersistenceService.loadPlayerIdentity(userId);
    }
    /** 直接从主线快照持久化层读取玩家快照记录。 */
    async loadPersistedPlayerSnapshotRecord(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.isPrimarySnapshotSourceEnabled()) {
            return null;
        }
        return this.playerPersistenceService.loadPlayerSnapshotRecord(playerId);
    }
    /** 直接从主线快照持久化层读取玩家快照。 */
    async loadPersistedPlayerSnapshot(playerId) {

        const record = await this.loadPersistedPlayerSnapshotRecord(playerId);
        return record?.snapshot ?? null;
    }
    /** 判断是否允许进入 migration-only 源。 */
    isMigrationSourceEnabled(options = undefined) {
        return isMigrationAccessExplicit(options)
            && !isMigrationSourceDisabled();
    }
    /**
 * resolvePlayerIdentityForMigration：规范化或转换玩家IdentityForMigration。
 * @param payload 载荷参数。
 * @param options 选项参数。
 * @returns 无返回值，直接更新玩家IdentityForMigration相关状态。
 */

    async resolvePlayerIdentityForMigration(payload, options = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (isMigrationAccessExplicit(options) && !isMigrationSourceDisabled()) {
            this.logger.warn(`旧玩家源 identity_source 已移除：reason=legacy_users_players_removed migration_only=true userId=${typeof payload?.sub === 'string' ? payload.sub : '未知'}`);
        }
        return null;
    }
    /**
 * loadPlayerSnapshotForMigration：读取玩家快照ForMigration并返回结果。
 * @param playerId 玩家 ID。
 * @param options 选项参数。
 * @returns 无返回值，完成玩家快照ForMigration的读取/组装。
 */

    async loadPlayerSnapshotForMigration(playerId, options = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (isMigrationAccessExplicit(options) && !isMigrationSourceDisabled()) {
            this.logger.warn(`旧玩家源 snapshot_source 已移除：reason=legacy_users_players_removed migration_only=true playerId=${typeof playerId === 'string' ? playerId : '未知'}`);
        }
        return null;
    }
}
/**
 * resolveDisplayName：判断显示名称是否满足条件。
 * @param displayName 参数说明。
 * @param username 参数说明。
 * @param fallback 参数说明。
 * @returns 无返回值，直接更新显示名称相关状态。
 */

function resolveDisplayName(displayName, username, fallback) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
/**
 * resolvePlayerName：规范化或转换玩家名称。
 * @param playerName 参数说明。
 * @param username 参数说明。
 * @param fallback 参数说明。
 * @returns 无返回值，直接更新玩家名称相关状态。
 */

function resolvePlayerName(playerName, username, fallback) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const normalized = typeof playerName === 'string' ? playerName.trim().normalize('NFC') : '';
    if (normalized) {
        return normalized;
    }
    if (typeof fallback === 'string' && fallback.trim()) {
        return fallback.trim().normalize('NFC');
    }
    return username.normalize('NFC');
}
/**
 * isValidVisibleDisplayName：判断Valid可见显示名称是否满足条件。
 * @param value 参数说明。
 * @returns 无返回值，完成Valid可见显示名称的条件判断。
 */

function isValidVisibleDisplayName(value) {
    return typeof value === 'string'
        && value.length > 0
        && (0, shared_1.getGraphemeCount)(value) === 1
        && (0, shared_1.hasVisibleNameGrapheme)(value)
        && !(0, shared_1.containsInvisibleOnlyNameGrapheme)(value);
}
/**
 * toPlayerSnapshotFromMigrationRow：执行to玩家快照FromMigrationRow相关逻辑。
 * @param row 参数说明。
 * @returns 无返回值，直接更新to玩家快照FromMigrationRow相关状态。
 */

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
            instanceId: buildPublicPlayerInstanceId(currentMapId),
            templateId: currentMapId,
            x: toFiniteInt(row.x, 0),
            y: toFiniteInt(row.y, 0),
            facing: normalizeDirection(row.facing),
        },
        worldPreference: {
            linePreset: 'peaceful',
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

function buildPublicPlayerInstanceId(templateId) {
    return `public:${templateId}`;
}
export { toPlayerSnapshotFromMigrationRow };
/**
 * resolveRequiredCompatMapId：规范化或转换RequiredCompat地图ID。
 * @param value 参数说明。
 * @returns 无返回值，直接更新RequiredCompat地图ID相关状态。
 */

function resolveRequiredCompatMapId(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) {
        throw new Error('Migration player snapshot invalid mapId');
    }
    return normalized;
}
/**
 * normalizeInventory：规范化或转换背包。
 * @param value 参数说明。
 * @returns 无返回值，直接更新背包相关状态。
 */

function normalizeInventory(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * normalizeEquipment：规范化或转换装备。
 * @param value 参数说明。
 * @returns 无返回值，直接更新装备相关状态。
 */

function normalizeEquipment(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
/**
 * normalizeTemporaryBuffs：规范化或转换TemporaryBuff。
 * @param value 参数说明。
 * @returns 无返回值，直接更新TemporaryBuff相关状态。
 */

function normalizeTemporaryBuffs(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * normalizeTechniques：规范化或转换功法。
 * @param value 参数说明。
 * @returns 无返回值，直接更新功法相关状态。
 */

function normalizeTechniques(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * normalizeQuests：规范化或转换任务。
 * @param value 参数说明。
 * @returns 无返回值，直接更新任务相关状态。
 */

function normalizeQuests(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * normalizeUnlockedMapIds：规范化或转换Unlocked地图ID。
 * @param value 参数说明。
 * @returns 无返回值，直接更新Unlocked地图ID相关状态。
 */

function normalizeUnlockedMapIds(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(value)) {
        throw new Error('Migration player snapshot invalid unlockedMinimapIds');
    }

    const result = new Set<string>();
    for (const entry of value) {
        if (typeof entry === 'string' && entry.trim()) {
            result.add(entry);
        }
    }
    return Array.from(result).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
}
/**
 * normalizeAutoBattleSkills：规范化或转换AutoBattle技能。
 * @param value 参数说明。
 * @returns 无返回值，直接更新AutoBattle技能相关状态。
 */

function normalizeAutoBattleSkills(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * normalizeItem：规范化或转换道具。
 * @param value 参数说明。
 * @returns 无返回值，直接更新道具相关状态。
 */

function normalizeItem(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * normalizeDirection：规范化或转换Direction。
 * @param value 参数说明。
 * @returns 无返回值，直接更新Direction相关状态。
 */

function normalizeDirection(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof value === 'number' && value in shared_1.Direction) {
        return value;
    }
    return shared_1.Direction.South;
}
/**
 * normalizeTechniqueRealm：规范化或转换功法Realm。
 * @param value 参数说明。
 * @returns 无返回值，直接更新功法Realm相关状态。
 */

function normalizeTechniqueRealm(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof value === 'number' && value in shared_1.TechniqueRealm) {
        return value;
    }
    return undefined;
}
/**
 * toFiniteInt：执行toFiniteInt相关逻辑。
 * @param value 参数说明。
 * @param fallback 参数说明。
 * @returns 无返回值，直接更新toFiniteInt相关状态。
 */

function toFiniteInt(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.trunc(value)
        : fallback;
}
/**
 * toFiniteNumber：执行toFiniteNumber相关逻辑。
 * @param value 参数说明。
 * @param fallback 参数说明。
 * @returns 无返回值，直接更新toFiniteNumber相关状态。
 */

function toFiniteNumber(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Number(value)
        : fallback;
}
/**
 * toNullablePositiveInt：执行toNullablePositiveInt相关逻辑。
 * @param value 参数说明。
 * @returns 无返回值，直接更新toNullablePositiveInt相关状态。
 */

function toNullablePositiveInt(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? Math.trunc(value)
        : null;
}
/**
 * normalizeLegacyRealmState：规范化或转换LegacyRealm状态。
 * @param value 参数说明。
 * @returns 无返回值，直接更新LegacyRealm状态相关状态。
 */

function normalizeLegacyRealmState(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * normalizePendingLogbookMessages：规范化或转换待处理LogbookMessage。
 * @param value 参数说明。
 * @returns 无返回值，直接更新PendingLogbookMessage相关状态。
 */

function normalizePendingLogbookMessages(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * normalizePendingLogbookKind：规范化或转换待处理LogbookKind。
 * @param value 参数说明。
 * @returns 无返回值，直接更新PendingLogbookKind相关状态。
 */

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
/**
 * normalizeRuntimeBonuses：规范化或转换运行态Bonuse。
 * @param value 参数说明。
 * @returns 无返回值，直接更新运行态Bonuse相关状态。
 */

function normalizeRuntimeBonuses(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * canonicalizeRuntimeBonusSource：判断canonicalize运行态Bonu来源是否满足条件。
 * @param source 来源对象。
 * @returns 无返回值，完成canonicalize运行态Bonu来源的条件判断。
 */

function canonicalizeRuntimeBonusSource(source) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
/**
 * createRealmState：构建并返回目标对象。
 * @returns 无返回值，直接更新Realm状态相关状态。
 */

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
/**
 * normalizeHeavenGateState：规范化或转换HeavenGate状态。
 * @param value 参数说明。
 * @returns 无返回值，直接更新HeavenGate状态相关状态。
 */

function normalizeHeavenGateState(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * normalizeHeavenGateRoots：规范化或转换HeavenGate根容器。
 * @param value 参数说明。
 * @returns 无返回值，直接更新HeavenGate根容器相关状态。
 */

function normalizeHeavenGateRoots(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * resolveRealmLevelFromStage：规范化或转换Realm等级FromStage。
 * @param stage 参数说明。
 * @returns 无返回值，直接更新Realm等级FromStage相关状态。
 */

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
