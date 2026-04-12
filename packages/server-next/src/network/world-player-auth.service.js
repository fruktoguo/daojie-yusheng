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
const world_player_snapshot_service_1 = require("./world-player-snapshot.service");
const world_player_source_service_1 = require("./world-player-source.service");
const world_player_token_service_1 = require("./world-player-token.service");
const ALLOW_COMPAT_IDENTITY_BACKFILL_ENV_KEYS = [
    'SERVER_NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL',
    'NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL',
];
const LEGACY_DATABASE_ENV_KEYS = [
    'SERVER_NEXT_DATABASE_URL',
    'DATABASE_URL',
];
function isCompatIdentityBackfillAllowed() {
    for (const key of ALLOW_COMPAT_IDENTITY_BACKFILL_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
        if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
            return true;
        }
    }
    return false;
}
function hasLegacyDatabaseConfigured() {
    for (const key of LEGACY_DATABASE_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim() : '';
        if (value) {
            return true;
        }
    }
    return false;
}
function hasExplicitTokenPlayerIdentityClaims(payload) {
    const playerId = typeof payload?.playerId === 'string' ? payload.playerId.trim() : '';
    const playerName = typeof payload?.playerName === 'string' ? payload.playerName.trim() : '';
    return Boolean(playerId && playerName);
}
function normalizeProtocol(protocol) {
    return typeof protocol === 'string' ? protocol.trim().toLowerCase() : '';
}
function isCompatMigrationBackfillRequested(options) {
    return options?.allowCompatMigrationBackfill === true;
}
function normalizePersistedSource(identity) {
    const persistedSource = typeof identity?.persistedSource === 'string' ? identity.persistedSource.trim() : '';
    return persistedSource || null;
}
function resolvePersistedNextIdentityAuthSource(persistedSource) {
    return persistedSource === 'token_seed' ? 'token' : 'next';
}
const COMPAT_MIGRATION_SOURCE_OPTIONS = Object.freeze({
    allowCompatMigration: true,
    allowLegacyHttpIdentityFallback: false,
    reason: 'auth_migration',
});
let WorldPlayerAuthService = class WorldPlayerAuthService {
    logger = new common_1.Logger(WorldPlayerAuthService.name);
    worldPlayerTokenService;
    playerIdentityPersistenceService;
    worldPlayerSnapshotService;
    worldPlayerSourceService;
    constructor(worldPlayerTokenService, playerIdentityPersistenceService, worldPlayerSourceService, worldPlayerSnapshotService = undefined) {
        this.worldPlayerTokenService = worldPlayerTokenService;
        this.playerIdentityPersistenceService = playerIdentityPersistenceService;
        this.worldPlayerSourceService = worldPlayerSourceService;
        this.worldPlayerSnapshotService = worldPlayerSnapshotService;
    }
    async ensureTokenSeedSnapshot(playerId) {
        if (!this.worldPlayerSnapshotService?.ensureNativeStarterSnapshot) {
            return {
                ok: false,
                failureStage: 'native_snapshot_service_unavailable',
            };
        }
        return this.worldPlayerSnapshotService.ensureNativeStarterSnapshot(playerId);
    }
    async ensureLegacyBackfillSnapshot(playerId) {
        if (!this.worldPlayerSnapshotService?.ensureCompatBackfillSnapshot) {
            return {
                ok: false,
                failureStage: 'compat_snapshot_service_unavailable',
            };
        }
        return this.worldPlayerSnapshotService.ensureCompatBackfillSnapshot(playerId);
    }
    async loadNextPlayerIdentity(userId) {
        if (typeof this.worldPlayerSourceService?.loadNextPlayerIdentity === 'function') {
            return this.worldPlayerSourceService.loadNextPlayerIdentity(userId);
        }
        return this.playerIdentityPersistenceService.loadPlayerIdentity(userId);
    }
    async promotePersistedIdentityToNative(identity, expectedPersistedSources = null) {
        const normalizedUserId = typeof identity?.userId === 'string' ? identity.userId.trim() : '';
        const normalizedPlayerId = typeof identity?.playerId === 'string' ? identity.playerId.trim() : '';
        const persistedSource = normalizePersistedSource(identity);
        const normalizedExpectedPersistedSources = expectedPersistedSources instanceof Set
            ? expectedPersistedSources
            : Array.isArray(expectedPersistedSources)
                ? new Set(expectedPersistedSources)
                : expectedPersistedSources
                    ? new Set([expectedPersistedSources])
                    : null;
        if (!normalizedUserId
            || !normalizedPlayerId
            || !persistedSource
            || (normalizedExpectedPersistedSources && !normalizedExpectedPersistedSources.has(persistedSource))) {
            return identity ?? null;
        }
        if (!this.playerIdentityPersistenceService.isEnabled()) {
            return identity ?? null;
        }
        let promotedIdentity = null;
        try {
            promotedIdentity = await this.playerIdentityPersistenceService.savePlayerIdentity({
                ...identity,
                persistedSource: 'native',
                updatedAt: Date.now(),
            });
        }
        catch (error) {
            this.logger.warn(`Player identity token_seed native promotion failed: userId=${normalizedUserId} playerId=${normalizedPlayerId} error=${error instanceof Error ? error.message : String(error)}`);
            return identity ?? null;
        }
        const promotedPersistedSource = normalizePersistedSource(promotedIdentity);
        if (!promotedIdentity || promotedPersistedSource !== 'native') {
            this.logger.warn(`Player identity token_seed native promotion returned unexpected persistedSource: userId=${normalizedUserId} playerId=${normalizedPlayerId} actual=${promotedPersistedSource ?? 'unknown'}`);
            return identity ?? null;
        }
        return {
            ...promotedIdentity,
            persistedSource: promotedPersistedSource,
            authSource: 'next',
            nextLoadHit: true,
        };
    }
    async promoteTokenSeedIdentityToNative(identity) {
        return this.promotePersistedIdentityToNative(identity, 'token_seed');
    }
    async normalizeLoadedNextIdentityForNextProtocol(identity) {
        const persistedSource = normalizePersistedSource(identity);
        if (persistedSource !== 'legacy_backfill') {
            return {
                identity,
                persistFailureStage: null,
            };
        }
        if (typeof this.worldPlayerSnapshotService?.loadNextPlayerSnapshotRecord !== 'function') {
            this.logger.warn(`Player identity next_protocol legacy_backfill normalization unavailable: userId=${identity?.userId ?? 'unknown'} playerId=${identity?.playerId ?? 'unknown'} reason=snapshot_source_unavailable`);
            return {
                identity: null,
                persistFailureStage: 'next_protocol_legacy_backfill_snapshot_source_unavailable',
            };
        }
        let nextSnapshotRecord = null;
        try {
            nextSnapshotRecord = await this.worldPlayerSnapshotService.loadNextPlayerSnapshotRecord(identity.playerId);
        }
        catch (error) {
            this.logger.warn(`Player identity next_protocol legacy_backfill snapshot load failed: userId=${identity?.userId ?? 'unknown'} playerId=${identity?.playerId ?? 'unknown'} error=${error instanceof Error ? error.message : String(error)}`);
            return {
                identity: null,
                persistFailureStage: 'next_protocol_legacy_backfill_snapshot_load_failed',
            };
        }
        const snapshotPersistedSource = typeof nextSnapshotRecord?.persistedSource === 'string'
            ? nextSnapshotRecord.persistedSource.trim()
            : '';
        const hasCompatibleSeededSnapshot = Boolean(nextSnapshotRecord?.snapshot)
            && (snapshotPersistedSource === 'native' || snapshotPersistedSource === 'legacy_seeded');
        if (!hasCompatibleSeededSnapshot) {
            return {
                identity: null,
                persistFailureStage: 'next_protocol_legacy_backfill_requires_native_snapshot',
            };
        }
        const promotedIdentity = await this.promotePersistedIdentityToNative(identity, 'legacy_backfill');
        const promotedPersistedSource = normalizePersistedSource(promotedIdentity);
        if (!promotedIdentity || promotedPersistedSource !== 'native') {
            return {
                identity: null,
                persistFailureStage: 'next_protocol_legacy_backfill_promotion_failed',
            };
        }
        return {
            identity: promotedIdentity,
            persistFailureStage: null,
        };
    }
    async resolveMigrationIdentity(payload) {
        if (typeof this.worldPlayerSourceService?.resolvePlayerIdentityForMigration === 'function') {
            return this.worldPlayerSourceService.resolvePlayerIdentityForMigration(payload, COMPAT_MIGRATION_SOURCE_OPTIONS);
        }
        if (typeof this.worldPlayerSourceService?.resolveCompatPlayerIdentityForMigration !== 'function') {
            throw new Error('compat migration identity source unavailable');
        }
        return this.worldPlayerSourceService.resolveCompatPlayerIdentityForMigration(payload, COMPAT_MIGRATION_SOURCE_OPTIONS);
    }
    async loadMigrationSnapshot(playerId) {
        if (typeof this.worldPlayerSourceService?.loadPlayerSnapshotForMigration === 'function') {
            return this.worldPlayerSourceService.loadPlayerSnapshotForMigration(playerId, COMPAT_MIGRATION_SOURCE_OPTIONS);
        }
        if (typeof this.worldPlayerSourceService?.loadCompatPlayerSnapshotForMigration !== 'function') {
            throw new Error('compat migration snapshot source unavailable');
        }
        return this.worldPlayerSourceService.loadCompatPlayerSnapshotForMigration(playerId, COMPAT_MIGRATION_SOURCE_OPTIONS);
    }
    async shouldPreferCompatBackfill(payload, tokenIdentity, identityPersistenceEnabled) {
        const hasCompatIdentitySource = typeof this.worldPlayerSourceService?.resolvePlayerIdentityForMigration === 'function'
            || typeof this.worldPlayerSourceService?.resolveCompatPlayerIdentityForMigration === 'function';
        const hasCompatSnapshotSource = typeof this.worldPlayerSourceService?.loadPlayerSnapshotForMigration === 'function'
            || typeof this.worldPlayerSourceService?.loadCompatPlayerSnapshotForMigration === 'function';
        if (!identityPersistenceEnabled
            || !tokenIdentity
            || !hasLegacyDatabaseConfigured()
            || !hasCompatIdentitySource
            || !hasCompatSnapshotSource) {
            return false;
        }
        const compatSnapshot = await this.loadMigrationSnapshot(tokenIdentity.playerId).catch((error) => {
            this.logger.warn(`Player compat snapshot precheck failed before token seed: playerId=${tokenIdentity.playerId} error=${error instanceof Error ? error.message : String(error)}`);
            return null;
        });
        if (!compatSnapshot) {
            return false;
        }
        const compatIdentity = await this.resolveMigrationIdentity(payload).catch((error) => {
            this.logger.warn(`Player compat identity precheck failed before token seed: userId=${payload.sub} playerId=${tokenIdentity.playerId} error=${error instanceof Error ? error.message : String(error)}`);
            return null;
        });
        return Boolean(compatIdentity);
    }
    async authenticateViaCompatMigration(payload, tokenIdentity, identityPersistenceEnabled, allowCompatBackfill, preferCompatBackfill = false) {
        let compatIdentity = null;
        let compatIdentityResolved = false;
        const resolveCompatIdentityOnce = async () => {
            if (!compatIdentityResolved) {
                compatIdentity = await this.resolveMigrationIdentity(payload);
                compatIdentityResolved = true;
            }
            return compatIdentity;
        };
        const shouldAttemptPersistedCompatBackfill = identityPersistenceEnabled
            && allowCompatBackfill
            && (!tokenIdentity || preferCompatBackfill);
        if (shouldAttemptPersistedCompatBackfill) {
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
                if (persistFailureStage === 'compat_backfill_save_failed') {
                    (0, world_player_token_service_1.recordAuthTrace)({
                        type: 'identity',
                        source: 'migration_persist_blocked',
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
                const persistedCompatSource = normalizePersistedSource(persistedCompatIdentity);
                if (persistedCompatIdentity && persistedCompatSource !== 'legacy_backfill') {
                    this.logger.error(`Player identity compat backfill save returned unexpected persistedSource: userId=${compatIdentity.userId} playerId=${compatIdentity.playerId} expected=legacy_backfill actual=${persistedCompatSource ?? 'unknown'}`);
                    (0, world_player_token_service_1.recordAuthTrace)({
                        type: 'identity',
                        source: 'migration_persist_blocked',
                        userId: compatIdentity.userId,
                        playerId: compatIdentity.playerId,
                        persistedSource: persistedCompatSource,
                        persistenceEnabled: true,
                        nextLoadHit: false,
                        compatTried: true,
                        persistAttempted: true,
                        persistSucceeded: false,
                        persistFailureStage: 'compat_backfill_persisted_source_mismatch',
                    });
                    return null;
                }
                const ensuredCompatSnapshot = persistedCompatIdentity
                    ? await this.ensureLegacyBackfillSnapshot(compatIdentity.playerId)
                    : { ok: false, failureStage: 'compat_snapshot_not_attempted' };
                if (persistedCompatIdentity && !ensuredCompatSnapshot.ok) {
                    (0, world_player_token_service_1.recordAuthTrace)({
                        type: 'identity',
                        source: 'migration_preseed_blocked',
                        userId: compatIdentity.userId,
                        playerId: compatIdentity.playerId,
                        persistedSource: persistedCompatIdentity?.persistedSource ?? null,
                        persistenceEnabled: true,
                        nextLoadHit: false,
                        compatTried: true,
                        persistAttempted: true,
                        persistSucceeded: true,
                        persistFailureStage: ensuredCompatSnapshot.failureStage ?? 'compat_snapshot_seed_failed',
                    });
                    return null;
                }
                const authSource = 'migration_backfill';
                (0, world_player_token_service_1.recordAuthTrace)({
                    type: 'identity',
                    source: authSource,
                    userId: compatIdentity.userId,
                    playerId: compatIdentity.playerId,
                    persistedSource: persistedCompatIdentity?.persistedSource ?? null,
                    persistenceEnabled: identityPersistenceEnabled,
                    nextLoadHit: false,
                    compatTried: true,
                    persistAttempted: true,
                    persistSucceeded: persistedCompatIdentity !== null,
                    persistFailureStage,
                });
                return {
                    ...compatIdentity,
                    persistedSource: persistedCompatIdentity?.persistedSource ?? null,
                    authSource,
                    nextLoadHit: false,
                };
            }
        }
        (0, world_player_token_service_1.recordAuthTrace)({
            type: 'identity',
            source: 'miss',
            userId: payload.sub,
            playerId: tokenIdentity?.playerId ?? null,
            persistenceEnabled: identityPersistenceEnabled,
            nextLoadHit: false,
            compatTried: allowCompatBackfill,
            persistAttempted: false,
            persistSucceeded: null,
            persistFailureStage: null,
        });
        return null;
    }
    async authenticatePlayerToken(token, options = undefined) {
        const payload = this.worldPlayerTokenService.validatePlayerToken(token);
        if (!payload) {
            return null;
        }
        const protocol = normalizeProtocol(options?.protocol);
        const nextProtocolStrict = protocol === 'next';
        const compatBackfillProtocolAllowed = !nextProtocolStrict && isCompatMigrationBackfillRequested(options);
        const tokenIdentity = this.worldPlayerTokenService.resolvePlayerIdentityFromPayload(payload);
        const identityPersistenceEnabled = this.playerIdentityPersistenceService.isEnabled();
        let nextIdentity = null;
        try {
            nextIdentity = await this.loadNextPlayerIdentity(payload.sub);
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
            let normalizedNextIdentity = nextIdentity;
            let nextPersistedSource = normalizePersistedSource(normalizedNextIdentity);
            if (!nextPersistedSource) {
                this.logger.error(`Player identity next record missing persistedSource: userId=${normalizedNextIdentity.userId} playerId=${normalizedNextIdentity.playerId}`);
                (0, world_player_token_service_1.recordAuthTrace)({
                    type: 'identity',
                    source: 'next_invalid',
                    userId: normalizedNextIdentity.userId,
                    playerId: normalizedNextIdentity.playerId,
                    persistedSource: null,
                    persistenceEnabled: identityPersistenceEnabled,
                    nextLoadHit: true,
                    compatTried: false,
                    persistAttempted: false,
                    persistSucceeded: null,
                    persistFailureStage: 'next_identity_persisted_source_missing',
                });
                return null;
            }
            if (nextPersistedSource !== 'native'
                && nextPersistedSource !== 'legacy_sync'
                && nextPersistedSource !== 'legacy_backfill'
                && nextPersistedSource !== 'token_seed') {
                this.logger.error(`Player identity next record has unsupported persistedSource: userId=${normalizedNextIdentity.userId} playerId=${normalizedNextIdentity.playerId} persistedSource=${nextPersistedSource}`);
                (0, world_player_token_service_1.recordAuthTrace)({
                    type: 'identity',
                    source: 'next_invalid',
                    userId: normalizedNextIdentity.userId,
                    playerId: normalizedNextIdentity.playerId,
                    persistedSource: nextPersistedSource,
                    persistenceEnabled: identityPersistenceEnabled,
                    nextLoadHit: true,
                    compatTried: false,
                    persistAttempted: false,
                    persistSucceeded: null,
                    persistFailureStage: 'next_identity_persisted_source_invalid',
                });
                return null;
            }
            if (nextProtocolStrict) {
                const nextProtocolNormalizedResult = await this.normalizeLoadedNextIdentityForNextProtocol(normalizedNextIdentity);
                if (!nextProtocolNormalizedResult.identity) {
                    (0, world_player_token_service_1.recordAuthTrace)({
                        type: 'identity',
                        source: 'next_invalid',
                        userId: normalizedNextIdentity.userId,
                        playerId: normalizedNextIdentity.playerId,
                        persistedSource: nextPersistedSource,
                        persistenceEnabled: identityPersistenceEnabled,
                        nextLoadHit: true,
                        compatTried: false,
                        persistAttempted: false,
                        persistSucceeded: null,
                        persistFailureStage: nextProtocolNormalizedResult.persistFailureStage ?? 'next_protocol_loaded_identity_blocked',
                    });
                    return null;
                }
                normalizedNextIdentity = nextProtocolNormalizedResult.identity;
                nextPersistedSource = normalizePersistedSource(normalizedNextIdentity);
            }
            const nextIdentityAuthSource = resolvePersistedNextIdentityAuthSource(nextPersistedSource);
            (0, world_player_token_service_1.recordAuthTrace)({
                type: 'identity',
                source: nextIdentityAuthSource,
                userId: normalizedNextIdentity.userId,
                playerId: normalizedNextIdentity.playerId,
                persistedSource: nextPersistedSource,
                persistenceEnabled: identityPersistenceEnabled,
                nextLoadHit: true,
                compatTried: false,
                persistAttempted: false,
                persistSucceeded: null,
                persistFailureStage: null,
            });
            return {
                ...normalizedNextIdentity,
                persistedSource: nextPersistedSource,
                authSource: nextIdentityAuthSource,
                nextLoadHit: true,
            };
        }
        const allowCompatBackfill = compatBackfillProtocolAllowed && isCompatIdentityBackfillAllowed();
        const allowCompatMigrationInPersistence = identityPersistenceEnabled && !nextProtocolStrict && allowCompatBackfill;
        const legacyDatabaseConfigured = hasLegacyDatabaseConfigured();
        const allowTokenRuntimeIdentity = !identityPersistenceEnabled
            && !nextProtocolStrict
            && tokenIdentity
            && hasExplicitTokenPlayerIdentityClaims(payload)
            && !legacyDatabaseConfigured;
        if (allowTokenRuntimeIdentity) {
            (0, world_player_token_service_1.recordAuthTrace)({
                type: 'identity',
                source: 'token_runtime',
                userId: tokenIdentity.userId,
                playerId: tokenIdentity.playerId,
                persistedSource: null,
                persistenceEnabled: false,
                nextLoadHit: false,
                compatTried: false,
                persistAttempted: false,
                persistSucceeded: null,
                persistFailureStage: null,
            });
            return {
                ...tokenIdentity,
                authSource: 'token_runtime',
                nextLoadHit: false,
            };
        }
        const preferCompatBackfill = allowCompatMigrationInPersistence
            ? await this.shouldPreferCompatBackfill(payload, tokenIdentity, identityPersistenceEnabled)
            : false;
        if (identityPersistenceEnabled && tokenIdentity && !preferCompatBackfill) {
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
            const persistedTokenSource = normalizePersistedSource(persistedTokenIdentity);
            if (persistedTokenIdentity && persistedTokenSource !== 'token_seed') {
                this.logger.error(`Player identity token seed save returned unexpected persistedSource: userId=${tokenIdentity.userId} playerId=${tokenIdentity.playerId} expected=token_seed actual=${persistedTokenSource ?? 'unknown'}`);
                (0, world_player_token_service_1.recordAuthTrace)({
                    type: 'identity',
                    source: 'token_persist_blocked',
                    userId: tokenIdentity.userId,
                    playerId: tokenIdentity.playerId,
                    persistedSource: persistedTokenSource,
                    persistenceEnabled: true,
                    nextLoadHit: false,
                    compatTried: false,
                    persistAttempted: true,
                    persistSucceeded: false,
                    persistFailureStage: 'token_seed_persisted_source_mismatch',
                });
                return null;
            }
            const nativeStarterSnapshot = persistedTokenIdentity
                ? await this.ensureTokenSeedSnapshot(tokenIdentity.playerId)
                : { ok: false, failureStage: 'native_snapshot_not_attempted' };
            if (persistedTokenIdentity && !nativeStarterSnapshot.ok) {
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
                    persistFailureStage: nativeStarterSnapshot.failureStage ?? 'native_snapshot_seed_failed',
                });
                return null;
            }
            if (persistedTokenIdentity && nativeStarterSnapshot.ok) {
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
                    persistedSource: persistedTokenIdentity?.persistedSource ?? null,
                    authSource: 'token',
                    nextLoadHit: false,
                };
            }
        }
        if (nextProtocolStrict) {
            (0, world_player_token_service_1.recordAuthTrace)({
                type: 'identity',
                source: 'miss',
                userId: payload.sub,
                playerId: tokenIdentity?.playerId ?? null,
                persistenceEnabled: identityPersistenceEnabled,
                nextLoadHit: false,
                compatTried: false,
                persistAttempted: false,
                persistSucceeded: null,
                persistFailureStage: 'next_protocol_native_identity_required',
            });
            return null;
        }
        return this.authenticateViaCompatMigration(payload, tokenIdentity, identityPersistenceEnabled, allowCompatMigrationInPersistence, preferCompatBackfill);
    }
};
exports.WorldPlayerAuthService = WorldPlayerAuthService;
exports.WorldPlayerAuthService = WorldPlayerAuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_player_token_service_1.WorldPlayerTokenService,
        player_identity_persistence_service_1.PlayerIdentityPersistenceService,
        world_player_source_service_1.WorldPlayerSourceService,
        world_player_snapshot_service_1.WorldPlayerSnapshotService])
], WorldPlayerAuthService);
//# sourceMappingURL=world-player-auth.service.js.map
