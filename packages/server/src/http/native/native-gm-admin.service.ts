import {
    BadRequestException,
    Inject,
    Injectable,
    InternalServerErrorException,
    Logger,
    ServiceUnavailableException,
    UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { promises as fsPromises } from 'node:fs';
import { join, resolve } from 'node:path';
import { URL } from 'node:url';
import { Pool } from 'pg';
import { resolveServerDatabaseUrl } from '../../config/env-alias';
import { ensurePersistentDocumentsTable } from '../../persistence/persistent-document-table';
import { NativeDatabaseRestoreCoordinatorService } from './native-database-restore-coordinator.service';
import { NATIVE_GM_RESTORE_CONTRACT } from './native-gm-contract';
import { WorldRuntimeService } from '../../runtime/world/world-runtime.service';
import {
    buildPostgresDumpFileName,
    computeDatabaseBackupFileSha256,
    createPostgresCustomDump,
    detectDatabaseBackupFormat,
    restorePostgresCustomDump,
} from './native-postgres-backup';
const DEFAULT_AFDIAN_API_BASE_URL = 'https://afdian.net';

const DEFAULT_AFDIAN_WEBHOOK_PATH = '/integrations/afdian/webhook';

const AFDIAN_PING_PATH = '/api/open/ping';

const AFDIAN_QUERY_ORDER_PATH = '/api/open/query-order';

const AFDIAN_KNOWN_HOSTS = new Set([
    'afdian.net',
    'www.afdian.net',
    'ifdian.net',
    'www.ifdian.net',
]);

const AFDIAN_CONFIG_SCOPE = 'server_afdian_config_v1';

const AFDIAN_CONFIG_KEY = 'afdian';

const AFDIAN_ORDER_SCOPE = 'server_afdian_orders_v1';

const DATABASE_BACKUP_METADATA_SCOPE = 'server_db_backups_v1';

const DATABASE_JOB_STATE_SCOPE = 'server_db_jobs_v1';

const DATABASE_JOB_STATE_KEY = 'gm_database';

const AFDIAN_CONFIG_SCOPES = [AFDIAN_CONFIG_SCOPE];

const AFDIAN_ORDER_SCOPES = [AFDIAN_ORDER_SCOPE];

const DATABASE_BACKUP_METADATA_SCOPES = [DATABASE_BACKUP_METADATA_SCOPE];

const DATABASE_JOB_STATE_SCOPES = [DATABASE_JOB_STATE_SCOPE];

const BACKUP_FILE_PREFIX = 'server-database-backup';
const LEGACY_BACKUP_FILE_PREFIX = 'server-persistent-documents';

const LEGACY_BACKUP_FILE_KIND = 'server_persistent_documents_backup_v1';

const LEGACY_MAINLINE_BACKUP_FILE_KIND = 'server_persistence_backup_v2';

const LEGACY_BACKUP_SCOPE_LABEL = 'persistent_documents_only';

const BACKUP_SCOPE_LABEL = 'server_persistence';

const BACKUP_EXCLUDED_SCOPES = new Set([
    DATABASE_BACKUP_METADATA_SCOPE,
    DATABASE_JOB_STATE_SCOPE,
]);

const MAINLINE_BACKUP_TABLES = [
    'server_player_auth',
    'server_player_identity',
    'player_identity',
    'server_player_snapshot',
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
 * initialAfdianPersistentConfigFromEnv：initialAfdianPersistent配置FromEnv相关字段。
 */

    initialAfdianPersistentConfigFromEnv = hasEnvBackedAfdianPersistentConfig();    
    /**
 * initialAfdianPersistentConfig：initialAfdianPersistent配置状态或数据块。
 */

    initialAfdianPersistentConfig = readPersistentConfigFromEnv();    
    /**
 * initialAfdianRuntimeToken：initialAfdian运行态Token标识。
 */

    initialAfdianRuntimeToken = readRuntimeTokenFromEnv();    
    /**
 * afdianPersistentConfig：afdianPersistent配置状态或数据块。
 */

    afdianPersistentConfig = cloneAfdianPersistentConfig(this.initialAfdianPersistentConfig);    
    /**
 * afdianRuntimeToken：afdian运行态Token标识。
 */

    afdianRuntimeToken = this.initialAfdianRuntimeToken;    
    /**
 * memoryOrdersByTradeNo：memory订单ByTradeNo相关字段。
 */

    memoryOrdersByTradeNo = new Map();    
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
        this.pool = new Pool({
            connectionString: databaseUrl,
        });
        try {
            await ensurePersistentDocumentsTable(this.pool);
            this.persistenceEnabled = true;
            await this.reloadPersistentCompatibilityState();
            await this.loadPersistedDatabaseJobState();
            await this.backfillBackupMetadataFromFilesystem();
        }
        catch (error) {
            this.logger.error('旧 GM 管理兼容持久化初始化失败', error instanceof Error ? error.stack : String(error));
            await this.closePool();
        }
    }
    /**
 * onModuleDestroy：执行on模块Destroy相关逻辑。
 * @returns 无返回值，直接更新on模块Destroy相关状态。
 */

    async onModuleDestroy() {
        await this.closePool();
    }
    /**
 * getDatabaseState：读取Database状态。
 * @returns 无返回值，完成Database状态的读取/组装。
 */

    async getDatabaseState() {

        const backups = await this.listDatabaseBackups();
        return {
            backups,
            runningJob: this.currentDatabaseJob ?? undefined,
            lastJob: this.lastDatabaseJob ?? undefined,
            retention: { ...DEFAULT_DB_RETENTION },
            schedules: { ...DEFAULT_DB_SCHEDULES },
            automation: {
                retentionEnforced: false,
                schedulesActive: false,
                restoreRequiresMaintenance: NATIVE_GM_RESTORE_CONTRACT.requiresMaintenance,
                preImportBackupEnabled: NATIVE_GM_RESTORE_CONTRACT.preImportBackupEnabled,
            },
            persistenceEnabled: this.persistenceEnabled,
            scope: NATIVE_GM_RESTORE_CONTRACT.scope,
            restoreMode: NATIVE_GM_RESTORE_CONTRACT.restoreMode,
            runtimeSummary: typeof this.worldRuntimeService?.getRuntimeSummary === 'function'
                ? this.worldRuntimeService.getRuntimeSummary()
                : null,
            note: '当前手工导出会生成 PostgreSQL custom dump，覆盖整个主线数据库真源；恢复时优先按原生数据库备份走 pg_restore，历史 JSON 持久化快照仍保持兼容导入。旧后端 users/players 仍不在当前主线 restore 合同内。',
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
        };
    }
    /**
 * triggerDatabaseRestore：执行triggerDatabaseRestore相关逻辑。
 * @param backupId backup ID。
 * @returns 无返回值，直接更新triggerDatabaseRestore相关状态。
 */

    async triggerDatabaseRestore(backupId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.assertRestoreMaintenanceEnabled();

        const record = await this.findBackupRecord(backupId);
        if (!record) {
            throw new BadRequestException('目标备份不存在');
        }
        if (!record.filePath) {
            throw new BadRequestException('目标备份文件不存在，请检查备份卷或目录配置');
        }
        if (!this.pool || !this.persistenceEnabled) {
            throw new BadRequestException('当前未启用数据库持久化，暂不支持导入兼容备份');
        }
        const backupFormat = await resolveBackupRecordFormat(record);
        if (backupFormat === 'postgres_custom_dump') {
            const recordedChecksum = typeof record.checksumSha256 === 'string' ? record.checksumSha256.trim() : '';
            if (!recordedChecksum) {
                throw new BadRequestException('目标备份缺少 checksumSha256，无法校验 PostgreSQL 数据库归档完整性');
            }
            const actualChecksum = await computeDatabaseBackupFileSha256(record.filePath);
            if (actualChecksum !== recordedChecksum) {
                throw new BadRequestException('目标备份 checksumSha256 校验失败，PostgreSQL 数据库归档可能已损坏或被篡改');
            }
        }

        const client = await this.pool.connect();

        const startedAt = new Date().toISOString();
        client.release();

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
            try {
                process.env.SERVER_RUNTIME_RESTORE_ACTIVE = '1';
                this.updateDatabaseJobPhase(job, RESTORE_JOB_PHASE.PREPARING_RUNTIME);
                await this.databaseRestoreCoordinator.prepareForRestore();
                this.updateDatabaseJobPhase(job, RESTORE_JOB_PHASE.APPLYING_DOCUMENTS);
                if (backupFormat === 'postgres_custom_dump') {
                    const databaseUrl = resolveServerDatabaseUrl();
                    if (!databaseUrl.trim()) {
                        throw new BadRequestException('当前未提供 SERVER_DATABASE_URL/DATABASE_URL，无法执行 PostgreSQL 数据库恢复');
                    }
                    await restorePostgresCustomDump(record.filePath, databaseUrl);
                }
                else {
                    const payload = await this.readBackupPayload(record.filePath);
                    const validatedPayload = assertCompatibleBackupPayload(payload);
                    const restoreClient = await this.pool.connect();
                    try {
                        await restoreClient.query('BEGIN');
                        await this.clearStructuredBackupTables(restoreClient);
                        await restoreClient.query('DELETE FROM persistent_documents WHERE NOT (scope = ANY($1::varchar[]))', [Array.from(BACKUP_EXCLUDED_SCOPES)]);
                        await this.insertBackupDocumentsInBatches(restoreClient, validatedPayload.docs);
                        await this.insertBackupTablesInBatches(restoreClient, validatedPayload.tables);
                        await restoreClient.query('COMMIT');
                    }
                    catch (error) {
                        await restoreClient.query('ROLLBACK').catch(() => undefined);
                        throw error;
                    }
                    finally {
                        restoreClient.release();
                    }
                }
                job.appliedAt = new Date().toISOString();
                this.updateDatabaseJobPhase(job, RESTORE_JOB_PHASE.COMMITTED);
            }
            finally {
                delete process.env.SERVER_RUNTIME_RESTORE_ACTIVE;
                this.updateDatabaseJobPhase(job, RESTORE_JOB_PHASE.RELOADING_RUNTIME);
                await this.reloadPersistentCompatibilityState();
                await this.databaseRestoreCoordinator.reloadAfterRestore();
                this.updateDatabaseJobPhase(job, RESTORE_JOB_PHASE.COMPLETED);
            }
        });
        return {
            job,
            scope: BACKUP_SCOPE_LABEL,
        };
    }
    /**
 * getAfdianConfig：读取Afdian配置。
 * @returns 无返回值，完成Afdian配置的读取/组装。
 */

    getAfdianConfig() {
        return {
            config: this.getAfdianConfigForm(),
            status: this.getAfdianConfigStatus(),
        };
    }    
    /**
 * saveAfdianConfig：执行saveAfdian配置相关逻辑。
 * @param input 输入参数。
 * @returns 无返回值，直接更新saveAfdian配置相关状态。
 */

    async saveAfdianConfig(input) {

        const normalized = normalizePersistentConfig(input ?? {});

        const runtimeToken = normalizeEnvValue(input?.token) ?? '';
        this.applyAfdianPersistentConfig(normalized);
        this.applyAfdianRuntimeToken(runtimeToken);
        await this.persistAfdianPersistentConfig(normalized);
        return this.getAfdianConfig();
    }    
    /**
 * listAfdianOrders：读取Afdian订单并返回结果。
 * @param query 参数说明。
 * @returns 无返回值，完成Afdian订单的读取/组装。
 */

    async listAfdianOrders(query) {

        const limit = clampInteger(query?.limit, 20, 1, 100);

        const offset = clampInteger(query?.offset, 0, 0, 100000);

        const status = Number.isFinite(Number(query?.status)) ? Math.trunc(Number(query.status)) : null;

        const userId = typeof query?.userId === 'string' ? query.userId.trim() : '';

        const planId = typeof query?.planId === 'string' ? query.planId.trim() : '';

        const orders = await this.loadAllAfdianOrders();

        const filtered = orders.filter((entry) => {
            if (status !== null && entry.status !== status) {
                return false;
            }
            if (userId && entry.userId !== userId) {
                return false;
            }
            if (planId && entry.planId !== planId) {
                return false;
            }
            return true;
        }).sort((left, right) => {
            if (left.updatedAt !== right.updatedAt) {
                return right.updatedAt.localeCompare(left.updatedAt);
            }
            return right.outTradeNo.localeCompare(left.outTradeNo, 'zh-Hans-CN');
        });
        return {
            total: filtered.length,
            limit,
            offset,
            items: filtered.slice(offset, offset + limit),
        };
    }    
    /**
 * pingAfdianApi：执行pingAfdianApi相关逻辑。
 * @param input 输入参数。
 * @returns 无返回值，直接更新pingAfdianApi相关状态。
 */

    async pingAfdianApi(input) {

        const config = this.getRequiredAfdianApiConfig(input?.token);
        await this.requestAfdianApi(config.userId, config.token, AFDIAN_PING_PATH, {});
        return {
            ...this.getAfdianConfigStatus(),
            reachable: true,
        };
    }    
    /**
 * syncAfdianOrders：处理Afdian订单并更新相关状态。
 * @param input 输入参数。
 * @returns 无返回值，直接更新Afdian订单相关状态。
 */

    async syncAfdianOrders(input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const config = this.getRequiredAfdianApiConfig(input?.token);

        const outTradeNo = typeof input?.outTradeNo === 'string' ? input.outTradeNo.trim() : '';
        if (outTradeNo) {

            const response = await this.queryAfdianOrders(config.userId, config.token, {
                out_trade_no: outTradeNo,
            });

            const orders = extractAfdianOrderList(response);

            const upsertedOrders = await this.upsertAfdianOrders(orders, 'api');
            return {
                requestedPages: 1,
                syncedPages: 1,
                receivedOrders: orders.length,
                upsertedOrders,

                totalCount: typeof response?.data?.total_count === 'number' ? response.data.total_count : orders.length,

                totalPage: typeof response?.data?.total_page === 'number' ? response.data.total_page : 1,
            };
        }

        const page = clampInteger(input?.page, 1, 1, 999999);

        const maxPages = clampInteger(input?.maxPages, 1, 1, 20);

        let syncedPages = 0;

        let receivedOrders = 0;

        let upsertedOrders = 0;

        let totalCount = null;

        let totalPage = null;
        for (let index = 0; index < maxPages; index += 1) {
            const currentPage = page + index;
            const response = await this.queryAfdianOrders(config.userId, config.token, {
                page: currentPage,
            });

            const orders = extractAfdianOrderList(response);
            syncedPages += 1;
            receivedOrders += orders.length;
            upsertedOrders += await this.upsertAfdianOrders(orders, 'api');
            totalCount = typeof response?.data?.total_count === 'number' ? response.data.total_count : totalCount;
            totalPage = typeof response?.data?.total_page === 'number' ? response.data.total_page : totalPage;
            if (orders.length === 0 || (typeof totalPage === 'number' && currentPage >= totalPage)) {
                break;
            }
        }
        return {
            requestedPages: maxPages,
            syncedPages,
            receivedOrders,
            upsertedOrders,
            totalCount,
            totalPage,
        };
    }    
    /**
 * handleAfdianWebhook：处理AfdianWebhook并更新相关状态。
 * @param body 参数说明。
 * @param headers 参数说明。
 * @returns 无返回值，直接更新AfdianWebhook相关状态。
 */

    async handleAfdianWebhook(body, headers = {}) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const envelope = asRecord(body);
        if (!envelope) {
            throw new BadRequestException('Webhook body 必须为 JSON 对象');
        }
        assertAfdianWebhookAuthorized(envelope, headers);

        const data = asRecord(envelope.data);

        const type = typeof data?.type === 'string' ? data.type.trim() : '';
        if (type !== 'order') {
            return;
        }

        const order = normalizeAfdianOrderPayload(data.order);
        if (!order) {
            throw new BadRequestException('爱发电订单数据不合法');
        }

        const configuredUserId = normalizeEnvValue(this.afdianPersistentConfig.userId);
        if (configuredUserId !== null && order.user_id !== configuredUserId) {
            throw new BadRequestException('爱发电订单 user_id 与当前配置不匹配');
        }
        await this.upsertAfdianOrders([order], 'webhook');
    }    
    /**
 * reloadPersistentCompatibilityState：读取reloadPersistentCompatibility状态并返回结果。
 * @returns 无返回值，直接更新reloadPersistentCompatibility状态相关状态。
 */

    async reloadPersistentCompatibilityState() {
        this.memoryOrdersByTradeNo.clear();
        await this.loadAfdianPersistentConfig();
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

        const payload = await this.loadPersistentPayloadByScopes(DATABASE_JOB_STATE_SCOPES, DATABASE_JOB_STATE_KEY);
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
        INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
        VALUES ($1, $2, $3::jsonb, now())
        ON CONFLICT (scope, key)
        DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
      `, [DATABASE_JOB_STATE_SCOPE, DATABASE_JOB_STATE_KEY, JSON.stringify(payload)]);
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
        INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
        VALUES ($1, $2, $3::jsonb, now())
        ON CONFLICT (scope, key)
        DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
      `, [DATABASE_BACKUP_METADATA_SCOPE, normalized.id, JSON.stringify(normalized)]);
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

        const records = new Map();
        for (const scope of DATABASE_BACKUP_METADATA_SCOPES) {
            const result = await this.pool.query('SELECT key, payload FROM persistent_documents WHERE scope = $1 ORDER BY key DESC', [scope]);
            for (const row of result.rows) {
                const normalized = normalizeStoredBackupMetadata({
                    id: typeof row?.key === 'string' ? row.key : '',
                    ...(row?.payload && typeof row.payload === 'object' ? row.payload : {}),
                });
                if (!normalized || records.has(normalized.id)) {
                    continue;
                }
                records.set(normalized.id, normalized);
            }
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
        await Promise.all(records.map(async (record) => {
            const existing = persistedById.get(record.id);
            const format = existing?.format ?? record.format;
            const checksumSha256 = existing?.checksumSha256
                ?? (format === 'postgres_custom_dump' && record.filePath
                    ? await computeDatabaseBackupFileSha256(record.filePath).catch(() => undefined)
                    : undefined);
            await this.persistBackupMetadata({
                id: record.id,
                kind: existing?.kind ?? record.kind,
                fileName: record.fileName,
                createdAt: existing?.createdAt ?? record.createdAt,
                sizeBytes: record.sizeBytes,
                scope: existing?.scope ?? BACKUP_SCOPE_LABEL,
                documentsCount: existing?.documentsCount,
                checksumSha256,
                tablesCount: existing?.tablesCount,
                tablesChecksumSha256: existing?.tablesChecksumSha256,
                format,
            });
        }));
    }    
    /**
 * loadAfdianPersistentConfig：读取AfdianPersistent配置并返回结果。
 * @returns 无返回值，完成AfdianPersistent配置的读取/组装。
 */

    async loadAfdianPersistentConfig() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.pool || !this.persistenceEnabled) {
            return;
        }

        const initialConfig = cloneAfdianPersistentConfig(this.initialAfdianPersistentConfig);
        const payload = await this.loadPersistentPayloadByScopes(AFDIAN_CONFIG_SCOPES, AFDIAN_CONFIG_KEY);
        if (!payload) {
            this.applyAfdianPersistentConfig(initialConfig);
            if (this.initialAfdianPersistentConfigFromEnv) {
                await this.persistAfdianPersistentConfig(initialConfig);
            }
            return;
        }
        this.applyAfdianPersistentConfig(normalizeStoredPersistentConfig(payload));
    }    
    /**
 * persistAfdianPersistentConfig：判断persistAfdianPersistent配置是否满足条件。
 * @param config 参数说明。
 * @returns 无返回值，直接更新persistAfdianPersistent配置相关状态。
 */

    async persistAfdianPersistentConfig(config) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.pool || !this.persistenceEnabled) {
            return;
        }
        await this.pool.query(`
        INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
        VALUES ($1, $2, $3::jsonb, now())
        ON CONFLICT (scope, key)
        DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
        WHERE persistent_documents.payload IS DISTINCT FROM EXCLUDED.payload
      `, [AFDIAN_CONFIG_SCOPE, AFDIAN_CONFIG_KEY, JSON.stringify(config)]);
    }    
    /**
 * getAfdianConfigForm：读取Afdian配置Form。
 * @returns 无返回值，完成Afdian配置Form的读取/组装。
 */

    getAfdianConfigForm() {
        return {
            userId: this.afdianPersistentConfig.userId,
            token: '',
            apiBaseUrl: this.afdianPersistentConfig.apiBaseUrl,
            publicBaseUrl: this.afdianPersistentConfig.publicBaseUrl,
        };
    }    
    /**
 * getAfdianConfigStatus：读取Afdian配置Statu。
 * @returns 无返回值，完成Afdian配置Statu的读取/组装。
 */

    getAfdianConfigStatus() {

        const userId = normalizeEnvValue(this.afdianPersistentConfig.userId);

        const token = normalizeEnvValue(this.afdianRuntimeToken);

        const webhookPath = DEFAULT_AFDIAN_WEBHOOK_PATH;

        const webhookSecret = readAfdianWebhookSecret();
        return {

            enabled: userId !== null,

            apiEnabled: userId !== null && token !== null,
            webhookPath,
            webhookUrl: buildWebhookUrl(this.afdianPersistentConfig.publicBaseUrl, webhookPath),
            apiBaseUrl: this.afdianPersistentConfig.apiBaseUrl,
            userId,

            hasToken: token !== null,

            webhookAuthEnabled: webhookSecret !== null,

            webhookAuthMode: webhookSecret !== null ? 'shared_token' : 'none',
        };
    }    
    /**
 * getRequiredAfdianApiConfig：读取RequiredAfdianApi配置。
 * @param requestToken 参数说明。
 * @returns 无返回值，完成RequiredAfdianApi配置的读取/组装。
 */

    getRequiredAfdianApiConfig(requestToken) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const userId = normalizeEnvValue(this.afdianPersistentConfig.userId);

        const token = normalizeEnvValue(requestToken) ?? normalizeEnvValue(this.afdianRuntimeToken);
        if (!userId || !token) {
            throw new ServiceUnavailableException('AFDIAN_USER_ID 或 AFDIAN_TOKEN 未配置');
        }
        return { userId, token };
    }    
    /**
 * queryAfdianOrders：读取Afdian订单并返回结果。
 * @param userId user ID。
 * @param token 参数说明。
 * @param params 参数说明。
 * @returns 无返回值，完成Afdian订单的读取/组装。
 */

    async queryAfdianOrders(userId, token, params) {
        return this.requestAfdianApi(userId, token, AFDIAN_QUERY_ORDER_PATH, params);
    }    
    /**
 * requestAfdianApi：执行requestAfdianApi相关逻辑。
 * @param userId user ID。
 * @param token 参数说明。
 * @param apiPath 参数说明。
 * @param params 参数说明。
 * @returns 无返回值，直接更新requestAfdianApi相关状态。
 */

    async requestAfdianApi(userId, token, apiPath, params) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const ts = Math.floor(Date.now() / 1000);

        const paramsJson = JSON.stringify(params ?? {});

        const signSource = `${token}params${paramsJson}ts${ts}user_id${userId}`;

        const sign = createHash('md5').update(signSource).digest('hex');

        const url = new URL(`${this.afdianPersistentConfig.apiBaseUrl.replace(/\/+$/u, '')}${apiPath}`);

        const timeoutSignal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(10_000)
            : undefined;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                user_id: userId,
                params: paramsJson,
                ts,
                sign,
            }),
            signal: timeoutSignal,
        });

        const text = await response.text();
        if (!response.ok) {
            throw new InternalServerErrorException(`爱发电 API 请求失败: HTTP ${response.status}${text ? `，响应: ${summarizeText(text)}` : ''}`);
        }

        let parsed;
        try {
            parsed = JSON.parse(text);
        }
        catch (error) {
            throw new InternalServerErrorException(`爱发电 API 返回了非 JSON 数据: ${String(error)}`);
        }

        const record = asRecord(parsed);
        if (!record || typeof record.ec !== 'number' || typeof record.em !== 'string') {
            throw new InternalServerErrorException('爱发电 API 返回结构不合法');
        }
        return record;
    }    
    /**
 * upsertAfdianOrders：执行upsertAfdian订单相关逻辑。
 * @param orders 参数说明。
 * @param source 来源对象。
 * @returns 无返回值，直接更新upsertAfdian订单相关状态。
 */

    async upsertAfdianOrders(orders, source) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        let upserted = 0;
        for (const order of orders) {
            const change = await this.buildStoredAfdianOrderChange(order, source);
            if (!change.changed) {
                continue;
            }

            const stored = change.stored;
            if (this.pool && this.persistenceEnabled) {
                await this.pool.query(`
            INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
            VALUES ($1, $2, $3::jsonb, now())
            ON CONFLICT (scope, key)
            DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
          `, [AFDIAN_ORDER_SCOPE, stored.outTradeNo, JSON.stringify(stored)]);
            }
            else {
                this.memoryOrdersByTradeNo.set(stored.outTradeNo, stored);
            }
            upserted += 1;
        }
        return upserted;
    }    
    /**
 * buildStoredAfdianOrderChange：构建并返回目标对象。
 * @param order 参数说明。
 * @param source 来源对象。
 * @returns 无返回值，直接更新StoredAfdian订单Change相关状态。
 */

    async buildStoredAfdianOrderChange(order, source) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const now = new Date().toISOString();

        const existing = await this.loadAfdianOrder(order.out_trade_no);

        const stored = {
            outTradeNo: order.out_trade_no,
            userId: order.user_id,
            userPrivateId: readOptionalString(order.user_private_id),
            planId: readOptionalString(order.plan_id),
            title: readOptionalString(order.title),
            month: readInteger(order.month),
            totalAmount: readOptionalString(order.total_amount) ?? '0.00',
            showAmount: readOptionalString(order.show_amount) ?? '0.00',
            status: readInteger(order.status),
            remark: readOptionalString(order.remark),
            redeemId: readOptionalString(order.redeem_id),
            productType: readInteger(order.product_type),
            discount: readOptionalString(order.discount) ?? '0.00',
            skuDetail: Array.isArray(order.sku_detail) ? order.sku_detail : [],
            addressPerson: readOptionalString(order.address_person),
            addressPhone: readOptionalString(order.address_phone),
            addressAddress: readOptionalString(order.address_address),
            lastSource: source,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        if (existing && isSameStoredAfdianOrder(existing, stored)) {
            return {
                changed: false,
                stored: existing,
            };
        }
        return {
            changed: true,
            stored,
        };
    }    
    /**
 * loadAfdianOrder：读取Afdian订单并返回结果。
 * @param outTradeNo 参数说明。
 * @returns 无返回值，完成Afdian订单的读取/组装。
 */

    async loadAfdianOrder(outTradeNo) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const normalized = typeof outTradeNo === 'string' ? outTradeNo.trim() : '';
        if (!normalized) {
            return null;
        }
        if (this.pool && this.persistenceEnabled) {

            const payload = await this.loadPersistentPayloadByScopes(AFDIAN_ORDER_SCOPES, normalized);
            if (!payload) {
                return null;
            }
            return normalizeStoredAfdianOrder(payload);
        }
        return this.memoryOrdersByTradeNo.get(normalized) ?? null;
    }    
    /**
 * loadAllAfdianOrders：读取AllAfdian订单并返回结果。
 * @returns 无返回值，完成AllAfdian订单的读取/组装。
 */

    async loadAllAfdianOrders() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (this.pool && this.persistenceEnabled) {
            const records = new Map();
            for (const scope of AFDIAN_ORDER_SCOPES) {
                const result = await this.pool.query('SELECT payload FROM persistent_documents WHERE scope = $1', [scope]);
                for (const row of result.rows) {
                    const normalized = normalizeStoredAfdianOrder(row?.payload);
                    if (!normalized || records.has(normalized.outTradeNo)) {
                        continue;
                    }
                    records.set(normalized.outTradeNo, normalized);
                }
            }
            return Array.from(records.values());
        }
        return Array.from(this.memoryOrdersByTradeNo.values());
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

        const result = await this.pool.query('SELECT scope, key, payload, "updatedAt" FROM persistent_documents ORDER BY scope ASC, key ASC');
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
            const isLegacyJsonBackup = entry.name.startsWith(`${LEGACY_BACKUP_FILE_PREFIX}-`) && entry.name.endsWith('.json');
            if (!isPostgresDump && !isLegacyJsonBackup) {
                continue;
            }

            const filePath = join(this.backupDirectory, entry.name);

            const stats = await fsPromises.stat(filePath).catch(() => null);
            if (!stats) {
                continue;
            }

            const backupId = isPostgresDump
                ? entry.name.slice(`${BACKUP_FILE_PREFIX}-`.length, -'.dump'.length)
                : entry.name.slice(`${LEGACY_BACKUP_FILE_PREFIX}-`.length, -'.json'.length);
            records.push({
                id: backupId,
                kind: 'manual',
                fileName: entry.name,
                createdAt: stats.mtime.toISOString(),
                sizeBytes: stats.size,
                filePath,
                format: isPostgresDump ? 'postgres_custom_dump' : 'mainline_json_snapshot',
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
 * closePool：执行closePool相关逻辑。
 * @returns 无返回值，直接更新closePool相关状态。
 */

    async closePool() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const pool = this.pool;
        this.pool = null;
        this.persistenceEnabled = false;
        this.memoryOrdersByTradeNo.clear();
        if (pool) {
            await pool.end().catch(() => undefined);
        }
    }    
    /**
 * loadPersistentPayloadByScopes：读取Persistent载荷ByScope并返回结果。
 * @param scopes 参数说明。
 * @param key 参数说明。
 * @returns 无返回值，完成Persistent载荷ByScope的读取/组装。
 */

    async loadPersistentPayloadByScopes(scopes, key) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.pool || !this.persistenceEnabled) {
            return null;
        }
        for (const scope of scopes) {
            const result = await this.pool.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2 LIMIT 1', [scope, key]);
            if (result.rowCount > 0) {
                return result.rows[0]?.payload ?? null;
            }
        }
        return null;
    }    
    /**
 * startDatabaseJob：执行开始DatabaseJob相关逻辑。
 * @param input 输入参数。
 * @returns 无返回值，直接更新startDatabaseJob相关状态。
 */

    startDatabaseJob(input) {
        this.assertNoRunningDatabaseJob();
        this.currentDatabaseJob = input;
        void this.persistDatabaseJobState().catch((error) => {
            this.logger.error('兼容数据库任务状态持久化失败', error instanceof Error ? error.stack : String(error));
        });
        return input;
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
        void this.persistDatabaseJobState().catch((error) => {
            this.logger.error('兼容数据库任务阶段持久化失败', error instanceof Error ? error.stack : String(error));
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
    /**
 * assertRestoreMaintenanceEnabled：执行assertRestoreMaintenance启用相关逻辑。
 * @returns 无返回值，直接更新assertRestoreMaintenance启用相关状态。
 */

    assertRestoreMaintenanceEnabled() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (readBooleanEnv('SERVER_RUNTIME_MAINTENANCE') || readBooleanEnv('RUNTIME_MAINTENANCE')) {
            return;
        }
        throw new BadRequestException('执行兼容 restore 前必须先开启维护态（SERVER_RUNTIME_MAINTENANCE=1 或 RUNTIME_MAINTENANCE=1）');
    }    
    /**
 * applyAfdianPersistentConfig：判断AfdianPersistent配置是否满足条件。
 * @param config 参数说明。
 * @returns 无返回值，直接更新AfdianPersistent配置相关状态。
 */

    applyAfdianPersistentConfig(config) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.afdianPersistentConfig = config;
        if (config.userId) {
            process.env.AFDIAN_USER_ID = config.userId;
        }
        else {
            delete process.env.AFDIAN_USER_ID;
        }
        if (config.apiBaseUrl) {
            process.env.AFDIAN_API_BASE_URL = config.apiBaseUrl;
        }
        else {
            delete process.env.AFDIAN_API_BASE_URL;
        }
        if (config.publicBaseUrl) {
            process.env.AFDIAN_PUBLIC_BASE_URL = config.publicBaseUrl;
        }
        else {
            delete process.env.AFDIAN_PUBLIC_BASE_URL;
        }
    }    
    /**
 * applyAfdianRuntimeToken：处理Afdian运行态Token并更新相关状态。
 * @param token 参数说明。
 * @returns 无返回值，直接更新Afdian运行态Token相关状态。
 */

    applyAfdianRuntimeToken(token) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.afdianRuntimeToken = token;
        if (token) {
            process.env.AFDIAN_TOKEN = token;
        }
        else {
            delete process.env.AFDIAN_TOKEN;
        }
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

    const explicitFormat = record?.format === 'postgres_custom_dump' || record?.format === 'mainline_json_snapshot'
        ? record.format
        : inferBackupFormatFromFileName(typeof record?.fileName === 'string' ? record.fileName : '');
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
        return 'mainline_json_snapshot';
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

    const kind = record?.kind === 'hourly' || record?.kind === 'daily' || record?.kind === 'manual' || record?.kind === 'pre_import'
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

    const kind = record?.kind === 'hourly' || record?.kind === 'daily' || record?.kind === 'manual' || record?.kind === 'pre_import'
        ? record.kind
        : null;

    const scope = record?.scope === LEGACY_BACKUP_SCOPE_LABEL
        ? LEGACY_BACKUP_SCOPE_LABEL
        : BACKUP_SCOPE_LABEL;

    const documentsCount = Number(record?.documentsCount);
    const tablesCount = Number(record?.tablesCount);

    const checksumSha256 = typeof record?.checksumSha256 === 'string' && record.checksumSha256.trim()
        ? record.checksumSha256.trim()
        : undefined;
    const tablesChecksumSha256 = typeof record?.tablesChecksumSha256 === 'string' && record.tablesChecksumSha256.trim()
        ? record.tablesChecksumSha256.trim()
        : undefined;
    const format = record?.format === 'postgres_custom_dump' || record?.format === 'mainline_json_snapshot'
        ? record.format
        : inferBackupFormatFromFileName(fileName);
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
    if (rawScope && rawScope !== BACKUP_SCOPE_LABEL && rawScope !== LEGACY_BACKUP_SCOPE_LABEL) {
        throw new BadRequestException('备份作用域不受支持，当前仅支持主线持久化兼容备份');
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
        throw new BadRequestException(`兼容备份 documentsCount 与 docs 实际数量不一致：期望 ${Number.isFinite(documentsCount) ? Math.trunc(documentsCount) : 'invalid'}，实际 ${docs.length}`);
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
            throw new BadRequestException(`兼容备份 tablesCount 与 tables 实际数量不一致：期望 ${Number.isFinite(tablesCount) ? Math.trunc(tablesCount) : 'invalid'}，实际 ${tables.length}`);
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
        format: 'mainline_json_snapshot',
    };
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
        throw new BadRequestException(`兼容备份 tables.${tableName} 的 rowCount 与 rows 实际数量不一致：期望 ${Number.isFinite(rowCount) ? Math.trunc(rowCount) : 'invalid'}，实际 ${rows.length}`);
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
 * assertAfdianWebhookAuthorized：执行assertAfdianWebhookAuthorized相关逻辑。
 * @param envelope 参数说明。
 * @param headers 参数说明。
 * @returns 无返回值，直接更新assertAfdianWebhookAuthorized相关状态。
 */

function assertAfdianWebhookAuthorized(envelope, headers) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const secret = readAfdianWebhookSecret();
    if (secret === null) {
        return;
    }

    const headerRecord = asRecord(headers) ?? {};

    const headerCandidates = [
        headerRecord['x-server-webhook-token'],
        headerRecord['x-afdian-webhook-token'],
        headerRecord['x-webhook-token'],
        extractBearerToken(headerRecord.authorization),
    ];

    const bodyCandidates = [
        envelope.webhookToken,
        envelope.token,
    ];

    const candidates = [...headerCandidates, ...bodyCandidates]
        .filter((entry) => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    for (const candidate of candidates) {
        if (safeEqualText(candidate, secret)) {
            return;
        }
    }
    throw new UnauthorizedException('爱发电 webhook 鉴权失败');
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
 * extractAfdianOrderList：读取extractAfdian订单列表并返回结果。
 * @param response 参数说明。
 * @returns 无返回值，直接更新extractAfdian订单列表相关状态。
 */

function extractAfdianOrderList(response) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (response?.ec !== 200) {
        throw new BadRequestException(typeof response?.em === 'string' && response.em.trim() ? response.em : '爱发电 API 返回失败');
    }

    const data = asRecord(response.data);

    const list = Array.isArray(data?.list) ? data.list : [];
    return list.map((entry) => normalizeAfdianOrderPayload(entry)).filter((item) => item !== null);
}
/**
 * normalizeAfdianOrderPayload：读取Afdian订单载荷并返回结果。
 * @param value 参数说明。
 * @returns 无返回值，直接更新Afdian订单载荷相关状态。
 */

function normalizeAfdianOrderPayload(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const record = asRecord(value);

    const outTradeNo = typeof record?.out_trade_no === 'string' ? record.out_trade_no.trim() : '';

    const userId = typeof record?.user_id === 'string' ? record.user_id.trim() : '';
    if (!outTradeNo || !userId) {
        return null;
    }
    return {
        ...record,
        out_trade_no: outTradeNo,
        user_id: userId,
    };
}
/**
 * normalizeStoredAfdianOrder：规范化或转换StoredAfdian订单。
 * @param value 参数说明。
 * @returns 无返回值，直接更新StoredAfdian订单相关状态。
 */

function normalizeStoredAfdianOrder(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const record = asRecord(value);

    const outTradeNo = typeof record?.outTradeNo === 'string' ? record.outTradeNo.trim() : '';

    const userId = typeof record?.userId === 'string' ? record.userId.trim() : '';
    if (!outTradeNo || !userId) {
        return null;
    }
    return {
        outTradeNo,
        userId,
        userPrivateId: readOptionalString(record.userPrivateId),
        planId: readOptionalString(record.planId),
        title: readOptionalString(record.title),
        month: readInteger(record.month),
        totalAmount: readOptionalString(record.totalAmount) ?? '0.00',
        showAmount: readOptionalString(record.showAmount) ?? '0.00',
        status: readInteger(record.status),
        remark: readOptionalString(record.remark),
        redeemId: readOptionalString(record.redeemId),
        productType: readInteger(record.productType),
        discount: readOptionalString(record.discount) ?? '0.00',
        skuDetail: Array.isArray(record.skuDetail) ? record.skuDetail : [],
        addressPerson: readOptionalString(record.addressPerson),
        addressPhone: readOptionalString(record.addressPhone),
        addressAddress: readOptionalString(record.addressAddress),

        lastSource: record.lastSource === 'api' ? 'api' : 'webhook',
        createdAt: normalizeTimestamp(record.createdAt) ?? new Date(0).toISOString(),
        updatedAt: normalizeTimestamp(record.updatedAt) ?? new Date(0).toISOString(),
    };
}
/**
 * isSameStoredAfdianOrder：判断SameStoredAfdian订单是否满足条件。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，完成SameStoredAfdian订单的条件判断。
 */

function isSameStoredAfdianOrder(left, right) {
    return left.outTradeNo === right.outTradeNo
        && left.userId === right.userId
        && left.userPrivateId === right.userPrivateId
        && left.planId === right.planId
        && left.title === right.title
        && left.month === right.month
        && left.totalAmount === right.totalAmount
        && left.showAmount === right.showAmount
        && left.status === right.status
        && left.remark === right.remark
        && left.redeemId === right.redeemId
        && left.productType === right.productType
        && left.discount === right.discount
        && left.addressPerson === right.addressPerson
        && left.addressPhone === right.addressPhone
        && left.addressAddress === right.addressAddress
        && left.createdAt === right.createdAt
        && isSameSkuDetail(left.skuDetail, right.skuDetail);
}
/**
 * isSameSkuDetail：判断SameSku详情是否满足条件。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，完成SameSku详情的条件判断。
 */

function isSameSkuDetail(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (left === right) {
        return true;
    }
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (!isSameJsonValue(left[index], right[index])) {
            return false;
        }
    }
    return true;
}
/**
 * isSameJsonValue：判断SameJson值是否满足条件。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，完成SameJson值的条件判断。
 */

