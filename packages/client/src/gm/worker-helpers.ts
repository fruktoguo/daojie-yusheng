/**
 * gm/worker-helpers.ts —— Worker 面板辅助函数：行标记、拓扑/调度器/容量渲染、状态标签、格式化。
 *
 * 从 gm.ts 抽取：getWorkerRowMarkup/getWorkerWindowMetricLabel/
 * getWorkerStatusLabel/getWorkerTopologyMarkup/
 * getWorkerSchedulerMarkup/getWorkerAlertLabel/
 * getSchedulerDiagnosticNote/getAlertInactiveDiagnostic/
 * getWorkerCapacityMarkup/formatWorkerFailureBreakdown/
 * formatMs/formatCompactNumber/formatWorkerRate/
 * countWorkerRows/sumWorkerRows/
 * formatDatabaseBackupKind/formatDatabaseBackupFormat。
 * 仅依赖 escapeHtml，无可变状态。
 */

import {
  type GmDatabaseBackupRecord,
  type GmWorkerRow,
  type GmWorkerStateRes,
} from '@mud/shared';
import {
  formatMs as formatFormatMs,
  formatCompactNumber as formatFormatCompactNumber,
  formatWorkerRate as formatFormatWorkerRate,
} from './format';

/** WorkerHelpersContext：worker-helpers 对 gm.ts 的依赖。 */
export interface WorkerHelpersContext {
  escapeHtml(input: string): string;
  formatDateTime(value?: string): string;
}
export function getWorkerRowMarkup(row: GmWorkerRow, ctx: WorkerHelpersContext): string {
  const statusLabel = getWorkerStatusLabel(row.status, ctx);
  const statusClass = row.status === 'error' || row.status === 'warn' ? ' danger' : '';
  const windowMetricLabel = getWorkerWindowMetricLabel(row, ctx);
  const meta = [
    row.domain ? `域 ${row.domain}` : '',
    row.ownershipEpoch ? `epoch ${row.ownershipEpoch}` : '',
    `待处理 ${row.pendingCount}`,
    `认领 ${row.claimedCount}`,
    `延迟 ${row.delayedCount}`,
    `${windowMetricLabel} ${row.writeCount}`,
    `${formatWorkerRate(row.writesPerSecond, ctx)}`,
    row.backlogGrowthPerSecond !== undefined ? `积压增长 ${formatWorkerRate(row.backlogGrowthPerSecond, ctx)}` : '',
    row.deadLetterCount ? `死信 ${row.deadLetterCount}` : '',
    row.stalePayloadCount ? `无 payload ${row.stalePayloadCount} 条` : '',
    row.enabled !== undefined ? `enabled ${row.enabled ? '是' : '否'}` : '',
    row.running !== undefined ? `running ${row.running ? '是' : '否'}` : '',
    row.processedCount !== undefined ? `累计 ${row.processedCount}` : '',
    row.lastHeartbeatAt ? `心跳 ${ctx.formatDateTime(row.lastHeartbeatAt)}` : '',
    row.lastSuccessAt ? `成功 ${ctx.formatDateTime(row.lastSuccessAt)}` : '',
    row.lastFailureAt ? `失败 ${ctx.formatDateTime(row.lastFailureAt)}` : '',
    row.oldestPendingAt ? `最早待处理 ${ctx.formatDateTime(row.oldestPendingAt)}` : '',
    row.latestUpdatedAt ? `最近更新 ${ctx.formatDateTime(row.latestUpdatedAt)}` : '',
  ].filter(Boolean);
  return `
    <div class="network-row">
      <div class="network-row-label">${ctx.escapeHtml(row.label)} <span class="pill${statusClass}">${ctx.escapeHtml(statusLabel)}</span></div>
      <div class="network-row-meta">${ctx.escapeHtml(meta.join(' · '))}</div>
      ${row.note ? `<div class="editor-note" style="margin-top: 6px;">${ctx.escapeHtml(row.note)}</div>` : ''}
    </div>
  `;
}

export function getWorkerWindowMetricLabel(row: GmWorkerRow, ctx: WorkerHelpersContext): string {
  if (row.kind === 'player_flush' || row.kind === 'instance_flush') {
    return '窗口账本更新';
  }
  if (row.kind === 'outbox') {
    return '窗口投递';
  }
  return '窗口处理';
}

export function getWorkerStatusLabel(status: GmWorkerRow['status'], ctx: WorkerHelpersContext): string {
  switch (status) {
    case 'active':
      return '工作中';
    case 'pending':
      return '待处理';
    case 'idle':
      return '空闲';
    case 'warn':
      return '需关注';
    case 'error':
      return '异常';
    default:
      return '未知';
  }
}

