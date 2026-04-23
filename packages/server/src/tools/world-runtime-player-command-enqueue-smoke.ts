// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimePlayerCommandEnqueueService } = require("../runtime/world/world-runtime-player-command-enqueue.service");
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
 * interruptManualCombat：执行interruptManual战斗相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新interruptManual战斗相关状态。
 */

        interruptManualCombat(playerId) {
            log.push(['interruptManualCombat', playerId]);
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
            return { playerId, tick: 9 };
        },
        resolveCurrentTickForPlayerId(playerId) {
            log.push(['resolveCurrentTickForPlayerId', playerId]);
            return 9;
        },
        queuePlayerNotice(playerId, text, kind) {
            log.push(['queuePlayerNotice', playerId, text, kind]);
        },
    };
}
/**
 * createService：构建并返回目标对象。
 * @param actions 参数说明。
 * @returns 无返回值，直接更新服务相关状态。
 */


function createService(actions = []) {
    return new WorldRuntimePlayerCommandEnqueueService({    
    /**
 * getPlayerOrThrow：读取玩家OrThrow。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家OrThrow的读取/组装。
 */

        getPlayerOrThrow(playerId) {
            return {
                playerId,
                combat: {
                    autoBattle: false,
                    combatTargetId: null,
                    combatTargetLocked: false,
                },
                actions: {
                    actions,
                },
            };
        },
        updateCombatSettings() {},
        clearCombatTarget() {},
    });
}
/**
 * testBasicAttackQueue：执行testBasicAttackQueue相关逻辑。
 * @returns 无返回值，直接更新testBasicAttackQueue相关状态。
 */


function testBasicAttackQueue() {
    const log = [];
    const service = createService();
    const deps = createDeps(log);
    const result = service.enqueueBasicAttack('player:1', ' player:2 ', '', 5.8, 6.2, deps);
    assert.deepEqual(result, { playerId: 'player:1', tick: 9 });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['interruptManualCombat', 'player:1'],
        ['enqueuePendingCommand', 'player:1', {
            kind: 'basicAttack',
            targetPlayerId: 'player:2',
            targetMonsterId: null,
            targetX: 5,
            targetY: 6,
            locked: undefined,
        }],
        ['getPlayerViewOrThrow', 'player:1'],
    ]);
}
/**
 * testStartAlchemyClonesIngredients：构建test开始炼丹CloneIngredient。
 * @returns 无返回值，直接更新testStart炼丹CloneIngredient相关状态。
 */


function testStartAlchemyClonesIngredients() {
    const log = [];
    const service = createService();
    const deps = createDeps(log);
    const source = {
        recipeId: 'alchemy.alpha',
        ingredients: [{ slotIndex: 1, count: 2 }],
    };
    service.enqueueStartAlchemy('player:1', source, deps);
    source.ingredients[0].count = 99;
    assert.equal(log[1][2].payload.ingredients[0].count, 2);
}
/**
 * testCastSkillRequiresKnownAction：执行testCast技能RequireKnownAction相关逻辑。
 * @returns 无返回值，直接更新testCast技能RequireKnownAction相关状态。
 */


function testCastSkillRequiresKnownAction() {
    const log = [];
    const service = createService([{ id: 'skill.alpha', type: 'skill', requiresTarget: true }]);
    const deps = createDeps(log);
    const result = service.enqueueCastSkill('player:1', ' skill.alpha ', '', ' monster:9 ', null, deps);
    assert.deepEqual(result, { playerId: 'player:1', tick: 9 });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['enqueuePendingCommand', 'player:1', {
            kind: 'castSkill',
            skillId: 'skill.alpha',
            targetPlayerId: null,
            targetMonsterId: 'monster:9',
            targetRef: null,
        }],
        ['getPlayerViewOrThrow', 'player:1'],
    ]);
}
/**
 * testHeavenGateActionNormalizesElement：规范化或转换testHeavenGateActionNormalizeElement。
 * @returns 无返回值，直接更新testHeavenGateActionNormalizeElement相关状态。
 */


function testHeavenGateActionNormalizesElement() {
    const log = [];
    const service = createService();
    const deps = createDeps(log);
    service.enqueueHeavenGateAction('player:1', 'open', ' fire ', deps);
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['enqueuePendingCommand', 'player:1', {
            kind: 'heavenGateAction',
            action: 'open',
            element: 'fire',
        }],
        ['getPlayerViewOrThrow', 'player:1'],
    ]);
}
/**
 * testStartEnhancementClonesNestedPayload：读取test开始强化CloneNested载荷并返回结果。
 * @returns 无返回值，直接更新testStart强化CloneNested载荷相关状态。
 */


