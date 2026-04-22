import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { PlayerDomainPersistenceService } from './player-domain-persistence.service';
import {
  PlayerPersistenceService,
  type PersistedPlayerSnapshot,
} from './player-persistence.service';

const PLAYER_PERSISTENCE_FLUSH_INTERVAL_MS = 5000;
const PLAYER_PERSISTENCE_FLUSH_BATCH_SIZE = 24;
const PLAYER_PERSISTENCE_FLUSH_PARALLELISM = 4;
const PLAYER_PERSISTENCE_FLUSH_RETRY_COUNT = 1;
const PLAYER_PERSISTENCE_DIRTY_FALLBACK_DOMAIN = 'snapshot';
const PLAYER_PERSISTENCE_DIRTY_PRESENCE_DOMAIN = 'presence';

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

/** 玩家快照刷盘服务：保留 snapshot 兼容真源，同时双写玩家分域表。 */
@Injectable()
export class PlayerPersistenceFlushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlayerPersistenceFlushService.name);
  private timer: NodeJS.Timeout | null = null;
  private flushPromise: Promise<void> | null = null;

  constructor(
    @Inject(PlayerRuntimeService)
    private readonly playerRuntimeService: PlayerRuntimeFlushPort,
    private readonly playerPersistenceService: PlayerPersistenceService,
    private readonly playerDomainPersistenceService: PlayerDomainPersistenceService,
  ) {}

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

    const snapshot = this.playerRuntimeService.buildPersistenceSnapshot(playerId);
    if (!snapshot) {
      return;
    }

    await this.flushPlayerSnapshotProjection(playerId, snapshot, snapshotEnabled, domainEnabled);
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
    if ((!snapshotEnabled && !domainEnabled) || this.flushPromise || isRestoreFreezeActive()) {
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
            await retryFlush(PLAYER_PERSISTENCE_FLUSH_RETRY_COUNT, async () => {
              await this.flushPlayerSnapshotProjection(
                playerId,
                snapshot,
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