function isSameJsonValue(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (left === right) {
        return true;
    }
    if (typeof left !== typeof right) {
        return false;
    }
    if (left === null || right === null) {
        return false;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
            return false;
        }
        for (let index = 0; index < left.length; index += 1) {
            if (!isSameJsonValue(left[index], right[index])) {
                return false;
            }
        }
        return true;
    }
    if (typeof left === 'object' && typeof right === 'object') {

        const leftRecord = asRecord(left);

        const rightRecord = asRecord(right);
        if (!leftRecord || !rightRecord) {
            return false;
        }

        const leftKeys = Object.keys(leftRecord);

        const rightKeys = Object.keys(rightRecord);
        if (leftKeys.length !== rightKeys.length) {
            return false;
        }
        for (const key of leftKeys) {
            if (!Object.prototype.hasOwnProperty.call(rightRecord, key)) {
                return false;
            }
            if (!isSameJsonValue(leftRecord[key], rightRecord[key])) {
                return false;
            }
        }
        return true;
    }
    return false;
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
 * normalizeEnvValue：规范化或转换Env值。
 * @param value 参数说明。
 * @returns 无返回值，直接更新Env值相关状态。
 */

function normalizeEnvValue(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}
/**
 * readAfdianWebhookSecret：读取AfdianWebhookSecret并返回结果。
 * @returns 无返回值，完成AfdianWebhookSecret的读取/组装。
 */

