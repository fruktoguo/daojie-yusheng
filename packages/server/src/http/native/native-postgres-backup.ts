import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, promises as fsPromises } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { Readable } from 'node:stream';
import { cleanupPostgresRestoreOrphanSectState } from './native-postgres-restore-cleanup';

export type NativeDatabaseBackupFormat = 'postgres_custom_dump' | 'legacy_json_snapshot' | 'unknown';

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
const RESTORE_SKIPPED_EXTENSIONS = new Set(['uuid-ossp']);
const POSTGRES_DUMP_MAGIC = Buffer.from('PGDMP');

export interface DatabaseProcessCapabilities {
  pgDump: boolean;
  pgRestore: boolean;
  psql: boolean;
}

export function getDatabaseProcessCapabilities(): DatabaseProcessCapabilities {
  return {
    pgDump: commandExists('pg_dump'),
    pgRestore: commandExists('pg_restore'),
    psql: commandExists('psql'),
  };
}

export function buildPostgresDumpFileName(backupId: string): string {
  return `server-database-backup-${backupId}.dump`;
}

export async function detectDatabaseBackupFormat(filePath: string, fileName = ''): Promise<NativeDatabaseBackupFormat> {
  const normalizedName = String(fileName ?? '').trim().toLowerCase();
  if (normalizedName.endsWith('.json')) {
    return 'legacy_json_snapshot';
  }
  if (normalizedName.endsWith('.dump')) {
    return 'postgres_custom_dump';
  }
  const handle = await fsPromises.open(filePath, 'r').catch(() => null);
  if (!handle) {
    return 'unknown';
  }
  try {
    const buffer = Buffer.alloc(POSTGRES_DUMP_MAGIC.length);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead === POSTGRES_DUMP_MAGIC.length && buffer.equals(POSTGRES_DUMP_MAGIC)) {
      return 'postgres_custom_dump';
    }
    return 'unknown';
  } finally {
    await handle.close().catch(() => undefined);
  }
}

export async function createPostgresCustomDump(filePath: string, databaseUrl: string): Promise<{ sizeBytes: number; checksumSha256: string }> {
  await fsPromises.mkdir(dirname(filePath), { recursive: true });
  await runDumpProcess(filePath, databaseUrl);
  const stats = await fsPromises.stat(filePath);
  return {
    sizeBytes: stats.size,
    checksumSha256: await computeFileSha256(filePath),
  };
}

export async function computeDatabaseBackupFileSha256(filePath: string): Promise<string> {
  return computeFileSha256(filePath);
}

