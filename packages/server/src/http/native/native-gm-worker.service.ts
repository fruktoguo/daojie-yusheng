import { Inject, Injectable, Optional } from '@nestjs/common';
import type { GmWorkerAlert, GmWorkerRow, GmWorkerRuntimeRow, GmWorkerStateRes, GmWorkerStatus } from '@mud/shared';

import { resolveServerRuntimeRole } from '../../config/runtime-role';
import { FlushLedgerService } from '../../persistence/flush-ledger.service';
import { FlushDiagnosticsService } from '../../persistence/flush-diagnostics.service';
import { OutboxDispatcherService } from '../../persistence/outbox-dispatcher.service';
import { PlayerFlushLedgerService } from '../../persistence/player-flush-ledger.service';
import { BackgroundWorkerRuntimeService } from '../../runtime/worker/background-worker-runtime.service';
import { SchedulerManagerService } from '../../scheduler/scheduler-manager.service';
import { NativeGmAdminService } from './native-gm-admin.service';

const WORKER_WINDOW_SECONDS = 60;
const BACKLOG_WARN_THRESHOLD = 100;
const PLAYER_WORKER_DOMAINS = [
  { domain: 'position_checkpoint', label: '玩家锚点/位置刷盘' },
  { domain: 'snapshot', label: '玩家状态快照刷盘' },
  { domain: 'snapshot_checkpoint', label: '玩家快照压缩' },
];
const INSTANCE_WORKER_DOMAINS = [
  { domain: 'tile_resource', label: '实例资源刷盘' },
  { domain: 'ground_item', label: '实例地面物品刷盘' },
  { domain: 'container_state', label: '实例容器刷盘' },
  { domain: 'tile_damage', label: '实例地块损坏刷盘' },
  { domain: 'overlay', label: '实例 overlay 刷盘' },
  { domain: 'monster_runtime', label: '实例妖兽运行态刷盘' },
];

@Injectable()
export class NativeGmWorkerService {
  constructor(
    @Inject(FlushLedgerService) private readonly flushLedgerService: FlushLedgerService,
    @Inject(FlushDiagnosticsService) private readonly flushDiagnosticsService: FlushDiagnosticsService,
    @Inject(PlayerFlushLedgerService) private readonly playerFlushLedgerService: PlayerFlushLedgerService,
    @Inject(OutboxDispatcherService) private readonly outboxDispatcherService: OutboxDispatcherService,
    @Inject(NativeGmAdminService) private readonly nativeGmAdminService: NativeGmAdminService,
    @Optional() @Inject(BackgroundWorkerRuntimeService)
    private readonly backgroundWorkerRuntimeService: BackgroundWorkerRuntimeService | null = null,
    @Optional() @Inject(SchedulerManagerService)
    private readonly schedulerManagerService: SchedulerManagerService | null = null,
  ) {}

