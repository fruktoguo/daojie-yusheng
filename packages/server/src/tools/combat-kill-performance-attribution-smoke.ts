import assert from 'node:assert/strict';

import { WorldRuntimePlayerCombatService } from '../runtime/world/combat/world-runtime-player-combat.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  const events: string[] = [];
  const grants: Array<{ playerId: string; contributionRatio: number }> = [];
  const perfCounts = new Map<string, number>();
  const drops = [
    { itemId: 'drop:1', name: '掉落一', count: 1 },
    { itemId: 'drop:2', name: '掉落二', count: 2 },
    { itemId: 'drop:3', name: '掉落三', count: 3 },
  ];
  const players = new Map<string, Record<string, any>>([
    ['player:combat-perf:killer', buildPlayer('player:combat-perf:killer', 20)],
    ['player:combat-perf:assist', buildPlayer('player:combat-perf:assist', 5)],
  ]);
  const service = new WorldRuntimePlayerCombatService(
    {
      getMonsterCombatProfile: () => ({ expMultiplier: 1 }),
      rollMonsterDrops: () => {
        events.push('drop_roll');
        return drops;
      },
    } as never,
    {
      getPlayer: (playerId: string) => players.get(playerId) ?? null,
      grantMonsterKillProgress(playerId: string, input: { contributionRatio: number }) {
        events.push(`progress:${playerId}`);
        grants.push({ playerId, contributionRatio: input.contributionRatio });
        return { changed: false };
      },
      canReceiveInventoryItem: () => true,
      receiveInventoryItem(
        _playerId: string,
        item: { itemId: string },
        options: { inventoryOnlyStatistics?: boolean } = {},
      ) {
        assert.equal(options.inventoryOnlyStatistics, true);
        events.push(`receive:${item.itemId}`);
      },
    } as never,
    {
      increment(_playerId: string, key: string) {
        events.push(`counter:${key}`);
      },
    } as never,
  );
  const instance = {
    meta: { instanceId: 'instance:combat-perf' },
    getMonsterDamageContributionEntries: () => [
      { playerId: 'player:combat-perf:killer', damage: 1 },
      { playerId: 'player:combat-perf:assist', damage: 3 },
    ],
  };
  const deps = {
    queuePlayerNotice(
      _playerId: string,
      _text: string,
      _kind: string,
      _expiresAt: unknown,
      _source: unknown,
      structured: { key?: string } | undefined,
    ) {
      events.push(structured?.key === 'notice.combat.killed' ? 'notice' : `loot_notice:${structured?.key}`);
    },
    advanceKillQuestProgress: () => events.push('quest'),
    resolveCurrentTickForPlayerId: () => 100,
    recordPendingCommandSectionDuration(key: string, durationMs: number, count = 1) {
      assert.equal(Number.isFinite(durationMs) && durationMs >= 0, true);
      perfCounts.set(key, (perfCounts.get(key) ?? 0) + count);
    },
  };

  await service.handlePlayerMonsterKill(instance as never, {
    runtimeId: 'monster:combat-perf:1',
    monsterId: 'monster:combat-perf',
    name: '归因妖兽',
    level: 10,
    tier: 'mortal_blood',
    x: 1,
    y: 2,
  } as never, 'player:combat-perf:killer', deps as never);

  assert.deepEqual(events, [
    'notice',
    'quest',
    'counter:monsterKillCount',
    'progress:player:combat-perf:killer',
    'progress:player:combat-perf:assist',
    'drop_roll',
    'receive:drop:1',
    'loot_notice:notice.loot.obtained',
    'receive:drop:2',
    'loot_notice:notice.loot.obtained',
    'receive:drop:3',
    'loot_notice:notice.loot.obtained',
  ]);
  assert.deepEqual(grants, [
    { playerId: 'player:combat-perf:killer', contributionRatio: 0.25 },
    { playerId: 'player:combat-perf:assist', contributionRatio: 0.75 },
  ]);
  assert.deepEqual(Object.fromEntries(perfCounts), {
    'combat.playerMonsterKill.preparationMs': 1,
    'combat.playerMonsterKill.participantPlanMs': 1,
    'combat.playerMonsterKill.participants': 2,
    'combat.playerMonsterKill.progressApplyMs': 2,
    'combat.playerMonsterKill.progressMs': 1,
    'combat.playerMonsterKill.dropRollMs': 1,
    'combat.playerMonsterKill.lootItems': 3,
    'combat.playerMonsterKill.lootCapacityCheckMs': 3,
    'combat.playerMonsterKill.lootInventoryApplyMs': 3,
    'combat.playerMonsterKill.lootNoticeMs': 3,
    'combat.playerMonsterKill.lootDeliveryMs': 1,
  });

  console.log(JSON.stringify({
    ok: true,
    case: 'combat-kill-performance-attribution',
    participants: grants.length,
    metricKeys: [...perfCounts.keys()],
  }, null, 2));
}

function buildPlayer(playerId: string, realmLv: number): Record<string, any> {
  return {
    playerId,
    instanceId: 'instance:combat-perf',
    realm: { realmLv },
    attrs: {
      numericStats: {
        lootRate: 0,
        rareLootRate: 0,
      },
    },
  };
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
