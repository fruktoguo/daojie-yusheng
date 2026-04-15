import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as fs from 'node:fs';
import {
  GmDatabaseBackupKind,
  GmDatabaseBackupRecord,
  GmDatabaseJobSnapshot,
  GmDatabaseStateRes,
  GmTriggerDatabaseBackupRes,
} from '@mud/shared';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { applyPreSynchronizeCompatibilityFixes, buildBasePostgresOptions } from '../database/database.module';
import { RedisService } from '../database/redis.service';
import { BotService } from './bot.service';
import {
  BACKUP_WORKER_HEARTBEAT_TTL_MS,
  BACKUP_DIRECTORIES,
  createBackupRecord,
  DAILY_BACKUP_HOUR,
  DAILY_BACKUP_MINUTE,
  DAILY_BACKUP_RETENTION,
  ensureBackupWorkspace,
  createTimestampId,
  findBackupById,
  getBackupScheduleSlotId,
  HOURLY_BACKUP_RETENTION,
  listBackupRestoreRequests,
  listBackups,
  readBackupWorkerState,
  readBackupWorkerHeartbeat,
  requestDevWatchPause,
  writeBackupWorkerState,
  type ResolvedBackupRecord,
  writeBackupManualRequest,
  writeBackupRestoreRequest,
  planBackup,
} from './database-backup-shared';
import { createBackupFile, getDatabaseProcessCapabilities, restoreBackupFile } from './database-backup-process';
import { GmService } from './gm.service';
import { LootService } from './loot.service';
import { MapService } from './map.service';
import { MarketService } from './market.service';
import { NavigationService } from './navigation.service';
import { PlayerService } from './player.service';
import { TickService } from './tick.service';
import { WorldService } from './world.service';

/** InternalJobState：定义该接口的能力与字段约束。 */
interface InternalJobState {
/** id：定义该变量以承载业务值。 */
  id: string;
/** type：定义该变量以承载业务值。 */
  type: 'backup' | 'restore';
/** status：定义该变量以承载业务值。 */
  status: 'running' | 'completed' | 'failed';
/** startedAt：定义该变量以承载业务值。 */
  startedAt: number;
  finishedAt?: number;
  kind?: GmDatabaseBackupKind;
  backupId?: string;
  sourceBackupId?: string;
  error?: string;
}

@Injectable()
/** DatabaseBackupService：封装相关状态与行为。 */
export class DatabaseBackupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseBackupService.name);
  private readonly restoreMonitorIntervalMs = 1_000;
  private readonly fallbackAutomationIntervalMs = 10_000;
  private readonly serverFallbackEnabled = this.resolveServerFallbackEnabled();
  private readonly devWatchPauseMs = this.resolveDevWatchPauseMs();
  private readonly uploadDumpMagic = Buffer.from('PGDMP');
/** currentJob：定义该变量以承载业务值。 */
  private currentJob: InternalJobState | null = null;
/** lastJob：定义该变量以承载业务值。 */
  private lastJob: InternalJobState | null = null;
  private runtimeMaintenance = false;
/** restoreMonitorTimer：定义该变量以承载业务值。 */
  private restoreMonitorTimer: ReturnType<typeof setInterval> | null = null;
  private restoreMonitorPolling = false;
/** pendingRestoreJobId：定义该变量以承载业务值。 */
  private pendingRestoreJobId: string | null = null;
/** fallbackAutomationTimer：定义该变量以承载业务值。 */
  private fallbackAutomationTimer: ReturnType<typeof setInterval> | null = null;
  private fallbackAutomationPolling = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
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

/** onModuleInit：执行对应的业务逻辑。 */
  onModuleInit(): void {
    ensureBackupWorkspace();
    this.recoverInterruptedBackupJobIfNeeded();
    this.logBackupAutomationModeOnBoot();
    this.resumeRestoreMonitorIfNeeded();
    this.startFallbackAutomationLoop();
  }

/** onModuleDestroy：执行对应的业务逻辑。 */
  onModuleDestroy(): void {
    this.stopRestoreMonitor();
    this.stopFallbackAutomationLoop();
  }

/** isRuntimeMaintenanceActive：执行对应的业务逻辑。 */
  isRuntimeMaintenanceActive(): boolean {
    return this.runtimeMaintenance;
  }

/** getState：执行对应的业务逻辑。 */
  async getState(): Promise<GmDatabaseStateRes> {
/** workerState：定义该变量以承载业务值。 */
    const workerState = readBackupWorkerState();
/** workerStatusNote：定义该变量以承载业务值。 */
    const workerStatusNote = this.buildBackupWorkerStatusNote();
/** schedules：定义该变量以承载业务值。 */
    const schedules = this.buildScheduleDescription();
    return {
      backups: await this.listBackups(),
      runningJob: this.toJobSnapshot(this.currentJob) ?? workerState.runningJob,
      lastJob: this.resolveLatestJobSnapshot(this.toJobSnapshot(this.lastJob), workerState.lastJob),
      note: workerStatusNote,
      retention: {
        hourly: HOURLY_BACKUP_RETENTION,
        daily: DAILY_BACKUP_RETENTION,
      },
      schedules,
    };
  }

