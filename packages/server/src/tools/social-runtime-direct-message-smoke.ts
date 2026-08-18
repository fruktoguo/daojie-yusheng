import assert from 'node:assert/strict';

import { SocialRuntimeService } from '../runtime/social/social-runtime.service';

async function main(): Promise<void> {
  let insertedMessageParams: unknown[] | null = null;
  let readLookupParams: unknown[] | null = null;
  let readMarkerParams: unknown[] | null = null;
  let readMarkerSql = '';
  const pruneParams: unknown[][] = [];
  const pool = {
    async connect() {
      throw new Error('本用例不应申请事务连接');
    },
    async query(sql: string, params: unknown[] = []) {
      if (sql.includes('SELECT level FROM player_daoist_relation')) {
        return { rows: [{ level: 'dao_friend' }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO player_daoist_message (')) {
        insertedMessageParams = params;
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('SELECT message_id, from_player_id, from_name')) {
        assert.ok(insertedMessageParams);
        return {
          rows: [{
            message_id: insertedMessageParams[0],
            from_player_id: insertedMessageParams[3],
            from_name: insertedMessageParams[4],
            to_player_id: insertedMessageParams[5],
            to_name: insertedMessageParams[6],
            text: insertedMessageParams[7],
            sent_at_ms: insertedMessageParams[8],
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('SELECT message_id, sent_at_ms')) {
        assert.ok(insertedMessageParams);
        readLookupParams = params;
        const cursorMatches = params[4] === insertedMessageParams[0] && params[5] === insertedMessageParams[8];
        return cursorMatches
          ? { rows: [{ message_id: insertedMessageParams[0], sent_at_ms: insertedMessageParams[8] }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (sql.includes('INSERT INTO player_daoist_message_read')) {
        readMarkerSql = sql;
        readMarkerParams = params;
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('DELETE FROM player_daoist_message')) {
        pruneParams.push(params);
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`未覆盖 SQL：${sql.trim().slice(0, 80)}`);
    },
  };
  const service = new SocialRuntimeService(
    { getPool: () => pool } as never,
    { getPlayer: (playerId: string) => playerId === 'player:a' ? { playerId, name: '甲' } : null } as never,
    {
      getMemoryUserByPlayerId: (playerId: string) => playerId === 'player:b' ? { playerName: '乙' } : null,
    },
  );
  (service as unknown as { pool: typeof pool; enabled: boolean }).pool = pool;
  (service as unknown as { pool: typeof pool; enabled: boolean }).enabled = true;

  const sent = await service.createDirectMessage('player:a', 'player:b', '<你好>');
  assert.equal(sent.ok, true);
  assert.equal(sent.message?.fromName, '甲');
  assert.equal(sent.message?.toName, '乙');
  assert.equal(sent.message?.text, '<你好>');

  const loaded = await service.loadDirectMessageHistory(
    'player:b',
    'player:a',
    { occurredAt: 0, messageId: '' },
    'daoist-history:1',
  );
  assert.equal(loaded.ok, true);
  assert.equal(loaded.history?.requestId, 'daoist-history:1');
  assert.equal(loaded.history?.messages.length, 1);
  assert.equal(loaded.history?.messages[0]?.text, '<你好>');

  assert.equal((await service.markDirectMessagesRead('player:b', 'player:a', {
    occurredAt: sent.message?.sentAt ?? 0,
    messageId: sent.message?.messageId ?? '',
  })).ok, true);
  assert.deepEqual(readLookupParams, [
    'player:a',
    'player:b',
    'player:a',
    'player:b',
    sent.message?.messageId,
    sent.message?.sentAt,
  ]);
  assert.deepEqual(readMarkerParams?.slice(0, 2), ['player:b', 'player:a']);
  assert.match(
    readMarkerSql,
    /WHERE \(player_daoist_message_read\.last_read_at_ms, player_daoist_message_read\.last_read_message_id\)\s*< \(EXCLUDED\.last_read_at_ms, EXCLUDED\.last_read_message_id\)/,
    '私聊已读游标必须只允许单调前进，旧请求乱序完成时不能回退',
  );
  assert.deepEqual(
    await service.markDirectMessagesRead('player:b', 'player:a', { occurredAt: 1, messageId: 'unknown' }),
    { ok: false, reason: 'invalid_read_cursor' },
    '服务端不能把客户端尚未展示的消息提前标记为已读',
  );

  for (let index = 1; index < 10; index += 1) {
    assert.equal((await service.createDirectMessage('player:a', 'player:b', `消息-${index}`)).ok, true);
  }
  const busy = await service.createDirectMessage('player:a', 'player:b', '超出突发预算');
  assert.equal(busy.ok, false);
  assert.equal(busy.reason, 'message_channel_busy');
  await service.onModuleDestroy();
  assert.deepEqual(pruneParams, [['player:a', 'player:b']]);

  console.log(JSON.stringify({ ok: true, case: 'social-runtime-direct-message' }, null, 2));
}

void main();
