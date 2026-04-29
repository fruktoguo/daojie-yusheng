// @ts-nocheck

const assert = require('node:assert/strict');

const { WorldRuntimePlayerSessionService } = require('../runtime/world/world-runtime-player-session.service');
const { WorldRuntimeWorldAccessService } = require('../runtime/world/world-runtime-world-access.service');

function createPlayerSessionService(log = []) {
  return new WorldRuntimePlayerSessionService({
    resolveDefaultRespawnMapId() {
      log.push(['resolveDefaultRespawnMapId']);
      return 'yunlai_town';
    },
    getOrCreatePublicInstance(mapId) {
      log.push(['getOrCreatePublicInstance', mapId]);
      return {
        meta: { instanceId: `public:${mapId}` },
        template: { id: mapId },
        connectPlayer(payload) {
          log.push(['connectPlayer', payload]);
          return { sessionId: payload.sessionId };
        },
        disconnectPlayer(playerId) {
          log.push(['disconnectPlayer', playerId]);
          return true;
        },
        setPlayerMoveSpeed(playerId, moveSpeed) {
          log.push(['setPlayerMoveSpeed', playerId, moveSpeed]);
        },
      };
    },
    getPlayerViewOrThrow(playerId) {
      log.push(['getPlayerViewOrThrow', playerId]);
      return { playerId };
    },
  });
}

function createPlayerSessionDeps(log = [], overrides = {}) {
  return {
    logger: {
      debug(message) {
        log.push(['debug', message]);
      },
      warn(message) {
        log.push(['warn', message]);
      },
    },
    templateRepository: {
      has(templateId) {
        return templateId === 'yunlai_town';
      },
    },
    worldRuntimeGmQueueService: {
      clearPendingRespawn(playerId) {
        log.push(['clearPendingRespawn', playerId]);
      },
    },
    worldRuntimeNavigationService: {
      clearNavigationIntent(playerId) {
        log.push(['clearNavigationIntent', playerId]);
      },
    },
    worldSessionService: {
      purgePlayerSession(playerId, reason) {
        log.push(['purgePlayerSession', playerId, reason]);
      },
    },
    playerRuntimeService: {
      ensurePlayer(playerId, sessionId) {
        log.push(['ensurePlayer', playerId, sessionId]);
        return { attrs: { numericStats: { moveSpeed: 12 } } };
      },
      getPlayer(playerId) {
        return playerId === 'player:1' ? { playerId } : null;
      },
      removePlayerRuntime(playerId) {
        log.push(['removePlayerRuntime', playerId]);
      },
    },
    getPlayerLocation() {
      return null;
    },
    setPlayerLocation(playerId, location) {
      log.push(['setPlayerLocation', playerId, location]);
    },
    clearPlayerLocation(playerId) {
      log.push(['clearPlayerLocation', playerId]);
    },
    clearPendingCommand(playerId) {
      log.push(['clearPendingCommand', playerId]);
    },
    getInstanceRuntime(instanceId) {
      log.push(['getInstanceRuntime', instanceId]);
      return overrides.instances?.get(instanceId) ?? null;
    },
  };
}

function testMissingManualOrRealInstanceFallsBackToPeacefulPublicEntry() {
  const log = [];
  const service = createPlayerSessionService(log);
  const deps = createPlayerSessionDeps(log);
  const result = service.connectPlayer({
    playerId: 'player:1',
    sessionId: 'session:1',
    instanceId: 'real:yunlai_town',
    preferredX: 8,
    preferredY: 9,
  }, deps);
  assert.deepEqual(result, { playerId: 'player:1' });
  assert.deepEqual(log, [
    ['getInstanceRuntime', 'real:yunlai_town'],
    ['resolveDefaultRespawnMapId'],
    ['warn', '玩家 player:1 恢复落点 instanceId 未命中现有实例，且无法映射为公共实例，已退回 mapId：instanceId=real:yunlai_town templateId=yunlai_town'],
    ['getOrCreatePublicInstance', 'yunlai_town'],
    ['connectPlayer', { playerId: 'player:1', sessionId: 'session:1', preferredX: 8, preferredY: 9 }],
    ['ensurePlayer', 'player:1', 'session:1'],
    ['setPlayerMoveSpeed', 'player:1', 12],
    ['setPlayerLocation', 'player:1', { instanceId: 'public:yunlai_town', sessionId: 'session:1' }],
    ['clearPendingRespawn', 'player:1'],
    ['debug', '玩家 player:1 已附着到实例 public:yunlai_town'],
    ['getPlayerViewOrThrow', 'player:1'],
  ]);
}

function testMissingPeacefulPublicInstanceIdStillResolvesToPeacefulEntry() {
  const log = [];
  const service = createPlayerSessionService(log);
  const deps = createPlayerSessionDeps(log);
  const result = service.connectPlayer({
    playerId: 'player:1',
    sessionId: 'session:1',
    instanceId: 'public:yunlai_town',
  }, deps);
  assert.deepEqual(result, { playerId: 'player:1' });
  assert.deepEqual(log, [
    ['getInstanceRuntime', 'public:yunlai_town'],
    ['getOrCreatePublicInstance', 'yunlai_town'],
    ['connectPlayer', { playerId: 'player:1', sessionId: 'session:1', preferredX: undefined, preferredY: undefined }],
    ['ensurePlayer', 'player:1', 'session:1'],
    ['setPlayerMoveSpeed', 'player:1', 12],
    ['setPlayerLocation', 'player:1', { instanceId: 'public:yunlai_town', sessionId: 'session:1' }],
    ['clearPendingRespawn', 'player:1'],
    ['debug', '玩家 player:1 已附着到实例 public:yunlai_town'],
    ['getPlayerViewOrThrow', 'player:1'],
  ]);
}

function testWorldAccessPublicInstancePathDoesNotAutoExpandLines() {
  const log = [];
  const service = new WorldRuntimeWorldAccessService({
    buildRuntimeSummary() {
      return {};
    },
  });
  const instance = service.getOrCreatePublicInstance('yunlai_town', {
    templateRepository: {
      has(templateId) {
        return templateId === 'yunlai_town';
      },
    },
    createInstance(input) {
      log.push(input);
      return { meta: { instanceId: input.instanceId } };
    },
  });
  assert.deepEqual(instance, { meta: { instanceId: 'public:yunlai_town' } });
  assert.deepEqual(log, [{
    instanceId: 'public:yunlai_town',
    templateId: 'yunlai_town',
    kind: 'public',
    persistent: true,
    linePreset: 'peaceful',
    lineIndex: 1,
    instanceOrigin: 'bootstrap',
    defaultEntry: true,
  }]);
}

testMissingManualOrRealInstanceFallsBackToPeacefulPublicEntry();
testMissingPeacefulPublicInstanceIdStillResolvesToPeacefulEntry();
testWorldAccessPublicInstancePathDoesNotAutoExpandLines();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-instance-entry-fallback' }, null, 2));
