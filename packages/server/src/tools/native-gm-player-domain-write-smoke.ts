import assert from 'node:assert/strict';

import { NativeGmPlayerService } from '../http/native/native-gm-player.service';

type DomainWrite = {
  playerId: string;
  domains: string[];
  options: Record<string, unknown>;
  snapshot: any;
};

const playerId = 'smoke:native-gm-domain-write';
let online = false;
let runtimeRevision = 40;
let runtimeSnapshot = createPersistedSnapshot();
let runtimePlayerState = createRuntimePlayerState();
let restoredRuntime: any = null;
let domainWrites: DomainWrite[] = [];
let markPersistedCall: { domains: string[]; revision: number | null } | null = null;
let fullProjectionSaveCalled = false;

const persistence = {
  async loadProjectedSnapshot(targetPlayerId: string) {
    assert.equal(targetPlayerId, playerId);
    return structuredClone(createPersistedSnapshot());
  },
  async savePlayerSnapshotProjection() {
    fullProjectionSaveCalled = true;
    throw new Error('GM 定向修改不得回退为整玩家投影写入');
  },
  async savePlayerSnapshotProjectionDomains(
    targetPlayerId: string,
    snapshot: any,
    domains: Iterable<string>,
    options: Record<string, unknown> = {},
  ) {
    domainWrites.push({
      playerId: targetPlayerId,
      domains: Array.from(domains),
      options: { ...options },
      snapshot: structuredClone(snapshot),
    });
  },
  async listProjectedSnapshots() {
    return [{ playerId, snapshot: structuredClone(createPersistedSnapshot()) }];
  },
};

const playerRuntime = {
  snapshot(targetPlayerId: string) {
    return online && targetPlayerId === playerId ? structuredClone(runtimePlayerState) : null;
  },
  buildStarterPersistenceSnapshot() {
    return structuredClone(createPersistedSnapshot());
  },
  buildPersistenceSnapshot(targetPlayerId: string) {
    assert.equal(targetPlayerId, playerId);
    return structuredClone(runtimeSnapshot);
  },
  restoreSnapshot(snapshot: any) {
    restoredRuntime = snapshot;
    runtimePlayerState = snapshot;
    return undefined;
  },
  listPlayerSnapshots() {
    return [];
  },
  rebuildActionState() {
    return undefined;
  },
  refreshOnlineTechniqueTemplates() {
    return { refreshedPlayers: 0 };
  },
  getPersistenceRevision(targetPlayerId: string) {
    assert.equal(targetPlayerId, playerId);
    return runtimeRevision;
  },
  markPersisted(targetPlayerId: string, domains: Iterable<string>, revision: number | null) {
    assert.equal(targetPlayerId, playerId);
    markPersistedCall = { domains: Array.from(domains), revision };
  },
  setManagedBodyTrainingLevel(targetPlayerId: string, level: number) {
    assert.equal(targetPlayerId, playerId);
    runtimeSnapshot.progression.bodyTraining = { level, exp: 0, expToNext: 100 };
    runtimeRevision += 1;
    return { playerId };
  },
};

const service = new NativeGmPlayerService(
  {
    createItem() { return null; },
    getItemName() { return null; },
    normalizeItem(input: unknown) { return input; },
    hydrateTechniqueState(input: unknown) { return input; },
  } as never,
  {
    getOrThrow(mapId: string) {
      return {
        id: mapId,
        name: mapId,
        width: 100,
        height: 100,
        spawnX: 11,
        spawnY: 13,
      };
    },
  } as never,
  persistence as never,
  {
    createRealmStateFromLevel(realmLv: number, progress: number) {
      return { realmLv, progress };
    },
    initializePlayer() {
      return undefined;
    },
  } as never,
  playerRuntime as never,
  {
    getStorage() { return { items: [] }; },
    async runExclusiveMarketMutation(_targetPlayerId: string, action: (context: object) => unknown) {
      return action({});
    },
    setStorage() { return undefined; },
  } as never,
  {
    worldRuntimeCommandIntakeFacadeService: {
      enqueueGmUpdatePlayer() { return undefined; },
      enqueueGmResetPlayer() { return undefined; },
      enqueueGmSpawnBots() { return undefined; },
      enqueueGmRemoveBots() { return undefined; },
    },
  } as never,
  { async getManagedAccountIndex() { return new Map(); } } as never,
);

