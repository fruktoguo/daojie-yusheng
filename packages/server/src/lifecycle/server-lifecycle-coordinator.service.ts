/**
 * 本文件参与服务端启动、就绪或关闭生命周期管理，负责协调依赖状态和对外可用性。
 *
 * 维护时要保证 readiness 与 shutdown 语义清晰，避免服务还未恢复完成就提前接流量。
 */
import { Inject, Injectable, Logger, Optional, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';

import { readTrimmedEnv } from '../config/env-alias';
import { shouldStartAuthoritativeRuntime, shouldStartBackgroundWorkers, shouldStartHttpServer } from '../config/runtime-role';
import { StartupBarrierService } from './startup-barrier.service';
import { StartupStatusService } from './startup-status.service';
import { type ShutdownResultSnapshot } from './shutdown-status.service';
import { FlushTaskRuntimeService } from '../persistence/flush-task-runtime.service';
import { MapPersistenceFlushService } from '../persistence/map-persistence-flush.service';
import { PlayerPersistenceFlushService } from '../persistence/player-persistence-flush.service';
import { MarketRuntimeService } from '../runtime/market/market-runtime.service';
import { WorldTickService } from '../runtime/tick/world-tick.service';
import { BackgroundWorkerRuntimeService } from '../runtime/worker/background-worker-runtime.service';
import { SchedulerManagerService } from '../scheduler/scheduler-manager.service';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { WorldShutdownDrainService } from '../network/world-shutdown-drain.service';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { AiProviderConfigService } from '../ai/ai-provider-config.service';
import { readAiTextModelConfig, type AiTextModelConfig } from '../ai/ai-model-config';
import { TechniqueTemplateRegistry } from '../content/registries/technique-template.registry';
import { GeneratedTechniqueStoreService } from '../runtime/technique-generation/generated-technique-store.service';
import { TechniqueGenerationService } from '../runtime/technique-generation/technique-generation.service';
import { ensureGeneratedTechniqueTables } from '../persistence/generated-technique-persistence.service';

@Injectable()
export class ServerLifecycleCoordinatorService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ServerLifecycleCoordinatorService.name);
  private startPromise: Promise<void> | null = null;
  private drainPromise: Promise<ShutdownResultSnapshot> | null = null;
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
    @Optional() @Inject(WorldShutdownDrainService) private readonly worldShutdownDrainService?: WorldShutdownDrainService,
    @Optional() @Inject(SchedulerManagerService) private readonly schedulerManagerService?: SchedulerManagerService,
    @Optional() @Inject(DatabasePoolProvider) private readonly databasePoolProvider?: DatabasePoolProvider,
    @Optional() @Inject(AiProviderConfigService) private readonly aiProviderConfigService?: AiProviderConfigService,
    @Optional() @Inject(TechniqueTemplateRegistry) private readonly techniqueTemplateRegistry?: TechniqueTemplateRegistry,
    @Optional() @Inject(GeneratedTechniqueStoreService) private readonly generatedTechniqueStoreService?: GeneratedTechniqueStoreService,
    @Optional() @Inject(TechniqueGenerationService) private readonly techniqueGenerationService?: TechniqueGenerationService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.start();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    this.startupBarrierService.closeForDrain();
    this.schedulerManagerService?.stop('module_destroy');
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

  async drain(reason: string = 'shutdown'): Promise<ShutdownResultSnapshot> {
    if (this.drainPromise) {
      return this.drainPromise;
    }
    this.startupBarrierService.closeTraffic();
    this.schedulerManagerService?.refreshBarrierSnapshot();
    this.startupStatusService.markDraining(reason);
    this.drainPromise = (async () => {
      if (!this.worldShutdownDrainService) {
        throw new Error('world_shutdown_drain_service_unavailable');
      }
      return await this.worldShutdownDrainService.drain(reason);
    })().catch((error) => {
      this.startupStatusService.markFailed(error, 'draining');
      this.logger.error(`关闭链路执行失败：${reason}`, error instanceof Error ? error.stack : String(error));
      throw error;
    });
    return this.drainPromise;
  }

  private async runStartup(): Promise<void> {
    if (this.stopped) {
      return;
    }

    this.startupBarrierService.resetForStartup();
    await this.schedulerManagerService?.initialize({ barrier: this.startupBarrierService.getSnapshot() });
    this.startupStatusService.beginPhase('preparing', 'startup_preparing');
    this.startupStatusService.completePhase('preparing', {
      authoritativeRuntime: shouldStartAuthoritativeRuntime(),
      backgroundWorkers: shouldStartBackgroundWorkers(),
      http: shouldStartHttpServer(),
    });

    await this.initializeTechniqueGenerationDomain();

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
    const instanceDomainRestoreMode = resolveStartupInstanceDomainRestoreMode();
    const eagerRestore = instanceDomainRestoreMode === 'eager';
    this.startupStatusService.beginPhase('recovering_world', 'world_recovery');
    await this.worldRuntimeService.rebuildPersistentRuntimeAfterRestore({
      restoreOfflinePlayers: false,
      restoreInstanceDomains: eagerRestore,
      restoreCatalogInstances: true,
      rewriteCatalogRuntimeStatus: eagerRestore,
    });
    const instanceIds = this.listRuntimeInstanceIds();
    this.startupBarrierService.openInstanceWrites(instanceIds);
    this.startupStatusService.completePhase('recovering_world', {
      instanceCount: instanceIds.length,
      instanceDomainRestoreMode,
    });
  }

  private async recoverPlayers(): Promise<void> {
    if (!this.worldRuntimeService) {
      throw new Error('world_runtime_service_unavailable');
    }
    this.startupStatusService.beginPhase('recovering_players', 'player_recovery');
    this.startupBarrierService.openInstanceAttach(this.listRuntimeInstanceIds());
    const offlineHangingPlayers = await this.worldRuntimeService.restoreOfflineHangingPlayersForStartup();
    const startupRunId = this.startupStatusService.getSnapshot().startupRunId;
    this.startupStatusService.completePhase('recovering_players', {
      instanceAttachAllowed: true,
      instanceCount: this.listRuntimeInstanceIds().length,
      offlineHangingPlayers: withStartupRunIdForPlayerRecovery(offlineHangingPlayers, startupRunId),
    });
  }

  private async reloadSecondaryDomains(): Promise<void> {
    if (typeof this.marketRuntimeService?.reloadFromPersistence !== 'function') {
      return;
    }
    await this.marketRuntimeService.reloadFromPersistence();
  }

  private async initializeTechniqueGenerationDomain(): Promise<void> {
    if (!this.generatedTechniqueStoreService || !this.techniqueGenerationService) {
      return;
    }

    const pool = this.databasePoolProvider?.getPool('technique-generation') ?? null;
    if (!pool) {
      this.logger.warn('AI 生成功法持久化未启用：数据库连接池不可用');
      return;
    }

    await ensureGeneratedTechniqueTables(pool);
    this.generatedTechniqueStoreService.initialize(pool);
    this.techniqueTemplateRegistry?.setGeneratedStore(this.generatedTechniqueStoreService);
    this.techniqueGenerationService.initialize({
      pool,
      generatedStore: this.generatedTechniqueStoreService,
      modelConfigResolver: () => this.resolveTechniqueGenerationTextModelConfig(),
    });
    await this.generatedTechniqueStoreService.reload();
    this.logger.log(
      `AI 生成功法持久化已初始化：缓存数量=${this.generatedTechniqueStoreService.size} 就绪=${this.techniqueGenerationService.isReady()}`,
    );
  }

  private async resolveTechniqueGenerationTextModelConfig(): Promise<AiTextModelConfig | null> {
    return await this.aiProviderConfigService?.getTextModelConfig('technique')
      ?? await this.aiProviderConfigService?.getTextModelConfig('default')
      ?? readAiTextModelConfig('technique')
      ?? readAiTextModelConfig('default');
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
    this.schedulerManagerService?.refreshBarrierSnapshot();
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

function withStartupRunIdForPlayerRecovery(input: unknown, startupRunId: string): unknown {
  if (!input || typeof input !== 'object') {
    return input ?? null;
  }
  const record = input as Record<string, unknown>;
  const skippedPlayers = Array.isArray(record.skippedPlayers)
    ? record.skippedPlayers.slice(0, 25).map((entry) => (
      entry && typeof entry === 'object'
        ? { ...(entry as Record<string, unknown>), startupRunId }
        : entry
    ))
    : [];
  return {
    ...record,
    skippedPlayers,
  };
}

function resolveStartupInstanceDomainRestoreMode(): 'lazy' | 'eager' {
  const raw = readTrimmedEnv(
    'SERVER_STARTUP_INSTANCE_DOMAIN_RESTORE_MODE',
    'STARTUP_INSTANCE_DOMAIN_RESTORE_MODE',
  ).toLowerCase();
  if (raw === 'eager' || raw === 'full') {
    return 'eager';
  }
  return 'lazy';
}
