// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeTransferService } = require("../runtime/world/world-runtime-transfer.service");
/**
 * testMissingSourceIsNoop：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testMissingSourceIsNoop() {
    const log = [];
    const service = new WorldRuntimeTransferService();
    const playerLocations = new Map();
    service.applyTransfer({
        playerId: 'player:1',
        sessionId: 'session:1',
        fromInstanceId: 'missing',
        targetMapId: 'yunlai_town',
        targetX: 8,
        targetY: 9,
        reason: 'portal',
    }, {    
    /**
 * getInstanceRuntime：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getInstanceRuntime() {
            return null;
        },        
        /**
 * setPlayerLocation：更新/写入相关状态。
 * @param playerId 玩家 ID。
 * @param location 参数说明。
 * @returns 函数返回值。
 */

        setPlayerLocation(playerId, location) {
            playerLocations.set(playerId, location);
        },
        playerRuntimeService: {        
        /**
 * getPlayer：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

            getPlayer() {
                log.push('getPlayer');
                return null;
            },
        },        
        /**
 * getOrCreatePublicInstance：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getOrCreatePublicInstance() {
            log.push('getOrCreatePublicInstance');
            return {};
        },
        worldRuntimeNavigationService: {        
        /**
 * handleTransfer：处理事件并驱动执行路径。
 * @returns 函数返回值。
 */

            handleTransfer() {
                log.push('handleTransfer');
            },
        },
    });
    assert.deepEqual(log, []);
    assert.equal(playerLocations.size, 0);
}
/**
 * testApplyTransfer：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testApplyTransfer() {
    const log = [];
    const service = new WorldRuntimeTransferService();
    const playerLocations = new Map();
    const source = {    
    /**
 * disconnectPlayer：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        disconnectPlayer(playerId) {
            log.push(['disconnectPlayer', playerId]);
        },
    };
    const target = {
        meta: { instanceId: 'public:yunlai_town' },        
        /**
 * connectPlayer：执行核心业务逻辑。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

        connectPlayer(payload) {
            log.push(['connectPlayer', payload]);
        },        
        /**
 * setPlayerMoveSpeed：更新/写入相关状态。
 * @param playerId 玩家 ID。
 * @param speed 参数说明。
 * @returns 函数返回值。
 */

        setPlayerMoveSpeed(playerId, speed) {
            log.push(['setPlayerMoveSpeed', playerId, speed]);
        },
    };
    const transfer = {
        playerId: 'player:1',
        sessionId: 'session:1',
        fromInstanceId: 'instance:old',
        targetMapId: 'yunlai_town',
        targetX: 8,
        targetY: 9,
        reason: 'auto_portal',
    };
    const instanceRuntimes = new Map([['instance:old', source]]);
    service.applyTransfer(transfer, {    
    /**
 * getInstanceRuntime：按给定条件读取/查询数据。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

        getInstanceRuntime(instanceId) {
            return instanceRuntimes.get(instanceId) ?? null;
        },        
        /**
 * setPlayerLocation：更新/写入相关状态。
 * @param playerId 玩家 ID。
 * @param location 参数说明。
 * @returns 函数返回值。
 */

        setPlayerLocation(playerId, location) {
            playerLocations.set(playerId, location);
        },
        playerRuntimeService: {        
        /**
 * getPlayer：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

            getPlayer(playerId) {
                log.push(['getPlayer', playerId]);
                return { attrs: { numericStats: { moveSpeed: 12 } } };
            },
        },        
        /**
 * getOrCreatePublicInstance：按给定条件读取/查询数据。
 * @param mapId 地图 ID。
 * @returns 函数返回值。
 */

        getOrCreatePublicInstance(mapId) {
            log.push(['getOrCreatePublicInstance', mapId]);
            return target;
        },
        worldRuntimeNavigationService: {        
        /**
 * handleTransfer：处理事件并驱动执行路径。
 * @param entry 参数说明。
 * @returns 函数返回值。
 */

            handleTransfer(entry) {
                log.push(['handleTransfer', entry.reason]);
            },
        },
    });
    assert.deepEqual(log, [
        ['disconnectPlayer', 'player:1'],
        ['getOrCreatePublicInstance', 'yunlai_town'],
        ['connectPlayer', {
            playerId: 'player:1',
            sessionId: 'session:1',
            preferredX: 8,
            preferredY: 9,
        }],
        ['getPlayer', 'player:1'],
        ['setPlayerMoveSpeed', 'player:1', 12],
        ['handleTransfer', 'auto_portal'],
    ]);
    assert.deepEqual(playerLocations.get('player:1'), {
        instanceId: 'public:yunlai_town',
        sessionId: 'session:1',
    });
}

testMissingSourceIsNoop();
testApplyTransfer();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-transfer' }, null, 2));
