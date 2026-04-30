// @ts-nocheck

const assert = require("node:assert/strict");
const { PlayerProgressionService } = require("../runtime/player/player-progression.service");
const { WorldRuntimeProgressionService } = require("../runtime/world/world-runtime-progression.service");
/**
 * testBreakthrough：执行testBreakthrough相关逻辑。
 * @returns 无返回值，直接更新testBreakthrough相关状态。
 */


function testBreakthrough() {
    const log = [];
    const service = new WorldRuntimeProgressionService({    
    /**
 * attemptBreakthrough：执行attemptBreakthrough相关逻辑。
 * @param playerId 玩家 ID。
 * @param currentTick 参数说明。
 * @returns 无返回值，直接更新attemptBreakthrough相关状态。
 */

        attemptBreakthrough(playerId, currentTick) {
            log.push(['attemptBreakthrough', playerId, currentTick]);
            return { ok: true };
        },
    });
    const result = service.dispatchBreakthrough('player:1', {    
    /**
 * resolveCurrentTickForPlayerId：规范化或转换当前tickFor玩家ID。
 * @returns 无返回值，直接更新CurrenttickFor玩家ID相关状态。
 */
 resolveCurrentTickForPlayerId() { return 17; } });
    assert.deepEqual(log, [['attemptBreakthrough', 'player:1', 17]]);
    assert.deepEqual(result, { ok: true });
}
/**
 * testHeavenGateAction：执行testHeavenGateAction相关逻辑。
 * @returns 无返回值，直接更新testHeavenGateAction相关状态。
 */


function testHeavenGateAction() {
    const log = [];
    const service = new WorldRuntimeProgressionService({    
    /**
 * handleHeavenGateAction：处理HeavenGateAction并更新相关状态。
 * @param playerId 玩家 ID。
 * @param action 参数说明。
 * @param element 参数说明。
 * @param currentTick 参数说明。
 * @returns 无返回值，直接更新HeavenGateAction相关状态。
 */

        handleHeavenGateAction(playerId, action, element, currentTick) {
            log.push(['handleHeavenGateAction', playerId, action, element, currentTick]);
            return { ok: true };
        },
    });
    const result = service.dispatchHeavenGateAction('player:1', 'choose_gate', 'wood', {    
    /**
 * resolveCurrentTickForPlayerId：规范化或转换当前tickFor玩家ID。
 * @returns 无返回值，直接更新CurrenttickFor玩家ID相关状态。
 */
 resolveCurrentTickForPlayerId() { return 23; } });
    assert.deepEqual(log, [['handleHeavenGateAction', 'player:1', 'choose_gate', 'wood', 23]]);
    assert.deepEqual(result, { ok: true });
}

function testRootFoundationRefineAcceptsExactMaterialCount() {
    const service = new PlayerProgressionService({
        getItemName(itemId) {
            return itemId;
        },
    }, {
        recalculate() {
            return true;
        },
        markPanelDirty() {
            return undefined;
        },
    });
    service.onModuleInit();
    const player = {
        realm: service.createRealmStateFromLevel(1, Number.MAX_SAFE_INTEGER),
        rootFoundation: 0,
        inventory: { items: [{ itemId: 'rat_tail', count: 2 }], revision: 0 },
        attrs: { revision: 0 },
        selfRevision: 0,
    };
    const preview = service.buildRootFoundationPreview(player, player.realm);
    assert.equal(preview.canRefine, true, 'exact breakthrough material count should satisfy root foundation refine');
    const result = service.refineRootFoundation(player);
    assert.equal(result.changed, true);
    assert.equal(player.rootFoundation, 1);
    assert.equal(player.inventory.items.some((entry) => entry.itemId === 'rat_tail'), false);
    assert.equal(player.inventory.revision, 1);
}

function testBreakthroughOnlyUsesTotalAttributes() {
    const service = new PlayerProgressionService({
        getItemName(itemId) {
            return itemId;
        },
    }, {
        recalculate() {
            return true;
        },
        markPanelDirty() {
            return undefined;
        },
    });
    service.onModuleInit();
    const player = {
        realm: service.createRealmStateFromLevel(2, Number.MAX_SAFE_INTEGER),
        inventory: { items: [], revision: 0 },
        techniques: { techniques: [] },
        attrs: {
            finalAttrs: {
                constitution: 10,
                spirit: 10,
                perception: 10,
                talent: 10,
                strength: 10,
                meridians: 10,
            },
            revision: 0,
        },
        hp: 1,
        maxHp: 100,
        qi: 1,
        maxQi: 50,
        persistentRevision: 0,
        selfRevision: 0,
    };
    const preview = service.buildBreakthroughPreview(player, player.realm);
    assert.equal(preview.canBreakthrough, true, 'breakthrough should use six-stat total only');
    assert.equal(preview.requirements.some((entry) => entry.type === 'item'), false, 'item requirement should not block breakthrough');
    assert.equal(preview.requirements.some((entry) => entry.type === 'technique'), false, 'technique requirement should not block breakthrough');
    assert.equal(
        preview.requirements.find((entry) => entry.type === 'attribute_total')?.detail,
        '当前六维总属性 60 / 55',
    );
    const result = service.attemptBreakthrough(player);
    assert.equal(result.changed, true);
    assert.equal(player.realm.realmLv, 3);
    assert.equal(player.inventory.revision, 0);
}

function testSpiritualRootRequirementDoesNotBlockBreakthrough() {
    const service = new PlayerProgressionService({
        getItemName(itemId) {
            return itemId;
        },
    }, {
        recalculate() {
            return true;
        },
        markPanelDirty() {
            return undefined;
        },
    });
    service.onModuleInit();
    const player = {
        realm: service.createRealmStateFromLevel(18, Number.MAX_SAFE_INTEGER),
        inventory: { items: [], revision: 0 },
        techniques: { techniques: [] },
        spiritualRoots: null,
        attrs: {
            finalAttrs: {
                constitution: 320,
                spirit: 320,
                perception: 320,
                talent: 320,
                strength: 320,
                meridians: 320,
            },
            revision: 0,
        },
        hp: 1,
        maxHp: 100,
        qi: 1,
        maxQi: 50,
        persistentRevision: 0,
        selfRevision: 0,
    };
    const preview = service.buildBreakthroughPreview(player, player.realm);
    assert.equal(preview.canBreakthrough, true, 'root/spiritual-root config should not block six-stat-only breakthrough');
    assert.equal(preview.requirements.some((entry) => entry.type === 'root'), false);
    const result = service.attemptBreakthrough(player);
    assert.equal(result.changed, true);
    assert.equal(player.realm.realmLv, 19);
}

testBreakthrough();
testHeavenGateAction();
testRootFoundationRefineAcceptsExactMaterialCount();
testBreakthroughOnlyUsesTotalAttributes();
testSpiritualRootRequirementDoesNotBlockBreakthrough();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-progression' }, null, 2));
