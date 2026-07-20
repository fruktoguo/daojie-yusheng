// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeRespawnService } = require("../runtime/world/world-runtime-respawn.service");
const { installSmokeTimeout } = require("./smoke-timeout");

installSmokeTimeout(__filename);

function createPlayerRuntimeService(log, overrides = {}) {
    return {
        getPlayer(playerId) {
            if (playerId !== 'player:1') {
                return null;
            }
            return {
                sessionId: 'session:1',
                templateId: 'wildlands',
                hp: 0,
                ...overrides,
                attrs: {
                    numericStats: {
                        moveSpeed: 12,
                    },
                    ...(overrides.attrs ?? {}),
                },
            };
        },
        respawnPlayer(playerId, input) {
            log.push(['respawnPlayer', playerId, input.templateId, input.instanceId, input.x, input.y]);
        },
    };
}

function createDeps(currentMapId, log, overrides = {}) {
    const walkableMask = new Uint8Array(64 * 64).fill(1);
    walkableMask[0] = 0;
    const previousInstance = {
        template: {
            id: currentMapId,
        },
        disconnectPlayer(playerId) {
            log.push(['disconnectPlayer', currentMapId, playerId]);
            return true;
        },
    };
    const targetInstance = overrides.targetInstance ?? {
        meta: {
            instanceId: `public:${currentMapId === 'prison' ? 'prison' : 'yunlai_town'}`,
        },
        template: {
            id: currentMapId === 'prison' ? 'prison' : 'yunlai_town',
            name: currentMapId === 'prison' ? '监牢' : '云来镇',
            width: 64,
            height: 64,
            spawnX: 10,
            spawnY: 10,
            walkableMask,
        },
        tick: 88,
        connectPlayer(input) {
            log.push(['connectPlayer', this.template.id, input.preferredX, input.preferredY]);
            return {
                sessionId: input.sessionId,
                x: input.preferredX,
                y: input.preferredY,
                facing: 'south',
            };
        },
        setPlayerMoveSpeed(playerId, moveSpeed) {
            log.push(['setPlayerMoveSpeed', this.template.id, playerId, moveSpeed]);
        },
    };
    const instancesById = new Map([
        [`public:${currentMapId}`, previousInstance],
        ...(Array.isArray(overrides.instances) ? overrides.instances : []),
    ]);
    return {
        getPlayerLocation(playerId) {
            return playerId === 'player:1'
                ? { instanceId: `public:${currentMapId}`, sessionId: 'session:1' }
                : null;
        },
        getInstanceRuntime(instanceId) {
            return instancesById.get(instanceId) ?? null;
        },
        clearPendingCommand(playerId) {
            log.push(['clearPendingCommand', playerId]);
        },
        resolveDefaultRespawnMapId() {
            log.push(['resolveDefaultRespawnMapId']);
            return 'yunlai_town';
        },
        getOrCreatePublicInstance(templateId) {
            log.push(['getOrCreatePublicInstance', templateId]);
            if (templateId !== targetInstance.template.id) {
                throw new Error(`unexpected target map: ${templateId}`);
            }
            return targetInstance;
        },
        worldRuntimeSectService: overrides.worldRuntimeSectService,
        setPlayerLocation(playerId, location) {
            log.push(['setPlayerLocation', playerId, location.instanceId]);
        },
        worldRuntimeNavigationService: {
            clearNavigationIntent(playerId) {
                log.push(['clearNavigationIntent', playerId]);
            },
        },
        queuePlayerNotice(playerId, message, kind) {
            log.push(['queuePlayerNotice', playerId, message, kind]);
        },
    };
}

function testRespawnFromDefaultMap() {
    const log = [];
    const service = new WorldRuntimeRespawnService(createPlayerRuntimeService(log));
    service.respawnPlayer('player:1', createDeps('wildlands', log));
    assert.deepEqual(log, [
        ['clearPendingCommand', 'player:1'],
        ['resolveDefaultRespawnMapId'],
        ['getOrCreatePublicInstance', 'yunlai_town'],
        ['connectPlayer', 'yunlai_town', 10, 10],
        ['disconnectPlayer', 'wildlands', 'player:1'],
        ['setPlayerMoveSpeed', 'yunlai_town', 'player:1', 12],
        ['setPlayerLocation', 'player:1', 'public:yunlai_town'],
        ['clearNavigationIntent', 'player:1'],
        ['respawnPlayer', 'player:1', 'yunlai_town', 'public:yunlai_town', 10, 10],
        ['queuePlayerNotice', 'player:1', '已在 云来镇 复生', 'travel'],
    ]);
}

