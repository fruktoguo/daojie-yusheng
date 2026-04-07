import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  GmDatabaseBackupKind,
  GmDatabaseBackupRecord,
  GmDatabaseJobSnapshot,
  GmDatabaseStateRes,
  GmTriggerDatabaseBackupRes,
} from '@mud/shared';
import { RedisService } from '../database/redis.service';
import { BotService } from './bot.service';
import {
  BACKUP_WORKER_HEARTBEAT_TTL_MS,
  DAILY_BACKUP_HOUR,
  DAILY_BACKUP_MINUTE,
  DAILY_BACKUP_RETENTION,
  ensureBackupWorkspace,
  createTimestampId,
  findBackupById,
  HOURLY_BACKUP_RETENTION,
  listBackupRestoreRequests,
  listBackups,
  readBackupWorkerHeartbeat,
  readBackupWorkerState,
  type ResolvedBackupRecord,
  writeBackupManualRequest,
  writeBackupRestoreRequest,
} from './database-backup-shared';
import { GmService } from './gm.service';
import { LootService } from './loot.service';
import { MapService } from './map.service';
import { MarketService } from './market.service';
import { NavigationService } from './navigation.service';
import { PlayerService } from './player.service';
import { TickService } from './tick.service';
import { WorldService } from './world.service';

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

