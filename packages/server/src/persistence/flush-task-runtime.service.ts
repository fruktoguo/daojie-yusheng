/**
 * 本文件属于持久化边界，负责 flush 运行时、兼容转换或失败策略等数据可靠性逻辑。
 *
 * 维护时要优先考虑幂等、崩溃恢复和数据库真源，避免在 tick 内直接引入阻塞 IO。
 */
import { Inject, Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { readTrimmedEnv } from '../config/env-alias';
import { shouldStartAuthoritativeRuntime, shouldStartInlineFlushConsumer } from '../config/runtime-role';
import { StartupBarrierService } from '../lifecycle/startup-barrier.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { DatabasePoolProvider } from './database-pool.provider';
import { FlushLedgerService } from './flush-ledger.service';
import { FlushWakeupService } from './flush-wakeup.service';
import { isFlushTaskConsumerMode, isInlineFlushTaskRuntimeMode } from './flush-task-runtime-mode';
import type { FlushTask, FlushTaskPriority, FlushTaskScope } from './flush-task.types';
import { classifyFlushFailure, resolveFlushRetryDelayMs } from './flush-failure-policy';
import { FlushDiagnosticsService } from './flush-diagnostics.service';
import { InstanceCatalogService } from './instance-catalog.service';
import {
  PlayerDomainPersistenceService,
  PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAINS,
  type PlayerPresenceUpsertInput,
} from './player-domain-persistence.service';
import { PlayerPersistenceFlushService } from './player-persistence-flush.service';
import type { PersistedPlayerSnapshot } from './player-persistence.service';
import { buildTimeCheckpointSnapshot } from '../runtime/world/world-runtime-persistence-state.service';

const INTERVAL_MS = readInt('SERVER_FLUSH_TASK_RUNTIME_INTERVAL_MS', 'FLUSH_TASK_RUNTIME_INTERVAL_MS', 1_500, 250, 60_000);
const CLAIM_LIMIT = readInt('SERVER_FLUSH_TASK_RUNTIME_CLAIM_LIMIT', 'FLUSH_TASK_RUNTIME_CLAIM_LIMIT', 64, 1, 256);
const PLAYER_CLAIM_LIMIT = readInt('SERVER_FLUSH_TASK_RUNTIME_PLAYER_CLAIM_LIMIT', 'FLUSH_TASK_RUNTIME_PLAYER_CLAIM_LIMIT', CLAIM_LIMIT, 1, 5_000);
const INSTANCE_CLAIM_LIMIT = readInt('SERVER_FLUSH_TASK_RUNTIME_INSTANCE_CLAIM_LIMIT', 'FLUSH_TASK_RUNTIME_INSTANCE_CLAIM_LIMIT', CLAIM_LIMIT, 1, 5_000);
const PLAYER_HIGH_CLAIM_LIMIT = readInt('SERVER_FLUSH_TASK_RUNTIME_PLAYER_HIGH_LIMIT', 'FLUSH_TASK_RUNTIME_PLAYER_HIGH_LIMIT', Math.max(1, Math.floor(PLAYER_CLAIM_LIMIT * 0.4)), 1, 5_000);
const PLAYER_NORMAL_CLAIM_LIMIT = readInt('SERVER_FLUSH_TASK_RUNTIME_PLAYER_NORMAL_LIMIT', 'FLUSH_TASK_RUNTIME_PLAYER_NORMAL_LIMIT', Math.max(1, Math.floor(PLAYER_CLAIM_LIMIT * 0.45)), 1, 5_000);
const PLAYER_LOW_CLAIM_LIMIT = readInt('SERVER_FLUSH_TASK_RUNTIME_PLAYER_LOW_LIMIT', 'FLUSH_TASK_RUNTIME_PLAYER_LOW_LIMIT', Math.max(1, PLAYER_CLAIM_LIMIT - PLAYER_HIGH_CLAIM_LIMIT - PLAYER_NORMAL_CLAIM_LIMIT), 1, 5_000);
const INSTANCE_HIGH_CLAIM_LIMIT = readInt('SERVER_FLUSH_TASK_RUNTIME_INSTANCE_HIGH_LIMIT', 'FLUSH_TASK_RUNTIME_INSTANCE_HIGH_LIMIT', Math.max(1, Math.floor(INSTANCE_CLAIM_LIMIT * 0.25)), 1, 5_000);
const INSTANCE_NORMAL_CLAIM_LIMIT = readInt('SERVER_FLUSH_TASK_RUNTIME_INSTANCE_NORMAL_LIMIT', 'FLUSH_TASK_RUNTIME_INSTANCE_NORMAL_LIMIT', Math.max(1, Math.floor(INSTANCE_CLAIM_LIMIT * 0.45)), 1, 5_000);
const INSTANCE_LOW_CLAIM_LIMIT = readInt('SERVER_FLUSH_TASK_RUNTIME_INSTANCE_LOW_LIMIT', 'FLUSH_TASK_RUNTIME_INSTANCE_LOW_LIMIT', Math.max(1, INSTANCE_CLAIM_LIMIT - INSTANCE_HIGH_CLAIM_LIMIT - INSTANCE_NORMAL_CLAIM_LIMIT), 1, 5_000);
const PLAYER_PARALLELISM = readInt('SERVER_FLUSH_TASK_RUNTIME_PLAYER_PARALLELISM', 'FLUSH_TASK_RUNTIME_PLAYER_PARALLELISM', 4, 1, 64);
const INSTANCE_PARALLELISM = readInt('SERVER_FLUSH_TASK_RUNTIME_INSTANCE_PARALLELISM', 'FLUSH_TASK_RUNTIME_INSTANCE_PARALLELISM', 4, 1, 64);
const RETRY_DELAY_MS = readInt('SERVER_FLUSH_TASK_RUNTIME_RETRY_DELAY_MS', 'FLUSH_TASK_RUNTIME_RETRY_DELAY_MS', 5_000, 250, 300_000);
const COALESCE_MS = readInt('SERVER_MAP_PERSISTENCE_COALESCE_WINDOW_MS', 'MAP_PERSISTENCE_COALESCE_WINDOW_MS', 3_000, 0, 30_000);
const TIME_CHECKPOINT_MS = readInt('SERVER_MAP_TIME_CHECKPOINT_INTERVAL_MS', 'MAP_TIME_CHECKPOINT_INTERVAL_MS', 300_000, 60_000, 3_600_000);
const MONSTER_RUNTIME_MS = readInt('SERVER_MAP_MONSTER_RUNTIME_FLUSH_INTERVAL_MS', 'MAP_MONSTER_RUNTIME_FLUSH_INTERVAL_MS', 60_000, 10_000, 600_000);
const FLUSH_WAITING_LIMIT = readInt('SERVER_FLUSH_TASK_RUNTIME_POOL_WAITING_THRESHOLD', 'FLUSH_TASK_RUNTIME_POOL_WAITING_THRESHOLD', 8, 0, 100);
const STALE_PAYLOAD_ABANDON_THRESHOLD = readInt('SERVER_FLUSH_TASK_STALE_PAYLOAD_ABANDON_THRESHOLD', 'FLUSH_TASK_STALE_PAYLOAD_ABANDON_THRESHOLD', 10, 2, 100);
const INSTANCE_COALESCE_DOMAINS = new Set(['tile_damage', 'tile_resource', 'fengshui']);
const PLAYER_HIGH_PRIORITY_DOMAINS = new Set(['presence', 'position_checkpoint', 'world_anchor', 'inventory', 'equipment', 'artifact', 'market', 'mail', 'gm_edit', 'gm']);
const INSTANCE_LOW_PRIORITY_DOMAINS = new Set(['time', 'monster_runtime', 'tile_resource', 'tile_damage', 'fengshui']);
const INSTANCE_NORMAL_PRIORITY_DOMAINS = new Set(['container_state', 'ground_item', 'overlay', 'room', 'building', 'temporary_tile', 'tile_cell']);
const PLAYER_PROJECTABLE_DOMAIN_SET = new Set<string>(PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAINS);
const PLAYER_SNAPSHOT_PROJECTION_PAYLOAD_KIND = 'player_snapshot_projection';
const INSTANCE_DOMAIN_DELTA_PAYLOAD_KIND = 'instance_domain_delta';
const INSTANCE_DOMAIN_STATE_PAYLOAD_KIND = 'instance_domain_state';
const INSTANCE_PAYLOAD_BATCH_DOMAINS = new Set(['tile_damage', 'tile_resource']);
const INSTANCE_PAYLOAD_STATE_DOMAINS = new Set(['ground_item', 'overlay', 'monster_runtime', 'container_state', 'building', 'room', 'fengshui', 'time']);

interface PlayerSnapshotProjectionPayload {
  kind: typeof PLAYER_SNAPSHOT_PROJECTION_PAYLOAD_KIND;
  snapshot: PersistedPlayerSnapshot;
  runtimeOwnerId?: string | null;
  sessionEpoch?: number | null;
}

interface InstanceDomainDeltaPayload {
  kind: typeof INSTANCE_DOMAIN_DELTA_PAYLOAD_KIND;
  domain: string;
  upserts: unknown[];
  deletes: unknown[];
  revision?: number;
  watermarkPayload?: unknown;
}

interface InstanceDomainStatePayload {
  kind: typeof INSTANCE_DOMAIN_STATE_PAYLOAD_KIND;
  domain: string;
  payload: unknown;
  revision?: number;
  watermarkPayload?: unknown;
}

interface PlayerRuntimeFlushTaskPort {
  listDirtyPlayerDomains?(): Map<string, Set<string>>;
  listDirtyPlayers?(): string[];
  getPersistenceRevision?(playerId: string): number | null;
  describePersistencePresence?(playerId: string): PlayerPresenceUpsertInput | null;
  buildPersistenceSnapshot?(playerId: string, dirtyDomains?: ReadonlySet<string>): PersistedPlayerSnapshot | null;
}

interface PlayerPersistenceFlushPort {
  flushPlayerDomains(playerId: string, domains: Iterable<string>): Promise<boolean | void>;
}

interface InstanceRuntimeView {
  meta?: { persistent?: boolean | null; ownershipEpoch?: number | null } | null;
  getPersistenceRevision?: () => number | null;
  buildGroundPersistenceDelta?: () => { fullReplace?: boolean; tileIndices?: unknown[]; entries?: unknown[] } | null;
  buildOverlayPersistenceChunks?: () => unknown[];
  buildMonsterRuntimePersistenceDelta?: () => { fullReplace?: boolean; upserts?: unknown[]; deletes?: unknown[] } | null;
  buildMonsterRuntimePersistenceEntries?: () => unknown[];
  buildBuildingRoomFengShuiPersistenceState?: () => unknown;
  worldRuntimeLootContainerService?: { buildContainerPersistenceStates(instanceId: string): unknown[] } | null;
}

interface BatchPersistencePort {
  saveTileDamageDeltaBatch?(deltas: Array<{ instanceId: string; upserts: unknown[]; deletes: unknown[] }>): Promise<void>;
  saveTileResourceDeltaBatch?(deltas: Array<{ instanceId: string; upserts: unknown[]; deletes: unknown[] }>): Promise<void>;
  saveInstanceRecoveryWatermarkBatch?(rows: Array<{ instanceId: string; payload: unknown }>): Promise<void>;
  saveInstanceRecoveryWatermark?(instanceId: string, payload: unknown): Promise<void>;
  saveInstanceCheckpoint?(instanceId: string, payload: unknown): Promise<void>;
  replaceGroundItemTiles?(instanceId: string, tileIndices: unknown[], entries: unknown[]): Promise<void>;
  saveContainerState?(input: { instanceId: string; containerId?: unknown; sourceId?: unknown; statePayload: unknown }): Promise<void>;
  saveOverlayChunk?(input: { instanceId: string; patchKind?: unknown; chunkKey?: unknown; patchVersion?: unknown; patchPayload?: unknown }): Promise<void>;
  saveMonsterRuntimeDelta?(instanceId: string, upserts: unknown[], deletes: unknown[]): Promise<void>;
  replaceMonsterRuntimeStates?(instanceId: string, states: unknown[]): Promise<void>;
  saveBuildingRoomFengShuiState?(instanceId: string, state: unknown): Promise<void>;
}

interface WorldRuntimeFlushTaskPort {
  instanceDomainPersistenceService?: BatchPersistencePort | null;
  worldRuntimeLootContainerService?: { buildContainerPersistenceStates(instanceId: string): unknown[] } | null;
  listDirtyPersistentInstanceDomains?(): Array<{ instanceId: string; domains: string[] }>;
  listDirtyPersistentInstances?(): string[];
  getInstanceRuntime?(instanceId: string): InstanceRuntimeView | null;
  flushInstanceDomains?(instanceId: string, domains?: string[] | null): Promise<{ skipped?: boolean } | null>;
  buildDomainDeltaBatch?(domain: string, instanceIds: string[]): Array<{ instanceId: string; upserts?: unknown[]; deletes?: unknown[]; watermarkPayload?: unknown }>;
  markDomainBatchPersisted?(domain: string, instanceIds: string[]): void;
}

@Injectable()
export class FlushTaskRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FlushTaskRuntimeService.name);
  private readonly workerId = `flush-task-runtime:${process.pid}:${randomUUID()}`;
  private timer: NodeJS.Timeout | null = null;
  private stagingTimer: NodeJS.Timeout | null = null;
  private running: Promise<number> | null = null;
  private globalBackoffUntilAt = 0;
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
      this.timer = setInterval(() => void this.runOnce(), INTERVAL_MS);
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
      this.stagingTimer = setInterval(() => void this.stageDirtyTasksOnce(), INTERVAL_MS);
      this.stagingTimer.unref();
      this.logger.log(`统一刷盘暂存收集器已启动，间隔 ${INTERVAL_MS}ms，不在当前 role 消费刷盘任务`);
      return;
    }
    this.logger.log('统一刷盘任务运行时未启用 inline consumer，保留当前配置模式');
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.stagingTimer) {
      clearInterval(this.stagingTimer);
      this.stagingTimer = null;
    }
  }

  async stageDirtyTasksOnce(): Promise<void> {
    if (this.startupBarrierService && !this.startupBarrierService.isFlushOpen()) {
      return;
    }
    if (!this.flushLedgerService.isEnabled() || !shouldStartAuthoritativeRuntime()) {
      return;
    }
    await this.collectPlayerTasks();
    await this.collectInstanceTasks();
  }

  async runOnce(workerId = this.workerId, filter?: { playerDomain?: string; instanceDomain?: string }): Promise<number> {
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
      await this.collectPlayerTasks();
      await this.collectInstanceTasks();
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
      result.push(...await this.flushLedgerService.claimReadyFlushTasks({ workerId, scope, domain, priority, limit }));
    }
    return result;
  }

  private buildPlayerTaskPayload(
    playerId: string,
    domain: string,
  ): PlayerPresenceUpsertInput | PlayerSnapshotProjectionPayload | null {
    if (domain === 'presence') {
      return this.playerRuntimeService.describePersistencePresence?.(playerId) ?? null;
    }
    if (!PLAYER_PROJECTABLE_DOMAIN_SET.has(domain)) {
      return null;
    }
    const snapshot = this.playerRuntimeService.buildPersistenceSnapshot?.(playerId, new Set([domain])) ?? null;
    if (!snapshot) {
      return null;
    }
    const presence = this.playerRuntimeService.describePersistencePresence?.(playerId) ?? null;
    return {
      kind: PLAYER_SNAPSHOT_PROJECTION_PAYLOAD_KIND,
      snapshot,
      runtimeOwnerId: presence?.runtimeOwnerId ?? null,
      sessionEpoch: presence?.sessionEpoch ?? null,
    };
  }

  private async collectPlayerTasks(): Promise<void> {
    const dirty = this.playerRuntimeService.listDirtyPlayerDomains?.() ?? new Map();
    const entries = dirty.size > 0
      ? Array.from(dirty.entries())
      : (this.playerRuntimeService.listDirtyPlayers?.() ?? []).map((id) => [id, new Set(['snapshot'])] as [string, Set<string>]);
    for (const [playerId, domains] of entries) {
      const normalized = normalizeDomains(domains);
      const taskDomains = resolvePlayerTaskDomains(normalized);
      for (const domain of taskDomains) {
        const payload = this.buildPlayerTaskPayload(playerId, domain);
        await this.flushLedgerService.upsertFlushTask({
          scope: 'player', id: playerId, domain,
          priority: resolveFlushTaskPriority('player', domain),
          latestRevision: resolveRevision(this.playerRuntimeService.getPersistenceRevision?.(playerId)),
          nextAttemptAt: new Date().toISOString(),
          runtimeOwnerId: resolvePlayerPayloadRuntimeOwnerId(payload),
          fencingToken: buildPlayerPayloadFencingToken(payload),
          payloadJson: payload,
        });
      }
      if (taskDomains.length > 0) this.flushWakeupService.signalPlayerFlush(playerId);
    }
  }

  private buildInstanceTaskPayload(instanceId: string, domain: string): InstanceDomainDeltaPayload | InstanceDomainStatePayload | null {
    const runtime = this.worldRuntimeService.getInstanceRuntime?.(instanceId);
    if (INSTANCE_PAYLOAD_BATCH_DOMAINS.has(domain) && typeof this.worldRuntimeService.buildDomainDeltaBatch === 'function') {
      const [delta] = this.worldRuntimeService.buildDomainDeltaBatch(domain, [instanceId]);
      if (!delta || delta.instanceId !== instanceId || !runtime) {
        return null;
      }
      return {
        kind: INSTANCE_DOMAIN_DELTA_PAYLOAD_KIND,
        domain,
        upserts: delta.upserts ?? [],
        deletes: delta.deletes ?? [],
        revision: resolveRevision(runtime.getPersistenceRevision?.()),
        watermarkPayload: delta.watermarkPayload,
      };
    }
    if (!INSTANCE_PAYLOAD_STATE_DOMAINS.has(domain)) {
      return null;
    }
    if (!runtime) {
      return null;
    }
    const revision = resolveRevision(runtime.getPersistenceRevision?.());
    if (domain === 'ground_item') {
      const delta = runtime.buildGroundPersistenceDelta?.();
      return delta && delta.fullReplace !== true
        ? {
            kind: INSTANCE_DOMAIN_STATE_PAYLOAD_KIND,
            domain,
            revision,
            payload: { tileIndices: delta.tileIndices ?? [], entries: delta.entries ?? [] },
          }
        : null;
    }
    if (domain === 'overlay') {
      return { kind: INSTANCE_DOMAIN_STATE_PAYLOAD_KIND, domain, revision, payload: runtime.buildOverlayPersistenceChunks?.() ?? [] };
    }
    if (domain === 'monster_runtime') {
      const delta = runtime.buildMonsterRuntimePersistenceDelta?.();
      if (!delta) return null;
      return { kind: INSTANCE_DOMAIN_STATE_PAYLOAD_KIND, domain, revision, payload: delta.fullReplace === true
        ? { fullReplace: true, entries: runtime.buildMonsterRuntimePersistenceEntries?.() ?? [] }
        : { fullReplace: false, upserts: delta.upserts ?? [], deletes: delta.deletes ?? [] } };
    }
    if (domain === 'container_state') {
      const states = this.worldRuntimeService.worldRuntimeLootContainerService?.buildContainerPersistenceStates?.(instanceId) ?? [];
      return { kind: INSTANCE_DOMAIN_STATE_PAYLOAD_KIND, domain, revision, payload: states };
    }
    if (domain === 'time') {
      return { kind: INSTANCE_DOMAIN_STATE_PAYLOAD_KIND, domain, revision, payload: buildTimeCheckpointSnapshot(runtime) };
    }
    const state = runtime.buildBuildingRoomFengShuiPersistenceState?.();
    return state ? { kind: INSTANCE_DOMAIN_STATE_PAYLOAD_KIND, domain, revision, payload: state } : null;
  }

  private async collectInstanceTasks(): Promise<void> {
    const entries = this.worldRuntimeService.listDirtyPersistentInstanceDomains?.()
      ?? (this.worldRuntimeService.listDirtyPersistentInstances?.() ?? []).map((instanceId) => ({ instanceId, domains: ['domain'] }));
    const now = Date.now();
    for (const entry of entries) {
      const instanceId = normalizeString(entry.instanceId);
      const runtime = instanceId ? this.worldRuntimeService.getInstanceRuntime?.(instanceId) : null;
      if (!instanceId || !runtime?.meta?.persistent) continue;
      const ownershipEpoch = normalizeInt(runtime.meta.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER);
      for (const domain of normalizeDomains(entry.domains)) {
        const payload = this.buildInstanceTaskPayload(instanceId, domain);
        await this.flushLedgerService.upsertFlushTask({
          scope: 'instance', id: instanceId, domain,
          priority: resolveFlushTaskPriority('instance', domain),
          ownershipEpoch,
          latestRevision: resolveRevision(runtime.getPersistenceRevision?.()),
          nextAttemptAt: new Date(now + resolveInstanceDelayMs(domain)).toISOString(),
          payloadJson: payload,
          fencingToken: payload ? `${payload.kind}:${domain}:${ownershipEpoch}:${runtime.getPersistenceRevision?.() ?? 0}` : null,
        });
      }
      this.flushWakeupService.signalInstanceFlush(instanceId);
    }
  }

  private async processPlayerTasks(tasks: FlushTask[]): Promise<number> {
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
          results[index] = await this.retryPlayerTasksIndividually(group, error);
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
    const projectionTasks = group.filter((task) => PLAYER_PROJECTABLE_DOMAIN_SET.has(task.domain));
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
      await this.playerDomainPersistenceService.savePlayerPresence(playerId, payload);
      if (await this.flushLedgerService.markFlushTaskFlushed(task)) processed += 1;
    }
    if (projectionTasks.length > 0) {
      const payloadRows = projectionTasks.map((task) => ({
        task,
        payload: normalizePlayerSnapshotProjectionPayload(task.payloadJson),
      }));
      const invalidTasks = payloadRows.filter((row) => !row.payload).map((row) => row.task);
      if (invalidTasks.length > 0) {
        if (shouldStartAuthoritativeRuntime()) return null;
        for (const task of invalidTasks) {
          const attemptKey = playerTaskKey(task);
          const attempt = this.bumpFailureAttempt(attemptKey);
          if (attempt >= STALE_PAYLOAD_ABANDON_THRESHOLD) {
            this.logger.warn(`玩家刷盘放弃 stale projection：playerId=${playerId} domain=${task.domain} attempt=${attempt}`);
            await this.flushLedgerService.markFlushTaskFlushed(task);
            this.failureAttempts.delete(attemptKey);
            processed += 1;
          } else {
            await this.flushLedgerService.markFlushTaskRetry(task, RETRY_DELAY_MS);
          }
        }
      }
      for (const { task, payload } of payloadRows) {
        if (!payload) {
          continue;
        }
        if (!await this.isPlayerProjectionPayloadFenceCurrent(playerId, payload)) {
          this.logger.warn(`玩家刷盘丢弃 stale projection：playerId=${playerId} domain=${task.domain} payloadEpoch=${payload.sessionEpoch ?? 'none'} payloadOwner=${payload.runtimeOwnerId ?? 'none'}`);
          if (await this.flushLedgerService.markFlushTaskFlushed(task)) processed += 1;
          continue;
        }
        const domains = new Set([task.domain]);
        await this.playerDomainPersistenceService.savePlayerSnapshotProjectionDomains(
          playerId,
          payload.snapshot,
          domains,
          {
            allowInventoryEmptyOverwrite: task.domain === 'inventory',
            allowEquipmentEmptyOverwrite: task.domain === 'equipment',
            allowBuffEmptyOverwrite: task.domain === 'buff',
          },
        );
        if (await this.flushLedgerService.markFlushTaskFlushed(task)) processed += 1;
      }
    }
    return processed;
  }

  private async isPlayerProjectionPayloadFenceCurrent(
    playerId: string,
    payload: PlayerSnapshotProjectionPayload,
  ): Promise<boolean> {
    const payloadEpoch = normalizeInt(payload.sessionEpoch, 0, 0, Number.MAX_SAFE_INTEGER);
    const payloadOwner = normalizeNullableString(payload.runtimeOwnerId);
    if (payloadEpoch <= 0) {
      const persistedPresence = await this.loadPersistedPlayerPresence(playerId);
      return !persistedPresence?.sessionEpoch;
    }
    const persistedPresence = await this.loadPersistedPlayerPresence(playerId);
    const persistedEpoch = normalizeInt(persistedPresence?.sessionEpoch, 0, 0, Number.MAX_SAFE_INTEGER);
    if (persistedEpoch <= 0) {
      return true;
    }
    if (persistedEpoch !== payloadEpoch) {
      return payloadEpoch > persistedEpoch;
    }
    const persistedOwner = normalizeNullableString(persistedPresence?.runtimeOwnerId);
    return !payloadOwner || !persistedOwner || payloadOwner === persistedOwner;
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
    return typeof loader === 'function' ? await loader.call(this.playerDomainPersistenceService, playerId) : null;
  }

  private async processInstanceTasks(tasks: FlushTask[]): Promise<number> {
    const remaining = new Map(tasks.map((task) => [instanceTaskKey(task), task]));
    const batchProcessed = await this.processBatchableInstanceTasks(tasks, remaining);
    const groups = Array.from(groupInstanceTasksByRuntime(remaining.values()).values());
    const results = new Array(groups.length).fill(0);
    const indexedGroups = groups.map((group, index) => ({ group, index }));
    await runConcurrent(
      indexedGroups,
      INSTANCE_PARALLELISM,
      async ({ group, index }) => {
        results[index] = await this.processInstanceTaskGroup(group);
      },
    );
    return batchProcessed + sumProcessedCounts(results);
  }

  private async retryPlayerTasksIndividually(tasks: FlushTask[], groupError: unknown): Promise<number> {
    let processed = 0;
    this.logger.warn(`玩家聚合刷盘失败，降级为逐 domain 隔离 playerId=${tasks[0]?.id ?? 'unknown'}: ${formatError(groupError)}`);
    for (const task of tasks) {
      if (this.isGlobalBackoffActive()) {
        return processed;
      }
      const attemptKey = playerTaskKey(task);
      try {
        const payloadProcessed = await this.processPlayerPayloadTaskGroup(task.id, [task]);
        if (payloadProcessed !== null) {
          processed += payloadProcessed;
          this.failureAttempts.delete(attemptKey);
          continue;
        }
        const flushed = await this.playerPersistenceFlushService.flushPlayerDomains(task.id, [task.domain]);
        if (flushed === false) {
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

  private async processInstanceStatePayloadTaskGroup(group: FlushTask[]): Promise<number | null> {
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
        this.logger.warn(`实例刷盘放弃 stale state payload：instanceId=${task.id} domain=${task.domain} latestRevision=${task.latestRevision} payloadRevision=${payload.revision ?? 'missing'}`);
        if (await this.flushLedgerService.markFlushTaskFlushed(task)) {
          processed += 1;
        }
        this.failureAttempts.delete(instanceTaskKey(task));
        continue;
      }
      try {
        await this.applyInstanceDomainStatePayload(task, payload);
        if (await this.flushLedgerService.markFlushTaskFlushed(task)) {
          processed += 1;
        }
        this.failureAttempts.delete(instanceTaskKey(task));
      } catch (error) {
        await this.markTaskRetryWithDiagnostics(task, error);
      }
    }
    return processed;
  }

  private async processInstanceTaskGroup(group: FlushTask[]): Promise<number> {
    if (this.isGlobalBackoffActive()) {
      return 0;
    }
    const first = group[0];
    if (!first) {
      return 0;
    }
    const payloadProcessed = await this.processInstanceStatePayloadTaskGroup(group);
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

  private async applyInstanceDomainStatePayload(task: FlushTask, payload: InstanceDomainStatePayload): Promise<void> {
    const instanceId = task.id;
    const persistence = this.worldRuntimeService.instanceDomainPersistenceService;
    if (!persistence) {
      throw new Error(`instance_domain_persistence_missing:${instanceId}:${payload.domain}`);
    }
    switch (payload.domain) {
      case 'ground_item': {
        const data = payload.payload as { tileIndices?: unknown[]; entries?: unknown[] } | null;
        await persistence.replaceGroundItemTiles?.(instanceId, data?.tileIndices ?? [], data?.entries ?? []);
        return;
      }
      case 'overlay': {
        const chunks = dedupeByLast(Array.isArray(payload.payload) ? payload.payload : [], (chunk) => {
          const record = chunk as { patchKind?: unknown; chunkKey?: unknown };
          return keyedString(record.patchKind, record.chunkKey);
        });
        for (const chunk of chunks) {
          const record = chunk as { patchKind?: unknown; chunkKey?: unknown; patchVersion?: unknown; patchPayload?: unknown };
          await persistence.saveOverlayChunk?.({ instanceId, patchKind: record.patchKind, chunkKey: record.chunkKey, patchVersion: record.patchVersion, patchPayload: record.patchPayload });
        }
        return;
      }
      case 'monster_runtime': {
        const data = payload.payload as { fullReplace?: boolean; upserts?: unknown[]; deletes?: unknown[]; entries?: unknown[] } | null;
        if (data?.fullReplace === true) {
          await persistence.replaceMonsterRuntimeStates?.(instanceId, data.entries ?? []);
        } else {
          await persistence.saveMonsterRuntimeDelta?.(instanceId, data?.upserts ?? [], data?.deletes ?? []);
        }
        return;
      }
      case 'container_state': {
        const states = dedupeByLast(Array.isArray(payload.payload) ? payload.payload : [], (state) => {
          const record = state as { containerId?: unknown };
          return normalizeString(record.containerId);
        });
        for (const state of states) {
          const record = state as { containerId?: unknown; sourceId?: unknown };
          await persistence.saveContainerState?.({ instanceId, containerId: record.containerId, sourceId: record.sourceId, statePayload: state });
        }
        return;
      }
      case 'building':
      case 'room':
      case 'fengshui': {
        await persistence.saveBuildingRoomFengShuiState?.(
          instanceId,
          normalizeBuildingRoomFengShuiPayload(payload.payload),
        );
        return;
      }
      case 'time': {
        await persistence.saveInstanceCheckpoint?.(instanceId, payload.payload);
        return;
      }
      default:
        throw new Error(`unsupported_instance_state_payload:${instanceId}:${payload.domain}`);
    }
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
          await persistence.saveTileDamageDeltaBatch?.(deltas.map((delta) => ({ instanceId: delta.instanceId, upserts: delta.upserts ?? [], deletes: delta.deletes ?? [] })));
        } else {
          await persistence.saveTileResourceDeltaBatch?.(deltas.map((delta) => ({ instanceId: delta.instanceId, upserts: delta.upserts ?? [], deletes: delta.deletes ?? [] })));
        }
        const watermarks = deltas.filter((delta) => delta.watermarkPayload).map((delta) => ({ instanceId: delta.instanceId, payload: delta.watermarkPayload }));
        if (watermarks.length > 0) await persistence.saveInstanceRecoveryWatermarkBatch?.(watermarks);
        const persistedIds = deltas.map((delta) => delta.instanceId);
        this.worldRuntimeService.markDomainBatchPersisted?.(domain, persistedIds);
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
        this.logger.warn(`实例刷盘放弃 stale delta payload：instanceId=${row.task.id} domain=${row.task.domain} latestRevision=${row.task.latestRevision} payloadRevision=${row.payload.revision ?? 'missing'}`);
        if (await this.flushLedgerService.markFlushTaskFlushed(row.task)) {
          remaining.delete(instanceTaskKey(row.task));
          processed += 1;
        }
        this.failureAttempts.delete(instanceTaskKey(row.task));
        continue;
      }
      currentRows.push(row);
    }
    if (currentRows.length === 0) {
      return processed;
    }
    if (domain === 'tile_damage') {
      await persistence?.saveTileDamageDeltaBatch?.(currentRows.map((row) => ({
        instanceId: row.task.id,
        upserts: row.payload.upserts,
        deletes: row.payload.deletes,
      })));
    } else if (domain === 'tile_resource') {
      await persistence?.saveTileResourceDeltaBatch?.(currentRows.map((row) => ({
        instanceId: row.task.id,
        upserts: row.payload.upserts,
        deletes: row.payload.deletes,
      })));
    }
    const watermarks = currentRows
      .filter((row) => row.payload.watermarkPayload)
      .map((row) => ({ instanceId: row.task.id, payload: row.payload.watermarkPayload }));
    if (watermarks.length > 0) await persistence?.saveInstanceRecoveryWatermarkBatch?.(watermarks);
    for (const { task } of currentRows) {
      if (await this.flushLedgerService.markFlushTaskFlushed(task)) processed += 1;
      this.failureAttempts.delete(instanceTaskKey(task));
      remaining.delete(instanceTaskKey(task));
    }
    return processed;
  }

  private isFlushPoolBackpressureActive(): boolean {
    const stats = this.databasePoolProvider?.getPoolStats('flush');
    return Boolean(stats && stats.waitingCount >= FLUSH_WAITING_LIMIT);
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

function normalizeInstanceDomainStatePayload(value: unknown): InstanceDomainStatePayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.kind !== INSTANCE_DOMAIN_STATE_PAYLOAD_KIND || typeof record.domain !== 'string') {
    return null;
  }
  return {
    kind: INSTANCE_DOMAIN_STATE_PAYLOAD_KIND,
    domain: record.domain,
    payload: record.payload,
    revision: normalizeOptionalRevision(record.revision),
    watermarkPayload: record.watermarkPayload,
  };
}

