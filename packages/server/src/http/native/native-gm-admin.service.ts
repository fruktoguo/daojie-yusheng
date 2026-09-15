/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import {
    BadRequestException,
    Inject,
    Injectable,
    InternalServerErrorException,
    Logger,
    ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, promises as fsPromises } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Pool } from 'pg';
import { resolveServerDatabaseUrl } from '../../config/env-alias';
import { DatabasePoolProvider } from '../../persistence/database-pool.provider';
import { GmAuditLogPersistenceService } from '../../persistence/gm-audit-log-persistence.service';
import { NativeDatabaseRestoreCoordinatorService } from './native-database-restore-coordinator.service';
import { GM_AUTH_CONTRACT, GM_HIGH_RISK_CONFIRMATION_CONTRACT, NATIVE_GM_RESTORE_CONTRACT } from './native-gm-contract';
import { WorldRuntimeService } from '../../runtime/world/world-runtime.service';
import type { GmActorContext } from './native-gm-actor-context';
import { assertGmHighRiskOperationAllowed, type GmHighRiskConfirmationBody } from './native-gm-high-risk';
import {
    buildPostgresDumpFileName,
    computeDatabaseBackupFileSha256,
    createPostgresCustomDump,
    detectDatabaseBackupFormat,
    restorePostgresCustomDump,
} from './native-postgres-backup';
import {
    cleanupSpecializedFlushLedgerTable,
    assertRestoreConfirmationMatchesBackup,
    buildSystemGmActor,
    formatPgBytes,
    buildTableColumnsMap,
    normalizeDatabaseCleanupTableName,
    getDatabaseCleanupBlockedReason,
    loadPublicRegularTableColumns,
    resolveDatabaseCleanupTimeColumn,
    resolveDatabaseCleanupTimeColumnKind,
    buildDatabaseCleanupTimePredicate,
    quoteIdentifier,
} from './native-gm-admin.cleanup.helpers';
import {
    resolveBackupDirectory,
    resolveFilesystemErrorCode,
    resolveBackupWorkerRootDirectory,
    readBackupWorkerActive,
    buildBackupId,
    cloneDatabaseJob,
    getDatabaseJobLogs,
    normalizeDatabaseJobLogEntry,
    buildBackupFilePath,
    resolveExistingBackupFilePath,
    resolveBackupRecordFormat,
    inferBackupFormatFromFileName,
    normalizeStoredDatabaseJobState,
    shouldRecoverCompletedDatabaseJob,
    normalizeDatabaseJobSnapshot,
} from './native-gm-admin.job.helpers';
import {
    upsertBackupMetadataRecord,
    ensureNativeGmAdminTables,
    readCurrentGmAuthRecord,
    restorePreservedGmAuthRecord,
    normalizeStoredBackupMetadata,
    assertCompatibleBackupPayload,
    normalizeBackupFormatValue,
    isKnownBackupScope,
    normalizeBackupScope,
    normalizeStructuredBackupTableEntry,
    computeStructuredTableChecksum,
    computeStructuredTablesChecksum,
    summarizeText,
    normalizePersistentDocumentBackupEntry,
    computeBackupChecksum,
    readBooleanEnv,
    asRecord,
    normalizeTimestamp,
    readInteger,
    normalizeNullableInteger,
    normalizePositiveInteger,
    resolveDatabaseUploadMaxBytes,
    formatByteLimit,
    normalizeUploadFileName,
    decodeHeaderFileName,
    resolveUploadedBackupExtension,
    buildUploadedBackupId,
    writeUploadStreamToFile,
    compressGzipFile,
    validateUploadedDatabaseBackup,
    clampInteger,
} from './native-gm-admin.backup.helpers';
export const DATABASE_BACKUP_METADATA_SCOPE = 'server_db_backups_v1';

export const DATABASE_JOB_STATE_SCOPE = 'server_db_jobs_v1';

export const DATABASE_JOB_STATE_KEY = 'gm_database';

export const DATABASE_BACKUP_METADATA_TABLE = 'server_db_backup_metadata';
export const DATABASE_JOB_STATE_TABLE = 'server_db_job_state';
export const GM_AUTH_TABLE = 'server_gm_auth';

export const DATABASE_BACKUP_METADATA_SCOPES = [DATABASE_BACKUP_METADATA_SCOPE];

export const DATABASE_JOB_STATE_SCOPES = [DATABASE_JOB_STATE_SCOPE];

export const BACKUP_FILE_PREFIX = 'server-database-backup';
export const LEGACY_BACKUP_FILE_PREFIX = 'server-persistent-documents';
export const UPLOADED_BACKUP_FILE_PREFIX = 'server-database-upload';

export const LEGACY_BACKUP_FILE_KIND = 'server_persistent_documents_backup_v1';

export const LEGACY_MAINLINE_BACKUP_FILE_KIND = 'server_persistence_backup_v2';

export const LEGACY_BACKUP_SCOPE_LABEL = 'legacy_persistent_documents';

export const BACKUP_SCOPE_LABEL = 'server_persistence';

export const LEGACY_JSON_BACKUP_FORMAT = 'legacy_json_snapshot';
export const OLD_JSON_BACKUP_FORMAT = ['mainline', 'json', 'snapshot'].join('_');
export const OLD_LEGACY_BACKUP_SCOPE_LABEL = ['persistent', 'documents', 'only'].join('_');
export const OLD_SERVER_BACKUP_SCOPE_LABEL = ['mainline', 'persistence'].join('_');

export const BACKUP_EXCLUDED_SCOPES = new Set([
    DATABASE_BACKUP_METADATA_SCOPE,
    DATABASE_JOB_STATE_SCOPE,
]);

export interface PreservedGmAuthRecord {
    recordKey: string;
    salt: string;
    passwordHash: string;
    updatedAtText: string;
    rawPayload: unknown;
}

export const MAINLINE_BACKUP_TABLES = [
    'server_player_auth',
    'server_player_identity',
    'player_identity',
    'server_gm_auth',
    'server_redeem_code_state',
    'server_redeem_code_group',
    'server_redeem_code',
    'server_market_order',
    'server_market_trade_history',
    'server_sect',
    'player_presence',
    'player_world_anchor',
    'player_position_checkpoint',
    'player_vitals',
    'player_progression_core',
    'player_attr_state',
    'player_body_training_state',
    'player_wallet',
    'player_inventory_item',
    'player_market_storage_item',
    'player_map_unlock',
    'player_equipment_slot',
    'player_technique_state',
    'player_persistent_buff_state',
    'player_quest_progress',
    'player_combat_preferences',
    'player_auto_battle_skill',
    'player_auto_use_item_rule',
    'player_profession_state',
    'player_alchemy_preset',
    'player_active_job',
    'player_enhancement_record',
    'player_logbook_message',
    'player_recovery_watermark',
    'player_mail',
    'player_mail_attachment',
    'player_mail_counter',
    'durable_operation_log',
    'outbox_event',
    'asset_audit_log',
];

export const DATABASE_CLEANUP_OPERATIONAL_TABLES = new Set([
    'asset_audit_log',
    'asset_audit_log_archive',
    'dead_letter_event',
    'durable_operation_log',
    'instance_flush_ledger',
    'node_registry',
    'outbox_consumer_dedupe',
    'outbox_event',
    'player_flush_ledger',
    'player_session_route',
    'server_db_backup_metadata',
    'server_db_job_state',
    'server_log',
]);

export const DATABASE_CLEANUP_SPECIALIZED_TABLES = new Set([
    'instance_flush_ledger',
    'player_flush_ledger',
]);

