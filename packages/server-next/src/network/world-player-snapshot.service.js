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
let WorldPlayerSnapshotService = class WorldPlayerSnapshotService {
    logger = new common_1.Logger(WorldPlayerSnapshotService.name);
    playerPersistenceService;
    playerRuntimeService;
    worldPlayerSourceService;
    constructor(playerPersistenceService, playerRuntimeService, worldPlayerSourceService) {
        this.playerPersistenceService = playerPersistenceService;
        this.playerRuntimeService = playerRuntimeService;
        this.worldPlayerSourceService = worldPlayerSourceService;
    }
    buildCompatMigrationSourceOptions(reason) {
        return {
            allowCompatMigration: true,
            allowLegacyHttpIdentityFallback: false,
            reason,
        };
    }
    isPersistenceEnabled() {
        return this.playerPersistenceService.isEnabled();
    }
    async loadNextPlayerSnapshotRecord(playerId) {
        if (typeof this.worldPlayerSourceService?.loadNextPlayerSnapshotRecord === 'function') {
            return this.worldPlayerSourceService.loadNextPlayerSnapshotRecord(playerId);
        }
        return this.playerPersistenceService.loadPlayerSnapshotRecord(playerId);
    }
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
            this.logger.warn(`Player compat backfill snapshot ensure skipped after identity backfill: playerId=${normalizedPlayerId} nextLoadFailed=${error instanceof Error ? error.message : String(error)}`);
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
            this.logger.warn(`Player native starter snapshot recovery load failed: playerId=${normalizedPlayerId} error=${error instanceof Error ? error.message : String(error)}`);
            return {
                ok: false,
                failureStage: 'native_snapshot_recovery_load_failed',
            };
        }
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
