import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
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

/** DatabaseProcessCapabilities：定义该接口的能力与字段约束。 */
export interface DatabaseProcessCapabilities {
/** pgDump：定义该变量以承载业务值。 */
  pgDump: boolean;
/** pgRestore：定义该变量以承载业务值。 */
  pgRestore: boolean;
}

const RESTORE_SKIPPED_EXTENSIONS = new Set(['uuid-ossp']);

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

/** getDatabaseProcessCapabilities：执行对应的业务逻辑。 */
export function getDatabaseProcessCapabilities(): DatabaseProcessCapabilities {
  return {
    pgDump: commandExists('pg_dump'),
    pgRestore: commandExists('pg_restore'),
  };
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
/** restoreSpec：定义该变量以承载业务值。 */
  const restoreSpec = resolveRestoreProcessSpec();
/** supportedSettings：定义该变量以承载业务值。 */
  const supportedSettings = getSupportedServerSettingNames();
/** tempDirectory：定义该变量以承载业务值。 */
  const tempDirectory = await fs.promises.mkdtemp(path.join(path.dirname(filePath), '.restore-'));
/** sqlFilePath：定义该变量以承载业务值。 */
  const sqlFilePath = path.join(tempDirectory, 'restore.filtered.sql');
/** skippedParameters：定义该变量以承载业务值。 */
  const skippedParameters = new Set<string>();
  try {
    await materializeFilteredRestoreSql(filePath, restoreSpec, supportedSettings, skippedParameters, sqlFilePath);
    await executeSqlFile(sqlFilePath);
  } catch (error) {
/** skipSummary：定义该变量以承载业务值。 */
    const skipSummary = skippedParameters.size > 0
      ? `\n已自动忽略目标库不支持的会话参数: ${[...skippedParameters].sort((left, right) => left.localeCompare(right, 'zh-CN')).join(', ')}`
      : '';
/** message：定义该变量以承载业务值。 */
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}${skipSummary}`);
  } finally {
    await fs.promises.rm(tempDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

/** materializeFilteredRestoreSql：执行对应的业务逻辑。 */
async function materializeFilteredRestoreSql(
  dumpFilePath: string,
  restoreSpec: ProcessSpec,
  supportedSettings: Set<string>,
  skippedParameters: Set<string>,
  sqlFilePath: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
/** restoreChild：定义该变量以承载业务值。 */
    const restoreChild = spawn(restoreSpec.command, [...restoreSpec.args, dumpFilePath], {
      env: restoreSpec.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
/** restoreStdout：定义该变量以承载业务值。 */
    const restoreStdout = restoreChild.stdout as Readable;
/** restoreStderrStream：定义该变量以承载业务值。 */
    const restoreStderrStream = restoreChild.stderr as Readable;
/** output：定义该变量以承载业务值。 */
    const output = fs.createWriteStream(sqlFilePath);
/** stderr：定义该变量以承载业务值。 */
    let stderr = '';
/** settled：定义该变量以承载业务值。 */
    let settled = false;
/** timeout：定义该变量以承载业务值。 */
    const timeout = createProcessTimeout(restoreChild, 'pg_restore', (message) => {
      stderr = stderr ? `${stderr}\n${message}` : message;
    });

/** fail：定义该变量以承载业务值。 */
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
/** lineReader：定义该变量以承载业务值。 */
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
          output.write(`${line}\n`);
        }
        output.end();
      } catch (error) {
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

/** executeSqlFile：执行对应的业务逻辑。 */
async function executeSqlFile(sqlFilePath: string): Promise<void> {
/** psqlSpec：定义该变量以承载业务值。 */
  const psqlSpec = resolvePsqlProcessSpec();
  await new Promise<void>((resolve, reject) => {
/** child：定义该变量以承载业务值。 */
    const child = spawn(psqlSpec.command, [...psqlSpec.args, '--file', sqlFilePath], {
      env: psqlSpec.env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
/** stderrStream：定义该变量以承载业务值。 */
    const stderrStream = child.stderr as Readable;
/** stderr：定义该变量以承载业务值。 */
    let stderr = '';
/** settled：定义该变量以承载业务值。 */
    let settled = false;
/** timeout：定义该变量以承载业务值。 */
    const timeout = createProcessTimeout(child, 'psql', (message) => {
      stderr = stderr ? `${stderr}\n${message}` : message;
    });

/** fail：定义该变量以承载业务值。 */
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
/** restoreArgs：定义该变量以承载业务值。 */
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
  return wrapWithNice(restoreArgs[0]!, restoreArgs.slice(1));
}

/** resolvePsqlProcessSpec：执行对应的业务逻辑。 */
function resolvePsqlProcessSpec(): ProcessSpec {
/** connection：定义该变量以承载业务值。 */
  const connection = getDatabaseConnectionConfig();
/** psqlArgs：定义该变量以承载业务值。 */
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

/** getSupportedServerSettingNames：执行对应的业务逻辑。 */
function getSupportedServerSettingNames(): Set<string> {
/** spec：定义该变量以承载业务值。 */
  const spec = resolvePsqlProcessSpec();
/** result：定义该变量以承载业务值。 */
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
/** stderr：定义该变量以承载业务值。 */
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    throw new Error(stderr || `读取目标数据库配置参数失败，psql 退出码 ${result.status ?? 'unknown'}`);
  }
/** stdout：定义该变量以承载业务值。 */
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  return new Set(
    stdout
      .split(/\r?\n/u)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
}

/** shouldSkipUnsupportedSetStatement：执行对应的业务逻辑。 */
function shouldSkipUnsupportedSetStatement(
  line: string,
  supportedSettings: Set<string>,
  skippedParameters: Set<string>,
): boolean {
/** match：定义该变量以承载业务值。 */
  const match = /^SET\s+([a-z_][a-z0-9_]*)\s*=\s*.*;$/iu.exec(line.trim());
  if (!match) {
    return false;
  }
/** parameterName：定义该变量以承载业务值。 */
  const parameterName = match[1]!.toLowerCase();
  if (supportedSettings.has(parameterName)) {
    return false;
  }
  skippedParameters.add(parameterName);
  return true;
}

/** shouldSkipExtensionStatement：执行对应的业务逻辑。 */
function shouldSkipExtensionStatement(line: string): boolean {
/** normalized：定义该变量以承载业务值。 */
  const normalized = line.trim().toLowerCase();
  if (!normalized.includes('extension')) {
    return false;
  }
  return [...RESTORE_SKIPPED_EXTENSIONS].some((extensionName) => {
/** escapedName：定义该变量以承载业务值。 */
    const escapedName = extensionName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
/** pattern：定义该变量以承载业务值。 */
    const pattern = new RegExp(`\\b(?:drop|create|comment\\s+on|alter)\\s+extension\\b[\\s\\w"]*"?${escapedName}"?`, 'iu');
    return pattern.test(normalized);
  });
}

/** createProcessTimeout：执行对应的业务逻辑。 */
function createProcessTimeout(
  child: ReturnType<typeof spawn>,
  label: 'pg_dump' | 'pg_restore' | 'psql',
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
