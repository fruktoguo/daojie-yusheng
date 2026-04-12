/**
 * 用途：轮询备份与恢复请求并执行独立数据库备份 worker。
 */

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

/**
 * 记录loopintervalms。
 */
const LOOP_INTERVAL_MS = 10_000;
/**
 * 记录心跳intervalms。
 */
const HEARTBEAT_INTERVAL_MS = 10_000;
/**
 * 串联执行脚本主流程。
 */
async function main(): Promise<void> {
  ensureBackupWorkspace();
  recoverInterruptedJob();
  startHeartbeatLoop();

  for (;;) {
    try {
/**
 * 记录状态。
 */
      const state = readBackupWorkerState();
/**
 * 记录恢复request。
 */
      const restoreRequest = listBackupRestoreRequests()[0];
/**
 * 记录manualrequest。
 */
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

/**
 * 启动心跳loop。
 */
function startHeartbeatLoop(): void {
  writeHeartbeat();
/**
 * 记录timer。
 */
  const timer = setInterval(() => {
    try {
      writeHeartbeat();
    } catch (error) {
      console.error('[database-backup-worker] 写心跳失败', error);
    }
  }, HEARTBEAT_INTERVAL_MS);
  timer.unref();
}

/**
 * 处理recoverinterruptedjob。
 */
function recoverInterruptedJob(): void {
/**
 * 记录状态。
 */
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

/**
 * 写入心跳。
 */
function writeHeartbeat(): void {
  writeBackupWorkerHeartbeat({
    updatedAt: new Date().toISOString(),
    workerPid: process.pid,
    hostname: os.hostname(),
  });
}

/**
 * 判断是否应当rundaily备份。
 */
function shouldRunDailyBackup(state: BackupWorkerStateFile, now: number): boolean {
/**
 * 记录date。
 */
  const date = new Date(now);
/**
 * 记录reachedwindow。
 */
  const reachedWindow = date.getHours() > DAILY_BACKUP_HOUR
    || (date.getHours() === DAILY_BACKUP_HOUR && date.getMinutes() >= DAILY_BACKUP_MINUTE);
  if (!reachedWindow) {
    return false;
  }
  return state.lastScheduledSlots?.daily !== getBackupScheduleSlotId('daily', now);
}

/**
 * 判断是否应当runhourly备份。
 */
function shouldRunHourlyBackup(state: BackupWorkerStateFile, now: number): boolean {
  return state.lastScheduledSlots?.hourly !== getBackupScheduleSlotId('hourly', now);
}

/**
 * 运行scheduled备份。
 */
async function runScheduledBackup(kind: 'hourly' | 'daily', state: BackupWorkerStateFile, now: number): Promise<void> {
/**
 * 记录slotID。
 */
  const slotId = getBackupScheduleSlotId(kind, now);
  state.lastScheduledSlots = {
    ...state.lastScheduledSlots,
    [kind]: slotId,
  };
  writeBackupWorkerState(state);

/**
 * 记录planned。
 */
  const planned = planBackup(kind, now);
/**
 * 记录job。
 */
  const job = createJobSnapshot(kind, planned.id, now);
  await runBackupJob(job, planned);
}

/**
 * 处理进程manualrequest。
 */
async function processManualRequest(filePath: string, request: BackupManualRequestFile): Promise<void> {
/**
 * 记录备份ID。
 */
  const backupId = request.job.backupId ?? createTimestampId(Date.now(), 'manual');
/**
 * 记录planned。
 */
  const planned = createBackupRecord('manual', backupId, new Date(request.requestedAt).getTime() || Date.now());
/**
 * 记录job。
 */
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

/**
 * 处理进程恢复request。
 */
async function processRestoreRequest(filePath: string, request: BackupRestoreRequestFile): Promise<void> {
/**
 * 记录来源。
 */
  const source = findBackupById(request.sourceBackupId);
  if (!source) {
    await markRestoreRequestFailed(request.job, `目标恢复备份不存在：${request.sourceBackupId}`);
    await fs.promises.rm(filePath, { force: true });
    return;
  }

/**
 * 记录requestedat。
 */
  const requestedAt = new Date(request.requestedAt).getTime() || Date.now();
/**
 * 记录preimport备份。
 */
  const preImportBackup = planBackup('pre_import', requestedAt);
/**
 * 记录job。
 */
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

/**
 * 运行备份job。
 */
async function runBackupJob(
  job: GmDatabaseJobSnapshot,
  planned: ReturnType<typeof planBackup>,
): Promise<void> {
/**
 * 记录状态。
 */
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

/**
 * 运行恢复job。
 */
async function runRestoreJob(
  job: GmDatabaseJobSnapshot,
  sourceFilePath: string,
  preImportBackup: ReturnType<typeof planBackup>,
): Promise<void> {
/**
 * 记录状态。
 */
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

/**
 * 创建jobsnapshot。
 */
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

/**
 * 处理sleep。
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 处理mark恢复requestfailed。
 */
async function markRestoreRequestFailed(job: GmDatabaseJobSnapshot, error: string): Promise<void> {
/**
 * 记录状态。
 */
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

