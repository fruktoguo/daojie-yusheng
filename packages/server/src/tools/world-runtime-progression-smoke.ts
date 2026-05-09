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

function testRootFoundationRefineAcceptsExactSpiritStoneCount() {
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
        inventory: { items: [{ itemId: 'spirit_stone', count: 1 }], revision: 0 },
        attrs: { revision: 0 },
        selfRevision: 0,
    };
    const preview = service.buildRootFoundationPreview(player, player.realm);
    assert.equal(preview.canRefine, true, 'exact spirit stone count should satisfy root foundation refine');
    const result = service.refineRootFoundation(player);
    assert.equal(result.changed, true);
    assert.equal(player.rootFoundation, 1);
    assert.equal(player.inventory.items.some((entry) => entry.itemId === 'spirit_stone'), false);
    assert.equal(player.inventory.revision, 1);
}

function testRootFoundationPreviewReportsSpiritStoneShortage() {
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
        realm: service.createRealmStateFromLevel(8, Number.MAX_SAFE_INTEGER),
        rootFoundation: 0,
        inventory: { items: [{ itemId: 'spirit_stone', count: 10 }], revision: 0 },
        attrs: { revision: 0 },
        selfRevision: 0,
    };
    const preview = service.buildRootFoundationPreview(player, player.realm);
    assert.equal(preview.canRefine, false);
    assert.equal(preview.blockedReason, '材料不足：spirit_stone缺 13');
}

function testRootFoundationRefineStillSupportsConfiguredNonSpiritStoneItem() {
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
    service.breakthroughTransitions.set(1, {
        fromRealmLv: 1,
        toRealmLv: 2,
        rootFoundationItems: [{ itemId: 'rat_tail', count: 2 }],
        requirements: [],
    });
    const player = {
        realm: service.createRealmStateFromLevel(1, Number.MAX_SAFE_INTEGER),
        rootFoundation: 0,
        inventory: { items: [{ itemId: 'rat_tail', count: 2 }], revision: 0 },
        attrs: { revision: 0 },
        selfRevision: 0,
    };
    const preview = service.buildRootFoundationPreview(player, player.realm);
    assert.deepEqual(preview.items, [{ itemId: 'rat_tail', count: 2 }]);
    assert.equal(preview.canRefine, true, 'configured non-spirit-stone item should satisfy root foundation refine');
    const result = service.refineRootFoundation(player);
    assert.equal(result.changed, true);
    assert.equal(player.inventory.items.some((entry) => entry.itemId === 'rat_tail'), false);
    assert.equal(player.inventory.revision, 1);
}

function testAutoRootFoundationRefinesOnlyWhenEnabledAndReady() {
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
        inventory: { items: [{ itemId: 'spirit_stone', count: 1 }], revision: 0 },
        combat: { autoRootFoundation: false },
        attrs: { revision: 0 },
        selfRevision: 0,
    };
    const disabledResult = service.autoRefineRootFoundation(player);
    assert.equal(disabledResult.changed, false, 'disabled auto root foundation should not consume resources');
    assert.equal(player.rootFoundation, 0);
    assert.equal(player.inventory.revision, 0);

    player.combat.autoRootFoundation = true;
    const result = service.autoRefineRootFoundation(player);
    assert.equal(result.changed, true, 'enabled auto root foundation should refine when preview is ready');
    assert.equal(player.rootFoundation, 1);
    assert.equal(player.inventory.items.some((entry) => entry.itemId === 'spirit_stone'), false);
    assert.equal(player.inventory.revision, 1);
}

