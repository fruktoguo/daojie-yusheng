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
const world_player_source_service_1 = require("./world-player-source.service");
const world_player_token_service_1 = require("./world-player-token.service");
let WorldPlayerSnapshotService = class WorldPlayerSnapshotService {
    logger = new common_1.Logger(WorldPlayerSnapshotService.name);
    playerPersistenceService;
    worldPlayerSourceService;
    constructor(playerPersistenceService, worldPlayerSourceService) {
        this.playerPersistenceService = playerPersistenceService;
        this.worldPlayerSourceService = worldPlayerSourceService;
    }
    isPersistenceEnabled() {
        return this.playerPersistenceService.isEnabled();
    }
    async loadPlayerSnapshot(playerId, allowLegacyFallback, fallbackReason = null) {
        let nextSnapshotRecord = null;
        try {
            nextSnapshotRecord = await this.playerPersistenceService.loadPlayerSnapshotRecord(playerId);
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
            return nextSnapshotRecord.snapshot;
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
            return null;
        }
        let legacySnapshot = null;
        try {
            legacySnapshot = await this.worldPlayerSourceService.loadCompatPlayerSnapshot(playerId);
        }
        catch (error) {
            const message = `Player snapshot compat load failed: playerId=${playerId} error=${error instanceof Error ? error.message : String(error)}`;
            this.logger.error(message);
            (0, world_player_token_service_1.recordAuthTrace)({
                type: 'snapshot',
                playerId,
                source: 'legacy_source_error',
                persistedSource: null,
                allowLegacyFallback: true,
                fallbackReason,
                fallbackHit: false,
            });
            throw new Error(message);
        }
        let traceSource = 'miss';
        let seedPersisted = false;
        if (legacySnapshot) {
            traceSource = 'legacy_runtime';
            if (this.playerPersistenceService.isEnabled()) {
                await this.playerPersistenceService.savePlayerSnapshot(playerId, legacySnapshot, {
                    persistedSource: 'legacy_seeded',
                    seededAt: Date.now(),
                }).then(() => {
                    traceSource = 'legacy_seeded';
                    seedPersisted = true;
                }).catch((error) => {
                    const message = `Player snapshot legacy seed failed while persistence is enabled: playerId=${playerId} error=${error instanceof Error ? error.message : String(error)}`;
                    this.logger.error(message);
                    (0, world_player_token_service_1.recordAuthTrace)({
                        type: 'snapshot',
                        playerId,
                        source: 'legacy_seed_error',
                        persistedSource: null,
                        allowLegacyFallback: true,
                        fallbackReason,
                        fallbackHit: true,
                        seedPersisted: false,
                    });
                    throw new Error(message);
                });
            }
        }
        this.logger.debug(`Player snapshot source=${traceSource} playerId=${playerId} allowLegacyFallback=true fallbackReason=${fallbackReason ?? 'none'}`);
        (0, world_player_token_service_1.recordAuthTrace)({
            type: 'snapshot',
            playerId,
            source: traceSource,
            persistedSource: seedPersisted ? 'legacy_seeded' : null,
            allowLegacyFallback: true,
            fallbackReason,
            fallbackHit: Boolean(legacySnapshot),
            seedPersisted,
        });
        return legacySnapshot;
    }
};
exports.WorldPlayerSnapshotService = WorldPlayerSnapshotService;
exports.WorldPlayerSnapshotService = WorldPlayerSnapshotService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_persistence_service_1.PlayerPersistenceService,
        world_player_source_service_1.WorldPlayerSourceService])
], WorldPlayerSnapshotService);
//# sourceMappingURL=world-player-snapshot.service.js.map
