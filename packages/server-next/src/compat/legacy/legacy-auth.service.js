"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var LegacyAuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyAuthService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared-next");
const node_crypto_1 = require("node:crypto");
const node_path_1 = require("node:path");
const pg_1 = require("pg");
let LegacyAuthService = LegacyAuthService_1 = class LegacyAuthService {
    logger = new common_1.Logger(LegacyAuthService_1.name);
    jwtSecret = process.env.JWT_SECRET || 'daojie-yusheng-dev-secret';
    pool = null;
    poolInitPromise = null;
    poolUnavailable = false;
    poolUnavailableLogged = false;
    async onModuleInit() {
        await this.ensurePool();
    }
    async onModuleDestroy() {
        const pool = this.pool;
        this.pool = null;
        this.poolInitPromise = null;
        if (pool) {
            await pool.end().catch(() => undefined);
        }
    }
    async authenticateSocketToken(token) {
        const payload = this.validateToken(token);
        if (!payload) {
            return null;
        }
        const pool = await this.ensurePool();
        if (!pool) {
            return {
                userId: payload.sub,
                username: payload.username,
                displayName: resolveDisplayName(null, payload.username, payload.displayName),
                playerId: buildFallbackPlayerId(payload.sub),
                playerName: resolvePlayerName(null, payload.username, payload.displayName),
            };
        }
        let result;
        try {
            result = await pool.query(`
        SELECT
          u.id AS "userId",
          u.username AS "username",
          u."displayName" AS "displayName",
          u."pendingRoleName" AS "pendingRoleName",
          p.id AS "playerId",
          p.name AS "playerName"
        FROM users u
        LEFT JOIN players p ON p."userId" = u.id
        WHERE u.id::text = $1
        LIMIT 1
      `, [payload.sub]);
        }
        catch (error) {
            if (isMissingLegacySchemaError(error)) {
                this.logger.warn('Legacy auth socket fallback: users/players tables unavailable, using token identity');
                return {
                    userId: payload.sub,
                    username: payload.username,
                    displayName: resolveDisplayName(null, payload.username, payload.displayName),
                    playerId: buildFallbackPlayerId(payload.sub),
                    playerName: resolvePlayerName(null, payload.username, payload.displayName),
                };
            }
            throw error;
        }
        const row = result.rows[0];
        return {
            userId: row?.userId ?? payload.sub,
            username: row?.username ?? payload.username,
            displayName: resolveDisplayName(row?.displayName, row?.username ?? payload.username, payload.displayName),
            playerId: row?.playerId ?? buildFallbackPlayerId(payload.sub),
            playerName: resolvePlayerName(row?.playerName ?? row?.pendingRoleName ?? null, row?.username ?? payload.username, payload.displayName),
        };
    }
    async loadLegacyPlayerSnapshot(playerId) {
        const pool = await this.ensurePool();
        if (!pool) {
            return null;
        }
        let result;
        try {
            result = await pool.query(`
        SELECT
          id,
          "mapId",
          x,
          y,
          facing,
          hp,
          "maxHp",
          qi,
          "pendingLogbookMessages",
          inventory,
          "temporaryBuffs",
          equipment,
          techniques,
          quests,
          bonuses,
          foundation,
          "combatExp",
          "boneAgeBaseYears",
          "lifeElapsedTicks",
          "lifespanYears",
          "heavenGate",
          "spiritualRoots",
          "unlockedMinimapIds",
          "autoBattle",
          "autoBattleSkills",
          "combatTargetId",
          "combatTargetLocked",
          "autoRetaliate",
          "autoBattleStationary",
          "allowAoePlayerHit",
          "autoIdleCultivation",
          "autoSwitchCultivation",
          "cultivatingTechId"
        FROM players
        WHERE id = $1
        LIMIT 1
      `, [playerId]);
        }
        catch (error) {
            if (isMissingLegacySchemaError(error)) {
                return null;
            }
            throw error;
        }
        const row = result.rows[0];
        if (!row) {
            return null;
        }
        return toLegacyPlayerSnapshot(row);
    }
    async login(loginName, password) {
        const normalizedLoginName = normalizeUsername(loginName).trim();
        const normalizedPassword = typeof password === 'string' ? password : '';
        const loginNameError = validateUsername(normalizedLoginName);
        if (loginNameError) {
            throw new common_1.BadRequestException(loginNameError);
        }
        const pool = await this.requirePoolForHttpAuth();
        const candidates = await this.findUsersByLoginName(pool, normalizedLoginName);
        if (candidates.length === 0) {
            throw new common_1.UnauthorizedException('用户不存在');
        }
        const matched = [];
        for (const candidate of candidates) {
            if (await verifyPasswordHash(normalizedPassword, candidate.passwordHash)) {
                matched.push(candidate);
            }
        }
        if (matched.length === 0) {
            throw new common_1.UnauthorizedException('密码错误');
        }
        const directMatch = matched.find((entry) => entry.username === normalizedLoginName);
        if (directMatch) {
            return this.issueAuthTokens(directMatch);
        }
        if (matched.length === 1) {
            return this.issueAuthTokens(matched[0]);
        }
        throw new common_1.BadRequestException('该角色名对应多个账号，请改用账号登录');
    }
    async register(accountName, password, displayName, roleName) {
        const normalizedUsername = normalizeUsername(accountName);
        const normalizedDisplayName = normalizeDisplayName(displayName);
        const normalizedRoleName = normalizeRoleName(roleName || buildDefaultRoleName(accountName));
        const usernameError = validateUsername(normalizedUsername);
        if (usernameError) {
            throw new common_1.BadRequestException(usernameError);
        }
        const passwordError = validatePassword(password);
        if (passwordError) {
            throw new common_1.BadRequestException(passwordError);
        }
        const displayNameError = validateDisplayName(normalizedDisplayName);
        if (displayNameError) {
            throw new common_1.BadRequestException(displayNameError);
        }
        const roleNameError = validateRoleName(normalizedRoleName);
        if (roleNameError) {
            throw new common_1.BadRequestException(roleNameError);
        }
        const pool = await this.requirePoolForHttpAuth();
        const usernameConflict = await this.ensureNameAvailable(pool, normalizedUsername, 'account');
        if (usernameConflict) {
            throw new common_1.BadRequestException(usernameConflict);
        }
        const roleNameConflict = await this.ensureNameAvailable(pool, normalizedRoleName, 'role');
        if (roleNameConflict) {
            throw new common_1.BadRequestException(roleNameConflict);
        }
        const displayNameConflict = await this.ensureNameAvailable(pool, normalizedDisplayName, 'display');
        if (displayNameConflict) {
            throw new common_1.BadRequestException(displayNameConflict);
        }
        const userId = (0, node_crypto_1.randomUUID)();
        const passwordHash = await hashPassword(typeof password === 'string' ? password : '');
        try {
            await pool.query(`
        INSERT INTO users(id, username, "displayName", "pendingRoleName", "passwordHash")
        VALUES ($1, $2, $3, $4, $5)
      `, [userId, normalizedUsername, normalizedDisplayName, normalizedRoleName, passwordHash]);
        }
        catch (error) {
            if (isUniqueViolation(error)) {
                const fallbackConflict = await this.ensureNameAvailable(pool, normalizedUsername, 'account')
                    ?? await this.ensureNameAvailable(pool, normalizedRoleName, 'role')
                    ?? await this.ensureNameAvailable(pool, normalizedDisplayName, 'display')
                    ?? '账号已存在';
                throw new common_1.BadRequestException(fallbackConflict);
            }
            throw error;
        }
        return this.issueAuthTokens({
            userId,
            username: normalizedUsername,
            displayName: normalizedDisplayName,
            pendingRoleName: normalizedRoleName,
            playerId: buildFallbackPlayerId(userId),
            playerName: normalizedRoleName,
            passwordHash,
        });
    }
    async refresh(refreshToken) {
        const payload = this.validateRefreshToken(refreshToken);
        if (!payload) {
            throw new common_1.UnauthorizedException('刷新令牌无效或已过期');
        }
        const pool = await this.requirePoolForHttpAuth();
        const user = await this.findUserById(pool, payload.sub);
        if (!user) {
            throw new common_1.UnauthorizedException('用户不存在');
        }
        return this.issueAuthTokens(user);
    }
    async checkDisplayNameAvailability(displayName) {
        const normalizedDisplayName = normalizeDisplayName(displayName);
        const error = validateDisplayName(normalizedDisplayName);
        if (error) {
            return { available: false, message: error };
        }
        const pool = await this.requirePoolForHttpAuth();
        const conflict = await this.ensureNameAvailable(pool, normalizedDisplayName, 'display');
        if (conflict) {
            return { available: false, message: conflict };
        }
        return { available: true };
    }
    async updateManagedPlayerPassword(playerId, newPassword) {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            throw new common_1.BadRequestException('缺少玩家 ID');
        }
        const passwordError = validatePassword(typeof newPassword === 'string' ? newPassword : '');
        if (passwordError) {
            throw new common_1.BadRequestException(passwordError);
        }
        const pool = await this.requirePoolForHttpAuth();
        const user = await this.findUserByPlayerId(pool, normalizedPlayerId);
        if (!user) {
            throw new common_1.NotFoundException('目标玩家不存在');
        }
        const passwordHash = await hashPassword(typeof newPassword === 'string' ? newPassword : '');
        await pool.query('UPDATE users SET "passwordHash" = $2 WHERE id = $1', [user.userId, passwordHash]);
    }
    async updateManagedPlayerAccount(playerId, username) {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            throw new common_1.BadRequestException('缺少玩家 ID');
        }
        const normalizedUsername = normalizeUsername(username);
        const usernameError = validateUsername(normalizedUsername);
        if (usernameError) {
            throw new common_1.BadRequestException(usernameError);
        }
        const pool = await this.requirePoolForHttpAuth();
        const user = await this.findUserByPlayerId(pool, normalizedPlayerId);
        if (!user) {
            throw new common_1.NotFoundException('目标玩家不存在');
        }
        const previousDisplayName = resolveDisplayName(user.displayName, user.username);
        if (normalizedUsername === user.username) {
            return {
                username: normalizedUsername,
                displayNameChanged: false,
                nextDisplayName: previousDisplayName,
            };
        }
        const usernameConflict = await this.ensureNameAvailable(pool, normalizedUsername, 'account', {
            exclude: [{ userId: user.userId, kind: 'account' }],
        });
        if (usernameConflict) {
            throw new common_1.BadRequestException(usernameConflict);
        }
        const nextDisplayName = resolveDisplayName(user.displayName, normalizedUsername);
        if (nextDisplayName !== previousDisplayName) {
            const displayNameConflict = await this.ensureNameAvailable(pool, nextDisplayName, 'display', {
                exclude: [{ userId: user.userId, kind: 'display' }],
            });
            if (displayNameConflict) {
                throw new common_1.BadRequestException(displayNameConflict);
            }
        }
        await pool.query('UPDATE users SET username = $2 WHERE id = $1', [user.userId, normalizedUsername]);
        return {
            username: normalizedUsername,
            displayNameChanged: nextDisplayName !== previousDisplayName,
            nextDisplayName,
        };
    }
    async getManagedAccountIndex(playerIds) {
        const normalizedPlayerIds = Array.from(new Set(Array.from(playerIds)
            .filter((playerId) => typeof playerId === 'string')
            .map((playerId) => playerId.trim())
            .filter((playerId) => playerId.length > 0)));
        const result = new Map();
        if (normalizedPlayerIds.length === 0) {
            return result;
        }
        const pool = await this.ensurePool();
        if (!pool) {
            return result;
        }
        let direct;
        try {
            direct = await pool.query(`
      SELECT
        p.id AS "playerId",
        p.name AS "playerName",
        u.id AS "userId",
        u.username AS "username",
        u."displayName" AS "displayName",
        u."createdAt" AS "createdAt",
        u."totalOnlineSeconds" AS "totalOnlineSeconds",
        u."currentOnlineStartedAt" AS "currentOnlineStartedAt"
      FROM players p
      INNER JOIN users u ON u.id = p."userId"
      WHERE p.id = ANY($1::varchar[])
    `, [normalizedPlayerIds]);
        }
        catch (error) {
            if (isMissingLegacySchemaError(error)) {
                return result;
            }
            throw error;
        }
        for (const row of direct.rows) {
            const record = normalizeManagedAccountRecord(row);
            if (record) {
                result.set(record.playerId, record);
            }
        }
        const fallbackUserIds = [];
        for (const playerId of normalizedPlayerIds) {
            if (result.has(playerId)) {
                continue;
            }
            const userId = parseFallbackPlayerUserId(playerId);
            if (userId) {
                fallbackUserIds.push(userId);
            }
        }
        if (fallbackUserIds.length === 0) {
            return result;
        }
        let fallback;
        try {
            fallback = await pool.query(`
      SELECT
        id AS "userId",
        username AS "username",
        "displayName" AS "displayName",
        "createdAt" AS "createdAt",
        "totalOnlineSeconds" AS "totalOnlineSeconds",
        "currentOnlineStartedAt" AS "currentOnlineStartedAt"
      FROM users
      WHERE id::text = ANY($1::varchar[])
    `, [Array.from(new Set(fallbackUserIds))]);
        }
        catch (error) {
            if (isMissingLegacySchemaError(error)) {
                return result;
            }
            throw error;
        }
        for (const row of fallback.rows) {
            const record = normalizeManagedAccountRecord({
                ...row,
                playerId: buildFallbackPlayerId(row.userId),
                playerName: null,
            });
            if (record) {
                result.set(record.playerId, record);
            }
        }
        return result;
    }
    validateToken(token) {
        try {
            const payload = verifyLegacyJwt(token, this.jwtSecret);
            if (!payload || payload.role === 'gm') {
                return null;
            }
            if (payload.kind === 'refresh' || payload.scope === 'refresh') {
                return null;
            }
            if (typeof payload.sub !== 'string' || typeof payload.username !== 'string') {
                return null;
            }
            return payload;
        }
        catch {
            return null;
        }
    }
    async ensurePool() {
        if (this.poolUnavailable) {
            return null;
        }
        if (this.pool) {
            return this.pool;
        }
        if (this.poolInitPromise) {
            return this.poolInitPromise;
        }
        const databaseUrl = process.env.SERVER_NEXT_DATABASE_URL
            ?? '';
        if (!databaseUrl.trim()) {
            this.poolUnavailable = true;
            if (!this.poolUnavailableLogged) {
                this.poolUnavailableLogged = true;
                this.logger.warn('Legacy auth degraded: no SERVER_NEXT_DATABASE_URL, fallback to token-only identity');
            }
            return null;
        }
        this.poolInitPromise = (async () => {
            const pool = new pg_1.Pool({ connectionString: databaseUrl });
            try {
                await pool.query('SELECT 1');
                this.pool = pool;
                return pool;
            }
            catch (error) {
                this.poolUnavailable = true;
                this.logger.error('Legacy auth database init failed', error instanceof Error ? error.stack : String(error));
                await pool.end().catch(() => undefined);
                return null;
            }
            finally {
                this.poolInitPromise = null;
            }
        })();
        return this.poolInitPromise;
    }
    validateRefreshToken(token) {
        try {
            const payload = verifyLegacyJwt(token, this.jwtSecret);
            if (!payload || payload.role === 'gm' || payload.kind !== 'refresh') {
                return null;
            }
            if (typeof payload.sub !== 'string' || typeof payload.username !== 'string') {
                return null;
            }
            return payload;
        }
        catch {
            return null;
        }
    }
    async requirePoolForHttpAuth() {
        const pool = await this.ensurePool();
        if (!pool) {
            throw new common_1.ServiceUnavailableException('旧账号数据库未启用');
        }
        return pool;
    }
    async findUsersByLoginName(pool, loginName) {
        const result = await pool.query(`
      SELECT
        u.id AS "userId",
        u.username AS "username",
        u."displayName" AS "displayName",
        u."pendingRoleName" AS "pendingRoleName",
        u."passwordHash" AS "passwordHash",
        p.id AS "playerId",
        p.name AS "playerName"
      FROM users u
      LEFT JOIN players p ON p."userId" = u.id
      WHERE u.username = $1 OR u."pendingRoleName" = $1 OR p.name = $1
    `, [loginName]);
        return result.rows
            .map(normalizeLegacyUserRecord)
            .filter((entry) => entry !== null);
    }
    async findUserById(pool, userId) {
        const result = await pool.query(`
      SELECT
        u.id AS "userId",
        u.username AS "username",
        u."displayName" AS "displayName",
        u."pendingRoleName" AS "pendingRoleName",
        u."passwordHash" AS "passwordHash",
        p.id AS "playerId",
        p.name AS "playerName"
      FROM users u
      LEFT JOIN players p ON p."userId" = u.id
      WHERE u.id::text = $1
      LIMIT 1
    `, [userId]);
        return normalizeLegacyUserRecord(result.rows[0]);
    }
    async findUserByPlayerId(pool, playerId) {
        const result = await pool.query(`
      SELECT
        u.id AS "userId",
        u.username AS "username",
        u."displayName" AS "displayName",
        u."pendingRoleName" AS "pendingRoleName",
        u."passwordHash" AS "passwordHash",
        p.id AS "playerId",
        p.name AS "playerName"
      FROM players p
      INNER JOIN users u ON u.id = p."userId"
      WHERE p.id = $1
      LIMIT 1
    `, [playerId]);
        const direct = normalizeLegacyUserRecord(result.rows[0]);
        if (direct) {
            return direct;
        }
        const fallbackUserId = parseFallbackPlayerUserId(playerId);
        if (!fallbackUserId) {
            return null;
        }
        return this.findUserById(pool, fallbackUserId);
    }
    issueAuthTokens(user) {
        const displayName = resolveDisplayName(user.displayName, user.username);
        return {
            accessToken: issueLegacyJwt(this.jwtSecret, {
                sub: user.userId,
                username: user.username,
                displayName,
                kind: 'access',
            }, 15 * 60),
            refreshToken: issueLegacyJwt(this.jwtSecret, {
                sub: user.userId,
                username: user.username,
                displayName,
                kind: 'refresh',
            }, 30 * 24 * 60 * 60),
        };
    }
    async ensureNameAvailable(pool, value, requestedKind, options = {}) {
        const conflict = await this.findNameConflict(pool, value, requestedKind, options);
        if (!conflict) {
            return null;
        }
        return buildConflictMessage(requestedKind, conflict.kind);
    }
    async findNameConflict(pool, value, requestedKind, options = {}) {
        if (!value) {
            return null;
        }
        const conflicts = [];
        if (requestedKind === 'account') {
            const users = await pool.query(`
          SELECT
            id,
            username
          FROM users
          WHERE username = $1
        `, [value]);
            for (const row of users.rows) {
                const userId = typeof row?.id === 'string' ? row.id : '';
                if (!userId) {
                    continue;
                }
                if (normalizeUsername(row.username) === value) {
                    conflicts.push({ kind: 'account', userId });
                }
            }
        }
        else if (requestedKind === 'role') {
            const [users, players] = await Promise.all([
                pool.query(`
            SELECT
              id,
              "pendingRoleName"
            FROM users
            WHERE "pendingRoleName" = $1
          `, [value]),
                pool.query(`
            SELECT
              "userId",
              name
            FROM players
            WHERE name = $1
          `, [value]),
            ]);
            for (const row of users.rows) {
                const userId = typeof row?.id === 'string' ? row.id : '';
                if (!userId) {
                    continue;
                }
                if (normalizeRoleName(row.pendingRoleName) === value) {
                    conflicts.push({ kind: 'role', userId });
                }
            }
            for (const row of players.rows) {
                const userId = typeof row?.userId === 'string' ? row.userId : '';
                if (!userId) {
                    continue;
                }
                if (normalizeRoleName(row.name) === value) {
                    conflicts.push({ kind: 'role', userId });
                }
            }
        }
        else {
            const users = await pool.query(`
          SELECT
            id,
            username,
            "displayName"
          FROM users
          WHERE "displayName" = $1
            OR ("displayName" IS NULL AND LEFT(username, 1) = $1)
        `, [value]);
            for (const row of users.rows) {
                const userId = typeof row?.id === 'string' ? row.id : '';
                if (!userId) {
                    continue;
                }
                if (resolveDisplayName(row.displayName, row.username) === value) {
                    conflicts.push({ kind: 'display', userId });
                }
            }
        }
        const exclude = Array.isArray(options.exclude) ? options.exclude : [];
        return conflicts.find((entry) => !exclude.some((candidate) => candidate.kind === entry.kind && candidate.userId === entry.userId)) ?? null;
    }
};
exports.LegacyAuthService = LegacyAuthService;
exports.LegacyAuthService = LegacyAuthService = LegacyAuthService_1 = __decorate([
    (0, common_1.Injectable)()
], LegacyAuthService);
function resolveDisplayName(displayName, username, fallback) {
    const normalized = typeof displayName === 'string' ? displayName.normalize('NFC') : '';
    if (normalized) {
        return normalized;
    }
    if (typeof fallback === 'string' && fallback.trim()) {
        return fallback;
    }
    return [...username.normalize('NFC')][0] ?? username;
}
function resolvePlayerName(playerName, username, fallback) {
    const normalized = typeof playerName === 'string' ? playerName.trim().normalize('NFC') : '';
    if (normalized) {
        return normalized;
    }
    if (typeof fallback === 'string' && fallback.trim()) {
        return fallback.trim().normalize('NFC');
    }
    return username.normalize('NFC');
}
function buildFallbackPlayerId(userId) {
    const normalized = userId.trim();
    return normalized ? `p_${normalized}` : 'p_guest';
}
function parseFallbackPlayerUserId(playerId) {
    if (typeof playerId !== 'string' || !playerId.startsWith('p_')) {
        return null;
    }
    const userId = playerId.slice(2).trim();
    return userId || null;
}
function normalizeUsername(value) {
    return typeof value === 'string' ? value.normalize('NFC') : '';
}
function normalizeDisplayName(value) {
    return typeof value === 'string' ? value.normalize('NFC') : '';
}
function normalizeRoleName(value) {
    return typeof value === 'string' ? value.normalize('NFC').trim() : '';
}
function containsWhitespace(value) {
    return /\s/.test(value);
}
function buildDefaultRoleName(username) {
    return (0, shared_1.truncateRoleName)(normalizeUsername(username));
}
function validateUsername(username) {
    const normalized = normalizeUsername(username);
    const length = [...normalized].length;
    if (length < shared_1.ACCOUNT_MIN_LENGTH) {
        return `账号长度不能少于 ${shared_1.ACCOUNT_MIN_LENGTH} 个字符`;
    }
    if (length > shared_1.ACCOUNT_MAX_LENGTH) {
        return `账号长度不能超过 ${shared_1.ACCOUNT_MAX_LENGTH} 个字符`;
    }
    if (containsWhitespace(normalized)) {
        return '账号不支持空格';
    }
    return null;
}
function validatePassword(password) {
    if (typeof password !== 'string' || password.length < shared_1.PASSWORD_MIN_LENGTH) {
        return `密码长度不能少于 ${shared_1.PASSWORD_MIN_LENGTH} 个字符`;
    }
    if (containsWhitespace(password)) {
        return '密码不支持空格';
    }
    return null;
}
function validateDisplayName(displayName) {
    const normalized = normalizeDisplayName(displayName);
    if (!normalized) {
        return '显示名称不能为空';
    }
    if (containsWhitespace(normalized)) {
        return '显示名称不支持空格';
    }
    if ([...normalized].length !== 1) {
        return '显示名称必须为 1 个字符';
    }
    return null;
}
function validateRoleName(roleName) {
    const normalized = normalizeRoleName(roleName);
    if (!normalized) {
        return '角色名称不能为空';
    }
    if (!(0, shared_1.isRoleNameWithinLimit)(normalized)) {
        return `角色名称${(0, shared_1.getRoleNameLimitText)()}`;
    }
    return null;
}
function normalizeLegacyUserRecord(row) {
    if (!row || typeof row !== 'object') {
        return null;
    }
    const userId = typeof row.userId === 'string' ? row.userId.trim() : '';
    const username = normalizeUsername(row.username);
    const passwordHash = typeof row.passwordHash === 'string' ? row.passwordHash : '';
    if (!userId || !username || !passwordHash) {
        return null;
    }
    return {
        userId,
        username,
        displayName: typeof row.displayName === 'string' ? row.displayName : null,
        pendingRoleName: typeof row.pendingRoleName === 'string' ? row.pendingRoleName : null,
        passwordHash,
        playerId: typeof row.playerId === 'string' && row.playerId.trim() ? row.playerId.trim() : buildFallbackPlayerId(userId),
        playerName: typeof row.playerName === 'string' && row.playerName.trim()
            ? row.playerName.trim()
            : (typeof row.pendingRoleName === 'string' && row.pendingRoleName.trim() ? row.pendingRoleName.trim() : username),
    };
}
function normalizeManagedAccountRecord(row) {
    if (!row || typeof row !== 'object') {
        return null;
    }
    const playerId = typeof row.playerId === 'string' ? row.playerId.trim() : '';
    const userId = typeof row.userId === 'string' ? row.userId.trim() : '';
    const username = normalizeUsername(row.username);
    if (!playerId || !userId || !username) {
        return null;
    }
    return {
        playerId,
        playerName: typeof row.playerName === 'string' && row.playerName.trim() ? row.playerName.trim() : null,
        userId,
        username,
        displayName: typeof row.displayName === 'string' && row.displayName.trim() ? row.displayName : null,
        createdAt: normalizeTimestamp(row.createdAt),
        totalOnlineSeconds: Number.isFinite(row.totalOnlineSeconds) ? Math.max(0, Math.trunc(row.totalOnlineSeconds)) : 0,
        currentOnlineStartedAt: normalizeTimestamp(row.currentOnlineStartedAt),
    };
}
function normalizeTimestamp(value) {
    if (typeof value === 'string' && value.trim()) {
        return value;
    }
    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return value.toISOString();
    }
    return null;
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
async function verifyPasswordHash(password, passwordHash) {
    if (typeof password !== 'string' || typeof passwordHash !== 'string' || !passwordHash) {
        return false;
    }
    return loadLegacyBcrypt().compare(password, passwordHash);
}
async function hashPassword(password) {
    return loadLegacyBcrypt().hash(password, 10);
}
let cachedLegacyBcrypt = null;
function loadLegacyBcrypt() {
    if (cachedLegacyBcrypt) {
        return cachedLegacyBcrypt;
    }
    const bcryptModulePath = require.resolve('bcrypt', {
        paths: [
            (0, node_path_1.resolve)(__dirname, '../../../../server'),
        ],
    });
    cachedLegacyBcrypt = require(bcryptModulePath);
    return cachedLegacyBcrypt;
}
function isUniqueViolation(error) {
    return Boolean(error && typeof error === 'object' && error.code === '23505');
}
function isMissingLegacySchemaError(error) {
    return Boolean(error && typeof error === 'object' && error.code === '42P01');
}
function toLegacyPlayerSnapshot(row) {
    const inventory = normalizeInventory(row.inventory);
    const buffs = normalizeTemporaryBuffs(row.temporaryBuffs);
    const equipment = normalizeEquipment(row.equipment);
    const techniques = normalizeTechniques(row.techniques);
    const quests = normalizeQuests(row.quests);
    const unlockedMapIds = normalizeUnlockedMapIds(row.unlockedMinimapIds, row.mapId);
    return {
        version: 1,
        savedAt: Date.now(),
        placement: {
            templateId: typeof row.mapId === 'string' && row.mapId.trim() ? row.mapId : 'yunlai_town',
            x: toFiniteInt(row.x, 0),
            y: toFiniteInt(row.y, 0),
            facing: normalizeDirection(row.facing),
        },
        vitals: {
            hp: Math.max(0, toFiniteInt(row.hp, 100)),
            maxHp: Math.max(1, toFiniteInt(row.maxHp, 100)),
            qi: Math.max(0, toFiniteInt(row.qi, 0)),
            maxQi: 0,
        },
        progression: {
            foundation: Math.max(0, toFiniteInt(row.foundation, 0)),
            combatExp: Math.max(0, toFiniteInt(row.combatExp, 0)),
            bodyTraining: typeof row.bodyTraining === 'object' && row.bodyTraining ? row.bodyTraining : null,
            boneAgeBaseYears: Math.max(1, toFiniteInt(row.boneAgeBaseYears, shared_1.DEFAULT_BONE_AGE_YEARS)),
            lifeElapsedTicks: Math.max(0, toFiniteNumber(row.lifeElapsedTicks, 0)),
            lifespanYears: toNullablePositiveInt(row.lifespanYears),
            realm: normalizeLegacyRealmState(row.bonuses),
            heavenGate: normalizeHeavenGateState(row.heavenGate),
            spiritualRoots: normalizeHeavenGateRoots(row.spiritualRoots),
        },
        unlockedMapIds,
        inventory,
        equipment,
        techniques: {
            revision: 1,
            techniques,
            cultivatingTechId: typeof row.cultivatingTechId === 'string' && row.cultivatingTechId.trim()
                ? row.cultivatingTechId
                : null,
        },
        buffs: {
            revision: 1,
            buffs,
        },
        runtimeBonuses: normalizeRuntimeBonuses(row.bonuses),
        pendingLogbookMessages: normalizePendingLogbookMessages(row.pendingLogbookMessages),
        quests: {
            revision: 1,
            entries: quests,
        },
        combat: {
            autoBattle: row.autoBattle === true,
            combatTargetId: typeof row.combatTargetId === 'string' && row.combatTargetId.trim()
                ? row.combatTargetId.trim()
                : null,
            combatTargetLocked: row.combatTargetLocked === true
                && typeof row.combatTargetId === 'string'
                && row.combatTargetId.trim().length > 0,
            autoRetaliate: row.autoRetaliate !== false,
            autoBattleStationary: row.autoBattleStationary === true,
            allowAoePlayerHit: row.allowAoePlayerHit === true,
            autoIdleCultivation: row.autoIdleCultivation !== false,
            autoSwitchCultivation: row.autoSwitchCultivation === true,
            senseQiActive: false,
            autoBattleSkills: normalizeAutoBattleSkills(row.autoBattleSkills),
        },
    };
}
function normalizeInventory(value) {
    if (!value || typeof value !== 'object') {
        return {
            revision: 1,
            capacity: shared_1.DEFAULT_INVENTORY_CAPACITY,
            items: [],
        };
    }
    const inventory = value;
    return {
        revision: 1,
        capacity: Math.max(shared_1.DEFAULT_INVENTORY_CAPACITY, toFiniteInt(inventory.capacity, shared_1.DEFAULT_INVENTORY_CAPACITY)),
        items: Array.isArray(inventory.items)
            ? inventory.items.map(normalizeItem).filter((entry) => entry !== null)
            : [],
    };
}
function normalizeEquipment(value) {
    const equipment = value && typeof value === 'object'
        ? value
        : {};
    const slots = [];
    for (const slot of shared_1.EQUIP_SLOTS) {
        slots.push({
            slot,
            item: normalizeItem(equipment[slot]),
        });
    }
    return {
        revision: 1,
        slots,
    };
}
function normalizeTemporaryBuffs(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    const buffs = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
        const buff = entry;
        const buffId = typeof buff.buffId === 'string' ? buff.buffId.trim() : '';
        const name = typeof buff.name === 'string' ? buff.name.trim() : '';
        if (!buffId || !name) {
            continue;
        }
        buffs.push({
            ...buff,
            buffId,
            name,
            remainingTicks: Math.max(0, toFiniteInt(buff.remainingTicks, 0)),
            duration: Math.max(0, toFiniteInt(buff.duration, 0)),
            stacks: Math.max(1, toFiniteInt(buff.stacks, 1)),
            maxStacks: Math.max(1, toFiniteInt(buff.maxStacks, 1)),
        });
    }
    return buffs;
}
function normalizeTechniques(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    const techniques = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
        const technique = entry;
        const techId = typeof technique.techId === 'string' ? technique.techId.trim() : '';
        if (!techId) {
            continue;
        }
        techniques.push({
            techId,
            level: Math.max(1, toFiniteInt(technique.level, 1)),
            exp: Math.max(0, toFiniteInt(technique.exp, 0)),
            expToNext: Math.max(0, toFiniteInt(technique.expToNext, 0)),
            realmLv: Math.max(0, toFiniteInt(technique.realmLv, 0)),
            realm: normalizeTechniqueRealm(technique.realm),
            name: typeof technique.name === 'string' ? technique.name : undefined,
            grade: typeof technique.grade === 'string' ? technique.grade : undefined,
            category: typeof technique.category === 'string' ? technique.category : undefined,
            skills: Array.isArray(technique.skills) ? technique.skills.map((entry) => ({ ...entry })) : [],
            layers: Array.isArray(technique.layers)
                ? technique.layers.map((layer) => ({
                    level: Math.max(1, toFiniteInt(layer?.level, 1)),
                    expToNext: Math.max(0, toFiniteInt(layer?.expToNext, 0)),
                    attrs: layer?.attrs && typeof layer.attrs === 'object' ? { ...layer.attrs } : undefined,
                }))
                : undefined,
            attrCurves: technique.attrCurves && typeof technique.attrCurves === 'object' ? { ...technique.attrCurves } : undefined,
        });
    }
    techniques.sort((left, right) => left.techId.localeCompare(right.techId, 'zh-Hans-CN'));
    return techniques;
}
function normalizeQuests(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((entry) => Boolean(entry && typeof entry === 'object'))
        .map((entry) => ({
        ...entry,
        rewardItemIds: Array.isArray(entry.rewardItemIds) ? entry.rewardItemIds.slice() : [],
        rewards: Array.isArray(entry.rewards) ? entry.rewards.map((reward) => ({ ...reward })) : [],
    }));
}
function normalizeUnlockedMapIds(value, currentMapId) {
    const result = new Set();
    if (typeof currentMapId === 'string' && currentMapId.trim()) {
        result.add(currentMapId);
    }
    if (Array.isArray(value)) {
        for (const entry of value) {
            if (typeof entry === 'string' && entry.trim()) {
                result.add(entry);
            }
        }
    }
    return Array.from(result).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
}
function normalizeAutoBattleSkills(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    const result = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
        const config = entry;
        const skillId = typeof config.skillId === 'string' ? config.skillId.trim() : '';
        if (!skillId) {
            continue;
        }
        result.push({
            skillId,
            enabled: config.enabled !== false,
            skillEnabled: config.skillEnabled,
            autoBattleOrder: Number.isFinite(config.autoBattleOrder) ? Math.max(0, Math.trunc(config.autoBattleOrder)) : undefined,
        });
    }
    return result;
}
function normalizeItem(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const item = value;
    const itemId = typeof item.itemId === 'string' ? item.itemId.trim() : '';
    if (!itemId) {
        return null;
    }
    return {
        ...item,
        itemId,
        count: Math.max(1, toFiniteInt(item.count, 1)),
    };
}
function normalizeDirection(value) {
    if (typeof value === 'number' && value in shared_1.Direction) {
        return value;
    }
    return shared_1.Direction.South;
}
function normalizeTechniqueRealm(value) {
    if (typeof value === 'number' && value in shared_1.TechniqueRealm) {
        return value;
    }
    return undefined;
}
function toFiniteInt(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.trunc(value)
        : fallback;
}
function toFiniteNumber(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Number(value)
        : fallback;
}
function toNullablePositiveInt(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? Math.trunc(value)
        : null;
}
function normalizeLegacyRealmState(value) {
    if (!Array.isArray(value)) {
        return createRealmState();
    }
    const entry = value.find((bonus) => (bonus
        && typeof bonus === 'object'
        && (bonus.source === 'realm:state' || bonus.source === 'runtime:realm_state')));
    const stage = typeof entry?.meta?.stage === 'number' && entry.meta.stage in shared_1.PlayerRealmStage
        ? entry.meta.stage
        : shared_1.DEFAULT_PLAYER_REALM_STAGE;
    const config = shared_1.PLAYER_REALM_CONFIG[stage];
    return {
        stage,
        realmLv: Math.max(1, toFiniteInt(entry?.meta?.realmLv, resolveRealmLevelFromStage(stage))),
        displayName: config.name,
        name: config.name,
        shortName: config.shortName,
        path: config.path,
        narrative: config.narrative,
        review: undefined,
        lifespanYears: null,
        progress: Math.max(0, toFiniteInt(entry?.meta?.progress, 0)),
        progressToNext: config.progressToNext,
        breakthroughReady: false,
        nextStage: shared_1.PLAYER_REALM_ORDER[shared_1.PLAYER_REALM_ORDER.indexOf(stage) + 1],
        breakthroughItems: [],
        minTechniqueLevel: config.minTechniqueLevel,
        minTechniqueRealm: config.minTechniqueRealm,
        heavenGate: normalizeHeavenGateState(null),
    };
}
function normalizePendingLogbookMessages(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    const normalized = [];
    const indexById = new Map();
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
        const candidate = {
            id: typeof entry.id === 'string' ? entry.id.trim() : '',
            kind: 'grudge',
            text: typeof entry.text === 'string' ? entry.text.trim() : '',
            from: typeof entry.from === 'string' && entry.from.trim().length > 0 ? entry.from.trim() : undefined,
            at: Number.isFinite(entry.at) ? Math.max(0, Math.trunc(entry.at)) : 0,
        };
        if (!candidate.id || !candidate.text) {
            continue;
        }
        const existingIndex = indexById.get(candidate.id);
        if (existingIndex !== undefined) {
            normalized.splice(existingIndex, 1);
        }
        indexById.clear();
        normalized.push(candidate);
        while (normalized.length > 100) {
            normalized.shift();
        }
        normalized.forEach((item, index) => indexById.set(item.id, index));
    }
    return normalized;
}
function normalizeRuntimeBonuses(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({
        source: canonicalizeRuntimeBonusSource(typeof entry.source === 'string' ? entry.source : ''),
        label: typeof entry.label === 'string' ? entry.label : undefined,
        attrs: entry.attrs && typeof entry.attrs === 'object' ? { ...entry.attrs } : undefined,
        stats: entry.stats && typeof entry.stats === 'object' ? { ...entry.stats } : undefined,
        qiProjection: Array.isArray(entry.qiProjection) ? entry.qiProjection.map((item) => ({ ...item })) : undefined,
        meta: entry.meta && typeof entry.meta === 'object' ? { ...entry.meta } : undefined,
    }))
        .filter((entry) => entry.source.length > 0);
}
function canonicalizeRuntimeBonusSource(source) {
    const normalized = typeof source === 'string' ? source.trim() : '';
    if (!normalized) {
        return '';
    }
    if (normalized === 'legacy:vitals_baseline') {
        return 'runtime:vitals_baseline';
    }
    if (normalized === 'technique:aggregate') {
        return 'runtime:technique_aggregate';
    }
    if (normalized === 'realm:state') {
        return 'runtime:realm_state';
    }
    if (normalized === 'realm:stage') {
        return 'runtime:realm_stage';
    }
    if (normalized === 'heaven_gate:roots') {
        return 'runtime:heaven_gate_roots';
    }
    if (normalized.startsWith('equip:')) {
        return `equipment:${normalized.slice('equip:'.length)}`;
    }
    return normalized;
}
function createRealmState() {
    const stage = shared_1.DEFAULT_PLAYER_REALM_STAGE;
    const config = shared_1.PLAYER_REALM_CONFIG[stage];
    return {
        stage,
        realmLv: 1,
        displayName: config.name,
        name: config.name,
        shortName: config.shortName,
        path: config.path,
        narrative: config.narrative,
        review: undefined,
        lifespanYears: null,
        progress: 0,
        progressToNext: config.progressToNext,
        breakthroughReady: false,
        nextStage: shared_1.PLAYER_REALM_ORDER[shared_1.PLAYER_REALM_ORDER.indexOf(stage) + 1],
        breakthroughItems: [],
        minTechniqueLevel: config.minTechniqueLevel,
        minTechniqueRealm: config.minTechniqueRealm,
        heavenGate: null,
    };
}
function normalizeHeavenGateState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    const raw = value;
    return {
        unlocked: raw.unlocked === true,
        severed: Array.isArray(raw.severed)
            ? raw.severed.filter((entry) => typeof entry === 'string')
            : [],
        roots: normalizeHeavenGateRoots(raw.roots),
        entered: raw.entered === true,
        averageBonus: toFiniteInt(raw.averageBonus, 0),
    };
}
function normalizeHeavenGateRoots(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    const raw = value;
    return {
        metal: Math.max(0, Math.min(100, toFiniteInt(raw.metal, 0))),
        wood: Math.max(0, Math.min(100, toFiniteInt(raw.wood, 0))),
        water: Math.max(0, Math.min(100, toFiniteInt(raw.water, 0))),
        fire: Math.max(0, Math.min(100, toFiniteInt(raw.fire, 0))),
        earth: Math.max(0, Math.min(100, toFiniteInt(raw.earth, 0))),
    };
}
function resolveRealmLevelFromStage(stage) {
    switch (stage) {
        case shared_1.PlayerRealmStage.BodyTempering:
            return 6;
        case shared_1.PlayerRealmStage.BoneForging:
            return 9;
        case shared_1.PlayerRealmStage.Meridian:
            return 13;
        case shared_1.PlayerRealmStage.Innate:
            return 16;
        case shared_1.PlayerRealmStage.QiRefining:
            return 19;
        case shared_1.PlayerRealmStage.Foundation:
            return 31;
        case shared_1.PlayerRealmStage.Mortal:
        default:
            return 1;
    }
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
function issueLegacyJwt(secret, payload, expiresInSec) {
    const now = Math.floor(Date.now() / 1000);
    const encodedHeader = base64UrlEncode(Buffer.from(JSON.stringify({
        alg: 'HS256',
        typ: 'JWT',
    }), 'utf8'));
    const encodedPayload = base64UrlEncode(Buffer.from(JSON.stringify({
        ...payload,
        iat: now,
        exp: now + Math.max(1, Math.trunc(expiresInSec)),
    }), 'utf8'));
    const signature = base64UrlEncode((0, node_crypto_1.createHmac)('sha256', secret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest());
    return `${encodedHeader}.${encodedPayload}.${signature}`;
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
//# sourceMappingURL=legacy-auth.service.js.map