async function main(): Promise<void> {
  await assert.rejects(
    service.updatePlayer(playerId, { section: 'unknown', snapshot: {} }),
    /不支持的玩家修改分区/,
  );
  assert.equal(domainWrites.length, 0);

  await service.resetPersistedPlayer(playerId);
  assertLastWrite(
    ['world_anchor', 'position_checkpoint', 'vitals', 'buff', 'combat_pref'],
    { allowBuffEmptyOverwrite: true },
  );

  await service.resetHeavenGate(playerId);
  assertLastWrite(['attr']);

  await service.setPlayerBodyTrainingLevel(playerId, 7);
  assertLastWrite(['body_training']);

  await service.addPlayerFoundation(playerId, 25);
  assertLastWrite(['progression']);
  assert.equal(domainWrites.at(-1)?.snapshot.progression.foundation, 125);

  await service.addPlayerCombatExp(playerId, 30);
  assertLastWrite(['progression']);
  assert.equal(domainWrites.at(-1)?.snapshot.progression.combatExp, 230);

  // 领悟中功法 selfComprehensionAllowed：单向标记，拒绝降级与空 techId。
  await assert.rejects(
    service.setPlayerPendingTechniqueSelfComprehension(playerId, 'gen_smoke_tech', false),
    /只允许升级为 true/,
  );
  await assert.rejects(
    service.setPlayerPendingTechniqueSelfComprehension(playerId, '', true),
    /techId 不能为空/,
  );
  await assert.rejects(
    service.setPlayerPendingTechniqueSelfComprehension(playerId, 'gen_missing_tech', true),
    /没有该功法的领悟中条目/,
  );

  // 离线路径：只写持久化 technique 域，保留进度与其余字段。
  const offlineUnlock = await service.setPlayerPendingTechniqueSelfComprehension(playerId, 'gen_smoke_tech', true);
  assert.equal(offlineUnlock.runtimeMutated, false);
  assertLastWrite(['technique']);
  const persistedEntry = domainWrites.at(-1)?.snapshot.techniques.pendingComprehensions
    .find((entry: any) => entry.techId === 'gen_smoke_tech');
  assert.equal(persistedEntry?.selfComprehensionAllowed, true);
  assert.equal(persistedEntry?.progress, 10);
  assert.equal(persistedEntry?.requiredProgress, 100);
  assert.equal(persistedEntry?.sourceKind, 'created');

  await service.returnAllPlayersToDefaultSpawn();
  assertLastWrite(
    ['world_anchor', 'position_checkpoint', 'vitals', 'buff', 'combat_pref'],
    { allowBuffEmptyOverwrite: true },
  );

  online = true;
  runtimeSnapshot = createPersistedSnapshot();
  runtimeRevision = 40;
  markPersistedCall = null;
  await service.setPlayerBodyTrainingLevel(playerId, 9);
  assertLastWrite(['body_training', 'progression', 'attr']);
  assert.deepEqual(markPersistedCall, {
    domains: ['body_training', 'progression', 'attr'],
    revision: 41,
  });

  // 运行态驻留路径（在线/离线挂机）：持久化域与内存态同步升级，并标 technique dirty，
  // 防止下一次运行态 flush 把旧的 false 回写覆盖。
  runtimeSnapshot = createPersistedSnapshot();
  runtimePlayerState = createRuntimePlayerState();
  restoredRuntime = null;
  const onlineUnlock = await service.setPlayerPendingTechniqueSelfComprehension(playerId, 'gen_smoke_tech', true);
  assert.equal(onlineUnlock.runtimeMutated, true);
  assertLastWrite(['technique']);
  const onlinePersistedEntry = domainWrites.at(-1)?.snapshot.techniques.pendingComprehensions
    .find((entry: any) => entry.techId === 'gen_smoke_tech');
  assert.equal(onlinePersistedEntry?.selfComprehensionAllowed, true);
  assert.ok(restoredRuntime);
  const runtimeEntry = restoredRuntime.pendingTechniqueComprehensions
    .find((entry: any) => entry.techId === 'gen_smoke_tech');
  assert.equal(runtimeEntry?.selfComprehensionAllowed, true);
  assert.equal(runtimeEntry?.progress, 10);
  assert.equal(restoredRuntime.techniques.revision, 4);
  assert.ok(restoredRuntime.dirtyDomains instanceof Set);
  assert.ok(restoredRuntime.dirtyDomains.has('technique'));
  assert.equal(restoredRuntime.selfRevision, 8);
  assert.equal(restoredRuntime.persistentRevision, 41);

  // 幂等：已为 true 的条目重复调用仍成功且不降级。
  const repeatUnlock = await service.setPlayerPendingTechniqueSelfComprehension(playerId, 'gen_smoke_tech', true);
  assert.equal(repeatUnlock.runtimeMutated, true);

  assert.equal(fullProjectionSaveCalled, false);
  console.log(JSON.stringify({
    ok: true,
    case: 'native-gm-player-domain-write',
    domainWrites: domainWrites.length,
  }));
}

