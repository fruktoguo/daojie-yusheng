/**
 * 本文件属于持久化边界，负责 flush 运行时、兼容转换或失败策略等数据可靠性逻辑。
 *
 * 维护时要优先考虑幂等、崩溃恢复和数据库真源，避免在 tick 内直接引入阻塞 IO。
 */
import { Inject, Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

import { readTrimmedEnv } from '../config/env-alias';
import { shouldStartAuthoritativeRuntime, shouldStartInlineFlushConsumer } from '../config/runtime-role';
import { StartupBarrierService } from '../lifecycle/startup-barrier.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { DatabasePoolProvider } from './database-pool.provider';
import { FlushLedgerService, type FlushTaskUpsertIdentity, type FlushTaskUpsertResult } from './flush-ledger.service';
import { FlushWakeupService } from './flush-wakeup.service';
import { isFlushTaskConsumerMode, isInlineFlushTaskRuntimeMode } from './flush-task-runtime-mode';
import type { FlushTask, FlushTaskPriority, FlushTaskScope } from './flush-task.types';
import { classifyFlushFailure, resolveFlushRetryDelayMs } from './flush-failure-policy';
import { FlushDiagnosticsService } from './flush-diagnostics.service';
import { InstanceCatalogService } from './instance-catalog.service';
import type { InstanceFlushLedgerClaim } from './instance-flush-ledger-fence';
import {
  PlayerDomainPersistenceService,
  PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAINS,
  nextPlayerPersistenceVersion,
  isConvergedPlayerProjectionFenceError,
  isConvergedPlayerPresenceFenceError,
  type PlayerPresenceUpsertInput,
} from './player-domain-persistence.service';
import { PlayerPersistenceFlushService } from './player-persistence-flush.service';
import type { PersistedPlayerSnapshot } from './player-persistence.service';
import {
  buildInstanceDomainRecoveryWatermark,
  buildTimeCheckpointSnapshot,
} from '../runtime/world/world-runtime-persistence-state.service';

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
const COALESCE_MS = readInt('SERVER_MAP_PERSISTENCE_COALESCE_WINDOW_MS', 'MAP_PERSISTENCE_COALESCE_WINDOW_MS', 60_000, 0, 300_000);
const TIME_CHECKPOINT_MS = readInt('SERVER_MAP_TIME_CHECKPOINT_INTERVAL_MS', 'MAP_TIME_CHECKPOINT_INTERVAL_MS', 300_000, 60_000, 3_600_000);
const MONSTER_RUNTIME_MS = readInt('SERVER_MAP_MONSTER_RUNTIME_FLUSH_INTERVAL_MS', 'MAP_MONSTER_RUNTIME_FLUSH_INTERVAL_MS', 60_000, 10_000, 600_000);
const PLAYER_BACKGROUND_COALESCE_MS = readInt('SERVER_PLAYER_FLUSH_TASK_COALESCE_MS', 'PLAYER_FLUSH_TASK_COALESCE_MS', 60_000, 5_000, 300_000);
const PLAYER_PRESENCE_COALESCE_MS = readInt('SERVER_PLAYER_PRESENCE_FLUSH_TASK_COALESCE_MS', 'PLAYER_PRESENCE_FLUSH_TASK_COALESCE_MS', 30_000, 1_000, 300_000);
const PLAYER_LOCATION_COALESCE_MS = readInt('SERVER_PLAYER_LOCATION_FLUSH_TASK_COALESCE_MS', 'PLAYER_LOCATION_FLUSH_TASK_COALESCE_MS', 5_000, 1_000, 60_000);
const FLUSH_WAITING_LIMIT = readInt('SERVER_FLUSH_TASK_RUNTIME_POOL_WAITING_THRESHOLD', 'FLUSH_TASK_RUNTIME_POOL_WAITING_THRESHOLD', 8, 0, 100);
const STALE_PAYLOAD_ABANDON_THRESHOLD = readInt('SERVER_FLUSH_TASK_STALE_PAYLOAD_ABANDON_THRESHOLD', 'FLUSH_TASK_STALE_PAYLOAD_ABANDON_THRESHOLD', 10, 2, 100);
const STAGING_BATCH_SIZE = readInt('SERVER_FLUSH_TASK_STAGING_BATCH_SIZE', 'FLUSH_TASK_STAGING_BATCH_SIZE', 64, 1, 512);
const PAYLOAD_CLAIM_RENEW_TTL_MS = readInt('SERVER_FLUSH_TASK_PAYLOAD_CLAIM_TTL_MS', 'FLUSH_TASK_PAYLOAD_CLAIM_TTL_MS', 30_000, 5_000, 300_000);
const STARTUP_PAYLOAD_REPLAY_TIMEOUT_MS = readInt('SERVER_STARTUP_PAYLOAD_REPLAY_TIMEOUT_MS', 'STARTUP_PAYLOAD_REPLAY_TIMEOUT_MS', 60_000, 5_000, 300_000);
const STARTUP_PAYLOAD_REPLAY_POLL_MS = readInt('SERVER_STARTUP_PAYLOAD_REPLAY_POLL_MS', 'STARTUP_PAYLOAD_REPLAY_POLL_MS', 100, 25, 2_000);
// 关服总预算为 28 秒；为后台 worker drain 和各领域 final flush 保留足够余量。
const SHUTDOWN_PAYLOAD_REPLAY_TIMEOUT_MS = 10_000;
const SHUTDOWN_STAGING_MAX_ROUNDS = 3;
const INSTANCE_COALESCE_DOMAINS = new Set(['tile_damage', 'tile_resource', 'fengshui']);
const PLAYER_HIGH_PRIORITY_DOMAINS = new Set(['presence', 'position_checkpoint', 'world_anchor', 'inventory', 'equipment', 'artifact', 'market', 'mail', 'gm_edit', 'gm']);
const INSTANCE_LOW_PRIORITY_DOMAINS = new Set(['time', 'monster_runtime', 'tile_resource', 'tile_damage', 'fengshui']);
const INSTANCE_NORMAL_PRIORITY_DOMAINS = new Set(['container_state', 'ground_item', 'overlay', 'room', 'building', 'temporary_tile', 'tile_cell']);
const PLAYER_PROJECTABLE_DOMAIN_SET = new Set<string>(PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAINS);
const PLAYER_FALLBACK_SNAPSHOT_DOMAIN = 'snapshot';
const PLAYER_PRESENCE_PAYLOAD_KIND = 'player_presence';
const PLAYER_SNAPSHOT_PROJECTION_PAYLOAD_KIND = 'player_snapshot_projection';
const PLAYER_GROUPED_CLAIM_DOMAINS = Object.freeze([
  'presence',
  PLAYER_FALLBACK_SNAPSHOT_DOMAIN,
  ...PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAINS,
]);
const PLAYER_GROUPED_CLAIM_DOMAIN_SET = new Set<string>(PLAYER_GROUPED_CLAIM_DOMAINS);
const INSTANCE_DOMAIN_DELTA_PAYLOAD_KIND = 'instance_domain_delta';
const INSTANCE_DOMAIN_STATE_PAYLOAD_KIND = 'instance_domain_state';
const INSTANCE_PAYLOAD_BATCH_DOMAINS = new Set(['tile_damage', 'tile_resource']);
const INSTANCE_PAYLOAD_STATE_DOMAINS = new Set(['tile_cell', 'temporary_tile', 'ground_item', 'overlay', 'monster_runtime', 'container_state', 'building', 'room', 'fengshui', 'time']);
const INSTANCE_BUILDING_COMPOSITE_DOMAINS = new Set(['building', 'room', 'fengshui']);

interface PlayerPayloadMetadata {
  domainRevision: number;
  runtimeRevision: number;
  projectionVersion: number;
  stagingGenerationId: string;
  stagingDomain?: string;
  hasExplicitProjectionVersion?: boolean;
}

interface PlayerPresenceFlushPayload extends PlayerPayloadMetadata {
  kind: typeof PLAYER_PRESENCE_PAYLOAD_KIND;
  presence: PlayerPresenceUpsertInput;
  runtimeOwnerId?: string | null;
  sessionEpoch?: number | null;
}

interface PlayerSnapshotProjectionPayload extends PlayerPayloadMetadata {
  kind: typeof PLAYER_SNAPSHOT_PROJECTION_PAYLOAD_KIND;
  snapshot: PersistedPlayerSnapshot;
  projectedDomains: string[];
  runtimeOwnerId?: string | null;
  sessionEpoch?: number | null;
}

type PlayerProjectionFenceDecision = 'current' | 'stale' | 'indeterminate';

interface InstanceDomainDeltaPayload {
  kind: typeof INSTANCE_DOMAIN_DELTA_PAYLOAD_KIND;
  domain: string;
  fullReplace?: boolean;
  upserts: unknown[];
  deletes: unknown[];
  entries?: unknown[];
  revision?: number;
  domainRevisions?: Record<string, number>;
  stagedDomains?: string[];
  stagingGenerationId?: string;
  containerRevision?: number;
  watermarkPayload?: unknown;
}

interface InstanceDomainStatePayload {
  kind: typeof INSTANCE_DOMAIN_STATE_PAYLOAD_KIND;
  domain: string;
  payload: unknown;
  revision?: number;
  domainRevisions?: Record<string, number>;
  stagedDomains?: string[];
  stagingGenerationId?: string;
  containerRevision?: number;
  watermarkPayload?: unknown;
}

interface InstanceFlushSnapshotView {
  [key: string]: unknown;
  persistenceRevision?: number;
  domainRevisions?: Map<string, number>;
}

interface PreparedInstancePayload {
  payload: InstanceDomainDeltaPayload | InstanceDomainStatePayload;
  latestRevision: number;
  flushSnapshot: InstanceFlushSnapshotView | null;
  stagedDomains: string[];
  containerRevision: number | null;
}

interface PlayerRuntimeFlushTaskPort {
  listDirtyPlayerDomains?(): Map<string, Set<string>>;
  listUnstagedPlayerDomainRevisions?(stagingGenerationId: string): Map<string, Map<string, number>>;
  listDirtyPlayers?(): string[];
  getPersistenceRevision?(playerId: string): number | null;
  getPersistenceDomainRevision?(playerId: string, domain: string): number | null;
  ensureRuntimeOwnershipClaimed?(playerId: string): Promise<{
    runtimeOwnerId?: string | null;
    sessionEpoch?: number | null;
  } | null>;
  describePersistencePresence?(playerId: string): PlayerPresenceUpsertInput | null;
  buildPersistenceSnapshot?(playerId: string, dirtyDomains?: ReadonlySet<string>): PersistedPlayerSnapshot | null;
  markPersistenceDomainsStaged?(
    playerId: string,
    domainRevisions: ReadonlyMap<string, number>,
    runtimeRevision: number,
    stagingGenerationId: string,
  ): void;
  markPersistenceDomainsPersistedByRevision?(
    playerId: string,
    domainRevisions: ReadonlyMap<string, number>,
    runtimeRevision: number,
    stagingGenerationId: string,
  ): void;
}

interface PlayerPersistenceFlushPort {
  flushPlayerDomains(playerId: string, domains: Iterable<string>): Promise<boolean | void>;
}

interface InstanceRuntimeView {
  meta?: { persistent?: boolean | null; ownershipEpoch?: number | null } | null;
  getPersistenceRevision?: () => number | null;
  getPersistenceDomainRevision?: (domain: string) => number | null;
  getStagedPersistenceDomainRevision?: (domain: string, stagingGenerationId: string) => number | null;
  isDirtyDomainHighPriority?: (domain: string) => boolean;
  capturePersistenceDomainFlushSnapshot?: (domains: string[]) => unknown;
  markPersistenceDomainsStaged?: (domains: string[], flushSnapshot: unknown, stagingGenerationId: string) => void;
  markPersistenceDomainsPersisted?: (domains: string[], flushSnapshot?: unknown) => void;
  isPersistenceDomainHeld?: (domain: string) => boolean;
  buildRuntimeTilePersistenceEntries?: () => unknown[];
  buildTemporaryTilePersistenceEntries?: () => unknown[];
  buildGroundPersistenceDelta?: (flushSnapshot?: unknown) => { fullReplace?: boolean; tileIndices?: unknown[]; entries?: unknown[] } | null;
  buildGroundPersistenceEntries?: () => unknown[];
  buildOverlayPersistenceChunks?: () => unknown[];
  buildMonsterRuntimePersistenceDelta?: (flushSnapshot?: unknown) => { fullReplace?: boolean; upserts?: unknown[]; deletes?: unknown[] } | null;
  buildMonsterRuntimePersistenceEntries?: () => unknown[];
  buildBuildingRoomFengShuiPersistenceState?: () => unknown;
}

interface BatchPersistencePort {
  saveTileDamageStates?(instanceId: string, entries: unknown[]): Promise<void>;
  saveTileDamageDeltaBatch?(deltas: Array<{ instanceId: string; upserts: unknown[]; deletes: unknown[] }>): Promise<void>;
  saveTileResourceDeltaBatch?(deltas: Array<{
    instanceId: string;
    upserts: unknown[];
    deletes: unknown[];
    ledgerClaim?: {
      ownershipEpoch: number;
      latestVersion: number;
      claimOwnerId: string;
      fencingToken?: string | null;
    };
  }>): Promise<void | string[]>;
  saveInstanceRecoveryWatermarkBatch?(rows: Array<{ instanceId: string; payload: unknown }>): Promise<void>;
  saveInstanceRecoveryWatermark?(instanceId: string, payload: unknown): Promise<void>;
  saveInstanceCheckpoint?(instanceId: string, payload: unknown): Promise<void>;
  replaceRuntimeTileCells?(instanceId: string, entries: unknown[]): Promise<void>;
  replaceTemporaryTileStates?(instanceId: string, entries: unknown[]): Promise<void>;
  replaceGroundItems?(instanceId: string, entries: unknown[], ledgerClaim?: InstanceFlushLedgerClaim | null): Promise<void | boolean>;
  replaceGroundItemTiles?(instanceId: string, tileIndices: unknown[], entries: unknown[], ledgerClaim?: InstanceFlushLedgerClaim | null): Promise<void | boolean>;
  saveContainerState?(input: {
    instanceId: string;
    containerId?: unknown;
    sourceId?: unknown;
    statePayload: unknown;
    ledgerClaim?: InstanceFlushLedgerClaim | null;
  }): Promise<void | boolean>;
  replaceContainerStates?(
    instanceId: string,
    states: Array<{ containerId: string; sourceId: string; [key: string]: unknown }>,
    ledgerClaim?: InstanceFlushLedgerClaim | null,
  ): Promise<void | boolean>;
  saveOverlayChunk?(input: { instanceId: string; patchKind?: unknown; chunkKey?: unknown; patchVersion?: unknown; patchPayload?: unknown }): Promise<void>;
  saveMonsterRuntimeDelta?(instanceId: string, upserts: unknown[], deletes: unknown[]): Promise<void>;
  replaceMonsterRuntimeStates?(instanceId: string, states: unknown[]): Promise<void>;
  saveBuildingRoomFengShuiState?(instanceId: string, state: unknown): Promise<void>;
}

interface WorldRuntimeFlushTaskPort {
  instanceDomainPersistenceService?: BatchPersistencePort | null;
  worldRuntimeLootContainerService?: {
    buildContainerPersistenceStates(instanceId: string): unknown[];
    getContainerPersistenceRevision?(instanceId: string): number;
    clearPersisted?(instanceId: string, expectedRevision?: number | null): boolean;
  } | null;
  listDirtyPersistentInstanceDomains?(): Array<{ instanceId: string; domains: string[] }>;
  listDirtyPersistentInstances?(): string[];
  getInstanceRuntime?(instanceId: string): InstanceRuntimeView | null;
  flushInstanceDomains?(instanceId: string, domains?: string[] | null): Promise<{ skipped?: boolean } | null>;
  buildDomainDeltaBatch?(domain: string, instanceIds: string[]): Array<{
    instanceId: string;
    fullReplace?: boolean;
    upserts?: unknown[];
    deletes?: unknown[];
    entries?: unknown[];
    watermarkPayload?: unknown;
    flushSnapshot?: unknown;
  }>;
  markDomainBatchPersisted?(
    domain: string,
    instanceIds: string[],
    snapshots?: Array<{ instanceId: string; flushSnapshot?: unknown }>,
  ): void;
}

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
  private readonly nextInstanceStageAtByKey = new Map<string, number>();
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
    return this.enqueueDurablePayloadReplay(input);
  }

  private enqueueDurablePayloadReplay(input?: {
    instanceId?: string | null;
    ownershipEpoch?: number | null;
    timeoutMs?: number;
  }): Promise<number> {
    const run = async (): Promise<number> => this.runDurablePayloadReplay(input);
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
  }): Promise<number> {
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
      assertReplayablePlayerPayloads(playerTasks);
      assertReplayableInstancePayloads(instanceTasks);
      const claimedCount = playerTasks.length + instanceTasks.length;
      if (playerTasks.length > 0) {
        processedTotal += await this.processPlayerTasks(playerTasks, {
          failFastDeterministicPayload: true,
          preserveTechniqueComprehensionTruthOnEmptyOverwrite: true,
        });
      }
      if (instanceTasks.length > 0) {
        processedTotal += await this.processInstanceTasks(instanceTasks);
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
      assertReplayablePlayerPayloads(tasks);
      if (tasks.length > 0) {
        processedTotal += await this.processPlayerTasks(tasks, { failFastDeterministicPayload: true });
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
        if (!force && !this.shouldStagePlayerDomainNow(playerId, domain)) {
          continue;
        }
        const domainRevision = Math.max(0, Math.trunc(Number(domainRevisions.get(domain) ?? 0)));
        if (domainRevision <= 0) {
          continue;
        }
        const taskDomains = domain === PLAYER_FALLBACK_SNAPSHOT_DOMAIN
          ? Array.from(PLAYER_PROJECTABLE_DOMAIN_SET).sort()
          : [domain];
        const transferTracker = { remaining: taskDomains.length };
        const capturedDomainRevisions = new Map([[domain, domainRevision]]);
        const stageDelayMs = force ? 0 : resolvePlayerStageDelayMs(domain);
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
              this.playerRuntimeService.markPersistenceDomainsStaged?.(
                playerId,
                capturedDomainRevisions,
                runtimeRevision,
                this.stagingGenerationId,
              );
              this.markPlayerDomainStagedAt(playerId, domain, stageDelayMs);
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
      payload = state ? { ...basePayload, payload: state } : null;
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
          const quarantined = await this.quarantineInventoryOwnershipConflict(group, error);
          if (quarantined !== null) {
            results[index] = quarantined;
            return;
          }
          if (options.failFastDeterministicPayload === true && isDeterministicReplayPlayerPayloadError(error)) {
            throw error;
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
          throw new Error(
            `player_snapshot_projection_incomplete_fence:${playerId}:expectedOwner=${effectiveRuntimeOwnerId ?? 'none'}:expectedEpoch=${payload.sessionEpoch ?? 'none'}`,
          );
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

  private async retryPlayerTaskGroup(tasks: FlushTask[], error: unknown): Promise<number> {
    if (tasks.length === 0) {
      return 0;
    }
    const failure = classifyFlushFailure(error);
    const attemptKey = playerGroupKey(tasks);
    const attempt = this.bumpFailureAttempt(attemptKey);
    const retryDelayMs = resolveFlushRetryDelayMs(failure, attempt);
    const domains = Array.from(new Set(tasks.map((task) => task.domain))).sort();
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

  private async quarantineInventoryOwnershipConflict(
    tasks: FlushTask[],
    error: unknown,
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
    this.logger.error(
      `已隔离库存实例跨玩家归属冲突：playerId=${playerId} domains=${domains.join(',')}，保留 durable payload 与数据库现有资产归属；该玩家需人工核对后解除隔离`,
    );
    return tasks.length;
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
        await persistence.replaceTemporaryTileStates(
          instanceId,
          Array.isArray(payload.payload) ? payload.payload : [],
        );
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
      for (const row of fullReplaceRows) {
        await persistence.saveTileDamageStates!(row.task.id, row.payload.entries ?? []);
      }
      const deltaRows = currentRows.filter((row) => row.payload.fullReplace !== true);
      if (deltaRows.length > 0) {
        await persistence!.saveTileDamageDeltaBatch!(deltaRows.map((row) => ({
          instanceId: row.task.id,
          upserts: row.payload.upserts,
          deletes: row.payload.deletes,
        })));
      }
    } else if (domain === 'tile_resource') {
      const appliedInstanceIds = await persistence!.saveTileResourceDeltaBatch!(currentRows.map((row) => ({
        instanceId: row.task.id,
        upserts: row.payload.upserts,
        deletes: row.payload.deletes,
        ledgerClaim: row.task.claimOwnerId ? {
          ownershipEpoch: normalizeInt(row.task.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER),
          latestVersion: normalizeInt(row.task.latestRevision, 0, 0, Number.MAX_SAFE_INTEGER),
          claimOwnerId: row.task.claimOwnerId,
          fencingToken: row.task.fencingToken ?? null,
        } : undefined,
      })));
      if (Array.isArray(appliedInstanceIds)) {
        const appliedInstanceIdSet = new Set(appliedInstanceIds);
        appliedRows = currentRows.filter((row) => appliedInstanceIdSet.has(row.task.id));
      }
    }
    const appliedTaskKeys = new Set(appliedRows.map((row) => instanceTaskKey(row.task)));
    const watermarks = appliedRows
      .filter((row) => row.payload.watermarkPayload)
      .map((row) => ({ instanceId: row.task.id, payload: row.payload.watermarkPayload }));
    if (watermarks.length > 0) await persistence!.saveInstanceRecoveryWatermarkBatch!(watermarks);
    for (const { task, payload } of currentRows) {
      if (await this.flushLedgerService.markFlushTaskFlushed(task)) {
        processed += 1;
        if (appliedTaskKeys.has(instanceTaskKey(task))) {
          this.markInstancePayloadPersisted(task, payload);
        }
      }
      this.failureAttempts.delete(instanceTaskKey(task));
      remaining.delete(instanceTaskKey(task));
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
    domainRevisions: normalizeDomainRevisionRecord(record.domainRevisions),
    stagedDomains: normalizeStringArray(record.stagedDomains),
    stagingGenerationId: normalizeNullableString(record.stagingGenerationId) ?? undefined,
    containerRevision: normalizeOptionalRevision(record.containerRevision),
    watermarkPayload: record.watermarkPayload,
  };
}

function isPayloadRevisionCurrent(
  payload: { revision?: number; stagingGenerationId?: string },
  latestRevision: unknown,
): boolean {
  // 旧 ledger 的 latest_version 可能来自进程重启前的高水位，而 payload 已被历史 UPSERT
  // 以较低 runtime revision 覆盖；没有 generation 证据时只能依赖 ownership epoch replay。
  if (!normalizeNullableString(payload.stagingGenerationId)) {
    return true;
  }
  const payloadRevision = payload.revision;
  const taskRevision = normalizeOptionalRevision(latestRevision);
  return payloadRevision !== undefined && taskRevision !== undefined && payloadRevision === taskRevision;
}

function isStaleGroundItemStatePayloadError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('stale_ground_item_state_payload:');
}

function isDeterministicReplayPlayerPayloadError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.startsWith('player_snapshot_projection_incomplete_fence:')
    || error.message.startsWith('player_snapshot_projection_presence_loader_unavailable:')
    || error.message.startsWith('player_presence_incomplete_fence:');
}

function normalizeOptionalRevision(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.max(0, Math.trunc(parsed));
}

function normalizeInstanceFlushSnapshot(value: unknown): InstanceFlushSnapshotView | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as { persistenceRevision?: unknown; domainRevisions?: unknown };
  const domainRevisions = record.domainRevisions instanceof Map
    ? new Map(Array.from(record.domainRevisions.entries(), ([domain, revision]) => [String(domain), Math.max(0, Math.trunc(Number(revision) || 0))]))
    : new Map(Object.entries(normalizeDomainRevisionRecord(record.domainRevisions)));
  return {
    ...(value as Record<string, unknown>),
    persistenceRevision: normalizeOptionalRevision(record.persistenceRevision),
    domainRevisions,
  };
}

function serializeDomainRevisions(
  flushSnapshot: InstanceFlushSnapshotView | null,
  domains: string[],
): Record<string, number> {
  const revisions: Record<string, number> = {};
  for (const domain of domains) {
    const normalizedDomain = normalizeString(domain);
    const revision = normalizeOptionalRevision(flushSnapshot?.domainRevisions?.get(normalizedDomain)) ?? 0;
    if (normalizedDomain && revision > 0) {
      revisions[normalizedDomain] = revision;
    }
  }
  return revisions;
}

function normalizeDomainRevisionRecord(value: unknown): Record<string, number> {
  const revisions: Record<string, number> = {};
  const entries = value instanceof Map
    ? Array.from(value.entries())
    : (value && typeof value === 'object' ? Object.entries(value as Record<string, unknown>) : []);
  for (const [domain, revision] of entries) {
    const normalizedDomain = normalizeString(domain);
    const normalizedRevision = normalizeOptionalRevision(revision) ?? 0;
    if (normalizedDomain && normalizedRevision > 0) {
      revisions[normalizedDomain] = normalizedRevision;
    }
  }
  return revisions;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.map(normalizeString).filter(Boolean))).sort();
}

