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
exports.NextManagedAccountService = void 0;
const common_1 = require("@nestjs/common");
const legacy_account_validation_1 = require("../../compat/legacy/legacy-account-validation");
const legacy_password_hash_1 = require("../../compat/legacy/legacy-password-hash");
const player_identity_persistence_service_1 = require("../../persistence/player-identity-persistence.service");
const player_runtime_service_1 = require("../../runtime/player/player-runtime.service");
const next_player_auth_store_service_1 = require("./next-player-auth-store.service");
let NextManagedAccountService = class NextManagedAccountService {
    logger = new common_1.Logger(NextManagedAccountService.name);
    authStore;
    playerIdentityPersistenceService;
    playerRuntimeService;
    constructor(authStore, playerIdentityPersistenceService, playerRuntimeService) {
        this.authStore = authStore;
        this.playerIdentityPersistenceService = playerIdentityPersistenceService;
        this.playerRuntimeService = playerRuntimeService;
    }
    async getManagedAccountIndex(playerIds) {
        const normalizedPlayerIds = Array.from(new Set(Array.from(playerIds ?? [])
            .filter((playerId) => typeof playerId === 'string')
            .map((playerId) => playerId.trim())
            .filter((playerId) => playerId.length > 0)));
        const result = new Map();
        for (const playerId of normalizedPlayerIds) {
            const user = await this.authStore.findUserByPlayerId(playerId);
            if (!user) {
                continue;
            }
            result.set(playerId, {
                playerId,
                playerName: user.pendingRoleName ?? user.username,
                userId: user.id,
                username: user.username,
                displayName: user.displayName,
                createdAt: user.createdAt,
                totalOnlineSeconds: user.totalOnlineSeconds,
                currentOnlineStartedAt: user.currentOnlineStartedAt,
            });
        }
        return result;
    }
    async updateManagedPlayerPassword(playerId, newPassword) {
        const user = await this.requireManagedUser(playerId);
        const passwordError = (0, legacy_account_validation_1.validatePassword)(newPassword);
        if (passwordError) {
            throw new common_1.BadRequestException(passwordError);
        }
        await this.authStore.saveUser({
            ...user,
            passwordHash: await (0, legacy_password_hash_1.hashPassword)(newPassword),
            updatedAt: Date.now(),
        });
    }
    async updateManagedPlayerAccount(playerId, username) {
        const user = await this.requireManagedUser(playerId);
        const normalizedUsername = (0, legacy_account_validation_1.normalizeUsername)(username);
        const usernameError = (0, legacy_account_validation_1.validateUsername)(normalizedUsername);
        if (usernameError) {
            throw new common_1.BadRequestException(usernameError);
        }
        if (normalizedUsername === user.username) {
            return {
                username: normalizedUsername,
                displayNameChanged: false,
                nextDisplayName: (0, legacy_account_validation_1.resolveDisplayName)(user.displayName, user.username),
            };
        }
        const usernameConflict = await this.authStore.ensureAvailable(normalizedUsername, 'account', {
            exclude: [{ userId: user.id, kind: 'account' }],
        });
        if (usernameConflict) {
            throw new common_1.BadRequestException(usernameConflict);
        }
        const previousDisplayName = (0, legacy_account_validation_1.resolveDisplayName)(user.displayName, user.username);
        const nextDisplayName = (0, legacy_account_validation_1.resolveDisplayName)(user.displayName, normalizedUsername);
        if (nextDisplayName !== previousDisplayName) {
            const displayNameConflict = await this.authStore.ensureAvailable(nextDisplayName, 'display', {
                exclude: [{ userId: user.id, kind: 'display' }],
            });
            if (displayNameConflict) {
                throw new common_1.BadRequestException(displayNameConflict);
            }
        }
        const nextUser = await this.authStore.saveUser({
            ...user,
            username: normalizedUsername,
            updatedAt: Date.now(),
        });
        await this.persistIdentity(nextUser);
        if (nextDisplayName !== previousDisplayName) {
            this.syncRuntimeDisplayName(nextUser);
        }
        return {
            username: normalizedUsername,
            displayNameChanged: nextDisplayName !== previousDisplayName,
            nextDisplayName,
        };
    }
    async requireManagedUser(playerId) {
        const user = await this.authStore.findUserByPlayerId(playerId);
        if (!user) {
            throw new common_1.BadRequestException('目标玩家没有可管理的账号');
        }
        return user;
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
            this.logger.warn(`持久化托管账号身份失败：userId=${user.id} error=${error instanceof Error ? error.message : String(error)}`);
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
};
exports.NextManagedAccountService = NextManagedAccountService;
exports.NextManagedAccountService = NextManagedAccountService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [next_player_auth_store_service_1.NextPlayerAuthStoreService,
        player_identity_persistence_service_1.PlayerIdentityPersistenceService,
        player_runtime_service_1.PlayerRuntimeService])
], NextManagedAccountService);
