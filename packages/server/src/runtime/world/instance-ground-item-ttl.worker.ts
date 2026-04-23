import { Inject, Injectable, Logger } from '@nestjs/common';

import { InstanceDomainPersistenceService } from '../../persistence/instance-domain-persistence.service';
import { WorldRuntimeService } from './world-runtime.service';

const INSTANCE_GROUND_ITEM_TTL_IDLE_MS = 3_000;

interface InstanceGroundItemTtlWorldRuntimePort {
  listInstanceRuntimes(): Array<{
    meta?: {
      instanceId?: string | null;
      persistent?: boolean | null;
    } | null;
  }>;
}

interface InstanceGroundItemPersistencePort {
  loadGroundItems(instanceId: string): Promise<Array<{
    groundItemId: string;
    instanceId: string;
    tileIndex: number;
    itemPayload: unknown;
    expireAt: string | null;
  }>>;
  removeGroundItem(groundItemId: string): Promise<boolean>;
}

@Injectable()
export class InstanceGroundItemTtlCleanupWorker {
  private readonly logger = new Logger(InstanceGroundItemTtlCleanupWorker.name);

  constructor(
    @Inject(WorldRuntimeService)
    private readonly worldRuntimeService: InstanceGroundItemTtlWorldRuntimePort,
    @Inject(InstanceDomainPersistenceService)
    private readonly instanceDomainPersistenceService: InstanceGroundItemPersistencePort,
  ) {}

  async runOnce(): Promise<number> {
    let processed = 0;
    const now = Date.now();
    for (const runtime of this.worldRuntimeService.listInstanceRuntimes()) {
      const instanceId = typeof runtime?.meta?.instanceId === 'string' ? runtime.meta.instanceId.trim() : '';
      if (!instanceId || runtime?.meta?.persistent !== true) {
        continue;
      }
      const rows = await this.instanceDomainPersistenceService.loadGroundItems(instanceId);
      for (const row of rows) {
        const expireAt = row.expireAt ? new Date(row.expireAt).getTime() : null;
        if (expireAt == null || expireAt > now) {
          continue;
        }
        const removed = await this.instanceDomainPersistenceService.removeGroundItem(row.groundItemId);
        if (removed) {
          processed += 1;
        }
      }
    }
    return processed;
  }

  async runLoop(idleMs = INSTANCE_GROUND_ITEM_TTL_IDLE_MS): Promise<void> {
    while (true) {
      const processed = await this.runOnce();
      if (processed <= 0) {
        await sleep(resolveIdleMs(idleMs));
      }
    }
  }
}

function resolveIdleMs(value: number): number {
  if (!Number.isFinite(value)) {
    return INSTANCE_GROUND_ITEM_TTL_IDLE_MS;
  }
  return Math.max(250, Math.trunc(value));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
