"use strict";
/**
 * 玩家持久化服务
 * 
 * 负责管理玩家数据的持久化存储，包括：
 * - 玩家快照的保存和加载
 * - 数据库连接池管理
 * - 持久化文档表管理
 * - 玩家数据的刷新
 */
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
const persistent_document_table_1 = require("./persistent-document-table");

// ==================== 常量定义 ====================

/** 玩家快照存储范围 */
const PLAYER_SNAPSHOT_SCOPE = 'server_next_player_snapshots_v1';

/**
 * 玩家持久化服务类
 * 
 * 负责管理玩家数据的持久化存储
 */
let PlayerPersistenceService = PlayerPersistenceService_1 = class PlayerPersistenceService {
    // ==================== 日志记录器 ====================
    /** 日志记录器实例 */
    logger = new common_1.Logger(PlayerPersistenceService_1.name);
    
    // ==================== 数据库连接池 ====================
    /** PostgreSQL连接池 */
    pool = null;
    /** 持久化是否启用 */
    enabled = false;
    /**
     * 模块初始化回调
     * 
     * 初始化数据库连接池和持久化文档表
     */
    async onModuleInit() {
        // 获取数据库URL
        const databaseUrl = process.env.SERVER_NEXT_DATABASE_URL
            ?? '';
        
        // 检查数据库URL是否配置
        if (!databaseUrl.trim()) {
            this.logger.log('Persistence disabled: no SERVER_NEXT_DATABASE_URL');
            return;
        }
        
        // 创建PostgreSQL连接池
        this.pool = new pg_1.Pool({
            connectionString: databaseUrl,
        });
        
        try {
            // 确保持久化文档表存在
            await (0, persistent_document_table_1.ensurePersistentDocumentsTable)(this.pool);
            
            // 启用持久化
            this.enabled = true;
            this.logger.log('Persistence enabled via persistent_documents');
        }
        catch (error) {
            // 处理初始化失败
            this.logger.error('Persistence init failed, fallback to disabled mode', error instanceof Error ? error.stack : String(error));
            await this.safeClosePool();
        }
    }
    
    /**
     * 模块销毁回调
     * 
     * 关闭数据库连接池
     */
    async onModuleDestroy() {
        await this.safeClosePool();
    }
    
    /**
     * 检查持久化是否启用
     * 
     * @returns 如果持久化已启用且连接池存在则返回true
     */
    isEnabled() {
        return this.enabled && this.pool !== null;
    }
    
    /**
     * 加载玩家快照
     * 
     * 从数据库加载玩家的快照数据
     * 
     * @param playerId 玩家ID
     * @returns 玩家快照对象，如果持久化未启用或连接池不存在则返回null
     */
    async loadPlayerSnapshot(playerId) {
        // 检查持久化是否启用
        if (!this.pool || !this.enabled) {
            return null;
        }
        const result = await this.pool.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2', [PLAYER_SNAPSHOT_SCOPE, playerId]);
        if (result.rowCount === 0) {
            return null;
        }
        return normalizePlayerSnapshot(result.rows[0]?.payload);
    }
    async listPlayerSnapshots() {
        if (!this.pool || !this.enabled) {
            return [];
        }
        const result = await this.pool.query('SELECT key, payload, "updatedAt" FROM persistent_documents WHERE scope = $1 ORDER BY key ASC', [PLAYER_SNAPSHOT_SCOPE]);
        return result.rows
            .map((row) => {
            const playerId = typeof row?.key === 'string' ? row.key.trim() : '';
            const snapshot = normalizePlayerSnapshot(row?.payload);
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
    async savePlayerSnapshot(playerId, snapshot) {
        if (!this.pool || !this.enabled) {
            return;
        }
        await this.pool.query(`
        INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
        VALUES ($1, $2, $3::jsonb, now())
        ON CONFLICT (scope, key)
        DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
      `, [PLAYER_SNAPSHOT_SCOPE, playerId, JSON.stringify(snapshot)]);
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
function normalizePlayerSnapshot(raw) {
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
        pendingLogbookMessages: normalizePendingLogbookMessages(resolveCompatiblePendingLogbookMessages(snapshot)),
        runtimeBonuses: normalizeRuntimeBonuses(resolveCompatibleRuntimeBonuses(snapshot)),
    };
}
function resolveCompatibleSnapshotArray(snapshot, primaryKey, compatResolver) {
    const primaryValue = snapshot?.[primaryKey];
    if (Array.isArray(primaryValue)) {
        return primaryValue;
    }
    const compatValue = compatResolver(snapshot);
    return Array.isArray(compatValue) ? compatValue : [];
}
function resolveCompatibleRuntimeBonuses(snapshot) {
    return resolveCompatibleSnapshotArray(snapshot, 'runtimeBonuses', (candidate) => candidate?.legacyBonuses);
}
function resolveCompatiblePendingLogbookMessages(snapshot) {
    return resolveCompatibleSnapshotArray(snapshot, 'pendingLogbookMessages', (candidate) => candidate?.legacyCompat?.pendingLogbookMessages);
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
            kind: 'grudge',
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
        && candidate.kind === 'grudge'
        && typeof candidate.text === 'string'
        && (candidate.from === undefined || typeof candidate.from === 'string')
        && isFiniteNumber(candidate.at);
}
//# sourceMappingURL=player-persistence.service.js.map
