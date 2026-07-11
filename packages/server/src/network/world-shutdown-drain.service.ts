/**
 * 本文件定义服务端网络网关、上下文或协议投影，连接 socket 请求和运行时服务。
 *
 * 维护时要保持 handler 只接收意图、做鉴权和排队，不直接绕过运行时修改权威状态。
 */
/**
 * 世界关机 drain 协调器。
 * 固定顺序：停接入 -> 断开现有 socket -> 停 tick / worker -> final flush -> 释放 lease -> 注销节点。
 */
import { Inject, Injectable, Logger, Optional, type BeforeApplicationShutdown } from '@nestjs/common';

import { MapPersistenceFlushService } from '../persistence/map-persistence-flush.service';
import { NodeRegistryService } from '../persistence/node-registry.service';
import { PlayerPersistenceFlushService } from '../persistence/player-persistence-flush.service';
import { DurableOperationService } from '../persistence/durable-operation.service';
import { FlushTaskRuntimeService } from '../persistence/flush-task-runtime.service';
import { TongtianTowerPersistenceService } from '../persistence/tongtian-tower-persistence.service';
import { MarketRuntimeService } from '../runtime/market/market-runtime.service';
import { WorldTickService } from '../runtime/tick/world-tick.service';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { WorldGateway } from './world.gateway';
import { ShutdownStatusService, type ShutdownResultSnapshot } from '../lifecycle/shutdown-status.service';
import { StartupBarrierService } from '../lifecycle/startup-barrier.service';
import { BackgroundWorkerRuntimeService } from '../runtime/worker/background-worker-runtime.service';

const SHUTDOWN_SESSION_DRAIN_PARALLELISM = 32;
const BACKGROUND_WORKER_SHUTDOWN_DRAIN_BUDGET_MS = 8_000;