export const DATABASE_CLEANUP_PROTECTED_EXACT_TABLES = new Set([
    ...MAINLINE_BACKUP_TABLES,
    'instance_catalog',
    'persistent_documents',
    'player_counters',
    'player_mail_archive',
    'player_mail_attachment_archive',
    'player_offline_gain_report',
    'player_offline_gain_session',
    'player_statistic_day_total',
    'player_tongtian_tower_progress',
    'server_gm_runtime_flag',
    'server_gm_secrets',
    'server_player_snapshot',
    'users',
    'players',
]);

for (const tableName of DATABASE_CLEANUP_OPERATIONAL_TABLES) {
    DATABASE_CLEANUP_PROTECTED_EXACT_TABLES.delete(tableName);
}

export const DATABASE_CLEANUP_PROTECTED_PREFIXES = [
    'instance_',
    'player_',
    'server_gm_',
    'server_market_',
    'server_player_',
    'server_redeem_',
    'server_sect',
];

export const DATABASE_CLEANUP_TIME_COLUMN_CANDIDATES = [
    'created_at',
    'failed_at',
    'dirty_since_at',
    'updated_at',
    'delivered_at',
    'committed_at',
    'archived_at',
    'heartbeat_at',
    'started_at',
    'created_at_text',
    'updated_at_text',
];

export interface DatabaseTableColumnInfo {
    columnName: string;
    dataType: string;
}

export interface DatabaseCleanupTimeColumn {
    columnName: string;
    kind: 'timestamp' | 'epoch_ms' | 'iso_text';
}

export const MAINLINE_RESTORE_CLEAR_TABLES = [...MAINLINE_BACKUP_TABLES].reverse();
export const MAINLINE_RESTORE_DERIVED_MIRROR_TABLES = new Set([
    'player_identity',
]);

export const DEFAULT_DB_RETENTION = {
    hourly: 24,
    daily: 7,
};

export const DEFAULT_DB_SCHEDULES = {
    hourly: '0 * * * *',
    daily: '0 4 * * *',
};

export const DEFAULT_BACKUP_WORKER_HEARTBEAT_MAX_AGE_MS = 90_000;

export const BACKUP_JOB_PHASE = {
    VALIDATING: 'validating',
    WRITING_FILE: 'writing_file',
    PERSISTING_METADATA: 'persisting_metadata',
    COMPLETED: 'completed',
};

export const RESTORE_JOB_PHASE = {
    VALIDATING: 'validating_backup',
    CREATING_PRE_IMPORT_BACKUP: 'creating_pre_import_backup',
    PREPARING_RUNTIME: 'preparing_runtime',
    APPLYING_DOCUMENTS: 'applying_documents',
    COMMITTED: 'committed',
    RELOADING_RUNTIME: 'reloading_runtime',
    COMPLETED: 'completed',
};

export const RESTORE_DOCUMENT_BATCH_SIZE = 200;
export const DEFAULT_DATABASE_UPLOAD_MAX_BYTES = 1024 * 1024 * 1024;
/**
 * NativeGmAdminService：封装该能力的入口与生命周期，承载运行时核心协作。
 */


@Injectable()
export class NativeGmAdminService {
/**
 * logger：日志器引用。
 */

    logger = new Logger(NativeGmAdminService.name);
    /**
 * pool：缓存或索引容器。
 */

    pool = null;
    /**
 * persistenceEnabled：启用开关或状态标识。
 */

    persistenceEnabled = false;
    /**
 * backupDirectory：backupDirectory相关字段。
 */

    backupDirectory = resolveBackupDirectory();
    /** 备份卷不可用只降级 GM 备份能力，不能阻断核心服务启动。 */
    backupDirectoryReady = false;
    backupDirectoryErrorCode: string | null = null;
    /**
 * currentDatabaseJob：currentDatabaseJob相关字段。
 */

    currentDatabaseJob = null;
    /**
 * lastDatabaseJob：lastDatabaseJob相关字段。
 */

    lastDatabaseJob = null;
    /**
 * databaseJobPersistQueue：串行化数据库任务状态持久化，避免旧 phase 快照晚到覆盖最终状态。
 */

