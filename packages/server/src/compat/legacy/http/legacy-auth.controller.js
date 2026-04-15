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
/** __param：定义该变量以承载业务值。 */
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyAuthController = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** node_crypto_1：定义该变量以承载业务值。 */
const node_crypto_1 = require("node:crypto");
/** legacy_account_validation_1：定义该变量以承载业务值。 */
const legacy_account_validation_1 = require("../legacy-account-validation");
/** legacy_password_hash_1：定义该变量以承载业务值。 */
const legacy_password_hash_1 = require("../legacy-password-hash");
/** legacy_auth_service_1：定义该变量以承载业务值。 */
const legacy_auth_service_1 = require("../legacy-auth.service");
/** world_player_token_codec_service_1：定义该变量以承载业务值。 */
const world_player_token_codec_service_1 = require("../../../network/world-player-token-codec.service");
/** legacy_next_identity_sync_service_1：定义该变量以承载业务值。 */
const legacy_next_identity_sync_service_1 = require("./legacy-next-identity-sync.service");
/** legacy_auth_user_compat_service_1：定义该变量以承载业务值。 */
const legacy_auth_user_compat_service_1 = require("./legacy-auth-user-compat.service");
/** LegacyAuthController：定义该变量以承载业务值。 */
let LegacyAuthController = class LegacyAuthController {
    legacyAuthService;
    legacyAuthUserCompatService;
    worldPlayerTokenCodecService;
    legacyNextIdentitySyncService;
    logger = new common_1.Logger(LegacyAuthController.name);
/** 构造函数：执行实例初始化流程。 */
    constructor(legacyAuthService, legacyAuthUserCompatService, worldPlayerTokenCodecService, legacyNextIdentitySyncService) {
        this.legacyAuthService = legacyAuthService;
        this.legacyAuthUserCompatService = legacyAuthUserCompatService;
        this.worldPlayerTokenCodecService = worldPlayerTokenCodecService;
        this.legacyNextIdentitySyncService = legacyNextIdentitySyncService;
    }
/** register：执行对应的业务逻辑。 */
    async register(body) {
/** legacyUsername：定义该变量以承载业务值。 */
        const legacyUsername = pickString(body?.username);
/** accountName：定义该变量以承载业务值。 */
        const accountName = pickString(body?.accountName) || legacyUsername;
/** roleName：定义该变量以承载业务值。 */
        const roleName = pickString(body?.roleName) || (0, legacy_account_validation_1.buildDefaultRoleName)(accountName);
/** password：定义该变量以承载业务值。 */
        const password = pickString(body?.password);
/** displayName：定义该变量以承载业务值。 */
        const displayName = pickString(body?.displayName);
/** result：定义该变量以承载业务值。 */
        const result = await this.runWithPrimaryAuth(() => this.legacyAuthService.register(accountName, password, displayName, roleName), async () => {
/** normalizedUsername：定义该变量以承载业务值。 */
            const normalizedUsername = (0, legacy_account_validation_1.normalizeUsername)(accountName);
/** normalizedDisplayName：定义该变量以承载业务值。 */
            const normalizedDisplayName = (0, legacy_account_validation_1.normalizeDisplayName)(displayName);
/** normalizedRoleName：定义该变量以承载业务值。 */
            const normalizedRoleName = (0, legacy_account_validation_1.normalizeRoleName)(roleName);
/** usernameError：定义该变量以承载业务值。 */
            const usernameError = (0, legacy_account_validation_1.validateUsername)(normalizedUsername);
            if (usernameError) {
                throw new common_1.BadRequestException(usernameError);
            }
/** passwordError：定义该变量以承载业务值。 */
            const passwordError = (0, legacy_account_validation_1.validatePassword)(password);
            if (passwordError) {
                throw new common_1.BadRequestException(passwordError);
            }
/** displayNameError：定义该变量以承载业务值。 */
            const displayNameError = (0, legacy_account_validation_1.validateDisplayName)(normalizedDisplayName);
            if (displayNameError) {
                throw new common_1.BadRequestException(displayNameError);
            }
/** roleNameError：定义该变量以承载业务值。 */
            const roleNameError = (0, legacy_account_validation_1.validateRoleName)(normalizedRoleName);
            if (roleNameError) {
                throw new common_1.BadRequestException(roleNameError);
            }
/** usernameConflict：定义该变量以承载业务值。 */
            const usernameConflict = await this.ensureAvailable(normalizedUsername, 'account');
            if (usernameConflict) {
                throw new common_1.BadRequestException(usernameConflict);
            }
/** roleNameConflict：定义该变量以承载业务值。 */
            const roleNameConflict = await this.ensureAvailable(normalizedRoleName, 'role');
            if (roleNameConflict) {
                throw new common_1.BadRequestException(roleNameConflict);
            }
/** displayNameConflict：定义该变量以承载业务值。 */
            const displayNameConflict = await this.ensureAvailable(normalizedDisplayName, 'display');
            if (displayNameConflict) {
                throw new common_1.BadRequestException(displayNameConflict);
            }
/** passwordHash：定义该变量以承载业务值。 */
            const passwordHash = await (0, legacy_password_hash_1.hashPassword)(password);
/** created：定义该变量以承载业务值。 */
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
/** syncedIdentity：定义该变量以承载业务值。 */
        const syncedIdentity = await this.legacyNextIdentitySyncService.syncFromAuthResult(result, { roleNameHint: roleName }).catch(() => null);
        await this.legacyNextIdentitySyncService.syncSnapshotForIdentity(syncedIdentity).catch((error) => {
            this.logger.warn(`注册后同步 Next 玩家快照失败：${error instanceof Error ? error.message : String(error)}`);
        });
        return result;
    }
/** login：执行对应的业务逻辑。 */
    async login(body) {
/** loginName：定义该变量以承载业务值。 */
        const loginName = pickString(body?.loginName) || pickString(body?.username);
/** password：定义该变量以承载业务值。 */
        const password = pickString(body?.password);
/** result：定义该变量以承载业务值。 */
        const result = await this.runWithPrimaryAuth(() => this.legacyAuthService.login(loginName, password), async () => {
/** normalizedLoginName：定义该变量以承载业务值。 */
            const normalizedLoginName = (0, legacy_account_validation_1.normalizeUsername)(loginName).trim();
/** directUser：定义该变量以承载业务值。 */
            const directUser = await this.legacyAuthUserCompatService.findUserByUsername(normalizedLoginName);
/** roleMatchedUsers：定义该变量以承载业务值。 */
            const roleMatchedUsers = await this.legacyAuthUserCompatService.findUsersByRoleName(normalizedLoginName);
/** candidates：定义该变量以承载业务值。 */
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
/** matchedUsers：定义该变量以承载业务值。 */
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
/** syncedIdentity：定义该变量以承载业务值。 */
        const syncedIdentity = await this.legacyNextIdentitySyncService.syncFromAuthResult(result).catch(() => null);
        await this.legacyNextIdentitySyncService.syncSnapshotForIdentity(syncedIdentity).catch((error) => {
            this.logger.warn(`登录后同步 Next 玩家快照失败：${error instanceof Error ? error.message : String(error)}`);
        });
        return result;
    }
/** refresh：执行对应的业务逻辑。 */
    async refresh(body) {
/** refreshToken：定义该变量以承载业务值。 */
        const refreshToken = pickString(body?.refreshToken);
/** result：定义该变量以承载业务值。 */
        const result = await this.runWithPrimaryAuth(() => this.legacyAuthService.refresh(refreshToken), async () => {
/** payload：定义该变量以承载业务值。 */
            const payload = this.worldPlayerTokenCodecService.validateRefreshToken(refreshToken.trim());
            if (!payload || payload.role === 'gm' || typeof payload.sub !== 'string' || typeof payload.username !== 'string') {
                throw new common_1.UnauthorizedException('刷新令牌无效或已过期');
            }
/** user：定义该变量以承载业务值。 */
            const user = await this.legacyAuthUserCompatService.findUserById(payload.sub);
            if (!user) {
                throw new common_1.UnauthorizedException('用户不存在');
            }
            return this.issueTokens(user);
        });
/** syncedIdentity：定义该变量以承载业务值。 */
        const syncedIdentity = await this.legacyNextIdentitySyncService.syncFromAuthResult(result).catch(() => null);
        await this.legacyNextIdentitySyncService.syncSnapshotForIdentity(syncedIdentity).catch((error) => {
            this.logger.warn(`刷新后同步 Next 玩家快照失败：${error instanceof Error ? error.message : String(error)}`);
        });
        return result;
    }
/** checkDisplayName：执行对应的业务逻辑。 */
    async checkDisplayName(displayName = '') {
        return this.runWithPrimaryAuth(() => this.legacyAuthService.checkDisplayNameAvailability(displayName), async () => {
/** normalizedDisplayName：定义该变量以承载业务值。 */
            const normalizedDisplayName = (0, legacy_account_validation_1.normalizeDisplayName)(displayName);
/** error：定义该变量以承载业务值。 */
            const error = (0, legacy_account_validation_1.validateDisplayName)(normalizedDisplayName);
            if (error) {
                return { available: false, message: error };
            }
/** conflict：定义该变量以承载业务值。 */
            const conflict = await this.ensureAvailable(normalizedDisplayName, 'display');
            if (conflict) {
                return { available: false, message: conflict };
            }
            return { available: true };
        });
    }
/** runWithPrimaryAuth：执行对应的业务逻辑。 */
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
/** ensureAvailable：执行对应的业务逻辑。 */
    async ensureAvailable(value, requestedKind, options = {}) {
        return this.legacyAuthUserCompatService.ensureAvailable(value, requestedKind, options);
    }
/** issueTokens：执行对应的业务逻辑。 */
    issueTokens(user) {
/** displayName：定义该变量以承载业务值。 */
        const displayName = (0, legacy_account_validation_1.resolveDisplayName)(user.displayName, user.username);
/** playerName：定义该变量以承载业务值。 */
        const playerName = typeof user.pendingRoleName === 'string' && user.pendingRoleName.trim()
            ? user.pendingRoleName.trim()
            : user.username;
/** payload：定义该变量以承载业务值。 */
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
/** pickString：执行对应的业务逻辑。 */
function pickString(value) {
    return typeof value === 'string' ? value : '';
}
/** isMissingLegacySchemaError：执行对应的业务逻辑。 */
function isMissingLegacySchemaError(error) {
    return Boolean(error && typeof error === 'object' && error.code === '42P01');
}