  async getWorkerState(): Promise<GmWorkerStateRes> {
    const [
      playerRows,
      instanceRows,
      playerThroughputRows,
      instanceThroughputRows,
      outboxSummary,
      retryRows,
      databaseState,
      flushDiagnostics,
    ] = await Promise.all([
      this.playerFlushLedgerService.listBacklogSummary(),
      this.flushLedgerService.listInstanceBacklogSummary(),
      this.playerFlushLedgerService.listRecentThroughputSummary({ windowSeconds: WORKER_WINDOW_SECONDS }),
      this.flushLedgerService.listInstanceRecentThroughputSummary({ windowSeconds: WORKER_WINDOW_SECONDS }),
      this.outboxDispatcherService.listRecentThroughputSummary({ windowSeconds: WORKER_WINDOW_SECONDS }),
      this.outboxDispatcherService.listRetryQueue({ limit: 100 }),
      this.nativeGmAdminService.getDatabaseState(),
      Promise.resolve(this.flushDiagnosticsService.getSnapshot()),
    ]);

    const runtimeRole = resolveServerRuntimeRole();
    const localWorkers = this.backgroundWorkerRuntimeService?.listWorkerStates() ?? [];
    const runtimeById = indexRows(localWorkers, (row) => row.id);
    const rows: GmWorkerRow[] = enrichRowsWithRuntimeState([
      ...buildPlayerWorkerRows(playerRows, playerThroughputRows),
      ...buildInstanceWorkerRows(instanceRows, instanceThroughputRows),
      buildOutboxWorkerRow(outboxSummary, retryRows),
      buildFlushLedgerRetentionWorkerRow(),
      buildDatabaseBackupWorkerRow(Boolean(databaseState.automation?.schedulesActive)),
    ], runtimeById, runtimeRole);
    const capacityPgPools = normalizeCapacityPgPools(flushDiagnostics.pgPools);
    const alerts = [
      ...buildWorkerAlerts(rows),
      ...buildCapacityAlerts(capacityPgPools, flushDiagnostics.pgLockWait),
    ];
    return {
      generatedAt: new Date().toISOString(),
      windowSeconds: WORKER_WINDOW_SECONDS,
      rows,
      alerts,
      sources: {
        flushLedgerEnabled: this.flushLedgerService.isEnabled() || this.playerFlushLedgerService.isEnabled(),
        outboxEnabled: this.outboxDispatcherService.isEnabled(),
        backupWorkerHeartbeatActive: Boolean(databaseState.automation?.schedulesActive),
        runtimeRole,
        backgroundWorkerCount: localWorkers.length,
      },
      topology: {
        currentRole: runtimeRole,
        recommendedTopology: '生产目标态：server(api) + server_worker(worker)，all 仅用于本地开发或应急回滚。',
        apiRoleExpected: runtimeRole === 'api' || runtimeRole === 'all',
        workerRoleExpected: runtimeRole === 'worker' || runtimeRole === 'all',
        localWorkers: localWorkers.map(toGmRuntimeRow),
        note: runtimeRole === 'api'
          ? '当前 GM API 来自 api 进程；server_worker 的跨进程心跳需结合 ledger/outbox/backup heartbeat 与部署监控判断。'
          : '当前进程可直接暴露本地 worker orchestrator 状态。',
      },
      capacity: {
        pgPools: capacityPgPools,
        pgLockWait: flushDiagnostics.pgLockWait
          ? {
              waitingCount: flushDiagnostics.pgLockWait.waitingCount,
              checkedAt: flushDiagnostics.pgLockWait.checkedAt,
              error: flushDiagnostics.pgLockWait.error,
            }
          : null,
        player: flushDiagnostics.player
          ? {
              totalMs: flushDiagnostics.player.totalMs,
              dbWriteMs: flushDiagnostics.player.dbWriteMs,
              entityCount: flushDiagnostics.player.dirtyPlayerCount,
              domainCounts: flushDiagnostics.player.domainCounts,
            }
          : null,
        map: flushDiagnostics.map
          ? {
              totalMs: flushDiagnostics.map.totalMs,
              dbWriteMs: flushDiagnostics.map.dbWriteMs,
              entityCount: flushDiagnostics.map.dirtyInstanceCount,
              domainCounts: flushDiagnostics.map.domainCounts,
              coalescedDomainCount: flushDiagnostics.map.coalescedDomainCount,
            }
          : null,
        failures: {
          total: flushDiagnostics.failures.total,
          byCategory: flushDiagnostics.failures.byCategory,
          byDomain: flushDiagnostics.failures.byDomain,
        },
      },
      scheduler: this.schedulerManagerService?.getSnapshot() ?? null,
      note: 'GM worker 面板读取 flush ledger、outbox 与数据库备份 worker 心跳的低频汇总；它不启动、不停止 worker，也不替代进程级监控。',
    };
  }
}

function toGmRuntimeRow(row: GmWorkerRuntimeRow): GmWorkerRuntimeRow {
  return { ...row };
}

function enrichRowsWithRuntimeState(
  rows: GmWorkerRow[],
  runtimeById: Map<string, GmWorkerRuntimeRow>,
  runtimeRole: string,
): GmWorkerRow[] {
  return rows.map((row) => {
    const runtime = runtimeById.get(mapWorkerRowToRuntimeId(row));
    if (!runtime) {
      return { ...row, runtimeRole };
    }
    return {
      ...row,
      enabled: runtime.enabled,
      running: runtime.running,
      lastHeartbeatAt: runtime.lastHeartbeatAt,
      lastSuccessAt: runtime.lastSuccessAt,
      lastFailureAt: runtime.lastFailureAt,
      processedCount: runtime.processedCount,
      runtimeRole,
    };
  });
}

function mapWorkerRowToRuntimeId(row: GmWorkerRow): string {
  if (row.kind === 'outbox') return 'outbox-dispatcher';
  if (row.kind === 'database_backup') return 'database-backup';
  if (row.kind === 'cleanup') return row.id;
  return 'flush-task-consumer';
}