function normalizePayloadStagedDomains(
  payload: InstanceDomainStatePayload | InstanceDomainDeltaPayload,
  fallbackDomain: string,
): string[] {
  const domains = normalizeStringArray(payload.stagedDomains);
  return domains.length > 0 ? domains : [fallbackDomain];
}

function buildInstanceFlushSnapshotFromPayload(
  payload: InstanceDomainStatePayload | InstanceDomainDeltaPayload,
): InstanceFlushSnapshotView {
  return {
    persistenceRevision: payload.revision,
    domainRevisions: new Map(Object.entries(normalizeDomainRevisionRecord(payload.domainRevisions))),
  };
}

function buildInstancePayloadFencingToken(
  stagingGenerationId: string,
  domain: string,
  ownershipEpoch: number,
): string {
  const source = `${stagingGenerationId}:${domain}:${ownershipEpoch}`;
  return `instance:${createHash('sha256').update(source).digest('hex')}`;
}

function isPlayerPayloadVersionCurrent(
  payload: PlayerPresenceFlushPayload | PlayerSnapshotProjectionPayload,
  latestRevision: unknown,
): boolean {
  if (payload.hasExplicitProjectionVersion !== true) {
    return true;
  }
  return normalizeOptionalRevision(payload.projectionVersion) === normalizeOptionalRevision(latestRevision);
}

