import assert from 'node:assert/strict';

import { WorldRuntimeAutoCombatService } from '../runtime/world/world-runtime-auto-combat.service';

function createPlayerRuntimeService(player: Record<string, unknown>) {
  return {
    getPlayer(playerId: string) {
      return playerId === player.playerId ? player : null;
    },
    clearManualEngagePending() {},
    clearCombatTarget() {},
    updateCombatSettings() {},
    setCombatTarget() {},
  };
}

function createPathingInstance() {
  return {
    template: {
      width: 6,
      height: 4,
    },
    meta: {
      instanceId: 'public:test_map',
    },
    isPointInSafeZone() {
      return false;
    },
    isSafeZoneTile() {
      return false;
    },
    buildPlayerView() {
      return {
        playerId: 'player:1',
        self: { x: 1, y: 1 },
        instance: { width: 6, height: 4 },
        visiblePlayers: [],
        localMonsters: [{
          runtimeId: 'monster:1',
          x: 4,
          y: 1,
          hp: 20,
        }],
        localNpcs: [],
        localPortals: [],
        localGroundPiles: [],
      };
    },
    getMonster(runtimeId: string) {
      assert.equal(runtimeId, 'monster:1');
      return {
        runtimeId: 'monster:1',
        x: 4,
        y: 1,
        hp: 20,
        alive: true,
      };
    },
    isWalkable(x: number, y: number) {
      return x >= 0 && y >= 0 && x < 6 && y < 4;
    },
    forEachPathingBlocker(_playerId: string, _callback: (x: number, y: number) => void) {},
    getTileTraversalCost() {
      return 1;
    },
  };
}

function testManualEngageFallsBackToMoveWhenOnlyRangedSkillIsOnCooldown(): void {
  const player = {
    playerId: 'player:1',
    hp: 100,
    x: 1,
    y: 1,
    instanceId: 'public:test_map',
    qi: 100,
    attrs: {
      numericStats: {
        viewRange: 6,
        maxQiOutputPerTick: 100,
      },
    },
    actions: {
      actions: [{
        id: 'skill:ranged',
        type: 'skill',
        range: 3,
        cooldownLeft: 5,
        autoBattleEnabled: true,
        skillEnabled: true,
      }],
    },
    combat: {
      autoBattle: false,
      autoRetaliate: false,
      autoBattleStationary: false,
      combatTargetId: 'monster:1',
      combatTargetLocked: false,
      manualEngagePending: true,
    },
  };
  const service = new WorldRuntimeAutoCombatService(createPlayerRuntimeService(player) as never);
  const command = service.buildAutoCombatCommand(createPathingInstance() as never, player as never, {
    resolveCurrentTickForPlayerId() {
      return 12;
    },
    queuePlayerNotice() {},
  } as never);
  assert.deepEqual(command, {
    kind: 'move',
    direction: 2,
    continuous: true,
    maxSteps: 2,
    path: [{ x: 2, y: 1 }, { x: 3, y: 1 }],
    autoCombat: true,
  });
}

testManualEngageFallsBackToMoveWhenOnlyRangedSkillIsOnCooldown();

console.log(JSON.stringify({
  ok: true,
  case: 'world-runtime-auto-combat',
  answers: '一次性接战和自动战斗在无可用远程技能时，会继续贴近到普攻距离，而不是错误停在远程理想射程外等待。',
}, null, 2));