function readAfdianWebhookSecret() {
    return normalizeEnvValue(process.env.SERVER_AFDIAN_WEBHOOK_SECRET)
        ?? normalizeEnvValue(process.env.AFDIAN_WEBHOOK_SECRET)
        ?? null;
}
/**
 * extractBearerToken：执行extractBearerToken相关逻辑。
 * @param value 参数说明。
 * @returns 无返回值，直接更新extractBearerToken相关状态。
 */

function extractBearerToken(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed.startsWith('Bearer ')) {
        return trimmed || null;
    }

    const token = trimmed.slice(7).trim();
    return token || null;
}
/**
 * safeEqualText：执行safeEqualText相关逻辑。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，直接更新safeEqualText相关状态。
 */

function safeEqualText(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const leftBuffer = Buffer.from(left, 'utf8');

    const rightBuffer = Buffer.from(right, 'utf8');
    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }
    return leftBuffer.length > 0 && timingSafeEqual(leftBuffer, rightBuffer);
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
/**
 * readOptionalString：读取OptionalString并返回结果。
 * @param value 参数说明。
 * @returns 无返回值，完成OptionalString的读取/组装。
 */

function readOptionalString(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}
/**
 * readPersistentConfigFromEnv：读取Persistent配置FromEnv并返回结果。
 * @returns 无返回值，完成Persistent配置FromEnv的读取/组装。
 */

