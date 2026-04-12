import type {
  GmDatabaseBackupKind,
  GmDatabaseBackupRecord,
  GmDatabaseJobSnapshot,
} from '@mud/shared';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveServerDataPath } from '../common/data-path';

export const HOURLY_BACKUP_RETENTION = 72;
export const DAILY_BACKUP_RETENTION = 14;
export const DAILY_BACKUP_HOUR = 4;
export const DAILY_BACKUP_MINUTE = 5;
export const BACKUP_EXCLUDED_TABLES = ['redeem_codes', 'redeem_code_groups'] as const;
export const BACKUP_WORKER_HEARTBEAT_TTL_MS = 60_000;

/** ResolvedBackupRecord：定义该接口的能力与字段约束。 */
export interface ResolvedBackupRecord extends GmDatabaseBackupRecord {
  filePath: string;
}

/** BackupWorkerStateFile：定义该接口的能力与字段约束。 */
export interface BackupWorkerStateFile {
  runningJob?: GmDatabaseJobSnapshot;
  lastJob?: GmDatabaseJobSnapshot;
  lastScheduledSlots?: Partial<Record<'hourly' | 'daily', string>>;
}

/** BackupWorkerHeartbeatFile：定义该接口的能力与字段约束。 */
export interface BackupWorkerHeartbeatFile {
  updatedAt: string;
  workerPid: number;
  hostname: string;
}

/** BackupManualRequestFile：定义该接口的能力与字段约束。 */
export interface BackupManualRequestFile {
  job: GmDatabaseJobSnapshot;
  requestedAt: string;
}

/** BackupRestoreRequestFile：定义该接口的能力与字段约束。 */
export interface BackupRestoreRequestFile {
  job: GmDatabaseJobSnapshot;
  sourceBackupId: string;
  requestedAt: string;
}

export const BACKUP_ROOT_DIR = resolveServerDataPath('backups', 'database');
export const BACKUP_DIRECTORIES: Record<GmDatabaseBackupKind, string> = {
  hourly: path.join(BACKUP_ROOT_DIR, 'hourly'),
  daily: path.join(BACKUP_ROOT_DIR, 'daily'),
  manual: path.join(BACKUP_ROOT_DIR, 'manual'),
  pre_import: path.join(BACKUP_ROOT_DIR, 'pre_import'),
};
export const BACKUP_META_DIR = path.join(BACKUP_ROOT_DIR, '_meta');
export const BACKUP_REQUESTS_DIR = path.join(BACKUP_ROOT_DIR, '_requests');
export const BACKUP_MANUAL_REQUESTS_DIR = path.join(BACKUP_REQUESTS_DIR, 'manual');
export const BACKUP_RESTORE_REQUESTS_DIR = path.join(BACKUP_REQUESTS_DIR, 'restore');
export const BACKUP_WORKER_STATE_PATH = path.join(BACKUP_META_DIR, 'worker-state.json');
export const BACKUP_WORKER_HEARTBEAT_PATH = path.join(BACKUP_META_DIR, 'worker-heartbeat.json');

/** ensureBackupWorkspace：执行对应的业务逻辑。 */
export function ensureBackupWorkspace(): void {
  fs.mkdirSync(BACKUP_ROOT_DIR, { recursive: true });
  for (const directory of Object.values(BACKUP_DIRECTORIES)) {
    fs.mkdirSync(directory, { recursive: true });
  }
  fs.mkdirSync(BACKUP_META_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_MANUAL_REQUESTS_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_RESTORE_REQUESTS_DIR, { recursive: true });
}

/** planBackup：执行对应的业务逻辑。 */
export function planBackup(kind: GmDatabaseBackupKind, now = Date.now()): ResolvedBackupRecord {
  const id = createTimestampId(now, kind);
  return createBackupRecord(kind, id, now);
}

/** createBackupRecord：执行对应的业务逻辑。 */
export function createBackupRecord(kind: GmDatabaseBackupKind, id: string, timestamp = Date.now()): ResolvedBackupRecord {
  const fileName = `${id}.dump`;
  return {
    id,
    kind,
    fileName,
    createdAt: new Date(timestamp).toISOString(),
    sizeBytes: 0,
    filePath: path.join(BACKUP_DIRECTORIES[kind], fileName),
  };
}

/** listBackups：执行对应的业务逻辑。 */
export function listBackups(): GmDatabaseBackupRecord[] {
  ensureBackupWorkspace();
  return (Object.keys(BACKUP_DIRECTORIES) as GmDatabaseBackupKind[])
    .flatMap((kind) => listBackupsForKind(kind))
    .sort((left, right) => right.id.localeCompare(left.id, 'zh-CN'))
    .map(({ filePath: _filePath, ...record }) => record);
}

/** findBackupById：执行对应的业务逻辑。 */
export function findBackupById(backupId: string): ResolvedBackupRecord | null {
  return (Object.keys(BACKUP_DIRECTORIES) as GmDatabaseBackupKind[])
    .flatMap((kind) => listBackupsForKind(kind))
    .find((entry) => entry.id === backupId) ?? null;
}