@Injectable()
export class DatabaseBackupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseBackupService.name);
  private readonly restoreMonitorIntervalMs = 1_000;
  private currentJob: InternalJobState | null = null;
  private lastJob: InternalJobState | null = null;
  private runtimeMaintenance = false;
  private restoreMonitorTimer: ReturnType<typeof setInterval> | null = null;
  private restoreMonitorPolling = false;
  private pendingRestoreJobId: string | null = null;

  constructor(
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
    ensureBackupWorkspace();
    this.logBackupWorkerAvailabilityOnBoot();
    this.resumeRestoreMonitorIfNeeded();
  }

  onModuleDestroy(): void {
    this.stopRestoreMonitor();
  }

  isRuntimeMaintenanceActive(): boolean {
    return this.runtimeMaintenance;
  }

  async getState(): Promise<GmDatabaseStateRes> {
    const workerState = readBackupWorkerState();
    const workerStatusNote = this.buildBackupWorkerStatusNote();
    return {
      backups: await this.listBackups(),
      runningJob: this.toJobSnapshot(this.currentJob) ?? workerState.runningJob,
      lastJob: this.resolveLatestJobSnapshot(this.toJobSnapshot(this.lastJob), workerState.lastJob),
      note: `正式数据库备份与恢复由独立 backup worker 执行，游戏服只负责发起请求、维护窗口、展示状态与下载产物。${workerStatusNote}`,
      retention: {
        hourly: HOURLY_BACKUP_RETENTION,
        daily: DAILY_BACKUP_RETENTION,
      },
      schedules: {
        hourly: '每小时整点由独立 backup worker 执行',
        daily: `每天 ${String(DAILY_BACKUP_HOUR).padStart(2, '0')}:${String(DAILY_BACKUP_MINUTE).padStart(2, '0')} 由独立 backup worker 执行`,
      },
    };
  }

  triggerManualBackup(): GmTriggerDatabaseBackupRes {
    if (this.currentJob?.status === 'running') {
      throw new Error(`当前已有数据库任务执行中：${this.describeJob(this.currentJob)}`);
    }
    const workerState = readBackupWorkerState();
    if (workerState.runningJob?.status === 'running') {
      throw new Error('当前已有数据库任务执行中，请稍后再试');
    }
    this.assertBackupWorkerAvailable();
    const now = Date.now();
    const backupId = createTimestampId(now, 'manual');
    const job: GmDatabaseJobSnapshot = {
      id: createTimestampId(now, 'backup'),
      type: 'backup',
      status: 'running',
      startedAt: new Date(now).toISOString(),
      kind: 'manual',
      backupId,
    };
    writeBackupManualRequest({
      job,
      requestedAt: job.startedAt,
    });
    return { job };
  }

  async triggerRestore(backupId: string): Promise<GmTriggerDatabaseBackupRes> {
    const source = this.getBackupByIdOrThrow(backupId);
    const workerState = readBackupWorkerState();
    if (workerState.runningJob?.status === 'running') {
      throw new Error('当前已有数据库任务执行中，请稍后再试');
    }
    this.assertBackupWorkerAvailable();
    const job = this.startJob({
      type: 'restore',
      sourceBackupId: source.id,
    });
    this.runtimeMaintenance = true;
    try {
      await this.prepareRuntimeForRestore();
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

  async listBackups(): Promise<GmDatabaseBackupRecord[]> {
    return listBackups();
  }

  getBackupDownloadRecord(backupId: string): GmDatabaseBackupRecord & { filePath: string } {
    return this.getBackupByIdOrThrow(backupId);
  }

  private finishJob(job: InternalJobState): void {
    job.finishedAt = Date.now();
    this.lastJob = { ...job };
    if (this.currentJob?.id === job.id) {
      this.currentJob = null;
    }
  }

  private failJob(job: InternalJobState, error: unknown): void {
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : String(error);
    this.finishJob(job);
  }

  private startJob(input: Pick<InternalJobState, 'type' | 'kind' | 'backupId' | 'sourceBackupId'>): InternalJobState {
    if (this.currentJob?.status === 'running') {
      throw new Error(`当前已有数据库任务执行中：${this.describeJob(this.currentJob)}`);
    }
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

  private async flushRuntimePersistence(): Promise<void> {
    await Promise.all([
      this.playerService.persistAll(),
      this.mapService.persistTileRuntimeStates(),
      this.lootService.persistRuntimeState(),
      this.worldService.persistMonsterRuntimeState(),
    ]);
  }

  private getBackupByIdOrThrow(backupId: string): ResolvedBackupRecord {
    const backup = findBackupById(backupId);
    if (!backup) {
      throw new Error('目标备份不存在');
    }
    return backup;
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

  private assertBackupWorkerAvailable(): void {
    const heartbeat = readBackupWorkerHeartbeat();
    if (!heartbeat) {
      throw new Error('当前未检测到独立数据库 worker，请先启动 backup worker 后再执行数据库任务');
    }
    const heartbeatTime = new Date(heartbeat.updatedAt).getTime();
    if (!Number.isFinite(heartbeatTime) || Date.now() - heartbeatTime > BACKUP_WORKER_HEARTBEAT_TTL_MS) {
      throw new Error('独立数据库 worker 心跳已过期，请先检查 backup worker 是否仍在运行');
    }
  }

  private resumeRestoreMonitorIfNeeded(): void {
    const pendingRestoreRequest = listBackupRestoreRequests()
      .map((entry) => entry.request.job)
      .find((job) => job.type === 'restore');
    const workerState = readBackupWorkerState();
    const runningRestoreJob = workerState.runningJob?.type === 'restore' && workerState.runningJob.status === 'running'
      ? workerState.runningJob
      : null;
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

  private stopRestoreMonitor(): void {
    if (this.restoreMonitorTimer) {
      clearInterval(this.restoreMonitorTimer);
      this.restoreMonitorTimer = null;
    }
    this.pendingRestoreJobId = null;
  }

  private async pollRestoreProgress(): Promise<void> {
    if (this.restoreMonitorPolling || !this.pendingRestoreJobId) {
      return;
    }
    this.restoreMonitorPolling = true;
    try {
      const expectedJobId = this.pendingRestoreJobId;
      const workerState = readBackupWorkerState();
      const runningJob = workerState.runningJob;
      if (runningJob?.type === 'restore' && runningJob.id === expectedJobId) {
        this.syncCurrentJob(runningJob);
        return;
      }
      const lastJob = workerState.lastJob;
      if (lastJob?.type === 'restore' && lastJob.id === expectedJobId && lastJob.status !== 'running') {
        await this.finalizeRestoreJob(lastJob);
      }
    } finally {
      this.restoreMonitorPolling = false;
    }
  }

  private async finalizeRestoreJob(snapshot: GmDatabaseJobSnapshot): Promise<void> {
    const job = this.currentJob?.id === snapshot.id ? this.currentJob : this.fromJobSnapshot(snapshot);
    this.syncCurrentJob(snapshot, job);
    this.stopRestoreMonitor();
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
    const leftTime = new Date(left.startedAt).getTime();
    const rightTime = new Date(right.startedAt).getTime();
    return rightTime > leftTime ? right : left;
  }

  private logBackupWorkerAvailabilityOnBoot(): void {
    const heartbeat = readBackupWorkerHeartbeat();
    if (!heartbeat) {
      this.logger.warn('启动时未检测到 backup worker 心跳；手动数据库备份/导入会失败，自动整点/每日备份也不会继续执行');
      return;
    }

    const heartbeatTime = new Date(heartbeat.updatedAt).getTime();
    if (!Number.isFinite(heartbeatTime)) {
      this.logger.warn('启动时检测到损坏的 backup worker 心跳文件；请检查 backup worker 是否仍在正常写入状态目录');
      return;
    }

    const ageMs = Date.now() - heartbeatTime;
    if (ageMs > BACKUP_WORKER_HEARTBEAT_TTL_MS) {
      this.logger.warn(`启动时检测到过期的 backup worker 心跳：${heartbeat.updatedAt}（约 ${this.formatDurationLabel(ageMs)} 前）`);
      return;
    }

    this.logger.log(`检测到 backup worker 在线：${heartbeat.hostname}#${heartbeat.workerPid}，最近心跳 ${heartbeat.updatedAt}`);
  }

  private buildBackupWorkerStatusNote(): string {
    const heartbeat = readBackupWorkerHeartbeat();
    if (!heartbeat) {
      return ' 当前未检测到 backup worker 心跳；这通常意味着独立备份进程或容器没有在跑，手动导出/导入会直接失败，自动整点/每日备份当前也不会继续执行。';
    }

    const heartbeatTime = new Date(heartbeat.updatedAt).getTime();
    if (!Number.isFinite(heartbeatTime)) {
      return ' 当前检测到损坏的 backup worker 心跳文件；请检查 backup worker 是否与游戏服共享同一备份目录，并确认其状态文件可正常写入。';
    }

    const ageMs = Date.now() - heartbeatTime;
    if (ageMs > BACKUP_WORKER_HEARTBEAT_TTL_MS) {
      return ` backup worker 心跳已过期，最后一次心跳在 ${heartbeat.updatedAt}（约 ${this.formatDurationLabel(ageMs)} 前）；这通常意味着 worker 已卡死、退出，或写到了错误的数据目录。`;
    }

    return ` 当前已检测到 backup worker 在线：${heartbeat.hostname}#${heartbeat.workerPid}，最近心跳 ${heartbeat.updatedAt}。`;
  }

  private formatDurationLabel(durationMs: number): string {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    if (totalSeconds < 60) {
      return `${totalSeconds} 秒`;
    }
    const totalMinutes = Math.floor(totalSeconds / 60);
    if (totalMinutes < 60) {
      const seconds = totalSeconds % 60;
      return seconds > 0 ? `${totalMinutes} 分 ${seconds} 秒` : `${totalMinutes} 分`;
    }
    const totalHours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (totalHours < 24) {
      return minutes > 0 ? `${totalHours} 小时 ${minutes} 分` : `${totalHours} 小时`;
    }
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return hours > 0 ? `${days} 天 ${hours} 小时` : `${days} 天`;
  }
}
