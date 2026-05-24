/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
import { Injectable, BadRequestException, Logger, UnauthorizedException, Inject } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { GM_AUTH_CONTRACT } from '../../http/native/native-gm-contract';
import {
    resolveServerAllowInsecureLocalGmPassword,
    resolveServerDatabaseUrl,
    resolveServerGmAuthSecret,
    resolveServerGmAuthSecretEnvSource,
    resolveServerGmPassword,
    resolveServerGmPasswordEnvSource,
} from '../../config/env-alias';
import { DatabasePoolProvider } from '../../persistence/database-pool.provider';

/**
 * 异步 scrypt：在 libuv 线程池中计算，不阻塞 Node.js 事件循环。
 * GM 登录、改密、初始化都是高延迟敏感路径，必须避免主线程同步阻塞。
 * 与玩家侧 auth/password-hash.ts 同套机制，但 GM 记录维持独立 salt + hex hash 存储格式。
 */
const scryptAsync = promisify(scryptCallback) as (
    password: string,
    salt: string,
    keyLength: number,
) => Promise<Buffer>;

/** GM 密码记录字段。 */
interface GmPasswordRecord {
    salt: string;
    hash: string;
    updatedAt: string;
}

/**
 * GM token 校验完整结果。
 * - ok=true 时携带 payload.rev / exp 供 Guard 落 audit actor.tokenRev；
 * - ok=false 时携带 reason 供 Guard / 监控 / 限流分级使用。
 */
export type GmAuthValidationResult =
    | { ok: true; rev: string | null; exp: number }
    | { ok: false; reason: 'empty_token' | 'malformed_token' | 'role_mismatch' | 'expired' | 'rev_mismatch' | 'signature_mismatch' };

/** GM 密码记录 key。 */
const GM_AUTH_KEY = GM_AUTH_CONTRACT.passwordRecordKey;
const GM_AUTH_TABLE = 'server_gm_auth';

/** 仅用于显式本地降级方案的默认 GM 密码。 */
const DEFAULT_GM_PASSWORD = GM_AUTH_CONTRACT.defaultInsecurePassword;
const DEVELOPMENT_LIKE_ENVS = new Set(['', 'development', 'dev', 'local', 'test']);

/** 默认 token 有效期。 */
const DEFAULT_TOKEN_TTL_SEC = 12 * 60 * 60;

/** 兼容旧 bcrypt 记录时使用的哨兵盐值。 */
const LEGACY_BCRYPT_SENTINEL_SALT = '__legacy_bcrypt__';
const gmAuthModuleLogger = new Logger('RuntimeGmAuth');

@Injectable()
export class RuntimeGmAuthService {
    /** 运行时日志器，记录鉴权初始化和登录异常。 */
    logger = new Logger(RuntimeGmAuthService.name);
    /** 数据库连接池，未启用持久化时保持为空。 */
    pool = null;
    /** 是否已经成功接入持久化存储。 */
    persistenceEnabled = false;
    /** 当前驻留在内存里的密码记录。 */
    memoryRecord = null;

    databasePoolProvider;

    constructor(@Inject(DatabasePoolProvider) databasePoolProvider: any = undefined) {
        this.databasePoolProvider = databasePoolProvider;
    }

    /** 初始化鉴权持久化连接。 */
    async onModuleInit() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        assertConfiguredGmPassword();
        this.warnIfUsingInsecureLocalPassword();
        this.warnIfUsingPlayerTokenSecretFallback();

