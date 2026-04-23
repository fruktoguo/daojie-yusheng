import { Inject, Injectable, Logger } from '@nestjs/common';

import { InstanceCatalogService } from '../../persistence/instance-catalog.service';
import { InstanceDomainPersistenceService } from '../../persistence/instance-domain-persistence.service';

const INSTANCE_STATE_PURGE_IDLE_MS = 5_000;

interface InstanceStatePurgeCatalogPort {
  listInstanceCatalogEntries(): Promise<Array<Record<string, unknown>>>;
}

interface InstanceStatePurgeRuntimePort {
  getInstanceRuntime(instanceId: string): { meta?: { status?: string | null; runtimeStatus?: string | null } | null } | null;
}

interface InstanceStatePurgePersistencePort {
  purgeInstanceState(instanceId: string): Promise<number>;
}

@Injectable()
export class InstanceStatePurgeWorker {
  private readonly logger = new Logger(InstanceStatePurgeWorker.name);

  constructor(
    @Inject(InstanceCatalogService)
    private readonly instanceCatalogService: InstanceStatePurgeCatalogPort,
    @Inject(InstanceDomainPersistenceService)
    private readonly instanceDomainPersistenceService: InstanceStatePurgePersistencePort,
    @Inject('WORLD_RUNTIME_SERVICE')
    private readonly worldRuntimeService: InstanceStatePurgeRuntimePort,
  ) {}

  async runOnce(): Promise<number> {
    const catalogEntries = await this.instanceCatalogService.listInstanceCatalogEntries();
    let processed = 0;
    for (const entry of catalogEntries) {
      const instanceId = typeof entry?.instance_id === 'string' ? entry.instance_id.trim() : '';
      if (!instanceId) {
        continue;
      }
      const status = typeof entry?.status === 'string' ? entry.status.trim() : '';
      const runtimeStatus = typeof entry?.runtime_status === 'string' ? entry.runtime_status.trim() : '';
      if (status !== 'destroyed' && runtimeStatus !== 'stopped') {
        continue;
      }
      const runtime = this.worldRuntimeService.getInstanceRuntime(instanceId);
      if (runtime?.meta?.status !== 'destroyed' && runtime?.meta?.runtimeStatus !== 'stopped' && runtime != null) {
        continue;
      }
      const removed = await this.instanceDomainPersistenceService.purgeInstanceState(instanceId);
      if (removed > 0) {
        processed += 1;
      }
    }
    return processed;
  }

  async runLoop(idleMs = INSTANCE_STATE_PURGE_IDLE_MS): Promise<void> {
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
    return INSTANCE_STATE_PURGE_IDLE_MS;
  }
  return Math.max(250, Math.trunc(value));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
