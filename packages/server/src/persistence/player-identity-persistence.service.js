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
/** PlayerIdentityPersistenceService_1：定义该变量以承载业务值。 */
var PlayerIdentityPersistenceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerIdentityPersistenceService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** pg_1：定义该变量以承载业务值。 */
const pg_1 = require("pg");
/** env_alias_1：定义该变量以承载业务值。 */
const env_alias_1 = require("../config/env-alias");
/** persistent_document_table_1：定义该变量以承载业务值。 */
const persistent_document_table_1 = require("./persistent-document-table");
/** PLAYER_IDENTITY_SCOPE：定义该变量以承载业务值。 */
const PLAYER_IDENTITY_SCOPE = 'server_next_player_identities_v1';
/** PLAYER_IDENTITY_PERSISTED_SOURCE_NATIVE：定义该变量以承载业务值。 */
const PLAYER_IDENTITY_PERSISTED_SOURCE_NATIVE = 'native';
/** PLAYER_IDENTITY_PERSISTED_SOURCE_LEGACY_BACKFILL：定义该变量以承载业务值。 */
const PLAYER_IDENTITY_PERSISTED_SOURCE_LEGACY_BACKFILL = 'legacy_backfill';
/** PLAYER_IDENTITY_PERSISTED_SOURCE_LEGACY_SYNC：定义该变量以承载业务值。 */
const PLAYER_IDENTITY_PERSISTED_SOURCE_LEGACY_SYNC = 'legacy_sync';
/** PLAYER_IDENTITY_PERSISTED_SOURCE_TOKEN_SEED：定义该变量以承载业务值。 */
const PLAYER_IDENTITY_PERSISTED_SOURCE_TOKEN_SEED = 'token_seed';
/** PlayerIdentityPersistenceService：定义该变量以承载业务值。 */
let PlayerIdentityPersistenceService = PlayerIdentityPersistenceService_1 = class PlayerIdentityPersistenceService {
    logger = new common_1.Logger(PlayerIdentityPersistenceService_1.name);
    pool = null;
    enabled = false;
/** onModuleInit：执行对应的业务逻辑。 */
    async onModuleInit() {
/** databaseUrl：定义该变量以承载业务值。 */
        const databaseUrl = (0, env_alias_1.resolveServerNextDatabaseUrl)();
        if (!databaseUrl.trim()) {
            this.logger.log('玩家身份持久化已禁用：未提供 SERVER_NEXT_DATABASE_URL/DATABASE_URL');
            return;
        }
        this.pool = new pg_1.Pool({
            connectionString: databaseUrl,
        });
        try {
            await (0, persistent_document_table_1.ensurePersistentDocumentsTable)(this.pool);
            this.enabled = true;
            this.logger.log('玩家身份持久化已启用（persistent_documents）');
        }
        catch (error) {
            this.logger.error('玩家身份持久化初始化失败，已回退为禁用模式', error instanceof Error ? error.stack : String(error));
            await this.safeClosePool();
        }
    }
/** onModuleDestroy：执行对应的业务逻辑。 */
    async onModuleDestroy() {
        await this.safeClosePool();
    }
/** isEnabled：执行对应的业务逻辑。 */
    isEnabled() {
        return this.enabled && this.pool !== null;
    }
/** loadPlayerIdentity：执行对应的业务逻辑。 */
    async loadPlayerIdentity(userId) {
/** normalizedUserId：定义该变量以承载业务值。 */
        const normalizedUserId = normalizeRequiredString(userId);
        if (!this.pool || !this.enabled || !normalizedUserId) {
            return null;
        }
/** result：定义该变量以承载业务值。 */
        const result = await this.pool.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2', [PLAYER_IDENTITY_SCOPE, normalizedUserId]);
        if (result.rowCount === 0) {
            return null;
        }
/** normalized：定义该变量以承载业务值。 */
        const normalized = normalizePlayerIdentity(result.rows[0]?.payload);
        if (!normalized) {
            throw new Error(`Player identity next record invalid: userId=${normalizedUserId}`);
        }
        return normalized;
    }
/** savePlayerIdentity：执行对应的业务逻辑。 */
    async savePlayerIdentity(identity) {
/** normalized：定义该变量以承载业务值。 */
        const normalized = normalizePlayerIdentity(identity);
        if (!this.pool || !this.enabled || !normalized) {
            return null;
        }
        await this.pool.query(`
        INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
        VALUES ($1, $2, $3::jsonb, now())
        ON CONFLICT (scope, key)
        DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
      `, [PLAYER_IDENTITY_SCOPE, normalized.userId, JSON.stringify(normalized)]);
        return normalized;
    }
/** safeClosePool：执行对应的业务逻辑。 */
    async safeClosePool() {
/** pool：定义该变量以承载业务值。 */
        const pool = this.pool;
        this.pool = null;
        this.enabled = false;
        if (pool) {
            await pool.end().catch(() => undefined);
        }
    }
};
exports.PlayerIdentityPersistenceService = PlayerIdentityPersistenceService;
exports.PlayerIdentityPersistenceService = PlayerIdentityPersistenceService = PlayerIdentityPersistenceService_1 = __decorate([
    (0, common_1.Injectable)()
], PlayerIdentityPersistenceService);
/** normalizePlayerIdentity：执行对应的业务逻辑。 */
function normalizePlayerIdentity(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
/** userId：定义该变量以承载业务值。 */
    const userId = normalizeRequiredString(raw.userId);
/** username：定义该变量以承载业务值。 */
    const username = normalizeRequiredString(raw.username);
/** playerId：定义该变量以承载业务值。 */
    const playerId = normalizeRequiredString(raw.playerId);
    if (!userId || !username || !playerId) {
        return null;
    }
/** displayName：定义该变量以承载业务值。 */
    const displayName = normalizeDisplayName(raw.displayName, username);
/** playerName：定义该变量以承载业务值。 */
    const playerName = normalizePlayerName(raw.playerName, username);
    return {
        version: 1,
        userId,
        username,
        displayName,
        playerId,
        playerName,
        persistedSource: normalizePlayerIdentityPersistedSource(raw.persistedSource)
            ?? PLAYER_IDENTITY_PERSISTED_SOURCE_NATIVE,
        updatedAt: Number.isFinite(raw.updatedAt) ? Math.max(0, Math.trunc(raw.updatedAt)) : Date.now(),
    };
}
/** normalizePlayerIdentityPersistedSource：执行对应的业务逻辑。 */
function normalizePlayerIdentityPersistedSource(value) {
    if (value === PLAYER_IDENTITY_PERSISTED_SOURCE_LEGACY_BACKFILL) {
        return PLAYER_IDENTITY_PERSISTED_SOURCE_LEGACY_BACKFILL;
    }
    if (value === PLAYER_IDENTITY_PERSISTED_SOURCE_LEGACY_SYNC) {
        return PLAYER_IDENTITY_PERSISTED_SOURCE_LEGACY_SYNC;
    }
    if (value === PLAYER_IDENTITY_PERSISTED_SOURCE_TOKEN_SEED) {
        return PLAYER_IDENTITY_PERSISTED_SOURCE_TOKEN_SEED;
    }
    if (value === PLAYER_IDENTITY_PERSISTED_SOURCE_NATIVE) {
        return PLAYER_IDENTITY_PERSISTED_SOURCE_NATIVE;
    }
    return null;
}
/** normalizeRequiredString：执行对应的业务逻辑。 */
function normalizeRequiredString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
/** normalizeDisplayName：执行对应的业务逻辑。 */
function normalizeDisplayName(displayName, username) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = typeof displayName === 'string' ? displayName.trim().normalize('NFC') : '';
    if (isValidVisibleDisplayName(normalized)) {
        return normalized;
    }
    return (0, shared_1.resolveDefaultVisibleDisplayName)(username.normalize('NFC'));
}
/** normalizePlayerName：执行对应的业务逻辑。 */
function normalizePlayerName(playerName, username) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = typeof playerName === 'string' ? playerName.trim().normalize('NFC') : '';
    if (normalized) {
        return normalized;
    }
    return username.normalize('NFC');
}
/** isValidVisibleDisplayName：执行对应的业务逻辑。 */
function isValidVisibleDisplayName(value) {
    return typeof value === 'string'
        && value.length > 0
        && (0, shared_1.getGraphemeCount)(value) === 1
        && (0, shared_1.hasVisibleNameGrapheme)(value)
        && !(0, shared_1.containsInvisibleOnlyNameGrapheme)(value);
}