        const databaseUrl = resolveServerDatabaseUrl();
        if (!databaseUrl.trim()) {
            return;
        }
        const sharedPool = this.databasePoolProvider?.getPool?.('gm-auth');
        if (!sharedPool) {
            this.logger.warn('运行时 GM 鉴权持久化已禁用：数据库连接池提供者未提供连接池');
            return;
        }
        this.pool = sharedPool;
        try {
            await ensureGmAuthTable(this.pool);
            this.persistenceEnabled = true;
        }
        catch (error) {
            this.logger.error('运行时 GM 鉴权持久化初始化失败', error instanceof Error ? error.stack : String(error));
            this.releasePoolReference();
        }
    }
    /** 销毁时释放连接池引用，由 DatabasePoolProvider 统一关闭。 */
    async onModuleDestroy() {
        this.releasePoolReference();
    }

    /**
     * N48：若校验通过的记录仍是旧 bcrypt 哨兵盐格式，则在登录成功后异步迁移到 scrypt 真盐格式。
     * 迁移失败不阻断登录主路径（避免 DB 抖动连带影响 GM 登录）；下次登录还会重试。
     * 持久化禁用时直接返回原记录。
     */
    private async maybeMigrateLegacyRecord(password: string, record: GmPasswordRecord): Promise<GmPasswordRecord> {
        if (record.salt !== LEGACY_BCRYPT_SENTINEL_SALT) {
            return record;
        }
        if (!this.persistenceEnabled || !this.pool) {
            return record;
        }
        try {
            const migrated = await buildPasswordRecord(password);
            await this.savePasswordRecordToDb(migrated);
            this.logger.log('GM 密码记录已从旧版 bcrypt 迁移到 scrypt 格式');
            return migrated;
        }
        catch (error) {
            this.logger.warn(`GM 密码旧版迁移失败，下次登录会重试：${error instanceof Error ? error.message : String(error)}`);
            return record;
        }
    }
    /** 校验 GM 密码并签发访问 token。 */
    async login(password) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const normalizedPassword = typeof password === 'string' ? password : '';

        const record = await this.getOrCreatePasswordRecord();
        if (!(await verifyPassword(normalizedPassword, record))) {
            throw new UnauthorizedException('GM 密码错误');
        }

        // N48：登录成功且当前记录是旧 bcrypt 哨兵格式时，自动迁移到 scrypt；
        // 失败不阻断登录主路径，下次登录还会再尝试一次。
        const effectiveRecord = await this.maybeMigrateLegacyRecord(normalizedPassword, record);
        this.memoryRecord = effectiveRecord;
        return {
            accessToken: this.issueToken(effectiveRecord),
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
            throw new UnauthorizedException('当前 GM 密码错误');
        }

        const normalizedPassword = typeof newPassword === 'string' ? newPassword.trim() : '';
        if (normalizedPassword.length < 12) {
            throw new BadRequestException('GM 密码至少需要 12 位');
        }
        if (normalizedPassword === DEFAULT_GM_PASSWORD && !canUseInsecureLocalGmPassword()) {
            throw new BadRequestException('禁止把 GM 密码设置为默认值 admin123；如需本地临时降级，必须在开发环境显式开启 SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD=1。');
        }
        if (!this.persistenceEnabled || !this.pool) {
            throw new BadRequestException('未启用数据库持久化，当前不支持修改 GM 密码');
        }

        const nextRecord = await buildPasswordRecord(normalizedPassword);
        await this.savePasswordRecordToDb(nextRecord);
    }
    /** 校验签名 token 是否仍然有效。 */
    validateAccessToken(token) {
        return this.validateAndExtractAccessToken(token).ok;
    }

    /**
     * 校验 token 并返回完整结果，供 Guard 抽取 actor.tokenRev。
     * N45：boolean 兼容 API 上面保留；本方法用于挂 audit actor 上下文。
     */
    validateAndExtractAccessToken(token: unknown): GmAuthValidationResult {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const normalizedToken = typeof token === 'string' ? token.trim() : '';
        if (!normalizedToken) {
            return { ok: false, reason: 'empty_token' };
        }

        const parts = normalizedToken.split('.');
        if (parts.length !== 3 || parts[0] !== 'v1') {
            return { ok: false, reason: 'malformed_token' };
        }

        const payloadJson = decodeBase64Url(parts[1]);
        if (!payloadJson) {
            return { ok: false, reason: 'malformed_token' };
        }

        let payload: { role?: unknown; exp?: unknown; rev?: unknown } | null = null;
        try {
            payload = JSON.parse(payloadJson);
        }
        catch {
            return { ok: false, reason: 'malformed_token' };
        }
        if (!payload || payload.role !== 'gm') {
            return { ok: false, reason: 'role_mismatch' };
        }
        if (!Number.isFinite(payload.exp) || (payload.exp as number) <= Date.now()) {
            return { ok: false, reason: 'expired' };
        }
        if (typeof payload.rev === 'string' && this.memoryRecord && payload.rev !== this.memoryRecord.updatedAt) {
            return { ok: false, reason: 'rev_mismatch' };
        }

        const expectedSignature = signTokenPayload(parts[1], this.getSigningSecret());
        if (!safeEqual(parts[2], expectedSignature)) {
            return { ok: false, reason: 'signature_mismatch' };
        }
        return {
            ok: true,
            rev: typeof payload.rev === 'string' ? payload.rev : null,
            exp: payload.exp as number,
        };
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

        const configured = resolveServerGmAuthSecret();
        if (configured) {
            return configured;
        }

        const source = record ?? this.memoryRecord;
        if (source) {
            return `${source.hash}:${source.salt}:${source.updatedAt}`;
        }
        throw new Error('GM 签名密钥未配置：请设置 SERVER_GM_AUTH_SECRET 环境变量或确保数据库中存在密码记录。');
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

            const created = await buildPasswordRecord(this.getInitialPassword());
            await this.savePasswordRecordToDb(created);
            this.memoryRecord = created;
            return created;
        }
        if (!this.memoryRecord) {
            this.memoryRecord = await buildPasswordRecord(this.getInitialPassword());
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
        const configuredPassword = resolveServerGmPassword('');
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
    /** 未单独配置 GM token 密钥时，启动期明确告警并复用玩家 Token 签名密钥。 */
    warnIfUsingPlayerTokenSecretFallback() {
        const source = resolveServerGmAuthSecretEnvSource();
        if (source !== 'SERVER_PLAYER_TOKEN_SECRET' && source !== 'JWT_SECRET') {
            return;
        }
        this.logger.warn(`未配置 SERVER_GM_AUTH_SECRET，已复用 ${source} 作为 GM Token 签名密钥`);
    }
    /**
 * releasePoolReference：释放对共享连接池的引用，由 DatabasePoolProvider 统一关闭真正的连接池。
 * @returns 无返回值，直接更新连接池引用相关状态。
 */

    releasePoolReference() {
        this.pool = null;
        this.persistenceEnabled = false;
    }
};

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
 * buildPasswordRecord：构建并返回 GM 密码记录。
 * @param password GM 明文密码。
 * @returns 包含 salt / hash / updatedAt 的密码记录；hash 通过异步 scrypt 派生。
 */

