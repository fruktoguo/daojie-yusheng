/**
 * 健康检查 HTTP 控制器：提供 /live 和 /health 端点。
 * /live 仅回答进程存活；/health 汇总数据库、持久化、运行时的就绪状态。
 */
import { Controller, Get, HttpStatus, Optional, Post, Res } from '@nestjs/common';

import { HealthReadinessService } from './health/health-readiness.service';
import { WorldShutdownDrainService } from './network/world-shutdown-drain.service';
interface ResponseLike {
  status: (code: number) => unknown;
}

/** 健康检查控制器：对外暴露 liveness 和 readiness 端点，供容器编排和负载均衡使用。 */
@Controller()
export class HealthController {
  constructor(
    @Optional() private readonly healthReadinessService: HealthReadinessService,
    @Optional() private readonly worldShutdownDrainService: WorldShutdownDrainService,
  ) {}

  /** live：只回答进程是否仍能响应，用于容器 liveness。 */
  @Get('live')
  live() {
    return {
      ok: true,
      service: 'server',
      alive: {
        ok: true,
        service: 'server',
      },
    };
  }

  /** health：返回完整 readiness 状态；非开发环境只返回精简摘要。 */
  @Get('health')
  health(@Res({ passthrough: true }) response: ResponseLike) {
    const health = this.healthReadinessService?.build() ?? {
      ok: false,
      service: 'server',
      alive: {
        ok: true,
        service: 'server',
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
          mode: 'native_only' as const,
          source: null,
          reason: 'native_auth_only' as const,
        },
        runtime: {
          ready: false,
          reason: 'service_unavailable',
          tick: 0,
          instanceCount: 0,
          leaseDegradedInstanceCount: 0,
          fencedInstanceCount: 0,
          playerCount: 0,
          pendingCommandCount: 0,
        },
      },
    };
    if (!health.readiness.ok) {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    const env = String(process.env.SERVER_RUNTIME_ENV ?? process.env.NODE_ENV ?? '').trim().toLowerCase();
    if (env && env !== 'development' && env !== 'dev' && env !== 'local' && env !== 'test') {
      return { ok: health.ok ?? (health.readiness?.ok ?? false), service: 'server' };
    }
    return health;
  }

  /** 本地 smoke 专用：显式触发关机 drain。 */
  @Post('shutdown-drain')
  async shutdownDrain() {
    const enabled = String(process.env.SERVER_ALLOW_LOCAL_SHUTDOWN_DRAIN ?? '').trim();
    if (enabled !== '1') {
      return { ok: false, reason: 'disabled' };
    }
    await this.worldShutdownDrainService?.drain('http');
    return { ok: true };
  }
}
