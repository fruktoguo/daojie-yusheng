"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** __metadata：定义该变量以承载业务值。 */
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
        return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyNextIdentitySyncService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** player_identity_persistence_service_1：定义该变量以承载业务值。 */
const player_identity_persistence_service_1 = require("../../../persistence/player-identity-persistence.service");
/** player_persistence_service_1：定义该变量以承载业务值。 */
const player_persistence_service_1 = require("../../../persistence/player-persistence.service");
/** world_player_token_codec_service_1：定义该变量以承载业务值。 */
const world_player_token_codec_service_1 = require("../../../network/world-player-token-codec.service");
/** player_runtime_service_1：定义该变量以承载业务值。 */
const player_runtime_service_1 = require("../../../runtime/player/player-runtime.service");
/** legacy_auth_service_1：定义该变量以承载业务值。 */
const legacy_auth_service_1 = require("../legacy-auth.service");
/** LegacyNextIdentitySyncService：定义该变量以承载业务值。 */
let LegacyNextIdentitySyncService = class LegacyNextIdentitySyncService {
    legacyAuthService;
    playerIdentityPersistenceService;
    playerPersistenceService;
    worldPlayerTokenCodecService;
    playerRuntimeService;
    logger = new common_1.Logger(LegacyNextIdentitySyncService.name);
/** 构造函数：执行实例初始化流程。 */
    constructor(legacyAuthService, playerIdentityPersistenceService, playerPersistenceService, worldPlayerTokenCodecService, playerRuntimeService) {
        this.legacyAuthService = legacyAuthService;
        this.playerIdentityPersistenceService = playerIdentityPersistenceService;
        this.playerPersistenceService = playerPersistenceService;
        this.worldPlayerTokenCodecService = worldPlayerTokenCodecService;
        this.playerRuntimeService = playerRuntimeService;
    }
/** syncFromAuthResult：执行对应的业务逻辑。 */
    async syncFromAuthResult(result, options = {}) {
/** accessToken：定义该变量以承载业务值。 */
        const accessToken = typeof result?.accessToken === 'string' ? result.accessToken.trim() : '';
        if (!accessToken) {
            return null;
        }
/** payload：定义该变量以承载业务值。 */
        const payload = this.worldPlayerTokenCodecService.validateAccessToken(accessToken);
        if (!payload || payload.role === 'gm' || typeof payload.sub !== 'string') {
            return null;
        }
/** synced：定义该变量以承载业务值。 */
        const synced = await this.syncIdentityByUserId(payload.sub, options);
        if (synced) {
            return synced;
        }
/** fallbackIdentity：定义该变量以承载业务值。 */
        const fallbackIdentity = this.buildIdentityFromTokenPayload(payload, options);
        if (!fallbackIdentity) {
            return null;
        }
        return this.playerIdentityPersistenceService.savePlayerIdentity({
            ...fallbackIdentity,
            persistedSource: 'legacy_sync',
            updatedAt: Date.now(),
        });
    }
/** syncSnapshotForIdentity：执行对应的业务逻辑。 */
    async syncSnapshotForIdentity(identity) {
/** playerId：定义该变量以承载业务值。 */
        const playerId = typeof identity?.playerId === 'string' ? identity.playerId.trim() : '';
        if (!playerId || !this.playerPersistenceService.isEnabled()) {
            return null;
        }
/** existingSnapshotRecord：定义该变量以承载业务值。 */
        const existingSnapshotRecord = await this.playerPersistenceService.loadPlayerSnapshotRecord(playerId).catch(() => null);
        if (existingSnapshotRecord?.snapshot) {
            return existingSnapshotRecord.snapshot;
        }
/** pool：定义该变量以承载业务值。 */
        const pool = await this.legacyAuthService.ensurePool();
        if (!pool) {
            return this.seedNativeStarterSnapshotForIdentity(playerId);
        }
/** row：定义该变量以承载业务值。 */
        let row;
        try {
/** repository：定义该变量以承载业务值。 */
            const repository = require("../../../network/world-legacy-player-repository");
            row = await repository.queryLegacyPlayerSnapshotRow(pool, playerId);
        }
        catch (error) {
            if (isMissingLegacySchemaError(error)) {
                return this.seedNativeStarterSnapshotForIdentity(playerId);
            }
            throw error;
        }
        if (!row) {
            return this.seedNativeStarterSnapshotForIdentity(playerId);
        }
        const { toPlayerSnapshotFromCompatRow } = require("../../../network/world-player-source.service");
/** snapshot：定义该变量以承载业务值。 */
        const snapshot = toPlayerSnapshotFromCompatRow(row);
        await this.playerPersistenceService.savePlayerSnapshot(playerId, snapshot, {
            persistedSource: 'legacy_seeded',
            seededAt: Date.now(),
        });
        return snapshot;
    }
/** seedNativeStarterSnapshotForIdentity：执行对应的业务逻辑。 */
    async seedNativeStarterSnapshotForIdentity(playerId) {
/** normalizedPlayerId：定义该变量以承载业务值。 */
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId || !this.playerPersistenceService.isEnabled()) {
            return null;
        }
/** starterSnapshot：定义该变量以承载业务值。 */
        const starterSnapshot = this.playerRuntimeService.buildStarterPersistenceSnapshot(normalizedPlayerId);
        if (!starterSnapshot) {
            this.logger.warn(`Next player starter snapshot sync skipped: starter builder unavailable for playerId=${normalizedPlayerId}`);
            return null;
        }
        await this.playerPersistenceService.savePlayerSnapshot(normalizedPlayerId, starterSnapshot, {
            persistedSource: 'native',
            seededAt: Date.now(),
        });
        return starterSnapshot;
    }
