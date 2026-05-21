import { Inject, Injectable, Logger, Optional, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';

import { shouldStartAuthoritativeRuntime, shouldStartBackgroundWorkers, shouldStartHttpServer } from '../config/runtime-role';
import { StartupBarrierService } from './startup-barrier.service';
import { StartupStatusService } from './startup-status.service';
import { FlushTaskRuntimeService } from '../persistence/flush-task-runtime.service';
import { MapPersistenceFlushService } from '../persistence/map-persistence-flush.service';
import { PlayerPersistenceFlushService } from '../persistence/player-persistence-flush.service';
import { MarketRuntimeService } from '../runtime/market/market-runtime.service';
import { WorldTickService } from '../runtime/tick/world-tick.service';
import { BackgroundWorkerRuntimeService } from '../runtime/worker/background-worker-runtime.service';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';

@Injectable()
export class ServerLifecycleCoordinatorService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ServerLifecycleCoordinatorService.name);
  private startPromise: Promise<void> | null = null;
  private stopped = false;

  constructor(
    private readonly startupStatusService: StartupStatusService,
    private readonly startupBarrierService: StartupBarrierService,
    @Optional() @Inject(WorldRuntimeService) private readonly worldRuntimeService?: WorldRuntimeService,
    @Optional() @Inject(WorldTickService) private readonly worldTickService?: WorldTickService,
    @Optional() @Inject(FlushTaskRuntimeService) private readonly flushTaskRuntimeService?: FlushTaskRuntimeService,
    @Optional() @Inject(PlayerPersistenceFlushService) private readonly playerPersistenceFlushService?: PlayerPersistenceFlushService,
    @Optional() @Inject(MapPersistenceFlushService) private readonly mapPersistenceFlushService?: MapPersistenceFlushService,
    @Optional() @Inject(BackgroundWorkerRuntimeService) private readonly backgroundWorkerRuntimeService?: BackgroundWorkerRuntimeService,
    @Optional() @Inject(MarketRuntimeService) private readonly marketRuntimeService?: MarketRuntimeService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.start();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    this.startupBarrierService.closeForDrain();
    this.startupStatusService.markDraining('module_destroy');
  }

  async start(): Promise<void> {
    if (this.startPromise) {
      return this.startPromise;
    }
    this.startPromise = this.runStartup().catch((error) => {
      this.startupBarrierService.closeForDrain();
      this.startupStatusService.markFailed(error);
      throw error;
    });
    return this.startPromise;
  }

  getStatus() {
    return this.startupStatusService.getSnapshot();
  }

  private async runStartup(): Promise<void> {
    if (this.stopped) {
      return;
    }

    this.startupBarrierService.resetForStartup();
    this.startupStatusService.beginPhase('preparing', 'startup_preparing');
    this.startupStatusService.completePhase('preparing', {
      authoritativeRuntime: shouldStartAuthoritativeRuntime(),
      backgroundWorkers: shouldStartBackgroundWorkers(),
      http: shouldStartHttpServer(),
    });

    if (shouldStartAuthoritativeRuntime()) {
      await this.recoverWorld();
      await this.recoverPlayers();
    }

    await this.reloadSecondaryDomains();
    await this.startRuntimeLoops();
    if (shouldStartAuthoritativeRuntime()) {
      this.worldRuntimeService?.startInstanceLeaseSyncForLifecycleCoordinator?.();
    }

    if (shouldStartHttpServer()) {
      this.startupBarrierService.openTraffic();
    }
    this.startupStatusService.beginPhase('ready', 'startup_ready');
    this.startupStatusService.markReady('startup_ready', this.buildReadyMetrics());
    this.logger.log(`启动链路编排完成：${JSON.stringify(this.buildReadyMetrics())}`);
  }

  private async recoverWorld(): Promise<void> {
    if (!this.worldRuntimeService) {
      throw new Error('world_runtime_service_unavailable');
    }
    this.startupStatusService.beginPhase('recovering_world', 'world_recovery');
    await this.worldRuntimeService.rebuildPersistentRuntimeAfterRestore({ restoreOfflinePlayers: false });
    const instanceIds = this.listRuntimeInstanceIds();
    this.startupBarrierService.openInstanceWrites(instanceIds);
    this.startupStatusService.completePhase('recovering_world', {
      instanceCount: instanceIds.length,
    });
  }

  private async recoverPlayers(): Promise<void> {
    if (!this.worldRuntimeService) {
      throw new Error('world_runtime_service_unavailable');
    }
    this.startupStatusService.beginPhase('recovering_players', 'player_recovery');
    this.startupBarrierService.openInstanceAttach(this.listRuntimeInstanceIds());
    const offlineHangingPlayers = await this.worldRuntimeService.restoreOfflineHangingPlayersForStartup();
    this.startupStatusService.completePhase('recovering_players', {
      instanceAttachAllowed: true,
      instanceCount: this.listRuntimeInstanceIds().length,
      offlineHangingPlayers: offlineHangingPlayers ?? null,
    });
  }

  private async reloadSecondaryDomains(): Promise<void> {
    if (typeof this.marketRuntimeService?.reloadFromPersistence !== 'function') {
      return;
    }
    await this.marketRuntimeService.reloadFromPersistence();
  }

  private async startRuntimeLoops(): Promise<void> {
    this.startupStatusService.beginPhase('starting_loops', 'runtime_loops');
    if (shouldStartAuthoritativeRuntime()) {
      this.startupBarrierService.openTick();
      this.worldTickService?.startForLifecycleCoordinator();
      this.startupBarrierService.openFlush();
      this.flushTaskRuntimeService?.startForLifecycleCoordinator();
      this.playerPersistenceFlushService?.startForLifecycleCoordinator();
      this.mapPersistenceFlushService?.startForLifecycleCoordinator();
    }
    if (shouldStartBackgroundWorkers()) {
      this.startupBarrierService.openOutbox();
      this.startupBarrierService.openWorker();
      this.backgroundWorkerRuntimeService?.startForLifecycleCoordinator();
    }
    this.startupStatusService.completePhase('starting_loops', this.startupBarrierService.getSnapshot());
  }

  private listRuntimeInstanceIds(): string[] {
    if (typeof this.worldRuntimeService?.listInstanceEntries !== 'function') {
      return [];
    }
    return Array.from(this.worldRuntimeService.listInstanceEntries()).map(([instanceId]) => instanceId);
  }

  private buildReadyMetrics(): Record<string, unknown> {
    return {
      ...this.startupBarrierService.getSnapshot(),
      instanceCount: this.listRuntimeInstanceIds().length,
    };
  }
}
