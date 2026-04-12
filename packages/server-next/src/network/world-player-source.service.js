"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** __metadata：定义该变量以承载业务值。 */
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
/** __param：定义该变量以承载业务值。 */
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toPlayerSnapshotFromCompatRow = exports.WorldPlayerSourceService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** pg_1：定义该变量以承载业务值。 */
const pg_1 = require("pg");
/** compat_tokens_1：定义该变量以承载业务值。 */
const compat_tokens_1 = require("../compat/compat.tokens");
/** env_alias_1：定义该变量以承载业务值。 */
const env_alias_1 = require("../config/env-alias");
/** player_identity_persistence_service_1：定义该变量以承载业务值。 */
const player_identity_persistence_service_1 = require("../persistence/player-identity-persistence.service");
/** player_persistence_service_1：定义该变量以承载业务值。 */
const player_persistence_service_1 = require("../persistence/player-persistence.service");
/** world_legacy_player_repository_1：定义该变量以承载业务值。 */
const world_legacy_player_repository_1 = require("./world-legacy-player-repository");
/** DISABLE_COMPAT_MIGRATION_SOURCE_ENV_KEYS：定义该变量以承载业务值。 */
const DISABLE_COMPAT_MIGRATION_SOURCE_ENV_KEYS = [
    'SERVER_NEXT_AUTH_DISABLE_COMPAT_MIGRATION_SOURCE',
    'NEXT_AUTH_DISABLE_COMPAT_MIGRATION_SOURCE',
];
/** DISABLE_LEGACY_HTTP_IDENTITY_FALLBACK_ENV_KEYS：定义该变量以承载业务值。 */
const DISABLE_LEGACY_HTTP_IDENTITY_FALLBACK_ENV_KEYS = [
    'SERVER_NEXT_AUTH_DISABLE_LEGACY_HTTP_IDENTITY_FALLBACK',
    'NEXT_AUTH_DISABLE_LEGACY_HTTP_IDENTITY_FALLBACK',
];
/** ALLOW_LEGACY_HTTP_IDENTITY_FALLBACK_ENV_KEYS：定义该变量以承载业务值。 */
const ALLOW_LEGACY_HTTP_IDENTITY_FALLBACK_ENV_KEYS = [
    'SERVER_NEXT_ALLOW_LEGACY_HTTP_IDENTITY_FALLBACK',
    'NEXT_ALLOW_LEGACY_HTTP_IDENTITY_FALLBACK',
];
/** isCompatMigrationSourceDisabled：执行对应的业务逻辑。 */
function isCompatMigrationSourceDisabled() {
    for (const key of DISABLE_COMPAT_MIGRATION_SOURCE_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
        if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
            return true;
        }
    }
    return false;
}
/** isCompatMigrationAccessExplicit：执行对应的业务逻辑。 */
function isCompatMigrationAccessExplicit(options) {
    return options?.allowCompatMigration === true;
}
/** isLegacyHttpIdentityFallbackExplicit：执行对应的业务逻辑。 */
function isLegacyHttpIdentityFallbackExplicit(options) {
    return options?.allowLegacyHttpIdentityFallback === true;
}
/** WorldPlayerSourceService：定义该变量以承载业务值。 */
let WorldPlayerSourceService = class WorldPlayerSourceService {
    logger = new common_1.Logger(WorldPlayerSourceService.name);
    legacyAuthUserCompatService;
    playerIdentityPersistenceService;
    playerPersistenceService;
    pool = null;
    poolInitPromise = null;
    poolUnavailable = false;
    poolUnavailableLogged = false;
/** 构造函数：执行实例初始化流程。 */
    constructor(legacyAuthUserCompatService, playerIdentityPersistenceService, playerPersistenceService) {
        this.legacyAuthUserCompatService = legacyAuthUserCompatService;
        this.playerIdentityPersistenceService = playerIdentityPersistenceService;
        this.playerPersistenceService = playerPersistenceService;
    }
/** onModuleInit：执行对应的业务逻辑。 */
    async onModuleInit() {
        await this.ensurePool();
    }
/** onModuleDestroy：执行对应的业务逻辑。 */
    async onModuleDestroy() {
/** pool：定义该变量以承载业务值。 */
        const pool = this.pool;
        this.pool = null;
        this.poolInitPromise = null;
        if (pool) {
            await pool.end().catch(() => undefined);
        }
    }
/** isNextIdentitySourceEnabled：执行对应的业务逻辑。 */
    isNextIdentitySourceEnabled() {
        return typeof this.playerIdentityPersistenceService?.isEnabled === 'function'
            && this.playerIdentityPersistenceService.isEnabled();
    }
/** isNextSnapshotSourceEnabled：执行对应的业务逻辑。 */
    isNextSnapshotSourceEnabled() {
        return typeof this.playerPersistenceService?.isEnabled === 'function'
            && this.playerPersistenceService.isEnabled();
    }
/** loadNextPlayerIdentity：执行对应的业务逻辑。 */
    async loadNextPlayerIdentity(userId) {
        if (!this.isNextIdentitySourceEnabled()
            || typeof this.playerIdentityPersistenceService?.loadPlayerIdentity !== 'function') {
            return null;
        }
        return this.playerIdentityPersistenceService.loadPlayerIdentity(userId);
    }
/** loadNextPlayerSnapshotRecord：执行对应的业务逻辑。 */
    async loadNextPlayerSnapshotRecord(playerId) {
        if (!this.isNextSnapshotSourceEnabled()
            || typeof this.playerPersistenceService?.loadPlayerSnapshotRecord !== 'function') {
            return null;
        }
        return this.playerPersistenceService.loadPlayerSnapshotRecord(playerId);
    }
/** loadNextPlayerSnapshot：执行对应的业务逻辑。 */
    async loadNextPlayerSnapshot(playerId) {
/** record：定义该变量以承载业务值。 */
        const record = await this.loadNextPlayerSnapshotRecord(playerId);
        return record?.snapshot ?? null;
    }
/** isMigrationSourceEnabled：执行对应的业务逻辑。 */
    isMigrationSourceEnabled(options = undefined) {
        return isCompatMigrationAccessExplicit(options)
            && !isCompatMigrationSourceDisabled();
    }
/** resolvePlayerIdentityFromCompatSource：执行对应的业务逻辑。 */
    async resolvePlayerIdentityFromCompatSource(payload, options = undefined) {
/** pool：定义该变量以承载业务值。 */
        const pool = await this.ensurePool();
        if (!pool) {
            return this.resolveCompatIdentityHttpFallback(payload, 'pool_unavailable', options);
        }
/** row：定义该变量以承载业务值。 */
        let row;
        try {
            row = await (0, world_legacy_player_repository_1.queryLegacyPlayerIdentityRow)(pool, payload.sub);
        }
        catch (error) {
            if (isMissingLegacySchemaError(error)) {
                this.logger.warn('World legacy player source auth fallback: users/players tables unavailable, compat identity fallback requested');
                return this.resolveCompatIdentityHttpFallback(payload, 'missing_legacy_schema', options);
            }
            throw error;
        }
        if (!row) {
            return this.resolveCompatIdentityHttpFallback(payload, 'missing_legacy_row', options);
        }
        return {
            userId: row?.userId ?? payload.sub,
            username: row?.username ?? payload.username,
            displayName: resolveDisplayName(row?.displayName, row?.username ?? payload.username, payload.displayName),
            playerId: row?.playerId ?? buildFallbackPlayerId(payload.sub),
            playerName: resolvePlayerName(row?.playerName ?? row?.pendingRoleName ?? null, row?.username ?? payload.username, payload.displayName),
        };
    }
/** resolveCompatIdentityHttpFallback：执行对应的业务逻辑。 */
    async resolveCompatIdentityHttpFallback(payload, reason, options = undefined) {
        if (!isLegacyHttpIdentityFallbackExplicit(options)) {
            this.logger.warn(`World legacy player source compat identity http fallback blocked: reason=${reason} explicit_opt_in_required=true userId=${typeof payload?.sub === 'string' ? payload.sub : 'unknown'}`);
            return null;
        }
        if (!isLegacyHttpIdentityFallbackAllowed() || isLegacyHttpIdentityFallbackDisabled()) {
            this.logger.warn(`World legacy player source compat identity http fallback blocked: reason=${reason} userId=${typeof payload?.sub === 'string' ? payload.sub : 'unknown'}`);
            return null;
        }
        if (!this.legacyAuthUserCompatService) {
            this.logger.warn(`World legacy player source compat identity http fallback unavailable: reason=${reason} compat_http_disabled=true userId=${typeof payload?.sub === 'string' ? payload.sub : 'unknown'}`);
            return null;
        }
        return this.resolveLegacyHttpPlayerIdentity(payload);
    }
/** resolveLegacyHttpPlayerIdentity：执行对应的业务逻辑。 */
    async resolveLegacyHttpPlayerIdentity(payload) {
/** user：定义该变量以承载业务值。 */
        const user = await this.legacyAuthUserCompatService.findUserById(payload.sub);
        if (!user?.id || !user?.username) {
            return null;
        }
/** userId：定义该变量以承载业务值。 */
        const userId = user.id;
/** username：定义该变量以承载业务值。 */
        const username = user.username;
        return {
            userId,
            username,
            displayName: resolveDisplayName(user?.displayName ?? null, username, payload.displayName),
            playerId: buildFallbackPlayerId(userId),
            playerName: resolvePlayerName(user?.pendingRoleName ?? null, username, payload.displayName),
        };
    }
/** loadPlayerSnapshotFromCompatSource：执行对应的业务逻辑。 */
    async loadPlayerSnapshotFromCompatSource(playerId) {
/** pool：定义该变量以承载业务值。 */
        const pool = await this.ensurePool();
        if (!pool) {
            return null;
        }
/** row：定义该变量以承载业务值。 */
        let row;
        try {
            row = await (0, world_legacy_player_repository_1.queryLegacyPlayerSnapshotRow)(pool, playerId);
        }
        catch (error) {
            if (isMissingLegacySchemaError(error)) {
/** message：定义该变量以承载业务值。 */
                const message = `World legacy player source snapshot fallback blocked: playerId=${playerId} users/players tables unavailable`;
                this.logger.error(message);
                throw new Error(message);
            }
            throw error;
        }
        if (!row) {
            return null;
        }
        return toPlayerSnapshotFromCompatRow(row);
    }
/** ensurePool：执行对应的业务逻辑。 */
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
/** databaseUrl：定义该变量以承载业务值。 */
        const databaseUrl = (0, env_alias_1.resolveServerNextDatabaseUrl)();
        if (!databaseUrl.trim()) {
            this.poolUnavailable = true;
            if (!this.poolUnavailableLogged) {
                this.poolUnavailableLogged = true;
                this.logger.warn('World legacy player source degraded: no SERVER_NEXT_DATABASE_URL/DATABASE_URL, fallback to token-only identity');
            }
            return null;
        }
        this.poolInitPromise = (async () => {
/** pool：定义该变量以承载业务值。 */
            const pool = new pg_1.Pool({ connectionString: databaseUrl });
            try {
                await pool.query('SELECT 1');
                this.pool = pool;
                return pool;
            }
            catch (error) {
                this.poolUnavailable = true;
                this.logger.error('World legacy player source database init failed', error instanceof Error ? error.stack : String(error));
                await pool.end().catch(() => undefined);
                return null;
            }
            finally {
                this.poolInitPromise = null;
            }
        })();
        return this.poolInitPromise;
    }
