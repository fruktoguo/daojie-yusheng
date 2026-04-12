"use strict";
/** __decorate：定义该变量以承载业务值。 */
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldPlayerSnapshotService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** player_persistence_service_1：定义该变量以承载业务值。 */
const player_persistence_service_1 = require("../persistence/player-persistence.service");
/** player_runtime_service_1：定义该变量以承载业务值。 */
const player_runtime_service_1 = require("../runtime/player/player-runtime.service");
/** world_player_source_service_1：定义该变量以承载业务值。 */
const world_player_source_service_1 = require("./world-player-source.service");
/** world_player_token_service_1：定义该变量以承载业务值。 */
const world_player_token_service_1 = require("./world-player-token.service");
/** WorldPlayerSnapshotService：定义该变量以承载业务值。 */
let WorldPlayerSnapshotService = class WorldPlayerSnapshotService {
    logger = new common_1.Logger(WorldPlayerSnapshotService.name);
    playerPersistenceService;
    playerRuntimeService;
    worldPlayerSourceService;
/** 构造函数：执行实例初始化流程。 */
    constructor(playerPersistenceService, playerRuntimeService, worldPlayerSourceService) {
        this.playerPersistenceService = playerPersistenceService;
        this.playerRuntimeService = playerRuntimeService;
        this.worldPlayerSourceService = worldPlayerSourceService;
    }
/** buildCompatMigrationSourceOptions：执行对应的业务逻辑。 */
    buildCompatMigrationSourceOptions(reason) {
        return {
            allowCompatMigration: true,
            allowLegacyHttpIdentityFallback: false,
            reason,
        };
    }
/** isPersistenceEnabled：执行对应的业务逻辑。 */
    isPersistenceEnabled() {
        return this.playerPersistenceService.isEnabled();
    }
/** loadNextPlayerSnapshotRecord：执行对应的业务逻辑。 */
    async loadNextPlayerSnapshotRecord(playerId) {
        if (typeof this.worldPlayerSourceService?.loadNextPlayerSnapshotRecord === 'function') {
            return this.worldPlayerSourceService.loadNextPlayerSnapshotRecord(playerId);
        }
        return this.playerPersistenceService.loadPlayerSnapshotRecord(playerId);
    }
/** loadMigrationPlayerSnapshot：执行对应的业务逻辑。 */
    async loadMigrationPlayerSnapshot(playerId) {
/** migrationSourceOptions：定义该变量以承载业务值。 */
        const migrationSourceOptions = this.buildCompatMigrationSourceOptions('snapshot_backfill');
        if (typeof this.worldPlayerSourceService?.loadPlayerSnapshotForMigration === 'function') {
            return this.worldPlayerSourceService.loadPlayerSnapshotForMigration(playerId, migrationSourceOptions);
        }
        if (typeof this.worldPlayerSourceService?.loadCompatPlayerSnapshotForMigration !== 'function') {
            throw new Error('compat migration snapshot source unavailable');
        }
        return this.worldPlayerSourceService.loadCompatPlayerSnapshotForMigration(playerId, migrationSourceOptions);
    }
/** ensureCompatBackfillSnapshot：执行对应的业务逻辑。 */
    async ensureCompatBackfillSnapshot(playerId) {
/** normalizedPlayerId：定义该变量以承载业务值。 */
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId || !this.playerPersistenceService.isEnabled()) {
            return {
                ok: false,
                failureStage: 'compat_snapshot_persistence_disabled',
            };
        }
        try {
/** existingSnapshotRecord：定义该变量以承载业务值。 */
            const existingSnapshotRecord = await this.loadNextPlayerSnapshotRecord(normalizedPlayerId);
            if (existingSnapshotRecord?.snapshot) {
                return {
                    ok: true,
                    seeded: false,
                    snapshot: existingSnapshotRecord.snapshot,
/** persistedSource：定义该变量以承载业务值。 */
                    persistedSource: typeof existingSnapshotRecord.persistedSource === 'string'
                        ? existingSnapshotRecord.persistedSource
                        : null,
                };
            }
        }
        catch (error) {
            this.logger.warn(`Player compat backfill snapshot ensure skipped after identity backfill: playerId=${normalizedPlayerId} nextLoadFailed=${error instanceof Error ? error.message : String(error)}`);
            return {
                ok: false,
                failureStage: 'compat_snapshot_next_load_failed',
            };
        }
/** compatSnapshot：定义该变量以承载业务值。 */
        let compatSnapshot = null;
        try {
            compatSnapshot = await this.loadMigrationPlayerSnapshot(normalizedPlayerId);
        }
        catch (error) {
            this.logger.warn(`Player compat backfill snapshot load failed after identity backfill: playerId=${normalizedPlayerId} compatLoadFailed=${error instanceof Error ? error.message : String(error)}`);
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
                this.logger.warn(`Player compat backfill snapshot save failed: playerId=${normalizedPlayerId} error=${error instanceof Error ? error.message : String(error)}`);
                return {
                    ok: false,
                    failureStage: 'compat_snapshot_legacy_seed_failed',
                };
            }
        }
        this.logger.warn(`Player compat backfill snapshot missing in explicit migration source: playerId=${normalizedPlayerId}`);
        return {
            ok: false,
            failureStage: 'compat_snapshot_missing',
        };
    }