/** syncIdentityByUserId：执行对应的业务逻辑。 */
    async syncIdentityByUserId(userId, options = {}) {
/** normalizedUserId：定义该变量以承载业务值。 */
        const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
        if (!normalizedUserId) {
            return null;
        }
/** user：定义该变量以承载业务值。 */
        const user = await this.loadUserById(normalizedUserId);
        if (!user) {
            return null;
        }
/** existingNextIdentity：定义该变量以承载业务值。 */
        const existingNextIdentity = await this.playerIdentityPersistenceService.loadPlayerIdentity(normalizedUserId);
/** identity：定义该变量以承载业务值。 */
        const identity = await this.buildNextPlayerIdentity(user, {
            ...options,
/** playerIdHint：定义该变量以承载业务值。 */
            playerIdHint: typeof options.playerIdHint === 'string' && options.playerIdHint.trim()
                ? options.playerIdHint.trim()
                : existingNextIdentity?.playerId,
/** allowFallbackIdentity：定义该变量以承载业务值。 */
            allowFallbackIdentity: existingNextIdentity !== null,
        });
        if (!identity) {
            return null;
        }
        return this.playerIdentityPersistenceService.savePlayerIdentity({
            ...identity,
            persistedSource: 'legacy_sync',
            updatedAt: Date.now(),
        });
    }
/** syncIdentityByPlayerId：执行对应的业务逻辑。 */
    async syncIdentityByPlayerId(playerId, options = {}) {
/** normalizedPlayerId：定义该变量以承载业务值。 */
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            return null;
        }
/** pool：定义该变量以承载业务值。 */
        const pool = await this.legacyAuthService.ensurePool();
        if (!pool) {
            return null;
        }
/** user：定义该变量以承载业务值。 */
        const user = await this.loadManagedUserByPlayerId(normalizedPlayerId, pool);
        if (!user) {
            return null;
        }
        return this.syncIdentityByUserId(user.id, {
            ...options,
            playerIdHint: normalizedPlayerId,
        });
    }
