import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GmDatabaseBackupKind,
  GmDatabaseBackupRecord,
  GmDatabaseJobSnapshot,
  GmDatabaseStateRes,
  GmTriggerDatabaseBackupRes,
} from '@mud/shared';
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { resolveServerDataPath } from '../common/data-path';
import { RedisService } from '../database/redis.service';
import { BotService } from './bot.service';
import { GmService } from './gm.service';
import { LootService } from './loot.service';
import { MapService } from './map.service';
import { MarketService } from './market.service';
import { NavigationService } from './navigation.service';
import { PlayerService } from './player.service';
import { TickService } from './tick.service';
import { WorldService } from './world.service';

const HOURLY_BACKUP_RETENTION = 72;
const DAILY_BACKUP_RETENTION = 14;
const DAILY_BACKUP_HOUR = 4;
const DAILY_BACKUP_MINUTE = 5;
const BACKUP_EXCLUDED_TABLES = ['redeem_codes', 'redeem_code_groups'] as const;

interface DatabaseConnectionConfig {
  host?: string;
  port?: number;
  username: string;
  password?: string;
  database: string;
}

interface ResolvedBackupRecord extends GmDatabaseBackupRecord {
  filePath: string;
}

interface InternalJobState {
  id: string;
  type: 'backup' | 'restore';
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  finishedAt?: number;
  kind?: GmDatabaseBackupKind;
  backupId?: string;
  sourceBackupId?: string;
  error?: string;
}

