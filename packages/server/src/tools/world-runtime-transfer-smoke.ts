// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeTransferService } = require("../runtime/world/world-runtime-transfer.service");
/**
 * testMissingSourceIsNoop：判断testMissing来源INoop是否满足条件。
 * @returns 无返回值，直接更新testMissing来源INoop相关状态。
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
 * getInstanceRuntime：读取Instance运行态。
 * @returns 无返回值，完成Instance运行态的读取/组装。
 */

        getInstanceRuntime() {
            return null;
        },        
        /**
 * setPlayerLocation：写入玩家位置。
 * @param playerId 玩家 ID。
 * @param location 参数说明。
 * @returns 无返回值，直接更新玩家位置相关状态。
 */

        setPlayerLocation(playerId, location) {
            playerLocations.set(playerId, location);
        },
        playerRuntimeService: {        
        /**
 * getPlayer：读取玩家。
 * @returns 无返回值，完成玩家的读取/组装。
 */

            getPlayer() {
                log.push('getPlayer');
                return null;
            },
        },        
        /**
 * getOrCreateDefaultLineInstance：读取默认分线实例。
 * @returns 无返回值，完成默认分线实例的读取/组装。
 */

        getOrCreateDefaultLineInstance() {
            log.push('getOrCreateDefaultLineInstance');
            return {};
        },
        getOrCreatePublicInstance() {
            log.push('getOrCreatePublicInstance');
            return {};
        },
        worldRuntimeNavigationService: {        
        /**
 * handleTransfer：处理Transfer并更新相关状态。
 * @returns 无返回值，直接更新Transfer相关状态。
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
 * testApplyTransfer：处理testApplyTransfer并更新相关状态。
 * @returns 无返回值，直接更新testApplyTransfer相关状态。
 */


function testApplyTransfer() {
    const log = [];
    const service = new WorldRuntimeTransferService();
    const playerLocations = new Map();
    const transferStates = [];
    const source = {    
    /**
 * disconnectPlayer：判断disconnect玩家是否满足条件。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新disconnect玩家相关状态。
 */

        disconnectPlayer(playerId) {
            log.push(['disconnectPlayer', playerId]);
        },
    };
    const target = {
        meta: { instanceId: 'public:yunlai_town' },        
        /**
 * connectPlayer：执行connect玩家相关逻辑。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新connect玩家相关状态。
 */

        connectPlayer(payload) {
            log.push(['connectPlayer', payload]);
        },        
        /**
 * setPlayerMoveSpeed：写入玩家MoveSpeed。
 * @param playerId 玩家 ID。
 * @param speed 参数说明。
 * @returns 无返回值，直接更新玩家MoveSpeed相关状态。
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
 * getInstanceRuntime：读取Instance运行态。
 * @param instanceId instance ID。
 * @returns 无返回值，完成Instance运行态的读取/组装。
 */

        getInstanceRuntime(instanceId) {
            return instanceRuntimes.get(instanceId) ?? null;
        },        
        /**
 * setPlayerLocation：写入玩家位置。
 * @param playerId 玩家 ID。
 * @param location 参数说明。
 * @returns 无返回值，直接更新玩家位置相关状态。
 */

        setPlayerLocation(playerId, location) {
            playerLocations.set(playerId, location);
        },
        playerRuntimeService: {        
        /**
 * getPlayer：读取玩家。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家的读取/组装。
 */

            getPlayer(playerId) {
                log.push(['getPlayer', playerId]);
                return {
                    playerId,
                    sessionId: 'session:1',
                    sessionEpoch: 1,
                    runtimeOwnerId: 'runtime:transfer:1',
                    attrs: { numericStats: { moveSpeed: 12 } },
                };
            },
            beginTransfer(player, target) {
                transferStates.push(['beginTransfer', player.playerId, target]);
            },
            completeTransfer(player) {
                transferStates.push(['completeTransfer', player.playerId]);
            },
        },        
        /**
 * getOrCreateDefaultLineInstance：按玩家偏好读取默认分线实例。
 * @param mapId 地图 ID。
 * @param linePreset 分线预设。
 * @returns 返回目标实例。
 */

        getOrCreateDefaultLineInstance(mapId, linePreset) {
            log.push(['getOrCreateDefaultLineInstance', mapId, linePreset]);
            return target;
        },
        getOrCreatePublicInstance(mapId) {
            log.push(['getOrCreatePublicInstance', mapId]);
            return target;
        },
        worldRuntimeNavigationService: {        
        /**
 * handleTransfer：处理Transfer并更新相关状态。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新Transfer相关状态。
 */

            handleTransfer(entry) {
                log.push(['handleTransfer', entry.reason]);
            },
        },
    });
    assert.deepEqual(log, [
        ['getPlayer', 'player:1'],
        ['disconnectPlayer', 'player:1'],
        ['getOrCreateDefaultLineInstance', 'yunlai_town', 'peaceful'],
        ['connectPlayer', {
            playerId: 'player:1',
            sessionId: 'session:1',
            preferredX: 8,
            preferredY: 9,
        }],
        ['setPlayerMoveSpeed', 'player:1', 12],
        ['handleTransfer', 'auto_portal'],
    ]);
    assert.deepEqual(transferStates, [
        ['beginTransfer', 'player:1', 'yunlai_town'],
        ['completeTransfer', 'player:1'],
    ]);
    assert.deepEqual(playerLocations.get('player:1'), {
        instanceId: 'public:yunlai_town',
        sessionId: 'session:1',
    });
}

