/**
 * GM 管理服务 — job 状态归一化/日志辅助函数。
 *
 * 从 native-gm-admin.service.ts 拆分而来，负责数据库备份/恢复 job 状态归一化、
 * 日志归一化、备份目录解析、worker 心跳检测等。
 * 维护时要保持 job 状态字段与持久化 schema 一致。
 */
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { promises as fsPromises } from 'node:fs';
import { detectDatabaseBackupFormat } from './native-postgres-backup';
import {
    DEFAULT_BACKUP_WORKER_HEARTBEAT_MAX_AGE_MS,
    BACKUP_JOB_PHASE,
    RESTORE_JOB_PHASE,
    LEGACY_JSON_BACKUP_FORMAT,
    OLD_JSON_BACKUP_FORMAT,
} from './native-gm-admin.service';
import {
    normalizeBackupFormatValue,
    asRecord,
    normalizeTimestamp,
    normalizePositiveInteger,
} from './native-gm-admin.backup.helpers';
export function resolveBackupDirectory() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const configured = process.env.SERVER_GM_DATABASE_BACKUP_DIR?.trim()
        || process.env.GM_DATABASE_BACKUP_DIR?.trim()
        || '';
    if (configured) {
        return resolve(configured);
    }
    return resolve(__dirname, '../../../../.runtime/gm-database-backups');
}

export function resolveFilesystemErrorCode(error: unknown): string {
    return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code
        : 'unknown';
}

export function resolveBackupWorkerRootDirectory(backupDirectory) {
    const configured = process.env.SERVER_DATABASE_BACKUP_WORKER_ROOT_DIR?.trim()
        || process.env.DATABASE_BACKUP_WORKER_ROOT_DIR?.trim()
        || '';
    return configured ? resolve(configured) : dirname(backupDirectory);
}

export async function readBackupWorkerActive(backupDirectory) {
    const workerRootDirectory = resolveBackupWorkerRootDirectory(backupDirectory);
    const heartbeatPath = join(workerRootDirectory, '_meta', 'worker-heartbeat.json');
    const raw = await fsPromises.readFile(heartbeatPath, 'utf8').catch(() => '');
    if (!raw) {
        return false;
    }
    try {
        const parsed = JSON.parse(raw);
        const updatedAt = typeof parsed?.updatedAt === 'string' ? Date.parse(parsed.updatedAt) : NaN;
        if (!Number.isFinite(updatedAt)) {
            return false;
        }
        const maxAgeMs = normalizePositiveInteger(
            process.env.SERVER_DATABASE_BACKUP_WORKER_HEARTBEAT_MAX_AGE_MS,
            DEFAULT_BACKUP_WORKER_HEARTBEAT_MAX_AGE_MS,
            10_000,
            3_600_000,
        );
        return Date.now() - updatedAt <= maxAgeMs;
    }
    catch {
        return false;
    }
}
/**
 * buildBackupId：构建并返回目标对象。
 * @returns 无返回值，直接更新BackupID相关状态。
 */

