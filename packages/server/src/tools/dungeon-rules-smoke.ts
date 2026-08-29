import assert from 'node:assert/strict';
import {
  resolveDungeonAttributeMultipliers,
  resolveDungeonStaminaCost,
  resolveDungeonEffectiveStep,
  resolveRecoveredStamina,
} from '@mud/shared';
import { DungeonTemplateRegistry } from '../content/registries/dungeon-template.registry';
import { DefenseDungeonFlowController, ExpeditionDungeonFlowController, SuppressDemonDungeonFlowController } from '../runtime/dungeon/dungeon-flow-controller';
import { DungeonRuntimeService, isDungeonPartyDefeated } from '../runtime/dungeon/dungeon-runtime.service';

const maxRank = 'spirit' as any;
assert.equal(resolveDungeonStaminaCost('trial', { maxPresentRank: maxRank, energyCost: { trial: 4, hard: 8, nightmare: 12, present: 24 } }), 4);
assert.deepEqual(resolveRecoveredStamina(0, 0, 3 * 60 * 60 * 1000), { current: 3, updatedAt: 3 * 60 * 60 * 1000, recovered: 3, nextRecoveryAt: 4 * 60 * 60 * 1000 });
assert.equal(resolveDungeonEffectiveStep({ difficulty: 'present', presentRank: 'spirit' as any }, maxRank), 8);
const multipliers = resolveDungeonAttributeMultipliers({ difficulty: 'nightmare' }, maxRank);
assert.equal(multipliers.baselineSource, 'standard');
assert.equal(Number(multipliers.allAttributeMultiplier.toFixed(8)), Number((1.4 ** 2).toFixed(8)));
assert.equal(Number(multipliers.hpMultiplier.toFixed(8)), Number((1.4 ** 2 * 2 ** 2).toFixed(8)));

const presentMultipliers = resolveDungeonAttributeMultipliers({ difficulty: 'present', presentRank: 'spirit' as any }, maxRank);
assert.equal(presentMultipliers.baselineSource, 'peak');
assert.equal(Number(presentMultipliers.allAttributeMultiplier.toFixed(8)), Number((1.2 ** 5).toFixed(8)));
assert.equal(Number(presentMultipliers.hpMultiplier.toFixed(8)), Number((1.2 ** 5 * (10 * 2 ** 5)).toFixed(8)));

assert.equal(isDungeonPartyDefeated({
  members: [{ playerId: 'player:solo', joinedAt: 0 }],
  defeatedMemberIds: ['player:solo'],
}), true);
assert.equal(isDungeonPartyDefeated({
  members: [{ playerId: 'player:solo', joinedAt: 0 }],
  defeatedMemberIds: [],
}), false);
assert.equal(isDungeonPartyDefeated({
  members: [{ playerId: 'player:one', joinedAt: 0 }, { playerId: 'player:two', joinedAt: 0 }],
  defeatedMemberIds: ['player:one'],
}), false);

const registry = new DungeonTemplateRegistry();
registry.loadAll();
const dungeon = registry.getRef('dungeon_huanling_zhenren');
assert.equal(dungeon.flowType, 'suppress_demon');
assert.equal(dungeon.difficulty.maxPresentRank, 'spirit');
assert.equal(dungeon.rooms?.length, 1);

testPartyDefeatTransitions();

const makeRun = (flowType: any) => ({ runId: `smoke-${flowType}`, dungeonId: dungeon.id, partyId: 'party', status: 'active', difficulty: { difficulty: 'trial' }, effectiveStep: 0, mapInstanceId: 'dungeon:smoke', members: [], currentRoomId: 'room_01', createdAt: Date.now() } as any);
const events: string[] = [];
const context = { now: () => 0, complete: (_run: any, reason: string) => events.push(`complete:${reason}`), advanceRoom: (_run: any, roomId: string) => events.push(`room:${roomId}`), spawnWave: (_run: any, index: number) => events.push(`wave:${index}`), countAliveHostiles: () => 0 };
new SuppressDemonDungeonFlowController().onMonsterDefeated(makeRun('suppress_demon'), dungeon, 'm_huanling_zhenren_dungeon', context);
assert.ok(events.includes('complete:boss_defeated'));
events.length = 0;
const defense = new DefenseDungeonFlowController();
const defenseRun = makeRun('defense');
const defenseDef = { ...dungeon, flowType: 'defense', waves: [{ waveIndex: 0, spawnGroupIds: ['m_huanling_zhenren_dungeon'], count: 2 }] } as any;
defense.onRunCreated(defenseRun, defenseDef, context);
defense.onTick(defenseRun, defenseDef, context);
assert.ok(events.includes('wave:0'));
events.length = 0;
new ExpeditionDungeonFlowController().onTick(makeRun('expedition'), { ...dungeon, flowType: 'expedition', rooms: [] } as any, context);
assert.ok(events.includes('complete:all_rooms_cleared'));
console.log(JSON.stringify({ ok: true, case: 'dungeon-rules', checks: 23 }));

function testPartyDefeatTransitions(): void {
  const playerId = 'player:dungeon:solo';
  const run = {
    runId: 'smoke-party-defeat',
    dungeonId: dungeon.id,
    partyId: 'party:smoke',
    status: 'active',
    difficulty: { difficulty: 'trial' },
    effectiveStep: 0,
    mapInstanceId: 'dungeon:smoke-party-defeat',
    members: [{ playerId, name: '测试者', joinedAt: 0 }],
    currentRoomId: 'room_01',
    createdAt: 0,
  } as any;
  const events: Array<{ event: string; status?: string }> = [];
  const instance = {
    meta: { instanceId: run.mapInstanceId, kind: 'dungeon' },
    monstersByRuntimeId: new Map(),
    removeRuntimeMonster() {},
    listPlayerIds() { return [playerId]; },
  };
  const definition = {
    ...dungeon,
    rooms: [{ roomId: 'room_01', bossId: 'm_huanling_zhenren_instance', clearCondition: 'boss_defeated' }],
  } as any;
  const service = new DungeonRuntimeService(
    { getDungeonDefinition: () => definition, listDungeonDefinitions: () => [definition] } as any,
    {} as any,
    { getPlayer: () => ({ playerId, name: '测试者', hp: 0 }) } as any,
    {
      getPlayerLocation: () => ({ instanceId: run.mapInstanceId }),
      getInstanceRuntime: () => instance,
      worldRuntimeFormationService: { getFormationList: () => [] },
      destroyEmptyManagedInstance: async () => undefined,
    } as any,
    { getSocketByPlayerId: () => ({ emit: (event: string, payload: any) => events.push({ event, status: payload?.settlement?.status ?? payload?.run?.status }) }) } as any,
    { destroy: () => undefined } as any,
    { claim: () => { throw new Error('战败不得领取奖励'); } } as any,
    { save: () => undefined } as any,
  ) as any;
  service.runs.set(run.runId, run);
  service.combatStatsByRunId.set(run.runId, new Map([[playerId, { damageDealt: 0, damageTaken: 0, healingDone: 0 }]]));
  service.onPlayerDefeated(playerId, run.mapInstanceId);
  assert.equal(run.status, 'failed');
  assert.equal(run.failureReason, 'party_defeated');
  assert.equal(events.filter((entry) => entry.event === 'n:s:dungeonSettlement').length, 1);
  assert.equal(events.find((entry) => entry.event === 'n:s:dungeonSettlement')?.status, 'failed');
  service.onPlayerDefeated(playerId, run.mapInstanceId);
  assert.equal(events.filter((entry) => entry.event === 'n:s:dungeonSettlement').length, 1);
}
