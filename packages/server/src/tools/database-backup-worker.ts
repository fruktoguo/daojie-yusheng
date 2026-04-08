import type { GmDatabaseBackupKind, GmDatabaseJobSnapshot } from '@mud/shared';
import * as fs from 'node:fs';
import * as os from 'node:os';
import {
  type BackupManualRequestFile,
  type BackupRestoreRequestFile,
  type BackupWorkerStateFile,
  createBackupRecord,
  createTimestampId,
  DAILY_BACKUP_HOUR,
  DAILY_BACKUP_MINUTE,
  ensureBackupWorkspace,
  findBackupById,
  getBackupScheduleSlotId,
  listBackupManualRequests,
  listBackupRestoreRequests,
  planBackup,
  readBackupWorkerState,
  writeBackupWorkerHeartbeat,
  writeBackupWorkerState,
} from '../game/database-backup-shared';
import { createBackupFile, restoreBackupFile } from '../game/database-backup-process';

const LOOP_INTERVAL_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 10_000;
async function main(): Promise<void> {
  ensureBackupWorkspace();
  recoverInterruptedJob();
  startHeartbeatLoop();

  for (;;) {
    try {
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

function startHeartbeatLoop(): void {
  writeHeartbeat();
  const timer = setInterval(() => {
    try {
      writeHeartbeat();
    } catch (error) {
      console.error('[database-backup-worker] 写心跳失败', error);
    }
  }, HEARTBEAT_INTERVAL_MS);
  timer.unref();
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
    await createBackupFile(planned);
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
    await createBackupFile(preImportBackup);
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
