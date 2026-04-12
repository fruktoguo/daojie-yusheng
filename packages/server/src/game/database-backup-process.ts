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

/** DatabaseConnectionConfig：定义该接口的能力与字段约束。 */
interface DatabaseConnectionConfig {
  host?: string;
  port?: number;
/** username：定义该变量以承载业务值。 */
  username: string;
  password?: string;
/** database：定义该变量以承载业务值。 */
  database: string;
}

/** ProcessSpec：定义该接口的能力与字段约束。 */
interface ProcessSpec {
/** command：定义该变量以承载业务值。 */
  command: string;
/** args：定义该变量以承载业务值。 */
  args: string[];
/** env：定义该变量以承载业务值。 */
  env: NodeJS.ProcessEnv;
}

/** PROCESS_TIMEOUT_MS：定义该变量以承载业务值。 */
const PROCESS_TIMEOUT_MS = resolveProcessTimeoutMs();
/** PROCESS_FORCE_KILL_GRACE_MS：定义该变量以承载业务值。 */
const PROCESS_FORCE_KILL_GRACE_MS = 5_000;

/** createBackupFile：执行对应的业务逻辑。 */
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

/** restoreBackupFile：执行对应的业务逻辑。 */
export async function restoreBackupFile(filePath: string): Promise<void> {
  if (!fs.existsSync(filePath)) {
    throw new Error('目标备份文件不存在');
  }
  await runRestoreProcess(filePath);
}

/** pruneBackups：执行对应的业务逻辑。 */
async function pruneBackups(kind: 'hourly' | 'daily', keep: number): Promise<void> {
/** backups：定义该变量以承载业务值。 */
  const backups = listBackupsForKind(kind);
/** stale：定义该变量以承载业务值。 */
  const stale = backups.slice(keep);
  await Promise.all(stale.map(async (backup) => {
    await fs.promises.rm(backup.filePath, { force: true });
  }));
}

/** runDumpProcess：执行对应的业务逻辑。 */
async function runDumpProcess(filePath: string): Promise<void> {
/** spec：定义该变量以承载业务值。 */
  const spec = resolveDumpProcessSpec();
  await new Promise<void>((resolve, reject) => {
/** child：定义该变量以承载业务值。 */
    const child = spawn(spec.command, spec.args, {
      env: spec.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
/** stdout：定义该变量以承载业务值。 */
    const stdout = child.stdout as Readable;
/** stderrStream：定义该变量以承载业务值。 */
    const stderrStream = child.stderr as Readable;
/** output：定义该变量以承载业务值。 */
    const output = fs.createWriteStream(filePath);
/** stderr：定义该变量以承载业务值。 */
    let stderr = '';
/** settled：定义该变量以承载业务值。 */
    let settled = false;
/** timeout：定义该变量以承载业务值。 */
    const timeout = createProcessTimeout(child, 'pg_dump', (message) => {
      stderr = stderr ? `${stderr}\n${message}` : message;
    });

/** fail：定义该变量以承载业务值。 */
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

/** runRestoreProcess：执行对应的业务逻辑。 */
async function runRestoreProcess(filePath: string): Promise<void> {
/** spec：定义该变量以承载业务值。 */
  const spec = resolveRestoreProcessSpec();
  await new Promise<void>((resolve, reject) => {
/** child：定义该变量以承载业务值。 */
    const child = spawn(spec.command, spec.args, {
      env: spec.env,
      stdio: ['pipe', 'ignore', 'pipe'],
    });
/** stdin：定义该变量以承载业务值。 */
    const stdin = child.stdin as Writable;
/** stderrStream：定义该变量以承载业务值。 */
    const stderrStream = child.stderr as Readable;
/** input：定义该变量以承载业务值。 */
    const input = fs.createReadStream(filePath);
/** stderr：定义该变量以承载业务值。 */
    let stderr = '';
/** settled：定义该变量以承载业务值。 */
    let settled = false;
/** timeout：定义该变量以承载业务值。 */
    const timeout = createProcessTimeout(child, 'pg_restore', (message) => {
      stderr = stderr ? `${stderr}\n${message}` : message;
    });

/** fail：定义该变量以承载业务值。 */
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

/** resolveDumpProcessSpec：执行对应的业务逻辑。 */
function resolveDumpProcessSpec(): ProcessSpec {
/** connection：定义该变量以承载业务值。 */
  const connection = getDatabaseConnectionConfig();
/** dumpArgs：定义该变量以承载业务值。 */
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

/** resolveRestoreProcessSpec：执行对应的业务逻辑。 */
function resolveRestoreProcessSpec(): ProcessSpec {
/** connection：定义该变量以承载业务值。 */
  const connection = getDatabaseConnectionConfig();
/** restoreArgs：定义该变量以承载业务值。 */
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

/** getDatabaseConnectionConfig：执行对应的业务逻辑。 */
function getDatabaseConnectionConfig(): DatabaseConnectionConfig {
/** url：定义该变量以承载业务值。 */
  const url = process.env.DATABASE_URL;
  if (url) {
/** parsed：定义该变量以承载业务值。 */
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

/** wrapWithNice：执行对应的业务逻辑。 */
function wrapWithNice(command: string, args: string[], password?: string): ProcessSpec {
/** env：定义该变量以承载业务值。 */
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

/** commandExists：执行对应的业务逻辑。 */
function commandExists(command: string): boolean {
/** result：定义该变量以承载业务值。 */
  const result = spawnSync('sh', ['-lc', `command -v ${command}`], {
    stdio: 'ignore',
  });
  return result.status === 0;
}

/** createProcessTimeout：执行对应的业务逻辑。 */
function createProcessTimeout(
  child: ReturnType<typeof spawn>,
  label: 'pg_dump' | 'pg_restore',
  appendError: (message: string) => void,
): { clear: () => void } {
/** forceKillTimer：定义该变量以承载业务值。 */
  let forceKillTimer: ReturnType<typeof setTimeout> | null = null;
/** timeoutId：定义该变量以承载业务值。 */
  const timeoutId = setTimeout(() => {
/** message：定义该变量以承载业务值。 */
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

/** resolveProcessTimeoutMs：执行对应的业务逻辑。 */
function resolveProcessTimeoutMs(): number {
/** raw：定义该变量以承载业务值。 */
  const raw = Number(process.env.DB_BACKUP_PROCESS_TIMEOUT_MS ?? 15 * 60_000);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 15 * 60_000;
  }
  return Math.max(60_000, Math.floor(raw));
}

/** formatDurationLabel：执行对应的业务逻辑。 */
function formatDurationLabel(durationMs: number): string {
/** totalSeconds：定义该变量以承载业务值。 */
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds} 秒`;
  }
/** totalMinutes：定义该变量以承载业务值。 */
  const totalMinutes = Math.floor(totalSeconds / 60);
/** seconds：定义该变量以承载业务值。 */
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) {
    return seconds > 0 ? `${totalMinutes} 分 ${seconds} 秒` : `${totalMinutes} 分`;
  }
/** totalHours：定义该变量以承载业务值。 */
  const totalHours = Math.floor(totalMinutes / 60);
/** minutes：定义该变量以承载业务值。 */
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${totalHours} 小时 ${minutes} 分` : `${totalHours} 小时`;
}

