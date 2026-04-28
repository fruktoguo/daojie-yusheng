import assert from 'node:assert/strict';

import { WorldSessionRecoveryQueueService } from '../network/world-session-recovery-queue.service';

async function main(): Promise<void> {
  const queue = new WorldSessionRecoveryQueueService();
  const started: string[] = [];
  const finished: string[] = [];

  const vipTask = queue.enqueue({
    key: 'player-vip',
    priority: 'vip',
    timeoutMs: 1_000,
    run: async () => {
      started.push('vip');
      await sleep(30);
      finished.push('vip');
      return 'vip';
    },
  });
  const recentTask = queue.enqueue({
    key: 'player-recent',
    priority: 'recent',
    timeoutMs: 1_000,
    run: async () => {
      started.push('recent');
      await sleep(10);
      finished.push('recent');
      return 'recent';
    },
  });
  const normalTask = queue.enqueue({
    key: 'player-normal',
    priority: 'normal',
    timeoutMs: 200,
    run: async () => {
      started.push('normal');
      await sleep(50);
      finished.push('normal');
      return 'normal';
    },
  });
  const timeoutTask = queue.enqueue({
    key: 'player-timeout',
    priority: 'normal',
    timeoutMs: 20,
    run: async () => {
      started.push('timeout');
      await sleep(60);
      finished.push('timeout');
      return 'timeout';
    },
  });
  const defaultTimeoutTask = queue.enqueue({
    key: 'player-default-timeout',
    priority: 'normal',
    run: async () => {
      started.push('default-timeout');
      await sleep(25);
      finished.push('default-timeout');
      return 'default-timeout';
    },
  });

  const results = await Promise.allSettled([vipTask, recentTask, normalTask, timeoutTask, defaultTimeoutTask]);
  assert.equal(results.every((entry) => entry.status === 'fulfilled'), true);
  assert.equal(results[4].status, 'fulfilled');
  assert.deepEqual(started.slice(0, 2), ['vip', 'recent']);
  assert.equal(queue.getSnapshot().concurrency >= 1 && queue.getSnapshot().concurrency <= 64, true);
  assert.equal(queue.getSnapshot().queued, 0);
  assert.equal(queue.getSnapshot().inFlight, 0);
  assert.deepEqual(finished.sort(), ['default-timeout', 'normal', 'recent', 'timeout', 'vip']);

  console.log(
    JSON.stringify(
      {
        ok: true,
        started,
        finished,
        snapshot: queue.getSnapshot(),
        answers: '恢复队列已按优先级与并发门执行；未显式 timeoutMs 时会使用默认 15s 窗口而不是 1ms；超过阈值只告警，不取消运行中的数据库恢复任务',
        excludes: '不证明真实登录风暴压测或跨节点队列',
        completionMapping: 'replace-ready:proof:stage4.recovery-queue',
      },
      null,
      2,
    ),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
