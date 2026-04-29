import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { PlayerDomainPersistenceService } from '../persistence/player-domain-persistence.service';
import {
  type PersistedPlayerSnapshot,
  type PersistedPlayerSnapshotRecord,
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
type SnapshotResultSource = 'mainline' | 'backup' | 'miss';
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

interface PlayerDomainSnapshotPort {
  isEnabled(): boolean;
  loadProjectedSnapshot(
    playerId: string,
    buildStarterSnapshot: (playerId: string) => PersistedPlayerSnapshot | null,
  ): Promise<PersistedPlayerSnapshot | null>;
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
    @Optional()
    @Inject(PlayerDomainPersistenceService)
    private readonly playerDomainPersistenceService: PlayerDomainSnapshotPort | null = null,
    @Inject(PlayerRuntimeService)
    playerRuntimeService: unknown,
  ) {
    this.playerRuntimeService = playerRuntimeService as PlayerRuntimeSnapshotPort;
  }

  isPersistenceEnabled(): boolean {
    return typeof this.playerDomainPersistenceService?.isEnabled === 'function'
      && this.playerDomainPersistenceService.isEnabled();
  }

  async loadPersistedPlayerSnapshotRecord(playerId: string): Promise<PersistedPlayerSnapshotRecord | null> {
    void playerId;
    return null;
  }

  async ensureNativeStarterSnapshot(playerId: string): Promise<NativeStarterSnapshotResult> {
    const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
    this.logger.warn(`硬切模式拒绝原生快照补种：playerId=${normalizedPlayerId || '未知'}`);
    return {
      ok: false,
      failureStage: 'native_snapshot_recovery_persistence_disabled',
    };
  }

  async loadPlayerSnapshotResult(
    playerId: string,
    fallbackReason: string | null = null,
  ): Promise<LoadPlayerSnapshotResult> {
    if (typeof this.playerDomainPersistenceService?.isEnabled === 'function'
      && this.playerDomainPersistenceService.isEnabled()) {
      const projectedSnapshot = await this.playerDomainPersistenceService.loadProjectedSnapshot(
        playerId,
        (targetPlayerId) => this.playerRuntimeService.buildStarterPersistenceSnapshot(targetPlayerId),
      );
      if (projectedSnapshot) {
        const projectedFallbackReason = appendProjectionFallbackReason(fallbackReason);
        this.logger.debug(`玩家快照来源=主线 persistedSource=native projection=player-domain playerId=${playerId}`);
        recordAuthTrace({
          type: 'snapshot',
          playerId,
          source: 'mainline',
          persistedSource: 'native',
          fallbackReason: projectedFallbackReason,
          fallbackHit: true,
        });
        return {
          snapshot: projectedSnapshot,
          source: 'mainline',
          persistedSource: 'native',
          fallbackReason: projectedFallbackReason,
          seedPersisted: false,
        };
      }
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

function mergeProjectedSnapshotWithNativeSnapshot(
  projectedSnapshot: PersistedPlayerSnapshot,
  nativeSnapshot: PersistedPlayerSnapshot | null,
): PersistedPlayerSnapshot {
  if (!nativeSnapshot) {
    return projectedSnapshot;
  }
  const nativeSectId = typeof nativeSnapshot.sectId === 'string' && nativeSnapshot.sectId.trim()
    ? nativeSnapshot.sectId.trim()
    : null;
  if (!nativeSectId || (typeof projectedSnapshot.sectId === 'string' && projectedSnapshot.sectId.trim())) {
    return projectedSnapshot;
  }
  return {
    ...projectedSnapshot,
    sectId: nativeSectId,
  };
}

function appendProjectionFallbackReason(fallbackReason: string | null): string {
  return fallbackReason ? `${fallbackReason}|player_domain_projection` : 'player_domain_projection';
}

function buildPersistedSnapshotMissResult(
  playerId: string,
  fallbackReason: string | null,
  logger: Logger,
): LoadPlayerSnapshotResult {
  logger.debug(`玩家快照来源=miss playerId=${playerId} mainlineOnly=true fallbackReason=${fallbackReason ?? '无'}`);
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
