import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Readable, Writable } from 'node:stream';
import {
  BACKUP_EXCLUDED_TABLES,
  type ResolvedBackupRecord,
  DAILY_BACKUP_RETENTION,
  ensureBackupWorkspace,
  HOURLY_BACKUP_RETENTION,
  listBackupsForKind,
} from './database-backup-shared';

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

const PROCESS_TIMEOUT_MS = resolveProcessTimeoutMs();
const PROCESS_FORCE_KILL_GRACE_MS = 5_000;

export async function createBackupFile(record: ResolvedBackupRecord): Promise<void> {
  ensureBackupWorkspace();
  await fs.promises.mkdir(path.dirname(record.filePath), { recursive: true });
  await runDumpProcess(record.filePath);
  if (record.kind === 'hourly') {
    await pruneBackups(record.kind, HOURLY_BACKUP_RETENTION);
  } else if (record.kind === 'daily') {
    await pruneBackups(record.kind, DAILY_BACKUP_RETENTION);
  }
}

export async function restoreBackupFile(filePath: string): Promise<void> {
  if (!fs.existsSync(filePath)) {
    throw new Error('目标备份文件不存在');
  }
  await runRestoreProcess(filePath);
}

async function pruneBackups(kind: 'hourly' | 'daily', keep: number): Promise<void> {
  const backups = listBackupsForKind(kind);
  const stale = backups.slice(keep);
  await Promise.all(stale.map(async (backup) => {
    await fs.promises.rm(backup.filePath, { force: true });
  }));
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
    const timeout = createProcessTimeout(child, 'pg_dump', (message) => {
      stderr = stderr ? `${stderr}\n${message}` : message;
    });

    const fail = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      timeout.clear();
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
      timeout.clear();
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
    const timeout = createProcessTimeout(child, 'pg_restore', (message) => {
      stderr = stderr ? `${stderr}\n${message}` : message;
    });

    const fail = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      timeout.clear();
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
      timeout.clear();
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
    throw new Error('当前环境未找到可用的 pg_dump，请检查镜像是否已安装 postgresql-client');
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
    throw new Error('当前环境未找到可用的 pg_restore，请检查镜像是否已安装 postgresql-client');
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

function createProcessTimeout(
  child: ReturnType<typeof spawn>,
  label: 'pg_dump' | 'pg_restore',
  appendError: (message: string) => void,
): { clear: () => void } {
  let forceKillTimer: ReturnType<typeof setTimeout> | null = null;
  const timeoutId = setTimeout(() => {
    const message = `${label} 执行超过 ${formatDurationLabel(PROCESS_TIMEOUT_MS)}，已判定为卡死并尝试终止`;
    appendError(message);
    child.kill('SIGTERM');
    forceKillTimer = setTimeout(() => {
      child.kill('SIGKILL');
    }, PROCESS_FORCE_KILL_GRACE_MS);
  }, PROCESS_TIMEOUT_MS);

  return {
    clear: () => {
      clearTimeout(timeoutId);
      if (forceKillTimer !== null) {
        clearTimeout(forceKillTimer);
        forceKillTimer = null;
      }
    },
  };
}

function resolveProcessTimeoutMs(): number {
  const raw = Number(process.env.DB_BACKUP_PROCESS_TIMEOUT_MS ?? 15 * 60_000);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 15 * 60_000;
  }
  return Math.max(60_000, Math.floor(raw));
}

function formatDurationLabel(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds} 秒`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) {
    return seconds > 0 ? `${totalMinutes} 分 ${seconds} 秒` : `${totalMinutes} 分`;
  }
  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${totalHours} 小时 ${minutes} 分` : `${totalHours} 小时`;
}