function buildPlayerWorkerRows(
  backlogRows: Array<Record<string, unknown>>,
  throughputRows: Array<Record<string, unknown>>,
): GmWorkerRow[] {
  const backlogByDomain = indexRows(backlogRows, (row) => String(row.domain ?? ''));
  const throughputByDomain = indexRows(throughputRows, (row) => String(row.domain ?? ''));
  const domains = new Set([
    ...PLAYER_WORKER_DOMAINS.map((entry) => entry.domain),
    ...backlogByDomain.keys(),
    ...throughputByDomain.keys(),
  ]);
  return Array.from(domains).sort().map((domain) => {
    const config = PLAYER_WORKER_DOMAINS.find((entry) => entry.domain === domain);
    const backlog = backlogByDomain.get(domain);
    const throughput = throughputByDomain.get(domain);
    const pendingCount = toCount(backlog?.due_count ?? backlog?.dirty_count ?? backlog?.backlog_count);
    const claimedCount = toCount(backlog?.claimed_count);
    const delayedCount = toCount(backlog?.delayed_count);
    const writeCount = toCount(throughput?.write_count);
    return {
      id: `player:${domain}`,
      label: config?.label ?? `玩家刷盘：${domain}`,
      kind: 'player_flush',
      domain,
      status: resolveFlushLedgerStatus({ pendingCount, claimedCount, delayedCount }),
      pendingCount,
      claimedCount,
      delayedCount,
      writeCount,
      writesPerSecond: toNumber(throughput?.writes_per_second),
      backlogGrowthPerSecond: estimateBacklogGrowthPerSecond(pendingCount, delayedCount, writeCount),
      oldestPendingAt: toOptionalString(backlog?.oldest_pending_at),
      latestUpdatedAt: toOptionalString(throughput?.latest_updated_at),
    };
  });
}

function buildInstanceWorkerRows(
  backlogRows: Array<Record<string, unknown>>,
  throughputRows: Array<Record<string, unknown>>,
): GmWorkerRow[] {
  const backlogByDomain = groupRowsByDomain(backlogRows);
  const throughputByDomain = groupRowsByDomain(throughputRows);
  const domains = new Set([
    ...INSTANCE_WORKER_DOMAINS.map((entry) => entry.domain),
    ...backlogByDomain.keys(),
    ...throughputByDomain.keys(),
  ]);
  return Array.from(domains).sort().map((domain) => {
    const backlogForDomain = backlogByDomain.get(domain) ?? [];
    const throughputForDomain = throughputByDomain.get(domain) ?? [];
    const config = INSTANCE_WORKER_DOMAINS.find((entry) => entry.domain === domain);
    const pendingCount = sumCounts(backlogForDomain, (row) => row.due_count ?? row.dirty_count ?? row.backlog_count);
    const claimedCount = sumCounts(backlogForDomain, (row) => row.claimed_count);
    const delayedCount = sumCounts(backlogForDomain, (row) => row.delayed_count);
    const writeCount = sumCounts(throughputForDomain, (row) => row.write_count);
    const writesPerSecond = sumNumbers(throughputForDomain, (row) => row.writes_per_second);
    const epochCount = countDistinctEpochs([...backlogForDomain, ...throughputForDomain]);
    const oldestPendingAt = minTimestampString(backlogForDomain.map((row) => row.oldest_pending_at));
    const latestUpdatedAt = maxTimestampString(throughputForDomain.map((row) => row.latest_updated_at));
    return {
      id: `instance:${domain}`,
      label: config?.label ?? `实例刷盘：${domain}`,
      kind: 'instance_flush',
      domain,
      status: resolveFlushLedgerStatus({ pendingCount, claimedCount, delayedCount }),
      pendingCount,
      claimedCount,
      delayedCount,
      writeCount,
      writesPerSecond,
      backlogGrowthPerSecond: estimateBacklogGrowthPerSecond(pendingCount, delayedCount, writeCount),
      oldestPendingAt,
      latestUpdatedAt,
      note: epochCount > 1 ? `聚合 ${epochCount} 个 ownership epoch；epoch 是实例租约世代，不是 worker 数量` : undefined,
    };
  });
}

