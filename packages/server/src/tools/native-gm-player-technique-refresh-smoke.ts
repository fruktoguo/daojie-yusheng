import assert from 'node:assert/strict';

import { DEFAULT_BASE_ATTRS } from '@mud/shared';

import { NativeGmPlayerService } from '../http/native/native-gm-player.service';

type TechniqueLike = {
  techId: string;
  level: number;
  layers?: Array<{ level: number; attrs?: Record<string, number> }>;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function main(): Promise<void> {
  const playerId = 'smoke:gm-technique-refresh';
  let initializeCalled = false;
  let rebuildActionCalled = false;
  let savedSnapshot: any = null;
  let runtimeSnapshot: any = createRuntimeSnapshot(playerId);

  const contentTemplateRepository = {
    getItemName() {
      return null;
    },
    normalizeItem(input: unknown) {
      return input;
    },
    hydrateTechniqueState(input: TechniqueLike) {
      return {
        ...input,
        name: '测试功法',
        grade: 'mortal',
        category: 'body',
        skills: [{ id: `${input.techId}.skill`, unlockLevel: 1 }],
        layers: [
          { level: 1, expToNext: 10, attrs: { constitution: 5 } },
          { level: 2, expToNext: 0, attrs: { constitution: 7 } },
        ],
        attrCurves: undefined,
      };
    },
  };

  const playerProgressionService = {
    createRealmStateFromLevel(realmLv: number, progress: number) {
      return { realmLv, progress, stage: '炼气', name: '炼气', shortName: '炼气' };
    },
    initializePlayer(snapshot: any) {
      initializeCalled = true;
      const techniqueBonus = (snapshot.techniques.techniques as TechniqueLike[])
        .flatMap((technique) => technique.layers?.filter((layer) => layer.level <= technique.level) ?? [])
        .reduce((total, layer) => total + Number(layer.attrs?.constitution ?? 0), 0);
      snapshot.attrs.revision += 1;
      snapshot.attrs.baseAttrs = { ...DEFAULT_BASE_ATTRS, constitution: DEFAULT_BASE_ATTRS.constitution + techniqueBonus };
      snapshot.attrs.finalAttrs = { ...snapshot.attrs.baseAttrs };
      snapshot.maxHp = 100 + techniqueBonus;
      snapshot.hp = Math.min(snapshot.hp, snapshot.maxHp);
    },
  };

  const playerRuntimeService = {
    snapshot(id: string) {
      return id === playerId ? clone(runtimeSnapshot) : null;
    },
    buildPersistenceSnapshot(id: string) {
      assert.equal(id, playerId);
      return createPersistedSnapshot();
    },
    restoreSnapshot(snapshot: any) {
      runtimeSnapshot = clone(snapshot);
    },
    listPlayerSnapshots() {
      return [];
    },
    rebuildActionState(snapshot: any) {
      rebuildActionCalled = true;
      assert.equal(snapshot.techniques.techniques[0].skills.length, 1);
    },
    markPersisted() {
      return undefined;
    },
    setManagedBodyTrainingLevel() {
      return null;
    },
  };

  const service = new NativeGmPlayerService(
    contentTemplateRepository as never,
    { getOrThrow() { return { width: 100, height: 100 }; } } as never,
    {
      async loadPlayerSnapshot() {
        return createPersistedSnapshot();
      },
      async savePlayerSnapshot(id: string, snapshot: any) {
        assert.equal(id, playerId);
        savedSnapshot = clone(snapshot);
      },
      async listPlayerSnapshots() {
        return [];
      },
    } as never,
    playerProgressionService as never,
    playerRuntimeService as never,
    { getStorage() { return { items: [] }; }, runExclusiveMarketMutation: async (_id: string, action: any) => action({}), setStorage() { return undefined; } } as never,
    { worldRuntimeCommandIntakeFacadeService: {} } as never,
    { async getManagedAccountIndex() { return new Map(); } } as never,
    null,
  );

  await service.updatePlayer(playerId, {
    section: 'techniques',
    snapshot: {
      cultivatingTechId: 'manual.tech',
      techniques: [{
        techId: 'manual.tech',
        level: 2,
        exp: 0,
        expToNext: 0,
        realmLv: 1,
        realm: 3,
        skills: [],
        layers: undefined,
        attrCurves: undefined,
      }],
    },
  });

  assert.equal(savedSnapshot.techniques.techniques[0].layers.length, 2);
  assert.equal(runtimeSnapshot.techniques.techniques[0].layers.length, 2);
  assert.equal(runtimeSnapshot.techniques.techniques[0].skills.length, 1);
  assert.equal(initializeCalled, true);
  assert.equal(rebuildActionCalled, true);
  assert.equal(runtimeSnapshot.attrs.finalAttrs.constitution, DEFAULT_BASE_ATTRS.constitution + 12);
  assert.equal(runtimeSnapshot.maxHp, 112);
  assert.equal(runtimeSnapshot.selfRevision, 2);
  assert.equal(runtimeSnapshot.persistentRevision, 2);

  console.log(JSON.stringify({ ok: true, case: 'native-gm-player-technique-refresh' }));
}

function createRuntimeSnapshot(playerId: string): any {
  return {
    playerId,
    name: playerId,
    displayName: playerId,
    persistentRevision: 1,
    persistedRevision: 1,
    selfRevision: 1,
    maxHp: 100,
    maxQi: 100,
    hp: 100,
    qi: 100,
    realm: { realmLv: 1, progress: 0, stage: '炼气', name: '炼气', shortName: '炼气' },
    techniques: { revision: 1, cultivatingTechId: null, techniques: [] },
    attrs: {
      revision: 1,
      stage: '炼气',
      baseAttrs: { ...DEFAULT_BASE_ATTRS },
      finalAttrs: { ...DEFAULT_BASE_ATTRS },
      numericStats: {},
      ratioDivisors: {},
    },
  };
}

function createPersistedSnapshot(): any {
  return {
    vitals: { maxHp: 100, maxQi: 100, hp: 100, qi: 100 },
    combat: { autoBattleSkills: [] },
    buffs: { revision: 1, buffs: [] },
    progression: { foundation: 0, combatExp: 0, realm: { realmLv: 1, progress: 0 } },
    techniques: { revision: 1, cultivatingTechId: null, techniques: [] },
    inventory: { revision: 1, capacity: 20, items: [] },
    equipment: { revision: 1, slots: [] },
    quests: { revision: 1, entries: [] },
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
