/**
 * 本文件实现后台 worker 或对应冷路径入口，负责把运行态变更异步落库、清理或压缩。
 *
 * 维护时要关注批量大小、重试幂等和中断恢复，不能让后台任务破坏服务端权威状态。
 */
import { Inject, Injectable, Logger } from '@nestjs/common';

import { InstanceCatalogService } from '../../../persistence/instance-catalog.service';
import { InstanceDomainPersistenceService } from '../../../persistence/instance-domain-persistence.service';
import { TreasureVaultRuntimeService } from '../../building/treasure-vault-runtime.service';

const INSTANCE_STATE_PURGE_IDLE_MS = 5_000;
const INSTANCE_STATE_PURGE_CATALOG_BATCH_SIZE = 16;
const INSTANCE_STATE_PURGE_ORPHAN_VAULT_BATCH_SIZE = 16;
const INSTANCE_STATE_PURGE_RUN_BUDGET_MS = 20_000;

interface InstanceStatePurgeCatalogPort {
  listPurgeableInstanceCatalogEntries(input?: {
    afterInstanceId?: string | null;
    limit?: number;
  }): Promise<Array<{
    instance_id?: unknown;
    status?: unknown;
    runtime_status?: unknown;
  }>>;
}

interface InstanceStatePurgeRuntimePort {
  getInstanceRuntime(instanceId: string): { meta?: { status?: string | null; runtimeStatus?: string | null } | null } | null;
}

interface InstanceStatePurgePersistencePort {
  purgeInstanceState(instanceId: string): Promise<number>;
}

interface InstanceStatePurgeTreasureVaultPort {
  recoverVaultItemsForInstance?(input: { instanceId?: string; reason?: string; limit?: number }): Promise<{ ok: boolean; recoveredVaults: number; recoveredItems: number; blockedVaults: number; reason?: string }>;
  recoverOrphanedVaultItems?(input?: { reason?: string; limit?: number }): Promise<{ ok: boolean; recoveredVaults: number; recoveredItems: number; blockedVaults: number; reason?: string }>;
}

@Injectable()
export class InstanceStatePurgeWorker {
  private readonly logger = new Logger(InstanceStatePurgeWorker.name);
  private catalogCursor: string | null = null;

  constructor(
    @Inject(InstanceCatalogService)
    private readonly instanceCatalogService: InstanceStatePurgeCatalogPort,
    @Inject(InstanceDomainPersistenceService)
    private readonly instanceDomainPersistenceService: InstanceStatePurgePersistencePort,
    @Inject('WORLD_RUNTIME_SERVICE')
    private readonly worldRuntimeService: InstanceStatePurgeRuntimePort,
    @Inject(TreasureVaultRuntimeService)
    private readonly treasureVaultRuntimeService: InstanceStatePurgeTreasureVaultPort,
  ) {}

  async runOnce(): Promise<number> {
    const startedAt = performance.now();
    const orphanedRecovery = await this.treasureVaultRuntimeService.recoverOrphanedVaultItems?.({
      reason: 'instance_state_purge_orphan_scan',
      limit: INSTANCE_STATE_PURGE_ORPHAN_VAULT_BATCH_SIZE,
    });
    let processed = orphanedRecovery?.recoveredVaults ?? 0;
    if ((orphanedRecovery?.blockedVaults ?? 0) > 0) {
      this.logger.warn(`宝库孤儿库存回收存在阻塞：blocked=${orphanedRecovery?.blockedVaults} reason=${orphanedRecovery?.reason ?? 'unknown'}`);
    }
    if (performance.now() - startedAt >= INSTANCE_STATE_PURGE_RUN_BUDGET_MS) {
      return processed;
    }
    const catalogEntries = await this.instanceCatalogService.listPurgeableInstanceCatalogEntries({
      afterInstanceId: this.catalogCursor,
      limit: INSTANCE_STATE_PURGE_CATALOG_BATCH_SIZE,
    });
    if (catalogEntries.length === 0) {
      this.catalogCursor = null;
      return processed;
    }
    if (performance.now() - startedAt >= INSTANCE_STATE_PURGE_RUN_BUDGET_MS) {
      return processed;
    }
    let consumedAllCatalogEntries = true;
    for (const entry of catalogEntries) {
      const instanceId = typeof entry?.instance_id === 'string' ? entry.instance_id.trim() : '';
      if (!instanceId) {
        continue;
      }
      const status = typeof entry?.status === 'string' ? entry.status.trim() : '';
      const runtimeStatus = typeof entry?.runtime_status === 'string' ? entry.runtime_status.trim() : '';
      if (status !== 'destroyed' && runtimeStatus !== 'stopped') {
        this.catalogCursor = instanceId;
        continue;
      }
      const runtime = this.worldRuntimeService.getInstanceRuntime(instanceId);
      if (runtime?.meta?.status !== 'destroyed' && runtime?.meta?.runtimeStatus !== 'stopped' && runtime != null) {
        this.catalogCursor = instanceId;
        continue;
      }
      const recovery = await this.treasureVaultRuntimeService.recoverVaultItemsForInstance?.({ instanceId, reason: 'instance_state_purge', limit: 500 });
      if (performance.now() - startedAt >= INSTANCE_STATE_PURGE_RUN_BUDGET_MS) {
        consumedAllCatalogEntries = false;
        break;
      }
      if (recovery && recovery.ok !== true) {
        this.logger.warn(`实例 ${instanceId} 清理前宝库库存回收未完成，跳过实例状态清理：blocked=${recovery.blockedVaults} reason=${recovery.reason ?? 'unknown'}`);
        this.catalogCursor = instanceId;
        continue;
      }
      processed += recovery?.recoveredVaults ?? 0;
      const removed = await this.instanceDomainPersistenceService.purgeInstanceState(instanceId);
      this.catalogCursor = instanceId;
      if (removed > 0) {
        processed += 1;
      }
      if (performance.now() - startedAt >= INSTANCE_STATE_PURGE_RUN_BUDGET_MS) {
        consumedAllCatalogEntries = false;
        break;
      }
    }
    if (consumedAllCatalogEntries && catalogEntries.length < INSTANCE_STATE_PURGE_CATALOG_BATCH_SIZE) {
      this.catalogCursor = null;
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