function isPayloadRevisionCurrent(payload: { revision?: number }, latestRevision: unknown): boolean {
  const payloadRevision = payload.revision;
  const taskRevision = normalizeOptionalRevision(latestRevision);
  return payloadRevision !== undefined && taskRevision !== undefined && payloadRevision === taskRevision;
}

function isStaleGroundItemStatePayloadError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('stale_ground_item_state_payload:');
}

function normalizeOptionalRevision(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.max(0, Math.trunc(parsed));
}

function normalizeInstanceDomainDeltaPayload(value: unknown): InstanceDomainDeltaPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.kind !== INSTANCE_DOMAIN_DELTA_PAYLOAD_KIND || typeof record.domain !== 'string') {
    return null;
  }
  return {
    kind: INSTANCE_DOMAIN_DELTA_PAYLOAD_KIND,
    domain: record.domain,
    upserts: Array.isArray(record.upserts) ? record.upserts : [],
    deletes: Array.isArray(record.deletes) ? record.deletes : [],
    revision: normalizeOptionalRevision(record.revision),
    watermarkPayload: record.watermarkPayload,
  };
}

function normalizePlayerPresencePayload(value: unknown): PlayerPresenceUpsertInput | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  return {
    online: record.online === true,
    inWorld: record.inWorld === true,
    lastHeartbeatAt: normalizeNullableNumber(record.lastHeartbeatAt),
    offlineSinceAt: normalizeNullableNumber(record.offlineSinceAt),
    runtimeOwnerId: normalizeNullableString(record.runtimeOwnerId),
    sessionEpoch: normalizeNullableNumber(record.sessionEpoch),
    transferState: normalizeNullableString(record.transferState),
    transferTargetNodeId: normalizeNullableString(record.transferTargetNodeId),
    versionSeed: normalizeNullableNumber(record.versionSeed),
  };
}

