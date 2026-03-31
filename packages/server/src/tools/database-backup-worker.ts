import type { GmDatabaseBackupKind, GmDatabaseJobSnapshot } from '@mud/shared';
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Readable, Writable } from 'node:stream';
import {
  BACKUP_EXCLUDED_TABLES,
  type BackupManualRequestFile,
  type BackupRestoreRequestFile,
  type BackupWorkerStateFile,
  createBackupRecord,
  createTimestampId,
  DAILY_BACKUP_HOUR,
  DAILY_BACKUP_MINUTE,
  DAILY_BACKUP_RETENTION,
  ensureBackupWorkspace,
  findBackupById,
  getBackupScheduleSlotId,
  HOURLY_BACKUP_RETENTION,
  listBackupManualRequests,
  listBackupRestoreRequests,
  listBackupsForKind,
  planBackup,
  readBackupWorkerState,
  writeBackupWorkerHeartbeat,
  writeBackupWorkerState,
} from '../game/database-backup-shared';

interface DatabaseConnectionConfig {
  host?: string;
  port?: number;
  username: string;
  password?: string;
  database: string;
}

interface ProcessSpec {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

const LOOP_INTERVAL_MS = 10_000;

async function main(): Promise<void> {
  ensureBackupWorkspace();
  recoverInterruptedJob();

  for (;;) {
    try {
      writeHeartbeat();
      const state = readBackupWorkerState();
      const restoreRequest = listBackupRestoreRequests()[0];
      const manualRequest = listBackupManualRequests()[0];
      if (restoreRequest) {
        await processRestoreRequest(restoreRequest.filePath, restoreRequest.request);
      } else if (manualRequest) {
        await processManualRequest(manualRequest.filePath, manualRequest.request);
      } else if (shouldRunDailyBackup(state, Date.now())) {
        await runScheduledBackup('daily', state, Date.now());
      } else if (shouldRunHourlyBackup(state, Date.now())) {
        await runScheduledBackup('hourly', state, Date.now());
      }
    } catch (error) {
      console.error('[database-backup-worker] 任务循环失败', error);
    }
    await sleep(LOOP_INTERVAL_MS);
  }
}

function recoverInterruptedJob(): void {
  const state = readBackupWorkerState();
  if (state.runningJob?.status !== 'running') {
    return;
  }
  state.lastJob = {
    ...state.runningJob,
    status: 'failed',
    finishedAt: new Date().toISOString(),
    error: '独立数据库 worker 重启，上一任务已中断',
  };
  delete state.runningJob;
  writeBackupWorkerState(state);
}

function writeHeartbeat(): void {
  writeBackupWorkerHeartbeat({
    updatedAt: new Date().toISOString(),
    workerPid: process.pid,
    hostname: os.hostname(),
  });
}

function shouldRunDailyBackup(state: BackupWorkerStateFile, now: number): boolean {
  const date = new Date(now);
  const reachedWindow = date.getHours() > DAILY_BACKUP_HOUR
    || (date.getHours() === DAILY_BACKUP_HOUR && date.getMinutes() >= DAILY_BACKUP_MINUTE);
  if (!reachedWindow) {
    return false;
  }
  return state.lastScheduledSlots?.daily !== getBackupScheduleSlotId('daily', now);
}

function shouldRunHourlyBackup(state: BackupWorkerStateFile, now: number): boolean {
  return state.lastScheduledSlots?.hourly !== getBackupScheduleSlotId('hourly', now);
}

async function runScheduledBackup(kind: 'hourly' | 'daily', state: BackupWorkerStateFile, now: number): Promise<void> {
  const slotId = getBackupScheduleSlotId(kind, now);
  state.lastScheduledSlots = {
    ...state.lastScheduledSlots,
    [kind]: slotId,
  };
  writeBackupWorkerState(state);

  const planned = planBackup(kind, now);
  const job = createJobSnapshot(kind, planned.id, now);
  await runBackupJob(job, planned);
}

async function processManualRequest(filePath: string, request: BackupManualRequestFile): Promise<void> {
  const backupId = request.job.backupId ?? createTimestampId(Date.now(), 'manual');
  const planned = createBackupRecord('manual', backupId, new Date(request.requestedAt).getTime() || Date.now());
  const job = {
    ...request.job,
    backupId,
  } satisfies GmDatabaseJobSnapshot;

  try {
    await runBackupJob(job, planned);
  } finally {
    await fs.promises.rm(filePath, { force: true });
  }
}

async function processRestoreRequest(filePath: string, request: BackupRestoreRequestFile): Promise<void> {
  const source = findBackupById(request.sourceBackupId);
  if (!source) {
    await markRestoreRequestFailed(request.job, `目标恢复备份不存在：${request.sourceBackupId}`);
    await fs.promises.rm(filePath, { force: true });
    return;
  }

  const requestedAt = new Date(request.requestedAt).getTime() || Date.now();
  const preImportBackup = planBackup('pre_import', requestedAt);
  const job = {
    ...request.job,
    backupId: preImportBackup.id,
    sourceBackupId: request.sourceBackupId,
  } satisfies GmDatabaseJobSnapshot;

  try {
    await runRestoreJob(job, source.filePath, preImportBackup);
  } finally {
    await fs.promises.rm(filePath, { force: true });
  }
}

async function runBackupJob(
  job: GmDatabaseJobSnapshot,
  planned: ReturnType<typeof planBackup>,
): Promise<void> {
  const state = readBackupWorkerState();
  state.runningJob = job;
  writeBackupWorkerState(state);

  try {
    await createBackupFile(planned.kind, planned.filePath);
    state.lastJob = {
      ...job,
      status: 'completed',
      finishedAt: new Date().toISOString(),
    };
  } catch (error) {
    state.lastJob = {
      ...job,
      status: 'failed',
      finishedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    delete state.runningJob;
    writeBackupWorkerState(state);
  }
}

async function runRestoreJob(
  job: GmDatabaseJobSnapshot,
  sourceFilePath: string,
  preImportBackup: ReturnType<typeof planBackup>,
): Promise<void> {
  const state = readBackupWorkerState();
  state.runningJob = job;
  writeBackupWorkerState(state);

  try {
    await createBackupFile(preImportBackup.kind, preImportBackup.filePath);
    await restoreBackupFile(sourceFilePath);
    state.lastJob = {
      ...job,
      status: 'completed',
      finishedAt: new Date().toISOString(),
    };
  } catch (error) {
    state.lastJob = {
      ...job,
      status: 'failed',
      finishedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    delete state.runningJob;
    writeBackupWorkerState(state);
  }
}

function createJobSnapshot(kind: GmDatabaseBackupKind, backupId: string, now: number): GmDatabaseJobSnapshot {
  return {
    id: createTimestampId(now, 'backup'),
    type: 'backup',
    status: 'running',
    startedAt: new Date(now).toISOString(),
    kind,
    backupId,
  };
}

async function createBackupFile(kind: GmDatabaseBackupKind, filePath: string): Promise<void> {
  ensureBackupWorkspace();
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await runDumpProcess(filePath);
  if (kind === 'hourly') {
    await pruneBackups(kind, HOURLY_BACKUP_RETENTION);
  } else if (kind === 'daily') {
    await pruneBackups(kind, DAILY_BACKUP_RETENTION);
  }
}

async function pruneBackups(kind: 'hourly' | 'daily', keep: number): Promise<void> {
  const backups = listBackupsForKind(kind);
  const stale = backups.slice(keep);
  await Promise.all(stale.map(async (backup) => {
    await fs.promises.rm(backup.filePath, { force: true });
  }));
}

async function restoreBackupFile(filePath: string): Promise<void> {
  if (!fs.existsSync(filePath)) {
    throw new Error('目标备份文件不存在');
  }
  await runRestoreProcess(filePath);
}

async function runDumpProcess(filePath: string): Promise<void> {
  const spec = resolveDumpProcessSpec();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(spec.command, spec.args, {
      env: spec.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = child.stdout as Readable;
    const stderrStream = child.stderr as Readable;
    const output = fs.createWriteStream(filePath);
    let stderr = '';
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      output.destroy();
      void fs.promises.rm(filePath, { force: true }).catch(() => {});
      reject(error);
    };

    stdout.on('data', (chunk) => {
      output.write(chunk);
    });
    stdout.on('end', () => {
      output.end();
    });
    stderrStream.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      fail(error);
    });
    output.on('error', (error) => {
      fail(error);
    });
    child.on('close', (code) => {
      output.end();
      if (settled) {
        return;
      }
      if (code === 0) {
        settled = true;
        resolve();
        return;
      }
      fail(new Error(stderr.trim() || `pg_dump 退出码 ${code ?? 'unknown'}`));
    });
  });
}