/** triggerManualBackup：执行对应的业务逻辑。 */
  triggerManualBackup(): GmTriggerDatabaseBackupRes {
    if (this.currentJob?.status === 'running') {
      throw new Error(`当前已有数据库任务执行中：${this.describeJob(this.currentJob)}`);
    }
/** workerState：定义该变量以承载业务值。 */
    const workerState = readBackupWorkerState();
    if (this.hasActiveSharedJob(workerState.runningJob)) {
      throw new Error('当前已有数据库任务执行中，请稍后再试');
    }
/** now：定义该变量以承载业务值。 */
    const now = Date.now();
    this.requestDevWatchPauseWindow('manual-backup');
/** backupId：定义该变量以承载业务值。 */
    const backupId = createTimestampId(now, 'manual');
/** job：定义该变量以承载业务值。 */
    const job: GmDatabaseJobSnapshot = {
      id: createTimestampId(now, 'backup'),
      type: 'backup',
      status: 'running',
      startedAt: new Date(now).toISOString(),
      kind: 'manual',
      backupId,
    };
    if (!this.shouldUseServerFallback()) {
      this.assertBackupWorkerAvailable();
      writeBackupManualRequest({
        job,
        requestedAt: job.startedAt,
      });
      return { job };
    }

/** internalJob：定义该变量以承载业务值。 */
    const internalJob = this.startJob({
      type: 'backup',
      kind: 'manual',
      backupId,
    });
/** snapshot：定义该变量以承载业务值。 */
    const snapshot = this.toJobSnapshot(internalJob)!;
    this.persistSharedRunningJob(snapshot);
    void this.runLocalBackupJob(internalJob, createBackupRecord('manual', backupId, now), '游戏服内置手动备份');
    return { job: snapshot };
  }

/** triggerRestore：执行对应的业务逻辑。 */
  async triggerRestore(backupId: string): Promise<GmTriggerDatabaseBackupRes> {
/** source：定义该变量以承载业务值。 */
    const source = this.getBackupByIdOrThrow(backupId);
/** workerState：定义该变量以承载业务值。 */
    const workerState = readBackupWorkerState();
    if (this.hasActiveSharedJob(workerState.runningJob)) {
      throw new Error('当前已有数据库任务执行中，请稍后再试');
    }
/** job：定义该变量以承载业务值。 */
    const job = this.startJob({
      type: 'restore',
      sourceBackupId: source.id,
    });
    this.requestDevWatchPauseWindow(`restore:${source.id}`);
    this.runtimeMaintenance = true;
    try {
      await this.prepareRuntimeForRestore();
      if (this.shouldUseServerFallback()) {
        this.assertLocalRestoreFallbackAvailable();
/** snapshot：定义该变量以承载业务值。 */
        const snapshot = this.toJobSnapshot(job)!;
        this.persistSharedRunningJob(snapshot);
/** requestedAt：定义该变量以承载业务值。 */
        const requestedAt = new Date(snapshot.startedAt).getTime() || Date.now();
/** preImportBackup：定义该变量以承载业务值。 */
        const preImportBackup = planBackup('pre_import', requestedAt);
        void this.runLocalRestoreJob(job, source, preImportBackup, '游戏服内置数据库导入');
        return { job: snapshot };
      }
      this.assertBackupWorkerAvailable();
      writeBackupRestoreRequest({
        job: this.toJobSnapshot(job)!,
        sourceBackupId: source.id,
        requestedAt: new Date().toISOString(),
      });
      this.startRestoreMonitor(job.id);
      return { job: this.toJobSnapshot(job)! };
    } catch (error) {
      this.logger.error(`数据库导入准备失败: ${error instanceof Error ? error.message : String(error)}`);
      this.runtimeMaintenance = false;
      this.tickService.resumeRuntimeAfterMaintenance();
      this.failJob(job, error);
      throw error;
    }
  }

/** listBackups：执行对应的业务逻辑。 */
  async listBackups(): Promise<GmDatabaseBackupRecord[]> {
    return listBackups();
  }

  getBackupDownloadRecord(backupId: string): GmDatabaseBackupRecord & { filePath: string } {
    return this.getBackupByIdOrThrow(backupId);
  }

  async registerUploadedBackup(tempFilePath: string, originalName: string): Promise<GmDatabaseBackupRecord> {
    ensureBackupWorkspace();
/** record：定义该变量以承载业务值。 */
    const record = createBackupRecord('uploaded', createTimestampId(Date.now(), this.buildUploadedBackupSuffix(originalName)));
/** moved：定义该变量以承载业务值。 */
    let moved = false;
    try {
      await this.assertUploadedBackupFile(tempFilePath);
      await fs.promises.mkdir(BACKUP_DIRECTORIES.uploaded, { recursive: true });
      await fs.promises.rename(tempFilePath, record.filePath);
      moved = true;
/** stats：定义该变量以承载业务值。 */
      const stats = await fs.promises.stat(record.filePath);
      return {
        ...record,
        sizeBytes: stats.size,
      };
    } catch (error) {
      await fs.promises.rm(moved ? record.filePath : tempFilePath, { force: true }).catch(() => {});
      throw error;
    }
  }

