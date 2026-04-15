"use strict";
/** __decorate：定义该变量以承载业务值。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** PlayerPersistenceService_1：定义该变量以承载业务值。 */
var PlayerPersistenceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerPersistenceService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** pg_1：定义该变量以承载业务值。 */
const pg_1 = require("pg");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** persistent_document_table_1：定义该变量以承载业务值。 */
const persistent_document_table_1 = require("./persistent-document-table");
/** player_snapshot_compat_1：定义该变量以承载业务值。 */
const player_snapshot_compat_1 = require("./player-snapshot-compat");
/** env_alias_1：定义该变量以承载业务值。 */
const env_alias_1 = require("../config/env-alias");
/** PLAYER_SNAPSHOT_SCOPE：定义该变量以承载业务值。 */
const PLAYER_SNAPSHOT_SCOPE = 'server_next_player_snapshots_v1';
/** PLAYER_SNAPSHOT_META_KEY：定义该变量以承载业务值。 */
const PLAYER_SNAPSHOT_META_KEY = '__snapshotMeta';
/** PLAYER_SNAPSHOT_PERSISTED_SOURCE_NATIVE：定义该变量以承载业务值。 */
const PLAYER_SNAPSHOT_PERSISTED_SOURCE_NATIVE = 'native';
/** PLAYER_SNAPSHOT_PERSISTED_SOURCE_LEGACY_SEEDED：定义该变量以承载业务值。 */
const PLAYER_SNAPSHOT_PERSISTED_SOURCE_LEGACY_SEEDED = 'legacy_seeded';
/** PlayerPersistenceService：定义该变量以承载业务值。 */
let PlayerPersistenceService = PlayerPersistenceService_1 = class PlayerPersistenceService {
    logger = new common_1.Logger(PlayerPersistenceService_1.name);
    pool = null;
    enabled = false;
/** onModuleInit：执行对应的业务逻辑。 */
    async onModuleInit() {
/** databaseUrl：定义该变量以承载业务值。 */
        const databaseUrl = (0, env_alias_1.resolveServerNextDatabaseUrl)();
        if (!databaseUrl.trim()) {
            this.logger.log('玩家快照持久化已禁用：未提供 SERVER_NEXT_DATABASE_URL/DATABASE_URL');
            return;
        }
        this.pool = new pg_1.Pool({
            connectionString: databaseUrl,
        });
        try {
            await (0, persistent_document_table_1.ensurePersistentDocumentsTable)(this.pool);
            this.enabled = true;
            this.logger.log('玩家快照持久化已启用（persistent_documents）');
        }
        catch (error) {
            this.logger.error('玩家快照持久化初始化失败，已回退为禁用模式', error instanceof Error ? error.stack : String(error));
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
/** loadPlayerSnapshot：执行对应的业务逻辑。 */
    async loadPlayerSnapshot(playerId) {
/** record：定义该变量以承载业务值。 */
        const record = await this.loadPlayerSnapshotRecord(playerId);
        return record?.snapshot ?? null;
    }
/** loadPlayerSnapshotRecord：执行对应的业务逻辑。 */
    async loadPlayerSnapshotRecord(playerId) {
        if (!this.pool || !this.enabled) {
            return null;
        }
/** result：定义该变量以承载业务值。 */
        const result = await this.pool.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2', [PLAYER_SNAPSHOT_SCOPE, playerId]);
        if (result.rowCount === 0) {
            return null;
        }
/** record：定义该变量以承载业务值。 */
        const record = normalizePlayerSnapshotRecord(result.rows[0]?.payload);
        if (!record) {
/** message：定义该变量以承载业务值。 */
            const message = `Persisted player snapshot record invalid: playerId=${playerId} scope=${PLAYER_SNAPSHOT_SCOPE}`;
            this.logger.error(message);
            throw new Error(message);
        }
        return record;
    }
/** listPlayerSnapshots：执行对应的业务逻辑。 */
    async listPlayerSnapshots() {
        if (!this.pool || !this.enabled) {
            return [];
        }
/** result：定义该变量以承载业务值。 */
        const result = await this.pool.query('SELECT key, payload, "updatedAt" FROM persistent_documents WHERE scope = $1 ORDER BY key ASC', [PLAYER_SNAPSHOT_SCOPE]);
        return result.rows
            .map((row) => {
/** playerId：定义该变量以承载业务值。 */
            const playerId = typeof row?.key === 'string' ? row.key.trim() : '';
/** record：定义该变量以承载业务值。 */
            const record = normalizePlayerSnapshotRecord(row?.payload);
/** snapshot：定义该变量以承载业务值。 */
            const snapshot = record?.snapshot ?? null;
            if (!playerId || !snapshot) {
                return null;
            }
            return {
                playerId,
                snapshot,
                updatedAt: row?.updatedAt instanceof Date
                    ? row.updatedAt.getTime()
                    : Date.parse(String(row?.updatedAt ?? '')) || 0,
            };
        })
            .filter((entry) => entry !== null);
    }
/** savePlayerSnapshot：执行对应的业务逻辑。 */
    async savePlayerSnapshot(playerId, snapshot, options = undefined) {
        if (!this.pool || !this.enabled) {
            return;
        }
/** normalizedSnapshot：定义该变量以承载业务值。 */
        const normalizedSnapshot = normalizePlayerSnapshotPayload(snapshot);
        if (!normalizedSnapshot) {
            return;
        }
/** persistedSource：定义该变量以承载业务值。 */
        const persistedSource = normalizePlayerSnapshotPersistedSource(options?.persistedSource)
            ?? PLAYER_SNAPSHOT_PERSISTED_SOURCE_NATIVE;
/** payload：定义该变量以承载业务值。 */
        const payload = buildPersistedPlayerSnapshotPayload(normalizedSnapshot, {
            persistedSource,
            seededAt: options?.seededAt,
        });
        await this.pool.query(`
        INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
        VALUES ($1, $2, $3::jsonb, now())
        ON CONFLICT (scope, key)
        DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
      `, [PLAYER_SNAPSHOT_SCOPE, playerId, JSON.stringify(payload)]);
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
exports.PlayerPersistenceService = PlayerPersistenceService;
exports.PlayerPersistenceService = PlayerPersistenceService = PlayerPersistenceService_1 = __decorate([
    (0, common_1.Injectable)()
], PlayerPersistenceService);
/** normalizePlayerSnapshotRecord：执行对应的业务逻辑。 */
function normalizePlayerSnapshotRecord(raw) {
/** snapshot：定义该变量以承载业务值。 */
    const snapshot = normalizePlayerSnapshotPayload(raw);
    if (!snapshot) {
        return null;
    }
/** meta：定义该变量以承载业务值。 */
    const meta = raw && typeof raw === 'object' ? raw[PLAYER_SNAPSHOT_META_KEY] : null;
    return {
        snapshot,
        persistedSource: normalizePlayerSnapshotPersistedSource(meta?.persistedSource)
            ?? PLAYER_SNAPSHOT_PERSISTED_SOURCE_NATIVE,
        seededAt: Number.isFinite(meta?.seededAt) ? Math.max(0, Math.trunc(meta.seededAt)) : null,
    };
}
/** normalizePlayerSnapshotPayload：执行对应的业务逻辑。 */
function normalizePlayerSnapshotPayload(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
/** snapshot：定义该变量以承载业务值。 */
    const snapshot = raw;
    if (snapshot.version !== 1 || typeof snapshot.placement?.templateId !== 'string') {
        return null;
    }
/** vitals：定义该变量以承载业务值。 */
    const vitals = snapshot.vitals ?? {};
/** inventory：定义该变量以承载业务值。 */
    const inventory = snapshot.inventory ?? {};
/** equipment：定义该变量以承载业务值。 */
    const equipment = snapshot.equipment ?? {};
/** techniques：定义该变量以承载业务值。 */
    const techniques = snapshot.techniques ?? {};
/** buffs：定义该变量以承载业务值。 */
    const buffs = snapshot.buffs ?? {};
/** quests：定义该变量以承载业务值。 */
    const quests = snapshot.quests ?? {};
/** combat：定义该变量以承载业务值。 */
    const combat = snapshot.combat ?? {};
/** progression：定义该变量以承载业务值。 */
    const progression = snapshot.progression ?? {};
    return {
        version: 1,
        savedAt: Number.isFinite(snapshot.savedAt) ? Number(snapshot.savedAt) : Date.now(),
        placement: {
            templateId: snapshot.placement.templateId,
            x: Number.isFinite(snapshot.placement.x) ? Math.trunc(snapshot.placement.x) : 0,
            y: Number.isFinite(snapshot.placement.y) ? Math.trunc(snapshot.placement.y) : 0,
            facing: Number.isFinite(snapshot.placement.facing) ? Math.trunc(snapshot.placement.facing) : 1,
        },
        vitals: {
            hp: isFiniteNumber(vitals.hp) ? Math.trunc(vitals.hp) : 100,
            maxHp: isFiniteNumber(vitals.maxHp) ? Math.trunc(vitals.maxHp) : 100,
            qi: isFiniteNumber(vitals.qi) ? Math.trunc(vitals.qi) : 0,
            maxQi: isFiniteNumber(vitals.maxQi) ? Math.trunc(vitals.maxQi) : 100,
        },
        progression: {
            foundation: isFiniteNumber(progression.foundation) ? Math.trunc(progression.foundation) : 0,
            combatExp: isFiniteNumber(progression.combatExp) ? Math.trunc(progression.combatExp) : 0,
/** bodyTraining：定义该变量以承载业务值。 */
            bodyTraining: typeof progression.bodyTraining === 'object' && progression.bodyTraining ? progression.bodyTraining : null,
            alchemySkill: typeof progression.alchemySkill === 'object' && progression.alchemySkill ? progression.alchemySkill : null,
            gatherSkill: typeof progression.gatherSkill === 'object' && progression.gatherSkill ? progression.gatherSkill : null,
            alchemyPresets: Array.isArray(progression.alchemyPresets) ? progression.alchemyPresets : [],
            alchemyJob: typeof progression.alchemyJob === 'object' && progression.alchemyJob ? progression.alchemyJob : null,
            enhancementSkill: typeof progression.enhancementSkill === 'object' && progression.enhancementSkill ? progression.enhancementSkill : null,
            enhancementSkillLevel: isFiniteNumber(progression.enhancementSkillLevel) ? Math.max(1, Math.trunc(progression.enhancementSkillLevel)) : 1,
            enhancementJob: typeof progression.enhancementJob === 'object' && progression.enhancementJob ? progression.enhancementJob : null,
            enhancementRecords: Array.isArray(progression.enhancementRecords) ? progression.enhancementRecords : [],
            boneAgeBaseYears: isFiniteNumber(progression.boneAgeBaseYears) ? Math.trunc(progression.boneAgeBaseYears) : 16,
            lifeElapsedTicks: isFiniteNumber(progression.lifeElapsedTicks) ? Number(progression.lifeElapsedTicks) : 0,
            lifespanYears: isFiniteNumber(progression.lifespanYears) ? Math.trunc(progression.lifespanYears) : null,
/** realm：定义该变量以承载业务值。 */
            realm: typeof progression.realm === 'object' && progression.realm ? progression.realm : null,
/** heavenGate：定义该变量以承载业务值。 */
            heavenGate: typeof progression.heavenGate === 'object' && progression.heavenGate ? progression.heavenGate : null,
/** spiritualRoots：定义该变量以承载业务值。 */
            spiritualRoots: typeof progression.spiritualRoots === 'object' && progression.spiritualRoots ? progression.spiritualRoots : null,
        },
        unlockedMapIds: Array.isArray(snapshot.unlockedMapIds)
            ? Array.from(new Set(snapshot.unlockedMapIds.filter((entry) => typeof entry === 'string' && entry.trim().length > 0))).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
            : [],
        inventory: {
            revision: isFiniteNumber(inventory.revision) ? Math.trunc(inventory.revision) : 1,
            capacity: isFiniteNumber(inventory.capacity)
                ? Math.max(shared_1.DEFAULT_INVENTORY_CAPACITY, Math.trunc(inventory.capacity))
                : shared_1.DEFAULT_INVENTORY_CAPACITY,
            items: Array.isArray(inventory.items) ? inventory.items : [],
        },
        equipment: {
            revision: isFiniteNumber(equipment.revision) ? Math.trunc(equipment.revision) : 1,
            slots: Array.isArray(equipment.slots) ? equipment.slots : [],
        },
        techniques: {
            revision: isFiniteNumber(techniques.revision) ? Math.trunc(techniques.revision) : 1,
            techniques: Array.isArray(techniques.techniques) ? techniques.techniques : [],
/** cultivatingTechId：定义该变量以承载业务值。 */
            cultivatingTechId: typeof techniques.cultivatingTechId === 'string' || techniques.cultivatingTechId === null
                ? techniques.cultivatingTechId
                : null,
        },
        buffs: {
            revision: isFiniteNumber(buffs.revision) ? Math.trunc(buffs.revision) : 1,
            buffs: Array.isArray(buffs.buffs) ? buffs.buffs : [],
        },
        quests: {
            revision: isFiniteNumber(quests.revision) ? Math.trunc(quests.revision) : 1,
            entries: Array.isArray(quests.entries) ? quests.entries : [],
        },
        combat: {
/** autoBattle：定义该变量以承载业务值。 */
            autoBattle: combat.autoBattle === true,
/** autoRetaliate：定义该变量以承载业务值。 */
            autoRetaliate: combat.autoRetaliate !== false,
/** autoBattleStationary：定义该变量以承载业务值。 */
            autoBattleStationary: combat.autoBattleStationary === true,
/** combatTargetId：定义该变量以承载业务值。 */
            combatTargetId: typeof combat.combatTargetId === 'string' && combat.combatTargetId.trim()
                ? combat.combatTargetId.trim()
                : null,
/** combatTargetLocked：定义该变量以承载业务值。 */
            combatTargetLocked: combat.combatTargetLocked === true,
/** allowAoePlayerHit：定义该变量以承载业务值。 */
            allowAoePlayerHit: combat.allowAoePlayerHit === true,
/** autoIdleCultivation：定义该变量以承载业务值。 */
            autoIdleCultivation: combat.autoIdleCultivation !== false,
/** autoSwitchCultivation：定义该变量以承载业务值。 */
            autoSwitchCultivation: combat.autoSwitchCultivation === true,
/** senseQiActive：定义该变量以承载业务值。 */
            senseQiActive: combat.senseQiActive === true,
            autoBattleSkills: Array.isArray(combat.autoBattleSkills) ? combat.autoBattleSkills : [],
        },
        pendingLogbookMessages: normalizePendingLogbookMessages((0, player_snapshot_compat_1.resolveCompatiblePendingLogbookMessages)(snapshot)),
        runtimeBonuses: normalizeRuntimeBonuses((0, player_snapshot_compat_1.resolveCompatibleRuntimeBonuses)(snapshot)),
    };
}
/** buildPersistedPlayerSnapshotPayload：执行对应的业务逻辑。 */
function buildPersistedPlayerSnapshotPayload(snapshot, meta) {
/** payload：定义该变量以承载业务值。 */
    const payload = {
        ...snapshot,
    };
    payload[PLAYER_SNAPSHOT_META_KEY] = {
        persistedSource: normalizePlayerSnapshotPersistedSource(meta?.persistedSource)
            ?? PLAYER_SNAPSHOT_PERSISTED_SOURCE_NATIVE,
    };
    if (Number.isFinite(meta?.seededAt)) {
        payload[PLAYER_SNAPSHOT_META_KEY].seededAt = Math.max(0, Math.trunc(meta.seededAt));
    }
    return payload;
}
/** normalizePlayerSnapshotPersistedSource：执行对应的业务逻辑。 */
function normalizePlayerSnapshotPersistedSource(value) {
    return value === PLAYER_SNAPSHOT_PERSISTED_SOURCE_LEGACY_SEEDED
        ? PLAYER_SNAPSHOT_PERSISTED_SOURCE_LEGACY_SEEDED
        : value === PLAYER_SNAPSHOT_PERSISTED_SOURCE_NATIVE
            ? PLAYER_SNAPSHOT_PERSISTED_SOURCE_NATIVE
            : null;
}
/** isFiniteNumber：执行对应的业务逻辑。 */
function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
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
        source: (0, player_snapshot_compat_1.canonicalizeRuntimeBonusSource)(typeof entry.source === 'string' ? entry.source : ''),
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
        if (!isPendingLogbookMessage(entry)) {
            continue;
        }
/** candidate：定义该变量以承载业务值。 */
        const candidate = {
            id: entry.id.trim(),
            kind: normalizePendingLogbookKind(entry.kind),
            text: entry.text.trim(),
/** from：定义该变量以承载业务值。 */
            from: typeof entry.from === 'string' && entry.from.trim().length > 0 ? entry.from.trim() : undefined,
            at: Math.max(0, Math.trunc(entry.at)),
        };
        if (!candidate.id || !candidate.text) {
            continue;
        }
/** existingIndex：定义该变量以承载业务值。 */
        const existingIndex = indexById.get(candidate.id);
        if (existingIndex !== undefined) {
            normalized[existingIndex] = candidate;
        }
        else {
            indexById.set(candidate.id, normalized.length);
            normalized.push(candidate);
        }
    }
    return normalized.slice(-200);
}
/** isPendingLogbookMessage：执行对应的业务逻辑。 */
function isPendingLogbookMessage(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
/** candidate：定义该变量以承载业务值。 */
    const candidate = value;
    return typeof candidate.id === 'string'
        && normalizePendingLogbookKind(candidate.kind) === candidate.kind
        && typeof candidate.text === 'string'
        && (candidate.from === undefined || typeof candidate.from === 'string')
        && isFiniteNumber(candidate.at);
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
//# sourceMappingURL=player-persistence.service.js.map
