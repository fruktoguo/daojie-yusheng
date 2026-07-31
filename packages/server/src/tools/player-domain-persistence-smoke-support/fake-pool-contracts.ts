import { isLegacyItemInstanceId } from '@mud/shared';

import {
  buildPlayerSnapshotProjectionWritePlan,
  executePlayerDomainWritePlan,
} from '../../persistence/player-domain-write-plan';
import { PlayerDomainPersistenceService } from '../../persistence/player-domain-persistence.service';
import type { PersistedPlayerSnapshot } from '../../persistence/player-persistence.service';
import { buildSnapshot } from './fixtures';

export async function runPlayerDomainFakePoolContracts(): Promise<void> {
  await assertInventoryAndWalletSnapshotsUseStaleKeyPruning();
  await assertInventoryDuplicateSlotsAreReassigned();
  await assertInventoryDuplicateSlotsAreReassignedInWritePlan();
  await assertInventoryProjectionUsesLiveDbStateWhenSlotsMove();
  await assertInventorySameSlotPersistenceLocksRowsAndUsesJsonbStableCompare();
  await assertEquipmentProjectionWritePlanRecorderDoesNotInventConflicts();
  await assertEquipmentInstanceIdsRepairLegacyAndOutOfScopeConflicts();
  await assertEmptyCollectionSnapshotsDoNotIssueDeletes();
  await assertExplicitEmptyWalletProjectionUsesDedicatedClear();
  await assertAutoPreferenceEmptyOverwriteIsAllowed();
  await assertLogbookAcknowledgementCanClearPendingRows();
  await assertAssetDomainInvalidEntriesRefuseSilentPrune();
}

