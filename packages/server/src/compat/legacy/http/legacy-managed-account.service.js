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
exports.LegacyManagedAccountService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** legacy_account_validation_1：定义该变量以承载业务值。 */
const legacy_account_validation_1 = require("../legacy-account-validation");
/** legacy_password_hash_1：定义该变量以承载业务值。 */
const legacy_password_hash_1 = require("../legacy-password-hash");
/** legacy_auth_service_1：定义该变量以承载业务值。 */
const legacy_auth_service_1 = require("../legacy-auth.service");
/** legacy_auth_user_compat_service_1：定义该变量以承载业务值。 */
const legacy_auth_user_compat_service_1 = require("./legacy-auth-user-compat.service");
/** legacy_next_identity_sync_service_1：定义该变量以承载业务值。 */
const legacy_next_identity_sync_service_1 = require("./legacy-next-identity-sync.service");
/** LegacyManagedAccountService：定义该变量以承载业务值。 */
let LegacyManagedAccountService = class LegacyManagedAccountService {
    legacyAuthService;
    legacyAuthUserCompatService;
    legacyNextIdentitySyncService;
/** 构造函数：执行实例初始化流程。 */
    constructor(legacyAuthService, legacyAuthUserCompatService, legacyNextIdentitySyncService) {
        this.legacyAuthService = legacyAuthService;
        this.legacyAuthUserCompatService = legacyAuthUserCompatService;
        this.legacyNextIdentitySyncService = legacyNextIdentitySyncService;
    }
/** getManagedAccountIndex：执行对应的业务逻辑。 */
    async getManagedAccountIndex(playerIds) {
        return this.runWithPrimaryAuth(() => this.legacyAuthService.getManagedAccountIndex(playerIds), async () => {
/** normalizedPlayerIds：定义该变量以承载业务值。 */
            const normalizedPlayerIds = Array.from(new Set(Array.from(playerIds)
                .filter((playerId) => typeof playerId === 'string')
                .map((playerId) => playerId.trim())
                .filter((playerId) => playerId.length > 0)));
/** result：定义该变量以承载业务值。 */
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
/** updateManagedPlayerPassword：执行对应的业务逻辑。 */
    async updateManagedPlayerPassword(playerId, newPassword) {
        return this.runWithPrimaryAuth(() => this.legacyAuthService.updateManagedPlayerPassword(playerId, newPassword), async () => {
/** passwordError：定义该变量以承载业务值。 */
            const passwordError = (0, legacy_account_validation_1.validatePassword)(newPassword);
            if (passwordError) {
                throw new common_1.BadRequestException(passwordError);
            }
/** user：定义该变量以承载业务值。 */
            const user = await this.resolveManagedUserByPlayerId(playerId);
            if (!user) {
                throw new common_1.BadRequestException('目标玩家没有可管理的账号');
            }
/** passwordHash：定义该变量以承载业务值。 */
            const passwordHash = await (0, legacy_password_hash_1.hashPassword)(newPassword);
            this.legacyAuthUserCompatService.saveMemoryUser({
                ...user,
                passwordHash,
            });
        });
    }
/** updateManagedPlayerAccount：执行对应的业务逻辑。 */
    async updateManagedPlayerAccount(playerId, username) {
/** result：定义该变量以承载业务值。 */
        const result = await this.runWithPrimaryAuth(() => this.legacyAuthService.updateManagedPlayerAccount(playerId, username), async () => {
/** user：定义该变量以承载业务值。 */
            const user = await this.resolveManagedUserByPlayerId(playerId);
            if (!user) {
                throw new common_1.BadRequestException('目标玩家没有可管理的账号');
            }
/** normalizedUsername：定义该变量以承载业务值。 */
            const normalizedUsername = (0, legacy_account_validation_1.normalizeUsername)(username);
/** usernameError：定义该变量以承载业务值。 */
            const usernameError = (0, legacy_account_validation_1.validateUsername)(normalizedUsername);
            if (usernameError) {
                throw new common_1.BadRequestException(usernameError);
            }
            if (normalizedUsername === user.username) {
                return { username: normalizedUsername, displayNameChanged: false, nextDisplayName: (0, legacy_account_validation_1.resolveDisplayName)(user.displayName, user.username) };
            }
/** usernameConflict：定义该变量以承载业务值。 */
            const usernameConflict = await this.legacyAuthUserCompatService.ensureAvailable(normalizedUsername, 'account', {
                exclude: [{ kind: 'account', userId: user.id }],
            });
            if (usernameConflict) {
                throw new common_1.BadRequestException(usernameConflict);
            }
/** previousDisplayName：定义该变量以承载业务值。 */
            const previousDisplayName = (0, legacy_account_validation_1.resolveDisplayName)(user.displayName, user.username);
/** nextDisplayName：定义该变量以承载业务值。 */
            const nextDisplayName = (0, legacy_account_validation_1.resolveDisplayName)(user.displayName, normalizedUsername);
            if (nextDisplayName !== previousDisplayName) {
/** displayNameConflict：定义该变量以承载业务值。 */
                const displayNameConflict = await this.legacyAuthUserCompatService.ensureAvailable(nextDisplayName, 'display', {
                    exclude: [{ kind: 'display', userId: user.id }],
                });
                if (displayNameConflict) {
                    throw new common_1.BadRequestException(displayNameConflict);
                }
            }
            this.legacyAuthUserCompatService.saveMemoryUser({
                ...user,
                username: normalizedUsername,
            });
            return {
                username: normalizedUsername,
/** displayNameChanged：定义该变量以承载业务值。 */
                displayNameChanged: nextDisplayName !== previousDisplayName,
                nextDisplayName,
            };
        });
        await this.legacyNextIdentitySyncService.syncIdentityByPlayerId(playerId).catch(() => undefined);
        return result;
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
/** resolveManagedUserByPlayerId：执行对应的业务逻辑。 */
    async resolveManagedUserByPlayerId(playerId) {
/** normalizedPlayerId：定义该变量以承载业务值。 */
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            return null;
        }
/** pool：定义该变量以承载业务值。 */
        const pool = await this.legacyAuthService.ensurePool();
        if (pool) {
            try {
/** result：定义该变量以承载业务值。 */
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
/** direct：定义该变量以承载业务值。 */
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
        this.legacyAuthUserCompatService.ensureLegacyHttpMemoryFallbackEnabled();
/** fallbackUserId：定义该变量以承载业务值。 */
        const fallbackUserId = parseFallbackPlayerUserId(normalizedPlayerId);
        if (fallbackUserId) {
            return this.legacyAuthUserCompatService.findUserById(fallbackUserId);
        }
        return null;
    }
/** resolveMemoryUserByPlayerId：执行对应的业务逻辑。 */
    resolveMemoryUserByPlayerId(playerId) {
/** fallbackUserId：定义该变量以承载业务值。 */
        const fallbackUserId = parseFallbackPlayerUserId(playerId);
        if (!fallbackUserId) {
            return null;
        }
        return this.legacyAuthUserCompatService.getMemoryUserById(fallbackUserId);
    }
};
exports.LegacyManagedAccountService = LegacyManagedAccountService;
exports.LegacyManagedAccountService = LegacyManagedAccountService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [legacy_auth_service_1.LegacyAuthService,
        legacy_auth_user_compat_service_1.LegacyAuthUserCompatService,
        legacy_next_identity_sync_service_1.LegacyNextIdentitySyncService])
], LegacyManagedAccountService);
/** normalizeUserRow：执行对应的业务逻辑。 */
function normalizeUserRow(row) {
    if (!row || typeof row !== 'object') {
        return null;
    }
/** id：定义该变量以承载业务值。 */
    const id = typeof row.id === 'string' ? row.id : '';
/** username：定义该变量以承载业务值。 */
    const username = typeof row.username === 'string' ? row.username : '';
/** passwordHash：定义该变量以承载业务值。 */
    const passwordHash = typeof row.passwordHash === 'string' ? row.passwordHash : '';
    if (!id || !username || !passwordHash) {
        return null;
    }
    return {
        id,
        username,
/** displayName：定义该变量以承载业务值。 */
        displayName: typeof row.displayName === 'string' && row.displayName.trim() ? row.displayName : null,
/** pendingRoleName：定义该变量以承载业务值。 */
        pendingRoleName: typeof row.pendingRoleName === 'string' && row.pendingRoleName.trim() ? row.pendingRoleName : null,
        passwordHash,
        totalOnlineSeconds: Number.isFinite(row.totalOnlineSeconds) ? Math.max(0, Math.trunc(row.totalOnlineSeconds)) : 0,
        currentOnlineStartedAt: normalizeDateTime(row.currentOnlineStartedAt),
        createdAt: normalizeDateTime(row.createdAt) ?? new Date(0).toISOString(),
    };
}
/** normalizeDateTime：执行对应的业务逻辑。 */
function normalizeDateTime(value) {
    if (typeof value === 'string' && value.trim()) {
        return value;
    }
    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return value.toISOString();
    }
    return null;
}
/** parseFallbackPlayerUserId：执行对应的业务逻辑。 */
function parseFallbackPlayerUserId(playerId) {
    if (typeof playerId !== 'string' || !playerId.startsWith('p_')) {
        return null;
    }
/** suffix：定义该变量以承载业务值。 */
    const suffix = playerId.slice(2).trim();
    return suffix || null;
}
/** isMissingLegacySchemaError：执行对应的业务逻辑。 */
function isMissingLegacySchemaError(error) {
    return Boolean(error && typeof error === 'object' && error.code === '42P01');
}