async function runRestoreProcess(filePath: string): Promise<void> {
  const spec = resolveRestoreProcessSpec();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(spec.command, spec.args, {
      env: spec.env,
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    const stdin = child.stdin as Writable;
    const stderrStream = child.stderr as Readable;
    const input = fs.createReadStream(filePath);
    let stderr = '';
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      input.destroy();
      stdin.destroy();
      reject(error);
    };

    stderrStream.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      fail(error);
    });
    input.on('error', (error) => {
      fail(error);
    });
    stdin.on('error', (error) => {
      fail(error);
    });
    input.on('data', (chunk) => {
      stdin.write(chunk);
    });
    input.on('end', () => {
      stdin.end();
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }
      if (code === 0) {
        settled = true;
        resolve();
        return;
      }
      fail(new Error(stderr.trim() || `pg_restore 退出码 ${code ?? 'unknown'}`));
    });
  });
}

function resolveDumpProcessSpec(): ProcessSpec {
  const connection = getDatabaseConnectionConfig();
  const dumpArgs = [
    'pg_dump',
    '--format=custom',
    '--compress=0',
    '--no-owner',
    '--no-privileges',
    ...BACKUP_EXCLUDED_TABLES.flatMap((tableName) => ['--exclude-table', tableName]),
    '--username',
    connection.username,
    '--dbname',
    connection.database,
  ];
  if (!commandExists('pg_dump')) {
    throw new Error('当前环境未找到可用的 pg_dump，请检查独立备份 worker 镜像是否已安装 postgresql-client');
  }
  if (connection.host) {
    dumpArgs.push('--host', connection.host);
  }
  if (connection.port) {
    dumpArgs.push('--port', String(connection.port));
  }
  return wrapWithNice(dumpArgs[0]!, dumpArgs.slice(1), connection.password);
}