async function assertInventoryAndWalletSnapshotsUseStaleKeyPruning(): Promise<void> {
  const queries: string[] = [];
  const inventoryInsertPayloads: unknown[][] = [];
  const fakeClient = {
    async query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number }> {
      queries.push(sql);
      if (sql.includes('INSERT INTO player_inventory_item') && Array.isArray(params) && typeof params[1] === 'string') {
        inventoryInsertPayloads.push(JSON.parse(params[1]) as unknown[]);
      }
      if (
        sql.includes('SELECT item_instance_id, slot_index, item_id, count, raw_payload, locked_by')
        && sql.includes('FROM player_inventory_item')
      ) {
        return {
          rows: [{
            item_instance_id: 'stale-inventory-row',
            slot_index: 999,
            item_id: 'stale_item',
            count: 1,
            raw_payload: {},
            locked_by: null,
          }],
          rowCount: 1,
        };
      }
      if (
        sql.includes('SELECT item_instance_id')
        && sql.includes('FROM player_equipment_slot')
        && !sql.includes('player_id <> $2')
      ) {
        const persistedIds = Array.isArray(params?.[1]) ? params[1] as unknown[] : [];
        return {
          rows: persistedIds.map((item_instance_id) => ({ item_instance_id })),
          rowCount: persistedIds.length,
        };
      }
      const isCheckedInsert = sql.includes('INSERT INTO player_inventory_item')
        || sql.includes('INSERT INTO player_market_storage_item')
        || sql.includes('INSERT INTO player_equipment_slot')
        || sql.includes('INSERT INTO player_enhancement_record')
        || sql.includes('INSERT INTO player_logbook_message');
      const parsedRows = isCheckedInsert && Array.isArray(params) && typeof params[1] === 'string'
        ? JSON.parse(params[1]) as unknown[]
        : [];
      return { rows: [], rowCount: isCheckedInsert ? Math.max(1, parsedRows.length) : 0 };
    },
    release() {
      return undefined;
    },
  };
  const service = new PlayerDomainPersistenceService(null, null);
  Object.assign(service as unknown as { pool: unknown; enabled: boolean }, {
    pool: {
      async connect() {
        return fakeClient;
      },
    },
    enabled: true,
  });

  await service.savePlayerInventoryItems(
    'player:fake',
    [
      {
        itemId: 'spirit_grass',
        count: 1,
        slotIndex: 0,
        itemInstanceId: 'inv:player:fake:0',
        rawPayload: { itemId: 'spirit_grass', count: 1 },
      },
    ],
    { versionSeed: 1 },
  );
  await service.savePlayerInventoryItems(
    'player:fake',
    [
      {
        itemId: 'equip.mount_guard_helm',
        count: 1,
        slotIndex: 81,
        itemInstanceId: '1ca4ad01-d4cd-4cb8-9e55-b6ced695b112',
        rawPayload: { itemId: 'equip.mount_guard_helm', count: 1 },
      },
      {
        itemId: 'equip.mount_guard_helm',
        count: 1,
        slotIndex: 170,
        itemInstanceId: '1ca4ad01-d4cd-4cb8-9e55-b6ced695b112',
        rawPayload: { itemId: 'equip.mount_guard_helm', count: 1 },
      },
    ],
    { versionSeed: 1 },
  );
  await service.savePlayerWallet(
    'player:fake',
    [
      {
        walletType: 'spirit_stone',
        balance: 1,
        frozenBalance: 0,
        version: 1,
      },
    ],
    { versionSeed: 1 },
  );
  await service.savePlayerMarketStorageItems(
    'player:fake',
    [
      {
        storageItemId: 'market-storage:fake:0',
        slotIndex: 0,
        itemId: 'fake_ore',
        count: 1,
        rawPayload: { itemId: 'fake_ore', count: 1 },
      },
    ],
    { versionSeed: 1 },
  );
  await service.savePlayerEquipmentSlots(
    'player:fake',
    [
      {
        slot: 'weapon',
        itemInstanceId: 'equip:player:fake:weapon',
        item: {
          itemId: 'weapon.fake_sword',
          count: 1,
          equipSlot: 'weapon',
        },
      },
    ],
    { versionSeed: 1 },
  );
  await service.savePlayerMapUnlocks('player:fake', [{ mapId: 'fake_map', unlockedAt: 1 }], { versionSeed: 1 });
  await service.savePlayerTechniques(
    'player:fake',
    [{ techId: 'tech_fake', level: 1, exp: 0, expToNext: 1, realmLv: 1, skillsEnabled: true, rawPayload: {} }],
    { versionSeed: 1 },
  );
  await service.savePlayerBuffs(
    'player:fake',
    [{
      buffId: 'buff_fake',
      sourceSkillId: 'skill_fake',
      sourceCasterId: 'player:fake',
      realmLv: 1,
      remainingTicks: 1,
      duration: 1,
      stacks: 1,
      maxStacks: 1,
      sustainTicksElapsed: 0,
      rawPayload: {},
    }],
    { versionSeed: 1 },
  );
  await service.savePlayerQuests(
    'player:fake',
    [{ questId: 'quest_fake', status: 'active', progressPayload: {}, rawPayload: {} }],
    { versionSeed: 1 },
  );
  await service.savePlayerAutoBattleSkills(
    'player:fake',
    [{ skillId: 'skill_fake', enabled: true, skillEnabled: true, autoBattleOrder: 1 }],
    { versionSeed: 1 },
  );
  await service.savePlayerAutoUseItemRules(
    'player:fake',
    [{ itemId: 'pill_fake', conditionPayload: [] }],
    { versionSeed: 1 },
  );
  await service.savePlayerProfessionState(
    'player:fake',
    [{ professionType: 'alchemy', level: 1, exp: 0, expToNext: 1 }],
    { versionSeed: 1 },
  );
  await service.savePlayerAlchemyPresets(
    'player:fake',
    [{ presetId: 'preset_fake', recipeId: 'recipe_fake', name: 'fake', ingredients: [] }],
    { versionSeed: 1 },
  );
  await service.savePlayerEnhancementRecords(
    'player:fake',
    [{
      recordId: 'enhancement:fake:1',
      itemId: 'weapon_fake',
      highestLevel: 1,
      levelsPayload: [],
      actionStartedAt: 1,
      actionEndedAt: 2,
      startLevel: 0,
      initialTargetLevel: 1,
      desiredTargetLevel: 1,
      protectionStartLevel: null,
      status: 'completed',
    }],
    { versionSeed: 1 },
  );
  await service.savePlayerLogbookMessages(
    'player:fake',
    [{ id: 'log_fake_1', kind: 'system', text: 'fake', at: 1, ackedAt: null }],
    { versionSeed: 1 },
  );

  const normalizedQueries = queries.map((query) => query.replace(/\s+/g, ' ').trim());
  const forbiddenDeletes = [
    'DELETE FROM player_inventory_item WHERE player_id = $1',
    'DELETE FROM player_wallet WHERE player_id = $1',
    'DELETE FROM player_market_storage_item WHERE player_id = $1',
    'DELETE FROM player_equipment_slot WHERE player_id = $1',
    'DELETE FROM player_map_unlock WHERE player_id = $1',
    'DELETE FROM player_technique_state WHERE player_id = $1',
    'DELETE FROM player_persistent_buff_state WHERE player_id = $1',
    'DELETE FROM player_quest_progress WHERE player_id = $1',
    'DELETE FROM player_auto_battle_skill WHERE player_id = $1',
    'DELETE FROM player_auto_use_item_rule WHERE player_id = $1',
    'DELETE FROM player_profession_state WHERE player_id = $1',
    'DELETE FROM player_alchemy_preset WHERE player_id = $1',
    'DELETE FROM player_enhancement_record WHERE player_id = $1',
    'DELETE FROM player_logbook_message WHERE player_id = $1',
  ];
  for (const forbidden of forbiddenDeletes) {
    if (normalizedQueries.some((query) => query === forbidden)) {
      throw new Error(`player snapshot emitted forbidden whole-player delete: ${forbidden}`);
    }
  }
  for (const tableName of [
    'player_inventory_item',
    'player_wallet',
    'player_market_storage_item',
    'player_equipment_slot',
    'player_map_unlock',
    'player_technique_state',
    'player_persistent_buff_state',
    'player_quest_progress',
    'player_auto_battle_skill',
    'player_auto_use_item_rule',
    'player_profession_state',
    'player_alchemy_preset',
    'player_enhancement_record',
    'player_logbook_message',
  ]) {
    const hasStaleKeyDelete = tableName === 'player_inventory_item'
      ? normalizedQueries.some((query) => query.includes('DELETE FROM player_inventory_item WHERE player_id = $1 AND item_instance_id = ANY($2::varchar[])'))
      : normalizedQueries.some((query) => query.includes(`DELETE FROM ${tableName} target`)
        && query.includes('jsonb_to_recordset')
        && query.includes('NOT EXISTS'));
    if (!hasStaleKeyDelete) {
      throw new Error(`player snapshot missing stale-key delete guard for ${tableName}`);
    }
  }
  const duplicateCoalescePayload = inventoryInsertPayloads.find((payload) =>
    payload.length === 1
    && (payload[0] as Record<string, unknown> | undefined)?.item_instance_id === '1ca4ad01-d4cd-4cb8-9e55-b6ced695b112'
    && (payload[0] as Record<string, unknown> | undefined)?.count === 2,
  );
  const coalescedInventoryRows = Array.isArray(duplicateCoalescePayload)
    ? duplicateCoalescePayload as Array<Record<string, unknown>>
    : [];
  if (
    coalescedInventoryRows.length !== 1
    || coalescedInventoryRows[0]?.item_instance_id !== '1ca4ad01-d4cd-4cb8-9e55-b6ced695b112'
    || coalescedInventoryRows[0]?.slot_index !== 81
    || coalescedInventoryRows[0]?.item_id !== 'equip.mount_guard_helm'
    || coalescedInventoryRows[0]?.count !== 2
  ) {
    throw new Error(`duplicate inventory itemInstanceId coalesce did not merge same-signature rows: ${JSON.stringify(coalescedInventoryRows)}`);
  }
}
async function assertInventoryDuplicateSlotsAreReassigned(): Promise<void> {
  let inventoryInsertPayload: Array<Record<string, unknown>> = [];
  const fakeClient = {
    async query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number }> {
      if (
        sql.includes('SELECT item_instance_id, slot_index, item_id, count, raw_payload, locked_by')
        && sql.includes('FROM player_inventory_item')
      ) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('INSERT INTO player_inventory_item') && Array.isArray(params) && typeof params[1] === 'string') {
        inventoryInsertPayload = JSON.parse(params[1]) as Array<Record<string, unknown>>;
        return { rows: [], rowCount: inventoryInsertPayload.length };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {
      return undefined;
    },
  };
  const service = new PlayerDomainPersistenceService(null, null);
  Object.assign(service as unknown as { pool: unknown; enabled: boolean }, {
    pool: {
      async connect() {
        return fakeClient;
      },
    },
    enabled: true,
  });

  await service.savePlayerInventoryItems(
    'player:duplicate-slot',
    [
      { itemId: 'item.slot_a', count: 1, slotIndex: 5, itemInstanceId: 'inv:slot:a', rawPayload: { itemId: 'item.slot_a', count: 1 } },
      { itemId: 'item.slot_b', count: 1, slotIndex: 5, itemInstanceId: 'inv:slot:b', rawPayload: { itemId: 'item.slot_b', count: 1 } },
      { itemId: 'item.slot_c', count: 1, slotIndex: 0, itemInstanceId: 'inv:slot:c', rawPayload: { itemId: 'item.slot_c', count: 1 } },
      { itemId: 'item.slot_d', count: 1, slotIndex: 0, itemInstanceId: 'inv:slot:d', rawPayload: { itemId: 'item.slot_d', count: 1 } },
    ],
    { versionSeed: 1 },
  );

  const slots = inventoryInsertPayload.map((row) => Number(row.slot_index));
  const itemIds = inventoryInsertPayload.map((row) => String(row.item_id)).sort();
  if (
    inventoryInsertPayload.length !== 4
    || new Set(slots).size !== 4
    || itemIds.join(',') !== 'item.slot_a,item.slot_b,item.slot_c,item.slot_d'
  ) {
    throw new Error(`duplicate inventory slots were not reassigned without dropping items: ${JSON.stringify(inventoryInsertPayload)}`);
  }
}
async function assertInventoryDuplicateSlotsAreReassignedInWritePlan(): Promise<void> {
  const snapshot = buildSnapshot(Date.now());
  snapshot.inventory = {
    revision: 10,
    capacity: 24,
    items: [
      { itemId: 'item.plan_slot_a', count: 1, slotIndex: 5, itemInstanceId: 'inv:plan:a', rawPayload: { itemId: 'item.plan_slot_a', count: 1 } },
      { itemId: 'item.plan_slot_b', count: 1, slotIndex: 5, itemInstanceId: 'inv:plan:b', rawPayload: { itemId: 'item.plan_slot_b', count: 1 } },
      { itemId: 'item.plan_slot_c', count: 1, slotIndex: 0, itemInstanceId: 'inv:plan:c', rawPayload: { itemId: 'item.plan_slot_c', count: 1 } },
      { itemId: 'item.plan_slot_d', count: 1, slotIndex: 0, itemInstanceId: 'inv:plan:d', rawPayload: { itemId: 'item.plan_slot_d', count: 1 } },
    ],
  } as PersistedPlayerSnapshot['inventory'];

  const plan = await buildPlayerSnapshotProjectionWritePlan(
    'player:duplicate-slot-write-plan',
    snapshot,
    ['inventory'],
  );
  const inventoryInsertStep = plan.steps.find((step) =>
    step.sql.includes('INSERT INTO player_inventory_item')
    && typeof step.params[1] === 'string',
  );
  const rows = inventoryInsertStep
    ? JSON.parse(String(inventoryInsertStep.params[1])) as Array<Record<string, unknown>>
    : [];
  const slots = rows.map((row) => Number(row.slot_index));
  const itemIds = rows.map((row) => String(row.item_id)).sort();
  if (
    rows.length !== 4
    || new Set(slots).size !== 4
    || itemIds.join(',') !== 'item.plan_slot_a,item.plan_slot_b,item.plan_slot_c,item.plan_slot_d'
  ) {
    throw new Error(`duplicate inventory slots were not reassigned in write plan: ${JSON.stringify(rows)}`);
  }

  const executedParams: unknown[][] = [];
  const fakeClient = {
    async query(_sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number }> {
      executedParams.push(Array.isArray(params) ? params : []);
      return { rows: [], rowCount: rows.length };
    },
  };
  await executePlayerDomainWritePlan(fakeClient as never, plan);
  const executedInsertRows = executedParams
    .map((params) => (typeof params[1] === 'string' ? JSON.parse(params[1]) as unknown : null))
    .find((payload): payload is Array<Record<string, unknown>> =>
      Array.isArray(payload)
      && payload.some((row) => (row as Record<string, unknown>)?.item_id === 'item.plan_slot_a'),
    ) ?? [];
  const executedSlots = executedInsertRows.map((row) => Number(row.slot_index));
  if (executedInsertRows.length !== 4 || new Set(executedSlots).size !== 4) {
    throw new Error(`executePlayerDomainWritePlan carried duplicate inventory slots: ${JSON.stringify(executedInsertRows)}`);
  }
}

