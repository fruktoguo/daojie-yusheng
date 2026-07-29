// @ts-nocheck

import assert from 'node:assert/strict';

import { S2C } from '@mud/shared';
import { WorldClientEventService } from '../network/world-client-event.service';
import {
  buildWorldInstanceRoomId,
  buildWorldSectRoomId,
  WORLD_CONNECTED_PLAYERS_ROOM_ID,
  WorldSessionService,
} from '../network/world-session.service';

function createSocket(id: string, log: unknown[]) {
  return {
    id,
    join(room: string) {
      log.push(['join', id, room]);
    },
    leave(room: string) {
      log.push(['leave', id, room]);
    },
    emit(event: string, payload: unknown) {
      log.push(['socket.emit', id, event, payload]);
    },
    disconnect(close?: boolean) {
      log.push(['disconnect', id, close === true]);
    },
  };
}

function testInstanceRoomLifecycle(): void {
  const log: unknown[] = [];
  const emitted: unknown[] = [];
  const service = new WorldSessionService();
  service.attachSocketServer({
    to(room: string) {
      return {
        emit(event: string, payload: unknown) {
          emitted.push(['room.emit', room, event, payload]);
        },
      };
    },
  });

  service.registerSocket(createSocket('socket:1', log), 'player:1');
  service.registerSocket(createSocket('socket:2', log), 'player:2');

  assert.equal(service.syncPlayerInstanceRoom('player:1', 'instance:a'), true);
  assert.equal(service.syncPlayerInstanceRoom('player:2', 'instance:a'), true);
  assert.equal(service.syncPlayerSectChannel('player:1', 'sect:a'), true);
  assert.equal(service.syncPlayerSectChannel('player:2', 'sect:a'), true);
  assert.deepEqual(service.listInstancePlayerIds('instance:a').sort(), ['player:1', 'player:2']);
  assert.deepEqual(service.listSectPlayerIds('sect:a').sort(), ['player:1', 'player:2']);
  assert.deepEqual(log, [
    ['join', 'socket:1', WORLD_CONNECTED_PLAYERS_ROOM_ID],
    ['join', 'socket:2', WORLD_CONNECTED_PLAYERS_ROOM_ID],
    ['join', 'socket:1', buildWorldInstanceRoomId('instance:a')],
    ['join', 'socket:2', buildWorldInstanceRoomId('instance:a')],
    ['join', 'socket:1', buildWorldSectRoomId('sect:a')],
    ['join', 'socket:2', buildWorldSectRoomId('sect:a')],
  ]);

  service.emitToInstance('instance:a', S2C.Notice, { items: [{ kind: 'chat', text: 'hi', from: '甲' }] });
  assert.deepEqual(emitted, [
    ['room.emit', buildWorldInstanceRoomId('instance:a'), S2C.Notice, { items: [{ kind: 'chat', text: 'hi', from: '甲' }] }],
  ]);
  service.emitToAll(S2C.ChatMessage, { messageId: 'chat:1', channel: 'world', text: '天下好', from: '甲' });
  assert.deepEqual(emitted[1], [
    'room.emit',
    WORLD_CONNECTED_PLAYERS_ROOM_ID,
    S2C.ChatMessage,
    { messageId: 'chat:1', channel: 'world', text: '天下好', from: '甲' },
  ]);
  service.emitToSect('sect:a', S2C.ChatMessage, { messageId: 'chat:2', channel: 'sect', text: '宗门好', from: '甲' });
  assert.deepEqual(emitted[2], [
    'room.emit',
    buildWorldSectRoomId('sect:a'),
    S2C.ChatMessage,
    { messageId: 'chat:2', channel: 'sect', text: '宗门好', from: '甲' },
  ]);

  assert.equal(service.syncPlayerInstanceRoom('player:1', 'instance:b'), true);
  assert.deepEqual(service.listInstancePlayerIds('instance:a'), ['player:2']);
  assert.deepEqual(service.listInstancePlayerIds('instance:b'), ['player:1']);
  assert.deepEqual(log.slice(6), [
    ['leave', 'socket:1', buildWorldInstanceRoomId('instance:a')],
    ['join', 'socket:1', buildWorldInstanceRoomId('instance:b')],
  ]);

  service.unregisterSocket('socket:1');
  assert.deepEqual(service.listInstancePlayerIds('instance:b'), []);
  assert.deepEqual(service.listSectPlayerIds('sect:a'), ['player:2']);
  assert.deepEqual(log.slice(8), [
    ['leave', 'socket:1', buildWorldInstanceRoomId('instance:b')],
    ['leave', 'socket:1', buildWorldSectRoomId('sect:a')],
    ['leave', 'socket:1', WORLD_CONNECTED_PLAYERS_ROOM_ID],
  ]);

  service.registerSocket(createSocket('socket:3', log), 'player:1');
  assert.deepEqual(log.slice(11), [
    ['join', 'socket:3', WORLD_CONNECTED_PLAYERS_ROOM_ID],
    ['join', 'socket:3', buildWorldInstanceRoomId('instance:b')],
  ], '重连时不得依据离线前缓存宗门提前加入旧宗门房间');
  assert.equal(service.syncPlayerSectChannel('player:1', 'sect:b'), true);
  assert.deepEqual(log[13], ['join', 'socket:3', buildWorldSectRoomId('sect:b')]);
  assert.deepEqual(service.listSectPlayerIds('sect:a'), ['player:2']);
  assert.deepEqual(service.listSectPlayerIds('sect:b'), ['player:1']);
}

