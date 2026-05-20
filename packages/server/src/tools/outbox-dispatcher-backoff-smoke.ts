import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { OutboxDispatcherRuntimeService } from '../persistence/outbox-dispatcher-runtime.service';

async function main(): Promise<void> {
  const scheduleCalls: number[] = [];
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

  const dispatcher = {
    isEnabled() {
      return true;
    },
    async claimReadyEvents() {
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
  (service as any).scheduleNextDispatch = (delayMs: number) => {
    scheduleCalls.push(delayMs);
  };
  (service as any).nextDelayMs = 250;

  await (service as any).runScheduledDispatch();
  await (service as any).runScheduledDispatch();

  assert.deepEqual(scheduleCalls, [500, 250]);
  assert.deepEqual(consumedEventIds, ['event:1']);

  console.log(
    JSON.stringify(
      {
        ok: true,
        case: 'outbox-dispatcher-backoff',
        answers: 'outbox dispatcher 在空转时会指数退避到更长轮询间隔，在真正认领到事件后会回落到基础间隔。',
        excludes: '不证明 Redis/LISTEN 唤醒，只证明无事件空轮询不会一直 250ms 固定打 SQL。',
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
