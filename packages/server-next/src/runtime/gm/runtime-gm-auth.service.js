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
const GM_AUTH_SCOPE = 'server_next_legacy_gm_auth_v1';
const GM_AUTH_KEY = 'gm_auth';
const LEGACY_GM_AUTH_SCOPE = 'server_config';
const DEFAULT_GM_PASSWORD = 'admin123';
const DEFAULT_TOKEN_TTL_SEC = 12 * 60 * 60;
const LEGACY_BCRYPT_SENTINEL_SALT = '__legacy_bcrypt__';
let RuntimeGmAuthService = class RuntimeGmAuthService {
    logger = new common_1.Logger(RuntimeGmAuthService.name);
    pool = null;
    persistenceEnabled = false;
    memoryRecord = null;
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
            this.logger.error('Runtime GM auth persistence init failed', error instanceof Error ? error.stack : String(error));
            await this.closePool();
        }
    }
    async onModuleDestroy() {
        await this.closePool();
    }
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
    async reloadPasswordRecordFromPersistence() {
        if (!this.persistenceEnabled || !this.pool) {
            this.memoryRecord = null;
            return;
        }
        this.memoryRecord = await this.loadPasswordRecordFromDb();
    }
    issueToken(record) {
        const payloadBase64 = encodeBase64Url(JSON.stringify({
            role: 'gm',
            exp: Date.now() + this.getTokenTtlSec() * 1000,
            rev: record.updatedAt,
        }));
        const signature = signTokenPayload(payloadBase64, this.getSigningSecret(record));
        return `v1.${payloadBase64}.${signature}`;
    }
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
        return 'server-next-legacy-gm-http-auth';
    }
    getTokenTtlSec() {
        const configured = Number(process.env.SERVER_NEXT_GM_TOKEN_EXPIRES_IN ?? process.env.GM_TOKEN_EXPIRES_IN ?? Number.NaN);
        if (Number.isFinite(configured) && configured > 0) {
            return Math.max(60, Math.trunc(configured));
        }
        return DEFAULT_TOKEN_TTL_SEC;
    }
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
    async loadPasswordRecordFromDb() {
        if (!this.pool) {
            return null;
        }
        const result = await this.pool.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2', [GM_AUTH_SCOPE, GM_AUTH_KEY]);
        if (result.rowCount === 0) {
            return null;
        }
        return normalizePasswordRecord(result.rows[0]?.payload);
    }
    async loadLegacyPasswordRecordFromDb() {
        if (!this.pool) {
            return null;
        }
        const legacyResult = await this.pool.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2', [LEGACY_GM_AUTH_SCOPE, GM_AUTH_KEY]);
        if (legacyResult.rowCount === 0) {
            return null;
        }
        return normalizePasswordRecord(legacyResult.rows[0]?.payload);
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