async function assertInventoryProjectionUsesLiveDbStateWhenSlotsMove(): Promise<void> {
  const staleSlotOwnerId = '00000000-0000-4000-8000-00000000a001';
  const movedItemId = '00000000-0000-4000-8000-00000000a002';
  const submittedKinds: string[] = [];
  const executedSql: string[] = [];
  const fakeClient = {
    async query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number }> {
      executedSql.push(sql);
      if (
        sql.includes('SELECT item_instance_id, slot_index, item_id, count, raw_payload, locked_by')
        && sql.includes('FROM player_inventory_item')
      ) {
        return {
          rows: [
            {
              item_instance_id: staleSlotOwnerId,
              slot_index: 0,
              item_id: 'item.removed',
              count: 1,
              raw_payload: { itemId: 'item.removed', count: 1 },
              locked_by: null,
            },
            {
              item_instance_id: movedItemId,
              slot_index: 1,
              item_id: 'item.kept',
              count: 1,
              raw_payload: { itemId: 'item.kept', count: 1 },
              locked_by: null,
            },
          ],
          rowCount: 2,
        };
      }
      if (sql.includes('DELETE FROM player_inventory_item') && sql.includes('item_instance_id = ANY')) {
        const staleIds = Array.isArray(params?.[1]) ? params[1] as unknown[] : [];
        if (staleIds.length !== 1 || staleIds[0] !== staleSlotOwnerId) {
          throw new Error(`inventory live projection did not delete stale slot owner first: ${JSON.stringify(staleIds)}`);
        }
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('UPDATE player_inventory_item') && sql.includes('slot_index = incoming.temp_slot_index')) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('UPDATE player_inventory_item') && sql.includes('slot_index = incoming.slot_index')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {
      return undefined;
    },
  };
  const service = new PlayerDomainPersistenceService(
    null,
    null,
    {
      async submit(kind) {
        submittedKinds.push(String(kind));
        return { taskId: 'unexpected-persistence-build', ok: false, errorMessage: 'inventory projection should use live DB state', durationMs: 0 };
      },
    } as unknown as ConstructorParameters<typeof PlayerDomainPersistenceService>[2],
  );
  Object.assign(service as unknown as { pool: unknown; enabled: boolean }, {
    pool: {
      async connect() {
        return fakeClient;
      },
    },
    enabled: true,
  });

  const snapshot = buildSnapshot(Date.now());
  snapshot.inventory = {
    revision: 11,
    capacity: 24,
    items: [
      {
        itemId: 'item.kept',
        count: 1,
        slotIndex: 0,
        itemInstanceId: movedItemId,
        rawPayload: { itemId: 'item.kept', count: 1 },
      },
    ],
  } as PersistedPlayerSnapshot['inventory'];

  await service.savePlayerSnapshotProjectionDomains(
    'player:inventory-live-slot-move',
    snapshot,
    ['inventory'],
    { allowInventoryEmptyOverwrite: true },
  );

  if (submittedKinds.length > 0) {
    throw new Error(`inventory projection unexpectedly used persistence worker: ${JSON.stringify(submittedKinds)}`);
  }
  const deletedStaleSlotOwner = executedSql.some((sql) =>
    sql.includes('DELETE FROM player_inventory_item') && sql.includes('item_instance_id = ANY'),
  );
  const stagedMove = executedSql.some((sql) =>
    sql.includes('UPDATE player_inventory_item') && sql.includes('slot_index = incoming.temp_slot_index'),
  );
  const finalizedMove = executedSql.some((sql) =>
    sql.includes('UPDATE player_inventory_item') && sql.includes('slot_index = incoming.slot_index'),
  );
  if (!deletedStaleSlotOwner || !stagedMove || !finalizedMove) {
    throw new Error(`inventory projection did not use live stale-delete and staged move SQL: ${JSON.stringify(executedSql)}`);
  }
}