interface ProcessSpec {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

@Injectable()
export class DatabaseBackupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseBackupService.name);
  private readonly backupRootDir = resolveServerDataPath('backups', 'database');
  private readonly directories: Record<GmDatabaseBackupKind, string> = {
    hourly: path.join(this.backupRootDir, 'hourly'),
    daily: path.join(this.backupRootDir, 'daily'),
    manual: path.join(this.backupRootDir, 'manual'),
    pre_import: path.join(this.backupRootDir, 'pre_import'),
  };
  private hourlyTimer: ReturnType<typeof setTimeout> | null = null;
  private dailyTimer: ReturnType<typeof setTimeout> | null = null;
  private currentJob: InternalJobState | null = null;
  private lastJob: InternalJobState | null = null;
  private runtimeMaintenance = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly tickService: TickService,
    private readonly playerService: PlayerService,
    private readonly mapService: MapService,
    private readonly worldService: WorldService,
    private readonly lootService: LootService,
    private readonly navigationService: NavigationService,
    private readonly botService: BotService,
    private readonly gmService: GmService,
    private readonly marketService: MarketService,
    private readonly redisService: RedisService,
  ) {}

  onModuleInit(): void {
    this.ensureBackupDirectories();
    this.scheduleHourlyBackup();
    this.scheduleDailyBackup();
  }

  onModuleDestroy(): void {
    if (this.hourlyTimer) {
      clearTimeout(this.hourlyTimer);
      this.hourlyTimer = null;
    }
    if (this.dailyTimer) {
      clearTimeout(this.dailyTimer);
      this.dailyTimer = null;
    }
  }

  isRuntimeMaintenanceActive(): boolean {
    return this.runtimeMaintenance;
  }

  async getState(): Promise<GmDatabaseStateRes> {
    return {
      backups: await this.listBackups(),
      runningJob: this.toJobSnapshot(this.currentJob) ?? undefined,
      lastJob: this.toJobSnapshot(this.lastJob) ?? undefined,
      retention: {
        hourly: HOURLY_BACKUP_RETENTION,
        daily: DAILY_BACKUP_RETENTION,
      },
      schedules: {
        hourly: '每小时整点低优先级备份',
        daily: `每天 ${String(DAILY_BACKUP_HOUR).padStart(2, '0')}:${String(DAILY_BACKUP_MINUTE).padStart(2, '0')} 低优先级备份`,
      },
    };
  }

  triggerManualBackup(): GmTriggerDatabaseBackupRes {
    const planned = this.planBackup('manual');
    const job = this.startJob({
      type: 'backup',
      kind: 'manual',
      backupId: planned.id,
    });
    void this.runJob(job, async () => {
      await this.createBackupFile(planned.kind, planned.filePath);
    });
    return { job: this.toJobSnapshot(job)! };
  }

  triggerRestore(backupId: string): GmTriggerDatabaseBackupRes {
    const source = this.getBackupByIdOrThrow(backupId);
    const job = this.startJob({
      type: 'restore',
      sourceBackupId: source.id,
    });
    this.runtimeMaintenance = true;
    void this.runRestoreJob(job, source);
    return { job: this.toJobSnapshot(job)! };
  }

  async listBackups(): Promise<GmDatabaseBackupRecord[]> {
    this.ensureBackupDirectories();
    const backups = (Object.keys(this.directories) as GmDatabaseBackupKind[])
      .flatMap((kind) => this.listBackupsForKind(kind))
      .sort((left, right) => right.id.localeCompare(left.id, 'zh-CN'));
    return backups.map(({ filePath: _filePath, ...record }) => record);
  }

  getBackupDownloadRecord(backupId: string): GmDatabaseBackupRecord & { filePath: string } {
    return this.getBackupByIdOrThrow(backupId);
  }

  private async runRestoreJob(job: InternalJobState, source: ResolvedBackupRecord): Promise<void> {
    try {
      await this.prepareRuntimeForRestore();
      const preImportBackup = this.planBackup('pre_import');
      await this.createBackupFile(preImportBackup.kind, preImportBackup.filePath);
      await this.restoreBackupFile(source.filePath);
      job.status = 'completed';
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      this.logger.error(`数据库导入失败: ${job.error}`);
    } finally {
      try {
        await this.reloadRuntimeFromDatabase();
      } catch (reloadError) {
        const message = reloadError instanceof Error ? reloadError.message : String(reloadError);
        job.status = 'failed';
        job.error = job.error ? `${job.error}；运行时重建失败: ${message}` : `运行时重建失败: ${message}`;
        this.logger.error(job.error);
      } finally {
        this.tickService.resumeRuntimeAfterMaintenance();
        this.runtimeMaintenance = false;
        this.finishJob(job);
      }
    }
  }

  private async runJob(job: InternalJobState, work: () => Promise<void>): Promise<void> {
    try {
      await work();
      job.status = 'completed';
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      this.logger.error(`数据库任务失败: ${job.error}`);
    } finally {
      this.finishJob(job);
    }
  }

  private finishJob(job: InternalJobState): void {
    job.finishedAt = Date.now();
    this.lastJob = { ...job };
    if (this.currentJob?.id === job.id) {
      this.currentJob = null;
    }
  }

  private startJob(input: Pick<InternalJobState, 'type' | 'kind' | 'backupId' | 'sourceBackupId'>): InternalJobState {
    if (this.currentJob?.status === 'running') {
      throw new Error(`当前已有数据库任务执行中：${this.describeJob(this.currentJob)}`);
    }
    const job: InternalJobState = {
      id: this.createTimestampId(Date.now(), input.type),
      type: input.type,
      status: 'running',
      startedAt: Date.now(),
      kind: input.kind,
      backupId: input.backupId,
      sourceBackupId: input.sourceBackupId,
    };
    this.currentJob = job;
    return job;
  }

  private describeJob(job: InternalJobState): string {
    return job.type === 'restore'
      ? `导入 ${job.sourceBackupId ?? ''}`.trim()
      : `${job.kind ?? 'manual'} 备份`;
  }

  private async prepareRuntimeForRestore(): Promise<void> {
    this.tickService.suspendRuntimeForMaintenance();
    this.playerService.disconnectAllActiveSockets();
    await this.flushRuntimePersistence();
  }

  private async reloadRuntimeFromDatabase(): Promise<void> {
    this.navigationService.clearRuntimeState();
    this.gmService.clearRuntimeState();
    this.botService.clearRuntimeState();
    this.playerService.clearRuntimeState();
    await this.redisService.clearPlayerCache();
    await this.mapService.reloadAllFromPersistence();
    await this.lootService.reloadRuntimeStateFromPersistence();
    await this.worldService.reloadRuntimeStateFromPersistence();
    await this.marketService.reloadOpenOrders();
    const recovered = await this.playerService.restoreRetainedPlayers(this.tickService.getOfflinePlayerTimeoutMs());
    this.logger.log(
      `数据库导入后运行时重建完成: 恢复离线挂机 ${recovered.restored} 名, 超时离场 ${recovered.expired} 名, 修正在线残留 ${recovered.recoveredOnline} 名`,
    );
  }

  private async createBackupFile(kind: GmDatabaseBackupKind, filePath: string): Promise<void> {
    this.ensureBackupDirectories();
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await this.flushRuntimePersistence();
    await this.runDumpProcess(filePath);
    if (kind === 'hourly') {
      await this.pruneBackups(kind, HOURLY_BACKUP_RETENTION);
    } else if (kind === 'daily') {
      await this.pruneBackups(kind, DAILY_BACKUP_RETENTION);
    }
  }

  private async flushRuntimePersistence(): Promise<void> {
    await Promise.all([
      this.playerService.persistAll(),
      this.mapService.persistTileRuntimeStates(),
      this.lootService.persistRuntimeState(),
      this.worldService.persistMonsterRuntimeState(),
    ]);
  }

  private async restoreBackupFile(filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
      throw new Error('目标备份文件不存在');
    }
    await this.runRestoreProcess(filePath);
  }

  private planBackup(kind: GmDatabaseBackupKind): ResolvedBackupRecord {
    const now = Date.now();
    const id = this.createTimestampId(now, kind);
    const fileName = `${id}.dump`;
    return {
      id,
      kind,
      fileName,
      createdAt: new Date(now).toISOString(),
      sizeBytes: 0,
      filePath: path.join(this.directories[kind], fileName),
    };
  }

  private getBackupByIdOrThrow(backupId: string): ResolvedBackupRecord {
    const backup = (Object.keys(this.directories) as GmDatabaseBackupKind[])
      .flatMap((kind) => this.listBackupsForKind(kind))
      .find((entry) => entry.id === backupId);
    if (!backup) {
      throw new Error('目标备份不存在');
    }
    return backup;
  }

  private listBackupsForKind(kind: GmDatabaseBackupKind): ResolvedBackupRecord[] {
    const directory = this.directories[kind];
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

  private async pruneBackups(kind: 'hourly' | 'daily', keep: number): Promise<void> {
    const backups = this.listBackupsForKind(kind);
    const stale = backups.slice(keep);
    await Promise.all(stale.map(async (backup) => {
      await fs.promises.rm(backup.filePath, { force: true });
    }));
  }

  private scheduleHourlyBackup(): void {
    if (this.hourlyTimer) {
      clearTimeout(this.hourlyTimer);
    }
    this.hourlyTimer = setTimeout(() => {
      void this.runScheduledBackup('hourly');
      this.scheduleHourlyBackup();
    }, this.getDelayUntilNextHour());
  }

  private scheduleDailyBackup(): void {
    if (this.dailyTimer) {
      clearTimeout(this.dailyTimer);
    }
    this.dailyTimer = setTimeout(() => {
      void this.runScheduledBackup('daily');
      this.scheduleDailyBackup();
    }, this.getDelayUntilNextDailyBackup());
  }

  private async runScheduledBackup(kind: 'hourly' | 'daily'): Promise<void> {
    if (this.currentJob?.status === 'running') {
      this.logger.warn(`跳过 ${kind} 自动备份：当前已有数据库任务执行中`);
      return;
    }
    const planned = this.planBackup(kind);
    const job = this.startJob({
      type: 'backup',
      kind,
      backupId: planned.id,
    });
    await this.runJob(job, async () => {
      await this.createBackupFile(kind, planned.filePath);
    });
  }

  private getDelayUntilNextHour(now = new Date()): number {
    const next = new Date(now.getTime());
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return Math.max(1_000, next.getTime() - now.getTime());
  }

  private getDelayUntilNextDailyBackup(now = new Date()): number {
    const next = new Date(now.getTime());
    next.setHours(DAILY_BACKUP_HOUR, DAILY_BACKUP_MINUTE, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    return Math.max(1_000, next.getTime() - now.getTime());
  }

  private ensureBackupDirectories(): void {
    fs.mkdirSync(this.backupRootDir, { recursive: true });
    for (const directory of Object.values(this.directories)) {
      fs.mkdirSync(directory, { recursive: true });
    }
  }

  private async runDumpProcess(filePath: string): Promise<void> {
    const spec = this.resolveDumpProcessSpec();
    await new Promise<void>((resolve, reject) => {
      const child = spawn(spec.command, spec.args, {
        env: spec.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const stdout = child.stdout as Readable;
      const stderrStream = child.stderr as Readable;
      const childEvents = child as unknown as NodeJS.EventEmitter;
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
      childEvents.on('error', (error: Error) => {
        fail(error);
      });
      output.on('error', (error) => {
        fail(error);
      });
      childEvents.on('close', (code: number | null) => {
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

  private async runRestoreProcess(filePath: string): Promise<void> {
    const spec = this.resolveRestoreProcessSpec();
    await new Promise<void>((resolve, reject) => {
      const child = spawn(spec.command, spec.args, {
        env: spec.env,
        stdio: ['pipe', 'ignore', 'pipe'],
      });
      const stdin = child.stdin as Writable;
      const stderrStream = child.stderr as Readable;
      const childEvents = child as unknown as NodeJS.EventEmitter;
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
      childEvents.on('error', (error: Error) => {
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
      childEvents.on('close', (code: number | null) => {
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

  private resolveDumpProcessSpec(): ProcessSpec {
    const connection = this.getDatabaseConnectionConfig();
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
    if (this.commandExists('pg_dump')) {
      if (connection.host) {
        dumpArgs.push('--host', connection.host);
      }
      if (connection.port) {
        dumpArgs.push('--port', String(connection.port));
      }
      return this.wrapWithNice(dumpArgs[0]!, dumpArgs.slice(1), connection.password);
    }

    const containerName = this.resolveDockerPostgresContainer();
    if (!containerName) {
      throw new Error('当前环境未找到可用的 pg_dump。若服务运行在容器内，请确认服务端镜像已安装 postgresql-client，或提供可访问的 PostgreSQL Docker 容器');
    }
    const dockerArgs = [
      'exec',
      '-i',
      ...(connection.password ? ['-e', `PGPASSWORD=${connection.password}`] : []),
      containerName,
      ...dumpArgs,
    ];
    return this.wrapWithNice('docker', dockerArgs, undefined);
  }

  private resolveRestoreProcessSpec(): ProcessSpec {
    const connection = this.getDatabaseConnectionConfig();
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
    if (this.commandExists('pg_restore')) {
      if (connection.host) {
        restoreArgs.push('--host', connection.host);
      }
      if (connection.port) {
        restoreArgs.push('--port', String(connection.port));
      }
      return this.wrapWithNice(restoreArgs[0]!, restoreArgs.slice(1), connection.password);
    }

    const containerName = this.resolveDockerPostgresContainer();
    if (!containerName) {
      throw new Error('当前环境未找到可用的 pg_restore。若服务运行在容器内，请确认服务端镜像已安装 postgresql-client，或提供可访问的 PostgreSQL Docker 容器');
    }
    const dockerArgs = [
      'exec',
      '-i',
      ...(connection.password ? ['-e', `PGPASSWORD=${connection.password}`] : []),
      containerName,
      ...restoreArgs,
    ];
    return this.wrapWithNice('docker', dockerArgs, undefined);
  }

  private wrapWithNice(command: string, args: string[], password?: string): ProcessSpec {
    const env = {
      ...process.env,
      ...(password ? { PGPASSWORD: password } : {}),
    };
    if (!this.commandExists('nice')) {
      return { command, args, env };
    }
    return {
      command: 'nice',
      args: ['-n', '19', command, ...args],
      env,
    };
  }

  private resolveDockerPostgresContainer(): string | null {
    if (!this.commandExists('docker')) {
      return null;
    }
    const result = spawnSync('docker', ['ps', '--format', '{{.Names}}\t{{.Image}}'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf-8',
    });
    if (result.status !== 0) {
      return null;
    }
    const preferred = ['mud-local-postgres', 'postgres'];
    const lines = result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const [name, image] = line.split('\t');
        return { name: name ?? '', image: image ?? '' };
      })
      .filter((entry) => entry.image.startsWith('postgres'));
    for (const name of preferred) {
      if (lines.some((entry) => entry.name === name)) {
        return name;
      }
    }
    return lines[0]?.name ?? null;
  }

  private getDatabaseConnectionConfig(): DatabaseConnectionConfig {
    const url = this.configService.get<string>('DATABASE_URL');
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
      host: this.configService.get<string>('DB_HOST', 'localhost'),
      port: Number(this.configService.get<number>('DB_PORT', 5432)),
      username: this.configService.get<string>('DB_USERNAME', 'postgres'),
      password: this.configService.get<string>('DB_PASSWORD', 'postgres'),
      database: this.configService.get<string>('DB_DATABASE', 'daojie_yusheng'),
    };
  }

  private commandExists(command: string): boolean {
    const result = spawnSync('bash', ['-lc', `command -v ${command}`], {
      stdio: 'ignore',
    });
    return result.status === 0;
  }

  private createTimestampId(timestamp: number, suffix: string): string {
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

  private toJobSnapshot(job: InternalJobState | null): GmDatabaseJobSnapshot | null {
    if (!job) {
      return null;
    }
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      startedAt: new Date(job.startedAt).toISOString(),
      finishedAt: job.finishedAt ? new Date(job.finishedAt).toISOString() : undefined,
      kind: job.kind,
      backupId: job.backupId,
      sourceBackupId: job.sourceBackupId,
      error: job.error,
    };
  }
}

function parseBackupIdTimestamp(backupId: string): string | null {
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
