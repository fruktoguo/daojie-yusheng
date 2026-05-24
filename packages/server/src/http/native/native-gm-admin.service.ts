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
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, promises as fsPromises } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Pool } from 'pg';
import { resolveServerDatabaseUrl } from '../../config/env-alias';
import { DatabasePoolProvider } from '../../persistence/database-pool.provider';
import { NativeDatabaseRestoreCoordinatorService } from './native-database-restore-coordinator.service';
import { GM_AUTH_CONTRACT, NATIVE_GM_RESTORE_CONTRACT } from './native-gm-contract';
import { WorldRuntimeService } from '../../runtime/world/world-runtime.service';
import {
    buildPostgresDumpFileName,
    computeDatabaseBackupFileSha256,
    createPostgresCustomDump,
    detectDatabaseBackupFormat,
    restorePostgresCustomDump,
} from './native-postgres-backup';
const DATABASE_BACKUP_METADATA_SCOPE = 'server_db_backups_v1';

const DATABASE_JOB_STATE_SCOPE = 'server_db_jobs_v1';

const DATABASE_JOB_STATE_KEY = 'gm_database';

const DATABASE_BACKUP_METADATA_TABLE = 'server_db_backup_metadata';
const DATABASE_JOB_STATE_TABLE = 'server_db_job_state';
const GM_AUTH_TABLE = 'server_gm_auth';

const DATABASE_BACKUP_METADATA_SCOPES = [DATABASE_BACKUP_METADATA_SCOPE];

const DATABASE_JOB_STATE_SCOPES = [DATABASE_JOB_STATE_SCOPE];

const BACKUP_FILE_PREFIX = 'server-database-backup';
const LEGACY_BACKUP_FILE_PREFIX = 'server-persistent-documents';
const UPLOADED_BACKUP_FILE_PREFIX = 'server-database-upload';

const LEGACY_BACKUP_FILE_KIND = 'server_persistent_documents_backup_v1';

const LEGACY_MAINLINE_BACKUP_FILE_KIND = 'server_persistence_backup_v2';

const LEGACY_BACKUP_SCOPE_LABEL = 'legacy_persistent_documents';

const BACKUP_SCOPE_LABEL = 'server_persistence';

const LEGACY_JSON_BACKUP_FORMAT = 'legacy_json_snapshot';
const OLD_JSON_BACKUP_FORMAT = ['mainline', 'json', 'snapshot'].join('_');
const OLD_LEGACY_BACKUP_SCOPE_LABEL = ['persistent', 'documents', 'only'].join('_');
const OLD_SERVER_BACKUP_SCOPE_LABEL = ['mainline', 'persistence'].join('_');

const BACKUP_EXCLUDED_SCOPES = new Set([
    DATABASE_BACKUP_METADATA_SCOPE,
    DATABASE_JOB_STATE_SCOPE,
]);

interface PreservedGmAuthRecord {
    recordKey: string;
    salt: string;
    passwordHash: string;
    updatedAtText: string;
    rawPayload: unknown;
}