async function buildPasswordRecord(password: string): Promise<GmPasswordRecord> {

    const salt = randomBytes(16).toString('hex');
    return {
        salt,
        hash: await hashPassword(password, salt),
        updatedAt: new Date().toISOString(),
    };
}
/**
 * hashPassword：使用异步 scrypt 派生 64 字节密钥并以 hex 表达。
 * @param password 明文密码（非 string 时按空串处理）。
 * @param salt 与记录绑定的 hex 字符串 salt。
 * @returns hex 编码的 64 字节派生密钥。
 */

async function hashPassword(password: unknown, salt: string): Promise<string> {
    const normalizedPassword = typeof password === 'string' ? password : '';
    const derived = await scryptAsync(normalizedPassword, salt, 64);
    return derived.toString('hex');
}
/**
 * verifyPassword：执行verifyPassword相关逻辑。
 * @param password 参数说明。
 * @param record 参数说明。
 * @returns 无返回值，直接更新verifyPassword相关状态。
 */

async function verifyPassword(password: unknown, record: GmPasswordRecord): Promise<boolean> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalizedPassword = typeof password === 'string' ? password : '';
    if (record.salt === LEGACY_BCRYPT_SENTINEL_SALT) {
        // N48：旧 bcrypt 记录改走异步 bcrypt.compare，避免一次性 100ms 主线程阻塞；
        // 单进程登录风暴下，60 个登录请求会被错峰摊到 libuv 线程池，而不是同步串成 6 秒事件循环冻结。
        gmAuthModuleLogger.warn('GM 密码验证走旧版 bcrypt 兼容路径，请尽快通过 GM 面板重设密码以迁移到 scrypt 格式');
        try {
            return await bcrypt.compare(normalizedPassword, record.hash);
        }
        catch {
            return false;
        }
    }
    return safeEqual(await hashPassword(normalizedPassword, record.salt), record.hash);
}
/**
 * signTokenPayload：读取signToken载荷并返回结果。
 * @param payloadBase64 参数说明。
 * @param secret 参数说明。
 * @returns 无返回值，直接更新signToken载荷相关状态。
 */

function signTokenPayload(payloadBase64, secret) {
    return encodeBase64Url(createHmac('sha256', secret).update(payloadBase64).digest());
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
    return timingSafeEqual(leftBuffer, rightBuffer);
}
/**
 * assertConfiguredGmPassword：执行assertConfiguredGMPassword相关逻辑。
 * @returns 无返回值，直接更新assertConfiguredGMPassword相关状态。
 */

function assertConfiguredGmPassword() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const envSource = resolveServerGmPasswordEnvSource();
    const password = resolveServerGmPassword('');
    const allowInsecureLocalPassword = resolveServerAllowInsecureLocalGmPassword();
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
    return isDevelopmentLikeEnv() && resolveServerAllowInsecureLocalGmPassword();
}
