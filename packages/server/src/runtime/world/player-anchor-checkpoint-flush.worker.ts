import { Inject, Injectable, Logger } from '@nestjs/common';

import { PlayerFlushLedgerService } from '../../persistence/player-flush-ledger.service';
import { FlushWakeupService } from '../../persistence/flush-wakeup.service';
import { PlayerPersistenceFlushService } from '../../persistence/player-persistence-flush.service';
import { PlayerRuntimeService } from '../player/player-runtime.service';

const PLAYER_FLUSH_WORKER_DOMAIN = 'position_checkpoint';
const PLAYER_FLUSH_WORKER_IDLE_MS = 1_000;
const PLAYER_FLUSH_WORKER_CLAIM_LIMIT = 32;

interface PlayerAnchorCheckpointFlushRuntimePort {
  listDirtyPlayerDomains?(): Map<string, Set<string>>;
  getPersistenceRevision?(playerId: string): number | null;
}

@Injectable()
export class PlayerAnchorCheckpointFlushWorker {
  private readonly logger = new Logger(PlayerAnchorCheckpointFlushWorker.name);

  constructor(
    @Inject(PlayerRuntimeService)
    private readonly playerRuntimeService: PlayerAnchorCheckpointFlushRuntimePort,
    private readonly playerPersistenceFlushService: PlayerPersistenceFlushService,
    private readonly playerFlushLedgerService: PlayerFlushLedgerService,
    private readonly flushWakeupService: FlushWakeupService,
  ) {}

  async runOnce(workerId: string): Promise<number> {
    const dirtyPlayers = this.resolveDirtyPlayers();
    if (dirtyPlayers.length > 0) {
      await this.playerFlushLedgerService.seedDirtyPlayers({
        playerIds: dirtyPlayers,
        domain: PLAYER_FLUSH_WORKER_DOMAIN,
        latestVersion: this.resolveLatestVersion(dirtyPlayers),
      });
      for (const playerId of dirtyPlayers) {
        this.flushWakeupService.signalPlayerFlush(playerId);
      }
    }

    const claimed = await this.playerFlushLedgerService.claimReadyPlayers({
      workerId,
      domain: PLAYER_FLUSH_WORKER_DOMAIN,
      limit: PLAYER_FLUSH_WORKER_CLAIM_LIMIT,
    });
    let processed = 0;
    for (const entry of claimed) {
      try {
        await this.playerPersistenceFlushService.flushPlayer(entry.playerId);
        await this.playerFlushLedgerService.markFlushed({
          playerId: entry.playerId,
          domain: entry.domain,
          flushedVersion: entry.latestVersion,
        });
        processed += 1;
      } catch (error: unknown) {
        this.logger.warn(
          `玩家锚点/检查点 worker 刷盘失败 playerId=${entry.playerId} domain=${entry.domain}: ${
            error instanceof Error ? error.stack || error.message : String(error)
          }`,
        );
        await this.playerFlushLedgerService.markRetry({
          playerId: entry.playerId,
          domain: entry.domain,
          retryDelayMs: 5_000,
        });
      }
    }
    return processed;
  }

  async runLoop(workerId: string, idleMs = PLAYER_FLUSH_WORKER_IDLE_MS): Promise<void> {
    while (true) {
      const processed = await this.runOnce(workerId);
      if (processed <= 0) {
        await sleep(resolveIdleMs(idleMs));
      }
    }
  }

  private resolveDirtyPlayers(): string[] {
    const dirtyPlayerDomains = this.playerRuntimeService.listDirtyPlayerDomains?.();
    if (!dirtyPlayerDomains || dirtyPlayerDomains.size === 0) {
      return [];
    }
    const players: string[] = [];
    for (const [playerId, domains] of dirtyPlayerDomains.entries()) {
      const normalizedDomains = normalizeDomainSet(domains);
      if (normalizedDomains.has('world_anchor') || normalizedDomains.has('position_checkpoint')) {
        players.push(playerId);
      }
    }
    return players;
  }

  private resolveLatestVersion(playerIds: string[]): number {
    let latestVersion = 0;
    for (const playerId of playerIds) {
      const revision = this.playerRuntimeService.getPersistenceRevision?.(playerId);
      if (Number.isFinite(Number(revision))) {
        latestVersion = Math.max(latestVersion, Math.trunc(Number(revision)));
      }
    }
    return latestVersion > 0 ? latestVersion : Date.now();
  }
}

interface PlayerAnchorCheckpointFlushRuntimePort {
  listDirtyPlayerDomains?(): Map<string, Set<string>>;
}

function normalizeDomainSet(domains: ReadonlySet<string> | Iterable<string>): Set<string> {
  const normalized = new Set<string>();
  for (const domain of domains ?? []) {
    if (typeof domain === 'string' && domain.trim()) {
      normalized.add(domain.trim());
    }
  }
  return normalized;
}

function resolveIdleMs(value: number): number {
  if (!Number.isFinite(value)) {
    return PLAYER_FLUSH_WORKER_IDLE_MS;
  }
  return Math.max(250, Math.trunc(value));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
