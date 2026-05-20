import { Inject, Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { readTrimmedEnv } from '../config/env-alias';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { DatabasePoolProvider } from './database-pool.provider';
import { FlushLedgerService } from './flush-ledger.service';
import { FlushWakeupService } from './flush-wakeup.service';
import { isInlineFlushTaskRuntimeMode } from './flush-task-runtime-mode';
import type { FlushTask } from './flush-task.types';
import { PlayerPersistenceFlushService } from './player-persistence-flush.service';

const INTERVAL_MS = readInt('SERVER_FLUSH_TASK_RUNTIME_INTERVAL_MS', 'FLUSH_TASK_RUNTIME_INTERVAL_MS', 1_500, 250, 60_000);
const CLAIM_LIMIT = readInt('SERVER_FLUSH_TASK_RUNTIME_CLAIM_LIMIT', 'FLUSH_TASK_RUNTIME_CLAIM_LIMIT', 64, 1, 256);
const RETRY_DELAY_MS = readInt('SERVER_FLUSH_TASK_RUNTIME_RETRY_DELAY_MS', 'FLUSH_TASK_RUNTIME_RETRY_DELAY_MS', 5_000, 250, 300_000);
const COALESCE_MS = readInt('SERVER_MAP_PERSISTENCE_COALESCE_WINDOW_MS', 'MAP_PERSISTENCE_COALESCE_WINDOW_MS', 3_000, 0, 30_000);
const TIME_CHECKPOINT_MS = readInt('SERVER_MAP_TIME_CHECKPOINT_INTERVAL_MS', 'MAP_TIME_CHECKPOINT_INTERVAL_MS', 300_000, 60_000, 3_600_000);
const MONSTER_RUNTIME_MS = readInt('SERVER_MAP_MONSTER_RUNTIME_FLUSH_INTERVAL_MS', 'MAP_MONSTER_RUNTIME_FLUSH_INTERVAL_MS', 60_000, 10_000, 600_000);
const FLUSH_WAITING_LIMIT = readInt('SERVER_FLUSH_TASK_RUNTIME_POOL_WAITING_THRESHOLD', 'FLUSH_TASK_RUNTIME_POOL_WAITING_THRESHOLD', 2, 0, 100);
const INSTANCE_COALESCE_DOMAINS = new Set(['tile_damage', 'tile_resource', 'fengshui']);

interface PlayerRuntimeFlushTaskPort {
  listDirtyPlayerDomains?(): Map<string, Set<string>>;
  listDirtyPlayers?(): string[];
  getPersistenceRevision?(playerId: string): number | null;
}

interface InstanceRuntimeView {
  meta?: { persistent?: boolean | null; ownershipEpoch?: number | null } | null;
  getPersistenceRevision?: () => number | null;
}

interface BatchPersistencePort {
  saveTileDamageDeltaBatch?(deltas: Array<{ instanceId: string; upserts: unknown[]; deletes: unknown[] }>): Promise<void>;
  saveTileResourceDeltaBatch?(deltas: Array<{ instanceId: string; upserts: unknown[]; deletes: unknown[] }>): Promise<void>;
  saveInstanceRecoveryWatermarkBatch?(rows: Array<{ instanceId: string; payload: unknown }>): Promise<void>;
}

interface WorldRuntimeFlushTaskPort {
  instanceDomainPersistenceService?: BatchPersistencePort | null;
  listDirtyPersistentInstanceDomains?(): Array<{ instanceId: string; domains: string[] }>;
  listDirtyPersistentInstances?(): string[];
  getInstanceRuntime?(instanceId: string): InstanceRuntimeView | null;
  flushInstanceDomains?(instanceId: string, domains?: string[] | null): Promise<{ skipped?: boolean } | null>;
  buildDomainDeltaBatch?(domain: string, instanceIds: string[]): Array<{ instanceId: string; upserts?: unknown[]; deletes?: unknown[]; watermarkPayload?: unknown }>;
  markDomainBatchPersisted?(domain: string, instanceIds: string[]): void;
}

@Injectable()
export class FlushTaskRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FlushTaskRuntimeService.name);
  private readonly workerId = `flush-task-runtime:${process.pid}:${randomUUID()}`;
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<number> | null = null;

  constructor(
    @Inject(PlayerRuntimeService) private readonly playerRuntimeService: PlayerRuntimeFlushTaskPort,
    @Inject(WorldRuntimeService) private readonly worldRuntimeService: WorldRuntimeFlushTaskPort,
    private readonly playerPersistenceFlushService: PlayerPersistenceFlushService,
    private readonly flushLedgerService: FlushLedgerService,
    private readonly flushWakeupService: FlushWakeupService,
    @Optional() @Inject(DatabasePoolProvider) private readonly databasePoolProvider?: DatabasePoolProvider,
  ) {}

  onModuleInit(): void {
    if (!isInlineFlushTaskRuntimeMode()) {
      this.logger.log('统一 flush task runtime 未启用，保留当前配置模式');
      return;
    }
    this.timer = setInterval(() => void this.runOnce(), INTERVAL_MS);
    this.timer.unref();
    this.logger.log(`统一 flush task runtime 已启动，间隔 ${INTERVAL_MS}ms`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce(workerId = this.workerId, filter?: { playerDomain?: string; instanceDomain?: string }): Promise<number> {
    if (!isInlineFlushTaskRuntimeMode() || !this.flushLedgerService.isEnabled()) {
      return 0;
    }
    if (this.running) {
      return this.running;
    }
    this.running = this.runCycle(workerId, filter).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runCycle(workerId: string, filter?: { playerDomain?: string; instanceDomain?: string }): Promise<number> {
    await this.collectPlayerTasks();
    await this.collectInstanceTasks();
    if (this.isFlushPoolBackpressureActive()) {
      this.logger.warn(`统一 flush task 因 flush pool 等待排队而暂停认领：waiting>=${FLUSH_WAITING_LIMIT}`);
      return 0;
    }
    const playerTasks = await this.flushLedgerService.claimReadyFlushTasks({ workerId, scope: 'player', domain: filter?.playerDomain, limit: CLAIM_LIMIT });
    const instanceTasks = await this.flushLedgerService.claimReadyFlushTasks({ workerId, scope: 'instance', domain: filter?.instanceDomain, limit: CLAIM_LIMIT });
    return (await this.processPlayerTasks(playerTasks)) + (await this.processInstanceTasks(instanceTasks));
  }

  private async collectPlayerTasks(): Promise<void> {
    const dirty = this.playerRuntimeService.listDirtyPlayerDomains?.() ?? new Map();
    const entries = dirty.size > 0
      ? Array.from(dirty.entries())
      : (this.playerRuntimeService.listDirtyPlayers?.() ?? []).map((id) => [id, new Set(['snapshot'])] as [string, Set<string>]);
    for (const [playerId, domains] of entries) {
      const normalized = normalizeDomains(domains);
      const taskDomains = resolvePlayerTaskDomains(normalized);
      for (const domain of taskDomains) {
        await this.flushLedgerService.upsertFlushTask({
          scope: 'player', id: playerId, domain,
          priority: domain === 'presence' || domain === 'position_checkpoint' ? 'high' : 'normal',
          latestRevision: resolveRevision(this.playerRuntimeService.getPersistenceRevision?.(playerId)),
          nextAttemptAt: new Date().toISOString(),
        });
      }
      if (taskDomains.length > 0) this.flushWakeupService.signalPlayerFlush(playerId);
    }
  }

  private async collectInstanceTasks(): Promise<void> {
    const entries = this.worldRuntimeService.listDirtyPersistentInstanceDomains?.()
      ?? (this.worldRuntimeService.listDirtyPersistentInstances?.() ?? []).map((instanceId) => ({ instanceId, domains: ['domain'] }));
    const now = Date.now();
    for (const entry of entries) {
      const instanceId = normalizeString(entry.instanceId);
      const runtime = instanceId ? this.worldRuntimeService.getInstanceRuntime?.(instanceId) : null;
      if (!instanceId || !runtime?.meta?.persistent) continue;
      const ownershipEpoch = normalizeInt(runtime.meta.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER);
      for (const domain of normalizeDomains(entry.domains)) {
        await this.flushLedgerService.upsertFlushTask({
          scope: 'instance', id: instanceId, domain,
          priority: INSTANCE_COALESCE_DOMAINS.has(domain) || domain === 'monster_runtime' ? 'low' : 'normal',
          ownershipEpoch,
          latestRevision: resolveRevision(runtime.getPersistenceRevision?.()),
          nextAttemptAt: new Date(now + resolveInstanceDelayMs(domain)).toISOString(),
        });
      }
      this.flushWakeupService.signalInstanceFlush(instanceId);
    }
  }

  private async processPlayerTasks(tasks: FlushTask[]): Promise<number> {
    let processed = 0;
    for (const group of groupTasksById(tasks).values()) {
      try {
        await this.playerPersistenceFlushService.flushPlayer(group[0].id);
        await Promise.all(group.map((task) => this.flushLedgerService.markFlushTaskFlushed(task)));
        processed += 1;
      } catch (error) {
        this.logger.warn(`玩家 flush task 失败 playerId=${group[0].id}: ${formatError(error)}`);
        await Promise.all(group.map((task) => this.flushLedgerService.markFlushTaskRetry(task, RETRY_DELAY_MS)));
      }
    }
    return processed;
  }

  private async processInstanceTasks(tasks: FlushTask[]): Promise<number> {
    const remaining = new Map(tasks.map((task) => [instanceTaskKey(task), task]));
    let processed = await this.processBatchableInstanceTasks(tasks, remaining);
    for (const task of remaining.values()) {
      const runtime = this.worldRuntimeService.getInstanceRuntime?.(task.id);
      const epoch = normalizeInt(runtime?.meta?.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER);
      if (!runtime?.meta?.persistent || epoch !== normalizeInt(task.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER)) {
        await this.flushLedgerService.markFlushTaskFlushed(task);
        continue;
      }
      try {
        await this.worldRuntimeService.flushInstanceDomains?.(task.id, [task.domain]);
        await this.flushLedgerService.markFlushTaskFlushed(task);
        processed += 1;
      } catch (error) {
        this.logger.warn(`实例 flush task 失败 instanceId=${task.id} domain=${task.domain}: ${formatError(error)}`);
        await this.flushLedgerService.markFlushTaskRetry(task, RETRY_DELAY_MS);
      }
    }
    return processed;
  }

  private async processBatchableInstanceTasks(tasks: FlushTask[], remaining: Map<string, FlushTask>): Promise<number> {
    const persistence = this.worldRuntimeService.instanceDomainPersistenceService;
    const hasBatchApi = persistence
      && typeof this.worldRuntimeService.buildDomainDeltaBatch === 'function'
      && typeof this.worldRuntimeService.markDomainBatchPersisted === 'function'
      && typeof persistence.saveTileDamageDeltaBatch === 'function'
      && typeof persistence.saveTileResourceDeltaBatch === 'function'
      && typeof persistence.saveInstanceRecoveryWatermarkBatch === 'function';
    if (!hasBatchApi) return 0;
    let processed = 0;
    for (const domain of ['tile_damage', 'tile_resource']) {
      const domainTasks = tasks.filter((task) => task.domain === domain);
      if (domainTasks.length === 0) continue;
      try {
        const deltas = this.worldRuntimeService.buildDomainDeltaBatch?.(domain, domainTasks.map((task) => task.id)) ?? [];
        if (deltas.length === 0) continue;
        if (domain === 'tile_damage') {
          await persistence.saveTileDamageDeltaBatch?.(deltas.map((delta) => ({ instanceId: delta.instanceId, upserts: delta.upserts ?? [], deletes: delta.deletes ?? [] })));
        } else {
          await persistence.saveTileResourceDeltaBatch?.(deltas.map((delta) => ({ instanceId: delta.instanceId, upserts: delta.upserts ?? [], deletes: delta.deletes ?? [] })));
        }
        const watermarks = deltas.filter((delta) => delta.watermarkPayload).map((delta) => ({ instanceId: delta.instanceId, payload: delta.watermarkPayload }));
        if (watermarks.length > 0) await persistence.saveInstanceRecoveryWatermarkBatch?.(watermarks);
        const persistedIds = deltas.map((delta) => delta.instanceId);
        this.worldRuntimeService.markDomainBatchPersisted?.(domain, persistedIds);
        for (const task of domainTasks.filter((task) => persistedIds.includes(task.id))) {
          await this.flushLedgerService.markFlushTaskFlushed(task);
          remaining.delete(instanceTaskKey(task));
          processed += 1;
        }
      } catch (error) {
        this.logger.warn(`实例批量 flush task 失败 domain=${domain}: ${formatError(error)}`);
        await Promise.all(domainTasks.map((task) => this.flushLedgerService.markFlushTaskRetry(task, RETRY_DELAY_MS)));
        for (const task of domainTasks) remaining.delete(instanceTaskKey(task));
      }
    }
    return processed;
  }

  private isFlushPoolBackpressureActive(): boolean {
    const stats = this.databasePoolProvider?.getPoolStats('flush');
    return Boolean(stats && stats.waitingCount >= FLUSH_WAITING_LIMIT);
  }
}

function resolvePlayerTaskDomains(domains: Set<string>): string[] {
  return Array.from(domains).sort();
}

function resolveInstanceDelayMs(domain: string): number {
  if (INSTANCE_COALESCE_DOMAINS.has(domain)) return COALESCE_MS;
  if (domain === 'time') return TIME_CHECKPOINT_MS;
  if (domain === 'monster_runtime') return MONSTER_RUNTIME_MS;
  return 0;
}

function instanceTaskKey(task: FlushTask): string {
  return `${task.id}\u0000${task.domain}\u0000${task.ownershipEpoch ?? 0}`;
}

function groupTasksById(tasks: FlushTask[]): Map<string, FlushTask[]> {
  const grouped = new Map<string, FlushTask[]>();
  for (const task of tasks) grouped.set(task.id, [...(grouped.get(task.id) ?? []), task]);
  return grouped;
}

function normalizeDomains(domains: Iterable<string> | null | undefined): Set<string> {
  const normalized = new Set<string>();
  for (const domain of domains ?? []) if (typeof domain === 'string' && domain.trim()) normalized.add(domain.trim());
  return normalized;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveRevision(value: unknown): number {
  return normalizeInt(value, Date.now(), 0, Number.MAX_SAFE_INTEGER);
}

function normalizeInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.trunc(parsed);
  return normalized < min || normalized > max ? fallback : normalized;
}

function readInt(primary: string, fallbackKey: string, fallback: number, min: number, max: number): number {
  return normalizeInt(readTrimmedEnv(primary, fallbackKey), fallback, min, max);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack || error.message : String(error);
}