function readPersistentConfigFromEnv() {
    return normalizeStoredPersistentConfig({
        userId: process.env.AFDIAN_USER_ID ?? '',
        apiBaseUrl: process.env.AFDIAN_API_BASE_URL ?? '',
        publicBaseUrl: process.env.AFDIAN_PUBLIC_BASE_URL ?? '',
    });
}
/**
 * hasEnvBackedAfdianPersistentConfig：判断EnvBackedAfdianPersistent配置是否满足条件。
 * @returns 无返回值，完成EnvBackedAfdianPersistent配置的条件判断。
 */

function hasEnvBackedAfdianPersistentConfig() {
    return normalizeEnvValue(process.env.AFDIAN_USER_ID) !== null
        || normalizeEnvValue(process.env.AFDIAN_API_BASE_URL) !== null
        || normalizeEnvValue(process.env.AFDIAN_PUBLIC_BASE_URL) !== null;
}
/**
 * cloneAfdianPersistentConfig：判断AfdianPersistent配置是否满足条件。
 * @param config 参数说明。
 * @returns 无返回值，直接更新AfdianPersistent配置相关状态。
 */

function cloneAfdianPersistentConfig(config) {
    return {

        userId: typeof config?.userId === 'string' ? config.userId : '',

        apiBaseUrl: typeof config?.apiBaseUrl === 'string' && config.apiBaseUrl.trim()
            ? config.apiBaseUrl
            : DEFAULT_AFDIAN_API_BASE_URL,

        publicBaseUrl: typeof config?.publicBaseUrl === 'string' ? config.publicBaseUrl : '',
    };
}
/**
 * readRuntimeTokenFromEnv：读取运行态TokenFromEnv并返回结果。
 * @returns 无返回值，完成运行态TokenFromEnv的读取/组装。
 */

