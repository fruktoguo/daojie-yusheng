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
assert.equal(Number(multipliers.allAttributeMultiplier.toFixed(8)), Number((2.0 ** 2).toFixed(8)));
assert.equal(Number(multipliers.hpMultiplier.toFixed(8)), Number((2.0 ** 2 * 2 ** 2).toFixed(8)));

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
void testDungeonRestartRecovery().then(() => {
  console.log(JSON.stringify({ ok: true, case: 'dungeon-rules', checks: 29 }));
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

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

async function testDungeonRestartRecovery(): Promise<void> {
  const runId = 'smoke-restart-recovery';
  const instanceId = `dungeon:${runId}`;
  const playerId = 'player:dungeon:recovery';
  const persistedRuntimeId = 'monster:dungeon:boss:stable';
  const persistedState = {
    monsterRuntimeId: persistedRuntimeId,
    instanceId,
    monsterId: 'm_huanling_zhenren_instance',
    monsterName: '唤灵真人',
    monsterTier: 'heaven',
    monsterLevel: 43,
    tileIndex: 182,
    x: 2,
    y: 9,
    hp: 123,
    maxHp: 1000,
    alive: true,
    respawnLeft: 0,
    respawnTicks: 30,
    aggroTargetPlayerId: null,
    statePayload: { qi: 17, maxQi: 20 },
  };
  const run = {
    runId,
    dungeonId: dungeon.id,
    partyId: 'party:recovery',
    status: 'active',
    difficulty: { difficulty: 'trial' },
    effectiveStep: 0,
    mapInstanceId: instanceId,
    members: [
      { playerId, name: '恢复测试者', joinedAt: 0 },
      { playerId: 'player:dungeon:other', name: '队友', joinedAt: 0 },
    ],
    currentRoomId: 'room_01',
    createdAt: 0,
    activatedAt: 1,
  } as any;
  const definition = {
    ...dungeon,
    rooms: [{
      roomId: 'room_01',
      bossId: 'm_huanling_zhenren_instance',
      clearCondition: 'boss_defeated',
      spawnX: 2,
      spawnY: 9,
      mechanismFormation: dungeon.rooms?.[0]?.mechanismFormation,
    }],
  } as any;
  const formationCreates: any[] = [];
  const connected: any[] = [];
  const monsters = new Map<string, any>();
  const instance = {
    meta: { instanceId, kind: 'dungeon', persistent: true },
    template: {
      id: definition.mapTemplateId,
      width: 20,
      height: 14,
      npcs: [{ id: 'npc_dungeon_memory_stone', x: 2, y: 11 }],
    },
    monstersByRuntimeId: monsters,
    addRuntimeMonster(spawn: any) {
      const monster = {
        ...spawn,
        hp: Number(spawn.hp),
        maxHp: Number(spawn.maxHp),
        alive: spawn.alive !== false,
      };
      monsters.set(monster.runtimeId, monster);
      return monster;
    },
    removeRuntimeMonster(runtimeId: string) {
      return monsters.delete(runtimeId);
    },
    getMonsterRuntimeRef(runtimeId: string) {
      return monsters.get(runtimeId) ?? null;
    },
    hydrateMonsterRuntimeStates(entries: any[]) {
      for (const entry of entries) {
        const runtimeId = entry.runtimeId ?? entry.monsterRuntimeId;
        const monster = monsters.get(runtimeId);
        if (!monster) continue;
        Object.assign(monster, {
          hp: entry.hp,
          maxHp: entry.maxHp,
          x: entry.x,
          y: entry.y,
          alive: entry.alive,
        });
      }
    },
    getPlayerPosition() {
      return { x: 1, y: 8 };
    },
    getPlayer() {
      return { x: 1, y: 8 };
    },
    listPlayerIds() {
      return [playerId];
    },
  };
  const runPersistence = {
    saves: [] as any[],
    async reconcileTerminalCatalogInstances() { return 0; },
    async loadRecoverableRuns() { return [run]; },
    async loadRunStatusByInstanceId() { return run; },
    async waitForSave() {},
    save(next: any) { this.saves.push({ ...next }); },
    remove() {},
  };
  const service = new DungeonRuntimeService(
    {
      getDungeonDefinition: () => definition,
      listDungeonDefinitions: () => [definition],
      createRuntimeMonsterSpawn: (monsterId: string, options: any) => ({
        runtimeId: options.runtimeId ?? `generated:${monsterId}`,
        monsterId,
        x: options.x,
        y: options.y,
        hp: 1000,
        maxHp: 1000,
        alive: options.alive !== false,
        level: 43,
        tier: 'heaven',
        name: '唤灵真人',
        baseAttrs: {},
        baseNumericStats: { maxHp: 1000, maxQi: 20 },
        skills: [],
        respawnTicks: 30,
      }),
    } as any,
    {} as any,
    { getPlayer: () => ({ playerId, x: 1, y: 8, hp: 100 }) } as any,
    {
      getInstanceRuntime: () => instance,
      loadPersistedMonsterRuntimeStates: async () => [persistedState],
      getPlayerLocation: () => ({ instanceId }),
      getOrCreatePublicInstance: () => ({ meta: { instanceId: 'public:ruined_cavern_manor' } }),
      worldRuntimeFormationService: {
        getFormationList: () => formationCreates.map((entry) => ({
          id: `formation:dungeon:${entry.runId}:room:${entry.roomId}`,
          source: 'dungeon_controller',
          controllerId: entry.controllerId,
        })),
      },
      worldRuntimePlayerSessionService: {
        async connectPlayerWhenReady(input: any) { connected.push(input); },
      },
      destroyEmptyManagedInstance: async () => undefined,
    } as any,
    { getSocketByPlayerId: () => null, getBinding: () => null } as any,
    { create: (input: any) => formationCreates.push(input), destroy: () => undefined } as any,
    {} as any,
    runPersistence as any,
  ) as any;

  const restored = await service.restorePersistedRuns();
  assert.equal(restored, 1, 'active dungeon run should be restored');
  assert.equal(monsters.has(persistedRuntimeId), true, 'persisted Boss runtimeId should be materialized');
  assert.equal(monsters.get(persistedRuntimeId)?.hp, 123, 'persisted Boss HP should be hydrated');
  assert.equal(formationCreates.length, 1, 'controller formation should be recreated after restart');

  // 模拟热更新/重启后流程注册表短暂为空：退出动作应先自愈恢复，而不是直接按孤儿副本处理。
  service.runs.clear();
  const exitResult = await service.exit(playerId, runId);
  assert.equal(exitResult.ok, true, 'player on recovered entry anchor should be allowed to exit');
  assert.equal(connected.length, 1, 'exit should reconnect player to public entry map');
}
