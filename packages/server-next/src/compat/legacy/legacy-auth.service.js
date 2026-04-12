"use strict";
/** __decorate：定义该变量以承载业务值。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** LegacyAuthService_1：定义该变量以承载业务值。 */
var LegacyAuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyAuthService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** node_crypto_1：定义该变量以承载业务值。 */
const node_crypto_1 = require("node:crypto");
/** node_path_1：定义该变量以承载业务值。 */
const node_path_1 = require("node:path");
/** pg_1：定义该变量以承载业务值。 */
const pg_1 = require("pg");
/** env_alias_1：定义该变量以承载业务值。 */
const env_alias_1 = require("../../config/env-alias");
/** world_player_token_codec_service_1：定义该变量以承载业务值。 */
const world_player_token_codec_service_1 = require("../../network/world-player-token-codec.service");
/** LegacyAuthService：定义该变量以承载业务值。 */
let LegacyAuthService = LegacyAuthService_1 = class LegacyAuthService {
    logger = new common_1.Logger(LegacyAuthService_1.name);
    worldPlayerTokenCodecService;
    pool = null;
    poolInitPromise = null;
    poolUnavailable = false;
    poolUnavailableLogged = false;
/** 构造函数：执行实例初始化流程。 */
    constructor(worldPlayerTokenCodecService) {
        this.worldPlayerTokenCodecService = worldPlayerTokenCodecService;
    }
/** onModuleInit：执行对应的业务逻辑。 */
    async onModuleInit() {
        await this.ensurePool();
    }
/** onModuleDestroy：执行对应的业务逻辑。 */
    async onModuleDestroy() {
/** pool：定义该变量以承载业务值。 */
        const pool = this.pool;
        this.pool = null;
        this.poolInitPromise = null;
        if (pool) {
            await pool.end().catch(() => undefined);
        }
    }
/** authenticateSocketToken：执行对应的业务逻辑。 */
    async authenticateSocketToken(token) {
/** payload：定义该变量以承载业务值。 */
        const payload = this.validateToken(token);
        if (!payload) {
            return null;
        }
/** pool：定义该变量以承载业务值。 */
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
/** result：定义该变量以承载业务值。 */
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
/** row：定义该变量以承载业务值。 */
        const row = result.rows[0];
        return {
            userId: row?.userId ?? payload.sub,
            username: row?.username ?? payload.username,
            displayName: resolveDisplayName(row?.displayName, row?.username ?? payload.username, payload.displayName),
            playerId: row?.playerId ?? buildFallbackPlayerId(payload.sub),
            playerName: resolvePlayerName(row?.playerName ?? row?.pendingRoleName ?? null, row?.username ?? payload.username, payload.displayName),
        };
    }
/** loadLegacyPlayerSnapshot：执行对应的业务逻辑。 */
    async loadLegacyPlayerSnapshot(playerId) {
/** pool：定义该变量以承载业务值。 */
        const pool = await this.ensurePool();
        if (!pool) {
            return null;
        }
/** result：定义该变量以承载业务值。 */
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
/** row：定义该变量以承载业务值。 */
        const row = result.rows[0];
        if (!row) {
            return null;
        }
        return toLegacyPlayerSnapshot(row);
    }
/** login：执行对应的业务逻辑。 */
    async login(loginName, password) {
/** normalizedLoginName：定义该变量以承载业务值。 */
        const normalizedLoginName = normalizeUsername(loginName).trim();
/** normalizedPassword：定义该变量以承载业务值。 */
        const normalizedPassword = typeof password === 'string' ? password : '';
/** loginNameError：定义该变量以承载业务值。 */
        const loginNameError = validateUsername(normalizedLoginName);
        if (loginNameError) {
            throw new common_1.BadRequestException(loginNameError);
        }
/** pool：定义该变量以承载业务值。 */
        const pool = await this.requirePoolForHttpAuth();
/** candidates：定义该变量以承载业务值。 */
        const candidates = await this.findUsersByLoginName(pool, normalizedLoginName);
        if (candidates.length === 0) {
            throw new common_1.UnauthorizedException('用户不存在');
        }
/** matched：定义该变量以承载业务值。 */
        const matched = [];
        for (const candidate of candidates) {
            if (await verifyPasswordHash(normalizedPassword, candidate.passwordHash)) {
                matched.push(candidate);
            }
        }
        if (matched.length === 0) {
            throw new common_1.UnauthorizedException('密码错误');
        }
/** directMatch：定义该变量以承载业务值。 */
        const directMatch = matched.find((entry) => entry.username === normalizedLoginName);
        if (directMatch) {
            return this.issueAuthTokens(directMatch);
        }
        if (matched.length === 1) {
            return this.issueAuthTokens(matched[0]);
        }
        throw new common_1.BadRequestException('该角色名对应多个账号，请改用账号登录');
    }
/** register：执行对应的业务逻辑。 */
    async register(accountName, password, displayName, roleName) {
/** normalizedUsername：定义该变量以承载业务值。 */
        const normalizedUsername = normalizeUsername(accountName);
/** normalizedDisplayName：定义该变量以承载业务值。 */
        const normalizedDisplayName = normalizeDisplayName(displayName);
/** normalizedRoleName：定义该变量以承载业务值。 */
        const normalizedRoleName = normalizeRoleName(roleName || buildDefaultRoleName(accountName));
/** usernameError：定义该变量以承载业务值。 */
        const usernameError = validateUsername(normalizedUsername);
        if (usernameError) {
            throw new common_1.BadRequestException(usernameError);
        }
/** passwordError：定义该变量以承载业务值。 */
        const passwordError = validatePassword(password);
        if (passwordError) {
            throw new common_1.BadRequestException(passwordError);
        }
/** displayNameError：定义该变量以承载业务值。 */
        const displayNameError = validateDisplayName(normalizedDisplayName);
        if (displayNameError) {
            throw new common_1.BadRequestException(displayNameError);
        }
/** roleNameError：定义该变量以承载业务值。 */
        const roleNameError = validateRoleName(normalizedRoleName);
        if (roleNameError) {
            throw new common_1.BadRequestException(roleNameError);
        }
/** pool：定义该变量以承载业务值。 */
        const pool = await this.requirePoolForHttpAuth();
/** usernameConflict：定义该变量以承载业务值。 */
        const usernameConflict = await this.ensureNameAvailable(pool, normalizedUsername, 'account');
        if (usernameConflict) {
            throw new common_1.BadRequestException(usernameConflict);
        }
/** roleNameConflict：定义该变量以承载业务值。 */
        const roleNameConflict = await this.ensureNameAvailable(pool, normalizedRoleName, 'role');
        if (roleNameConflict) {
            throw new common_1.BadRequestException(roleNameConflict);
        }
/** displayNameConflict：定义该变量以承载业务值。 */
        const displayNameConflict = await this.ensureNameAvailable(pool, normalizedDisplayName, 'display');
        if (displayNameConflict) {
            throw new common_1.BadRequestException(displayNameConflict);
        }
/** userId：定义该变量以承载业务值。 */
        const userId = (0, node_crypto_1.randomUUID)();
/** passwordHash：定义该变量以承载业务值。 */
        const passwordHash = await hashPassword(typeof password === 'string' ? password : '');
        try {
            await pool.query(`
        INSERT INTO users(id, username, "displayName", "pendingRoleName", "passwordHash")
        VALUES ($1, $2, $3, $4, $5)
      `, [userId, normalizedUsername, normalizedDisplayName, normalizedRoleName, passwordHash]);
        }
        catch (error) {
            if (isUniqueViolation(error)) {
/** fallbackConflict：定义该变量以承载业务值。 */
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
/** refresh：执行对应的业务逻辑。 */
    async refresh(refreshToken) {
/** payload：定义该变量以承载业务值。 */
        const payload = this.validateRefreshToken(refreshToken);
        if (!payload) {
            throw new common_1.UnauthorizedException('刷新令牌无效或已过期');
        }
/** pool：定义该变量以承载业务值。 */
        const pool = await this.requirePoolForHttpAuth();
/** user：定义该变量以承载业务值。 */
        const user = await this.findUserById(pool, payload.sub);
        if (!user) {
            throw new common_1.UnauthorizedException('用户不存在');
        }
        return this.issueAuthTokens(user);
    }
/** checkDisplayNameAvailability：执行对应的业务逻辑。 */
    async checkDisplayNameAvailability(displayName) {
/** normalizedDisplayName：定义该变量以承载业务值。 */
        const normalizedDisplayName = normalizeDisplayName(displayName);
/** error：定义该变量以承载业务值。 */
        const error = validateDisplayName(normalizedDisplayName);
        if (error) {
            return { available: false, message: error };
        }
/** pool：定义该变量以承载业务值。 */
        const pool = await this.requirePoolForHttpAuth();
/** conflict：定义该变量以承载业务值。 */
        const conflict = await this.ensureNameAvailable(pool, normalizedDisplayName, 'display');
        if (conflict) {
            return { available: false, message: conflict };
        }
        return { available: true };
    }
/** updateManagedPlayerPassword：执行对应的业务逻辑。 */
    async updateManagedPlayerPassword(playerId, newPassword) {
/** normalizedPlayerId：定义该变量以承载业务值。 */
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            throw new common_1.BadRequestException('缺少玩家 ID');
        }
/** passwordError：定义该变量以承载业务值。 */
        const passwordError = validatePassword(typeof newPassword === 'string' ? newPassword : '');
        if (passwordError) {
            throw new common_1.BadRequestException(passwordError);
        }
/** pool：定义该变量以承载业务值。 */
        const pool = await this.requirePoolForHttpAuth();
/** user：定义该变量以承载业务值。 */
        const user = await this.findUserByPlayerId(pool, normalizedPlayerId);
        if (!user) {
            throw new common_1.NotFoundException('目标玩家不存在');
        }
/** passwordHash：定义该变量以承载业务值。 */
        const passwordHash = await hashPassword(typeof newPassword === 'string' ? newPassword : '');
        await pool.query('UPDATE users SET "passwordHash" = $2 WHERE id = $1', [user.userId, passwordHash]);
    }
/** updateManagedPlayerAccount：执行对应的业务逻辑。 */
    async updateManagedPlayerAccount(playerId, username) {
/** normalizedPlayerId：定义该变量以承载业务值。 */
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            throw new common_1.BadRequestException('缺少玩家 ID');
        }
/** normalizedUsername：定义该变量以承载业务值。 */
        const normalizedUsername = normalizeUsername(username);
/** usernameError：定义该变量以承载业务值。 */
        const usernameError = validateUsername(normalizedUsername);
        if (usernameError) {
            throw new common_1.BadRequestException(usernameError);
        }
/** pool：定义该变量以承载业务值。 */
        const pool = await this.requirePoolForHttpAuth();
/** user：定义该变量以承载业务值。 */
        const user = await this.findUserByPlayerId(pool, normalizedPlayerId);
        if (!user) {
            throw new common_1.NotFoundException('目标玩家不存在');
        }
/** previousDisplayName：定义该变量以承载业务值。 */
        const previousDisplayName = resolveDisplayName(user.displayName, user.username);
        if (normalizedUsername === user.username) {
            return {
                username: normalizedUsername,
                displayNameChanged: false,
                nextDisplayName: previousDisplayName,
            };
        }
/** usernameConflict：定义该变量以承载业务值。 */
        const usernameConflict = await this.ensureNameAvailable(pool, normalizedUsername, 'account', {
            exclude: [{ userId: user.userId, kind: 'account' }],
        });
        if (usernameConflict) {
            throw new common_1.BadRequestException(usernameConflict);
        }
/** nextDisplayName：定义该变量以承载业务值。 */
        const nextDisplayName = resolveDisplayName(user.displayName, normalizedUsername);
        if (nextDisplayName !== previousDisplayName) {
/** displayNameConflict：定义该变量以承载业务值。 */
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
/** displayNameChanged：定义该变量以承载业务值。 */
            displayNameChanged: nextDisplayName !== previousDisplayName,
            nextDisplayName,
        };
    }
/** getManagedAccountIndex：执行对应的业务逻辑。 */
    async getManagedAccountIndex(playerIds) {
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
/** pool：定义该变量以承载业务值。 */
        const pool = await this.ensurePool();
        if (!pool) {
            return result;
        }
/** direct：定义该变量以承载业务值。 */
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
/** fallbackUserIds：定义该变量以承载业务值。 */
        const fallbackUserIds = [];
        for (const playerId of normalizedPlayerIds) {
            if (result.has(playerId)) {
                continue;
            }
/** userId：定义该变量以承载业务值。 */
            const userId = parseFallbackPlayerUserId(playerId);
            if (userId) {
                fallbackUserIds.push(userId);
            }
        }
        if (fallbackUserIds.length === 0) {
            return result;
        }
/** fallback：定义该变量以承载业务值。 */
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
/** validateToken：执行对应的业务逻辑。 */
    validateToken(token) {
        return this.worldPlayerTokenCodecService.validateAccessToken(token);
    }
/** ensurePool：执行对应的业务逻辑。 */
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
/** databaseUrl：定义该变量以承载业务值。 */
        const databaseUrl = (0, env_alias_1.resolveServerNextDatabaseUrl)();
        if (!databaseUrl.trim()) {
            this.poolUnavailable = true;
            if (!this.poolUnavailableLogged) {
                this.poolUnavailableLogged = true;
                this.logger.warn('Legacy auth degraded: no SERVER_NEXT_DATABASE_URL/DATABASE_URL, fallback to token-only identity');
            }
            return null;
        }
        this.poolInitPromise = (async () => {
/** pool：定义该变量以承载业务值。 */
            const pool = new pg_1.Pool({ connectionString: databaseUrl });
            try {
                await pool.query('SELECT 1');
                await ensureDisplayNameUniquenessPolicy(pool);
                await normalizePersistedLegacyNames(pool, this.logger);
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
/** validateRefreshToken：执行对应的业务逻辑。 */
    validateRefreshToken(token) {
        return this.worldPlayerTokenCodecService.validateRefreshToken(token);
    }
/** requirePoolForHttpAuth：执行对应的业务逻辑。 */
    async requirePoolForHttpAuth() {
/** pool：定义该变量以承载业务值。 */
        const pool = await this.ensurePool();
        if (!pool) {
            throw new common_1.ServiceUnavailableException('旧账号数据库未启用');
        }
        return pool;
    }
/** findUsersByLoginName：执行对应的业务逻辑。 */
    async findUsersByLoginName(pool, loginName) {
/** result：定义该变量以承载业务值。 */
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
/** findUserById：执行对应的业务逻辑。 */
    async findUserById(pool, userId) {
/** result：定义该变量以承载业务值。 */
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
/** findUserByPlayerId：执行对应的业务逻辑。 */
    async findUserByPlayerId(pool, playerId) {
/** result：定义该变量以承载业务值。 */
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
/** direct：定义该变量以承载业务值。 */
        const direct = normalizeLegacyUserRecord(result.rows[0]);
        if (direct) {
            return direct;
        }
/** fallbackUserId：定义该变量以承载业务值。 */
        const fallbackUserId = parseFallbackPlayerUserId(playerId);
        if (!fallbackUserId) {
            return null;
        }
        return this.findUserById(pool, fallbackUserId);
    }
/** issueAuthTokens：执行对应的业务逻辑。 */
    issueAuthTokens(user) {
/** displayName：定义该变量以承载业务值。 */
        const displayName = resolveDisplayName(user.displayName, user.username);
/** playerId：定义该变量以承载业务值。 */
        const playerId = typeof user.playerId === 'string' && user.playerId.trim()
            ? user.playerId.trim()
            : buildFallbackPlayerId(user.userId);
/** playerName：定义该变量以承载业务值。 */
        const playerName = resolvePlayerName(user.playerName ?? null, user.username, displayName);
        return {
            accessToken: this.worldPlayerTokenCodecService.issueAccessToken({
                sub: user.userId,
                username: user.username,
                displayName,
                playerId,
                playerName,
            }),
            refreshToken: this.worldPlayerTokenCodecService.issueRefreshToken({
                sub: user.userId,
                username: user.username,
                displayName,
                playerId,
                playerName,
            }),
        };
    }
/** ensureNameAvailable：执行对应的业务逻辑。 */
    async ensureNameAvailable(pool, value, requestedKind, options = {}) {
        if (requestedKind === 'display' && (0, shared_1.isDuplicateFriendlyDisplayName)(value)) {
            return null;
        }
/** conflict：定义该变量以承载业务值。 */
        const conflict = await this.findNameConflict(pool, value, requestedKind, options);
        if (!conflict) {
            return null;
        }
        return buildConflictMessage(requestedKind, conflict.kind);
    }
/** findNameConflict：执行对应的业务逻辑。 */
    async findNameConflict(pool, value, requestedKind, options = {}) {
        if (!value) {
            return null;
        }
/** conflicts：定义该变量以承载业务值。 */
        const conflicts = [];
        if (requestedKind === 'account') {
/** users：定义该变量以承载业务值。 */
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
            if ((0, shared_1.isDuplicateFriendlyDisplayName)(value)) {
                return null;
            }
/** users：定义该变量以承载业务值。 */
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
/** exclude：定义该变量以承载业务值。 */
        const exclude = Array.isArray(options.exclude) ? options.exclude : [];
        return conflicts.find((entry) => !exclude.some((candidate) => candidate.kind === entry.kind && candidate.userId === entry.userId)) ?? null;
    }
};
exports.LegacyAuthService = LegacyAuthService;
exports.LegacyAuthService = LegacyAuthService = LegacyAuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_player_token_codec_service_1.WorldPlayerTokenCodecService])
], LegacyAuthService);
/** ensureDisplayNameUniquenessPolicy：执行对应的业务逻辑。 */
async function ensureDisplayNameUniquenessPolicy(pool) {
    try {
/** result：定义该变量以承载业务值。 */
        const result = await pool.query(`
      SELECT con.conname
      FROM pg_constraint con
      INNER JOIN pg_class rel ON rel.oid = con.conrelid
      INNER JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS key(attnum, ordinality) ON TRUE
      INNER JOIN pg_attribute attr ON attr.attrelid = rel.oid AND attr.attnum = key.attnum
      WHERE rel.relname = 'users'
        AND con.contype = 'u'
      GROUP BY con.conname
      HAVING array_agg(attr.attname::text ORDER BY key.ordinality) = ARRAY['displayName']::text[]
    `);
        for (const row of result.rows) {
            const constraintName = typeof row?.conname === 'string' ? row.conname.trim() : '';
            if (!constraintName) {
                continue;
            }
            await pool.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS ${quotePgIdentifier(constraintName)}`);
        }
        await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_display_name_unique_except_person"
      ON "users" ("displayName")
      WHERE "displayName" IS NOT NULL AND "displayName" <> '${shared_1.DEFAULT_VISIBLE_DISPLAY_NAME}'
    `);
    }
    catch (error) {
        if (!isMissingLegacySchemaError(error)) {
            throw error;
        }
    }
}
/** normalizePersistedLegacyNames：执行对应的业务逻辑。 */
async function normalizePersistedLegacyNames(pool, logger) {
/** usersResult：定义该变量以承载业务值。 */
    let usersResult;
/** playersResult：定义该变量以承载业务值。 */
    let playersResult;
    try {
        [usersResult, playersResult] = await Promise.all([
            pool.query('SELECT id, username, "displayName", "createdAt" FROM users'),
            pool.query('SELECT id, "userId", name, "createdAt" FROM players'),
        ]);
    }
    catch (error) {
        if (isMissingLegacySchemaError(error)) {
            return;
        }
        throw error;
    }
/** users：定义该变量以承载业务值。 */
    const users = usersResult.rows;
/** players：定义该变量以承载业务值。 */
    const players = playersResult.rows;
/** effectiveDisplayNameByUserId：定义该变量以承载业务值。 */
    const effectiveDisplayNameByUserId = new Map();
/** defaultDisplayAssignedCount：定义该变量以承载业务值。 */
    let defaultDisplayAssignedCount = 0;
/** displayNameNormalizedCount：定义该变量以承载业务值。 */
    let displayNameNormalizedCount = 0;
    for (const row of users) {
        const userId = typeof row?.id === 'string' ? row.id.trim() : '';
        const username = normalizeUsername(row?.username);
        if (!userId || !username) {
            continue;
        }
/** currentDisplayName：定义该变量以承载业务值。 */
        const currentDisplayName = typeof row?.displayName === 'string' ? row.displayName : null;
/** normalizedStoredDisplayName：定义该变量以承载业务值。 */
        const normalizedStoredDisplayName = currentDisplayName ? normalizeDisplayName(currentDisplayName) : '';
/** nextStoredDisplayName：定义该变量以承载业务值。 */
        let nextStoredDisplayName = currentDisplayName;
        if (normalizedStoredDisplayName) {
/** displayNameError：定义该变量以承载业务值。 */
            const displayNameError = validateDisplayName(normalizedStoredDisplayName);
            if (displayNameError) {
                nextStoredDisplayName = shared_1.DEFAULT_VISIBLE_DISPLAY_NAME;
                defaultDisplayAssignedCount += 1;
            }
            else if (normalizedStoredDisplayName !== currentDisplayName) {
                nextStoredDisplayName = normalizedStoredDisplayName;
                displayNameNormalizedCount += 1;
            }
        }
        else if (resolveDisplayName(currentDisplayName, username) === shared_1.DEFAULT_VISIBLE_DISPLAY_NAME) {
            nextStoredDisplayName = shared_1.DEFAULT_VISIBLE_DISPLAY_NAME;
            defaultDisplayAssignedCount += 1;
        }
        if (nextStoredDisplayName !== currentDisplayName) {
            await pool.query('UPDATE users SET "displayName" = $2 WHERE id = $1', [userId, nextStoredDisplayName]);
        }
        effectiveDisplayNameByUserId.set(userId, resolveDisplayName(nextStoredDisplayName, username));
    }
/** occupiedNames：定义该变量以承载业务值。 */
    const occupiedNames = new Set();
    for (const row of users) {
        const userId = typeof row?.id === 'string' ? row.id.trim() : '';
        const username = normalizeUsername(row?.username);
        if (!userId || !username) {
            continue;
        }
        occupiedNames.add(username);
        occupiedNames.add(effectiveDisplayNameByUserId.get(userId) ?? resolveDisplayName(row?.displayName ?? null, username));
    }
/** regularBuckets：定义该变量以承载业务值。 */
    const regularBuckets = new Map();
/** anonymousEntries：定义该变量以承载业务值。 */
    const anonymousEntries = [];
/** allEntries：定义该变量以承载业务值。 */
    const allEntries = [];
    for (const row of players) {
        const playerId = typeof row?.id === 'string' ? row.id.trim() : '';
        const userId = typeof row?.userId === 'string' ? row.userId.trim() : '';
/** originalName：定义该变量以承载业务值。 */
        const originalName = typeof row?.name === 'string' ? row.name : '';
        if (!playerId || !userId) {
            continue;
        }
/** trimmedName：定义该变量以承载业务值。 */
        const trimmedName = originalName.normalize('NFC').trim();
/** requiresAnonymousRename：定义该变量以承载业务值。 */
        const requiresAnonymousRename = !(0, shared_1.hasVisibleNameGrapheme)(trimmedName);
/** normalizedName：定义该变量以承载业务值。 */
        const normalizedName = requiresAnonymousRename
            ? shared_1.DEFAULT_INVISIBLE_ROLE_NAME_BASE
            : ((0, shared_1.truncateRoleName)(trimmedName) || originalName);
/** entry：定义该变量以承载业务值。 */
        const entry = {
            id: playerId,
            userId,
            originalName,
            normalizedName,
            createdAtSource: toTimestampMs(row?.createdAt),
            requiresAnonymousRename,
        };
        allEntries.push(entry);
        if (requiresAnonymousRename) {
            anonymousEntries.push(entry);
            continue;
        }
/** bucket：定义该变量以承载业务值。 */
        const bucket = regularBuckets.get(normalizedName) ?? [];
        bucket.push(entry);
        regularBuckets.set(normalizedName, bucket);
    }
    for (const [, bucket] of regularBuckets.entries()) {
        if (bucket.length === 1) {
            occupiedNames.add(bucket[0].normalizedName);
        }
    }
/** duplicateGroups：定义该变量以承载业务值。 */
    const duplicateGroups = [...regularBuckets.entries()]
        .filter(([, bucket]) => bucket.length > 1)
        .sort(([left], [right]) => left.localeCompare(right, 'zh-Hans-CN'));
    for (const [, bucket] of duplicateGroups) {
        bucket.sort((left, right) => left.createdAtSource - right.createdAtSource || left.id.localeCompare(right.id));
        occupiedNames.add(bucket[0].normalizedName);
/** suffix：定义该变量以承载业务值。 */
        let suffix = 2;
        for (let index = 1; index < bucket.length; index += 1) {
            const renamed = allocateDuplicateRoleName(bucket[index].normalizedName, suffix, occupiedNames, 2);
            suffix = renamed.nextSuffix;
            bucket[index].normalizedName = renamed.name;
            occupiedNames.add(renamed.name);
        }
    }
    anonymousEntries.sort((left, right) => left.createdAtSource - right.createdAtSource || left.id.localeCompare(right.id));
/** anonymousSuffix：定义该变量以承载业务值。 */
    let anonymousSuffix = 1;
    for (const entry of anonymousEntries) {
        const renamed = allocateDuplicateRoleName(shared_1.DEFAULT_INVISIBLE_ROLE_NAME_BASE, anonymousSuffix, occupiedNames, 1);
        anonymousSuffix = renamed.nextSuffix;
        entry.normalizedName = renamed.name;
        occupiedNames.add(renamed.name);
    }
/** normalizedCount：定义该变量以承载业务值。 */
    let normalizedCount = 0;
/** duplicateRenamedCount：定义该变量以承载业务值。 */
    let duplicateRenamedCount = 0;
/** anonymousRoleRenamedCount：定义该变量以承载业务值。 */
    let anonymousRoleRenamedCount = 0;
    for (const entry of allEntries) {
        if (entry.normalizedName === entry.originalName) {
            continue;
        }
        await pool.query('UPDATE players SET name = $2 WHERE id = $1', [entry.id, entry.normalizedName]);
        if (entry.requiresAnonymousRename) {
            anonymousRoleRenamedCount += 1;
        }
        else if ((0, shared_1.truncateRoleName)(entry.originalName.normalize('NFC').trim()) === entry.normalizedName) {
            normalizedCount += 1;
        }
        else {
            duplicateRenamedCount += 1;
        }
    }
    if (defaultDisplayAssignedCount > 0) {
        logger.warn(`启动时已将 ${defaultDisplayAssignedCount} 个无效显示名修正为 ${shared_1.DEFAULT_VISIBLE_DISPLAY_NAME}`);
    }
    if (displayNameNormalizedCount > 0) {
        logger.log(`启动时已规范化 ${displayNameNormalizedCount} 个显示名的 Unicode 形式`);
    }
    if (normalizedCount > 0) {
        logger.log(`启动时已裁切 ${normalizedCount} 个超长角色名`);
    }
    if (duplicateRenamedCount > 0) {
        logger.warn(`启动时已为 ${duplicateRenamedCount} 个重名角色自动追加序号`);
    }
    if (anonymousRoleRenamedCount > 0) {
        logger.warn(`启动时已将 ${anonymousRoleRenamedCount} 个透明角色自动改名为 ${shared_1.DEFAULT_INVISIBLE_ROLE_NAME_BASE}#序号`);
    }
}
/** quotePgIdentifier：执行对应的业务逻辑。 */
function quotePgIdentifier(value) {
    return `"${value.replace(/"/g, '""')}"`;
}
/** toTimestampMs：执行对应的业务逻辑。 */
function toTimestampMs(value) {
    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return value.getTime();
    }
    if (typeof value === 'string' && value.trim()) {
/** timestamp：定义该变量以承载业务值。 */
        const timestamp = Date.parse(value);
        return Number.isFinite(timestamp) ? timestamp : 0;
    }
    return 0;
}
/** allocateDuplicateRoleName：执行对应的业务逻辑。 */
function allocateDuplicateRoleName(baseName, startSuffix, occupiedNames, minimumSuffix = 2) {
/** suffix：定义该变量以承载业务值。 */
    let suffix = Math.max(minimumSuffix, Math.floor(startSuffix));
    while (true) {
/** suffixText：定义该变量以承载业务值。 */
        const suffixText = `#${suffix}`;
/** candidate：定义该变量以承载业务值。 */
        const candidate = appendRoleNameSuffix(baseName, suffixText);
        if (!occupiedNames.has(candidate)) {
            return {
                name: candidate,
                nextSuffix: suffix + 1,
            };
        }
        suffix += 1;
    }
}
/** appendRoleNameSuffix：执行对应的业务逻辑。 */
function appendRoleNameSuffix(baseName, suffix) {
/** trimmedBase：定义该变量以承载业务值。 */
    let trimmedBase = baseName;
    while (trimmedBase.length > 0 && !(0, shared_1.isRoleNameWithinLimit)(`${trimmedBase}${suffix}`)) {
        trimmedBase = [...trimmedBase].slice(0, -1).join('');
    }
    return `${trimmedBase}${suffix}`;
}
/** resolveDisplayName：执行对应的业务逻辑。 */
function resolveDisplayName(displayName, username, fallback) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = typeof displayName === 'string' ? displayName.normalize('NFC') : '';
    if (normalized) {
        return validateDisplayName(normalized) === null ? normalized : shared_1.DEFAULT_VISIBLE_DISPLAY_NAME;
    }
/** normalizedFallback：定义该变量以承载业务值。 */
    const normalizedFallback = typeof fallback === 'string' ? fallback.trim().normalize('NFC') : '';
    if (validateDisplayName(normalizedFallback) === null) {
        return normalizedFallback;
    }
    return (0, shared_1.resolveDefaultVisibleDisplayName)(username.normalize('NFC'));
}
/** resolvePlayerName：执行对应的业务逻辑。 */
function resolvePlayerName(playerName, username, fallback) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = typeof playerName === 'string' ? playerName.trim().normalize('NFC') : '';
    if (normalized) {
        return normalized;
    }
    if (typeof fallback === 'string' && fallback.trim()) {
        return fallback.trim().normalize('NFC');
    }
    return username.normalize('NFC');
}
/** buildFallbackPlayerId：执行对应的业务逻辑。 */
function buildFallbackPlayerId(userId) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = userId.trim();
    return normalized ? `p_${normalized}` : 'p_guest';
}
/** parseFallbackPlayerUserId：执行对应的业务逻辑。 */
function parseFallbackPlayerUserId(playerId) {
    if (typeof playerId !== 'string' || !playerId.startsWith('p_')) {
        return null;
    }
/** userId：定义该变量以承载业务值。 */
    const userId = playerId.slice(2).trim();
    return userId || null;
}
/** normalizeUsername：执行对应的业务逻辑。 */
function normalizeUsername(value) {
    return typeof value === 'string' ? value.normalize('NFC') : '';
}
/** normalizeDisplayName：执行对应的业务逻辑。 */
function normalizeDisplayName(value) {
    return typeof value === 'string' ? value.normalize('NFC') : '';
}
/** normalizeRoleName：执行对应的业务逻辑。 */
function normalizeRoleName(value) {
    return typeof value === 'string' ? value.normalize('NFC').trim() : '';
}
/** containsWhitespace：执行对应的业务逻辑。 */
function containsWhitespace(value) {
    return /\s/.test(value);
}
/** buildDefaultRoleName：执行对应的业务逻辑。 */
function buildDefaultRoleName(username) {
    return (0, shared_1.truncateRoleName)(normalizeUsername(username));
}
/** validateUsername：执行对应的业务逻辑。 */
function validateUsername(username) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = normalizeUsername(username);
/** length：定义该变量以承载业务值。 */
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
/** validatePassword：执行对应的业务逻辑。 */
function validatePassword(password) {
    if (typeof password !== 'string' || password.length < shared_1.PASSWORD_MIN_LENGTH) {
        return `密码长度不能少于 ${shared_1.PASSWORD_MIN_LENGTH} 个字符`;
    }
    if (containsWhitespace(password)) {
        return '密码不支持空格';
    }
    return null;
}
/** validateDisplayName：执行对应的业务逻辑。 */
function validateDisplayName(displayName) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = normalizeDisplayName(displayName);
    if (!normalized) {
        return '显示名称不能为空';
    }
    if (containsWhitespace(normalized)) {
        return '显示名称不支持空格';
    }
    if ((0, shared_1.getGraphemeCount)(normalized) !== 1) {
        return '显示名称必须为 1 个字符';
    }
    if (!(0, shared_1.hasVisibleNameGrapheme)(normalized) || (0, shared_1.containsInvisibleOnlyNameGrapheme)(normalized)) {
        return '显示名称必须为可见字符';
    }
    return null;
}
/** validateRoleName：执行对应的业务逻辑。 */
function validateRoleName(roleName) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = normalizeRoleName(roleName);
    if (!normalized) {
        return '角色名称不能为空';
    }
    if (!(0, shared_1.hasVisibleNameGrapheme)(normalized)) {
        return '角色名称必须包含可见字符';
    }
    if ((0, shared_1.containsInvisibleOnlyNameGrapheme)(normalized)) {
        return '角色名称不支持不可见字符';
    }
    if (!(0, shared_1.isRoleNameWithinLimit)(normalized)) {
        return `角色名称${(0, shared_1.getRoleNameLimitText)()}`;
    }
    return null;
}
/** normalizeLegacyUserRecord：执行对应的业务逻辑。 */
function normalizeLegacyUserRecord(row) {
    if (!row || typeof row !== 'object') {
        return null;
    }
/** userId：定义该变量以承载业务值。 */
    const userId = typeof row.userId === 'string' ? row.userId.trim() : '';
/** username：定义该变量以承载业务值。 */
    const username = normalizeUsername(row.username);
/** passwordHash：定义该变量以承载业务值。 */
    const passwordHash = typeof row.passwordHash === 'string' ? row.passwordHash : '';
    if (!userId || !username || !passwordHash) {
        return null;
    }
    return {
        userId,
        username,
/** displayName：定义该变量以承载业务值。 */
        displayName: typeof row.displayName === 'string' ? row.displayName : null,
/** pendingRoleName：定义该变量以承载业务值。 */
        pendingRoleName: typeof row.pendingRoleName === 'string' ? row.pendingRoleName : null,
        passwordHash,
/** playerId：定义该变量以承载业务值。 */
        playerId: typeof row.playerId === 'string' && row.playerId.trim() ? row.playerId.trim() : buildFallbackPlayerId(userId),
/** playerName：定义该变量以承载业务值。 */
        playerName: typeof row.playerName === 'string' && row.playerName.trim()
            ? row.playerName.trim()
            : (typeof row.pendingRoleName === 'string' && row.pendingRoleName.trim() ? row.pendingRoleName.trim() : username),
    };
}
/** normalizeManagedAccountRecord：执行对应的业务逻辑。 */
function normalizeManagedAccountRecord(row) {
    if (!row || typeof row !== 'object') {
        return null;
    }
/** playerId：定义该变量以承载业务值。 */
    const playerId = typeof row.playerId === 'string' ? row.playerId.trim() : '';
/** userId：定义该变量以承载业务值。 */
    const userId = typeof row.userId === 'string' ? row.userId.trim() : '';
/** username：定义该变量以承载业务值。 */
    const username = normalizeUsername(row.username);
    if (!playerId || !userId || !username) {
        return null;
    }
    return {
        playerId,
/** playerName：定义该变量以承载业务值。 */
        playerName: typeof row.playerName === 'string' && row.playerName.trim() ? row.playerName.trim() : null,
        userId,
        username,
/** displayName：定义该变量以承载业务值。 */
        displayName: typeof row.displayName === 'string' && row.displayName.trim() ? row.displayName : null,
        createdAt: normalizeTimestamp(row.createdAt),
        totalOnlineSeconds: Number.isFinite(row.totalOnlineSeconds) ? Math.max(0, Math.trunc(row.totalOnlineSeconds)) : 0,
        currentOnlineStartedAt: normalizeTimestamp(row.currentOnlineStartedAt),
    };
}
/** normalizeTimestamp：执行对应的业务逻辑。 */
function normalizeTimestamp(value) {
    if (typeof value === 'string' && value.trim()) {
        return value;
    }
    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return value.toISOString();
    }
    return null;
}
/** buildConflictMessage：执行对应的业务逻辑。 */
function buildConflictMessage(requestedKind, conflictKind) {
    if (requestedKind === 'account' || conflictKind === 'account') {
        return '账号已存在';
    }
    if (requestedKind === 'role' || conflictKind === 'role') {
        return '角色名称已存在';
    }
    return '显示名称已存在';
}
/** verifyPasswordHash：执行对应的业务逻辑。 */
async function verifyPasswordHash(password, passwordHash) {
    if (typeof password !== 'string' || typeof passwordHash !== 'string' || !passwordHash) {
        return false;
    }
    return loadLegacyBcrypt().compare(password, passwordHash);
}
/** hashPassword：执行对应的业务逻辑。 */
async function hashPassword(password) {
    return loadLegacyBcrypt().hash(password, 10);
}
/** cachedLegacyBcrypt：定义该变量以承载业务值。 */
let cachedLegacyBcrypt = null;
/** loadLegacyBcrypt：执行对应的业务逻辑。 */
function loadLegacyBcrypt() {
    if (cachedLegacyBcrypt) {
        return cachedLegacyBcrypt;
    }
/** bcryptModulePath：定义该变量以承载业务值。 */
    const bcryptModulePath = require.resolve('bcrypt', {
        paths: [
            (0, node_path_1.resolve)(__dirname, '../../../../server'),
        ],
    });
    cachedLegacyBcrypt = require(bcryptModulePath);
    return cachedLegacyBcrypt;
}
/** isUniqueViolation：执行对应的业务逻辑。 */
function isUniqueViolation(error) {
    return Boolean(error && typeof error === 'object' && error.code === '23505');
}
/** isMissingLegacySchemaError：执行对应的业务逻辑。 */
function isMissingLegacySchemaError(error) {
    return Boolean(error && typeof error === 'object' && error.code === '42P01');
}
/** toLegacyPlayerSnapshot：执行对应的业务逻辑。 */
function toLegacyPlayerSnapshot(row) {
/** currentMapId：定义该变量以承载业务值。 */
    const currentMapId = resolveRequiredCompatMapId(row.mapId);
/** inventory：定义该变量以承载业务值。 */
    const inventory = normalizeInventory(row.inventory);
/** buffs：定义该变量以承载业务值。 */
    const buffs = normalizeTemporaryBuffs(row.temporaryBuffs);
/** equipment：定义该变量以承载业务值。 */
    const equipment = normalizeEquipment(row.equipment);
/** techniques：定义该变量以承载业务值。 */
    const techniques = normalizeTechniques(row.techniques);
/** quests：定义该变量以承载业务值。 */
    const quests = normalizeQuests(row.quests);
/** unlockedMapIds：定义该变量以承载业务值。 */
    const unlockedMapIds = normalizeUnlockedMapIds(row.unlockedMinimapIds);
    return {
        version: 1,
        savedAt: Date.now(),
        placement: {
            templateId: currentMapId,
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
/** bodyTraining：定义该变量以承载业务值。 */
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
/** cultivatingTechId：定义该变量以承载业务值。 */
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
/** autoBattle：定义该变量以承载业务值。 */
            autoBattle: row.autoBattle === true,
/** combatTargetId：定义该变量以承载业务值。 */
            combatTargetId: typeof row.combatTargetId === 'string' && row.combatTargetId.trim()
                ? row.combatTargetId.trim()
                : null,
/** combatTargetLocked：定义该变量以承载业务值。 */
            combatTargetLocked: row.combatTargetLocked === true
                && typeof row.combatTargetId === 'string'
                && row.combatTargetId.trim().length > 0,
/** autoRetaliate：定义该变量以承载业务值。 */
            autoRetaliate: row.autoRetaliate !== false,
/** autoBattleStationary：定义该变量以承载业务值。 */
            autoBattleStationary: row.autoBattleStationary === true,
/** allowAoePlayerHit：定义该变量以承载业务值。 */
            allowAoePlayerHit: row.allowAoePlayerHit === true,
/** autoIdleCultivation：定义该变量以承载业务值。 */
            autoIdleCultivation: row.autoIdleCultivation !== false,
/** autoSwitchCultivation：定义该变量以承载业务值。 */
            autoSwitchCultivation: row.autoSwitchCultivation === true,
            senseQiActive: false,
            autoBattleSkills: normalizeAutoBattleSkills(row.autoBattleSkills),
        },
    };
}
/** resolveRequiredCompatMapId：执行对应的业务逻辑。 */
function resolveRequiredCompatMapId(value) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) {
        throw new Error('Compat player snapshot invalid mapId');
    }
    return normalized;
}
/** normalizeInventory：执行对应的业务逻辑。 */
function normalizeInventory(value) {
    if (!value || typeof value !== 'object') {
        return {
            revision: 1,
            capacity: shared_1.DEFAULT_INVENTORY_CAPACITY,
            items: [],
        };
    }
/** inventory：定义该变量以承载业务值。 */
    const inventory = value;
    return {
        revision: 1,
        capacity: Math.max(shared_1.DEFAULT_INVENTORY_CAPACITY, toFiniteInt(inventory.capacity, shared_1.DEFAULT_INVENTORY_CAPACITY)),
        items: Array.isArray(inventory.items)
            ? inventory.items.map(normalizeItem).filter((entry) => entry !== null)
            : [],
    };
}
/** normalizeEquipment：执行对应的业务逻辑。 */
function normalizeEquipment(value) {
/** equipment：定义该变量以承载业务值。 */
    const equipment = value && typeof value === 'object'
        ? value
        : {};
/** slots：定义该变量以承载业务值。 */
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
/** normalizeTemporaryBuffs：执行对应的业务逻辑。 */
function normalizeTemporaryBuffs(value) {
    if (!Array.isArray(value)) {
        return [];
    }
/** buffs：定义该变量以承载业务值。 */
    const buffs = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
/** buff：定义该变量以承载业务值。 */
        const buff = entry;
/** buffId：定义该变量以承载业务值。 */
        const buffId = typeof buff.buffId === 'string' ? buff.buffId.trim() : '';
/** name：定义该变量以承载业务值。 */
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
/** normalizeTechniques：执行对应的业务逻辑。 */
function normalizeTechniques(value) {
    if (!Array.isArray(value)) {
        return [];
    }
/** techniques：定义该变量以承载业务值。 */
    const techniques = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
/** technique：定义该变量以承载业务值。 */
        const technique = entry;
/** techId：定义该变量以承载业务值。 */
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
/** name：定义该变量以承载业务值。 */
            name: typeof technique.name === 'string' ? technique.name : undefined,
/** grade：定义该变量以承载业务值。 */
            grade: typeof technique.grade === 'string' ? technique.grade : undefined,
/** category：定义该变量以承载业务值。 */
            category: typeof technique.category === 'string' ? technique.category : undefined,
            skills: Array.isArray(technique.skills) ? technique.skills.map((entry) => ({ ...entry })) : [],
            layers: Array.isArray(technique.layers)
                ? technique.layers.map((layer) => ({
                    level: Math.max(1, toFiniteInt(layer?.level, 1)),
                    expToNext: Math.max(0, toFiniteInt(layer?.expToNext, 0)),
/** attrs：定义该变量以承载业务值。 */
                    attrs: layer?.attrs && typeof layer.attrs === 'object' ? { ...layer.attrs } : undefined,
                }))
                : undefined,
/** attrCurves：定义该变量以承载业务值。 */
            attrCurves: technique.attrCurves && typeof technique.attrCurves === 'object' ? { ...technique.attrCurves } : undefined,
        });
    }
    techniques.sort((left, right) => left.techId.localeCompare(right.techId, 'zh-Hans-CN'));
    return techniques;
}
/** normalizeQuests：执行对应的业务逻辑。 */
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
/** normalizeUnlockedMapIds：执行对应的业务逻辑。 */
function normalizeUnlockedMapIds(value) {
    if (!Array.isArray(value)) {
        throw new Error('Compat player snapshot invalid unlockedMinimapIds');
    }
/** result：定义该变量以承载业务值。 */
    const result = new Set();
    for (const entry of value) {
        if (typeof entry === 'string' && entry.trim()) {
            result.add(entry);
        }
    }
    return Array.from(result).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
}
/** normalizeAutoBattleSkills：执行对应的业务逻辑。 */
function normalizeAutoBattleSkills(value) {
    if (!Array.isArray(value)) {
        return [];
    }
/** result：定义该变量以承载业务值。 */
    const result = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
/** config：定义该变量以承载业务值。 */
        const config = entry;
/** skillId：定义该变量以承载业务值。 */
        const skillId = typeof config.skillId === 'string' ? config.skillId.trim() : '';
        if (!skillId) {
            continue;
        }
        result.push({
            skillId,
/** enabled：定义该变量以承载业务值。 */
            enabled: config.enabled !== false,
            skillEnabled: config.skillEnabled,
            autoBattleOrder: Number.isFinite(config.autoBattleOrder) ? Math.max(0, Math.trunc(config.autoBattleOrder)) : undefined,
        });
    }
    return result;
}
/** normalizeItem：执行对应的业务逻辑。 */
function normalizeItem(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }
/** item：定义该变量以承载业务值。 */
    const item = value;