/** resolvePlayerIdentityForMigration：执行对应的业务逻辑。 */
    async resolvePlayerIdentityForMigration(payload, options = undefined) {
        if (!this.isMigrationSourceEnabled(options)) {
            return null;
        }
        return this.resolvePlayerIdentityFromCompatSource(payload, options);
    }
/** loadPlayerSnapshotForMigration：执行对应的业务逻辑。 */
    async loadPlayerSnapshotForMigration(playerId, options = undefined) {
        if (!this.isMigrationSourceEnabled(options)) {
            return null;
        }
        return this.loadPlayerSnapshotFromCompatSource(playerId);
    }
/** resolveCompatPlayerIdentityForMigration：执行对应的业务逻辑。 */
    async resolveCompatPlayerIdentityForMigration(payload, options = undefined) {
        return this.resolvePlayerIdentityForMigration(payload, options);
    }
/** loadCompatPlayerSnapshotForMigration：执行对应的业务逻辑。 */
    async loadCompatPlayerSnapshotForMigration(playerId, options = undefined) {
        return this.loadPlayerSnapshotForMigration(playerId, options);
    }
};
exports.WorldPlayerSourceService = WorldPlayerSourceService;
exports.WorldPlayerSourceService = WorldPlayerSourceService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(compat_tokens_1.LEGACY_AUTH_USER_COMPAT_SERVICE)),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [Object,
        player_identity_persistence_service_1.PlayerIdentityPersistenceService,
        player_persistence_service_1.PlayerPersistenceService])
], WorldPlayerSourceService);
/** isMissingLegacySchemaError：执行对应的业务逻辑。 */
function isMissingLegacySchemaError(error) {
    return Boolean(error && typeof error === 'object' && error.code === '42P01');
}
/** isLegacyHttpIdentityFallbackDisabled：执行对应的业务逻辑。 */
function isLegacyHttpIdentityFallbackDisabled() {
    for (const key of DISABLE_LEGACY_HTTP_IDENTITY_FALLBACK_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
        if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
            return true;
        }
    }
    return false;
}
/** isLegacyHttpIdentityFallbackAllowed：执行对应的业务逻辑。 */
function isLegacyHttpIdentityFallbackAllowed() {
    for (const key of ALLOW_LEGACY_HTTP_IDENTITY_FALLBACK_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
        if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
            return true;
        }
    }
    return false;
}
/** resolveDisplayName：执行对应的业务逻辑。 */
function resolveDisplayName(displayName, username, fallback) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = typeof displayName === 'string' ? displayName.normalize('NFC') : '';
    if (isValidVisibleDisplayName(normalized)) {
        return normalized;
    }