/** finishJob：执行对应的业务逻辑。 */
  private finishJob(job: InternalJobState): void {
    job.finishedAt = Date.now();
    this.lastJob = { ...job };
    if (this.currentJob?.id === job.id) {
      this.currentJob = null;
    }
  }

/** failJob：执行对应的业务逻辑。 */
  private failJob(job: InternalJobState, error: unknown): void {
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : String(error);
    this.finishJob(job);
  }

/** startJob：执行对应的业务逻辑。 */
  private startJob(input: Pick<InternalJobState, 'type' | 'kind' | 'backupId' | 'sourceBackupId'>): InternalJobState {
    if (this.currentJob?.status === 'running') {
      throw new Error(`当前已有数据库任务执行中：${this.describeJob(this.currentJob)}`);
    }
/** job：定义该变量以承载业务值。 */
    const job: InternalJobState = {
      id: createTimestampId(Date.now(), input.type),
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

/** describeJob：执行对应的业务逻辑。 */
  private describeJob(job: InternalJobState): string {
    return job.type === 'restore'
      ? `导入 ${job.sourceBackupId ?? ''}`.trim()
      : `${job.kind ?? 'manual'} 备份`;
  }

/** prepareRuntimeForRestore：执行对应的业务逻辑。 */
  private async prepareRuntimeForRestore(): Promise<void> {
    this.tickService.suspendRuntimeForMaintenance();
    this.playerService.disconnectAllActiveSockets();
    await this.flushRuntimePersistence();
  }

/** reloadRuntimeFromDatabase：执行对应的业务逻辑。 */
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
/** recovered：定义该变量以承载业务值。 */
    const recovered = await this.playerService.restoreRetainedPlayers(this.tickService.getOfflinePlayerTimeoutMs());
    this.logger.log(
      `数据库导入后运行时重建完成: 恢复离线挂机 ${recovered.restored} 名, 超时离场 ${recovered.expired} 名, 修正在线残留 ${recovered.recoveredOnline} 名`,
    );
  }

/** flushRuntimePersistence：执行对应的业务逻辑。 */
  private async flushRuntimePersistence(): Promise<void> {
    await this.tickService.flushPersistenceNow('maintenance');
  }

  private async synchronizeSchemaAfterRestore(): Promise<void> {
    await applyPreSynchronizeCompatibilityFixes(buildBasePostgresOptions(this.configService));
    await this.dataSource.synchronize();
  }

/** getBackupByIdOrThrow：执行对应的业务逻辑。 */
  private getBackupByIdOrThrow(backupId: string): ResolvedBackupRecord {
/** backup：定义该变量以承载业务值。 */
    const backup = findBackupById(backupId);
    if (!backup) {
      throw new Error('目标备份不存在');
    }
    return backup;
  }

/** toJobSnapshot：执行对应的业务逻辑。 */
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

/** assertBackupWorkerAvailable：执行对应的业务逻辑。 */
  private assertBackupWorkerAvailable(): void {
/** heartbeat：定义该变量以承载业务值。 */
    const heartbeat = readBackupWorkerHeartbeat();
    if (!heartbeat) {
      throw new Error('当前未检测到独立数据库 worker；自动备份可由游戏服兜底，但数据库导入仍需独立 backup worker');
    }
/** heartbeatTime：定义该变量以承载业务值。 */
    const heartbeatTime = new Date(heartbeat.updatedAt).getTime();
    if (!Number.isFinite(heartbeatTime) || Date.now() - heartbeatTime > BACKUP_WORKER_HEARTBEAT_TTL_MS) {
      throw new Error('独立数据库 worker 心跳已过期；自动备份可由游戏服兜底，但数据库导入仍需独立 backup worker');
    }
  }

  private assertLocalRestoreFallbackAvailable(): void {
/** capabilities：定义该变量以承载业务值。 */
    const capabilities = getDatabaseProcessCapabilities();
    if (!capabilities.pgRestore && !capabilities.pgDump) {
      throw new Error('当前未检测到独立数据库 worker，且本机缺少 pg_dump 与 pg_restore；请安装 postgresql-client 或启动 backup worker');
    }
    if (!capabilities.pgRestore) {
      throw new Error('当前未检测到独立数据库 worker，且本机缺少 pg_restore；请安装 postgresql-client 或启动 backup worker');
    }
    if (!capabilities.pgDump) {
      throw new Error('当前未检测到独立数据库 worker，且本机缺少 pg_dump，无法生成导入前备份；请安装 postgresql-client 或启动 backup worker');
    }
  }

/** shouldUseServerFallback：执行对应的业务逻辑。 */
  private shouldUseServerFallback(): boolean {
    return this.serverFallbackEnabled && !this.hasFreshBackupWorkerHeartbeat();
  }

  private buildUploadedBackupSuffix(originalName: string): string {
/** trimmed：定义该变量以承载业务值。 */
    const trimmed = originalName.trim();
/** baseName：定义该变量以承载业务值。 */
    const baseName = trimmed.replace(/\.[^.]+$/u, '');
/** normalized：定义该变量以承载业务值。 */
    const normalized = baseName
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/gu, '_')
      .replace(/_+/gu, '_')
      .replace(/^_+|_+$/gu, '')
      .slice(0, 48);
    return normalized ? `uploaded__${normalized}` : 'uploaded';
  }

  private async assertUploadedBackupFile(filePath: string): Promise<void> {
/** stats：定义该变量以承载业务值。 */
    const stats = await fs.promises.stat(filePath).catch(() => null);
    if (!stats?.isFile()) {
      throw new Error('上传文件不存在');
    }
    if (stats.size <= 0) {
      throw new Error('上传文件为空');
    }
/** handle：定义该变量以承载业务值。 */
    const handle = await fs.promises.open(filePath, 'r');
    try {
/** header：定义该变量以承载业务值。 */
      const header = Buffer.alloc(this.uploadDumpMagic.length);
/** bytesRead：定义该变量以承载业务值。 */
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      if (bytesRead < this.uploadDumpMagic.length || !header.equals(this.uploadDumpMagic)) {
        throw new Error('上传文件不是 PostgreSQL custom dump；请上传由 pg_dump --format=custom 导出的备份');
      }
    } finally {
      await handle.close();
    }
  }

