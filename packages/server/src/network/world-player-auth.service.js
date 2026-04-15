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
exports.WorldPlayerAuthService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** player_identity_persistence_service_1：定义该变量以承载业务值。 */
const player_identity_persistence_service_1 = require("../persistence/player-identity-persistence.service");
/** world_player_snapshot_service_1：定义该变量以承载业务值。 */
const world_player_snapshot_service_1 = require("./world-player-snapshot.service");
/** world_player_source_service_1：定义该变量以承载业务值。 */
const world_player_source_service_1 = require("./world-player-source.service");
/** world_player_token_service_1：定义该变量以承载业务值。 */
const world_player_token_service_1 = require("./world-player-token.service");
/** ALLOW_COMPAT_IDENTITY_BACKFILL_ENV_KEYS：定义该变量以承载业务值。 */
const ALLOW_COMPAT_IDENTITY_BACKFILL_ENV_KEYS = [
    'SERVER_NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL',
    'NEXT_AUTH_ALLOW_COMPAT_IDENTITY_BACKFILL',
];
/** LEGACY_DATABASE_ENV_KEYS：定义该变量以承载业务值。 */
const LEGACY_DATABASE_ENV_KEYS = [
    'SERVER_NEXT_DATABASE_URL',
    'DATABASE_URL',
];
/** isCompatIdentityBackfillAllowed：执行对应的业务逻辑。 */
function isCompatIdentityBackfillAllowed() {
    for (const key of ALLOW_COMPAT_IDENTITY_BACKFILL_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
        if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
            return true;
        }
    }
    return false;
}
/** hasLegacyDatabaseConfigured：执行对应的业务逻辑。 */
function hasLegacyDatabaseConfigured() {
    for (const key of LEGACY_DATABASE_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim() : '';
        if (value) {
            return true;
        }
    }
    return false;
}
/** hasExplicitTokenPlayerIdentityClaims：执行对应的业务逻辑。 */
function hasExplicitTokenPlayerIdentityClaims(payload) {
/** playerId：定义该变量以承载业务值。 */
    const playerId = typeof payload?.playerId === 'string' ? payload.playerId.trim() : '';
/** playerName：定义该变量以承载业务值。 */
    const playerName = typeof payload?.playerName === 'string' ? payload.playerName.trim() : '';
    return Boolean(playerId && playerName);
}
/** normalizeProtocol：执行对应的业务逻辑。 */
function normalizeProtocol(protocol) {
    return typeof protocol === 'string' ? protocol.trim().toLowerCase() : '';
}
/** isCompatMigrationBackfillRequested：执行对应的业务逻辑。 */
function isCompatMigrationBackfillRequested(options) {
    return options?.allowCompatMigrationBackfill === true;
}
/** normalizePersistedSource：执行对应的业务逻辑。 */
function normalizePersistedSource(identity) {
/** persistedSource：定义该变量以承载业务值。 */
    const persistedSource = typeof identity?.persistedSource === 'string' ? identity.persistedSource.trim() : '';
    return persistedSource || null;
}
/** resolvePersistedNextIdentityAuthSource：执行对应的业务逻辑。 */
function resolvePersistedNextIdentityAuthSource(persistedSource) {
    return persistedSource === 'token_seed' ? 'token' : 'next';
}
/** COMPAT_MIGRATION_SOURCE_OPTIONS：定义该变量以承载业务值。 */
const COMPAT_MIGRATION_SOURCE_OPTIONS = Object.freeze({
    allowCompatMigration: true,
    allowLegacyHttpIdentityFallback: false,
    reason: 'auth_migration',
});
/** WorldPlayerAuthService：定义该变量以承载业务值。 */
let WorldPlayerAuthService = class WorldPlayerAuthService {
    logger = new common_1.Logger(WorldPlayerAuthService.name);
    worldPlayerTokenService;
    playerIdentityPersistenceService;
    worldPlayerSnapshotService;
    worldPlayerSourceService;
/** 构造函数：执行实例初始化流程。 */
    constructor(worldPlayerTokenService, playerIdentityPersistenceService, worldPlayerSourceService, worldPlayerSnapshotService = undefined) {
        this.worldPlayerTokenService = worldPlayerTokenService;
        this.playerIdentityPersistenceService = playerIdentityPersistenceService;
        this.worldPlayerSourceService = worldPlayerSourceService;
        this.worldPlayerSnapshotService = worldPlayerSnapshotService;
    }
/** ensureTokenSeedSnapshot：执行对应的业务逻辑。 */
    async ensureTokenSeedSnapshot(playerId) {
        if (!this.worldPlayerSnapshotService?.ensureNativeStarterSnapshot) {
            return {
                ok: false,
                failureStage: 'native_snapshot_service_unavailable',
            };
        }
        return this.worldPlayerSnapshotService.ensureNativeStarterSnapshot(playerId);
    }
/** ensureLegacyBackfillSnapshot：执行对应的业务逻辑。 */
    async ensureLegacyBackfillSnapshot(playerId) {
        if (!this.worldPlayerSnapshotService?.ensureCompatBackfillSnapshot) {
            return {
                ok: false,
                failureStage: 'compat_snapshot_service_unavailable',
            };
        }
        return this.worldPlayerSnapshotService.ensureCompatBackfillSnapshot(playerId);
    }
/** loadNextPlayerIdentity：执行对应的业务逻辑。 */
    async loadNextPlayerIdentity(userId) {
        if (typeof this.worldPlayerSourceService?.loadNextPlayerIdentity === 'function') {
            return this.worldPlayerSourceService.loadNextPlayerIdentity(userId);
        }
        return this.playerIdentityPersistenceService.loadPlayerIdentity(userId);
    }
/** promotePersistedIdentityToNative：执行对应的业务逻辑。 */
    async promotePersistedIdentityToNative(identity, expectedPersistedSources = null) {
/** normalizedUserId：定义该变量以承载业务值。 */
        const normalizedUserId = typeof identity?.userId === 'string' ? identity.userId.trim() : '';
/** normalizedPlayerId：定义该变量以承载业务值。 */
        const normalizedPlayerId = typeof identity?.playerId === 'string' ? identity.playerId.trim() : '';
/** persistedSource：定义该变量以承载业务值。 */
        const persistedSource = normalizePersistedSource(identity);
/** normalizedExpectedPersistedSources：定义该变量以承载业务值。 */
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
/** promotedIdentity：定义该变量以承载业务值。 */
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
/** promotedPersistedSource：定义该变量以承载业务值。 */
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
/** promoteTokenSeedIdentityToNative：执行对应的业务逻辑。 */
    async promoteTokenSeedIdentityToNative(identity) {
        return this.promotePersistedIdentityToNative(identity, 'token_seed');
    }
/** normalizeLoadedNextIdentityForNextProtocol：执行对应的业务逻辑。 */
    async normalizeLoadedNextIdentityForNextProtocol(identity) {
/** persistedSource：定义该变量以承载业务值。 */
        const persistedSource = normalizePersistedSource(identity);
        if (persistedSource !== 'legacy_backfill') {
            return {
                identity,
                persistFailureStage: null,
            };
        }
        if (typeof this.worldPlayerSnapshotService?.loadNextPlayerSnapshotRecord !== 'function') {
            this.logger.warn(`玩家身份 next_protocol legacy_backfill 规范化不可用：userId=${identity?.userId ?? '未知'} playerId=${identity?.playerId ?? '未知'} reason=snapshot_source_unavailable`);
            return {
                identity: null,
                persistFailureStage: 'next_protocol_legacy_backfill_snapshot_source_unavailable',
            };
        }
/** nextSnapshotRecord：定义该变量以承载业务值。 */
        let nextSnapshotRecord = null;
        try {
            nextSnapshotRecord = await this.worldPlayerSnapshotService.loadNextPlayerSnapshotRecord(identity.playerId);
        }
        catch (error) {
            this.logger.warn(`玩家身份 next_protocol legacy_backfill 快照加载失败：userId=${identity?.userId ?? '未知'} playerId=${identity?.playerId ?? '未知'} error=${error instanceof Error ? error.message : String(error)}`);
            return {
                identity: null,
                persistFailureStage: 'next_protocol_legacy_backfill_snapshot_load_failed',
            };
        }
/** snapshotPersistedSource：定义该变量以承载业务值。 */
        const snapshotPersistedSource = typeof nextSnapshotRecord?.persistedSource === 'string'
            ? nextSnapshotRecord.persistedSource.trim()
            : '';
/** hasCompatibleSeededSnapshot：定义该变量以承载业务值。 */
        const hasCompatibleSeededSnapshot = Boolean(nextSnapshotRecord?.snapshot)
            && (snapshotPersistedSource === 'native' || snapshotPersistedSource === 'legacy_seeded');
        if (!hasCompatibleSeededSnapshot) {
            return {
                identity: null,
                persistFailureStage: 'next_protocol_legacy_backfill_requires_native_snapshot',
            };
        }
/** promotedIdentity：定义该变量以承载业务值。 */
        const promotedIdentity = await this.promotePersistedIdentityToNative(identity, 'legacy_backfill');
/** promotedPersistedSource：定义该变量以承载业务值。 */
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
/** resolveMigrationIdentity：执行对应的业务逻辑。 */
    async resolveMigrationIdentity(payload) {
        if (typeof this.worldPlayerSourceService?.resolvePlayerIdentityForMigration === 'function') {
            return this.worldPlayerSourceService.resolvePlayerIdentityForMigration(payload, COMPAT_MIGRATION_SOURCE_OPTIONS);
        }
        if (typeof this.worldPlayerSourceService?.resolveCompatPlayerIdentityForMigration !== 'function') {
            throw new Error('compat migration identity source unavailable');
        }
        return this.worldPlayerSourceService.resolveCompatPlayerIdentityForMigration(payload, COMPAT_MIGRATION_SOURCE_OPTIONS);
    }
/** loadMigrationSnapshot：执行对应的业务逻辑。 */
    async loadMigrationSnapshot(playerId) {
        if (typeof this.worldPlayerSourceService?.loadPlayerSnapshotForMigration === 'function') {
            return this.worldPlayerSourceService.loadPlayerSnapshotForMigration(playerId, COMPAT_MIGRATION_SOURCE_OPTIONS);
        }
        if (typeof this.worldPlayerSourceService?.loadCompatPlayerSnapshotForMigration !== 'function') {
            throw new Error('compat migration snapshot source unavailable');
        }
        return this.worldPlayerSourceService.loadCompatPlayerSnapshotForMigration(playerId, COMPAT_MIGRATION_SOURCE_OPTIONS);
    }
/** shouldPreferCompatBackfill：执行对应的业务逻辑。 */
    async shouldPreferCompatBackfill(payload, tokenIdentity, identityPersistenceEnabled) {
/** hasCompatIdentitySource：定义该变量以承载业务值。 */
        const hasCompatIdentitySource = typeof this.worldPlayerSourceService?.resolvePlayerIdentityForMigration === 'function'
            || typeof this.worldPlayerSourceService?.resolveCompatPlayerIdentityForMigration === 'function';
/** hasCompatSnapshotSource：定义该变量以承载业务值。 */
        const hasCompatSnapshotSource = typeof this.worldPlayerSourceService?.loadPlayerSnapshotForMigration === 'function'
            || typeof this.worldPlayerSourceService?.loadCompatPlayerSnapshotForMigration === 'function';
        if (!identityPersistenceEnabled
            || !tokenIdentity
            || !hasLegacyDatabaseConfigured()
            || !hasCompatIdentitySource
            || !hasCompatSnapshotSource) {
            return false;
        }
/** compatSnapshot：定义该变量以承载业务值。 */
        const compatSnapshot = await this.loadMigrationSnapshot(tokenIdentity.playerId).catch((error) => {
            this.logger.warn(`token seed 前的玩家 compat 快照预检失败：playerId=${tokenIdentity.playerId} error=${error instanceof Error ? error.message : String(error)}`);
            return null;
        });
        if (!compatSnapshot) {
            return false;
        }
/** compatIdentity：定义该变量以承载业务值。 */
        const compatIdentity = await this.resolveMigrationIdentity(payload).catch((error) => {
            this.logger.warn(`token seed 前的玩家 compat 身份预检失败：userId=${payload.sub} playerId=${tokenIdentity.playerId} error=${error instanceof Error ? error.message : String(error)}`);
            return null;
        });
        return Boolean(compatIdentity);
    }
/** authenticateViaCompatMigration：执行对应的业务逻辑。 */
    async authenticateViaCompatMigration(payload, tokenIdentity, identityPersistenceEnabled, allowCompatBackfill, preferCompatBackfill = false) {
/** compatIdentity：定义该变量以承载业务值。 */
        let compatIdentity = null;
/** compatIdentityResolved：定义该变量以承载业务值。 */
        let compatIdentityResolved = false;
/** resolveCompatIdentityOnce：定义该变量以承载业务值。 */
        const resolveCompatIdentityOnce = async () => {
            if (!compatIdentityResolved) {
                compatIdentity = await this.resolveMigrationIdentity(payload);
                compatIdentityResolved = true;
            }
            return compatIdentity;
        };
/** shouldAttemptPersistedCompatBackfill：定义该变量以承载业务值。 */
        const shouldAttemptPersistedCompatBackfill = identityPersistenceEnabled
            && allowCompatBackfill
            && (!tokenIdentity || preferCompatBackfill);
        if (shouldAttemptPersistedCompatBackfill) {
            compatIdentity = await resolveCompatIdentityOnce();
            if (compatIdentity) {
/** persistFailureStage：定义该变量以承载业务值。 */
                let persistFailureStage = null;
/** persistedCompatIdentity：定义该变量以承载业务值。 */
                const persistedCompatIdentity = await this.playerIdentityPersistenceService.savePlayerIdentity({
                    ...compatIdentity,
                    persistedSource: 'legacy_backfill',
                    updatedAt: Date.now(),
                }).catch((error) => {
                    persistFailureStage = 'compat_backfill_save_failed';
                    this.logger.warn(`玩家身份 compat 回填保存失败：userId=${compatIdentity.userId} playerId=${compatIdentity.playerId} error=${error instanceof Error ? error.message : String(error)}`);
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
/** persistedCompatSource：定义该变量以承载业务值。 */
                const persistedCompatSource = normalizePersistedSource(persistedCompatIdentity);
                if (persistedCompatIdentity && persistedCompatSource !== 'legacy_backfill') {
                    this.logger.error(`玩家身份 compat 回填保存返回了异常 persistedSource：userId=${compatIdentity.userId} playerId=${compatIdentity.playerId} expected=legacy_backfill actual=${persistedCompatSource ?? '未知'}`);
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
/** ensuredCompatSnapshot：定义该变量以承载业务值。 */
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
/** authSource：定义该变量以承载业务值。 */
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
/** persistSucceeded：定义该变量以承载业务值。 */
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
/** authenticatePlayerToken：执行对应的业务逻辑。 */
    async authenticatePlayerToken(token, options = undefined) {
/** payload：定义该变量以承载业务值。 */
        const payload = this.worldPlayerTokenService.validatePlayerToken(token);
        if (!payload) {
            return null;
        }
/** protocol：定义该变量以承载业务值。 */
        const protocol = normalizeProtocol(options?.protocol);
/** nextProtocolStrict：定义该变量以承载业务值。 */
        const nextProtocolStrict = protocol === 'next';
/** compatBackfillProtocolAllowed：定义该变量以承载业务值。 */
        const compatBackfillProtocolAllowed = !nextProtocolStrict && isCompatMigrationBackfillRequested(options);
/** tokenIdentity：定义该变量以承载业务值。 */
        const tokenIdentity = this.worldPlayerTokenService.resolvePlayerIdentityFromPayload(payload);
/** identityPersistenceEnabled：定义该变量以承载业务值。 */
        const identityPersistenceEnabled = this.playerIdentityPersistenceService.isEnabled();
/** nextIdentity：定义该变量以承载业务值。 */
        let nextIdentity = null;
        try {
            nextIdentity = await this.loadNextPlayerIdentity(payload.sub);
        }
        catch (error) {
/** message：定义该变量以承载业务值。 */
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
/** normalizedNextIdentity：定义该变量以承载业务值。 */
            let normalizedNextIdentity = nextIdentity;
/** nextPersistedSource：定义该变量以承载业务值。 */
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
/** nextProtocolNormalizedResult：定义该变量以承载业务值。 */
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
/** nextIdentityAuthSource：定义该变量以承载业务值。 */
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
/** allowCompatBackfill：定义该变量以承载业务值。 */
        const allowCompatBackfill = compatBackfillProtocolAllowed && isCompatIdentityBackfillAllowed();
/** allowCompatMigrationInPersistence：定义该变量以承载业务值。 */
        const allowCompatMigrationInPersistence = identityPersistenceEnabled && !nextProtocolStrict && allowCompatBackfill;
/** legacyDatabaseConfigured：定义该变量以承载业务值。 */
        const legacyDatabaseConfigured = hasLegacyDatabaseConfigured();
/** allowTokenRuntimeIdentity：定义该变量以承载业务值。 */
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
/** preferCompatBackfill：定义该变量以承载业务值。 */
        const preferCompatBackfill = allowCompatMigrationInPersistence
            ? await this.shouldPreferCompatBackfill(payload, tokenIdentity, identityPersistenceEnabled)
            : false;
        if (identityPersistenceEnabled && tokenIdentity && !preferCompatBackfill) {
/** persistFailureStage：定义该变量以承载业务值。 */
            let persistFailureStage = null;
/** persistedTokenIdentity：定义该变量以承载业务值。 */
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
/** persistedTokenSource：定义该变量以承载业务值。 */
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
/** nativeStarterSnapshot：定义该变量以承载业务值。 */
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
