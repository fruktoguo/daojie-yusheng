// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeActionExecutionService } = require("../runtime/world/world-runtime-action-execution.service");
/**
 * createService：构建并返回目标对象。
 * @param player 玩家对象。
 * @param log 参数说明。
 * @returns 函数返回值。
 */


function createService(player, log = []) {
    return new WorldRuntimeActionExecutionService({    
    /**
 * getPlayerOrThrow：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        getPlayerOrThrow(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

            log.push(['getPlayerOrThrow', playerId]);
            if (!player) {
                throw new Error('player missing');
            }
            return player;
        },        
        /**
 * updateCombatSettings：更新/写入相关状态。
 * @param playerId 玩家 ID。
 * @param patch 参数说明。
 * @param tick 当前 tick。
 * @returns 函数返回值。
 */

        updateCombatSettings(playerId, patch, tick) {
            log.push(['updateCombatSettings', playerId, patch, tick]);
        },        
        /**
 * cultivateTechnique：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param techniqueId technique ID。
 * @returns 函数返回值。
 */

        cultivateTechnique(playerId, techniqueId) {
            log.push(['cultivateTechnique', playerId, techniqueId]);
        },        
        /**
 * infuseBodyTraining：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param foundationAmount 参数说明。
 * @returns 函数返回值。
 */

        infuseBodyTraining(playerId, foundationAmount) {
            log.push(['infuseBodyTraining', playerId, foundationAmount]);
            return { foundationSpent: foundationAmount, expGained: foundationAmount * 2 };
        },
    }, {    
    /**
 * executeNpcQuestAction：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 函数返回值。
 */

        executeNpcQuestAction(playerId, npcId) {
            log.push(['executeNpcQuestAction', playerId, npcId]);
            return { kind: 'npcQuests', npcQuests: { npcId, quests: [] } };
        },
    });
}
/**
 * createDeps：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 函数返回值。
 */


