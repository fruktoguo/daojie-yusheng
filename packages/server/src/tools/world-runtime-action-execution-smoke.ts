// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeActionExecutionService } = require("../runtime/world/world-runtime-action-execution.service");
const { PVP_SHA_BACKLASH_BUFF_ID, PVP_SHA_INFUSION_BUFF_ID } = require("../constants/gameplay/pvp");
/**
 * createService：构建并返回目标对象。
 * @param player 玩家对象。
 * @param log 参数说明。
 * @returns 无返回值，直接更新服务相关状态。
 */


function createService(player, log = []) {
    return new WorldRuntimeActionExecutionService({    
    /**
 * getPlayerOrThrow：读取玩家OrThrow。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家OrThrow的读取/组装。
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
 * updateCombatSettings：处理战斗Setting并更新相关状态。
 * @param playerId 玩家 ID。
 * @param patch 参数说明。
 * @param tick 当前 tick。
 * @returns 无返回值，直接更新战斗Setting相关状态。
 */

        updateCombatSettings(playerId, patch, tick) {
            log.push(['updateCombatSettings', playerId, patch, tick]);
        },        
        /**
 * cultivateTechnique：执行cultivate功法相关逻辑。
 * @param playerId 玩家 ID。
 * @param techniqueId technique ID。
 * @returns 无返回值，直接更新cultivate功法相关状态。
 */

        cultivateTechnique(playerId, techniqueId) {
            log.push(['cultivateTechnique', playerId, techniqueId]);
        },        
        /**
 * infuseBodyTraining：执行infuseBodyTraining相关逻辑。
 * @param playerId 玩家 ID。
 * @param foundationAmount 参数说明。
 * @returns 无返回值，直接更新infuseBodyTraining相关状态。
 */

        infuseBodyTraining(playerId, foundationAmount) {
            log.push(['infuseBodyTraining', playerId, foundationAmount]);
            return { foundationSpent: foundationAmount, expGained: foundationAmount * 2 };
        },
        hasActiveBuff(playerId, buffId) {
            log.push(['hasActiveBuff', playerId, buffId]);
            return false;
        },
        updateWorldPreference(playerId, linePreset) {
            log.push(['updateWorldPreference', playerId, linePreset]);
        },
    }, {    
    /**
 * executeNpcQuestAction：执行executeNPC任务Action相关逻辑。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 无返回值，直接更新executeNPC任务Action相关状态。
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
 * @returns 无返回值，直接更新Dep相关状态。
 */


function createDeps(log = []) {
    return {    
    /**
 * getPlayerLocationOrThrow：读取玩家位置OrThrow。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家位置OrThrow的读取/组装。
 */

        getPlayerLocationOrThrow(playerId) {
            log.push(['getPlayerLocationOrThrow', playerId]);
            return { instanceId: 'public:yunlai_town' };
        },        
        /**
 * resolveCurrentTickForPlayerId：规范化或转换当前tickFor玩家ID。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新CurrenttickFor玩家ID相关状态。
 */

        resolveCurrentTickForPlayerId(playerId) {
            log.push(['resolveCurrentTickForPlayerId', playerId]);
            return 77;
        },        
        /**
 * usePortal：执行use传送门相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新usePortal相关状态。
 */

        usePortal(playerId) {
            log.push(['usePortal', playerId]);
            return { tick: 1 };
        },        
        /**
 * enqueuePendingCommand：处理待处理Command并更新相关状态。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 无返回值，直接更新PendingCommand相关状态。
 */

        enqueuePendingCommand(playerId, command) {
            log.push(['enqueuePendingCommand', playerId, command]);
        },        
        /**
 * getPlayerViewOrThrow：读取玩家视图OrThrow。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家视图OrThrow的读取/组装。
 */

        getPlayerViewOrThrow(playerId) {
            log.push(['getPlayerViewOrThrow', playerId]);
            return {
                tick: 2,
                instance: {
                    instanceId: 'public:yunlai_town',
                    templateId: 'yunlai_town',
                },
                self: {
                    x: 10,
                    y: 10,
                },
                localPortals: [{
                    x: 10,
                    y: 11,
                    trigger: 'manual',
                    targetMapId: 'wildlands',
                }],
            };
        },        
        /**
 * queuePlayerNotice：执行queue玩家Notice相关逻辑。
 * @param playerId 玩家 ID。
 * @param message 参数说明。
 * @param kind 参数说明。
 * @returns 无返回值，直接更新queue玩家Notice相关状态。
 */

        queuePlayerNotice(playerId, message, kind) {
            log.push(['queuePlayerNotice', playerId, message, kind]);
        },        
        /**
 * buildNpcShopView：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 无返回值，直接更新NPCShop视图相关状态。
 */

        buildNpcShopView(playerId, npcId) {
            log.push(['buildNpcShopView', playerId, npcId]);
            return { npcId, items: [] };
        },
        clearPendingCommand(playerId) {
            log.push(['clearPendingCommand', playerId]);
        },
        getOrCreateDefaultLineInstance(mapId, linePreset) {
            log.push(['getOrCreateDefaultLineInstance', mapId, linePreset]);
            return {
                meta: {
                    instanceId: linePreset === 'real' ? `real:${mapId}` : `public:${mapId}`,
                },
            };
        },
        getOrCreatePublicInstance(mapId) {
            log.push(['getOrCreatePublicInstance', mapId]);
            return {
                meta: {
                    instanceId: `public:${mapId}`,
                },
            };
        },
        worldRuntimeNavigationService: {
            clearNavigationIntent(playerId) {
                log.push(['clearNavigationIntent', playerId]);
            },
        },
        worldRuntimePlayerSessionService: {
            connectPlayer(input) {
                log.push(['connectPlayer', input]);
                return { tick: 9 };
            },
        },
    };
}

function assertQueuedViewTick(result, tick) {
    assert.equal(result?.kind, 'queued');
    assert.equal(result?.view?.tick, tick);
}
/**
 * testPortalTravel：执行test传送门Travel相关逻辑。
 * @returns 无返回值，直接更新testPortalTravel相关状态。
 */


function testPortalTravel() {
    const log = [];
    const service = createService({
        combat: {},
        techniques: {},
    }, log);
    const deps = createDeps(log);
    const result = service.executeAction('player:1', 'portal:travel', undefined, deps);
    assertQueuedViewTick(result, 1);
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['resolveCurrentTickForPlayerId', 'player:1'],
        ['usePortal', 'player:1'],
    ]);
}
/**
 * testBreakthroughQueuesPendingCommand：执行testBreakthroughQueue待处理Command相关逻辑。
 * @returns 无返回值，直接更新testBreakthroughQueuePendingCommand相关状态。
 */


function testBreakthroughQueuesPendingCommand() {
    const log = [];
    const service = createService({
        combat: {},
        techniques: {},
    }, log);
    const deps = createDeps(log);
    const result = service.executeAction('player:1', 'realm:breakthrough', undefined, deps);
    assertQueuedViewTick(result, 2);
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['resolveCurrentTickForPlayerId', 'player:1'],
        ['enqueuePendingCommand', 'player:1', { kind: 'breakthrough' }],
        ['getPlayerViewOrThrow', 'player:1'],
    ]);
}
/**
 * testBodyTrainingInfuse：执行testBodyTrainingInfuse相关逻辑。
 * @returns 无返回值，直接更新testBodyTrainingInfuse相关状态。
 */


