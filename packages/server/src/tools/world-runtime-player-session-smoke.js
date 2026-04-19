"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimePlayerSessionService } = require("../runtime/world/world-runtime-player-session.service");

function createService(log) {
    return new WorldRuntimePlayerSessionService({
        resolveDefaultRespawnMapId() {
            log.push(['resolveDefaultRespawnMapId']);
            return 'yunlai_town';
        },
        getOrCreatePublicInstance(mapId) {
            log.push(['getOrCreatePublicInstance', mapId]);
            return {
                meta: { instanceId: `public:${mapId}` },
                connectPlayer(payload) {
                    log.push(['connectPlayer', payload]);
                    return { sessionId: payload.sessionId };
                },
                setPlayerMoveSpeed(playerId, speed) {
                    log.push(['setPlayerMoveSpeed', playerId, speed]);
                },
            };
        },
        getPlayerViewOrThrow(playerId) {
            log.push(['getPlayerViewOrThrow', playerId]);
            return { playerId };
        },
    });
}

function testConnectPlayer() {
    const log = [];
    const service = createService(log);
    const deps = {
        getPlayerLocation() { return null; },
        getInstanceRuntime() { return null; },
        setPlayerLocation(playerId, location) { log.push(['setPlayerLocation', playerId, location]); },
        worldRuntimeGmQueueService: { clearPendingRespawn(playerId) { log.push(['clearPendingRespawn', playerId]); } },
        playerRuntimeService: {
            ensurePlayer(playerId, sessionId) {
                log.push(['ensurePlayer', playerId, sessionId]);
                return { attrs: { numericStats: { moveSpeed: 12 } } };
            },
        },
        logger: { debug(message) { log.push(['debug', message]); } },
    };
    const view = service.connectPlayer({ playerId: 'player:1', sessionId: 'session:1' }, deps);
    assert.deepEqual(view, { playerId: 'player:1' });
    assert.deepEqual(log, [
        ['resolveDefaultRespawnMapId'],
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

function testDisconnectAndRemovePlayer() {
    const log = [];
    const service = createService(log);
    const deps = {
        getPlayerLocation(playerId) {
            return playerId === 'player:1' ? { instanceId: 'public:yunlai_town' } : null;
        },
        getInstanceRuntime(instanceId) {
            return instanceId === 'public:yunlai_town' ? {
                disconnectPlayer(playerId) {
                    log.push(['disconnectPlayer', playerId]);
                    return true;
                },
            } : null;
        },
        clearPlayerLocation(playerId) { log.push(['clearPlayerLocation', playerId]); },
        worldRuntimeNavigationService: { clearNavigationIntent(playerId) { log.push(['clearNavigationIntent', playerId]); } },
        clearPendingCommand(playerId) { log.push(['clearPendingCommand', playerId]); },
        worldRuntimeGmQueueService: { clearPendingRespawn(playerId) { log.push(['clearPendingRespawn', playerId]); } },
        worldSessionService: { purgePlayerSession(playerId, reason) { log.push(['purgePlayerSession', playerId, reason]); } },
        playerRuntimeService: {
            getPlayer(playerId) { return playerId === 'player:1' ? { playerId } : null; },
            removePlayerRuntime(playerId) { log.push(['removePlayerRuntime', playerId]); },
        },
    };
    assert.equal(service.disconnectPlayer('player:1', deps), true);
    assert.equal(service.removePlayer('player:1', 'removed', deps), true);
}

testConnectPlayer();
testDisconnectAndRemovePlayer();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-player-session' }, null, 2));
