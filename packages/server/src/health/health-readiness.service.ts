/**
 * 健康就绪检测服务：注入各持久化和运行时依赖，
 * 组合调用 buildHealthResponse 输出统一 readiness 响应。
 */
import { Inject, Injectable, Optional } from '@nestjs/common';

import { MailPersistenceService } from '../persistence/mail-persistence.service';
import { MarketPersistenceService } from '../persistence/market-persistence.service';
import { PlayerDomainPersistenceService } from '../persistence/player-domain-persistence.service';
import { SuggestionPersistenceService } from '../persistence/suggestion-persistence.service';
import { StartupBarrierService } from '../lifecycle/startup-barrier.service';
import { StartupStatusService } from '../lifecycle/startup-status.service';
import { ShutdownStatusService } from '../lifecycle/shutdown-status.service';
import { shouldStartHttpServer } from '../config/runtime-role';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { buildHealthResponse } from './health-readiness';
import { ServerReadinessDependenciesService } from './server-readiness-dependencies.service';

/** 持久化服务鸭子类型接口 */
interface PersistenceServiceLike {
  enabled?: boolean;
  pool?: unknown;
}

/** 世界运行时服务鸭子类型接口 */
interface WorldRuntimeServiceLike {
  getRuntimeSummary?: () => unknown;
}

/** 健康就绪检测服务：汇总依赖状态并输出 readiness 响应 */
@Injectable()
export class HealthReadinessService {
  constructor(
    @Optional()
    @Inject(PlayerDomainPersistenceService)
    private readonly playerPersistenceService: PersistenceServiceLike,
    @Optional()
    @Inject(MailPersistenceService)
    private readonly mailPersistenceService: PersistenceServiceLike,
    @Optional()
    @Inject(MarketPersistenceService)
    private readonly marketPersistenceService: PersistenceServiceLike,
    @Optional()
    @Inject(SuggestionPersistenceService)
    private readonly suggestionPersistenceService: PersistenceServiceLike,
    @Optional()
    @Inject(ServerReadinessDependenciesService)
    private readonly serverReadinessDependenciesService: ServerReadinessDependenciesService,
    @Optional()
    @Inject(WorldRuntimeService)
    private readonly worldRuntimeService: WorldRuntimeServiceLike,
    @Optional()
    @Inject(StartupStatusService)
    private readonly startupStatusService?: StartupStatusService,
    @Optional()
    @Inject(ShutdownStatusService)
    private readonly shutdownStatusService?: ShutdownStatusService,
    @Optional()
    @Inject(StartupBarrierService)
    private readonly startupBarrierService?: StartupBarrierService,
  ) {}

  /** 构建完整 readiness 响应体 */
  build() {
    const startup = this.startupStatusService?.getSnapshot() ?? null;
    const response = buildHealthResponse({
      playerPersistenceService: this.playerPersistenceService,
      mailPersistenceService: this.mailPersistenceService,
      marketPersistenceService: this.marketPersistenceService,
      suggestionPersistenceService: this.suggestionPersistenceService,
      ...(this.serverReadinessDependenciesService?.build() ?? {}),
      worldRuntimeService: this.worldRuntimeService,
      startupRunId: startup?.startupRunId ?? null,
      shutdownStatus: this.shutdownStatusService?.getSnapshot() ?? null,
    });
    const barrier = this.startupBarrierService?.getSnapshot() ?? null;
    if (startup) {
      response.readiness.startup = {
        ...startup,
        barrier,
      };
      if (!startup.ready || (shouldStartHttpServer() && barrier?.trafficOpen !== true)) {
        response.ok = false;
        response.readiness.ok = false;
      }
    }
    return response;
  }

  /** 公开给网关/控制器：玩家请求前置依赖是否完成。 */
  isReadyForPlayerTraffic(): boolean {
    if (this.shutdownStatusService?.getSnapshot().blocking) {
      return false;
    }
    if (this.startupBarrierService && !this.startupBarrierService.isTrafficOpen()) {
      if (!shouldStartHttpServer()) {
        return this.build().readiness.ok;
      }
      return false;
    }
    return this.build().readiness.ok;
  }
}