function testChatBroadcastUsesInstanceRoom(): void {
  const log: unknown[] = [];
  const roomEmits: unknown[] = [];
  const sessionService = new WorldSessionService();
  sessionService.attachSocketServer({
    to(room: string) {
      return {
        emit(event: string, payload: unknown) {
          roomEmits.push(['room.emit', room, event, payload]);
        },
      };
    },
  });
  sessionService.registerSocket(createSocket('socket:1', log), 'player:1');
  sessionService.registerSocket(createSocket('socket:2', log), 'player:2');
  sessionService.syncPlayerInstanceRoom('player:1', 'instance:a');
  sessionService.syncPlayerInstanceRoom('player:2', 'instance:b');

  const eventService = new WorldClientEventService(
    null as never,
    null as never,
    {
      getPlayer(playerId: string) {
        if (playerId === 'player:1') {
          return { playerId, name: '甲', displayName: '甲', instanceId: 'instance:a' };
        }
        if (playerId === 'player:2') {
          return { playerId, name: '乙', displayName: '乙', instanceId: 'instance:b' };
        }
        return null;
      },
    } as never,
    sessionService as never,
    null as never,
    null as never,
  );

  eventService.broadcastChat('player:1', { message: '<hello>' });

  assert.equal(roomEmits.length, 1);
  assert.deepEqual(roomEmits[0]?.slice(0, 3), ['room.emit', buildWorldInstanceRoomId('instance:a'), S2C.Notice]);
  const payload = roomEmits[0]?.[3] as any;
  const item = payload?.items?.[0];
  assert.equal(item?.kind, 'chat');
  assert.equal(item?.text, '&lt;hello&gt;');
  assert.equal(item?.from, '甲');
  assert.equal(item?.scope, 'nearby');
  assert.equal(typeof item?.occurredAt, 'number');
  assert.equal(typeof item?.messageId, 'string');
  assert.equal(log.some((entry) => Array.isArray(entry) && entry[0] === 'socket.emit'), false);
}

function testSocketReplacementCleansSectIndex(): void {
  const log: unknown[] = [];
  const service = new WorldSessionService();
  service.registerSocket(createSocket('socket:old', log), 'player:replace');
  service.syncPlayerSectChannel('player:replace', 'sect:old');

  service.registerSocket(createSocket('socket:new', log), 'player:replace');

  assert.deepEqual(
    service.listSectPlayerIds('sect:old'),
    [],
    '新 socket 替换旧连接时必须同步移除旧宗门索引',
  );
  assert.equal(service.syncPlayerSectChannel('player:replace', 'sect:new'), true);
  assert.deepEqual(service.listSectPlayerIds('sect:new'), ['player:replace']);
}

testInstanceRoomLifecycle();
testChatBroadcastUsesInstanceRoom();
testSocketReplacementCleansSectIndex();

console.log(JSON.stringify({ ok: true, case: 'world-session-instance-room' }, null, 2));
