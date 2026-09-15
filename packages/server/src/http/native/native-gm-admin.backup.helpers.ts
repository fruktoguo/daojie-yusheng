/**
 * GM 管理服务 — 备份文件/上传/checksum/归一化辅助函数。
 *
 * 从 native-gm-admin.service.ts 拆分而来，负责备份元数据持久化、兼容备份校验、
 * 文件上传处理、checksum 计算、各种归一化工具函数等。
 * 维护时要保持 checksum 算法与备份/恢复链路一致。
 */
import { BadRequestException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, promises as fsPromises } from 'node:fs';
import { basename, extname } from 'node:path';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Pool } from 'pg';
import { GM_AUTH_CONTRACT } from './native-gm-contract';
import { detectDatabaseBackupFormat, computeDatabaseBackupFileSha256 } from './native-postgres-backup';
import {
    DATABASE_BACKUP_METADATA_TABLE,
    DATABASE_JOB_STATE_TABLE,
    GM_AUTH_TABLE,
    BACKUP_SCOPE_LABEL,
    LEGACY_BACKUP_SCOPE_LABEL,
    LEGACY_BACKUP_FILE_KIND,
    LEGACY_MAINLINE_BACKUP_FILE_KIND,
    LEGACY_JSON_BACKUP_FORMAT,
    OLD_JSON_BACKUP_FORMAT,
    OLD_LEGACY_BACKUP_SCOPE_LABEL,
    OLD_SERVER_BACKUP_SCOPE_LABEL,
    MAINLINE_BACKUP_TABLES,
    DEFAULT_DATABASE_UPLOAD_MAX_BYTES,
    type PreservedGmAuthRecord,
} from './native-gm-admin.service';
import { inferBackupFormatFromFileName } from './native-gm-admin.job.helpers';
export async function upsertBackupMetadataRecord(queryable, normalized) {
    await queryable.query(`
        INSERT INTO ${DATABASE_BACKUP_METADATA_TABLE}(
          backup_id,
          kind,
          file_name,
          created_at_text,
          size_bytes,
          scope_label,
          documents_count,
          checksum_sha256,
          tables_count,
          tables_checksum_sha256,
          format,
          raw_payload,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, now())
        ON CONFLICT (backup_id)
        DO UPDATE SET
          kind = EXCLUDED.kind,
          file_name = EXCLUDED.file_name,
          created_at_text = EXCLUDED.created_at_text,
          size_bytes = EXCLUDED.size_bytes,
          scope_label = EXCLUDED.scope_label,
          documents_count = EXCLUDED.documents_count,
          checksum_sha256 = EXCLUDED.checksum_sha256,
          tables_count = EXCLUDED.tables_count,
          tables_checksum_sha256 = EXCLUDED.tables_checksum_sha256,
          format = EXCLUDED.format,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = now()
      `, [
        normalized.id,
        normalized.kind,
        normalized.fileName,
        normalized.createdAt,
        normalizeNullableInteger(normalized.sizeBytes),
        normalized.scope,
        normalizeNullableInteger(normalized.documentsCount),
        normalized.checksumSha256 ?? null,
        normalizeNullableInteger(normalized.tablesCount),
        normalized.tablesChecksumSha256 ?? null,
        normalized.format ?? null,
        JSON.stringify(normalized),
    ]);
}

