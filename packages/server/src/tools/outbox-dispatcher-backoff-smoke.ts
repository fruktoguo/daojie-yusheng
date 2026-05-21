import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { OutboxDispatcherRuntimeService } from '../persistence/outbox-dispatcher-runtime.service';

async function main(): Promise<void> {
  const claimedEvents = [
    [] as Array<Record<string, unknown>>,
    [
      {
        event_id: 'event:1',
        operation_id: 'op:1',
        topic: 'test.topic',
      },
    ] as Array<Record<string, unknown>>,
  ];
  const consumedEventIds: string[] = [];
  const claimCalls: number[] = [];

  const dispatcher = {
    isEnabled() {
      return true;
    },
    async claimReadyEvents() {
      claimCalls.push(claimCalls.length + 1);
      return (claimedEvents.shift() ?? []) as Array<Record<string, unknown>>;
    },
    async claimConsumerDedupe() {
      return true;
    },
    async markConsumerDedupeDelivered() {
      return undefined;
    },
    async markDelivered(eventId: string) {
      consumedEventIds.push(eventId);
    },
    async releaseConsumerDedupe() {
      return undefined;
    },
    async markFailed() {
      return undefined;
    },
  };

  const service = new OutboxDispatcherRuntimeService(dispatcher as never, null);
  await service.onModuleInit();
  const firstProcessed = await service.dispatchPendingEvents();
  const secondProcessed = await service.dispatchPendingEvents();
  await service.onModuleDestroy();

  assert.equal(firstProcessed, 0);
  assert.equal(secondProcessed, 1);
  assert.deepEqual(consumedEventIds, ['event:1']);
  assert.equal(claimCalls.length, 2);

  console.log(
    JSON.stringify(
      {
        ok: true,
        case: 'outbox-dispatcher-backoff',
        answers: '当前 outbox dispatcher runtime 以显式 dispatchPendingEvents 为主，不再依赖旧的定时退避钩子；空轮询返回 0，随后有事件时可正常消费并回写 delivered。',
        excludes: '不证明 Redis/LISTEN 唤醒或真实生产级指数退避调度，只验证现有 runtime dispatch 路径。',
        completionMapping: 'persistence-root-fix.phase5.outbox-backoff',
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
