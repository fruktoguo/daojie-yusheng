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

const ALLOW_MIGRATION_BACKFILL_ENV_KEYS = [
    'SERVER_NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL',
    'NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL',
];

const LEGACY_DATABASE_ENV_KEYS = [
    'SERVER_NEXT_DATABASE_URL',
    'DATABASE_URL',
];
function isMigrationBackfillAllowed() {
    for (const key of ALLOW_MIGRATION_BACKFILL_ENV_KEYS) {
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
function isExplicitMigrationProtocol(protocol) {
    return protocol === 'migration';
}
function normalizePersistedSource(identity) {

    const persistedSource = typeof identity?.persistedSource === 'string' ? identity.persistedSource.trim() : '';
    return persistedSource || null;
}
function resolvePersistedNextIdentityAuthSource(persistedSource) {
    return persistedSource === 'token_seed' ? 'token' : 'next';
}

const MIGRATION_SOURCE_OPTIONS = Object.freeze({
    allowCompatMigration: true,
    allowLegacyHttpIdentityFallback: false,
    reason: 'auth_migration',
});

/** 世界玩家鉴权服务：把 token 校验、migration 回填和身份持久化收敛到一起。 */
let WorldPlayerAuthService = class WorldPlayerAuthService {
    /** 鉴权日志，便于追踪 token、回填和持久化失败。 */
    logger = new common_1.Logger(WorldPlayerAuthService.name);
    /** 生成和校验 next 玩家令牌。 */
    worldPlayerTokenService;
    /** 玩家身份持久化入口。 */
    playerIdentityPersistenceService;
    /** 玩家快照服务，用于迁移或回填时检查 starter snapshot。 */
    worldPlayerSnapshotService;
    /** migration 玩家源服务，负责从 legacy 数据里恢复身份。 */
    worldPlayerSourceService;
    constructor(worldPlayerTokenService, playerIdentityPersistenceService, worldPlayerSourceService, worldPlayerSnapshotService = undefined) {
        this.worldPlayerTokenService = worldPlayerTokenService;
        this.playerIdentityPersistenceService = playerIdentityPersistenceService;
        this.worldPlayerSourceService = worldPlayerSourceService;
        this.worldPlayerSnapshotService = worldPlayerSnapshotService;
    }
    /** 确保 token_seed 账号拥有可用的 starter snapshot。 */
    async ensureTokenSeedSnapshot(playerId) {
        if (!this.worldPlayerSnapshotService?.ensureNativeStarterSnapshot) {
            return {
                ok: false,
                failureStage: 'native_snapshot_service_unavailable',
            };
        }
        return this.worldPlayerSnapshotService.ensureNativeStarterSnapshot(playerId);
    }
    /** 确保 legacy 回填账号拥有可用的 starter snapshot。 */
    async ensureLegacyBackfillSnapshot(playerId) {
        if (!this.worldPlayerSnapshotService?.ensureMigrationBackfillSnapshot) {
            return {
                ok: false,
                failureStage: 'migration_snapshot_service_unavailable',
            };
        }
        return this.worldPlayerSnapshotService.ensureMigrationBackfillSnapshot(playerId);
    }
    /** 加载 next 玩家身份，优先走 next 持久化来源。 */
    async loadNextPlayerIdentity(userId) {
        if (typeof this.worldPlayerSourceService?.loadNextPlayerIdentity === 'function') {
            return this.worldPlayerSourceService.loadNextPlayerIdentity(userId);
        }
        return this.playerIdentityPersistenceService.loadPlayerIdentity(userId);
    }
    /** 将持久化身份提升到 native 来源，供 next 协议继续复用。 */
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
            this.logger.warn(`玩家身份 token_seed 原生提升失败：userId=${normalizedUserId} playerId=${normalizedPlayerId} error=${error instanceof Error ? error.message : String(error)}`);
            return identity ?? null;
        }

        const promotedPersistedSource = normalizePersistedSource(promotedIdentity);
        if (!promotedIdentity || promotedPersistedSource !== 'native') {
            this.logger.warn(`玩家身份 token_seed 原生提升返回了异常 persistedSource：userId=${normalizedUserId} playerId=${normalizedPlayerId} actual=${promotedPersistedSource ?? '未知'}`);
            return identity ?? null;
        }
        return {
            ...promotedIdentity,
            persistedSource: promotedPersistedSource,
            authSource: 'next',
            nextLoadHit: true,
        };
    }
    /** 仅针对 token_seed 来源做原生提升。 */
    async promoteTokenSeedIdentityToNative(identity) {
        return this.promotePersistedIdentityToNative(identity, 'token_seed');
    }
    /** 仅针对 legacy backfill/sync 来源做原生提升。 */
    async promoteLegacyDerivedIdentityToNative(identity) {
        return this.promotePersistedIdentityToNative(identity, ['legacy_backfill', 'legacy_sync']);
    }
    /** 把 legacy 回填身份规范化到 next 协议可接受的 native 状态。 */
    async normalizeLoadedNextIdentityForNextProtocol(identity) {

        const persistedSource = normalizePersistedSource(identity);
        if (persistedSource !== 'legacy_backfill' && persistedSource !== 'legacy_sync') {
            return {
                identity,
                persistFailureStage: null,
            };
        }

        const failureStagePrefix = persistedSource === 'legacy_sync'
            ? 'next_protocol_legacy_sync'
            : 'next_protocol_legacy_backfill';
        if (typeof this.worldPlayerSnapshotService?.loadNextPlayerSnapshotRecord !== 'function') {
            this.logger.warn(`玩家身份 ${persistedSource} 规范化不可用：userId=${identity?.userId ?? '未知'} playerId=${identity?.playerId ?? '未知'} reason=snapshot_source_unavailable`);
            return {
                identity: null,
                persistFailureStage: `${failureStagePrefix}_snapshot_source_unavailable`,
            };
        }

        let nextSnapshotRecord = null;
        try {
            nextSnapshotRecord = await this.worldPlayerSnapshotService.loadNextPlayerSnapshotRecord(identity.playerId);
        }
        catch (error) {
            this.logger.warn(`玩家身份 ${persistedSource} 快照加载失败：userId=${identity?.userId ?? '未知'} playerId=${identity?.playerId ?? '未知'} error=${error instanceof Error ? error.message : String(error)}`);
            return {
                identity: null,
                persistFailureStage: `${failureStagePrefix}_snapshot_load_failed`,
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
                persistFailureStage: `${failureStagePrefix}_requires_native_snapshot`,
            };
        }

        const promotedIdentity = await this.promoteLegacyDerivedIdentityToNative(identity);

        const promotedPersistedSource = normalizePersistedSource(promotedIdentity);
        if (!promotedIdentity || promotedPersistedSource !== 'native') {
            return {
                identity: null,
                persistFailureStage: `${failureStagePrefix}_promotion_failed`,
            };
        }
        return {
            identity: promotedIdentity,
            persistFailureStage: null,
        };
    }
    /** 统一对迁移输入做身份解析，便于 HTTP/Socket 共用。 */
    async resolveMigrationIdentity(payload) {
        if (typeof this.worldPlayerSourceService?.resolvePlayerIdentityForMigration !== 'function') {
            throw new Error('migration identity source unavailable');
        }
        return this.worldPlayerSourceService.resolvePlayerIdentityForMigration(payload, MIGRATION_SOURCE_OPTIONS);
    }
    async loadMigrationSnapshot(playerId) {
        if (typeof this.worldPlayerSourceService?.loadPlayerSnapshotForMigration !== 'function') {
            throw new Error('migration snapshot source unavailable');
        }
        return this.worldPlayerSourceService.loadPlayerSnapshotForMigration(playerId, MIGRATION_SOURCE_OPTIONS);
    }
    async shouldPreferMigrationBackfill(payload, tokenIdentity, identityPersistenceEnabled) {

        const hasMigrationIdentitySource = typeof this.worldPlayerSourceService?.resolvePlayerIdentityForMigration === 'function';
        const hasMigrationSnapshotSource = typeof this.worldPlayerSourceService?.loadPlayerSnapshotForMigration === 'function';
        if (!identityPersistenceEnabled
            || !tokenIdentity
            || !hasLegacyDatabaseConfigured()
            || !hasMigrationIdentitySource
            || !hasMigrationSnapshotSource) {
            return false;
        }

        const migrationSnapshot = await this.loadMigrationSnapshot(tokenIdentity.playerId).catch((error) => {
            this.logger.warn(`token seed 前的玩家 migration 快照预检失败：playerId=${tokenIdentity.playerId} error=${error instanceof Error ? error.message : String(error)}`);
            return null;
        });
        if (!migrationSnapshot) {
            return false;
        }

        const migrationIdentity = await this.resolveMigrationIdentity(payload).catch((error) => {
            this.logger.warn(`token seed 前的玩家 migration 身份预检失败：userId=${payload.sub} playerId=${tokenIdentity.playerId} error=${error instanceof Error ? error.message : String(error)}`);
            return null;
        });
        return Boolean(migrationIdentity);
    }
    async authenticateViaMigration(payload, tokenIdentity, identityPersistenceEnabled, allowMigrationBackfill, preferMigrationBackfill = false) {

        let migrationIdentity = null;
        let migrationIdentityResolved = false;
        const resolveMigrationIdentityOnce = async () => {
            if (!migrationIdentityResolved) {
                migrationIdentity = await this.resolveMigrationIdentity(payload);
                migrationIdentityResolved = true;
            }
            return migrationIdentity;
        };

        const shouldAttemptPersistedMigrationBackfill = identityPersistenceEnabled
            && allowMigrationBackfill
            && (!tokenIdentity || preferMigrationBackfill);
        if (shouldAttemptPersistedMigrationBackfill) {
            migrationIdentity = await resolveMigrationIdentityOnce();
            if (migrationIdentity) {

                let persistFailureStage = null;

                const persistedCompatIdentity = await this.playerIdentityPersistenceService.savePlayerIdentity({
                    ...migrationIdentity,
                    persistedSource: 'legacy_backfill',
                    updatedAt: Date.now(),
                }).catch((error) => {
                    persistFailureStage = 'migration_backfill_save_failed';
                    this.logger.warn(`玩家身份 migration 回填保存失败：userId=${migrationIdentity.userId} playerId=${migrationIdentity.playerId} error=${error instanceof Error ? error.message : String(error)}`);
                    return null;
                });
                if (persistFailureStage === 'migration_backfill_save_failed') {
                    (0, world_player_token_service_1.recordAuthTrace)({
                        type: 'identity',
                        source: 'migration_persist_blocked',
                        userId: migrationIdentity.userId,
                        playerId: migrationIdentity.playerId,
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
                    this.logger.error(`玩家身份 migration 回填保存返回了异常 persistedSource：userId=${migrationIdentity.userId} playerId=${migrationIdentity.playerId} expected=legacy_backfill actual=${persistedCompatSource ?? '未知'}`);
                    (0, world_player_token_service_1.recordAuthTrace)({
                        type: 'identity',
                        source: 'migration_persist_blocked',
                        userId: migrationIdentity.userId,
                        playerId: migrationIdentity.playerId,
                        persistedSource: persistedCompatSource,
                        persistenceEnabled: true,
                        nextLoadHit: false,
                        compatTried: true,
                        persistAttempted: true,
                        persistSucceeded: false,
                        persistFailureStage: 'migration_backfill_persisted_source_mismatch',
                    });
                    return null;
                }

                const ensuredCompatSnapshot = persistedCompatIdentity
                    ? await this.ensureLegacyBackfillSnapshot(migrationIdentity.playerId)
                    : { ok: false, failureStage: 'migration_snapshot_not_attempted' };
                if (persistedCompatIdentity && !ensuredCompatSnapshot.ok) {
                    (0, world_player_token_service_1.recordAuthTrace)({
                        type: 'identity',
                        source: 'migration_preseed_blocked',
                        userId: migrationIdentity.userId,
                        playerId: migrationIdentity.playerId,
                        persistedSource: persistedCompatIdentity?.persistedSource ?? null,
                        persistenceEnabled: true,
                        nextLoadHit: false,
                        compatTried: true,
                        persistAttempted: true,
                        persistSucceeded: true,
                        persistFailureStage: ensuredCompatSnapshot.failureStage ?? 'migration_snapshot_seed_failed',
                    });
                    return null;
                }

                const authSource = 'migration_backfill';
                (0, world_player_token_service_1.recordAuthTrace)({
                    type: 'identity',
                    source: authSource,
                    userId: migrationIdentity.userId,
                    playerId: migrationIdentity.playerId,
                    persistedSource: persistedCompatIdentity?.persistedSource ?? null,
                    persistenceEnabled: identityPersistenceEnabled,
                    nextLoadHit: false,
                    compatTried: true,
                    persistAttempted: true,

                    persistSucceeded: persistedCompatIdentity !== null,
                    persistFailureStage,
                });
                return {
                    ...migrationIdentity,
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
            compatTried: allowMigrationBackfill,
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

        // migration identity/backfill 只允许显式 migration 协议窗口，默认与 legacy 入口都不可旁路开启。
        const migrationBackfillProtocolAllowed = isExplicitMigrationProtocol(protocol);

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
                this.logger.error(`玩家身份 next 记录缺少 persistedSource：userId=${normalizedNextIdentity.userId} playerId=${normalizedNextIdentity.playerId}`);
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
                this.logger.error(`玩家身份 next 记录存在不支持的 persistedSource：userId=${normalizedNextIdentity.userId} playerId=${normalizedNextIdentity.playerId} persistedSource=${nextPersistedSource}`);
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

        const allowMigrationBackfill = migrationBackfillProtocolAllowed && isMigrationBackfillAllowed();

        const allowMigrationInPersistence = identityPersistenceEnabled && !nextProtocolStrict && allowMigrationBackfill;

        const legacyDatabaseConfigured = hasLegacyDatabaseConfigured();

        const allowTokenRuntimeIdentity = !identityPersistenceEnabled
            && !nextProtocolStrict
            && !isExplicitMigrationProtocol(protocol)
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

        const preferMigrationBackfill = allowMigrationInPersistence
            ? await this.shouldPreferMigrationBackfill(payload, tokenIdentity, identityPersistenceEnabled)
            : false;
        if (identityPersistenceEnabled && tokenIdentity && !preferMigrationBackfill) {

            let persistFailureStage = null;

            const persistedTokenIdentity = await this.playerIdentityPersistenceService.savePlayerIdentity({
                ...tokenIdentity,
                persistedSource: 'token_seed',
                updatedAt: Date.now(),
            }).catch((error) => {
                persistFailureStage = 'token_seed_save_failed';
                this.logger.warn(`玩家身份 token seed 保存失败：userId=${tokenIdentity.userId} playerId=${tokenIdentity.playerId} error=${error instanceof Error ? error.message : String(error)}`);
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
                this.logger.error(`玩家身份 token seed 保存返回了异常 persistedSource：userId=${tokenIdentity.userId} playerId=${tokenIdentity.playerId} expected=token_seed actual=${persistedTokenSource ?? '未知'}`);
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
        return this.authenticateViaMigration(payload, tokenIdentity, identityPersistenceEnabled, allowMigrationInPersistence, preferMigrationBackfill);
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
