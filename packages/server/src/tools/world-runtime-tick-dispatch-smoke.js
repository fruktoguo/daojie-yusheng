"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimeTickDispatchService } = require("../runtime/world/world-runtime-tick-dispatch.service");

function testTickDispatchFacade() {
    const service = new WorldRuntimeTickDispatchService();
    const log = [];
    const deps = {
        getInstanceRuntime(instanceId) {
            if (instanceId !== 'public:yunlai_town') {
                return null;
            }
            return {
                isPointInSafeZone(x, y) {
                    log.push(['isPointInSafeZone', x, y]);
                    return true;
                },
            };
        },
        playerRuntimeService: {
            enqueueNotice(playerId, notice) {
                log.push(['enqueueNotice', playerId, notice.kind, notice.text]);
            },
        },
        worldRuntimeNavigationService: {
            getLegacyNavigationPath(playerId) { return { playerId, path: [] }; },
            materializeNavigationCommands() { log.push(['materializeNavigationCommands']); },
            resolveNavigationStep(playerId, intent) { return { playerId, intent }; },
            resolveNavigationDestination(playerId, intent) { return { mapId: 'yunlai_town', intent }; },
            dispatchMoveTo(playerId, x, y) { log.push(['dispatchMoveTo', playerId, x, y]); },
        },
        worldRuntimeTransferService: {
            applyTransfer(transfer) { log.push(['applyTransfer', transfer.playerId]); },
        },
        worldRuntimeAutoCombatService: {
            materializeAutoCombatCommands() { log.push(['materializeAutoCombatCommands']); },
            buildAutoCombatCommand(instance, player) { return { instanceId: instance.meta.instanceId, playerId: player.playerId }; },
            selectAutoCombatTarget(_instance, _player, visibleMonsters) { return visibleMonsters[0] ?? null; },
            resolveTrackedAutoCombatTarget(_instance, _player, visibleMonsters) { return visibleMonsters[0] ?? null; },
            pickAutoBattleSkill(player, distance) { return { playerId: player.playerId, distance }; },
            resolveAutoBattleDesiredRange(player) { return player.range ?? 1; },
        },
        worldRuntimePendingCommandService: {
            dispatchPendingCommands() { log.push(['dispatchPendingCommands']); },
        },
        worldRuntimeSystemCommandService: {
            dispatchPendingSystemCommands() { log.push(['dispatchPendingSystemCommands']); },
            dispatchSystemCommand(command) { log.push(['dispatchSystemCommand', command.kind]); },
        },
        worldRuntimeMovementService: {
            dispatchInstanceCommand(playerId, command) { log.push(['dispatchInstanceCommand', playerId, command.kind]); },
        },
        worldRuntimePlayerCommandService: {
            dispatchPlayerCommand(playerId, command) { log.push(['dispatchPlayerCommand', playerId, command.kind]); },
        },
        worldRuntimeMonsterActionApplyService: {
            applyMonsterAction(action) { log.push(['applyMonsterAction', action.kind]); },
            applyMonsterBasicAttack(action) { log.push(['applyMonsterBasicAttack', action.kind]); },
            applyMonsterSkill(action) { log.push(['applyMonsterSkill', action.kind]); },
        },
        worldRuntimeItemGroundService: {
            spawnGroundItem(instance, x, y, item) { log.push(['spawnGroundItem', instance.meta.instanceId, x, y, item.itemId]); },
        },
        worldRuntimeCombatEffectsService: {
            pushCombatEffect(instanceId, effect) { log.push(['pushCombatEffect', instanceId, effect.kind]); },
            pushActionLabelEffect(instanceId, x, y, text) { log.push(['pushActionLabelEffect', instanceId, x, y, text]); },
            pushDamageFloatEffect(instanceId, x, y, damage, color) { log.push(['pushDamageFloatEffect', instanceId, x, y, damage, color]); },
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
