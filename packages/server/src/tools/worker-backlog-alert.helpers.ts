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
