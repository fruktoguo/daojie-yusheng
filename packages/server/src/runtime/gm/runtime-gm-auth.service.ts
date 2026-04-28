// @ts-nocheck
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

const next_gm_contract_1 = require("../../http/native/native-gm-contract");

const env_alias_1 = require("../../config/env-alias");

/** GM 密码记录 key。 */
const GM_AUTH_KEY = next_gm_contract_1.GM_AUTH_CONTRACT.passwordRecordKey;
const GM_AUTH_TABLE = 'server_gm_auth';

/** 仅用于显式本地降级方案的默认 GM 密码。 */
const DEFAULT_GM_PASSWORD = next_gm_contract_1.GM_AUTH_CONTRACT.defaultInsecurePassword;
const DEVELOPMENT_LIKE_ENVS = new Set(['', 'development', 'dev', 'local', 'test']);

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        assertConfiguredGmPassword();
        this.warnIfUsingInsecureLocalPassword();

        const databaseUrl = (0, env_alias_1.resolveServerDatabaseUrl)();
        if (!databaseUrl.trim()) {
            return;
        }
        this.pool = new pg_1.Pool({
            connectionString: databaseUrl,
        });
        try {
            await ensureGmAuthTable(this.pool);
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const normalizedPassword = typeof password === 'string' ? password : '';

        const record = await this.getOrCreatePasswordRecord();
        if (await verifyPassword(normalizedPassword, record)) {
            this.memoryRecord = record;
            return {
                accessToken: this.issueToken(record),
                expiresInSec: this.getTokenTtlSec(),
            };
        }

        if (!(await verifyPassword(normalizedPassword, record))) {
            throw new common_1.UnauthorizedException('GM 密码错误');
        }
        this.memoryRecord = record;
        return {
            accessToken: this.issueToken(record),
            expiresInSec: this.getTokenTtlSec(),
        };
    }
    /** 修改 GM 密码，同时兼容旧记录回退校验。 */
    async changePassword(currentPassword, newPassword) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const normalizedCurrentPassword = typeof currentPassword === 'string' ? currentPassword : '';

        const record = await this.getOrCreatePasswordRecord();

        const currentVerified = await verifyPassword(normalizedCurrentPassword, record);

        if (!currentVerified) {
            throw new common_1.UnauthorizedException('当前 GM 密码错误');
        }

        const normalizedPassword = typeof newPassword === 'string' ? newPassword.trim() : '';
        if (normalizedPassword.length < 6) {
            throw new common_1.BadRequestException('GM 密码至少需要 6 位');
        }
        if (normalizedPassword === DEFAULT_GM_PASSWORD && !canUseInsecureLocalGmPassword()) {
            throw new common_1.BadRequestException('禁止把 GM 密码设置为默认值 admin123；如需本地临时降级，必须在开发环境显式开启 SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD=1。');
        }
        if (!this.persistenceEnabled || !this.pool) {
            throw new common_1.BadRequestException('未启用数据库持久化，当前不支持修改 GM 密码');
        }

        const nextRecord = buildPasswordRecord(normalizedPassword);
        await this.savePasswordRecordToDb(nextRecord);
    }
    /** 校验签名 token 是否仍然有效。 */
    validateAccessToken(token) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const configured = process.env.SERVER_GM_AUTH_SECRET?.trim()
            || process.env.GM_AUTH_SECRET?.trim()
            || '';
        if (configured) {
            return configured;
        }

        const source = record ?? this.memoryRecord;
        if (source) {
            return `${source.hash}:${source.salt}:${source.updatedAt}`;
        }
        return 'server-gm-http-auth';
    }
    /** 读取 token 的有效期。 */
    getTokenTtlSec() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const configured = Number(process.env.SERVER_GM_TOKEN_EXPIRES_IN ?? process.env.GM_TOKEN_EXPIRES_IN ?? Number.NaN);
        if (Number.isFinite(configured) && configured > 0) {
            return Math.max(60, Math.trunc(configured));
        }
        return DEFAULT_TOKEN_TTL_SEC;
    }
    /** 读取或创建当前的密码记录。 */
    async getOrCreatePasswordRecord() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (this.persistenceEnabled && this.pool) {

            const loaded = await this.loadPasswordRecordFromDb();
            if (loaded) {
                this.memoryRecord = loaded;
                return loaded;
            }

            const created = buildPasswordRecord(this.getInitialPassword());
            await this.savePasswordRecordToDb(created);
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.pool) {
            return null;
        }

        const result = await this.pool.query(
            `
              SELECT salt, password_hash, updated_at_text, raw_payload
              FROM ${GM_AUTH_TABLE}
              WHERE record_key = $1
              LIMIT 1
            `,
            [GM_AUTH_KEY],
        );
        if (result.rowCount > 0) {
            const row = result.rows[0] ?? {};
            return normalizePasswordRecord({
                ...(row.raw_payload && typeof row.raw_payload === 'object' ? row.raw_payload : {}),
                salt: row.salt,
                hash: row.password_hash,
                updatedAt: row.updated_at_text,
            });
        }
        return null;
    }
    /**
 * savePasswordRecordToDb：写入 GM 密码专表。
 * @param record 参数说明。
 * @returns 无返回值，直接更新 GM 鉴权记录。
 */

    async savePasswordRecordToDb(record) {
        if (!this.pool) {
            return;
        }
        const normalized = normalizePasswordRecord(record);
        if (!normalized) {
            return;
        }
        await this.pool.query(`
          INSERT INTO ${GM_AUTH_TABLE}(
            record_key,
            salt,
            password_hash,
            updated_at_text,
            raw_payload,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, now())
          ON CONFLICT (record_key)
          DO UPDATE SET
            salt = EXCLUDED.salt,
            password_hash = EXCLUDED.password_hash,
            updated_at_text = EXCLUDED.updated_at_text,
            raw_payload = EXCLUDED.raw_payload,
            updated_at = now()
        `, [GM_AUTH_KEY, normalized.salt, normalized.hash, normalized.updatedAt, JSON.stringify(normalized)]);
    }
    /**
 * getInitialPassword：读取InitialPassword。
 * @returns 无返回值，完成InitialPassword的读取/组装。
 */

    getInitialPassword() {
        assertConfiguredGmPassword();
        const configuredPassword = (0, env_alias_1.resolveServerGmPassword)('');
        if (configuredPassword) {
            return configuredPassword;
        }
        return DEFAULT_GM_PASSWORD;
    }
    /**
 * warnIfUsingInsecureLocalPassword：记录显式本地降级警告。
 * @returns 无返回值，直接更新warnIfUsingInsecureLocalPassword相关状态。
 */

    warnIfUsingInsecureLocalPassword() {
        if (!canUseInsecureLocalGmPassword()) {
            return;
        }
        this.logger.warn('GM 鉴权当前显式启用了本地不安全降级：使用默认密码 admin123。该模式仅允许 development/dev/local/test，且不得用于 shadow、acceptance、full 或生产环境。');
    }
    /**
 * closePool：执行closePool相关逻辑。
 * @returns 无返回值，直接更新closePool相关状态。
 */

    async closePool() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