export async function ensureNativeGmAdminTables(pool) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
          CREATE TABLE IF NOT EXISTS ${DATABASE_BACKUP_METADATA_TABLE} (
            backup_id varchar(160) PRIMARY KEY,
            kind varchar(64) NOT NULL,
            file_name text NOT NULL,
            created_at_text varchar(80) NOT NULL,
            size_bytes bigint,
            scope_label varchar(80) NOT NULL,
            documents_count bigint,
            checksum_sha256 varchar(128),
            tables_count bigint,
            tables_checksum_sha256 varchar(128),
            format varchar(80),
            raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            updated_at timestamptz NOT NULL DEFAULT now()
          )
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS server_db_backup_metadata_created_idx
          ON ${DATABASE_BACKUP_METADATA_TABLE}(created_at_text DESC, backup_id DESC)
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS ${DATABASE_JOB_STATE_TABLE} (
            state_key varchar(80) PRIMARY KEY,
            current_job_payload jsonb,
            last_job_payload jsonb,
            raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            updated_at timestamptz NOT NULL DEFAULT now()
          )
        `);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    } finally {
        client.release();
    }
}

export async function readCurrentGmAuthRecord(pool: Pool): Promise<PreservedGmAuthRecord | null> {
    const client = await pool.connect();
    try {
        const exists = await client.query(`
          SELECT to_regclass('public.${GM_AUTH_TABLE}') AS table_name
        `);
        if (!exists.rows[0]?.table_name) {
            return null;
        }
        const result = await client.query(`
          SELECT record_key, salt, password_hash, updated_at_text, raw_payload
          FROM ${GM_AUTH_TABLE}
          WHERE record_key = $1
          LIMIT 1
        `, [GM_AUTH_CONTRACT.passwordRecordKey]);
        const row = result.rows[0];
        if (!row || typeof row.salt !== 'string' || typeof row.password_hash !== 'string' || typeof row.updated_at_text !== 'string') {
            return null;
        }
        return {
            recordKey: typeof row.record_key === 'string' ? row.record_key : GM_AUTH_CONTRACT.passwordRecordKey,
            salt: row.salt,
            passwordHash: row.password_hash,
            updatedAtText: row.updated_at_text,
            rawPayload: row.raw_payload && typeof row.raw_payload === 'object' ? row.raw_payload : {},
        };
    } finally {
        client.release();
    }
}

export async function restorePreservedGmAuthRecord(pool: Pool, record: PreservedGmAuthRecord | null): Promise<void> {
    if (!record) {
        return;
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
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
        await client.query(`
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
        `, [
            record.recordKey || GM_AUTH_CONTRACT.passwordRecordKey,
            record.salt,
            record.passwordHash,
            record.updatedAtText,
            JSON.stringify(record.rawPayload ?? {}),
        ]);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    } finally {
        client.release();
    }
}
export function normalizeStoredBackupMetadata(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const record = asRecord(value);

    const id = typeof record?.id === 'string' ? record.id.trim() : '';

    const fileName = typeof record?.fileName === 'string' ? record.fileName.trim() : '';

    const createdAt = normalizeTimestamp(record?.createdAt);

    const sizeBytes = Number(record?.sizeBytes);

    const kind = record?.kind === 'hourly' || record?.kind === 'daily' || record?.kind === 'manual' || record?.kind === 'pre_import' || record?.kind === 'uploaded'
        ? record.kind
        : null;

    const scope = normalizeBackupScope(record?.scope);

    const documentsCount = Number(record?.documentsCount);
    const tablesCount = Number(record?.tablesCount);

    const checksumSha256 = typeof record?.checksumSha256 === 'string' && record.checksumSha256.trim()
        ? record.checksumSha256.trim()
        : undefined;
    const tablesChecksumSha256 = typeof record?.tablesChecksumSha256 === 'string' && record.tablesChecksumSha256.trim()
        ? record.tablesChecksumSha256.trim()
        : undefined;
    const format = normalizeBackupFormatValue(record?.format) ?? inferBackupFormatFromFileName(fileName);
    if (!id || !fileName || !createdAt || !Number.isFinite(sizeBytes) || sizeBytes < 0 || !kind) {
        return null;
    }
    return {
        id,
        kind,
        fileName,
        createdAt,
        sizeBytes: Math.trunc(sizeBytes),
        scope,
        documentsCount: Number.isFinite(documentsCount) && documentsCount >= 0 ? Math.trunc(documentsCount) : undefined,
        checksumSha256,
        tablesCount: Number.isFinite(tablesCount) && tablesCount >= 0 ? Math.trunc(tablesCount) : undefined,
        tablesChecksumSha256,
        format,
    };
}
/**
 * assertCompatibleBackupPayload：读取assertCompatibleBackup载荷并返回结果。
 * @param value 参数说明。
 * @returns 无返回值，直接更新assertCompatibleBackup载荷相关状态。
 */

export function assertCompatibleBackupPayload(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const record = asRecord(value);
    if (!record) {
        throw new BadRequestException('兼容备份内容无效');
    }
    const rawKind = typeof record.kind === 'string' ? record.kind.trim() : '';
    if (rawKind && rawKind !== LEGACY_MAINLINE_BACKUP_FILE_KIND && rawKind !== LEGACY_BACKUP_FILE_KIND) {
        throw new BadRequestException('备份类型不受支持，当前仅支持 server 主线持久化备份');
    }
    const rawScope = typeof record.scope === 'string' ? record.scope.trim() : '';
    if (rawScope && !isKnownBackupScope(rawScope)) {
        throw new BadRequestException('备份作用域不受支持，当前仅支持 server 持久化兼容备份');
    }
    if (!Array.isArray(record.docs)) {
        throw new BadRequestException('兼容备份缺少 docs 列表');
    }
    const version = Number(record.version ?? (Array.isArray(record.tables) ? 2 : 1));
    if (version !== 1 && version !== 2) {
        throw new BadRequestException('备份版本不受支持，当前仅支持 version=1 或 version=2');
    }

    const createdAt = normalizeTimestamp(record.createdAt);
    if (!createdAt) {
        throw new BadRequestException('兼容备份缺少 createdAt');
    }

    const backupId = typeof record.backupId === 'string' && record.backupId.trim() ? record.backupId.trim() : '';
    if (!backupId) {
        throw new BadRequestException('兼容备份缺少 backupId');
    }

    const docs = record.docs.map((entry, index) => normalizePersistentDocumentBackupEntry(entry, index));

    const documentsCount = Number(record.documentsCount);
    if (!Number.isFinite(documentsCount) || Math.trunc(documentsCount) !== docs.length) {
        throw new BadRequestException(`兼容备份 documentsCount 与 docs 实际数量不一致：期望 ${Number.isFinite(documentsCount) ? Math.trunc(documentsCount) : '无效'}，实际 ${docs.length}`);
    }

    const checksumSha256 = typeof record.checksumSha256 === 'string' ? record.checksumSha256.trim() : '';
    if (!checksumSha256) {
        throw new BadRequestException('兼容备份缺少 checksumSha256');
    }

    const actualChecksum = computeBackupChecksum(docs);
    if (checksumSha256 !== actualChecksum) {
        throw new BadRequestException('兼容备份 checksumSha256 校验失败，文件内容可能已损坏或被篡改');
    }

    const tables = Array.isArray(record.tables)
        ? record.tables.map((entry, index) => normalizeStructuredBackupTableEntry(entry, index))
        : [];
    if (version >= 2) {
        const tablesCount = Number(record.tablesCount);
        if (!Number.isFinite(tablesCount) || Math.trunc(tablesCount) !== tables.length) {
            throw new BadRequestException(`兼容备份 tablesCount 与 tables 实际数量不一致：期望 ${Number.isFinite(tablesCount) ? Math.trunc(tablesCount) : '无效'}，实际 ${tables.length}`);
        }
        const tablesChecksumSha256 = typeof record.tablesChecksumSha256 === 'string' ? record.tablesChecksumSha256.trim() : '';
        if (!tablesChecksumSha256) {
            throw new BadRequestException('兼容备份缺少 tablesChecksumSha256');
        }
        const actualTablesChecksum = computeStructuredTablesChecksum(tables);
        if (tablesChecksumSha256 !== actualTablesChecksum) {
            throw new BadRequestException('兼容备份 tablesChecksumSha256 校验失败，结构化表快照可能已损坏或被篡改');
        }
    }
    return {
        kind: version >= 2 ? LEGACY_MAINLINE_BACKUP_FILE_KIND : LEGACY_BACKUP_FILE_KIND,
        version: version >= 2 ? 2 : 1,
        scope: version >= 2 ? BACKUP_SCOPE_LABEL : LEGACY_BACKUP_SCOPE_LABEL,
        backupId,
        createdAt,
        documentsCount: docs.length,
        checksumSha256,
        docs,
        tablesCount: tables.length,
        tablesChecksumSha256: computeStructuredTablesChecksum(tables),
        tables,
        format: LEGACY_JSON_BACKUP_FORMAT,
    };
}

export function normalizeBackupFormatValue(value) {
    const format = typeof value === 'string' ? value.trim() : '';
    if (format === 'postgres_custom_dump') {
        return 'postgres_custom_dump';
    }
    if (format === LEGACY_JSON_BACKUP_FORMAT || format === OLD_JSON_BACKUP_FORMAT) {
        return LEGACY_JSON_BACKUP_FORMAT;
    }
    return null;
}

export function isKnownBackupScope(value) {
    const scope = typeof value === 'string' ? value.trim() : '';
    return scope === BACKUP_SCOPE_LABEL
        || scope === LEGACY_BACKUP_SCOPE_LABEL
        || scope === OLD_SERVER_BACKUP_SCOPE_LABEL
        || scope === OLD_LEGACY_BACKUP_SCOPE_LABEL;
}

export function normalizeBackupScope(value) {
    const scope = typeof value === 'string' ? value.trim() : '';
    if (scope === LEGACY_BACKUP_SCOPE_LABEL || scope === OLD_LEGACY_BACKUP_SCOPE_LABEL) {
        return LEGACY_BACKUP_SCOPE_LABEL;
    }
    return BACKUP_SCOPE_LABEL;
}

export function normalizeStructuredBackupTableEntry(value, index) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const record = asRecord(value);
    const tableName = typeof record?.tableName === 'string' ? record.tableName.trim() : '';
    if (!tableName || !MAINLINE_BACKUP_TABLES.includes(tableName)) {
        throw new BadRequestException(`兼容备份第 ${index + 1} 个 tables 条目缺少合法 tableName`);
    }
    const rows = Array.isArray(record?.rows) ? record.rows : [];
    const rowCount = Number(record?.rowCount);
    if (!Number.isFinite(rowCount) || Math.trunc(rowCount) !== rows.length) {
        throw new BadRequestException(`兼容备份 tables.${tableName} 的 rowCount 与 rows 实际数量不一致：期望 ${Number.isFinite(rowCount) ? Math.trunc(rowCount) : '无效'}，实际 ${rows.length}`);
    }
    const checksumSha256 = typeof record?.checksumSha256 === 'string' ? record.checksumSha256.trim() : '';
    if (!checksumSha256) {
        throw new BadRequestException(`兼容备份 tables.${tableName} 缺少 checksumSha256`);
    }
    const actualChecksum = computeStructuredTableChecksum(rows);
    if (checksumSha256 !== actualChecksum) {
        throw new BadRequestException(`兼容备份 tables.${tableName} checksumSha256 校验失败`);
    }
    return {
        tableName,
        rowCount: rows.length,
        checksumSha256,
        rows,
    };
}

export function computeStructuredTableChecksum(rows) {
    return createHash('sha256').update(JSON.stringify(Array.isArray(rows) ? rows : [])).digest('hex');
}

export function computeStructuredTablesChecksum(tables) {
    const normalized = Array.isArray(tables)
        ? tables.map((entry) => ({
            tableName: typeof entry?.tableName === 'string' ? entry.tableName : '',
            rowCount: Number(entry?.rowCount ?? 0),
            checksumSha256: typeof entry?.checksumSha256 === 'string' ? entry.checksumSha256 : '',
        }))
        : [];
    return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
export function summarizeText(value) {

    const normalized = String(value ?? '').replace(/\s+/gu, ' ').trim();
    return normalized.length > 160 ? `${normalized.slice(0, 160)}...` : normalized;
}
/**
 * normalizePersistentDocumentBackupEntry：判断PersistentDocumentBackup条目是否满足条件。
 * @param value 参数说明。
 * @param index 参数说明。
 * @returns 无返回值，直接更新PersistentDocumentBackup条目相关状态。
 */

export function normalizePersistentDocumentBackupEntry(value, index = -1) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const record = asRecord(value);

    const scope = typeof record?.scope === 'string' ? record.scope.trim() : '';

    const key = typeof record?.key === 'string' ? record.key.trim() : '';
    if (!scope || !key) {
        throw new BadRequestException(index >= 0
            ? `兼容备份 docs[${index}] 缺少合法 scope/key`
            : '兼容备份中存在缺少合法 scope/key 的记录');
    }

    const updatedAt = normalizeTimestamp(record.updatedAt);
    if (!updatedAt) {
        throw new BadRequestException(index >= 0
            ? `兼容备份 docs[${index}] 缺少合法 updatedAt`
            : '兼容备份中存在缺少合法 updatedAt 的记录');
    }
    return {
        scope,
        key,
        payload: record.payload ?? null,
        updatedAt,
    };
}
/**
 * computeBackupChecksum：判断BackupChecksum是否满足条件。
 * @param docs 参数说明。
 * @returns 无返回值，直接更新BackupChecksum相关状态。
 */

export function computeBackupChecksum(docs) {
    return createHash('sha256').update(JSON.stringify(docs)).digest('hex');
}
/**
 * readBooleanEnv：读取BooleanEnv并返回结果。
 * @param key 参数说明。
 * @returns 无返回值，完成BooleanEnv的读取/组装。
 */

export function readBooleanEnv(key) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const raw = process.env[key];
    if (typeof raw !== 'string') {
        return false;
    }

    const normalized = raw.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}
/**
 * asRecord：执行aRecord相关逻辑。
 * @param value 参数说明。
 * @returns 无返回值，直接更新aRecord相关状态。
 */

export function asRecord(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value;
}
/**
 * normalizeTimestamp：规范化或转换Timestamp。
 * @param value 参数说明。
 * @returns 无返回值，直接更新Timestamp相关状态。
 */

export function normalizeTimestamp(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof value === 'string' && value.trim()) {
        return value;
    }
    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return value.toISOString();
    }
    return null;
}
/**
 * readInteger：读取Integer并返回结果。
 * @param value 参数说明。
 * @param fallback 参数说明。
 * @returns 无返回值，完成Integer的读取/组装。
 */

export function readInteger(value, fallback = 0) {

    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

export function normalizeNullableInteger(value) {
    if (value == null || value === '') {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

export function normalizePositiveInteger(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

export function resolveDatabaseUploadMaxBytes() {
    const raw = process.env.SERVER_GM_DATABASE_UPLOAD_MAX_BYTES
        ?? process.env.GM_DATABASE_UPLOAD_MAX_BYTES
        ?? '';
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_DATABASE_UPLOAD_MAX_BYTES;
    }
    return Math.trunc(parsed);
}

export function formatByteLimit(value) {
    if (value >= 1024 * 1024 * 1024) {
        return `${Math.floor(value / (1024 * 1024 * 1024))}GB`;
    }
    if (value >= 1024 * 1024) {
        return `${Math.floor(value / (1024 * 1024))}MB`;
    }
    return `${value}B`;
}

export function normalizeUploadFileName(value) {
    const raw = typeof value === 'string' ? value.trim() : '';
    const decoded = decodeHeaderFileName(raw);
    const normalized = basename(decoded || 'uploaded.dump').replace(/[^\w.\-\u4e00-\u9fa5]/gu, '_');
    return normalized || 'uploaded.dump';
}

export function decodeHeaderFileName(value) {
    if (!value) {
        return '';
    }
    try {
        return decodeURIComponent(value);
    }
    catch {
        return value;
    }
}

export function resolveUploadedBackupExtension(fileName) {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.dump.gz')) {
        return '.dump.gz';
    }
    if (lower.endsWith('.dump')) {
        return '.dump';
    }
    throw new BadRequestException('上传文件类型不受支持，仅支持 PostgreSQL 自定义备份（.dump 或 .dump.gz）');
}

export function buildUploadedBackupId() {
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/gu, '').slice(0, 14);
    return `uploaded-${timestamp}-${randomUUID().slice(0, 8)}`;
}

export async function writeUploadStreamToFile(stream, filePath, maxBytes) {
    return new Promise((resolvePromise, rejectPromise) => {
        const output = createWriteStream(filePath, { flags: 'wx' });
        let sizeBytes = 0;
        let settled = false;
        const fail = (error) => {
            if (settled) {
                return;
            }
            settled = true;
            output.destroy();
            if (typeof stream.destroy === 'function') {
                stream.destroy(error instanceof Error ? error : new Error(String(error)));
            }
            rejectPromise(error instanceof Error ? error : new Error(String(error)));
        };
        stream.on('data', (chunk) => {
            sizeBytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
            if (sizeBytes > maxBytes) {
                fail(new BadRequestException(`数据库备份文件过大，当前上限 ${formatByteLimit(maxBytes)}`));
            }
        });
        stream.on('error', fail);
        output.on('error', fail);
        output.on('finish', () => {
            if (settled) {
                return;
            }
            settled = true;
            resolvePromise(sizeBytes);
        });
        stream.pipe(output);
    });
}

export async function compressGzipFile(inputPath, outputPath) {
    const source = createReadStream(inputPath);
    const gzip = createGzip();
    const destination = createWriteStream(outputPath, { flags: 'wx', mode: 0o600 });
    await pipeline(source, gzip, destination);
}

export async function validateUploadedDatabaseBackup(filePath, originalFileName) {
    const magicFormat = await detectDatabaseBackupFormat(filePath, filePath);
    if (magicFormat === 'postgres_custom_dump') {
        return {
            scope: BACKUP_SCOPE_LABEL,
            checksumSha256: await computeDatabaseBackupFileSha256(filePath),
            documentsCount: undefined,
            tablesCount: undefined,
            tablesChecksumSha256: undefined,
            format: 'postgres_custom_dump',
        };
    }

    if (extname(originalFileName).toLowerCase() === '.json') {
        throw new BadRequestException('硬切后不再支持上传历史 JSON 快照，请上传新版 PostgreSQL 自定义备份（.dump 或 .dump.gz）');
    }

    throw new BadRequestException('上传的文件不是 PostgreSQL 自定义备份（缺少 PGDMP 文件头），支持 .dump 或 .dump.gz');
}
/**
 * clampInteger：执行clampInteger相关逻辑。
 * @param value 参数说明。
 * @param fallback 参数说明。
 * @param min 参数说明。
 * @param max 参数说明。
 * @returns 无返回值，直接更新clampInteger相关状态。
 */

export function clampInteger(value, fallback, min, max) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const parsed = readInteger(value, fallback);
    if (parsed < min) {
        return min;
    }
    if (parsed > max) {
        return max;
    }
    return parsed;
}
