/**
 * 玩家快照服务。
 * 负责从持久化层加载玩家快照、处理 native/legacy 来源优先级和 auth-trace 审计。
 * 是 bootstrap 阶段快照真源的查询入口。
 */

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
  | 'native_snapshot_recovery_seed_failed'
  | 'native_snapshot_recovery_existing_watermark_block'
  | 'native_snapshot_recovery_watermark_check_failed';

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
  savePlayerSnapshotProjectionDomains(
    playerId: string,
    snapshot: PersistedPlayerSnapshot | null | undefined,
    domains: Iterable<string>,
  ): Promise<void>;
  loadProjectedSnapshot(
    playerId: string,
    buildStarterSnapshot: (playerId: string) => PersistedPlayerSnapshot | null,
  ): Promise<PersistedPlayerSnapshot | null>;
  hasRecoveryWatermark?(playerId: string): Promise<boolean>;
}

const NATIVE_STARTER_PROJECTION_DOMAINS = Object.freeze([
  'world_anchor',
  'position_checkpoint',
  'vitals',
  'progression',
  'attr',
  'wallet',
  'market_storage',
  'inventory',
  'map_unlock',
  'equipment',
  'technique',
  'body_training',
  'buff',
  'quest',
  'combat_pref',
  'auto_battle_skill',
  'auto_use_item_rule',
  'profession',
  'alchemy_preset',
  'active_job',
  'enhancement_record',
  'logbook',
] as const);

function normalizeSnapshotPersistedSource(persistedSource: unknown): SnapshotPersistedSource | null {
  const normalizedPersistedSource = typeof persistedSource === 'string'
    ? persistedSource.trim()
    : '';
  return ALLOWED_SNAPSHOT_PERSISTED_SOURCES.has(normalizedPersistedSource as SnapshotPersistedSource)
    ? (normalizedPersistedSource as SnapshotPersistedSource)
    : null;
}

/** 玩家快照服务：从持久化层加载快照，处理 native/legacy 来源优先级和 starter 快照构建。 */
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

  private canLoadProjectedSnapshot(): boolean {
    return this.isPersistenceEnabled()
      && typeof this.playerDomainPersistenceService?.loadProjectedSnapshot === 'function';
  }

  private canSaveProjectedSnapshot(): boolean {
    return this.canLoadProjectedSnapshot()
      && typeof this.playerDomainPersistenceService?.savePlayerSnapshotProjectionDomains === 'function';
  }

  async loadPersistedPlayerSnapshotRecord(playerId: string): Promise<PersistedPlayerSnapshotRecord | null> {
    void playerId;
    return null;
  }

  async ensureNativeStarterSnapshot(playerId: string): Promise<NativeStarterSnapshotResult> {
    const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
    if (!normalizedPlayerId) {
      return {
        ok: false,
        failureStage: 'native_snapshot_recovery_build_failed',
      };
    }

    if (!this.canSaveProjectedSnapshot()) {
      return {
        ok: false,
        failureStage: 'native_snapshot_recovery_persistence_disabled',
      };
    }

    // 第一层防御：PG 读失败时绝不能 fall through 到写 starter 分支。
    // 之前的实现把 .catch(error => null) 静默吞了任何 load 错误，会让连接池满 / advisory lock 抢占冲突 /
    // 网络抖动等临时故障被错判为"该玩家不存在"，进而用空 starter snapshot 覆盖现有玩家所有资产域。
    // 现在只把 throw 转化为明确的 failureStage 让上层 abort 玩家上线流程，宁可登录失败也不能清空资产。
    let existingSnapshot: PersistedPlayerSnapshot | null;
    try {
      existingSnapshot = await this.playerDomainPersistenceService!.loadProjectedSnapshot(
        normalizedPlayerId,
        (targetPlayerId) => this.playerRuntimeService.buildStarterPersistenceSnapshot(targetPlayerId),
      );
    } catch (error: unknown) {
      this.logger.error(
        `原生新手分域快照读取失败，拒绝写入 starter 以避免覆盖现有玩家：playerId=${normalizedPlayerId} error=${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        ok: false,
        failureStage: 'native_snapshot_recovery_load_failed',
      };
    }
    if (existingSnapshot) {
      return {
        ok: true,
        seeded: false,
        snapshot: existingSnapshot,
        persistedSource: 'native',
      };
    }

    // 第二层防御：在写 starter 之前显式查 player_recovery_watermark 表。
    // watermark 行只在玩家有过任何分域 save 后产生，因此 row 存在等价于"该玩家是已有数据的老玩家"。
    // 即使第一层因为某种 race / 边界条件没 catch 到读失败，这里仍能挡住。
    if (typeof this.playerDomainPersistenceService!.hasRecoveryWatermark === 'function') {
      let hasExistingWatermark: boolean;
      try {
        hasExistingWatermark = await this.playerDomainPersistenceService!.hasRecoveryWatermark(normalizedPlayerId);
      } catch (error: unknown) {
        this.logger.error(
          `原生新手分域快照 watermark 检查失败，拒绝写入 starter：playerId=${normalizedPlayerId} error=${error instanceof Error ? error.message : String(error)}`,
        );
        return {
          ok: false,
          failureStage: 'native_snapshot_recovery_watermark_check_failed',
        };
      }
      if (hasExistingWatermark) {
        this.logger.error(
          `拒绝用 starter snapshot 覆盖已有 watermark 的老玩家：playerId=${normalizedPlayerId}`,
        );
        return {
          ok: false,
          failureStage: 'native_snapshot_recovery_existing_watermark_block',
        };
      }
    }

    const starterSnapshot = this.playerRuntimeService.buildStarterPersistenceSnapshot(normalizedPlayerId);
    if (!starterSnapshot) {
      this.logger.warn(`原生新手分域快照构建失败：playerId=${normalizedPlayerId}`);
      return {
        ok: false,
        failureStage: 'native_snapshot_recovery_build_failed',
      };
    }

    try {
      await this.playerDomainPersistenceService!.savePlayerSnapshotProjectionDomains(
        normalizedPlayerId,
        starterSnapshot,
        NATIVE_STARTER_PROJECTION_DOMAINS,
      );
      this.logger.debug(`原生新手分域快照已补种：playerId=${normalizedPlayerId}`);
      return {
        ok: true,
        seeded: true,
        snapshot: starterSnapshot,
        persistedSource: 'native',
      };
    } catch (error: unknown) {
      this.logger.warn(`原生新手分域快照补种失败：playerId=${normalizedPlayerId} error=${error instanceof Error ? error.message : String(error)}`);
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
    if (this.canLoadProjectedSnapshot()) {
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
