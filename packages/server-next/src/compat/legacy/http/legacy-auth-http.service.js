"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
        return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyAuthHttpService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared-next");
const node_crypto_1 = require("node:crypto");
const player_identity_persistence_service_1 = require("../../../persistence/player-identity-persistence.service");
const player_persistence_service_1 = require("../../../persistence/player-persistence.service");
const legacy_account_validation_1 = require("../legacy-account-validation");
const legacy_password_hash_1 = require("../legacy-password-hash");
const legacy_auth_service_1 = require("../legacy-auth.service");
const world_player_token_codec_service_1 = require("../../../network/world-player-token-codec.service");
const world_legacy_player_repository_1 = require("../../../network/world-legacy-player-repository");
let LegacyAuthHttpService = class LegacyAuthHttpService {
    logger = new common_1.Logger(LegacyAuthHttpService.name);
    legacyAuthService;
    playerIdentityPersistenceService;
    playerPersistenceService;
    worldPlayerTokenCodecService;
    memoryUsersById = new Map();
    memoryUserIdByUsername = new Map();
    constructor(legacyAuthService, playerIdentityPersistenceService, playerPersistenceService, worldPlayerTokenCodecService) {
        this.legacyAuthService = legacyAuthService;
        this.playerIdentityPersistenceService = playerIdentityPersistenceService;
        this.playerPersistenceService = playerPersistenceService;
        this.worldPlayerTokenCodecService = worldPlayerTokenCodecService;
    }
    async register(accountName, password, displayName, roleName) {
        const result = await this.runWithPrimaryAuth(() => this.legacyAuthService.register(accountName, password, displayName, roleName), async () => {
            const normalizedUsername = (0, legacy_account_validation_1.normalizeUsername)(accountName);
            const normalizedDisplayName = (0, legacy_account_validation_1.normalizeDisplayName)(displayName);
            const normalizedRoleName = (0, legacy_account_validation_1.normalizeRoleName)(roleName);
            const usernameError = (0, legacy_account_validation_1.validateUsername)(normalizedUsername);
            if (usernameError) {
                throw new common_1.BadRequestException(usernameError);
            }
            const passwordError = (0, legacy_account_validation_1.validatePassword)(password);
            if (passwordError) {
                throw new common_1.BadRequestException(passwordError);
            }
            const displayNameError = (0, legacy_account_validation_1.validateDisplayName)(normalizedDisplayName);
            if (displayNameError) {
                throw new common_1.BadRequestException(displayNameError);
            }
            const roleNameError = (0, legacy_account_validation_1.validateRoleName)(normalizedRoleName);
            if (roleNameError) {
                throw new common_1.BadRequestException(roleNameError);
            }
            const usernameConflict = await this.ensureAvailable(normalizedUsername, 'account');
            if (usernameConflict) {
                throw new common_1.BadRequestException(usernameConflict);
            }
            const roleNameConflict = await this.ensureAvailable(normalizedRoleName, 'role');
            if (roleNameConflict) {
                throw new common_1.BadRequestException(roleNameConflict);
            }
            const displayNameConflict = await this.ensureAvailable(normalizedDisplayName, 'display');
            if (displayNameConflict) {
                throw new common_1.BadRequestException(displayNameConflict);
            }
            const passwordHash = await (0, legacy_password_hash_1.hashPassword)(password);
            const created = {
                id: (0, node_crypto_1.randomUUID)(),
                username: normalizedUsername,
                displayName: normalizedDisplayName,
                pendingRoleName: normalizedRoleName,
                passwordHash,
                totalOnlineSeconds: 0,
                currentOnlineStartedAt: null,
                createdAt: new Date().toISOString(),
            };
            this.saveMemoryUser(created);
            return this.issueTokens(created);
        });
        const syncedIdentity = await this.syncNextPlayerIdentityFromAuthResult(result, { roleNameHint: roleName }).catch(() => null);
        await this.syncNextPlayerSnapshotForIdentity(syncedIdentity).catch((error) => {
            this.logger.warn(`Next player snapshot sync after register failed: ${error instanceof Error ? error.message : String(error)}`);
        });
        return result;
    }
    async login(loginName, password) {
        const result = await this.runWithPrimaryAuth(() => this.legacyAuthService.login(loginName, password), async () => {
            const normalizedLoginName = (0, legacy_account_validation_1.normalizeUsername)(loginName).trim();
            const directUser = await this.findUserByUsername(normalizedLoginName);
            const roleMatchedUsers = await this.findUsersByRoleName(normalizedLoginName);
            const candidates = new Map();
            if (directUser) {
                candidates.set(directUser.id, directUser);
            }
            for (const user of roleMatchedUsers) {
                candidates.set(user.id, user);
            }
            if (candidates.size === 0) {
                throw new common_1.UnauthorizedException('用户不存在');
            }
            const matchedUsers = [];
            for (const user of candidates.values()) {
                if (await (0, legacy_password_hash_1.verifyPassword)(password, user.passwordHash)) {
                    matchedUsers.push(user);
                }
            }
            if (matchedUsers.length === 0) {
                throw new common_1.UnauthorizedException('密码错误');
            }
            if (directUser && matchedUsers.some((user) => user.id === directUser.id)) {
                return this.issueTokens(directUser);
            }
            if (matchedUsers.length === 1) {
                return this.issueTokens(matchedUsers[0]);
            }
            throw new common_1.BadRequestException('该角色名对应多个账号，请改用账号登录');
        });
        const syncedIdentity = await this.syncNextPlayerIdentityFromAuthResult(result).catch(() => null);
        await this.syncNextPlayerSnapshotForIdentity(syncedIdentity).catch((error) => {
            this.logger.warn(`Next player snapshot sync after login failed: ${error instanceof Error ? error.message : String(error)}`);
        });
        return result;
    }
    async refresh(refreshToken) {
        const result = await this.runWithPrimaryAuth(() => this.legacyAuthService.refresh(refreshToken), async () => {
            const payload = this.worldPlayerTokenCodecService.validateRefreshToken(typeof refreshToken === 'string' ? refreshToken.trim() : '');
            if (!payload || payload.role === 'gm' || typeof payload.sub !== 'string' || typeof payload.username !== 'string') {
                throw new common_1.UnauthorizedException('刷新令牌无效或已过期');
            }
            const user = await this.findUserById(payload.sub);
            if (!user) {
                throw new common_1.UnauthorizedException('用户不存在');
            }
            return this.issueTokens(user);
        });
        const syncedIdentity = await this.syncNextPlayerIdentityFromAuthResult(result).catch(() => null);
        await this.syncNextPlayerSnapshotForIdentity(syncedIdentity).catch((error) => {
            this.logger.warn(`Next player snapshot sync after refresh failed: ${error instanceof Error ? error.message : String(error)}`);
        });
        return result;
    }
    async checkDisplayNameAvailability(displayName) {
        return this.runWithPrimaryAuth(() => this.legacyAuthService.checkDisplayNameAvailability(displayName), async () => {
            const normalizedDisplayName = (0, legacy_account_validation_1.normalizeDisplayName)(displayName);
            const error = (0, legacy_account_validation_1.validateDisplayName)(normalizedDisplayName);
            if (error) {
                return { available: false, message: error };
            }
            const conflict = await this.ensureAvailable(normalizedDisplayName, 'display');
            if (conflict) {
                return { available: false, message: conflict };
            }
            return { available: true };
        });
    }
    async getManagedAccountIndex(playerIds) {
        return this.runWithPrimaryAuth(() => this.legacyAuthService.getManagedAccountIndex(playerIds), async () => {
            const normalizedPlayerIds = Array.from(new Set(Array.from(playerIds)
                .filter((playerId) => typeof playerId === 'string')
                .map((playerId) => playerId.trim())
                .filter((playerId) => playerId.length > 0)));
            const result = new Map();
            if (normalizedPlayerIds.length === 0) {
                return result;
            }
            for (const playerId of normalizedPlayerIds) {
                const user = this.resolveMemoryUserByPlayerId(playerId);
                if (!user) {
                    continue;
                }
                result.set(playerId, {
                    playerId,
                    playerName: null,
                    userId: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    createdAt: user.createdAt,
                    totalOnlineSeconds: user.totalOnlineSeconds,
                    currentOnlineStartedAt: user.currentOnlineStartedAt,
                });
            }
            return result;
        });
    }
    async updateManagedPlayerPassword(playerId, newPassword) {
        return this.runWithPrimaryAuth(() => this.legacyAuthService.updateManagedPlayerPassword(playerId, newPassword), async () => {
            const passwordError = (0, legacy_account_validation_1.validatePassword)(newPassword);
            if (passwordError) {
                throw new common_1.BadRequestException(passwordError);
            }
            const user = await this.resolveManagedUserByPlayerId(playerId);
            if (!user) {
                throw new common_1.BadRequestException('目标玩家没有可管理的账号');
            }
            const passwordHash = await (0, legacy_password_hash_1.hashPassword)(newPassword);
            this.saveMemoryUser({
                ...user,
                passwordHash,
            });
        });
    }
    async updateManagedPlayerAccount(playerId, username) {
        const result = await this.runWithPrimaryAuth(() => this.legacyAuthService.updateManagedPlayerAccount(playerId, username), async () => {
            const user = await this.resolveManagedUserByPlayerId(playerId);
            if (!user) {
                throw new common_1.BadRequestException('目标玩家没有可管理的账号');
            }
            const normalizedUsername = (0, legacy_account_validation_1.normalizeUsername)(username);
            const usernameError = (0, legacy_account_validation_1.validateUsername)(normalizedUsername);
            if (usernameError) {
                throw new common_1.BadRequestException(usernameError);
            }
            if (normalizedUsername === user.username) {
                return { username: normalizedUsername, displayNameChanged: false, nextDisplayName: (0, legacy_account_validation_1.resolveDisplayName)(user.displayName, user.username) };
            }
            const usernameConflict = await this.ensureAvailable(normalizedUsername, 'account', {
                exclude: [{ kind: 'account', userId: user.id }],
            });
            if (usernameConflict) {
                throw new common_1.BadRequestException(usernameConflict);
            }
            const previousDisplayName = (0, legacy_account_validation_1.resolveDisplayName)(user.displayName, user.username);
            const nextDisplayName = (0, legacy_account_validation_1.resolveDisplayName)(user.displayName, normalizedUsername);
            if (nextDisplayName !== previousDisplayName) {
                const displayNameConflict = await this.ensureAvailable(nextDisplayName, 'display', {
                    exclude: [{ kind: 'display', userId: user.id }],
                });
                if (displayNameConflict) {
                    throw new common_1.BadRequestException(displayNameConflict);
                }
            }
            this.saveMemoryUser({
                ...user,
                username: normalizedUsername,
            });
            return {
                username: normalizedUsername,
                displayNameChanged: nextDisplayName !== previousDisplayName,
                nextDisplayName,
            };
        });
        await this.syncNextPlayerIdentityByPlayerId(playerId).catch(() => undefined);
        return result;
    }
    async runWithPrimaryAuth(primaryTask, fallbackTask) {
        if (await this.legacyAuthService.ensurePool()) {
            try {
                return await primaryTask();
            }
            catch (error) {
                if (!isMissingLegacySchemaError(error)) {
                    throw error;
                }
            }
        }
        return fallbackTask();
    }
    issueTokens(user) {
        const displayName = (0, legacy_account_validation_1.resolveDisplayName)(user.displayName, user.username);
        const playerName = typeof user.pendingRoleName === 'string' && user.pendingRoleName.trim()
            ? user.pendingRoleName.trim()
            : user.username;
        const payload = {
            sub: user.id,
            username: user.username,
            displayName,
            playerId: `p_${user.id}`,
            playerName,
        };
        return {
            accessToken: this.worldPlayerTokenCodecService.issueAccessToken(payload),
            refreshToken: this.worldPlayerTokenCodecService.issueRefreshToken(payload),
        };
    }
    async syncNextPlayerIdentityFromAuthResult(result, options = {}) {
        const accessToken = typeof result?.accessToken === 'string' ? result.accessToken.trim() : '';
        if (!accessToken) {
            return null;
        }
        const payload = this.worldPlayerTokenCodecService.validateAccessToken(accessToken);
        if (!payload || payload.role === 'gm' || typeof payload.sub !== 'string') {
            return null;
        }
        const synced = await this.syncNextPlayerIdentityByUserId(payload.sub, options);
        if (synced) {
            return synced;
        }
        const fallbackIdentity = this.buildNextPlayerIdentityFromTokenPayload(payload, options);
        if (!fallbackIdentity) {
            return null;
        }
        return this.playerIdentityPersistenceService.savePlayerIdentity({
            ...fallbackIdentity,
            persistedSource: 'legacy_sync',
            updatedAt: Date.now(),
        });
    }
    async syncNextPlayerSnapshotForIdentity(identity) {
        const playerId = typeof identity?.playerId === 'string' ? identity.playerId.trim() : '';
        if (!playerId || !this.playerPersistenceService.isEnabled()) {
            return null;
        }
        const pool = await this.legacyAuthService.ensurePool();
        if (!pool) {
            return null;
        }
        let row;
        try {
            row = await (0, world_legacy_player_repository_1.queryLegacyPlayerSnapshotRow)(pool, playerId);
        }
        catch (error) {
            if (isMissingLegacySchemaError(error)) {
                return null;
            }
            throw error;
        }
        if (!row) {
            return null;
        }
        const { toPlayerSnapshotFromCompatRow } = require("../../../network/world-legacy-player-source.service");
        const snapshot = toPlayerSnapshotFromCompatRow(row);
        await this.playerPersistenceService.savePlayerSnapshot(playerId, snapshot, {
            persistedSource: 'legacy_seeded',
            seededAt: Date.now(),
        });
        return snapshot;
    }
    async syncNextPlayerIdentityByUserId(userId, options = {}) {
        const user = await this.findUserById(userId);
        if (!user) {
            return null;
        }
        const existingNextIdentity = await this.playerIdentityPersistenceService.loadPlayerIdentity(userId);
        const identity = await this.buildNextPlayerIdentity(user, {
            ...options,
            playerIdHint: typeof options.playerIdHint === 'string' && options.playerIdHint.trim()
                ? options.playerIdHint.trim()
                : existingNextIdentity?.playerId,
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
    async syncNextPlayerIdentityByPlayerId(playerId) {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            return null;
        }
        const user = await this.resolveManagedUserByPlayerId(normalizedPlayerId);
        if (!user) {
            return null;
        }
        return this.syncNextPlayerIdentityByUserId(user.id, {
            playerIdHint: normalizedPlayerId,
        });
    }
    async buildNextPlayerIdentity(user, options = {}) {
        const username = (0, legacy_account_validation_1.normalizeUsername)(user.username);
        if (!username) {
            return null;
        }
        const displayName = (0, legacy_account_validation_1.resolveDisplayName)(user.displayName, username);
        const fallbackPlayerId = typeof options.playerIdHint === 'string' && options.playerIdHint.trim()
            ? options.playerIdHint.trim()
            : buildFallbackPlayerId(user.id);
        const fallbackPlayerName = resolveIdentityPlayerName(options.roleNameHint ?? user.pendingRoleName, username);
        const pool = await this.legacyAuthService.ensurePool();
        if (pool) {
            try {
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
    buildNextPlayerIdentityFromTokenPayload(payload, options = {}) {
        const userId = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
        const username = typeof payload?.username === 'string'
            ? (0, legacy_account_validation_1.normalizeUsername)(payload.username)
            : '';
        const playerId = typeof payload?.playerId === 'string' ? payload.playerId.trim() : '';
        if (!userId || !username || !playerId) {
            return null;
        }
        const displayName = typeof payload?.displayName === 'string' && payload.displayName.trim()
            ? payload.displayName.trim()
            : (0, legacy_account_validation_1.resolveDisplayName)('', username);
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
    async loadDatabasePlayerRecord(userId, pool) {
        const result = await pool.query(`
        SELECT id, name
        FROM players
        WHERE "userId" = $1
        LIMIT 1
      `, [userId]);
        const row = result.rows[0];
        const playerId = typeof row?.id === 'string' ? row.id.trim() : '';
        if (!playerId) {
            return null;
        }
        return {
            playerId,
            roleName: typeof row?.name === 'string' ? row.name : '',
        };
    }
    async ensureAvailable(value, requestedKind, options = {}) {
        if (requestedKind === 'display' && (0, shared_1.isDuplicateFriendlyDisplayName)(value)) {
            return null;
        }
        const conflict = await this.findConflict(value, requestedKind, options);
        if (!conflict) {
            return null;
        }
        return buildConflictMessage(requestedKind, conflict.kind);
    }
    async findConflict(value, requestedKind, options = {}) {
        if (!value) {
            return null;
        }
        const conflicts = [];
        const pool = await this.legacyAuthService.ensurePool();
        let shouldUseMemoryFallback = !pool;
        if (pool) {
            try {
                if (requestedKind === 'account') {
                    const users = await pool.query('SELECT id, username FROM users WHERE username = $1', [value]);
                    for (const row of users.rows) {
                        const user = normalizeUserRow(row);
                        if (!user) {
                            continue;
                        }
                        if ((0, legacy_account_validation_1.normalizeUsername)(user.username) === value) {
                            conflicts.push({ kind: 'account', userId: user.id });
                        }
                    }
                }
                else if (requestedKind === 'role') {
                    const [users, players] = await Promise.all([
                        pool.query('SELECT id, "pendingRoleName" FROM users WHERE "pendingRoleName" = $1', [value]),
                        pool.query('SELECT "userId", name FROM players WHERE name = $1', [value]),
                    ]);
                    for (const row of users.rows) {
                        const user = normalizeUserRow(row);
                        if (!user) {
                            continue;
                        }
                        if ((0, legacy_account_validation_1.normalizeRoleName)(user.pendingRoleName) === value) {
                            conflicts.push({ kind: 'role', userId: user.id });
                        }
                    }
                    for (const row of players.rows) {
                        const userId = typeof row?.userId === 'string' ? row.userId : '';
                        if (!userId) {
                            continue;
                        }
                        if ((0, legacy_account_validation_1.normalizeRoleName)(row?.name) === value) {
                            conflicts.push({ kind: 'role', userId });
                        }
                    }
                }
                else {
                    if ((0, shared_1.isDuplicateFriendlyDisplayName)(value)) {
                        return null;
                    }
                    const users = await pool.query(`
            SELECT id, username, "displayName"
            FROM users
            WHERE "displayName" = $1
              OR ("displayName" IS NULL AND LEFT(username, 1) = $1)
          `, [value]);
                    for (const row of users.rows) {
                        const user = normalizeUserRow(row);
                        if (!user) {
                            continue;
                        }
                        if ((0, legacy_account_validation_1.resolveDisplayName)(user.displayName, user.username) === value) {
                            conflicts.push({ kind: 'display', userId: user.id });
                        }
                    }
                }
            }
            catch (error) {
                if (!isMissingLegacySchemaError(error)) {
                    throw error;
                }
                shouldUseMemoryFallback = true;
            }
        }
        if (shouldUseMemoryFallback) {
            for (const user of this.memoryUsersById.values()) {
                if (requestedKind === 'account' && (0, legacy_account_validation_1.normalizeUsername)(user.username) === value) {
                    conflicts.push({ kind: 'account', userId: user.id });
                }
                if (requestedKind === 'display' && (0, legacy_account_validation_1.resolveDisplayName)(user.displayName, user.username) === value) {
                    conflicts.push({ kind: 'display', userId: user.id });
                }
                if (requestedKind === 'role' && (0, legacy_account_validation_1.normalizeRoleName)(user.pendingRoleName) === value) {
                    conflicts.push({ kind: 'role', userId: user.id });
                }
            }
        }
        const exclude = options.exclude ?? [];
        return conflicts.find((entry) => !exclude.some((candidate) => candidate.kind === entry.kind && candidate.userId === entry.userId)) ?? null;
    }
    async findUserById(userId) {
        const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
        if (!normalizedUserId) {
            return null;
        }
        const pool = await this.legacyAuthService.ensurePool();
        if (pool) {
            try {
                const result = await pool.query(`
        SELECT id, username, "displayName", "pendingRoleName", "passwordHash", "totalOnlineSeconds", "currentOnlineStartedAt", "createdAt"
        FROM users
        WHERE id::text = $1
        LIMIT 1
      `, [normalizedUserId]);
                return normalizeUserRow(result.rows[0]);
            }
            catch (error) {
                if (!isMissingLegacySchemaError(error)) {
                    throw error;
                }
            }
        }
        return this.memoryUsersById.get(normalizedUserId) ?? null;
    }
    async findUserByUsername(username) {
        const normalizedUsername = (0, legacy_account_validation_1.normalizeUsername)(username).trim();
        if (!normalizedUsername) {
            return null;
        }
        const pool = await this.legacyAuthService.ensurePool();
        if (pool) {
            try {
                const result = await pool.query(`
        SELECT id, username, "displayName", "pendingRoleName", "passwordHash", "totalOnlineSeconds", "currentOnlineStartedAt", "createdAt"
        FROM users
        WHERE username = $1
        LIMIT 1
      `, [normalizedUsername]);
                return normalizeUserRow(result.rows[0]);
            }
            catch (error) {
                if (!isMissingLegacySchemaError(error)) {
                    throw error;
                }
            }
        }
        const userId = this.memoryUserIdByUsername.get(normalizedUsername);
        return userId ? (this.memoryUsersById.get(userId) ?? null) : null;
    }
    async findUsersByRoleName(roleName) {
        const normalizedRoleName = (0, legacy_account_validation_1.normalizeRoleName)(roleName);
        if (!normalizedRoleName) {
            return [];
        }
        const pool = await this.legacyAuthService.ensurePool();
        if (pool) {
            try {
                const matchedPlayers = await pool.query('SELECT "userId" FROM players WHERE name = $1', [normalizedRoleName]);
                const matchedUserIds = Array.from(new Set(matchedPlayers.rows
                    .map((row) => typeof row?.userId === 'string' ? row.userId : '')
                    .filter((userId) => userId.length > 0)));
                const clauses = ['"pendingRoleName" = $1'];
                const values = [normalizedRoleName];
                if (matchedUserIds.length > 0) {
                    clauses.push(`id::text = ANY($2::varchar[])`);
                    values.push(matchedUserIds);
                }
                const result = await pool.query(`
        SELECT id, username, "displayName", "pendingRoleName", "passwordHash", "totalOnlineSeconds", "currentOnlineStartedAt", "createdAt"
        FROM users
        WHERE ${clauses.join(' OR ')}
      `, values);
                return result.rows.map(normalizeUserRow).filter((entry) => entry !== null);
            }
            catch (error) {
                if (!isMissingLegacySchemaError(error)) {
                    throw error;
                }
            }
        }
        const users = [];
        for (const user of this.memoryUsersById.values()) {
            if ((0, legacy_account_validation_1.normalizeRoleName)(user.pendingRoleName) === normalizedRoleName) {
                users.push(user);
            }
        }
        return users;
    }
    async resolveManagedUserByPlayerId(playerId) {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            return null;
        }
        const pool = await this.legacyAuthService.ensurePool();
        if (pool) {
            try {
                const result = await pool.query(`
        SELECT
          u.id,
          u.username,
          u."displayName",
          u."pendingRoleName",
          u."passwordHash",
          u."totalOnlineSeconds",
          u."currentOnlineStartedAt",
          u."createdAt"
        FROM players p
        JOIN users u ON u.id = p."userId"
        WHERE p.id = $1
        LIMIT 1
      `, [normalizedPlayerId]);
                const direct = normalizeUserRow(result.rows[0]);
                if (direct) {
                    return direct;
                }
            }
            catch (error) {
                if (!isMissingLegacySchemaError(error)) {
                    throw error;
                }
            }
        }
        const fallbackUserId = parseFallbackPlayerUserId(normalizedPlayerId);
        if (fallbackUserId) {
            return this.findUserById(fallbackUserId);
        }
        return null;
    }
    resolveMemoryUserByPlayerId(playerId) {
        const fallbackUserId = parseFallbackPlayerUserId(playerId);
        if (!fallbackUserId) {
            return null;
        }
        return this.memoryUsersById.get(fallbackUserId) ?? null;
    }
    saveMemoryUser(user) {
        const previous = this.memoryUsersById.get(user.id);
        if (previous) {
            this.memoryUserIdByUsername.delete(previous.username);
        }
        this.memoryUsersById.set(user.id, user);
        this.memoryUserIdByUsername.set(user.username, user.id);
    }
};
exports.LegacyAuthHttpService = LegacyAuthHttpService;
exports.LegacyAuthHttpService = LegacyAuthHttpService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [legacy_auth_service_1.LegacyAuthService,
        player_identity_persistence_service_1.PlayerIdentityPersistenceService,
        player_persistence_service_1.PlayerPersistenceService,
        world_player_token_codec_service_1.WorldPlayerTokenCodecService])
], LegacyAuthHttpService);
function normalizeUserRow(row) {
    if (!row || typeof row !== 'object') {
        return null;
    }
    const id = typeof row.id === 'string' ? row.id : '';
    const username = typeof row.username === 'string' ? row.username : '';
    const passwordHash = typeof row.passwordHash === 'string' ? row.passwordHash : '';
    if (!id || !username || !passwordHash) {
        return null;
    }
    return {
        id,
        username,
        displayName: typeof row.displayName === 'string' && row.displayName.trim() ? row.displayName : null,
        pendingRoleName: typeof row.pendingRoleName === 'string' && row.pendingRoleName.trim() ? row.pendingRoleName : null,
        passwordHash,
        totalOnlineSeconds: Number.isFinite(row.totalOnlineSeconds) ? Math.max(0, Math.trunc(row.totalOnlineSeconds)) : 0,
        currentOnlineStartedAt: normalizeDateTime(row.currentOnlineStartedAt),
        createdAt: normalizeDateTime(row.createdAt) ?? new Date(0).toISOString(),
    };
}
function normalizeManagedAccountRow(row) {
    if (!row || typeof row !== 'object') {
        return null;
    }
    const playerId = typeof row.playerId === 'string' ? row.playerId : '';
    const userId = typeof row.userId === 'string' ? row.userId : '';
    const username = typeof row.username === 'string' ? row.username : '';
    if (!playerId || !userId || !username) {
        return null;
    }
    return {
        playerId,
        playerName: typeof row.playerName === 'string' && row.playerName.trim() ? row.playerName : null,
        userId,
        username,
        displayName: typeof row.displayName === 'string' && row.displayName.trim() ? row.displayName : null,
        createdAt: normalizeDateTime(row.createdAt) ?? new Date(0).toISOString(),
        totalOnlineSeconds: Number.isFinite(row.totalOnlineSeconds) ? Math.max(0, Math.trunc(row.totalOnlineSeconds)) : 0,
        currentOnlineStartedAt: normalizeDateTime(row.currentOnlineStartedAt),
    };
}
function normalizeDateTime(value) {
    if (typeof value === 'string' && value.trim()) {
        return value;
    }
    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return value.toISOString();
    }
    return null;
}
function parseFallbackPlayerUserId(playerId) {
    if (typeof playerId !== 'string' || !playerId.startsWith('p_')) {
        return null;
    }
    const suffix = playerId.slice(2).trim();
    return suffix || null;
}
function buildFallbackPlayerId(userId) {
    const normalized = typeof userId === 'string' ? userId.trim() : '';
    return normalized ? `p_${normalized}` : 'p_guest';
}
function resolveIdentityPlayerName(playerName, username) {
    const normalized = typeof playerName === 'string' ? playerName.trim().normalize('NFC') : '';
    if (normalized) {
        return normalized;
    }
    return username.normalize('NFC');
}
function readPositiveIntEnv(name, fallback) {
    const raw = Number(process.env[name] ?? Number.NaN);
    return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : fallback;
}
function buildConflictMessage(requestedKind, conflictKind) {
    if (requestedKind === 'account' || conflictKind === 'account') {
        return '账号已存在';
    }
    if (requestedKind === 'role' || conflictKind === 'role') {
        return '角色名称已存在';
    }
    return '显示名称已存在';
}
function signLegacyJwt(payload, secret, expiresInSec) {
    const header = base64UrlEncode(Buffer.from(JSON.stringify({
        alg: 'HS256',
        typ: 'JWT',
    }), 'utf8'));
    const now = Math.floor(Date.now() / 1000);
    const body = base64UrlEncode(Buffer.from(JSON.stringify({
        ...payload,
        iat: now,
        exp: now + Math.max(60, Math.trunc(expiresInSec)),
    }), 'utf8'));
    const signature = base64UrlEncode((0, node_crypto_1.createHmac)('sha256', secret)
        .update(`${header}.${body}`)
        .digest());
    return `${header}.${body}.${signature}`;
}
function verifyLegacyJwt(token, secret) {
    const segments = token.split('.');
    if (segments.length !== 3) {
        return null;
    }
    const [encodedHeader, encodedPayload, encodedSignature] = segments;
    const header = parseJwtSegment(encodedHeader);
    const payload = parseJwtSegment(encodedPayload);
    if (!header || !payload) {
        return null;
    }
    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
        return null;
    }
    const expectedSignature = base64UrlEncode((0, node_crypto_1.createHmac)('sha256', secret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest());
    const left = Buffer.from(encodedSignature);
    const right = Buffer.from(expectedSignature);
    if (left.length !== right.length || !(0, node_crypto_1.timingSafeEqual)(left, right)) {
        return null;
    }
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && Number.isFinite(payload.exp) && payload.exp < now) {
        return null;
    }
    if (typeof payload.nbf === 'number' && Number.isFinite(payload.nbf) && payload.nbf > now) {
        return null;
    }
    return payload;
}
function parseJwtSegment(segment) {
    try {
        const json = Buffer.from(base64UrlDecode(segment), 'base64').toString('utf8');
        const value = JSON.parse(json);
        return value && typeof value === 'object' ? value : null;
    }
    catch {
        return null;
    }
}
function base64UrlDecode(value) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4;
    return padding === 0 ? normalized : `${normalized}${'='.repeat(4 - padding)}`;
}
function base64UrlEncode(value) {
    return value
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}
function isMissingLegacySchemaError(error) {
    return Boolean(error && typeof error === 'object' && error.code === '42P01');
}
