import assert from 'node:assert/strict';

import { WorldRuntimeBattleEngageService } from '../runtime/world/world-runtime-battle-engage.service';

function createDeferred() {
  let resolve!: () => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<void>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

function createPlayerRuntimeService(player: Record<string, unknown>, target: Record<string, unknown>) {
  return {
    getPlayerOrThrow(playerId: string) {
      if (playerId === player.playerId) {
        return player;
      }
      if (playerId === target.playerId) {
        return target;
      }
      throw new Error(`unexpected playerId ${playerId}`);
    },
    updateCombatSettings() {},
    setCombatTarget() {},
    setManualEngagePending() {},
    clearManualEngagePending() {},
    clearCombatTarget() {},
  };
}

async function testTileEngageAwaitsBasicAttack(): Promise<void> {
  const attacker = {
    playerId: 'player:attacker',
    instanceId: 'real:yunlai_town',
    combat: {
      autoBattle: false,
      retaliatePlayerTargetId: null,
      combatTargetingRules: undefined,
    },
  };
  const target = {
    playerId: 'player:target',
    instanceId: 'real:yunlai_town',
  };
  const service = new WorldRuntimeBattleEngageService(createPlayerRuntimeService(attacker, target) as never);
  const log: Array<unknown[]> = [];
  const deferred = createDeferred();
  const deps = {
    resolveCurrentTickForPlayerId() {
      return 12;
    },
    getInstanceRuntimeOrThrow(instanceId: string) {
      assert.equal(instanceId, 'real:yunlai_town');
      return {
        meta: {
          instanceId: 'real:yunlai_town',
          supportsPvp: true,
          canDamageTile: true,
        },
      };
    },
    interruptManualCombat(playerId: string) {
      log.push(['interruptManualCombat', playerId]);
    },
    async dispatchBasicAttack(playerId: string, targetPlayerId: string | null, targetMonsterId: string | null, targetX: number | null, targetY: number | null) {
      log.push(['dispatchBasicAttack', playerId, targetPlayerId, targetMonsterId, targetX, targetY]);
      await deferred.promise;
      log.push(['dispatchBasicAttack:resolved', playerId, targetPlayerId, targetMonsterId, targetX, targetY]);
    },
    buildAutoCombatCommand() {
      return null;
    },
    dispatchInstanceCommand() {
      throw new Error('dispatchInstanceCommand should not run for tile engage proof');
    },
    dispatchPlayerCommand() {
      throw new Error('dispatchPlayerCommand should not run for tile engage proof');
    },
  };

  const pending = service.dispatchEngageBattle(attacker.playerId, null, null, 11, 10, true, deps as never);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(log, [
    ['interruptManualCombat', 'player:attacker'],
    ['dispatchBasicAttack', 'player:attacker', null, null, 11, 10],
  ]);
  deferred.resolve();
  await pending;
  assert.deepEqual(log, [
    ['interruptManualCombat', 'player:attacker'],
    ['dispatchBasicAttack', 'player:attacker', null, null, 11, 10],
    ['dispatchBasicAttack:resolved', 'player:attacker', null, null, 11, 10],
  ]);
}

async function testMonsterEngageAwaitsImmediateAutoCombatCommand(): Promise<void> {
  const attacker = {
    playerId: 'player:attacker',
    instanceId: 'real:yunlai_town',
    combat: {
      autoBattle: false,
      retaliatePlayerTargetId: null,
      combatTargetingRules: undefined,
    },
  };
  const target = {
    playerId: 'player:target',
    instanceId: 'real:yunlai_town',
  };
  const service = new WorldRuntimeBattleEngageService(createPlayerRuntimeService(attacker, target) as never);
  const log: Array<unknown[]> = [];
  const deferred = createDeferred();
  const autoCommand = { kind: 'basicAttack', targetMonsterId: 'monster:runtime:1' };
  const deps = {
    resolveCurrentTickForPlayerId() {
      return 12;
    },
    getInstanceRuntimeOrThrow(instanceId: string) {
      assert.equal(instanceId, 'real:yunlai_town');
      return {
        meta: {
          instanceId: 'real:yunlai_town',
          supportsPvp: true,
          canDamageTile: true,
        },
        getMonster(runtimeId: string) {
          assert.equal(runtimeId, 'monster:runtime:1');
          return {
            runtimeId: 'monster:runtime:1',
            alive: true,
          };
        },
      };
    },
    interruptManualCombat(playerId: string) {
      log.push(['interruptManualCombat', playerId]);
    },
    dispatchBasicAttack() {
      throw new Error('dispatchBasicAttack should not run for monster auto-combat proof');
    },
    buildAutoCombatCommand() {
      return autoCommand;
    },
    dispatchInstanceCommand() {
      throw new Error('dispatchInstanceCommand should not run for immediate combat proof');
    },
    async dispatchPlayerCommand(playerId: string, command: unknown) {
      log.push(['dispatchPlayerCommand', playerId, command]);
      await deferred.promise;
      log.push(['dispatchPlayerCommand:resolved', playerId, command]);
    },
  };

  const pending = service.dispatchEngageBattle(attacker.playerId, null, 'monster:runtime:1', null, null, true, deps as never);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(log, [
    ['interruptManualCombat', 'player:attacker'],
    ['dispatchPlayerCommand', 'player:attacker', autoCommand],
  ]);
  deferred.resolve();
  await pending;
  assert.deepEqual(log, [
    ['interruptManualCombat', 'player:attacker'],
    ['dispatchPlayerCommand', 'player:attacker', autoCommand],
    ['dispatchPlayerCommand:resolved', 'player:attacker', autoCommand],
  ]);
}

async function testUnlockedMonsterEngageUsesManualEngageInsteadOfPersistentAutoBattle(): Promise<void> {
  const attacker = {
    playerId: 'player:attacker',
    instanceId: 'real:yunlai_town',
    combat: {
      autoBattle: false,
      manualEngagePending: false,
      combatTargetId: null,
      combatTargetLocked: false,
      retaliatePlayerTargetId: null,
      combatTargetingRules: undefined,
    },
  };
  const target = {
    playerId: 'player:target',
    instanceId: 'real:yunlai_town',
  };
  const log: Array<unknown[]> = [];
  const service = new WorldRuntimeBattleEngageService({
    getPlayerOrThrow(playerId: string) {
      if (playerId === attacker.playerId) {
        return attacker;
      }
      if (playerId === target.playerId) {
        return target;
      }
      throw new Error(`unexpected playerId ${playerId}`);
    },
    updateCombatSettings(playerId: string, input: unknown, currentTick: number) {
      log.push(['updateCombatSettings', playerId, input, currentTick]);
    },
    setCombatTarget(playerId: string, targetId: string | null, locked: boolean, currentTick: number) {
      log.push(['setCombatTarget', playerId, targetId, locked, currentTick]);
      attacker.combat.combatTargetId = targetId;
      attacker.combat.combatTargetLocked = locked;
      return attacker;
    },
    setManualEngagePending(playerId: string, pending: boolean) {
      log.push(['setManualEngagePending', playerId, pending]);
      attacker.combat.manualEngagePending = pending;
      return attacker;
    },
    clearManualEngagePending() {
      throw new Error('clearManualEngagePending should not run for move proof');
    },
    clearCombatTarget() {
      throw new Error('clearCombatTarget should not run for move proof');
    },
  } as never);
  const deps = {
    resolveCurrentTickForPlayerId() {
      return 12;
    },
    getInstanceRuntimeOrThrow(instanceId: string) {
      assert.equal(instanceId, 'real:yunlai_town');
      return {
        meta: {
          instanceId: 'real:yunlai_town',
          supportsPvp: true,
          canDamageTile: true,
        },
        getMonster(runtimeId: string) {
          assert.equal(runtimeId, 'monster:runtime:1');
          return {
            runtimeId: 'monster:runtime:1',
            alive: true,
          };
        },
      };
    },
    interruptManualCombat(playerId: string) {
      log.push(['interruptManualCombat', playerId]);
    },
    dispatchBasicAttack() {
      throw new Error('dispatchBasicAttack should not run for unlocked monster engage proof');
    },
    buildAutoCombatCommand() {
      return {
        kind: 'move',
        direction: 'east',
        continuous: true,
        maxSteps: 2,
        path: [{ x: 11, y: 10 }],
        autoCombat: true,
      };
    },
    dispatchInstanceCommand(playerId: string, command: unknown) {
      log.push(['dispatchInstanceCommand', playerId, command]);
    },
    dispatchPlayerCommand() {
      throw new Error('dispatchPlayerCommand should not run for move proof');
    },
  };

  await service.dispatchEngageBattle(attacker.playerId, null, 'monster:runtime:1', null, null, false, deps as never);
  assert.deepEqual(log, [
    ['interruptManualCombat', 'player:attacker'],
    ['setCombatTarget', 'player:attacker', 'monster:runtime:1', false, 12],
    ['setManualEngagePending', 'player:attacker', true],
    ['dispatchInstanceCommand', 'player:attacker', {
      kind: 'move',
      direction: 'east',
      continuous: true,
      maxSteps: 2,
      path: [{ x: 11, y: 10 }],
      autoCombat: true,
      manualEngage: true,
    }],
  ]);
}

async function main(): Promise<void> {
  await testTileEngageAwaitsBasicAttack();
  await testMonsterEngageAwaitsImmediateAutoCombatCommand();
  await testUnlockedMonsterEngageUsesManualEngageInsteadOfPersistentAutoBattle();
  console.log(JSON.stringify({
    ok: true,
    case: 'world-runtime-battle-engage',
    answers: 'engageBattle 现在会等待首个直接 basicAttack 或立即 auto-combat 玩家命令完成后再返回，普通点怪改成一次性接战追击，不再误开持久 autoBattle',
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
