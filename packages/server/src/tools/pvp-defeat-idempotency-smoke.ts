import assert from 'node:assert/strict';

import { WorldRuntimePlayerCombatService } from '../runtime/world/combat/world-runtime-player-combat.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  const log: Array<unknown[]> = [];
  const pendingRespawns = new Set<string>();
  const victim = {
    playerId: 'player:combat:idempotent-victim',
    name: '乙',
    hp: 0,
    x: 4,
    y: 5,
    instanceId: 'instance:combat:pvp',
  };
  const killer = {
    playerId: 'player:combat:idempotent-killer',
    name: '甲',
    combat: {},
  };
  const playerRuntimeService = {
    getPlayer(playerId: string) {
      if (playerId === victim.playerId) return victim;
      if (playerId === killer.playerId) return killer;
      return null;
    },
    applyShaInfusionDeathPenalty() {
      return {
        consumedProgress: 0,
        consumedFoundation: 0,
        backlashAddedStacks: 0,
        backlashTotalStacks: 0,
        remainingInfusionStacks: 0,
      };
    },
    clearRetaliatePlayerTargetIfMatches() {},
  };
  const service = new WorldRuntimePlayerCombatService({} as never, playerRuntimeService as never);
  service.applyPvPKillRewards = async (nextKiller, nextVictim) => {
    log.push(['applyPvPKillRewards', nextKiller.playerId, nextVictim.playerId]);
  };
  const deps = {
    getInstanceRuntime() {
      return null;
    },
    resolveCurrentTickForPlayerId() {
      return 1;
    },
    clearPendingCommand(playerId: string) {
      log.push(['clearPendingCommand', playerId]);
    },
    worldRuntimeGmQueueService: {
      hasPendingRespawn(playerId: string) {
        return pendingRespawns.has(playerId);
      },
      markPendingRespawn(playerId: string) {
        pendingRespawns.add(playerId);
        log.push(['markPendingRespawn', playerId]);
      },
    },
    queuePlayerNotice() {},
  };

  await service.handlePlayerDefeat(victim.playerId, deps as never, killer.playerId);
  await service.handlePlayerDefeat(victim.playerId, deps as never, killer.playerId);

  assert.deepEqual(log, [
    ['markPendingRespawn', victim.playerId],
    ['applyPvPKillRewards', killer.playerId, victim.playerId],
    ['clearPendingCommand', victim.playerId],
    ['clearPendingCommand', victim.playerId],
  ]);
  console.log(JSON.stringify({
    ok: true,
    answers: 'PVP 击败在玩家待复生期间只会结算一次杀伐/身陨奖励。',
    completionMapping: 'pvp-defeat-idempotency',
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