function readRuntimeTokenFromEnv() {
    return normalizeEnvValue(process.env.AFDIAN_TOKEN) ?? '';
}
/**
 * normalizePersistentConfig：判断Persistent配置是否满足条件。
 * @param input 输入参数。
 * @returns 无返回值，直接更新Persistent配置相关状态。
 */

function normalizePersistentConfig(input) {
    return {
        userId: normalizeEnvValue(input?.userId) ?? '',
        apiBaseUrl: normalizeApiBaseUrl(input?.apiBaseUrl ?? ''),
        publicBaseUrl: normalizePublicBaseUrl(input?.publicBaseUrl ?? ''),
    };
}
/**
 * normalizeStoredPersistentConfig：判断StoredPersistent配置是否满足条件。
 * @param input 输入参数。
 * @returns 无返回值，直接更新StoredPersistent配置相关状态。
 */

function normalizeStoredPersistentConfig(input) {
    return {
        userId: normalizeEnvValue(input?.userId) ?? '',
        apiBaseUrl: normalizeApiBaseUrl(input?.apiBaseUrl ?? ''),
        publicBaseUrl: normalizePublicBaseUrl(input?.publicBaseUrl ?? ''),
    };
}
/**
 * normalizeApiBaseUrl：规范化或转换ApiBaseUrl。
 * @param value 参数说明。
 * @returns 无返回值，直接更新ApiBaseUrl相关状态。
 */

