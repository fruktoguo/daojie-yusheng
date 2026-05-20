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
  let savedDomains: string[] = [];
  let savedOptions: any = null;
  let fullProjectionSaveCalled = false;
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
      return createPersistedSnapshot(runtimeSnapshot);
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
      async loadProjectedSnapshot() {
        return createPersistedSnapshot();
      },
      async savePlayerSnapshotProjection(id: string, snapshot: any) {
        fullProjectionSaveCalled = true;
        assert.equal(id, playerId);
        savedSnapshot = clone(snapshot);
      },
      async savePlayerSnapshotProjectionDomains(id: string, snapshot: any, domains: Iterable<string>, options: any) {
        assert.equal(id, playerId);
        savedSnapshot = clone(snapshot);
        savedDomains = Array.from(domains);
        savedOptions = options;
      },
      async listProjectedSnapshots() {
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
  assert.equal(fullProjectionSaveCalled, false);
  assert.deepEqual(savedDomains, ['technique', 'combat_pref']);

  await service.updatePlayer(playerId, {
    section: 'items',
    snapshot: {
      inventory: {
        capacity: 20,
        items: [{ itemId: 'spirit_stone', count: 1 }],
      },
      equipment: {},
    },
  });

  assert.deepEqual(savedDomains, ['inventory', 'equipment']);
  assert.equal(savedDomains.includes('market_storage'), false);
  assert.equal(savedOptions.allowInventoryEmptyOverwrite, true);
  assert.equal(savedOptions.allowEquipmentEmptyOverwrite, true);
  assert.equal(fullProjectionSaveCalled, false);

  const currentInventoryItemInstanceId = '11111111-1111-4111-8111-111111111111';
  const foreignInventoryItemInstanceId = '33333333-3333-4333-8333-333333333333';
  const currentWeaponItemInstanceId = '22222222-2222-4222-8222-222222222222';
  const foreignBodyItemInstanceId = '44444444-4444-4444-8444-444444444444';
  runtimeSnapshot.inventory.items = [{
    itemId: 'spirit_stone',
    count: 1,
    itemInstanceId: currentInventoryItemInstanceId,
  }];
  runtimeSnapshot.equipment.slots = [{
    slot: 'weapon',
    item: {
      itemId: 'iron_sword',
      count: 1,
      enhanceLevel: 1,
      itemInstanceId: currentWeaponItemInstanceId,
    },
  }];

  await service.updatePlayer(playerId, {
    section: 'items',
    snapshot: {
      inventory: {
        capacity: 20,
        items: [
          { itemId: 'spirit_stone', count: 2 },
          { itemId: 'spirit_stone', count: 1, itemInstanceId: foreignInventoryItemInstanceId },
        ],
      },
      equipment: {
        weapon: { itemId: 'iron_sword', enhanceLevel: 5 },
        head: null,
        body: { itemId: 'cloth_robe', itemInstanceId: foreignBodyItemInstanceId },
        legs: null,
        accessory: null,
      },
    },
  });

  assert.equal(savedSnapshot.inventory.items[0].itemInstanceId, currentInventoryItemInstanceId);
  assert.notEqual(savedSnapshot.inventory.items[1].itemInstanceId, foreignInventoryItemInstanceId);
  assert.ok(savedSnapshot.inventory.items[1].itemInstanceId);
  const savedWeapon = savedSnapshot.equipment.slots.find((entry: any) => entry.slot === 'weapon')?.item;
  const savedBody = savedSnapshot.equipment.slots.find((entry: any) => entry.slot === 'body')?.item;
  assert.equal(savedWeapon.itemInstanceId, currentWeaponItemInstanceId);
  assert.equal(savedWeapon.enhanceLevel, 5);
  assert.notEqual(savedBody.itemInstanceId, foreignBodyItemInstanceId);
  assert.ok(savedBody.itemInstanceId);

  runtimeSnapshot.equipment.slots = [{
    slot: 'weapon',
    item: {
      itemId: 'iron_sword',
      count: 1,
      enhanceLevel: 5,
      itemInstanceId: currentWeaponItemInstanceId,
    },
  }];

  await service.updatePlayer(playerId, {
    section: 'items',
    snapshot: {
      inventory: {
        capacity: 20,
        items: [],
      },
      equipment: {
        weapon: { itemId: 'copper_sword', itemInstanceId: currentWeaponItemInstanceId },
        head: null,
        body: null,
        legs: null,
        accessory: null,
      },
    },
  });

  const changedWeapon = savedSnapshot.equipment.slots.find((entry: any) => entry.slot === 'weapon')?.item;
  assert.equal(changedWeapon.itemId, 'copper_sword');
  assert.notEqual(changedWeapon.itemInstanceId, currentWeaponItemInstanceId);
  assert.ok(changedWeapon.itemInstanceId);

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
    inventory: { revision: 1, capacity: 20, items: [] },
    equipment: { revision: 1, slots: [] },
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

function createPersistedSnapshot(runtimeSnapshot?: any): any {
  return {
    vitals: { maxHp: 100, maxQi: 100, hp: 100, qi: 100 },
    combat: { autoBattleSkills: [] },
    buffs: { revision: 1, buffs: [] },
    progression: { foundation: 0, combatExp: 0, realm: { realmLv: 1, progress: 0 } },
    techniques: { revision: 1, cultivatingTechId: null, techniques: [] },
    inventory: {
      revision: 1,
      capacity: 20,
      items: clone(runtimeSnapshot?.inventory?.items ?? []),
    },
    equipment: {
      revision: 1,
      slots: clone(runtimeSnapshot?.equipment?.slots ?? []),
    },
    quests: { revision: 1, entries: [] },
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
