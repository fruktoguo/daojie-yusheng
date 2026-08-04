/**
 * 离线挂机时长到期后的运行态清理编排。
 * 权益查询、任务取消、离线收益结算与 session reaper 交接都在冷路径完成。
 */
import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { BASE_OFFLINE_MAX_HOURS, MERIT_MONTH_CARD_OFFLINE_MAX_HOURS } from '@mud/shared';

import { WorldSessionService } from '../../network/world-session.service';
import { ActivityPersistenceService } from '../../persistence/activity-persistence.service';
import { CraftPanelRuntimeService } from '../craft/craft-panel-runtime.service';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { WorldRuntimePlayerCommandService } from './command/world-runtime-player-command.service';
import { WorldRuntimeService } from './world-runtime.service';

const OFFLINE_HANGING_RUNTIME_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const BASE_OFFLINE_HANGING_TIMEOUT_MS = BASE_OFFLINE_MAX_HOURS * 60 * 60 * 1000;
const MONTH_CARD_OFFLINE_HANGING_TIMEOUT_MS = MERIT_MONTH_CARD_OFFLINE_MAX_HOURS * 60 * 60 * 1000;
const OFFLINE_HANGING_CLEANUP_PARALLELISM = 8;

export interface OfflineHangingRuntimeCleanupResult {
  scanned: number;
  candidates: number;
  queuedForReap: number;
  retainedByMonthCard: number;
  retainedByEternalCard: number;
  skipped: number;
  failed: number;
}

type CleanupDisposition = 'queued' | 'skipped';
type RuntimeExpiryPreparation =
  | { status: 'prepared' }
  | { status: 'skipped' }
  | { status: 'failed'; error: unknown };

@Injectable()
export class OfflineHangingRuntimeCleanupService implements OnModuleDestroy {
  private readonly logger = new Logger(OfflineHangingRuntimeCleanupService.name);
  private timer: NodeJS.Timeout | null = null;
  private sweepPromise: Promise<OfflineHangingRuntimeCleanupResult> | null = null;

  constructor(
    @Inject(PlayerRuntimeService)
    private readonly playerRuntimeService: PlayerRuntimeService,
    @Inject(ActivityPersistenceService)
    private readonly activityPersistenceService: ActivityPersistenceService,
    @Inject(CraftPanelRuntimeService)
    private readonly craftPanelRuntimeService: CraftPanelRuntimeService,
    @Inject(WorldRuntimePlayerCommandService)
    private readonly worldRuntimePlayerCommandService: WorldRuntimePlayerCommandService,
    @Inject(WorldRuntimeService)
    private readonly worldRuntimeService: WorldRuntimeService,
    @Inject(WorldSessionService)
    private readonly worldSessionService: WorldSessionService,
  ) {}

