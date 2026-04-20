// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeTickDispatchService } = require("../runtime/world/world-runtime-tick-dispatch.service");
/**
 * testTickDispatchFacade：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testTickDispatchFacade() {
    const service = new WorldRuntimeTickDispatchService();
    const log = [];
    const deps = {    
    /**
 * getInstanceRuntime：按给定条件读取/查询数据。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

        getInstanceRuntime(instanceId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

            if (instanceId !== 'public:yunlai_town') {
                return null;
            }
            return {            
            /**
 * isPointInSafeZone：执行状态校验并返回判断结果。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @returns 函数返回值。
 */

                isPointInSafeZone(x, y) {
                    log.push(['isPointInSafeZone', x, y]);
                    return true;
                },
            };
        },
        playerRuntimeService: {        
        /**
 * enqueueNotice：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param notice 参数说明。
 * @returns 函数返回值。
 */

            enqueueNotice(playerId, notice) {
                log.push(['enqueueNotice', playerId, notice.kind, notice.text]);
            },
        },
        worldRuntimeNavigationService: {        
        /**
 * getLegacyNavigationPath：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

            getLegacyNavigationPath(playerId) { return { playerId, path: [] }; },            
            /**
 * materializeNavigationCommands：执行核心业务逻辑。
 * @returns 函数返回值。
 */

            materializeNavigationCommands() { log.push(['materializeNavigationCommands']); },            
            /**
 * resolveNavigationStep：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param intent 参数说明。
 * @returns 函数返回值。
 */

            resolveNavigationStep(playerId, intent) { return { playerId, intent }; },            
            /**
 * resolveNavigationDestination：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param intent 参数说明。
 * @returns 函数返回值。
 */

            resolveNavigationDestination(playerId, intent) { return { mapId: 'yunlai_town', intent }; },            
            /**
 * dispatchMoveTo：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @returns 函数返回值。
 */

            dispatchMoveTo(playerId, x, y) { log.push(['dispatchMoveTo', playerId, x, y]); },
        },
        worldRuntimeTransferService: {        
        /**
 * applyTransfer：更新/写入相关状态。
 * @param transfer 参数说明。
 * @returns 函数返回值。
 */

            applyTransfer(transfer) { log.push(['applyTransfer', transfer.playerId]); },
        },
        worldRuntimeAutoCombatService: {        
        /**
 * materializeAutoCombatCommands：执行核心业务逻辑。
 * @returns 函数返回值。
 */

            materializeAutoCombatCommands() { log.push(['materializeAutoCombatCommands']); },            
            /**
 * buildAutoCombatCommand：构建并返回目标对象。
 * @param instance 地图实例。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

            buildAutoCombatCommand(instance, player) { return { instanceId: instance.meta.instanceId, playerId: player.playerId }; },            
            /**
 * selectAutoCombatTarget：执行核心业务逻辑。
 * @param _instance 参数说明。
 * @param _player 参数说明。
 * @param visibleMonsters 参数说明。
 * @returns 函数返回值。
 */

            selectAutoCombatTarget(_instance, _player, visibleMonsters) { return visibleMonsters[0] ?? null; },            
            /**
 * resolveTrackedAutoCombatTarget：执行核心业务逻辑。
 * @param _instance 参数说明。
 * @param _player 参数说明。
 * @param visibleMonsters 参数说明。
 * @returns 函数返回值。
 */

            resolveTrackedAutoCombatTarget(_instance, _player, visibleMonsters) { return visibleMonsters[0] ?? null; },            
            /**
 * pickAutoBattleSkill：执行核心业务逻辑。
 * @param player 玩家对象。
 * @param distance 参数说明。
 * @returns 函数返回值。
 */

            pickAutoBattleSkill(player, distance) { return { playerId: player.playerId, distance }; },            
            /**
 * resolveAutoBattleDesiredRange：执行核心业务逻辑。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

            resolveAutoBattleDesiredRange(player) { return player.range ?? 1; },
        },
        worldRuntimePendingCommandService: {        
        /**
 * dispatchPendingCommands：处理事件并驱动执行路径。
 * @returns 函数返回值。
 */

            dispatchPendingCommands() { log.push(['dispatchPendingCommands']); },
        },
        worldRuntimeSystemCommandService: {        
        /**
 * dispatchPendingSystemCommands：处理事件并驱动执行路径。
 * @returns 函数返回值。
 */

            dispatchPendingSystemCommands() { log.push(['dispatchPendingSystemCommands']); },            
            /**
 * dispatchSystemCommand：处理事件并驱动执行路径。
 * @param command 输入指令。
 * @returns 函数返回值。
 */

            dispatchSystemCommand(command) { log.push(['dispatchSystemCommand', command.kind]); },
        },
        worldRuntimeMovementService: {        
        /**
 * dispatchInstanceCommand：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 函数返回值。
 */

            dispatchInstanceCommand(playerId, command) { log.push(['dispatchInstanceCommand', playerId, command.kind]); },
        },
        worldRuntimePlayerCommandService: {        
        /**
 * dispatchPlayerCommand：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 函数返回值。
 */

            dispatchPlayerCommand(playerId, command) { log.push(['dispatchPlayerCommand', playerId, command.kind]); },
        },
        worldRuntimeMonsterActionApplyService: {        
        /**
 * applyMonsterAction：更新/写入相关状态。
 * @param action 参数说明。
 * @returns 函数返回值。
 */

            applyMonsterAction(action) { log.push(['applyMonsterAction', action.kind]); },            
            /**
 * applyMonsterBasicAttack：更新/写入相关状态。
 * @param action 参数说明。
 * @returns 函数返回值。
 */

            applyMonsterBasicAttack(action) { log.push(['applyMonsterBasicAttack', action.kind]); },            
            /**
 * applyMonsterSkill：更新/写入相关状态。
 * @param action 参数说明。
 * @returns 函数返回值。
 */

            applyMonsterSkill(action) { log.push(['applyMonsterSkill', action.kind]); },
        },
        worldRuntimeItemGroundService: {        
        /**
 * spawnGroundItem：执行核心业务逻辑。
 * @param instance 地图实例。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param item 道具。
 * @returns 函数返回值。
 */

            spawnGroundItem(instance, x, y, item) { log.push(['spawnGroundItem', instance.meta.instanceId, x, y, item.itemId]); },
        },
        worldRuntimeCombatEffectsService: {        
        /**
 * pushCombatEffect：执行核心业务逻辑。
 * @param instanceId instance ID。
 * @param effect 参数说明。
 * @returns 函数返回值。
 */

            pushCombatEffect(instanceId, effect) { log.push(['pushCombatEffect', instanceId, effect.kind]); },            
            /**
 * pushActionLabelEffect：执行核心业务逻辑。
 * @param instanceId instance ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param text 参数说明。
 * @returns 函数返回值。
 */

            pushActionLabelEffect(instanceId, x, y, text) { log.push(['pushActionLabelEffect', instanceId, x, y, text]); },            
            /**
 * pushDamageFloatEffect：执行核心业务逻辑。
 * @param instanceId instance ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param damage 参数说明。
 * @param color 参数说明。
 * @returns 函数返回值。
 */

            pushDamageFloatEffect(instanceId, x, y, damage, color) { log.push(['pushDamageFloatEffect', instanceId, x, y, damage, color]); },            
            /**
 * pushAttackEffect：执行核心业务逻辑。
 * @param instanceId instance ID。
 * @param fromX 参数说明。
 * @param fromY 参数说明。
 * @param toX 参数说明。
 * @param toY 参数说明。
 * @param color 参数说明。
 * @returns 函数返回值。
 */

            pushAttackEffect(instanceId, fromX, fromY, toX, toY, color) { log.push(['pushAttackEffect', instanceId, fromX, fromY, toX, toY, color]); },
        },
    };

    assert.deepEqual(service.getLegacyNavigationPath('player:1', deps), { playerId: 'player:1', path: [] });
    service.applyTransfer({ playerId: 'player:1' }, deps);
    service.materializeNavigationCommands(deps);
    assert.deepEqual(service.resolveNavigationStep('player:1', { type: 'quest' }, deps), { playerId: 'player:1', intent: { type: 'quest' } });
    assert.deepEqual(service.resolveNavigationDestination('player:1', { type: 'quest' }, deps), { mapId: 'yunlai_town', intent: { type: 'quest' } });
    service.materializeAutoCombatCommands(deps);
    assert.deepEqual(
        service.buildAutoCombatCommand({ meta: { instanceId: 'public:yunlai_town' } }, { playerId: 'player:1' }, deps),
        { instanceId: 'public:yunlai_town', playerId: 'player:1' },
    );
    assert.deepEqual(service.selectAutoCombatTarget({}, {}, [{ runtimeId: 'm:1' }], deps), { runtimeId: 'm:1' });
    assert.deepEqual(service.resolveTrackedAutoCombatTarget({}, {}, [{ runtimeId: 'm:2' }], deps), { runtimeId: 'm:2' });
    assert.deepEqual(service.pickAutoBattleSkill({ playerId: 'player:1' }, 2, deps), { playerId: 'player:1', distance: 2 });
    assert.equal(service.resolveAutoBattleDesiredRange({ range: 3 }, deps), 3);
    service.dispatchPendingCommands(deps);
    service.dispatchPendingSystemCommands(deps);
    service.dispatchInstanceCommand('player:1', { kind: 'move' }, deps);
    service.dispatchPlayerCommand('player:1', { kind: 'use-item' }, deps);
    service.dispatchSystemCommand({ kind: 'damage-player' }, deps);
    service.dispatchMoveTo('player:1', 10, 10, true, null, deps);
    service.applyMonsterAction({ kind: 'move' }, deps);
    service.applyMonsterBasicAttack({ kind: 'basic-attack' }, deps);
    service.applyMonsterSkill({ kind: 'skill' }, deps);
    service.spawnGroundItem({ meta: { instanceId: 'public:yunlai_town' } }, 10, 10, { itemId: 'item:1' }, deps);
    service.queuePlayerNotice('player:1', 'notice', 'info', deps);
    service.pushCombatEffect('public:yunlai_town', { kind: 'flash' }, deps);
    service.pushActionLabelEffect('public:yunlai_town', 1, 2, 'Slash', deps);
    service.pushDamageFloatEffect('public:yunlai_town', 1, 2, 15, '#fff', deps);
    service.pushAttackEffect('public:yunlai_town', 1, 2, 3, 4, '#f00', deps);
    assert.throws(
        () => service.ensureAttackAllowed(
            { instanceId: 'public:yunlai_town', x: 1, y: 1 },
            { effects: [{ type: 'damage' }] },
            deps,
        ),
        /安全区内无法发起攻击/,
    );
}

testTickDispatchFacade();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-tick-dispatch' }, null, 2));