function assertLastWrite(expectedDomains: string[], expectedOptions: Record<string, unknown> = {}): void {
  const write = domainWrites.at(-1);
  assert.ok(write);
  assert.equal(write.playerId, playerId);
  assert.deepEqual(write.domains, expectedDomains);
  assert.deepEqual(write.options, expectedOptions);
}

function createPersistedSnapshot(): any {
  return {
    savedAt: 1,
    placement: {
      templateId: 'old_map',
      instanceId: 'public:old_map',
      x: 3,
      y: 4,
      facing: 1,
    },
    respawn: {
      templateId: 'old_map',
      instanceId: 'public:old_map',
      x: 3,
      y: 4,
      facing: 1,
    },
    vitals: { hp: 50, maxHp: 100, qi: 25, maxQi: 50 },
    buffs: { revision: 1, buffs: [{ buffId: 'smoke' }] },
    combat: {
      autoBattle: true,
      combatTargetId: 'monster:smoke',
      combatTargetLocked: true,
      autoBattleSkills: [],
    },
    progression: {
      foundation: 100,
      rootFoundation: 10,
      combatExp: 200,
      realm: { realmLv: 1, progress: 0 },
      heavenGate: { state: 'open' },
      spiritualRoots: { metal: 1 },
      bodyTraining: { level: 2, exp: 0, expToNext: 100 },
    },
    attrState: { baseAttrs: {}, revealedBreakthroughRequirementIds: [] },
    runtimeBonuses: [],
    inventory: { capacity: 20, revision: 1, items: [], lockedItems: [] },
    equipment: { revision: 1, slots: [] },
    artifacts: { revision: 1, slots: [] },
    techniques: {
      revision: 1,
      cultivatingTechId: null,
      techniques: [],
      pendingComprehensions: [
        {
          techId: 'gen_smoke_tech',
          name: '烟雾功法',
          sourceKind: 'created',
          creatorPlayerId: null,
          selfComprehensionAllowed: false,
          progress: 10,
          requiredProgress: 100,
          realmLv: 1,
        },
      ],
    },
    quests: { revision: 1, entries: [] },
    pendingLogbookMessages: [],
    unlockedMapIds: [],
  };
}

function createRuntimePlayerState(): any {
  return {
    playerId,
    selfRevision: 7,
    persistentRevision: 40,
    dirtyDomains: new Set<string>(),
    techniques: { revision: 3, cultivatingTechId: null, techniques: [] },
    pendingTechniqueComprehensions: [
      {
        techId: 'gen_smoke_tech',
        name: '烟雾功法',
        sourceKind: 'created',
        creatorPlayerId: null,
        selfComprehensionAllowed: false,
        progress: 10,
        requiredProgress: 100,
        realmLv: 1,
      },
    ],
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
