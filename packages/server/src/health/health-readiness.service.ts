import { Inject, Injectable, Optional } from '@nestjs/common';

import { MailPersistenceService } from '../persistence/mail-persistence.service';
import { MarketPersistenceService } from '../persistence/market-persistence.service';
import { PlayerPersistenceService } from '../persistence/player-persistence.service';
import { SuggestionPersistenceService } from '../persistence/suggestion-persistence.service';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { buildHealthResponse } from './health-readiness';
import { ServerReadinessDependenciesService } from './server-readiness-dependencies.service';
/**
 * PersistenceServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface PersistenceServiceLike {
/**
 * enabled：启用开关或状态标识。
 */

  enabled?: boolean;  
  /**
 * pool：缓存或索引容器。
 */

  pool?: unknown;
}
/**
 * WorldRuntimeServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface WorldRuntimeServiceLike {
/**
 * getRuntimeSummary：get运行态摘要状态或数据块。
 */

  getRuntimeSummary?: () => unknown;
}

/** 读取就绪检测依赖并输出对外服务态的服务层入口。 */
@Injectable()
export class HealthReadinessService {
  /** 注入各持久化服务与 runtime，用于组合 readiness 检查。 */
  constructor(
    @Optional()
    @Inject(PlayerPersistenceService)
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
  ) {}  
  /**
 * build：构建并返回目标对象。
 * @returns 无返回值，直接更新结果相关状态。
 */


  build() {
    return buildHealthResponse({
      playerPersistenceService: this.playerPersistenceService,
      mailPersistenceService: this.mailPersistenceService,
      marketPersistenceService: this.marketPersistenceService,
      suggestionPersistenceService: this.suggestionPersistenceService,
      ...(this.serverReadinessDependenciesService?.build() ?? {}),
      worldRuntimeService: this.worldRuntimeService,
    });
  }

  /** 公开给网关/控制器：玩家请求前置依赖是否完成。 */
  isReadyForPlayerTraffic(): boolean {
    return this.build().readiness.ok;
  }
}