/** normalizedFallback：定义该变量以承载业务值。 */
    const normalizedFallback = typeof fallback === 'string' ? fallback.trim().normalize('NFC') : '';
    if (isValidVisibleDisplayName(normalizedFallback)) {
        return normalizedFallback;
    }
    return (0, shared_1.resolveDefaultVisibleDisplayName)(username.normalize('NFC'));
}
/** resolvePlayerName：执行对应的业务逻辑。 */
function resolvePlayerName(playerName, username, fallback) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = typeof playerName === 'string' ? playerName.trim().normalize('NFC') : '';
    if (normalized) {
        return normalized;
    }
    if (typeof fallback === 'string' && fallback.trim()) {
        return fallback.trim().normalize('NFC');
    }
    return username.normalize('NFC');
}
/** buildFallbackPlayerId：执行对应的业务逻辑。 */
function buildFallbackPlayerId(userId) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = userId.trim();
    return normalized ? `p_${normalized}` : 'p_guest';
}
/** isValidVisibleDisplayName：执行对应的业务逻辑。 */
function isValidVisibleDisplayName(value) {
    return typeof value === 'string'
        && value.length > 0
        && (0, shared_1.getGraphemeCount)(value) === 1
        && (0, shared_1.hasVisibleNameGrapheme)(value)
        && !(0, shared_1.containsInvisibleOnlyNameGrapheme)(value);
}
/** toPlayerSnapshotFromCompatRow：执行对应的业务逻辑。 */
function toPlayerSnapshotFromCompatRow(row) {
/** currentMapId：定义该变量以承载业务值。 */
    const currentMapId = resolveRequiredCompatMapId(row.mapId);
/** inventory：定义该变量以承载业务值。 */
    const inventory = normalizeInventory(row.inventory);
/** buffs：定义该变量以承载业务值。 */
    const buffs = normalizeTemporaryBuffs(row.temporaryBuffs);
/** equipment：定义该变量以承载业务值。 */
    const equipment = normalizeEquipment(row.equipment);
/** techniques：定义该变量以承载业务值。 */
    const techniques = normalizeTechniques(row.techniques);
/** quests：定义该变量以承载业务值。 */
    const quests = normalizeQuests(row.quests);
/** unlockedMapIds：定义该变量以承载业务值。 */
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
/** bodyTraining：定义该变量以承载业务值。 */
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
/** cultivatingTechId：定义该变量以承载业务值。 */
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
/** autoBattle：定义该变量以承载业务值。 */
            autoBattle: row.autoBattle === true,
/** combatTargetId：定义该变量以承载业务值。 */
            combatTargetId: typeof row.combatTargetId === 'string' && row.combatTargetId.trim()
                ? row.combatTargetId.trim()
                : null,
/** combatTargetLocked：定义该变量以承载业务值。 */
            combatTargetLocked: row.combatTargetLocked === true
                && typeof row.combatTargetId === 'string'
                && row.combatTargetId.trim().length > 0,
/** autoRetaliate：定义该变量以承载业务值。 */
            autoRetaliate: row.autoRetaliate !== false,
/** autoBattleStationary：定义该变量以承载业务值。 */
            autoBattleStationary: row.autoBattleStationary === true,
/** allowAoePlayerHit：定义该变量以承载业务值。 */
            allowAoePlayerHit: row.allowAoePlayerHit === true,
/** autoIdleCultivation：定义该变量以承载业务值。 */
            autoIdleCultivation: row.autoIdleCultivation !== false,
/** autoSwitchCultivation：定义该变量以承载业务值。 */
            autoSwitchCultivation: row.autoSwitchCultivation === true,
            senseQiActive: false,
            autoBattleSkills: normalizeAutoBattleSkills(row.autoBattleSkills),
        },
    };
}
exports.toPlayerSnapshotFromCompatRow = toPlayerSnapshotFromCompatRow;
/** resolveRequiredCompatMapId：执行对应的业务逻辑。 */
function resolveRequiredCompatMapId(value) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) {
        throw new Error('Compat player snapshot invalid mapId');
    }
    return normalized;
}
/** normalizeInventory：执行对应的业务逻辑。 */
function normalizeInventory(value) {
    if (!value || typeof value !== 'object') {
        return {
            revision: 1,
            capacity: shared_1.DEFAULT_INVENTORY_CAPACITY,
            items: [],
        };
    }
/** inventory：定义该变量以承载业务值。 */
    const inventory = value;
    return {
        revision: 1,
        capacity: Math.max(shared_1.DEFAULT_INVENTORY_CAPACITY, toFiniteInt(inventory.capacity, shared_1.DEFAULT_INVENTORY_CAPACITY)),
        items: Array.isArray(inventory.items)
            ? inventory.items.map(normalizeItem).filter((entry) => entry !== null)
            : [],
    };
}
/** normalizeEquipment：执行对应的业务逻辑。 */
function normalizeEquipment(value) {
/** equipment：定义该变量以承载业务值。 */
    const equipment = value && typeof value === 'object'
        ? value
        : {};
/** slots：定义该变量以承载业务值。 */
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
/** normalizeTemporaryBuffs：执行对应的业务逻辑。 */
function normalizeTemporaryBuffs(value) {
    if (!Array.isArray(value)) {
        return [];
    }
/** buffs：定义该变量以承载业务值。 */
    const buffs = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
/** buff：定义该变量以承载业务值。 */
        const buff = entry;
/** buffId：定义该变量以承载业务值。 */
        const buffId = typeof buff.buffId === 'string' ? buff.buffId.trim() : '';
/** name：定义该变量以承载业务值。 */
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
/** normalizeTechniques：执行对应的业务逻辑。 */
function normalizeTechniques(value) {
    if (!Array.isArray(value)) {
        return [];
    }
/** techniques：定义该变量以承载业务值。 */
    const techniques = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
/** technique：定义该变量以承载业务值。 */
        const technique = entry;
/** techId：定义该变量以承载业务值。 */
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
/** name：定义该变量以承载业务值。 */
            name: typeof technique.name === 'string' ? technique.name : undefined,
/** grade：定义该变量以承载业务值。 */
            grade: typeof technique.grade === 'string' ? technique.grade : undefined,
/** category：定义该变量以承载业务值。 */
            category: typeof technique.category === 'string' ? technique.category : undefined,
            skills: Array.isArray(technique.skills) ? technique.skills.map((entry) => ({ ...entry })) : [],
            layers: Array.isArray(technique.layers)
                ? technique.layers.map((layer) => ({
                    level: Math.max(1, toFiniteInt(layer?.level, 1)),
                    expToNext: Math.max(0, toFiniteInt(layer?.expToNext, 0)),
/** attrs：定义该变量以承载业务值。 */
                    attrs: layer?.attrs && typeof layer.attrs === 'object' ? { ...layer.attrs } : undefined,
                }))
                : undefined,
/** attrCurves：定义该变量以承载业务值。 */
            attrCurves: technique.attrCurves && typeof technique.attrCurves === 'object' ? { ...technique.attrCurves } : undefined,
        });
    }
    techniques.sort((left, right) => left.techId.localeCompare(right.techId, 'zh-Hans-CN'));
    return techniques;
}
/** normalizeQuests：执行对应的业务逻辑。 */
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
/** normalizeUnlockedMapIds：执行对应的业务逻辑。 */
function normalizeUnlockedMapIds(value) {
    if (!Array.isArray(value)) {
        throw new Error('Compat player snapshot invalid unlockedMinimapIds');
    }
/** result：定义该变量以承载业务值。 */
    const result = new Set();
    for (const entry of value) {
        if (typeof entry === 'string' && entry.trim()) {
            result.add(entry);
        }
    }
    return Array.from(result).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
}
/** normalizeAutoBattleSkills：执行对应的业务逻辑。 */
function normalizeAutoBattleSkills(value) {
    if (!Array.isArray(value)) {
        return [];
    }
/** result：定义该变量以承载业务值。 */
    const result = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
/** config：定义该变量以承载业务值。 */
        const config = entry;
/** skillId：定义该变量以承载业务值。 */
        const skillId = typeof config.skillId === 'string' ? config.skillId.trim() : '';
        if (!skillId) {
            continue;
        }
        result.push({
            skillId,
/** enabled：定义该变量以承载业务值。 */
            enabled: config.enabled !== false,
            skillEnabled: config.skillEnabled,
            autoBattleOrder: Number.isFinite(config.autoBattleOrder) ? Math.max(0, Math.trunc(config.autoBattleOrder)) : undefined,
        });
    }
    return result;
}
/** normalizeItem：执行对应的业务逻辑。 */
function normalizeItem(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }
/** item：定义该变量以承载业务值。 */
    const item = value;