/** patchPersistedIdentity：执行对应的业务逻辑。 */
    async patchPersistedIdentity(userId, patch) {
/** normalizedUserId：定义该变量以承载业务值。 */
        const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
        if (!normalizedUserId) {
            return null;
        }
/** existingIdentity：定义该变量以承载业务值。 */
        const existingIdentity = await this.playerIdentityPersistenceService.loadPlayerIdentity(normalizedUserId);
        if (!existingIdentity) {
            return null;
        }
        return this.playerIdentityPersistenceService.savePlayerIdentity({
            ...existingIdentity,
            ...(typeof patch?.displayName === 'string' && patch.displayName.trim()
                ? { displayName: patch.displayName.trim() }
                : {}),
            ...(typeof patch?.playerName === 'string' && patch.playerName.trim()
                ? { playerName: patch.playerName.trim() }
                : {}),
            updatedAt: Date.now(),
        });
    }
/** loadUserById：执行对应的业务逻辑。 */
    async loadUserById(userId) {
/** pool：定义该变量以承载业务值。 */
        const pool = await this.legacyAuthService.ensurePool();
        if (!pool) {
            return null;
        }
        try {
/** result：定义该变量以承载业务值。 */
            const result = await pool.query(`
        SELECT id, username, "displayName", "pendingRoleName"
        FROM users
        WHERE id::text = $1
        LIMIT 1
      `, [userId]);
            return normalizeUserRow(result.rows[0]);
        }
        catch (error) {
            if (isMissingLegacySchemaError(error)) {
                return null;
            }
            throw error;
        }
    }
/** loadManagedUserByPlayerId：执行对应的业务逻辑。 */
    async loadManagedUserByPlayerId(playerId, pool) {
        try {
/** result：定义该变量以承载业务值。 */
            const result = await pool.query(`
        SELECT
          u.id,
          u.username,
          u."displayName",
          u."pendingRoleName"
        FROM players p
        JOIN users u ON u.id = p."userId"
        WHERE p.id = $1
        LIMIT 1
      `, [playerId]);
            return normalizeUserRow(result.rows[0]);
        }
        catch (error) {
            if (isMissingLegacySchemaError(error)) {
                return null;
            }
            throw error;
        }
    }
/** buildNextPlayerIdentity：执行对应的业务逻辑。 */
    async buildNextPlayerIdentity(user, options = {}) {
/** username：定义该变量以承载业务值。 */
        const username = typeof user?.username === 'string' ? user.username.trim() : '';
        if (!username) {
            return null;
        }
/** displayName：定义该变量以承载业务值。 */
        const displayName = typeof user?.displayName === 'string' && user.displayName.trim()
            ? user.displayName.trim()
            : username;
/** fallbackPlayerId：定义该变量以承载业务值。 */
        const fallbackPlayerId = typeof options.playerIdHint === 'string' && options.playerIdHint.trim()
            ? options.playerIdHint.trim()
            : buildFallbackPlayerId(user.id);
/** fallbackPlayerName：定义该变量以承载业务值。 */
        const fallbackPlayerName = resolveIdentityPlayerName(options.roleNameHint ?? user.pendingRoleName, username);
/** pool：定义该变量以承载业务值。 */
        const pool = await this.legacyAuthService.ensurePool();
        if (pool) {
            try {
/** playerRecord：定义该变量以承载业务值。 */
                const playerRecord = await this.loadDatabasePlayerRecord(user.id, pool);
                if (playerRecord) {
                    return {
                        userId: user.id,
                        username,
                        displayName,
                        playerId: playerRecord.playerId,
                        playerName: resolveIdentityPlayerName(playerRecord.roleName, username),
                    };
                }
                if (options.allowFallbackIdentity !== true) {
                    return null;
                }
            }
            catch (error) {
                if (!isMissingLegacySchemaError(error)) {
                    throw error;
                }
            }
        }
        return {
            userId: user.id,
            username,
            displayName,
            playerId: fallbackPlayerId,
            playerName: fallbackPlayerName,
        };
    }