/** ensureNativeStarterSnapshot：执行对应的业务逻辑。 */
    async ensureNativeStarterSnapshot(playerId) {
/** normalizedPlayerId：定义该变量以承载业务值。 */
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId || !this.playerPersistenceService.isEnabled()) {
            return {
                ok: false,
                failureStage: 'native_snapshot_recovery_persistence_disabled',
            };
        }
        try {
/** existingSnapshotRecord：定义该变量以承载业务值。 */
            const existingSnapshotRecord = await this.loadNextPlayerSnapshotRecord(normalizedPlayerId);
            if (existingSnapshotRecord?.snapshot) {
                return {
                    ok: true,
                    seeded: false,
                    snapshot: existingSnapshotRecord.snapshot,
/** persistedSource：定义该变量以承载业务值。 */
                    persistedSource: typeof existingSnapshotRecord.persistedSource === 'string'
                        ? existingSnapshotRecord.persistedSource
                        : null,
                };
            }
        }
        catch (error) {
            this.logger.warn(`Player native starter snapshot recovery load failed: playerId=${normalizedPlayerId} error=${error instanceof Error ? error.message : String(error)}`);
            return {
                ok: false,
                failureStage: 'native_snapshot_recovery_load_failed',
            };
        }
/** starterSnapshot：定义该变量以承载业务值。 */
        const starterSnapshot = this.playerRuntimeService.buildStarterPersistenceSnapshot(normalizedPlayerId);
        if (!starterSnapshot) {
            this.logger.warn(`Player native starter snapshot recovery build failed: playerId=${normalizedPlayerId}`);
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
            this.logger.warn(`Player native starter snapshot recovery save failed: playerId=${normalizedPlayerId} error=${error instanceof Error ? error.message : String(error)}`);
            return {
                ok: false,
                failureStage: 'native_snapshot_recovery_seed_failed',
            };
        }
    }
/** loadPlayerSnapshotResult：执行对应的业务逻辑。 */
    async loadPlayerSnapshotResult(playerId, allowLegacyFallback, fallbackReason = null) {
/** nextSnapshotRecord：定义该变量以承载业务值。 */
        let nextSnapshotRecord = null;
        try {
            nextSnapshotRecord = await this.loadNextPlayerSnapshotRecord(playerId);
        }
        catch (error) {
/** message：定义该变量以承载业务值。 */
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
            this.logger.debug(`Player snapshot source=next persistedSource=${nextSnapshotRecord.persistedSource} playerId=${playerId}`);
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
            this.logger.debug(`Player snapshot source=miss playerId=${playerId} allowLegacyFallback=false fallbackReason=${fallbackReason ?? 'none'}`);
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
        this.logger.debug(`Player snapshot source=miss playerId=${playerId} compatFallbackBlocked=true fallbackReason=${fallbackReason ?? 'none'}`);
        (0, world_player_token_service_1.recordAuthTrace)({
            type: 'snapshot',
            playerId,
            source: 'miss',
            allowLegacyFallback: false,
/** fallbackReason：定义该变量以承载业务值。 */
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
/** loadPlayerSnapshot：执行对应的业务逻辑。 */
    async loadPlayerSnapshot(playerId, allowLegacyFallback, fallbackReason = null) {
/** result：定义该变量以承载业务值。 */
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
