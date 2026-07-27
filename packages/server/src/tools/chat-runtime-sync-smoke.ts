import assert from 'node:assert/strict';

import { S2C, type ChatHistorySyncView, type ServerChatMessageView } from '@mud/shared';
import { buildSelfDelta, captureSelfState } from '../network/world-projector.helpers';
import { ChatRuntimeService } from '../runtime/chat/chat-runtime.service';

async function main(): Promise<void> {
  const players = new Map<string, Record<string, unknown>>([
    ['player:a', { playerId: 'player:a', name: '甲', instanceId: 'instance:a', sectId: 'sect:a', x: 10, y: 10 }],
    ['player:b', { playerId: 'player:b', name: '乙', instanceId: 'instance:a', sectId: 'sect:a', x: 12, y: 11 }],
    ['player:c', { playerId: 'player:c', name: '丙', instanceId: 'instance:a', sectId: 'sect:b', x: 99, y: 99 }],
  ]);
  const emittedByPlayer = new Map<string, Array<{ event: string; payload: unknown }>>();
  const worldMessages: ServerChatMessageView[] = [];
  const sectMessages: ServerChatMessageView[] = [];
  let instanceFallbackReads = 0;
  let visiblePlayerQueries = 0;
  const socketFor = (playerId: string) => ({
    emit(event: string, payload: unknown): void {
      const entries = emittedByPlayer.get(playerId) ?? [];
      entries.push({ event, payload });
      emittedByPlayer.set(playerId, entries);
    },
  });
  const sessionService = {
    getSocketByPlayerId: socketFor,
    emitToAll(event: string, payload: unknown): boolean {
      assert.equal(event, S2C.ChatMessage);
      worldMessages.push(payload as ServerChatMessageView);
      return true;
    },
    emitToSect(_sectId: unknown, event: string, payload: unknown): boolean {
      assert.equal(event, S2C.ChatMessage);
      sectMessages.push(payload as ServerChatMessageView);
      return true;
    },
    getBinding: () => ({ connected: true, socketId: 'socket:new' }),
    getConnectedPlayerCount: () => 3,
    getSectPlayerCount: () => 2,
    listBindings: () => [],
    syncPlayerSectChannel: () => true,
    syncPlayerInstanceRoom: () => true,
    listSectPlayerIds: () => ['player:a', 'player:b'],
    listInstancePlayerIds: () => {
      instanceFallbackReads += 1;
      return ['player:a', 'player:b', 'player:c'];
    },
  };
  const service = new ChatRuntimeService(
    {} as never,
    { getPlayer: (playerId: string) => players.get(playerId) ?? null } as never,
    sessionService as never,
  );

  await service.handlePlayerChat('player:a', { channel: 'world', message: '<天下>' });
  assert.equal(worldMessages.length, 1);
  assert.equal(worldMessages[0].text, '<天下>');

  await service.handlePlayerChat('player:a', { channel: 'sect', message: '宗门消息' });
  assert.equal(sectMessages.length, 1);
  assert.equal(sectMessages[0].text, '宗门消息');
  assert.equal(emittedByPlayer.size, 0);

  emittedByPlayer.clear();
  await service.handlePlayerChat('player:a', { channel: 'nearby', message: '<附近>' }, {
    getInstanceRuntime(instanceId: string) {
      assert.equal(instanceId, 'instance:a');
      return {
        collectVisiblePlayers(observer: { playerId: string; x: number; y: number }, radius: number) {
          visiblePlayerQueries += 1;
          assert.deepEqual(observer, { playerId: 'player:a', x: 10, y: 10 });
          assert.equal(radius > 0, true);
          return [{ playerId: 'player:b' }];
        },
      };
    },
  });
  assert.equal(emittedByPlayer.get('player:a')?.length, 1);
  assert.equal(emittedByPlayer.get('player:b')?.length, 1);
  assert.equal(emittedByPlayer.get('player:c')?.length ?? 0, 0);
  assert.equal((emittedByPlayer.get('player:a')?.[0]?.payload as ServerChatMessageView).text, '<附近>');
  assert.equal(visiblePlayerQueries, 1);
  assert.equal(instanceFallbackReads, 0);

  let history: ChatHistorySyncView | null = null;
  await service.emitHistory({ emit: (_event, payload) => { history = payload as ChatHistorySyncView; } }, 'player:a', {
    requestId: 'chat-history:1',
    cursors: {
      world: { occurredAt: worldMessages[0].occurredAt, messageId: worldMessages[0].messageId },
    },
  });
  assert.equal(history?.requestId, 'chat-history:1');
  assert.equal(history?.channels.find((entry) => entry.channel === 'world')?.messages.length, 0);
  assert.equal(history?.channels.find((entry) => entry.channel === 'sect')?.messages.length, 1);
  assert.equal(history?.channels.find((entry) => entry.channel === 'nearby')?.messages.length, 1);

  let staleHistoryEmitted = false;
  await service.emitHistory({
    id: 'socket:old',
    emit: () => { staleHistoryEmitted = true; },
  }, 'player:a', { requestId: 'chat-history:stale' });
  assert.equal(staleHistoryEmitted, false, '异步历史响应不得回发到已被替换的旧 socket');

  const projectorPlayer = {
    selfRevision: 1,
    instanceId: 'instance:a',
    templateId: 'map:a',
    sectId: null,
    x: 10,
    y: 10,
    facing: 'down',
    hp: 100,
    maxHp: 100,
    qi: 50,
    maxQi: 50,
    wallet: null,
    movementCapabilities: { staticObstacleIgnore: false },
  } as any;
  const selfDelta = buildSelfDelta({
    selfRevision: projectorPlayer.selfRevision,
    self: captureSelfState(projectorPlayer),
  } as any, {
    ...projectorPlayer,
    selfRevision: 2,
    sectId: 'sect:a',
  });
  assert.equal(selfDelta?.sid, 'sect:a', '宗门变化必须通过低频 SelfDelta 更新客户端聊天作用域');

  const admissionErrors: unknown[] = [];
  const admissionBroadcasts: ServerChatMessageView[] = [];
  const admissionService = new ChatRuntimeService(
    {} as never,
    { getPlayer: () => players.get('player:a') ?? null } as never,
    {
      getSocketByPlayerId: () => ({
        emit(event: string, payload: unknown) {
          if (event === S2C.Error) admissionErrors.push(payload);
        },
      }),
      emitToAll: (_event: string, payload: unknown) => {
        admissionBroadcasts.push(payload as ServerChatMessageView);
        return true;
      },
      getConnectedPlayerCount: () => 1,
      listBindings: () => [],
    } as never,
  );
  for (let index = 0; index < 4; index += 1) {
    await admissionService.handlePlayerChat('player:a', { channel: 'world', message: `天下-${index}` });
  }
  assert.equal(admissionBroadcasts.length, 3, '世界频道突发消息必须受频道级背压保护');
  assert.equal((admissionErrors[0] as any)?.code, 'CHAT_CHANNEL_BUSY');

  const deliveryBroadcasts: unknown[] = [];
  const deliveryErrors: unknown[] = [];
  const deliveryService = new ChatRuntimeService(
    {} as never,
    { getPlayer: () => players.get('player:a') ?? null } as never,
    {
      getSocketByPlayerId: () => ({ emit: (_event: string, payload: unknown) => deliveryErrors.push(payload) }),
      getConnectedPlayerCount: () => 5_000,
      emitToAll: (_event: string, payload: unknown) => {
        deliveryBroadcasts.push(payload);
        return true;
      },
      listBindings: () => [],
    } as never,
  );
  const maxLengthMessage = '界'.repeat(200);
  await deliveryService.handlePlayerChat('player:a', { channel: 'world', message: maxLengthMessage });
  await deliveryService.handlePlayerChat('player:a', { channel: 'world', message: maxLengthMessage });
  assert.equal(deliveryBroadcasts.length, 1, '5000 人世界频道必须受估算投递字节预算保护');
  assert.equal((deliveryErrors[0] as any)?.code, 'CHAT_CHANNEL_BUSY');

  console.log(JSON.stringify({ ok: true, case: 'chat-runtime-sync' }, null, 2));
}

void main();