function buildOutboxWorkerRow(
  summary: Awaited<ReturnType<OutboxDispatcherService['listRecentThroughputSummary']>>,
  retryRows: Array<Record<string, unknown>>,
): GmWorkerRow {
  const deadLetterCount = Math.max(
    toCount(summary.deadLetterCount),
    retryRows.filter((row) => String(row.status ?? '') === 'dead_letter').length,
  );
  const pendingCount = toCount(summary.readyCount);
  const claimedCount = toCount(summary.claimedCount);
  const writeCount = toCount(summary.deliveredCount);
  const delayedCount = retryRows.filter((row) => String(row.status ?? '') === 'ready' && row.next_retry_at).length;
  return {
    id: 'outbox:dispatcher',
    label: 'Outbox 分发 worker',
    kind: 'outbox',
    status: deadLetterCount > 0 ? 'error' : resolveWorkerStatus({ pendingCount, claimedCount, delayedCount, writeCount }),
    pendingCount,
    claimedCount,
    delayedCount,
    writeCount,
    writesPerSecond: toNumber(summary.writesPerSecond),
    backlogGrowthPerSecond: estimateBacklogGrowthPerSecond(pendingCount, delayedCount, writeCount),
    deadLetterCount,
    latestUpdatedAt: summary.latestDeliveredAt,
    note: `重试队列采样 ${retryRows.length} 条`,
  };
}

function buildDatabaseBackupWorkerRow(active: boolean): GmWorkerRow {
  return {
    id: 'database:backup',
    label: '数据库备份 worker',
    kind: 'database_backup',
    status: active ? 'active' : 'warn',
    pendingCount: 0,
    claimedCount: active ? 1 : 0,
    delayedCount: 0,
    writeCount: 0,
    writesPerSecond: 0,
    note: active ? '最近心跳正常，定时备份和保留策略视为开启' : '未检测到近期心跳，定时备份和保留策略可能未运行',
  };
}

function buildFlushLedgerRetentionWorkerRow(): GmWorkerRow {
  return {
    id: 'flush-ledger-retention',
    label: '刷盘账本 retention',
    kind: 'cleanup',
    status: 'idle',
    pendingCount: 0,
    claimedCount: 0,
    delayedCount: 0,
    writeCount: 0,
    writesPerSecond: 0,
    note: '按 latest/flushed version、claim 租约和 retry 时间清理已完成刷盘账本，并先释放 payload_jsonb',
  };
}

function buildWorkerAlerts(rows: GmWorkerRow[]): GmWorkerAlert[] {
  const alerts: GmWorkerAlert[] = [];
  const inactiveAlerts = new Map<string, number>();
  for (const row of rows) {
    if (row.deadLetterCount && row.deadLetterCount > 0) {
      alerts.push({ workerId: row.id, level: 'error', reason: 'dead_letter_present', count: row.deadLetterCount });
      continue;
    }
    if (row.pendingCount >= BACKLOG_WARN_THRESHOLD) {
      alerts.push({ workerId: row.id, level: 'warn', reason: 'backlog_high', count: row.pendingCount });
    }
    if (shouldReportInactive(row)) {
      const workerId = buildInactiveAlertWorkerId(row);
      inactiveAlerts.set(workerId, (inactiveAlerts.get(workerId) ?? 0) + Math.max(1, row.pendingCount));
    }
  }
  for (const [workerId, count] of inactiveAlerts) {
    alerts.push({ workerId, level: 'warn', reason: 'worker_inactive', count });
  }
  return alerts;
}

function buildInactiveAlertWorkerId(row: GmWorkerRow): string {
  if ((row.kind === 'instance_flush' || row.kind === 'player_flush') && row.domain) {
    return `${row.kind === 'instance_flush' ? 'instance' : 'player'}:${row.domain}`;
  }
  return row.id;
}

function buildCapacityAlerts(
  pgPools: ReturnType<FlushDiagnosticsService['getSnapshot']>['pgPools'],
  pgLockWait: ReturnType<FlushDiagnosticsService['getSnapshot']>['pgLockWait'],
): GmWorkerAlert[] {
  const alerts: GmWorkerAlert[] = [];
  const flushPoolWaiting = toCount(pgPools?.flush?.waitingCount);
  if (flushPoolWaiting > 0) {
    alerts.push({ workerId: 'capacity:pg-pool:flush', level: 'warn', reason: 'db_backpressure', count: flushPoolWaiting });
  }
  const lockWaitCount = toCount(pgLockWait?.waitingCount);
  if (lockWaitCount > 0) {
    alerts.push({ workerId: 'capacity:pg-lock-wait', level: 'warn', reason: 'lock_wait', count: lockWaitCount });
  }
  return alerts;
}

function normalizeCapacityPgPools(
  pgPools: ReturnType<FlushDiagnosticsService['getSnapshot']>['pgPools'],
): ReturnType<FlushDiagnosticsService['getSnapshot']>['pgPools'] {
  if (!pgPools) {
    return pgPools;
  }
  return {
    runtimeCritical: normalizeCapacityPgPool(pgPools.runtimeCritical),
    flush: normalizeCapacityPgPool(pgPools.flush),
    outbox: normalizeCapacityPgPool(pgPools.outbox),
    gmDiagnostics: normalizeCapacityPgPool(pgPools.gmDiagnostics),
  };
}

