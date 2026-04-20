// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeNpcAccessService } = require("../runtime/world/world-runtime-npc-access.service");
/**
 * testResolveAdjacentNpcSuccess：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testResolveAdjacentNpcSuccess() {
    const service = new WorldRuntimeNpcAccessService();
    const npc = { npcId: 'npc_a', name: '阿青' };
    const result = service.resolveAdjacentNpc('player:1', 'npc_a', {    
    /**
 * getPlayerLocationOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPlayerLocationOrThrow() {
            return { instanceId: 'public:yunlai_town' };
        },        
        /**
 * getInstanceRuntimeOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getInstanceRuntimeOrThrow() {
            return {            
            /**
 * getAdjacentNpc：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 函数返回值。
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
 * testResolveAdjacentNpcMissingLocationPassesThrough：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testResolveAdjacentNpcMissingLocationPassesThrough() {
    const service = new WorldRuntimeNpcAccessService();
    assert.throws(() => service.resolveAdjacentNpc('player:1', 'npc_a', {    
    /**
 * getPlayerLocationOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPlayerLocationOrThrow() {
            throw new Error('location missing');
        },        
        /**
 * getInstanceRuntimeOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getInstanceRuntimeOrThrow() {
            throw new Error('should not reach instance');
        },
    }), /location missing/);
}
/**
 * testResolveAdjacentNpcMissingInstancePassesThrough：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testResolveAdjacentNpcMissingInstancePassesThrough() {
    const service = new WorldRuntimeNpcAccessService();
    assert.throws(() => service.resolveAdjacentNpc('player:1', 'npc_a', {    
    /**
 * getPlayerLocationOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPlayerLocationOrThrow() {
            return { instanceId: 'missing' };
        },        
        /**
 * getInstanceRuntimeOrThrow：按给定条件读取/查询数据。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

        getInstanceRuntimeOrThrow(instanceId) {
            assert.equal(instanceId, 'missing');
            throw new Error('instance missing');
        },
    }), /instance missing/);
}
/**
 * testResolveAdjacentNpcThrowsWhenTooFar：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testResolveAdjacentNpcThrowsWhenTooFar() {
    const service = new WorldRuntimeNpcAccessService();
    assert.throws(() => service.resolveAdjacentNpc('player:1', 'npc_a', {    
    /**
 * getPlayerLocationOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPlayerLocationOrThrow() {
            return { instanceId: 'public:yunlai_town' };
        },        
        /**
 * getInstanceRuntimeOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getInstanceRuntimeOrThrow() {
            return {            
            /**
 * getAdjacentNpc：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

                getAdjacentNpc() {
                    return null;
                },
            };
        },
    }), (error) => error?.name === 'NotFoundException' && error?.message === '你离这位商人太远了');
}
/**
 * testGetNpcForPlayerMapSuccess：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testGetNpcForPlayerMapSuccess() {
    const service = new WorldRuntimeNpcAccessService();
    const npc = { npcId: 'npc_a', name: '阿青' };
    const instanceRuntimes = new Map([['public:yunlai_town', {    
    /**
 * getNpc：按给定条件读取/查询数据。
 * @param npcId npc ID。
 * @returns 函数返回值。
 */

        getNpc(npcId) {
            assert.equal(npcId, 'npc_a');
            return npc;
        },
    }]]);
    const result = service.getNpcForPlayerMap('player:1', 'npc_a', {    
    /**
 * getPlayerLocation：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        getPlayerLocation(playerId) {
            assert.equal(playerId, 'player:1');
            return { instanceId: 'public:yunlai_town' };
        },        
        /**
 * getInstanceRuntime：按给定条件读取/查询数据。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

        getInstanceRuntime(instanceId) {
            return instanceRuntimes.get(instanceId) ?? null;
        },
    });
    assert.equal(result, npc);
}
/**
 * testGetNpcForPlayerMapReturnsNullWithoutLocation：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testGetNpcForPlayerMapReturnsNullWithoutLocation() {
    const service = new WorldRuntimeNpcAccessService();
    const result = service.getNpcForPlayerMap('player:1', 'npc_a', {    
    /**
 * getPlayerLocation：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPlayerLocation() {
            return null;
        },        
        /**
 * getInstanceRuntime：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getInstanceRuntime() {
            return null;
        },
    });
    assert.equal(result, null);
}
/**
 * testGetNpcForPlayerMapReturnsNullWithoutInstance：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testGetNpcForPlayerMapReturnsNullWithoutInstance() {
    const service = new WorldRuntimeNpcAccessService();
    const result = service.getNpcForPlayerMap('player:1', 'npc_a', {    
    /**
 * getPlayerLocation：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPlayerLocation() {
            return { instanceId: 'missing' };
        },        
        /**
 * getInstanceRuntime：按给定条件读取/查询数据。
 * @returns 函数返回值。
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