function normalizePlayerSnapshotProjectionPayload(value: unknown): PlayerSnapshotProjectionPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.kind !== PLAYER_SNAPSHOT_PROJECTION_PAYLOAD_KIND || !record.snapshot || typeof record.snapshot !== 'object') {
    return null;
  }
  return {
    kind: PLAYER_SNAPSHOT_PROJECTION_PAYLOAD_KIND,
    snapshot: record.snapshot as PersistedPlayerSnapshot,
    runtimeOwnerId: normalizeNullableString(record.runtimeOwnerId),
    sessionEpoch: normalizeNullableNumber(record.sessionEpoch),
  };
}

function resolvePlayerPayloadRuntimeOwnerId(payload: PlayerPresenceUpsertInput | PlayerSnapshotProjectionPayload | null): string | null {
  if (!payload) {
    return null;
  }
  if ('snapshot' in payload) {
    return payload.runtimeOwnerId ?? null;
  }
  return payload.runtimeOwnerId ?? null;
}

function buildPlayerPayloadFencingToken(payload: PlayerPresenceUpsertInput | PlayerSnapshotProjectionPayload | null): string | null {
  if (!payload) {
    return null;
  }
  if ('snapshot' in payload) {
    return `${payload.kind}:${Math.max(0, Math.trunc(Number(payload.snapshot.savedAt ?? 0)))}:${payload.runtimeOwnerId ?? 'none'}:${Math.max(0, Math.trunc(Number(payload.sessionEpoch ?? 0)))}`;
  }
  return `${payload.runtimeOwnerId ?? 'none'}:${Math.max(0, Math.trunc(Number(payload.sessionEpoch ?? 0)))}`;
}

