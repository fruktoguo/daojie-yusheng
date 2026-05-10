import assert from 'node:assert/strict';

import { encodeTileTargetRef } from '@mud/shared';
import { WorldRuntimeBattleEngageService } from '../runtime/world/combat/world-runtime-battle-engage.service';
import { resolveAttackableTargetRef } from '../runtime/world/combat/world-runtime.attack-target.helpers';

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

async function testTileEngageAwaitsImmediateAutoCombatCommand(): Promise<void> {
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
  const autoCommand = { kind: 'basicAttack', targetPlayerId: null, targetMonsterId: null, targetX: 11, targetY: 10 };
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
        getTileCombatState(x: number, y: number) {
          assert.deepEqual([x, y], [11, 10]);
          return {
            hp: 100,
            maxHp: 100,
            destroyed: false,
          };
        },
      };
    },
    interruptManualCombat(playerId: string) {
      log.push(['interruptManualCombat', playerId]);
    },
    dispatchBasicAttack() {
      throw new Error('dispatchBasicAttack should not run directly for tile engage proof');
    },
    buildAutoCombatCommand() {
      return autoCommand;
    },
    dispatchInstanceCommand() {
      throw new Error('dispatchInstanceCommand should not run for tile engage proof');
    },
    async dispatchPlayerCommand(playerId: string, command: unknown) {
      log.push(['dispatchPlayerCommand', playerId, command]);
      await deferred.promise;
      log.push(['dispatchPlayerCommand:resolved', playerId, command]);
    },
  };

  const pending = service.dispatchEngageBattle(attacker.playerId, null, null, 11, 10, true, deps as never);
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

async function testLockedMissingMonsterEngageClearsTargetWithoutRawWarning(): Promise<void> {
  const attacker = {
    playerId: 'player:attacker',
    instanceId: 'real:yunlai_town',
    combat: {
      autoBattle: true,
      combatTargetId: 'monster:missing',
      combatTargetLocked: true,
      retaliatePlayerTargetId: null,
      combatTargetingRules: undefined,
    },
  };
  const log: Array<unknown[]> = [];
  const service = new WorldRuntimeBattleEngageService({
    getPlayerOrThrow(playerId: string) {
      assert.equal(playerId, attacker.playerId);
      return attacker;
    },
    updateCombatSettings() {
      throw new Error('updateCombatSettings should not run for missing locked monster');
    },
    setCombatTarget() {
      throw new Error('setCombatTarget should not run for missing locked monster');
    },
    setManualEngagePending() {
      throw new Error('setManualEngagePending should not run for missing locked monster');
    },
    clearManualEngagePending() {},
    clearCombatTarget(playerId: string, currentTick: number) {
      log.push(['clearCombatTarget', playerId, currentTick]);
      attacker.combat.combatTargetId = null;
      attacker.combat.combatTargetLocked = false;
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
          assert.equal(runtimeId, 'monster:missing');
          return null;
        },
      };
    },
    interruptManualCombat(playerId: string) {
      log.push(['interruptManualCombat', playerId]);
    },
    queuePlayerNotice() {
      throw new Error('queuePlayerNotice should not run for missing locked monster');
    },
    buildAutoCombatCommand() {
      throw new Error('buildAutoCombatCommand should not run for missing locked monster');
    },
  };

  await service.dispatchEngageBattle(attacker.playerId, null, 'monster:missing', null, null, true, deps as never);
  assert.deepEqual(log, [
    ['interruptManualCombat', 'player:attacker'],
    ['clearCombatTarget', 'player:attacker', 12],
  ]);
  assert.equal(attacker.combat.autoBattle, true);
}

