"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var PlayerPersistenceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerPersistenceService = void 0;

const common_1 = require("@nestjs/common");

const pg_1 = require("pg");

const shared_1 = require("@mud/shared-next");

const env_alias_1 = require("../config/env-alias");

const PLAYER_SNAPSHOT_SCOPE = 'server_next_player_snapshots_v1';

const PLAYER_SNAPSHOT_TABLE = 'server_next_player_snapshot';

const CREATE_PLAYER_SNAPSHOT_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${PLAYER_SNAPSHOT_TABLE} (
    player_id varchar(100) PRIMARY KEY,
    template_id varchar(120) NOT NULL,
    persisted_source varchar(32) NOT NULL,
    seeded_at bigint,
    saved_at bigint NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL
  )
`;

const CREATE_PLAYER_SNAPSHOT_TEMPLATE_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS server_next_player_snapshot_template_idx
  ON ${PLAYER_SNAPSHOT_TABLE}(template_id)
`;

const CREATE_PLAYER_SNAPSHOT_SOURCE_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS server_next_player_snapshot_source_idx
  ON ${PLAYER_SNAPSHOT_TABLE}(persisted_source)
`;

const PLAYER_SNAPSHOT_META_KEY = '__snapshotMeta';

const PLAYER_SNAPSHOT_PERSISTED_SOURCE_NATIVE = 'native';

const PLAYER_SNAPSHOT_PERSISTED_SOURCE_LEGACY_SEEDED = 'legacy_seeded';

let PlayerPersistenceService = PlayerPersistenceService_1 = class PlayerPersistenceService {
    logger = new common_1.Logger(PlayerPersistenceService_1.name);
    pool = null;
    enabled = false;
    async onModuleInit() {

        const databaseUrl = (0, env_alias_1.resolveServerNextDatabaseUrl)();
        if (!databaseUrl.trim()) {
            this.logger.log('玩家快照持久化已禁用：未提供 SERVER_NEXT_DATABASE_URL/DATABASE_URL');
            return;
        }
        this.pool = new pg_1.Pool({
            connectionString: databaseUrl,
        });
        try {
            await ensurePlayerSnapshotTable(this.pool);
            this.enabled = true;
            this.logger.log('玩家快照持久化已启用（server_next_player_snapshot）');
        }
        catch (error) {
            this.logger.error('玩家快照持久化初始化失败，已回退为禁用模式', error instanceof Error ? error.stack : String(error));
            await this.safeClosePool();
        }
    }
    async onModuleDestroy() {
        await this.safeClosePool();
    }
    isEnabled() {
        return this.enabled && this.pool !== null;
    }
    async loadPlayerSnapshot(playerId) {

        const record = await this.loadPlayerSnapshotRecord(playerId);
        return record?.snapshot ?? null;
    }
    async loadPlayerSnapshotRecord(playerId) {
        if (!this.pool || !this.enabled) {
            return null;
        }

        const result = await this.pool.query(`
        SELECT
          player_id,
          template_id,
          persisted_source,
          seeded_at,
          saved_at,
          updated_at,
          payload
        FROM ${PLAYER_SNAPSHOT_TABLE}
        WHERE player_id = $1
        LIMIT 1
      `, [playerId]);
        if (result.rowCount === 0) {
            return null;
        }

        const record = normalizePersistedPlayerSnapshotRow(result.rows[0]);
        if (!record) {

            const message = `Persisted player snapshot record invalid: playerId=${playerId} table=${PLAYER_SNAPSHOT_TABLE}`;
            this.logger.error(message);
            throw new Error(message);
        }
        return record;
    }
    async listPlayerSnapshots() {
        if (!this.pool || !this.enabled) {
            return [];
        }

        const result = await this.pool.query(`
        SELECT
          player_id,
          updated_at,
          payload
        FROM ${PLAYER_SNAPSHOT_TABLE}
        ORDER BY player_id ASC
      `);
        return result.rows
            .map((row) => {
            const playerId = typeof row?.player_id === 'string' ? row.player_id.trim() : '';
            const record = normalizePersistedPlayerSnapshotRow(row);

            const snapshot = record?.snapshot ?? null;
            if (!playerId || !snapshot) {
                return null;
            }
            return {
                playerId,
                snapshot,
                updatedAt: row?.updated_at instanceof Date
                    ? row.updated_at.getTime()
                    : Date.parse(String(row?.updated_at ?? '')) || 0,
            };
        })
            .filter((entry) => entry !== null);
    }
    async savePlayerSnapshot(playerId, snapshot, options = undefined) {
        if (!this.pool || !this.enabled) {
            return;
        }

        const normalizedSnapshot = normalizePlayerSnapshotPayload(snapshot);
        if (!normalizedSnapshot) {
            return;
        }

        const persistedSource = normalizePlayerSnapshotPersistedSource(options?.persistedSource)
            ?? PLAYER_SNAPSHOT_PERSISTED_SOURCE_NATIVE;

        const payload = buildPersistedPlayerSnapshotPayload(normalizedSnapshot, {
            persistedSource,
            seededAt: options?.seededAt,
        });
        await this.pool.query(`
        INSERT INTO ${PLAYER_SNAPSHOT_TABLE}(
          player_id,
          template_id,
          persisted_source,
          seeded_at,
          saved_at,
          updated_at,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, now(), $6::jsonb)
        ON CONFLICT (player_id)
        DO UPDATE SET
          template_id = EXCLUDED.template_id,
          persisted_source = EXCLUDED.persisted_source,
          seeded_at = EXCLUDED.seeded_at,
          saved_at = EXCLUDED.saved_at,
          updated_at = now(),
          payload = EXCLUDED.payload
      `, [
            playerId,
            normalizedSnapshot.placement.templateId,
            persistedSource,
            Number.isFinite(options?.seededAt) ? Math.max(0, Math.trunc(options.seededAt)) : null,
            Math.max(0, Math.trunc(normalizedSnapshot.savedAt)),
            JSON.stringify(payload),
        ]);
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
exports.PlayerPersistenceService = PlayerPersistenceService;
exports.PlayerPersistenceService = PlayerPersistenceService = PlayerPersistenceService_1 = __decorate([
    (0, common_1.Injectable)()
], PlayerPersistenceService);
async function ensurePlayerSnapshotTable(pool) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(CREATE_PLAYER_SNAPSHOT_TABLE_SQL);
        await client.query(CREATE_PLAYER_SNAPSHOT_TEMPLATE_INDEX_SQL);
        await client.query(CREATE_PLAYER_SNAPSHOT_SOURCE_INDEX_SQL);
        await migrateLegacySnapshotDocumentsToTable(client);
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
async function migrateLegacySnapshotDocumentsToTable(client) {
    const existing = await client.query(`SELECT 1 FROM ${PLAYER_SNAPSHOT_TABLE} LIMIT 1`);
    if (existing.rowCount > 0) {
        return;
    }
    const relation = await client.query(`SELECT to_regclass('public.persistent_documents') AS relation_name`);
    if (!relation.rows[0]?.relation_name) {
        return;
    }
    const legacyRows = await client.query('SELECT key, payload FROM persistent_documents WHERE scope = $1 ORDER BY key ASC', [PLAYER_SNAPSHOT_SCOPE]);
    for (const row of legacyRows.rows) {
        const record = normalizePlayerSnapshotRecord(row?.payload);
        if (!record?.snapshot) {
            continue;
        }
        const playerId = typeof row?.key === 'string' ? row.key.trim() : '';
        if (!playerId) {
            continue;
        }
        await client.query(`
        INSERT INTO ${PLAYER_SNAPSHOT_TABLE}(
          player_id,
          template_id,
          persisted_source,
          seeded_at,
          saved_at,
          updated_at,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, now(), $6::jsonb)
        ON CONFLICT (player_id) DO NOTHING
      `, [
            playerId,
            record.snapshot.placement.templateId,
            record.persistedSource,
            record.seededAt,
            Math.max(0, Math.trunc(record.snapshot.savedAt)),
            JSON.stringify(buildPersistedPlayerSnapshotPayload(record.snapshot, {
                persistedSource: record.persistedSource,
                seededAt: record.seededAt,
            })),
        ]);
    }
}
function normalizePersistedPlayerSnapshotRow(row) {
    if (!row || typeof row !== 'object') {
        return null;
    }
    const record = normalizePlayerSnapshotRecord(row.payload);
    if (!record?.snapshot) {
        return null;
    }
    return {
        snapshot: {
            ...record.snapshot,
            savedAt: Number.isFinite(row.saved_at)
                ? Math.max(0, Math.trunc(row.saved_at))
                : record.snapshot.savedAt,
            placement: {
                ...record.snapshot.placement,
                templateId: typeof row.template_id === 'string' && row.template_id.trim()
                    ? row.template_id.trim()
                    : record.snapshot.placement.templateId,
            },
        },
        persistedSource: normalizePlayerSnapshotPersistedSource(row.persisted_source)
            ?? record.persistedSource,
        seededAt: Number.isFinite(row.seeded_at) ? Math.max(0, Math.trunc(row.seeded_at)) : record.seededAt,
    };
}
function normalizePlayerSnapshotRecord(raw) {

    const snapshot = normalizePlayerSnapshotPayload(raw);
    if (!snapshot) {
        return null;
    }

    const meta = raw && typeof raw === 'object' ? raw[PLAYER_SNAPSHOT_META_KEY] : null;
    return {
        snapshot,
        persistedSource: normalizePlayerSnapshotPersistedSource(meta?.persistedSource)
            ?? PLAYER_SNAPSHOT_PERSISTED_SOURCE_NATIVE,
        seededAt: Number.isFinite(meta?.seededAt) ? Math.max(0, Math.trunc(meta.seededAt)) : null,
    };
}
function normalizePlayerSnapshotPayload(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const snapshot = raw;
    if (snapshot.version !== 1 || typeof snapshot.placement?.templateId !== 'string') {
        return null;
    }

    const vitals = snapshot.vitals ?? {};

    const inventory = snapshot.inventory ?? {};

    const equipment = snapshot.equipment ?? {};

    const techniques = snapshot.techniques ?? {};

    const buffs = snapshot.buffs ?? {};

    const quests = snapshot.quests ?? {};

    const combat = snapshot.combat ?? {};

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

            realm: typeof progression.realm === 'object' && progression.realm ? progression.realm : null,

            heavenGate: typeof progression.heavenGate === 'object' && progression.heavenGate ? progression.heavenGate : null,

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

            autoBattle: combat.autoBattle === true,

            autoRetaliate: combat.autoRetaliate !== false,

            autoBattleStationary: combat.autoBattleStationary === true,

            combatTargetId: typeof combat.combatTargetId === 'string' && combat.combatTargetId.trim()
                ? combat.combatTargetId.trim()
                : null,

            combatTargetLocked: combat.combatTargetLocked === true,

            allowAoePlayerHit: combat.allowAoePlayerHit === true,

            autoIdleCultivation: combat.autoIdleCultivation !== false,

            autoSwitchCultivation: combat.autoSwitchCultivation === true,

            senseQiActive: combat.senseQiActive === true,
            autoBattleSkills: Array.isArray(combat.autoBattleSkills) ? combat.autoBattleSkills : [],
        },
        pendingLogbookMessages: normalizePendingLogbookMessages(resolveSnapshotArray(snapshot, 'pendingLogbookMessages')),
        runtimeBonuses: normalizeRuntimeBonuses(resolveSnapshotArray(snapshot, 'runtimeBonuses')),
    };
}
function buildPersistedPlayerSnapshotPayload(snapshot, meta) {

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
function normalizePlayerSnapshotPersistedSource(value) {
    return value === PLAYER_SNAPSHOT_PERSISTED_SOURCE_LEGACY_SEEDED
        ? PLAYER_SNAPSHOT_PERSISTED_SOURCE_LEGACY_SEEDED
        : value === PLAYER_SNAPSHOT_PERSISTED_SOURCE_NATIVE
            ? PLAYER_SNAPSHOT_PERSISTED_SOURCE_NATIVE
            : null;
}
function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
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
function resolveSnapshotArray(snapshot, key) {
    const value = snapshot?.[key];
    return Array.isArray(value) ? value : [];
}
function canonicalizeRuntimeBonusSource(source) {
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
function normalizePendingLogbookMessages(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    const normalized = [];

    const indexById = new Map();
    for (const entry of value) {
        if (!isPendingLogbookMessage(entry)) {
            continue;
        }

        const candidate = {
            id: entry.id.trim(),
            kind: normalizePendingLogbookKind(entry.kind),
            text: entry.text.trim(),

            from: typeof entry.from === 'string' && entry.from.trim().length > 0 ? entry.from.trim() : undefined,
            at: Math.max(0, Math.trunc(entry.at)),
        };
        if (!candidate.id || !candidate.text) {
            continue;
        }

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
function isPendingLogbookMessage(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value;
    return typeof candidate.id === 'string'
        && normalizePendingLogbookKind(candidate.kind) === candidate.kind
        && typeof candidate.text === 'string'
        && (candidate.from === undefined || typeof candidate.from === 'string')
        && isFiniteNumber(candidate.at);
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
//# sourceMappingURL=player-persistence.service.js.map
