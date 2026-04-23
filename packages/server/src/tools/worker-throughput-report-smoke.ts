import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { buildBacklogAlerts } from './worker-backlog-alert.helpers';

function main(): void {
  const playerRows = [
    { domain: 'snapshot', backlog_count: 120, write_count: 120, writes_per_second: 2 },
    { domain: 'presence', backlog_count: 60, write_count: 60, writes_per_second: 1 },
  ];
  const instanceRows = [
    { domain: 'tile_resource', ownership_epoch: 3, backlog_count: 120, write_count: 120, writes_per_second: 1.5 },
  ];
  const outboxSummary = {
    readyCount: 18,
    claimedCount: 2,
    deliveredCount: 144,
    deadLetterCount: 1,
    writesPerSecond: 2.4,
    latestDeliveredAt: '2026-04-23T00:00:00.000Z',
  };
  const alerts = buildBacklogAlerts({
    playerRows: playerRows.map((entry) => ({ backlog_count: entry.backlog_count })),
    instanceRows: instanceRows.map((entry) => ({ backlog_count: entry.backlog_count })),
    retryRows: outboxSummary.deadLetterCount > 0 ? [{ status: 'dead_letter' }] : [],
  });
  assert.equal(alerts.some((entry) => entry.reason === 'player_flush_backlog_high'), true);
  assert.equal(alerts.some((entry) => entry.reason === 'instance_flush_backlog_high'), true);
  assert.equal(alerts.some((entry) => entry.reason === 'dead_letter_present'), true);
  console.log(JSON.stringify({
    ok: true,
    case: 'worker-throughput-report',
    playerRows,
    instanceRows,
    outboxSummary,
    alerts,
  }, null, 2));
}

main();