const MAINLINE_BACKUP_TABLES = [
    'server_player_auth',
    'server_player_identity',
    'player_identity',
    'server_gm_auth',
    'server_redeem_code_state',
    'server_redeem_code_group',
    'server_redeem_code',
    'server_suggestion_state',
    'server_suggestion',
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

const DATABASE_CLEANUP_OPERATIONAL_TABLES = new Set([
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

const DATABASE_CLEANUP_SPECIALIZED_TABLES = new Set([
    'instance_flush_ledger',
    'player_flush_ledger',
]);

const DATABASE_CLEANUP_PROTECTED_EXACT_TABLES = new Set([
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

const DATABASE_CLEANUP_PROTECTED_PREFIXES = [
    'instance_',
    'player_',
    'server_gm_',
    'server_market_',
    'server_player_',
    'server_redeem_',
    'server_sect',
    'server_suggestion',
];

const DATABASE_CLEANUP_TIME_COLUMN_CANDIDATES = [
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

interface DatabaseTableColumnInfo {
    columnName: string;
    dataType: string;
}

interface DatabaseCleanupTimeColumn {
    columnName: string;
    kind: 'timestamp' | 'epoch_ms' | 'iso_text';
}

const MAINLINE_RESTORE_CLEAR_TABLES = [...MAINLINE_BACKUP_TABLES].reverse();
const MAINLINE_RESTORE_DERIVED_MIRROR_TABLES = new Set([
    'player_identity',
]);

const DEFAULT_DB_RETENTION = {
    hourly: 24,
    daily: 7,
};

const DEFAULT_DB_SCHEDULES = {
    hourly: '0 * * * *',
    daily: '0 4 * * *',
};

const DEFAULT_BACKUP_WORKER_HEARTBEAT_MAX_AGE_MS = 90_000;

const BACKUP_JOB_PHASE = {
    VALIDATING: 'validating',
    WRITING_FILE: 'writing_file',
    PERSISTING_METADATA: 'persisting_metadata',
    COMPLETED: 'completed',
};

const RESTORE_JOB_PHASE = {
    VALIDATING: 'validating_backup',
    CREATING_PRE_IMPORT_BACKUP: 'creating_pre_import_backup',
    PREPARING_RUNTIME: 'preparing_runtime',
    APPLYING_DOCUMENTS: 'applying_documents',
    COMMITTED: 'committed',
    RELOADING_RUNTIME: 'reloading_runtime',
    COMPLETED: 'completed',
};

const RESTORE_DOCUMENT_BATCH_SIZE = 200;
const DEFAULT_DATABASE_UPLOAD_MAX_BYTES = 1024 * 1024 * 1024;
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
    ) {
    }
    /**
 * onModuleInit：执行on模块Init相关逻辑。
 * @returns 无返回值，直接更新on模块Init相关状态。
 */

    async onModuleInit() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        await fsPromises.mkdir(this.backupDirectory, { recursive: true });

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

    triggerDatabaseBackup() {

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

    async getBackupDownloadRecord(backupId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const record = await this.findBackupRecord(backupId);
        if (!record) {
            throw new BadRequestException('目标备份不存在');
        }
        if (!record.filePath) {
            throw new BadRequestException('目标备份文件不存在，请检查备份卷或目录配置');
        }
        return {
            filePath: record.filePath,
            fileName: record.fileName,
            format: await resolveBackupRecordFormat(record),
        };
    }
    /**
 * uploadDatabaseBackup：上传本地备份文件并登记为可恢复备份。
 * @param input 上传输入。
 * @returns 返回已登记的备份记录。
 */

    async uploadDatabaseBackup(input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.assertNoRunningDatabaseJob();
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
        // 最终存储为 .dump（如果上传的是 .dump.gz 则解压后存储）
        const finalFileName = `${UPLOADED_BACKUP_FILE_PREFIX}-${backupId}.dump`;
        const finalFilePath = join(this.backupDirectory, finalFileName);
        await fsPromises.mkdir(this.backupDirectory, { recursive: true });

        // 如果是 gzip 压缩文件，先写入临时路径再解压
        const uploadFilePath = isGzipped
            ? join(this.backupDirectory, `${UPLOADED_BACKUP_FILE_PREFIX}-${backupId}.dump.gz.tmp`)
            : finalFilePath;

        let sizeBytes = 0;
        try {
            sizeBytes = Number(await writeUploadStreamToFile(input.stream, uploadFilePath, maxBytes));

            if (isGzipped) {
                await decompressGzipFile(uploadFilePath, finalFilePath);
                await fsPromises.rm(uploadFilePath, { force: true }).catch(() => undefined);
                const decompressedStats = await fsPromises.stat(finalFilePath);
                sizeBytes = decompressedStats.size;
            }

            const uploaded = await validateUploadedDatabaseBackup(finalFilePath, originalFileName);
            const record = {
                id: backupId,
                kind: 'uploaded',
                fileName: finalFileName,
                createdAt,
                sizeBytes,
                scope: uploaded.scope,
                documentsCount: uploaded.documentsCount,
                checksumSha256: uploaded.checksumSha256,
                tablesCount: uploaded.tablesCount,
                tablesChecksumSha256: uploaded.tablesChecksumSha256,
                format: uploaded.format,
            };
            await this.persistBackupMetadata(record);
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
            await fsPromises.rm(finalFilePath, { force: true }).catch(() => undefined);
            throw error;
        }
    }
    /**
 * triggerDatabaseRestore：执行triggerDatabaseRestore相关逻辑。
 * @param backupId backup ID。
 * @returns 无返回值，直接更新triggerDatabaseRestore相关状态。
 */

    async triggerDatabaseRestore(backupId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const record = await this.findBackupRecord(backupId);
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
        const actualChecksum = await computeDatabaseBackupFileSha256(record.filePath);
        if (actualChecksum !== recordedChecksum) {
            throw new BadRequestException('目标备份 checksumSha256 校验失败，PostgreSQL 数据库归档可能已损坏或被篡改');
        }

        const startedAt = new Date().toISOString();
        const preservedGmAuthRecord = await readCurrentGmAuthRecord(this.pool);

        const checkpointBackupId = buildBackupId();

        const job = this.startDatabaseJob({
            id: `restore:${backupId}:${Date.now().toString(36)}`,
            type: 'restore',
            status: 'running',
            startedAt,
            sourceBackupId: backupId,
            checkpointBackupId,
            phase: RESTORE_JOB_PHASE.VALIDATING,
        });
        void this.runDatabaseJob(job, async () => {
            this.updateDatabaseJobPhase(job, RESTORE_JOB_PHASE.CREATING_PRE_IMPORT_BACKUP);
            await this.createDatabaseBackupSnapshot({
                backupId: checkpointBackupId,
                createdAt: new Date().toISOString(),
                kind: 'pre_import',
                job: null,
            });
            this.appendDatabaseJobLog(job, `导入前备份已生成：${checkpointBackupId}`);
            process.env.SERVER_RUNTIME_RESTORE_ACTIVE = '1';
            this.updateDatabaseJobPhase(job, RESTORE_JOB_PHASE.PREPARING_RUNTIME);
            await this.databaseRestoreCoordinator.prepareForRestore();
            this.updateDatabaseJobPhase(job, RESTORE_JOB_PHASE.APPLYING_DOCUMENTS);
            const databaseUrl = resolveServerDatabaseUrl();
            if (!databaseUrl.trim()) {
                throw new BadRequestException('当前未提供 SERVER_DATABASE_URL/DATABASE_URL，无法执行 PostgreSQL 数据库恢复');
            }
            await restorePostgresCustomDump(record.filePath, databaseUrl);
            if (this.pool) {
                await restorePreservedGmAuthRecord(this.pool, preservedGmAuthRecord);
                await ensureNativeGmAdminTables(this.pool);
            }
            this.appendDatabaseJobLog(job, preservedGmAuthRecord
                ? '数据库恢复 SQL 已应用，当前 GM 密码记录已保留，GM 元表已重建并回填备份列表'
                : '数据库恢复 SQL 已应用，GM 元表已重建并回填备份列表');
            job.appliedAt = new Date().toISOString();
            this.updateDatabaseJobPhase(job, RESTORE_JOB_PHASE.COMMITTED);
            job.status = 'completed';
            job.finishedAt = new Date().toISOString();
            this.lastDatabaseJob = { ...job };
            this.currentDatabaseJob = null;
            await this.persistDatabaseJobState().catch(() => undefined);
            this.logger.log('数据库恢复已完成，即将发送 SIGTERM 触发优雅重启，确保所有子系统从干净状态初始化');
            setTimeout(() => process.kill(process.pid, 'SIGTERM'), 500);
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
        await this.pool.query(`
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
    /**
 * createDatabaseBackupSnapshot：构建并返回目标对象。
 * @param input 输入参数。
 * @returns 无返回值，直接更新DatabaseBackup快照相关状态。
 */

    async createDatabaseBackupSnapshot(input) {
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


        const entries = await fsPromises.readdir(this.backupDirectory, { withFileTypes: true }).catch(() => []);

        const records = [];
        for (const entry of entries) {
            if (!entry.isFile()) {
                continue;
            }
            const isPostgresDump = entry.name.startsWith(`${BACKUP_FILE_PREFIX}-`) && entry.name.endsWith('.dump');
            const isUploadedPostgresDump = entry.name.startsWith(`${UPLOADED_BACKUP_FILE_PREFIX}-`) && entry.name.endsWith('.dump');
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

            const backupId = isPostgresDump
                ? entry.name.slice(`${BACKUP_FILE_PREFIX}-`.length, -'.dump'.length)
                : isUploadedPostgresDump
                    ? entry.name.slice(`${UPLOADED_BACKUP_FILE_PREFIX}-`.length, -'.dump'.length)
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

    async cleanupDatabaseTable(target: string, mode: 'older_than' | 'all' = 'older_than', olderThanDays = 7) {
        if (!this.pool || !this.persistenceEnabled) {
            throw new BadRequestException('数据库连接不可用');
        }
        const tableName = normalizeDatabaseCleanupTableName(target);
        if (mode !== 'older_than' && mode !== 'all') {
            throw new BadRequestException('mode 必须是 older_than 或 all');
        }
        const columns = await loadPublicRegularTableColumns(this.pool, tableName);
        if (DATABASE_CLEANUP_SPECIALIZED_TABLES.has(tableName)) {
            return cleanupSpecializedFlushLedgerTable(this.pool, tableName, mode);
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
        return {
            target: tableName,
            mode,
            deletedRows,
            message: `已清理 ${tableName} 中 ${olderThanDays} 天前的 ${deletedRows} 条记录`,
        };
    }
}

async function cleanupSpecializedFlushLedgerTable(pool: Pool, tableName: string, mode: 'older_than' | 'all') {
    if (mode !== 'all') {
        throw new BadRequestException('刷盘账本只支持“直接清空”：实际只删除 latest_version <= flushed_version 且无有效 claim 的已完成账本');
    }
    const quotedTableName = quoteIdentifier(tableName);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`LOCK TABLE ${quotedTableName} IN ACCESS EXCLUSIVE MODE`);
        const countResult = await client.query(
            `
            SELECT
                COUNT(*)::bigint AS total_rows,
                COUNT(*) FILTER (WHERE latest_version > flushed_version)::bigint AS dirty_rows,
                COUNT(*) FILTER (WHERE claim_until IS NOT NULL AND claim_until >= now())::bigint AS active_claim_rows
            FROM ${quotedTableName}
            `,
        );
        const totalRows = Math.max(0, Math.trunc(Number(countResult.rows[0]?.total_rows ?? 0)));
        const dirtyRows = Math.max(0, Math.trunc(Number(countResult.rows[0]?.dirty_rows ?? 0)));
        const activeClaimRows = Math.max(0, Math.trunc(Number(countResult.rows[0]?.active_claim_rows ?? 0)));
        if (activeClaimRows > 0) {
            throw new BadRequestException(`刷盘账本仍有 ${activeClaimRows} 条有效 claim，拒绝清理: ${tableName}`);
        }
        let deletedRows = 0;
        let compacted = false;
        if (dirtyRows === 0) {
            await client.query(`TRUNCATE TABLE ${quotedTableName}`);
            deletedRows = totalRows;
            compacted = true;
        } else {
            const deleteResult = await client.query(
                `
                DELETE FROM ${quotedTableName}
                WHERE latest_version <= flushed_version
                  AND (claimed_by IS NULL OR claim_until < now())
                `,
            );
            deletedRows = deleteResult.rowCount ?? 0;
        }
        await client.query('COMMIT');
        await pool.query(`ANALYZE ${quotedTableName}`);
        return {
            target: tableName,
            mode,
            deletedRows,
            message: compacted
                ? `已清空 ${tableName} 的 ${deletedRows} 条已完成刷盘账本，并通过 TRUNCATE 释放物理空间`
                : `已删除 ${tableName} 的 ${deletedRows} 条已完成刷盘账本；仍有 ${dirtyRows} 条未完成任务，物理空间会由 PostgreSQL 后续复用`,
        };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    } finally {
        client.release();
    }
}

function formatPgBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function buildTableColumnsMap(rows: Array<Record<string, unknown>>): Map<string, DatabaseTableColumnInfo[]> {
    const map = new Map<string, DatabaseTableColumnInfo[]>();
    for (const row of rows) {
        const tableName = String(row.table_name ?? '');
        const columnName = String(row.column_name ?? '');
        const dataType = String(row.data_type ?? '');
        if (!tableName || !columnName) continue;
        const columns = map.get(tableName) ?? [];
        columns.push({ columnName, dataType });
        map.set(tableName, columns);
    }
    return map;
}

function normalizeDatabaseCleanupTableName(target: string): string {
    const tableName = String(target ?? '').trim();
    if (!/^[a-z_][a-z0-9_]*$/iu.test(tableName)) {
        throw new BadRequestException('清理目标表名非法');
    }
    return tableName;
}

function getDatabaseCleanupBlockedReason(tableName: string, columns: DatabaseTableColumnInfo[]): string | null {
    if (!columns.length) {
        return '表不存在或不是 public 普通表';
    }
    if (DATABASE_CLEANUP_SPECIALIZED_TABLES.has(tableName)) {
        return '刷盘账本必须通过 flush-ledger-retention 调度器任务按 version/claim/retry 语义清理';
    }
    if (DATABASE_CLEANUP_OPERATIONAL_TABLES.has(tableName)) {
        return null;
    }
    if (DATABASE_CLEANUP_PROTECTED_EXACT_TABLES.has(tableName)) {
        return '真实落盘数据表不允许清理';
    }
    if (DATABASE_CLEANUP_PROTECTED_PREFIXES.some((prefix) => tableName.startsWith(prefix))) {
        return '真实落盘数据表不允许清理';
    }
    return null;
}

async function loadPublicRegularTableColumns(pool: Pool, tableName: string): Promise<DatabaseTableColumnInfo[]> {
    const result = await pool.query(
        `
        SELECT c.column_name, c.data_type
        FROM information_schema.columns c
        JOIN pg_class pc ON pc.relname = c.table_name
        JOIN pg_namespace pn ON pn.oid = pc.relnamespace AND pn.nspname = c.table_schema
        WHERE c.table_schema = 'public'
          AND c.table_name = $1
          AND pc.relkind = 'r'
        ORDER BY c.ordinal_position ASC
        `,
        [tableName],
    );
    return result.rows.map((row) => ({
        columnName: String(row.column_name ?? ''),
        dataType: String(row.data_type ?? ''),
    })).filter((column) => column.columnName);
}

function resolveDatabaseCleanupTimeColumn(columns: DatabaseTableColumnInfo[]): DatabaseCleanupTimeColumn | null {
    const columnsByName = new Map(columns.map((column) => [column.columnName, column]));
    for (const candidate of DATABASE_CLEANUP_TIME_COLUMN_CANDIDATES) {
        const column = columnsByName.get(candidate);
        if (!column) continue;
        const kind = resolveDatabaseCleanupTimeColumnKind(column);
        if (kind) {
            return { columnName: column.columnName, kind };
        }
    }
    for (const column of columns) {
        const kind = resolveDatabaseCleanupTimeColumnKind(column);
        if (kind && /(?:^|_)(?:created|updated|failed|delivered|archived|heartbeat|started|dirty_since)(?:_|$)/iu.test(column.columnName)) {
            return { columnName: column.columnName, kind };
        }
    }
    return null;
}

function resolveDatabaseCleanupTimeColumnKind(column: DatabaseTableColumnInfo): DatabaseCleanupTimeColumn['kind'] | null {
    const dataType = column.dataType.toLowerCase();
    if (dataType === 'timestamp with time zone' || dataType === 'timestamp without time zone' || dataType === 'date') {
        return 'timestamp';
    }
    if ((dataType === 'bigint' || dataType === 'integer' || dataType === 'numeric') && /(?:_at_ms|_ms)$/iu.test(column.columnName)) {
        return 'epoch_ms';
    }
    if ((dataType === 'character varying' || dataType === 'text' || dataType === 'character') && /_at_text$/iu.test(column.columnName)) {
        return 'iso_text';
    }
    return null;
}

function buildDatabaseCleanupTimePredicate(column: DatabaseCleanupTimeColumn): string {
    const quotedColumn = quoteIdentifier(column.columnName);
    if (column.kind === 'epoch_ms') {
        return `${quotedColumn} < (EXTRACT(EPOCH FROM (now() - $1::interval)) * 1000)::bigint`;
    }
    if (column.kind === 'iso_text') {
        return `${quotedColumn} < to_char((now() AT TIME ZONE 'UTC') - $1::interval, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
    }
    return `${quotedColumn} < now() - $1::interval`;
}

async function ensureNativeGmAdminTables(pool) {
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

async function readCurrentGmAuthRecord(pool: Pool): Promise<PreservedGmAuthRecord | null> {
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

async function restorePreservedGmAuthRecord(pool: Pool, record: PreservedGmAuthRecord | null): Promise<void> {
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
/**
 * resolveBackupDirectory：规范化或转换BackupDirectory。
 * @returns 无返回值，直接更新BackupDirectory相关状态。
 */

function resolveBackupDirectory() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const configured = process.env.SERVER_GM_DATABASE_BACKUP_DIR?.trim()
        || process.env.GM_DATABASE_BACKUP_DIR?.trim()
        || '';
    if (configured) {
        return resolve(configured);
    }
    return resolve(__dirname, '../../../../.runtime/gm-database-backups');
}

function resolveBackupWorkerRootDirectory(backupDirectory) {
    const configured = process.env.SERVER_DATABASE_BACKUP_WORKER_ROOT_DIR?.trim()
        || process.env.DATABASE_BACKUP_WORKER_ROOT_DIR?.trim()
        || '';
    return configured ? resolve(configured) : dirname(backupDirectory);
}

async function readBackupWorkerActive(backupDirectory) {
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

function buildBackupId() {
    return `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}
/**
 * cloneDatabaseJob：构建DatabaseJob。
 * @param value 参数说明。
 * @returns 无返回值，直接更新DatabaseJob相关状态。
 */

function cloneDatabaseJob(value) {
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

function getDatabaseJobLogs(value) {
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

function normalizeDatabaseJobLogEntry(value) {
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

function buildBackupFilePath(backupDirectory, fileName) {
    return join(backupDirectory, fileName);
}
/**
 * resolveExistingBackupFilePath：判断ExistingBackupFile路径是否满足条件。
 * @param filePath 参数说明。
 * @returns 无返回值，直接更新ExistingBackupFile路径相关状态。
 */

async function resolveExistingBackupFilePath(filePath) {

    const stats = await fsPromises.stat(filePath).catch(() => null);
    return stats?.isFile() ? filePath : null;
}
/**
 * resolveBackupRecordFormat：读取BackupRecord格式并返回结果。
 * @param record 参数说明。
 * @returns 无返回值，完成BackupRecord格式的读取/组装。
 */

async function resolveBackupRecordFormat(record) {
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

function inferBackupFormatFromFileName(fileName) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalized = typeof fileName === 'string' ? fileName.trim().toLowerCase() : '';
    if (!normalized) {
        return 'unknown';
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

function normalizeStoredDatabaseJobState(value) {

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

function shouldRecoverCompletedDatabaseJob(job) {
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

function normalizeDatabaseJobSnapshot(value) {
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
/**
 * normalizeStoredBackupMetadata：规范化或转换StoredBackupMetadata。
 * @param value 参数说明。
 * @returns 无返回值，直接更新StoredBackupMetadata相关状态。
 */

function normalizeStoredBackupMetadata(value) {
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

function assertCompatibleBackupPayload(value) {
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

function normalizeBackupFormatValue(value) {
    const format = typeof value === 'string' ? value.trim() : '';
    if (format === 'postgres_custom_dump') {
        return 'postgres_custom_dump';
    }
    if (format === LEGACY_JSON_BACKUP_FORMAT || format === OLD_JSON_BACKUP_FORMAT) {
        return LEGACY_JSON_BACKUP_FORMAT;
    }
    return null;
}

function isKnownBackupScope(value) {
    const scope = typeof value === 'string' ? value.trim() : '';
    return scope === BACKUP_SCOPE_LABEL
        || scope === LEGACY_BACKUP_SCOPE_LABEL
        || scope === OLD_SERVER_BACKUP_SCOPE_LABEL
        || scope === OLD_LEGACY_BACKUP_SCOPE_LABEL;
}

function normalizeBackupScope(value) {
    const scope = typeof value === 'string' ? value.trim() : '';
    if (scope === LEGACY_BACKUP_SCOPE_LABEL || scope === OLD_LEGACY_BACKUP_SCOPE_LABEL) {
        return LEGACY_BACKUP_SCOPE_LABEL;
    }
    return BACKUP_SCOPE_LABEL;
}

function normalizeStructuredBackupTableEntry(value, index) {
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

function computeStructuredTableChecksum(rows) {
    return createHash('sha256').update(JSON.stringify(Array.isArray(rows) ? rows : [])).digest('hex');
}

function computeStructuredTablesChecksum(tables) {
    const normalized = Array.isArray(tables)
        ? tables.map((entry) => ({
            tableName: typeof entry?.tableName === 'string' ? entry.tableName : '',
            rowCount: Number(entry?.rowCount ?? 0),
            checksumSha256: typeof entry?.checksumSha256 === 'string' ? entry.checksumSha256 : '',
        }))
        : [];
    return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function quoteIdentifier(identifier) {
    return `"${String(identifier ?? '').replace(/"/gu, '""')}"`;
}
/**
 * summarizeText：执行summarizeText相关逻辑。
 * @param value 参数说明。
 * @returns 无返回值，直接更新summarizeText相关状态。
 */

function summarizeText(value) {

    const normalized = String(value ?? '').replace(/\s+/gu, ' ').trim();
    return normalized.length > 160 ? `${normalized.slice(0, 160)}...` : normalized;
}
/**
 * normalizePersistentDocumentBackupEntry：判断PersistentDocumentBackup条目是否满足条件。
 * @param value 参数说明。
 * @param index 参数说明。
 * @returns 无返回值，直接更新PersistentDocumentBackup条目相关状态。
 */

function normalizePersistentDocumentBackupEntry(value, index = -1) {
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

function computeBackupChecksum(docs) {
    return createHash('sha256').update(JSON.stringify(docs)).digest('hex');
}
/**
 * readBooleanEnv：读取BooleanEnv并返回结果。
 * @param key 参数说明。
 * @returns 无返回值，完成BooleanEnv的读取/组装。
 */

function readBooleanEnv(key) {
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

function asRecord(value) {
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

function normalizeTimestamp(value) {
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

function readInteger(value, fallback = 0) {

    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function normalizeNullableInteger(value) {
    if (value == null || value === '') {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function normalizePositiveInteger(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function resolveDatabaseUploadMaxBytes() {
    const raw = process.env.SERVER_GM_DATABASE_UPLOAD_MAX_BYTES
        ?? process.env.GM_DATABASE_UPLOAD_MAX_BYTES
        ?? '';
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_DATABASE_UPLOAD_MAX_BYTES;
    }
    return Math.trunc(parsed);
}

function formatByteLimit(value) {
    if (value >= 1024 * 1024 * 1024) {
        return `${Math.floor(value / (1024 * 1024 * 1024))}GB`;
    }
    if (value >= 1024 * 1024) {
        return `${Math.floor(value / (1024 * 1024))}MB`;
    }
    return `${value}B`;
}

function normalizeUploadFileName(value) {
    const raw = typeof value === 'string' ? value.trim() : '';
    const decoded = decodeHeaderFileName(raw);
    const normalized = basename(decoded || 'uploaded.dump').replace(/[^\w.\-\u4e00-\u9fa5]/gu, '_');
    return normalized || 'uploaded.dump';
}

function decodeHeaderFileName(value) {
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

function resolveUploadedBackupExtension(fileName) {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.dump.gz')) {
        return '.dump.gz';
    }
    if (lower.endsWith('.dump')) {
        return '.dump';
    }
    throw new BadRequestException('上传文件类型不受支持，仅支持 PostgreSQL 自定义备份（.dump 或 .dump.gz）');
}

function buildUploadedBackupId() {
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/gu, '').slice(0, 14);
    return `uploaded-${timestamp}-${randomUUID().slice(0, 8)}`;
}

async function writeUploadStreamToFile(stream, filePath, maxBytes) {
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

async function decompressGzipFile(gzipPath, outputPath) {
    const source = createReadStream(gzipPath);
    const gunzip = createGunzip();
    const destination = createWriteStream(outputPath, { flags: 'wx' });
    await pipeline(source, gunzip, destination);
}

async function validateUploadedDatabaseBackup(filePath, originalFileName) {
    const magicFormat = await detectDatabaseBackupFormat(filePath, '');
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

function clampInteger(value, fallback, min, max) {
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
