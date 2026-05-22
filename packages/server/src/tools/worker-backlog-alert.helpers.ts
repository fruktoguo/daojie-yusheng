/**
 * 本文件实现后台 worker 或对应冷路径入口，负责把运行态变更异步落库、清理或压缩。
 *
 * 维护时要关注批量大小、重试幂等和中断恢复，不能让后台任务破坏服务端权威状态。
 */
export interface WorkerBacklogAlertInput {
  playerRows: Array<Record<string, unknown>>;
  instanceRows: Array<Record<string, unknown>>;
  retryRows: Array<Record<string, unknown>>;
}

export function buildBacklogAlerts(input: WorkerBacklogAlertInput): Array<Record<string, unknown>> {
  const alerts: Array<Record<string, unknown>> = [];
  for (const row of input.playerRows) {
    const backlogCount = Number(row.backlog_count ?? 0);
    if (backlogCount >= 100) {
      alerts.push({
        scope: 'player_flush',
        domain: String(row.domain ?? ''),
        backlogCount,
        reason: 'player_flush_backlog_high',
      });
    }
  }
  for (const row of input.instanceRows) {
    const backlogCount = Number(row.backlog_count ?? 0);
    if (backlogCount >= 100) {
      alerts.push({
        scope: 'instance_flush',
        domain: String(row.domain ?? ''),
        ownershipEpoch: Number(row.ownership_epoch ?? 0),
        backlogCount,
        reason: 'instance_flush_backlog_high',
      });
    }
  }
  const deadLetterCount = input.retryRows.filter((row) => String(row.status ?? '') === 'dead_letter').length;
  if (deadLetterCount >= 1) {
    alerts.push({
      scope: 'outbox',
      reason: 'dead_letter_present',
      deadLetterCount,
    });
  }
  return alerts;
}
