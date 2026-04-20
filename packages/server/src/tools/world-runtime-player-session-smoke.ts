// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimePlayerSessionService } = require("../runtime/world/world-runtime-player-session.service");
/**
 * createService：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 无返回值，直接更新服务相关状态。
 */


function createService(log) {
    return new WorldRuntimePlayerSessionService({    
    /**
 * resolveDefaultRespawnMapId：规范化或转换默认重生地图ID。
 * @returns 无返回值，直接更新Default重生地图ID相关状态。
 */

        resolveDefaultRespawnMapId() {
            log.push(['resolveDefaultRespawnMapId']);
            return 'yunlai_town';
        },        
        /**
 * getOrCreatePublicInstance：读取OrCreatePublicInstance。
 * @param mapId 地图 ID。
 * @returns 无返回值，完成OrCreatePublicInstance的读取/组装。
 */

        getOrCreatePublicInstance(mapId) {
            log.push(['getOrCreatePublicInstance', mapId]);
            return {
                meta: { instanceId: `public:${mapId}` },                
                /**
 * connectPlayer：执行connect玩家相关逻辑。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新connect玩家相关状态。
 */

                connectPlayer(payload) {
                    log.push(['connectPlayer', payload]);
                    return { sessionId: payload.sessionId };
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
        },        
        /**
 * getPlayerViewOrThrow：读取玩家视图OrThrow。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家视图OrThrow的读取/组装。
 */

        getPlayerViewOrThrow(playerId) {
            log.push(['getPlayerViewOrThrow', playerId]);
            return { playerId };
        },
    });
}
/**
 * testConnectPlayer：执行testConnect玩家相关逻辑。
 * @returns 无返回值，直接更新testConnect玩家相关状态。
 */


function testConnectPlayer() {
    const log = [];
    const service = createService(log);
    const deps = {    
    /**
 * getPlayerLocation：读取玩家位置。
 * @returns 无返回值，完成玩家位置的读取/组装。
 */

        getPlayerLocation() { return null; },        
        /**
 * getInstanceRuntime：读取Instance运行态。
 * @returns 无返回值，完成Instance运行态的读取/组装。
 */

        getInstanceRuntime() { return null; },        
        /**
 * setPlayerLocation：写入玩家位置。
 * @param playerId 玩家 ID。
 * @param location 参数说明。
 * @returns 无返回值，直接更新玩家位置相关状态。
 */

        setPlayerLocation(playerId, location) { log.push(['setPlayerLocation', playerId, location]); },
        worldRuntimeGmQueueService: {        
        /**
 * clearPendingRespawn：执行clear待处理重生相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新clearPending重生相关状态。
 */
 clearPendingRespawn(playerId) { log.push(['clearPendingRespawn', playerId]); } },
        playerRuntimeService: {        
        /**
 * ensurePlayer：执行ensure玩家相关逻辑。
 * @param playerId 玩家 ID。
 * @param sessionId session ID。
 * @returns 无返回值，直接更新ensure玩家相关状态。
 */

            ensurePlayer(playerId, sessionId) {
                log.push(['ensurePlayer', playerId, sessionId]);
                return { attrs: { numericStats: { moveSpeed: 12 } } };
            },
        },
        logger: {        
        /**
 * debug：执行debug相关逻辑。
 * @param message 参数说明。
 * @returns 无返回值，直接更新debug相关状态。
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
 * testDisconnectAndRemovePlayer：判断testDisconnectAndRemove玩家是否满足条件。
 * @returns 无返回值，直接更新testDisconnectAndRemove玩家相关状态。
 */


function testDisconnectAndRemovePlayer() {
    const log = [];
    const service = createService(log);
    const deps = {    
    /**
 * getPlayerLocation：读取玩家位置。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家位置的读取/组装。
 */

        getPlayerLocation(playerId) {
            return playerId === 'player:1' ? { instanceId: 'public:yunlai_town' } : null;
        },        
        /**
 * getInstanceRuntime：读取Instance运行态。
 * @param instanceId instance ID。
 * @returns 无返回值，完成Instance运行态的读取/组装。
 */

        getInstanceRuntime(instanceId) {
            return instanceId === 'public:yunlai_town' ? {            
            /**
 * disconnectPlayer：判断disconnect玩家是否满足条件。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新disconnect玩家相关状态。
 */

                disconnectPlayer(playerId) {
                    log.push(['disconnectPlayer', playerId]);
                    return true;
                },
            } : null;
        },        
        /**
 * clearPlayerLocation：执行clear玩家位置相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新clear玩家位置相关状态。
 */

        clearPlayerLocation(playerId) { log.push(['clearPlayerLocation', playerId]); },
        worldRuntimeNavigationService: {        
        /**
 * clearNavigationIntent：执行clear导航Intent相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新clear导航Intent相关状态。
 */
 clearNavigationIntent(playerId) { log.push(['clearNavigationIntent', playerId]); } },        
 /**
 * clearPendingCommand：执行clear待处理Command相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新clearPendingCommand相关状态。
 */

        clearPendingCommand(playerId) { log.push(['clearPendingCommand', playerId]); },
        worldRuntimeGmQueueService: {        
        /**
 * clearPendingRespawn：执行clear待处理重生相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新clearPending重生相关状态。
 */
 clearPendingRespawn(playerId) { log.push(['clearPendingRespawn', playerId]); } },
        worldSessionService: {        
        /**
 * purgePlayerSession：执行purge玩家Session相关逻辑。
 * @param playerId 玩家 ID。
 * @param reason 参数说明。
 * @returns 无返回值，直接更新purge玩家Session相关状态。
 */
 purgePlayerSession(playerId, reason) { log.push(['purgePlayerSession', playerId, reason]); } },
        playerRuntimeService: {        
        /**
 * getPlayer：读取玩家。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家的读取/组装。
 */

            getPlayer(playerId) { return playerId === 'player:1' ? { playerId } : null; },            
            /**
 * removePlayerRuntime：处理玩家运行态并更新相关状态。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新玩家运行态相关状态。
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
