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
exports.LegacyManagedAccountService = void 0;
const common_1 = require("@nestjs/common");
const legacy_account_validation_1 = require("../legacy-account-validation");
const legacy_password_hash_1 = require("../legacy-password-hash");
const legacy_auth_service_1 = require("../legacy-auth.service");
const legacy_auth_user_compat_service_1 = require("./legacy-auth-user-compat.service");
const legacy_next_identity_sync_service_1 = require("./legacy-next-identity-sync.service");
let LegacyManagedAccountService = class LegacyManagedAccountService {
    legacyAuthService;
    legacyAuthUserCompatService;
    legacyNextIdentitySyncService;
    constructor(legacyAuthService, legacyAuthUserCompatService, legacyNextIdentitySyncService) {
        this.legacyAuthService = legacyAuthService;
        this.legacyAuthUserCompatService = legacyAuthUserCompatService;
        this.legacyNextIdentitySyncService = legacyNextIdentitySyncService;
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
            this.legacyAuthUserCompatService.saveMemoryUser({
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
            const usernameConflict = await this.legacyAuthUserCompatService.ensureAvailable(normalizedUsername, 'account', {
                exclude: [{ kind: 'account', userId: user.id }],
            });
            if (usernameConflict) {
                throw new common_1.BadRequestException(usernameConflict);
            }
            const previousDisplayName = (0, legacy_account_validation_1.resolveDisplayName)(user.displayName, user.username);
            const nextDisplayName = (0, legacy_account_validation_1.resolveDisplayName)(user.displayName, normalizedUsername);
            if (nextDisplayName !== previousDisplayName) {
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
                displayNameChanged: nextDisplayName !== previousDisplayName,
                nextDisplayName,
            };
        });
        await this.legacyNextIdentitySyncService.syncIdentityByPlayerId(playerId).catch(() => undefined);
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
        this.legacyAuthUserCompatService.ensureLegacyHttpMemoryFallbackEnabled();
        return fallbackTask();
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
        this.legacyAuthUserCompatService.ensureLegacyHttpMemoryFallbackEnabled();
        const fallbackUserId = parseFallbackPlayerUserId(normalizedPlayerId);
        if (fallbackUserId) {
            return this.legacyAuthUserCompatService.findUserById(fallbackUserId);
        }
        return null;
    }
    resolveMemoryUserByPlayerId(playerId) {
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
function isMissingLegacySchemaError(error) {
    return Boolean(error && typeof error === 'object' && error.code === '42P01');
}