/** itemId：定义该变量以承载业务值。 */
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
/** normalizeDirection：执行对应的业务逻辑。 */
function normalizeDirection(value) {
    if (typeof value === 'number' && value in shared_1.Direction) {
        return value;
    }
    return shared_1.Direction.South;
}
/** normalizeTechniqueRealm：执行对应的业务逻辑。 */
function normalizeTechniqueRealm(value) {
    if (typeof value === 'number' && value in shared_1.TechniqueRealm) {
        return value;
    }
    return undefined;
}
/** toFiniteInt：执行对应的业务逻辑。 */
function toFiniteInt(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.trunc(value)
        : fallback;
}
/** toFiniteNumber：执行对应的业务逻辑。 */
function toFiniteNumber(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Number(value)
        : fallback;
}
/** toNullablePositiveInt：执行对应的业务逻辑。 */
function toNullablePositiveInt(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? Math.trunc(value)
        : null;
}
/** normalizeLegacyRealmState：执行对应的业务逻辑。 */
function normalizeLegacyRealmState(value) {
    if (!Array.isArray(value)) {
        return createRealmState();
    }
/** entry：定义该变量以承载业务值。 */
    const entry = value.find((bonus) => (bonus
        && typeof bonus === 'object'
        && (bonus.source === 'realm:state' || bonus.source === 'runtime:realm_state')));
/** stage：定义该变量以承载业务值。 */
    const stage = typeof entry?.meta?.stage === 'number' && entry.meta.stage in shared_1.PlayerRealmStage
        ? entry.meta.stage
        : shared_1.DEFAULT_PLAYER_REALM_STAGE;
/** config：定义该变量以承载业务值。 */
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
/** normalizePendingLogbookMessages：执行对应的业务逻辑。 */
function normalizePendingLogbookMessages(value) {
    if (!Array.isArray(value)) {
        return [];
    }
/** normalized：定义该变量以承载业务值。 */
    const normalized = [];
/** indexById：定义该变量以承载业务值。 */
    const indexById = new Map();
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
/** candidate：定义该变量以承载业务值。 */
        const candidate = {
/** id：定义该变量以承载业务值。 */
            id: typeof entry.id === 'string' ? entry.id.trim() : '',
            kind: normalizePendingLogbookKind(entry.kind),
/** text：定义该变量以承载业务值。 */
            text: typeof entry.text === 'string' ? entry.text.trim() : '',
/** from：定义该变量以承载业务值。 */
            from: typeof entry.from === 'string' && entry.from.trim().length > 0 ? entry.from.trim() : undefined,
            at: Number.isFinite(entry.at) ? Math.max(0, Math.trunc(entry.at)) : 0,
        };
        if (!candidate.id || !candidate.text) {
            continue;
        }
/** existingIndex：定义该变量以承载业务值。 */
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
/** normalizePendingLogbookKind：执行对应的业务逻辑。 */
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
/** normalizeRuntimeBonuses：执行对应的业务逻辑。 */
function normalizeRuntimeBonuses(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({
/** source：定义该变量以承载业务值。 */
        source: canonicalizeRuntimeBonusSource(typeof entry.source === 'string' ? entry.source : ''),
/** label：定义该变量以承载业务值。 */
        label: typeof entry.label === 'string' ? entry.label : undefined,
/** attrs：定义该变量以承载业务值。 */
        attrs: entry.attrs && typeof entry.attrs === 'object' ? { ...entry.attrs } : undefined,
/** stats：定义该变量以承载业务值。 */
        stats: entry.stats && typeof entry.stats === 'object' ? { ...entry.stats } : undefined,
        qiProjection: Array.isArray(entry.qiProjection) ? entry.qiProjection.map((item) => ({ ...item })) : undefined,
/** meta：定义该变量以承载业务值。 */
        meta: entry.meta && typeof entry.meta === 'object' ? { ...entry.meta } : undefined,
    }))
        .filter((entry) => entry.source.length > 0);
}
/** canonicalizeRuntimeBonusSource：执行对应的业务逻辑。 */
function canonicalizeRuntimeBonusSource(source) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = typeof source === 'string' ? source.trim() : '';
    if (!normalized) {
        return '';
    }
    if (normalized === 'legacy:vitals_baseline') {
        return 'runtime:vitals_baseline';
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
/** createRealmState：执行对应的业务逻辑。 */
function createRealmState() {
/** stage：定义该变量以承载业务值。 */
    const stage = shared_1.DEFAULT_PLAYER_REALM_STAGE;
/** config：定义该变量以承载业务值。 */
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
/** normalizeHeavenGateState：执行对应的业务逻辑。 */
function normalizeHeavenGateState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
/** raw：定义该变量以承载业务值。 */
    const raw = value;
    return {
/** unlocked：定义该变量以承载业务值。 */
        unlocked: raw.unlocked === true,
        severed: Array.isArray(raw.severed)
            ? raw.severed.filter((entry) => typeof entry === 'string')
            : [],
        roots: normalizeHeavenGateRoots(raw.roots),
/** entered：定义该变量以承载业务值。 */
        entered: raw.entered === true,
        averageBonus: toFiniteInt(raw.averageBonus, 0),
    };
}
/** normalizeHeavenGateRoots：执行对应的业务逻辑。 */
function normalizeHeavenGateRoots(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
/** raw：定义该变量以承载业务值。 */
    const raw = value;
    return {
        metal: Math.max(0, Math.min(100, toFiniteInt(raw.metal, 0))),
        wood: Math.max(0, Math.min(100, toFiniteInt(raw.wood, 0))),
        water: Math.max(0, Math.min(100, toFiniteInt(raw.water, 0))),
        fire: Math.max(0, Math.min(100, toFiniteInt(raw.fire, 0))),
        earth: Math.max(0, Math.min(100, toFiniteInt(raw.earth, 0))),
    };
}
/** resolveRealmLevelFromStage：执行对应的业务逻辑。 */
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