/** hasFreshBackupWorkerHeartbeat：执行对应的业务逻辑。 */
  private hasFreshBackupWorkerHeartbeat(): boolean {
/** heartbeat：定义该变量以承载业务值。 */
    const heartbeat = readBackupWorkerHeartbeat();
    if (!heartbeat) {
      return false;
    }
/** heartbeatTime：定义该变量以承载业务值。 */
    const heartbeatTime = new Date(heartbeat.updatedAt).getTime();
    return Number.isFinite(heartbeatTime) && Date.now() - heartbeatTime <= BACKUP_WORKER_HEARTBEAT_TTL_MS;
  }

/** hasActiveSharedJob：执行对应的业务逻辑。 */
  private hasActiveSharedJob(job?: GmDatabaseJobSnapshot | null): boolean {
    if (!job || job.status !== 'running') {
      return false;
    }
    if (job.type === 'restore') {
      return true;
    }
    return this.hasFreshBackupWorkerHeartbeat();
  }

/** startFallbackAutomationLoop：执行对应的业务逻辑。 */
  private startFallbackAutomationLoop(): void {
    if (!this.serverFallbackEnabled || this.fallbackAutomationTimer) {
      return;
    }
    this.fallbackAutomationTimer = setInterval(() => {
      void this.pollFallbackAutomation();
    }, this.fallbackAutomationIntervalMs);
    void this.pollFallbackAutomation();
  }

/** stopFallbackAutomationLoop：执行对应的业务逻辑。 */
  private stopFallbackAutomationLoop(): void {
    if (this.fallbackAutomationTimer) {
      clearInterval(this.fallbackAutomationTimer);
      this.fallbackAutomationTimer = null;
    }
  }

/** pollFallbackAutomation：执行对应的业务逻辑。 */
  private async pollFallbackAutomation(): Promise<void> {
    if (this.fallbackAutomationPolling || !this.serverFallbackEnabled) {
      return;
    }
    this.fallbackAutomationPolling = true;
    try {
      if (!this.shouldUseServerFallback()) {
        return;
      }
      if (this.currentJob?.status === 'running') {
        return;
      }
/** state：定义该变量以承载业务值。 */
      const state = readBackupWorkerState();
      if (this.hasActiveSharedJob(state.runningJob)) {
        return;
      }
/** now：定义该变量以承载业务值。 */
      const now = Date.now();
      if (this.shouldRunDailyBackup(state, now)) {
        await this.runLocalScheduledBackup('daily', now);
        return;
      }
      if (this.shouldRunHourlyBackup(state, now)) {
        await this.runLocalScheduledBackup('hourly', now);
      }
    } finally {
      this.fallbackAutomationPolling = false;
    }
  }

/** shouldRunDailyBackup：执行对应的业务逻辑。 */
  private shouldRunDailyBackup(state: ReturnType<typeof readBackupWorkerState>, now: number): boolean {
/** date：定义该变量以承载业务值。 */
    const date = new Date(now);
/** reachedWindow：定义该变量以承载业务值。 */
    const reachedWindow = date.getHours() > DAILY_BACKUP_HOUR
      || (date.getHours() === DAILY_BACKUP_HOUR && date.getMinutes() >= DAILY_BACKUP_MINUTE);
    if (!reachedWindow) {
      return false;
    }
    return state.lastScheduledSlots?.daily !== getBackupScheduleSlotId('daily', now);
  }