/** buildIdentityFromTokenPayload：执行对应的业务逻辑。 */
    buildIdentityFromTokenPayload(payload, options = {}) {
/** userId：定义该变量以承载业务值。 */
        const userId = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
/** username：定义该变量以承载业务值。 */
        const username = typeof payload?.username === 'string' ? payload.username.trim() : '';
/** playerId：定义该变量以承载业务值。 */
        const playerId = typeof payload?.playerId === 'string' ? payload.playerId.trim() : '';
        if (!userId || !username || !playerId) {
            return null;
        }
/** displayName：定义该变量以承载业务值。 */
        const displayName = typeof payload?.displayName === 'string' && payload.displayName.trim()
            ? payload.displayName.trim()
            : username;
/** playerName：定义该变量以承载业务值。 */
        const playerName = resolveIdentityPlayerName(typeof payload?.playerName === 'string' && payload.playerName.trim()
            ? payload.playerName.trim()
            : options.roleNameHint, username);
        return {
            userId,
            username,
            displayName,
            playerId,
            playerName,
        };
    }
/** loadDatabasePlayerRecord：执行对应的业务逻辑。 */
    async loadDatabasePlayerRecord(userId, pool) {
/** result：定义该变量以承载业务值。 */
        const result = await pool.query(`
        SELECT id, name
        FROM players
        WHERE "userId" = $1
        LIMIT 1
      `, [userId]);
/** row：定义该变量以承载业务值。 */
        const row = result.rows[0];
/** playerId：定义该变量以承载业务值。 */
        const playerId = typeof row?.id === 'string' ? row.id.trim() : '';
        if (!playerId) {
            return null;
        }
        return {
            playerId,
/** roleName：定义该变量以承载业务值。 */
            roleName: typeof row?.name === 'string' ? row.name : '',
        };
    }
};
exports.LegacyNextIdentitySyncService = LegacyNextIdentitySyncService;
exports.LegacyNextIdentitySyncService = LegacyNextIdentitySyncService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [legacy_auth_service_1.LegacyAuthService,
        player_identity_persistence_service_1.PlayerIdentityPersistenceService,
        player_persistence_service_1.PlayerPersistenceService,
        world_player_token_codec_service_1.WorldPlayerTokenCodecService,
        player_runtime_service_1.PlayerRuntimeService])
], LegacyNextIdentitySyncService);
/** normalizeUserRow：执行对应的业务逻辑。 */
function normalizeUserRow(row) {
    if (!row || typeof row !== 'object') {
        return null;
    }
/** id：定义该变量以承载业务值。 */
    const id = typeof row.id === 'string' ? row.id.trim() : '';
/** username：定义该变量以承载业务值。 */
    const username = typeof row.username === 'string' ? row.username.trim() : '';
    if (!id || !username) {
        return null;
    }
    return {
        id,
        username,
/** displayName：定义该变量以承载业务值。 */
        displayName: typeof row.displayName === 'string' && row.displayName.trim() ? row.displayName : null,
/** pendingRoleName：定义该变量以承载业务值。 */
        pendingRoleName: typeof row.pendingRoleName === 'string' && row.pendingRoleName.trim() ? row.pendingRoleName : null,
    };
}
/** buildFallbackPlayerId：执行对应的业务逻辑。 */
function buildFallbackPlayerId(userId) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = typeof userId === 'string' ? userId.trim() : '';
    return normalized ? `p_${normalized}` : 'p_guest';
}
/** resolveIdentityPlayerName：执行对应的业务逻辑。 */
function resolveIdentityPlayerName(playerName, username) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = typeof playerName === 'string' ? playerName.trim().normalize('NFC') : '';
    if (normalized) {
        return normalized;
    }
    return typeof username === 'string' ? username.normalize('NFC') : '';
}
/** isMissingLegacySchemaError：执行对应的业务逻辑。 */
function isMissingLegacySchemaError(error) {
    return Boolean(error && typeof error === 'object' && error.code === '42P01');
}