function hasCompletePlayerRuntimeFence(value: PlayerPresenceUpsertInput | null | undefined): boolean {
  return Boolean(
    normalizeNullableString(value?.runtimeOwnerId)
    && normalizeInt(value?.sessionEpoch, 0, 0, Number.MAX_SAFE_INTEGER) > 0,
  );
}

function assertReplayablePlayerPayloads(tasks: FlushTask[]): void {
  for (const task of tasks) {
    if (task.domain === 'presence') {
      if (!normalizePlayerPresencePayload(task.payloadJson)) {
        throw new Error(`startup_player_payload_unparseable:${task.id}:${task.domain}`);
      }
      continue;
    }
    if ((!PLAYER_PROJECTABLE_DOMAIN_SET.has(task.domain) && task.domain !== PLAYER_FALLBACK_SNAPSHOT_DOMAIN)
      || !normalizePlayerSnapshotProjectionPayload(task.payloadJson)) {
      throw new Error(`startup_player_payload_unsupported:${task.id}:${task.domain}`);
    }
  }
}

function assertReplayableInstancePayloads(tasks: FlushTask[]): void {
  for (const task of tasks) {
    const statePayload = normalizeInstanceDomainStatePayload(task.payloadJson);
    const deltaPayload = normalizeInstanceDomainDeltaPayload(task.payloadJson);
    if (!statePayload && !deltaPayload) {
      throw new Error(`startup_instance_payload_unparseable:${task.id}:${task.domain}:${task.ownershipEpoch ?? 0}`);
    }
    const payloadDomain = statePayload?.domain ?? deltaPayload?.domain ?? '';
    if (payloadDomain !== task.domain) {
      throw new Error(`startup_instance_payload_domain_mismatch:${task.id}:${task.domain}:${payloadDomain}`);
    }
  }
}