function normalizeCapacityPgPool<T extends { idleCount: number; waitingCount: number } | null>(pool: T): T {
  if (!pool || toCount(pool.idleCount) <= 0 || toCount(pool.waitingCount) <= 0) {
    return pool;
  }
  return { ...pool, waitingCount: 0 };
}

function shouldReportInactive(row: GmWorkerRow): boolean {
  if (row.kind !== 'player_flush' && row.kind !== 'instance_flush') {
    return row.status === 'warn' && row.pendingCount > 0 && row.writeCount === 0;
  }
  if (row.pendingCount <= 0 || row.claimedCount > 0 || row.writeCount > 0) {
    return false;
  }
  const latestUpdatedAt = Date.parse(row.latestUpdatedAt ?? '');
  if (!Number.isFinite(latestUpdatedAt)) {
    return true;
  }
  return Date.now() - latestUpdatedAt > WORKER_WINDOW_SECONDS * 2_000;
}

function estimateBacklogGrowthPerSecond(pendingCount: number, delayedCount: number, writeCount: number): number {
  void delayedCount;
  const backlogPressure = Math.max(0, Math.trunc(Number(pendingCount) || 0));
  const completed = Math.max(0, Math.trunc(Number(writeCount) || 0));
  return Number((Math.max(0, backlogPressure - completed) / WORKER_WINDOW_SECONDS).toFixed(3));
}

function resolveWorkerStatus(input: {
  pendingCount: number;
  claimedCount: number;
  delayedCount: number;
  writeCount: number;
}): GmWorkerStatus {
  if (input.pendingCount >= BACKLOG_WARN_THRESHOLD) {
    return 'warn';
  }
  if (input.claimedCount > 0 || input.writeCount > 0) {
    return 'active';
  }
  if (input.pendingCount > 0 || input.delayedCount > 0) {
    return 'pending';
  }
  return 'idle';
}

function resolveFlushLedgerStatus(input: {
  pendingCount: number;
  claimedCount: number;
  delayedCount: number;
}): GmWorkerStatus {
  if (input.pendingCount >= BACKLOG_WARN_THRESHOLD) {
    return 'warn';
  }
  if (input.claimedCount > 0) {
    return 'active';
  }
  if (input.pendingCount > 0 || input.delayedCount > 0) {
    return 'pending';
  }
  return 'idle';
}

function indexRows<T>(rows: T[], keyOf: (row: T) => string): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key) {
      result.set(key, row);
    }
  }
  return result;
}

function groupRowsByDomain(rows: Array<Record<string, unknown>>): Map<string, Array<Record<string, unknown>>> {
  const result = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const domain = String(row.domain ?? '').trim();
    if (!domain) {
      continue;
    }
    const group = result.get(domain) ?? [];
    group.push(row);
    result.set(domain, group);
  }
  return result;
}

function sumCounts(rows: Array<Record<string, unknown>>, valueOf: (row: Record<string, unknown>) => unknown): number {
  return rows.reduce((total, row) => total + toCount(valueOf(row)), 0);
}

function sumNumbers(rows: Array<Record<string, unknown>>, valueOf: (row: Record<string, unknown>) => unknown): number {
  return Number(rows.reduce((total, row) => total + toNumber(valueOf(row)), 0).toFixed(6));
}

function countDistinctEpochs(rows: Array<Record<string, unknown>>): number {
  const epochs = new Set<number>();
  for (const row of rows) {
    epochs.add(toCount(row.ownership_epoch));
  }
  return epochs.size;
}

function minTimestampString(values: unknown[]): string | null {
  let bestValue: string | null = null;
  let bestMs = Number.POSITIVE_INFINITY;
  for (const value of values) {
    const text = toOptionalString(value);
    const parsed = Date.parse(text ?? '');
    if (text && Number.isFinite(parsed) && parsed < bestMs) {
      bestValue = text;
      bestMs = parsed;
    }
  }
  return bestValue;
}

function maxTimestampString(values: unknown[]): string | null {
  let bestValue: string | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const text = toOptionalString(value);
    const parsed = Date.parse(text ?? '');
    if (text && Number.isFinite(parsed) && parsed > bestMs) {
      bestValue = text;
      bestMs = parsed;
    }
  }
  return bestValue;
}

function toCount(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value);
  return text.trim() ? text : null;
}
