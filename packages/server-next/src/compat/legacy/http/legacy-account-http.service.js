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
exports.LegacyAccountHttpService = void 0;
const common_1 = require("@nestjs/common");
const legacy_account_validation_1 = require("../legacy-account-validation");
const legacy_password_hash_1 = require("../legacy-password-hash");
const legacy_auth_service_1 = require("../legacy-auth.service");
const legacy_auth_http_service_1 = require("./legacy-auth-http.service");
const player_runtime_service_1 = require("../../../runtime/player/player-runtime.service");
let LegacyAccountHttpService = class LegacyAccountHttpService {
    legacyAuthService;
    legacyAuthHttpService;
    playerRuntimeService;
    constructor(legacyAuthService, legacyAuthHttpService, playerRuntimeService) {
        this.legacyAuthService = legacyAuthService;
        this.legacyAuthHttpService = legacyAuthHttpService;
        this.playerRuntimeService = playerRuntimeService;
    }
    async updatePassword(authorization, currentPassword, newPassword) {
        const userId = this.requireUserId(authorization);
        const user = await this.legacyAuthHttpService.findUserById(userId);
        if (!user) {
            throw new common_1.UnauthorizedException('用户不存在');
        }
        if (!await (0, legacy_password_hash_1.verifyPassword)(currentPassword, user.passwordHash)) {
            throw new common_1.BadRequestException('当前密码错误');
        }
        const passwordError = (0, legacy_account_validation_1.validatePassword)(newPassword);
        if (passwordError) {
            throw new common_1.BadRequestException(passwordError);
        }
        const passwordHash = await (0, legacy_password_hash_1.hashPassword)(newPassword);
        const pool = await this.legacyAuthService.ensurePool();
        if (pool) {
            await pool.query('UPDATE users SET "passwordHash" = $2 WHERE id = $1', [userId, passwordHash]);
        }
        else {
            this.legacyAuthHttpService.saveMemoryUser({
                ...user,
                passwordHash,
            });
        }
        return { ok: true };
    }
    async updateDisplayName(authorization, displayName) {
        const userId = this.requireUserId(authorization);
        const user = await this.legacyAuthHttpService.findUserById(userId);
        if (!user) {
            throw new common_1.UnauthorizedException('用户不存在');
        }
        const normalizedDisplayName = (0, legacy_account_validation_1.normalizeDisplayName)(displayName);
        const displayNameError = (0, legacy_account_validation_1.validateDisplayName)(normalizedDisplayName);
        if (displayNameError) {
            throw new common_1.BadRequestException(displayNameError);
        }
        const currentDisplayName = (0, legacy_account_validation_1.resolveDisplayName)(user.displayName, user.username);
        if (normalizedDisplayName === currentDisplayName) {
            return { displayName: normalizedDisplayName };
        }
        const displayNameConflict = await this.legacyAuthHttpService.ensureAvailable(normalizedDisplayName, 'display', {
            exclude: [{ userId, kind: 'display' }],
        });
        if (displayNameConflict) {
            throw new common_1.BadRequestException(displayNameConflict);
        }
        const pool = await this.legacyAuthService.ensurePool();
        if (pool) {
            await pool.query('UPDATE users SET "displayName" = $2 WHERE id = $1', [userId, normalizedDisplayName]);
        }
        else {
            this.legacyAuthHttpService.saveMemoryUser({
                ...user,
                displayName: normalizedDisplayName,
            });
        }
        await this.syncRuntimeDisplayName(userId, normalizedDisplayName);
        return { displayName: normalizedDisplayName };
    }
    async updateRoleName(authorization, roleName) {
        const userId = this.requireUserId(authorization);
        const pool = await this.legacyAuthService.ensurePool();
        const normalizedRoleName = (0, legacy_account_validation_1.normalizeRoleName)(roleName);
        const roleNameError = (0, legacy_account_validation_1.validateRoleName)(normalizedRoleName);
        if (roleNameError) {
            throw new common_1.BadRequestException(roleNameError);
        }
        if (pool) {
            const playerRecord = await this.loadDatabasePlayerRecord(userId, pool);
            if (!playerRecord) {
                throw new common_1.UnauthorizedException('角色不存在');
            }
            if ((0, legacy_account_validation_1.normalizeRoleName)(playerRecord.roleName) === normalizedRoleName) {
                return { roleName: normalizedRoleName };
            }
            const roleNameConflict = await this.legacyAuthHttpService.ensureAvailable(normalizedRoleName, 'role', {
                exclude: [{ userId, kind: 'role' }],
            });
            if (roleNameConflict) {
                throw new common_1.BadRequestException(roleNameConflict);
            }
            await pool.query('UPDATE players SET name = $2 WHERE "userId" = $1', [userId, normalizedRoleName]);
            this.syncRuntimeRoleName(playerRecord.playerId, normalizedRoleName);
            return { roleName: normalizedRoleName };
        }
        const user = await this.legacyAuthHttpService.findUserById(userId);
        if (!user) {
            throw new common_1.UnauthorizedException('用户不存在');
        }
        if ((0, legacy_account_validation_1.normalizeRoleName)(user.pendingRoleName) === normalizedRoleName) {
            return { roleName: normalizedRoleName };
        }
        const roleNameConflict = await this.legacyAuthHttpService.ensureAvailable(normalizedRoleName, 'role', {
            exclude: [{ userId, kind: 'role' }],
        });
        if (roleNameConflict) {
            throw new common_1.BadRequestException(roleNameConflict);
        }
        this.legacyAuthHttpService.saveMemoryUser({
            ...user,
            pendingRoleName: normalizedRoleName,
        });
        this.syncRuntimeRoleName(buildFallbackPlayerId(userId), normalizedRoleName);
        return { roleName: normalizedRoleName };
    }
    requireUserId(authorization) {
        const token = typeof authorization === 'string' && authorization.startsWith('Bearer ')
            ? authorization.slice('Bearer '.length).trim()
            : '';
        if (!token) {
            throw new common_1.UnauthorizedException('未登录');
        }
        const payload = this.legacyAuthService.validateToken(token);
        if (!payload) {
            throw new common_1.UnauthorizedException('登录已失效');
        }
        return payload.sub;
    }
    async syncRuntimeDisplayName(userId, displayName) {
        const runtimePlayerId = await this.resolveRuntimePlayerId(userId);
        if (!runtimePlayerId) {
            return;
        }
        if (!this.playerRuntimeService.snapshot(runtimePlayerId)) {
            return;
        }
        this.playerRuntimeService.setIdentity(runtimePlayerId, { displayName });
    }
    syncRuntimeRoleName(playerId, roleName) {
        const runtime = this.playerRuntimeService.snapshot(playerId);
        if (!runtime) {
            return;
        }
        this.playerRuntimeService.setIdentity(playerId, {
            name: roleName,
            displayName: runtime.displayName,
        });
    }
    async resolveRuntimePlayerId(userId) {
        const pool = await this.legacyAuthService.ensurePool();
        if (!pool) {
            return buildFallbackPlayerId(userId);
        }
        const playerRecord = await this.loadDatabasePlayerRecord(userId, pool);
        return playerRecord?.playerId ?? buildFallbackPlayerId(userId);
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
};
exports.LegacyAccountHttpService = LegacyAccountHttpService;
exports.LegacyAccountHttpService = LegacyAccountHttpService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [legacy_auth_service_1.LegacyAuthService,
        legacy_auth_http_service_1.LegacyAuthHttpService,
        player_runtime_service_1.PlayerRuntimeService])
], LegacyAccountHttpService);
function buildFallbackPlayerId(userId) {
    const normalized = typeof userId === 'string' ? userId.trim() : '';
    return normalized ? `p_${normalized}` : 'p_guest';
}