function waitForReplayPoll(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(25, Math.trunc(Number(delayMs) || STARTUP_PAYLOAD_REPLAY_POLL_MS)));
  });
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
    fullReplace: record.fullReplace === true,
    upserts: Array.isArray(record.upserts) ? record.upserts : [],
    deletes: Array.isArray(record.deletes) ? record.deletes : [],
    entries: Array.isArray(record.entries) ? record.entries : [],
    revision: normalizeOptionalRevision(record.revision),
    domainRevisions: normalizeDomainRevisionRecord(record.domainRevisions),
    stagedDomains: normalizeStringArray(record.stagedDomains),
    stagingGenerationId: normalizeNullableString(record.stagingGenerationId) ?? undefined,
    watermarkPayload: record.watermarkPayload,
  };
}

function normalizePlayerPresencePayload(value: unknown): PlayerPresenceFlushPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const presenceRecord = record.kind === PLAYER_PRESENCE_PAYLOAD_KIND
    && record.presence
    && typeof record.presence === 'object'
    ? record.presence as Record<string, unknown>
    : record;
  if (typeof presenceRecord.online !== 'boolean' || typeof presenceRecord.inWorld !== 'boolean') {
    return null;
  }
  const runtimeOwnerId = normalizeNullableString(record.runtimeOwnerId ?? presenceRecord.runtimeOwnerId);
  const sessionEpoch = normalizeNullableNumber(record.sessionEpoch ?? presenceRecord.sessionEpoch);
  const versionSeed = normalizeNullableNumber(presenceRecord.versionSeed);
  if ((sessionEpoch === null || sessionEpoch < 0) && versionSeed === null) {
    return null;
  }
  return {
    kind: PLAYER_PRESENCE_PAYLOAD_KIND,
    presence: {
      online: presenceRecord.online === true,
      inWorld: presenceRecord.inWorld === true,
      lastHeartbeatAt: normalizeNullableNumber(presenceRecord.lastHeartbeatAt),
      offlineSinceAt: normalizeNullableNumber(presenceRecord.offlineSinceAt),
      runtimeOwnerId,
      sessionEpoch,
      transferState: normalizeNullableString(presenceRecord.transferState),
      transferTargetNodeId: normalizeNullableString(presenceRecord.transferTargetNodeId),
      versionSeed,
    },
    domainRevision: normalizeOptionalRevision(record.domainRevision) ?? 0,
    runtimeRevision: normalizeOptionalRevision(record.runtimeRevision) ?? 0,
    projectionVersion: normalizeOptionalRevision(record.projectionVersion)
      ?? normalizeOptionalRevision(presenceRecord.versionSeed)
      ?? 0,
    stagingGenerationId: normalizeNullableString(record.stagingGenerationId) ?? '',
    stagingDomain: normalizeNullableString(record.stagingDomain) ?? undefined,
    hasExplicitProjectionVersion: record.projectionVersion !== undefined,
    runtimeOwnerId,
    sessionEpoch,
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
    projectedDomains: normalizeStringArray(record.projectedDomains),
    domainRevision: normalizeOptionalRevision(record.domainRevision) ?? 0,
    runtimeRevision: normalizeOptionalRevision(record.runtimeRevision) ?? 0,
    projectionVersion: normalizeOptionalRevision(record.projectionVersion)
      ?? normalizeOptionalRevision((record.snapshot as Record<string, unknown>).savedAt)
      ?? 0,
    stagingGenerationId: normalizeNullableString(record.stagingGenerationId) ?? '',
    stagingDomain: normalizeNullableString(record.stagingDomain) ?? undefined,
    hasExplicitProjectionVersion: record.projectionVersion !== undefined,
    runtimeOwnerId: normalizeNullableString(record.runtimeOwnerId),
    sessionEpoch: normalizeNullableNumber(record.sessionEpoch),
  };
}

