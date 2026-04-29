import { Inject, Injectable, Logger } from '@nestjs/common';

import { FlushWakeupService } from '../../persistence/flush-wakeup.service';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { PlayerFlushLedgerService } from '../../persistence/player-flush-ledger.service';
import { PlayerPersistenceFlushService } from '../../persistence/player-persistence-flush.service';

const PLAYER_CHECKPOINT_WORKER_DOMAIN = 'snapshot_checkpoint';
const PLAYER_CHECKPOINT_WORKER_IDLE_MS = 30_000;
const PLAYER_CHECKPOINT_WORKER_CLAIM_LIMIT = 48;

interface CheckpointCompactionRuntimePort {
  listDirtyPlayers(): string[];
  getPlayer(playerId: string): {
    persistentRevision?: number | null;
    persistedRevision?: number | null;
  } | null;
}

@Injectable()
export class CheckpointCompactionWorker {
  private readonly logger = new Logger(CheckpointCompactionWorker.name);

  constructor(
    @Inject(PlayerRuntimeService)
    private readonly playerRuntimeService: CheckpointCompactionRuntimePort,
    private readonly playerPersistenceFlushService: PlayerPersistenceFlushService,
    private readonly playerFlushLedgerService: PlayerFlushLedgerService,
    private readonly flushWakeupService: FlushWakeupService,
  ) {}

  async runOnce(workerId: string): Promise<number> {
    const dirtyPlayerIds = this.resolveDirtyPlayers();
    if (dirtyPlayerIds.length > 0) {
      for (const playerId of dirtyPlayerIds) {
        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
          continue;
        }
        await this.playerFlushLedgerService.seedDirtyPlayers({
          playerIds: [playerId],
          domain: PLAYER_CHECKPOINT_WORKER_DOMAIN,
          latestVersion: normalizePositiveInteger(player.persistentRevision, Date.now(), 0, Number.MAX_SAFE_INTEGER),
        });
        this.flushWakeupService.signalPlayerFlush(playerId);
      }
    }

    const claimed = await this.playerFlushLedgerService.claimReadyPlayers({
      workerId,
      domain: PLAYER_CHECKPOINT_WORKER_DOMAIN,
      limit: PLAYER_CHECKPOINT_WORKER_CLAIM_LIMIT,
      claimTtlMs: 15_000,
    });
    let processed = 0;
    for (const entry of claimed) {
      const playerId = normalizeRequiredString(entry.playerId);
      if (!playerId) {
        continue;
      }
      const player = this.playerRuntimeService.getPlayer(playerId);
      if (!player) {
        await this.playerFlushLedgerService.markFlushed({
          playerId,
          domain: PLAYER_CHECKPOINT_WORKER_DOMAIN,
          flushedVersion: entry.latestVersion,
        });
        continue;
      }
      if (
        normalizePositiveInteger(player.persistentRevision, 0, 0, Number.MAX_SAFE_INTEGER)
        <= normalizePositiveInteger(player.persistedRevision, 0, 0, Number.MAX_SAFE_INTEGER)
      ) {
        await this.playerFlushLedgerService.markFlushed({
          playerId,
          domain: PLAYER_CHECKPOINT_WORKER_DOMAIN,
          flushedVersion: entry.latestVersion,
        });
        continue;
      }
      try {
        await this.playerPersistenceFlushService.flushPlayer(playerId);
        await this.playerFlushLedgerService.markFlushed({
          playerId,
          domain: PLAYER_CHECKPOINT_WORKER_DOMAIN,
          flushedVersion: entry.latestVersion,
        });
        processed += 1;
      } catch (error: unknown) {
        this.logger.warn(
          `玩家 checkpoint compaction 刷盘失败 playerId=${playerId} domain=${PLAYER_CHECKPOINT_WORKER_DOMAIN}: ${
            error instanceof Error ? error.stack || error.message : String(error)
          }`,
        );
        await this.playerFlushLedgerService.markRetry({
          playerId,
          domain: PLAYER_CHECKPOINT_WORKER_DOMAIN,
          retryDelayMs: 10_000,
        });
      }
    }
    return processed;
  }

  async runLoop(workerId: string, idleMs = PLAYER_CHECKPOINT_WORKER_IDLE_MS): Promise<void> {
    while (true) {
      const processed = await this.runOnce(workerId);
      if (processed <= 0) {
        await sleep(resolveIdleMs(idleMs));
      }
    }
  }

  private resolveDirtyPlayers(): string[] {
    return this.playerRuntimeService.listDirtyPlayers?.() ?? [];
  }
}

function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePositiveInteger(value: unknown, defaultValue: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }
  const normalized = Math.trunc(parsed);
  if (normalized < min) {
    return min;
  }
  if (normalized > max) {
    return max;
  }
  return normalized;
}

function resolveIdleMs(value: number): number {
  if (!Number.isFinite(value)) {
    return PLAYER_CHECKPOINT_WORKER_IDLE_MS;
  }
  return Math.max(1_000, Math.trunc(value));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
