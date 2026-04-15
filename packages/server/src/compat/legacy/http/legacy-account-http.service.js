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
exports.LegacyAccountHttpService = void 0;
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
/** player_runtime_service_1：定义该变量以承载业务值。 */
const player_runtime_service_1 = require("../../../runtime/player/player-runtime.service");
/** ALLOW_LEGACY_HTTP_MEMORY_FALLBACK_ENV_KEYS：定义该变量以承载业务值。 */
const ALLOW_LEGACY_HTTP_MEMORY_FALLBACK_ENV_KEYS = [
    'SERVER_NEXT_ALLOW_LEGACY_HTTP_MEMORY_FALLBACK',
    'NEXT_ALLOW_LEGACY_HTTP_MEMORY_FALLBACK',
];
/** LegacyAccountHttpService：定义该变量以承载业务值。 */
let LegacyAccountHttpService = class LegacyAccountHttpService {
    legacyAuthService;
    legacyAuthUserCompatService;
    legacyNextIdentitySyncService;
    playerRuntimeService;
/** 构造函数：执行实例初始化流程。 */
    constructor(legacyAuthService, legacyAuthUserCompatService, legacyNextIdentitySyncService, playerRuntimeService) {
        this.legacyAuthService = legacyAuthService;
        this.legacyAuthUserCompatService = legacyAuthUserCompatService;
        this.legacyNextIdentitySyncService = legacyNextIdentitySyncService;
        this.playerRuntimeService = playerRuntimeService;
    }
/** updatePassword：执行对应的业务逻辑。 */
    async updatePassword(authorization, currentPassword, newPassword) {
/** userId：定义该变量以承载业务值。 */
        const userId = this.requireUserId(authorization);
/** user：定义该变量以承载业务值。 */
        const user = await this.legacyAuthUserCompatService.findUserById(userId);
        if (!user) {
            throw new common_1.UnauthorizedException('用户不存在');
        }
        if (!await (0, legacy_password_hash_1.verifyPassword)(currentPassword, user.passwordHash)) {
            throw new common_1.BadRequestException('当前密码错误');
        }
/** passwordError：定义该变量以承载业务值。 */
        const passwordError = (0, legacy_account_validation_1.validatePassword)(newPassword);
        if (passwordError) {
            throw new common_1.BadRequestException(passwordError);
        }
/** passwordHash：定义该变量以承载业务值。 */
        const passwordHash = await (0, legacy_password_hash_1.hashPassword)(newPassword);
/** pool：定义该变量以承载业务值。 */
        const pool = await this.legacyAuthService.ensurePool();
        if (pool) {
            await pool.query('UPDATE users SET "passwordHash" = $2 WHERE id = $1', [userId, passwordHash]);
        }
        else {
            ensureLegacyHttpMemoryFallbackEnabled();
            this.legacyAuthUserCompatService.saveMemoryUser({
                ...user,
                passwordHash,
            });
        }
        return { ok: true };
    }
/** updateDisplayName：执行对应的业务逻辑。 */
    async updateDisplayName(authorization, displayName) {
/** userId：定义该变量以承载业务值。 */
        const userId = this.requireUserId(authorization);
/** user：定义该变量以承载业务值。 */
        const user = await this.legacyAuthUserCompatService.findUserById(userId);
        if (!user) {
            throw new common_1.UnauthorizedException('用户不存在');
        }
/** normalizedDisplayName：定义该变量以承载业务值。 */
        const normalizedDisplayName = (0, legacy_account_validation_1.normalizeDisplayName)(displayName);
/** displayNameError：定义该变量以承载业务值。 */
        const displayNameError = (0, legacy_account_validation_1.validateDisplayName)(normalizedDisplayName);
        if (displayNameError) {
            throw new common_1.BadRequestException(displayNameError);
        }
/** currentDisplayName：定义该变量以承载业务值。 */
        const currentDisplayName = (0, legacy_account_validation_1.resolveDisplayName)(user.displayName, user.username);
        if (normalizedDisplayName === currentDisplayName) {
            return { displayName: normalizedDisplayName };
        }
/** displayNameConflict：定义该变量以承载业务值。 */
        const displayNameConflict = await this.legacyAuthUserCompatService.ensureAvailable(normalizedDisplayName, 'display', {
            exclude: [{ userId, kind: 'display' }],
        });
        if (displayNameConflict) {
            throw new common_1.BadRequestException(displayNameConflict);
        }
/** pool：定义该变量以承载业务值。 */
        const pool = await this.legacyAuthService.ensurePool();
        if (pool) {
            try {
                await pool.query('UPDATE users SET "displayName" = $2 WHERE id = $1', [userId, normalizedDisplayName]);
            }
            catch (error) {
                if (isUniqueViolation(error)) {
                    throw new common_1.BadRequestException('显示名已被占用');
                }
                throw error;
            }
        }
        else {
            ensureLegacyHttpMemoryFallbackEnabled();
            this.legacyAuthUserCompatService.saveMemoryUser({
                ...user,
                displayName: normalizedDisplayName,
            });
        }
        await this.legacyNextIdentitySyncService.syncIdentityByUserId(userId).catch(() => undefined);
        await this.legacyNextIdentitySyncService.patchPersistedIdentity(userId, { displayName: normalizedDisplayName }).catch(() => undefined);
        await this.syncRuntimeDisplayName(userId, normalizedDisplayName);
        return { displayName: normalizedDisplayName };
    }
/** updateRoleName：执行对应的业务逻辑。 */
    async updateRoleName(authorization, roleName) {
/** userId：定义该变量以承载业务值。 */
        const userId = this.requireUserId(authorization);
/** pool：定义该变量以承载业务值。 */
        const pool = await this.legacyAuthService.ensurePool();
/** normalizedRoleName：定义该变量以承载业务值。 */
        const normalizedRoleName = (0, legacy_account_validation_1.normalizeRoleName)(roleName);
/** roleNameError：定义该变量以承载业务值。 */
        const roleNameError = (0, legacy_account_validation_1.validateRoleName)(normalizedRoleName);
        if (roleNameError) {
            throw new common_1.BadRequestException(roleNameError);
        }
        if (pool) {
/** user：定义该变量以承载业务值。 */
            const user = await this.legacyAuthUserCompatService.findUserById(userId);
            if (!user) {
                throw new common_1.UnauthorizedException('用户不存在');
            }
/** playerRecord：定义该变量以承载业务值。 */
            const playerRecord = await this.loadDatabasePlayerRecord(userId, pool);
/** currentRoleName：定义该变量以承载业务值。 */
            const currentRoleName = (0, legacy_account_validation_1.normalizeRoleName)(playerRecord?.roleName ?? user.pendingRoleName);
            if (currentRoleName === normalizedRoleName) {
                return { roleName: normalizedRoleName };
            }
/** roleNameConflict：定义该变量以承载业务值。 */
            const roleNameConflict = await this.legacyAuthUserCompatService.ensureAvailable(normalizedRoleName, 'role', {
                exclude: [{ userId, kind: 'role' }],
            });
            if (roleNameConflict) {
                throw new common_1.BadRequestException(roleNameConflict);
            }
            await pool.query('UPDATE users SET "pendingRoleName" = $2 WHERE id = $1', [userId, normalizedRoleName]);
            if (playerRecord) {
                await pool.query('UPDATE players SET name = $2 WHERE "userId" = $1', [userId, normalizedRoleName]);
            }
            await this.legacyNextIdentitySyncService.syncIdentityByUserId(userId, { roleNameHint: normalizedRoleName }).catch(() => undefined);
            await this.legacyNextIdentitySyncService.patchPersistedIdentity(userId, { playerName: normalizedRoleName }).catch(() => undefined);
            this.syncRuntimeRoleName(playerRecord?.playerId ?? buildFallbackPlayerId(userId), normalizedRoleName);
            return { roleName: normalizedRoleName };
        }
        ensureLegacyHttpMemoryFallbackEnabled();
/** user：定义该变量以承载业务值。 */
        const user = await this.legacyAuthUserCompatService.findUserById(userId);
        if (!user) {
            throw new common_1.UnauthorizedException('用户不存在');
        }
        if ((0, legacy_account_validation_1.normalizeRoleName)(user.pendingRoleName) === normalizedRoleName) {
            return { roleName: normalizedRoleName };
        }
/** roleNameConflict：定义该变量以承载业务值。 */
        const roleNameConflict = await this.legacyAuthUserCompatService.ensureAvailable(normalizedRoleName, 'role', {
            exclude: [{ userId, kind: 'role' }],
        });
        if (roleNameConflict) {
            throw new common_1.BadRequestException(roleNameConflict);
        }
        this.legacyAuthUserCompatService.saveMemoryUser({
            ...user,
            pendingRoleName: normalizedRoleName,
        });
        await this.legacyNextIdentitySyncService.syncIdentityByUserId(userId, { roleNameHint: normalizedRoleName }).catch(() => undefined);
        await this.legacyNextIdentitySyncService.patchPersistedIdentity(userId, { playerName: normalizedRoleName }).catch(() => undefined);
        this.syncRuntimeRoleName(buildFallbackPlayerId(userId), normalizedRoleName);
        return { roleName: normalizedRoleName };
    }
/** requireUserId：执行对应的业务逻辑。 */
    requireUserId(authorization) {
/** token：定义该变量以承载业务值。 */
        const token = typeof authorization === 'string' && authorization.startsWith('Bearer ')
            ? authorization.slice('Bearer '.length).trim()
            : '';
        if (!token) {
            throw new common_1.UnauthorizedException('未登录');
        }
/** payload：定义该变量以承载业务值。 */
        const payload = this.legacyAuthService.validateToken(token);
        if (!payload) {
            throw new common_1.UnauthorizedException('登录已失效');
        }
        return payload.sub;
    }
/** syncRuntimeDisplayName：执行对应的业务逻辑。 */
    async syncRuntimeDisplayName(userId, displayName) {
/** runtimePlayerId：定义该变量以承载业务值。 */
        const runtimePlayerId = await this.resolveRuntimePlayerId(userId);
        if (!runtimePlayerId) {
            return;
        }
        if (!this.playerRuntimeService.snapshot(runtimePlayerId)) {
            return;
        }
        this.playerRuntimeService.setIdentity(runtimePlayerId, { displayName });
    }
/** syncRuntimeRoleName：执行对应的业务逻辑。 */
    syncRuntimeRoleName(playerId, roleName) {
/** runtime：定义该变量以承载业务值。 */
        const runtime = this.playerRuntimeService.snapshot(playerId);
        if (!runtime) {
            return;
        }
        this.playerRuntimeService.setIdentity(playerId, {
            name: roleName,
            displayName: runtime.displayName,
        });
    }
/** resolveRuntimePlayerId：执行对应的业务逻辑。 */
    async resolveRuntimePlayerId(userId) {
/** pool：定义该变量以承载业务值。 */
        const pool = await this.legacyAuthService.ensurePool();
        if (!pool) {
            return buildFallbackPlayerId(userId);
        }
/** playerRecord：定义该变量以承载业务值。 */
        const playerRecord = await this.loadDatabasePlayerRecord(userId, pool);
        return playerRecord?.playerId ?? buildFallbackPlayerId(userId);
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
exports.LegacyAccountHttpService = LegacyAccountHttpService;
exports.LegacyAccountHttpService = LegacyAccountHttpService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [legacy_auth_service_1.LegacyAuthService,
        legacy_auth_user_compat_service_1.LegacyAuthUserCompatService,
        legacy_next_identity_sync_service_1.LegacyNextIdentitySyncService,
        player_runtime_service_1.PlayerRuntimeService])
], LegacyAccountHttpService);
/** buildFallbackPlayerId：执行对应的业务逻辑。 */
function buildFallbackPlayerId(userId) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = typeof userId === 'string' ? userId.trim() : '';
    return normalized ? `p_${normalized}` : 'p_guest';
}
/** ensureLegacyHttpMemoryFallbackEnabled：执行对应的业务逻辑。 */
function ensureLegacyHttpMemoryFallbackEnabled() {
    for (const key of ALLOW_LEGACY_HTTP_MEMORY_FALLBACK_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
        if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
            return;
        }
    }
    throw new common_1.ServiceUnavailableException('legacy HTTP 内存兼容已关闭');
}
/** isUniqueViolation：执行对应的业务逻辑。 */
function isUniqueViolation(error) {
    return Boolean(error && typeof error === 'object' && error.code === '23505');
}