function testStartEnhancementClonesNestedPayload() {
    const log = [];
    const service = createService();
    const deps = createDeps(log);
    const payload = {
        target: { slotIndex: 3 },
        protection: { itemId: 'stone.a' },
    };
    service.enqueueStartEnhancement('player:1', payload, deps);
    payload.target.slotIndex = 99;
    payload.protection.itemId = 'stone.changed';
    assert.deepEqual(log[1][2].payload, {
        target: { slotIndex: 3 },
        protection: { itemId: 'stone.a' },
    });
}

/**
 * testTechniqueActivityGenericQueueHelpers：验证通用技艺活动入队 helper。
 * @returns 无返回值，直接更新通用技艺活动入队 helper 相关状态。
 */

function testTechniqueActivityGenericQueueHelpers() {
    const log = [];
    const service = createService();
    const deps = createDeps(log);
    const startResult = service.enqueueStartTechniqueActivity('player:1', 'alchemy', { recipeId: 'recipe:generic' }, deps);
    const cancelResult = service.enqueueCancelTechniqueActivity('player:1', 'enhancement', deps);
    const gatherStartResult = service.enqueueStartTechniqueActivity('player:1', 'gather', { sourceId: 'container:inst:herb', itemKey: 'item:herb' }, deps);
    const gatherCancelResult = service.enqueueCancelTechniqueActivity('player:1', 'gather', deps);
    assert.deepEqual(startResult, { playerId: 'player:1', tick: 9 });
    assert.deepEqual(cancelResult, { playerId: 'player:1', tick: 9 });
    assert.deepEqual(gatherStartResult, { playerId: 'player:1', tick: 9 });
    assert.deepEqual(gatherCancelResult, { playerId: 'player:1', tick: 9 });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['enqueuePendingCommand', 'player:1', {
            kind: 'startAlchemy',
            payload: { recipeId: 'recipe:generic' },
        }],
        ['getPlayerViewOrThrow', 'player:1'],
        ['getPlayerLocationOrThrow', 'player:1'],
        ['enqueuePendingCommand', 'player:1', {
            kind: 'cancelEnhancement',
        }],
        ['getPlayerViewOrThrow', 'player:1'],
        ['getPlayerLocationOrThrow', 'player:1'],
        ['enqueuePendingCommand', 'player:1', {
            kind: 'startGather',
            payload: { sourceId: 'container:inst:herb', itemKey: 'item:herb' },
        }],
        ['getPlayerViewOrThrow', 'player:1'],
        ['getPlayerLocationOrThrow', 'player:1'],
        ['enqueuePendingCommand', 'player:1', {
            kind: 'cancelGather',
        }],
        ['getPlayerViewOrThrow', 'player:1'],
    ]);
}

function testLockedBattleWithoutTargetStopsCombatCleanly() {
    const log = [];
    const players = new Map([
        ['player:1', {
            playerId: 'player:1',
            combat: {
                autoBattle: true,
                combatTargetId: 'monster:dead',
                combatTargetLocked: true,
            },
            actions: {
                actions: [],
            },
        }],
    ]);
    const service = new WorldRuntimePlayerCommandEnqueueService({
        getPlayerOrThrow(playerId) {
            const player = players.get(playerId);
            if (!player) {
                throw new Error(`missing player ${playerId}`);
            }
            return player;
        },
        updateCombatSettings(playerId, input, currentTick) {
            log.push(['updateCombatSettings', playerId, input, currentTick]);
            const player = players.get(playerId);
            if (player && input.autoBattle === false) {
                player.combat.autoBattle = false;
            }
        },
        clearCombatTarget(playerId, currentTick) {
            log.push(['clearCombatTarget', playerId, currentTick]);
            const player = players.get(playerId);
            if (player) {
                player.combat.combatTargetId = null;
                player.combat.combatTargetLocked = false;
            }
        },
    });
    const deps = createDeps(log);
    const result = service.enqueueBattleTarget('player:1', true, null, null, undefined, undefined, deps);
    assert.deepEqual(result, { playerId: 'player:1', tick: 9 });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['interruptManualCombat', 'player:1'],
        ['resolveCurrentTickForPlayerId', 'player:1'],
        ['updateCombatSettings', 'player:1', { autoBattle: false }, 9],
        ['clearCombatTarget', 'player:1', 9],
        ['queuePlayerNotice', 'player:1', '强制攻击目标已经失效，已停止锁定。', 'combat'],
        ['getPlayerViewOrThrow', 'player:1'],
    ]);
}

testBasicAttackQueue();
testStartAlchemyClonesIngredients();
testCastSkillRequiresKnownAction();
testHeavenGateActionNormalizesElement();
testStartEnhancementClonesNestedPayload();
testTechniqueActivityGenericQueueHelpers();
testLockedBattleWithoutTargetStopsCombatCleanly();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-player-command-enqueue' }, null, 2));
