/**
 * 健康检查控制器 —— 供负载均衡 / 监控探针使用
 */
import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  /** 返回服务存活状态 */
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'daojie-yusheng-server',
      timestamp: Date.now(),
    };
  }
}
