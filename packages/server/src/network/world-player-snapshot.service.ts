// @ts-nocheck
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldPlayerSnapshotService = void 0;

const common_1 = require("@nestjs/common");

const player_persistence_service_1 = require("../persistence/player-persistence.service");

const player_runtime_service_1 = require("../runtime/player/player-runtime.service");

const world_player_source_service_1 = require("./world-player-source.service");

const world_player_token_service_1 = require("./world-player-token.service");

/** 玩家快照服务：主链只读 next 持久化记录，legacy 只允许显式 migration backfill。 */
let WorldPlayerSnapshotService = class WorldPlayerSnapshotService {
    /** 记录快照加载、回填和恢复过程。 */
    logger = new common_1.Logger(WorldPlayerSnapshotService.name);
    /** next 玩家快照持久化入口。 */
    playerPersistenceService;
    /** 玩家 runtime，用于生成 starter snapshot。 */
    playerRuntimeService;
    /** migration 来源服务。 */
    worldPlayerSourceService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerPersistenceService 参数说明。
 * @param playerRuntimeService 参数说明。
 * @param worldPlayerSourceService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(playerPersistenceService, playerRuntimeService, worldPlayerSourceService) {
        this.playerPersistenceService = playerPersistenceService;
        this.playerRuntimeService = playerRuntimeService;
        this.worldPlayerSourceService = worldPlayerSourceService;
    }
    /** 生成显式 migration 快照来源选项。 */
    buildMigrationSnapshotSourceOptions(reason) {
        return {
            allowMigrationSource: true,
            allowLegacyHttpIdentityFallback: false,
            reason,
        };
    }
    /** 判断快照持久化是否已经就绪。 */
    isPersistenceEnabled() {
        return this.playerPersistenceService.isEnabled();
    }
    /** 读取 next 玩家快照记录。 */
    async loadNextPlayerSnapshotRecord(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (typeof this.worldPlayerSourceService?.loadNextPlayerSnapshotRecord === 'function') {
            return this.worldPlayerSourceService.loadNextPlayerSnapshotRecord(playerId);
        }
        return this.playerPersistenceService.loadPlayerSnapshotRecord(playerId);
    }
    /** 从兼容来源读取迁移用快照。 */
    async loadMigrationPlayerSnapshot(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const migrationSourceOptions = this.buildMigrationSnapshotSourceOptions('snapshot_backfill');
        if (typeof this.worldPlayerSourceService?.loadPlayerSnapshotForMigration !== 'function') {
            throw new Error('migration snapshot source unavailable');
        }
        return this.worldPlayerSourceService.loadPlayerSnapshotForMigration(playerId, migrationSourceOptions);
    }
    /** 在 next 身份首次进入时补齐 starter snapshot。 */
    async ensureNativeStarterSnapshot(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId || !this.playerPersistenceService.isEnabled()) {
            return {
                ok: false,
                failureStage: 'native_snapshot_recovery_persistence_disabled',
            };
        }
        try {

            const existingSnapshotRecord = await this.loadNextPlayerSnapshotRecord(normalizedPlayerId);
            if (existingSnapshotRecord?.snapshot) {
                return {
                    ok: true,
                    seeded: false,
                    snapshot: existingSnapshotRecord.snapshot,

                    persistedSource: typeof existingSnapshotRecord.persistedSource === 'string'
                        ? existingSnapshotRecord.persistedSource
                        : null,
                };
            }
        }
        catch (error) {
            this.logger.warn(`玩家原生初始快照恢复加载失败：playerId=${normalizedPlayerId} error=${error instanceof Error ? error.message : String(error)}`);
            return {
                ok: false,
                failureStage: 'native_snapshot_recovery_load_failed',
            };
        }

        const starterSnapshot = this.playerRuntimeService.buildStarterPersistenceSnapshot(normalizedPlayerId);
        if (!starterSnapshot) {
            this.logger.warn(`玩家原生初始快照恢复构建失败：playerId=${normalizedPlayerId}`);
            return {
                ok: false,
                failureStage: 'native_snapshot_recovery_build_failed',
            };
        }
        try {
            await this.playerPersistenceService.savePlayerSnapshot(normalizedPlayerId, starterSnapshot, {
                persistedSource: 'native',
                seededAt: Date.now(),
            });
            return {
                ok: true,
                seeded: true,
                snapshot: starterSnapshot,
                persistedSource: 'native',
            };
        }
        catch (error) {
            this.logger.warn(`玩家原生初始快照恢复保存失败：playerId=${normalizedPlayerId} error=${error instanceof Error ? error.message : String(error)}`);
            return {
                ok: false,
                failureStage: 'native_snapshot_recovery_seed_failed',
            };
        }
    }
    /** 读取快照并携带来源、回退和种子信息。主链 miss 时只返回 next-only miss。 */
    async loadPlayerSnapshotResult(playerId, fallbackReason = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        let nextSnapshotRecord = null;
        try {
            nextSnapshotRecord = await this.loadNextPlayerSnapshotRecord(playerId);
        }
        catch (error) {

            const message = `Player snapshot next record load failed: playerId=${playerId} error=${error instanceof Error ? error.message : String(error)}`;
            this.logger.error(message);
            (0, world_player_token_service_1.recordAuthTrace)({
                type: 'snapshot',
                playerId,
                source: 'next_invalid',
                persistedSource: null,
                fallbackReason,
                fallbackHit: false,
            });
            throw new Error(message);
        }
        if (nextSnapshotRecord?.snapshot) {
            this.logger.debug(`玩家快照来源=next persistedSource=${nextSnapshotRecord.persistedSource} playerId=${playerId}`);
            (0, world_player_token_service_1.recordAuthTrace)({
                type: 'snapshot',
                playerId,
                source: 'next',
                persistedSource: nextSnapshotRecord.persistedSource,
                fallbackReason,
                fallbackHit: false,
            });
            return {
                snapshot: nextSnapshotRecord.snapshot,
                source: 'next',
                persistedSource: nextSnapshotRecord.persistedSource ?? null,
                fallbackReason,
                seedPersisted: false,
            };
        }
        return buildNextOnlySnapshotMissResult(playerId, fallbackReason, this.logger);
    }
    /** 读取快照，保持旧调用方兼容。 */
    async loadPlayerSnapshot(playerId, fallbackReason = null) {

        const result = await this.loadPlayerSnapshotResult(playerId, fallbackReason);
        return result.snapshot;
    }
};
exports.WorldPlayerSnapshotService = WorldPlayerSnapshotService;
exports.WorldPlayerSnapshotService = WorldPlayerSnapshotService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_persistence_service_1.PlayerPersistenceService,
        player_runtime_service_1.PlayerRuntimeService,
        world_player_source_service_1.WorldPlayerSourceService])
], WorldPlayerSnapshotService);
/**
 * buildNextOnlySnapshotMissResult：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param fallbackReason 参数说明。
 * @param logger 参数说明。
 * @returns 无返回值，直接更新NextOnly快照Miss结果相关状态。
 */

function buildNextOnlySnapshotMissResult(playerId, fallbackReason, logger) {
    logger.debug(`玩家快照来源=miss playerId=${playerId} nextOnly=true fallbackReason=${fallbackReason ?? '无'}`);
    (0, world_player_token_service_1.recordAuthTrace)({
        type: 'snapshot',
        playerId,
        source: 'miss',
        allowLegacyFallback: false,
        fallbackReason,
        fallbackHit: false,
    });
    return {
        snapshot: null,
        source: 'miss',
        persistedSource: null,
        fallbackReason,
        seedPersisted: false,
    };
}
export { WorldPlayerSnapshotService };
//# sourceMappingURL=world-player-snapshot.service.js.map
