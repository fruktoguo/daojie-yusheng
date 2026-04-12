"use strict";
/** __decorate：定义该变量以承载业务值。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** LegacyGmAdminCompatService_1：定义该变量以承载业务值。 */
var LegacyGmAdminCompatService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyGmAdminCompatService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** node_crypto_1：定义该变量以承载业务值。 */
const node_crypto_1 = require("node:crypto");
/** node_fs_1：定义该变量以承载业务值。 */
const node_fs_1 = require("node:fs");
/** node_path_1：定义该变量以承载业务值。 */
const node_path_1 = require("node:path");
/** node_url_1：定义该变量以承载业务值。 */
const node_url_1 = require("node:url");
/** pg_1：定义该变量以承载业务值。 */
const pg_1 = require("pg");
/** legacy_database_restore_coordinator_service_1：定义该变量以承载业务值。 */
const legacy_database_restore_coordinator_service_1 = require("./legacy-database-restore-coordinator.service");
/** persistent_document_table_1：定义该变量以承载业务值。 */
const persistent_document_table_1 = require("../../../persistence/persistent-document-table");
/** env_alias_1：定义该变量以承载业务值。 */
const env_alias_1 = require("../../../config/env-alias");
const DEFAULT_AFDIAN_API_BASE_URL = 'https://afdian.net';
/** DEFAULT_AFDIAN_WEBHOOK_PATH：定义该变量以承载业务值。 */
const DEFAULT_AFDIAN_WEBHOOK_PATH = '/integrations/afdian/webhook';
/** AFDIAN_PING_PATH：定义该变量以承载业务值。 */
const AFDIAN_PING_PATH = '/api/open/ping';
/** AFDIAN_QUERY_ORDER_PATH：定义该变量以承载业务值。 */
const AFDIAN_QUERY_ORDER_PATH = '/api/open/query-order';
/** AFDIAN_KNOWN_HOSTS：定义该变量以承载业务值。 */
const AFDIAN_KNOWN_HOSTS = new Set([
    'afdian.net',
    'www.afdian.net',
    'ifdian.net',
    'www.ifdian.net',
]);
/** AFDIAN_CONFIG_SCOPE：定义该变量以承载业务值。 */
const AFDIAN_CONFIG_SCOPE = 'server_next_legacy_afdian_config_v1';
/** AFDIAN_CONFIG_KEY：定义该变量以承载业务值。 */
const AFDIAN_CONFIG_KEY = 'afdian';
/** AFDIAN_ORDER_SCOPE：定义该变量以承载业务值。 */
const AFDIAN_ORDER_SCOPE = 'server_next_legacy_afdian_orders_v1';
/** DATABASE_BACKUP_METADATA_SCOPE：定义该变量以承载业务值。 */
const DATABASE_BACKUP_METADATA_SCOPE = 'server_next_legacy_db_backups_v1';
/** DATABASE_JOB_STATE_SCOPE：定义该变量以承载业务值。 */
const DATABASE_JOB_STATE_SCOPE = 'server_next_legacy_db_jobs_v1';
/** DATABASE_JOB_STATE_KEY：定义该变量以承载业务值。 */
const DATABASE_JOB_STATE_KEY = 'gm_database';
/** BACKUP_FILE_PREFIX：定义该变量以承载业务值。 */
const BACKUP_FILE_PREFIX = 'server-next-persistent-documents';
/** BACKUP_FILE_KIND：定义该变量以承载业务值。 */
const BACKUP_FILE_KIND = 'server_next_persistent_documents_backup_v1';
/** BACKUP_SCOPE_LABEL：定义该变量以承载业务值。 */
const BACKUP_SCOPE_LABEL = 'persistent_documents_only';
/** BACKUP_EXCLUDED_SCOPES：定义该变量以承载业务值。 */
const BACKUP_EXCLUDED_SCOPES = new Set([
    DATABASE_BACKUP_METADATA_SCOPE,
    DATABASE_JOB_STATE_SCOPE,
]);
/** DEFAULT_DB_RETENTION：定义该变量以承载业务值。 */
const DEFAULT_DB_RETENTION = {
    hourly: 24,
    daily: 7,
};
/** DEFAULT_DB_SCHEDULES：定义该变量以承载业务值。 */
const DEFAULT_DB_SCHEDULES = {
    hourly: '0 * * * *',
    daily: '0 4 * * *',
};
/** BACKUP_JOB_PHASE：定义该变量以承载业务值。 */
const BACKUP_JOB_PHASE = {
    VALIDATING: 'validating',
    WRITING_FILE: 'writing_file',
    PERSISTING_METADATA: 'persisting_metadata',
    COMPLETED: 'completed',
};
/** RESTORE_JOB_PHASE：定义该变量以承载业务值。 */
const RESTORE_JOB_PHASE = {
    VALIDATING: 'validating_backup',
    CREATING_PRE_IMPORT_BACKUP: 'creating_pre_import_backup',
    PREPARING_RUNTIME: 'preparing_runtime',
    APPLYING_DOCUMENTS: 'applying_documents',
    COMMITTED: 'committed',
    RELOADING_RUNTIME: 'reloading_runtime',
    COMPLETED: 'completed',
};
/** LegacyGmAdminCompatService：定义该变量以承载业务值。 */
let LegacyGmAdminCompatService = LegacyGmAdminCompatService_1 = class LegacyGmAdminCompatService {
    logger = new common_1.Logger(LegacyGmAdminCompatService_1.name);
    pool = null;
    persistenceEnabled = false;
    backupDirectory = resolveBackupDirectory();
    currentDatabaseJob = null;
    lastDatabaseJob = null;
    initialAfdianPersistentConfigFromEnv = hasEnvBackedAfdianPersistentConfig();
    initialAfdianPersistentConfig = readPersistentConfigFromEnv();
    initialAfdianRuntimeToken = readRuntimeTokenFromEnv();
    afdianPersistentConfig = cloneAfdianPersistentConfig(this.initialAfdianPersistentConfig);
    afdianRuntimeToken = this.initialAfdianRuntimeToken;
    memoryOrdersByTradeNo = new Map();
    databaseRestoreCoordinator;
/** 构造函数：执行实例初始化流程。 */
    constructor(databaseRestoreCoordinator) {
        this.databaseRestoreCoordinator = databaseRestoreCoordinator;
    }
/** onModuleInit：执行对应的业务逻辑。 */
    async onModuleInit() {
        await node_fs_1.promises.mkdir(this.backupDirectory, { recursive: true });
/** databaseUrl：定义该变量以承载业务值。 */
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
            await this.reloadPersistentCompatibilityState();
            await this.loadPersistedDatabaseJobState();
            await this.backfillBackupMetadataFromFilesystem();
        }
        catch (error) {
            this.logger.error('Legacy GM admin compat persistence init failed', error instanceof Error ? error.stack : String(error));
            await this.closePool();
        }
    }
/** onModuleDestroy：执行对应的业务逻辑。 */
    async onModuleDestroy() {
        await this.closePool();
    }
