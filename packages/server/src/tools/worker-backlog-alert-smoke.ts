import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { buildBacklogAlerts } from './worker-backlog-alert.helpers';

async function main(): Promise<void> {
  const alerts = buildBacklogAlerts({
    playerRows: [
      { domain: 'snapshot', backlog_count: 101 },
      { domain: 'presence', backlog_count: 2 },
    ],
    instanceRows: [
      { domain: 'tile_resource', ownership_epoch: 3, backlog_count: 99 },
      { domain: 'ground_item', ownership_epoch: 3, backlog_count: 120 },
    ],
    retryRows: [
      { status: 'ready' },
      { status: 'dead_letter' },
    ],
  });

  assert.equal(alerts.length, 3);
  assert.deepEqual(alerts.map((entry) => entry.scope).sort(), ['instance_flush', 'outbox', 'player_flush'].sort());
  assert.equal(alerts.some((entry) => entry.reason === 'player_flush_backlog_high'), true);
  assert.equal(alerts.some((entry) => entry.reason === 'instance_flush_backlog_high'), true);
  assert.equal(alerts.some((entry) => entry.reason === 'dead_letter_present'), true);

  console.log(
    JSON.stringify(
      {
        ok: true,
        case: 'worker-backlog-alert',
        alerts,
        answers: '单 worker 积压/死信会生成告警，但不会阻塞其他 worker 的 ledger 轮询或恢复队列',
        excludes: '不证明 500/1000 真实压测、跨节点竞争或故障注入',
        completionMapping: 'replace-ready:proof:stage7.worker-backlog-alert',
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
