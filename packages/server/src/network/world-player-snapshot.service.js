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

/** 玩家快照服务：负责 next 初始快照、compat 回填和迁移来源的快照读写。 */
let WorldPlayerSnapshotService = class WorldPlayerSnapshotService {
    /** 记录快照加载、回填和恢复过程。 */
    logger = new common_1.Logger(WorldPlayerSnapshotService.name);
    /** next 玩家快照持久化入口。 */
    playerPersistenceService;
    /** 玩家 runtime，用于生成 starter snapshot。 */
    playerRuntimeService;
    /** 兼容来源服务。 */
    worldPlayerSourceService;
    constructor(playerPersistenceService, playerRuntimeService, worldPlayerSourceService) {
        this.playerPersistenceService = playerPersistenceService;
        this.playerRuntimeService = playerRuntimeService;
        this.worldPlayerSourceService = worldPlayerSourceService;
    }
    /** 生成兼容迁移来源选项。 */
    buildCompatMigrationSourceOptions(reason) {
        return {
            allowCompatMigration: true,
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
        if (typeof this.worldPlayerSourceService?.loadNextPlayerSnapshotRecord === 'function') {
            return this.worldPlayerSourceService.loadNextPlayerSnapshotRecord(playerId);
        }
        return this.playerPersistenceService.loadPlayerSnapshotRecord(playerId);
    }
    /** 从兼容来源读取迁移用快照。 */
    async loadMigrationPlayerSnapshot(playerId) {

        const migrationSourceOptions = this.buildCompatMigrationSourceOptions('snapshot_backfill');
        if (typeof this.worldPlayerSourceService?.loadPlayerSnapshotForMigration === 'function') {
            return this.worldPlayerSourceService.loadPlayerSnapshotForMigration(playerId, migrationSourceOptions);
        }
        if (typeof this.worldPlayerSourceService?.loadCompatPlayerSnapshotForMigration !== 'function') {
            throw new Error('compat migration snapshot source unavailable');
        }
        return this.worldPlayerSourceService.loadCompatPlayerSnapshotForMigration(playerId, migrationSourceOptions);
    }
    /** 在身份回填后补齐 compat 快照。 */
    async ensureCompatBackfillSnapshot(playerId) {

        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId || !this.playerPersistenceService.isEnabled()) {
            return {
                ok: false,
                failureStage: 'compat_snapshot_persistence_disabled',
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
            this.logger.warn(`玩家 compat 回填快照在身份回填后跳过补齐：playerId=${normalizedPlayerId} nextLoadFailed=${error instanceof Error ? error.message : String(error)}`);
            return {
                ok: false,
                failureStage: 'compat_snapshot_next_load_failed',
            };
        }

        let compatSnapshot = null;
        try {
            compatSnapshot = await this.loadMigrationPlayerSnapshot(normalizedPlayerId);
        }
        catch (error) {
            this.logger.warn(`玩家 compat 回填快照在身份回填后加载失败：playerId=${normalizedPlayerId} compatLoadFailed=${error instanceof Error ? error.message : String(error)}`);
            return {
                ok: false,
                failureStage: 'compat_snapshot_legacy_load_failed',
            };
        }
        if (compatSnapshot) {
            try {
                await this.playerPersistenceService.savePlayerSnapshot(normalizedPlayerId, compatSnapshot, {
                    persistedSource: 'native',
                    seededAt: Date.now(),
                });
                return {
                    ok: true,
                    seeded: true,
                    snapshot: compatSnapshot,
                    persistedSource: 'native',
                };
            }
            catch (error) {
                this.logger.warn(`玩家 compat 回填快照保存失败：playerId=${normalizedPlayerId} error=${error instanceof Error ? error.message : String(error)}`);
                return {
                    ok: false,
                    failureStage: 'compat_snapshot_legacy_seed_failed',
                };
            }
        }
        this.logger.warn(`显式迁移来源中缺少玩家 compat 回填快照：playerId=${normalizedPlayerId}`);
        return {
            ok: false,
            failureStage: 'compat_snapshot_missing',
        };
    }
    /** 在 next 身份首次进入时补齐 starter snapshot。 */
    async ensureNativeStarterSnapshot(playerId) {

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
    /** 读取快照并携带来源、回退和种子信息。 */
    async loadPlayerSnapshotResult(playerId, allowLegacyFallback, fallbackReason = null) {

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
                allowLegacyFallback: Boolean(allowLegacyFallback),
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
                allowLegacyFallback: Boolean(allowLegacyFallback),
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
        if (!allowLegacyFallback) {
            this.logger.debug(`玩家快照来源=miss playerId=${playerId} allowLegacyFallback=false fallbackReason=${fallbackReason ?? '无'}`);
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
        this.logger.debug(`玩家快照来源=miss playerId=${playerId} compatFallbackBlocked=true fallbackReason=${fallbackReason ?? '无'}`);
        (0, world_player_token_service_1.recordAuthTrace)({
            type: 'snapshot',
            playerId,
            source: 'miss',
            allowLegacyFallback: false,

            fallbackReason: typeof fallbackReason === 'string' && fallbackReason.trim()
                ? `${fallbackReason.trim()}:compat_runtime_blocked`
                : 'compat_runtime_blocked',
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
    /** 读取快照，保持旧调用方兼容。 */
    async loadPlayerSnapshot(playerId, allowLegacyFallback, fallbackReason = null) {

        const result = await this.loadPlayerSnapshotResult(playerId, allowLegacyFallback, fallbackReason);
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
//# sourceMappingURL=world-player-snapshot.service.js.map