function createDeps(log = []) {
    return {    
    /**
 * getPlayerLocationOrThrow：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        getPlayerLocationOrThrow(playerId) {
            log.push(['getPlayerLocationOrThrow', playerId]);
            return { instanceId: 'public:yunlai_town' };
        },        
        /**
 * resolveCurrentTickForPlayerId：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        resolveCurrentTickForPlayerId(playerId) {
            log.push(['resolveCurrentTickForPlayerId', playerId]);
            return 77;
        },        
        /**
 * usePortal：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        usePortal(playerId) {
            log.push(['usePortal', playerId]);
            return { tick: 1 };
        },        
        /**
 * enqueuePendingCommand：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 函数返回值。
 */

        enqueuePendingCommand(playerId, command) {
            log.push(['enqueuePendingCommand', playerId, command]);
        },        
        /**
 * getPlayerViewOrThrow：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        getPlayerViewOrThrow(playerId) {
            log.push(['getPlayerViewOrThrow', playerId]);
            return { tick: 2 };
        },        
        /**
 * queuePlayerNotice：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param message 参数说明。
 * @param kind 参数说明。
 * @returns 函数返回值。
 */

        queuePlayerNotice(playerId, message, kind) {
            log.push(['queuePlayerNotice', playerId, message, kind]);
        },        
        /**
 * buildNpcShopView：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 函数返回值。
 */

        buildNpcShopView(playerId, npcId) {
            log.push(['buildNpcShopView', playerId, npcId]);
            return { npcId, items: [] };
        },
    };
}
/**
 * testPortalTravel：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testPortalTravel() {
    const log = [];
    const service = createService({
        combat: {},
        techniques: {},
    }, log);
    const deps = createDeps(log);
    const result = service.executeAction('player:1', 'portal:travel', undefined, deps);
    assert.deepEqual(result, {
        kind: 'queued',
        view: { tick: 1 },
    });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['resolveCurrentTickForPlayerId', 'player:1'],
        ['usePortal', 'player:1'],
    ]);
}
/**
 * testBreakthroughQueuesPendingCommand：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testBreakthroughQueuesPendingCommand() {
    const log = [];
    const service = createService({
        combat: {},
        techniques: {},
    }, log);
    const deps = createDeps(log);
    const result = service.executeAction('player:1', 'realm:breakthrough', undefined, deps);
    assert.deepEqual(result, {
        kind: 'queued',
        view: { tick: 2 },
    });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['resolveCurrentTickForPlayerId', 'player:1'],
        ['enqueuePendingCommand', 'player:1', { kind: 'breakthrough' }],
        ['getPlayerViewOrThrow', 'player:1'],
    ]);
}
/**
 * testBodyTrainingInfuse：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testBodyTrainingInfuse() {
    const log = [];
    const service = createService({
        combat: {},
        techniques: {},
    }, log);
    const deps = createDeps(log);
    const result = service.executeAction('player:1', 'body_training:infuse', '12', deps);
    assert.deepEqual(result, {
        kind: 'queued',
        view: { tick: 2 },
    });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['resolveCurrentTickForPlayerId', 'player:1'],
        ['infuseBodyTraining', 'player:1', 12],
        ['queuePlayerNotice', 'player:1', '你将 12 点底蕴灌入肉身，转化为 24 点炼体经验', 'success'],
        ['getPlayerViewOrThrow', 'player:1'],
    ]);
}
/**
 * testToggleAutoBattle：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testToggleAutoBattle() {
    const log = [];
    const service = createService({
        combat: {
            autoBattle: false,
        },
        techniques: {},
    }, log);
    const deps = createDeps(log);
    const result = service.executeAction('player:1', 'toggle:auto_battle', undefined, deps);
    assert.deepEqual(result, {
        kind: 'queued',
        view: { tick: 2 },
    });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['resolveCurrentTickForPlayerId', 'player:1'],
        ['getPlayerOrThrow', 'player:1'],
        ['updateCombatSettings', 'player:1', { autoBattle: true }, 77],
        ['getPlayerViewOrThrow', 'player:1'],
    ]);
}
/**
 * testCultivationToggle：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testCultivationToggle() {
    const log = [];
    const service = createService({
        combat: {
            cultivationActive: false,
        },
        techniques: {
            cultivatingTechId: 'technique.alpha',
        },
    }, log);
    const deps = createDeps(log);
    const result = service.executeAction('player:1', 'cultivation:toggle', undefined, deps);
    assert.deepEqual(result, {
        kind: 'queued',
        view: { tick: 2 },
    });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['resolveCurrentTickForPlayerId', 'player:1'],
        ['getPlayerOrThrow', 'player:1'],
        ['cultivateTechnique', 'player:1', 'technique.alpha'],
        ['queuePlayerNotice', 'player:1', '已恢复当前修炼', 'info'],
        ['getPlayerViewOrThrow', 'player:1'],
    ]);
}
/**
 * testNpcShopView：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testNpcShopView() {
    const log = [];
    const service = createService({
        combat: {},
        techniques: {},
    }, log);
    const deps = createDeps(log);
    const result = service.executeAction('player:1', 'npc_shop:npc_a', undefined, deps);
    assert.deepEqual(result, {
        kind: 'npcShop',
        npcShop: { npcId: 'npc_a', items: [] },
    });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['resolveCurrentTickForPlayerId', 'player:1'],
        ['buildNpcShopView', 'player:1', 'npc_a'],
    ]);
}
/**
 * testNpcQuestActionDelegates：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testNpcQuestActionDelegates() {
    const log = [];
    const service = createService({
        combat: {},
        techniques: {},
    }, log);
    const deps = createDeps(log);
    const result = service.executeAction('player:1', 'npc_quests:npc_a', undefined, deps);
    assert.deepEqual(result, {
        kind: 'npcQuests',
        npcQuests: { npcId: 'npc_a', quests: [] },
    });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['resolveCurrentTickForPlayerId', 'player:1'],
        ['executeNpcQuestAction', 'player:1', 'npc_a'],
    ]);
}
/**
 * testLegacyNpcActionDelegates：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testLegacyNpcActionDelegates() {
    const log = [];
    const service = createService({
        combat: {},
        techniques: {},
    }, log);
    const deps = createDeps(log);
    const result = service.executeAction('player:1', 'npc:npc_legacy', undefined, deps);
    assert.deepEqual(result, {
        kind: 'npcQuests',
        npcQuests: { npcId: 'npc_legacy', quests: [] },
    });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['resolveCurrentTickForPlayerId', 'player:1'],
        ['executeNpcQuestAction', 'player:1', 'npc_legacy'],
    ]);
}

testPortalTravel();
testBreakthroughQueuesPendingCommand();
testBodyTrainingInfuse();
testToggleAutoBattle();
testCultivationToggle();
testNpcShopView();
testNpcQuestActionDelegates();
testLegacyNpcActionDelegates();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-action-execution' }, null, 2));
