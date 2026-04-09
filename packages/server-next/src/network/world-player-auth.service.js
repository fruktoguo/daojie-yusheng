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
exports.WorldPlayerAuthService = void 0;
const common_1 = require("@nestjs/common");
const player_identity_persistence_service_1 = require("../persistence/player-identity-persistence.service");
const player_persistence_service_1 = require("../persistence/player-persistence.service");
const world_player_source_service_1 = require("./world-player-source.service");
const world_player_token_service_1 = require("./world-player-token.service");
const STRICT_NATIVE_IDENTITY_ENV_KEYS = [
    'SERVER_NEXT_AUTH_REQUIRE_NATIVE_IDENTITY',
    'NEXT_AUTH_REQUIRE_NATIVE_IDENTITY',
];
function isStrictNativeIdentityRequired() {
    for (const key of STRICT_NATIVE_IDENTITY_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
        if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
            return true;
        }
    }
    return false;
}
let WorldPlayerAuthService = class WorldPlayerAuthService {
    logger = new common_1.Logger(WorldPlayerAuthService.name);
    worldPlayerTokenService;
    playerIdentityPersistenceService;
    playerPersistenceService;
    worldPlayerSourceService;
    constructor(worldPlayerTokenService, playerIdentityPersistenceService, playerPersistenceService, worldPlayerSourceService) {
        this.worldPlayerTokenService = worldPlayerTokenService;
        this.playerIdentityPersistenceService = playerIdentityPersistenceService;
        this.playerPersistenceService = playerPersistenceService;
        this.worldPlayerSourceService = worldPlayerSourceService;
    }
    async preseedCompatSnapshot(playerId) {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId || !this.playerPersistenceService.isEnabled()) {
            return false;
        }
        try {
            const existingSnapshot = await this.playerPersistenceService.loadPlayerSnapshotRecord(normalizedPlayerId);
            if (existingSnapshot?.snapshot) {
                return true;
            }
        }
        catch (error) {
            this.logger.warn(`Player snapshot preseed skipped after compat identity backfill: playerId=${normalizedPlayerId} nextLoadFailed=${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
        let compatSnapshot = null;
        try {
            compatSnapshot = await this.worldPlayerSourceService.loadCompatPlayerSnapshot(normalizedPlayerId);
        }
        catch (error) {
            this.logger.warn(`Player snapshot preseed failed after compat identity backfill: playerId=${normalizedPlayerId} compatLoadFailed=${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
        if (!compatSnapshot) {
            return false;
        }
        try {
            await this.playerPersistenceService.savePlayerSnapshot(normalizedPlayerId, compatSnapshot, {
                persistedSource: 'legacy_seeded',
                seededAt: Date.now(),
            });
            return true;
        }
        catch (error) {
            this.logger.warn(`Player snapshot preseed save failed after compat identity backfill: playerId=${normalizedPlayerId} error=${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }
    async authenticatePlayerToken(token) {
        const payload = this.worldPlayerTokenService.validatePlayerToken(token);
        if (!payload) {
            return null;
        }
        const tokenIdentity = this.worldPlayerTokenService.resolvePlayerIdentityFromPayload(payload);
        const identityPersistenceEnabled = this.playerIdentityPersistenceService.isEnabled();
        let nextIdentity = null;
        try {
            nextIdentity = await this.playerIdentityPersistenceService.loadPlayerIdentity(payload.sub);
        }
        catch (error) {
            const message = `Player identity next record load failed: userId=${payload.sub} error=${error instanceof Error ? error.message : String(error)}`;
            this.logger.error(message);
            (0, world_player_token_service_1.recordAuthTrace)({
                type: 'identity',
                source: 'next_invalid',
                userId: payload.sub,
                playerId: tokenIdentity?.playerId ?? null,
                persistenceEnabled: identityPersistenceEnabled,
                nextLoadHit: false,
                compatTried: false,
                persistAttempted: false,
                persistSucceeded: null,
                persistFailureStage: 'next_identity_load_failed',
            });
            throw new Error(message);
        }
        if (nextIdentity) {
            (0, world_player_token_service_1.recordAuthTrace)({
                type: 'identity',
                source: 'next',
                userId: nextIdentity.userId,
                playerId: nextIdentity.playerId,
                persistedSource: typeof nextIdentity.persistedSource === 'string' ? nextIdentity.persistedSource : null,
                persistenceEnabled: identityPersistenceEnabled,
                nextLoadHit: true,
                compatTried: false,
                persistAttempted: false,
                persistSucceeded: null,
                persistFailureStage: null,
            });
            return {
                ...nextIdentity,
                authSource: 'next',
                nextLoadHit: true,
            };
        }
        const strictNativeIdentityRequired = identityPersistenceEnabled && isStrictNativeIdentityRequired();
        if (strictNativeIdentityRequired) {
            (0, world_player_token_service_1.recordAuthTrace)({
                type: 'identity',
                source: 'miss',
                userId: payload.sub,
                playerId: tokenIdentity?.playerId ?? null,
                persistenceEnabled: true,
                nextLoadHit: false,
                compatTried: false,
                persistAttempted: false,
                persistSucceeded: null,
                persistFailureStage: 'native_identity_required',
            });
            return null;
        }
        let compatIdentity = null;
        let compatIdentityResolved = false;
        const resolveCompatIdentityOnce = async () => {
            if (!compatIdentityResolved) {
                compatIdentity = await this.worldPlayerSourceService.resolveCompatPlayerIdentity(payload);
                compatIdentityResolved = true;
            }
            return compatIdentity;
        };
        if (!identityPersistenceEnabled) {
            compatIdentity = await resolveCompatIdentityOnce();
            if (compatIdentity) {
                (0, world_player_token_service_1.recordAuthTrace)({
                    type: 'identity',
                    source: 'legacy_runtime',
                    userId: compatIdentity.userId,
                    playerId: compatIdentity.playerId,
                    persistenceEnabled: false,
                    nextLoadHit: false,
                    compatTried: true,
                    persistAttempted: false,
                    persistSucceeded: null,
                    persistFailureStage: null,
                });
                return {
                    ...compatIdentity,
                    authSource: 'legacy_runtime',
                    nextLoadHit: false,
                };
            }
        }
        if (identityPersistenceEnabled && tokenIdentity) {
            let persistFailureStage = null;
            const persistedTokenIdentity = await this.playerIdentityPersistenceService.savePlayerIdentity({
                ...tokenIdentity,
                persistedSource: 'token_seed',
                updatedAt: Date.now(),
            }).catch((error) => {
                persistFailureStage = 'token_seed_save_failed';
                this.logger.warn(`Player identity token seed save failed: userId=${tokenIdentity.userId} playerId=${tokenIdentity.playerId} error=${error instanceof Error ? error.message : String(error)}`);
                return null;
            });
            if (identityPersistenceEnabled && persistFailureStage === 'token_seed_save_failed') {
                (0, world_player_token_service_1.recordAuthTrace)({
                    type: 'identity',
                    source: 'token_persist_blocked',
                    userId: tokenIdentity.userId,
                    playerId: tokenIdentity.playerId,
                    persistedSource: null,
                    persistenceEnabled: true,
                    nextLoadHit: false,
                    compatTried: false,
                    persistAttempted: true,
                    persistSucceeded: false,
                    persistFailureStage,
                });
                return null;
            }
            const snapshotPreseeded = persistedTokenIdentity
                ? await this.preseedCompatSnapshot(tokenIdentity.playerId).catch(() => false)
                : false;
            if (persistedTokenIdentity && !snapshotPreseeded) {
                (0, world_player_token_service_1.recordAuthTrace)({
                    type: 'identity',
                    source: 'token_preseed_blocked',
                    userId: tokenIdentity.userId,
                    playerId: tokenIdentity.playerId,
                    persistedSource: persistedTokenIdentity?.persistedSource ?? null,
                    persistenceEnabled: true,
                    nextLoadHit: false,
                    compatTried: false,
                    persistAttempted: true,
                    persistSucceeded: true,
                    persistFailureStage: 'compat_snapshot_preseed_failed',
                });
                return null;
            }
            if (persistedTokenIdentity && snapshotPreseeded) {
                (0, world_player_token_service_1.recordAuthTrace)({
                    type: 'identity',
                    source: 'token',
                    userId: tokenIdentity.userId,
                    playerId: tokenIdentity.playerId,
                    persistedSource: persistedTokenIdentity?.persistedSource ?? null,
                    persistenceEnabled: true,
                    nextLoadHit: false,
                    compatTried: false,
                    persistAttempted: true,
                    persistSucceeded: true,
                    persistFailureStage,
                });
                return {
                    ...tokenIdentity,
                    authSource: 'token',
                    nextLoadHit: false,
                };
            }
        }
        compatIdentity = await resolveCompatIdentityOnce();
        if (compatIdentity) {
            let persistFailureStage = null;
            const persistedCompatIdentity = await this.playerIdentityPersistenceService.savePlayerIdentity({
                ...compatIdentity,
                persistedSource: 'legacy_backfill',
                updatedAt: Date.now(),
            }).catch((error) => {
                persistFailureStage = 'compat_backfill_save_failed';
                this.logger.warn(`Player identity compat backfill save failed: userId=${compatIdentity.userId} playerId=${compatIdentity.playerId} error=${error instanceof Error ? error.message : String(error)}`);
                return null;
            });
            if (identityPersistenceEnabled && persistFailureStage === 'compat_backfill_save_failed') {
                (0, world_player_token_service_1.recordAuthTrace)({
                    type: 'identity',
                    source: 'legacy_persist_blocked',
                    userId: compatIdentity.userId,
                    playerId: compatIdentity.playerId,
                    persistedSource: null,
                    persistenceEnabled: true,
                    nextLoadHit: false,
                    compatTried: true,
                    persistAttempted: true,
                    persistSucceeded: false,
                    persistFailureStage,
                });
                return null;
            }
            const snapshotPreseeded = persistedCompatIdentity
                ? await this.preseedCompatSnapshot(compatIdentity.playerId).catch(() => false)
                : false;
            if (identityPersistenceEnabled && persistedCompatIdentity && !snapshotPreseeded) {
                (0, world_player_token_service_1.recordAuthTrace)({
                    type: 'identity',
                    source: 'legacy_preseed_blocked',
                    userId: compatIdentity.userId,
                    playerId: compatIdentity.playerId,
                    persistedSource: persistedCompatIdentity?.persistedSource ?? null,
                    persistenceEnabled: true,
                    nextLoadHit: false,
                    compatTried: true,
                    persistAttempted: true,
                    persistSucceeded: true,
                    persistFailureStage: 'compat_snapshot_preseed_failed',
                });
                return null;
            }
            const authSource = persistedCompatIdentity && snapshotPreseeded
                ? 'legacy_backfill'
                : 'legacy_runtime';
            (0, world_player_token_service_1.recordAuthTrace)({
                type: 'identity',
                source: authSource,
                userId: compatIdentity.userId,
                playerId: compatIdentity.playerId,
                persistedSource: persistedCompatIdentity?.persistedSource ?? null,
                persistenceEnabled: identityPersistenceEnabled,
                nextLoadHit: false,
                compatTried: true,
                persistAttempted: identityPersistenceEnabled,
                persistSucceeded: identityPersistenceEnabled ? persistedCompatIdentity !== null : null,
                persistFailureStage,
            });
            return {
                ...compatIdentity,
                authSource,
                nextLoadHit: false,
            };
        }
        (0, world_player_token_service_1.recordAuthTrace)({
            type: 'identity',
            source: 'miss',
            userId: payload.sub,
            playerId: tokenIdentity?.playerId ?? null,
            persistenceEnabled: identityPersistenceEnabled,
            nextLoadHit: false,
            compatTried: true,
            persistAttempted: false,
            persistSucceeded: null,
            persistFailureStage: null,
        });
        return null;
    }
};
exports.WorldPlayerAuthService = WorldPlayerAuthService;
exports.WorldPlayerAuthService = WorldPlayerAuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_player_token_service_1.WorldPlayerTokenService,
        player_identity_persistence_service_1.PlayerIdentityPersistenceService,
        player_persistence_service_1.PlayerPersistenceService,
        world_player_source_service_1.WorldPlayerSourceService])
], WorldPlayerAuthService);
//# sourceMappingURL=world-player-auth.service.js.map