function resolvePlayerPayloadRuntimeOwnerId(payload: PlayerPresenceFlushPayload | PlayerSnapshotProjectionPayload | null): string | null {
  if (!payload) {
    return null;
  }
  if ('snapshot' in payload) {
    return payload.runtimeOwnerId ?? null;
  }
  return payload.runtimeOwnerId ?? null;
}

function buildPlayerPayloadFencingToken(payload: PlayerPresenceFlushPayload | PlayerSnapshotProjectionPayload | null): string | null {
  if (!payload) {
    return null;
  }
  const source = `${payload.stagingGenerationId}:${payload.runtimeOwnerId ?? 'none'}:${Math.max(0, Math.trunc(Number(payload.sessionEpoch ?? 0)))}`;
  return `player:${createHash('sha256').update(source).digest('hex')}`;
}

function resolvePlayerTaskDomains(domains: Set<string>): string[] {
  return Array.from(domains).sort();
}

function resolvePlayerStageDelayMs(domain: string): number {
  if (domain === 'presence') return PLAYER_PRESENCE_COALESCE_MS;
  if (domain === 'position_checkpoint' || domain === 'world_anchor') return PLAYER_LOCATION_COALESCE_MS;
  if (PLAYER_HIGH_PRIORITY_DOMAINS.has(domain)) return 0;
  return PLAYER_BACKGROUND_COALESCE_MS;
}

