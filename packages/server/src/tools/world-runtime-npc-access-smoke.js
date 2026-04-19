"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimeNpcAccessService } = require("../runtime/world/world-runtime-npc-access.service");

function testResolveAdjacentNpcSuccess() {
    const service = new WorldRuntimeNpcAccessService();
    const npc = { npcId: 'npc_a', name: '阿青' };
    const result = service.resolveAdjacentNpc('player:1', 'npc_a', {
        getPlayerLocationOrThrow() {
            return { instanceId: 'public:yunlai_town' };
        },
        getInstanceRuntimeOrThrow() {
            return {
                getAdjacentNpc(playerId, npcId) {
                    assert.equal(playerId, 'player:1');
                    assert.equal(npcId, 'npc_a');
                    return npc;
                },
            };
        },
    });
    assert.equal(result, npc);
}

function testResolveAdjacentNpcMissingLocationPassesThrough() {
    const service = new WorldRuntimeNpcAccessService();
    assert.throws(() => service.resolveAdjacentNpc('player:1', 'npc_a', {
        getPlayerLocationOrThrow() {
            throw new Error('location missing');
        },
        getInstanceRuntimeOrThrow() {
            throw new Error('should not reach instance');
        },
    }), /location missing/);
}

function testResolveAdjacentNpcMissingInstancePassesThrough() {
    const service = new WorldRuntimeNpcAccessService();
    assert.throws(() => service.resolveAdjacentNpc('player:1', 'npc_a', {
        getPlayerLocationOrThrow() {
            return { instanceId: 'missing' };
        },
        getInstanceRuntimeOrThrow(instanceId) {
            assert.equal(instanceId, 'missing');
            throw new Error('instance missing');
        },
    }), /instance missing/);
}

function testResolveAdjacentNpcThrowsWhenTooFar() {
    const service = new WorldRuntimeNpcAccessService();
    assert.throws(() => service.resolveAdjacentNpc('player:1', 'npc_a', {
        getPlayerLocationOrThrow() {
            return { instanceId: 'public:yunlai_town' };
        },
        getInstanceRuntimeOrThrow() {
            return {
                getAdjacentNpc() {
                    return null;
                },
            };
        },
    }), (error) => error?.name === 'NotFoundException' && error?.message === '你离这位商人太远了');
}

function testGetNpcForPlayerMapSuccess() {
    const service = new WorldRuntimeNpcAccessService();
    const npc = { npcId: 'npc_a', name: '阿青' };
    const instanceRuntimes = new Map([['public:yunlai_town', {
        getNpc(npcId) {
            assert.equal(npcId, 'npc_a');
            return npc;
        },
    }]]);
    const result = service.getNpcForPlayerMap('player:1', 'npc_a', {
        getPlayerLocation(playerId) {
            assert.equal(playerId, 'player:1');
            return { instanceId: 'public:yunlai_town' };
        },
        getInstanceRuntime(instanceId) {
            return instanceRuntimes.get(instanceId) ?? null;
        },
    });
    assert.equal(result, npc);
}

function testGetNpcForPlayerMapReturnsNullWithoutLocation() {
    const service = new WorldRuntimeNpcAccessService();
    const result = service.getNpcForPlayerMap('player:1', 'npc_a', {
        getPlayerLocation() {
            return null;
        },
        getInstanceRuntime() {
            return null;
        },
    });
    assert.equal(result, null);
}

function testGetNpcForPlayerMapReturnsNullWithoutInstance() {
    const service = new WorldRuntimeNpcAccessService();
    const result = service.getNpcForPlayerMap('player:1', 'npc_a', {
        getPlayerLocation() {
            return { instanceId: 'missing' };
        },
        getInstanceRuntime() {
            return null;
        },
    });
    assert.equal(result, null);
}

testResolveAdjacentNpcSuccess();
testResolveAdjacentNpcMissingLocationPassesThrough();
testResolveAdjacentNpcMissingInstancePassesThrough();
testResolveAdjacentNpcThrowsWhenTooFar();
testGetNpcForPlayerMapSuccess();
testGetNpcForPlayerMapReturnsNullWithoutLocation();
testGetNpcForPlayerMapReturnsNullWithoutInstance();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-npc-access' }, null, 2));