function resolvePlayerTaskDomains(domains: Set<string>): string[] {
  return Array.from(domains).sort();
}

function resolveInstanceDelayMs(domain: string): number {
  if (INSTANCE_COALESCE_DOMAINS.has(domain)) return COALESCE_MS;
  if (domain === 'time') return TIME_CHECKPOINT_MS;
  if (domain === 'monster_runtime') return MONSTER_RUNTIME_MS;
  return 0;
}

function resolveFlushTaskPriority(scope: FlushTaskScope, domain: string): FlushTaskPriority {
  if (scope === 'player') {
    return PLAYER_HIGH_PRIORITY_DOMAINS.has(domain) ? 'high' : 'normal';
  }
  if (INSTANCE_LOW_PRIORITY_DOMAINS.has(domain)) {
    return 'low';
  }
  if (INSTANCE_NORMAL_PRIORITY_DOMAINS.has(domain)) {
    return 'normal';
  }
  return 'normal';
}

function playerTaskKey(task: FlushTask): string {
  return `${task.id}\u0000${task.domain}`;
}

function playerGroupKey(tasks: FlushTask[]): string {
  const first = tasks[0];
  if (!first) {
    return 'player-group:empty';
  }
  return `${first.id}\u0000${tasks.map((task) => task.domain).sort().join('\u0001')}`;
}