function testRespawnInsidePrisonKeepsPlayerInPrison() {
    const log = [];
    const service = new WorldRuntimeRespawnService(createPlayerRuntimeService(log));
    service.respawnPlayer('player:1', createDeps('prison', log));
    assert.deepEqual(log, [
        ['clearPendingCommand', 'player:1'],
        ['getOrCreatePublicInstance', 'prison'],
        ['connectPlayer', 'prison', 10, 10],
        ['disconnectPlayer', 'prison', 'player:1'],
        ['setPlayerMoveSpeed', 'prison', 'player:1', 12],
        ['setPlayerLocation', 'player:1', 'public:prison'],
        ['clearNavigationIntent', 'player:1'],
        ['respawnPlayer', 'player:1', 'prison', 'public:prison', 10, 10],
        ['queuePlayerNotice', 'player:1', '已在 监牢 复生', 'travel'],
    ]);
}

function testInvalidBoundRespawnPointFallsBackToMapSpawn() {
    const log = [];
    const service = new WorldRuntimeRespawnService(createPlayerRuntimeService(log, {
        respawnTemplateId: 'yunlai_town',
        respawnX: 0,
        respawnY: 0,
    }));
    service.respawnPlayer('player:1', createDeps('wildlands', log));
    assert.deepEqual(log, [
        ['clearPendingCommand', 'player:1'],
        ['getOrCreatePublicInstance', 'yunlai_town'],
        ['connectPlayer', 'yunlai_town', 10, 10],
        ['disconnectPlayer', 'wildlands', 'player:1'],
        ['setPlayerMoveSpeed', 'yunlai_town', 'player:1', 12],
        ['setPlayerLocation', 'player:1', 'public:yunlai_town'],
        ['clearNavigationIntent', 'player:1'],
        ['respawnPlayer', 'player:1', 'yunlai_town', 'public:yunlai_town', 10, 10],
        ['queuePlayerNotice', 'player:1', '已在 云来镇 复生', 'travel'],
    ]);
}

function testBoundSectRespawnUsesSectInstance() {
    const log = [];
    const walkableMask = new Uint8Array(5 * 5).fill(1);
    const sectInstance = {
        meta: {
            instanceId: 'sect:alpha:main',
        },
        template: {
            id: 'sect_domain:sect:alpha:x-1_1:y-1_1',
            name: '青岚宗',
            width: 5,
            height: 5,
            spawnX: 2,
            spawnY: 2,
            walkableMask,
        },
        tick: 99,
        connectPlayer(input) {
            log.push(['connectPlayer', this.template.id, input.preferredX, input.preferredY]);
            return {
                sessionId: input.sessionId,
                x: input.preferredX,
                y: input.preferredY,
                facing: 'south',
            };
        },
        setPlayerMoveSpeed(playerId, moveSpeed) {
            log.push(['setPlayerMoveSpeed', this.template.id, playerId, moveSpeed]);
        },
    };
    const service = new WorldRuntimeRespawnService(createPlayerRuntimeService(log, {
        respawnTemplateId: 'sect_domain:sect:alpha:x-1_1:y-1_1',
        respawnInstanceId: 'sect:alpha:main',
        respawnX: 2,
        respawnY: 2,
    }));
    service.respawnPlayer('player:1', createDeps('wildlands', log, {
        worldRuntimeSectService: {
            ensureSectRuntimeInstanceById(instanceId) {
                log.push(['ensureSectRuntimeInstanceById', instanceId]);
                return instanceId === 'sect:alpha:main' ? sectInstance : null;
            },
        },
    }));
    assert.deepEqual(log, [
        ['clearPendingCommand', 'player:1'],
        ['ensureSectRuntimeInstanceById', 'sect:alpha:main'],
        ['connectPlayer', 'sect_domain:sect:alpha:x-1_1:y-1_1', 2, 2],
        ['disconnectPlayer', 'wildlands', 'player:1'],
        ['setPlayerMoveSpeed', 'sect_domain:sect:alpha:x-1_1:y-1_1', 'player:1', 12],
        ['setPlayerLocation', 'player:1', 'sect:alpha:main'],
        ['clearNavigationIntent', 'player:1'],
        ['respawnPlayer', 'player:1', 'sect_domain:sect:alpha:x-1_1:y-1_1', 'sect:alpha:main', 2, 2],
        ['queuePlayerNotice', 'player:1', '已在 青岚宗 复生', 'travel'],
    ]);
}

