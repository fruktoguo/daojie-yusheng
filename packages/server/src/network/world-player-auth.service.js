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

const world_player_source_service_1 = require("./world-player-source.service");

const world_player_token_service_1 = require("./world-player-token.service");

const LEGACY_DATABASE_ENV_KEYS = [
    'SERVER_NEXT_DATABASE_URL',
    'DATABASE_URL',
];
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

/** 世界玩家鉴权服务：把 token 校验、next 身份加载与 token_seed 持久化收敛到一起。 */
let WorldPlayerAuthService = class WorldPlayerAuthService {
    /** 鉴权日志，便于追踪 token、回填和持久化失败。 */
    logger = new common_1.Logger(WorldPlayerAuthService.name);
    /** 生成和校验 next 玩家令牌。 */
    worldPlayerTokenService;
    /** 玩家身份持久化入口。 */
    playerIdentityPersistenceService;
    /** 玩家源服务，负责读取 next 真源。 */
    worldPlayerSourceService;
    constructor(worldPlayerTokenService, playerIdentityPersistenceService, worldPlayerSourceService) {
        this.worldPlayerTokenService = worldPlayerTokenService;
        this.playerIdentityPersistenceService = playerIdentityPersistenceService;
        this.worldPlayerSourceService = worldPlayerSourceService;
    }
    /** 加载 next 玩家身份，优先走 next 持久化来源。 */
    async loadNextPlayerIdentity(userId) {
        if (typeof this.worldPlayerSourceService?.loadNextPlayerIdentity === 'function') {
            return this.worldPlayerSourceService.loadNextPlayerIdentity(userId);
        }
        return this.playerIdentityPersistenceService.loadPlayerIdentity(userId);
    }
    /** next 协议不再接受 legacy backfill/sync 身份的运行时提升。 */
    async normalizeLoadedNextIdentityForNextProtocol(identity) {

        const persistedSource = normalizePersistedSource(identity);
        if (persistedSource !== 'legacy_backfill' && persistedSource !== 'legacy_sync') {
            return {
                identity,
                persistFailureStage: null,
            };
        }

        return {
            identity: null,
            persistFailureStage: persistedSource === 'legacy_sync'
                ? 'next_protocol_legacy_sync_forbidden'
                : 'next_protocol_legacy_backfill_forbidden',
        };
    }
    async authenticatePlayerToken(token, options = undefined) {

        const payload = this.worldPlayerTokenService.validatePlayerToken(token);
        if (!payload) {
            return null;
        }

        const protocol = normalizeProtocol(options?.protocol);

        const nextProtocolStrict = protocol === 'next';

        const explicitMigrationProtocol = isExplicitMigrationProtocol(protocol);

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

        const legacyDatabaseConfigured = hasLegacyDatabaseConfigured();

        const allowTokenRuntimeIdentity = !identityPersistenceEnabled
            && !nextProtocolStrict
            && !explicitMigrationProtocol
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

        if (explicitMigrationProtocol) {
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
                persistFailureStage: null,
            });
            return null;
        }
        if (identityPersistenceEnabled && tokenIdentity) {

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

            if (persistedTokenIdentity) {
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
        world_player_source_service_1.WorldPlayerSourceService])
], WorldPlayerAuthService);
//# sourceMappingURL=world-player-auth.service.js.map
