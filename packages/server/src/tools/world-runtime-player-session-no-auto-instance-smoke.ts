// @ts-nocheck

const assert = require('node:assert/strict');

const { WorldRuntimePlayerSessionService } = require('../runtime/world/world-runtime-player-session.service');

function createPublicInstance(mapId, log) {
  return {
    meta: { instanceId: `public:${mapId}` },
    template: { id: mapId },
    connectPlayer(payload) {
      log.push(['connectPlayer', payload.playerId, payload.sessionId, payload.preferredX ?? null, payload.preferredY ?? null]);
      return { sessionId: payload.sessionId };
    },
    disconnectPlayer() {
      return true;
    },
    setPlayerMoveSpeed(playerId, speed) {
      log.push(['setPlayerMoveSpeed', playerId, speed]);
    },
  };
}

function createService(log, publicInstances) {
  return new WorldRuntimePlayerSessionService({
    resolveDefaultRespawnMapId() {
      log.push(['resolveDefaultRespawnMapId']);
      return 'yunlai_town';
    },
    getOrCreatePublicInstance(mapId) {
      log.push(['getOrCreatePublicInstance', mapId]);
      if (!publicInstances.has(mapId)) {
        publicInstances.set(mapId, createPublicInstance(mapId, log));
      }
      return publicInstances.get(mapId);
    },
    getOrCreateDefaultLineInstance(mapId, linePreset) {
      log.push(['getOrCreateDefaultLineInstance', mapId, linePreset]);
      if (linePreset === 'real') {
        throw new Error('unexpected real default line allocation');
      }
      if (!publicInstances.has(mapId)) {
        publicInstances.set(mapId, createPublicInstance(mapId, log));
      }
      return publicInstances.get(mapId);
    },
    getPlayerViewOrThrow(playerId, deps) {
      log.push(['getPlayerViewOrThrow', playerId]);
      const location = deps.getPlayerLocation(playerId);
      return {
        playerId,
        instanceId: location?.instanceId ?? '',
      };
    },
  });
}

function createDeps(log, publicInstances) {
  const playerLocations = new Map();
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
        return templateId === 'wildlands' || templateId === 'yunlai_town';
      },
    },
    worldRuntimeGmQueueService: {
      clearPendingRespawn(playerId) {
        log.push(['clearPendingRespawn', playerId]);
      },
    },
    worldRuntimeNavigationService: {
      clearNavigationIntent() {},
    },
    worldSessionService: {
      purgePlayerSession() {},
    },
    playerRuntimeService: {
      ensurePlayer(playerId, sessionId) {
        log.push(['ensurePlayer', playerId, sessionId]);
        return {
          attrs: {
            numericStats: {
              moveSpeed: 12,
            },
          },
        };
      },
      getPlayer() {
        return null;
      },
      removePlayerRuntime() {},
      syncFromWorldView(playerId, sessionId, view) {
        log.push(['syncFromWorldView', playerId, sessionId, view.instanceId]);
        return view;
      },
    },
    getPlayerLocation(playerId) {
      return playerLocations.get(playerId) ?? null;
    },
    setPlayerLocation(playerId, location) {
      playerLocations.set(playerId, location);
      log.push(['setPlayerLocation', playerId, location.instanceId]);
    },
    clearPlayerLocation(playerId) {
      playerLocations.delete(playerId);
    },
    clearPendingCommand() {},
    getInstanceRuntime(instanceId) {
      log.push(['getInstanceRuntime', instanceId]);
      return publicInstances.get(instanceId.replace(/^public:/, '')) ?? null;
    },
  };
}

function testMultiplePlayersDoNotAutoCreateExtraLines() {
  const log = [];
  const publicInstances = new Map();
  const service = createService(log, publicInstances);
  const deps = createDeps(log, publicInstances);

  const connected = [
    service.connectPlayer({ playerId: 'player:1', sessionId: 'session:1', mapId: 'wildlands' }, deps),
    service.connectPlayer({ playerId: 'player:2', sessionId: 'session:2', mapId: 'wildlands' }, deps),
    service.connectPlayer({ playerId: 'player:3', sessionId: 'session:3', mapId: 'wildlands' }, deps),
  ];

  assert.deepEqual(connected, [
    { playerId: 'player:1', instanceId: 'public:wildlands' },
    { playerId: 'player:2', instanceId: 'public:wildlands' },
    { playerId: 'player:3', instanceId: 'public:wildlands' },
  ]);
  assert.equal(publicInstances.size, 1);
  assert.equal(publicInstances.get('wildlands')?.meta.instanceId, 'public:wildlands');

  assert.deepEqual(
    log.filter((entry) => entry[0] === 'setPlayerLocation'),
    [
      ['setPlayerLocation', 'player:1', 'public:wildlands'],
      ['setPlayerLocation', 'player:2', 'public:wildlands'],
      ['setPlayerLocation', 'player:3', 'public:wildlands'],
    ],
  );
  assert.equal(log.filter((entry) => entry[0] === 'getOrCreateDefaultLineInstance').length, 3);
  assert.equal(log.some((entry) => `${entry}`.includes('real:wildlands')), false);
  assert.equal(log.some((entry) => `${entry}`.includes('line:wildlands')), false);
}

testMultiplePlayersDoNotAutoCreateExtraLines();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-player-session-no-auto-instance' }, null, 2));
