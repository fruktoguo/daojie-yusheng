// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeTickDispatchService } = require("../runtime/world/world-runtime-tick-dispatch.service");
/**
 * testTickDispatchFacade：判断testtickDispatchFacade是否满足条件。
 * @returns 无返回值，直接更新testtickDispatchFacade相关状态。
 */


function testTickDispatchFacade() {
    const service = new WorldRuntimeTickDispatchService();
    const log = [];
    const deps = {    
    /**
 * getInstanceRuntime：读取Instance运行态。
 * @param instanceId instance ID。
 * @returns 无返回值，完成Instance运行态的读取/组装。
 */

        getInstanceRuntime(instanceId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

            if (instanceId !== 'public:yunlai_town') {
                return null;
            }
            return {            
            /**
 * isPointInSafeZone：判断PointInSafeZone是否满足条件。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @returns 无返回值，完成PointInSafeZone的条件判断。
 */

                isPointInSafeZone(x, y) {
                    log.push(['isPointInSafeZone', x, y]);
                    return true;
                },
            };
        },
        playerRuntimeService: {        
        /**
 * enqueueNotice：处理Notice并更新相关状态。
 * @param playerId 玩家 ID。
 * @param notice 参数说明。
 * @returns 无返回值，直接更新Notice相关状态。
 */

            enqueueNotice(playerId, notice) {
                log.push(['enqueueNotice', playerId, notice.kind, notice.text]);
            },
        },
        worldRuntimeNavigationService: {        
        /**
 * getLegacyNavigationPath：读取Legacy导航路径。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成Legacy导航路径的读取/组装。
 */

            getLegacyNavigationPath(playerId) { return { playerId, path: [] }; },            
            /**
 * materializeNavigationCommands：执行materialize导航Command相关逻辑。
 * @returns 无返回值，直接更新materialize导航Command相关状态。
 */

            materializeNavigationCommands() { log.push(['materializeNavigationCommands']); },            
            /**
 * resolveNavigationStep：规范化或转换导航Step。
 * @param playerId 玩家 ID。
 * @param intent 参数说明。
 * @returns 无返回值，直接更新导航Step相关状态。
 */

            resolveNavigationStep(playerId, intent) { return { playerId, intent }; },            
            /**
 * resolveNavigationDestination：规范化或转换导航Destination。
 * @param playerId 玩家 ID。
 * @param intent 参数说明。
 * @returns 无返回值，直接更新导航Destination相关状态。
 */

            resolveNavigationDestination(playerId, intent) { return { mapId: 'yunlai_town', intent }; },            
            /**
 * dispatchMoveTo：判断MoveTo是否满足条件。
 * @param playerId 玩家 ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @returns 无返回值，直接更新MoveTo相关状态。
 */

            dispatchMoveTo(playerId, x, y) { log.push(['dispatchMoveTo', playerId, x, y]); },
        },
        worldRuntimeTransferService: {        
        /**
 * applyTransfer：处理Transfer并更新相关状态。
 * @param transfer 参数说明。
 * @returns 无返回值，直接更新Transfer相关状态。
 */

            applyTransfer(transfer) { log.push(['applyTransfer', transfer.playerId]); },
        },
        worldRuntimeAutoCombatService: {        
        /**
 * materializeAutoCombatCommands：执行materializeAuto战斗Command相关逻辑。
 * @returns 无返回值，直接更新materializeAuto战斗Command相关状态。
 */

            materializeAutoCombatCommands() { log.push(['materializeAutoCombatCommands']); },            
            /**
 * buildAutoCombatCommand：构建并返回目标对象。
 * @param instance 地图实例。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新Auto战斗Command相关状态。
 */

            buildAutoCombatCommand(instance, player) { return { instanceId: instance.meta.instanceId, playerId: player.playerId }; },            
            /**
 * selectAutoCombatTarget：读取selectAuto战斗目标并返回结果。
 * @param _instance 参数说明。
 * @param _player 参数说明。
 * @param visibleMonsters 参数说明。
 * @returns 无返回值，直接更新selectAuto战斗目标相关状态。
 */

            selectAutoCombatTarget(_instance, _player, visibleMonsters) { return visibleMonsters[0] ?? null; },            
            /**
 * resolveTrackedAutoCombatTarget：读取TrackedAuto战斗目标并返回结果。
 * @param _instance 参数说明。
 * @param _player 参数说明。
 * @param visibleMonsters 参数说明。
 * @returns 无返回值，直接更新TrackedAuto战斗目标相关状态。
 */

            resolveTrackedAutoCombatTarget(_instance, _player, visibleMonsters) { return visibleMonsters[0] ?? null; },            
            /**
 * pickAutoBattleSkill：执行pickAutoBattle技能相关逻辑。
 * @param player 玩家对象。
 * @param distance 参数说明。
 * @returns 无返回值，直接更新pickAutoBattle技能相关状态。
 */

            pickAutoBattleSkill(player, distance) { return { playerId: player.playerId, distance }; },            
            /**
 * resolveAutoBattleDesiredRange：规范化或转换AutoBattleDesired范围。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新AutoBattleDesired范围相关状态。
 */

            resolveAutoBattleDesiredRange(player) { return player.range ?? 1; },
        },
        worldRuntimePendingCommandService: {        
        /**
 * dispatchPendingCommands：判断待处理Command是否满足条件。
 * @returns 无返回值，直接更新PendingCommand相关状态。
 */

            dispatchPendingCommands() { log.push(['dispatchPendingCommands']); },
        },
        worldRuntimeSystemCommandService: {        
        /**
 * dispatchPendingSystemCommands：判断待处理SystemCommand是否满足条件。
 * @returns 无返回值，直接更新PendingSystemCommand相关状态。
 */

            dispatchPendingSystemCommands() { log.push(['dispatchPendingSystemCommands']); },            
            /**
 * dispatchSystemCommand：判断SystemCommand是否满足条件。
 * @param command 输入指令。
 * @returns 无返回值，直接更新SystemCommand相关状态。
 */

            dispatchSystemCommand(command) { log.push(['dispatchSystemCommand', command.kind]); },
        },
        worldRuntimeMovementService: {        
        /**
 * dispatchInstanceCommand：判断InstanceCommand是否满足条件。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 无返回值，直接更新InstanceCommand相关状态。
 */

            dispatchInstanceCommand(playerId, command) { log.push(['dispatchInstanceCommand', playerId, command.kind]); },
        },
        worldRuntimePlayerCommandService: {        
        /**
 * dispatchPlayerCommand：判断玩家Command是否满足条件。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 无返回值，直接更新玩家Command相关状态。
 */

            dispatchPlayerCommand(playerId, command) { log.push(['dispatchPlayerCommand', playerId, command.kind]); },
        },
        worldRuntimeMonsterActionApplyService: {        
        /**
 * applyMonsterAction：处理怪物Action并更新相关状态。
 * @param action 参数说明。
 * @returns 无返回值，直接更新怪物Action相关状态。
 */

            applyMonsterAction(action) { log.push(['applyMonsterAction', action.kind]); },            
            /**
 * applyMonsterBasicAttack：处理怪物BasicAttack并更新相关状态。
 * @param action 参数说明。
 * @returns 无返回值，直接更新怪物BasicAttack相关状态。
 */

            applyMonsterBasicAttack(action) { log.push(['applyMonsterBasicAttack', action.kind]); },            
            /**
 * applyMonsterSkill：处理怪物技能并更新相关状态。
 * @param action 参数说明。
 * @returns 无返回值，直接更新怪物技能相关状态。
 */

            applyMonsterSkill(action) { log.push(['applyMonsterSkill', action.kind]); },
        },
        worldRuntimeItemGroundService: {        
        /**
 * spawnGroundItem：执行spawn地面道具相关逻辑。
 * @param instance 地图实例。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param item 道具。
 * @returns 无返回值，直接更新spawnGround道具相关状态。
 */

            spawnGroundItem(instance, x, y, item) { log.push(['spawnGroundItem', instance.meta.instanceId, x, y, item.itemId]); },
        },
        worldRuntimeCombatEffectsService: {        
        /**
 * pushCombatEffect：处理战斗Effect并更新相关状态。
 * @param instanceId instance ID。
 * @param effect 参数说明。
 * @returns 无返回值，直接更新战斗Effect相关状态。
 */

            pushCombatEffect(instanceId, effect) { log.push(['pushCombatEffect', instanceId, effect.kind]); },            
            /**
 * pushActionLabelEffect：处理ActionLabelEffect并更新相关状态。
 * @param instanceId instance ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param text 参数说明。
 * @returns 无返回值，直接更新ActionLabelEffect相关状态。
 */

            pushActionLabelEffect(instanceId, x, y, text) { log.push(['pushActionLabelEffect', instanceId, x, y, text]); },            
            /**
 * pushDamageFloatEffect：处理DamageFloatEffect并更新相关状态。
 * @param instanceId instance ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param damage 参数说明。
 * @param color 参数说明。
 * @returns 无返回值，直接更新DamageFloatEffect相关状态。
 */

            pushDamageFloatEffect(instanceId, x, y, damage, color) { log.push(['pushDamageFloatEffect', instanceId, x, y, damage, color]); },            
            /**
 * pushAttackEffect：处理AttackEffect并更新相关状态。
 * @param instanceId instance ID。
 * @param fromX 参数说明。
 * @param fromY 参数说明。
 * @param toX 参数说明。
 * @param toY 参数说明。
 * @param color 参数说明。
 * @returns 无返回值，直接更新AttackEffect相关状态。
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