function testBodyTrainingInfuse() {
    const log = [];
    const service = createService({
        combat: {},
        techniques: {},
    }, log);
    const deps = createDeps(log);
    const result = service.executeAction('player:1', 'body_training:infuse', '12', deps);
    assertQueuedViewTick(result, 2);
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['resolveCurrentTickForPlayerId', 'player:1'],
        ['infuseBodyTraining', 'player:1', 12],
        ['queuePlayerNotice', 'player:1', '你将 12 点底蕴灌入肉身，转化为 24 点炼体经验', 'success'],
        ['getPlayerViewOrThrow', 'player:1'],
    ]);
}
/**
 * testToggleAutoBattle：执行testToggleAutoBattle相关逻辑。
 * @returns 无返回值，直接更新testToggleAutoBattle相关状态。
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
    assertQueuedViewTick(result, 2);
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['resolveCurrentTickForPlayerId', 'player:1'],
        ['getPlayerOrThrow', 'player:1'],
        ['updateCombatSettings', 'player:1', { autoBattle: true }, 77],
        ['getPlayerViewOrThrow', 'player:1'],
    ]);
}

function testWorldMigrationSwitchesToRealLine() {
    const log = [];
    const service = createService({
        sessionId: 'session:1',
        instanceId: 'public:yunlai_town',
        templateId: 'yunlai_town',
        x: 10,
        y: 10,
        combat: {},
        techniques: {},
    }, log);
    const deps = createDeps(log);
    const result = service.executeAction('player:1', 'world:migrate', 'real', deps);
    assert.deepEqual(result, {
        kind: 'queued',
        view: { tick: 9 },
    });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['resolveCurrentTickForPlayerId', 'player:1'],
        ['getPlayerViewOrThrow', 'player:1'],
        ['getPlayerOrThrow', 'player:1'],
        ['updateWorldPreference', 'player:1', 'real'],
        ['clearNavigationIntent', 'player:1'],
        ['clearPendingCommand', 'player:1'],
        ['getOrCreateDefaultLineInstance', 'yunlai_town', 'real'],
        ['connectPlayer', {
            playerId: 'player:1',
            sessionId: 'session:1',
            instanceId: 'real:yunlai_town',
            preferredX: 10,
            preferredY: 10,
        }],
        ['queuePlayerNotice', 'player:1', '你已切入现世，后续跨图会默认进入现世线。', 'success'],
    ]);
}

function testWorldMigrationRejectsPeacefulWhenShaBuffActive() {
    const log = [];
    const service = createService({
        sessionId: 'session:1',
        instanceId: 'real:yunlai_town',
        templateId: 'yunlai_town',
        x: 10,
        y: 10,
        combat: {},
        techniques: {},
    }, log);
    service.playerRuntimeService.hasActiveBuff = (playerId, buffId) => {
        log.push(['hasActiveBuff', playerId, buffId]);
        return buffId === PVP_SHA_INFUSION_BUFF_ID;
    };
    const deps = createDeps(log);
    assert.throws(() => {
        service.executeAction('player:1', 'world:migrate', 'peaceful', deps);
    }, /无法迁回虚境/);
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['resolveCurrentTickForPlayerId', 'player:1'],
        ['getPlayerViewOrThrow', 'player:1'],
        ['hasActiveBuff', 'player:1', PVP_SHA_INFUSION_BUFF_ID],
    ]);
}

function testWorldMigrationRejectsBacklashWhenReturningPeaceful() {
    const log = [];
    const service = createService({
        sessionId: 'session:1',
        instanceId: 'real:yunlai_town',
        templateId: 'yunlai_town',
        x: 10,
        y: 10,
        combat: {},
        techniques: {},
    }, log);
    service.playerRuntimeService.hasActiveBuff = (playerId, buffId) => {
        log.push(['hasActiveBuff', playerId, buffId]);
        return buffId === PVP_SHA_BACKLASH_BUFF_ID;
    };
    const deps = createDeps(log);
    assert.throws(() => {
        service.executeAction('player:1', 'world:migrate', 'peaceful', deps);
    }, /无法迁回虚境/);
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['resolveCurrentTickForPlayerId', 'player:1'],
        ['getPlayerViewOrThrow', 'player:1'],
        ['hasActiveBuff', 'player:1', PVP_SHA_INFUSION_BUFF_ID],
        ['hasActiveBuff', 'player:1', PVP_SHA_BACKLASH_BUFF_ID],
    ]);
}
/**
 * testCultivationToggle：执行testCultivationToggle相关逻辑。
 * @returns 无返回值，直接更新testCultivationToggle相关状态。
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
    assertQueuedViewTick(result, 2);
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
 * testNpcShopView：执行testNPCShop视图相关逻辑。
 * @returns 无返回值，直接更新testNPCShop视图相关状态。
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
 * testNpcQuestActionDelegates：执行testNPC任务ActionDelegate相关逻辑。
 * @returns 无返回值，直接更新testNPC任务ActionDelegate相关状态。
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
 * testLegacyNpcActionDelegates：执行testLegacyNPCActionDelegate相关逻辑。
 * @returns 无返回值，直接更新testLegacyNPCActionDelegate相关状态。
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
testWorldMigrationSwitchesToRealLine();
testWorldMigrationRejectsPeacefulWhenShaBuffActive();
testWorldMigrationRejectsBacklashWhenReturningPeaceful();
testCultivationToggle();
testNpcShopView();
testNpcQuestActionDelegates();
testLegacyNpcActionDelegates();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-action-execution' }, null, 2));
