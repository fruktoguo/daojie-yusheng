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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyAuthController = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const legacy_account_validation_1 = require("../legacy-account-validation");
const legacy_password_hash_1 = require("../legacy-password-hash");
const legacy_auth_service_1 = require("../legacy-auth.service");
const world_player_token_codec_service_1 = require("../../../network/world-player-token-codec.service");
const legacy_next_identity_sync_service_1 = require("./legacy-next-identity-sync.service");
const legacy_auth_user_compat_service_1 = require("./legacy-auth-user-compat.service");
let LegacyAuthController = class LegacyAuthController {
    legacyAuthService;
    legacyAuthUserCompatService;
    worldPlayerTokenCodecService;
    legacyNextIdentitySyncService;
    logger = new common_1.Logger(LegacyAuthController.name);
    constructor(legacyAuthService, legacyAuthUserCompatService, worldPlayerTokenCodecService, legacyNextIdentitySyncService) {
        this.legacyAuthService = legacyAuthService;
        this.legacyAuthUserCompatService = legacyAuthUserCompatService;
        this.worldPlayerTokenCodecService = worldPlayerTokenCodecService;
        this.legacyNextIdentitySyncService = legacyNextIdentitySyncService;
    }
    async register(body) {
        const legacyUsername = pickString(body?.username);
        const accountName = pickString(body?.accountName) || legacyUsername;
        const roleName = pickString(body?.roleName) || (0, legacy_account_validation_1.buildDefaultRoleName)(accountName);
        const password = pickString(body?.password);
        const displayName = pickString(body?.displayName);
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
            this.legacyAuthUserCompatService.saveMemoryUser(created);
            return this.issueTokens(created);
        });
        const syncedIdentity = await this.legacyNextIdentitySyncService.syncFromAuthResult(result, { roleNameHint: roleName }).catch(() => null);
        await this.legacyNextIdentitySyncService.syncSnapshotForIdentity(syncedIdentity).catch((error) => {
            this.logger.warn(`Next player snapshot sync after register failed: ${error instanceof Error ? error.message : String(error)}`);
        });
        return result;
    }
    async login(body) {
        const loginName = pickString(body?.loginName) || pickString(body?.username);
        const password = pickString(body?.password);
        const result = await this.runWithPrimaryAuth(() => this.legacyAuthService.login(loginName, password), async () => {
            const normalizedLoginName = (0, legacy_account_validation_1.normalizeUsername)(loginName).trim();
            const directUser = await this.legacyAuthUserCompatService.findUserByUsername(normalizedLoginName);
            const roleMatchedUsers = await this.legacyAuthUserCompatService.findUsersByRoleName(normalizedLoginName);
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
        const syncedIdentity = await this.legacyNextIdentitySyncService.syncFromAuthResult(result).catch(() => null);
        await this.legacyNextIdentitySyncService.syncSnapshotForIdentity(syncedIdentity).catch((error) => {
            this.logger.warn(`Next player snapshot sync after login failed: ${error instanceof Error ? error.message : String(error)}`);
        });
        return result;
    }
    async refresh(body) {
        const refreshToken = pickString(body?.refreshToken);
        const result = await this.runWithPrimaryAuth(() => this.legacyAuthService.refresh(refreshToken), async () => {
            const payload = this.worldPlayerTokenCodecService.validateRefreshToken(refreshToken.trim());
            if (!payload || payload.role === 'gm' || typeof payload.sub !== 'string' || typeof payload.username !== 'string') {
                throw new common_1.UnauthorizedException('刷新令牌无效或已过期');
            }
            const user = await this.legacyAuthUserCompatService.findUserById(payload.sub);
            if (!user) {
                throw new common_1.UnauthorizedException('用户不存在');
            }
            return this.issueTokens(user);
        });
        const syncedIdentity = await this.legacyNextIdentitySyncService.syncFromAuthResult(result).catch(() => null);
        await this.legacyNextIdentitySyncService.syncSnapshotForIdentity(syncedIdentity).catch((error) => {
            this.logger.warn(`Next player snapshot sync after refresh failed: ${error instanceof Error ? error.message : String(error)}`);
        });
        return result;
    }
    async checkDisplayName(displayName = '') {
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
        this.legacyAuthUserCompatService.ensureLegacyHttpMemoryFallbackEnabled();
        return fallbackTask();
    }
    async ensureAvailable(value, requestedKind, options = {}) {
        return this.legacyAuthUserCompatService.ensureAvailable(value, requestedKind, options);
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
};
exports.LegacyAuthController = LegacyAuthController;
__decorate([
    (0, common_1.Post)('register'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], LegacyAuthController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('login'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], LegacyAuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('refresh'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], LegacyAuthController.prototype, "refresh", null);
__decorate([
    (0, common_1.Get)('display-name/check'),
    __param(0, (0, common_1.Query)('displayName')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], LegacyAuthController.prototype, "checkDisplayName", null);
exports.LegacyAuthController = LegacyAuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [legacy_auth_service_1.LegacyAuthService,
        legacy_auth_user_compat_service_1.LegacyAuthUserCompatService,
        world_player_token_codec_service_1.WorldPlayerTokenCodecService,
        legacy_next_identity_sync_service_1.LegacyNextIdentitySyncService])
], LegacyAuthController);
function pickString(value) {
    return typeof value === 'string' ? value : '';
}
function isMissingLegacySchemaError(error) {
    return Boolean(error && typeof error === 'object' && error.code === '42P01');
}