async function assertInventorySameSlotPersistenceLocksRowsAndUsesJsonbStableCompare(): Promise<void> {
  const itemInstanceId = '00000000-0000-4000-8000-00000000b001';
  const lockedBy = 'enhancement:job:jsonb-order-smoke';
  let phase: 'jsonb-order' | 'same-slot-update' = 'jsonb-order';
  const queries: string[] = [];
  const fakeClient = {
    async query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number }> {
      queries.push(sql);
      if (
        sql.includes('SELECT item_instance_id, slot_index, item_id, count, raw_payload, locked_by')
        && sql.includes('FROM player_inventory_item')
      ) {
        return {
          rows: [{
            item_instance_id: itemInstanceId,
            slot_index: -1,
            item_id: 'equip.sealed_path_token',
            count: 1,
            raw_payload: { lockedAt: 12345, enhanceLevel: 0 },
            locked_by: lockedBy,
          }],
          rowCount: 1,
        };
      }
      if (
        sql.includes('UPDATE player_inventory_item')
        && sql.includes('item_id = incoming.item_id')
        && sql.includes('slot_index = incoming.slot_index')
      ) {
        if (phase === 'jsonb-order') {
          throw new Error('jsonb key order equivalent payload should not issue same-slot update');
        }
        const normalizedSql = sql.replace(/\s+/g, ' ').trim();
        if (normalizedSql.includes('target.count IS DISTINCT') || normalizedSql.includes('target.raw_payload IS DISTINCT')) {
          throw new Error(`same-slot update still depends on PG no-op distinct guard: ${normalizedSql}`);
        }
        const rows = typeof params?.[1] === 'string'
          ? JSON.parse(params[1]) as unknown[]
          : [];
        return { rows: [], rowCount: rows.length };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {
      return undefined;
    },
  };
  const service = new PlayerDomainPersistenceService(null, null);
  Object.assign(service as unknown as { pool: unknown; enabled: boolean }, {
    pool: {
      async connect() {
        return fakeClient;
      },
    },
    enabled: true,
  });

  await service.savePlayerInventoryItems(
    'player:inventory-same-slot-jsonb',
    [{
      itemId: 'equip.sealed_path_token',
      count: 1,
      itemInstanceId,
      lockedBy,
      lockedAt: 12345,
      enhanceLevel: 0,
      rawPayload: { enhanceLevel: 0, lockedAt: 12345 },
    } as never],
    { versionSeed: 1 },
  );

  const lockedSelect = queries.find((sql) =>
    sql.includes('SELECT item_instance_id, slot_index, item_id, count, raw_payload, locked_by')
    && sql.includes('FROM player_inventory_item'),
  );
  if (!lockedSelect || !lockedSelect.includes('FOR UPDATE')) {
    throw new Error(`inventory same-slot persistence did not lock existing rows: ${JSON.stringify(queries)}`);
  }

  phase = 'same-slot-update';
  queries.length = 0;
  await service.savePlayerInventoryItems(
    'player:inventory-same-slot-jsonb',
    [{
      itemId: 'equip.sealed_path_token',
      count: 2,
      itemInstanceId,
      lockedBy,
      lockedAt: 12345,
      enhanceLevel: 0,
      rawPayload: { enhanceLevel: 0, lockedAt: 12345 },
    } as never],
    { versionSeed: 2 },
  );

  const sameSlotUpdate = queries.find((sql) =>
    sql.includes('UPDATE player_inventory_item')
    && sql.includes('item_id = incoming.item_id')
    && sql.includes('slot_index = incoming.slot_index'),
  );
  if (!sameSlotUpdate) {
    throw new Error(`inventory same-slot count change did not issue targeted update: ${JSON.stringify(queries)}`);
  }
}

async function assertEquipmentProjectionWritePlanRecorderDoesNotInventConflicts(): Promise<void> {
  const service = new PlayerDomainPersistenceService(
    null,
    null,
    {
      async submit(_kind, payload, fallback) {
        if (!fallback) {
          return { taskId: 'fake-persistence-build', ok: false, errorMessage: 'missing fallback', durationMs: 0 };
        }
        return {
          taskId: 'fake-persistence-build',
          ok: true,
          result: await fallback(payload),
          durationMs: 0,
        };
      },
    } as unknown as ConstructorParameters<typeof PlayerDomainPersistenceService>[2],
  );
  Object.assign(service as unknown as { pool: unknown; enabled: boolean }, {
    pool: {
      async connect() {
        throw new Error('equipment projection write plan recorder smoke must not open a real connection');
      },
    },
    enabled: true,
  });

  const snapshot = buildSnapshot(Date.now());
  snapshot.equipment = {
    revision: 9,
    slots: [
      {
        slot: 'weapon',
        itemInstanceId: '00000000-0000-4000-8000-00000000feed',
        item: {
          itemId: 'weapon.recorder_smoke_blade',
          count: 1,
          equipSlot: 'weapon',
          itemInstanceId: '00000000-0000-4000-8000-00000000feed',
        },
      },
    ],
  };

  await (service as unknown as {
    resolvePlayerSnapshotProjectionWritePlan: (
      playerId: string,
      snapshot: PersistedPlayerSnapshot,
      domains: Iterable<string>,
    ) => Promise<{ steps: Array<{ sql: string }> }>;
  }).resolvePlayerSnapshotProjectionWritePlan(
    'player:equipment-projection-recorder',
    snapshot,
    ['equipment'],
  );
}

async function assertEquipmentInstanceIdsRepairLegacyAndOutOfScopeConflicts(): Promise<void> {
  const conflictedInstanceId = '00000000-0000-4000-8000-000000000123';
  const raceConflictInstanceId = '00000000-0000-4000-8000-000000000456';
  const equipmentInsertPayloads: unknown[][] = [];
  let raceConflictVisible = false;
  let equipmentPersistCountChecks = 0;
  const fakeClient = {
    async query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number }> {
      if (
        sql.includes('SELECT item_instance_id')
        && sql.includes('FROM player_equipment_slot')
        && sql.includes('player_id <> $2')
      ) {
        const incomingIds = Array.isArray(params?.[0]) ? params[0] as unknown[] : [];
        const rows: Array<{ item_instance_id: string }> = [];
        if (incomingIds.includes(conflictedInstanceId)) {
          rows.push({ item_instance_id: conflictedInstanceId });
        }
        if (raceConflictVisible && incomingIds.includes(raceConflictInstanceId)) {
          rows.push({ item_instance_id: raceConflictInstanceId });
        }
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('INSERT INTO player_equipment_slot') && Array.isArray(params) && typeof params[1] === 'string') {
        equipmentInsertPayloads.push(JSON.parse(params[1]) as unknown[]);
      }
      if (
        sql.includes('SELECT item_instance_id')
        && sql.includes('FROM player_equipment_slot')
        && !sql.includes('player_id <> $2')
      ) {
        const persistedIds = Array.isArray(params?.[1]) ? params[1] as unknown[] : [];
        equipmentPersistCountChecks += 1;
        if (equipmentPersistCountChecks === 1 && persistedIds.includes(raceConflictInstanceId)) {
          raceConflictVisible = true;
          const rows = persistedIds
            .filter((itemInstanceId) => itemInstanceId !== raceConflictInstanceId)
            .map((item_instance_id) => ({ item_instance_id }));
          return { rows, rowCount: rows.length };
        }
        const rows = persistedIds.map((item_instance_id) => ({ item_instance_id }));
        return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {
      return undefined;
    },
  };
  const service = new PlayerDomainPersistenceService(null, null);
  Object.assign(service as unknown as { pool: unknown; enabled: boolean }, {
    pool: {
      async connect() {
        return fakeClient;
      },
    },
    enabled: true,
  });

  const legacySlot = {
    slot: 'weapon' as const,
    itemInstanceId: 'equip:other-player:weapon',
    item: {
      itemId: 'weapon.legacy_instance',
      count: 1,
      itemInstanceId: 'equip:other-player:weapon',
    },
  };
  const conflictedSlot = {
    slot: 'body' as const,
    itemInstanceId: conflictedInstanceId,
    item: {
      itemId: 'armor.conflicted_instance',
      count: 1,
      itemInstanceId: conflictedInstanceId,
    },
  };
  const raceSlot = {
    slot: 'head' as const,
    itemInstanceId: raceConflictInstanceId,
    item: {
      itemId: 'helm.race_conflicted_instance',
      count: 1,
      itemInstanceId: raceConflictInstanceId,
    },
  };

  await service.savePlayerEquipmentSlots(
    'player:equipment-instance-repair',
    [legacySlot, conflictedSlot, raceSlot],
    { versionSeed: 1 },
  );

  const rows = equipmentInsertPayloads[equipmentInsertPayloads.length - 1] as Array<Record<string, unknown>> | undefined;
  const weaponRow = rows?.find((row) => row.slot_type === 'weapon');
  const bodyRow = rows?.find((row) => row.slot_type === 'body');
  const headRow = rows?.find((row) => row.slot_type === 'head');
  const weaponInstanceId = typeof weaponRow?.item_instance_id === 'string' ? weaponRow.item_instance_id : '';
  const bodyInstanceId = typeof bodyRow?.item_instance_id === 'string' ? bodyRow.item_instance_id : '';
  const headInstanceId = typeof headRow?.item_instance_id === 'string' ? headRow.item_instance_id : '';
  if (
    !weaponInstanceId
    || isLegacyItemInstanceId(weaponInstanceId)
    || weaponInstanceId === 'equip:other-player:weapon'
    || legacySlot.itemInstanceId !== weaponInstanceId
    || legacySlot.item.itemInstanceId !== weaponInstanceId
  ) {
    throw new Error(`legacy equipment itemInstanceId was not repaired before persistence: ${JSON.stringify(rows)}`);
  }
  if (
    !bodyInstanceId
    || isLegacyItemInstanceId(bodyInstanceId)
    || bodyInstanceId === conflictedInstanceId
    || conflictedSlot.itemInstanceId !== bodyInstanceId
    || conflictedSlot.item.itemInstanceId !== bodyInstanceId
  ) {
    throw new Error(`out-of-scope equipment itemInstanceId conflict was not repaired: ${JSON.stringify(rows)}`);
  }
  if (
    equipmentPersistCountChecks < 2
    || !headInstanceId
    || isLegacyItemInstanceId(headInstanceId)
    || headInstanceId === raceConflictInstanceId
    || raceSlot.itemInstanceId !== headInstanceId
    || raceSlot.item.itemInstanceId !== headInstanceId
  ) {
    throw new Error(`racing equipment itemInstanceId conflict was not repaired after write guard mismatch: ${JSON.stringify(rows)}`);
  }
}

async function assertEmptyCollectionSnapshotsDoNotIssueDeletes(): Promise<void> {
  const queries: string[] = [];
  const fakeClient = {
    async query(sql: string): Promise<{ rows: unknown[]; rowCount: number }> {
      queries.push(sql);
      return { rows: [], rowCount: 0 };
    },
    release() {
      return undefined;
    },
  };
  const service = new PlayerDomainPersistenceService(null, null);
  Object.assign(service as unknown as { pool: unknown; enabled: boolean }, {
    pool: {
      async connect() {
        return fakeClient;
      },
    },
    enabled: true,
  });

  await service.savePlayerWallet('player:empty-wallet', [], { versionSeed: 1 });
  await service.savePlayerMarketStorageItems('player:empty-market', [], { versionSeed: 1 });
  await service.savePlayerEquipmentSlots('player:empty-equipment', [], { versionSeed: 1 });

  if (queries.some((sql) => sql.includes('DELETE FROM player_wallet') || sql.includes('DELETE FROM player_market_storage_item') || sql.includes('DELETE FROM player_equipment_slot'))) {
    throw new Error(`empty collection writes should not emit destructive deletes: ${queries.join('\n---\n')}`);
  }
}

async function assertExplicitEmptyWalletProjectionUsesDedicatedClear(): Promise<void> {
  const explicitEmptySnapshot = buildSnapshot(1);
  explicitEmptySnapshot.wallet = { balances: [] };
  const explicitClearPlan = await buildPlayerSnapshotProjectionWritePlan(
    'player:explicit-empty-wallet',
    explicitEmptySnapshot,
    ['wallet'],
    { allowWalletEmptyOverwrite: true },
  );
  const explicitClearDeletes = explicitClearPlan.steps.filter((step) =>
    step.sql.includes('DELETE FROM player_wallet WHERE player_id = $1'),
  );
  if (explicitClearDeletes.length !== 1) {
    throw new Error(`explicit empty wallet projection missing dedicated clear: ${JSON.stringify(explicitClearPlan.steps)}`);
  }

  const guardedEmptyPlan = await buildPlayerSnapshotProjectionWritePlan(
    'player:guarded-empty-wallet',
    explicitEmptySnapshot,
    ['wallet'],
  );
  if (guardedEmptyPlan.steps.some((step) => step.sql.includes('DELETE FROM player_wallet WHERE player_id = $1'))) {
    throw new Error(`unapproved empty wallet projection emitted clear: ${JSON.stringify(guardedEmptyPlan.steps)}`);
  }
  if (!guardedEmptyPlan.steps.some((step) =>
    step.sql.includes('SELECT 1 AS exists') && step.sql.includes('player_wallet'),
  )) {
    throw new Error(`unapproved empty wallet projection bypassed guard: ${JSON.stringify(guardedEmptyPlan.steps)}`);
  }

  const missingWalletSnapshot = buildSnapshot(2);
  delete missingWalletSnapshot.wallet;
  const missingWalletPlan = await buildPlayerSnapshotProjectionWritePlan(
    'player:missing-wallet',
    missingWalletSnapshot,
    ['wallet'],
    { allowWalletEmptyOverwrite: true },
  );
  if (missingWalletPlan.steps.some((step) => step.sql.includes('DELETE FROM player_wallet WHERE player_id = $1'))) {
    throw new Error(`missing wallet payload emitted clear: ${JSON.stringify(missingWalletPlan.steps)}`);
  }
  if (!missingWalletPlan.steps.some((step) =>
    step.sql.includes('SELECT 1 AS exists') && step.sql.includes('player_wallet'),
  )) {
    throw new Error(`missing wallet payload bypassed guard: ${JSON.stringify(missingWalletPlan.steps)}`);
  }
}

async function assertAutoPreferenceEmptyOverwriteIsAllowed(): Promise<void> {
  const queries: string[] = [];
  const fakeClient = {
    async query(sql: string): Promise<{ rows: unknown[]; rowCount: number }> {
      queries.push(sql);
      if (
        sql.includes('SELECT 1 AS exists')
        && (sql.includes('player_auto_battle_skill') || sql.includes('player_auto_use_item_rule'))
      ) {
        return { rows: [{ exists: 1 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {
      return undefined;
    },
  };
  const service = new PlayerDomainPersistenceService(null, null);
  Object.assign(service as unknown as { pool: unknown; enabled: boolean }, {
    pool: {
      async connect() {
        return fakeClient;
      },
    },
    enabled: true,
  });

  await service.savePlayerAutoBattleSkills('player:auto-pref-empty', [], { versionSeed: 1 });
  await service.savePlayerAutoUseItemRules('player:auto-pref-empty', [], { versionSeed: 2 });

  const normalizedQueries = queries.map((query) => query.replace(/\s+/g, ' ').trim());
  for (const tableName of ['player_auto_battle_skill', 'player_auto_use_item_rule']) {
    if (normalizedQueries.some((query) => query.includes(`SELECT 1 AS exists FROM ${tableName}`))) {
      throw new Error(`auto preference empty overwrite should bypass asset empty-overwrite guard: ${tableName}`);
    }
    const hasStaleKeyDelete = normalizedQueries.some((query) => query.includes(`DELETE FROM ${tableName} target`)
      && query.includes('jsonb_to_recordset')
      && query.includes('NOT EXISTS'));
    if (!hasStaleKeyDelete) {
      throw new Error(`auto preference empty overwrite missing stale-key delete: ${tableName}`);
    }
  }
}

async function assertLogbookAcknowledgementCanClearPendingRows(): Promise<void> {
  const queries: string[] = [];
  const fakeClient = {
    async query(sql: string): Promise<{ rows: unknown[]; rowCount: number }> {
      queries.push(sql);
      if (sql.includes('SELECT 1 AS exists') && sql.includes('player_logbook_message')) {
        return { rows: [{ exists: 1 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {
      return undefined;
    },
  };
  const service = new PlayerDomainPersistenceService(null, null);
  Object.assign(service as unknown as { pool: unknown; enabled: boolean }, {
    pool: {
      async connect() {
        return fakeClient;
      },
    },
    enabled: true,
  });

  await service.savePlayerLogbookMessages('player:logbook-ack-empty', [], { versionSeed: 1 });

  const explicitEmptyQueries = queries.map((query) => query.replace(/\s+/g, ' ').trim());
  if (explicitEmptyQueries.some((query) => query.includes('SELECT 1 AS exists FROM player_logbook_message'))) {
    throw new Error('日志 ACK 后的显式空队列不应触发资产域空覆盖保护');
  }
  const hasStaleKeyDelete = explicitEmptyQueries.some((query) => query.includes('DELETE FROM player_logbook_message target')
    && query.includes('jsonb_to_recordset')
    && query.includes('NOT EXISTS'));
  if (!hasStaleKeyDelete) {
    throw new Error('日志 ACK 后的显式空队列缺少 stale-key DELETE');
  }

  let invalidRowsRejected = false;
  try {
    await service.savePlayerLogbookMessages(
      'player:logbook-invalid-empty',
      [{ id: '', kind: 'system', text: '' }],
      { versionSeed: 2 },
    );
  } catch (error) {
    invalidRowsRejected = error instanceof Error
      && error.message.includes('replace_logbook_message_refused_empty_overwrite');
  }
  if (!invalidRowsRejected) {
    throw new Error('非空但无效的日志载荷不得被当作显式空队列清空旧数据');
  }
}

async function assertAssetDomainInvalidEntriesRefuseSilentPrune(): Promise<void> {
  const fakeClient = {
    async query(sql: string): Promise<{ rows: unknown[]; rowCount: number }> {
      if (
        sql.includes('SELECT item_instance_id')
        && sql.includes('FROM player_equipment_slot')
        && !sql.includes('player_id <> $2')
      ) {
        return { rows: [{ item_instance_id: 'fake-equipment-instance' }], rowCount: 1 };
      }
      const isCheckedInsert = sql.includes('INSERT INTO player_inventory_item')
        || sql.includes('INSERT INTO player_market_storage_item')
        || sql.includes('INSERT INTO player_equipment_slot')
        || sql.includes('INSERT INTO player_enhancement_record')
        || sql.includes('INSERT INTO player_logbook_message');
      return { rows: [], rowCount: isCheckedInsert ? 1 : 0 };
    },
    release() {
      return undefined;
    },
  };
  const service = new PlayerDomainPersistenceService(null, null);
  Object.assign(service as unknown as { pool: unknown; enabled: boolean }, {
    pool: {
      async connect() {
        return fakeClient;
      },
    },
    enabled: true,
  });

  const cases: Array<{ name: string; run: () => Promise<void>; expected: string }> = [
    {
      name: 'wallet',
      run: () => service.savePlayerWallet(
        'player:invalid-wallet',
        [{ walletType: '', balance: 1 } as never],
        { versionSeed: 1 },
      ),
      expected: 'replacePlayerWalletRows: 非法 wallet entry',
    },
    {
      name: 'market_storage',
      run: () => service.savePlayerMarketStorageItems(
        'player:invalid-market-storage',
        [{ itemId: '', count: 1, slotIndex: 0 } as never],
        { versionSeed: 1 },
      ),
      expected: 'replacePlayerMarketStorageItems: 非法 market_storage entry',
    },
    {
      name: 'market_storage_duplicate_slot',
      run: () => service.savePlayerMarketStorageItems(
        'player:duplicate-market-storage-slot',
        [
          { storageItemId: 'market-storage-duplicate-slot-a', slotIndex: 0, itemId: 'ore_a', count: 1 },
          { storageItemId: 'market-storage-duplicate-slot-b', slotIndex: 0, itemId: 'ore_b', count: 1 },
        ] as never,
        { versionSeed: 1 },
      ),
      expected: 'replacePlayerMarketStorageItems: duplicate slot_index with conflicting payload',
    },
    {
      name: 'market_storage_negative_slot',
      run: () => service.savePlayerMarketStorageItems(
        'player:negative-market-storage-slot',
        [
          { slotIndex: -1, itemId: 'ore_a', count: 1 },
        ] as never,
        { versionSeed: 1 },
      ),
      expected: 'replacePlayerMarketStorageItems: invalid slot_index',
    },
    {
      name: 'equipment_slot',
      run: () => service.savePlayerEquipmentSlots(
        'player:invalid-equipment-slot',
        [{ slot: 'unknown_slot', item: null } as never],
        { versionSeed: 1 },
      ),
      expected: 'replacePlayerEquipmentSlots: 非法 equipment slot',
    },
    {
      name: 'equipment_item',
      run: () => service.savePlayerEquipmentSlots(
        'player:invalid-equipment-item',
        [{ slot: 'weapon', item: { count: 1 } } as never],
        { versionSeed: 1 },
      ),
      expected: 'replacePlayerEquipmentSlots: 非法 equipment item',
    },
    {
      name: 'equipment_duplicate_slot',
      run: () => service.savePlayerEquipmentSlots(
        'player:duplicate-equipment-slot',
        [
          { slot: 'weapon', itemInstanceId: 'equip-duplicate-slot-a', item: { itemId: 'weapon.a', count: 1 } },
          { slot: 'weapon', itemInstanceId: 'equip-duplicate-slot-b', item: { itemId: 'weapon.b', count: 1 } },
        ] as never,
        { versionSeed: 1 },
      ),
      expected: 'replacePlayerEquipmentSlots: duplicate slot with conflicting payload',
    },
    {
      name: 'equipment_duplicate_item_instance',
      run: () => service.savePlayerEquipmentSlots(
        'player:duplicate-equipment-instance',
        [
          { slot: 'weapon', itemInstanceId: 'equip-duplicate-instance', item: { itemId: 'weapon.a', count: 1 } },
          { slot: 'body', itemInstanceId: 'equip-duplicate-instance', item: { itemId: 'armor.a', count: 1 } },
        ] as never,
        { versionSeed: 1 },
      ),
      expected: 'replacePlayerEquipmentSlots: duplicate item_instance_id with conflicting slot',
    },
  ];

  for (const testCase of cases) {
    let rejected = false;
    try {
      await testCase.run();
    } catch (error) {
      rejected = error instanceof Error && error.message.includes(testCase.expected);
    }
    if (!rejected) {
      throw new Error(`expected invalid ${testCase.name} entry to reject before stale cleanup`);
    }
  }
}
