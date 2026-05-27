import assert from 'node:assert/strict';

import { installSmokeTimeout } from './smoke-timeout';
import { WorldRuntimePlayerCombatService } from '../runtime/world/combat/world-runtime-player-combat.service';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  await testOnlineDefeatUsesUnifiedTechniqueInterrupt();
  await testOfflineDefeatInterruptsBeforeRuntimeRemoval();

  console.log(JSON.stringify({
    ok: true,
    answers: [
      '在线玩家死亡会进入 worldRuntimeCraftInterruptService.interruptCraftForReason(..., defeat, ...)，再清 pending command 和等待复生。',
      '离线玩家死亡移除运行态前同样先触发 defeat 技艺中断，避免 active job 绕过非主动状态切换。',
    ],
  }, null, 2));
}

async function testOnlineDefeatUsesUnifiedTechniqueInterrupt(): Promise<void> {
  const log: Array<unknown[]> = [];
  const victim = createDefeatedPlayer('player:defeat:online', 'session:defeat:online');
  const service = new WorldRuntimePlayerCombatService({} as never, createPlayerRuntimeService(victim) as never);

  await service.handlePlayerDefeat(victim.playerId, {
    getInstanceRuntime() {
      return null;
    },
    clearPendingCommand(playerId: string) {
      log.push(['clearPendingCommand', playerId]);
    },
    worldRuntimeGmQueueService: {
      hasPendingRespawn() {
        return false;
      },
      markPendingRespawn(playerId: string) {
        log.push(['markPendingRespawn', playerId]);
      },
    },
    worldRuntimeCraftInterruptService: {
      interruptCraftForReason(playerId: string, activePlayer: typeof victim, reason: string) {
        assert.equal(activePlayer.alchemyJob.workTotalTicks, 8);
        assert.equal(activePlayer.alchemyJob.workRemainingTicks, 5);
        log.push(['interruptCraftForReason', playerId, activePlayer.playerId, reason]);
      },
    },
    queuePlayerNotice() {},
  } as never, 'monster:defeat:online');

  assert.deepEqual(log, [
    ['markPendingRespawn', victim.playerId],
    ['interruptCraftForReason', victim.playerId, victim.playerId, 'defeat'],
    ['clearPendingCommand', victim.playerId],
  ]);
  assert.equal(victim.alchemyJob.workTotalTicks, 8);
  assert.equal(victim.alchemyJob.workRemainingTicks, 5);
}

async function testOfflineDefeatInterruptsBeforeRuntimeRemoval(): Promise<void> {
  const log: Array<unknown[]> = [];
  const victim = createDefeatedPlayer('player:defeat:offline', '');
  const service = new WorldRuntimePlayerCombatService({} as never, createPlayerRuntimeService(victim) as never);

  await service.handlePlayerDefeat(victim.playerId, {
    getInstanceRuntime() {
      return null;
    },
    clearPendingCommand(playerId: string) {
      log.push(['clearPendingCommand', playerId]);
    },
    worldRuntimeGmQueueService: {
      hasPendingRespawn() {
        return false;
      },
      markPendingRespawn(playerId: string) {
        log.push(['markPendingRespawn', playerId]);
      },
    },
    worldRuntimeCraftInterruptService: {
      interruptCraftForReason(playerId: string, activePlayer: typeof victim, reason: string) {
        log.push(['interruptCraftForReason', playerId, activePlayer.playerId, reason]);
      },
    },
    worldRuntimePlayerCombatOutcomeService: {
      removeOfflineDefeatedPlayer(playerId: string) {
        log.push(['removeOfflineDefeatedPlayer', playerId]);
      },
    },
    queuePlayerNotice() {},
  } as never, 'monster:defeat:offline');

  assert.deepEqual(log, [
    ['markPendingRespawn', victim.playerId],
    ['interruptCraftForReason', victim.playerId, victim.playerId, 'defeat'],
    ['removeOfflineDefeatedPlayer', victim.playerId],
  ]);
}

function createDefeatedPlayer(playerId: string, sessionId: string): {
  playerId: string;
  name: string;
  sessionId: string;
  hp: number;
  x: number;
  y: number;
  instanceId: string;
  alchemyJob: { remainingTicks: number; totalTicks: number; workRemainingTicks: number; workTotalTicks: number };
} {
  return {
    playerId,
    name: '技艺中断目标',
    sessionId,
    hp: 0,
    x: 2,
    y: 3,
    instanceId: 'instance:defeat:technique',
    alchemyJob: {
      remainingTicks: 5,
      totalTicks: 8,
      workRemainingTicks: 5,
      workTotalTicks: 8,
    },
  };
}

function createPlayerRuntimeService(player: ReturnType<typeof createDefeatedPlayer>): Record<string, unknown> {
  return {
    getPlayer(playerId: string) {
      return playerId === player.playerId ? player : null;
    },
    applyShaInfusionDeathPenalty(playerId: string) {
      assert.equal(playerId, player.playerId);
      return {
        consumedProgress: 0,
        consumedFoundation: 0,
        backlashAddedStacks: 0,
        backlashTotalStacks: 0,
        remainingInfusionStacks: 0,
      };
    },
  };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