  startForLifecycleCoordinator(): void {
    if (this.timer) {
      return;
    }
    void this.sweepExpiredOfflineHangingPlayers().catch((error) => {
      this.logSweepFailure(error);
    });
    this.timer = setInterval(() => {
      void this.sweepExpiredOfflineHangingPlayers().catch((error) => {
        this.logSweepFailure(error);
      });
    }, OFFLINE_HANGING_RUNTIME_SWEEP_INTERVAL_MS);
    this.timer.unref();
    this.logger.log(`离线挂机运行态清理已启动，间隔 ${OFFLINE_HANGING_RUNTIME_SWEEP_INTERVAL_MS}ms`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  sweepExpiredOfflineHangingPlayers(nowMs = Date.now()): Promise<OfflineHangingRuntimeCleanupResult> {
    if (this.sweepPromise) {
      return this.sweepPromise;
    }
    const normalizedNow = Math.max(1, Math.trunc(Number(nowMs) || Date.now()));
    const sweep = this.performSweep(normalizedNow);
    this.sweepPromise = sweep;
    return sweep.finally(() => {
      if (this.sweepPromise === sweep) {
        this.sweepPromise = null;
      }
    });
  }

  private async performSweep(nowMs: number): Promise<OfflineHangingRuntimeCleanupResult> {
    const result: OfflineHangingRuntimeCleanupResult = {
      scanned: 0,
      candidates: 0,
      queuedForReap: 0,
      retainedByMonthCard: 0,
      retainedByEternalCard: 0,
      skipped: 0,
      failed: 0,
    };
    const preliminaryPlayerIds: string[] = [];
    for (const playerId of this.playerRuntimeService.listPlayerIds()) {
      result.scanned += 1;
      const player = this.playerRuntimeService.getPlayer(playerId);
      if (!isOfflineRuntimePastThreshold(player, nowMs, BASE_OFFLINE_HANGING_TIMEOUT_MS)) {
        continue;
      }
      if (this.worldSessionService.getBinding(playerId)
        || this.worldSessionService.hasDetachedRuntimePendingReap(playerId)) {
        result.skipped += 1;
        continue;
      }
      preliminaryPlayerIds.push(playerId);
    }
    if (preliminaryPlayerIds.length === 0) {
      return result;
    }

    if (!this.activityPersistenceService.isEnabled()) {
      throw new Error('offline_hanging_entitlement_persistence_unavailable');
    }
    const [activeMonthCardIds, eternalCardIds] = await Promise.all([
      this.activityPersistenceService.listActiveMonthCardPlayerIds(nowMs),
      this.activityPersistenceService.listEternalMonthCardPlayerIds(),
    ]);
    const activeMonthCardPlayerIds = new Set(activeMonthCardIds);
    const eternalCardPlayerIds = new Set(eternalCardIds);
    const expiredPlayerIds: string[] = [];

    for (const playerId of preliminaryPlayerIds) {
      if (eternalCardPlayerIds.has(playerId)) {
        result.retainedByEternalCard += 1;
        continue;
      }
      const player = this.playerRuntimeService.getPlayer(playerId);
      if (activeMonthCardPlayerIds.has(playerId)) {
        if (!isOfflineRuntimePastThreshold(player, nowMs, MONTH_CARD_OFFLINE_HANGING_TIMEOUT_MS)) {
          result.retainedByMonthCard += 1;
          continue;
        }
      }
      expiredPlayerIds.push(playerId);
    }
    result.candidates = expiredPlayerIds.length;

    for (let index = 0; index < expiredPlayerIds.length; index += OFFLINE_HANGING_CLEANUP_PARALLELISM) {
      const batch = expiredPlayerIds.slice(index, index + OFFLINE_HANGING_CLEANUP_PARALLELISM);
      const dispositions = await Promise.all(batch.map(async (playerId) => {
        try {
          return await this.expirePlayerRuntime(
            playerId,
            nowMs,
            activeMonthCardPlayerIds.has(playerId)
              ? MONTH_CARD_OFFLINE_HANGING_TIMEOUT_MS
              : BASE_OFFLINE_HANGING_TIMEOUT_MS,
          );
        } catch (error) {
          result.failed += 1;
          this.logger.warn(
            `离线挂机运行态清理失败：${playerId} ${error instanceof Error ? error.message : String(error)}`,
          );
          return null;
        }
      }));
      for (const disposition of dispositions) {
        if (disposition === 'queued') {
          result.queuedForReap += 1;
        } else if (disposition === 'skipped') {
          result.skipped += 1;
        }
      }
    }

    if (result.candidates > 0 || result.failed > 0) {
      this.logger.log(
        `离线挂机运行态清理完成：候选=${result.candidates} 入队=${result.queuedForReap} 跳过=${result.skipped} 失败=${result.failed}`,
      );
    }
    return result;
  }

  private async expirePlayerRuntime(
    playerId: string,
    nowMs: number,
    timeoutMs: number,
  ): Promise<CleanupDisposition> {
    const preparation = await this.playerRuntimeService.runExclusiveAssetMutation(
      [playerId],
      async (): Promise<RuntimeExpiryPreparation> => {
        try {
          let player = this.playerRuntimeService.getPlayer(playerId);
          if (!isOfflineRuntimePastThreshold(player, nowMs, timeoutMs)
            || this.hasNewerSessionState(playerId)) {
            return { status: 'skipped' };
          }
          if (!this.playerRuntimeService.markOfflineHangingRuntimeExpired(playerId, nowMs)) {
            return { status: 'skipped' };
          }

          this.craftPanelRuntimeService.normalizeLegacyForgingJobSlot(player);
          const cancelKinds = this.craftPanelRuntimeService.listCancelableTechniqueActivityKinds(player);
          for (const kind of cancelKinds) {
            await this.worldRuntimePlayerCommandService.dispatchCancelTechniqueActivity(
              playerId,
              kind,
              this.worldRuntimeService,
            );
          }

          player = this.playerRuntimeService.getPlayer(playerId);
          const remainingKinds = this.craftPanelRuntimeService.listCancelableTechniqueActivityKinds(player);
          if (remainingKinds.length > 0) {
            throw new Error(`offline_hanging_jobs_not_cancelled:${remainingKinds.join(',')}`);
          }
          this.craftPanelRuntimeService.clearTechniqueActivityQueue(player);
          const projectionFlushed = await this.craftPanelRuntimeService.flushTechniqueActivityProjection(player, {
            force: true,
            reason: 'offline_hanging_expired',
          });
          if (!projectionFlushed && !this.hasNewerSessionState(playerId)) {
            throw new Error('offline_hanging_activity_projection_flush_failed');
          }
          return { status: 'prepared' };
        } catch (error) {
          // 锁内已经发生的部分取消仍需先进入离线收益统计，再由下一轮幂等补齐其余任务。
          return { status: 'failed', error };
        }
      },
      { deferAssetStatisticsUntilSuccess: true },
    );
    if (preparation.status === 'skipped') {
      return 'skipped';
    }
    if (preparation.status === 'failed') {
      throw preparation.error;
    }

    // 第一阶段锁释放时统一资产统计已经并入离线会话；第二阶段再结算报告，避免漏掉任务取消退款，
    // 同时把最终结算与 reaper 入队放在同一把不延迟记账的资产锁内。
    return await this.playerRuntimeService.runExclusiveAssetMutation([playerId], async () => {
      const currentPlayer = this.playerRuntimeService.getPlayer(playerId);
      if (!currentPlayer || this.hasNewerSessionState(playerId)) {
        return 'skipped';
      }
      await this.playerRuntimeService.finalizeOfflineGainSessionForPlayer(currentPlayer, nowMs);
      const finalizedPlayer = this.playerRuntimeService.getPlayer(playerId);
      if (!finalizedPlayer || this.hasNewerSessionState(playerId)) {
        return 'skipped';
      }
      if (!this.playerRuntimeService.markOfflineHangingRuntimeReadyForReap(playerId, nowMs)) {
        return 'skipped';
      }
      const readyPlayer = this.playerRuntimeService.getPlayer(playerId);
      if (!readyPlayer || this.hasNewerSessionState(playerId)) {
        return 'skipped';
      }
      const queued = this.worldSessionService.enqueueDetachedRuntimeForReap({
        playerId,
        instanceId: readyPlayer.instanceId ?? null,
        sectId: readyPlayer.sectId ?? null,
        sessionEpoch: readyPlayer.sessionEpoch ?? null,
        detachedAt: readyPlayer.offlineSinceAt ?? nowMs,
      });
      return queued ? 'queued' : 'skipped';
    });
  }

  private hasNewerSessionState(playerId: string): boolean {
    const player = this.playerRuntimeService.getPlayer(playerId);
    return isRuntimeOnlineOrTransferring(player)
      || this.worldSessionService.getBinding(playerId) !== null
      || this.worldSessionService.hasDetachedRuntimePendingReap(playerId);
  }

  private logSweepFailure(error: unknown): void {
    this.logger.error(
      `离线挂机运行态扫描已整轮中止：${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error.stack : undefined,
    );
  }
}

function isOfflineRuntimePastThreshold(player: unknown, nowMs: number, timeoutMs: number): boolean {
  if (!player || typeof player !== 'object' || isRuntimeOnlineOrTransferring(player)) {
    return false;
  }
  const offlineSinceAt = Number((player as { offlineSinceAt?: unknown }).offlineSinceAt);
  return Number.isFinite(offlineSinceAt)
    && offlineSinceAt > 0
    && nowMs - offlineSinceAt >= timeoutMs;
}

function isRuntimeOnlineOrTransferring(player: unknown): boolean {
  if (!player || typeof player !== 'object') {
    return false;
  }
  const runtime = player as {
    sessionId?: unknown;
    transferState?: unknown;
    transferTargetNodeId?: unknown;
  };
  return (typeof runtime.sessionId === 'string' && runtime.sessionId.trim().length > 0)
    || runtime.transferState === 'in_transfer'
    || (typeof runtime.transferTargetNodeId === 'string' && runtime.transferTargetNodeId.trim().length > 0);
}
