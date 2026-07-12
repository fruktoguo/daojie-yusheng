import assert from 'node:assert/strict';

import { NativeGmMailService } from '../http/native/native-gm-mail.service';

async function main(): Promise<void> {
  const onlinePlayerId = 'mail_broadcast_online';
  const persistedPlayerIds = Array.from({ length: 5_000 }, (_, index) => `mail_broadcast_offline_${index}`);
  let projectedPlayerIdQueryCount = 0;
  let directMailCallCount = 0;
  const broadcastCalls: Array<{ playerIds: string[]; batchId: string; input: unknown }> = [];

  const service = new NativeGmMailService(
    {
      async createDirectMail() {
        directMailCallCount += 1;
        return 'unexpected-direct-mail';
      },
      async createBroadcastMail(playerIds: readonly string[], batchId: string, input: unknown) {
        broadcastCalls.push({ playerIds: [...playerIds], batchId, input });
        return {
          mailIds: playerIds.length > 0 ? ['mail:broadcast:first'] : [],
          recipientCount: playerIds.length,
        };
      },
    } as never,
    {
      async listProjectedPlayerIds() {
        projectedPlayerIdQueryCount += 1;
        return [
          ...persistedPlayerIds,
          onlinePlayerId,
          'gm_bot_mail_broadcast',
        ];
      },
    } as never,
    {
      listPlayerIds() {
        return [
          onlinePlayerId,
          'gm_bot_mail_broadcast_online',
        ];
      },
    } as never,
  );

  const requestedBatchId = 'broadcast:client-retry:00000000-0000-4000-8000-000000000001';
  const result = await service.createBroadcastMail({
    batchId: requestedBatchId,
    fallbackTitle: '广播邮件容量证明',
    fallbackBody: '广播邮件容量证明',
  });
  const call = broadcastCalls[0];
  assert.ok(call);
  assert.equal(projectedPlayerIdQueryCount, 1);
  assert.equal(directMailCallCount, 0);
  assert.equal(broadcastCalls.length, 1);
  assert.equal(call.playerIds.length, 5_001);
  assert.equal(new Set(call.playerIds).size, 5_001);
  assert.equal(call.playerIds.includes(onlinePlayerId), true);
  assert.equal(call.playerIds.some((playerId) => playerId.startsWith('gm_bot_')), false);
  assert.equal(call.batchId, requestedBatchId);
  assert.equal(result.mailId, 'mail:broadcast:first');
  assert.equal(result.batchId, call.batchId);
  assert.equal(result.recipientCount, 5_001);

  console.log(JSON.stringify({
    ok: true,
    recipientCount: result.recipientCount,
    projectedPlayerIdQueryCount,
    broadcastPersistenceCallCount: broadcastCalls.length,
    directMailCallCount,
    answers: '全服广播只查询一次已投影玩家 ID，并把 5001 名去重、排除 GM bot 的收件人交给一次集合持久化调用；不会逐玩家装配完整快照或串行调用定向邮件。',
    excludes: '不证明真实 PostgreSQL 集合事务吞吐；该部分由 mail-structured-mutation-smoke 覆盖原子性和幂等。',
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
