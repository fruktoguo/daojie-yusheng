/**
 * 本文件实现后台 worker 或对应冷路径入口，负责把运行态变更异步落库、清理或压缩。
 *
 * 维护时要关注批量大小、重试幂等和中断恢复，不能让后台任务破坏服务端权威状态。
 */
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promises as fsPromises } from 'node:fs';
import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { buildPostgresDumpFileName, createPostgresCustomDump } from '../http/native/native-postgres-backup';

export type BackupKind = 'hourly' | 'daily';

interface BackupWorkerState {
  runningJob?: BackupWorkerJob;
  lastJob?: BackupWorkerJob;
  lastScheduledSlots?: Partial<Record<BackupKind, string>>;
}

interface BackupWorkerJob {
  id: string;
  type: 'backup';
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  finishedAt?: string;
  kind: BackupKind;
  backupId: string;
  error?: string;
}

export interface BackupRecord {
  id: string;
  kind: BackupKind;
  fileName: string;
  createdAt: string;
  sizeBytes: number;
  checksumSha256?: string;
  format: 'postgres_custom_dump';
}

const DATABASE_BACKUP_METADATA_TABLE = 'server_db_backup_metadata';
const BACKUP_SCOPE_LABEL = 'server_persistence';
const DEFAULT_IDLE_MS = 10_000;
const DEFAULT_HEARTBEAT_MAX_AGE_MS = 60_000;
const DEFAULT_HOURLY_RETENTION = 24;
const DEFAULT_DAILY_RETENTION = 7;
const DEFAULT_DAILY_HOUR = 4;
const DEFAULT_DAILY_MINUTE = 0;

export async function runDatabaseBackupWorkerOnce(input?: { kind?: BackupKind; force?: boolean }): Promise<BackupRecord | null> {
  const databaseUrl = resolveServerDatabaseUrl();
  if (!databaseUrl.trim()) {
    throw new Error('SERVER_DATABASE_URL/DATABASE_URL 未配置，backup worker 无法生成数据库备份');
  }

  const backupDirectory = resolveBackupDirectory();
  const workerRootDirectory = resolveWorkerRootDirectory(backupDirectory);
  const statePath = join(workerRootDirectory, '_meta', 'worker-state.json');
  const heartbeatPath = join(workerRootDirectory, '_meta', 'worker-heartbeat.json');
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await ensureWorkerWorkspace(backupDirectory, workerRootDirectory);
    await waitForDatabase(pool);
    await ensureBackupMetadataTable(pool);
    await recoverInterruptedJob(statePath);
    await writeHeartbeat(heartbeatPath);
    const now = Date.now();
    const state = await readWorkerState(statePath);
    const forcedKind = input?.kind;
    if (input?.force === true && forcedKind) {
      const record = await runBackupJob({ kind: forcedKind, databaseUrl, backupDirectory, statePath, pool });
      await writeHeartbeat(heartbeatPath);
      return record;
    }
    if (shouldRunDailyBackup(state, now)) {
      await markScheduledSlot(statePath, state, 'daily', now);
      const record = await runBackupJob({ kind: 'daily', databaseUrl, backupDirectory, statePath, pool });
      await writeHeartbeat(heartbeatPath);
      return record;
    }
    if (shouldRunHourlyBackup(state, now)) {
      await markScheduledSlot(statePath, state, 'hourly', now);
      const record = await runBackupJob({ kind: 'hourly', databaseUrl, backupDirectory, statePath, pool });
      await writeHeartbeat(heartbeatPath);
      return record;
    }
    await writeHeartbeat(heartbeatPath);
    return null;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.once) {
    const record = await runDatabaseBackupWorkerOnce({ kind: args.kind ?? 'hourly', force: true });
    console.log(JSON.stringify({
      ok: true,
      once: true,
      backupId: record?.id ?? null,
      kind: record?.kind ?? args.kind ?? 'hourly',
      fileName: record?.fileName ?? null,
      sizeBytes: record?.sizeBytes ?? 0,
    }, null, 2));
    return;
  }

  for (;;) {
    try {
      await runDatabaseBackupWorkerOnce();
    } catch (error) {
      console.error('[database-backup-worker] 任务循环失败', error instanceof Error ? error.stack : String(error));
    }
    await sleep(args.idleMs);
  }
}