function testForceAttackTileTargetSelectionPriority(): void {
  const attacker = {
    playerId: 'player:attacker',
    instanceId: 'public:overlap_map',
    hp: 100,
    x: 10,
    y: 10,
    combat: {
      allowAoePlayerHit: true,
      autoBattle: false,
      manualEngagePending: false,
      combatTargetId: null,
      combatTargetLocked: false,
      retaliatePlayerTargetId: null,
      combatTargetingRules: undefined,
    },
  };
  const targetPlayer = {
    playerId: 'player:target',
    instanceId: 'public:overlap_map',
    hp: 100,
    x: 11,
    y: 10,
    combat: {},
  };
  const playerRuntimeService = {
    getPlayer(playerId: string) {
      if (playerId === attacker.playerId) {
        return attacker;
      }
      if (playerId === targetPlayer.playerId) {
        return targetPlayer;
      }
      return null;
    },
    listPlayerSnapshots() {
      return [attacker, targetPlayer];
    },
  };
  const tileRef = encodeTileTargetRef({ x: 11, y: 10 });
  function resolveCandidate(options: {
    monster?: boolean;
    player?: boolean;
    boundary?: boolean;
    tile?: boolean;
    eye?: boolean;
  }) {
    const instance = {
      meta: {
        instanceId: 'public:overlap_map',
        supportsPvp: true,
        canDamageTile: options.tile === true,
      },
      listMonsters() {
        return options.monster === true ? [{
          runtimeId: 'monster:1',
          alive: true,
          x: 11,
          y: 10,
          hp: 80,
        }] : [];
      },
      getPlayersAtTile(x: number, y: number) {
        assert.deepEqual([x, y], [11, 10]);
        return options.player === true ? [targetPlayer] : [];
      },
      getTileCombatState(x: number, y: number) {
        assert.deepEqual([x, y], [11, 10]);
        return options.tile === true ? {
          x,
          y,
          hp: 70,
          maxHp: 100,
          destroyed: false,
        } : null;
      },
      getContainerAtTile() {
        return null;
      },
    };
    const deps = {
      resolveCurrentTickForPlayerId() {
        return 18;
      },
      worldRuntimeFormationService: {
        getAttackableTileCombatState(instanceId: string, x: number, y: number) {
          assert.equal(instanceId, 'public:overlap_map');
          assert.deepEqual([x, y], [11, 10]);
          return options.boundary === true ? {
            kind: 'formation_boundary',
            id: 'formation-boundary:1',
            name: '封界阵',
            x,
            y,
            hp: 60,
            supportsSkill: true,
          } : null;
        },
        getAttackableFormationEyeCombatStateAtTile(instanceId: string, x: number, y: number) {
          assert.equal(instanceId, 'public:overlap_map');
          assert.deepEqual([x, y], [11, 10]);
          return options.eye === true ? {
            kind: 'formation',
            id: 'formation:eye:1',
            targetRef: 'formation:eye:1',
            targetMonsterId: 'formation:eye:1',
            name: '护宗大阵阵眼',
            x,
            y,
            hp: 50,
            supportsSkill: true,
          } : null;
        },
      },
    };
    return resolveAttackableTargetRef(instance as never, playerRuntimeService as never, attacker as never, tileRef, deps as never, { currentTick: 18 });
  }

  assert.equal(resolveCandidate({
    monster: true,
    player: true,
    boundary: true,
    tile: true,
    eye: true,
  })?.targetMonsterId, 'monster:1');
  assert.equal(resolveCandidate({
    player: true,
    boundary: true,
    tile: true,
    eye: true,
  })?.targetPlayerId, 'player:target');
  const boundaryTarget = resolveCandidate({
    boundary: true,
    tile: true,
    eye: true,
  });
  assert.equal(boundaryTarget?.kind, 'formation_boundary');
  assert.equal(boundaryTarget?.targetX, 11);
  assert.equal(boundaryTarget?.targetY, 10);
  const tileTarget = resolveCandidate({
    tile: true,
    eye: true,
  });
  assert.equal(tileTarget?.kind, 'tile');
  assert.equal(tileTarget?.targetX, 11);
  assert.equal(tileTarget?.targetY, 10);
  assert.equal(resolveCandidate({
    eye: true,
  })?.targetMonsterId, 'formation:eye:1');
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
  await testTileEngageAwaitsImmediateAutoCombatCommand();
  await testMonsterEngageAwaitsImmediateAutoCombatCommand();
  await testLockedMissingMonsterEngageClearsTargetWithoutRawWarning();
  testForceAttackTileTargetSelectionPriority();
  await testUnlockedMonsterEngageUsesManualEngageInsteadOfPersistentAutoBattle();
  console.log(JSON.stringify({
    ok: true,
    case: 'world-runtime-battle-engage',
    answers: 'engageBattle 现在统一通过 auto-combat 物化首个移动或攻击命令，远处目标不会先触发超距普攻警告；普通点怪仍是一次性接战追击，不误开持久 autoBattle',
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