/** getDatabaseState：执行对应的业务逻辑。 */
    async getDatabaseState() {
/** backups：定义该变量以承载业务值。 */
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
                restoreRequiresMaintenance: true,
                preImportBackupEnabled: true,
            },
            persistenceEnabled: this.persistenceEnabled,
            compatScope: BACKUP_SCOPE_LABEL,
            restoreMode: 'replace_persistent_documents',
            note: '仅作用于 server-next 兼容层 persistent_documents，不会恢复旧后端 users/players 等正式业务表；当前 backup/restore 仍为手工触发，不存在自动定时备份或自动保留清理',
        };
    }
/** isRuntimeMaintenanceActive：执行对应的业务逻辑。 */
    isRuntimeMaintenanceActive() {
        if (readBooleanEnv('SERVER_NEXT_RUNTIME_MAINTENANCE') || readBooleanEnv('RUNTIME_MAINTENANCE')) {
            return true;
        }
        return this.currentDatabaseJob?.status === 'running' && this.currentDatabaseJob?.type === 'restore';
    }
/** triggerDatabaseBackup：执行对应的业务逻辑。 */
    triggerDatabaseBackup() {
/** backupId：定义该变量以承载业务值。 */
        const backupId = buildBackupId();
/** startedAt：定义该变量以承载业务值。 */
        const startedAt = new Date().toISOString();
/** job：定义该变量以承载业务值。 */
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
            compatScope: BACKUP_SCOPE_LABEL,
        };
    }
/** getBackupDownloadRecord：执行对应的业务逻辑。 */
    async getBackupDownloadRecord(backupId) {
/** record：定义该变量以承载业务值。 */
        const record = await this.findBackupRecord(backupId);
        if (!record) {
            throw new common_1.BadRequestException('目标备份不存在');
        }
        if (!record.filePath) {
            throw new common_1.BadRequestException('目标备份文件不存在，请检查备份卷或目录配置');
        }
        return {
            filePath: record.filePath,
            fileName: record.fileName,
        };
    }
/** triggerDatabaseRestore：执行对应的业务逻辑。 */
    async triggerDatabaseRestore(backupId) {
        this.assertRestoreMaintenanceEnabled();
/** record：定义该变量以承载业务值。 */
        const record = await this.findBackupRecord(backupId);
        if (!record) {
            throw new common_1.BadRequestException('目标备份不存在');
        }
        if (!this.pool || !this.persistenceEnabled) {
            throw new common_1.BadRequestException('当前未启用数据库持久化，暂不支持导入兼容备份');
        }
/** payload：定义该变量以承载业务值。 */
        const payload = await this.readBackupPayload(record.filePath);
/** validatedPayload：定义该变量以承载业务值。 */
        const validatedPayload = assertCompatibleBackupPayload(payload);
/** client：定义该变量以承载业务值。 */
        const client = await this.pool.connect();
/** startedAt：定义该变量以承载业务值。 */
        const startedAt = new Date().toISOString();
        client.release();
/** checkpointBackupId：定义该变量以承载业务值。 */
        const checkpointBackupId = buildBackupId();
/** job：定义该变量以承载业务值。 */
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
                process.env.SERVER_NEXT_RUNTIME_RESTORE_ACTIVE = '1';
                this.updateDatabaseJobPhase(job, RESTORE_JOB_PHASE.PREPARING_RUNTIME);
                await this.databaseRestoreCoordinator.prepareForRestore();
/** restoreClient：定义该变量以承载业务值。 */
                const restoreClient = await this.pool.connect();
                try {
                    this.updateDatabaseJobPhase(job, RESTORE_JOB_PHASE.APPLYING_DOCUMENTS);
                    await restoreClient.query('BEGIN');
                    await restoreClient.query('DELETE FROM persistent_documents WHERE NOT (scope = ANY($1::varchar[]))', [Array.from(BACKUP_EXCLUDED_SCOPES)]);
                    for (const entry of validatedPayload.docs) {
                        await restoreClient.query(`
            INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
            VALUES ($1, $2, $3::jsonb, $4::timestamptz)
          `, [entry.scope, entry.key, JSON.stringify(entry.payload), entry.updatedAt]);
                    }
                    await restoreClient.query('COMMIT');
                    job.appliedAt = new Date().toISOString();
                    this.updateDatabaseJobPhase(job, RESTORE_JOB_PHASE.COMMITTED);
                }
                catch (error) {
                    await restoreClient.query('ROLLBACK').catch(() => undefined);
                    throw error;
                }
                finally {
                    restoreClient.release();
                }
            }
            finally {
                delete process.env.SERVER_NEXT_RUNTIME_RESTORE_ACTIVE;
                this.updateDatabaseJobPhase(job, RESTORE_JOB_PHASE.RELOADING_RUNTIME);
                await this.reloadPersistentCompatibilityState();
                await this.databaseRestoreCoordinator.reloadAfterRestore();
                this.updateDatabaseJobPhase(job, RESTORE_JOB_PHASE.COMPLETED);
            }
        });
        return {
            job,
            compatScope: BACKUP_SCOPE_LABEL,
        };
    }
/** getAfdianConfig：执行对应的业务逻辑。 */
    getAfdianConfig() {
        return {
            config: this.getAfdianConfigForm(),
            status: this.getAfdianConfigStatus(),
        };
    }
/** saveAfdianConfig：执行对应的业务逻辑。 */
    async saveAfdianConfig(input) {
/** normalized：定义该变量以承载业务值。 */
        const normalized = normalizePersistentConfig(input ?? {});
/** runtimeToken：定义该变量以承载业务值。 */
        const runtimeToken = normalizeEnvValue(input?.token) ?? '';
        this.applyAfdianPersistentConfig(normalized);
        this.applyAfdianRuntimeToken(runtimeToken);
        await this.persistAfdianPersistentConfig(normalized);
        return this.getAfdianConfig();
    }
