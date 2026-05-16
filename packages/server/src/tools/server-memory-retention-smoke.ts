import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { NativeAuthRateLimitService } from '../http/native/native-auth-rate-limit.service';
import { WorldSessionRecoveryQueueService } from '../network/world-session-recovery-queue.service';
import { FlushWakeupService } from '../persistence/flush-wakeup.service';
import { OutboxDispatcherRuntimeService } from '../persistence/outbox-dispatcher-runtime.service';
import { RuntimeEventBusService } from '../runtime/event-bus/runtime-event-bus.service';
import { MailRuntimeService } from '../runtime/mail/mail-runtime.service';
import { RedeemCodeRuntimeService } from '../runtime/redeem/redeem-code-runtime.service';
import { SuggestionRuntimeService } from '../runtime/suggestion/suggestion-runtime.service';

async function main(): Promise<void> {
  const mailProof = await proveMailboxCacheBound();
  const redeemProof = await proveRedeemRateCachePrune();
  const recoveryProof = await proveRecoveryQueueBoundaries();
  const outboxProof = await proveOutboxDedupeBound();
  const authRateProof = await proveAuthRateLimitPrune();
  const flushWakeupProof = proveFlushWakeupBound();
  const eventBusProof = proveEventBusReleasesQueues();
  const suggestionProof = await proveSuggestionTextBounds();
  const gmObserverProof = proveGmWorldObserverIdsRemoved();

  console.log(JSON.stringify({
    ok: true,
    mailProof,
    redeemProof,
    recoveryProof,
    outboxProof,
    authRateProof,
    flushWakeupProof,
    eventBusProof,
    suggestionProof,
    gmObserverProof,
    answers:
      '已证明本轮新增的内存保留边界：邮箱缓存 LRU 有上限且加载失败释放 pending；兑换频率表会按 TTL 清理；恢复队列同 key 覆盖且有最大排队；Outbox 本地去重有环形上限；认证限流桶会清理过期项；flush wakeup key 有上限；EventBus drain/flush 后释放玩家和实例队列；建议文本服务端限长；GM world 不再保留 observer id。',
    excludes:
      '不证明正式服真实 RSS 曲线，也不证明全量业务缓存已改为懒加载；这里只覆盖本轮确定修复的保留边界。',
  }, null, 2));
}

async function proveMailboxCacheBound(): Promise<{ cacheSize: number; failedLoadPendingSize: number }> {
  const service = new MailRuntimeService(
    {},
    {},
    { loadMailbox: async () => null },
    {},
    {},
    {},
  );
  for (let index = 0; index < 5005; index += 1) {
    await service.ensurePlayerMailbox(`mail_cache_${index}`);
  }
  assert.equal(service.mailboxByPlayerId.size, 5000);

  const failing = new MailRuntimeService(
    {},
    {},
    { loadMailbox: async () => { throw new Error('simulated_mail_load_failure'); } },
    {},
    {},
    {},
  );
  await assert.rejects(() => failing.ensurePlayerMailbox('mail_cache_fail'));
  assert.equal(failing.loadingMailboxByPlayerId.size, 0);
  return { cacheSize: service.mailboxByPlayerId.size, failedLoadPendingSize: failing.loadingMailboxByPlayerId.size };
}

async function proveRedeemRateCachePrune(): Promise<{ before: number; after: number }> {
  const service = new RedeemCodeRuntimeService({}, {}, {}, {}, {});
  const now = Date.now();
  service._redeemRateMap = new Map([
    ['stale_a', now - 120_000],
    ['stale_b', now - 90_000],
    ['fresh', now],
  ]);
  const before = service._redeemRateMap.size;
  service.pruneRedeemRateMap(now);
  assert.equal(service._redeemRateMap.size, 1);
  assert.equal(service._redeemRateMap.has('fresh'), true);
  return { before, after: service._redeemRateMap.size };
}

async function proveRecoveryQueueBoundaries(): Promise<{ queued: number; maxQueued: number; firstRejected: boolean }> {
  process.env.SERVER_BOOTSTRAP_RECOVERY_QUEUE_MAX = '64';
  const service = new WorldSessionRecoveryQueueService();
  (service as unknown as { inFlight: number }).inFlight = 64;
  const first = service.enqueue({ key: 'same_player', run: async () => 'first' }).catch((error: unknown) => error);
  const second = service.enqueue({ key: 'same_player', run: async () => 'second' });
  const firstResult = await first;
  const snapshot = service.getSnapshot();
  assert.equal(firstResult instanceof Error && firstResult.message === 'recovery_queue_superseded', true);
  assert.equal(snapshot.queued, 1);
  assert.equal(snapshot.maxQueued, 64);
  (service as unknown as { inFlight: number }).inFlight = 0;
  await (service as unknown as { drain: () => Promise<void> }).drain();
  await second;
  return { queued: snapshot.queued, maxQueued: snapshot.maxQueued, firstRejected: true };
}