/** shouldRunHourlyBackup：执行对应的业务逻辑。 */
  private shouldRunHourlyBackup(state: ReturnType<typeof readBackupWorkerState>, now: number): boolean {
    return state.lastScheduledSlots?.hourly !== getBackupScheduleSlotId('hourly', now);
  }

/** runLocalScheduledBackup：执行对应的业务逻辑。 */
  private async runLocalScheduledBackup(kind: 'hourly' | 'daily', now: number): Promise<void> {
/** planned：定义该变量以承载业务值。 */
    const planned = planBackup(kind, now);
    this.persistScheduledSlot(kind, now);
/** job：定义该变量以承载业务值。 */
    const job = this.startJob({
      type: 'backup',
      kind,
      backupId: planned.id,
    });
    this.persistSharedRunningJob(this.toJobSnapshot(job)!);
    await this.runLocalBackupJob(job, planned, `游戏服内置 ${kind} 定时备份`);
  }

  private async runLocalBackupJob(
    job: InternalJobState,
    planned: ResolvedBackupRecord,
    label: string,
  ): Promise<void> {
    try {
      await createBackupFile(planned);
      job.status = 'completed';
      this.finishJob(job);
      this.logger.log(`${label}完成：${planned.id}`);
    } catch (error) {
      this.logger.error(`${label}失败: ${error instanceof Error ? error.message : String(error)}`);
      this.failJob(job, error);
    } finally {
/** snapshot：定义该变量以承载业务值。 */
      const snapshot = this.toJobSnapshot(this.lastJob ?? job);
      if (snapshot) {
        this.persistSharedFinishedJob(snapshot);
      }
    }
  }

  private async runLocalRestoreJob(
    job: InternalJobState,
    source: ResolvedBackupRecord,
    preImportBackup: ResolvedBackupRecord,
    label: string,
  ): Promise<void> {
    job.backupId = preImportBackup.id;
    try {
      await createBackupFile(preImportBackup);
      await restoreBackupFile(source.filePath);
      job.status = 'completed';
      await this.finalizeRestoreJob(this.toJobSnapshot(job)!);
      if (this.lastJob?.status === 'completed') {
        this.logger.log(`${label}完成：${source.id} -> ${preImportBackup.id}`);
      }
    } catch (error) {
      this.logger.error(`${label}失败: ${error instanceof Error ? error.message : String(error)}`);
      this.stopRestoreMonitor();
      this.runtimeMaintenance = false;
      this.tickService.resumeRuntimeAfterMaintenance();
      this.failJob(job, error);
    } finally {
/** snapshot：定义该变量以承载业务值。 */
      const snapshot = this.toJobSnapshot(this.lastJob ?? job);
      if (snapshot) {
        this.persistSharedFinishedJob(snapshot);
      }
    }
  }

/** persistScheduledSlot：执行对应的业务逻辑。 */
  private persistScheduledSlot(kind: 'hourly' | 'daily', now: number): void {
/** state：定义该变量以承载业务值。 */
    const state = readBackupWorkerState();
    state.lastScheduledSlots = {
      ...state.lastScheduledSlots,
      [kind]: getBackupScheduleSlotId(kind, now),
    };
    writeBackupWorkerState(state);
  }

/** persistSharedRunningJob：执行对应的业务逻辑。 */
  private persistSharedRunningJob(snapshot: GmDatabaseJobSnapshot): void {
/** state：定义该变量以承载业务值。 */
    const state = readBackupWorkerState();
    state.runningJob = snapshot;
    writeBackupWorkerState(state);
  }

/** persistSharedFinishedJob：执行对应的业务逻辑。 */
  private persistSharedFinishedJob(snapshot: GmDatabaseJobSnapshot): void {
/** state：定义该变量以承载业务值。 */
    const state = readBackupWorkerState();
    if (state.runningJob?.id === snapshot.id) {
      delete state.runningJob;
    }
    state.lastJob = snapshot;
    writeBackupWorkerState(state);
  }

/** recoverInterruptedBackupJobIfNeeded：执行对应的业务逻辑。 */
  private recoverInterruptedBackupJobIfNeeded(): void {
    if (this.hasFreshBackupWorkerHeartbeat()) {
      return;
    }
/** state：定义该变量以承载业务值。 */
    const state = readBackupWorkerState();
    if (state.runningJob?.status !== 'running') {
      return;
    }
    state.lastJob = {
      ...state.runningJob,
      status: 'failed',
      finishedAt: new Date().toISOString(),
      error: state.runningJob.type === 'restore'
        ? '未检测到可用 backup worker，或游戏服本地数据库导入已中断；请重新发起一次导入'
        : '未检测到可用 backup worker，历史备份任务已中断；后续将由游戏服内置兜底恢复自动备份',
    };
    delete state.runningJob;
    writeBackupWorkerState(state);
  }

