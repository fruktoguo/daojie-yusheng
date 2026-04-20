import { Controller, Get, HttpStatus, Optional, Res } from '@nestjs/common';

import { HealthReadinessService } from './health/health-readiness.service';
/**
 * ResponseLike：定义接口结构约束，明确可交付字段含义。
 */


interface ResponseLike {
/**
 * status：ResponseLike 内部字段。
 */

  status: (code: number) => unknown;
}

/** 健康检查控制器：统一返回 server-next 的 liveness/readiness 响应。 */
@Controller()
export class HealthController {
/**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param healthReadinessService HealthReadinessService 参数说明。
 * @returns 无返回值（构造函数）。
 */

  constructor(
    @Optional() private readonly healthReadinessService: HealthReadinessService,
  ) {}

  /** health：处理健康状态。 */
  @Get('health')
  health(@Res({ passthrough: true }) response: ResponseLike) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const health = this.healthReadinessService?.build() ?? {
      ok: false,
      service: 'server-next',
      alive: {
        ok: true,
        service: 'server-next',
      },
      readiness: {
        ok: false,
        maintenance: {
          active: false,
          source: null,
          reason: 'service_unavailable',
        },
        database: {
          configured: false,
          source: null,
        },
        persistence: {
          player: { enabled: false, reason: 'service_unavailable' },
          mail: { enabled: false, reason: 'service_unavailable' },
          market: { enabled: false, reason: 'service_unavailable' },
          suggestion: { enabled: false, reason: 'service_unavailable' },
        },
        auth: {
          ready: true,
          mode: 'next_only' as const,
          source: null,
          reason: 'next_auth_only' as const,
        },
        runtime: {
          ready: false,
          reason: 'service_unavailable',
          tick: 0,
          instanceCount: 0,
          playerCount: 0,
          pendingCommandCount: 0,
        },
      },
    };
    if (!health.readiness.ok) {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return health;
  }
}