function instanceTaskKey(task: FlushTask): string {
  return `${task.id}\u0000${task.domain}\u0000${task.ownershipEpoch ?? 0}`;
}

function instanceGroupKey(tasks: FlushTask[]): string {
  const first = tasks[0];
  if (!first) {
    return 'instance-group:empty';
  }
  return `${first.id}\u0000${first.ownershipEpoch ?? 0}\u0000${tasks.map((task) => task.domain).sort().join('\u0001')}`;
}

function groupTasksById(tasks: FlushTask[]): Map<string, FlushTask[]> {
  const grouped = new Map<string, FlushTask[]>();
  for (const task of tasks) grouped.set(task.id, [...(grouped.get(task.id) ?? []), task]);
  return grouped;
}

function groupInstanceTasksByRuntime(tasks: Iterable<FlushTask>): Map<string, FlushTask[]> {
  const grouped = new Map<string, FlushTask[]>();
  for (const task of tasks) {
    const key = `${task.id}\u0000${task.ownershipEpoch ?? 0}`;
    grouped.set(key, [...(grouped.get(key) ?? []), task]);
  }
  return grouped;
}

function normalizeDomains(domains: Iterable<string> | null | undefined): Set<string> {
  const normalized = new Set<string>();
  for (const domain of domains ?? []) if (typeof domain === 'string' && domain.trim()) normalized.add(domain.trim());
  return normalized;
}

