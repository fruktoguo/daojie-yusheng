import assert from 'node:assert/strict';

import { ServiceUnavailableException } from '@nestjs/common';

import { WorldRuntimeEquipmentService } from '../runtime/world/world-runtime-equipment.service';

type SmokeItem = {
  itemId: string;
  itemInstanceId: string;
  count: number;
  enhanceLevel?: number;
  name?: string;
  type?: string;
  equipSlot?: string;
  desc?: string;
};

type SmokeEquipmentSlot = {
  slot: string;
  item: SmokeItem | null;
};

type SmokePlayer = {
  playerId: string;
  runtimeOwnerId: string;
  sessionEpoch: number;
  instanceId: string;
  inventory: { items: SmokeItem[] };
  equipment: { slots: SmokeEquipmentSlot[] };
};

type DurableInput = {
  operationId: string;
  playerId: string;
  expectedRuntimeOwnerId: string;
  expectedSessionEpoch: number;
  expectedInstanceId?: string | null;
  expectedAssignedNodeId?: string | null;
  expectedOwnershipEpoch?: number | null;
  action: 'equip' | 'unequip';
  slot: string;
  nextInventoryItems: SmokeItem[];
  nextEquipmentSlots: SmokeEquipmentSlot[];
};

const PLAYER_ID = 'player:equipment-atomic-smoke';
const INSTANCE_ID = 'instance:equipment-atomic-smoke';

const ITEM_TEMPLATES: Record<string, Omit<SmokeItem, 'itemInstanceId' | 'count' | 'enhanceLevel'>> = {
  'equip.foundation_darksoil_life_helm': {
    itemId: 'equip.foundation_darksoil_life_helm',
    name: '玄土命盔',
    type: 'equipment',
    equipSlot: 'head',
    desc: '',
  },
  'equip.verdant_crown': {
    itemId: 'equip.verdant_crown',
    name: '青萝束冠',
    type: 'equipment',
    equipSlot: 'head',
    desc: '',
  },
};

function clonePlayer(player: SmokePlayer): SmokePlayer {
  return structuredClone(player);
}

function normalizeItem(item: unknown): SmokeItem | null {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const source = item as Partial<SmokeItem>;
  const itemId = typeof source.itemId === 'string' ? source.itemId : '';
  const template = ITEM_TEMPLATES[itemId];
  if (!template || typeof source.itemInstanceId !== 'string') {
    return source as SmokeItem;
  }
  return {
    ...template,
    ...source,
    itemId,
    itemInstanceId: source.itemInstanceId,
    count: Math.max(1, Math.trunc(Number(source.count ?? 1))),
  };
}

function createHeadItem(
  itemId: keyof typeof ITEM_TEMPLATES,
  itemInstanceId: string,
  count = 1,
): SmokeItem {
  return {
    ...ITEM_TEMPLATES[itemId],
    itemId,
    itemInstanceId,
    count,
    enhanceLevel: 20,
  };
}

function createPlayer(input: {
  inventory: SmokeItem[];
  head: SmokeItem | null;
}): SmokePlayer {
  return {
    playerId: PLAYER_ID,
    runtimeOwnerId: 'runtime-owner:equipment-smoke',
    sessionEpoch: 7,
    instanceId: INSTANCE_ID,
    inventory: { items: input.inventory.map((item) => ({ ...item })) },
    equipment: { slots: [{ slot: 'head', item: input.head ? { ...input.head } : null }] },
  };
}