    databaseJobPersistQueue = Promise.resolve();
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param databaseRestoreCoordinator 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(NativeDatabaseRestoreCoordinatorService) private readonly databaseRestoreCoordinator,
        @Inject(WorldRuntimeService) private readonly worldRuntimeService = null,
        @Inject(DatabasePoolProvider) private readonly databasePoolProvider: DatabasePoolProvider | null = null,
        @Inject(GmAuditLogPersistenceService) private readonly gmAuditLogPersistenceService: GmAuditLogPersistenceService | null = null,
    ) {
    }
    /**
 * onModuleInit：执行on模块Init相关逻辑。
 * @returns 无返回值，直接更新on模块Init相关状态。
 */

    async onModuleInit() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        await this.refreshBackupDirectoryAvailability(true);

        const databaseUrl = resolveServerDatabaseUrl();
        if (!databaseUrl.trim()) {
            return;
        }
        const sharedPool = this.databasePoolProvider?.getPool('gm-admin') ?? null;
        if (!sharedPool) {
            this.logger.warn('旧 GM 管理兼容持久化已禁用：数据库连接池提供者未提供连接池');
            return;
        }
        this.pool = sharedPool;
        try {
            await ensureNativeGmAdminTables(this.pool);
            this.persistenceEnabled = true;
            await this.loadPersistedDatabaseJobState();
            await this.backfillBackupMetadataFromFilesystem();
        }
        catch (error) {
            this.logger.error('旧 GM 管理兼容持久化初始化失败', error instanceof Error ? error.stack : String(error));
            this.releasePoolReference();
        }
    }
    /**
 * onModuleDestroy：执行on模块Destroy相关逻辑。
 * @returns 无返回值，直接更新on模块Destroy相关状态。
 */

    async onModuleDestroy() {
        this.releasePoolReference();
    }
    /**
 * getDatabaseState：读取Database状态。
 * @returns 无返回值，完成Database状态的读取/组装。
 */

    async getDatabaseState() {

        await this.refreshBackupDirectoryAvailability(false);
        const backups = await this.listDatabaseBackups();
        const backupWorkerActive = await readBackupWorkerActive(this.backupDirectory);
        return {
            backups,
            runningJob: this.currentDatabaseJob ?? undefined,
            lastJob: this.lastDatabaseJob ?? undefined,
            recentJobLogs: getDatabaseJobLogs(this.currentDatabaseJob ?? this.lastDatabaseJob),
            retention: { ...DEFAULT_DB_RETENTION },
            schedules: { ...DEFAULT_DB_SCHEDULES },
            automation: {
                retentionEnforced: backupWorkerActive,
                schedulesActive: backupWorkerActive,
                restoreRequiresMaintenance: NATIVE_GM_RESTORE_CONTRACT.requiresMaintenance,
                preImportBackupEnabled: NATIVE_GM_RESTORE_CONTRACT.preImportBackupEnabled,
            },
            persistenceEnabled: this.persistenceEnabled,
            scope: NATIVE_GM_RESTORE_CONTRACT.scope,
            restoreMode: NATIVE_GM_RESTORE_CONTRACT.restoreMode,
            runtimeSummary: typeof this.worldRuntimeService?.getRuntimeSummary === 'function'
                ? this.worldRuntimeService.getRuntimeSummary()
                : null,
            note: '当前手工导出会生成 PostgreSQL 自定义备份，覆盖整个主线数据库真源；硬切后恢复只接受新版 PostgreSQL 自定义备份，不再导入历史 JSON 快照。',
        };
    }
    /**
 * isRuntimeMaintenanceActive：判断运行态Maintenance激活是否满足条件。
 * @returns 无返回值，完成运行态Maintenance激活的条件判断。
 */

    isRuntimeMaintenanceActive() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (readBooleanEnv('SERVER_RUNTIME_MAINTENANCE') || readBooleanEnv('RUNTIME_MAINTENANCE')) {
            return true;
        }
        return this.currentDatabaseJob?.status === 'running' && this.currentDatabaseJob?.type === 'restore';
    }
    /**
 * triggerDatabaseBackup：执行triggerDatabaseBackup相关逻辑。
 * @returns 无返回值，直接更新triggerDatabaseBackup相关状态。
 */

    async triggerDatabaseBackup(actor?: GmActorContext) {

        await this.assertBackupDirectoryAvailable();
        const backupId = buildBackupId();

        const startedAt = new Date().toISOString();

        const job = this.startDatabaseJob({
            id: `backup:${backupId}`,
            type: 'backup',
            status: 'running',
            startedAt,
            kind: 'manual',
            backupId,
            phase: BACKUP_JOB_PHASE.VALIDATING,
        });
        void this.runDatabaseJob(job, async () => {
            await this.createDatabaseBackupSnapshot({
                backupId,
                createdAt: startedAt,
                kind: 'manual',
                job,
            });
        });
        void this.recordDatabaseAudit('gm.database.backup', actor, backupId, undefined, {
            jobId: job.id,
            backupId,
            kind: 'manual',
            scope: BACKUP_SCOPE_LABEL,
        }, true, null);
        return {
            job,
            scope: BACKUP_SCOPE_LABEL,
        };
    }
    /**
 * getBackupDownloadRecord：读取BackupDownloadRecord。
 * @param backupId backup ID。
 * @returns 无返回值，完成BackupDownloadRecord的读取/组装。
 */

    async getBackupDownloadRecord(backupId, actor?: GmActorContext) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const normalizedBackupId = typeof backupId === 'string' ? backupId.trim() : '';
        try {
            await this.assertBackupDirectoryAvailable();
            const record = await this.findBackupRecord(normalizedBackupId);
            if (!record) {
                throw new BadRequestException('目标备份不存在');
            }
            if (!record.filePath) {
                throw new BadRequestException('目标备份文件不存在，请检查备份卷或目录配置');
            }
            const fileStat = await fsPromises.stat(record.filePath).catch(() => null);
            if (!fileStat?.isFile()) {
                throw new BadRequestException('备份文件不存在');
            }
            const format = await resolveBackupRecordFormat(record);
            await this.recordDatabaseAudit('gm.database.backup.download', actor, normalizedBackupId || null, undefined, {
                backupId: normalizedBackupId,
                fileName: record.fileName,
                sizeBytes: fileStat.size,
                checksumSha256: record.checksumSha256 ?? null,
                format,
                scope: record.scope,
            }, true, null);
            return {
                filePath: record.filePath,
                fileName: record.fileName,
                format,
            };
        } catch (error) {
            await this.recordDatabaseAudit('gm.database.backup.download', actor, normalizedBackupId || null, undefined, {
                backupId: normalizedBackupId,
            }, false, error instanceof Error ? error.message : String(error));
            throw error;
        }
    }
    /**
 * uploadDatabaseBackup：上传本地备份文件并登记为可恢复备份。
 * @param input 上传输入。
 * @returns 返回已登记的备份记录。
 */

    async uploadDatabaseBackup(input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const actor = input?.actor as GmActorContext | undefined;
        this.assertNoRunningDatabaseJob();
        await this.assertBackupDirectoryAvailable();
        if (!input?.stream || typeof input.stream.pipe !== 'function') {
            throw new BadRequestException('缺少数据库备份上传内容');
        }
        if (!this.pool || !this.persistenceEnabled) {
            throw new BadRequestException('当前未启用数据库持久化，暂不支持上传数据库备份');
        }
        const declaredLength = Number(input.contentLength);
        const maxBytes = resolveDatabaseUploadMaxBytes();
        if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
            throw new BadRequestException(`数据库备份文件过大，当前上限 ${formatByteLimit(maxBytes)}`);
        }

        const originalFileName = normalizeUploadFileName(input.fileName);
        const extension = resolveUploadedBackupExtension(originalFileName);
        const isGzipped = extension === '.dump.gz';
        const backupId = buildUploadedBackupId();
        const createdAt = new Date().toISOString();
        // 最终统一存储为 .dump.gz，保证备份卷中的 PostgreSQL 备份天然压缩。
        const finalFileName = `${UPLOADED_BACKUP_FILE_PREFIX}-${backupId}.dump.gz`;
        const finalFilePath = join(this.backupDirectory, finalFileName);
        await fsPromises.mkdir(this.backupDirectory, { recursive: true });

        const rawUploadTempPath = join(this.backupDirectory, `${UPLOADED_BACKUP_FILE_PREFIX}-${backupId}.dump.tmp`);
        const uploadFilePath = isGzipped
            ? finalFilePath
            : rawUploadTempPath;

        let sizeBytes = 0;
        try {
            await writeUploadStreamToFile(input.stream, uploadFilePath, maxBytes);

            const validationPath = isGzipped ? finalFilePath : rawUploadTempPath;
            const uploaded = await validateUploadedDatabaseBackup(validationPath, originalFileName);
            if (!isGzipped) {
                await compressGzipFile(rawUploadTempPath, finalFilePath);
                await fsPromises.rm(rawUploadTempPath, { force: true }).catch(() => undefined);
            }

            const finalStats = await fsPromises.stat(finalFilePath);
            sizeBytes = finalStats.size;
            const record = {
                id: backupId,
                kind: 'uploaded',
                fileName: finalFileName,
                createdAt,
                sizeBytes,
                scope: uploaded.scope,
                documentsCount: uploaded.documentsCount,
                checksumSha256: await computeDatabaseBackupFileSha256(finalFilePath),
                tablesCount: uploaded.tablesCount,
                tablesChecksumSha256: uploaded.tablesChecksumSha256,
                format: uploaded.format,
            };
            await this.persistBackupMetadata(record);
            await this.recordDatabaseAudit('gm.database.upload', actor, record.id, undefined, {
                backupId: record.id,
                fileName: record.fileName,
                originalFileName,
                sizeBytes: record.sizeBytes,
                checksumSha256: record.checksumSha256,
                tablesCount: record.tablesCount,
                scope: record.scope,
                format: record.format,
            }, true, null);
            return {
                backup: {
                    id: record.id,
                    kind: record.kind,
                    fileName: record.fileName,
                    createdAt: record.createdAt,
                    sizeBytes: record.sizeBytes,
                    documentsCount: record.documentsCount,
                    checksumSha256: record.checksumSha256,
                    tablesCount: record.tablesCount,
                    tablesChecksumSha256: record.tablesChecksumSha256,
                    format: record.format,
                },
                scope: record.scope,
            };
        }
        catch (error) {
            await fsPromises.rm(uploadFilePath, { force: true }).catch(() => undefined);
            await fsPromises.rm(rawUploadTempPath, { force: true }).catch(() => undefined);
            await fsPromises.rm(finalFilePath, { force: true }).catch(() => undefined);
            await this.recordDatabaseAudit('gm.database.upload', actor, backupId, undefined, {
                backupId,
                originalFileName,
                sizeBytes,
            }, false, error instanceof Error ? error.message : String(error));
            throw error;
        }
    }
    /**
 * triggerDatabaseRestore：执行triggerDatabaseRestore相关逻辑。
 * @param backupId backup ID。
 * @returns 无返回值，直接更新triggerDatabaseRestore相关状态。
 */

    async triggerDatabaseRestore(backupId, actor?: GmActorContext, confirmation?: GmHighRiskConfirmationBody) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        assertGmHighRiskOperationAllowed(actor ?? buildSystemGmActor(), confirmation, {
            scope: GM_HIGH_RISK_CONFIRMATION_CONTRACT.scopes.disasterRecovery,
            confirmationPhrase: GM_HIGH_RISK_CONFIRMATION_CONTRACT.phrases.databaseRestore,
            operationName: '数据库恢复',
        });
        await this.assertBackupDirectoryAvailable();
        const normalizedBackupId = typeof backupId === 'string' ? backupId.trim() : '';
        if (NATIVE_GM_RESTORE_CONTRACT.requiresMaintenance && !this.isRuntimeMaintenanceActive()) {
            throw new BadRequestException('数据库恢复必须先进入维护态');
        }
        const record = await this.findBackupRecord(normalizedBackupId);
        if (!record) {
            throw new BadRequestException('目标备份不存在');
        }
        if (!record.filePath) {
            throw new BadRequestException('目标备份文件不存在，请检查备份卷或目录配置');
        }
        if (!this.pool || !this.persistenceEnabled) {
            throw new BadRequestException('当前未启用数据库持久化，暂不支持导入数据库备份');
        }
        const backupFormat = await resolveBackupRecordFormat(record);
        if (backupFormat !== 'postgres_custom_dump') {
            throw new BadRequestException('硬切后只支持恢复新版 PostgreSQL 自定义备份，不再支持历史 JSON 快照');
        }
        const recordedChecksum = typeof record.checksumSha256 === 'string' ? record.checksumSha256.trim() : '';
        if (!recordedChecksum) {
            throw new BadRequestException('目标备份缺少 checksumSha256，无法校验 PostgreSQL 数据库归档完整性');
        }
        assertRestoreConfirmationMatchesBackup(normalizedBackupId, confirmation, recordedChecksum);
        const actualChecksum = await computeDatabaseBackupFileSha256(record.filePath);
        if (actualChecksum !== recordedChecksum) {
            throw new BadRequestException('目标备份 checksumSha256 校验失败，PostgreSQL 数据库归档可能已损坏或被篡改');
        }

        const startedAt = new Date().toISOString();
        const preservedGmAuthRecord = await readCurrentGmAuthRecord(this.pool);

        const checkpointBackupId = buildBackupId();

        const job = this.startDatabaseJob({
            id: `restore:${normalizedBackupId}:${Date.now().toString(36)}`,
            type: 'restore',
            status: 'running',
            startedAt,
            sourceBackupId: normalizedBackupId,
            checkpointBackupId,
            phase: RESTORE_JOB_PHASE.VALIDATING,
        });
        void this.recordDatabaseAudit('gm.database.restore.start', actor, normalizedBackupId, undefined, {
            jobId: job.id,
            sourceBackupId: normalizedBackupId,
            checkpointBackupId,
            checksumSha256: recordedChecksum,
            fileName: record.fileName,
        }, true, null);
        let restoreSqlCommitted = false;
        void this.runDatabaseJob(job, async () => {
            this.updateDatabaseJobPhase(job, RESTORE_JOB_PHASE.CREATING_PRE_IMPORT_BACKUP);
            await this.createDatabaseBackupSnapshot({
                backupId: checkpointBackupId,
                createdAt: new Date().toISOString(),
                kind: 'pre_import',
                job: null,
            });
            this.appendDatabaseJobLog(job, `导入前备份已生成：${checkpointBackupId}`);
            const preservedBackupMetadataRecords = await this.loadPersistedBackupMetadataRecords();
            this.appendDatabaseJobLog(job, `已保护 ${preservedBackupMetadataRecords.length} 条备份元数据，恢复后将原子回填`);
            process.env.SERVER_RUNTIME_RESTORE_ACTIVE = '1';
            try {
                this.updateDatabaseJobPhase(job, RESTORE_JOB_PHASE.PREPARING_RUNTIME);
                await this.databaseRestoreCoordinator.prepareForRestore();
                this.updateDatabaseJobPhase(job, RESTORE_JOB_PHASE.APPLYING_DOCUMENTS);
                const databaseUrl = resolveServerDatabaseUrl();
                if (!databaseUrl.trim()) {
                    throw new BadRequestException('当前未提供 SERVER_DATABASE_URL/DATABASE_URL，无法执行 PostgreSQL 数据库恢复');
                }
                await restorePostgresCustomDump(record.filePath, databaseUrl);
                restoreSqlCommitted = true;
                if (this.pool) {
                    await restorePreservedGmAuthRecord(this.pool, preservedGmAuthRecord);
                    await ensureNativeGmAdminTables(this.pool);
                    await this.restorePreservedBackupMetadataRecords(preservedBackupMetadataRecords);
                }
                this.appendDatabaseJobLog(job, preservedGmAuthRecord
                    ? `数据库恢复 SQL 已应用，当前 GM 密码记录与 ${preservedBackupMetadataRecords.length} 条备份元数据已保留`
                    : `数据库恢复 SQL 已应用，${preservedBackupMetadataRecords.length} 条备份元数据已保留`);
                job.appliedAt = new Date().toISOString();
                this.updateDatabaseJobPhase(job, RESTORE_JOB_PHASE.COMMITTED);
                await this.recordDatabaseAudit('gm.database.restore.complete', actor, normalizedBackupId, undefined, {
                    jobId: job.id,
                    sourceBackupId: normalizedBackupId,
                    checkpointBackupId,
                    appliedAt: job.appliedAt,
                }, true, null);
            } catch (error) {
                if (!restoreSqlCommitted) {
                    delete process.env.SERVER_RUNTIME_RESTORE_ACTIVE;
                }
                await this.recordDatabaseAudit('gm.database.restore.complete', actor, normalizedBackupId, undefined, {
                    jobId: job.id,
                    sourceBackupId: normalizedBackupId,
                    checkpointBackupId,
                    phase: job.phase,
                }, false, error instanceof Error ? error.message : String(error));
                throw error;
            }
        }).finally(() => {
            if (!restoreSqlCommitted) {
                return;
            }
            this.logger.log('数据库恢复 SQL 已提交且任务状态已落库，将直接退出并由守护进程重启，避免旧运行态再次刷盘');
            this.databaseRestoreCoordinator.scheduleProcessRestartAfterCommit();
        });
        return {
            job,
            scope: BACKUP_SCOPE_LABEL,
        };
    }
    /**
 * loadPersistedDatabaseJobState：读取PersistedDatabaseJob状态并返回结果。
 * @returns 无返回值，完成PersistedDatabaseJob状态的读取/组装。
 */

    async loadPersistedDatabaseJobState() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.pool || !this.persistenceEnabled) {
            this.currentDatabaseJob = null;
            this.lastDatabaseJob = null;
            return;
        }

        const payload = await this.loadDatabaseJobStatePayload();
        if (!payload) {
            this.currentDatabaseJob = null;
            this.lastDatabaseJob = null;
            return;
        }

        const state = normalizeStoredDatabaseJobState(payload);
        this.currentDatabaseJob = state.currentJob;
        this.lastDatabaseJob = state.lastJob;
        if (this.currentDatabaseJob?.status === 'running') {
            if (shouldRecoverCompletedDatabaseJob(this.currentDatabaseJob)) {
                this.lastDatabaseJob = {
                    ...this.currentDatabaseJob,
                    status: 'completed',
                    finishedAt: this.currentDatabaseJob.finishedAt ?? new Date().toISOString(),
                    error: undefined,
                };
                this.currentDatabaseJob = null;
                await this.persistDatabaseJobState();
                return;
            }
            this.lastDatabaseJob = {
                ...this.currentDatabaseJob,
                status: 'failed',
                error: this.currentDatabaseJob.error ?? `服务重启导致数据库任务在阶段 ${this.currentDatabaseJob.phase ?? 'unknown'} 中断`,
                finishedAt: new Date().toISOString(),
            };
            this.currentDatabaseJob = null;
            await this.persistDatabaseJobState();
        }
    }
    /**
 * persistDatabaseJobState：判断persistDatabaseJob状态是否满足条件。
 * @returns 无返回值，直接更新persistDatabaseJob状态相关状态。
 */

    async persistDatabaseJobState() {
        const previous = this.databaseJobPersistQueue;
        let release = () => undefined;
        this.databaseJobPersistQueue = new Promise((resolve) => {
            release = resolve;
        });
        await previous.catch(() => undefined);
        try {
            await this.persistDatabaseJobStateNow();
        }
        finally {
            release();
        }
    }
    /**
 * persistDatabaseJobStateNow：立即把当前 job 状态写入持久化层。
 * @returns 无返回值，直接更新persistDatabaseJob状态相关状态。
 */

    async persistDatabaseJobStateNow() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.pool || !this.persistenceEnabled) {
            return;
        }

        const payload = {
            currentJob: cloneDatabaseJob(this.currentDatabaseJob),
            lastJob: cloneDatabaseJob(this.lastDatabaseJob),
        };
        await this.pool.query(`
        INSERT INTO ${DATABASE_JOB_STATE_TABLE}(state_key, current_job_payload, last_job_payload, raw_payload, updated_at)
        VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, now())
        ON CONFLICT (state_key)
        DO UPDATE SET
          current_job_payload = EXCLUDED.current_job_payload,
          last_job_payload = EXCLUDED.last_job_payload,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = now()
      `, [
            DATABASE_JOB_STATE_KEY,
            JSON.stringify(payload.currentJob ?? null),
            JSON.stringify(payload.lastJob ?? null),
            JSON.stringify(payload),
        ]);
    }
    /**
 * persistBackupMetadata：判断persistBackupMetadata是否满足条件。
 * @param record 参数说明。
 * @returns 无返回值，直接更新persistBackupMetadata相关状态。
 */

    async persistBackupMetadata(record) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.pool || !this.persistenceEnabled) {
            return;
        }

        const normalized = normalizeStoredBackupMetadata(record);
        if (!normalized) {
            return;
        }
        await upsertBackupMetadataRecord(this.pool, normalized);
    }
    /** 在恢复后的新 schema 中原子回填恢复前的备份索引和校验和。 */
    async restorePreservedBackupMetadataRecords(records) {
        if (!this.pool || !this.persistenceEnabled) {
            return 0;
        }
        const normalizedRecords = (Array.isArray(records) ? records : [])
            .map((record) => normalizeStoredBackupMetadata(record))
            .filter(Boolean);
        if (normalizedRecords.length === 0) {
            return 0;
        }
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (const record of normalizedRecords) {
                await upsertBackupMetadataRecord(client, record);
            }
            await client.query('COMMIT');
            return normalizedRecords.length;
        } catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw error;
        } finally {
            client.release();
        }
    }
    /**
 * createDatabaseBackupSnapshot：构建并返回目标对象。
 * @param input 输入参数。
 * @returns 无返回值，直接更新DatabaseBackup快照相关状态。
 */

    async createDatabaseBackupSnapshot(input) {
        await this.assertBackupDirectoryAvailable();
        input.job && this.updateDatabaseJobPhase(input.job, BACKUP_JOB_PHASE.VALIDATING);
        const databaseUrl = resolveServerDatabaseUrl();
        if (!databaseUrl.trim()) {
            throw new BadRequestException('当前未提供 SERVER_DATABASE_URL/DATABASE_URL，无法生成 PostgreSQL 数据库备份');
        }
        input.job && this.updateDatabaseJobPhase(input.job, BACKUP_JOB_PHASE.WRITING_FILE);

        const fileName = buildPostgresDumpFileName(input.backupId);
        const filePath = join(this.backupDirectory, fileName);
        const artifact = await createPostgresCustomDump(filePath, databaseUrl);
        input.job && this.updateDatabaseJobPhase(input.job, BACKUP_JOB_PHASE.PERSISTING_METADATA);
        await this.persistBackupMetadata({
            id: input.backupId,
            kind: input.kind,
            fileName,
            createdAt: input.createdAt,
            sizeBytes: artifact.sizeBytes,
            scope: BACKUP_SCOPE_LABEL,
            checksumSha256: artifact.checksumSha256,
            format: 'postgres_custom_dump',
        });
        input.job && this.updateDatabaseJobPhase(input.job, BACKUP_JOB_PHASE.COMPLETED);
        return {
            backupId: input.backupId,
            fileName,
            filePath,
            sizeBytes: artifact.sizeBytes,
            checksumSha256: artifact.checksumSha256,
            format: 'postgres_custom_dump',
        };
    }
    /**
 * insertBackupDocumentsInBatches：按批次写入恢复文档，避免逐条 INSERT 拉长 restore 窗口。
 * @param client 数据库客户端。
 * @param docs 备份文档列表。
 * @returns 返回 Promise，完成后得到批量写入结果。
 */

    async insertBackupDocumentsInBatches(client, docs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const total = Array.isArray(docs) ? docs.length : 0;
        if (total <= 0) {
            return;
        }
        this.logger.log(`数据库恢复开始批量写入 ${total} 条 persistent_documents`);
        for (let start = 0; start < total; start += RESTORE_DOCUMENT_BATCH_SIZE) {
            const batch = docs.slice(start, start + RESTORE_DOCUMENT_BATCH_SIZE);
            const values = [];
            const params = [];
            for (let index = 0; index < batch.length; index += 1) {
                const entry = batch[index];
                const offset = index * 4;
                values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}::jsonb, $${offset + 4}::timestamptz)`);
                params.push(entry.scope, entry.key, JSON.stringify(entry.payload), entry.updatedAt);
            }
            await client.query(`
        INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
        VALUES ${values.join(',\n')}
      `, params);
            const written = start + batch.length;
            if (written === total || written % 1000 === 0) {
                this.logger.log(`数据库恢复已写入 ${written}/${total} 条 persistent_documents`);
            }
        }
    }
    /**
 * loadPersistedBackupMetadataRecords：读取PersistedBackupMetadataRecord并返回结果。
 * @returns 无返回值，完成PersistedBackupMetadataRecord的读取/组装。
 */

    async loadPersistedBackupMetadataRecords() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.pool || !this.persistenceEnabled) {
            return [];
        }

        const result = await this.pool.query(`
          SELECT backup_id, raw_payload
          FROM ${DATABASE_BACKUP_METADATA_TABLE}
          ORDER BY created_at_text DESC, backup_id DESC
        `);
        const records = new Map();
        for (const row of result.rows) {
            const normalized = normalizeStoredBackupMetadata({
                id: typeof row?.backup_id === 'string' ? row.backup_id : '',
                ...(row?.raw_payload && typeof row.raw_payload === 'object' ? row.raw_payload : {}),
            });
            if (!normalized || records.has(normalized.id)) {
                continue;
            }
            records.set(normalized.id, normalized);
        }
        return Array.from(records.values());
    }
    /**
 * backfillBackupMetadataFromFilesystem：执行backfillBackupMetadataFromFilesystem相关逻辑。
 * @returns 无返回值，直接更新backfillBackupMetadataFromFilesystem相关状态。
 */

    async backfillBackupMetadataFromFilesystem() {

        const records = await this.listFilesystemBackups();
        const persistedRecords = await this.loadPersistedBackupMetadataRecords();
        const persistedById = new Map(persistedRecords.map((record) => [record.id, record]));
        for (const record of records) {
            const existing = persistedById.get(record.id);
            const format = existing?.format ?? record.format;
            await this.persistBackupMetadata({
                id: record.id,
                kind: existing?.kind ?? record.kind,
                fileName: record.fileName,
                createdAt: existing?.createdAt ?? record.createdAt,
                sizeBytes: record.sizeBytes,
                scope: existing?.scope ?? BACKUP_SCOPE_LABEL,
                documentsCount: existing?.documentsCount,
                checksumSha256: existing?.checksumSha256,
                tablesCount: existing?.tablesCount,
                tablesChecksumSha256: existing?.tablesChecksumSha256,
                format,
            });
        }
    }
    /**
 * readAllPersistentDocuments：读取AllPersistentDocument并返回结果。
 * @returns 无返回值，完成AllPersistentDocument的读取/组装。
 */

    async readAllPersistentDocuments() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.pool || !this.persistenceEnabled) {
            return [];
        }

        const result = await this.pool.query('SELECT scope, key, payload, "updatedAt" FROM persistent_documents ORDER BY scope ASC, key ASC').catch((error) => {
            if (error && typeof error === 'object' && error.code === '42P01') {
                return { rows: [] };
            }
            throw error;
        });
        return result.rows.map((row) => ({

            scope: typeof row?.scope === 'string' ? row.scope : '',

            key: typeof row?.key === 'string' ? row.key : '',
            payload: row?.payload ?? null,
            updatedAt: row?.updatedAt instanceof Date
                ? row.updatedAt.toISOString()
                : normalizeTimestamp(row?.updatedAt) ?? new Date(0).toISOString(),
        })).filter((entry) => entry.scope && entry.key && !BACKUP_EXCLUDED_SCOPES.has(entry.scope));
    }
    /**
 * readStructuredBackupTables：读取主线结构化表快照并返回结果。
 * @returns 无返回值，完成主线结构化表快照的读取/组装。
 */

    async readStructuredBackupTables() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.pool || !this.persistenceEnabled) {
            return [];
        }

        const tables = [];
        for (const tableName of MAINLINE_BACKUP_TABLES) {
            const relation = await this.pool.query(`SELECT to_regclass($1) AS relation_name`, [tableName]);
            if (!relation.rows?.[0]?.relation_name) {
                continue;
            }
            const quotedTableName = quoteIdentifier(tableName);
            const result = await this.pool.query(`
        SELECT to_jsonb(t) AS row_payload
        FROM ${quotedTableName} t
        ORDER BY to_jsonb(t)::text ASC
      `);
            const rows = (result.rows ?? []).map((row) => row?.row_payload ?? null);
            tables.push({
                tableName,
                rowCount: rows.length,
                checksumSha256: computeStructuredTableChecksum(rows),
                rows,
            });
        }
        return tables;
    }
    /**
 * clearStructuredBackupTables：执行结构化表恢复前清理。
 * @param client 参数说明。
 * @returns 无返回值，直接更新结构化表恢复前清理相关状态。
 */

    async clearStructuredBackupTables(client) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        for (const tableName of MAINLINE_RESTORE_CLEAR_TABLES) {
            const relation = await client.query(`SELECT to_regclass($1) AS relation_name`, [tableName]);
            if (!relation.rows?.[0]?.relation_name) {
                continue;
            }
            await client.query(`DELETE FROM ${quoteIdentifier(tableName)}`);
        }
    }
    /**
 * insertBackupTablesInBatches：批量写入结构化备份表。
 * @param client 参数说明。
 * @param tables 参数说明。
 * @returns 无返回值，直接更新批量写入结构化备份表相关状态。
 */

    async insertBackupTablesInBatches(client, tables) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const normalizedTables = Array.isArray(tables) ? tables : [];
        for (const entry of normalizedTables) {
            const tableName = typeof entry?.tableName === 'string' ? entry.tableName.trim() : '';
            if (!tableName || !MAINLINE_BACKUP_TABLES.includes(tableName)) {
                continue;
            }
            if (MAINLINE_RESTORE_DERIVED_MIRROR_TABLES.has(tableName)) {
                continue;
            }
            const relation = await client.query(`SELECT to_regclass($1) AS relation_name`, [tableName]);
            if (!relation.rows?.[0]?.relation_name) {
                continue;
            }
            const rows = Array.isArray(entry?.rows) ? entry.rows : [];
            if (rows.length === 0) {
                continue;
            }
            await client.query(`
        INSERT INTO ${quoteIdentifier(tableName)}
        SELECT *
        FROM jsonb_populate_recordset(NULL::${quoteIdentifier(tableName)}, $1::jsonb)
      `, [JSON.stringify(rows)]);
        }
    }
    /**
 * listFilesystemBackups：读取FilesystemBackup并返回结果。
 * @returns 无返回值，完成FilesystemBackup的读取/组装。
 */

    async listFilesystemBackups() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.backupDirectoryReady) {
            return [];
        }
        const entries = await fsPromises.readdir(this.backupDirectory, { withFileTypes: true }).catch(() => []);

        const records = [];
        for (const entry of entries) {
            if (!entry.isFile()) {
                continue;
            }
            const isPostgresDump = entry.name.startsWith(`${BACKUP_FILE_PREFIX}-`) && (entry.name.endsWith('.dump') || entry.name.endsWith('.dump.gz'));
            const isUploadedPostgresDump = entry.name.startsWith(`${UPLOADED_BACKUP_FILE_PREFIX}-`) && (entry.name.endsWith('.dump') || entry.name.endsWith('.dump.gz'));
            const isUploadedJsonBackup = entry.name.startsWith(`${UPLOADED_BACKUP_FILE_PREFIX}-`) && entry.name.endsWith('.json');
            const isLegacyJsonBackup = entry.name.startsWith(`${LEGACY_BACKUP_FILE_PREFIX}-`) && entry.name.endsWith('.json');
            if (!isPostgresDump && !isUploadedPostgresDump && !isUploadedJsonBackup && !isLegacyJsonBackup) {
                continue;
            }

            const filePath = join(this.backupDirectory, entry.name);

            const stats = await fsPromises.stat(filePath).catch(() => null);
            if (!stats) {
                continue;
            }

            const postgresDumpSuffix = entry.name.endsWith('.dump.gz') ? '.dump.gz' : '.dump';
            const backupId = isPostgresDump
                ? entry.name.slice(`${BACKUP_FILE_PREFIX}-`.length, -postgresDumpSuffix.length)
                : isUploadedPostgresDump
                    ? entry.name.slice(`${UPLOADED_BACKUP_FILE_PREFIX}-`.length, -postgresDumpSuffix.length)
                    : isUploadedJsonBackup
                        ? entry.name.slice(`${UPLOADED_BACKUP_FILE_PREFIX}-`.length, -'.json'.length)
                : entry.name.slice(`${LEGACY_BACKUP_FILE_PREFIX}-`.length, -'.json'.length);
            records.push({
                id: backupId,
                kind: isUploadedPostgresDump || isUploadedJsonBackup ? 'uploaded' : 'manual',
                fileName: entry.name,
                createdAt: stats.mtime.toISOString(),
                sizeBytes: stats.size,
                filePath,
                format: isPostgresDump || isUploadedPostgresDump ? 'postgres_custom_dump' : LEGACY_JSON_BACKUP_FORMAT,
            });
        }
        return records;
    }
    /**
 * listDatabaseBackups：读取DatabaseBackup并返回结果。
 * @returns 无返回值，完成DatabaseBackup的读取/组装。
 */

    async listDatabaseBackups() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const records = new Map();

        const filesystemRecords = await this.listFilesystemBackups();
        for (const record of filesystemRecords) {
            records.set(record.id, record);
        }

        const persistedRecords = await this.loadPersistedBackupMetadataRecords();
        for (const record of persistedRecords) {
            const existing = records.get(record.id);
            const filePath = buildBackupFilePath(this.backupDirectory, record.fileName);
            records.set(record.id, {
                id: record.id,
                kind: record.kind,
                fileName: record.fileName,
                createdAt: existing?.createdAt ?? record.createdAt,
                sizeBytes: existing?.sizeBytes ?? record.sizeBytes,
                documentsCount: record.documentsCount,
                checksumSha256: record.checksumSha256,
                tablesCount: record.tablesCount,
                tablesChecksumSha256: record.tablesChecksumSha256,
                format: existing?.format ?? record.format,
                filePath: existing?.filePath ?? await resolveExistingBackupFilePath(filePath),
            });
        }

        const merged = Array.from(records.values());
        merged.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        return merged;
    }
    /**
 * findBackupRecord：读取BackupRecord并返回结果。
 * @param backupId backup ID。
 * @returns 无返回值，完成BackupRecord的读取/组装。
 */

    async findBackupRecord(backupId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const normalized = typeof backupId === 'string' ? backupId.trim() : '';
        if (!normalized) {
            return null;
        }

        const records = await this.listDatabaseBackups();
        return records.find((entry) => entry.id === normalized) ?? null;
    }
    /**
 * readBackupPayload：读取Backup载荷并返回结果。
 * @param filePath 参数说明。
 * @returns 无返回值，完成Backup载荷的读取/组装。
 */

    async readBackupPayload(filePath) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const raw = await fsPromises.readFile(filePath, 'utf8');
        try {
            return JSON.parse(raw);
        }
        catch {
            throw new BadRequestException('备份文件损坏，无法解析');
        }
    }
    /** 探测备份卷；失败时只记录降级状态，不向 Nest 生命周期抛错。 */
    async refreshBackupDirectoryAvailability(logFailure: boolean): Promise<boolean> {
        try {
            await fsPromises.mkdir(this.backupDirectory, { recursive: true });
            this.backupDirectoryReady = true;
            this.backupDirectoryErrorCode = null;
            return true;
        }
        catch (error) {
            const errorCode = resolveFilesystemErrorCode(error);
            this.backupDirectoryReady = false;
            this.backupDirectoryErrorCode = errorCode;
            if (logFailure) {
                this.logger.error(
                    `GM 数据库备份目录不可用，已仅禁用备份能力：path=${this.backupDirectory} code=${errorCode}`,
                );
            }
            return false;
        }
    }
    /** 运维请求触发时重试探测，卷恢复后无需重启即可重新启用备份。 */
    async assertBackupDirectoryAvailable(): Promise<void> {
        if (await this.refreshBackupDirectoryAvailability(false)) {
            return;
        }
        throw new ServiceUnavailableException(
            `数据库备份目录不可用，请检查 SERVER_GM_DATABASE_BACKUP_DIR（${this.backupDirectoryErrorCode ?? 'unknown'}）`,
        );
    }
    /**
     * releasePoolReference：释放对共享连接池的引用，由 DatabasePoolProvider 统一关闭真正的连接池。
 * @returns 无返回值，直接更新连接池引用相关状态。
 */

    releasePoolReference() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.pool = null;
        this.persistenceEnabled = false;
    }
    /**
 * loadDatabaseJobStatePayload：读取数据库任务状态专表载荷。
 * @returns 返回数据库任务状态。
 */

    async loadDatabaseJobStatePayload() {
        if (!this.pool || !this.persistenceEnabled) {
            return null;
        }
        const result = await this.pool.query(`
          SELECT raw_payload
          FROM ${DATABASE_JOB_STATE_TABLE}
          WHERE state_key = $1
          LIMIT 1
        `, [DATABASE_JOB_STATE_KEY]);
        return result.rows?.[0]?.raw_payload ?? null;
    }
    /**
 * loadPersistentPayloadByScopes：读取Persistent载荷ByScope并返回结果。
 * @param scopes 参数说明。
 * @param key 参数说明。
 * @returns 无返回值，完成Persistent载荷ByScope的读取/组装。
 */

    async loadPersistentPayloadByScopes(scopes, key) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        void scopes;
        void key;
        return null;
    }
    /**
 * startDatabaseJob：执行开始DatabaseJob相关逻辑。
 * @param input 输入参数。
 * @returns 无返回值，直接更新startDatabaseJob相关状态。
 */

    startDatabaseJob(input) {
        this.assertNoRunningDatabaseJob();
        const startedJob = {
            ...input,
            logs: getDatabaseJobLogs(input),
        };
        this.currentDatabaseJob = startedJob;
        this.appendDatabaseJobLog(startedJob, '数据库任务已创建');
        void this.persistDatabaseJobState().catch((error) => {
            this.logger.error('兼容数据库任务状态持久化失败', error instanceof Error ? error.stack : String(error));
        });
        return startedJob;
    }
    /**
 * updateDatabaseJobPhase：判断DatabaseJob阶段是否满足条件。
 * @param job 参数说明。
 * @param phase 参数说明。
 * @returns 无返回值，直接更新DatabaseJobPhase相关状态。
 */

    updateDatabaseJobPhase(job, phase) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!job || typeof phase !== 'string' || !phase.trim()) {
            return;
        }
        if (job.phase === phase) {
            return;
        }
        job.phase = phase;
        if (this.currentDatabaseJob?.id === job.id) {
            this.currentDatabaseJob.phase = phase;
        }
        this.appendDatabaseJobLog(job, `进入阶段：${phase}`, 'info', false);
        void this.persistDatabaseJobState().catch((error) => {
            this.logger.error('兼容数据库任务阶段持久化失败', error instanceof Error ? error.stack : String(error));
        });
    }
    /**
 * appendDatabaseJobLog：记录数据库任务日志。
 * @param job 参数说明。
 * @param message 参数说明。
 * @param level 参数说明。
 * @param persist 是否立即持久化。
 * @returns 无返回值，直接更新数据库任务日志。
 */

    appendDatabaseJobLog(job, message, level = 'info', persist = true) {
        if (!job || typeof message !== 'string' || !message.trim()) {
            return;
        }
        const entry = {
            at: new Date().toISOString(),
            level,
            message: message.trim(),
            phase: typeof job.phase === 'string' ? job.phase : undefined,
        };
        const logs = getDatabaseJobLogs(job);
        logs.push(entry);
        job.logs = logs.slice(-40);
        if (this.currentDatabaseJob?.id === job.id) {
            this.currentDatabaseJob.logs = job.logs;
        }
        if (!persist) {
            return;
        }
        void this.persistDatabaseJobState().catch((error) => {
            this.logger.error('兼容数据库任务日志持久化失败', error instanceof Error ? error.stack : String(error));
        });
    }
    /**
 * runDatabaseJob：执行runDatabaseJob相关逻辑。
 * @param job 参数说明。
 * @param work 参数说明。
 * @returns 无返回值，直接更新runDatabaseJob相关状态。
 */

    async runDatabaseJob(job, work) {
        try {
            await work();
            job.status = 'completed';
            if (job.type === 'backup') {
                this.updateDatabaseJobPhase(job, BACKUP_JOB_PHASE.COMPLETED);
            }
            if (job.type === 'restore') {
                this.updateDatabaseJobPhase(job, RESTORE_JOB_PHASE.COMPLETED);
            }
        }
        catch (error) {
            job.status = 'failed';
            job.error = error instanceof Error ? error.message : String(error);
            this.appendDatabaseJobLog(job, job.error, 'error', false);
            this.logger.error(`兼容数据库任务失败: ${job.error}`);
        }
        finally {
            job.finishedAt = new Date().toISOString();
            this.lastDatabaseJob = { ...job };
            if (this.currentDatabaseJob?.id === job.id) {
                this.currentDatabaseJob = null;
            }
            await this.persistDatabaseJobState().catch((error) => {
                this.logger.error('兼容数据库任务状态持久化失败', error instanceof Error ? error.stack : String(error));
            });
        }
    }
    /**
 * assertNoRunningDatabaseJob：执行assertNoRunningDatabaseJob相关逻辑。
 * @returns 无返回值，直接更新assertNoRunningDatabaseJob相关状态。
 */

    assertNoRunningDatabaseJob() {
        if (this.currentDatabaseJob?.status === 'running') {
            throw new BadRequestException('当前已有数据库任务执行中');
        }
    }
    async getDatabaseTableStats() {
        if (!this.pool || !this.persistenceEnabled) {
            throw new BadRequestException('数据库连接不可用');
        }
        const [result, columnsResult] = await Promise.all([
            this.pool.query(`
            SELECT
                relname AS table_name,
                reltuples::bigint AS row_estimate,
                pg_total_relation_size(c.oid) AS total_bytes,
                pg_relation_size(c.oid) AS table_bytes,
                COALESCE(pg_indexes_size(c.oid), 0) AS index_bytes,
                COALESCE(pg_total_relation_size(reltoastrelid), 0) AS toast_bytes
            FROM pg_class c
            LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE relkind = 'r' AND n.nspname = 'public'
            ORDER BY pg_total_relation_size(c.oid) DESC
        `),
            this.pool.query(`
            SELECT table_name, column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public'
        `),
        ]);
        const columnsByTable = buildTableColumnsMap(columnsResult.rows);
        let totalBytes = 0;
        const tables = result.rows.map((row) => {
            const tb = Number(row.total_bytes);
            totalBytes += tb;
            const tableName = String(row.table_name);
            const columns = columnsByTable.get(tableName) ?? [];
            const specializedCleanup = DATABASE_CLEANUP_SPECIALIZED_TABLES.has(tableName);
            const cleanupBlockedReason = specializedCleanup ? null : getDatabaseCleanupBlockedReason(tableName, columns);
            const cleanupTimeColumn = cleanupBlockedReason || specializedCleanup ? null : resolveDatabaseCleanupTimeColumn(columns);
            return {
                tableName,
                rowEstimate: Number(row.row_estimate),
                totalBytes: tb,
                totalSize: formatPgBytes(tb),
                tableBytes: Number(row.table_bytes),
                tableSize: formatPgBytes(Number(row.table_bytes)),
                indexBytes: Number(row.index_bytes),
                indexSize: formatPgBytes(Number(row.index_bytes)),
                toastBytes: Number(row.toast_bytes),
                toastSize: formatPgBytes(Number(row.toast_bytes)),
                cleanupAllowed: specializedCleanup || !cleanupBlockedReason,
                cleanupOlderThanAllowed: !specializedCleanup && !cleanupBlockedReason && Boolean(cleanupTimeColumn),
                cleanupTimeColumn: cleanupTimeColumn?.columnName ?? null,
                cleanupBlockedReason: specializedCleanup ? '刷盘账本仅允许清理已完成行；无未完成任务时会 TRUNCATE 释放物理空间' : cleanupBlockedReason,
            };
        });
        return {
            tables,
            totalBytes,
            totalSize: formatPgBytes(totalBytes),
            fetchedAt: new Date().toISOString(),
        };
    }

    async cleanupDatabaseTable(target: string, mode: 'older_than' | 'all' = 'older_than', olderThanDays = 7, actor?: GmActorContext, confirmation?: GmHighRiskConfirmationBody) {
        assertGmHighRiskOperationAllowed(actor ?? buildSystemGmActor(), confirmation, {
            scope: GM_HIGH_RISK_CONFIRMATION_CONTRACT.scopes.disasterRecovery,
            confirmationPhrase: GM_HIGH_RISK_CONFIRMATION_CONTRACT.phrases.databaseCleanup,
            operationName: '数据库清理',
        });
        if (!this.pool || !this.persistenceEnabled) {
            throw new BadRequestException('数据库连接不可用');
        }
        const tableName = normalizeDatabaseCleanupTableName(target);
        if (mode !== 'older_than' && mode !== 'all') {
            throw new BadRequestException('mode 必须是 older_than 或 all');
        }
        const columns = await loadPublicRegularTableColumns(this.pool, tableName);
        if (DATABASE_CLEANUP_SPECIALIZED_TABLES.has(tableName)) {
            try {
                const result = await cleanupSpecializedFlushLedgerTable(this.pool, tableName, mode);
                await this.recordDatabaseAudit('gm.database.cleanup', actor, tableName, undefined, {
                    target: tableName,
                    mode,
                    deletedRows: result.deletedRows,
                    specialized: true,
                }, true, null);
                return result;
            } catch (error) {
                await this.recordDatabaseAudit('gm.database.cleanup', actor, tableName, undefined, {
                    target: tableName,
                    mode,
                    specialized: true,
                }, false, error instanceof Error ? error.message : String(error));
                throw error;
            }
        }
        const cleanupBlockedReason = getDatabaseCleanupBlockedReason(tableName, columns);
        if (cleanupBlockedReason) {
            throw new BadRequestException(`${cleanupBlockedReason}: ${tableName}`);
        }
        const quotedTableName = quoteIdentifier(tableName);
        if (mode === 'all') {
            const countResult = await this.pool.query(`SELECT COUNT(*)::bigint AS row_count FROM ${quotedTableName}`);
            const deletedRows = Number(countResult.rows[0]?.row_count ?? 0);
            await this.pool.query(`TRUNCATE TABLE ${quotedTableName}`);
            await this.pool.query(`ANALYZE ${quotedTableName}`);
            await this.recordDatabaseAudit('gm.database.cleanup', actor, tableName, undefined, {
                target: tableName,
                mode,
                deletedRows,
            }, true, null);
            return {
                target: tableName,
                mode,
                deletedRows,
                message: `已清空 ${tableName}，释放表占用，删除 ${deletedRows} 条记录`,
            };
        }
        if (olderThanDays < 1) {
            throw new BadRequestException('olderThanDays 必须 >= 1');
        }
        const cleanupTimeColumn = resolveDatabaseCleanupTimeColumn(columns);
        if (!cleanupTimeColumn) {
            throw new BadRequestException(`表 ${tableName} 缺少可按时间清理的列`);
        }
        const predicate = buildDatabaseCleanupTimePredicate(cleanupTimeColumn);
        const result = await this.pool.query(
            `DELETE FROM ${quotedTableName} WHERE ${predicate}`,
            [`${olderThanDays} days`],
        );
        const deletedRows = result.rowCount ?? 0;
        await this.pool.query(`ANALYZE ${quotedTableName}`);
        await this.recordDatabaseAudit('gm.database.cleanup', actor, tableName, undefined, {
            target: tableName,
            mode,
            olderThanDays,
            deletedRows,
            cleanupTimeColumn: cleanupTimeColumn.columnName,
        }, true, null);
        return {
            target: tableName,
            mode,
            deletedRows,
            message: `已清理 ${tableName} 中 ${olderThanDays} 天前的 ${deletedRows} 条记录`,
        };
    }

    private async recordDatabaseAudit(
        op: string,
        actor: GmActorContext | undefined,
        targetId: string | null,
        before: unknown,
        after: unknown,
        success: boolean,
        errorMessage: string | null,
    ): Promise<void> {
        if (!this.gmAuditLogPersistenceService || !actor) return;
        await this.gmAuditLogPersistenceService.recordEntry({
            op,
            targetType: 'database',
            targetId,
            actor,
            before,
            after,
            success,
            errorMessage,
        }).catch(() => undefined);
    }

}