function testBreakthroughOptionalRequirementsSurfaceAndRaiseTotalAttributes() {
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
    assert.equal(preview.canBreakthrough, false, 'missing optional technique should raise the total attribute threshold');
    assert.equal(preview.requirements.some((entry) => entry.type === 'item'), false, 'root-foundation material should not be listed as breakthrough requirement');
    assert.equal(preview.requirements.find((entry) => entry.type === 'technique')?.optional, true, 'technique requirement should be visible as optional');
    assert.equal(
        preview.requirements.find((entry) => entry.type === 'attribute_total')?.detail,
        '当前六维总属性 60 / 88，基础要求 55',
    );
    player.techniques.techniques.push({ techId: 'stance', level: 2, realm: 0, grade: 'mortal' });
    const readyPreview = service.buildBreakthroughPreview(player, player.realm);
    assert.equal(readyPreview.canBreakthrough, true);
    assert.equal(
        readyPreview.requirements.find((entry) => entry.type === 'attribute_total')?.detail,
        '当前六维总属性 60 / 55',
    );
    const result = service.attemptBreakthrough(player);
    assert.equal(result.changed, true);
    assert.equal(player.realm.realmLv, 3);
    assert.equal(player.inventory.revision, 0);
    assert.equal(player.inventory.items.length, 0);
}

function testSpiritualRootRequirementBlocksQiRefiningBreakthrough() {
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
        inventory: { items: [{ itemId: 'spirit_stone', count: 76 }], revision: 0 },
        techniques: { techniques: [{ techId: 'yellow-art', level: 10, realm: 0, grade: 'yellow' }] },
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
    assert.equal(preview.canBreakthrough, false, 'qi refining breakthrough should require at least one spiritual root');
    assert.equal(preview.requirements.find((entry) => entry.type === 'root')?.detail, '当前最高灵根 0 / 1');
    assert.equal(service.attemptBreakthrough(player).changed, false);

    player.spiritualRoots = { metal: 1, wood: 0, water: 0, fire: 0, earth: 0 };
    const readyPreview = service.buildBreakthroughPreview(player, player.realm);
    assert.equal(readyPreview.canBreakthrough, true);
    assert.equal(readyPreview.requirements.find((entry) => entry.type === 'root')?.detail, '当前最高灵根 1 / 1');
    const result = service.attemptBreakthrough(player);
    assert.equal(result.changed, true);
    assert.equal(player.realm.realmLv, 19);
}

function testMissingBreakthroughConfigShowsPathSevered() {
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
        realm: service.createRealmStateFromLevel(42, Number.MAX_SAFE_INTEGER),
        inventory: { items: [], revision: 0 },
        techniques: { techniques: [] },
        attrs: { finalAttrs: {}, revision: 0 },
        hp: 1,
        maxHp: 100,
        qi: 1,
        maxQi: 50,
        persistentRevision: 0,
        selfRevision: 0,
    };
    const preview = service.buildBreakthroughPreview(player, player.realm);
    assert.equal(preview.canBreakthrough, false);
    assert.equal(preview.blockedReason, '仙路断绝');
    assert.equal(preview.requirements.find((entry) => entry.label === '仙路断绝')?.detail, '仙路断绝，你的前路已被无形天堑阻断，暂时无法继续突破。');
    const result = service.attemptBreakthrough(player);
    assert.equal(result.changed, false);
    assert.equal(player.realm.realmLv, 42);
}

function testEmptyBreakthroughRequirementsShowPathSevered() {
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
        realm: service.createRealmStateFromLevel(30, Number.MAX_SAFE_INTEGER),
        inventory: { items: [{ itemId: 'spirit_stone', count: 164 }], revision: 0 },
        techniques: { techniques: [] },
        attrs: { finalAttrs: {}, revision: 0 },
        hp: 1,
        maxHp: 100,
        qi: 1,
        maxQi: 50,
        persistentRevision: 0,
        selfRevision: 0,
    };
    const preview = service.buildBreakthroughPreview(player, player.realm);
    assert.equal(preview.canBreakthrough, false);
    assert.equal(preview.blockedReason, '仙路断绝');
    assert.equal(preview.requirements.some((entry) => entry.type === 'item'), false);
    assert.equal(preview.requirements.find((entry) => entry.label === '仙路断绝')?.detail, '仙路断绝，你的前路已被无形天堑阻断，暂时无法继续突破。');
    const result = service.attemptBreakthrough(player);
    assert.equal(result.changed, false);
    assert.equal(player.realm.realmLv, 30);
    assert.equal(player.inventory.items[0]?.count, 164);
}