function createHarness(
  player: SmokePlayer,
  options: {
    durableEnabled?: boolean;
    persistenceEnabled?: boolean;
    onDurableUpdate?: (input: DurableInput) => Promise<void> | void;
  } = {},
) {
  const durableInputs: DurableInput[] = [];
  const calls: string[] = [];
  const notices: string[] = [];
  const durableEnabled = options.durableEnabled !== false;
  const persistenceEnabled = options.persistenceEnabled !== false;

  const playerRuntimeService = {
    async runExclusiveAssetMutation(playerIds: readonly string[], action: () => Promise<unknown> | unknown) {
      assert.deepEqual(playerIds, [PLAYER_ID]);
      calls.push('asset-lock');
      return await action();
    },
    peekInventoryItemByInstanceId(playerId: string, itemInstanceId: string) {
      assert.equal(playerId, PLAYER_ID);
      return player.inventory.items.find((item) => item.itemInstanceId === itemInstanceId) ?? null;
    },
    peekEquippedItem(playerId: string, slot: string) {
      assert.equal(playerId, PLAYER_ID);
      return player.equipment.slots.find((entry) => entry.slot === slot)?.item ?? null;
    },
    getPlayerOrThrow(playerId: string) {
      assert.equal(playerId, PLAYER_ID);
      return player;
    },
    describePersistencePresence(playerId: string) {
      assert.equal(playerId, PLAYER_ID);
      return {
        online: true,
        inWorld: true,
        runtimeOwnerId: player.runtimeOwnerId,
        sessionEpoch: player.sessionEpoch,
        lastHeartbeatAt: 1,
        offlineSinceAt: null,
      };
    },
    ensureRuntimeSessionFenceAtLeast(playerId: string, floor: number) {
      assert.equal(playerId, PLAYER_ID);
      player.sessionEpoch = Math.max(player.sessionEpoch, floor + 1);
    },
    replaceInventoryItems(playerId: string, items: SmokeItem[]) {
      assert.equal(playerId, PLAYER_ID);
      calls.push('replace-inventory');
      player.inventory.items = items.map((item) => ({ ...item }));
    },
    replaceEquipmentSlots(playerId: string, slots: SmokeEquipmentSlot[]) {
      assert.equal(playerId, PLAYER_ID);
      calls.push('replace-equipment');
      player.equipment.slots = slots.map((entry) => ({
        slot: entry.slot,
        item: entry.item ? { ...entry.item } : null,
      }));
    },
    equipItemByInstanceId(playerId: string, itemInstanceId: string) {
      assert.equal(playerId, PLAYER_ID);
      calls.push(`fallback-equip:${itemInstanceId}`);
    },
    unequipItem(playerId: string, slot: string) {
      assert.equal(playerId, PLAYER_ID);
      calls.push(`fallback-unequip:${slot}`);
    },
    setArtifactSlotEnabled() {
      calls.push('set-artifact-enabled');
    },
    contentTemplateRepository: { normalizeItem },
  };

  const durableOperationService = {
    isEnabled() {
      return durableEnabled;
    },
    async updateEquipmentLoadout(input: DurableInput) {
      durableInputs.push(structuredClone(input));
      calls.push('durable-update');
      await options.onDurableUpdate?.(input);
      return { ok: true, alreadyCommitted: false, action: input.action, slot: input.slot };
    },
  };

  const playerDomainPersistenceService = {
    isEnabled() {
      return persistenceEnabled;
    },
    async loadPlayerPresence() {
      return {
        runtimeOwnerId: player.runtimeOwnerId,
        sessionEpoch: player.sessionEpoch - 1,
      };
    },
    async savePlayerPresence() {
      calls.push('save-presence');
    },
  };

  const deps = {
    contentTemplateRepository: { normalizeItem },
    craftPanelRuntimeService: {
      getLockedSlotReason() {
        return null;
      },
    },
    queuePlayerNotice(_playerId: string, message: string) {
      notices.push(message);
    },
    worldRuntimeCraftMutationService: {
      emitAllTechniqueActivityPanelUpdates() {
        calls.push('emit-craft-panels');
      },
    },
    requestPlayerDeltaSync() {
      calls.push('request-delta');
    },
    getPlayerLocation() {
      return { instanceId: INSTANCE_ID };
    },
    instanceCatalogService: {
      isEnabled() {
        return true;
      },
      async loadInstanceCatalog() {
        return {
          assigned_node_id: 'node:equipment-smoke',
          ownership_epoch: 23,
        };
      },
    },
  };

  const service = new WorldRuntimeEquipmentService(
    playerRuntimeService as never,
    durableOperationService as never,
    playerDomainPersistenceService as never,
  );
  return { service, deps, durableInputs, calls, notices };
}

function countItems(player: SmokePlayer, itemId: string): number {
  const inventoryCount = player.inventory.items
    .filter((item) => item.itemId === itemId)
    .reduce((total, item) => total + item.count, 0);
  const equipmentCount = player.equipment.slots
    .filter((entry) => entry.item?.itemId === itemId)
    .reduce((total, entry) => total + (entry.item?.count ?? 0), 0);
  return inventoryCount + equipmentCount;
}

async function testAtomicSwapKeepsDifferentHelmetIdentities(): Promise<void> {
  const player = createPlayer({
    inventory: [createHeadItem('equip.verdant_crown', 'inventory-verdant-stack', 2)],
    head: createHeadItem('equip.foundation_darksoil_life_helm', 'equipment-darksoil'),
  });
  const original = clonePlayer(player);
  const harness = createHarness(player, {
    onDurableUpdate(input) {
      assert.deepEqual(player, original, '数据库提交前不得提前修改运行态');
      assert.equal(input.action, 'equip');
      assert.equal(input.slot, 'head');
    },
  });

  await harness.service.dispatchEquipItem(PLAYER_ID, 'inventory-verdant-stack', harness.deps);

  assert.equal(harness.durableInputs.length, 1);
  const durableInput = harness.durableInputs[0]!;
  assert.equal(durableInput.expectedRuntimeOwnerId, player.runtimeOwnerId);
  assert.equal(durableInput.expectedSessionEpoch, player.sessionEpoch);
  assert.equal(durableInput.expectedInstanceId, INSTANCE_ID);
  assert.equal(durableInput.expectedAssignedNodeId, 'node:equipment-smoke');
  assert.equal(durableInput.expectedOwnershipEpoch, 23);

  const equipped = player.equipment.slots[0]?.item;
  assert.equal(equipped?.itemId, 'equip.verdant_crown');
  assert.equal(equipped?.enhanceLevel, 20);
  assert.notEqual(equipped?.itemInstanceId, 'inventory-verdant-stack');
  assert.equal(
    player.inventory.items.find((item) => item.itemId === 'equip.verdant_crown')?.itemInstanceId,
    'inventory-verdant-stack',
  );
  assert.equal(
    player.inventory.items.find((item) => item.itemId === 'equip.foundation_darksoil_life_helm')?.itemInstanceId,
    'equipment-darksoil',
  );
  assert.equal(countItems(player, 'equip.verdant_crown'), 2);
  assert.equal(countItems(player, 'equip.foundation_darksoil_life_helm'), 1);
  assert.deepEqual(
    harness.calls.slice(0, 4),
    ['asset-lock', 'save-presence', 'durable-update', 'replace-inventory'],
  );
  assert.ok(harness.calls.indexOf('replace-equipment') > harness.calls.indexOf('durable-update'));
  assert.equal(harness.notices[0], '装备 +20 青萝束冠');
  assert.ok(harness.calls.includes('request-delta'));
}

