import * as assert from 'node:assert/strict';
import { ContentTemplateRepository } from '../content/content-template.repository';
import { NativeGmPlayerService } from '../http/native/native-gm-player.service';

function createPlayerSnapshot(playerId: string, inventoryItems: any[], equipmentItem: any | null = null): any {
  return {
    playerId,
    hp: 100,
    maxHp: 1000,
    qi: 50,
    maxQi: 500,
    inventory: {
      revision: 1,
      capacity: 20,
      items: inventoryItems,
    },
    equipment: {
      revision: 1,
      slots: [
        { slot: 'accessory', item: equipmentItem },
      ],
    },
  };
}

function findCount(items: any[], itemId: string): number {
  return Math.max(0, Math.trunc(Number(items.find((entry) => entry?.itemId === itemId)?.count ?? 0)));
}

const content = new ContentTemplateRepository();
content.onModuleInit();

const runtimePlayerId = 'player:recovery-pill-runtime-smoke';
const offlinePlayerId = 'player:recovery-pill-offline-smoke';
const runtimeSnapshot = createPlayerSnapshot(runtimePlayerId, [
  { itemId: 'pure_yang_pill', count: 2 },
  content.createItem('recovery_powder', 3),
  { itemId: 'pill.nurturing_paste', count: 1 },
], { itemId: 'pill.earthrest_paste', count: 1 });
const offlineSnapshot = createPlayerSnapshot(offlinePlayerId, [
  { itemId: 'pill.cleartide_powder', count: 6 },
  { itemId: 'pill.earthrest_paste', count: 2 },
  content.createItem('stabilizing_pellet', 1),
]);

const persistedSnapshots = new Map<string, any>([
  [runtimePlayerId, JSON.parse(JSON.stringify(runtimeSnapshot))],
  [offlinePlayerId, JSON.parse(JSON.stringify(offlineSnapshot))],
]);
const runtimeSnapshots = new Map<string, any>([
  [runtimePlayerId, JSON.parse(JSON.stringify(runtimeSnapshot))],
]);
const marketStorages = new Map<string, { items: any[] }>([
  [runtimePlayerId, { items: [{ itemId: 'pure_yang_pill', count: 4 }, content.createItem('recovery_powder', 1)] }],
  [offlinePlayerId, { items: [{ itemId: 'pill.nurturing_paste', count: 5 }] }],
]);

const playerRuntimeService = {
  snapshot(playerId: string) {
    const snapshot = runtimeSnapshots.get(playerId);
    return snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
  },
  buildStarterPersistenceSnapshot() {
    return null;
  },
  buildPersistenceSnapshot(playerId: string) {
    const snapshot = runtimeSnapshots.get(playerId);
    return snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
  },
  restoreSnapshot(snapshot: any) {
    runtimeSnapshots.set(snapshot.playerId, JSON.parse(JSON.stringify(snapshot)));
  },
  listPlayerSnapshots() {
    return Array.from(runtimeSnapshots.values(), (snapshot) => ({ playerId: snapshot.playerId }));
  },
  rebuildActionState() {},
  refreshOnlineTechniqueTemplates() {
    return {};
  },
  markPersisted() {},
  setManagedBodyTrainingLevel() {
    return {};
  },
};

const persistenceService = {
  async loadProjectedSnapshot(playerId: string) {
    const snapshot = persistedSnapshots.get(playerId);
    return snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
  },
  async savePlayerSnapshotProjection(playerId: string, snapshot: any) {
    persistedSnapshots.set(playerId, JSON.parse(JSON.stringify(snapshot)));
  },
  async listProjectedSnapshots() {
    return Array.from(persistedSnapshots.entries(), ([playerId, snapshot]) => ({
      playerId,
      snapshot: JSON.parse(JSON.stringify(snapshot)),
    }));
  },
};

const marketRuntimeService = {
  getStorage(playerId: string) {
    return JSON.parse(JSON.stringify(marketStorages.get(playerId) ?? { items: [] }));
  },
  async runExclusiveMarketMutation(playerId: string, action: (context: any) => any) {
    return action({
      storageSnapshotByPlayerId: new Map(),
      dirtyStoragePlayerIds: new Set(),
    });
  },
  setStorage(playerId: string, storage: { items: any[] }) {
    marketStorages.set(playerId, JSON.parse(JSON.stringify(storage)));
  },
  async ensureStorageHydrated() {},
};

const service = new NativeGmPlayerService(
  content,
  {} as any,
  persistenceService as any,
  {
    createRealmStateFromLevel(realmLv: number, progress: number) {
      return { realmLv, progress };
    },
    initializePlayer() {},
  } as any,
  playerRuntimeService as any,
  marketRuntimeService as any,
  {} as any,
  { getManagedAccountIndex: async () => new Map() } as any,
  null,
  null,
  null,
);

async function main(): Promise<void> {
  const result = await service.migrateAllPlayersRecoveryPills();
  assert.equal(result.totalPlayers, 2, '应迁移一个在线角色和一个离线角色');
  assert.equal(result.queuedRuntimePlayers, 1, '在线角色应计入运行态迁移');
  assert.equal(result.updatedOfflinePlayers, 1, '离线角色应直接更新存档');
  assert.equal(result.totalRecoveryPillInventoryStacksMigrated, 4, '背包旧药堆叠数应正确统计');
  assert.equal(result.totalRecoveryPillInventoryItemsMigrated, 11, '背包旧药总数应正确统计');
  assert.equal(result.totalRecoveryPillMarketStorageStacksMigrated, 2, '托管仓旧药堆叠数应正确统计');
  assert.equal(result.totalRecoveryPillMarketStorageItemsMigrated, 9, '托管仓旧药总数应正确统计');
  assert.equal(result.totalRecoveryPillEquipmentMigrated, 1, '异常装备栏旧药应迁移');

  const runtimeAfter = runtimeSnapshots.get(runtimePlayerId)!;
  assert.equal(findCount(runtimeAfter.inventory.items, 'recovery_powder'), 5, '在线背包纯阳丹应合并到回灵散');
  assert.equal(findCount(runtimeAfter.inventory.items, 'stabilizing_pellet'), 1, '在线背包养脉膏应迁到镇脉丸');
  assert.equal(runtimeAfter.equipment.slots[0].item.itemId, 'stabilizing_pellet', '装备栏厚土膏应迁到镇脉丸');

  const offlineAfter = persistedSnapshots.get(offlinePlayerId)!;
  assert.equal(findCount(offlineAfter.inventory.items, 'recovery_powder'), 6, '离线背包清脉散应迁到回灵散');
  assert.equal(findCount(offlineAfter.inventory.items, 'stabilizing_pellet'), 3, '离线背包厚土膏应合并到镇脉丸');

  assert.equal(findCount(marketStorages.get(runtimePlayerId)!.items, 'recovery_powder'), 5, '在线托管仓纯阳丹应合并到回灵散');
  assert.equal(findCount(marketStorages.get(offlinePlayerId)!.items, 'stabilizing_pellet'), 5, '离线托管仓养脉膏应迁到镇脉丸');
  console.log('recovery-pill-migration-smoke ok');
}

void main();