function testItemOnlyBreakthroughRequirementCanBreakthrough() {
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
    service.breakthroughTransitions.set(30, {
        fromRealmLv: 30,
        toRealmLv: 31,
        rootFoundationItems: [{ itemId: 'spirit_stone', count: 164 }],
        requirements: [{ id: 'test_breakthrough_item', type: 'item', itemId: 'rat_tail', count: 2 }],
    });
    const player = {
        realm: service.createRealmStateFromLevel(30, Number.MAX_SAFE_INTEGER),
        inventory: { items: [{ itemId: 'spirit_stone', count: 164 }, { itemId: 'rat_tail', count: 1 }], revision: 0 },
        techniques: { techniques: [] },
        attrs: { finalAttrs: {}, revision: 0 },
        hp: 1,
        maxHp: 100,
        qi: 1,
        maxQi: 50,
        persistentRevision: 0,
        selfRevision: 0,
    };
    const missingPreview = service.buildBreakthroughPreview(player, player.realm);
    assert.equal(missingPreview.canBreakthrough, false);
    assert.equal(missingPreview.requirements.find((entry) => entry.type === 'item')?.detail, '当前尚未满足。当前 1 / 2');
    assert.equal(service.attemptBreakthrough(player).changed, false);
    assert.equal(player.realm.realmLv, 30);

    player.inventory.items.find((entry) => entry.itemId === 'rat_tail').count = 2;
    const readyPreview = service.buildBreakthroughPreview(player, player.realm);
    assert.equal(readyPreview.canBreakthrough, true);
    const result = service.attemptBreakthrough(player);
    assert.equal(result.changed, true);
    assert.equal(player.realm.realmLv, 31);
    assert.equal(player.inventory.revision, 1);
    assert.equal(player.inventory.items.find((entry) => entry.itemId === 'spirit_stone')?.count, 164);
    assert.equal(player.inventory.items.some((entry) => entry.itemId === 'rat_tail'), false);
}

function testOptionalOnlyBreakthroughRequirementKeepsRouteOpen() {
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
    service.breakthroughTransitions.set(30, {
        fromRealmLv: 30,
        toRealmLv: 31,
        rootFoundationItems: [{ itemId: 'spirit_stone', count: 164 }],
        requirements: [{ id: 'test_optional_technique', type: 'technique', minLevel: 99, count: 1, increasePct: 10 }],
    });
    const player = {
        realm: service.createRealmStateFromLevel(30, Number.MAX_SAFE_INTEGER),
        inventory: { items: [{ itemId: 'spirit_stone', count: 164 }], revision: 0 },
        techniques: { techniques: [] },
        attrs: { finalAttrs: {}, revision: 0 },
        hp: 1,
        maxHp: 100,
        qi: 1,
        maxQi: 50,
        persistentRevision: 0,
        selfRevision: 0,
    };
    const preview = service.buildBreakthroughPreview(player, player.realm);
    assert.equal(preview.requirements.length, 1);
    assert.equal(preview.blockedReason, undefined);
    assert.equal(preview.canBreakthrough, true);
}

testBreakthrough();
testHeavenGateAction();
testRootFoundationRefineAcceptsExactSpiritStoneCount();
testRootFoundationPreviewReportsSpiritStoneShortage();
testRootFoundationRefineStillSupportsConfiguredNonSpiritStoneItem();
testAutoRootFoundationRefinesOnlyWhenEnabledAndReady();
testBreakthroughOptionalRequirementsSurfaceAndRaiseTotalAttributes();
testSpiritualRootRequirementBlocksQiRefiningBreakthrough();
testMissingBreakthroughConfigShowsPathSevered();
testEmptyBreakthroughRequirementsShowPathSevered();
testItemOnlyBreakthroughRequirementCanBreakthrough();
testOptionalOnlyBreakthroughRequirementKeepsRouteOpen();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-progression' }, null, 2));
