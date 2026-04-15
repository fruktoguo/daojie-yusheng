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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeGmAuthService = void 0;

const common_1 = require("@nestjs/common");

const bcrypt = require("bcryptjs");

const crypto = require("node:crypto");

const pg_1 = require("pg");

const persistent_document_table_1 = require("../../persistence/persistent-document-table");

const env_alias_1 = require("../../config/env-alias");

/** GM 鉴权作用域名，存放当前 next 体系的密码记录。 */
const GM_AUTH_SCOPE = 'server_next_gm_auth_v1';

/** 兼容从旧体系迁移过来的 GM 鉴权作用域名。 */
const LEGACY_NEXT_GM_AUTH_SCOPE = 'server_next_legacy_gm_auth_v1';

/** persistent_documents 里保存 GM 密码的 key。 */
const GM_AUTH_KEY = 'gm_auth';

/** 旧系统里用于读取 GM 密码的作用域。 */
const LEGACY_GM_AUTH_SCOPE = 'server_config';

/** 没有配置时使用的默认 GM 密码。 */
const DEFAULT_GM_PASSWORD = 'admin123';
// TODO(next:SEC02): 禁止生产环境默认 GM 密码启动；正式环境应强制来自安全配置而不是 admin123 回退。

/** 默认 token 有效期。 */
const DEFAULT_TOKEN_TTL_SEC = 12 * 60 * 60;

/** 兼容旧 bcrypt 记录时使用的哨兵盐值。 */
const LEGACY_BCRYPT_SENTINEL_SALT = '__legacy_bcrypt__';