export function getWorkerTopologyMarkup(state: GmWorkerStateRes, ctx: WorkerHelpersContext): string {
  const topology = state.topology;
  if (!topology) {
    return '';
  }
  const localWorkers = topology.localWorkers.length > 0
    ? topology.localWorkers.map((worker) => `${worker.label}:${worker.enabled ? 'enabled' : 'disabled'}${worker.running ? '/running' : ''}`).join(' · ')
    : '当前进程未暴露本地 orchestrator worker；请结合 server_worker 部署与持久化心跳判断。';
  return `
    <div class="note-card">
      <strong>运行拓扑</strong>：当前 role=${ctx.escapeHtml(topology.currentRole)} · ${ctx.escapeHtml(topology.recommendedTopology)}
      <br>${ctx.escapeHtml(topology.note ?? '')}
      <br>本地 worker：${ctx.escapeHtml(localWorkers)}
    </div>
  `;
}

export function getWorkerSchedulerMarkup(state: GmWorkerStateRes, ctx: WorkerHelpersContext): string {
  const scheduler = state.scheduler;
  if (!scheduler || !scheduler.tasks || scheduler.tasks.length === 0) {
    return '<div class="note-card"><strong>Scheduler 任务</strong>：未加载或无任务注册（worker 进程可能未启动）。</div>';
  }
  const taskRows = scheduler.tasks.map((task) => {
    const isStuck = task.running && task.lastSuccessAt && (Date.now() - Date.parse(task.lastSuccessAt) > 120_000);
    const statusClass = isStuck ? ' danger' : task.running ? '' : '';
    const statusText = isStuck ? '可能 hang' : task.running ? '运行中' : task.paused ? '已暂停' : task.enabled ? '空闲' : '已禁用';
    const sourceText = [
      task.runtimeRole ? `role=${task.runtimeRole}` : '',
      task.nodeId ? `node=${task.nodeId}` : '',
      task.snapshotUpdatedAt ? `快照 ${ctx.formatDateTime(task.snapshotUpdatedAt)}` : '',
    ].filter(Boolean).join(' · ');
    const meta = [
      sourceText,
      `运行 ${task.runCount} 次`,
      `成功 ${task.processedCount}`,
      task.failureCount > 0 ? `失败 ${task.failureCount}` : '',
      task.lastSuccessAt ? `最近成功 ${ctx.formatDateTime(task.lastSuccessAt)}` : '从未成功',
      task.lastFailure ? `原因: ${task.lastFailure.slice(0, 60)}` : '',
      task.lastDurationMs > 0 ? `耗时 ${task.lastDurationMs}ms` : '',
    ].filter(Boolean);
    return `
      <div class="network-row">
        <div class="network-row-label">${ctx.escapeHtml(task.id)} <span class="pill${statusClass}">${ctx.escapeHtml(statusText)}</span></div>
        <div class="network-row-meta">${ctx.escapeHtml(meta.join(' · '))}</div>
      </div>
    `;
  }).join('');
  const governorNote = scheduler.governor
    ? `压力等级 ${scheduler.governor.backlogPressureLevel} · CPU ${scheduler.governor.availableParallelism} 核 · flush 池等待 ${scheduler.governor.flushPoolWaiting} · 锁等待 ${scheduler.governor.lockWaitCount}`
    : '';
  return `
    <div class="network-breakdown">
      <div class="network-breakdown-head">
        <div class="panel-title">Scheduler 任务状态</div>
        <div class="network-breakdown-subtitle">跨进程调度器快照（来自 scheduler_runtime_state 表）${governorNote ? ' · ' + ctx.escapeHtml(governorNote) : ''}</div>
      </div>
      <div class="network-breakdown-list">${taskRows}</div>
    </div>
  `;
}

export function getWorkerAlertLabel(reason: string, ctx: WorkerHelpersContext): string {
  switch (reason) {
    case 'dead_letter_present':
      return '存在死信';
    case 'backlog_high':
      return '积压过高';
    case 'worker_inactive':
      return 'worker 心跳或活跃状态异常';
    case 'db_backpressure':
      return '数据库连接池反压';
    case 'lock_wait':
      return 'PG 锁等待';
    default:
      return reason;
  }
}

export function getSchedulerDiagnosticNote(state: GmWorkerStateRes, ctx: WorkerHelpersContext): string {
  const scheduler = state.scheduler;
  if (!scheduler) return 'scheduler 状态未加载';
  const flushTask = scheduler.tasks.find((t) => t.id === 'flush-task-consumer');
  if (!flushTask) return 'flush-task-consumer 未注册（worker 进程可能未启动）';
  if (flushTask.running && flushTask.lastSuccessAt && Date.now() - Date.parse(flushTask.lastSuccessAt) > 120_000) {
    return 'flush consumer 可能 hang（running=true 超时）';
  }
  if (flushTask.failureCount > 0) {
    return `flush consumer 有 ${flushTask.failureCount} 次失败`;
  }
  return '';
}