@Injectable()
export class WorldShutdownDrainService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(WorldShutdownDrainService.name);
  private drainPromise: Promise<ShutdownResultSnapshot> | null = null;

  constructor(
    @Inject(WorldGateway) private readonly worldGateway: WorldGateway,
    @Inject(PlayerPersistenceFlushService) private readonly playerPersistenceFlushService: PlayerPersistenceFlushService,
    @Inject(MapPersistenceFlushService) private readonly mapPersistenceFlushService: MapPersistenceFlushService,
    @Inject(DurableOperationService) private readonly durableOperationService: DurableOperationService,
    @Inject(MarketRuntimeService) private readonly marketRuntimeService: MarketRuntimeService,
    @Inject(TongtianTowerPersistenceService) private readonly tongtianTowerPersistenceService: TongtianTowerPersistenceService,
    @Inject(WorldTickService) private readonly worldTickService: WorldTickService,
    @Inject(WorldRuntimeService) private readonly worldRuntimeService: WorldRuntimeService,
    @Inject(NodeRegistryService) private readonly nodeRegistryService: NodeRegistryService,
    @Inject(ShutdownStatusService) private readonly shutdownStatusService: ShutdownStatusService,
    @Inject(StartupBarrierService) private readonly startupBarrierService: StartupBarrierService,
    @Inject(FlushTaskRuntimeService) private readonly flushTaskRuntimeService: FlushTaskRuntimeService,
    @Optional() @Inject(BackgroundWorkerRuntimeService)
    private readonly backgroundWorkerRuntimeService?: BackgroundWorkerRuntimeService,
  ) {}

  async beforeApplicationShutdown(signal?: string): Promise<void> {
    await this.drain(signal);
  }

  async drain(signal?: string): Promise<ShutdownResultSnapshot> {
    if (this.drainPromise) {
      return this.drainPromise;
    }
    this.drainPromise = this.runDrain(signal);
    return this.drainPromise;
  }

  private async runDrain(signal?: string): Promise<ShutdownResultSnapshot> {
    const reason = signal ?? 'shutdown';
    this.shutdownStatusService.begin(reason, signal ?? null);
    this.worldGateway.setDraining(true);
    this.startupBarrierService.closeTraffic();
    this.shutdownStatusService.beginPhase('traffic_closed', reason);
    this.shutdownStatusService.completePhase('traffic_closed', {
      trafficOpen: this.startupBarrierService.isTrafficOpen(),
    });

    this.startupBarrierService.closeInstanceAttach();
    this.startupBarrierService.closeInstanceWrites();
    this.durableOperationService.beginShutdown();
    this.worldRuntimeService.worldRuntimeSectService?.beginShutdown?.();
    this.shutdownStatusService.beginPhase('sessions_draining', reason);
    const detachedBindings = this.worldGateway.disconnectAllForShutdown('server_shutdown');
    await runConcurrent(detachedBindings, SHUTDOWN_SESSION_DRAIN_PARALLELISM, async (binding) => {
      const result = await this.worldGateway.drainDetachedBinding(binding);
      this.shutdownStatusService.recordPlayerDetached();
      if (!result?.presencePersisted) {
        this.shutdownStatusService.recordPlayerPresenceFailed(binding.playerId);
      }
      if (!result?.flushSucceeded) {
        this.shutdownStatusService.recordPlayerFlushFailed(binding.playerId);
      }
    });
    this.shutdownStatusService.completePhase('sessions_draining', {
      detached: detachedBindings.length,
      presenceFailed: this.shutdownStatusService.getSnapshot().players.presenceFailed.length,
      flushFailed: this.shutdownStatusService.getSnapshot().players.flushFailed.length,
    });

    this.startupBarrierService.closeTick();
    await this.worldTickService.stopForShutdown();
    this.shutdownStatusService.beginPhase('runtime_frozen', reason);
    this.shutdownStatusService.completePhase('runtime_frozen', {
      tickOpen: this.startupBarrierService.isTickOpen(),
    });

    this.startupBarrierService.closeFlush();
    this.startupBarrierService.closeOutbox();
    this.startupBarrierService.closeWorker();
    this.shutdownStatusService.beginPhase('workers_stopping', reason);
    let backgroundWorkerDrainFailed = false;
    try {
      await this.backgroundWorkerRuntimeService?.drainForShutdown({
        budgetMs: BACKGROUND_WORKER_SHUTDOWN_DRAIN_BUDGET_MS,
      });
    } catch (error) {
      backgroundWorkerDrainFailed = true;
      this.shutdownStatusService.recordInstanceFlushFailed('background_worker_drain');
      this.logger.error('后台任务关机 drain 超出预算或执行失败；最终刷盘后将保留实例租约', error instanceof Error ? error.stack : String(error));
    }
    let durablePayloadDrainFailed = false;
    try {
      await this.flushTaskRuntimeService.drainForShutdown();
    } catch (error) {
      durablePayloadDrainFailed = true;
      this.shutdownStatusService.recordInstanceFlushFailed('durable_payload_drain');
      this.logger.error('统一刷盘 durable payload 关机排空失败；继续刷新其他领域并保留实例租约', error instanceof Error ? error.stack : String(error));
    }
    await this.marketRuntimeService.drainForShutdown();
    this.shutdownStatusService.completePhase('workers_stopping', {
      flushOpen: this.startupBarrierService.isFlushOpen(),
      outboxOpen: this.startupBarrierService.isOutboxOpen(),
      workerOpen: this.startupBarrierService.isWorkerOpen(),
      backgroundWorkerDrainFailed,
      durablePayloadDrainFailed,
    });

    this.shutdownStatusService.beginPhase('final_flushing', reason);
    const unresolvedAssetCommit = this.durableOperationService.hasUnresolvedCommitOutcomes();
    const unresolvedSectCommit = this.worldRuntimeService.worldRuntimeSectService?.hasUnresolvedCommitOutcomes?.() === true;
    const unresolvedDurableCommit = unresolvedAssetCommit || unresolvedSectCommit;
    let finalFlushFailed = backgroundWorkerDrainFailed || durablePayloadDrainFailed || unresolvedDurableCommit;
    if (unresolvedDurableCommit) {
      this.shutdownStatusService.recordInstanceFlushFailed('durable_commit_outcome_unknown');
      this.logger.error('存在结果未确认的跨域强事务；继续刷新无关对象，并保留实例租约');
    }
    const finalFlushTasks = [
      this.runFinalFlush('player_flush', '玩家数据', () => this.playerPersistenceFlushService.flushAllNow()),
      this.runFinalFlush('map_flush', '地图数据', () => this.mapPersistenceFlushService.flushAllNow()),
      this.runFinalFlush('tongtian_tower_flush', '通天塔数据', () => this.tongtianTowerPersistenceService.flushAllProgress()),
    ];
    if (unresolvedSectCommit) {
      this.logger.error('宗门事务结果未确认，跳过宗门与关联阵法最终刷盘');
    } else {
      finalFlushTasks.push(this.runFinalFlush('sect_flush', '宗门数据', async () => {
        if (typeof this.worldRuntimeService.worldRuntimeSectService?.flushAllNow === 'function') {
          await this.worldRuntimeService.worldRuntimeSectService.flushAllNow();
        }
      }));
      finalFlushTasks.push(this.runFinalFlush('formation_flush', '阵法数据', async () => {
        if (typeof this.worldRuntimeService.worldRuntimeFormationService?.flushAllNow === 'function') {
          await this.worldRuntimeService.worldRuntimeFormationService.flushAllNow();
        }
      }));
    }
    const finalFlushResults = await Promise.all(finalFlushTasks);
    finalFlushFailed ||= finalFlushResults.some((succeeded) => !succeeded);
    this.shutdownStatusService.completePhase('final_flushing');

    this.shutdownStatusService.beginPhase('leases_releasing', reason);
    let leaseResult: { released: number; skipped: number; releasedInstanceIds?: string[]; skippedInstanceIds?: string[]; failedInstanceIds?: string[] } = { released: 0, skipped: 0, releasedInstanceIds: [], skippedInstanceIds: [], failedInstanceIds: [] };
    if (finalFlushFailed) {
      const nodeId = this.nodeRegistryService.getNodeId();
      for (const [instanceId, instance] of this.worldRuntimeService.listInstanceEntries()) {
        const assignedNodeId = typeof instance?.meta?.assignedNodeId === 'string' ? instance.meta.assignedNodeId.trim() : '';
        const leaseToken = typeof instance?.meta?.leaseToken === 'string' ? instance.meta.leaseToken.trim() : '';
        if (assignedNodeId === nodeId && leaseToken) {
          leaseResult.skipped += 1;
          leaseResult.skippedInstanceIds?.push(instanceId);
          this.shutdownStatusService.recordLeaseReleaseSkipped(instanceId);
        }
      }
      this.shutdownStatusService.completePhase('leases_releasing', {
        released: 0,
        skipped: leaseResult.skipped,
        reason: 'final_flush_failed',
      });
    } else {
      leaseResult = await this.worldRuntimeService.releaseLocalInstanceLeasesForShutdown();
      for (const _instanceId of leaseResult.releasedInstanceIds ?? []) {
        this.shutdownStatusService.recordLeaseReleased();
      }
      for (const instanceId of leaseResult.skippedInstanceIds ?? []) {
        this.shutdownStatusService.recordLeaseReleaseSkipped(instanceId);
      }
      for (const instanceId of leaseResult.failedInstanceIds ?? []) {
        this.shutdownStatusService.recordLeaseReleaseFailed(instanceId);
      }
      this.shutdownStatusService.completePhase('leases_releasing', {
        released: leaseResult.released,
        skipped: leaseResult.skipped,
      });
    }

    this.shutdownStatusService.beginPhase('node_deregistering', reason);
    try {
      await this.nodeRegistryService.deregisterNode();
      this.shutdownStatusService.markNodeDeregistered();
    } catch (error) {
      this.shutdownStatusService.markNodeDeregisterFailed(error);
      this.logger.error('节点注销失败', error instanceof Error ? error.stack : String(error));
    }
    this.shutdownStatusService.completePhase('node_deregistering', {
      deregistered: this.shutdownStatusService.getSnapshot().node.deregistered,
    });

    await this.worldRuntimeService.closeForShutdown();

    const currentSnapshot = this.shutdownStatusService.getSnapshot();
    const hasFailures = currentSnapshot.players.flushFailed.length > 0
      || currentSnapshot.players.presenceFailed.length > 0
      || currentSnapshot.instances.flushFailed.length > 0
      || currentSnapshot.instances.leaseReleaseSkipped.length > 0
      || currentSnapshot.instances.leaseReleaseFailed.length > 0
      || currentSnapshot.node.deregisterFailed !== null;
    if (hasFailures) {
      this.shutdownStatusService.failPhase('drain_failed', new Error('shutdown_degraded'), {
        detachedPlayers: detachedBindings.length,
        leaseReleased: leaseResult.released,
        leaseSkipped: leaseResult.skipped,
      });
      const finalSnapshot = this.shutdownStatusService.getSnapshot();
      this.logger.warn(`关闭 drain 降级完成：${JSON.stringify({ phase: finalSnapshot.phase, players: finalSnapshot.players, instances: finalSnapshot.instances, node: finalSnapshot.node })}`);
      return finalSnapshot;
    }
    this.shutdownStatusService.markCompleted({
      detachedPlayers: detachedBindings.length,
      leaseReleased: leaseResult.released,
      leaseSkipped: leaseResult.skipped,
    });
    const finalSnapshot = this.shutdownStatusService.getSnapshot();
    this.logger.log(`关闭 drain 完成：${JSON.stringify({ phase: finalSnapshot.phase, players: finalSnapshot.players, instances: finalSnapshot.instances, node: finalSnapshot.node })}`);
    return finalSnapshot;
  }

  private async runFinalFlush(
    failureKey: string,
    label: string,
    action: () => Promise<void>,
  ): Promise<boolean> {
    try {
      await action();
      this.shutdownStatusService.recordInstanceFlushed();
      return true;
    } catch (error) {
      this.shutdownStatusService.recordInstanceFlushFailed(failureKey);
      this.logger.error(`最终落盘${label}失败`, error instanceof Error ? error.stack : String(error));
      return false;
    }
  }
}

async function runConcurrent<T>(
  values: readonly T[],
  parallelism: number,
  worker: (value: T) => Promise<void>,
): Promise<void> {
  const normalizedParallelism = Math.max(1, Math.trunc(Number(parallelism) || 1));
  for (let index = 0; index < values.length; index += normalizedParallelism) {
    const slice = values.slice(index, index + normalizedParallelism);
    await Promise.all(slice.map((value) => worker(value)));
  }
}
