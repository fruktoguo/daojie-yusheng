import { Inject, Injectable } from '@nestjs/common';
import type { GmWorkerAlert, GmWorkerRow, GmWorkerStateRes, GmWorkerStatus } from '@mud/shared';

import { FlushLedgerService } from '../../persistence/flush-ledger.service';
import { OutboxDispatcherService } from '../../persistence/outbox-dispatcher.service';
import { PlayerFlushLedgerService } from '../../persistence/player-flush-ledger.service';
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
    @Inject(PlayerFlushLedgerService) private readonly playerFlushLedgerService: PlayerFlushLedgerService,
    @Inject(OutboxDispatcherService) private readonly outboxDispatcherService: OutboxDispatcherService,
    @Inject(NativeGmAdminService) private readonly nativeGmAdminService: NativeGmAdminService,
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
    ] = await Promise.all([
      this.playerFlushLedgerService.listBacklogSummary(),
      this.flushLedgerService.listInstanceBacklogSummary(),
      this.playerFlushLedgerService.listRecentThroughputSummary({ windowSeconds: WORKER_WINDOW_SECONDS }),
      this.flushLedgerService.listInstanceRecentThroughputSummary({ windowSeconds: WORKER_WINDOW_SECONDS }),
      this.outboxDispatcherService.listRecentThroughputSummary({ windowSeconds: WORKER_WINDOW_SECONDS }),
      this.outboxDispatcherService.listRetryQueue({ limit: 100 }),
      this.nativeGmAdminService.getDatabaseState(),
    ]);

    const rows: GmWorkerRow[] = [
      ...buildPlayerWorkerRows(playerRows, playerThroughputRows),
      ...buildInstanceWorkerRows(instanceRows, instanceThroughputRows),
      buildOutboxWorkerRow(outboxSummary, retryRows),
      buildDatabaseBackupWorkerRow(Boolean(databaseState.automation?.schedulesActive)),
    ];
    const alerts = buildWorkerAlerts(rows);
    return {
      generatedAt: new Date().toISOString(),
      windowSeconds: WORKER_WINDOW_SECONDS,
      rows,
      alerts,
      sources: {
        flushLedgerEnabled: this.flushLedgerService.isEnabled() || this.playerFlushLedgerService.isEnabled(),
        outboxEnabled: this.outboxDispatcherService.isEnabled(),
        backupWorkerHeartbeatActive: Boolean(databaseState.automation?.schedulesActive),
      },
      note: 'GM worker 面板读取 flush ledger、outbox 与数据库备份 worker 心跳的低频汇总；它不启动、不停止 worker，也不替代进程级监控。',
    };
  }
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
    const pendingCount = toCount(backlog?.dirty_count ?? backlog?.backlog_count);
    const claimedCount = toCount(backlog?.claimed_count);
    const delayedCount = toCount(backlog?.delayed_count);
    const writeCount = toCount(throughput?.write_count);
    return {
      id: `player:${domain}`,
      label: config?.label ?? `玩家刷盘：${domain}`,
      kind: 'player_flush',
      domain,
      status: resolveWorkerStatus({ pendingCount, claimedCount, delayedCount, writeCount }),
      pendingCount,
      claimedCount,
      delayedCount,
      writeCount,
      writesPerSecond: toNumber(throughput?.writes_per_second),
      oldestPendingAt: toOptionalString(backlog?.oldest_pending_at),
      latestUpdatedAt: toOptionalString(throughput?.latest_updated_at),
    };
  });
}

function buildInstanceWorkerRows(
  backlogRows: Array<Record<string, unknown>>,
  throughputRows: Array<Record<string, unknown>>,
): GmWorkerRow[] {
  const backlogByKey = indexRows(backlogRows, (row) => buildInstanceKey(row.domain, row.ownership_epoch));
  const throughputByKey = indexRows(throughputRows, (row) => buildInstanceKey(row.domain, row.ownership_epoch));
  const configuredKeys = INSTANCE_WORKER_DOMAINS.map((entry) => buildInstanceKey(entry.domain, 0));
  const keys = new Set([...configuredKeys, ...backlogByKey.keys(), ...throughputByKey.keys()]);
  return Array.from(keys).sort().map((key) => {
    const backlog = backlogByKey.get(key);
    const throughput = throughputByKey.get(key);
    const domain = String(backlog?.domain ?? throughput?.domain ?? key.split(':')[0]);
    const ownershipEpoch = toCount(backlog?.ownership_epoch ?? throughput?.ownership_epoch);
    const config = INSTANCE_WORKER_DOMAINS.find((entry) => entry.domain === domain);
    const pendingCount = toCount(backlog?.dirty_count ?? backlog?.backlog_count);
    const claimedCount = toCount(backlog?.claimed_count);
    const delayedCount = toCount(backlog?.delayed_count);
    const writeCount = toCount(throughput?.write_count);
    return {
      id: `instance:${domain}:${ownershipEpoch}`,
      label: `${config?.label ?? `实例刷盘：${domain}`}${ownershipEpoch > 0 ? ` #${ownershipEpoch}` : ''}`,
      kind: 'instance_flush',
      domain,
      ownershipEpoch,
      status: resolveWorkerStatus({ pendingCount, claimedCount, delayedCount, writeCount }),
      pendingCount,
      claimedCount,
      delayedCount,
      writeCount,
      writesPerSecond: toNumber(throughput?.writes_per_second),
      oldestPendingAt: toOptionalString(backlog?.oldest_pending_at),
      latestUpdatedAt: toOptionalString(throughput?.latest_updated_at),
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

function buildWorkerAlerts(rows: GmWorkerRow[]): GmWorkerAlert[] {
  const alerts: GmWorkerAlert[] = [];
  for (const row of rows) {
    if (row.deadLetterCount && row.deadLetterCount > 0) {
      alerts.push({ workerId: row.id, level: 'error', reason: 'dead_letter_present', count: row.deadLetterCount });
      continue;
    }
    if (row.pendingCount >= BACKLOG_WARN_THRESHOLD) {
      alerts.push({ workerId: row.id, level: 'warn', reason: 'backlog_high', count: row.pendingCount });
    }
    if (row.status === 'warn') {
      alerts.push({ workerId: row.id, level: 'warn', reason: 'worker_inactive' });
    }
  }
  return alerts;
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

function indexRows(rows: Array<Record<string, unknown>>, keyOf: (row: Record<string, unknown>) => string): Map<string, Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key) {
      result.set(key, row);
    }
  }
  return result;
}

function buildInstanceKey(domain: unknown, ownershipEpoch: unknown): string {
  return `${String(domain ?? '')}:${toCount(ownershipEpoch)}`;
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