/** listAfdianOrders：执行对应的业务逻辑。 */
    async listAfdianOrders(query) {
/** limit：定义该变量以承载业务值。 */
        const limit = clampInteger(query?.limit, 20, 1, 100);
/** offset：定义该变量以承载业务值。 */
        const offset = clampInteger(query?.offset, 0, 0, 100000);
/** status：定义该变量以承载业务值。 */
        const status = Number.isFinite(Number(query?.status)) ? Math.trunc(Number(query.status)) : null;
/** userId：定义该变量以承载业务值。 */
        const userId = typeof query?.userId === 'string' ? query.userId.trim() : '';
/** planId：定义该变量以承载业务值。 */
        const planId = typeof query?.planId === 'string' ? query.planId.trim() : '';
/** orders：定义该变量以承载业务值。 */
        const orders = await this.loadAllAfdianOrders();
/** filtered：定义该变量以承载业务值。 */
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
/** pingAfdianApi：执行对应的业务逻辑。 */
    async pingAfdianApi(input) {
/** config：定义该变量以承载业务值。 */
        const config = this.getRequiredAfdianApiConfig(input?.token);
        await this.requestAfdianApi(config.userId, config.token, AFDIAN_PING_PATH, {});
        return {
            ...this.getAfdianConfigStatus(),
            reachable: true,
        };
    }
/** syncAfdianOrders：执行对应的业务逻辑。 */
    async syncAfdianOrders(input) {
/** config：定义该变量以承载业务值。 */
        const config = this.getRequiredAfdianApiConfig(input?.token);
/** outTradeNo：定义该变量以承载业务值。 */
        const outTradeNo = typeof input?.outTradeNo === 'string' ? input.outTradeNo.trim() : '';
        if (outTradeNo) {
/** response：定义该变量以承载业务值。 */
            const response = await this.queryAfdianOrders(config.userId, config.token, {
                out_trade_no: outTradeNo,
            });
/** orders：定义该变量以承载业务值。 */
            const orders = extractAfdianOrderList(response);
/** upsertedOrders：定义该变量以承载业务值。 */
            const upsertedOrders = await this.upsertAfdianOrders(orders, 'api');
            return {
                requestedPages: 1,
                syncedPages: 1,
                receivedOrders: orders.length,
                upsertedOrders,
/** totalCount：定义该变量以承载业务值。 */
                totalCount: typeof response?.data?.total_count === 'number' ? response.data.total_count : orders.length,
/** totalPage：定义该变量以承载业务值。 */
                totalPage: typeof response?.data?.total_page === 'number' ? response.data.total_page : 1,
            };
        }
/** page：定义该变量以承载业务值。 */
        const page = clampInteger(input?.page, 1, 1, 999999);
/** maxPages：定义该变量以承载业务值。 */
        const maxPages = clampInteger(input?.maxPages, 1, 1, 20);
/** syncedPages：定义该变量以承载业务值。 */
        let syncedPages = 0;
/** receivedOrders：定义该变量以承载业务值。 */
        let receivedOrders = 0;
/** upsertedOrders：定义该变量以承载业务值。 */
        let upsertedOrders = 0;
/** totalCount：定义该变量以承载业务值。 */
        let totalCount = null;
/** totalPage：定义该变量以承载业务值。 */
        let totalPage = null;
        for (let index = 0; index < maxPages; index += 1) {
            const currentPage = page + index;
            const response = await this.queryAfdianOrders(config.userId, config.token, {
                page: currentPage,
            });
/** orders：定义该变量以承载业务值。 */
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
/** handleAfdianWebhook：执行对应的业务逻辑。 */
    async handleAfdianWebhook(body, headers = {}) {
/** envelope：定义该变量以承载业务值。 */
        const envelope = asRecord(body);
        if (!envelope) {
            throw new common_1.BadRequestException('Webhook body 必须为 JSON 对象');
        }
        assertAfdianWebhookAuthorized(envelope, headers);
/** data：定义该变量以承载业务值。 */
        const data = asRecord(envelope.data);
/** type：定义该变量以承载业务值。 */
        const type = typeof data?.type === 'string' ? data.type.trim() : '';
        if (type !== 'order') {
            return;
        }
/** order：定义该变量以承载业务值。 */
        const order = normalizeAfdianOrderPayload(data.order);
        if (!order) {
            throw new common_1.BadRequestException('爱发电订单数据不合法');
        }
/** configuredUserId：定义该变量以承载业务值。 */
        const configuredUserId = normalizeEnvValue(this.afdianPersistentConfig.userId);
        if (configuredUserId !== null && order.user_id !== configuredUserId) {
            throw new common_1.BadRequestException('爱发电订单 user_id 与当前配置不匹配');
        }
        await this.upsertAfdianOrders([order], 'webhook');
    }
/** reloadPersistentCompatibilityState：执行对应的业务逻辑。 */
    async reloadPersistentCompatibilityState() {
        this.memoryOrdersByTradeNo.clear();
        await this.loadAfdianPersistentConfig();
    }
/** loadPersistedDatabaseJobState：执行对应的业务逻辑。 */
    async loadPersistedDatabaseJobState() {
        if (!this.pool || !this.persistenceEnabled) {
            this.currentDatabaseJob = null;
            this.lastDatabaseJob = null;
            return;
        }
/** result：定义该变量以承载业务值。 */
        const result = await this.pool.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2 LIMIT 1', [DATABASE_JOB_STATE_SCOPE, DATABASE_JOB_STATE_KEY]);
        if (result.rowCount === 0) {
            this.currentDatabaseJob = null;
            this.lastDatabaseJob = null;
            return;
        }
/** state：定义该变量以承载业务值。 */
        const state = normalizeStoredDatabaseJobState(result.rows[0]?.payload);
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
/** persistDatabaseJobState：执行对应的业务逻辑。 */
    async persistDatabaseJobState() {
        if (!this.pool || !this.persistenceEnabled) {
            return;
        }
/** payload：定义该变量以承载业务值。 */
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
/** persistBackupMetadata：执行对应的业务逻辑。 */
    async persistBackupMetadata(record) {
        if (!this.pool || !this.persistenceEnabled) {
            return;
        }
/** normalized：定义该变量以承载业务值。 */
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
/** createDatabaseBackupSnapshot：执行对应的业务逻辑。 */
    async createDatabaseBackupSnapshot(input) {
        input.job && this.updateDatabaseJobPhase(input.job, BACKUP_JOB_PHASE.VALIDATING);
/** docs：定义该变量以承载业务值。 */
        const docs = await this.readAllPersistentDocuments();
        input.job && this.updateDatabaseJobPhase(input.job, BACKUP_JOB_PHASE.WRITING_FILE);
/** checksumSha256：定义该变量以承载业务值。 */
        const checksumSha256 = computeBackupChecksum(docs);
/** payload：定义该变量以承载业务值。 */
        const payload = {
            kind: BACKUP_FILE_KIND,
            version: 1,
            scope: BACKUP_SCOPE_LABEL,
            backupId: input.backupId,
            createdAt: input.createdAt,
            documentsCount: docs.length,
            checksumSha256,
            docs,
        };
/** fileName：定义该变量以承载业务值。 */
        const fileName = `${BACKUP_FILE_PREFIX}-${input.backupId}.json`;
/** filePath：定义该变量以承载业务值。 */
        const filePath = (0, node_path_1.join)(this.backupDirectory, fileName);
/** serialized：定义该变量以承载业务值。 */
        const serialized = JSON.stringify(payload, null, 2);
        await node_fs_1.promises.mkdir(this.backupDirectory, { recursive: true });
        await node_fs_1.promises.writeFile(filePath, serialized, 'utf8');
        input.job && this.updateDatabaseJobPhase(input.job, BACKUP_JOB_PHASE.PERSISTING_METADATA);
        await this.persistBackupMetadata({
            id: input.backupId,
            kind: input.kind,
            fileName,
            createdAt: input.createdAt,
            sizeBytes: Buffer.byteLength(serialized, 'utf8'),
            compatScope: BACKUP_SCOPE_LABEL,
            documentsCount: docs.length,
            checksumSha256,
        });
        input.job && this.updateDatabaseJobPhase(input.job, BACKUP_JOB_PHASE.COMPLETED);
        return {
            backupId: input.backupId,
            fileName,
            filePath,
            documentsCount: docs.length,
            checksumSha256,
        };
    }
/** loadPersistedBackupMetadataRecords：执行对应的业务逻辑。 */
    async loadPersistedBackupMetadataRecords() {
        if (!this.pool || !this.persistenceEnabled) {
            return [];
        }
/** result：定义该变量以承载业务值。 */
        const result = await this.pool.query('SELECT key, payload FROM persistent_documents WHERE scope = $1 ORDER BY key DESC', [DATABASE_BACKUP_METADATA_SCOPE]);
        return result.rows
            .map((row) => normalizeStoredBackupMetadata({
/** id：定义该变量以承载业务值。 */
            id: typeof row?.key === 'string' ? row.key : '',
            ...(row?.payload && typeof row.payload === 'object' ? row.payload : {}),
        }))
            .filter((entry) => entry !== null);
    }
/** backfillBackupMetadataFromFilesystem：执行对应的业务逻辑。 */
    async backfillBackupMetadataFromFilesystem() {
/** records：定义该变量以承载业务值。 */
        const records = await this.listFilesystemBackups();
        await Promise.all(records.map((record) => this.persistBackupMetadata({
            id: record.id,
            kind: record.kind,
            fileName: record.fileName,
            createdAt: record.createdAt,
            sizeBytes: record.sizeBytes,
            compatScope: BACKUP_SCOPE_LABEL,
        })));
    }
/** loadAfdianPersistentConfig：执行对应的业务逻辑。 */
    async loadAfdianPersistentConfig() {
        if (!this.pool || !this.persistenceEnabled) {
            return;
        }
/** result：定义该变量以承载业务值。 */
        const result = await this.pool.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2 LIMIT 1', [AFDIAN_CONFIG_SCOPE, AFDIAN_CONFIG_KEY]);
/** initialConfig：定义该变量以承载业务值。 */
        const initialConfig = cloneAfdianPersistentConfig(this.initialAfdianPersistentConfig);
        if (result.rowCount === 0) {
            this.applyAfdianPersistentConfig(initialConfig);
            if (this.initialAfdianPersistentConfigFromEnv) {
                await this.persistAfdianPersistentConfig(initialConfig);
            }
            return;
        }
        this.applyAfdianPersistentConfig(normalizeStoredPersistentConfig(result.rows[0]?.payload));
    }
/** persistAfdianPersistentConfig：执行对应的业务逻辑。 */
    async persistAfdianPersistentConfig(config) {
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
/** getAfdianConfigForm：执行对应的业务逻辑。 */
    getAfdianConfigForm() {
        return {
            userId: this.afdianPersistentConfig.userId,
            token: '',
            apiBaseUrl: this.afdianPersistentConfig.apiBaseUrl,
            publicBaseUrl: this.afdianPersistentConfig.publicBaseUrl,
        };
    }
/** getAfdianConfigStatus：执行对应的业务逻辑。 */
    getAfdianConfigStatus() {
/** userId：定义该变量以承载业务值。 */
        const userId = normalizeEnvValue(this.afdianPersistentConfig.userId);
/** token：定义该变量以承载业务值。 */
        const token = normalizeEnvValue(this.afdianRuntimeToken);
/** webhookPath：定义该变量以承载业务值。 */
        const webhookPath = DEFAULT_AFDIAN_WEBHOOK_PATH;
/** webhookSecret：定义该变量以承载业务值。 */
        const webhookSecret = readAfdianWebhookSecret();
        return {
/** enabled：定义该变量以承载业务值。 */
            enabled: userId !== null,
/** apiEnabled：定义该变量以承载业务值。 */
            apiEnabled: userId !== null && token !== null,
            webhookPath,
            webhookUrl: buildWebhookUrl(this.afdianPersistentConfig.publicBaseUrl, webhookPath),
            apiBaseUrl: this.afdianPersistentConfig.apiBaseUrl,
            userId,
/** hasToken：定义该变量以承载业务值。 */
            hasToken: token !== null,
/** webhookAuthEnabled：定义该变量以承载业务值。 */
            webhookAuthEnabled: webhookSecret !== null,
/** webhookAuthMode：定义该变量以承载业务值。 */
            webhookAuthMode: webhookSecret !== null ? 'shared_token' : 'none',
        };
    }
/** getRequiredAfdianApiConfig：执行对应的业务逻辑。 */
    getRequiredAfdianApiConfig(requestToken) {
/** userId：定义该变量以承载业务值。 */
        const userId = normalizeEnvValue(this.afdianPersistentConfig.userId);
/** token：定义该变量以承载业务值。 */
        const token = normalizeEnvValue(requestToken) ?? normalizeEnvValue(this.afdianRuntimeToken);
        if (!userId || !token) {
            throw new common_1.ServiceUnavailableException('AFDIAN_USER_ID 或 AFDIAN_TOKEN 未配置');
        }
        return { userId, token };
    }
/** queryAfdianOrders：执行对应的业务逻辑。 */
    async queryAfdianOrders(userId, token, params) {
        return this.requestAfdianApi(userId, token, AFDIAN_QUERY_ORDER_PATH, params);
    }
/** requestAfdianApi：执行对应的业务逻辑。 */
    async requestAfdianApi(userId, token, apiPath, params) {
/** ts：定义该变量以承载业务值。 */
        const ts = Math.floor(Date.now() / 1000);
/** paramsJson：定义该变量以承载业务值。 */
        const paramsJson = JSON.stringify(params ?? {});
/** signSource：定义该变量以承载业务值。 */
        const signSource = `${token}params${paramsJson}ts${ts}user_id${userId}`;
/** sign：定义该变量以承载业务值。 */
        const sign = (0, node_crypto_1.createHash)('md5').update(signSource).digest('hex');
/** url：定义该变量以承载业务值。 */
        const url = new node_url_1.URL(`${this.afdianPersistentConfig.apiBaseUrl.replace(/\/+$/u, '')}${apiPath}`);
/** timeoutSignal：定义该变量以承载业务值。 */
        const timeoutSignal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(10_000)
            : undefined;
/** response：定义该变量以承载业务值。 */
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
/** text：定义该变量以承载业务值。 */
        const text = await response.text();
        if (!response.ok) {
            throw new common_1.InternalServerErrorException(`爱发电 API 请求失败: HTTP ${response.status}${text ? `，响应: ${summarizeText(text)}` : ''}`);
        }
/** parsed：定义该变量以承载业务值。 */
        let parsed;
        try {
            parsed = JSON.parse(text);
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(`爱发电 API 返回了非 JSON 数据: ${String(error)}`);
        }
/** record：定义该变量以承载业务值。 */
        const record = asRecord(parsed);
        if (!record || typeof record.ec !== 'number' || typeof record.em !== 'string') {
            throw new common_1.InternalServerErrorException('爱发电 API 返回结构不合法');
        }
        return record;
    }
/** upsertAfdianOrders：执行对应的业务逻辑。 */
    async upsertAfdianOrders(orders, source) {
/** upserted：定义该变量以承载业务值。 */
        let upserted = 0;
        for (const order of orders) {
            const change = await this.buildStoredAfdianOrderChange(order, source);
            if (!change.changed) {
                continue;
            }
/** stored：定义该变量以承载业务值。 */
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
/** buildStoredAfdianOrderChange：执行对应的业务逻辑。 */
    async buildStoredAfdianOrderChange(order, source) {
/** now：定义该变量以承载业务值。 */
        const now = new Date().toISOString();
/** existing：定义该变量以承载业务值。 */
        const existing = await this.loadAfdianOrder(order.out_trade_no);
/** stored：定义该变量以承载业务值。 */
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
/** loadAfdianOrder：执行对应的业务逻辑。 */
    async loadAfdianOrder(outTradeNo) {
/** normalized：定义该变量以承载业务值。 */
        const normalized = typeof outTradeNo === 'string' ? outTradeNo.trim() : '';
        if (!normalized) {
            return null;
        }
        if (this.pool && this.persistenceEnabled) {
/** result：定义该变量以承载业务值。 */
            const result = await this.pool.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2 LIMIT 1', [AFDIAN_ORDER_SCOPE, normalized]);
            if (result.rowCount === 0) {
                return null;
            }
            return normalizeStoredAfdianOrder(result.rows[0]?.payload);
        }
        return this.memoryOrdersByTradeNo.get(normalized) ?? null;
    }
/** loadAllAfdianOrders：执行对应的业务逻辑。 */
    async loadAllAfdianOrders() {
        if (this.pool && this.persistenceEnabled) {
/** result：定义该变量以承载业务值。 */
            const result = await this.pool.query('SELECT payload FROM persistent_documents WHERE scope = $1', [AFDIAN_ORDER_SCOPE]);
            return result.rows.map((row) => normalizeStoredAfdianOrder(row?.payload)).filter((entry) => entry !== null);
        }
        return Array.from(this.memoryOrdersByTradeNo.values());
    }
/** readAllPersistentDocuments：执行对应的业务逻辑。 */
    async readAllPersistentDocuments() {
        if (!this.pool || !this.persistenceEnabled) {
            return [];
        }
/** result：定义该变量以承载业务值。 */
        const result = await this.pool.query('SELECT scope, key, payload, "updatedAt" FROM persistent_documents ORDER BY scope ASC, key ASC');
        return result.rows.map((row) => ({
/** scope：定义该变量以承载业务值。 */
            scope: typeof row?.scope === 'string' ? row.scope : '',
/** key：定义该变量以承载业务值。 */
            key: typeof row?.key === 'string' ? row.key : '',
            payload: row?.payload ?? null,
            updatedAt: row?.updatedAt instanceof Date
                ? row.updatedAt.toISOString()
                : normalizeTimestamp(row?.updatedAt) ?? new Date(0).toISOString(),
        })).filter((entry) => entry.scope && entry.key && !BACKUP_EXCLUDED_SCOPES.has(entry.scope));
    }
/** listFilesystemBackups：执行对应的业务逻辑。 */
    async listFilesystemBackups() {
/** entries：定义该变量以承载业务值。 */
        const entries = await node_fs_1.promises.readdir(this.backupDirectory, { withFileTypes: true }).catch(() => []);
/** records：定义该变量以承载业务值。 */
        const records = [];
        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.startsWith(`${BACKUP_FILE_PREFIX}-`) || !entry.name.endsWith('.json')) {
                continue;
            }
/** filePath：定义该变量以承载业务值。 */
            const filePath = (0, node_path_1.join)(this.backupDirectory, entry.name);
/** stats：定义该变量以承载业务值。 */
            const stats = await node_fs_1.promises.stat(filePath).catch(() => null);
            if (!stats) {
                continue;
            }
/** backupId：定义该变量以承载业务值。 */
            const backupId = entry.name.slice(`${BACKUP_FILE_PREFIX}-`.length, -'.json'.length);
            records.push({
                id: backupId,
                kind: 'manual',
                fileName: entry.name,
                createdAt: stats.mtime.toISOString(),
                sizeBytes: stats.size,
                filePath,
            });
        }
        return records;
    }
/** listDatabaseBackups：执行对应的业务逻辑。 */
    async listDatabaseBackups() {
/** records：定义该变量以承载业务值。 */
        const records = new Map();
/** filesystemRecords：定义该变量以承载业务值。 */
        const filesystemRecords = await this.listFilesystemBackups();
        for (const record of filesystemRecords) {
            records.set(record.id, record);
        }
/** persistedRecords：定义该变量以承载业务值。 */
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
                filePath: existing?.filePath ?? await resolveExistingBackupFilePath(filePath),
            });
        }
/** merged：定义该变量以承载业务值。 */
        const merged = Array.from(records.values());
        merged.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        return merged;
    }
/** findBackupRecord：执行对应的业务逻辑。 */
    async findBackupRecord(backupId) {
/** normalized：定义该变量以承载业务值。 */
        const normalized = typeof backupId === 'string' ? backupId.trim() : '';
        if (!normalized) {
            return null;
        }
/** records：定义该变量以承载业务值。 */
        const records = await this.listDatabaseBackups();
        return records.find((entry) => entry.id === normalized) ?? null;
    }
/** readBackupPayload：执行对应的业务逻辑。 */
    async readBackupPayload(filePath) {
/** raw：定义该变量以承载业务值。 */
        const raw = await node_fs_1.promises.readFile(filePath, 'utf8');
        try {
            return JSON.parse(raw);
        }
        catch {
            throw new common_1.BadRequestException('备份文件损坏，无法解析');
        }
    }
/** closePool：执行对应的业务逻辑。 */
    async closePool() {
/** pool：定义该变量以承载业务值。 */
        const pool = this.pool;
        this.pool = null;
        this.persistenceEnabled = false;
        this.memoryOrdersByTradeNo.clear();
        if (pool) {
            await pool.end().catch(() => undefined);
        }
    }
/** startDatabaseJob：执行对应的业务逻辑。 */
    startDatabaseJob(input) {
        this.assertNoRunningDatabaseJob();
        this.currentDatabaseJob = input;
        void this.persistDatabaseJobState();
        return input;
    }
/** updateDatabaseJobPhase：执行对应的业务逻辑。 */
    updateDatabaseJobPhase(job, phase) {
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
/** runDatabaseJob：执行对应的业务逻辑。 */
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
/** assertNoRunningDatabaseJob：执行对应的业务逻辑。 */
    assertNoRunningDatabaseJob() {
        if (this.currentDatabaseJob?.status === 'running') {
            throw new common_1.BadRequestException('当前已有数据库任务执行中');
        }
    }
/** assertRestoreMaintenanceEnabled：执行对应的业务逻辑。 */
    assertRestoreMaintenanceEnabled() {
        if (readBooleanEnv('SERVER_NEXT_RUNTIME_MAINTENANCE') || readBooleanEnv('RUNTIME_MAINTENANCE')) {
            return;
        }
        throw new common_1.BadRequestException('执行兼容 restore 前必须先开启维护态（SERVER_NEXT_RUNTIME_MAINTENANCE=1 或 RUNTIME_MAINTENANCE=1）');
    }
/** applyAfdianPersistentConfig：执行对应的业务逻辑。 */
    applyAfdianPersistentConfig(config) {
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
/** applyAfdianRuntimeToken：执行对应的业务逻辑。 */
    applyAfdianRuntimeToken(token) {
        this.afdianRuntimeToken = token;
        if (token) {
            process.env.AFDIAN_TOKEN = token;
        }
        else {
            delete process.env.AFDIAN_TOKEN;
        }
    }
};
exports.LegacyGmAdminCompatService = LegacyGmAdminCompatService;
exports.LegacyGmAdminCompatService = LegacyGmAdminCompatService = LegacyGmAdminCompatService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [legacy_database_restore_coordinator_service_1.LegacyDatabaseRestoreCoordinatorService])
], LegacyGmAdminCompatService);
/** resolveBackupDirectory：执行对应的业务逻辑。 */
function resolveBackupDirectory() {
/** configured：定义该变量以承载业务值。 */
    const configured = process.env.SERVER_NEXT_GM_DATABASE_BACKUP_DIR?.trim()
        || process.env.GM_DATABASE_BACKUP_DIR?.trim()
        || '';
    if (configured) {
        return (0, node_path_1.resolve)(configured);
    }
    return (0, node_path_1.resolve)(__dirname, '../../../../.runtime/gm-database-backups');
}
/** buildBackupId：执行对应的业务逻辑。 */
function buildBackupId() {
    return `${Date.now().toString(36)}-${(0, node_crypto_1.randomUUID)().slice(0, 8)}`;
}
/** cloneDatabaseJob：执行对应的业务逻辑。 */
function cloneDatabaseJob(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }
/** normalized：定义该变量以承载业务值。 */
    const normalized = normalizeDatabaseJobSnapshot(value);
    return normalized ? { ...normalized } : null;
}
/** buildBackupFilePath：执行对应的业务逻辑。 */
function buildBackupFilePath(backupDirectory, fileName) {
    return (0, node_path_1.join)(backupDirectory, fileName);
}
/** resolveExistingBackupFilePath：执行对应的业务逻辑。 */
async function resolveExistingBackupFilePath(filePath) {
/** stats：定义该变量以承载业务值。 */
    const stats = await node_fs_1.promises.stat(filePath).catch(() => null);
    return stats?.isFile() ? filePath : null;
}
/** normalizeStoredDatabaseJobState：执行对应的业务逻辑。 */
function normalizeStoredDatabaseJobState(value) {
/** record：定义该变量以承载业务值。 */
    const record = asRecord(value);
    return {
        currentJob: normalizeDatabaseJobSnapshot(record?.currentJob),
        lastJob: normalizeDatabaseJobSnapshot(record?.lastJob),
    };
}
/** shouldRecoverCompletedDatabaseJob：执行对应的业务逻辑。 */
function shouldRecoverCompletedDatabaseJob(job) {
    if (!job || job.status !== 'running') {
        return false;
    }
    if (job.phase === BACKUP_JOB_PHASE.COMPLETED || job.phase === RESTORE_JOB_PHASE.COMPLETED) {
        return true;
    }
    return typeof job.finishedAt === 'string' && job.finishedAt.trim().length > 0;
}
/** normalizeDatabaseJobSnapshot：执行对应的业务逻辑。 */
function normalizeDatabaseJobSnapshot(value) {
/** record：定义该变量以承载业务值。 */
    const record = asRecord(value);
/** id：定义该变量以承载业务值。 */
    const id = typeof record?.id === 'string' ? record.id.trim() : '';
/** type：定义该变量以承载业务值。 */
    const type = record?.type === 'backup' || record?.type === 'restore' ? record.type : null;
/** status：定义该变量以承载业务值。 */
    const status = record?.status === 'running' || record?.status === 'completed' || record?.status === 'failed'
        ? record.status
        : null;
/** startedAt：定义该变量以承载业务值。 */
    const startedAt = normalizeTimestamp(record?.startedAt);
    if (!id || !type || !status || !startedAt) {
        return null;
    }
/** finishedAt：定义该变量以承载业务值。 */
    const finishedAt = normalizeTimestamp(record?.finishedAt);
/** kind：定义该变量以承载业务值。 */
    const kind = record?.kind === 'hourly' || record?.kind === 'daily' || record?.kind === 'manual' || record?.kind === 'pre_import'
        ? record.kind
        : undefined;
/** backupId：定义该变量以承载业务值。 */
    const backupId = typeof record?.backupId === 'string' && record.backupId.trim() ? record.backupId.trim() : undefined;
/** sourceBackupId：定义该变量以承载业务值。 */
    const sourceBackupId = typeof record?.sourceBackupId === 'string' && record.sourceBackupId.trim() ? record.sourceBackupId.trim() : undefined;
/** error：定义该变量以承载业务值。 */
    const error = typeof record?.error === 'string' && record.error.trim() ? record.error.trim() : undefined;
/** phase：定义该变量以承载业务值。 */
    const phase = typeof record?.phase === 'string' && record.phase.trim() ? record.phase.trim() : undefined;
/** checkpointBackupId：定义该变量以承载业务值。 */
    const checkpointBackupId = typeof record?.checkpointBackupId === 'string' && record.checkpointBackupId.trim()
        ? record.checkpointBackupId.trim()
        : undefined;
/** appliedAt：定义该变量以承载业务值。 */
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
/** normalizeStoredBackupMetadata：执行对应的业务逻辑。 */
function normalizeStoredBackupMetadata(value) {
/** record：定义该变量以承载业务值。 */
    const record = asRecord(value);
/** id：定义该变量以承载业务值。 */
    const id = typeof record?.id === 'string' ? record.id.trim() : '';
/** fileName：定义该变量以承载业务值。 */
    const fileName = typeof record?.fileName === 'string' ? record.fileName.trim() : '';
/** createdAt：定义该变量以承载业务值。 */
    const createdAt = normalizeTimestamp(record?.createdAt);
/** sizeBytes：定义该变量以承载业务值。 */
    const sizeBytes = Number(record?.sizeBytes);
/** kind：定义该变量以承载业务值。 */
    const kind = record?.kind === 'hourly' || record?.kind === 'daily' || record?.kind === 'manual' || record?.kind === 'pre_import'
        ? record.kind
        : null;
/** compatScope：定义该变量以承载业务值。 */
    const compatScope = record?.compatScope === BACKUP_SCOPE_LABEL ? BACKUP_SCOPE_LABEL : BACKUP_SCOPE_LABEL;
/** documentsCount：定义该变量以承载业务值。 */
    const documentsCount = Number(record?.documentsCount);
/** checksumSha256：定义该变量以承载业务值。 */
    const checksumSha256 = typeof record?.checksumSha256 === 'string' && record.checksumSha256.trim()
        ? record.checksumSha256.trim()
        : undefined;
    if (!id || !fileName || !createdAt || !Number.isFinite(sizeBytes) || sizeBytes < 0 || !kind) {
        return null;
    }
    return {
        id,
        kind,
        fileName,
        createdAt,
        sizeBytes: Math.trunc(sizeBytes),
        compatScope,
/** documentsCount：定义该变量以承载业务值。 */
        documentsCount: Number.isFinite(documentsCount) && documentsCount >= 0 ? Math.trunc(documentsCount) : undefined,
        checksumSha256,
    };
}
/** assertCompatibleBackupPayload：执行对应的业务逻辑。 */
function assertCompatibleBackupPayload(value) {
/** record：定义该变量以承载业务值。 */
    const record = asRecord(value);
    if (!record) {
        throw new common_1.BadRequestException('兼容备份内容无效');
    }
    if (record.kind !== undefined && record.kind !== BACKUP_FILE_KIND) {
        throw new common_1.BadRequestException('备份类型不受支持，当前仅支持 server-next 兼容 persistent_documents 备份');
    }
    if (record.scope !== undefined && record.scope !== BACKUP_SCOPE_LABEL) {
        throw new common_1.BadRequestException('备份作用域不受支持，当前仅支持 persistent_documents 兼容备份');
    }
    if (!Array.isArray(record.docs)) {
        throw new common_1.BadRequestException('兼容备份缺少 docs 列表');
    }
    if (record.version !== undefined && Number(record.version) !== 1) {
        throw new common_1.BadRequestException('备份版本不受支持，当前仅支持 version=1');
    }
/** createdAt：定义该变量以承载业务值。 */
    const createdAt = normalizeTimestamp(record.createdAt);
    if (!createdAt) {
        throw new common_1.BadRequestException('兼容备份缺少 createdAt');
    }
/** backupId：定义该变量以承载业务值。 */
    const backupId = typeof record.backupId === 'string' && record.backupId.trim() ? record.backupId.trim() : '';
    if (!backupId) {
        throw new common_1.BadRequestException('兼容备份缺少 backupId');
    }
/** docs：定义该变量以承载业务值。 */
    const docs = record.docs.map((entry, index) => normalizePersistentDocumentBackupEntry(entry, index));
/** documentsCount：定义该变量以承载业务值。 */
    const documentsCount = Number(record.documentsCount);
    if (!Number.isFinite(documentsCount) || Math.trunc(documentsCount) !== docs.length) {
        throw new common_1.BadRequestException(`兼容备份 documentsCount 与 docs 实际数量不一致：期望 ${Number.isFinite(documentsCount) ? Math.trunc(documentsCount) : 'invalid'}，实际 ${docs.length}`);
    }
/** checksumSha256：定义该变量以承载业务值。 */
    const checksumSha256 = typeof record.checksumSha256 === 'string' ? record.checksumSha256.trim() : '';
    if (!checksumSha256) {
        throw new common_1.BadRequestException('兼容备份缺少 checksumSha256');
    }
/** actualChecksum：定义该变量以承载业务值。 */
    const actualChecksum = computeBackupChecksum(docs);
    if (checksumSha256 !== actualChecksum) {
        throw new common_1.BadRequestException('兼容备份 checksumSha256 校验失败，文件内容可能已损坏或被篡改');
    }
    return {
        kind: BACKUP_FILE_KIND,
        version: 1,
        scope: BACKUP_SCOPE_LABEL,
        backupId,
        createdAt,
        documentsCount: docs.length,
        checksumSha256,
        docs,
    };
}
/** summarizeText：执行对应的业务逻辑。 */
function summarizeText(value) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = String(value ?? '').replace(/\s+/gu, ' ').trim();
    return normalized.length > 160 ? `${normalized.slice(0, 160)}...` : normalized;
}
/** assertAfdianWebhookAuthorized：执行对应的业务逻辑。 */
function assertAfdianWebhookAuthorized(envelope, headers) {
/** secret：定义该变量以承载业务值。 */
    const secret = readAfdianWebhookSecret();
    if (secret === null) {
        return;
    }
/** headerRecord：定义该变量以承载业务值。 */
    const headerRecord = asRecord(headers) ?? {};
/** headerCandidates：定义该变量以承载业务值。 */
    const headerCandidates = [
        headerRecord['x-server-next-webhook-token'],
        headerRecord['x-afdian-webhook-token'],
        headerRecord['x-webhook-token'],
        extractBearerToken(headerRecord.authorization),
    ];
/** bodyCandidates：定义该变量以承载业务值。 */
    const bodyCandidates = [
        envelope.webhookToken,
        envelope.token,
    ];
/** candidates：定义该变量以承载业务值。 */
    const candidates = [...headerCandidates, ...bodyCandidates]
        .filter((entry) => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    for (const candidate of candidates) {
        if (safeEqualText(candidate, secret)) {
            return;
        }
    }
    throw new common_1.UnauthorizedException('爱发电 webhook 鉴权失败');
}
/** normalizePersistentDocumentBackupEntry：执行对应的业务逻辑。 */
function normalizePersistentDocumentBackupEntry(value, index = -1) {
/** record：定义该变量以承载业务值。 */
    const record = asRecord(value);
/** scope：定义该变量以承载业务值。 */
    const scope = typeof record?.scope === 'string' ? record.scope.trim() : '';
/** key：定义该变量以承载业务值。 */
    const key = typeof record?.key === 'string' ? record.key.trim() : '';
    if (!scope || !key) {
        throw new common_1.BadRequestException(index >= 0
            ? `兼容备份 docs[${index}] 缺少合法 scope/key`
            : '兼容备份中存在缺少合法 scope/key 的记录');
    }
/** updatedAt：定义该变量以承载业务值。 */
    const updatedAt = normalizeTimestamp(record.updatedAt);
    if (!updatedAt) {
        throw new common_1.BadRequestException(index >= 0
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
/** computeBackupChecksum：执行对应的业务逻辑。 */
function computeBackupChecksum(docs) {
    return (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(docs)).digest('hex');
}
/** readBooleanEnv：执行对应的业务逻辑。 */
function readBooleanEnv(key) {
/** raw：定义该变量以承载业务值。 */
    const raw = process.env[key];
    if (typeof raw !== 'string') {
        return false;
    }
/** normalized：定义该变量以承载业务值。 */
    const normalized = raw.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}
/** extractAfdianOrderList：执行对应的业务逻辑。 */
function extractAfdianOrderList(response) {
    if (response?.ec !== 200) {
        throw new common_1.BadRequestException(typeof response?.em === 'string' && response.em.trim() ? response.em : '爱发电 API 返回失败');
    }
/** data：定义该变量以承载业务值。 */
    const data = asRecord(response.data);
/** list：定义该变量以承载业务值。 */
    const list = Array.isArray(data?.list) ? data.list : [];
    return list.map((entry) => normalizeAfdianOrderPayload(entry)).filter((item) => item !== null);
}
/** normalizeAfdianOrderPayload：执行对应的业务逻辑。 */
function normalizeAfdianOrderPayload(value) {
/** record：定义该变量以承载业务值。 */
    const record = asRecord(value);
/** outTradeNo：定义该变量以承载业务值。 */
    const outTradeNo = typeof record?.out_trade_no === 'string' ? record.out_trade_no.trim() : '';
/** userId：定义该变量以承载业务值。 */
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
/** normalizeStoredAfdianOrder：执行对应的业务逻辑。 */
function normalizeStoredAfdianOrder(value) {
/** record：定义该变量以承载业务值。 */
    const record = asRecord(value);
/** outTradeNo：定义该变量以承载业务值。 */
    const outTradeNo = typeof record?.outTradeNo === 'string' ? record.outTradeNo.trim() : '';
/** userId：定义该变量以承载业务值。 */
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
/** lastSource：定义该变量以承载业务值。 */
        lastSource: record.lastSource === 'api' ? 'api' : 'webhook',
        createdAt: normalizeTimestamp(record.createdAt) ?? new Date(0).toISOString(),
        updatedAt: normalizeTimestamp(record.updatedAt) ?? new Date(0).toISOString(),
    };
}
/** isSameStoredAfdianOrder：执行对应的业务逻辑。 */
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
/** isSameSkuDetail：执行对应的业务逻辑。 */
function isSameSkuDetail(left, right) {
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
/** isSameJsonValue：执行对应的业务逻辑。 */
function isSameJsonValue(left, right) {
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
/** leftRecord：定义该变量以承载业务值。 */
        const leftRecord = asRecord(left);
/** rightRecord：定义该变量以承载业务值。 */
        const rightRecord = asRecord(right);
        if (!leftRecord || !rightRecord) {
            return false;
        }
/** leftKeys：定义该变量以承载业务值。 */
        const leftKeys = Object.keys(leftRecord);
/** rightKeys：定义该变量以承载业务值。 */
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
/** asRecord：执行对应的业务逻辑。 */
function asRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value;
}
/** normalizeEnvValue：执行对应的业务逻辑。 */
function normalizeEnvValue(value) {
    if (typeof value !== 'string') {
        return null;
    }
/** trimmed：定义该变量以承载业务值。 */
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}
/** readAfdianWebhookSecret：执行对应的业务逻辑。 */
function readAfdianWebhookSecret() {
    return normalizeEnvValue(process.env.SERVER_NEXT_AFDIAN_WEBHOOK_SECRET)
        ?? normalizeEnvValue(process.env.AFDIAN_WEBHOOK_SECRET)
        ?? null;
}
/** extractBearerToken：执行对应的业务逻辑。 */
function extractBearerToken(value) {
    if (typeof value !== 'string') {
        return null;
    }
/** trimmed：定义该变量以承载业务值。 */
    const trimmed = value.trim();
    if (!trimmed.startsWith('Bearer ')) {
        return trimmed || null;
    }
/** token：定义该变量以承载业务值。 */
    const token = trimmed.slice(7).trim();
    return token || null;
}
/** safeEqualText：执行对应的业务逻辑。 */
function safeEqualText(left, right) {
/** leftBuffer：定义该变量以承载业务值。 */
    const leftBuffer = Buffer.from(left, 'utf8');
/** rightBuffer：定义该变量以承载业务值。 */
    const rightBuffer = Buffer.from(right, 'utf8');
    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }
    return leftBuffer.length > 0 && (0, node_crypto_1.timingSafeEqual)(leftBuffer, rightBuffer);
}
/** normalizeTimestamp：执行对应的业务逻辑。 */
function normalizeTimestamp(value) {
    if (typeof value === 'string' && value.trim()) {
        return value;
    }
    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return value.toISOString();
    }
    return null;
}
/** readInteger：执行对应的业务逻辑。 */
function readInteger(value, fallback = 0) {
/** parsed：定义该变量以承载业务值。 */
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}
/** clampInteger：执行对应的业务逻辑。 */
function clampInteger(value, fallback, min, max) {
/** parsed：定义该变量以承载业务值。 */
    const parsed = readInteger(value, fallback);
    if (parsed < min) {
        return min;
    }
    if (parsed > max) {
        return max;
    }
    return parsed;
}
/** readOptionalString：执行对应的业务逻辑。 */
function readOptionalString(value) {
    if (typeof value !== 'string') {
        return null;
    }
/** trimmed：定义该变量以承载业务值。 */
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}
/** readPersistentConfigFromEnv：执行对应的业务逻辑。 */
function readPersistentConfigFromEnv() {
    return normalizeStoredPersistentConfig({
        userId: process.env.AFDIAN_USER_ID ?? '',
        apiBaseUrl: process.env.AFDIAN_API_BASE_URL ?? '',
        publicBaseUrl: process.env.AFDIAN_PUBLIC_BASE_URL ?? '',
    });
}
/** hasEnvBackedAfdianPersistentConfig：执行对应的业务逻辑。 */
function hasEnvBackedAfdianPersistentConfig() {
    return normalizeEnvValue(process.env.AFDIAN_USER_ID) !== null
        || normalizeEnvValue(process.env.AFDIAN_API_BASE_URL) !== null
        || normalizeEnvValue(process.env.AFDIAN_PUBLIC_BASE_URL) !== null;
}
/** cloneAfdianPersistentConfig：执行对应的业务逻辑。 */
function cloneAfdianPersistentConfig(config) {
    return {
/** userId：定义该变量以承载业务值。 */
        userId: typeof config?.userId === 'string' ? config.userId : '',
/** apiBaseUrl：定义该变量以承载业务值。 */
        apiBaseUrl: typeof config?.apiBaseUrl === 'string' && config.apiBaseUrl.trim()
            ? config.apiBaseUrl
            : DEFAULT_AFDIAN_API_BASE_URL,
/** publicBaseUrl：定义该变量以承载业务值。 */
        publicBaseUrl: typeof config?.publicBaseUrl === 'string' ? config.publicBaseUrl : '',
    };
}
/** readRuntimeTokenFromEnv：执行对应的业务逻辑。 */
function readRuntimeTokenFromEnv() {
    return normalizeEnvValue(process.env.AFDIAN_TOKEN) ?? '';
}
/** normalizePersistentConfig：执行对应的业务逻辑。 */
function normalizePersistentConfig(input) {
    return {
        userId: normalizeEnvValue(input?.userId) ?? '',
        apiBaseUrl: normalizeApiBaseUrl(input?.apiBaseUrl ?? ''),
        publicBaseUrl: normalizePublicBaseUrl(input?.publicBaseUrl ?? ''),
    };
}
/** normalizeStoredPersistentConfig：执行对应的业务逻辑。 */
function normalizeStoredPersistentConfig(input) {
    return {
        userId: normalizeEnvValue(input?.userId) ?? '',
        apiBaseUrl: normalizeApiBaseUrl(input?.apiBaseUrl ?? ''),
        publicBaseUrl: normalizePublicBaseUrl(input?.publicBaseUrl ?? ''),
    };
}
/** normalizeApiBaseUrl：执行对应的业务逻辑。 */
function normalizeApiBaseUrl(value) {
    return normalizeBaseUrl(value, {
        fieldLabel: '爱发电 API 地址',
        defaultValue: DEFAULT_AFDIAN_API_BASE_URL,
        preservePath: false,
        canonicalizeAfdianHost: true,
    });
}
/** normalizePublicBaseUrl：执行对应的业务逻辑。 */
function normalizePublicBaseUrl(value) {
    return normalizeBaseUrl(value, {
        fieldLabel: '公网地址',
        defaultValue: '',
        preservePath: true,
        canonicalizeAfdianHost: false,
    });
}
/** normalizeBaseUrl：执行对应的业务逻辑。 */
function normalizeBaseUrl(value, options) {
/** trimmed：定义该变量以承载业务值。 */
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) {
        return options.defaultValue;
    }
/** parsed：定义该变量以承载业务值。 */
    let parsed;
    try {
        parsed = new node_url_1.URL(trimmed);
    }
    catch {
        throw new common_1.BadRequestException(`${options.fieldLabel} 格式不正确，必须以 http:// 或 https:// 开头`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new common_1.BadRequestException(`${options.fieldLabel} 仅支持 http:// 或 https://`);
    }
    if (options.canonicalizeAfdianHost && AFDIAN_KNOWN_HOSTS.has(parsed.hostname.toLowerCase())) {
        return DEFAULT_AFDIAN_API_BASE_URL;
    }
/** normalizedPath：定义该变量以承载业务值。 */
    const normalizedPath = options.preservePath
        ? parsed.pathname.replace(/\/+$/u, '')
        : '';
    return `${parsed.protocol}//${parsed.host}${normalizedPath}`;
}
/** buildWebhookUrl：执行对应的业务逻辑。 */
function buildWebhookUrl(publicBaseUrl, webhookPath) {
/** baseUrl：定义该变量以承载业务值。 */
    const baseUrl = normalizeEnvValue(publicBaseUrl);
    if (!baseUrl) {
        return null;
    }
    return `${baseUrl.replace(/\/+$/u, '')}${webhookPath}`;
}
