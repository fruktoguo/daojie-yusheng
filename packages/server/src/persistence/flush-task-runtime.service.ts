/**
 * 本文件属于持久化边界，负责 flush 运行时、兼容转换或失败策略等数据可靠性逻辑。
 *
 * 维护时要优先考虑幂等、崩溃恢复和数据库真源，避免在 tick 内直接引入阻塞 IO。
 *
 * 模块级常量、接口定义与游离函数已拆至 ./flush-task-runtime.helpers.ts。
 */
import { Inject, Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { shouldStartAuthoritativeRuntime, shouldStartInlineFlushConsumer } from '../config/runtime-role';
import { StartupBarrierService } from '../lifecycle/startup-barrier.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { buildInstanceDomainRecoveryWatermark, buildTimeCheckpointSnapshot } from '../runtime/world/world-runtime-persistence-state.service';
import { DatabasePoolProvider } from './database-pool.provider';
import { FlushDiagnosticsService } from './flush-diagnostics.service';
import { classifyFlushFailure, isNonRecoverableReplayInstancePayloadError, isNonRecoverableReplayPlayerPayloadError, resolveFlushRetryDelayMs } from './flush-failure-policy';
import { FlushLedgerService, type FlushTaskUpsertResult } from './flush-ledger.service';
import { FlushWakeupService } from './flush-wakeup.service';
import { isFlushTaskConsumerMode, isInlineFlushTaskRuntimeMode } from './flush-task-runtime-mode';
import type { FlushTask, FlushTaskPriority, FlushTaskScope } from './flush-task.types';
import type { InstanceFlushLedgerClaim } from './instance-flush-ledger-fence';
import { InstanceCatalogService } from './instance-catalog.service';
import {
  PlayerDomainPersistenceService,
  nextPlayerPersistenceVersion,
  isConvergedPlayerProjectionFenceError,
  isConvergedPlayerPresenceFenceError,
} from './player-domain-persistence.service';
import { PlayerPersistenceFlushService } from './player-persistence-flush.service';
import {
  ASSET_CONFLICT_REPAIR_INTERVAL_MS,
  buildInstanceFlushSnapshotFromPayload,
  buildInstancePayloadFencingToken,
  buildInstanceTaskLedgerClaim,
  buildPlayerPayloadFencingToken,
  CLAIM_LIMIT,
  COALESCE_MS,
  dedupeByLast,
  dedupeStagingFlushTaskIdentities,
  findNonReplayableInstancePayloadError,
  findNonReplayablePlayerPayloadError,
  FLUSH_WAITING_LIMIT,
  formatError,
  groupInstanceTasksByRuntime,
  groupTasksById,
  hasCompletePlayerRuntimeFence,
  INSTANCE_BUILDING_COMPOSITE_DOMAINS,
  INSTANCE_CLAIM_LIMIT,
  INSTANCE_DOMAIN_DELTA_PAYLOAD_KIND,
  INSTANCE_DOMAIN_STATE_PAYLOAD_KIND,
  INSTANCE_HIGH_CLAIM_LIMIT,
  INSTANCE_LOW_CLAIM_LIMIT,
  INSTANCE_LOW_PRIORITY_DOMAINS,
  INSTANCE_NORMAL_CLAIM_LIMIT,
  INSTANCE_NORMAL_PRIORITY_DOMAINS,
  INSTANCE_PARALLELISM,
  INSTANCE_PAYLOAD_BATCH_DOMAINS,
  INSTANCE_PAYLOAD_STATE_DOMAINS,
  INSTANCE_COALESCE_DOMAINS,
  instanceGroupKey,
  instanceStageThrottleKey,
  instanceTaskKey,
  INTERVAL_MS,
  isPayloadRevisionCurrent,
  isPlayerPayloadVersionCurrent,
  isStaleGroundItemStatePayloadError,
  keyedString,
  MONSTER_RUNTIME_MS,
  NON_RECOVERABLE_PLAYER_QUIET_AFTER,
  NON_RECOVERABLE_PLAYER_RETRY_DELAY_MS,
  normalizeBuildingRoomFengShuiDomains,
  normalizeBuildingRoomFengShuiPayload,
  normalizeDomains,
  normalizeInstanceDomainDeltaPayload,
  normalizeInstanceDomainStatePayload,
  normalizeInstanceFlushSnapshot,
  normalizeInt,
  normalizeNullableString,
  normalizeOptionalRevision,
  normalizePayloadStagedDomains,
  normalizePlayerPresencePayload,
  normalizePlayerSnapshotProjectionPayload,
  normalizeString,
  PAYLOAD_CLAIM_RENEW_TTL_MS,
  PLAYER_BACKGROUND_COALESCE_MS,
  PLAYER_CLAIM_LIMIT,
  PLAYER_FALLBACK_SNAPSHOT_DOMAIN,
  PLAYER_GROUPED_CLAIM_DOMAINS,
  PLAYER_GROUPED_CLAIM_DOMAIN_SET,
  PLAYER_HIGH_CLAIM_LIMIT,
  PLAYER_HIGH_PRIORITY_DOMAINS,
  PLAYER_LOCATION_COALESCE_MS,
  PLAYER_LOW_CLAIM_LIMIT,
  PLAYER_NORMAL_CLAIM_LIMIT,
  PLAYER_PARALLELISM,
  PLAYER_PRESENCE_COALESCE_MS,
  PLAYER_PRESENCE_PAYLOAD_KIND,
  PLAYER_PROJECTABLE_DOMAIN_SET,
  PLAYER_SNAPSHOT_PROJECTION_PAYLOAD_KIND,
  playerGroupKey,
  playerStageThrottleKey,
  playerTaskKey,
  pruneExpiredStageThrottleEntries,
  readInt,
  resolveFlushTaskPriority,
  resolveInstanceStageDelayMs,
  resolvePlayerPayloadRuntimeOwnerId,
  resolvePlayerStageDelayMs,
  resolveRevision,
  RETRY_DELAY_MS,
  runConcurrent,
  selectBuildingRoomFengShuiPayload,
  serializeDomainRevisions,
  SHUTDOWN_PAYLOAD_REPLAY_TIMEOUT_MS,
  SHUTDOWN_STAGING_MAX_ROUNDS,
  STAGING_BATCH_SIZE,
  stagingFlushTaskIdentityKey,
  stagingFlushTaskKey,
  STALE_PAYLOAD_ABANDON_THRESHOLD,
  STARTUP_PAYLOAD_REPLAY_POLL_MS,
  STARTUP_PAYLOAD_REPLAY_TIMEOUT_MS,
  sumProcessedCounts,
  TIME_CHECKPOINT_MS,
  waitForReplayPoll,
  type BatchPersistencePort,
  type InstanceDomainDeltaPayload,
  type InstanceDomainStatePayload,
  type InstanceFlushSnapshotView,
  type InstanceRuntimeView,
  type PlayerPayloadMetadata,
  type PlayerPersistenceFlushPort,
  type PlayerPresenceFlushPayload,
  type PlayerProjectionFenceDecision,
  type PlayerRuntimeFlushTaskPort,
  type PlayerSnapshotProjectionPayload,
  type PreparedInstancePayload,
  type WorldRuntimeFlushTaskPort,
} from './flush-task-runtime.helpers';

@Injectable()
export class FlushTaskRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FlushTaskRuntimeService.name);
  private readonly workerId = `flush-task-runtime:${process.pid}:${randomUUID()}`;
  private readonly stagingGenerationId = randomUUID();
  private timer: NodeJS.Timeout | null = null;
  private stagingTimer: NodeJS.Timeout | null = null;
  private running: Promise<number> | null = null;
  private staging: Promise<void> | null = null;
  private replayTail: Promise<void> = Promise.resolve();
  private readonly replayInFlight = new Set<Promise<number>>();
  private shutdownDrainPromise: Promise<void> | null = null;
  private shutdownDrainStarted = false;
  private readonly stagedContainerRevisionByInstanceId = new Map<string, number>();
  private readonly nextPlayerStageAtByKey = new Map<string, number>();
  // 最近一次成功暂存的 presence session epoch：session epoch 变化时必须立即可认领，
  // 与投影任务同时就绪，避免新会话投影先于 presence 落库造成 indeterminate 围栏回滚。
  private readonly lastStagedPresenceEpochByPlayerId = new Map<string, number>();
  private readonly nextInstanceStageAtByKey = new Map<string, number>();
  private globalBackoffUntilAt = 0;
  private nextAssetConflictRepairAt = 0;
  private readonly failureAttempts = new Map<string, number>();

  constructor(
    @Inject(PlayerRuntimeService) private readonly playerRuntimeService: PlayerRuntimeFlushTaskPort,
    @Inject(WorldRuntimeService) private readonly worldRuntimeService: WorldRuntimeFlushTaskPort,
    @Inject(PlayerPersistenceFlushService) private readonly playerPersistenceFlushService: PlayerPersistenceFlushPort,
    private readonly flushLedgerService: FlushLedgerService,
    private readonly flushWakeupService: FlushWakeupService,
    @Optional() @Inject(DatabasePoolProvider) private readonly databasePoolProvider?: DatabasePoolProvider,
    @Optional() @Inject(FlushDiagnosticsService) private readonly flushDiagnostics?: FlushDiagnosticsService,
    @Optional() @Inject(PlayerDomainPersistenceService) private readonly playerDomainPersistenceService?: PlayerDomainPersistenceService,
    @Optional() @Inject(StartupBarrierService) private readonly startupBarrierService?: StartupBarrierService,
    @Optional() @Inject(InstanceCatalogService) private readonly instanceCatalogService?: InstanceCatalogService,
  ) {}

  onModuleInit(): void {
    this.logger.log('统一刷盘任务运行时已注册，等待启动链路编排器开闸');
  }

  startForLifecycleCoordinator(): void {
    if (isInlineFlushTaskRuntimeMode() && shouldStartInlineFlushConsumer()) {
      if (this.timer) {
        return;
      }
      this.timer = setInterval(() => {
        void this.runOnce().catch((error) => {
          this.logger.error('统一刷盘任务周期失败', formatError(error));
        });
      }, INTERVAL_MS);
      this.timer.unref();
      this.logger.log(
        `统一刷盘任务运行时已启动，间隔 ${INTERVAL_MS}ms playerLimit=${PLAYER_CLAIM_LIMIT}(high=${PLAYER_HIGH_CLAIM_LIMIT},normal=${PLAYER_NORMAL_CLAIM_LIMIT},low=${PLAYER_LOW_CLAIM_LIMIT}) instanceLimit=${INSTANCE_CLAIM_LIMIT}(high=${INSTANCE_HIGH_CLAIM_LIMIT},normal=${INSTANCE_NORMAL_CLAIM_LIMIT},low=${INSTANCE_LOW_CLAIM_LIMIT}) playerParallelism=${PLAYER_PARALLELISM} instanceParallelism=${INSTANCE_PARALLELISM}`,
      );
      return;
    }
    if (shouldStartAuthoritativeRuntime()) {
      if (this.stagingTimer) {
        return;
      }
      this.stagingTimer = setInterval(() => {
        void this.stageDirtyTasksOnce().catch(() => undefined);
      }, INTERVAL_MS);
      this.stagingTimer.unref();
      this.logger.log(`统一刷盘暂存收集器已启动，间隔 ${INTERVAL_MS}ms，不在当前 role 消费刷盘任务`);
      return;
    }
    this.logger.log('统一刷盘任务运行时未启用 inline consumer，保留当前配置模式');
  }

  onModuleDestroy(): void {
    this.stopTimers();
  }

  /**
   * runtime freeze 后执行最后一次 dirty 转存与 durable payload 清空。
   * 任一在途任务、staging、replay 或 pending 校验失败都会向上抛出，交由关机协调器保留 lease。
   */
  async drainForShutdown(): Promise<void> {
    if (this.shutdownDrainPromise) {
      return this.shutdownDrainPromise;
    }
    this.shutdownDrainStarted = true;
    this.stopTimers();
    this.shutdownDrainPromise = this.runShutdownDrain();
    return this.shutdownDrainPromise;
  }

  private async runShutdownDrain(): Promise<void> {
    const failures: unknown[] = [];
    const inFlight = Array.from(new Set<Promise<unknown>>([
      ...(this.staging ? [this.staging] : []),
      ...(this.running ? [this.running] : []),
      this.replayTail,
      ...this.replayInFlight,
    ]));
    const results = await Promise.allSettled(inFlight);
    for (const result of results) {
      if (result.status === 'rejected') {
        failures.push(result.reason);
        this.logger.error('统一刷盘关机 drain 等待中的任务失败', formatError(result.reason));
      }
    }

    if (this.flushLedgerService.isEnabled()) {
      if (shouldStartAuthoritativeRuntime()) {
        try {
          let superseded = 0;
          for (let round = 1; round <= SHUTDOWN_STAGING_MAX_ROUNDS; round += 1) {
            superseded = await this.runStagingCycle({ bypassFlushBarrier: true });
            if (superseded === 0) {
              break;
            }
          }
          if (superseded > 0) {
            throw new Error(
              `flush_task_shutdown_staging_superseded:pending=${superseded}:rounds=${SHUTDOWN_STAGING_MAX_ROUNDS}`,
            );
          }
        } catch (error) {
          failures.push(error);
          this.logger.error('统一刷盘关机最终 staging 失败', formatError(error));
        }
      }
      try {
        await this.enqueueDurablePayloadReplay({
          timeoutMs: SHUTDOWN_PAYLOAD_REPLAY_TIMEOUT_MS,
        });
      } catch (error) {
        failures.push(error);
        this.logger.error('统一刷盘关机 durable payload replay 失败', formatError(error));
      }
      try {
        const pending = await this.flushLedgerService.countPendingPayloadTasks();
        if (pending > 0) {
          const error = new Error(`shutdown_durable_payload_pending:${pending}`);
          failures.push(error);
          this.logger.error('统一刷盘关机后仍有 durable payload 未完成', formatError(error));
        }
      } catch (error) {
        failures.push(error);
        this.logger.error('统一刷盘关机 pending 复核失败', formatError(error));
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(failures, `flush_task_shutdown_drain_failed:count=${failures.length}`);
    }
  }

  private stopTimers(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.stagingTimer) {
      clearInterval(this.stagingTimer);
      this.stagingTimer = null;
    }
  }

  stageDirtyTasksOnce(): Promise<void> {
    if (this.shutdownDrainStarted) {
      return Promise.resolve();
    }
    if (this.staging) {
      return this.staging;
    }
    const staging = this.runStagingCycle()
      .then(() => undefined)
      .catch((error) => {
        const failure = classifyFlushFailure(error);
        this.recordFlushFailure('instance', 'staging', 'batch', failure, 1, 0);
        this.logger.error(`统一刷盘 staging 失败 category=${failure.category}`, formatError(error));
        throw error;
      })
      .finally(() => {
        if (this.staging === staging) {
          this.staging = null;
        }
      });
    this.staging = staging;
    return staging;
  }

  /**
   * 在权威运行态恢复/实例 ownership epoch 自增前 drain durable payload。
   * 该入口刻意绕过 startup barrier 与普通 consumer mode，但绝不允许 runtime fallback。
   */
  replayDurablePayloadsBeforeRecovery(input?: {
    instanceId?: string | null;
    ownershipEpoch?: number | null;
    timeoutMs?: number;
  }): Promise<number> {
    if (this.shutdownDrainStarted) {
      return Promise.reject(new Error('flush_task_runtime_shutting_down'));
    }
    return this.enqueueDurablePayloadReplay(input, { allowOfflineAssetConflictFenceRebase: true });
  }

  private enqueueDurablePayloadReplay(input?: {
    instanceId?: string | null;
    ownershipEpoch?: number | null;
    timeoutMs?: number;
  }, options: {
    allowOfflineAssetConflictFenceRebase?: boolean;
  } = {}): Promise<number> {
    const run = async (): Promise<number> => this.runDurablePayloadReplay(input, options);
    const replay = this.replayTail.then(run, run);
    this.replayInFlight.add(replay);
    void replay.then(
      () => { this.replayInFlight.delete(replay); },
      () => { this.replayInFlight.delete(replay); },
    );
    this.replayTail = replay.then(() => undefined, () => undefined);
    return replay;
  }

  private async runDurablePayloadReplay(input?: {
    instanceId?: string | null;
    ownershipEpoch?: number | null;
    timeoutMs?: number;
  }, options: {
    allowOfflineAssetConflictFenceRebase?: boolean;
  } = {}): Promise<number> {
    if (!this.flushLedgerService.isEnabled()) {
      return 0;
    }
    const instanceId = normalizeNullableString(input?.instanceId);
    const ownershipEpoch = input?.ownershipEpoch === null || input?.ownershipEpoch === undefined
      ? null
      : normalizeInt(input.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER);
    const timeoutMs = normalizeInt(
      input?.timeoutMs,
      STARTUP_PAYLOAD_REPLAY_TIMEOUT_MS,
      5_000,
      300_000,
    );
    const deadline = Date.now() + timeoutMs;
    const countFilter = instanceId
      ? { scope: 'instance' as const, id: instanceId, ownershipEpoch }
      : undefined;
    const workerId = `${this.workerId}:pre-recovery`;
    if (!instanceId) {
      await this.tryRepairPlayerAssetConflictQuarantines(
        undefined,
        options.allowOfflineAssetConflictFenceRebase === true,
      );
    }
    let processedTotal = instanceId
      ? 0
      : await this.replayPlayerPresencePayloadsBeforeProjection(workerId, deadline);
    let stalledRounds = 0;
    while (true) {
      const pendingBefore = await this.flushLedgerService.countPendingPayloadTasks(countFilter);
      if (pendingBefore <= 0) {
        return processedTotal;
      }
      if (Date.now() >= deadline) {
        throw new Error(`durable_payload_replay_timeout:pending=${pendingBefore}:instanceId=${instanceId ?? 'all'}:epoch=${ownershipEpoch ?? 'all'}`);
      }
      const playerTasks = instanceId
        ? []
        : typeof this.flushLedgerService.claimReadyPlayerFlushTaskGroups === 'function'
          ? await this.flushLedgerService.claimReadyPlayerFlushTaskGroups({
              workerId,
              limit: STAGING_BATCH_SIZE,
              claimTtlMs: PAYLOAD_CLAIM_RENEW_TTL_MS,
              payloadRequired: true,
              includeDelayed: true,
              includedDomains: PLAYER_GROUPED_CLAIM_DOMAINS,
            })
          : await this.flushLedgerService.claimReadyFlushTasks({
              workerId,
              scope: 'player',
              limit: STAGING_BATCH_SIZE,
              claimTtlMs: PAYLOAD_CLAIM_RENEW_TTL_MS,
              payloadRequired: true,
              includeDelayed: true,
            });
      const instanceTasks = await this.flushLedgerService.claimReadyFlushTasks({
        workerId,
        scope: 'instance',
        id: instanceId,
        ...(ownershipEpoch !== null ? { ownershipEpoch } : {}),
        limit: STAGING_BATCH_SIZE,
        claimTtlMs: PAYLOAD_CLAIM_RENEW_TTL_MS,
        payloadRequired: true,
        includeDelayed: true,
      });
      const playerReplay = await this.quarantineNonReplayablePlayerStartupPayloads(playerTasks);
      const instanceReplay = await this.quarantineNonReplayableInstanceStartupPayloads(instanceTasks);
      const replayablePlayerTasks = playerReplay.tasks;
      const replayableInstanceTasks = instanceReplay.tasks;
      const claimedCount = playerTasks.length + instanceTasks.length;
      processedTotal += playerReplay.quarantined + instanceReplay.quarantined;
      if (replayablePlayerTasks.length > 0) {
        processedTotal += await this.processPlayerTasks(replayablePlayerTasks, {
          failFastDeterministicPayload: true,
          preserveTechniqueComprehensionTruthOnEmptyOverwrite: true,
          allowOfflineAssetConflictFenceRebase: options.allowOfflineAssetConflictFenceRebase === true,
        });
      }
      if (replayableInstanceTasks.length > 0) {
        processedTotal += await this.processInstanceTasks(replayableInstanceTasks, { failFastDeterministicPayload: true });
      }
      if (!instanceId) {
        // 本轮可能刚把新的跨玩家实例冲突隔离；立即尝试一次安全换 ID，避免把它
        // 留到下一次进程重启才有机会恢复。
        await this.tryRepairPlayerAssetConflictQuarantines(
          undefined,
          options.allowOfflineAssetConflictFenceRebase === true,
        );
      }
      const pendingAfter = await this.flushLedgerService.countPendingPayloadTasks(countFilter);
      if (pendingAfter <= 0) {
        return processedTotal;
      }
      if (pendingAfter < pendingBefore) {
        stalledRounds = 0;
      } else if (claimedCount > 0) {
        stalledRounds += 1;
        if (stalledRounds >= 3) {
          throw new Error(
            `durable_payload_replay_stalled:pending=${pendingAfter}:instanceId=${instanceId ?? 'all'}:epoch=${ownershipEpoch ?? 'all'}:rounds=${stalledRounds}`,
          );
        }
      }
      if (claimedCount === 0 || pendingAfter >= pendingBefore) {
        await waitForReplayPoll(STARTUP_PAYLOAD_REPLAY_POLL_MS);
      }
    }
  }

  private async replayPlayerPresencePayloadsBeforeProjection(
    workerId: string,
    deadline: number,
  ): Promise<number> {
    const countFilter = { scope: 'player' as const, domain: 'presence' };
    let processedTotal = 0;
    let stalledRounds = 0;
    while (true) {
      const pendingBefore = await this.flushLedgerService.countPendingPayloadTasks(countFilter);
      if (pendingBefore <= 0) {
        return processedTotal;
      }
      if (Date.now() >= deadline) {
        throw new Error(`durable_payload_replay_timeout:phase=player_presence:pending=${pendingBefore}`);
      }
      const tasks = await this.flushLedgerService.claimReadyFlushTasks({
        workerId,
        scope: 'player',
        domain: 'presence',
        limit: STAGING_BATCH_SIZE,
        claimTtlMs: PAYLOAD_CLAIM_RENEW_TTL_MS,
        payloadRequired: true,
        includeDelayed: true,
      });
      const replay = await this.quarantineNonReplayablePlayerStartupPayloads(tasks);
      processedTotal += replay.quarantined;
      if (replay.tasks.length > 0) {
        processedTotal += await this.processPlayerTasks(replay.tasks, { failFastDeterministicPayload: true });
      }
      const pendingAfter = await this.flushLedgerService.countPendingPayloadTasks(countFilter);
      if (pendingAfter <= 0) {
        return processedTotal;
      }
      if (pendingAfter < pendingBefore) {
        stalledRounds = 0;
      } else if (tasks.length > 0) {
        stalledRounds += 1;
        if (stalledRounds >= 3) {
          throw new Error(`durable_payload_replay_stalled:phase=player_presence:pending=${pendingAfter}:rounds=${stalledRounds}`);
        }
      }
      await waitForReplayPoll(STARTUP_PAYLOAD_REPLAY_POLL_MS);
    }
  }


  private async quarantineNonReplayablePlayerStartupPayloads(tasks: FlushTask[]): Promise<{
    tasks: FlushTask[];
    quarantined: number;
  }> {
    const replayable: FlushTask[] = [];
    const invalidByPlayer = new Map<string, { tasks: FlushTask[]; error: Error }>();
    for (const task of tasks) {
      const error = findNonReplayablePlayerPayloadError(task);
      if (!error) {
        replayable.push(task);
        continue;
      }
      const group = invalidByPlayer.get(task.id) ?? { tasks: [], error };
      group.tasks.push(task);
      invalidByPlayer.set(task.id, group);
    }
    let quarantined = 0;
    for (const group of invalidByPlayer.values()) {
      quarantined += await this.quarantinePlayerStartupStall(group.tasks, group.error);
    }
    return { tasks: replayable, quarantined };
  }

  private async quarantineNonReplayableInstanceStartupPayloads(tasks: FlushTask[]): Promise<{
    tasks: FlushTask[];
    quarantined: number;
  }> {
    const replayable: FlushTask[] = [];
    const invalidByInstance = new Map<string, { tasks: FlushTask[]; error: Error }>();
    for (const task of tasks) {
      const error = findNonReplayableInstancePayloadError(task);
      if (!error) {
        replayable.push(task);
        continue;
      }
      const key = task.id + ':' + String(task.ownershipEpoch ?? 0);
      const group = invalidByInstance.get(key) ?? { tasks: [], error };
      group.tasks.push(task);
      invalidByInstance.set(key, group);
    }
    let quarantined = 0;
    for (const group of invalidByInstance.values()) {
      quarantined += await this.quarantineInstanceStartupStall(group.tasks, group.error);
    }
    return { tasks: replayable, quarantined };
  }

  private async runStagingCycle(options?: { bypassFlushBarrier?: boolean }): Promise<number> {
    if (!options?.bypassFlushBarrier && this.startupBarrierService && !this.startupBarrierService.isFlushOpen()) {
      return 0;
    }
    if (!this.flushLedgerService.isEnabled() || !shouldStartAuthoritativeRuntime()) {
      return 0;
    }
    const pending: Array<{ task: FlushTask; markStaged: () => void }> = [];
    let supersededTotal = 0;
    const commitPending = async (): Promise<void> => {
      if (pending.length === 0) {
        return;
      }
      const current = pending.splice(0, pending.length);
      const tasks = current.map((entry) => entry.task);
      const expectedChanged = new Set(tasks.map(stagingFlushTaskKey)).size;
      const result = await this.upsertStagingTasks(tasks, expectedChanged);
      const acceptedKeys = new Set(result.accepted.map(stagingFlushTaskIdentityKey));
      if (acceptedKeys.size !== result.changed) {
        throw new Error(
          `flush_task_staging_result_inconsistent:accepted=${acceptedKeys.size}:changed=${result.changed}`,
        );
      }
      for (const entry of current) {
        if (acceptedKeys.has(stagingFlushTaskKey(entry.task))) {
          entry.markStaged();
        }
      }
      const superseded = Math.max(0, expectedChanged - acceptedKeys.size);
      supersededTotal += superseded;
      if (superseded > 0) {
        this.logger.debug(
          `统一刷盘 staging 遇到更新 generation，保留对应 runtime dirty 等待重建：accepted=${acceptedKeys.size} superseded=${superseded}`,
        );
      }
    };
    const enqueue = async (entry: { task: FlushTask; markStaged: () => void }): Promise<void> => {
      pending.push(entry);
      if (pending.length >= STAGING_BATCH_SIZE) {
        await commitPending();
      }
    };
    const force = options?.bypassFlushBarrier === true;
    this.pruneStageThrottleMaps();
    await this.stagePlayerTasks(enqueue, force);
    await this.stageInstanceTasks(enqueue, force);
    await commitPending();
    return supersededTotal;
  }

  private async upsertStagingTasks(tasks: FlushTask[], expectedChanged: number): Promise<FlushTaskUpsertResult> {
    const detailedUpsert = (this.flushLedgerService as FlushLedgerService & {
      upsertFlushTasksDetailed?: (input: FlushTask[]) => Promise<FlushTaskUpsertResult>;
    }).upsertFlushTasksDetailed;
    if (typeof detailedUpsert === 'function') {
      return await detailedUpsert.call(this.flushLedgerService, tasks);
    }
    const changed = await this.flushLedgerService.upsertFlushTasks(tasks);
    if (changed !== expectedChanged) {
      return { changed: 0, accepted: [] };
    }
    return {
      changed,
      accepted: Array.from(dedupeStagingFlushTaskIdentities(tasks).values()),
    };
  }

  async runOnce(workerId = this.workerId, filter?: { playerDomain?: string; instanceDomain?: string }): Promise<number> {
    if (this.shutdownDrainStarted) {
      return 0;
    }
    if (this.startupBarrierService && !this.startupBarrierService.isFlushOpen() && !this.startupBarrierService.isWorkerOpen()) {
      return 0;
    }
    if (!isFlushTaskConsumerMode() || !this.flushLedgerService.isEnabled()) {
      return 0;
    }
    if (this.running) {
      return this.running;
    }
    this.running = this.runCycle(workerId, filter).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runCycle(workerId: string, filter?: { playerDomain?: string; instanceDomain?: string }): Promise<number> {
    if (this.isGlobalBackoffActive()) {
      return 0;
    }
    if (shouldStartAuthoritativeRuntime()) {
      await this.stageDirtyTasksOnce();
    }
    if (Date.now() >= this.nextAssetConflictRepairAt) {
      this.nextAssetConflictRepairAt = Date.now() + ASSET_CONFLICT_REPAIR_INTERVAL_MS;
      await this.tryRepairPlayerAssetConflictQuarantines(undefined, false, false);
    }
    if (this.isFlushPoolBackpressureActive()) {
      this.logger.warn(`统一刷盘任务因刷盘池等待排队而暂停认领：waiting>=${FLUSH_WAITING_LIMIT}`);
      return 0;
    }
    const playerTasks = await this.claimReadyTasksByPriority(workerId, 'player', filter?.playerDomain, {
      high: PLAYER_HIGH_CLAIM_LIMIT,
      normal: PLAYER_NORMAL_CLAIM_LIMIT,
      low: PLAYER_LOW_CLAIM_LIMIT,
    });
    const instanceTasks = await this.claimReadyTasksByPriority(workerId, 'instance', filter?.instanceDomain, {
      high: INSTANCE_HIGH_CLAIM_LIMIT,
      normal: INSTANCE_NORMAL_CLAIM_LIMIT,
      low: INSTANCE_LOW_CLAIM_LIMIT,
    });
    return (await this.processPlayerTasks(playerTasks)) + (await this.processInstanceTasks(instanceTasks));
  }

  private async claimReadyTasksByPriority(
    workerId: string,
    scope: FlushTaskScope,
    domain: string | null | undefined,
    limits: Record<FlushTaskPriority, number>,
  ): Promise<FlushTask[]> {
    const result: FlushTask[] = [];
    for (const priority of ['high', 'normal', 'low'] satisfies FlushTaskPriority[]) {
      const limit = limits[priority];
      if (limit <= 0) {
        continue;
      }
      if (
        scope === 'player'
        && (!domain || PLAYER_GROUPED_CLAIM_DOMAIN_SET.has(domain))
        && typeof this.flushLedgerService.claimReadyPlayerFlushTaskGroups === 'function'
      ) {
        result.push(...await this.flushLedgerService.claimReadyPlayerFlushTaskGroups({
          workerId,
          domain,
          priority,
          limit,
          includedDomains: domain ? [domain] : PLAYER_GROUPED_CLAIM_DOMAINS,
        }));
        continue;
      }
      result.push(...await this.flushLedgerService.claimReadyFlushTasks({ workerId, scope, domain, priority, limit }));
    }
    return result;
  }

  private buildPlayerTaskPayload(
    playerId: string,
    domain: string,
    metadata: PlayerPayloadMetadata,
  ): PlayerPresenceFlushPayload | PlayerSnapshotProjectionPayload | null {
    if (domain === 'presence') {
      const presence = this.playerRuntimeService.describePersistencePresence?.(playerId) ?? null;
      if (!presence) {
        return null;
      }
      return {
        kind: PLAYER_PRESENCE_PAYLOAD_KIND,
        presence: {
          ...presence,
          // presence 与业务投影共用暂存时生成的单调版本，崩溃重放不能在消费时重新取当前时间。
          versionSeed: metadata.projectionVersion,
        },
        ...metadata,
        runtimeOwnerId: presence.runtimeOwnerId ?? null,
        sessionEpoch: presence.sessionEpoch ?? null,
      };
    }
    const projectedDomains = [domain];
    if (projectedDomains.some((projectedDomain) => !PLAYER_PROJECTABLE_DOMAIN_SET.has(projectedDomain))) {
      return null;
    }
    const snapshot = this.playerRuntimeService.buildPersistenceSnapshot?.(playerId, new Set(projectedDomains)) ?? null;
    if (!snapshot) {
      return null;
    }
    const presence = this.playerRuntimeService.describePersistencePresence?.(playerId) ?? null;
    return {
      kind: PLAYER_SNAPSHOT_PROJECTION_PAYLOAD_KIND,
      snapshot,
      projectedDomains,
      ...metadata,
      runtimeOwnerId: presence?.runtimeOwnerId ?? null,
      sessionEpoch: presence?.sessionEpoch ?? null,
      // 投影组自洽推进 presence 围栏所需：indeterminate 时用该记录推进 DB presence。
      presence: presence ?? null,
    };
  }

  private async stagePlayerTasks(
    enqueue: (entry: { task: FlushTask; markStaged: () => void }) => Promise<void>,
    force = false,
  ): Promise<void> {
    const revisionEntries = this.playerRuntimeService.listUnstagedPlayerDomainRevisions?.(this.stagingGenerationId);
    const entries: Array<[string, Map<string, number>]> = revisionEntries
      ? Array.from(revisionEntries.entries())
      : Array.from(this.playerRuntimeService.listDirtyPlayerDomains?.() ?? new Map()).map(([playerId, domains]) => {
          const fallbackRevision = resolveRevision(this.playerRuntimeService.getPersistenceRevision?.(playerId));
          return [playerId, new Map(Array.from(normalizeDomains(domains), (domain) => [domain, fallbackRevision]))];
        });
    entries.sort(([left], [right]) => left.localeCompare(right));
    for (const [playerId, domainRevisions] of entries) {
      await this.ensurePlayerProjectionFenceForStaging(playerId, domainRevisions.keys());
      const runtimeRevision = resolveRevision(this.playerRuntimeService.getPersistenceRevision?.(playerId));
      for (const domain of Array.from(domainRevisions.keys()).sort()) {
        const presenceEpochCritical = domain === 'presence'
          && !force
          && this.isPresenceEpochCriticalForStaging(playerId);
        if (!force && !presenceEpochCritical && !this.shouldStagePlayerDomainNow(playerId, domain)) {
          continue;
        }
        let domainRevision = Math.max(0, Math.trunc(Number(domainRevisions.get(domain) ?? 0)));
        const refreshedDomainRevision = this.playerRuntimeService.getUnstagedPersistenceDomainRevision?.(
          playerId,
          domain,
          this.stagingGenerationId,
        );
        if (refreshedDomainRevision !== undefined && refreshedDomainRevision !== null) {
          domainRevision = Math.max(0, Math.trunc(Number(refreshedDomainRevision) || 0));
        }
        if (domainRevision <= 0) {
          continue;
        }
        const taskDomains = domain === PLAYER_FALLBACK_SNAPSHOT_DOMAIN
          ? Array.from(PLAYER_PROJECTABLE_DOMAIN_SET).sort()
          : [domain];
        const transferTracker = { remaining: taskDomains.length };
        const capturedDomainRevisions = new Map([[domain, domainRevision]]);
        // presence 仅在 session epoch 变化时立即暂存（与投影同时就绪），心跳型 dirty 仍走合并窗口；
        // 节流始终按合并窗口推进，避免新会话投影先于 presence 落库造成 indeterminate 围栏整组回滚。
        const throttleDelayMs = force ? 0 : resolvePlayerStageDelayMs(domain);
        const stageDelayMs = force || presenceEpochCritical ? 0 : throttleDelayMs;
        for (const taskDomain of taskDomains) {
          const projectionVersion = this.nextProjectionVersion();
          const metadata: PlayerPayloadMetadata = {
            domainRevision,
            runtimeRevision,
            projectionVersion,
            stagingGenerationId: this.stagingGenerationId,
            stagingDomain: domain,
          };
          const payload = this.buildPlayerTaskPayload(playerId, taskDomain, metadata);
          if (!payload) {
            throw new Error(`player_flush_staging_payload_missing:${playerId}:${taskDomain}:${domainRevision}`);
          }
          const stagedPresenceEpoch = taskDomain === 'presence'
            ? normalizeInt(payload.sessionEpoch, 0, 0, Number.MAX_SAFE_INTEGER)
            : 0;
          await enqueue({
            task: {
              scope: 'player', id: playerId, domain: taskDomain,
              priority: resolveFlushTaskPriority('player', taskDomain),
              latestRevision: projectionVersion,
              nextAttemptAt: new Date(Date.now() + stageDelayMs).toISOString(),
              runtimeOwnerId: resolvePlayerPayloadRuntimeOwnerId(payload),
              fencingToken: buildPlayerPayloadFencingToken(payload),
              payloadJson: payload,
            },
            markStaged: () => {
              transferTracker.remaining -= 1;
              if (transferTracker.remaining > 0) {
                return;
              }
              if (stagedPresenceEpoch > 0) {
                this.lastStagedPresenceEpochByPlayerId.set(playerId, stagedPresenceEpoch);
              }
              this.playerRuntimeService.markPersistenceDomainsStaged?.(
                playerId,
                capturedDomainRevisions,
                runtimeRevision,
                this.stagingGenerationId,
              );
              this.markPlayerDomainStagedAt(playerId, domain, throttleDelayMs);
              this.flushWakeupService.signalPlayerFlush(playerId);
            },
          });
        }
      }
    }
  }

  private async ensurePlayerProjectionFenceForStaging(
    playerId: string,
    domains: Iterable<string>,
  ): Promise<void> {
    const requiresProjectionFence = Array.from(domains).some((domain) =>
      domain === PLAYER_FALLBACK_SNAPSHOT_DOMAIN || PLAYER_PROJECTABLE_DOMAIN_SET.has(domain),
    );
    if (!requiresProjectionFence) {
      return;
    }
    let presence = this.playerRuntimeService.describePersistencePresence?.(playerId) ?? null;
    if (hasCompletePlayerRuntimeFence(presence)) {
      return;
    }
    const ensureClaimed = this.playerRuntimeService.ensureRuntimeOwnershipClaimed;
    if (typeof ensureClaimed !== 'function') {
      throw new Error(`player_flush_staging_runtime_ownership_claim_unavailable:${playerId}`);
    }
    await ensureClaimed.call(this.playerRuntimeService, playerId);
    presence = this.playerRuntimeService.describePersistencePresence?.(playerId) ?? null;
    if (!hasCompletePlayerRuntimeFence(presence)) {
      throw new Error(`player_flush_staging_runtime_ownership_claim_failed:${playerId}`);
    }
  }

  private buildInstanceTaskPayload(
    instanceId: string,
    domain: string,
    stagedDomains: string[],
    runtime: InstanceRuntimeView,
  ): PreparedInstancePayload | null {
    if (INSTANCE_PAYLOAD_BATCH_DOMAINS.has(domain) && typeof this.worldRuntimeService.buildDomainDeltaBatch === 'function') {
      const [delta] = this.worldRuntimeService.buildDomainDeltaBatch(domain, [instanceId]);
      if (!delta || delta.instanceId !== instanceId) {
        return null;
      }
      const flushSnapshot = normalizeInstanceFlushSnapshot(delta.flushSnapshot);
      const latestRevision = this.nextProjectionVersion();
      const payload: InstanceDomainDeltaPayload = {
        kind: INSTANCE_DOMAIN_DELTA_PAYLOAD_KIND,
        domain,
        fullReplace: delta.fullReplace === true,
        upserts: delta.fullReplace === true ? [] : (delta.upserts ?? []),
        deletes: delta.fullReplace === true ? [] : (delta.deletes ?? []),
        entries: delta.fullReplace === true ? (delta.entries ?? []) : undefined,
        revision: latestRevision,
        domainRevisions: serializeDomainRevisions(flushSnapshot, stagedDomains),
        stagedDomains,
        stagingGenerationId: this.stagingGenerationId,
        watermarkPayload: delta.watermarkPayload,
      };
      return { payload, latestRevision, flushSnapshot, stagedDomains, containerRevision: null };
    }
    if (!INSTANCE_PAYLOAD_STATE_DOMAINS.has(domain)) {
      return null;
    }
    const flushSnapshot = normalizeInstanceFlushSnapshot(runtime.capturePersistenceDomainFlushSnapshot?.(stagedDomains));
    const containerRevision = domain === 'container_state'
      ? normalizeOptionalRevision(this.worldRuntimeService.worldRuntimeLootContainerService?.getContainerPersistenceRevision?.(instanceId)) ?? 0
      : null;
    const revision = this.nextProjectionVersion();
    const basePayload = {
      kind: INSTANCE_DOMAIN_STATE_PAYLOAD_KIND,
      domain,
      revision,
      domainRevisions: serializeDomainRevisions(flushSnapshot, stagedDomains),
      stagedDomains,
      stagingGenerationId: this.stagingGenerationId,
      containerRevision: containerRevision ?? undefined,
      watermarkPayload: buildInstanceDomainRecoveryWatermark(runtime, stagedDomains, flushSnapshot),
    } as const;
    let payload: InstanceDomainStatePayload | null = null;
    if (domain === 'tile_cell') {
      payload = { ...basePayload, payload: runtime.buildRuntimeTilePersistenceEntries?.() ?? [] };
    }
    else if (domain === 'temporary_tile') {
      payload = { ...basePayload, payload: runtime.buildTemporaryTilePersistenceEntries?.() ?? [] };
    }
    if (domain === 'ground_item') {
      const delta = runtime.buildGroundPersistenceDelta?.(flushSnapshot);
      if (delta) {
        payload = delta.fullReplace === true
          ? { ...basePayload, payload: { fullReplace: true, entries: runtime.buildGroundPersistenceEntries?.() ?? [] } }
          : { ...basePayload, payload: { fullReplace: false, tileIndices: delta.tileIndices ?? [], entries: delta.entries ?? [] } };
      }
    }
    else if (domain === 'overlay') {
      payload = { ...basePayload, payload: runtime.buildOverlayPersistenceChunks?.() ?? [] };
    }
    else if (domain === 'monster_runtime') {
      const delta = runtime.buildMonsterRuntimePersistenceDelta?.(flushSnapshot);
      if (delta) {
        payload = { ...basePayload, payload: delta.fullReplace === true
          ? { fullReplace: true, entries: runtime.buildMonsterRuntimePersistenceEntries?.() ?? [] }
          : { fullReplace: false, upserts: delta.upserts ?? [], deletes: delta.deletes ?? [] } };
      }
    }
    else if (domain === 'container_state') {
      const states = this.worldRuntimeService.worldRuntimeLootContainerService?.buildContainerPersistenceStates?.(instanceId) ?? [];
      payload = { ...basePayload, payload: states };
    }
    else if (domain === 'time') {
      payload = { ...basePayload, payload: buildTimeCheckpointSnapshot(runtime) };
    }
    else if (domain === 'building') {
      const state = runtime.buildBuildingRoomFengShuiPersistenceState?.();
      payload = state
        ? { ...basePayload, payload: selectBuildingRoomFengShuiPayload(state, stagedDomains) }
        : null;
    }
    return payload
      ? { payload, latestRevision: revision, flushSnapshot, stagedDomains, containerRevision }
      : null;
  }

  private async stageInstanceTasks(
    enqueue: (entry: { task: FlushTask; markStaged: () => void }) => Promise<void>,
    force = false,
  ): Promise<void> {
    const entries = this.worldRuntimeService.listDirtyPersistentInstanceDomains?.()
      ?? (this.worldRuntimeService.listDirtyPersistentInstances?.() ?? []).map((instanceId) => ({ instanceId, domains: ['domain'] }));
    const stableEntries = [...entries].sort((left, right) => normalizeString(left.instanceId).localeCompare(normalizeString(right.instanceId)));
    for (const entry of stableEntries) {
      const instanceId = normalizeString(entry.instanceId);
      const runtime = instanceId ? this.worldRuntimeService.getInstanceRuntime?.(instanceId) : null;
      if (!instanceId || !runtime?.meta?.persistent) continue;
      const ownershipEpoch = normalizeInt(runtime.meta.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER);
      const domains = Array.from(normalizeDomains(entry.domains))
        .filter((domain) => runtime.isPersistenceDomainHeld?.(domain) !== true)
        .sort();
      const buildingDomains = domains.filter((domain) => INSTANCE_BUILDING_COMPOSITE_DOMAINS.has(domain));
      const stageDomains: Array<{ taskDomain: string; stagedDomains: string[] }> = [];
      if (buildingDomains.some((domain) => this.isInstanceDomainUnstaged(runtime, domain))) {
        stageDomains.push({ taskDomain: 'building', stagedDomains: buildingDomains });
      }
      for (const domain of domains) {
        if (INSTANCE_BUILDING_COMPOSITE_DOMAINS.has(domain) || !this.isInstanceDomainUnstaged(runtime, domain, instanceId)) {
          continue;
        }
        stageDomains.push({ taskDomain: domain, stagedDomains: [domain] });
      }
      stageDomains.sort((left, right) => left.taskDomain.localeCompare(right.taskDomain));
      for (const candidate of stageDomains) {
        const stageDelayMs = force
          ? 0
          : resolveInstanceStageDelayMs(candidate.taskDomain, candidate.stagedDomains);
        const highPriority = candidate.stagedDomains.some((domain) => runtime.isDirtyDomainHighPriority?.(domain) === true);
        if (!force && !highPriority && !this.shouldStageInstanceDomainNow(
          instanceId,
          candidate.taskDomain,
          ownershipEpoch,
        )) {
          continue;
        }
        const prepared = this.buildInstanceTaskPayload(instanceId, candidate.taskDomain, candidate.stagedDomains, runtime);
        if (!prepared) {
          throw new Error(`instance_flush_staging_payload_missing:${instanceId}:${candidate.taskDomain}:${ownershipEpoch}`);
        }
        const now = Date.now();
        await enqueue({
          task: {
            scope: 'instance', id: instanceId, domain: candidate.taskDomain,
            priority: resolveFlushTaskPriority('instance', candidate.taskDomain),
            ownershipEpoch,
            latestRevision: prepared.latestRevision,
            nextAttemptAt: new Date(now + (highPriority ? 0 : stageDelayMs)).toISOString(),
            payloadJson: prepared.payload,
            fencingToken: buildInstancePayloadFencingToken(
              this.stagingGenerationId,
              candidate.taskDomain,
              ownershipEpoch,
            ),
          },
          markStaged: () => {
            if (prepared.containerRevision !== null) {
              const transferred = this.worldRuntimeService.worldRuntimeLootContainerService?.clearPersisted?.(
                instanceId,
                prepared.containerRevision,
              ) === true;
              if (transferred) {
                this.stagedContainerRevisionByInstanceId.delete(instanceId);
              }
              else {
                const previousRevision = this.stagedContainerRevisionByInstanceId.get(instanceId) ?? 0;
                this.stagedContainerRevisionByInstanceId.set(instanceId, Math.max(previousRevision, prepared.containerRevision));
              }
            }
            runtime.markPersistenceDomainsStaged?.(
              prepared.stagedDomains,
              prepared.flushSnapshot,
              this.stagingGenerationId,
            );
            this.markInstanceDomainStagedAt(
              instanceId,
              candidate.taskDomain,
              ownershipEpoch,
              highPriority ? 0 : stageDelayMs,
            );
            this.flushWakeupService.signalInstanceFlush(instanceId);
          },
        });
      }
    }
  }

  private isInstanceDomainUnstaged(runtime: InstanceRuntimeView, domain: string, instanceId = ''): boolean {
    if (domain === 'container_state') {
      const currentRevision = normalizeOptionalRevision(
        this.worldRuntimeService.worldRuntimeLootContainerService?.getContainerPersistenceRevision?.(instanceId),
      ) ?? 0;
      return currentRevision > (this.stagedContainerRevisionByInstanceId.get(instanceId) ?? 0);
    }
    const currentRevision = normalizeOptionalRevision(runtime.getPersistenceDomainRevision?.(domain))
      ?? resolveRevision(runtime.getPersistenceRevision?.());
    const stagedRevision = normalizeOptionalRevision(
      runtime.getStagedPersistenceDomainRevision?.(domain, this.stagingGenerationId),
    ) ?? 0;
    return currentRevision > stagedRevision;
  }

  private shouldStagePlayerDomainNow(playerId: string, domain: string): boolean {
    return Date.now() >= (this.nextPlayerStageAtByKey.get(playerStageThrottleKey(playerId, domain)) ?? 0);
  }

  /**
   * presence 是否处于"新会话"关键状态：当前运行态 session epoch 与最近一次成功暂存不一致
   * （重连/转移/认领会 +1）。此时 presence 必须立即可认领（绕过合并节流、nextAttemptAt=now），
   * 与投影任务同时就绪，从根本上消除投影围栏 indeterminate 竞态；心跳型 dirty 保持合并窗口。
   */
  private isPresenceEpochCriticalForStaging(playerId: string): boolean {
    const presence = this.playerRuntimeService.describePersistencePresence?.(playerId) ?? null;
    const currentEpoch = normalizeInt(presence?.sessionEpoch, 0, 0, Number.MAX_SAFE_INTEGER);
    if (currentEpoch <= 0) {
      return false;
    }
    return currentEpoch !== (this.lastStagedPresenceEpochByPlayerId.get(playerId) ?? 0);
  }

  private markPlayerDomainStagedAt(playerId: string, domain: string, delayMs: number): void {
    this.nextPlayerStageAtByKey.set(
      playerStageThrottleKey(playerId, domain),
      Date.now() + Math.max(0, delayMs),
    );
  }

  private shouldStageInstanceDomainNow(instanceId: string, domain: string, ownershipEpoch: number): boolean {
    return Date.now() >= (
      this.nextInstanceStageAtByKey.get(instanceStageThrottleKey(instanceId, domain, ownershipEpoch)) ?? 0
    );
  }

  private markInstanceDomainStagedAt(
    instanceId: string,
    domain: string,
    ownershipEpoch: number,
    delayMs: number,
  ): void {
    this.nextInstanceStageAtByKey.set(
      instanceStageThrottleKey(instanceId, domain, ownershipEpoch),
      Date.now() + Math.max(0, delayMs),
    );
  }

  private pruneStageThrottleMaps(): void {
    const expiredBefore = Date.now() - 60 * 60 * 1000;
    pruneExpiredStageThrottleEntries(this.nextPlayerStageAtByKey, expiredBefore);
    pruneExpiredStageThrottleEntries(this.nextInstanceStageAtByKey, expiredBefore);
  }

  private async processPlayerTasks(
    tasks: FlushTask[],
    options: {
      failFastDeterministicPayload?: boolean;
      preserveTechniqueComprehensionTruthOnEmptyOverwrite?: boolean;
      allowOfflineAssetConflictFenceRebase?: boolean;
    } = {},
  ): Promise<number> {
    const groups = Array.from(groupTasksById(tasks).values());
    const results = new Array(groups.length).fill(0);
    const indexedGroups = groups.map((group, index) => ({ group, index }));
    await runConcurrent(
      indexedGroups,
      PLAYER_PARALLELISM,
      async ({ group, index }) => {
        if (this.isGlobalBackoffActive()) {
          return;
        }
        const playerId = group[0]?.id;
        if (!playerId) {
          return;
        }
        const domains: string[] = Array.from(new Set(group.map((task) => task.domain)));
        const attemptKey = playerGroupKey(group);
        try {
          const payloadProcessed = await this.processPlayerPayloadTaskGroup(playerId, group);
          if (payloadProcessed !== null) {
            this.failureAttempts.delete(attemptKey);
            results[index] = payloadProcessed;
            return;
          }
          if (!shouldStartAuthoritativeRuntime()) {
            const attempt = this.bumpFailureAttempt(attemptKey);
            if (attempt >= STALE_PAYLOAD_ABANDON_THRESHOLD) {
              this.logger.warn(`玩家刷盘放弃 stale payload：playerId=${playerId} domains=${domains.join(',')} attempt=${attempt}，等待玩家上线重新 stage`);
              await this.flushLedgerService.markFlushTasksFlushed(group);
              this.failureAttempts.delete(attemptKey);
              results[index] = group.length;
            } else {
              await this.flushLedgerService.markFlushTasksRetry(group, RETRY_DELAY_MS);
            }
            return;
          }
          const flushed = await this.playerPersistenceFlushService.flushPlayerDomains(playerId, domains);
          if (flushed === false) {
            await this.flushLedgerService.markFlushTasksRetry(group, RETRY_DELAY_MS);
            return;
          }
          await this.flushLedgerService.markFlushTasksFlushed(group);
          this.failureAttempts.delete(attemptKey);
          results[index] = group.length;
        } catch (error) {
          if (options.preserveTechniqueComprehensionTruthOnEmptyOverwrite === true) {
            const preserved = await this.preserveTechniqueComprehensionTruthAndContinueReplay(group, error);
            if (preserved !== null) {
              results[index] = preserved;
              return;
            }
          }
          const quarantined = await this.quarantineInventoryOwnershipConflict(
            group,
            error,
            options.allowOfflineAssetConflictFenceRebase === true,
          );
          if (quarantined !== null) {
            results[index] = quarantined;
            return;
          }
          if (options.failFastDeterministicPayload === true && isNonRecoverableReplayPlayerPayloadError(error)) {
            // 启动重放中的确定性数据错误重试永远无法成功；隔离该玩家整组 payload 并继续启动，
            // 避免单玩家数据不一致导致 durable_payload_replay_stalled 阻断整个服务端启动。
            results[index] = await this.quarantinePlayerStartupStall(group, error);
            return;
          }
          results[index] = await this.retryPlayerTaskGroup(group, error);
        }
      },
    );
    return sumProcessedCounts(results);
  }

  private async processPlayerPayloadTaskGroup(playerId: string, group: FlushTask[]): Promise<number | null> {
    if (group.length === 0) {
      return null;
    }
    if (!this.playerDomainPersistenceService?.isEnabled()) {
      await this.flushLedgerService.markFlushTasksRetry(group, RETRY_DELAY_MS);
      return 0;
    }
    const presenceTasks = group.filter((task) => task.domain === 'presence');
    const projectionTasks = group.filter((task) => PLAYER_PROJECTABLE_DOMAIN_SET.has(task.domain) || task.domain === PLAYER_FALLBACK_SNAPSHOT_DOMAIN);
    if (presenceTasks.length + projectionTasks.length !== group.length) {
      return null;
    }
    let processed = 0;
    for (const task of presenceTasks) {
      const payload = normalizePlayerPresencePayload(task.payloadJson);
      if (!payload) {
        if (shouldStartAuthoritativeRuntime()) return null;
        const attemptKey = playerTaskKey(task);
        const attempt = this.bumpFailureAttempt(attemptKey);
        if (attempt >= STALE_PAYLOAD_ABANDON_THRESHOLD) {
          this.logger.warn(`玩家刷盘放弃 stale presence：playerId=${playerId} attempt=${attempt}`);
          await this.flushLedgerService.markFlushTaskFlushed(task);
          this.failureAttempts.delete(attemptKey);
          processed += 1;
        } else {
          await this.flushLedgerService.markFlushTaskRetry(task, RETRY_DELAY_MS);
        }
        continue;
      }
      if (!isPlayerPayloadVersionCurrent(payload, task.latestRevision)) {
        this.logger.debug(`玩家刷盘放弃 stale presence payload：playerId=${playerId} latestRevision=${task.latestRevision} payloadRevision=${payload.projectionVersion ?? 'legacy'}`);
        if (await this.flushLedgerService.markFlushTaskFlushed(task)) processed += 1;
        continue;
      }
      const fenceDecision = await this.resolvePlayerPresencePayloadFence(playerId, payload);
      if (fenceDecision === 'stale') {
        this.logger.debug(
          `玩家刷盘丢弃 stale presence fence：playerId=${playerId} payloadEpoch=${payload.sessionEpoch ?? 'none'} payloadOwner=${payload.runtimeOwnerId ?? 'none'}`,
        );
        if (await this.flushLedgerService.markFlushTaskFlushed(task)) processed += 1;
        continue;
      }
      if (fenceDecision === 'indeterminate') {
        throw new Error(
          `player_presence_incomplete_fence:${playerId}:expectedOwner=${payload.runtimeOwnerId ?? 'none'}:expectedEpoch=${payload.sessionEpoch ?? 'none'}`,
        );
      }
      if (!await this.renewPayloadClaim(task)) {
        continue;
      }
      try {
        await this.playerDomainPersistenceService.savePlayerPresence(playerId, payload.presence);
      } catch (error) {
        if (!isConvergedPlayerPresenceFenceError(error)) {
          throw error;
        }
        this.logger.debug(
          `玩家 presence 事务内 fence 已过期，按 stale-safe 收敛：playerId=${playerId} error=${formatError(error)}`,
        );
        if (await this.flushLedgerService.markFlushTaskFlushed(task)) processed += 1;
        continue;
      }
      if (await this.flushLedgerService.markFlushTaskFlushed(task)) {
        processed += 1;
        this.markPlayerPayloadPersisted(playerId, task, payload);
      }
    }
    if (projectionTasks.length > 0) {
      const payloadRows = projectionTasks.map((task) => ({
        task,
        payload: normalizePlayerSnapshotProjectionPayload(task.payloadJson),
      }));
      const invalidTasks = payloadRows.filter((row) => !row.payload).map((row) => row.task);
      if (invalidTasks.length > 0) {
        if (shouldStartAuthoritativeRuntime()) return null;
        const abandonedTaskKeys = new Set<string>();
        for (const task of invalidTasks) {
          const attemptKey = playerTaskKey(task);
          const attempt = this.bumpFailureAttempt(attemptKey);
          if (attempt >= STALE_PAYLOAD_ABANDON_THRESHOLD) {
            this.logger.warn(`玩家刷盘放弃 stale projection：playerId=${playerId} domain=${task.domain} attempt=${attempt}`);
            if (await this.flushLedgerService.markFlushTaskFlushed(task)) {
              abandonedTaskKeys.add(playerTaskKey(task));
              this.failureAttempts.delete(attemptKey);
              processed += 1;
            }
          }
        }
        const retryTasks = projectionTasks.filter((task) => !abandonedTaskKeys.has(playerTaskKey(task)));
        if (retryTasks.length > 0) {
          await this.flushLedgerService.markFlushTasksRetry(retryTasks, RETRY_DELAY_MS);
        }
        // 同一玩家 payload 组中只要存在不可解析行，就不能先提交其余领域制造半组真源。
        return processed;
      }
      const currentPayloadRows: Array<{
        task: FlushTask;
        payload: PlayerSnapshotProjectionPayload;
        effectiveRuntimeOwnerId: string | null;
        domains: string[];
      }> = [];
      for (const { task, payload } of payloadRows) {
        if (!payload) {
          continue;
        }
        if (!isPlayerPayloadVersionCurrent(payload, task.latestRevision)) {
          this.logger.debug(`玩家刷盘丢弃 stale projection version：playerId=${playerId} domain=${task.domain} latestRevision=${task.latestRevision} payloadRevision=${payload.projectionVersion ?? 'legacy'}`);
          if (await this.flushLedgerService.markFlushTaskFlushed(task)) processed += 1;
          continue;
        }
        // 历史 ledger 的 runtime_owner_id 可能由旧 UPSERT COALESCE 残留，不能替 payload 补 fence。
        const effectiveRuntimeOwnerId = normalizeNullableString(payload.runtimeOwnerId);
        const fenceDecision = await this.resolvePlayerProjectionPayloadFence(
          playerId,
          payload.sessionEpoch,
          effectiveRuntimeOwnerId,
        );
        if (fenceDecision === 'stale') {
          this.logger.debug(`玩家刷盘丢弃 stale projection：playerId=${playerId} domain=${task.domain} payloadEpoch=${payload.sessionEpoch ?? 'none'} effectiveOwner=${effectiveRuntimeOwnerId ?? 'none'}`);
          if (await this.flushLedgerService.markFlushTaskFlushed(task)) processed += 1;
          continue;
        }
        if (fenceDecision === 'indeterminate') {
          const reconciled = await this.reconcilePlayerProjectionFence(playerId, payload);
          if (reconciled === 'stale') {
            this.logger.debug(
              `玩家刷盘丢弃已被新会话取代的投影：playerId=${playerId} domain=${task.domain} payloadEpoch=${payload.sessionEpoch ?? 'none'} effectiveOwner=${effectiveRuntimeOwnerId ?? 'none'}`,
            );
            if (await this.flushLedgerService.markFlushTaskFlushed(task)) processed += 1;
            continue;
          }
          if (reconciled === 'indeterminate') {
            throw new Error(
              `player_snapshot_projection_incomplete_fence:${playerId}:expectedOwner=${effectiveRuntimeOwnerId ?? 'none'}:expectedEpoch=${payload.sessionEpoch ?? 'none'}`,
            );
          }
        }
        const domains = Array.from(new Set(payload.projectedDomains.length > 0
          ? payload.projectedDomains
          : (task.domain === PLAYER_FALLBACK_SNAPSHOT_DOMAIN
              ? Array.from(PLAYER_PROJECTABLE_DOMAIN_SET)
              : [task.domain]))).sort();
        for (const projectedDomain of domains) {
          if (!PLAYER_PROJECTABLE_DOMAIN_SET.has(projectedDomain)) {
            throw new Error(`player_snapshot_projection_domain_unsupported:${playerId}:${task.domain}:${projectedDomain}`);
          }
        }
        currentPayloadRows.push({ task, payload, effectiveRuntimeOwnerId, domains });
      }
      if (currentPayloadRows.length > 0) {
        const currentTasks = currentPayloadRows.map((row) => row.task);
        if (!await this.renewPayloadClaims(currentTasks)) {
          await this.flushLedgerService.markFlushTasksRetry(currentTasks, RETRY_DELAY_MS);
          return processed;
        }
        const writeByDomain = new Map<string, {
          domain: string;
          task: FlushTask;
          payload: PlayerSnapshotProjectionPayload;
          effectiveRuntimeOwnerId: string | null;
        }>();
        for (const row of currentPayloadRows) {
          const candidateVersion = Math.max(
            0,
            Math.trunc(Number(row.payload.projectionVersion) || 0),
            Math.trunc(Number(row.task.latestRevision) || 0),
          );
          for (const domain of row.domains) {
            const existing = writeByDomain.get(domain);
            const existingVersion = existing
              ? Math.max(
                  0,
                  Math.trunc(Number(existing.payload.projectionVersion) || 0),
                  Math.trunc(Number(existing.task.latestRevision) || 0),
                )
              : -1;
            if (!existing || candidateVersion >= existingVersion) {
              writeByDomain.set(domain, {
                domain,
                task: row.task,
                payload: row.payload,
                effectiveRuntimeOwnerId: row.effectiveRuntimeOwnerId,
              });
            }
          }
        }
        const batchEntries = Array.from(writeByDomain.values())
          .sort((left, right) => left.domain.localeCompare(right.domain))
          .map((entry) => ({
            snapshot: entry.payload.snapshot,
            domains: [entry.domain],
            options: {
              allowInventoryEmptyOverwrite: entry.domain === 'inventory',
              allowWalletEmptyOverwrite: entry.domain === 'wallet'
                && Array.isArray(entry.payload.snapshot.wallet?.balances),
              allowEquipmentEmptyOverwrite: entry.domain === 'equipment',
              allowArtifactEmptyOverwrite: entry.domain === 'artifact',
              allowBuffEmptyOverwrite: entry.domain === 'buff',
              expectedRuntimeOwnerId: entry.effectiveRuntimeOwnerId,
              expectedSessionEpoch: entry.payload.sessionEpoch ?? null,
              expectedProjectionVersion: entry.payload.projectionVersion,
            },
          }));
        try {
          if (typeof this.playerDomainPersistenceService.savePlayerSnapshotProjectionDomainBatch === 'function') {
            await this.playerDomainPersistenceService.savePlayerSnapshotProjectionDomainBatch(playerId, batchEntries);
          } else {
            // 仅供旧测试夹具/渐进集成；生产服务始终提供单事务 batch writer。
            for (const entry of batchEntries) {
              await this.playerDomainPersistenceService.savePlayerSnapshotProjectionDomains(
                playerId,
                entry.snapshot,
                entry.domains,
                entry.options,
              );
            }
          }
        } catch (error) {
          if (!isConvergedPlayerProjectionFenceError(error)) {
            throw error;
          }
          this.logger.debug(
            `玩家刷盘事务内 fence 已过期，按 stale-safe 收敛：playerId=${playerId} domains=${batchEntries.map((entry) => Array.from(entry.domains).join(',')).join(',')} error=${formatError(error)}`,
          );
          for (const row of currentPayloadRows) {
            if (await this.flushLedgerService.markFlushTaskFlushed(row.task)) {
              processed += 1;
            }
          }
          return processed;
        }
        // 写真源已经原子提交；续租失败的行不冒充已确认，稍后重放会被逐域 watermark 安全吸收。
        await this.renewPayloadClaims(currentTasks);
        for (const row of currentPayloadRows) {
          if (await this.flushLedgerService.markFlushTaskFlushed(row.task)) {
            processed += 1;
            this.markPlayerPayloadPersisted(playerId, row.task, row.payload);
          }
        }
      }
    }
    return processed;
  }

  private async renewPayloadClaim(task: FlushTask): Promise<boolean> {
    const renewed = await this.flushLedgerService.renewFlushTaskClaim(task, PAYLOAD_CLAIM_RENEW_TTL_MS);
    if (!renewed) {
      this.logger.debug(`刷盘 payload claim 已失效，放弃写真源 scope=${task.scope} id=${task.id} domain=${task.domain}`);
    }
    return renewed;
  }

  private async renewPayloadClaims(tasks: FlushTask[]): Promise<boolean> {
    if (tasks.length === 0) {
      return true;
    }
    if (typeof this.flushLedgerService.renewFlushTaskClaims === 'function') {
      const renewed = await this.flushLedgerService.renewFlushTaskClaims(tasks, PAYLOAD_CLAIM_RENEW_TTL_MS);
      if (renewed === tasks.length) {
        return true;
      }
      this.logger.debug(`玩家刷盘 payload claim 组不完整，放弃本轮写真源 playerId=${tasks[0]?.id ?? 'unknown'} renewed=${renewed}/${tasks.length}`);
      return false;
    }
    const results = await Promise.all(tasks.map((task) => this.renewPayloadClaim(task)));
    return results.every(Boolean);
  }

  private markPlayerPayloadPersisted(
    playerId: string,
    task: FlushTask,
    payload: PlayerPresenceFlushPayload | PlayerSnapshotProjectionPayload,
  ): void {
    if (payload.stagingGenerationId !== this.stagingGenerationId) {
      return;
    }
    const stagingDomain = normalizeString(payload.stagingDomain) || task.domain;
    if (stagingDomain === PLAYER_FALLBACK_SNAPSHOT_DOMAIN) {
      // fallback 会展开为多个独立 ledger task；单个 task 完成不能冒充整组已最终落库。
      return;
    }
    this.playerRuntimeService.markPersistenceDomainsPersistedByRevision?.(
      playerId,
      new Map([[stagingDomain, payload.domainRevision]]),
      payload.runtimeRevision,
      payload.stagingGenerationId,
    );
  }

  private async resolvePlayerProjectionPayloadFence(
    playerId: string,
    sessionEpoch: number | null | undefined,
    runtimeOwnerId: string | null,
  ): Promise<PlayerProjectionFenceDecision> {
    const payloadEpoch = normalizeInt(sessionEpoch, 0, 0, Number.MAX_SAFE_INTEGER);
    const payloadOwner = normalizeNullableString(runtimeOwnerId);
    // owner 与 epoch 均缺失是既有无围栏导入契约；不能为了兼容历史 ledger 改变它。
    if (payloadEpoch <= 0 && !payloadOwner) return 'current';
    if (payloadEpoch <= 0) return 'indeterminate';
    const persistedPresence = await this.loadPersistedPlayerPresence(playerId);
    // presence 已不存在说明玩家已删除或该会话不再具备权威落点，旧 payload 可安全收敛。
    if (!persistedPresence) return 'stale';
    const persistedEpoch = normalizeInt(persistedPresence.sessionEpoch, 0, 0, Number.MAX_SAFE_INTEGER);
    if (persistedEpoch > payloadEpoch) return 'stale';
    if (persistedEpoch < payloadEpoch) return 'indeterminate';
    const persistedOwner = normalizeNullableString(persistedPresence?.runtimeOwnerId);
    if (payloadOwner) return payloadOwner === persistedOwner ? 'current' : 'stale';
    // 历史 payload/payload_jsonb 可能缺 owner；仅在 ledger 也缺 owner 且 DB 已离线释放 owner 时兼容。
    return persistedOwner ? 'stale' : 'current';
  }

  /**
   * 投影围栏裁定为 indeterminate（DB presence 落后于 payload epoch）时的自洽收敛：
   * 用 payload 携带的 staging presence 记录把 DB presence 推进到该会话（CAS 保护），
   * 然后重判围栏。这消除了 presence 任务 30s 合并延迟造成的投影刷盘整组回滚循环
   * （每次重连 sessionEpoch +1 都会重新拉开差距），且不依赖刷盘进程的内存运行态，
   * consumer 模式同样成立。
   *
   * 返回语义：
   * - 'current'：presence 已推进，投影可按当前 payload 继续写入；
   * - 'stale'：DB 已被更新会话接管（savePlayerPresence CAS 拒绝或重判为 stale），
   *   本投影已过期，调用方按 stale 安全丢弃；
   * - 'indeterminate'：无 presence 记录（历史 payload）或推进失败，保留原重试语义。
   */
  private async reconcilePlayerProjectionFence(
    playerId: string,
    payload: PlayerSnapshotProjectionPayload,
  ): Promise<PlayerProjectionFenceDecision> {
    const payloadEpoch = normalizeInt(payload.sessionEpoch, 0, 0, Number.MAX_SAFE_INTEGER);
    const presence = payload.presence ?? null;
    if (payloadEpoch <= 0 || !presence) {
      return 'indeterminate';
    }
    try {
      await this.playerDomainPersistenceService.savePlayerPresence(playerId, {
        ...presence,
        sessionEpoch: payloadEpoch,
        versionSeed: payload.projectionVersion ?? 0,
      });
    } catch (error) {
      // CAS 拒绝意味着 DB 已有更新会话/所有者接管，本投影已被取代，安全丢弃而非重试。
      if (isConvergedPlayerPresenceFenceError(error)) {
        return 'stale';
      }
      return 'indeterminate';
    }
    const rechecked = await this.resolvePlayerProjectionPayloadFence(
      playerId,
      payload.sessionEpoch,
      payload.runtimeOwnerId,
    );
    return rechecked === 'current' || rechecked === 'stale' ? rechecked : 'indeterminate';
  }

  private async resolvePlayerPresencePayloadFence(
    playerId: string,
    payload: PlayerPresenceFlushPayload,
  ): Promise<PlayerProjectionFenceDecision> {
    const payloadEpoch = normalizeInt(payload.sessionEpoch, 0, 0, Number.MAX_SAFE_INTEGER);
    if (payloadEpoch <= 0) {
      return 'indeterminate';
    }
    const persistedPresence = await this.loadPersistedPlayerPresence(playerId);
    // presence payload 本身就是崩溃前已 durable 化的 ownership 真源；全局 replay 会先处理它，
    // 因而缺行或 DB epoch 更低时应由 savePlayerPresence 的 epoch CAS 创建/推进，而不是阻断启动。
    if (!persistedPresence) {
      return 'current';
    }
    const persistedEpoch = normalizeInt(persistedPresence.sessionEpoch, 0, 0, Number.MAX_SAFE_INTEGER);
    if (persistedEpoch > payloadEpoch) return 'stale';
    if (persistedEpoch < payloadEpoch) return 'current';
    const payloadOwner = normalizeNullableString(payload.runtimeOwnerId);
    const persistedOwner = normalizeNullableString(persistedPresence.runtimeOwnerId);
    return payloadOwner === persistedOwner ? 'current' : 'stale';
  }

  private async loadPersistedPlayerPresence(playerId: string): Promise<{
    runtimeOwnerId?: string | null;
    sessionEpoch?: number | null;
  } | null> {
    const loader = (this.playerDomainPersistenceService as unknown as {
      loadPlayerPresence?: (targetPlayerId: string) => Promise<{
        runtimeOwnerId?: string | null;
        sessionEpoch?: number | null;
      } | null>;
    }).loadPlayerPresence;
    if (typeof loader !== 'function') {
      throw new Error(`player_snapshot_projection_presence_loader_unavailable:${playerId}`);
    }
    return await loader.call(this.playerDomainPersistenceService, playerId);
  }

  private async processInstanceTasks(
    tasks: FlushTask[],
    options: { failFastDeterministicPayload?: boolean } = {},
  ): Promise<number> {
    const remaining = new Map(tasks.map((task) => [instanceTaskKey(task), task]));
    const batchProcessed = await this.processBatchableInstanceTasks(tasks, remaining);
    const groups = Array.from(groupInstanceTasksByRuntime(remaining.values()).values());
    const results = new Array(groups.length).fill(0);
    const indexedGroups = groups.map((group, index) => ({ group, index }));
    await runConcurrent(
      indexedGroups,
      INSTANCE_PARALLELISM,
      async ({ group, index }) => {
        results[index] = await this.processInstanceTaskGroup(group, options);
      },
    );
    return batchProcessed + sumProcessedCounts(results);
  }

  private async retryPlayerTaskGroup(tasks: FlushTask[], error: unknown): Promise<number> {
    if (tasks.length === 0) {
      return 0;
    }
    const failure = classifyFlushFailure(error);
    const attemptKey = playerGroupKey(tasks);
    const attempt = this.bumpFailureAttempt(attemptKey);
    const retryDelayMs = resolveFlushRetryDelayMs(failure, attempt);
    const domains = Array.from(new Set(tasks.map((task) => task.domain))).sort();
    if (isNonRecoverableReplayPlayerPayloadError(error) && attempt > NON_RECOVERABLE_PLAYER_QUIET_AFTER) {
      // 确定性不可恢复错误（历史 payload 缺 epoch 的 incomplete fence 等）在运行期重试永远无法成功，
      // 只能等玩家再次产生 dirty 由新 staging 以更新版本覆盖；降频重试并停止刷屏，但绝不标记 flushed 丢数据。
      if (attempt === NON_RECOVERABLE_PLAYER_QUIET_AFTER + 1) {
        this.logger.warn(
          `玩家刷盘确定性失败转为低频等待新 staging 取代：playerId=${tasks[0]?.id ?? 'unknown'} domains=${domains.join(',')} attempts=${attempt} retryDelayMs=${NON_RECOVERABLE_PLAYER_RETRY_DELAY_MS} error=${formatError(error)}`,
        );
      } else {
        this.logger.debug(
          `玩家刷盘确定性失败低频重试中：playerId=${tasks[0]?.id ?? 'unknown'} domains=${domains.join(',')} attempts=${attempt}`,
        );
      }
      this.recordFlushFailure('player', tasks[0]?.id ?? 'unknown', domains.join(','), failure, attempt, NON_RECOVERABLE_PLAYER_RETRY_DELAY_MS);
      await this.flushLedgerService.markFlushTasksRetry(tasks, NON_RECOVERABLE_PLAYER_RETRY_DELAY_MS);
      return 0;
    }
    this.recordFlushFailure('player', tasks[0]?.id ?? 'unknown', domains.join(','), failure, attempt, retryDelayMs);
    if (failure.globalBackoffMs > 0) {
      this.applyGlobalBackoff(failure.globalBackoffMs);
    }
    this.logger.warn(
      `玩家聚合刷盘失败，整组回滚并重试 playerId=${tasks[0]?.id ?? 'unknown'} domains=${domains.join(',')} category=${failure.category}: ${formatError(error)}`,
    );
    await this.flushLedgerService.markFlushTasksRetry(tasks, retryDelayMs);
    return 0;
  }

  private async preserveTechniqueComprehensionTruthAndContinueReplay(
    tasks: FlushTask[],
    error: unknown,
  ): Promise<number | null> {
    const failure = classifyFlushFailure(error);
    if (
      failure.category !== 'empty_overwrite_guard'
      || !failure.message.includes('replace_technique_comprehension_refused_empty_overwrite')
    ) {
      return null;
    }
    const techniqueTasks = tasks.filter((task) => task.domain === 'technique');
    if (techniqueTasks.length !== 1) {
      return null;
    }
    const [techniqueTask] = techniqueTasks;
    const remainingTasks = tasks.filter((task) => task !== techniqueTask);
    this.recordFlushFailure(
      'player',
      techniqueTask.id,
      techniqueTask.domain,
      failure,
      1,
      0,
    );
    if (!await this.flushLedgerService.markFlushTaskFlushed(techniqueTask)) {
      await this.flushLedgerService.markFlushTasksRetry(tasks, RETRY_DELAY_MS);
      return 0;
    }
    if (remainingTasks.length > 0) {
      await this.flushLedgerService.markFlushTasksRetry(remainingTasks, 0);
    }
    this.failureAttempts.delete(playerGroupKey(tasks));
    this.logger.error(
      `启动重放已隔离无法证明的功法领悟空删除 payload：playerId=${techniqueTask.id}，保留 player_technique_comprehension 数据库真源并继续启动`,
    );
    return 1;
  }

  /**
   * 启动重放遇到确定性不可恢复的玩家数据错误时，隔离该玩家整组 durable payload 并继续启动。
   *
   * 隔离语义与资产冲突隔离一致：释放 claim、标记 failure_category=startup_deterministic_stall、
   * 保留 payload 与数据库现状，后续启动重放与普通 worker 均跳过这些行；
   * 玩家在线产生更新版本 payload 时由 upsert 以新真源覆盖隔离标记自动放行。
   */
  private async quarantinePlayerStartupStall(tasks: FlushTask[], error: unknown): Promise<number> {
    if (tasks.length === 0) {
      return 0;
    }
    const playerId = tasks[0]?.id ?? 'unknown';
    const domains = Array.from(new Set(tasks.map((task) => task.domain))).sort();
    const failure = classifyFlushFailure(error);
    const quarantined = await this.flushLedgerService.quarantinePlayerFlushTasksForStartupFailure(tasks);
    if (quarantined !== tasks.length) {
      throw new Error(
        `player_startup_stall_quarantine_incomplete:playerId=${playerId}:updated=${quarantined}:expected=${tasks.length}`,
      );
    }
    this.recordFlushFailure('player', playerId, domains.join(','), failure, 1, 0);
    this.failureAttempts.delete(playerGroupKey(tasks));
    this.logger.error(
      `启动重放已隔离确定性不可恢复的玩家 payload：playerId=${playerId} domains=${domains.join(',')} category=${failure.category} error=${formatError(error)}；保留 durable payload 与数据库现状，需人工核对数据后解除隔离（failure_category 置 NULL）`,
    );
    return tasks.length;
  }


  private async quarantineInstanceStartupStall(tasks: FlushTask[], error: unknown): Promise<number> {
    if (tasks.length === 0) {
      return 0;
    }
    const instanceId = tasks[0]?.id ?? 'unknown';
    const domains = Array.from(new Set(tasks.map((task) => task.domain))).sort();
    const failure = classifyFlushFailure(error);
    const quarantine = (this.flushLedgerService as FlushLedgerService & {
      quarantineInstanceFlushTasksForStartupFailure?: (targetTasks: FlushTask[]) => Promise<number>;
    }).quarantineInstanceFlushTasksForStartupFailure;
    if (typeof quarantine !== 'function') {
      throw new Error('instance_startup_stall_quarantine_unavailable:instanceId=' + instanceId);
    }
    const quarantined = await quarantine.call(this.flushLedgerService, tasks);
    if (quarantined !== tasks.length) {
      throw new Error(
        'instance_startup_stall_quarantine_incomplete:instanceId=' + instanceId
        + ':updated=' + String(quarantined)
        + ':expected=' + String(tasks.length),
      );
    }
    this.recordFlushFailure('instance', instanceId, domains.join(','), failure, 1, 0);
    for (const task of tasks) {
      this.failureAttempts.delete(instanceTaskKey(task));
    }
    this.logger.error(
      '启动重放已隔离确定性不可恢复的实例 payload：instanceId=' + instanceId
      + ' domains=' + domains.join(',')
      + ' category=' + failure.category
      + ' error=' + formatError(error)
      + '；保留 durable payload 与数据库现状，需人工核对数据后解除隔离（failure_category 置 NULL）',
    );
    return tasks.length;
  }

  private async quarantineInventoryOwnershipConflict(
    tasks: FlushTask[],
    error: unknown,
    allowOfflineFenceRebase = false,
  ): Promise<number | null> {
    const failure = classifyFlushFailure(error);
    if (
      failure.category !== 'unique_or_constraint_conflict'
      || !failure.message.includes('replacePlayerInventoryItems: item_instance_id conflict outside player scope')
    ) {
      return null;
    }
    const playerId = tasks[0]?.id ?? '';
    if (!playerId || tasks.some((task) => task.scope !== 'player' || task.id !== playerId)) {
      return null;
    }
    const quarantined = await this.flushLedgerService.quarantinePlayerFlushTasksForAssetConflict(tasks);
    if (quarantined !== tasks.length) {
      throw new Error(
        `player_asset_conflict_quarantine_incomplete:playerId=${playerId}:updated=${quarantined}:expected=${tasks.length}`,
      );
    }
    const domains = Array.from(new Set(tasks.map((task) => task.domain))).sort();
    this.recordFlushFailure('player', playerId, domains.join(','), failure, 1, 0);
    this.failureAttempts.delete(playerGroupKey(tasks));
    const repair = await this.tryRepairPlayerAssetConflictQuarantines(playerId, allowOfflineFenceRebase);
    if ((repair?.repairedPlayers ?? 0) > 0) {
      this.logger.warn(
        `库存实例跨玩家归属冲突已安全换发新 ID 并重新排队：playerId=${playerId} domains=${domains.join(',')}`,
      );
    } else {
      this.logger.error(
        `已隔离库存实例跨玩家归属冲突：playerId=${playerId} domains=${domains.join(',')}，保留 durable payload 与数据库现有资产归属；该玩家需人工核对后解除隔离`,
      );
    }
    return tasks.length;
  }

  private async tryRepairPlayerAssetConflictQuarantines(
    playerId?: string,
    allowOfflineFenceRebase = false,
    logUnresolved = true,
  ): Promise<{
    repairedPlayers?: number;
    unresolvedPlayers?: string[];
  } | null> {
    const repair = (this.flushLedgerService as FlushLedgerService & {
      repairPlayerFlushAssetConflictQuarantines?: (
        playerId?: string | null,
        options?: { allowOfflineFenceRebase?: boolean; logUnresolved?: boolean },
      ) => Promise<{
        repairedPlayers?: number;
        unresolvedPlayers?: string[];
      }>;
    }).repairPlayerFlushAssetConflictQuarantines;
    if (typeof repair !== 'function') {
      return null;
    }
    try {
      return await repair.call(this.flushLedgerService, playerId ?? null, {
        allowOfflineFenceRebase,
        logUnresolved,
      });
    } catch (error) {
      this.logger.error(
        `玩家资产冲突自动修复失败：playerId=${playerId ?? 'all'} error=${formatError(error)}`,
      );
      return null;
    }
  }

  private async processInstanceStatePayloadTaskGroup(
    group: FlushTask[],
    options: { failFastDeterministicPayload?: boolean } = {},
  ): Promise<number | null> {
    if (group.length === 0) {
      return null;
    }
    const payloadRows = group.map((task) => ({ task, payload: normalizeInstanceDomainStatePayload(task.payloadJson) }));
    if (payloadRows.every((row) => !row.payload)) {
      return null;
    }
    const invalidTasks = payloadRows.filter((row) => !row.payload).map((row) => row.task);
    if (invalidTasks.length > 0) {
      if (shouldStartAuthoritativeRuntime()) {
        return null;
      }
      await this.flushLedgerService.markFlushTasksRetry(invalidTasks, RETRY_DELAY_MS);
    }
    if (!this.worldRuntimeService.instanceDomainPersistenceService) {
      await this.flushLedgerService.markFlushTasksRetry(group, RETRY_DELAY_MS);
      return 0;
    }
    let processed = 0;
    for (const { task, payload } of payloadRows as Array<{ task: FlushTask; payload: InstanceDomainStatePayload }>) {
      if (!payload) continue;
      if (!isPayloadRevisionCurrent(payload, task.latestRevision)) {
        this.logger.debug(`实例刷盘放弃 stale state payload：instanceId=${task.id} domain=${task.domain} latestRevision=${task.latestRevision} payloadRevision=${payload.revision ?? 'missing'}`);
        if (await this.flushLedgerService.markFlushTaskFlushed(task)) {
          processed += 1;
        }
        this.failureAttempts.delete(instanceTaskKey(task));
        continue;
      }
      if (!await this.isInstancePayloadFenceCurrent(task)) {
        this.logger.debug(`实例刷盘丢弃旧 ownership epoch payload：instanceId=${task.id} domain=${task.domain} epoch=${task.ownershipEpoch ?? 0}`);
        if (await this.flushLedgerService.markFlushTaskFlushed(task)) {
          processed += 1;
        }
        continue;
      }
      try {
        if (!await this.renewPayloadClaim(task)) {
          continue;
        }
        const applied = await this.applyInstanceDomainStatePayload(task, payload);
        if (!applied) {
          if (await this.flushLedgerService.markFlushTaskFlushed(task)) {
            processed += 1;
          }
          this.failureAttempts.delete(instanceTaskKey(task));
          continue;
        }
        if (await this.flushLedgerService.markFlushTaskFlushed(task)) {
          processed += 1;
          this.markInstancePayloadPersisted(task, payload);
        }
        this.failureAttempts.delete(instanceTaskKey(task));
      } catch (error) {
        if (options.failFastDeterministicPayload === true && isNonRecoverableReplayInstancePayloadError(error)) {
          processed += await this.quarantineInstanceStartupStall([task], error);
          continue;
        }
        await this.markTaskRetryWithDiagnostics(task, error);
      }
    }
    return processed;
  }

  private async isInstancePayloadFenceCurrent(task: FlushTask): Promise<boolean> {
    const taskEpoch = normalizeInt(task.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER);
    const runtime = this.worldRuntimeService.getInstanceRuntime?.(task.id);
    if (runtime) {
      return runtime.meta?.persistent === true
        && normalizeInt(runtime.meta?.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER) === taskEpoch;
    }
    if (!this.instanceCatalogService?.isEnabled()) {
      return true;
    }
    const catalog = await this.instanceCatalogService.loadInstanceCatalog(task.id);
    if (!catalog) {
      return false;
    }
    const status = normalizeString(catalog.status);
    if (status === 'destroyed') {
      return false;
    }
    // shutdown 后 catalog 会标 stopped；同 ownership epoch 的 staged payload 必须先 replay，
    // 不能因运行态尚未 hydrate 就当成过期数据丢弃。
    return normalizeInt(catalog.ownership_epoch, 0, 0, Number.MAX_SAFE_INTEGER) === taskEpoch;
  }

  private markInstancePayloadPersisted(
    task: FlushTask,
    payload: InstanceDomainStatePayload | InstanceDomainDeltaPayload,
  ): void {
    if (payload.stagingGenerationId !== this.stagingGenerationId) {
      return;
    }
    const runtime = this.worldRuntimeService.getInstanceRuntime?.(task.id);
    if (!runtime?.meta?.persistent
      || normalizeInt(runtime.meta.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER)
        !== normalizeInt(task.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER)) {
      return;
    }
    const stagedDomains = normalizePayloadStagedDomains(payload, task.domain);
    runtime.markPersistenceDomainsPersisted?.(
      stagedDomains,
      buildInstanceFlushSnapshotFromPayload(payload),
    );
    if (payload.containerRevision !== undefined && stagedDomains.includes('container_state')) {
      this.worldRuntimeService.worldRuntimeLootContainerService?.clearPersisted?.(
        task.id,
        payload.containerRevision,
      );
    }
  }

  private async processInstanceTaskGroup(
    group: FlushTask[],
    options: { failFastDeterministicPayload?: boolean } = {},
  ): Promise<number> {
    if (this.isGlobalBackoffActive()) {
      return 0;
    }
    const first = group[0];
    if (!first) {
      return 0;
    }
    const payloadProcessed = await this.processInstanceStatePayloadTaskGroup(group, options);
    if (payloadProcessed !== null) {
      return payloadProcessed;
    }
    const runtime = this.worldRuntimeService.getInstanceRuntime?.(first.id);
    if (!runtime) {
      if (await this.shouldMarkMissingRuntimeInstanceTasksFlushed(first)) {
        await this.flushLedgerService.markFlushTasksFlushed(group);
        return group.length;
      }
      await this.flushLedgerService.markFlushTasksRetry(group, RETRY_DELAY_MS);
      this.logger.warn(`实例刷盘任务未找到运行态，保持重试以防空标记 instanceId=${first.id}`);
      return 0;
    }
    const epoch = normalizeInt(runtime.meta?.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER);
    if (!runtime.meta?.persistent || epoch !== normalizeInt(first.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER)) {
      await this.flushLedgerService.markFlushTasksFlushed(group);
      return group.length;
    }
    if (typeof this.worldRuntimeService.flushInstanceDomains !== 'function') {
      await this.flushLedgerService.markFlushTasksRetry(group, RETRY_DELAY_MS);
      this.logger.warn(`实例刷盘任务缺少 flushInstanceDomains，保持重试以防空标记 instanceId=${first.id}`);
      return 0;
    }
    const domains = Array.from(new Set(group.map((task) => task.domain)));
    const attemptKey = instanceGroupKey(group);
    try {
      const result = await this.worldRuntimeService.flushInstanceDomains(first.id, domains);
      if (!result || result.skipped === true) {
        await this.flushLedgerService.markFlushTasksRetry(group, RETRY_DELAY_MS);
        return 0;
      }
      await this.flushLedgerService.markFlushTasksFlushed(group);
      this.failureAttempts.delete(attemptKey);
      return group.length;
    } catch (error) {
      return this.retryInstanceTasksIndividually(group, error);
    }
  }

  private async applyInstanceDomainStatePayload(task: FlushTask, payload: InstanceDomainStatePayload): Promise<boolean> {
    const instanceId = task.id;
    const persistence = this.worldRuntimeService.instanceDomainPersistenceService;
    if (!persistence) {
      throw new Error(`instance_domain_persistence_missing:${instanceId}:${payload.domain}`);
    }
    const ledgerClaim: InstanceFlushLedgerClaim | null = task.claimOwnerId ? {
      ownershipEpoch: normalizeInt(task.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER),
      latestVersion: normalizeInt(task.latestRevision, 0, 0, Number.MAX_SAFE_INTEGER),
      claimOwnerId: task.claimOwnerId,
      fencingToken: task.fencingToken ?? null,
    } : null;
    switch (payload.domain) {
      case 'tile_cell': {
        if (typeof persistence.replaceRuntimeTileCells !== 'function') {
          throw new Error(`instance_domain_persistence_missing:${instanceId}:tile_cell`);
        }
        await persistence.replaceRuntimeTileCells(
          instanceId,
          Array.isArray(payload.payload) ? payload.payload : [],
        );
        break;
      }
      case 'temporary_tile': {
        if (typeof persistence.replaceTemporaryTileStates !== 'function') {
          throw new Error(`instance_domain_persistence_missing:${instanceId}:temporary_tile`);
        }
        const applied = await persistence.replaceTemporaryTileStates(
          instanceId,
          Array.isArray(payload.payload) ? payload.payload : [],
          ledgerClaim,
        );
        if (applied === false) return false;
        break;
      }
      case 'ground_item': {
        const data = payload.payload as { fullReplace?: boolean; tileIndices?: unknown[]; entries?: unknown[] } | null;
        if (data?.fullReplace === true) {
          if (typeof persistence.replaceGroundItems !== 'function') {
            throw new Error(`instance_domain_persistence_missing:${instanceId}:ground_item_full_replace`);
          }
          const applied = await persistence.replaceGroundItems(instanceId, data.entries ?? [], ledgerClaim);
          if (applied === false) return false;
        }
        else {
          if (typeof persistence.replaceGroundItemTiles !== 'function') {
            throw new Error(`instance_domain_persistence_missing:${instanceId}:ground_item_delta`);
          }
          const applied = await persistence.replaceGroundItemTiles(
            instanceId,
            data?.tileIndices ?? [],
            data?.entries ?? [],
            ledgerClaim,
          );
          if (applied === false) return false;
        }
        break;
      }
      case 'overlay': {
        if (typeof persistence.saveOverlayChunk !== 'function') {
          throw new Error(`instance_domain_persistence_missing:${instanceId}:overlay`);
        }
        const chunks = dedupeByLast(Array.isArray(payload.payload) ? payload.payload : [], (chunk) => {
          const record = chunk as { patchKind?: unknown; chunkKey?: unknown };
          return keyedString(record.patchKind, record.chunkKey);
        });
        for (const chunk of chunks) {
          const record = chunk as { patchKind?: unknown; chunkKey?: unknown; patchVersion?: unknown; patchPayload?: unknown };
          await persistence.saveOverlayChunk({ instanceId, patchKind: record.patchKind, chunkKey: record.chunkKey, patchVersion: record.patchVersion, patchPayload: record.patchPayload });
        }
        break;
      }
      case 'monster_runtime': {
        const data = payload.payload as { fullReplace?: boolean; upserts?: unknown[]; deletes?: unknown[]; entries?: unknown[] } | null;
        if (data?.fullReplace === true) {
          if (typeof persistence.replaceMonsterRuntimeStates !== 'function') {
            throw new Error(`instance_domain_persistence_missing:${instanceId}:monster_runtime_full_replace`);
          }
          await persistence.replaceMonsterRuntimeStates(instanceId, data.entries ?? []);
        } else {
          if (typeof persistence.saveMonsterRuntimeDelta !== 'function') {
            throw new Error(`instance_domain_persistence_missing:${instanceId}:monster_runtime_delta`);
          }
          await persistence.saveMonsterRuntimeDelta(instanceId, data?.upserts ?? [], data?.deletes ?? []);
        }
        break;
      }
      case 'container_state': {
        const states = dedupeByLast(Array.isArray(payload.payload) ? payload.payload : [], (state) => {
          const record = state as { containerId?: unknown };
          return normalizeString(record.containerId);
        });
        if (typeof persistence.replaceContainerStates === 'function') {
          const applied = await persistence.replaceContainerStates(
            instanceId,
            states as Array<{ containerId: string; sourceId: string; [key: string]: unknown }>,
            ledgerClaim,
          );
          if (applied === false) return false;
        } else if (typeof persistence.saveContainerState === 'function') {
          if (ledgerClaim && states.length > 1) {
            throw new Error(`instance_domain_persistence_atomic_replace_required:${instanceId}:container_state`);
          }
          for (const state of states) {
            const record = state as { containerId?: unknown; sourceId?: unknown };
            const applied = await persistence.saveContainerState({
              instanceId,
              containerId: record.containerId,
              sourceId: record.sourceId,
              statePayload: state,
              ledgerClaim,
            });
            if (applied === false) return false;
          }
        }
        else {
          throw new Error(`instance_domain_persistence_missing:${instanceId}:container_state`);
        }
        break;
      }
      case 'building':
      case 'room':
      case 'fengshui': {
        if (typeof persistence.saveBuildingRoomFengShuiState !== 'function') {
          throw new Error(`instance_domain_persistence_missing:${instanceId}:building_room_fengshui`);
        }
        await persistence.saveBuildingRoomFengShuiState(
          instanceId,
          normalizeBuildingRoomFengShuiPayload(payload.payload),
          normalizeBuildingRoomFengShuiDomains(normalizePayloadStagedDomains(payload, payload.domain)),
        );
        break;
      }
      case 'time': {
        if (typeof persistence.saveInstanceCheckpoint !== 'function') {
          throw new Error(`instance_domain_persistence_missing:${instanceId}:time`);
        }
        await persistence.saveInstanceCheckpoint(instanceId, payload.payload);
        break;
      }
      default:
        throw new Error(`unsupported_instance_state_payload:${instanceId}:${payload.domain}`);
    }
    if (payload.watermarkPayload !== undefined && payload.watermarkPayload !== null) {
      if (typeof persistence.saveInstanceRecoveryWatermark !== 'function') {
        throw new Error(`instance_domain_persistence_missing:${instanceId}:recovery_watermark`);
      }
      await persistence.saveInstanceRecoveryWatermark(instanceId, payload.watermarkPayload);
    }
    return true;
  }

  private async retryInstanceTasksIndividually(tasks: FlushTask[], groupError: unknown): Promise<number> {
    let processed = 0;
    this.logger.warn(`实例聚合刷盘失败，降级为逐 domain 隔离 instanceId=${tasks[0]?.id ?? 'unknown'}: ${formatError(groupError)}`);
    for (const task of tasks) {
      if (this.isGlobalBackoffActive()) {
        return processed;
      }
      const runtime = this.worldRuntimeService.getInstanceRuntime?.(task.id);
      if (!runtime) {
        if (await this.shouldMarkMissingRuntimeInstanceTasksFlushed(task)) {
          await this.flushLedgerService.markFlushTaskFlushed(task);
          processed += 1;
          continue;
        }
        await this.flushLedgerService.markFlushTaskRetry(task, RETRY_DELAY_MS);
        this.logger.warn(`实例刷盘任务未找到运行态，保持重试以防空标记 instanceId=${task.id} domain=${task.domain}`);
        continue;
      }
      const epoch = normalizeInt(runtime.meta?.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER);
      if (!runtime.meta?.persistent || epoch !== normalizeInt(task.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER)) {
        await this.flushLedgerService.markFlushTaskFlushed(task);
        processed += 1;
        continue;
      }
      if (typeof this.worldRuntimeService.flushInstanceDomains !== 'function') {
        await this.flushLedgerService.markFlushTaskRetry(task, RETRY_DELAY_MS);
        this.logger.warn(`实例刷盘任务缺少 flushInstanceDomains，保持重试以防空标记 instanceId=${task.id} domain=${task.domain}`);
        continue;
      }
      const attemptKey = instanceTaskKey(task);
      try {
        const result = await this.worldRuntimeService.flushInstanceDomains(task.id, [task.domain]);
        if (!result || result.skipped === true) {
          await this.flushLedgerService.markFlushTaskRetry(task, RETRY_DELAY_MS);
          continue;
        }
        await this.flushLedgerService.markFlushTaskFlushed(task);
        this.failureAttempts.delete(attemptKey);
        processed += 1;
      } catch (error) {
        await this.markTaskRetryWithDiagnostics(task, error);
      }
    }
    return processed;
  }

  private async shouldMarkMissingRuntimeInstanceTasksFlushed(task: FlushTask): Promise<boolean> {
    if (task.scope !== 'instance' || !this.instanceCatalogService?.isEnabled()) {
      return false;
    }
    const catalog = await this.instanceCatalogService.loadInstanceCatalog(task.id);
    if (!catalog) {
      return false;
    }
    const status = normalizeString(catalog.status);
    const runtimeStatus = normalizeString(catalog.runtime_status);
    if (status === 'destroyed' || runtimeStatus === 'stopped') {
      return true;
    }
    const catalogEpoch = normalizeInt(catalog.ownership_epoch, 0, 0, Number.MAX_SAFE_INTEGER);
    const taskEpoch = normalizeInt(task.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER);
    return catalogEpoch !== taskEpoch;
  }

  private async processBatchableInstanceTasks(tasks: FlushTask[], remaining: Map<string, FlushTask>): Promise<number> {
    const persistence = this.worldRuntimeService.instanceDomainPersistenceService;
    const hasPersistenceApi = persistence
      && typeof persistence.saveTileDamageDeltaBatch === 'function'
      && typeof persistence.saveTileResourceDeltaBatch === 'function'
      && typeof persistence.saveInstanceRecoveryWatermarkBatch === 'function';
    const hasRuntimeBatchApi = hasPersistenceApi
      && typeof this.worldRuntimeService.buildDomainDeltaBatch === 'function'
      && typeof this.worldRuntimeService.markDomainBatchPersisted === 'function';
    if (!hasPersistenceApi) return 0;
    let processed = 0;
    for (const domain of ['tile_damage', 'tile_resource']) {
      if (this.isGlobalBackoffActive()) {
        return processed;
      }
      const domainTasks = tasks.filter((task) => task.domain === domain);
      if (domainTasks.length === 0) continue;
      const payloadProcessed = await this.processBatchableInstancePayloadTasks(domain, domainTasks, remaining);
      if (payloadProcessed !== null) {
        processed += payloadProcessed;
        continue;
      }
      if (!hasRuntimeBatchApi) continue;
      try {
        const deltas = this.worldRuntimeService.buildDomainDeltaBatch?.(domain, domainTasks.map((task) => task.id)) ?? [];
        if (deltas.length === 0) continue;
        if (domain === 'tile_damage') {
          const fullReplaceDeltas = deltas.filter((delta) => delta.fullReplace === true);
          for (const delta of fullReplaceDeltas) {
            await persistence.saveTileDamageStates?.(delta.instanceId, delta.entries ?? []);
          }
          const rowDeltas = deltas.filter((delta) => delta.fullReplace !== true);
          if (rowDeltas.length > 0) {
            await persistence.saveTileDamageDeltaBatch?.(rowDeltas.map((delta) => ({ instanceId: delta.instanceId, upserts: delta.upserts ?? [], deletes: delta.deletes ?? [] })));
          }
        } else {
          await persistence.saveTileResourceDeltaBatch?.(deltas.map((delta) => ({ instanceId: delta.instanceId, upserts: delta.upserts ?? [], deletes: delta.deletes ?? [] })));
        }
        const watermarks = deltas.filter((delta) => delta.watermarkPayload).map((delta) => ({ instanceId: delta.instanceId, payload: delta.watermarkPayload }));
        if (watermarks.length > 0) await persistence.saveInstanceRecoveryWatermarkBatch?.(watermarks);
        const persistedIds = deltas.map((delta) => delta.instanceId);
        this.worldRuntimeService.markDomainBatchPersisted?.(domain, persistedIds, deltas);
        for (const task of domainTasks.filter((task) => persistedIds.includes(task.id))) {
          await this.flushLedgerService.markFlushTaskFlushed(task);
          this.failureAttempts.delete(instanceTaskKey(task));
          remaining.delete(instanceTaskKey(task));
          processed += 1;
        }
      } catch (error) {
        const failure = classifyFlushFailure(error);
        const retryDelayMs = resolveFlushRetryDelayMs(failure, 1);
        this.recordFlushFailure('instance', `batch:${domain}`, domain, failure, 1, retryDelayMs);
        if (failure.globalBackoffMs > 0) {
          this.applyGlobalBackoff(failure.globalBackoffMs);
        }
        this.logger.warn(`实例批量刷盘任务失败 domain=${domain} category=${failure.category}: ${formatError(error)}`);
        await this.flushLedgerService.markFlushTasksRetry(domainTasks, retryDelayMs);
        for (const task of domainTasks) {
          remaining.delete(instanceTaskKey(task));
        }
      }
    }
    return processed;
  }

  private async processBatchableInstancePayloadTasks(
    domain: string,
    domainTasks: FlushTask[],
    remaining: Map<string, FlushTask>,
  ): Promise<number | null> {
    const persistence = this.worldRuntimeService.instanceDomainPersistenceService;
    const payloadRows = domainTasks.map((task) => ({ task, payload: normalizeInstanceDomainDeltaPayload(task.payloadJson) }));
    if (payloadRows.every((row) => !row.payload)) {
      return null;
    }
    const invalidTasks = payloadRows.filter((row) => !row.payload).map((row) => row.task);
    if (invalidTasks.length > 0) {
      await this.flushLedgerService.markFlushTasksRetry(invalidTasks, RETRY_DELAY_MS);
      for (const task of invalidTasks) remaining.delete(instanceTaskKey(task));
    }
    const validRows = payloadRows.filter((row): row is { task: FlushTask; payload: InstanceDomainDeltaPayload } => row.payload !== null);
    if (validRows.length === 0) {
      return 0;
    }
    const currentRows = [];
    let processed = 0;
    for (const row of validRows) {
      if (!isPayloadRevisionCurrent(row.payload, row.task.latestRevision)) {
        this.logger.debug(`实例刷盘放弃 stale delta payload：instanceId=${row.task.id} domain=${row.task.domain} latestRevision=${row.task.latestRevision} payloadRevision=${row.payload.revision ?? 'missing'}`);
        if (await this.flushLedgerService.markFlushTaskFlushed(row.task)) {
          remaining.delete(instanceTaskKey(row.task));
          processed += 1;
        }
        this.failureAttempts.delete(instanceTaskKey(row.task));
        continue;
      }
      if (!await this.isInstancePayloadFenceCurrent(row.task)) {
        this.logger.debug(`实例刷盘丢弃旧 ownership epoch delta：instanceId=${row.task.id} domain=${row.task.domain} epoch=${row.task.ownershipEpoch ?? 0}`);
        if (await this.flushLedgerService.markFlushTaskFlushed(row.task)) {
          remaining.delete(instanceTaskKey(row.task));
          processed += 1;
        }
        continue;
      }
      if (!await this.renewPayloadClaim(row.task)) {
        remaining.delete(instanceTaskKey(row.task));
        continue;
      }
      currentRows.push(row);
    }
    if (currentRows.length === 0) {
      return processed;
    }
    let appliedRows = currentRows;
    if (domain === 'tile_damage') {
      const fullReplaceRows = currentRows.filter((row) => row.payload.fullReplace === true);
      if (fullReplaceRows.length > 0 && typeof persistence?.saveTileDamageStates !== 'function') {
        throw new Error('instance_domain_persistence_missing:tile_damage_full_replace');
      }
      const appliedDamageRows: typeof currentRows = [];
      for (const row of fullReplaceRows) {
        const applied = await persistence.saveTileDamageStates!(
          row.task.id,
          row.payload.entries ?? [],
          buildInstanceTaskLedgerClaim(row.task),
        );
        if (applied !== false) {
          appliedDamageRows.push(row);
        }
      }
      const deltaRows = currentRows.filter((row) => row.payload.fullReplace !== true);
      if (deltaRows.length > 0) {
        const appliedInstanceIds = await persistence!.saveTileDamageDeltaBatch!(deltaRows.map((row) => ({
          instanceId: row.task.id,
          upserts: row.payload.upserts,
          deletes: row.payload.deletes,
          ledgerClaim: buildInstanceTaskLedgerClaim(row.task),
        })));
        if (Array.isArray(appliedInstanceIds)) {
          const appliedInstanceIdSet = new Set(appliedInstanceIds);
          appliedDamageRows.push(...deltaRows.filter((row) => appliedInstanceIdSet.has(row.task.id)));
        } else {
          appliedDamageRows.push(...deltaRows);
        }
      }
      appliedRows = appliedDamageRows;
    } else if (domain === 'tile_resource') {
      const appliedInstanceIds = await persistence!.saveTileResourceDeltaBatch!(currentRows.map((row) => ({
        instanceId: row.task.id,
        upserts: row.payload.upserts,
        deletes: row.payload.deletes,
        ledgerClaim: buildInstanceTaskLedgerClaim(row.task) ?? undefined,
      })));
      if (Array.isArray(appliedInstanceIds)) {
        const appliedInstanceIdSet = new Set(appliedInstanceIds);
        appliedRows = currentRows.filter((row) => appliedInstanceIdSet.has(row.task.id));
      }
    }
    const appliedRowSet = new Set(appliedRows);
    const unappliedRows = currentRows.filter((row) => !appliedRowSet.has(row));
    const watermarks = appliedRows
      .filter((row) => row.payload.watermarkPayload)
      .map((row) => ({ instanceId: row.task.id, payload: row.payload.watermarkPayload }));
    if (watermarks.length > 0) await persistence!.saveInstanceRecoveryWatermarkBatch!(watermarks);
    for (const { task, payload } of appliedRows) {
      if (await this.flushLedgerService.markFlushTaskFlushed(task)) {
        processed += 1;
        this.markInstancePayloadPersisted(task, payload);
      }
      this.failureAttempts.delete(instanceTaskKey(task));
      remaining.delete(instanceTaskKey(task));
    }
    if (unappliedRows.length > 0) {
      await this.flushLedgerService.markFlushTasksRetry(unappliedRows.map((row) => row.task), RETRY_DELAY_MS);
      for (const { task } of unappliedRows) {
        remaining.delete(instanceTaskKey(task));
      }
    }
    return processed;
  }

  private isFlushPoolBackpressureActive(): boolean {
    const stats = this.databasePoolProvider?.getPoolStats('flush');
    return Boolean(stats && stats.waitingCount >= FLUSH_WAITING_LIMIT);
  }

  private nextProjectionVersion(): number {
    return nextPlayerPersistenceVersion();
  }

  private async markTaskRetryWithDiagnostics(task: FlushTask, error: unknown): Promise<void> {
    const failure = classifyFlushFailure(error);
    const attemptKey = task.scope === 'player' ? playerTaskKey(task) : instanceTaskKey(task);
    const attempt = this.bumpFailureAttempt(attemptKey);
    const retryDelayMs = resolveFlushRetryDelayMs(failure, attempt);
    this.recordFlushFailure(task.scope, task.id, task.domain, failure, attempt, retryDelayMs);
    if (failure.globalBackoffMs > 0) {
      this.applyGlobalBackoff(failure.globalBackoffMs);
    }
    this.logger.warn(`${task.scope === 'player' ? '玩家' : '实例'}刷盘任务失败 id=${task.id} domain=${task.domain} category=${failure.category}: ${formatError(error)}`);
    await this.flushLedgerService.markFlushTaskRetry(task, retryDelayMs);
  }

  private isGlobalBackoffActive(): boolean {
    return Date.now() < this.globalBackoffUntilAt;
  }

  private applyGlobalBackoff(backoffMs: number): void {
    const normalizedBackoffMs = Math.max(0, Math.trunc(Number(backoffMs) || 0));
    if (normalizedBackoffMs <= 0) {
      return;
    }
    const nextUntil = Date.now() + normalizedBackoffMs;
    if (nextUntil <= this.globalBackoffUntilAt) {
      return;
    }
    this.globalBackoffUntilAt = nextUntil;
    this.logger.warn(`统一刷盘因失败分类触发全局退避：backoffMs=${normalizedBackoffMs}`);
  }

  private bumpFailureAttempt(key: string): number {
    const next = (this.failureAttempts.get(key) ?? 0) + 1;
    this.failureAttempts.set(key, next);
    return next;
  }

  private recordFlushFailure(
    scope: 'player' | 'instance',
    id: string,
    domain: string,
    failure: ReturnType<typeof classifyFlushFailure>,
    attempt: number,
    retryDelayMs: number,
  ): void {
    this.flushDiagnostics?.reportFlushFailure({
      scope,
      id,
      domain,
      category: failure.category,
      message: failure.message,
      attempt,
      retryDelayMs,
      timestamp: Date.now(),
      invariantViolation: failure.invariantViolation,
    });
  }
}