export function buildBackupId() {
    return `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}
/**
 * cloneDatabaseJob：构建DatabaseJob。
 * @param value 参数说明。
 * @returns 无返回值，直接更新DatabaseJob相关状态。
 */

export function cloneDatabaseJob(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!value || typeof value !== 'object') {
        return null;
    }

    const normalized = normalizeDatabaseJobSnapshot(value);
    return normalized ? { ...normalized } : null;
}
/**
 * getDatabaseJobLogs：读取数据库任务日志。
 * @param value 参数说明。
 * @returns 数据库任务日志。
 */

export function getDatabaseJobLogs(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!value || typeof value !== 'object' || !Array.isArray(value.logs)) {
        return [];
    }
    return value.logs
        .map((entry) => normalizeDatabaseJobLogEntry(entry))
        .filter((entry) => entry !== null)
        .slice(-40);
}

/**
 * normalizeDatabaseJobLogEntry：规范化数据库任务日志。
 * @param value 参数说明。
 * @returns 数据库任务日志。
 */

export function normalizeDatabaseJobLogEntry(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const record = asRecord(value);
    const at = normalizeTimestamp(record?.at);
    const message = typeof record?.message === 'string' && record.message.trim() ? record.message.trim() : '';
    if (!at || !message) {
        return null;
    }
    const level = record?.level === 'error' ? 'error' : 'info';
    const phase = typeof record?.phase === 'string' && record.phase.trim() ? record.phase.trim() : undefined;
    return {
        at,
        level,
        message,
        phase,
    };
}
/**
 * buildBackupFilePath：构建并返回目标对象。
 * @param backupDirectory 参数说明。
 * @param fileName 参数说明。
 * @returns 无返回值，直接更新BackupFile路径相关状态。
 */

export function buildBackupFilePath(backupDirectory, fileName) {
    return join(backupDirectory, fileName);
}
/**
 * resolveExistingBackupFilePath：判断ExistingBackupFile路径是否满足条件。
 * @param filePath 参数说明。
 * @returns 无返回值，直接更新ExistingBackupFile路径相关状态。
 */

export async function resolveExistingBackupFilePath(filePath) {

    const stats = await fsPromises.stat(filePath).catch(() => null);
    return stats?.isFile() ? filePath : null;
}
/**
 * resolveBackupRecordFormat：读取BackupRecord格式并返回结果。
 * @param record 参数说明。
 * @returns 无返回值，完成BackupRecord格式的读取/组装。
 */

export async function resolveBackupRecordFormat(record) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const explicitFormat = normalizeBackupFormatValue(record?.format)
        ?? inferBackupFormatFromFileName(typeof record?.fileName === 'string' ? record.fileName : '');
    if (explicitFormat !== 'unknown') {
        return explicitFormat;
    }
    const filePath = typeof record?.filePath === 'string' ? record.filePath.trim() : '';
    if (!filePath) {
        return 'unknown';
    }
    return detectDatabaseBackupFormat(filePath, typeof record?.fileName === 'string' ? record.fileName : '');
}
/**
 * inferBackupFormatFromFileName：按文件名推断备份格式。
 * @param fileName 参数说明。
 * @returns 无返回值，完成备份格式推断。
 */

export function inferBackupFormatFromFileName(fileName) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalized = typeof fileName === 'string' ? fileName.trim().toLowerCase() : '';
    if (!normalized) {
        return 'unknown';
    }
    if (normalized.endsWith('.dump.gz')) {
        return 'postgres_custom_dump';
    }
    if (normalized.endsWith('.dump')) {
        return 'postgres_custom_dump';
    }
    if (normalized.endsWith('.json')) {
        return LEGACY_JSON_BACKUP_FORMAT;
    }
    return 'unknown';
}
/**
 * normalizeStoredDatabaseJobState：规范化或转换StoredDatabaseJob状态。
 * @param value 参数说明。
 * @returns 无返回值，直接更新StoredDatabaseJob状态相关状态。
 */

export function normalizeStoredDatabaseJobState(value) {

    const record = asRecord(value);
    return {
        currentJob: normalizeDatabaseJobSnapshot(record?.currentJob),
        lastJob: normalizeDatabaseJobSnapshot(record?.lastJob),
    };
}
/**
 * shouldRecoverCompletedDatabaseJob：判断RecoverCompletedDatabaseJob是否满足条件。
 * @param job 参数说明。
 * @returns 无返回值，完成RecoverCompletedDatabaseJob的条件判断。
 */

export function shouldRecoverCompletedDatabaseJob(job) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!job || job.status !== 'running') {
        return false;
    }
    if (job.phase === BACKUP_JOB_PHASE.COMPLETED || job.phase === RESTORE_JOB_PHASE.COMPLETED) {
        return true;
    }
    return typeof job.finishedAt === 'string' && job.finishedAt.trim().length > 0;
}
/**
 * normalizeDatabaseJobSnapshot：规范化或转换DatabaseJob快照。
 * @param value 参数说明。
 * @returns 无返回值，直接更新DatabaseJob快照相关状态。
 */

export function normalizeDatabaseJobSnapshot(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const record = asRecord(value);

    const id = typeof record?.id === 'string' ? record.id.trim() : '';

    const type = record?.type === 'backup' || record?.type === 'restore' ? record.type : null;

    const status = record?.status === 'running' || record?.status === 'completed' || record?.status === 'failed'
        ? record.status
        : null;

    const startedAt = normalizeTimestamp(record?.startedAt);
    if (!id || !type || !status || !startedAt) {
        return null;
    }

    const finishedAt = normalizeTimestamp(record?.finishedAt);

    const kind = record?.kind === 'hourly' || record?.kind === 'daily' || record?.kind === 'manual' || record?.kind === 'pre_import' || record?.kind === 'uploaded'
        ? record.kind
        : undefined;

    const backupId = typeof record?.backupId === 'string' && record.backupId.trim() ? record.backupId.trim() : undefined;

    const sourceBackupId = typeof record?.sourceBackupId === 'string' && record.sourceBackupId.trim() ? record.sourceBackupId.trim() : undefined;

    const error = typeof record?.error === 'string' && record.error.trim() ? record.error.trim() : undefined;

    const phase = typeof record?.phase === 'string' && record.phase.trim() ? record.phase.trim() : undefined;

    const checkpointBackupId = typeof record?.checkpointBackupId === 'string' && record.checkpointBackupId.trim()
        ? record.checkpointBackupId.trim()
        : undefined;

    const appliedAt = normalizeTimestamp(record?.appliedAt) ?? undefined;
    const logs = getDatabaseJobLogs(record);
    return {
        id,
        type,
        status,
        startedAt,
        finishedAt: finishedAt ?? undefined,
        kind,
        backupId,
        sourceBackupId,
        checkpointBackupId,
        appliedAt,
        phase,
        error,
        logs,
    };
}