function testApplyTransferUsesRealPreference() {
    const log = [];
    const service = new WorldRuntimeTransferService();
    const source = {
        disconnectPlayer(playerId) {
            log.push(['disconnectPlayer', playerId]);
        },
    };
    const target = {
        meta: { instanceId: 'real:yunlai_town' },
        connectPlayer(payload) {
            log.push(['connectPlayer', payload]);
        },
        setPlayerMoveSpeed(playerId, speed) {
            log.push(['setPlayerMoveSpeed', playerId, speed]);
        },
    };
    service.applyTransfer({
        playerId: 'player:real',
        sessionId: 'session:real',
        fromInstanceId: 'instance:old',
        targetMapId: 'yunlai_town',
        targetX: 3,
        targetY: 4,
        reason: 'manual_portal',
    }, {
        getInstanceRuntime(instanceId) {
            return instanceId === 'instance:old' ? source : null;
        },
        getOrCreateDefaultLineInstance(mapId, linePreset) {
            log.push(['getOrCreateDefaultLineInstance', mapId, linePreset]);
            return target;
        },
        getOrCreatePublicInstance() {
            throw new Error('unexpected public fallback');
        },
        setPlayerLocation(playerId, location) {
            log.push(['setPlayerLocation', playerId, location.instanceId]);
        },
        playerRuntimeService: {
            getPlayer(playerId) {
                log.push(['getPlayer', playerId]);
                return {
                    playerId,
                    sessionId: 'session:real',
                    sessionEpoch: 2,
                    runtimeOwnerId: 'runtime:transfer:real',
                    worldPreference: { linePreset: 'real' },
                    attrs: { numericStats: { moveSpeed: 20 } },
                };
            },
            beginTransfer(player, target) {
                log.push(['beginTransfer', player.playerId, target]);
            },
            completeTransfer(player) {
                log.push(['completeTransfer', player.playerId]);
            },
        },
        worldRuntimeNavigationService: {
            handleTransfer(entry) {
                log.push(['handleTransfer', entry.reason]);
            },
        },
    });
    assert.deepEqual(log, [
        ['getPlayer', 'player:real'],
        ['beginTransfer', 'player:real', 'yunlai_town'],
        ['disconnectPlayer', 'player:real'],
        ['getOrCreateDefaultLineInstance', 'yunlai_town', 'real'],
        ['connectPlayer', {
            playerId: 'player:real',
            sessionId: 'session:real',
            preferredX: 3,
            preferredY: 4,
        }],
        ['setPlayerMoveSpeed', 'player:real', 20],
        ['setPlayerLocation', 'player:real', 'real:yunlai_town'],
        ['completeTransfer', 'player:real'],
        ['handleTransfer', 'manual_portal'],
    ]);
}

function testLeaseFenceBlocksTransfer() {
    const log = [];
    const service = new WorldRuntimeTransferService();
    const playerLocations = new Map();
    let fencedReason = '';
    const source = {
        meta: { instanceId: 'instance:stale' },
        disconnectPlayer(playerId) {
            log.push(['disconnectPlayer', playerId]);
        },
    };

    service.applyTransfer({
        playerId: 'player:lease',
        sessionId: 'session:lease',
        fromInstanceId: 'instance:stale',
        targetMapId: 'yunlai_town',
        targetX: 1,
        targetY: 2,
        reason: 'portal',
    }, {
        getInstanceRuntime(instanceId) {
            return instanceId === 'instance:stale' ? source : null;
        },
        isInstanceLeaseWritable() {
            return false;
        },
        fenceInstanceRuntime(instanceId, reason) {
            log.push(['fenceInstanceRuntime', instanceId, reason]);
            fencedReason = reason;
        },
        setPlayerLocation(playerId, location) {
            playerLocations.set(playerId, location);
        },
        playerRuntimeService: {
            getPlayer() {
                log.push('getPlayer');
                return { attrs: { numericStats: { moveSpeed: 12 } } };
            },
        },
        getOrCreateDefaultLineInstance() {
            log.push('getOrCreateDefaultLineInstance');
            return {
                meta: { instanceId: 'public:yunlai_town' },
                connectPlayer() {
                    log.push('connectPlayer');
                },
                setPlayerMoveSpeed() {
                    log.push('setPlayerMoveSpeed');
                },
            };
        },
        getOrCreatePublicInstance() {
            log.push('getOrCreatePublicInstance');
            return {
                meta: { instanceId: 'public:yunlai_town' },
                connectPlayer() {
                    log.push('connectPlayer');
                },
                setPlayerMoveSpeed() {
                    log.push('setPlayerMoveSpeed');
                },
            };
        },
        worldRuntimeNavigationService: {
            handleTransfer() {
                log.push('handleTransfer');
            },
        },
    });

    assert.deepEqual(log, [
        ['fenceInstanceRuntime', 'instance:stale', 'transfer_lease_check_failed'],
    ]);
    assert.equal(playerLocations.size, 0);
    assert.equal(fencedReason, 'transfer_lease_check_failed');
}

testMissingSourceIsNoop();
testApplyTransfer();
testApplyTransferUsesRealPreference();
testLeaseFenceBlocksTransfer();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-transfer' }, null, 2));