function normalizeApiBaseUrl(value) {
    return normalizeBaseUrl(value, {
        fieldLabel: '爱发电 API 地址',
        defaultValue: DEFAULT_AFDIAN_API_BASE_URL,
        preservePath: false,
        canonicalizeAfdianHost: true,
    });
}
/**
 * normalizePublicBaseUrl：规范化或转换PublicBaseUrl。
 * @param value 参数说明。
 * @returns 无返回值，直接更新PublicBaseUrl相关状态。
 */

function normalizePublicBaseUrl(value) {
    return normalizeBaseUrl(value, {
        fieldLabel: '公网地址',
        defaultValue: '',
        preservePath: true,
        canonicalizeAfdianHost: false,
    });
}
/**
 * normalizeBaseUrl：规范化或转换BaseUrl。
 * @param value 参数说明。
 * @param options 选项参数。
 * @returns 无返回值，直接更新BaseUrl相关状态。
 */

function normalizeBaseUrl(value, options) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) {
        return options.defaultValue;
    }

    let parsed;
    try {
        parsed = new URL(trimmed);
    }
    catch {
        throw new BadRequestException(`${options.fieldLabel} 格式不正确，必须以 http:// 或 https:// 开头`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new BadRequestException(`${options.fieldLabel} 仅支持 http:// 或 https://`);
    }
    if (options.canonicalizeAfdianHost && AFDIAN_KNOWN_HOSTS.has(parsed.hostname.toLowerCase())) {
        return DEFAULT_AFDIAN_API_BASE_URL;
    }

    const normalizedPath = options.preservePath
        ? parsed.pathname.replace(/\/+$/u, '')
        : '';
    return `${parsed.protocol}//${parsed.host}${normalizedPath}`;
}
/**
 * buildWebhookUrl：构建并返回目标对象。
 * @param publicBaseUrl 参数说明。
 * @param webhookPath 参数说明。
 * @returns 无返回值，直接更新WebhookUrl相关状态。
 */

function buildWebhookUrl(publicBaseUrl, webhookPath) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const baseUrl = normalizeEnvValue(publicBaseUrl);
    if (!baseUrl) {
        return null;
    }
    return `${baseUrl.replace(/\/+$/u, '')}${webhookPath}`;
}
