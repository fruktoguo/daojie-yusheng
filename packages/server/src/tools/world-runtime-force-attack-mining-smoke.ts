import assert from 'node:assert/strict';

import { TileType } from '@mud/shared';
import { WorldRuntimePlayerCommandService } from '../runtime/world/command/world-runtime-player-command.service';

type SmokeLogEntry = readonly unknown[];

function createPlayer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    playerId: 'player:force-attack-mining',
    hp: 100,
    instanceId: 'instance:force-attack-mining',
    combat: {},
    ...overrides,
  };
}

function createService(log: SmokeLogEntry[], player: Record<string, unknown>): WorldRuntimePlayerCommandService {
  return new WorldRuntimePlayerCommandService(
    {
      getPlayer(playerId: string) {
        log.push(['getPlayer', playerId]);
        return player;
      },
      getPlayerOrThrow(playerId: string) {
        log.push(['getPlayerOrThrow', playerId]);
        return player;
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      dispatchEngageBattle(
        playerId: string,
        targetPlayerId: string | null,
        targetMonsterId: string | null,
        targetX: number | null,
        targetY: number | null,
        locked: boolean,
      ) {
        log.push(['dispatchEngageBattle', playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked]);
      },
      dispatchBasicAttack(
        playerId: string,
        targetPlayerId: string | null,
        targetMonsterId: string | null,
        targetX: number | null,
        targetY: number | null,
      ) {
        log.push([
          'dispatchBasicAttack',
          playerId,
          targetPlayerId,
          targetMonsterId,
          targetX,
          targetY,
          player.suppressCraftInterruptForMiningJobRunId,
        ]);
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

function createDeps(log: SmokeLogEntry[], tileType: TileType, destroyed = false): Record<string, unknown> {
  return {
    getInstanceRuntime(instanceId: string) {
      log.push(['getInstanceRuntime', instanceId]);
      return {
        getTileCombatState(x: number, y: number) {
          log.push(['getTileCombatState', x, y]);
          return { tileType, hp: destroyed ? 0 : 10, maxHp: 10, destroyed };
        },
      };
    },
    worldRuntimeCraftMutationService: {
      flushCraftMutation(playerId: string, result: unknown, kind: string) {
        log.push(['flushCraftMutation', playerId, kind, result]);
      },
    },
    craftPanelRuntimeService: {
      startTechniqueActivity(_player: unknown, kind: string, payload: unknown) {
        log.push(['startTechniqueActivity', kind, payload]);
        return { ok: true, started: true };
      },
    },
    queuePlayerNotice(playerId: string, text: string, kind: string) {
      log.push(['queuePlayerNotice', playerId, text, kind]);
    },
  };
}

async function dispatchForcedTileAttack(
  service: WorldRuntimePlayerCommandService,
  deps: Record<string, unknown>,
): Promise<void> {
  await service.dispatchPlayerCommand('player:force-attack-mining', {
    kind: 'engageBattle',
    targetPlayerId: null,
    targetMonsterId: null,
    targetX: 1,
    targetY: 0,
    locked: true,
  } as never, deps as never);
}

async function testForcedAttackOreStartsMiningJob(): Promise<void> {
  const log: SmokeLogEntry[] = [];
  const player = createPlayer();
  const service = createService(log, player);
  await dispatchForcedTileAttack(service, createDeps(log, TileType.BlackIronOre));

  assert.deepEqual(log, [
    ['getPlayer', 'player:force-attack-mining'],
    ['getInstanceRuntime', 'instance:force-attack-mining'],
    ['getTileCombatState', 1, 0],
    ['getPlayerOrThrow', 'player:force-attack-mining'],
    ['startTechniqueActivity', 'mining', { targetRef: 'tile:1:0' }],
    ['flushCraftMutation', 'player:force-attack-mining', 'mining', { ok: true, started: true }],
  ]);
}

async function testForcedAttackNonOreKeepsCombatPath(): Promise<void> {
  const log: SmokeLogEntry[] = [];
  const player = createPlayer();
  const service = createService(log, player);
  await dispatchForcedTileAttack(service, createDeps(log, TileType.Stone));

  assert.deepEqual(log, [
    ['getPlayer', 'player:force-attack-mining'],
    ['getInstanceRuntime', 'instance:force-attack-mining'],
    ['getTileCombatState', 1, 0],
    ['dispatchEngageBattle', 'player:force-attack-mining', null, null, 1, 0, true],
  ]);
}

async function testForcedAttackOreRespectsPendingCast(): Promise<void> {
  const log: SmokeLogEntry[] = [];
  const player = createPlayer({ combat: { pendingSkillCast: { skillId: 'skill:test' } } });
  const service = createService(log, player);
  await dispatchForcedTileAttack(service, createDeps(log, TileType.BlackIronOre));

  assert.deepEqual(log, [
    ['getPlayer', 'player:force-attack-mining'],
    ['getInstanceRuntime', 'instance:force-attack-mining'],
    ['getTileCombatState', 1, 0],
    ['queuePlayerNotice', 'player:force-attack-mining', '吟唱中无法分心挖矿。', 'system'],
  ]);
}

async function testMiningJobAttackCarriesSelfInterruptMarker(): Promise<void> {
  const log: SmokeLogEntry[] = [];
  const player = createPlayer({
    miningJob: {
      jobRunId: 'mining:job:1',
      targetX: 1,
      targetY: 0,
    },
  });
  const service = createService(log, player);
  await service.dispatchPlayerCommand('player:force-attack-mining', {
    kind: 'basicAttack',
    targetPlayerId: null,
    targetMonsterId: null,
    targetX: 1,
    targetY: 0,
    miningJobRunId: 'mining:job:1',
  } as never, createDeps(log, TileType.BlackIronOre) as never);

  assert.deepEqual(log, [
    ['getPlayer', 'player:force-attack-mining'],
    ['dispatchBasicAttack', 'player:force-attack-mining', null, null, 1, 0, 'mining:job:1'],
  ]);
  assert.equal(player.suppressCraftInterruptForMiningJobRunId, undefined);
}

async function main(): Promise<void> {
  await testForcedAttackOreStartsMiningJob();
  await testForcedAttackNonOreKeepsCombatPath();
  await testForcedAttackOreRespectsPendingCast();
  await testMiningJobAttackCarriesSelfInterruptMarker();
  console.log(JSON.stringify({ ok: true, case: 'world-runtime-force-attack-mining' }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
