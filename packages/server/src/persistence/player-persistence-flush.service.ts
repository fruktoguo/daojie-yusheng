/**
 * 本文件属于持久化边界，负责数据库真源、flush、兼容转换或失败策略等可靠性逻辑。
 *
 * 维护时要优先考虑幂等、崩溃恢复和自动清理，避免在 tick 内直接引入阻塞 IO。
 */
/**
 * 玩家状态定时刷盘服务。
 * 按周期收集脏玩家列表，按域增量投影到分域表，支持 lease 守卫、降级退避和关闭前强刷。
 * 硬切后只写分域表，旧整档快照不再作为运行时落点。
 */
import { Inject, Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { performance } from 'node:perf_hooks';

import { readTrimmedEnv } from '../config/env-alias';
import { shouldStartAuthoritativeRuntime } from '../config/runtime-role';
import { StartupBarrierService } from '../lifecycle/startup-barrier.service';
import { DEFAULT_OFFLINE_PLAYER_TIMEOUT_SEC } from '@mud/shared';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import {
  PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAINS,
  PlayerDomainPersistenceService,
} from './player-domain-persistence.service';
import { type PersistedPlayerSnapshot } from './player-persistence.service';
import { PersistenceWorkerPoolService } from '../concurrency/persistence-worker-pool.service';
import { DatabasePoolProvider } from './database-pool.provider';
import { FlushDiagnosticsService, type PlayerFlushDiagnostics } from './flush-diagnostics.service';
import { shouldRunLegacyFlushIntervals } from './flush-task-runtime-mode';
import { ActivityPersistenceService } from './activity-persistence.service';

/**
 * 玩家分域刷盘周期。
 * - 默认 1500ms：把"主进程崩溃 -> 玩家最近一次 mutation 丢失"的窗口从原来的 5s 缩到 ~1.5s。
 * - 5s 默认值之前是按"PG 写入压力优先"的取舍；当前数据库分域投影已经足够轻，且 flush 内部已有 slow flush
 *   backoff(>120ms 单轮触发 5s 退避)和并发节流，缩短周期不会把 PG 压垮。
 * - 通过 SERVER_PLAYER_PERSISTENCE_FLUSH_INTERVAL_MS / PLAYER_PERSISTENCE_FLUSH_INTERVAL_MS 可以
 *   把它改回 5000ms 或更长，运维出现 IO 压力时可以热降级。
 */
const PLAYER_PERSISTENCE_FLUSH_INTERVAL_MS = normalizePositiveInteger(
  readTrimmedEnv('SERVER_PLAYER_PERSISTENCE_FLUSH_INTERVAL_MS', 'PLAYER_PERSISTENCE_FLUSH_INTERVAL_MS'),
  1_500,
  250,
  60_000,
);
const PLAYER_PERSISTENCE_FLUSH_BATCH_SIZE = 24;
const PLAYER_PERSISTENCE_FLUSH_PARALLELISM = 4;
const PLAYER_PERSISTENCE_FLUSH_RETRY_COUNT = 1;
const PLAYER_PERSISTENCE_FLUSH_POOL_WAITING_THRESHOLD = normalizePositiveInteger(
  readTrimmedEnv('SERVER_PLAYER_PERSISTENCE_FLUSH_POOL_WAITING_THRESHOLD', 'PLAYER_PERSISTENCE_FLUSH_POOL_WAITING_THRESHOLD'),
  2,
  0,
  100,
);
const PERSISTENCE_SLOW_FLUSH_THRESHOLD_MIN_MS = 100;
const PLAYER_PERSISTENCE_SLOW_FLUSH_THRESHOLD_MS = normalizePositiveInteger(
  readTrimmedEnv('SERVER_PERSISTENCE_FLUSH_SLOW_THRESHOLD_MS', 'PERSISTENCE_FLUSH_SLOW_THRESHOLD_MS'),
  120,
  PERSISTENCE_SLOW_FLUSH_THRESHOLD_MIN_MS,
  10_000,
);
const PLAYER_PERSISTENCE_SLOW_FLUSH_BACKOFF_MS = normalizePositiveInteger(
  readTrimmedEnv('SERVER_PERSISTENCE_FLUSH_SLOW_BACKOFF_MS', 'PERSISTENCE_FLUSH_SLOW_BACKOFF_MS'),
  5_000,
  1_000,
  60_000,
);
const PLAYER_PERSISTENCE_DIRTY_FALLBACK_DOMAIN = 'snapshot';
const PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN = 'presence';
const PLAYER_PERSISTENCE_SNAPSHOT_PROJECTABLE_DOMAIN_SET = new Set<string>(
  PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAINS,
);

interface PlayerRuntimeFlushPort {
  listDirtyPlayers(): string[];
  listDirtyPlayerDomains?(): Map<string, Set<string>>;
  buildPersistenceSnapshot(playerId: string, dirtyDomains?: ReadonlySet<string>): PersistedPlayerSnapshot | null;
  /**
   * 标记一次落库完成。
   * - 不传 persistedDomains/persistedRevision：兼容旧链路（GM 全量、presence 心跳）的"全清"语义。
   * - 传入 persistedDomains：只清除集合内 domain，避免误清并发期间新增的 dirty。
   * - 传入 persistedRevision：把 persistedRevision 安全推进到 min(persistentRevision, snapshotRevision)。
   */
  markPersisted(
    playerId: string,
    persistedDomains?: ReadonlySet<string> | Iterable<string> | null,
    persistedRevision?: number | null,
  ): void;
  /**
   * 读取玩家当前 persistentRevision，用于 flush 前拍下"快照版本号"，让后续 markPersisted 只把 persistedRevision 推到该值，
   * 避免把 buildSnapshot 之后产生的新 dirty 误标为已落库。
   */
  getPersistenceRevision?(playerId: string): number | null;
  describePersistencePresence(playerId: string): {
    online: boolean;
    inWorld: boolean;
    lastHeartbeatAt?: number | null;
    offlineSinceAt?: number | null;
    runtimeOwnerId?: string | null;
    sessionEpoch?: number | null;
    transferState?: string | null;
    transferTargetNodeId?: string | null;
    versionSeed?: number | null;
  } | null;
}

interface LeaseGuardPort {
  isPlayerPersistenceWritable(playerId: string): boolean;
}

/**
 * 检查玩家是否从持久化恢复（而非凭空创建的空白角色）。
 * 用于 flush 防御：阻止空白角色覆盖数据库中已有的老玩家存档。
 */
function isPlayerHydratedFromPersistence(port: PlayerRuntimeFlushPort, playerId: string): boolean {
  if (typeof (port as any).isPlayerHydratedFromPersistence === 'function') {
    return (port as any).isPlayerHydratedFromPersistence(playerId);
  }
  // 接口未实现时默认允许写入（兼容旧实现）
  return true;
}

/**
 * flushPlayerDirtyDomains 的返回值，告诉调用方：
 * - persistedDomains：本轮真正写入数据库的 domain 集合，作为 markPersisted 的精确清理目标。
 * - leaseInvalidated：lease 检查失败需要调用方放弃 markPersisted（dirty 留给下一轮重试）。
 */
interface FlushDirtyDomainsResult {
  persistedDomains: Set<string>;
  leaseInvalidated: boolean;
}

/** 玩家状态刷盘服务：硬切后只写玩家分域表，旧整档快照不再作为运行时落点。 */
@Injectable()
export class PlayerPersistenceFlushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlayerPersistenceFlushService.name);
  private timer: NodeJS.Timeout | null = null;
  private offlineExpireTimer: NodeJS.Timeout | null = null;
  private flushPromise: Promise<void> | null = null;
  private leaseGuard: LeaseGuardPort | null = null;
  private flushThrottleUntilAt = 0;

  constructor(
    @Inject(PlayerRuntimeService)
    private readonly playerRuntimeService: PlayerRuntimeFlushPort,
    private readonly playerDomainPersistenceService: PlayerDomainPersistenceService,
    @Optional() @Inject(PersistenceWorkerPoolService)
    private readonly persistenceWorkerPool?: PersistenceWorkerPoolService,
    @Optional() @Inject(DatabasePoolProvider)
    private readonly databasePoolProvider?: DatabasePoolProvider,
    @Optional() @Inject(FlushDiagnosticsService)
    private readonly flushDiagnostics?: FlushDiagnosticsService,
    @Optional() @Inject(StartupBarrierService)
    private readonly startupBarrierService?: StartupBarrierService,
    @Optional() @Inject(ActivityPersistenceService)
    private readonly activityPersistenceService?: ActivityPersistenceService,
  ) {}

  setLeaseGuard(leaseGuard: LeaseGuardPort | null): void {
    this.leaseGuard = leaseGuard;
  }

  onModuleInit(): void {
    this.logger.log('玩家持久化刷新服务已注册，等待启动链路编排器开闸');
  }

  startForLifecycleCoordinator(): void {
    if (shouldRunLegacyFlushIntervals()) {
      if (this.timer) {
        return;
      }
      this.timer = setInterval(() => {
        void this.flushDirtyPlayers();
      }, PLAYER_PERSISTENCE_FLUSH_INTERVAL_MS);
      this.timer.unref();
      this.logger.log(`玩家持久化刷新已启动，间隔 ${PLAYER_PERSISTENCE_FLUSH_INTERVAL_MS}ms`);
    } else {
      this.logger.log('玩家持久化直接定时器已停用，由统一刷盘任务运行时调度');
    }
    if (!shouldStartAuthoritativeRuntime()) {
      this.logger.log('离线挂机超时检查已跳过：当前 role 不持有玩家运行态');
      return;
    }
    if (this.offlineExpireTimer) {
      return;
    }
    // 每 5 分钟检查一次离线挂机超时
    this.offlineExpireTimer = setInterval(() => {
      void this.expireOfflineHangingPlayersRuntime();
    }, 5 * 60 * 1000);
    this.offlineExpireTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.offlineExpireTimer) {
      clearInterval(this.offlineExpireTimer);
      this.offlineExpireTimer = null;
    }
  }

  /** 立即刷单个玩家快照与分域投影。 */
  async flushPlayer(playerId: string): Promise<void> {
    const dirtyDomains = this.resolveDirtyPlayerDomains().get(playerId) ?? new Set<string>();
    await this.flushResolvedPlayerDomains(playerId, dirtyDomains, 'manual');
  }

  /** 立即刷单个玩家的指定 dirty domain，用于统一刷盘任务按 domain 隔离失败。 */
  async flushPlayerDomains(playerId: string, domains: Iterable<string>): Promise<boolean> {
    const requestedDomains = normalizeDirtyDomains(domains);
    if (requestedDomains.size === 0) {
      return false;
    }
    const currentDirtyDomains = this.resolveDirtyPlayerDomains().get(playerId) ?? new Set<string>();
    const targetDomains = new Set(
      Array.from(currentDirtyDomains).filter((domain) => requestedDomains.has(domain)),
    );
    return this.flushResolvedPlayerDomains(playerId, targetDomains, 'task-domain');
  }

  private async flushResolvedPlayerDomains(
    playerId: string,
    dirtyDomains: ReadonlySet<string>,
    reason: string,
  ): Promise<boolean> {
    const domainEnabled = this.playerDomainPersistenceService.isEnabled();
    if (!domainEnabled || dirtyDomains.size === 0) {
      return false;
    }

    if (dirtyDomains.size === 1 && dirtyDomains.has(PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN)) {
      const presence = this.playerRuntimeService.describePersistencePresence(playerId);
      if (!presence) {
        return false;
      }
      if (!this.isPlayerPersistenceWritable(playerId)) {
        this.logger.warn(`跳过玩家在线状态刷盘：租约已失效 playerId=${playerId}`);
        return false;
      }
      // 在 await IO 之前先拍 revision 快照，避免下面 markPersisted 误推到 IO 期间的新版本。
      const snapshotRevision = this.playerRuntimeService.getPersistenceRevision?.(playerId) ?? null;
      await this.playerDomainPersistenceService.savePlayerPresence(playerId, presence);
      this.playerRuntimeService.markPersisted(
        playerId,
        new Set([PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN]),
        snapshotRevision,
      );
      return true;
    }

    const snapshotRevision = this.playerRuntimeService.getPersistenceRevision?.(playerId) ?? null;
    const snapshot = this.playerRuntimeService.buildPersistenceSnapshot(playerId, dirtyDomains);
    if (!snapshot) {
      return false;
    }
    if (!this.isPlayerPersistenceWritable(playerId)) {
      this.logger.warn(`跳过玩家持久化刷盘：租约已失效 playerId=${playerId}`);
      return false;
    }

    const result = await this.flushPlayerDirtyDomains(
      playerId,
      snapshot,
      dirtyDomains,
      reason,
      domainEnabled,
    );
    // lease 失效或没有 domain 真正落库时，不能 markPersisted，dirty 保留等下一轮重试。
    if (!result.leaseInvalidated && result.persistedDomains.size > 0) {
      this.playerRuntimeService.markPersisted(playerId, result.persistedDomains, snapshotRevision);
      return true;
    }
    return false;
  }

  async flushAllNow(): Promise<void> {
    const domainEnabled = this.playerDomainPersistenceService.isEnabled();
    if (!domainEnabled) {
      return;
    }
    if (this.flushPromise) {
      await this.flushPromise;
    }
    await this.runFlushCycle('shutdown');
  }

  async flushDirtyPlayers(): Promise<void> {
    if (!this.playerDomainPersistenceService.isEnabled()
      || this.flushPromise
      || (this.startupBarrierService && !this.startupBarrierService.isFlushOpen())
      || this.isFlushThrottleActive()) {
      return;
    }
    if (this.isFlushPoolBackpressureActive()) {
      this.flushThrottleUntilAt = Date.now() + PLAYER_PERSISTENCE_SLOW_FLUSH_BACKOFF_MS;
      this.logger.warn(`玩家刷盘因刷盘池等待排队而退避：waiting>=${PLAYER_PERSISTENCE_FLUSH_POOL_WAITING_THRESHOLD}`);
      return;
    }
    await this.runFlushCycle('interval');
  }

  private async runFlushCycle(reason: string): Promise<void> {
    const domainEnabled = this.playerDomainPersistenceService.isEnabled();
    if (!domainEnabled) {
      return;
    }
    const startedAt = performance.now();
    // 诊断累计器
    let diagDirtyCount = 0;
    const diagDomainCounts: Record<string, number> = {};
    let diagBuildMs = 0;
    let diagWorkerMs = 0;
    let diagDbWriteMs = 0;
    let diagMarkMs = 0;

    const promise = (async () => {
      const dirtyPlayerDomains = this.resolveDirtyPlayerDomains();
      const dirtyPlayerIds = Array.from(dirtyPlayerDomains.keys());
      if (dirtyPlayerIds.length === 0) {
        return;
      }
      diagDirtyCount = dirtyPlayerIds.length;
      // 统计 domain counts
      for (const domains of dirtyPlayerDomains.values()) {
        for (const d of domains) {
          diagDomainCounts[d] = (diagDomainCounts[d] ?? 0) + 1;
        }
      }

      const batches = chunkValues(dirtyPlayerIds, PLAYER_PERSISTENCE_FLUSH_BATCH_SIZE);
      for (const batch of batches) {
        await runConcurrent(
          batch,
          PLAYER_PERSISTENCE_FLUSH_PARALLELISM,
          async (playerId) => {
            const dirtyDomains = dirtyPlayerDomains.get(playerId) ?? new Set<string>();
            if (domainEnabled && dirtyDomains.size === 1 && dirtyDomains.has(PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN)) {
              const presence = this.playerRuntimeService.describePersistencePresence(playerId);
              if (!presence) {
                return;
              }
              if (!this.isPlayerPersistenceWritable(playerId)) {
                this.logger.warn(`跳过玩家在线状态刷盘：租约已失效 playerId=${playerId}`);
                return;
              }
              const presenceSnapshotRevision = this.playerRuntimeService.getPersistenceRevision?.(playerId) ?? null;
              await retryFlush(PLAYER_PERSISTENCE_FLUSH_RETRY_COUNT, async () => {
                await this.playerDomainPersistenceService.savePlayerPresence(playerId, presence);
              });
              this.playerRuntimeService.markPersisted(
                playerId,
                new Set([PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN]),
                presenceSnapshotRevision,
              );
              return;
            }
            const snapshotRevision = this.playerRuntimeService.getPersistenceRevision?.(playerId) ?? null;
            const buildStart = performance.now();
            const snapshot = this.playerRuntimeService.buildPersistenceSnapshot(playerId, dirtyDomains);
            diagBuildMs += performance.now() - buildStart;
            if (!snapshot) {
              return;
            }
            // 防御：如果玩家不是从持久化恢复的（凭空创建的空白角色），
            // 检查数据库中是否已有该玩家的 watermark，有则拒绝写入以避免覆盖老玩家存档。
            if (!isPlayerHydratedFromPersistence(this.playerRuntimeService, playerId)) {
              const hasWatermark = await this.playerDomainPersistenceService.hasRecoveryWatermark(playerId).catch(() => true);
              if (hasWatermark) {
                this.logger.error(
                  `拒绝空白角色覆盖已有存档：playerId=${playerId} — 玩家未从持久化恢复但数据库中已有 watermark`,
                );
                return;
              }
            }
            if (!this.isPlayerPersistenceWritable(playerId)) {
              this.logger.warn(`跳过玩家快照刷盘：租约已失效 playerId=${playerId}`);
              return;
            }
            // retryFlush 内部把"真正写出去的 domain 集合"通过返回值传出来，
            // lease 失效或抛错的情况都不会 markPersisted，dirty 保留等下一轮重试。
            let lastResult: FlushDirtyDomainsResult | null = null;
            const dbStart = performance.now();
            await retryFlush(PLAYER_PERSISTENCE_FLUSH_RETRY_COUNT, async () => {
              lastResult = await this.flushPlayerDirtyDomains(
                playerId,
                snapshot,
                dirtyDomains,
                reason,
                domainEnabled,
              );
            });
            diagDbWriteMs += performance.now() - dbStart;
            if (lastResult && !lastResult.leaseInvalidated && lastResult.persistedDomains.size > 0) {
              const markStart = performance.now();
              this.playerRuntimeService.markPersisted(playerId, lastResult.persistedDomains, snapshotRevision);
              diagMarkMs += performance.now() - markStart;
            }
          },
          (playerId, error) => {
            this.logger.error(
              `玩家持久化刷新失败（${reason}） playerId=${playerId}`,
              error instanceof Error ? error.stack : String(error),
            );
          },
        );
      }
      // 同步刷新离线收益累积数据
      await this.flushOfflineGainAccumulated();
    })();

    this.flushPromise = promise;
    try {
      await promise;
    } finally {
      if (this.flushPromise === promise) {
        this.flushPromise = null;
      }
      if (reason === 'interval') {
        const durationMs = performance.now() - startedAt;
        this.updateFlushThrottle(durationMs);
        // 上报诊断
        if (diagDirtyCount > 0) {
          this.flushDiagnostics?.reportPlayerFlush({
            dirtyPlayerCount: diagDirtyCount,
            domainCounts: diagDomainCounts,
            buildSnapshotMs: Math.round(diagBuildMs),
            workerSubmitMs: Math.round(diagWorkerMs),
            dbWriteMs: Math.round(diagDbWriteMs),
            markPersistedMs: Math.round(diagMarkMs),
            totalMs: Math.round(durationMs),
            timestamp: Date.now(),
          });
        }
      }
    }
  }

  private async flushPlayerDirtyDomains(
    playerId: string,
    snapshot: PersistedPlayerSnapshot,
    dirtyDomains: ReadonlySet<string>,
    reason: string,
    domainEnabled: boolean,
  ): Promise<FlushDirtyDomainsResult> {
    void reason;
    const persistedDomains = new Set<string>();
    const normalizedDirtyDomains = normalizeDirtyDomains(dirtyDomains);
    const nonPresenceDirtyDomains = new Set(
      Array.from(normalizedDirtyDomains).filter(
        (domain) => domain !== PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN,
      ),
    );
    if (!domainEnabled) {
      return { persistedDomains, leaseInvalidated: false };
    }

    const projectedDomains = nonPresenceDirtyDomains;
    const unsupportedDomains = Array.from(projectedDomains).filter((domain) => !isProjectableDirtyDomain(domain));
    if (
      projectedDomains.has(PLAYER_PERSISTENCE_DIRTY_FALLBACK_DOMAIN)
      || unsupportedDomains.length > 0
    ) {
      const domains = Array.from(projectedDomains).sort().join(',') || 'none';
      throw new Error(`player_domain_delta_required:${playerId}:${domains}`);
    }

    if (projectedDomains.size > 0) {
      if (!this.isPlayerPersistenceWritable(playerId)) {
        this.logger.warn(`跳过玩家分域增量提交：租约已失效 playerId=${playerId}`);
        // 关键：lease 失效时显式上报，外层据此跳过 markPersisted，dirty 留给下一轮重试。
        return { persistedDomains, leaseInvalidated: true };
      }
      // Phase 9：分域服务内部会优先通过 PersistenceWorkerPool 构建 write plan，
      // 主线程在通过 lease 校验后只负责执行计划内 SQL 并据结果 markPersisted。
      await this.playerDomainPersistenceService.savePlayerSnapshotProjectionDomains(
        playerId,
        snapshot,
        projectedDomains,
        {
          allowInventoryEmptyOverwrite: projectedDomains.has('inventory'),
          allowEquipmentEmptyOverwrite: projectedDomains.has('equipment'),
          allowBuffEmptyOverwrite: projectedDomains.has('buff'),
        },
      );
      for (const domain of projectedDomains) {
        persistedDomains.add(domain);
      }
    }

    if (normalizedDirtyDomains.has(PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN)) {
      const presence = this.playerRuntimeService.describePersistencePresence(playerId);
      if (presence) {
        if (!this.isPlayerPersistenceWritable(playerId)) {
          this.logger.warn(`跳过玩家在线状态提交：租约已失效 playerId=${playerId}`);
          // presence 部分 lease 失效。projectedDomains 已写完的部分允许 markPersisted，
          // 但 presence 留作 dirty 等下一轮；通过 leaseInvalidated 让外层放弃 markPersisted 整体。
          return { persistedDomains, leaseInvalidated: true };
        }
        await this.playerDomainPersistenceService.savePlayerPresence(playerId, presence);
        persistedDomains.add(PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN);
      }
    }
    return { persistedDomains, leaseInvalidated: false };
  }

  private isPlayerPersistenceWritable(playerId: string): boolean {
    return this.leaseGuard?.isPlayerPersistenceWritable(playerId) ?? true;
  }

  private isFlushThrottleActive(): boolean {
    return Date.now() < this.flushThrottleUntilAt;
  }

  private isFlushPoolBackpressureActive(): boolean {
    const stats = this.databasePoolProvider?.getPoolStats('flush');
    return Boolean(stats && stats.waitingCount >= PLAYER_PERSISTENCE_FLUSH_POOL_WAITING_THRESHOLD);
  }

  private updateFlushThrottle(durationMs: number): void {
    if (durationMs < PLAYER_PERSISTENCE_SLOW_FLUSH_THRESHOLD_MS) {
      return;
    }
    this.flushThrottleUntilAt = Date.now() + PLAYER_PERSISTENCE_SLOW_FLUSH_BACKOFF_MS;
    this.logger.warn(
      `玩家最终一致刷盘触发降级退避：durationMs=${Math.trunc(durationMs)} thresholdMs=${PLAYER_PERSISTENCE_SLOW_FLUSH_THRESHOLD_MS} backoffMs=${PLAYER_PERSISTENCE_SLOW_FLUSH_BACKOFF_MS}`,
    );
  }

  private resolveDirtyPlayerDomains(): Map<string, Set<string>> {
    const dirtyPlayerDomains = this.playerRuntimeService.listDirtyPlayerDomains?.();
    if (dirtyPlayerDomains && dirtyPlayerDomains.size > 0) {
      return dirtyPlayerDomains;
    }
    return new Map(
      this.playerRuntimeService.listDirtyPlayers().map((playerId) => [
        playerId,
        new Set([PLAYER_PERSISTENCE_DIRTY_FALLBACK_DOMAIN]),
      ]),
    );
  }

  /** 将内存中离线收益会话的 accumulatedPayload 增量写入数据库，防止崩溃丢失。 */
  private async flushOfflineGainAccumulated(): Promise<void> {
    const runtimeService = this.playerRuntimeService as any;
    const sessions: Map<string, any> | undefined = runtimeService.offlineGainSessionsByPlayerId;
    if (!sessions || sessions.size === 0) {
      return;
    }
    if (!this.playerDomainPersistenceService.isEnabled()) {
      return;
    }
    for (const [playerId, session] of sessions) {
      if (!session || !session.accumulatedPayload) {
        continue;
      }
      try {
        await this.playerDomainPersistenceService.updatePlayerOfflineGainAccumulated(
          playerId,
          session.accumulatedPayload,
          session.accumulatedDurationMs ?? 0,
        );
      } catch (error) {
        this.logger.warn(
          `刷新离线收益累积失败：${playerId} ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /** 运行时定期检查：将离线超过 48 小时的挂机玩家标记为可卸载，由 reaper 自然完成清理。 */
  private async expireOfflineHangingPlayersRuntime(): Promise<void> {
    const runtimeService = this.playerRuntimeService as any;
    const players: Map<string, any> | undefined = runtimeService.players;
    if (!players || players.size === 0) {
      return;
    }
    const baseOfflineTimeoutMs = DEFAULT_OFFLINE_PLAYER_TIMEOUT_SEC * 1000;
    const monthCardOfflineTimeoutMs = 72 * 60 * 60 * 1000;
    const now = Date.now();
    const activeMonthCardPlayerIds = new Set(
      await this.activityPersistenceService?.listActiveMonthCardPlayerIds?.(now).catch(() => []) ?? [],
    );
    const expiredPlayerIds: string[] = [];
    for (const [playerId, player] of players) {
      if (!player) continue;
      const isOffline = !player.sessionId || (typeof player.sessionId === 'string' && !player.sessionId.trim());
      if (!isOffline) continue;
      const offlineSince = Number(player.offlineSinceAt);
      if (!Number.isFinite(offlineSince) || offlineSince <= 0) continue;
      const timeoutMs = activeMonthCardPlayerIds.has(playerId) ? monthCardOfflineTimeoutMs : baseOfflineTimeoutMs;
      if (now - offlineSince >= timeoutMs) {
        expiredPlayerIds.push(playerId);
      }
    }
    if (expiredPlayerIds.length === 0) {
      return;
    }
    for (const playerId of expiredPlayerIds) {
      try {
        const player = players.get(playerId);
        if (!player) continue;
        // 结算离线收益
        if (typeof runtimeService.finalizeOfflineGainSessionForPlayer === 'function') {
          await runtimeService.finalizeOfflineGainSessionForPlayer(player);
        }
        // 清除所有活动状态，使 hasDetachedRuntimeActivity 返回 false
        if (player.combat) {
          player.combat.cultivationActive = false;
          player.combat.autoRootFoundation = false;
          player.combat.autoBattle = false;
        }
        if (player.alchemyJob) player.alchemyJob.remainingTicks = 0;
        if (player.forgingJob) player.forgingJob.remainingTicks = 0;
        if (player.enhancementJob) player.enhancementJob.remainingTicks = 0;
        if (player.gatherJob) player.gatherJob.remainingTicks = 0;
        if (player.buildingJob) player.buildingJob.remainingTicks = 0;
        // 持久化 presence 标记为彻底离线
        if (this.playerDomainPersistenceService.isEnabled()) {
          const presence = runtimeService.describePersistencePresence?.(playerId);
          if (presence) {
            await this.playerDomainPersistenceService.savePlayerPresence(playerId, {
              ...presence,
              online: false,
              inWorld: false,
              offlineSinceAt: presence.offlineSinceAt ?? now,
              versionSeed: now,
            });
          }
        }
      } catch (error) {
        this.logger.warn(
          `运行时离线超时清理失败：${playerId} ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (expiredPlayerIds.length > 0) {
      this.logger.log(`运行时离线挂机超时：${expiredPlayerIds.length} 名玩家已标记为可卸载，等待回收器清理`);
    }
  }
}

function normalizeDirtyDomains(domains: ReadonlySet<string> | Iterable<string>): Set<string> {
  const normalized = new Set<string>();
  for (const domain of domains ?? []) {
    if (typeof domain === 'string' && domain.trim()) {
      normalized.add(domain.trim());
    }
  }
  return normalized;
}

function isProjectableDirtyDomain(domain: string): boolean {
  return PLAYER_PERSISTENCE_SNAPSHOT_PROJECTABLE_DOMAIN_SET.has(domain);
}

function isRestoreFreezeActive(): boolean {
  const value = process.env.SERVER_RUNTIME_RESTORE_ACTIVE;
  return typeof value === 'string' && /^(1|true|yes|on)$/iu.test(value.trim());
}

function chunkValues<T>(values: T[], chunkSize: number): T[][] {
  if (!Array.isArray(values) || values.length === 0) {
    return [];
  }
  const normalizedChunkSize = Math.max(1, Math.trunc(chunkSize));
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += normalizedChunkSize) {
    chunks.push(values.slice(index, index + normalizedChunkSize));
  }
  return chunks;
}

function normalizePositiveInteger(
  value: string | number | null | undefined,
  defaultValue: number,
  min: number,
  max: number,
): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return defaultValue;
  }
  const normalized = Math.trunc(numericValue);
  if (normalized < min || normalized > max) {
    return defaultValue;
  }
  return normalized;
}

async function runConcurrent<T>(
  values: T[],
  parallelism: number,
  worker: (value: T) => Promise<void>,
  onError?: (value: T, error: unknown) => void,
): Promise<void> {
  const normalizedParallelism = Math.max(1, Math.trunc(parallelism));
  for (let index = 0; index < values.length; index += normalizedParallelism) {
    const slice = values.slice(index, index + normalizedParallelism);
    const results = await Promise.allSettled(slice.map((value) => worker(value)));
    results.forEach((result, resultIndex) => {
      if (result.status === 'rejected') {
        onError?.(slice[resultIndex], result.reason);
      }
    });
  }
}

async function retryFlush(retryCount: number, work: () => Promise<void>): Promise<void> {
  const attempts = Math.max(0, Math.trunc(retryCount)) + 1;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await work();
      return;
    } catch (error: unknown) {
      lastError = error;
    }
  }
  throw lastError;
}
