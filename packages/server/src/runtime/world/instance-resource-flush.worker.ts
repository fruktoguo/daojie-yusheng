import { Inject, Injectable, Logger } from '@nestjs/common';

import { FlushLedgerService } from '../../persistence/flush-ledger.service';
import { FlushWakeupService } from '../../persistence/flush-wakeup.service';
import { WorldRuntimeService } from './world-runtime.service';

const INSTANCE_FLUSH_WORKER_DOMAIN = 'tile_resource';
const INSTANCE_FLUSH_WORKER_IDLE_MS = 2_000;
const INSTANCE_FLUSH_WORKER_CLAIM_LIMIT = 32;

interface InstanceResourceFlushRuntimePort {
  listDirtyPersistentInstances(): string[];
  listDirtyPersistentInstanceDomains?(): Array<{ instanceId: string; domains: string[] }>;
  flushInstanceDomains?(instanceId: string, domains?: string[] | null): Promise<{ skipped?: boolean } | null>;
  getInstanceRuntime(instanceId: string): InstanceResourceRuntimeView | null;
}

interface InstanceResourceRuntimeView {
  meta?: {
    ownershipEpoch?: number | null;
    persistent?: boolean | null;
  } | null;
  getPersistenceRevision?: () => number | null;
}

@Injectable()
export class InstanceResourceFlushWorker {
  private readonly logger = new Logger(InstanceResourceFlushWorker.name);

  constructor(
    @Inject(WorldRuntimeService)
    private readonly worldRuntimeService: InstanceResourceFlushRuntimePort,
    private readonly flushLedgerService: FlushLedgerService,
    private readonly flushWakeupService: FlushWakeupService,
  ) {}

  async runOnce(workerId: string): Promise<number> {
    const dirtyInstanceIds = this.resolveDirtyInstances();
    if (dirtyInstanceIds.length > 0) {
    for (const instanceId of dirtyInstanceIds) {
        const runtime = this.worldRuntimeService.getInstanceRuntime(instanceId);
        if (!runtime?.meta?.persistent) {
          continue;
        }
        await this.flushLedgerService.upsertInstanceFlushLedger({
          instanceId,
          domain: INSTANCE_FLUSH_WORKER_DOMAIN,
          ownershipEpoch: Number.isFinite(Number(runtime.meta.ownershipEpoch))
            ? Math.trunc(Number(runtime.meta.ownershipEpoch))
            : 0,
          latestVersion: this.resolveLatestVersion(instanceId),
        });
        this.flushWakeupService.signalInstanceFlush(instanceId);
      }
    }

    const claimed = await this.flushLedgerService.claimInstanceFlushLedger({
      workerId,
      domain: INSTANCE_FLUSH_WORKER_DOMAIN,
      limit: INSTANCE_FLUSH_WORKER_CLAIM_LIMIT,
    });
    let processed = 0;
    for (const entry of claimed) {
      const instanceId = normalizeRequiredString(entry.instance_id);
      const ownershipEpoch = normalizePositiveInteger(entry.ownership_epoch, 0, 0, Number.MAX_SAFE_INTEGER);
      if (!instanceId) {
        continue;
      }
      const runtime = this.worldRuntimeService.getInstanceRuntime(instanceId);
      if (!runtime?.meta?.persistent || normalizePositiveInteger(runtime.meta.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER) !== ownershipEpoch) {
        await this.flushLedgerService.markInstanceFlushLedgerFlushed({
          instanceId,
          domain: INSTANCE_FLUSH_WORKER_DOMAIN,
          ownershipEpoch,
          flushedVersion: Number(entry.latest_version ?? 0),
        });
        continue;
      }
      try {
        const result = await this.worldRuntimeService.flushInstanceDomains?.(instanceId, [INSTANCE_FLUSH_WORKER_DOMAIN]);
        if (result?.skipped === true) {
          await this.flushLedgerService.markInstanceFlushLedgerFlushed({
            instanceId,
            domain: INSTANCE_FLUSH_WORKER_DOMAIN,
            ownershipEpoch,
            flushedVersion: Number(entry.latest_version ?? 0),
          });
          continue;
        }
        await this.flushLedgerService.markInstanceFlushLedgerFlushed({
          instanceId,
          domain: INSTANCE_FLUSH_WORKER_DOMAIN,
          ownershipEpoch,
          flushedVersion: Number(entry.latest_version ?? 0),
        });
        processed += 1;
      } catch (error: unknown) {
        this.logger.warn(
          `实例资源 worker 刷盘失败 instanceId=${instanceId} domain=${INSTANCE_FLUSH_WORKER_DOMAIN}: ${
            error instanceof Error ? error.stack || error.message : String(error)
          }`,
        );
      }
    }
    return processed;
  }

  async runLoop(workerId: string, idleMs = INSTANCE_FLUSH_WORKER_IDLE_MS): Promise<void> {
    while (true) {
      const processed = await this.runOnce(workerId);
      if (processed <= 0) {
        await sleep(resolveIdleMs(idleMs));
      }
    }
  }

  private resolveDirtyInstances(): string[] {
    const domainEntries = this.worldRuntimeService.listDirtyPersistentInstanceDomains?.();
    if (Array.isArray(domainEntries)) {
      return domainEntries
        .filter((entry) => Array.isArray(entry?.domains) && entry.domains.includes(INSTANCE_FLUSH_WORKER_DOMAIN))
        .map((entry) => entry.instanceId);
    }
    return this.worldRuntimeService.listDirtyPersistentInstances?.() ?? [];
  }

  private resolveLatestVersion(instanceId: string): number {
    const runtime = this.worldRuntimeService.getInstanceRuntime(instanceId);
    const revision = runtime?.getPersistenceRevision?.();
    if (Number.isFinite(Number(revision))) {
      return Math.max(0, Math.trunc(Number(revision)));
    }
    return Date.now();
  }
}

function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePositiveInteger(value: unknown, defaultValue: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }
  const normalized = Math.trunc(parsed);
  if (normalized < min) {
    return min;
  }
  if (normalized > max) {
    return max;
  }
  return normalized;
}

function resolveIdleMs(value: number): number {
  if (!Number.isFinite(value)) {
    return INSTANCE_FLUSH_WORKER_IDLE_MS;
  }
  return Math.max(250, Math.trunc(value));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
