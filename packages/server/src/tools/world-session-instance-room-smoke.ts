// @ts-nocheck

import assert from 'node:assert/strict';

import { S2C } from '@mud/shared';
import { WorldClientEventService } from '../network/world-client-event.service';
import { buildWorldInstanceRoomId, WorldSessionService } from '../network/world-session.service';

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
  assert.deepEqual(service.listInstancePlayerIds('instance:a').sort(), ['player:1', 'player:2']);
  assert.deepEqual(log, [
    ['join', 'socket:1', buildWorldInstanceRoomId('instance:a')],
    ['join', 'socket:2', buildWorldInstanceRoomId('instance:a')],
  ]);

  service.emitToInstance('instance:a', S2C.Notice, { items: [{ kind: 'chat', text: 'hi', from: '甲' }] });
  assert.deepEqual(emitted, [
    ['room.emit', buildWorldInstanceRoomId('instance:a'), S2C.Notice, { items: [{ kind: 'chat', text: 'hi', from: '甲' }] }],
  ]);

  assert.equal(service.syncPlayerInstanceRoom('player:1', 'instance:b'), true);
  assert.deepEqual(service.listInstancePlayerIds('instance:a'), ['player:2']);
  assert.deepEqual(service.listInstancePlayerIds('instance:b'), ['player:1']);
  assert.deepEqual(log.slice(2), [
    ['leave', 'socket:1', buildWorldInstanceRoomId('instance:a')],
    ['join', 'socket:1', buildWorldInstanceRoomId('instance:b')],
  ]);

  service.unregisterSocket('socket:1');
  assert.deepEqual(service.listInstancePlayerIds('instance:b'), []);
  assert.deepEqual(log.slice(4), [
    ['leave', 'socket:1', buildWorldInstanceRoomId('instance:b')],
  ]);
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
    null as never,
    sessionService as never,
    null as never,
  );

  eventService.broadcastChat('player:1', { message: '<hello>' });

  assert.deepEqual(roomEmits, [
    [
      'room.emit',
      buildWorldInstanceRoomId('instance:a'),
      S2C.Notice,
      { items: [{ kind: 'chat', text: '&lt;hello&gt;', from: '甲' }] },
    ],
  ]);
  assert.equal(log.some((entry) => Array.isArray(entry) && entry[0] === 'socket.emit'), false);
}

testInstanceRoomLifecycle();
testChatBroadcastUsesInstanceRoom();

console.log(JSON.stringify({ ok: true, case: 'world-session-instance-room' }, null, 2));