async function testOfflineDefeatRetriesBeforeRuntimeRemoval() {
    const log = [];
    const player = {
        playerId: 'player:offline-defeat',
        sessionId: null,
        hp: 0,
        dirtyDomains: new Set(['vitals']),
    };
    let runtimePlayer = player;
    let location = { instanceId: 'public:deepvein_ridge', sessionId: null };
    let finalizeAttempts = 0;
    const persistence = {
        isEnabled: () => true,
        async savePlayerPresence(_playerId, input) {
            log.push(['savePlayerPresence', input.online, input.inWorld]);
        },
    };
    const playerRuntimeService = {
        playerDomainPersistenceService: persistence,
        getPlayer: () => runtimePlayer,
        async finalizeOfflineGainSessionForPlayer() {
            finalizeAttempts += 1;
            log.push(['finalizeOfflineGain', finalizeAttempts]);
            if (finalizeAttempts === 1) {
                throw new Error('transient database failure');
            }
        },
        describePersistencePresence: () => ({
            online: false,
            inWorld: true,
            offlineSinceAt: 100,
            runtimeOwnerId: 'runtime:offline-defeat',
            sessionEpoch: 1,
        }),
        removePlayerRuntime() {
            log.push(['removePlayerRuntime']);
            runtimePlayer = null;
        },
    };
    const deps = {
        getPlayerLocation: () => location,
        getInstanceRuntime: () => ({ disconnectPlayer: () => log.push(['disconnectPlayer']) }),
        worldRuntimePlayerLocationService: {
            clearPlayerLocation() {
                location = null;
                log.push(['clearPlayerLocation']);
            },
        },
        worldRuntimeNavigationService: { clearNavigationIntent: () => log.push(['clearNavigationIntent']) },
        clearPendingCommand: () => log.push(['clearPendingCommand']),
        worldRuntimeGmQueueService: { clearPendingRespawn: () => log.push(['clearPendingRespawn']) },
        playerPersistenceFlushService: {
            async flushPlayer() {
                log.push(['flushPlayer']);
                player.dirtyDomains.delete('vitals');
            },
        },
    };
    const service = new WorldRuntimeRespawnService(playerRuntimeService);
    service.logger = { warn() {}, error() {} };

    const keepAlive = setInterval(() => undefined, 1_000);
    try {
        await service.removeOfflineDefeatedPlayer(player.playerId, deps);
    }
    finally {
        clearInterval(keepAlive);
    }

    assert.equal(finalizeAttempts, 2);
    assert.equal(runtimePlayer, null);
    assert.deepEqual(log.slice(-3), [
        ['flushPlayer'],
        ['savePlayerPresence', false, false],
        ['removePlayerRuntime'],
    ]);
}

async function testOfflineDefeatDoesNotRemoveReconnectedRuntime() {
    const player = {
        playerId: 'player:offline-defeat-reconnect',
        sessionId: null,
        hp: 0,
        dirtyDomains: new Set(['vitals']),
    };
    let location = { instanceId: 'public:deepvein_ridge', sessionId: null };
    let releaseFinalization;
    const finalizationBlocked = new Promise((resolve) => {
        releaseFinalization = resolve;
    });
    let removed = false;
    let flushed = false;
    const playerRuntimeService = {
        playerDomainPersistenceService: { isEnabled: () => true, async savePlayerPresence() {} },
        getPlayer: () => player,
        async finalizeOfflineGainSessionForPlayer() {
            await finalizationBlocked;
        },
        describePersistencePresence: () => ({ runtimeOwnerId: 'runtime:reconnect', sessionEpoch: 1 }),
        removePlayerRuntime() {
            removed = true;
        },
    };
    const deps = {
        getPlayerLocation: () => location,
        getInstanceRuntime: () => ({ disconnectPlayer() {} }),
        worldRuntimePlayerLocationService: { clearPlayerLocation: () => { location = null; } },
        worldRuntimeNavigationService: { clearNavigationIntent() {} },
        clearPendingCommand() {},
        worldRuntimeGmQueueService: { clearPendingRespawn() {} },
        playerPersistenceFlushService: { async flushPlayer() { flushed = true; } },
    };
    const service = new WorldRuntimeRespawnService(playerRuntimeService);
    service.logger = { warn() {}, error() {} };
    const cleanup = service.removeOfflineDefeatedPlayer(player.playerId, deps);
    player.sessionId = 'session:reconnected';
    location = { instanceId: 'public:yunlai_town', sessionId: player.sessionId };
    releaseFinalization();
    await cleanup;

    assert.equal(flushed, false);
    assert.equal(removed, false);
}

Promise.resolve()
    .then(() => testRespawnFromDefaultMap())
    .then(() => testRespawnInsidePrisonKeepsPlayerInPrison())
    .then(() => testInvalidBoundRespawnPointFallsBackToMapSpawn())
    .then(() => testBoundSectRespawnUsesSectInstance())
    .then(() => testOfflineDefeatRetriesBeforeRuntimeRemoval())
    .then(() => testOfflineDefeatDoesNotRemoveReconnectedRuntime())
    .then(() => {
        console.log(JSON.stringify({ ok: true, case: 'world-runtime-respawn' }, null, 2));
    })
    .catch((error) => {
        console.error(error instanceof Error ? error.stack : String(error));
        process.exitCode = 1;
    });
