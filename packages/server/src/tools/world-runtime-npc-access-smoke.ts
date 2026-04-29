// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeNpcAccessService } = require("../runtime/world/world-runtime-npc-access.service");
/**
 * testResolveAdjacentNpcSuccess：规范化或转换testResolveAdjacentNPCSuccess。
 * @returns 无返回值，直接更新testResolveAdjacentNPCSuccess相关状态。
 */


function testResolveAdjacentNpcSuccess() {
    const service = new WorldRuntimeNpcAccessService();
    const npc = { npcId: 'npc_a', name: '阿青' };
    const result = service.resolveAdjacentNpc('player:1', 'npc_a', {    
    /**
 * getPlayerLocationOrThrow：读取玩家位置OrThrow。
 * @returns 无返回值，完成玩家位置OrThrow的读取/组装。
 */

        getPlayerLocationOrThrow() {
            return { instanceId: 'public:yunlai_town' };
        },        
        /**
 * getInstanceRuntimeOrThrow：读取Instance运行态OrThrow。
 * @returns 无返回值，完成Instance运行态OrThrow的读取/组装。
 */

        getInstanceRuntimeOrThrow() {
            return {            
            /**
 * getAdjacentNpc：读取AdjacentNPC。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 无返回值，完成AdjacentNPC的读取/组装。
 */

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
/**
 * testResolveAdjacentNpcMissingLocationPassesThrough：判断testResolveAdjacentNPCMissing位置PasseThrough是否满足条件。
 * @returns 无返回值，直接更新testResolveAdjacentNPCMissing位置PasseThrough相关状态。
 */


function testResolveAdjacentNpcMissingLocationPassesThrough() {
    const service = new WorldRuntimeNpcAccessService();
    assert.throws(() => service.resolveAdjacentNpc('player:1', 'npc_a', {    
    /**
 * getPlayerLocationOrThrow：读取玩家位置OrThrow。
 * @returns 无返回值，完成玩家位置OrThrow的读取/组装。
 */

        getPlayerLocationOrThrow() {
            throw new Error('location missing');
        },        
        /**
 * getInstanceRuntimeOrThrow：读取Instance运行态OrThrow。
 * @returns 无返回值，完成Instance运行态OrThrow的读取/组装。
 */

        getInstanceRuntimeOrThrow() {
            throw new Error('should not reach instance');
        },
    }), /location missing/);
}
/**
 * testResolveAdjacentNpcMissingInstancePassesThrough：判断testResolveAdjacentNPCMissingInstancePasseThrough是否满足条件。
 * @returns 无返回值，直接更新testResolveAdjacentNPCMissingInstancePasseThrough相关状态。
 */


function testResolveAdjacentNpcMissingInstancePassesThrough() {
    const service = new WorldRuntimeNpcAccessService();
    assert.throws(() => service.resolveAdjacentNpc('player:1', 'npc_a', {    
    /**
 * getPlayerLocationOrThrow：读取玩家位置OrThrow。
 * @returns 无返回值，完成玩家位置OrThrow的读取/组装。
 */

        getPlayerLocationOrThrow() {
            return { instanceId: 'missing' };
        },        
        /**
 * getInstanceRuntimeOrThrow：读取Instance运行态OrThrow。
 * @param instanceId instance ID。
 * @returns 无返回值，完成Instance运行态OrThrow的读取/组装。
 */

        getInstanceRuntimeOrThrow(instanceId) {
            assert.equal(instanceId, 'missing');
            throw new Error('instance missing');
        },
    }), /instance missing/);
}
/**
 * testResolveAdjacentNpcThrowsWhenTooFar：规范化或转换testResolveAdjacentNPCThrowWhenTooFar。
 * @returns 无返回值，直接更新testResolveAdjacentNPCThrowWhenTooFar相关状态。
 */


function testResolveAdjacentNpcThrowsWhenTooFar() {
    const service = new WorldRuntimeNpcAccessService();
    assert.throws(() => service.resolveAdjacentNpc('player:1', 'npc_a', {    
    /**
 * getPlayerLocationOrThrow：读取玩家位置OrThrow。
 * @returns 无返回值，完成玩家位置OrThrow的读取/组装。
 */

        getPlayerLocationOrThrow() {
            return { instanceId: 'public:yunlai_town' };
        },        
        /**
 * getInstanceRuntimeOrThrow：读取Instance运行态OrThrow。
 * @returns 无返回值，完成Instance运行态OrThrow的读取/组装。
 */

        getInstanceRuntimeOrThrow() {
            return {            
            /**
 * getAdjacentNpc：读取AdjacentNPC。
 * @returns 无返回值，完成AdjacentNPC的读取/组装。
 */

                getAdjacentNpc() {
                    return null;
                },
            };
        },
    }), (error) => error?.name === 'NotFoundException' && error?.message === '你离这位商人太远了');
}
/**
 * testGetNpcForPlayerMapSuccess：读取testGetNPCFor玩家地图Success并返回结果。
 * @returns 无返回值，直接更新testGetNPCFor玩家地图Success相关状态。
 */


function testGetNpcForPlayerMapSuccess() {
    const service = new WorldRuntimeNpcAccessService();
    const npc = { npcId: 'npc_a', name: '阿青' };
    const instanceRuntimes = new Map([['public:yunlai_town', {    
    /**
 * getNpc：读取NPC。
 * @param npcId npc ID。
 * @returns 无返回值，完成NPC的读取/组装。
 */

        getNpc(npcId) {
            assert.equal(npcId, 'npc_a');
            return npc;
        },
    }]]);
    const result = service.getNpcForPlayerMap('player:1', 'npc_a', {    
    /**
 * getPlayerLocation：读取玩家位置。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家位置的读取/组装。
 */

        getPlayerLocation(playerId) {
            assert.equal(playerId, 'player:1');
            return { instanceId: 'public:yunlai_town' };
        },        
        /**
 * getInstanceRuntime：读取Instance运行态。
 * @param instanceId instance ID。
 * @returns 无返回值，完成Instance运行态的读取/组装。
 */

        getInstanceRuntime(instanceId) {
            return instanceRuntimes.get(instanceId) ?? null;
        },
    });
    assert.equal(result, npc);
}
/**
 * testGetNpcForPlayerMapReturnsNullWithoutLocation：读取testGetNPCFor玩家地图ReturnNullWithout位置并返回结果。
 * @returns 无返回值，直接更新testGetNPCFor玩家地图ReturnNullWithout位置相关状态。
 */


function testGetNpcForPlayerMapReturnsNullWithoutLocation() {
    const service = new WorldRuntimeNpcAccessService();
    const result = service.getNpcForPlayerMap('player:1', 'npc_a', {    
    /**
 * getPlayerLocation：读取玩家位置。
 * @returns 无返回值，完成玩家位置的读取/组装。
 */

        getPlayerLocation() {
            return null;
        },        
        /**
 * getInstanceRuntime：读取Instance运行态。
 * @returns 无返回值，完成Instance运行态的读取/组装。
 */

        getInstanceRuntime() {
            return null;
        },
    });
    assert.equal(result, null);
}
/**
 * testGetNpcForPlayerMapReturnsNullWithoutInstance：读取testGetNPCFor玩家地图ReturnNullWithoutInstance并返回结果。
 * @returns 无返回值，直接更新testGetNPCFor玩家地图ReturnNullWithoutInstance相关状态。
 */


function testGetNpcForPlayerMapReturnsNullWithoutInstance() {
    const service = new WorldRuntimeNpcAccessService();
    const result = service.getNpcForPlayerMap('player:1', 'npc_a', {    
    /**
 * getPlayerLocation：读取玩家位置。
 * @returns 无返回值，完成玩家位置的读取/组装。
 */

        getPlayerLocation() {
            return { instanceId: 'missing' };
        },        
        /**
 * getInstanceRuntime：读取Instance运行态。
 * @returns 无返回值，完成Instance运行态的读取/组装。
 */

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
