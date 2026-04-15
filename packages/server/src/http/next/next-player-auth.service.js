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
exports.NextPlayerAuthService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const legacy_account_validation_1 = require("../../compat/legacy/legacy-account-validation");
const legacy_password_hash_1 = require("../../compat/legacy/legacy-password-hash");
const world_player_token_codec_service_1 = require("../../network/world-player-token-codec.service");
const player_identity_persistence_service_1 = require("../../persistence/player-identity-persistence.service");
const player_runtime_service_1 = require("../../runtime/player/player-runtime.service");
const world_player_snapshot_service_1 = require("../../network/world-player-snapshot.service");
const next_player_auth_store_service_1 = require("./next-player-auth-store.service");
let NextPlayerAuthService = class NextPlayerAuthService {
    logger = new common_1.Logger(NextPlayerAuthService.name);
    authStore;
    worldPlayerTokenCodecService;
    playerIdentityPersistenceService;
    playerRuntimeService;
    worldPlayerSnapshotService;
    constructor(authStore, worldPlayerTokenCodecService, playerIdentityPersistenceService, playerRuntimeService, worldPlayerSnapshotService) {
        this.authStore = authStore;
        this.worldPlayerTokenCodecService = worldPlayerTokenCodecService;
        this.playerIdentityPersistenceService = playerIdentityPersistenceService;
        this.playerRuntimeService = playerRuntimeService;
        this.worldPlayerSnapshotService = worldPlayerSnapshotService;
    }
    async register(accountName, password, displayName, roleName) {
        const normalizedUsername = (0, legacy_account_validation_1.normalizeUsername)(accountName);
        const normalizedDisplayName = (0, legacy_account_validation_1.normalizeDisplayName)(displayName);
        const normalizedRoleName = (0, legacy_account_validation_1.normalizeRoleName)(roleName) || (0, legacy_account_validation_1.buildDefaultRoleName)(normalizedUsername);
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
        const usernameConflict = await this.authStore.ensureAvailable(normalizedUsername, 'account');
        if (usernameConflict) {
            throw new common_1.BadRequestException(usernameConflict);
        }
        const displayNameConflict = await this.authStore.ensureAvailable(normalizedDisplayName, 'display');
        if (displayNameConflict) {
            throw new common_1.BadRequestException(displayNameConflict);
        }
        const roleNameConflict = await this.authStore.ensureAvailable(normalizedRoleName, 'role');
        if (roleNameConflict) {
            throw new common_1.BadRequestException(roleNameConflict);
        }
        const userId = (0, node_crypto_1.randomUUID)();
        const createdAt = new Date().toISOString();
        const user = await this.authStore.saveUser({
            id: userId,
            userId,
            username: normalizedUsername,
            displayName: normalizedDisplayName,
            pendingRoleName: normalizedRoleName,
            playerId: buildPlayerId(userId),
            playerName: normalizedRoleName,
            passwordHash: await (0, legacy_password_hash_1.hashPassword)(password),
            totalOnlineSeconds: 0,
            currentOnlineStartedAt: null,
            createdAt,
            updatedAt: Date.now(),
        });
        await this.persistIdentity(user);
        await this.ensureStarterSnapshot(user.playerId);
        return this.issueTokens(user);
    }
    async login(loginName, password) {
        const normalizedLoginName = (0, legacy_account_validation_1.normalizeUsername)(loginName).trim();
        const directUser = await this.authStore.findUserByUsername(normalizedLoginName);
        const roleMatchedUsers = await this.authStore.findUsersByRoleName(normalizedLoginName);
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
        const selected = directUser && matchedUsers.some((entry) => entry.id === directUser.id)
            ? directUser
            : matchedUsers.length === 1
                ? matchedUsers[0]
                : null;
        if (!selected) {
            throw new common_1.BadRequestException('该角色名对应多个账号，请改用账号登录');
        }
        await this.persistIdentity(selected);
        await this.ensureStarterSnapshot(selected.playerId);
        return this.issueTokens(selected);
    }
    async refresh(refreshToken) {
        const payload = this.worldPlayerTokenCodecService.validateRefreshToken(typeof refreshToken === 'string' ? refreshToken.trim() : '');
        if (!payload || payload.role === 'gm' || typeof payload.sub !== 'string' || typeof payload.username !== 'string') {
            throw new common_1.UnauthorizedException('刷新令牌无效或已过期');
        }
        const user = await this.authStore.findUserById(payload.sub);
        if (!user) {
            throw new common_1.UnauthorizedException('用户不存在');
        }
        await this.persistIdentity(user);
        await this.ensureStarterSnapshot(user.playerId);
        return this.issueTokens(user);
    }
    async checkDisplayName(displayName = '') {
        const normalizedDisplayName = (0, legacy_account_validation_1.normalizeDisplayName)(displayName);
        const error = (0, legacy_account_validation_1.validateDisplayName)(normalizedDisplayName);
        if (error) {
            return { available: false, message: error };
        }
        const conflict = await this.authStore.ensureAvailable(normalizedDisplayName, 'display');
        if (conflict) {
            return { available: false, message: conflict };
        }
        return { available: true };
    }
    async updatePassword(authorization, currentPassword, newPassword) {
        const user = await this.requireUser(authorization);
        if (!await (0, legacy_password_hash_1.verifyPassword)(currentPassword, user.passwordHash)) {
            throw new common_1.BadRequestException('当前密码错误');
        }
        const passwordError = (0, legacy_account_validation_1.validatePassword)(newPassword);
        if (passwordError) {
            throw new common_1.BadRequestException(passwordError);
        }
        await this.authStore.saveUser({
            ...user,
            passwordHash: await (0, legacy_password_hash_1.hashPassword)(newPassword),
            updatedAt: Date.now(),
        });
        return { ok: true };
    }
    async updateDisplayName(authorization, displayName) {
        const user = await this.requireUser(authorization);
        const normalizedDisplayName = (0, legacy_account_validation_1.normalizeDisplayName)(displayName);
        const displayNameError = (0, legacy_account_validation_1.validateDisplayName)(normalizedDisplayName);
        if (displayNameError) {
            throw new common_1.BadRequestException(displayNameError);
        }
        const currentDisplayName = (0, legacy_account_validation_1.resolveDisplayName)(user.displayName, user.username);
        if (normalizedDisplayName === currentDisplayName) {
            return { displayName: normalizedDisplayName };
        }
        const displayNameConflict = await this.authStore.ensureAvailable(normalizedDisplayName, 'display', {
            exclude: [{ userId: user.id, kind: 'display' }],
        });
        if (displayNameConflict) {
            throw new common_1.BadRequestException(displayNameConflict);
        }
        const nextUser = await this.authStore.saveUser({
            ...user,
            displayName: normalizedDisplayName,
            updatedAt: Date.now(),
        });
        await this.persistIdentity(nextUser);
        this.syncRuntimeDisplayName(nextUser);
        return { displayName: normalizedDisplayName };
    }
    async updateRoleName(authorization, roleName) {
        const user = await this.requireUser(authorization);
        const normalizedRoleName = (0, legacy_account_validation_1.normalizeRoleName)(roleName);
        const roleNameError = (0, legacy_account_validation_1.validateRoleName)(normalizedRoleName);
        if (roleNameError) {
            throw new common_1.BadRequestException(roleNameError);
        }
        if ((0, legacy_account_validation_1.normalizeRoleName)(user.pendingRoleName) === normalizedRoleName) {
            return { roleName: normalizedRoleName };
        }
        const roleNameConflict = await this.authStore.ensureAvailable(normalizedRoleName, 'role', {
            exclude: [{ userId: user.id, kind: 'role' }],
        });
        if (roleNameConflict) {
            throw new common_1.BadRequestException(roleNameConflict);
        }
        const nextUser = await this.authStore.saveUser({
            ...user,
            pendingRoleName: normalizedRoleName,
            playerName: normalizedRoleName,
            updatedAt: Date.now(),
        });
        await this.persistIdentity(nextUser);
        this.syncRuntimeRoleName(nextUser);
        return { roleName: normalizedRoleName };
    }
    async requireUser(authorization) {
        const token = typeof authorization === 'string' && authorization.startsWith('Bearer ')
            ? authorization.slice('Bearer '.length).trim()
            : '';
        if (!token) {
            throw new common_1.UnauthorizedException('未登录');
        }
        const payload = this.worldPlayerTokenCodecService.validateAccessToken(token);
        if (!payload?.sub) {
            throw new common_1.UnauthorizedException('登录已失效');
        }
        const user = await this.authStore.findUserById(payload.sub);
        if (!user) {
            throw new common_1.UnauthorizedException('用户不存在');
        }
        return user;
    }
    issueTokens(user) {
        const displayName = (0, legacy_account_validation_1.resolveDisplayName)(user.displayName, user.username);
        const playerName = user.pendingRoleName?.trim() || user.username;
        const payload = {
            sub: user.id,
            username: user.username,
            displayName,
            playerId: user.playerId,
            playerName,
        };
        return {
            accessToken: this.worldPlayerTokenCodecService.issueAccessToken(payload),
            refreshToken: this.worldPlayerTokenCodecService.issueRefreshToken(payload),
        };
    }
    async persistIdentity(user) {
        if (!this.playerIdentityPersistenceService.isEnabled()) {
            return;
        }
        try {
            await this.playerIdentityPersistenceService.savePlayerIdentity({
                version: 1,
                userId: user.id,
                username: user.username,
                displayName: (0, legacy_account_validation_1.resolveDisplayName)(user.displayName, user.username),
                playerId: user.playerId,
                playerName: user.pendingRoleName?.trim() || user.username,
                persistedSource: 'native',
                updatedAt: Date.now(),
            });
        }
        catch (error) {
            this.logger.warn(`持久化 next 玩家身份失败：userId=${user.id} error=${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async ensureStarterSnapshot(playerId) {
        if (!this.worldPlayerSnapshotService || typeof this.worldPlayerSnapshotService.ensureNativeStarterSnapshot !== 'function') {
            return;
        }
        const result = await this.worldPlayerSnapshotService.ensureNativeStarterSnapshot(playerId).catch((error) => ({
            ok: false,
            failureStage: error instanceof Error ? error.message : String(error),
        }));
        if (result?.ok === false && result.failureStage !== 'native_snapshot_recovery_persistence_disabled') {
            this.logger.warn(`补建原生初始快照已跳过：playerId=${playerId} reason=${result.failureStage ?? '未知'}`);
        }
    }
    syncRuntimeDisplayName(user) {
        if (!this.playerRuntimeService.snapshot(user.playerId)) {
            return;
        }
        this.playerRuntimeService.setIdentity(user.playerId, {
            displayName: (0, legacy_account_validation_1.resolveDisplayName)(user.displayName, user.username),
        });
    }
    syncRuntimeRoleName(user) {
        const runtime = this.playerRuntimeService.snapshot(user.playerId);
        if (!runtime) {
            return;
        }
        this.playerRuntimeService.setIdentity(user.playerId, {
            name: user.pendingRoleName?.trim() || user.username,
            displayName: runtime.displayName,
        });
    }
};
exports.NextPlayerAuthService = NextPlayerAuthService;
exports.NextPlayerAuthService = NextPlayerAuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [next_player_auth_store_service_1.NextPlayerAuthStoreService,
        world_player_token_codec_service_1.WorldPlayerTokenCodecService,
        player_identity_persistence_service_1.PlayerIdentityPersistenceService,
        player_runtime_service_1.PlayerRuntimeService,
        world_player_snapshot_service_1.WorldPlayerSnapshotService])
], NextPlayerAuthService);
function buildPlayerId(userId) {
    return `p_${String(userId ?? '').trim()}`;
}