async function runBackupJob(input: {
  kind: BackupKind;
  databaseUrl: string;
  backupDirectory: string;
  statePath: string;
  pool: Pool;
}): Promise<BackupRecord> {
  const now = new Date();
  const backupId = buildBackupId(input.kind, now);
  const job: BackupWorkerJob = {
    id: `backup:${backupId}`,
    type: 'backup',
    status: 'running',
    startedAt: now.toISOString(),
    kind: input.kind,
    backupId,
  };
  await updateWorkerState(input.statePath, (state) => ({ ...state, runningJob: job }));

  try {
    const fileName = buildPostgresDumpFileName(backupId);
    const filePath = join(input.backupDirectory, fileName);
    const artifact = await createPostgresCustomDump(filePath, input.databaseUrl);
    const record: BackupRecord = {
      id: backupId,
      kind: input.kind,
      fileName,
      createdAt: job.startedAt,
      sizeBytes: artifact.sizeBytes,
      checksumSha256: artifact.checksumSha256,
      format: 'postgres_custom_dump',
    };
    await persistBackupMetadata(input.pool, record);
    await pruneBackups(input.pool, input.backupDirectory, input.kind, resolveRetention(input.kind));
    await updateWorkerState(input.statePath, (state) => ({
      ...state,
      runningJob: undefined,
      lastJob: { ...job, status: 'completed', finishedAt: new Date().toISOString() },
    }));
    return record;
  } catch (error) {
    await updateWorkerState(input.statePath, (state) => ({
      ...state,
      runningJob: undefined,
      lastJob: {
        ...job,
        status: 'failed',
        finishedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      },
    }));
    throw error;
  }
}

async function pruneBackups(pool: Pool, backupDirectory: string, kind: BackupKind, keep: number): Promise<void> {
  if (keep <= 0) {
    return;
  }
  const records = await loadBackupMetadata(pool, kind);
  const stale = records.slice(keep);
  for (const record of stale) {
    await fsPromises.rm(join(backupDirectory, record.fileName), { force: true }).catch(() => undefined);
    await pool.query(`DELETE FROM ${DATABASE_BACKUP_METADATA_TABLE} WHERE backup_id = $1`, [record.id]);
  }
}

async function loadBackupMetadata(pool: Pool, kind: BackupKind): Promise<BackupRecord[]> {
  const result = await pool.query(`
    SELECT backup_id, raw_payload
    FROM ${DATABASE_BACKUP_METADATA_TABLE}
    WHERE kind = $1
    ORDER BY created_at_text DESC, backup_id DESC
  `, [kind]);
  return result.rows
    .map((row) => normalizeBackupRecord(row?.backup_id, row?.raw_payload))
    .filter((record): record is BackupRecord => record !== null);
}

function normalizeBackupRecord(id: unknown, payload: unknown): BackupRecord | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const normalizedId = typeof record.id === 'string' && record.id.trim()
    ? record.id.trim()
    : typeof id === 'string'
      ? id.trim()
      : '';
  const kind = record.kind === 'hourly' || record.kind === 'daily' ? record.kind : null;
  const fileName = typeof record.fileName === 'string' ? record.fileName.trim() : '';
  const createdAt = typeof record.createdAt === 'string' ? record.createdAt.trim() : '';
  if (!normalizedId || !kind || !fileName || !createdAt) {
    return null;
  }
  return {
    id: normalizedId,
    kind,
    fileName,
    createdAt,
    sizeBytes: normalizeInteger(record.sizeBytes, 0),
    checksumSha256: typeof record.checksumSha256 === 'string' ? record.checksumSha256 : undefined,
    format: 'postgres_custom_dump',
  };
}

