/**
 * 本文件属于持久化边界，负责数据库真源、flush、兼容转换或失败策略等可靠性逻辑。
 *
 * 维护时要优先考虑幂等、崩溃恢复和自动清理，避免在 tick 内直接引入阻塞 IO。
 */
/**
 * 节点注册运行时服务。
 * 启动时注册本节点，定时心跳并推进过期节点状态（suspect/dead），关闭时注销。
 */
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import {
  resolveNodeRuntimeConfig,
  type NodeRuntimeConfigResolution,
} from '../config/node-runtime-config';
import { NodeRegistryService } from './node-registry.service';

/** 节点注册运行时：管理心跳定时器和过期节点扫描 */
@Injectable()
export class NodeRegistryRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NodeRegistryRuntimeService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private config: NodeRuntimeConfigResolution | null = null;

  constructor(
    private readonly nodeRegistryService: NodeRegistryService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.nodeRegistryService.isEnabled()) {
      return;
    }

    const config = resolveNodeRuntimeConfig();
    this.config = config;
    for (const adjustment of config.adjustments) {
      this.logger.warn(
        `节点配置 ${adjustment.key}=${JSON.stringify(adjustment.configuredValue.slice(0, 80))} 已归一化为 ${JSON.stringify(adjustment.normalizedValue)}：${adjustment.reason}`,
      );
    }
    await this.nodeRegistryService.registerNode({
      address: config.address,
      port: config.port,
      capacityWeight: config.capacityWeight,
    });

    this.timer = setInterval(() => {
      void this.runHeartbeatCycle();
    }, config.heartbeatIntervalMs);
    this.timer.unref();
    this.logger.log(`节点注册运行时已启动，心跳间隔 ${config.heartbeatIntervalMs}ms`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.nodeRegistryService.deregisterNode().catch((error) => {
      this.logger.error(
        '节点注销失败',
        error instanceof Error ? error.stack : String(error),
      );
    });
    this.config = null;
  }

  private async runHeartbeatCycle(): Promise<void> {
    if (this.running || !this.nodeRegistryService.isEnabled()) {
      return;
    }

    this.running = true;
    try {
      await this.nodeRegistryService.heartbeatNode();
      const config = this.config ?? resolveNodeRuntimeConfig();
      const stale = await this.nodeRegistryService.scanStaleNodes({
        suspectAfterMs: config.suspectAfterMs,
        deadAfterMs: config.deadAfterMs,
      });
      if (stale.suspectNodeIds.length > 0 || stale.deadNodeIds.length > 0) {
        this.logger.warn(
          `节点状态推进：suspect=${stale.suspectNodeIds.join(',') || '-'} dead=${stale.deadNodeIds.join(',') || '-'}`,
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        '节点心跳周期执行失败',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