/** itemId：定义该变量以承载业务值。 */
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
/** normalizeDirection：执行对应的业务逻辑。 */
function normalizeDirection(value) {
    if (typeof value === 'number' && value in shared_1.Direction) {
        return value;
    }
    return shared_1.Direction.South;
}
/** normalizeTechniqueRealm：执行对应的业务逻辑。 */
function normalizeTechniqueRealm(value) {
    if (typeof value === 'number' && value in shared_1.TechniqueRealm) {
        return value;
    }
    return undefined;
}
/** toFiniteInt：执行对应的业务逻辑。 */
function toFiniteInt(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.trunc(value)
        : fallback;
}
/** toFiniteNumber：执行对应的业务逻辑。 */
function toFiniteNumber(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Number(value)
        : fallback;
}
/** toNullablePositiveInt：执行对应的业务逻辑。 */
function toNullablePositiveInt(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? Math.trunc(value)
        : null;
}
/** normalizeLegacyRealmState：执行对应的业务逻辑。 */
function normalizeLegacyRealmState(value) {
    if (!Array.isArray(value)) {
        return createRealmState();
    }
/** entry：定义该变量以承载业务值。 */
    const entry = value.find((bonus) => (bonus
        && typeof bonus === 'object'
        && (bonus.source === 'realm:state' || bonus.source === 'runtime:realm_state')));
/** stage：定义该变量以承载业务值。 */
    const stage = typeof entry?.meta?.stage === 'number' && entry.meta.stage in shared_1.PlayerRealmStage
        ? entry.meta.stage
        : shared_1.DEFAULT_PLAYER_REALM_STAGE;
/** config：定义该变量以承载业务值。 */
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
/** normalizePendingLogbookMessages：执行对应的业务逻辑。 */
function normalizePendingLogbookMessages(value) {
    if (!Array.isArray(value)) {
        return [];
    }
/** normalized：定义该变量以承载业务值。 */
    const normalized = [];
/** indexById：定义该变量以承载业务值。 */
    const indexById = new Map();
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
/** candidate：定义该变量以承载业务值。 */
        const candidate = {
/** id：定义该变量以承载业务值。 */
            id: typeof entry.id === 'string' ? entry.id.trim() : '',
            kind: normalizePendingLogbookKind(entry.kind),
/** text：定义该变量以承载业务值。 */
            text: typeof entry.text === 'string' ? entry.text.trim() : '',
/** from：定义该变量以承载业务值。 */
            from: typeof entry.from === 'string' && entry.from.trim().length > 0 ? entry.from.trim() : undefined,
            at: Number.isFinite(entry.at) ? Math.max(0, Math.trunc(entry.at)) : 0,
        };
        if (!candidate.id || !candidate.text) {
            continue;
        }
/** existingIndex：定义该变量以承载业务值。 */
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
/** normalizePendingLogbookKind：执行对应的业务逻辑。 */
function normalizePendingLogbookKind(value) {
    switch (value) {
        case 'system':
        case 'chat':
        case 'quest':
        case 'combat':
        case 'loot':
        case 'grudge':
            return value;
        default:
            return 'grudge';
    }
}
/** normalizeRuntimeBonuses：执行对应的业务逻辑。 */
function normalizeRuntimeBonuses(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({
/** source：定义该变量以承载业务值。 */
        source: canonicalizeRuntimeBonusSource(typeof entry.source === 'string' ? entry.source : ''),
/** label：定义该变量以承载业务值。 */
        label: typeof entry.label === 'string' ? entry.label : undefined,
/** attrs：定义该变量以承载业务值。 */
        attrs: entry.attrs && typeof entry.attrs === 'object' ? { ...entry.attrs } : undefined,
/** stats：定义该变量以承载业务值。 */
        stats: entry.stats && typeof entry.stats === 'object' ? { ...entry.stats } : undefined,
        qiProjection: Array.isArray(entry.qiProjection) ? entry.qiProjection.map((item) => ({ ...item })) : undefined,
/** meta：定义该变量以承载业务值。 */
        meta: entry.meta && typeof entry.meta === 'object' ? { ...entry.meta } : undefined,
    }))
        .filter((entry) => entry.source.length > 0);
}
/** canonicalizeRuntimeBonusSource：执行对应的业务逻辑。 */
function canonicalizeRuntimeBonusSource(source) {
/** normalized：定义该变量以承载业务值。 */
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
/** createRealmState：执行对应的业务逻辑。 */
function createRealmState() {
/** stage：定义该变量以承载业务值。 */
    const stage = shared_1.DEFAULT_PLAYER_REALM_STAGE;
/** config：定义该变量以承载业务值。 */
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
/** normalizeHeavenGateState：执行对应的业务逻辑。 */
function normalizeHeavenGateState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
/** raw：定义该变量以承载业务值。 */
    const raw = value;
    return {
/** unlocked：定义该变量以承载业务值。 */
        unlocked: raw.unlocked === true,
        severed: Array.isArray(raw.severed)
            ? raw.severed.filter((entry) => typeof entry === 'string')
            : [],
        roots: normalizeHeavenGateRoots(raw.roots),
/** entered：定义该变量以承载业务值。 */
        entered: raw.entered === true,
        averageBonus: toFiniteInt(raw.averageBonus, 0),
    };
}
/** normalizeHeavenGateRoots：执行对应的业务逻辑。 */
function normalizeHeavenGateRoots(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
/** raw：定义该变量以承载业务值。 */
    const raw = value;
    return {
        metal: Math.max(0, Math.min(100, toFiniteInt(raw.metal, 0))),
        wood: Math.max(0, Math.min(100, toFiniteInt(raw.wood, 0))),
        water: Math.max(0, Math.min(100, toFiniteInt(raw.water, 0))),
        fire: Math.max(0, Math.min(100, toFiniteInt(raw.fire, 0))),
        earth: Math.max(0, Math.min(100, toFiniteInt(raw.earth, 0))),
    };
}
/** resolveRealmLevelFromStage：执行对应的业务逻辑。 */
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
/** verifyLegacyJwt：执行对应的业务逻辑。 */
function verifyLegacyJwt(token, secret) {
/** segments：定义该变量以承载业务值。 */
    const segments = token.split('.');
    if (segments.length !== 3) {
        return null;
    }
    const [encodedHeader, encodedPayload, encodedSignature] = segments;
/** header：定义该变量以承载业务值。 */
    const header = parseJwtSegment(encodedHeader);
/** payload：定义该变量以承载业务值。 */
    const payload = parseJwtSegment(encodedPayload);
    if (!header || !payload) {
        return null;
    }
    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
        return null;
    }
/** expectedSignature：定义该变量以承载业务值。 */
    const expectedSignature = base64UrlEncode((0, node_crypto_1.createHmac)('sha256', secret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest());
/** left：定义该变量以承载业务值。 */
    const left = Buffer.from(encodedSignature);
/** right：定义该变量以承载业务值。 */
    const right = Buffer.from(expectedSignature);
    if (left.length !== right.length || !(0, node_crypto_1.timingSafeEqual)(left, right)) {
        return null;
    }
/** now：定义该变量以承载业务值。 */
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && Number.isFinite(payload.exp) && payload.exp < now) {
        return null;
    }
    if (typeof payload.nbf === 'number' && Number.isFinite(payload.nbf) && payload.nbf > now) {
        return null;
    }
    return payload;
}
/** issueLegacyJwt：执行对应的业务逻辑。 */
function issueLegacyJwt(secret, payload, expiresInSec) {
/** now：定义该变量以承载业务值。 */
    const now = Math.floor(Date.now() / 1000);
/** encodedHeader：定义该变量以承载业务值。 */
    const encodedHeader = base64UrlEncode(Buffer.from(JSON.stringify({
        alg: 'HS256',
        typ: 'JWT',
    }), 'utf8'));
/** encodedPayload：定义该变量以承载业务值。 */
    const encodedPayload = base64UrlEncode(Buffer.from(JSON.stringify({
        ...payload,
        iat: now,
        exp: now + Math.max(1, Math.trunc(expiresInSec)),
    }), 'utf8'));
/** signature：定义该变量以承载业务值。 */
    const signature = base64UrlEncode((0, node_crypto_1.createHmac)('sha256', secret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest());
    return `${encodedHeader}.${encodedPayload}.${signature}`;
}
/** parseJwtSegment：执行对应的业务逻辑。 */
function parseJwtSegment(segment) {
    try {
/** json：定义该变量以承载业务值。 */
        const json = Buffer.from(base64UrlDecode(segment), 'base64').toString('utf8');
/** value：定义该变量以承载业务值。 */
        const value = JSON.parse(json);
        return value && typeof value === 'object' ? value : null;
    }
    catch {
        return null;
    }
}
/** base64UrlDecode：执行对应的业务逻辑。 */
function base64UrlDecode(value) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
/** padding：定义该变量以承载业务值。 */
    const padding = normalized.length % 4;
    return padding === 0 ? normalized : `${normalized}${'='.repeat(4 - padding)}`;
}
/** base64UrlEncode：执行对应的业务逻辑。 */
function base64UrlEncode(value) {
    return value
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}
//# sourceMappingURL=legacy-auth.service.js.map