async function persistBackupMetadata(pool: Pool, record: BackupRecord): Promise<void> {
  await pool.query(`
    INSERT INTO ${DATABASE_BACKUP_METADATA_TABLE}(
      backup_id,
      kind,
      file_name,
      created_at_text,
      size_bytes,
      scope_label,
      checksum_sha256,
      format,
      raw_payload,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now())
    ON CONFLICT (backup_id)
    DO UPDATE SET
      kind = EXCLUDED.kind,
      file_name = EXCLUDED.file_name,
      created_at_text = EXCLUDED.created_at_text,
      size_bytes = EXCLUDED.size_bytes,
      scope_label = EXCLUDED.scope_label,
      checksum_sha256 = EXCLUDED.checksum_sha256,
      format = EXCLUDED.format,
      raw_payload = EXCLUDED.raw_payload,
      updated_at = now()
  `, [
    record.id,
    record.kind,
    record.fileName,
    record.createdAt,
    record.sizeBytes,
    BACKUP_SCOPE_LABEL,
    record.checksumSha256 ?? null,
    record.format,
    JSON.stringify({
      id: record.id,
      kind: record.kind,
      fileName: record.fileName,
      createdAt: record.createdAt,
      sizeBytes: record.sizeBytes,
      scope: BACKUP_SCOPE_LABEL,
      checksumSha256: record.checksumSha256,
      format: record.format,
    }),
  ]);
}

async function ensureBackupMetadataTable(pool: Pool): Promise<void> {
  await pool.query(`
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
  await pool.query(`
    CREATE INDEX IF NOT EXISTS server_db_backup_metadata_created_idx
    ON ${DATABASE_BACKUP_METADATA_TABLE}(created_at_text DESC, backup_id DESC)
  `);
}

async function recoverInterruptedJob(statePath: string): Promise<void> {
  const state = await readWorkerState(statePath);
  if (state.runningJob?.status !== 'running') {
    return;
  }
  await writeWorkerState(statePath, {
    ...state,
    runningJob: undefined,
    lastJob: {
      ...state.runningJob,
      status: 'failed',
      finishedAt: new Date().toISOString(),
      error: 'backup worker 重启，上一任务已中断',
    },
  });
}

async function markScheduledSlot(statePath: string, state: BackupWorkerState, kind: BackupKind, now: number): Promise<void> {
  await writeWorkerState(statePath, {
    ...state,
    lastScheduledSlots: {
      ...state.lastScheduledSlots,
      [kind]: getBackupScheduleSlotId(kind, now),
    },
  });
}

function shouldRunDailyBackup(state: BackupWorkerState, now: number): boolean {
  const date = new Date(now);
  const reachedWindow = date.getHours() > DEFAULT_DAILY_HOUR
    || (date.getHours() === DEFAULT_DAILY_HOUR && date.getMinutes() >= DEFAULT_DAILY_MINUTE);
  return reachedWindow && state.lastScheduledSlots?.daily !== getBackupScheduleSlotId('daily', now);
}

function shouldRunHourlyBackup(state: BackupWorkerState, now: number): boolean {
  return state.lastScheduledSlots?.hourly !== getBackupScheduleSlotId('hourly', now);
}

function getBackupScheduleSlotId(kind: BackupKind, timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  if (kind === 'daily') {
    return `${year}${month}${day}`;
  }
  return `${year}${month}${day}-${String(date.getHours()).padStart(2, '0')}`;
}

function buildBackupId(kind: BackupKind, date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hour}${minute}${second}-${kind}-${randomUUID().slice(0, 8)}`;
}

async function writeHeartbeat(heartbeatPath: string): Promise<void> {
  await writeJsonAtomic(heartbeatPath, {
    updatedAt: new Date().toISOString(),
    workerPid: process.pid,
    hostname: hostname(),
    maxAgeMs: DEFAULT_HEARTBEAT_MAX_AGE_MS,
  });
}

async function updateWorkerState(statePath: string, mutate: (state: BackupWorkerState) => BackupWorkerState): Promise<void> {
  await writeWorkerState(statePath, mutate(await readWorkerState(statePath)));
}

async function readWorkerState(statePath: string): Promise<BackupWorkerState> {
  const raw = await fsPromises.readFile(statePath, 'utf8').catch(() => '');
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as BackupWorkerState : {};
  } catch {
    return {};
  }
}

