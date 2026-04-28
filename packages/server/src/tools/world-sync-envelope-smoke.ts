// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldSyncEnvelopeService } = require("../network/world-sync-envelope.service");
/**
 * testEnvelopeService：执行testEnvelope服务相关逻辑。
 * @returns 无返回值，直接更新testEnvelope服务相关状态。
 */


function testEnvelopeService() {
    const service = new WorldSyncEnvelopeService({    
    /**
 * createInitialEnvelope：构建并返回目标对象。
 * @param binding 参数说明。
 * @returns 无返回值，直接更新InitialEnvelope相关状态。
 */

        createInitialEnvelope(binding) {
            return {
                initSession: { sid: binding.sessionId },
                worldDelta: { t: 10, wr: 20, sr: 30 },
            };
        },        
        /**
 * createDeltaEnvelope：构建并返回目标对象。
 * @returns 无返回值，直接更新DeltaEnvelope相关状态。
 */

        createDeltaEnvelope() {
            return {
                worldDelta: { t: 11, wr: 21, sr: 31 },
            };
        },        
        /**
 * clear：执行clear相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新clear相关状态。
 */

        clear(playerId) {
            assert.equal(playerId, 'player:1');
        },
    }, {    
    /**
 * getCombatEffects：读取战斗Effect。
 * @returns 无返回值，完成战斗Effect的读取/组装。
 */

        getCombatEffects() {
            return [
                { type: 'attack', fromX: 3, fromY: 4, toX: 7, toY: 8, label: 'keep' },
                { type: 'attack', fromX: 20, fromY: 20, toX: 21, toY: 21, label: 'drop' },
                { type: 'warning_zone', cells: [{ x: 3, y: 4 }, { x: 4, y: 4 }], label: 'warning-keep' },
                { type: 'warning_zone', cells: [{ x: 30, y: 30 }], label: 'warning-drop' },
            ];
        },
    }, {    
    /**
 * getOrThrow：读取OrThrow。
 * @param mapId 地图 ID。
 * @returns 无返回值，完成OrThrow的读取/组装。
 */

        getOrThrow(mapId) {
            assert.equal(mapId, 'map.a');
            return { id: mapId };
        },
    }, {    
    /**
 * buildVisibleTileKeySet：构建并返回目标对象。
 * @returns 无返回值，直接更新可见TileKeySet相关状态。
 */

        buildVisibleTileKeySet() {
            return new Set(['3,4']);
        },
    });
    const view = {
        tick: 10,
        worldRevision: 20,
        selfRevision: 30,
        instance: { templateId: 'map.a', instanceId: 'inst.a' },
    };
    const binding = { sessionId: 'sid.a' };
    const envelope = service.createInitialEnvelope('player:1', binding, view, {});
    assert.equal(envelope.initSession.sid, 'sid.a');
    assert.equal(envelope.worldDelta.fx.length, 2);
    assert.equal(envelope.worldDelta.fx[0].label, 'keep');
    assert.equal(envelope.worldDelta.fx[1].label, 'warning-keep');
    const delta = service.createDeltaEnvelope('player:1', { ...view, tick: 11, worldRevision: 21, selfRevision: 31 }, {});
    assert.equal(delta.worldDelta.fx.length, 2);
    service.clearPlayerCache('player:1');
}

testEnvelopeService();

console.log(JSON.stringify({ ok: true, case: 'world-sync-envelope' }, null, 2));
