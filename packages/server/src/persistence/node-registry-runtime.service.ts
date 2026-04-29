import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { NodeRegistryService } from './node-registry.service';

const DEFAULT_NODE_REGISTRY_HEARTBEAT_INTERVAL_MS = 15_000;
const DEFAULT_NODE_REGISTRY_SUSPECT_AFTER_MS = 30_000;
const DEFAULT_NODE_REGISTRY_DEAD_AFTER_MS = 90_000;
const DEFAULT_SERVER_PORT = 13001;

@Injectable()
export class NodeRegistryRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NodeRegistryRuntimeService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly nodeRegistryService: NodeRegistryService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.nodeRegistryService.isEnabled()) {
      return;
    }

    await this.nodeRegistryService.registerNode({
      address: resolveNodeAddress(),
      port: resolveNodePort(),
      capacityWeight: resolveNodeCapacityWeight(),
    });

    const intervalMs = resolveHeartbeatIntervalMs();
    this.timer = setInterval(() => {
      void this.runHeartbeatCycle();
    }, intervalMs);
    this.timer.unref();
    this.logger.log(`节点注册运行时已启动，心跳间隔 ${intervalMs}ms`);
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
  }

  private async runHeartbeatCycle(): Promise<void> {
    if (this.running || !this.nodeRegistryService.isEnabled()) {
      return;
    }

    this.running = true;
    try {
      await this.nodeRegistryService.heartbeatNode();
      const stale = await this.nodeRegistryService.scanStaleNodes({
        suspectAfterMs: resolveSuspectAfterMs(),
        deadAfterMs: resolveDeadAfterMs(),
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

function resolveNodeAddress(): string {
  const explicitPublicHost = readTrimmedEnv('SERVER_PUBLIC_HOST', 'SERVER_HOST');
  return explicitPublicHost || '127.0.0.1';
}

function resolveNodePort(): number {
  const parsed = Number(readTrimmedEnv('SERVER_PUBLIC_PORT', 'SERVER_PORT'));
  return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : DEFAULT_SERVER_PORT;
}

function resolveNodeCapacityWeight(): number {
  const parsed = Number(readTrimmedEnv('SERVER_NODE_CAPACITY_WEIGHT'));
  return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 1;
}

function resolveHeartbeatIntervalMs(): number {
  const parsed = Number(readTrimmedEnv('SERVER_NODE_HEARTBEAT_INTERVAL_MS'));
  return Number.isFinite(parsed)
    ? Math.max(1_000, Math.trunc(parsed))
    : DEFAULT_NODE_REGISTRY_HEARTBEAT_INTERVAL_MS;
}

function resolveSuspectAfterMs(): number {
  const parsed = Number(readTrimmedEnv('SERVER_NODE_SUSPECT_AFTER_MS'));
  return Number.isFinite(parsed)
    ? Math.max(1_000, Math.trunc(parsed))
    : DEFAULT_NODE_REGISTRY_SUSPECT_AFTER_MS;
}

function resolveDeadAfterMs(): number {
  const parsed = Number(readTrimmedEnv('SERVER_NODE_DEAD_AFTER_MS'));
  return Number.isFinite(parsed)
    ? Math.max(resolveSuspectAfterMs(), Math.trunc(parsed))
    : DEFAULT_NODE_REGISTRY_DEAD_AFTER_MS;
}

function readTrimmedEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value !== 'string') {
      continue;
    }
    const normalized = value.trim();
    if (normalized) {
      return normalized;
    }
  }
  return '';
}