async function writeWorkerState(statePath: string, state: BackupWorkerState): Promise<void> {
  await writeJsonAtomic(statePath, state);
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await fsPromises.mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fsPromises.writeFile(tempPath, JSON.stringify(value, null, 2));
  await fsPromises.rename(tempPath, filePath);
}

async function ensureWorkerWorkspace(backupDirectory: string, workerRootDirectory: string): Promise<void> {
  await fsPromises.mkdir(backupDirectory, { recursive: true });
  await fsPromises.mkdir(join(workerRootDirectory, '_meta'), { recursive: true });
}

function resolveBackupDirectory(): string {
  const configured = process.env.SERVER_GM_DATABASE_BACKUP_DIR?.trim()
    || process.env.GM_DATABASE_BACKUP_DIR?.trim()
    || '';
  return configured ? resolve(configured) : resolve(__dirname, '../../../.runtime/gm-database-backups');
}

function resolveWorkerRootDirectory(backupDirectory: string): string {
  const configured = process.env.SERVER_DATABASE_BACKUP_WORKER_ROOT_DIR?.trim()
    || process.env.DATABASE_BACKUP_WORKER_ROOT_DIR?.trim()
    || '';
  return configured ? resolve(configured) : dirname(backupDirectory);
}

function resolveRetention(kind: BackupKind): number {
  const envName = kind === 'hourly'
    ? 'SERVER_DATABASE_BACKUP_HOURLY_RETENTION'
    : 'SERVER_DATABASE_BACKUP_DAILY_RETENTION';
  const fallback = kind === 'hourly' ? DEFAULT_HOURLY_RETENTION : DEFAULT_DAILY_RETENTION;
  return normalizeInteger(process.env[envName], fallback, 1, 3650);
}

function parseArgs(argv: string[]): { once: boolean; kind?: BackupKind; idleMs: number } {
  let once = false;
  let kind: BackupKind | undefined;
  let idleMs = normalizeInteger(process.env.SERVER_DATABASE_BACKUP_WORKER_IDLE_MS, DEFAULT_IDLE_MS, 1_000, 3_600_000);
  for (const arg of argv) {
    if (arg === '--once') {
      once = true;
      continue;
    }
    if (arg === '--kind=hourly' || arg === '--hourly') {
      kind = 'hourly';
      continue;
    }
    if (arg === '--kind=daily' || arg === '--daily') {
      kind = 'daily';
      continue;
    }
    if (arg.startsWith('--idle-ms=')) {
      idleMs = normalizeInteger(arg.slice('--idle-ms='.length), idleMs, 1_000, 3_600_000);
    }
  }
  return { once, kind, idleMs };
}

function normalizeInteger(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

const WAIT_FOR_DB_MAX_ATTEMPTS = 30;
const WAIT_FOR_DB_INTERVAL_MS = 2_000;

async function waitForDatabase(pool: Pool): Promise<void> {
  for (let attempt = 1; attempt <= WAIT_FOR_DB_MAX_ATTEMPTS; attempt++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[database-backup-worker] 等待数据库就绪 (${attempt}/${WAIT_FOR_DB_MAX_ATTEMPTS}): ${message}`);
      if (attempt >= WAIT_FOR_DB_MAX_ATTEMPTS) {
        throw new Error(`数据库在 ${WAIT_FOR_DB_MAX_ATTEMPTS} 次尝试后仍不可用: ${message}`);
      }
      await sleep(WAIT_FOR_DB_INTERVAL_MS);
    }
  }
}

if (require.main === module) {
  void main().catch((error) => {
    console.error('[database-backup-worker] 启动失败', error instanceof Error ? error.stack : String(error));
    process.exit(1);
  });
}
