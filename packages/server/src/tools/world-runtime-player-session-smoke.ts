// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimePlayerSessionService } = require("../runtime/world/world-runtime-player-session.service");
/**
 * createService：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 函数返回值。
 */


function createService(log) {
    return new WorldRuntimePlayerSessionService({    
    /**
 * resolveDefaultRespawnMapId：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        resolveDefaultRespawnMapId() {
            log.push(['resolveDefaultRespawnMapId']);
            return 'yunlai_town';
        },        
        /**
 * getOrCreatePublicInstance：按给定条件读取/查询数据。
 * @param mapId 地图 ID。
 * @returns 函数返回值。
 */

        getOrCreatePublicInstance(mapId) {
            log.push(['getOrCreatePublicInstance', mapId]);
            return {
                meta: { instanceId: `public:${mapId}` },                
                /**
 * connectPlayer：执行核心业务逻辑。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

                connectPlayer(payload) {
                    log.push(['connectPlayer', payload]);
                    return { sessionId: payload.sessionId };
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
        },        
        /**
 * getPlayerViewOrThrow：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        getPlayerViewOrThrow(playerId) {
            log.push(['getPlayerViewOrThrow', playerId]);
            return { playerId };
        },
    });
}
/**
 * testConnectPlayer：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testConnectPlayer() {
    const log = [];
    const service = createService(log);
    const deps = {    
    /**
 * getPlayerLocation：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPlayerLocation() { return null; },        
        /**
 * getInstanceRuntime：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getInstanceRuntime() { return null; },        
        /**
 * setPlayerLocation：更新/写入相关状态。
 * @param playerId 玩家 ID。
 * @param location 参数说明。
 * @returns 函数返回值。
 */

        setPlayerLocation(playerId, location) { log.push(['setPlayerLocation', playerId, location]); },
        worldRuntimeGmQueueService: {        
        /**
 * clearPendingRespawn：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */
 clearPendingRespawn(playerId) { log.push(['clearPendingRespawn', playerId]); } },
        playerRuntimeService: {        
        /**
 * ensurePlayer：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param sessionId session ID。
 * @returns 函数返回值。
 */

            ensurePlayer(playerId, sessionId) {
                log.push(['ensurePlayer', playerId, sessionId]);
                return { attrs: { numericStats: { moveSpeed: 12 } } };
            },
        },
        logger: {        
        /**
 * debug：执行核心业务逻辑。
 * @param message 参数说明。
 * @returns 函数返回值。
 */
 debug(message) { log.push(['debug', message]); } },
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
/**
 * testDisconnectAndRemovePlayer：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testDisconnectAndRemovePlayer() {
    const log = [];
    const service = createService(log);
    const deps = {    
    /**
 * getPlayerLocation：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        getPlayerLocation(playerId) {
            return playerId === 'player:1' ? { instanceId: 'public:yunlai_town' } : null;
        },        
        /**
 * getInstanceRuntime：按给定条件读取/查询数据。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

        getInstanceRuntime(instanceId) {
            return instanceId === 'public:yunlai_town' ? {            
            /**
 * disconnectPlayer：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

                disconnectPlayer(playerId) {
                    log.push(['disconnectPlayer', playerId]);
                    return true;
                },
            } : null;
        },        
        /**
 * clearPlayerLocation：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        clearPlayerLocation(playerId) { log.push(['clearPlayerLocation', playerId]); },
        worldRuntimeNavigationService: {        
        /**
 * clearNavigationIntent：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */
 clearNavigationIntent(playerId) { log.push(['clearNavigationIntent', playerId]); } },        
 /**
 * clearPendingCommand：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        clearPendingCommand(playerId) { log.push(['clearPendingCommand', playerId]); },
        worldRuntimeGmQueueService: {        
        /**
 * clearPendingRespawn：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */
 clearPendingRespawn(playerId) { log.push(['clearPendingRespawn', playerId]); } },
        worldSessionService: {        
        /**
 * purgePlayerSession：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param reason 参数说明。
 * @returns 函数返回值。
 */
 purgePlayerSession(playerId, reason) { log.push(['purgePlayerSession', playerId, reason]); } },
        playerRuntimeService: {        
        /**
 * getPlayer：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

            getPlayer(playerId) { return playerId === 'player:1' ? { playerId } : null; },            
            /**
 * removePlayerRuntime：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

            removePlayerRuntime(playerId) { log.push(['removePlayerRuntime', playerId]); },
        },
    };
    assert.equal(service.disconnectPlayer('player:1', deps), true);
    assert.equal(service.removePlayer('player:1', 'removed', deps), true);
}

testConnectPlayer();
testDisconnectAndRemovePlayer();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-player-session' }, null, 2));
