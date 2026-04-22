import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  type PersistedPlayerSnapshot,
  type PersistedPlayerSnapshotRecord,
  PlayerPersistenceService,
} from '../persistence/player-persistence.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { recordAuthTrace } from './world-player-token.service';

const ALLOWED_SNAPSHOT_PERSISTED_SOURCES = new Set([
  'native',
  'legacy_sync',
  'legacy_backfill',
  'token_seed',
] as const);

type SnapshotPersistedSource = 'native' | 'legacy_sync' | 'legacy_backfill' | 'token_seed';
type SnapshotResultSource = 'next' | 'miss';
type NativeStarterFailureStage =
  | 'native_snapshot_recovery_persistence_disabled'
  | 'native_snapshot_recovery_load_failed'
  | 'native_snapshot_recovery_build_failed'
  | 'native_snapshot_recovery_seed_failed';

interface NativeStarterSnapshotResult {
  ok: boolean;
  seeded?: boolean;
  snapshot?: PersistedPlayerSnapshot;
  persistedSource?: SnapshotPersistedSource | null;
  failureStage?: NativeStarterFailureStage;
}

interface LoadPlayerSnapshotResult {
  snapshot: PersistedPlayerSnapshot | null;
  source: SnapshotResultSource;
  persistedSource: SnapshotPersistedSource | null;
  fallbackReason: string | null;
  seedPersisted: boolean;
}

interface PlayerRuntimeSnapshotPort {
  buildStarterPersistenceSnapshot(playerId: string): PersistedPlayerSnapshot | null;
}

function normalizeSnapshotPersistedSource(persistedSource: unknown): SnapshotPersistedSource | null {
  const normalizedPersistedSource = typeof persistedSource === 'string'
    ? persistedSource.trim()
    : '';
  return ALLOWED_SNAPSHOT_PERSISTED_SOURCES.has(normalizedPersistedSource as SnapshotPersistedSource)
    ? (normalizedPersistedSource as SnapshotPersistedSource)
    : null;
}

@Injectable()
export class WorldPlayerSnapshotService {
  private readonly logger = new Logger(WorldPlayerSnapshotService.name);
  private readonly playerRuntimeService: PlayerRuntimeSnapshotPort;

  constructor(
    private readonly playerPersistenceService: PlayerPersistenceService,
    @Inject(PlayerRuntimeService)
    playerRuntimeService: unknown,
  ) {
    this.playerRuntimeService = playerRuntimeService as PlayerRuntimeSnapshotPort;
  }

  isPersistenceEnabled(): boolean {
    return this.playerPersistenceService.isEnabled();
  }

  async loadPersistedPlayerSnapshotRecord(playerId: string): Promise<PersistedPlayerSnapshotRecord | null> {
    return this.playerPersistenceService.loadPlayerSnapshotRecord(playerId);
  }

  async ensureNativeStarterSnapshot(playerId: string): Promise<NativeStarterSnapshotResult> {
    const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
    if (!normalizedPlayerId || !this.playerPersistenceService.isEnabled()) {
      return {
        ok: false,
        failureStage: 'native_snapshot_recovery_persistence_disabled',
      };
    }

    try {
      const existingSnapshotRecord = await this.loadPersistedPlayerSnapshotRecord(normalizedPlayerId);
      if (existingSnapshotRecord?.snapshot) {
        return {
          ok: true,
          seeded: false,
          snapshot: existingSnapshotRecord.snapshot,
          persistedSource: normalizeSnapshotPersistedSource(existingSnapshotRecord.persistedSource),
        };
      }
    } catch (error: unknown) {
      this.logger.warn(
        `玩家原生初始快照恢复加载失败：playerId=${normalizedPlayerId} error=${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        ok: false,
        failureStage: 'native_snapshot_recovery_load_failed',
      };
    }

    const starterSnapshot = this.playerRuntimeService.buildStarterPersistenceSnapshot(normalizedPlayerId);
    if (!starterSnapshot) {
      this.logger.warn(`玩家原生初始快照恢复构建失败：playerId=${normalizedPlayerId}`);
      return {
        ok: false,
        failureStage: 'native_snapshot_recovery_build_failed',
      };
    }
    try {
      await this.playerPersistenceService.savePlayerSnapshot(normalizedPlayerId, starterSnapshot, {
        persistedSource: 'native',
        seededAt: Date.now(),
      });
      return {
        ok: true,
        seeded: true,
        snapshot: starterSnapshot,
        persistedSource: 'native',
      };
    } catch (error: unknown) {
      this.logger.warn(
        `玩家原生初始快照恢复保存失败：playerId=${normalizedPlayerId} error=${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        ok: false,
        failureStage: 'native_snapshot_recovery_seed_failed',
      };
    }
  }

  async loadPlayerSnapshotResult(
    playerId: string,
    fallbackReason: string | null = null,
  ): Promise<LoadPlayerSnapshotResult> {
    let nextSnapshotRecord: PersistedPlayerSnapshotRecord | null = null;
    try {
      nextSnapshotRecord = await this.loadPersistedPlayerSnapshotRecord(playerId);
    } catch (error: unknown) {
      const message = `Player snapshot next record load failed: playerId=${playerId} error=${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(message);
      recordAuthTrace({
        type: 'snapshot',
        playerId,
        source: 'next_invalid',
        persistedSource: null,
        fallbackReason,
        fallbackHit: false,
      });
      throw new Error(message);
    }

    if (nextSnapshotRecord?.snapshot) {
      const normalizedPersistedSource = normalizeSnapshotPersistedSource(nextSnapshotRecord.persistedSource);
      if (!normalizedPersistedSource) {
        const message = `Player snapshot next record persistedSource invalid: playerId=${playerId} persistedSource=${typeof nextSnapshotRecord.persistedSource === 'string' ? nextSnapshotRecord.persistedSource : 'unknown'}`;
        this.logger.error(message);
        recordAuthTrace({
          type: 'snapshot',
          playerId,
          source: 'next_invalid',
          persistedSource: null,
          fallbackReason,
          fallbackHit: false,
        });
        throw new Error(message);
      }
      this.logger.debug(`玩家快照来源=next persistedSource=${normalizedPersistedSource} playerId=${playerId}`);
      recordAuthTrace({
        type: 'snapshot',
        playerId,
        source: 'next',
        persistedSource: normalizedPersistedSource,
        fallbackReason,
        fallbackHit: false,
      });
      return {
        snapshot: nextSnapshotRecord.snapshot,
        source: 'next',
        persistedSource: normalizedPersistedSource,
        fallbackReason,
        seedPersisted: false,
      };
    }
    return buildPersistedSnapshotMissResult(playerId, fallbackReason, this.logger);
  }

  async loadPlayerSnapshot(
    playerId: string,
    fallbackReason: string | null = null,
  ): Promise<PersistedPlayerSnapshot | null> {
    const result = await this.loadPlayerSnapshotResult(playerId, fallbackReason);
    return result.snapshot;
  }
}

function buildPersistedSnapshotMissResult(
  playerId: string,
  fallbackReason: string | null,
  logger: Logger,
): LoadPlayerSnapshotResult {
  logger.debug(`玩家快照来源=miss playerId=${playerId} nextOnly=true fallbackReason=${fallbackReason ?? '无'}`);
  recordAuthTrace({
    type: 'snapshot',
    playerId,
    source: 'miss',
    allowLegacyFallback: false,
    fallbackReason,
    fallbackHit: false,
  });
  return {
    snapshot: null,
    source: 'miss',
    persistedSource: null,
    fallbackReason,
    seedPersisted: false,
  };
}