export { RuntimeGmAuthService };

async function ensureGmAuthTable(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS ${GM_AUTH_TABLE} (
            record_key varchar(80) PRIMARY KEY,
            salt varchar(160) NOT NULL,
            password_hash varchar(256) NOT NULL,
            updated_at_text varchar(80) NOT NULL,
            raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            updated_at timestamptz NOT NULL DEFAULT now()
          )
        `);
    }
    finally {
        client.release();
    }
}
/**
 * normalizePasswordRecord：规范化或转换PasswordRecord。
 * @param raw 参数说明。
 * @returns 无返回值，直接更新PasswordRecord相关状态。
 */

function normalizePasswordRecord(raw) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * buildPasswordRecord：构建并返回目标对象。
 * @param password 参数说明。
 * @returns 无返回值，直接更新PasswordRecord相关状态。
 */

function buildPasswordRecord(password) {

    const salt = crypto.randomBytes(16).toString('hex');
    return {
        salt,
        hash: hashPassword(password, salt),
        updatedAt: new Date().toISOString(),
    };
}
/**
 * hashPassword：判断hashPassword是否满足条件。
 * @param password 参数说明。
 * @param salt 参数说明。
 * @returns 无返回值，完成hashPassword的条件判断。
 */

function hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString('hex');
}
/**
 * verifyPassword：执行verifyPassword相关逻辑。
 * @param password 参数说明。
 * @param record 参数说明。
 * @returns 无返回值，直接更新verifyPassword相关状态。
 */

async function verifyPassword(password, record) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * signTokenPayload：读取signToken载荷并返回结果。
 * @param payloadBase64 参数说明。
 * @param secret 参数说明。
 * @returns 无返回值，直接更新signToken载荷相关状态。
 */

function signTokenPayload(payloadBase64, secret) {
    return encodeBase64Url(crypto.createHmac('sha256', secret).update(payloadBase64).digest());
}
/**
 * encodeBase64Url：执行encodeBase64Url相关逻辑。
 * @param input 输入参数。
 * @returns 无返回值，直接更新encodeBase64Url相关状态。
 */

function encodeBase64Url(input) {

    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
    return buffer.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}
/**
 * decodeBase64Url：执行decodeBase64Url相关逻辑。
 * @param input 输入参数。
 * @returns 无返回值，直接更新decodeBase64Url相关状态。
 */

function decodeBase64Url(input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * safeEqual：执行safeEqual相关逻辑。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，直接更新safeEqual相关状态。
 */

function safeEqual(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const leftBuffer = Buffer.from(left, 'utf8');

    const rightBuffer = Buffer.from(right, 'utf8');
    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
/**
 * assertConfiguredGmPassword：执行assertConfiguredGMPassword相关逻辑。
 * @returns 无返回值，直接更新assertConfiguredGMPassword相关状态。
 */

function assertConfiguredGmPassword() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const envSource = (0, env_alias_1.resolveServerGmPasswordEnvSource)();
    const password = (0, env_alias_1.resolveServerGmPassword)('');
    const allowInsecureLocalPassword = (0, env_alias_1.resolveServerAllowInsecureLocalGmPassword)();
    if (allowInsecureLocalPassword && !isDevelopmentLikeEnv()) {
        throw new Error('SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD 或 GM_ALLOW_INSECURE_LOCAL_GM_PASSWORD 只能在 development/dev/local/test 环境使用。');
    }
    if (password && password !== DEFAULT_GM_PASSWORD) {
        return;
    }
    if (password === DEFAULT_GM_PASSWORD) {
        if (allowInsecureLocalPassword) {
            return;
        }
        if (envSource) {
            throw new Error('禁止把 GM 密码显式配置为默认值 admin123；如需本地临时降级，必须删除显式密码并仅在开发环境设置 SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD=1。');
        }
        throw new Error('必须显式配置 SERVER_GM_PASSWORD 或 GM_PASSWORD；禁止默认回退到 admin123。仅本地开发可通过 SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD=1 临时启用默认密码。');
    }
    if (!envSource && !allowInsecureLocalPassword) {
        throw new Error('必须显式配置 SERVER_GM_PASSWORD 或 GM_PASSWORD；如需本地开发临时使用默认密码，必须显式设置 SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD=1，且仅限 development/dev/local/test。');
    }
}
/**
 * isDevelopmentLikeEnv：判断DevelopmentLikeEnv是否满足条件。
 * @returns 无返回值，完成DevelopmentLikeEnv的条件判断。
 */

function isDevelopmentLikeEnv() {
    const runtimeEnv = String(process.env.SERVER_RUNTIME_ENV ?? process.env.APP_ENV ?? process.env.NODE_ENV ?? '').trim().toLowerCase();
    return DEVELOPMENT_LIKE_ENVS.has(runtimeEnv);
}
/**
 * canUseInsecureLocalGmPassword：判断是否允许显式本地 GM 不安全降级。
 * @returns 返回是否允许显式本地 GM 不安全降级。
 */

function canUseInsecureLocalGmPassword() {
    return isDevelopmentLikeEnv() && (0, env_alias_1.resolveServerAllowInsecureLocalGmPassword)();
}