async function proveOutboxDedupeBound(): Promise<{ eventIds: number; operationIds: number }> {
  process.env.SERVER_OUTBOX_LOCAL_DEDUPE_LIMIT = '1000';
  const service = new OutboxDispatcherRuntimeService({ isEnabled: () => false } as never, null);
  for (let index = 0; index < 1005; index += 1) {
    service.markProcessedEvent(`event_${index}`, `operation_${index}`);
  }
  const state = service as unknown as {
    processedEventIds: Set<string>;
    processedOperationIds: Set<string>;
  };
  assert.equal(state.processedEventIds.size, 1000);
  assert.equal(state.processedOperationIds.size, 1000);
  assert.equal(state.processedEventIds.has('event_0'), false);
  assert.equal(state.processedEventIds.has('event_1004'), true);
  return { eventIds: state.processedEventIds.size, operationIds: state.processedOperationIds.size };
}

async function proveAuthRateLimitPrune(): Promise<{ before: number; after: number }> {
  const service = new NativeAuthRateLimitService();
  const state = service as unknown as {
    buckets: Map<string, { failures: number; blockedUntil: number; lastTouchedAt: number }>;
    lastPrunedAt: number;
  };
  const now = Date.now();
  state.buckets.set('login:ip:stale', { failures: 1, blockedUntil: 0, lastTouchedAt: now - 900_000 });
  state.buckets.set('login:ip:fresh', { failures: 1, blockedUntil: 0, lastTouchedAt: now });
  state.lastPrunedAt = 0;
  const before = state.buckets.size;
  service.recordFailure('login', { ip: '127.0.0.1' }, 'fresh_user');
  assert.equal(state.buckets.has('login:ip:stale'), false);
  assert.equal(state.buckets.has('login:ip:fresh'), true);
  return { before, after: state.buckets.size };
}

function proveFlushWakeupBound(): { count: number; oldestDropped: boolean; newestKept: boolean } {
  process.env.SERVER_FLUSH_WAKEUP_KEY_LIMIT = '128';
  const service = new FlushWakeupService();
  for (let index = 0; index < 140; index += 1) {
    service.signalPlayerFlush(`flush_player_${index}`);
  }
  const keys = service.listWakeupKeys();
  assert.equal(keys.length, 128);
  const oldestDropped = !keys.includes('flush:wakeup:player:flush_player_0');
  const newestKept = keys.includes('flush:wakeup:player:flush_player_139');
  assert.equal(oldestDropped, true);
  assert.equal(newestKept, true);
  return { count: keys.length, oldestDropped, newestKept };
}

function proveEventBusReleasesQueues(): {
  playerAfterDrain: number;
  instanceAfterDrain: number;
  playerAfterFlush: number;
  instanceAfterFlush: number;
} {
  const service = new RuntimeEventBusService();
  service.queuePlayerNotice('event_player_drain', { kind: 'info', text: 'drain' });
  service.queueCombatEffect('event_instance_drain', { type: 'float', x: 0, y: 0, text: 'drain' });
  assert.ok(service.drainPlayer('event_player_drain'));
  assert.ok(service.drainInstance('event_instance_drain'));
  const playerAfterDrain = service.getPlayerQueueCount();
  const instanceAfterDrain = service.getInstanceQueueCount();

  service.queuePlayerNotice('event_player_flush', { kind: 'info', text: 'flush' });
  service.queueCombatEffect('event_instance_flush', { type: 'float', x: 0, y: 0, text: 'flush' });
  service.flushTick();
  const playerAfterFlush = service.getPlayerQueueCount();
  const instanceAfterFlush = service.getInstanceQueueCount();

  assert.equal(playerAfterDrain, 0);
  assert.equal(instanceAfterDrain, 0);
  assert.equal(playerAfterFlush, 0);
  assert.equal(instanceAfterFlush, 0);
  return { playerAfterDrain, instanceAfterDrain, playerAfterFlush, instanceAfterFlush };
}

async function proveSuggestionTextBounds(): Promise<{ titleLength: number; descriptionLength: number; replyLength: number }> {
  let persisted: unknown = null;
  const service = new SuggestionRuntimeService({
    loadSuggestions: async () => null,
    saveSuggestions: async (document: unknown) => {
      persisted = document;
    },
  });
  const suggestion = await service.create('suggestion_player', 'suggestion_author'.repeat(10), '题'.repeat(80), '描'.repeat(700));
  assert.ok(suggestion);
  assert.equal(suggestion.title.length, 50);
  assert.equal(suggestion.description.length, 500);
  const reply = await service.addReply(suggestion.id, 'gm', 'gm', 'developer'.repeat(10), '回'.repeat(700));
  assert.ok(reply);
  const replyLength = reply.replies[0]?.content.length ?? 0;
  assert.equal(replyLength, 500);
  assert.ok(persisted);
  return { titleLength: suggestion.title.length, descriptionLength: suggestion.description.length, replyLength };
}

function proveGmWorldObserverIdsRemoved(): { retainedObserverField: boolean } {
  const source = readFileSync(resolve(process.cwd(), 'packages/server/src/http/native/native-gm-world.service.ts'), 'utf8');
  const retainedObserverField = source.includes('worldObserverIds');
  assert.equal(retainedObserverField, false);
  return { retainedObserverField };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
