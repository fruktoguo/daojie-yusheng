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
import { resolveServerNextDatabaseUrl } from '../../config/env-alias';
import { ensurePersistentDocumentsTable } from '../../persistence/persistent-document-table';
import { NextDatabaseRestoreCoordinatorService } from './next-database-restore-coordinator.service';
import { NEXT_GM_RESTORE_CONTRACT } from './next-gm-contract';
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

const AFDIAN_CONFIG_SCOPE = 'server_next_afdian_config_v1';

const AFDIAN_CONFIG_KEY = 'afdian';

const AFDIAN_ORDER_SCOPE = 'server_next_afdian_orders_v1';

const DATABASE_BACKUP_METADATA_SCOPE = 'server_next_db_backups_v1';

const DATABASE_JOB_STATE_SCOPE = 'server_next_db_jobs_v1';

const DATABASE_JOB_STATE_KEY = 'gm_database';

const AFDIAN_CONFIG_SCOPES = [AFDIAN_CONFIG_SCOPE];

const AFDIAN_ORDER_SCOPES = [AFDIAN_ORDER_SCOPE];

const DATABASE_BACKUP_METADATA_SCOPES = [DATABASE_BACKUP_METADATA_SCOPE];

const DATABASE_JOB_STATE_SCOPES = [DATABASE_JOB_STATE_SCOPE];

const BACKUP_FILE_PREFIX = 'server-next-persistent-documents';

const BACKUP_FILE_KIND = 'server_next_persistent_documents_backup_v1';

const BACKUP_SCOPE_LABEL = 'persistent_documents_only';