/** resolveServerFallbackEnabled：执行对应的业务逻辑。 */
  private resolveServerFallbackEnabled(): boolean {
/** raw：定义该变量以承载业务值。 */
    const raw = process.env.DB_BACKUP_SERVER_FALLBACK_ENABLED;
    if (!raw) {
      return true;
    }
    return !['0', 'false', 'no', 'off'].includes(raw.trim().toLowerCase());
  }

  private resolveDevWatchPauseMs(): number {
/** raw：定义该变量以承载业务值。 */
    const raw = Number(process.env.DB_DEV_WATCH_PAUSE_MS ?? 30_000);
    if (!Number.isFinite(raw) || raw <= 0) {
      return 30_000;
    }
    return Math.max(1_000, Math.floor(raw));
  }

  private requestDevWatchPauseWindow(reason: string): void {
    try {
      requestDevWatchPause(this.devWatchPauseMs, reason);
    } catch (error) {
      this.logger.warn(`写入开发态 watch 暂停窗口失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

/** buildScheduleDescription：执行对应的业务逻辑。 */
  private buildScheduleDescription(): GmDatabaseStateRes['schedules'] {
    if (this.hasFreshBackupWorkerHeartbeat()) {
      return {
        hourly: '每小时整点由独立 backup worker 执行',
        daily: `每天 ${String(DAILY_BACKUP_HOUR).padStart(2, '0')}:${String(DAILY_BACKUP_MINUTE).padStart(2, '0')} 由独立 backup worker 执行`,
      };
    }
    if (this.serverFallbackEnabled) {
      return {
        hourly: '每小时整点由游戏服内置兜底执行（当前未检测到独立 backup worker）',
        daily: `每天 ${String(DAILY_BACKUP_HOUR).padStart(2, '0')}:${String(DAILY_BACKUP_MINUTE).padStart(2, '0')} 由游戏服内置兜底执行（当前未检测到独立 backup worker）`,
      };
    }
    return {
      hourly: '每小时整点由独立 backup worker 执行（当前未启用游戏服兜底）',
      daily: `每天 ${String(DAILY_BACKUP_HOUR).padStart(2, '0')}:${String(DAILY_BACKUP_MINUTE).padStart(2, '0')} 由独立 backup worker 执行（当前未启用游戏服兜底）`,
    };
  }

/** resumeRestoreMonitorIfNeeded：执行对应的业务逻辑。 */
  private resumeRestoreMonitorIfNeeded(): void {
/** pendingRestoreRequest：定义该变量以承载业务值。 */
    const pendingRestoreRequest = listBackupRestoreRequests()
      .map((entry) => entry.request.job)
      .find((job) => job.type === 'restore');
/** workerState：定义该变量以承载业务值。 */
    const workerState = readBackupWorkerState();
/** runningRestoreJob：定义该变量以承载业务值。 */
    const runningRestoreJob = workerState.runningJob?.type === 'restore' && workerState.runningJob.status === 'running'
      ? workerState.runningJob
      : null;
/** activeRestoreJob：定义该变量以承载业务值。 */
    const activeRestoreJob = pendingRestoreRequest ?? runningRestoreJob;
    if (!activeRestoreJob) {
      return;
    }
    this.runtimeMaintenance = true;
    this.tickService.suspendRuntimeForMaintenance();
    this.currentJob = this.fromJobSnapshot(activeRestoreJob);
    this.startRestoreMonitor(activeRestoreJob.id);
    this.logger.warn(`检测到未完成数据库导入 ${activeRestoreJob.sourceBackupId ?? activeRestoreJob.id}，继续等待独立 worker 完成`);
  }

/** startRestoreMonitor：执行对应的业务逻辑。 */
  private startRestoreMonitor(jobId: string): void {
    this.pendingRestoreJobId = jobId;
    if (this.restoreMonitorTimer) {
      clearInterval(this.restoreMonitorTimer);
    }
    this.restoreMonitorTimer = setInterval(() => {
      void this.pollRestoreProgress();
    }, this.restoreMonitorIntervalMs);
    void this.pollRestoreProgress();
  }

/** stopRestoreMonitor：执行对应的业务逻辑。 */
  private stopRestoreMonitor(): void {
    if (this.restoreMonitorTimer) {
      clearInterval(this.restoreMonitorTimer);
      this.restoreMonitorTimer = null;
    }
    this.pendingRestoreJobId = null;
  }

/** pollRestoreProgress：执行对应的业务逻辑。 */
  private async pollRestoreProgress(): Promise<void> {
    if (this.restoreMonitorPolling || !this.pendingRestoreJobId) {
      return;
    }
    this.restoreMonitorPolling = true;
    try {
/** expectedJobId：定义该变量以承载业务值。 */
      const expectedJobId = this.pendingRestoreJobId;
/** workerState：定义该变量以承载业务值。 */
      const workerState = readBackupWorkerState();
/** runningJob：定义该变量以承载业务值。 */
      const runningJob = workerState.runningJob;
      if (runningJob?.type === 'restore' && runningJob.id === expectedJobId) {
        this.syncCurrentJob(runningJob);
        return;
      }
/** lastJob：定义该变量以承载业务值。 */
      const lastJob = workerState.lastJob;
      if (lastJob?.type === 'restore' && lastJob.id === expectedJobId && lastJob.status !== 'running') {
        await this.finalizeRestoreJob(lastJob);
      }
    } finally {
      this.restoreMonitorPolling = false;
    }
  }

/** finalizeRestoreJob：执行对应的业务逻辑。 */
  private async finalizeRestoreJob(snapshot: GmDatabaseJobSnapshot): Promise<void> {
/** job：定义该变量以承载业务值。 */
    const job = this.currentJob?.id === snapshot.id ? this.currentJob : this.fromJobSnapshot(snapshot);
    this.syncCurrentJob(snapshot, job);
    this.stopRestoreMonitor();
    try {
      await this.synchronizeSchemaAfterRestore();
      await this.reloadRuntimeFromDatabase();
    } catch (reloadError) {
/** message：定义该变量以承载业务值。 */
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

/** fromJobSnapshot：执行对应的业务逻辑。 */
  private fromJobSnapshot(snapshot: GmDatabaseJobSnapshot): InternalJobState {
    return {
      id: snapshot.id,
      type: snapshot.type,
      status: snapshot.status,
      startedAt: new Date(snapshot.startedAt).getTime(),
      finishedAt: snapshot.finishedAt ? new Date(snapshot.finishedAt).getTime() : undefined,
      kind: snapshot.kind,
      backupId: snapshot.backupId,
      sourceBackupId: snapshot.sourceBackupId,
      error: snapshot.error,
    };
  }

  private syncCurrentJob(snapshot: GmDatabaseJobSnapshot, target = this.currentJob ?? this.fromJobSnapshot(snapshot)): void {
    target.status = snapshot.status;
    target.kind = snapshot.kind;
    target.backupId = snapshot.backupId;
    target.sourceBackupId = snapshot.sourceBackupId;
    target.error = snapshot.error;
    target.finishedAt = snapshot.finishedAt ? new Date(snapshot.finishedAt).getTime() : undefined;
    this.currentJob = target;
  }

  private resolveLatestJobSnapshot(
    left?: GmDatabaseJobSnapshot | null,
    right?: GmDatabaseJobSnapshot | null,
  ): GmDatabaseJobSnapshot | undefined {
    if (!left && !right) {
      return undefined;
    }
    if (!left) {
      return right ?? undefined;
    }
    if (!right) {
      return left;
    }
/** leftTime：定义该变量以承载业务值。 */
    const leftTime = new Date(left.startedAt).getTime();
/** rightTime：定义该变量以承载业务值。 */
    const rightTime = new Date(right.startedAt).getTime();
    return rightTime > leftTime ? right : left;
  }

/** logBackupAutomationModeOnBoot：执行对应的业务逻辑。 */
  private logBackupAutomationModeOnBoot(): void {
    if (this.hasFreshBackupWorkerHeartbeat()) {
/** heartbeat：定义该变量以承载业务值。 */
      const heartbeat = readBackupWorkerHeartbeat()!;
      this.logger.log(`检测到 backup worker 在线：${heartbeat.hostname}#${heartbeat.workerPid}，最近心跳 ${heartbeat.updatedAt}`);
      return;
    }
/** capabilities：定义该变量以承载业务值。 */
    const capabilities = getDatabaseProcessCapabilities();
    if (this.serverFallbackEnabled) {
      if (capabilities.pgDump && capabilities.pgRestore) {
        this.logger.warn('启动时未检测到可用 backup worker；自动整点/每日备份、手动导出与数据库导入将切换为游戏服内置兜底执行');
      } else {
        this.logger.warn('启动时未检测到可用 backup worker；自动整点/每日备份与手动导出将切换为游戏服内置兜底执行。数据库导入仅可在本机同时具备 pg_dump 与 pg_restore 时继续执行');
      }
      return;
    }
/** heartbeat：定义该变量以承载业务值。 */
    const heartbeat = readBackupWorkerHeartbeat();
    if (!heartbeat) {
      this.logger.warn('启动时未检测到 backup worker 心跳；手动数据库备份/导入会失败，自动整点/每日备份也不会继续执行');
      return;
    }

/** heartbeatTime：定义该变量以承载业务值。 */
    const heartbeatTime = new Date(heartbeat.updatedAt).getTime();
    if (!Number.isFinite(heartbeatTime)) {
      this.logger.warn('启动时检测到损坏的 backup worker 心跳文件；请检查 backup worker 是否仍在正常写入状态目录');
      return;
    }

/** ageMs：定义该变量以承载业务值。 */
    const ageMs = Date.now() - heartbeatTime;
    if (ageMs > BACKUP_WORKER_HEARTBEAT_TTL_MS) {
      this.logger.warn(`启动时检测到过期的 backup worker 心跳：${heartbeat.updatedAt}（约 ${this.formatDurationLabel(ageMs)} 前）`);
    }
  }

/** buildBackupWorkerStatusNote：执行对应的业务逻辑。 */
  private buildBackupWorkerStatusNote(): string {
    if (this.hasFreshBackupWorkerHeartbeat()) {
/** heartbeat：定义该变量以承载业务值。 */
      const heartbeat = readBackupWorkerHeartbeat()!;
      return `数据库备份与恢复当前由独立 backup worker 执行；游戏服负责发起请求、维护窗口与展示状态。当前已检测到 backup worker 在线：${heartbeat.hostname}#${heartbeat.workerPid}，最近心跳 ${heartbeat.updatedAt}。`;
    }

/** heartbeat：定义该变量以承载业务值。 */
    const heartbeat = readBackupWorkerHeartbeat();
/** capabilities：定义该变量以承载业务值。 */
    const capabilities = getDatabaseProcessCapabilities();
    if (this.serverFallbackEnabled) {
      if (!heartbeat) {
        if (capabilities.pgDump && capabilities.pgRestore) {
          return '当前未检测到 backup worker 心跳；自动整点/每日备份、手动导出与数据库导入已切换为游戏服内置兜底执行。';
        }
        return '当前未检测到 backup worker 心跳；自动整点/每日备份和手动导出已切换为游戏服内置兜底执行。数据库导入仅可在本机同时具备 pg_dump 与 pg_restore 时继续执行。';
      }
/** heartbeatTime：定义该变量以承载业务值。 */
      const heartbeatTime = new Date(heartbeat.updatedAt).getTime();
      if (!Number.isFinite(heartbeatTime)) {
        if (capabilities.pgDump && capabilities.pgRestore) {
          return '当前检测到损坏的 backup worker 心跳文件；自动备份与数据库导入已切换为游戏服内置兜底执行。';
        }
        return '当前检测到损坏的 backup worker 心跳文件；自动备份已切换为游戏服内置兜底执行。数据库导入仅可在本机同时具备 pg_dump 与 pg_restore 时继续执行。';
      }
/** ageMs：定义该变量以承载业务值。 */
      const ageMs = Date.now() - heartbeatTime;
      if (capabilities.pgDump && capabilities.pgRestore) {
        return `backup worker 心跳已过期，最后一次心跳在 ${heartbeat.updatedAt}（约 ${this.formatDurationLabel(ageMs)} 前）；自动备份与数据库导入已切换为游戏服内置兜底执行。`;
      }
      return `backup worker 心跳已过期，最后一次心跳在 ${heartbeat.updatedAt}（约 ${this.formatDurationLabel(ageMs)} 前）；自动备份已切换为游戏服内置兜底执行。数据库导入仅可在本机同时具备 pg_dump 与 pg_restore 时继续执行。`;
    }

    if (!heartbeat) {
      return '当前未检测到 backup worker 心跳；手动导出/导入会直接失败，自动整点/每日备份当前也不会继续执行。';
    }

/** heartbeatTime：定义该变量以承载业务值。 */
    const heartbeatTime = new Date(heartbeat.updatedAt).getTime();
    if (!Number.isFinite(heartbeatTime)) {
      return '当前检测到损坏的 backup worker 心跳文件；请检查 backup worker 是否与游戏服共享同一备份目录，并确认其状态文件可正常写入。';
    }

/** ageMs：定义该变量以承载业务值。 */
    const ageMs = Date.now() - heartbeatTime;
    return `backup worker 心跳已过期，最后一次心跳在 ${heartbeat.updatedAt}（约 ${this.formatDurationLabel(ageMs)} 前）；这通常意味着 worker 已卡死、退出，或写到了错误的数据目录。`;
  }

/** formatDurationLabel：执行对应的业务逻辑。 */
  private formatDurationLabel(durationMs: number): string {
/** totalSeconds：定义该变量以承载业务值。 */
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    if (totalSeconds < 60) {
      return `${totalSeconds} 秒`;
    }
/** totalMinutes：定义该变量以承载业务值。 */
    const totalMinutes = Math.floor(totalSeconds / 60);
    if (totalMinutes < 60) {
/** seconds：定义该变量以承载业务值。 */
      const seconds = totalSeconds % 60;
      return seconds > 0 ? `${totalMinutes} 分 ${seconds} 秒` : `${totalMinutes} 分`;
    }
/** totalHours：定义该变量以承载业务值。 */
    const totalHours = Math.floor(totalMinutes / 60);
/** minutes：定义该变量以承载业务值。 */
    const minutes = totalMinutes % 60;
    if (totalHours < 24) {
      return minutes > 0 ? `${totalHours} 小时 ${minutes} 分` : `${totalHours} 小时`;
    }
/** days：定义该变量以承载业务值。 */
    const days = Math.floor(totalHours / 24);
/** hours：定义该变量以承载业务值。 */
    const hours = totalHours % 24;
    return hours > 0 ? `${days} 天 ${hours} 小时` : `${days} 天`;
  }
}