export function getAlertInactiveDiagnostic(state: GmWorkerStateRes, workerId: string, ctx: WorkerHelpersContext): string {
  const row = state.rows.find((r) => r.id === workerId || `${r.kind === 'instance_flush' ? 'instance' : 'player'}:${r.domain}` === workerId);
  if (!row) return '';
  const parts: string[] = [];
  if (row.stalePayloadCount && row.stalePayloadCount > 0) {
    parts.push(`无 payload ${row.stalePayloadCount} 条（离线玩家旧数据）`);
  }
  return parts.length > 0 ? ` · ${parts.join(' · ')}` : '';
}

export function getWorkerCapacityMarkup(state: GmWorkerStateRes, ctx: WorkerHelpersContext): string {
  const capacity = state.capacity;
  if (!capacity) {
    return '';
  }
  const flushPool = capacity.pgPools?.flush;
  const lockWait = capacity.pgLockWait;
  const player = capacity.player;
  const map = capacity.map;
  const failures = capacity.failures;
  const cards = [
    {
      title: 'Flush Pool 等待',
      value: `${formatCompactNumber(flushPool?.waitingCount ?? 0, ctx)}`,
      note: flushPool ? `连接 ${flushPool.totalCount} · 空闲 ${flushPool.idleCount}` : '暂无连接池采样',
    },
    {
      title: 'PG 锁等待',
      value: `${formatCompactNumber(lockWait?.waitingCount ?? 0, ctx)}`,
      note: lockWait?.error ? `采样失败：${lockWait.error}` : (lockWait ? `检查 ${ctx.formatDateTime(new Date(lockWait.checkedAt).toISOString())}` : '暂无锁等待采样'),
    },
    {
      title: '玩家 Flush',
      value: player ? `${formatMs(player.totalMs, ctx)}` : '无采样',
      note: player ? `DB ${formatMs(player.dbWriteMs, ctx)} · 玩家 ${player.entityCount}` : '等待下一轮玩家刷盘',
    },
    {
      title: '地图 Flush',
      value: map ? `${formatMs(map.totalMs, ctx)}` : '无采样',
      note: map ? `DB ${formatMs(map.dbWriteMs, ctx)} · 实例 ${map.entityCount}${map.coalescedDomainCount ? ` · 合并 ${map.coalescedDomainCount}` : ''}` : '等待下一轮地图刷盘',
    },
    {
      title: '失败窗口',
      value: `${formatCompactNumber(failures?.total ?? 0, ctx)}`,
      note: failures ? formatWorkerFailureBreakdown(failures.byCategory, ctx) : '暂无失败采样',
    },
  ];
  return cards.map((card) => `
    <div class="summary-card">
      <div class="panel-title">${ctx.escapeHtml(card.title)}</div>
      <div class="panel-value">${ctx.escapeHtml(card.value)}</div>
      <div class="stats-card-note">${ctx.escapeHtml(card.note)}</div>
    </div>
  `).join('');
}

export function formatWorkerFailureBreakdown(byCategory: Record<string, number>, ctx: WorkerHelpersContext): string {
  const entries = Object.entries(byCategory)
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 3);
  return entries.length > 0
    ? entries.map(([key, count]) => `${key} ${count}`).join(' · ')
    : '暂无失败分类';
}

export function formatMs(value: number, ctx: WorkerHelpersContext): string {
  return formatFormatMs(value);
}

export function formatCompactNumber(value: number, ctx: WorkerHelpersContext): string {
  return formatFormatCompactNumber(value);
}

export function formatWorkerRate(value: number, ctx: WorkerHelpersContext): string {
  return formatFormatWorkerRate(value);
}

export function countWorkerRows(rows: GmWorkerRow[], statuses: GmWorkerRow['status'][], ctx: WorkerHelpersContext): number {
  return rows.filter((row) => statuses.includes(row.status)).length;
}

export function sumWorkerRows(rows: GmWorkerRow[], key: 'pendingCount' | 'deadLetterCount', ctx: WorkerHelpersContext): number {
  return rows.reduce((total, row) => total + Math.max(0, Number(row[key] ?? 0) || 0), 0);
}

/** formatDatabaseBackupKind：格式化数据库备份种类。 */
export function formatDatabaseBackupKind(kind: GmDatabaseBackupRecord['kind'], ctx: WorkerHelpersContext): string {
  switch (kind) {
    case 'hourly':
      return '整点备份';
    case 'daily':
      return '每日备份';
    case 'manual':
      return '手动导出';
    case 'pre_import':
      return '导入前备份';
    case 'uploaded':
      return '本地上传';
    default:
      return kind;
  }
}

/** formatDatabaseBackupFormat：格式化数据库备份格式。 */
export function formatDatabaseBackupFormat(format: GmDatabaseBackupRecord['format'], ctx: WorkerHelpersContext): string {
  switch (format) {
    case 'postgres_custom_dump':
      return 'PostgreSQL 自定义备份';
    case 'legacy_json_snapshot':
      return '历史 JSON 快照（硬切后不可恢复）';
    default:
      return '未知格式';
  }
}