function resolveInstanceStageDelayMs(domain: string, stagedDomains: string[]): number {
  if (domain === 'time' || stagedDomains.includes('time')) return TIME_CHECKPOINT_MS;
  if (domain === 'monster_runtime' || stagedDomains.includes('monster_runtime')) return MONSTER_RUNTIME_MS;
  if (INSTANCE_COALESCE_DOMAINS.has(domain) || stagedDomains.some((entry) => INSTANCE_COALESCE_DOMAINS.has(entry))) {
    return COALESCE_MS;
  }
  return 0;
}

function playerStageThrottleKey(playerId: string, domain: string): string {
  return `${playerId}\u0000${domain}`;
}

function instanceStageThrottleKey(instanceId: string, domain: string, ownershipEpoch: number): string {
  return `${instanceId}\u0000${domain}\u0000${ownershipEpoch}`;
}

function pruneExpiredStageThrottleEntries(entries: Map<string, number>, expiredBefore: number): void {
  for (const [key, nextStageAt] of entries) {
    if (nextStageAt < expiredBefore) {
      entries.delete(key);
    }
  }
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

function stagingFlushTaskKey(task: FlushTask): string {
  return task.scope === 'player'
    ? `player\u0000${task.id}\u0000${task.domain}`
    : `instance\u0000${task.id}\u0000${task.domain}\u0000${Math.max(0, Math.trunc(Number(task.ownershipEpoch ?? 0)))}`;
}

function stagingFlushTaskIdentityKey(identity: FlushTaskUpsertIdentity): string {
  return identity.scope === 'player'
    ? `player\u0000${identity.id}\u0000${identity.domain}`
    : `instance\u0000${identity.id}\u0000${identity.domain}\u0000${Math.max(0, Math.trunc(Number(identity.ownershipEpoch ?? 0)))}`;
}

function dedupeStagingFlushTaskIdentities(tasks: FlushTask[]): Map<string, FlushTaskUpsertIdentity> {
  const identities = new Map<string, FlushTaskUpsertIdentity>();
  for (const task of tasks) {
    const identity: FlushTaskUpsertIdentity = {
      scope: task.scope,
      id: task.id,
      domain: task.domain,
      ownershipEpoch: task.scope === 'instance'
        ? Math.max(0, Math.trunc(Number(task.ownershipEpoch ?? 0)))
        : null,
    };
    identities.set(stagingFlushTaskIdentityKey(identity), identity);
  }
  return identities;
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