function resolveRestoreProcessSpec(): ProcessSpec {
  const connection = getDatabaseConnectionConfig();
  const restoreArgs = [
    'pg_restore',
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '--single-transaction',
    '--exit-on-error',
    '--username',
    connection.username,
    '--dbname',
    connection.database,
  ];
  if (!commandExists('pg_restore')) {
    throw new Error('当前环境未找到可用的 pg_restore，请检查独立备份 worker 镜像是否已安装 postgresql-client');
  }
  if (connection.host) {
    restoreArgs.push('--host', connection.host);
  }
  if (connection.port) {
    restoreArgs.push('--port', String(connection.port));
  }
  return wrapWithNice(restoreArgs[0]!, restoreArgs.slice(1), connection.password);
}

function getDatabaseConnectionConfig(): DatabaseConnectionConfig {
  const url = process.env.DATABASE_URL;
  if (url) {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || undefined,
      port: parsed.port ? Number(parsed.port) : 5432,
      username: decodeURIComponent(parsed.username || 'postgres'),
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      database: decodeURIComponent(parsed.pathname.replace(/^\/+/u, '') || 'postgres'),
    };
  }
  return {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_DATABASE ?? 'daojie_yusheng',
  };
}

function wrapWithNice(command: string, args: string[], password?: string): ProcessSpec {
  const env = {
    ...process.env,
    ...(password ? { PGPASSWORD: password } : {}),
  };
  if (!commandExists('nice')) {
    return { command, args, env };
  }
  return {
    command: 'nice',
    args: ['-n', '19', command, ...args],
    env,
  };
}

function commandExists(command: string): boolean {
  const result = spawnSync('sh', ['-lc', `command -v ${command}`], {
    stdio: 'ignore',
  });
  return result.status === 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function markRestoreRequestFailed(job: GmDatabaseJobSnapshot, error: string): Promise<void> {
  const state = readBackupWorkerState();
  state.lastJob = {
    ...job,
    status: 'failed',
    finishedAt: new Date().toISOString(),
    error,
  };
  delete state.runningJob;
  writeBackupWorkerState(state);
}

void main().catch((error) => {
  console.error('[database-backup-worker] 启动失败', error);
  process.exitCode = 1;
});