export async function restorePostgresCustomDump(filePath: string, databaseUrl: string): Promise<void> {
  const stats = await fsPromises.stat(filePath).catch(() => null);
  if (!stats?.isFile()) {
    throw new Error('目标备份文件不存在');
  }
  const format = await detectDatabaseBackupFormat(filePath);
  if (format !== 'postgres_custom_dump') {
    throw new Error('目标备份不是 PostgreSQL custom dump');
  }
  const restoreSpec = resolveRestoreProcessSpec(databaseUrl);
  const supportedSettings = getSupportedServerSettingNames(databaseUrl);
  const skippedParameters = new Set<string>();
  const restoreTempDirectory = await fsPromises.mkdtemp(join(tmpdir(), 'mud-next-restore-'));
  const sqlFilePath = join(restoreTempDirectory, 'restore.filtered.sql');
  try {
    await materializeFilteredRestoreSql(filePath, restoreSpec, supportedSettings, skippedParameters, sqlFilePath);
    await executeSqlFile(sqlFilePath, databaseUrl);
    await cleanupPostgresRestoreOrphanSectState(databaseUrl);
  } catch (error: unknown) {
    const skipSummary = skippedParameters.size > 0
      ? `\n已自动忽略目标库不支持的会话参数: ${[...skippedParameters].sort((left, right) => left.localeCompare(right, 'zh-CN')).join(', ')}`
      : '';
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}${skipSummary}`);
  } finally {
    await fsPromises.rm(restoreTempDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function runDumpProcess(filePath: string, databaseUrl: string): Promise<void> {
  const spec = resolveDumpProcessSpec(databaseUrl);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(spec.command, spec.args, {
      env: spec.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = child.stdout as Readable;
    const stderrStream = child.stderr as Readable;
    const output = createWriteStream(filePath);
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
      void fsPromises.rm(filePath, { force: true }).catch(() => undefined);
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

async function materializeFilteredRestoreSql(
  dumpFilePath: string,
  restoreSpec: ProcessSpec,
  supportedSettings: Set<string>,
  skippedParameters: Set<string>,
  sqlFilePath: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const restoreChild = spawn(restoreSpec.command, [...restoreSpec.args, dumpFilePath], {
      env: restoreSpec.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const restoreStdout = restoreChild.stdout as Readable;
    const restoreStderrStream = restoreChild.stderr as Readable;
    const output = createWriteStream(sqlFilePath);
    let stderr = '';
    let settled = false;
    let resetInjected = false;
    const timeout = createProcessTimeout(restoreChild, 'pg_restore', (message) => {
      stderr = stderr ? `${stderr}\n${message}` : message;
    });

    const fail = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      timeout.clear();
      restoreStdout.destroy();
      output.destroy();
      reject(error);
    };

    restoreStderrStream.on('data', (chunk) => {
      stderr += String(chunk);
    });
    restoreChild.on('error', (error) => {
      fail(error);
    });
    output.on('error', (error) => {
      fail(error);
    });

    void (async () => {
      const lineReader = createInterface({
        input: restoreStdout,
        crlfDelay: Infinity,
      });
      try {
        for await (const line of lineReader) {
          if (shouldSkipUnsupportedSetStatement(line, supportedSettings, skippedParameters)) {
            continue;
          }
          if (shouldSkipExtensionStatement(line)) {
            continue;
          }
          if (!resetInjected && line.trim().toUpperCase() === 'BEGIN;') {
            output.write(`${line}\n`);
            output.write('DROP SCHEMA IF EXISTS public CASCADE;\n');
            output.write('CREATE SCHEMA public;\n');
            resetInjected = true;
            continue;
          }
          output.write(`${line}\n`);
        }
        if (!resetInjected) {
          throw new Error('pg_restore 未输出事务起点，拒绝执行非原子数据库恢复');
        }
        output.end();
      } catch (error: unknown) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    })();

    restoreChild.on('close', (code) => {
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

async function executeSqlFile(sqlFilePath: string, databaseUrl: string): Promise<void> {
  const spec = resolvePsqlProcessSpec(databaseUrl);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(spec.command, [...spec.args, '--file', sqlFilePath], {
      env: spec.env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const stderrStream = child.stderr as Readable;
    let stderr = '';
    let settled = false;
    const timeout = createProcessTimeout(child, 'psql', (message) => {
      stderr = stderr ? `${stderr}\n${message}` : message;
    });

    const fail = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      timeout.clear();
      reject(error);
    };

    stderrStream.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      fail(error);
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
      fail(new Error(stderr.trim() || `psql 退出码 ${code ?? 'unknown'}`));
    });
  });
}

function resolveDumpProcessSpec(databaseUrl: string): ProcessSpec {
  const connection = parseDatabaseConnectionConfig(databaseUrl);
  const dumpArgs = [
    'pg_dump',
    '--format=custom',
    '--compress=0',
    '--no-owner',
    '--no-privileges',
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

function resolveRestoreProcessSpec(databaseUrl: string): ProcessSpec {
  const restoreArgs = [
    'pg_restore',
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '--single-transaction',
    '--exit-on-error',
    '--file',
    '-',
  ];
  if (!commandExists('pg_restore')) {
    throw new Error('当前环境未找到可用的 pg_restore，请检查镜像是否已安装 postgresql-client');
  }
  const connection = parseDatabaseConnectionConfig(databaseUrl);
  return wrapWithNice(restoreArgs[0]!, restoreArgs.slice(1), connection.password);
}

function resolvePsqlProcessSpec(databaseUrl: string): ProcessSpec {
  const connection = parseDatabaseConnectionConfig(databaseUrl);
  const psqlArgs = [
    'psql',
    '--no-psqlrc',
    '--set',
    'ON_ERROR_STOP=1',
    '--username',
    connection.username,
    '--dbname',
    connection.database,
  ];
  if (!commandExists('psql')) {
    throw new Error('当前环境未找到可用的 psql，请检查镜像是否已安装 postgresql-client');
  }
  if (connection.host) {
    psqlArgs.push('--host', connection.host);
  }
  if (connection.port) {
    psqlArgs.push('--port', String(connection.port));
  }
  return wrapWithNice(psqlArgs[0]!, psqlArgs.slice(1), connection.password);
}

function parseDatabaseConnectionConfig(databaseUrl: string): DatabaseConnectionConfig {
  const parsed = new URL(databaseUrl);
  return {
    host: parsed.hostname || undefined,
    port: parsed.port ? Number(parsed.port) : 5432,
    username: decodeURIComponent(parsed.username || 'postgres'),
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    database: decodeURIComponent(parsed.pathname.replace(/^\/+/u, '') || 'postgres'),
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

function getSupportedServerSettingNames(databaseUrl: string): Set<string> {
  const spec = resolvePsqlProcessSpec(databaseUrl);
  const result = spawnSync(spec.command, [
    ...spec.args,
    '--tuples-only',
    '--no-align',
    '--quiet',
    '--command',
    'SELECT name FROM pg_settings',
  ], {
    env: spec.env,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    throw new Error(stderr || `读取目标数据库配置参数失败，psql 退出码 ${result.status ?? 'unknown'}`);
  }
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  return new Set(
    stdout
      .split(/\r?\n/u)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
}

function shouldSkipUnsupportedSetStatement(
  line: string,
  supportedSettings: Set<string>,
  skippedParameters: Set<string>,
): boolean {
  const match = /^SET\s+([a-z_][a-z0-9_]*)\s*=\s*.*;$/iu.exec(line.trim());
  if (!match) {
    return false;
  }
  const parameterName = match[1]!.toLowerCase();
  if (supportedSettings.has(parameterName)) {
    return false;
  }
  skippedParameters.add(parameterName);
  return true;
}

function shouldSkipExtensionStatement(line: string): boolean {
  const normalized = line.trim().toLowerCase();
  if (!normalized.includes('extension')) {
    return false;
  }
  return [...RESTORE_SKIPPED_EXTENSIONS].some((extensionName) => {
    const escapedName = extensionName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const pattern = new RegExp(`\\b(?:drop|create|comment\\s+on|alter)\\s+extension\\b[\\s\\w"]*"?${escapedName}"?`, 'iu');
    return pattern.test(normalized);
  });
}

function createProcessTimeout(
  child: ChildProcessWithoutNullStreams,
  label: 'pg_dump' | 'pg_restore' | 'psql',
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

async function computeFileSha256(filePath: string): Promise<string> {
  const fileBuffer = await fsPromises.readFile(filePath);
  return createHash('sha256').update(fileBuffer).digest('hex');
}