/** listBackupsForKind：执行对应的业务逻辑。 */
export function listBackupsForKind(kind: GmDatabaseBackupKind): ResolvedBackupRecord[] {
  const directory = BACKUP_DIRECTORIES[kind];
  if (!fs.existsSync(directory)) {
    return [];
  }
  return fs.readdirSync(directory)
    .filter((fileName) => fileName.endsWith('.dump'))
    .map((fileName) => {
      const filePath = path.join(directory, fileName);
      const stats = fs.statSync(filePath);
      const id = fileName.replace(/\.dump$/u, '');
      const parsedCreatedAt = parseBackupIdTimestamp(id);
      return {
        id,
        kind,
        fileName,
        createdAt: parsedCreatedAt
          ?? (stats.birthtimeMs > 0 ? new Date(stats.birthtimeMs).toISOString() : new Date(stats.mtimeMs).toISOString()),
        sizeBytes: stats.size,
        filePath,
      } satisfies ResolvedBackupRecord;
    })
    .sort((left, right) => right.id.localeCompare(left.id, 'zh-CN'));
}

/** readBackupWorkerState：执行对应的业务逻辑。 */
export function readBackupWorkerState(): BackupWorkerStateFile {
  ensureBackupWorkspace();
  return readJsonFile<BackupWorkerStateFile>(BACKUP_WORKER_STATE_PATH) ?? {};
}

/** writeBackupWorkerState：执行对应的业务逻辑。 */
export function writeBackupWorkerState(state: BackupWorkerStateFile): void {
  ensureBackupWorkspace();
  writeJsonFileAtomic(BACKUP_WORKER_STATE_PATH, state);
}

/** readBackupWorkerHeartbeat：执行对应的业务逻辑。 */
export function readBackupWorkerHeartbeat(): BackupWorkerHeartbeatFile | null {
  ensureBackupWorkspace();
  return readJsonFile<BackupWorkerHeartbeatFile>(BACKUP_WORKER_HEARTBEAT_PATH);
}

/** writeBackupWorkerHeartbeat：执行对应的业务逻辑。 */
export function writeBackupWorkerHeartbeat(heartbeat: BackupWorkerHeartbeatFile): void {
  ensureBackupWorkspace();
  writeJsonFileAtomic(BACKUP_WORKER_HEARTBEAT_PATH, heartbeat);
}

/** writeBackupManualRequest：执行对应的业务逻辑。 */
export function writeBackupManualRequest(request: BackupManualRequestFile): string {
  ensureBackupWorkspace();
  const requestPath = path.join(BACKUP_MANUAL_REQUESTS_DIR, `${request.job.id}.json`);
  writeJsonFileAtomic(requestPath, request);
  return requestPath;
}

/** listBackupManualRequests：执行对应的业务逻辑。 */
export function listBackupManualRequests(): Array<{ filePath: string; request: BackupManualRequestFile }> {
  ensureBackupWorkspace();
  return listJsonRequests<BackupManualRequestFile>(BACKUP_MANUAL_REQUESTS_DIR);
}

/** writeBackupRestoreRequest：执行对应的业务逻辑。 */
export function writeBackupRestoreRequest(request: BackupRestoreRequestFile): string {
  ensureBackupWorkspace();
  const requestPath = path.join(BACKUP_RESTORE_REQUESTS_DIR, `${request.job.id}.json`);
  writeJsonFileAtomic(requestPath, request);
  return requestPath;
}

/** listBackupRestoreRequests：执行对应的业务逻辑。 */
export function listBackupRestoreRequests(): Array<{ filePath: string; request: BackupRestoreRequestFile }> {
  ensureBackupWorkspace();
  return listJsonRequests<BackupRestoreRequestFile>(BACKUP_RESTORE_REQUESTS_DIR);
}

/** parseBackupIdTimestamp：执行对应的业务逻辑。 */
export function parseBackupIdTimestamp(backupId: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(\d{3})__/.exec(backupId);
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute, second, millisecond] = match;
  const timestamp = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(millisecond),
  );
  if (!Number.isFinite(timestamp.getTime())) {
    return null;
  }
  return timestamp.toISOString();
}

/** createTimestampId：执行对应的业务逻辑。 */
export function createTimestampId(timestamp: number, suffix: string): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  const millisecond = String(date.getMilliseconds()).padStart(3, '0');
  return `${year}${month}${day}-${hour}${minute}${second}-${millisecond}__${suffix}`;
}

/** getBackupScheduleSlotId：执行对应的业务逻辑。 */
export function getBackupScheduleSlotId(kind: 'hourly' | 'daily', timestamp = Date.now()): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  if (kind === 'daily') {
    return `${year}${month}${day}`;
  }
  const hour = String(date.getHours()).padStart(2, '0');
  return `${year}${month}${day}-${hour}`;
}

/** writeJsonFileAtomic：执行对应的业务逻辑。 */
export function writeJsonFileAtomic(filePath: string, data: unknown): void {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(data, null, 2));
  fs.renameSync(temporaryPath, filePath);
}

/** readJsonFile：执行对应的业务逻辑。 */
function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** listJsonRequests：执行对应的业务逻辑。 */
function listJsonRequests<T>(directory: string): Array<{ filePath: string; request: T }> {
  if (!fs.existsSync(directory)) {
    return [];
  }
  return fs.readdirSync(directory)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right, 'zh-CN'))
    .map((fileName) => {
      const filePath = path.join(directory, fileName);
      return {
        filePath,
        request: readJsonFile<T>(filePath),
      };
    })
    .filter((entry): entry is { filePath: string; request: T } => entry.request !== null);
}

