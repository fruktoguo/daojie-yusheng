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

const next_gm_contract_1 = require("../../http/next/next-gm-contract");

const persistent_document_table_1 = require("../../persistence/persistent-document-table");

const env_alias_1 = require("../../config/env-alias");

/** GM 鉴权作用域名，存放当前 next 体系的密码记录。 */
const GM_AUTH_SCOPE = next_gm_contract_1.NEXT_GM_AUTH_CONTRACT.passwordRecordScope;

/** persistent_documents 里保存 GM 密码的 key。 */
const GM_AUTH_KEY = next_gm_contract_1.NEXT_GM_AUTH_CONTRACT.passwordRecordKey;

/** 没有配置时使用的默认 GM 密码。 */
const DEFAULT_GM_PASSWORD = 'admin123';
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const configured = Number(process.env.SERVER_NEXT_GM_TOKEN_EXPIRES_IN ?? process.env.GM_TOKEN_EXPIRES_IN ?? Number.NaN);
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.pool) {
            return null;
        }

        const result = await this.pool.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2', [GM_AUTH_SCOPE, GM_AUTH_KEY]);
        if (result.rowCount > 0) {
            return normalizePasswordRecord(result.rows[0]?.payload);
        }
        return null;
    }    
    /**
 * getInitialPassword：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

    getInitialPassword() {
        assertConfiguredGmPassword();
        return (0, env_alias_1.resolveServerNextGmPassword)(DEFAULT_GM_PASSWORD);
    }    
    /**
 * closePool：执行核心业务逻辑。
 * @returns 函数返回值。
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
/**
 * normalizePasswordRecord：执行核心业务逻辑。
 * @param raw 参数说明。
 * @returns 函数返回值。
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
 * @returns 函数返回值。
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
 * hashPassword：执行状态校验并返回判断结果。
 * @param password 参数说明。
 * @param salt 参数说明。
 * @returns 函数返回值。
 */

function hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString('hex');
}
/**
 * verifyPassword：执行核心业务逻辑。
 * @param password 参数说明。
 * @param record 参数说明。
 * @returns 函数返回值。
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
 * signTokenPayload：执行核心业务逻辑。
 * @param payloadBase64 参数说明。
 * @param secret 参数说明。
 * @returns 函数返回值。
 */

function signTokenPayload(payloadBase64, secret) {
    return encodeBase64Url(crypto.createHmac('sha256', secret).update(payloadBase64).digest());
}
/**
 * encodeBase64Url：执行核心业务逻辑。
 * @param input 输入参数。
 * @returns 函数返回值。
 */

function encodeBase64Url(input) {

    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
    return buffer.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}
/**
 * decodeBase64Url：执行核心业务逻辑。
 * @param input 输入参数。
 * @returns 函数返回值。
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
 * safeEqual：执行核心业务逻辑。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 函数返回值。
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
 * assertConfiguredGmPassword：执行核心业务逻辑。
 * @returns 函数返回值。
 */

function assertConfiguredGmPassword() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const password = (0, env_alias_1.resolveServerNextGmPassword)(DEFAULT_GM_PASSWORD);
    if (isDevelopmentLikeEnv()) {
        return;
    }
    const envSource = (0, env_alias_1.resolveServerNextGmPasswordEnvSource)();
    if (!envSource) {
        throw new Error('非开发环境必须显式配置 SERVER_NEXT_GM_PASSWORD 或 GM_PASSWORD，禁止继续回退默认 GM 密码。');
    }
    if (password === DEFAULT_GM_PASSWORD) {
        throw new Error('非开发环境禁止使用默认 GM 密码 admin123，请改为安全配置中的独立密码。');
    }
}
/**
 * isDevelopmentLikeEnv：执行状态校验并返回判断结果。
 * @returns 函数返回值。
 */

function isDevelopmentLikeEnv() {
    const runtimeEnv = String(process.env.SERVER_NEXT_RUNTIME_ENV ?? process.env.APP_ENV ?? process.env.NODE_ENV ?? '').trim().toLowerCase();
    return DEVELOPMENT_LIKE_ENVS.has(runtimeEnv);
}
