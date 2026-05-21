// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeRespawnService } = require("../runtime/world/world-runtime-respawn.service");

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
        ['disconnectPlayer', 'wildlands', 'player:1'],
        ['connectPlayer', 'yunlai_town', 10, 10],
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
        ['disconnectPlayer', 'prison', 'player:1'],
        ['connectPlayer', 'prison', 10, 10],
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
        ['disconnectPlayer', 'wildlands', 'player:1'],
        ['connectPlayer', 'yunlai_town', 10, 10],
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
        ['disconnectPlayer', 'wildlands', 'player:1'],
        ['connectPlayer', 'sect_domain:sect:alpha:x-1_1:y-1_1', 2, 2],
        ['setPlayerMoveSpeed', 'sect_domain:sect:alpha:x-1_1:y-1_1', 'player:1', 12],
        ['setPlayerLocation', 'player:1', 'sect:alpha:main'],
        ['clearNavigationIntent', 'player:1'],
        ['respawnPlayer', 'player:1', 'sect_domain:sect:alpha:x-1_1:y-1_1', 'sect:alpha:main', 2, 2],
        ['queuePlayerNotice', 'player:1', '已在 青岚宗 复生', 'travel'],
    ]);
}

testRespawnFromDefaultMap();
testRespawnInsidePrisonKeepsPlayerInPrison();
testInvalidBoundRespawnPointFallsBackToMapSpawn();
testBoundSectRespawnUsesSectInstance();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-respawn' }, null, 2));