const BACKUP_EXCLUDED_SCOPES = new Set([
    DATABASE_BACKUP_METADATA_SCOPE,
    DATABASE_JOB_STATE_SCOPE,
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

@Injectable()
export class NextGmAdminService {
    logger = new Logger(NextGmAdminService.name);
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
    constructor(@Inject(NextDatabaseRestoreCoordinatorService) private readonly databaseRestoreCoordinator) {
    }
    async onModuleInit() {
        await fsPromises.mkdir(this.backupDirectory, { recursive: true });

        const databaseUrl = resolveServerNextDatabaseUrl();
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
    async onModuleDestroy() {
        await this.closePool();
    }
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
                restoreRequiresMaintenance: NEXT_GM_RESTORE_CONTRACT.requiresMaintenance,
                preImportBackupEnabled: NEXT_GM_RESTORE_CONTRACT.preImportBackupEnabled,
            },
            persistenceEnabled: this.persistenceEnabled,
            scope: NEXT_GM_RESTORE_CONTRACT.scope,
            restoreMode: NEXT_GM_RESTORE_CONTRACT.restoreMode,
            note: '仅作用于 server-next persistent_documents，不会恢复旧后端 users/players 等正式业务表；当前 backup/restore 仍为手工触发，不存在自动定时备份或自动保留清理',
        };
    }
    isRuntimeMaintenanceActive() {
        if (readBooleanEnv('SERVER_NEXT_RUNTIME_MAINTENANCE') || readBooleanEnv('RUNTIME_MAINTENANCE')) {
            return true;
        }
        return this.currentDatabaseJob?.status === 'running' && this.currentDatabaseJob?.type === 'restore';
    }
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
    async getBackupDownloadRecord(backupId) {

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
    async triggerDatabaseRestore(backupId) {
        this.assertRestoreMaintenanceEnabled();

        const record = await this.findBackupRecord(backupId);
        if (!record) {
            throw new BadRequestException('目标备份不存在');
        }
        if (!this.pool || !this.persistenceEnabled) {
            throw new BadRequestException('当前未启用数据库持久化，暂不支持导入兼容备份');
        }

        const payload = await this.readBackupPayload(record.filePath);

        const validatedPayload = assertCompatibleBackupPayload(payload);

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
                process.env.SERVER_NEXT_RUNTIME_RESTORE_ACTIVE = '1';
                this.updateDatabaseJobPhase(job, RESTORE_JOB_PHASE.PREPARING_RUNTIME);
                await this.databaseRestoreCoordinator.prepareForRestore();

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
            scope: BACKUP_SCOPE_LABEL,
        };
    }
    getAfdianConfig() {
        return {
            config: this.getAfdianConfigForm(),
            status: this.getAfdianConfigStatus(),
        };
    }
    async saveAfdianConfig(input) {

        const normalized = normalizePersistentConfig(input ?? {});

        const runtimeToken = normalizeEnvValue(input?.token) ?? '';
        this.applyAfdianPersistentConfig(normalized);
        this.applyAfdianRuntimeToken(runtimeToken);
        await this.persistAfdianPersistentConfig(normalized);
        return this.getAfdianConfig();
    }
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
    async pingAfdianApi(input) {

        const config = this.getRequiredAfdianApiConfig(input?.token);
        await this.requestAfdianApi(config.userId, config.token, AFDIAN_PING_PATH, {});
        return {
            ...this.getAfdianConfigStatus(),
            reachable: true,
        };
    }
    async syncAfdianOrders(input) {

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
    async handleAfdianWebhook(body, headers = {}) {

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
    async reloadPersistentCompatibilityState() {
        this.memoryOrdersByTradeNo.clear();
        await this.loadAfdianPersistentConfig();
    }
    async loadPersistedDatabaseJobState() {
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
    async persistDatabaseJobState() {
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
    async persistBackupMetadata(record) {
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
    async createDatabaseBackupSnapshot(input) {
        input.job && this.updateDatabaseJobPhase(input.job, BACKUP_JOB_PHASE.VALIDATING);

        const docs = await this.readAllPersistentDocuments();
        input.job && this.updateDatabaseJobPhase(input.job, BACKUP_JOB_PHASE.WRITING_FILE);

        const checksumSha256 = computeBackupChecksum(docs);

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

        const fileName = `${BACKUP_FILE_PREFIX}-${input.backupId}.json`;

        const filePath = join(this.backupDirectory, fileName);

        const serialized = JSON.stringify(payload, null, 2);
        await fsPromises.mkdir(this.backupDirectory, { recursive: true });
        await fsPromises.writeFile(filePath, serialized, 'utf8');
        input.job && this.updateDatabaseJobPhase(input.job, BACKUP_JOB_PHASE.PERSISTING_METADATA);
        await this.persistBackupMetadata({
            id: input.backupId,
            kind: input.kind,
            fileName,
            createdAt: input.createdAt,
            sizeBytes: Buffer.byteLength(serialized, 'utf8'),
            scope: BACKUP_SCOPE_LABEL,
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
    async loadPersistedBackupMetadataRecords() {
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
    async backfillBackupMetadataFromFilesystem() {

        const records = await this.listFilesystemBackups();
        await Promise.all(records.map((record) => this.persistBackupMetadata({
            id: record.id,
            kind: record.kind,
            fileName: record.fileName,
            createdAt: record.createdAt,
            sizeBytes: record.sizeBytes,
            scope: BACKUP_SCOPE_LABEL,
        })));
    }
    async loadAfdianPersistentConfig() {
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
    getAfdianConfigForm() {
        return {
            userId: this.afdianPersistentConfig.userId,
            token: '',
            apiBaseUrl: this.afdianPersistentConfig.apiBaseUrl,
            publicBaseUrl: this.afdianPersistentConfig.publicBaseUrl,
        };
    }
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
    getRequiredAfdianApiConfig(requestToken) {

        const userId = normalizeEnvValue(this.afdianPersistentConfig.userId);

        const token = normalizeEnvValue(requestToken) ?? normalizeEnvValue(this.afdianRuntimeToken);
        if (!userId || !token) {
            throw new ServiceUnavailableException('AFDIAN_USER_ID 或 AFDIAN_TOKEN 未配置');
        }
        return { userId, token };
    }
    async queryAfdianOrders(userId, token, params) {
        return this.requestAfdianApi(userId, token, AFDIAN_QUERY_ORDER_PATH, params);
    }
    async requestAfdianApi(userId, token, apiPath, params) {

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
    async upsertAfdianOrders(orders, source) {

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
    async buildStoredAfdianOrderChange(order, source) {

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
    async loadAfdianOrder(outTradeNo) {

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
    async loadAllAfdianOrders() {
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
    async readAllPersistentDocuments() {
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
    async listFilesystemBackups() {

        const entries = await fsPromises.readdir(this.backupDirectory, { withFileTypes: true }).catch(() => []);

        const records = [];
        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.startsWith(`${BACKUP_FILE_PREFIX}-`) || !entry.name.endsWith('.json')) {
                continue;
            }

            const filePath = join(this.backupDirectory, entry.name);

            const stats = await fsPromises.stat(filePath).catch(() => null);
            if (!stats) {
                continue;
            }

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
    async listDatabaseBackups() {

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
                filePath: existing?.filePath ?? await resolveExistingBackupFilePath(filePath),
            });
        }

        const merged = Array.from(records.values());
        merged.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        return merged;
    }
    async findBackupRecord(backupId) {

        const normalized = typeof backupId === 'string' ? backupId.trim() : '';
        if (!normalized) {
            return null;
        }

        const records = await this.listDatabaseBackups();
        return records.find((entry) => entry.id === normalized) ?? null;
    }
    async readBackupPayload(filePath) {

        const raw = await fsPromises.readFile(filePath, 'utf8');
        try {
            return JSON.parse(raw);
        }
        catch {
            throw new BadRequestException('备份文件损坏，无法解析');
        }
    }
    async closePool() {

        const pool = this.pool;
        this.pool = null;
        this.persistenceEnabled = false;
        this.memoryOrdersByTradeNo.clear();
        if (pool) {
            await pool.end().catch(() => undefined);
        }
    }
    async loadPersistentPayloadByScopes(scopes, key) {
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
    startDatabaseJob(input) {
        this.assertNoRunningDatabaseJob();
        this.currentDatabaseJob = input;
        void this.persistDatabaseJobState();
        return input;
    }
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
    assertNoRunningDatabaseJob() {
        if (this.currentDatabaseJob?.status === 'running') {
            throw new BadRequestException('当前已有数据库任务执行中');
        }
    }
    assertRestoreMaintenanceEnabled() {
        if (readBooleanEnv('SERVER_NEXT_RUNTIME_MAINTENANCE') || readBooleanEnv('RUNTIME_MAINTENANCE')) {
            return;
        }
        throw new BadRequestException('执行兼容 restore 前必须先开启维护态（SERVER_NEXT_RUNTIME_MAINTENANCE=1 或 RUNTIME_MAINTENANCE=1）');
    }
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
    applyAfdianRuntimeToken(token) {
        this.afdianRuntimeToken = token;
        if (token) {
            process.env.AFDIAN_TOKEN = token;
        }
        else {
            delete process.env.AFDIAN_TOKEN;
        }
    }
}
function resolveBackupDirectory() {

    const configured = process.env.SERVER_NEXT_GM_DATABASE_BACKUP_DIR?.trim()
        || process.env.GM_DATABASE_BACKUP_DIR?.trim()
        || '';
    if (configured) {
        return resolve(configured);
    }
    return resolve(__dirname, '../../../../.runtime/gm-database-backups');
}
function buildBackupId() {
    return `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}
function cloneDatabaseJob(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const normalized = normalizeDatabaseJobSnapshot(value);
    return normalized ? { ...normalized } : null;
}
function buildBackupFilePath(backupDirectory, fileName) {
    return join(backupDirectory, fileName);
}
async function resolveExistingBackupFilePath(filePath) {

    const stats = await fsPromises.stat(filePath).catch(() => null);
    return stats?.isFile() ? filePath : null;
}
function normalizeStoredDatabaseJobState(value) {

    const record = asRecord(value);
    return {
        currentJob: normalizeDatabaseJobSnapshot(record?.currentJob),
        lastJob: normalizeDatabaseJobSnapshot(record?.lastJob),
    };
}
function shouldRecoverCompletedDatabaseJob(job) {
    if (!job || job.status !== 'running') {
        return false;
    }
    if (job.phase === BACKUP_JOB_PHASE.COMPLETED || job.phase === RESTORE_JOB_PHASE.COMPLETED) {
        return true;
    }
    return typeof job.finishedAt === 'string' && job.finishedAt.trim().length > 0;
}
function normalizeDatabaseJobSnapshot(value) {

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
function normalizeStoredBackupMetadata(value) {

    const record = asRecord(value);

    const id = typeof record?.id === 'string' ? record.id.trim() : '';

    const fileName = typeof record?.fileName === 'string' ? record.fileName.trim() : '';

    const createdAt = normalizeTimestamp(record?.createdAt);

    const sizeBytes = Number(record?.sizeBytes);

    const kind = record?.kind === 'hourly' || record?.kind === 'daily' || record?.kind === 'manual' || record?.kind === 'pre_import'
        ? record.kind
        : null;

    const scope = record?.scope === BACKUP_SCOPE_LABEL ? BACKUP_SCOPE_LABEL : BACKUP_SCOPE_LABEL;

    const documentsCount = Number(record?.documentsCount);

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
        scope,

        documentsCount: Number.isFinite(documentsCount) && documentsCount >= 0 ? Math.trunc(documentsCount) : undefined,
        checksumSha256,
    };
}
function assertCompatibleBackupPayload(value) {

    const record = asRecord(value);
    if (!record) {
        throw new BadRequestException('兼容备份内容无效');
    }
    if (record.kind !== undefined && record.kind !== BACKUP_FILE_KIND) {
        throw new BadRequestException('备份类型不受支持，当前仅支持 server-next 兼容 persistent_documents 备份');
    }
    if (record.scope !== undefined && record.scope !== BACKUP_SCOPE_LABEL) {
        throw new BadRequestException('备份作用域不受支持，当前仅支持 persistent_documents 兼容备份');
    }
    if (!Array.isArray(record.docs)) {
        throw new BadRequestException('兼容备份缺少 docs 列表');
    }
    if (record.version !== undefined && Number(record.version) !== 1) {
        throw new BadRequestException('备份版本不受支持，当前仅支持 version=1');
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
function summarizeText(value) {

    const normalized = String(value ?? '').replace(/\s+/gu, ' ').trim();
    return normalized.length > 160 ? `${normalized.slice(0, 160)}...` : normalized;
}
function assertAfdianWebhookAuthorized(envelope, headers) {

    const secret = readAfdianWebhookSecret();
    if (secret === null) {
        return;
    }

    const headerRecord = asRecord(headers) ?? {};

    const headerCandidates = [
        headerRecord['x-server-next-webhook-token'],
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
function normalizePersistentDocumentBackupEntry(value, index = -1) {

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
function computeBackupChecksum(docs) {
    return createHash('sha256').update(JSON.stringify(docs)).digest('hex');
}
function readBooleanEnv(key) {

    const raw = process.env[key];
    if (typeof raw !== 'string') {
        return false;
    }

    const normalized = raw.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}
function extractAfdianOrderList(response) {
    if (response?.ec !== 200) {
        throw new BadRequestException(typeof response?.em === 'string' && response.em.trim() ? response.em : '爱发电 API 返回失败');
    }

    const data = asRecord(response.data);

    const list = Array.isArray(data?.list) ? data.list : [];
    return list.map((entry) => normalizeAfdianOrderPayload(entry)).filter((item) => item !== null);
}
function normalizeAfdianOrderPayload(value) {

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
function normalizeStoredAfdianOrder(value) {

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
function asRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value;
}
function normalizeEnvValue(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}
function readAfdianWebhookSecret() {
    return normalizeEnvValue(process.env.SERVER_NEXT_AFDIAN_WEBHOOK_SECRET)
        ?? normalizeEnvValue(process.env.AFDIAN_WEBHOOK_SECRET)
        ?? null;
}
function extractBearerToken(value) {
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
function safeEqualText(left, right) {

    const leftBuffer = Buffer.from(left, 'utf8');

    const rightBuffer = Buffer.from(right, 'utf8');
    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }
    return leftBuffer.length > 0 && timingSafeEqual(leftBuffer, rightBuffer);
}
function normalizeTimestamp(value) {
    if (typeof value === 'string' && value.trim()) {
        return value;
    }
    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return value.toISOString();
    }
    return null;
}
function readInteger(value, fallback = 0) {

    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}
function clampInteger(value, fallback, min, max) {

    const parsed = readInteger(value, fallback);
    if (parsed < min) {
        return min;
    }
    if (parsed > max) {
        return max;
    }
    return parsed;
}
function readOptionalString(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}
function readPersistentConfigFromEnv() {
    return normalizeStoredPersistentConfig({
        userId: process.env.AFDIAN_USER_ID ?? '',
        apiBaseUrl: process.env.AFDIAN_API_BASE_URL ?? '',
        publicBaseUrl: process.env.AFDIAN_PUBLIC_BASE_URL ?? '',
    });
}
function hasEnvBackedAfdianPersistentConfig() {
    return normalizeEnvValue(process.env.AFDIAN_USER_ID) !== null
        || normalizeEnvValue(process.env.AFDIAN_API_BASE_URL) !== null
        || normalizeEnvValue(process.env.AFDIAN_PUBLIC_BASE_URL) !== null;
}
function cloneAfdianPersistentConfig(config) {
    return {

        userId: typeof config?.userId === 'string' ? config.userId : '',

        apiBaseUrl: typeof config?.apiBaseUrl === 'string' && config.apiBaseUrl.trim()
            ? config.apiBaseUrl
            : DEFAULT_AFDIAN_API_BASE_URL,

        publicBaseUrl: typeof config?.publicBaseUrl === 'string' ? config.publicBaseUrl : '',
    };
}
function readRuntimeTokenFromEnv() {
    return normalizeEnvValue(process.env.AFDIAN_TOKEN) ?? '';
}
function normalizePersistentConfig(input) {
    return {
        userId: normalizeEnvValue(input?.userId) ?? '',
        apiBaseUrl: normalizeApiBaseUrl(input?.apiBaseUrl ?? ''),
        publicBaseUrl: normalizePublicBaseUrl(input?.publicBaseUrl ?? ''),
    };
}
function normalizeStoredPersistentConfig(input) {
    return {
        userId: normalizeEnvValue(input?.userId) ?? '',
        apiBaseUrl: normalizeApiBaseUrl(input?.apiBaseUrl ?? ''),
        publicBaseUrl: normalizePublicBaseUrl(input?.publicBaseUrl ?? ''),
    };
}
function normalizeApiBaseUrl(value) {
    return normalizeBaseUrl(value, {
        fieldLabel: '爱发电 API 地址',
        defaultValue: DEFAULT_AFDIAN_API_BASE_URL,
        preservePath: false,
        canonicalizeAfdianHost: true,
    });
}
function normalizePublicBaseUrl(value) {
    return normalizeBaseUrl(value, {
        fieldLabel: '公网地址',
        defaultValue: '',
        preservePath: true,
        canonicalizeAfdianHost: false,
    });
}
function normalizeBaseUrl(value, options) {

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
function buildWebhookUrl(publicBaseUrl, webhookPath) {

    const baseUrl = normalizeEnvValue(publicBaseUrl);
    if (!baseUrl) {
        return null;
    }
    return `${baseUrl.replace(/\/+$/u, '')}${webhookPath}`;
}