function sumProcessedCounts(values: unknown): number {
  if (!Array.isArray(values)) {
    return 0;
  }
  return values.reduce((sum, value) => sum + (Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0), 0);
}

function normalizeString(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return '';
}

function normalizeNullableString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function resolveRevision(value: unknown): number {
  return normalizeInt(value, Date.now(), 0, Number.MAX_SAFE_INTEGER);
}

function normalizeInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.trunc(parsed);
  return normalized < min || normalized > max ? fallback : normalized;
}

function readInt(primary: string, fallbackKey: string, fallback: number, min: number, max: number): number {
  return normalizeInt(readTrimmedEnv(primary, fallbackKey), fallback, min, max);
}

function normalizeBuildingRoomFengShuiPayload(payload: unknown): Record<string, unknown> {
  const source = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const buildings = dedupeByLast(Array.isArray(source.buildings) ? source.buildings : [], (entry) => {
    const record = entry as { id?: unknown; buildingId?: unknown; building_id?: unknown };
    return normalizeString(record.id) || normalizeString(record.buildingId) || normalizeString(record.building_id);
  });
  return {
    ...source,
    buildings: buildings.map((entry) => {
      const record = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
      return {
        ...record,
        cells: dedupeByLast(Array.isArray(record.cells) ? record.cells : [], (cell) => {
          const cellRecord = cell as { tileIndex?: unknown; tile_index?: unknown };
          return normalizeString(cellRecord.tileIndex) || normalizeString(cellRecord.tile_index);
        }),
      };
    }),
    rooms: dedupeByLast(Array.isArray(source.rooms) ? source.rooms : [], (entry) => {
      const record = entry as { id?: unknown; roomId?: unknown; room_id?: unknown };
      return normalizeString(record.id) || normalizeString(record.roomId) || normalizeString(record.room_id);
    }),
    roomCells: dedupeByLast(Array.isArray(source.roomCells) ? source.roomCells : [], (entry) => {
      const record = entry as { tileIndex?: unknown; tile_index?: unknown };
      return normalizeString(record.tileIndex) || normalizeString(record.tile_index);
    }),
    fengShui: dedupeByLast(Array.isArray(source.fengShui) ? source.fengShui : [], (entry) => {
      const record = entry as { roomId?: unknown; room_id?: unknown };
      return normalizeString(record.roomId) || normalizeString(record.room_id);
    }),
  };
}

function dedupeByLast<T>(items: T[], keyOf: (item: T) => string): T[] {
  const byKey = new Map<string, T>();
  const keyOrder: string[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (!key) {
      continue;
    }
    if (!byKey.has(key)) {
      keyOrder.push(key);
    }
    byKey.set(key, item);
  }
  return keyOrder.map((key) => byKey.get(key)).filter((item): item is T => item !== undefined);
}

function keyedString(...parts: unknown[]): string {
  const normalized = parts.map((part) => normalizeString(part));
  return normalized.every((part) => part.length > 0) ? normalized.join('\u0000') : '';
}

async function runConcurrent<T>(
  values: T[],
  parallelism: number,
  worker: (value: T) => Promise<void>,
): Promise<void> {
  const normalizedParallelism = Math.max(1, Math.trunc(Number(parallelism) || 1));
  for (let index = 0; index < values.length; index += normalizedParallelism) {
    const slice = values.slice(index, index + normalizedParallelism);
    await Promise.all(slice.map((value) => worker(value)));
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack || error.message : String(error);
}