let RuntimeGmAuthService = class RuntimeGmAuthService {
    /** 运行时日志器，记录鉴权初始化和登录异常。 */
    logger = new common_1.Logger(RuntimeGmAuthService.name);
    /** 数据库连接池，未启用持久化时保持为空。 */
    pool = null;
    /** 是否已经成功接入持久化存储。 */
    persistenceEnabled = false;
    /** 当前驻留在内存里的密码记录。 */
    memoryRecord = null;
    /** 初始化鉴权持久化连接。 */
    async onModuleInit() {

        const databaseUrl = (0, env_alias_1.resolveServerNextDatabaseUrl)();
        if (!databaseUrl.trim()) {
            return;
        }
        this.pool = new pg_1.Pool({
            connectionString: databaseUrl,
        });
        try {
            await (0, persistent_document_table_1.ensurePersistentDocumentsTable)(this.pool);
            this.persistenceEnabled = true;
        }
        catch (error) {
            this.logger.error('运行时 GM 鉴权持久化初始化失败', error instanceof Error ? error.stack : String(error));
            await this.closePool();
        }
    }
    /** 销毁时关闭数据库连接池。 */
    async onModuleDestroy() {
        await this.closePool();
    }
    /** 校验 GM 密码并签发访问 token。 */
    async login(password) {

        const normalizedPassword = typeof password === 'string' ? password : '';

        const record = await this.getOrCreatePasswordRecord();
        if (await verifyPassword(normalizedPassword, record)) {
            this.memoryRecord = record;
            return {
                accessToken: this.issueToken(record),
                expiresInSec: this.getTokenTtlSec(),
            };
        }

        const legacyRecord = await this.loadLegacyPasswordRecordFromDb();
        if (!legacyRecord || !(await verifyPassword(normalizedPassword, legacyRecord))) {
            throw new common_1.UnauthorizedException('GM 密码错误');
        }
        this.memoryRecord = legacyRecord;
        return {
            accessToken: this.issueToken(legacyRecord),
            expiresInSec: this.getTokenTtlSec(),
        };
    }
    /** 修改 GM 密码，同时兼容旧记录回退校验。 */
    async changePassword(currentPassword, newPassword) {

        const normalizedCurrentPassword = typeof currentPassword === 'string' ? currentPassword : '';

        const record = await this.getOrCreatePasswordRecord();

        const currentVerified = await verifyPassword(normalizedCurrentPassword, record);

        const legacyRecord = currentVerified ? null : await this.loadLegacyPasswordRecordFromDb();
        if (!currentVerified && (!legacyRecord || !(await verifyPassword(normalizedCurrentPassword, legacyRecord)))) {
            throw new common_1.UnauthorizedException('当前 GM 密码错误');
        }

        const normalizedPassword = typeof newPassword === 'string' ? newPassword.trim() : '';
        if (normalizedPassword.length < 6) {
            throw new common_1.BadRequestException('GM 密码至少需要 6 位');
        }
        if (!this.persistenceEnabled || !this.pool) {
            throw new common_1.BadRequestException('未启用数据库持久化，当前不支持修改 GM 密码');
        }

        const nextRecord = buildPasswordRecord(normalizedPassword);
        await this.pool.query(`
        INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
        VALUES ($1, $2, $3::jsonb, now())
        ON CONFLICT (scope, key)
        DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
        `, [GM_AUTH_SCOPE, GM_AUTH_KEY, JSON.stringify(nextRecord)]);
    }
    /** 校验签名 token 是否仍然有效。 */
    validateAccessToken(token) {

        const normalizedToken = typeof token === 'string' ? token.trim() : '';
        if (!normalizedToken) {
            return false;
        }

        const parts = normalizedToken.split('.');
        if (parts.length !== 3 || parts[0] !== 'v1') {
            return false;
        }

        const payloadJson = decodeBase64Url(parts[1]);
        if (!payloadJson) {
            return false;
        }

        let payload;
        try {
            payload = JSON.parse(payloadJson);
        }
        catch {
            return false;
        }
        if (payload?.role !== 'gm' || !Number.isFinite(payload?.exp) || payload.exp <= Date.now()) {
            return false;
        }
        if (typeof payload?.rev === 'string' && this.memoryRecord && payload.rev !== this.memoryRecord.updatedAt) {
            return false;
        }

        const expectedSignature = signTokenPayload(parts[1], this.getSigningSecret());
        return safeEqual(parts[2], expectedSignature);
    }
    /** 从持久化层重新载入密码记录。 */
    async reloadPasswordRecordFromPersistence() {
        if (!this.persistenceEnabled || !this.pool) {
            this.memoryRecord = null;
            return;
        }
        this.memoryRecord = await this.loadPasswordRecordFromDb();
    }
    /** 生成当前记录对应的访问 token。 */
    issueToken(record) {

        const payloadBase64 = encodeBase64Url(JSON.stringify({
            role: 'gm',
            exp: Date.now() + this.getTokenTtlSec() * 1000,
            rev: record.updatedAt,
        }));

        const signature = signTokenPayload(payloadBase64, this.getSigningSecret(record));
        return `v1.${payloadBase64}.${signature}`;
    }
    /** 计算 token 签名所用的密钥。 */
    getSigningSecret(record = null) {

        const configured = process.env.SERVER_NEXT_GM_AUTH_SECRET?.trim()
            || process.env.GM_AUTH_SECRET?.trim()
            || '';
        if (configured) {
            return configured;
        }

        const source = record ?? this.memoryRecord;
        if (source) {
            return `${source.hash}:${source.salt}:${source.updatedAt}`;
        }
        return 'server-next-gm-http-auth';
    }
    /** 读取 token 的有效期。 */
    getTokenTtlSec() {

        const configured = Number(process.env.SERVER_NEXT_GM_TOKEN_EXPIRES_IN ?? process.env.GM_TOKEN_EXPIRES_IN ?? Number.NaN);
        if (Number.isFinite(configured) && configured > 0) {
            return Math.max(60, Math.trunc(configured));
        }
        return DEFAULT_TOKEN_TTL_SEC;
    }
    /** 读取或创建当前的密码记录。 */
    async getOrCreatePasswordRecord() {
        if (this.persistenceEnabled && this.pool) {

            const loaded = await this.loadPasswordRecordFromDb();
            if (loaded) {
                this.memoryRecord = loaded;
                return loaded;
            }

            const created = buildPasswordRecord(this.getInitialPassword());
            await this.pool.query(`
          INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
          VALUES ($1, $2, $3::jsonb, now())
          ON CONFLICT (scope, key)
          DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
        `, [GM_AUTH_SCOPE, GM_AUTH_KEY, JSON.stringify(created)]);
            this.memoryRecord = created;
            return created;
        }
        if (!this.memoryRecord) {
            this.memoryRecord = buildPasswordRecord(this.getInitialPassword());
        }
        return this.memoryRecord;
    }
    /** 从数据库读取密码记录。 */
    async loadPasswordRecordFromDb() {
        if (!this.pool) {
            return null;
        }

        for (const scope of [GM_AUTH_SCOPE, LEGACY_NEXT_GM_AUTH_SCOPE]) {
            const result = await this.pool.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2', [scope, GM_AUTH_KEY]);
            if (result.rowCount > 0) {
                return normalizePasswordRecord(result.rows[0]?.payload);
            }
        }
        return null;
    }
    async loadLegacyPasswordRecordFromDb() {
        if (!this.pool) {
            return null;
        }

        for (const scope of [LEGACY_GM_AUTH_SCOPE, LEGACY_NEXT_GM_AUTH_SCOPE]) {
            const legacyResult = await this.pool.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2', [scope, GM_AUTH_KEY]);
            if (legacyResult.rowCount > 0) {
                return normalizePasswordRecord(legacyResult.rows[0]?.payload);
            }
        }
        return null;
    }
    getInitialPassword() {
        return (0, env_alias_1.resolveServerNextGmPassword)(DEFAULT_GM_PASSWORD);
    }
    async closePool() {

        const pool = this.pool;
        this.pool = null;
        this.persistenceEnabled = false;
        if (pool) {
            await pool.end().catch(() => undefined);
        }
    }
};
exports.RuntimeGmAuthService = RuntimeGmAuthService;
exports.RuntimeGmAuthService = RuntimeGmAuthService = __decorate([
    (0, common_1.Injectable)()
], RuntimeGmAuthService);
function normalizePasswordRecord(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const candidate = raw;
    if (typeof candidate.passwordHash === 'string' && candidate.passwordHash
        && typeof candidate.updatedAt === 'string' && candidate.updatedAt) {
        return {
            salt: LEGACY_BCRYPT_SENTINEL_SALT,
            hash: candidate.passwordHash,
            updatedAt: candidate.updatedAt,
        };
    }
    if (typeof candidate.salt !== 'string' || !candidate.salt
        || typeof candidate.hash !== 'string' || !candidate.hash
        || typeof candidate.updatedAt !== 'string' || !candidate.updatedAt) {
        return null;
    }
    return {
        salt: candidate.salt,
        hash: candidate.hash,
        updatedAt: candidate.updatedAt,
    };
}
function buildPasswordRecord(password) {

    const salt = crypto.randomBytes(16).toString('hex');
    return {
        salt,
        hash: hashPassword(password, salt),
        updatedAt: new Date().toISOString(),
    };
}
function hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString('hex');
}
async function verifyPassword(password, record) {
    if (record.salt === LEGACY_BCRYPT_SENTINEL_SALT) {
        try {
            return bcrypt.compareSync(password, record.hash);
        }
        catch {
            return false;
        }
    }
    return safeEqual(hashPassword(password, record.salt), record.hash);
}
function signTokenPayload(payloadBase64, secret) {
    return encodeBase64Url(crypto.createHmac('sha256', secret).update(payloadBase64).digest());
}
function encodeBase64Url(input) {

    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
    return buffer.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}
function decodeBase64Url(input) {
    if (typeof input !== 'string' || !input) {
        return null;
    }

    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');

    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    try {
        return Buffer.from(padded, 'base64').toString('utf8');
    }
    catch {
        return null;
    }
}
function safeEqual(left, right) {

    const leftBuffer = Buffer.from(left, 'utf8');

    const rightBuffer = Buffer.from(right, 'utf8');
    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
