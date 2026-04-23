import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { performance } from 'node:perf_hooks';

import { readTrimmedEnv } from '../config/env-alias';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import {
  PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAINS,
  PlayerDomainPersistenceService,
} from './player-domain-persistence.service';
import {
  PlayerPersistenceService,
  type PersistedPlayerSnapshot,
} from './player-persistence.service';

const PLAYER_PERSISTENCE_FLUSH_INTERVAL_MS = 5000;
const PLAYER_PERSISTENCE_FLUSH_BATCH_SIZE = 24;
const PLAYER_PERSISTENCE_FLUSH_PARALLELISM = 4;
const PLAYER_PERSISTENCE_FLUSH_RETRY_COUNT = 1;
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
const PLAYER_PERSISTENCE_SNAPSHOT_CHECKPOINT_INTERVAL_MS = 30_000;
const PLAYER_PERSISTENCE_SNAPSHOT_PROJECTABLE_DOMAIN_SET = new Set<string>(
  PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAINS,
);

interface PlayerRuntimeFlushPort {
  listDirtyPlayers(): string[];
  listDirtyPlayerDomains?(): Map<string, Set<string>>;
  buildPersistenceSnapshot(playerId: string): PersistedPlayerSnapshot | null;
  markPersisted(playerId: string): void;
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

/** 玩家快照刷盘服务：保留 snapshot 兼容真源，同时双写玩家分域表。 */
@Injectable()
export class PlayerPersistenceFlushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlayerPersistenceFlushService.name);
  private timer: NodeJS.Timeout | null = null;
  private flushPromise: Promise<void> | null = null;
  private readonly lastSnapshotCheckpointAtByPlayerId = new Map<string, number>();
  private leaseGuard: LeaseGuardPort | null = null;
  private flushThrottleUntilAt = 0;

  constructor(
    @Inject(PlayerRuntimeService)
    private readonly playerRuntimeService: PlayerRuntimeFlushPort,
    private readonly playerPersistenceService: PlayerPersistenceService,
    private readonly playerDomainPersistenceService: PlayerDomainPersistenceService,
  ) {}

  setLeaseGuard(leaseGuard: LeaseGuardPort | null): void {
    this.leaseGuard = leaseGuard;
  }

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.flushDirtyPlayers();
    }, PLAYER_PERSISTENCE_FLUSH_INTERVAL_MS);
    this.timer.unref();
    this.logger.log(`玩家持久化刷新已启动，间隔 ${PLAYER_PERSISTENCE_FLUSH_INTERVAL_MS}ms`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.lastSnapshotCheckpointAtByPlayerId.clear();
  }

  /** 应用关闭前 flush 全量脏玩家，保证关键状态落库。 */
  async beforeApplicationShutdown(): Promise<void> {
    await this.flushAllNow();
  }

  /** 立即刷单个玩家快照与分域投影。 */
  async flushPlayer(playerId: string): Promise<void> {
    const snapshotEnabled = this.playerPersistenceService.isEnabled();
    const domainEnabled = this.playerDomainPersistenceService.isEnabled();
    if (!snapshotEnabled && !domainEnabled) {
      return;
    }

    const dirtyDomains = this.resolveDirtyPlayerDomains().get(playerId) ?? new Set<string>();
    if (dirtyDomains.size === 0) {
      return;
    }

    if (domainEnabled && dirtyDomains.size === 1 && dirtyDomains.has(PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN)) {
      const presence = this.playerRuntimeService.describePersistencePresence(playerId);
      if (!presence) {
        return;
      }
      if (!this.isPlayerPersistenceWritable(playerId)) {
        this.logger.warn(`跳过玩家 presence 刷盘：lease 已失效 playerId=${playerId}`);
        return;
      }
      await this.playerDomainPersistenceService.savePlayerPresence(playerId, presence);
      this.playerRuntimeService.markPersisted(playerId);
      return;
    }

    const snapshot = this.playerRuntimeService.buildPersistenceSnapshot(playerId);
    if (!snapshot) {
      return;
    }
    if (!this.isPlayerPersistenceWritable(playerId)) {
      this.logger.warn(`跳过玩家持久化刷盘：lease 已失效 playerId=${playerId}`);
      return;
    }

    await this.flushPlayerDirtyDomains(
      playerId,
      snapshot,
      dirtyDomains,
      'manual',
      snapshotEnabled,
      domainEnabled,
    );
    this.playerRuntimeService.markPersisted(playerId);
  }

  async flushAllNow(): Promise<void> {
    const snapshotEnabled = this.playerPersistenceService.isEnabled();
    const domainEnabled = this.playerDomainPersistenceService.isEnabled();
    if (!snapshotEnabled && !domainEnabled) {
      return;
    }
    if (this.flushPromise) {
      await this.flushPromise;
    }
    await this.runFlushCycle('shutdown');
  }

  async flushDirtyPlayers(): Promise<void> {
    const snapshotEnabled = this.playerPersistenceService.isEnabled();
    const domainEnabled = this.playerDomainPersistenceService.isEnabled();
    if ((!snapshotEnabled && !domainEnabled) || this.flushPromise || isRestoreFreezeActive() || this.isFlushThrottleActive()) {
      return;
    }
    await this.runFlushCycle('interval');
  }

  private async runFlushCycle(reason: string): Promise<void> {
    const snapshotEnabled = this.playerPersistenceService.isEnabled();
    const domainEnabled = this.playerDomainPersistenceService.isEnabled();
    if (!snapshotEnabled && !domainEnabled) {
      return;
    }
    const startedAt = performance.now();

    const promise = (async () => {
      const dirtyPlayerDomains = this.resolveDirtyPlayerDomains();
      const dirtyPlayerIds = Array.from(dirtyPlayerDomains.keys());
      if (dirtyPlayerIds.length === 0) {
        return;
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
                this.logger.warn(`跳过玩家 presence 刷盘：lease 已失效 playerId=${playerId}`);
                return;
              }
              await retryFlush(PLAYER_PERSISTENCE_FLUSH_RETRY_COUNT, async () => {
                await this.playerDomainPersistenceService.savePlayerPresence(playerId, presence);
              });
              this.playerRuntimeService.markPersisted(playerId);
              return;
            }
            const snapshot = this.playerRuntimeService.buildPersistenceSnapshot(playerId);
            if (!snapshot) {
              return;
            }
            if (!this.isPlayerPersistenceWritable(playerId)) {
              this.logger.warn(`跳过玩家快照刷盘：lease 已失效 playerId=${playerId}`);
              return;
            }
            await retryFlush(PLAYER_PERSISTENCE_FLUSH_RETRY_COUNT, async () => {
              await this.flushPlayerDirtyDomains(
                playerId,
                snapshot,
                dirtyDomains,
                reason,
                snapshotEnabled,
                domainEnabled,
              );
            });
            this.playerRuntimeService.markPersisted(playerId);
          },
          (playerId, error) => {
            this.logger.error(
              `玩家持久化刷新失败（${reason}） playerId=${playerId}`,
              error instanceof Error ? error.stack : String(error),
            );
          },
        );
      }
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
      }
    }
  }

  private async flushPlayerSnapshotProjection(
    playerId: string,
    snapshot: PersistedPlayerSnapshot,
    snapshotEnabled: boolean,
    domainEnabled: boolean,
  ): Promise<void> {
    if (snapshotEnabled) {
      await this.playerPersistenceService.savePlayerSnapshot(playerId, snapshot);
    }
    if (!domainEnabled) {
      return;
    }
    await this.playerDomainPersistenceService.savePlayerSnapshotProjection(playerId, snapshot);
    const presence = this.playerRuntimeService.describePersistencePresence(playerId);
    if (presence) {
      await this.playerDomainPersistenceService.savePlayerPresence(playerId, presence);
    }
  }

  private async flushPlayerDirtyDomains(
    playerId: string,
    snapshot: PersistedPlayerSnapshot,
    dirtyDomains: ReadonlySet<string>,
    reason: string,
    snapshotEnabled: boolean,
    domainEnabled: boolean,
  ): Promise<void> {
    const normalizedDirtyDomains = normalizeDirtyDomains(dirtyDomains);
    const nonPresenceDirtyDomains = new Set(
      Array.from(normalizedDirtyDomains).filter(
        (domain) => domain !== PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN,
      ),
    );
    const walletOnlyDirty =
      nonPresenceDirtyDomains.size === 1 && nonPresenceDirtyDomains.has('wallet');
    if (!domainEnabled) {
      if (snapshotEnabled) {
        await this.playerPersistenceService.savePlayerSnapshot(playerId, snapshot);
        this.markSnapshotCheckpoint(playerId, snapshot.savedAt);
      }
      return;
    }

    const shouldSaveSnapshot =
      snapshotEnabled
      && (
        reason === 'shutdown'
        || nonPresenceDirtyDomains.size === 0
        || nonPresenceDirtyDomains.has(PLAYER_PERSISTENCE_DIRTY_FALLBACK_DOMAIN)
        || Array.from(nonPresenceDirtyDomains).some((domain) => !isProjectableDirtyDomain(domain))
        || (!walletOnlyDirty && this.isSnapshotCheckpointDue(playerId, snapshot.savedAt))
      );

    if (shouldSaveSnapshot) {
      if (!this.isPlayerPersistenceWritable(playerId)) {
        this.logger.warn(`跳过玩家快照提交：lease 已失效 playerId=${playerId}`);
        return;
      }
      await this.playerPersistenceService.savePlayerSnapshot(playerId, snapshot);
      this.markSnapshotCheckpoint(playerId, snapshot.savedAt);
    }

    const projectedDomains = nonPresenceDirtyDomains;
    if (
      projectedDomains.size === 0
      || projectedDomains.has(PLAYER_PERSISTENCE_DIRTY_FALLBACK_DOMAIN)
      || Array.from(projectedDomains).some((domain) => !isProjectableDirtyDomain(domain))
    ) {
      if (!this.isPlayerPersistenceWritable(playerId)) {
        this.logger.warn(`跳过玩家分域提交：lease 已失效 playerId=${playerId}`);
        return;
      }
      await this.playerDomainPersistenceService.savePlayerSnapshotProjection(playerId, snapshot);
    } else {
      if (!this.isPlayerPersistenceWritable(playerId)) {
        this.logger.warn(`跳过玩家分域增量提交：lease 已失效 playerId=${playerId}`);
        return;
      }
      await this.playerDomainPersistenceService.savePlayerSnapshotProjectionDomains(
        playerId,
        snapshot,
        projectedDomains,
      );
    }

    if (normalizedDirtyDomains.has(PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN)) {
      const presence = this.playerRuntimeService.describePersistencePresence(playerId);
      if (presence) {
        if (!this.isPlayerPersistenceWritable(playerId)) {
          this.logger.warn(`跳过玩家 presence 提交：lease 已失效 playerId=${playerId}`);
          return;
        }
        await this.playerDomainPersistenceService.savePlayerPresence(playerId, presence);
      }
    }
  }

  private isPlayerPersistenceWritable(playerId: string): boolean {
    return this.leaseGuard?.isPlayerPersistenceWritable(playerId) ?? true;
  }

  private isSnapshotCheckpointDue(playerId: string, versionSeed: number): boolean {
    const lastCheckpointAt = this.lastSnapshotCheckpointAtByPlayerId.get(playerId) ?? 0;
    return versionSeed - lastCheckpointAt >= PLAYER_PERSISTENCE_SNAPSHOT_CHECKPOINT_INTERVAL_MS;
  }

  private markSnapshotCheckpoint(playerId: string, versionSeed: number): void {
    this.lastSnapshotCheckpointAtByPlayerId.set(playerId, Math.max(0, Math.trunc(versionSeed)));
  }

  private isFlushThrottleActive(): boolean {
    return Date.now() < this.flushThrottleUntilAt;
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