async function testDurableFailureLeavesRuntimeUntouched(): Promise<void> {
  const player = createPlayer({
    inventory: [createHeadItem('equip.verdant_crown', 'inventory-verdant', 1)],
    head: createHeadItem('equip.foundation_darksoil_life_helm', 'equipment-darksoil'),
  });
  const original = clonePlayer(player);
  const harness = createHarness(player, {
    onDurableUpdate() {
      throw new Error('equipment_commit_failed');
    },
  });

  await assert.rejects(
    harness.service.dispatchEquipItem(PLAYER_ID, 'inventory-verdant', harness.deps),
    /equipment_commit_failed/,
  );
  assert.deepEqual(player, original);
  assert.equal(harness.notices.length, 0);
  assert.equal(harness.calls.includes('replace-inventory'), false);
  assert.equal(harness.calls.includes('replace-equipment'), false);
}

async function testUnequipMergesOnlySameTemplate(): Promise<void> {
  const player = createPlayer({
    inventory: [
      createHeadItem('equip.verdant_crown', 'inventory-verdant', 1),
      createHeadItem('equip.foundation_darksoil_life_helm', 'inventory-darksoil', 1),
    ],
    head: createHeadItem('equip.verdant_crown', 'equipment-verdant'),
  });
  const harness = createHarness(player);

  await harness.service.dispatchUnequipItem(
    PLAYER_ID,
    'head',
    harness.deps,
    'equipment-verdant',
  );

  const durableInput = harness.durableInputs[0]!;
  assert.equal(durableInput.action, 'unequip');
  assert.equal(durableInput.nextEquipmentSlots[0]?.item, null);
  assert.equal(player.equipment.slots[0]?.item, null);
  const verdant = player.inventory.items.find((item) => item.itemId === 'equip.verdant_crown');
  const darksoil = player.inventory.items.find((item) => item.itemId === 'equip.foundation_darksoil_life_helm');
  assert.equal(verdant?.count, 2);
  assert.equal(verdant?.itemInstanceId, 'inventory-verdant');
  assert.equal(darksoil?.count, 1);
  assert.equal(darksoil?.itemInstanceId, 'inventory-darksoil');
  assert.equal(harness.notices[0], '卸下 +20 青萝束冠');
}

async function testPersistentRuntimeFailsClosedWithoutDurableService(): Promise<void> {
  const player = createPlayer({
    inventory: [createHeadItem('equip.verdant_crown', 'inventory-verdant', 1)],
    head: null,
  });
  const harness = createHarness(player, { durableEnabled: false, persistenceEnabled: true });

  await assert.rejects(
    harness.service.dispatchEquipItem(PLAYER_ID, 'inventory-verdant', harness.deps),
    (error: unknown) => error instanceof ServiceUnavailableException,
  );
  assert.equal(harness.calls.some((entry) => entry.startsWith('fallback-equip:')), false);
}

async function testLocalRuntimeKeepsNonPersistentFallback(): Promise<void> {
  const player = createPlayer({
    inventory: [createHeadItem('equip.verdant_crown', 'inventory-verdant', 1)],
    head: null,
  });
  const harness = createHarness(player, { durableEnabled: false, persistenceEnabled: false });

  await harness.service.dispatchEquipItem(PLAYER_ID, 'inventory-verdant', harness.deps);

  assert.ok(harness.calls.includes('fallback-equip:inventory-verdant'));
  assert.equal(harness.durableInputs.length, 0);
}

async function main(): Promise<void> {
  await testAtomicSwapKeepsDifferentHelmetIdentities();
  await testDurableFailureLeavesRuntimeUntouched();
  await testUnequipMergesOnlySameTemplate();
  await testPersistentRuntimeFailsClosedWithoutDurableService();
  await testLocalRuntimeKeepsNonPersistentFallback();
  console.log(JSON.stringify({ ok: true, case: 'world-runtime-equipment-atomic-loadout' }));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
