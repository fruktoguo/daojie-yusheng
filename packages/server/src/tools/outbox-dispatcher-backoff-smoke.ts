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
        claimed_by: 'outbox-dispatcher:test:claim-1',
      },
    ] as Array<Record<string, unknown>>,
  ];
  const consumedEventIds: string[] = [];
  const claimCalls: number[] = [];
  const claimOwners: string[] = [];
  let renewalCalls = 0;

  const dispatcher = {
    isEnabled() {
      return true;
    },
    async claimReadyEvents(input: { dispatcherId: string }) {
      claimCalls.push(claimCalls.length + 1);
      claimOwners.push(input.dispatcherId);
      return (claimedEvents.shift() ?? []) as Array<Record<string, unknown>>;
    },
    async claimConsumerDedupe() {
      return { status: 'claimed' as const };
    },
    async renewConsumerClaims() {
      renewalCalls += 1;
      return true;
    },
    async markConsumerDedupeDelivered() {
      return 'delivered' as const;
    },
    async markDelivered(input: { eventId: string }) {
      consumedEventIds.push(input.eventId);
      return true;
    },
    async deferClaim() {
      return true;
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
  assert.equal(renewalCalls, 1);
  assert.equal(new Set(claimOwners).size, 2);
  assert.ok(claimOwners.every((owner) => owner.startsWith('outbox-dispatcher:')));
  await proveLostHeartbeatCannotAckOrRetry();

  console.log(
    JSON.stringify(
      {
        ok: true,
        case: 'outbox-dispatcher-backoff',
        answers: '当前 outbox dispatcher runtime 以显式 dispatchPendingEvents 为主；每次进入 consumer 前会续租 event 与 eventId 去重 claim，长消费心跳一旦确认 claim 丢失，消费成功或失败都不会再 ack/retry。',
        excludes: '不证明 Redis/LISTEN 唤醒、真实生产级指数退避调度或下游副作用天然幂等；consumer 仍必须以 eventId 实现幂等。',
        completionMapping: 'persistence-root-fix.phase5.outbox-backoff',
      },
      null,
      2,
    ),
  );
}

async function proveLostHeartbeatCannotAckOrRetry(): Promise<void> {
  const previousClaimTtlMs = process.env.SERVER_OUTBOX_CONSUMER_CLAIM_TTL_MS;
  process.env.SERVER_OUTBOX_CONSUMER_CLAIM_TTL_MS = '1000';
  let claimed = false;
  let renewalCalls = 0;
  let deliveredCalls = 0;
  let failedCalls = 0;
  let dedupeDeliveredCalls = 0;
  const dispatcher = {
    isEnabled() {
      return true;
    },
    async claimReadyEvents() {
      if (claimed) {
        return [];
      }
      claimed = true;
      return [{
        event_id: 'event:heartbeat-lost',
        operation_id: 'op:heartbeat-lost',
        topic: 'test.topic',
        claimed_by: 'outbox-dispatcher:test:heartbeat-lost',
      }];
    },
    async claimConsumerDedupe() {
      return { status: 'claimed' as const };
    },
    async renewConsumerClaims() {
      renewalCalls += 1;
      return renewalCalls === 1;
    },
    async markConsumerDedupeDelivered() {
      dedupeDeliveredCalls += 1;
      return 'delivered' as const;
    },
    async markDelivered() {
      deliveredCalls += 1;
      return true;
    },
    async markFailed() {
      failedCalls += 1;
      return true;
    },
  };
  const runtime = new OutboxDispatcherRuntimeService(dispatcher as never, null);
  runtime.setEventConsumer(async () => {
    await sleep(450);
    throw new Error('consumer_failed_after_claim_loss');
  });
  try {
    assert.equal(await runtime.dispatchPendingEvents(), 0);
    assert.ok(renewalCalls >= 2);
    assert.equal(dedupeDeliveredCalls, 0);
    assert.equal(deliveredCalls, 0);
    assert.equal(failedCalls, 0);
  } finally {
    await runtime.onModuleDestroy();
    if (previousClaimTtlMs === undefined) {
      delete process.env.SERVER_OUTBOX_CONSUMER_CLAIM_TTL_MS;
    } else {
      process.env.SERVER_OUTBOX_CONSUMER_CLAIM_TTL_MS = previousClaimTtlMs;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
