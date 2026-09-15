/**
 * durable-operation.persistence.ts
 *
 * 从 durable-operation.sql.ts 拆出的持久化写入函数。
 * 包含：背包/装备/市场仓储/活跃任务/强化/职业/任务进度持久化、
 * replay 规范化、市场结算 SQL helper、资产审计日志 helper、钱包写入、租约/围栏等。
 * 不包含 @Injectable provider，不修改持久化语义。
 */
import {
  calculateTimeChamberActivationCost,
  createItemStackSignature,
  EQUIP_SLOTS,
  isLegacyItemInstanceId,
  requiresTimeChamberActivation,
  resolveTimeChamberCapacityLimit,
  TIME_CHAMBER_MAX_USAGE_HOURS,
  TIME_CHAMBER_MIN_USAGE_HOURS,
} from '@mud/shared';
import { createHash } from 'node:crypto';
import {
  assignStableItemInstanceId,
  upsertEquipmentSlotRowsWithItemInstanceIdRepair,
  type EquipmentSlotPersistenceRow,
  type ItemInstanceIdPersistenceRowSource,
} from './compat/item-instance-id-compat';
import { assertInstanceLeaseWriteFence } from './instance-lease-write-fence';
import {
  buildPersistedEquipmentItemRawPayload,
  buildPersistedInventoryItemRawPayload,
} from './inventory-item-persistence';
import { resolveNodeId } from '../config/node-runtime-config';
import type {
  ActiveJobCompletionKind,
  DurableActiveJobSnapshot,
  DurableEnhancementRecordSnapshot,
  DurableEquipmentSlotSnapshot,
  DurableInventoryGrantSourceMutation,
  DurableInventoryItemSnapshot,
  DurableMarketExpectedOrderSnapshot,
  DurableMarketMutationInput,
  DurableMarketPlayerMutationSnapshot,
  DurableMarketStorageItemSnapshot,
  DurableProfessionStateSnapshot,
  DurableQuestProgressSnapshot,
  DurableWalletBalanceSnapshot,
  AssetMutationCompactionContext,
} from './durable-operation.service';
import {
  normalizeDurableMineralCrystalSourceMutation,
  persistDurableMineralCrystalSourceMutation,
  type DurableMineralCrystalSourceMutation,
} from './mineral-crystal-durable-persistence';
import {
  normalizeDurableTileResourceSourceMutation,
  persistDurableTileResourceSourceMutation,
  type DurableTileResourceSourceMutation,
} from './tile-resource-durable-persistence';
import {
  normalizeDurableLootSourceMutation,
  persistDurableLootSourceMutation,
  type DurableContainerStateSourceMutation,
  type DurableGroundTileSourceMutation,
} from './loot-source-durable-persistence';
import {
  normalizeDurableActivityAssetSourceMutation,
  persistDurableActivityAssetSourceMutation,
  type DurableActivityAssetSourceMutation,
} from './activity-asset-durable-persistence';
import {
  normalizeDurablePlayerItemUseSourceMutation,
  persistDurablePlayerItemUseSourceMutation,
  type DurablePlayerItemUseSourceMutation,
} from './player-item-use-durable-persistence';
import {
  PLAYER_PRESENCE_TABLE,
  PLAYER_WALLET_TABLE,
  PLAYER_INVENTORY_ITEM_TABLE,
  PLAYER_MARKET_STORAGE_ITEM_TABLE,
  MARKET_ORDER_TABLE,
  MARKET_TRADE_TABLE,
  PLAYER_EQUIPMENT_SLOT_TABLE,
  PLAYER_QUEST_PROGRESS_TABLE,
  PLAYER_ACTIVE_JOB_TABLE,
  PLAYER_TECHNIQUE_ACTIVITY_QUEUE_TABLE,
  PLAYER_ENHANCEMENT_RECORD_TABLE,
  PLAYER_PROFESSION_STATE_TABLE,
  PLAYER_MAIL_TABLE,
  PLAYER_MAIL_ATTACHMENT_TABLE,
  PLAYER_RECOVERY_WATERMARK_TABLE,
  DURABLE_OPERATION_LOG_TABLE,
  OUTBOX_EVENT_TABLE,
  ASSET_AUDIT_LOG_TABLE,
  ASSET_AUDIT_LOG_ARCHIVE_TABLE,
  DURABLE_OPERATION_ID_SAFE_LENGTH,
  HIGH_FREQUENCY_ASSET_AUDIT_CHECKPOINT_INTERVAL,
  DURABLE_OPERATION_COMPACTION_META_KEY,
  durableModuleLogger,
  safeStringifyDurableEntry,
  isSameDurablePayload,
  refuseEmptyOverwriteIfRowsExist,
  assertNoForeignPlayerOwnedIds,
  normalizeRequiredString,
  normalizeDurableJsonObject,
  createPersistedInventoryRowSignature,
  acquireSchemaInitLock,
  PLAYER_AUTH_TABLE,
  type DurableReplaceOptions,
} from './durable-operation.sql';
import { type PlayerTechniqueActivityQueueUpsertInput } from './player-domain-persistence.service';

export async function replacePlayerInventoryItems(
  client: import('pg').PoolClient,
  playerId: string,
  items: DurableInventoryItemSnapshot[],
  options: DurableReplaceOptions = {},
): Promise<void> {
  const sourceItems = Array.isArray(items) ? items : [];
  const rowsByInstanceId = new Map<string, {
    item_instance_id: string;
    slot_index: number;
    item_id: string;
    count: number;
    raw_payload: Record<string, unknown>;
    locked_by: string | null;
  }>();
  let lockedSlotCounter = -1;
  for (let index = 0; index < sourceItems.length; index += 1) {
    const item = sourceItems[index];
    const itemId = normalizeRequiredString(item?.itemId);
    if (!itemId) {
      throw new Error(
        `replacePlayerInventoryItems: invalid inventory entry playerId=${playerId} index=${index} entry=${safeStringifyDurableEntry(item)}`,
      );
    }
    const count = Math.max(1, Math.trunc(Number(item.count ?? 1)));
    const lockedBy = normalizeOptionalString(item?.lockedBy);
    const rawPayload = buildPersistedInventoryItemRawPayload({
      itemId,
      count,
      name: item.name,
      desc: item.desc,
      enhanceLevel: item.enhanceLevel,
      learnTechniqueId: item.learnTechniqueId,
      learnTechniqueMaxLevel: item.learnTechniqueMaxLevel,
      grade: item.grade,
      level: item.level,
      rawPayload: item.rawPayload,
    });
    if (lockedBy != null) {
      const lockedAt = normalizeOptionalInteger(item?.lockedAt)
        ?? normalizeOptionalInteger((item?.rawPayload as { lockedAt?: unknown } | null | undefined)?.lockedAt);
      if (lockedAt != null) {
        rawPayload.lockedAt = lockedAt;
      }
    }
    // 优先取 sourceItem 自带的稳定 instanceId（装备类必须有；非装备类回退到 inv:{playerId}:{index}
    // 让 PG 主键稳定，行为与持久化层保持一致）。
    const sourceItemInstanceId = normalizeRequiredString(item?.itemInstanceId)
      || normalizeRequiredString((item?.rawPayload as { itemInstanceId?: unknown })?.itemInstanceId);
    const itemInstanceId = sourceItemInstanceId && !isLegacyItemInstanceId(sourceItemInstanceId)
      ? sourceItemInstanceId
      : `inv:${playerId}:${index}`;
    if (sourceItemInstanceId && isLegacyItemInstanceId(sourceItemInstanceId)) {
      durableModuleLogger.debug(`durable 背包物品携带 legacy itemInstanceId，走 fallback：playerId=${playerId} index=${index} id=${sourceItemInstanceId}`);
    }
    const row = {
      item_instance_id: itemInstanceId,
      slot_index: lockedBy != null ? lockedSlotCounter-- : index,
      item_id: itemId,
      count,
      raw_payload: rawPayload,
      locked_by: lockedBy,
    };
    const rowSignature = createPersistedInventoryRowSignature(itemId, rawPayload);
    const existingRow = rowsByInstanceId.get(itemInstanceId);
    const existingRowSignature = existingRow
      ? createPersistedInventoryRowSignature(existingRow.item_id, existingRow.raw_payload)
      : null;
    if (existingRow) {
      if (existingRowSignature === rowSignature) {
        existingRow.count += count;
        continue;
      }
      if (
        existingRow.slot_index !== row.slot_index
        || existingRow.item_id !== itemId
        || existingRow.locked_by !== lockedBy
        || existingRowSignature !== rowSignature
      ) {
        throw new Error(
          `replacePlayerInventoryItems: duplicate item_instance_id with conflicting payload playerId=${playerId} itemInstanceId=${itemInstanceId} existingSlot=${existingRow.slot_index} incomingSlot=${index} existingItemId=${existingRow.item_id} incomingItemId=${itemId}`,
        );
      }
      existingRow.count += count;
      continue;
    }
    rowsByInstanceId.set(itemInstanceId, row);
  }
  const rows = Array.from(rowsByInstanceId.values());
  const rowsJson = JSON.stringify(rows);

  if (rows.length > 0) {
    const itemInstanceIds = rows.map(({ item_instance_id }) => item_instance_id);
    await assertNoForeignPlayerOwnedIds(
      client,
      PLAYER_INVENTORY_ITEM_TABLE,
      'item_instance_id',
      playerId,
      itemInstanceIds,
      'inventory',
    );
    await client.query(
      `
        WITH incoming AS (
          SELECT item_instance_id, slot_index
          FROM jsonb_to_recordset($2::jsonb) AS entry(item_instance_id varchar(180), slot_index bigint)
        )
        DELETE FROM ${PLAYER_INVENTORY_ITEM_TABLE} target
        WHERE target.player_id = $1
          AND EXISTS (
            SELECT 1
            FROM incoming
            WHERE incoming.slot_index = target.slot_index
              AND incoming.item_instance_id <> target.item_instance_id
          )
      `,
      [playerId, rowsJson],
    );
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            item_instance_id varchar(180),
            slot_index bigint,
            item_id varchar(120),
            count bigint,
            raw_payload jsonb,
            locked_by varchar(180)
          )
        )
        INSERT INTO ${PLAYER_INVENTORY_ITEM_TABLE}(
          item_instance_id,
          player_id,
          slot_index,
          item_id,
          count,
          raw_payload,
          locked_by,
          updated_at
        )
        SELECT item_instance_id, $1, slot_index, item_id, count, COALESCE(raw_payload, '{}'::jsonb), locked_by, now()
        FROM incoming
        ON CONFLICT (item_instance_id)
        DO UPDATE SET
          player_id = EXCLUDED.player_id,
          slot_index = EXCLUDED.slot_index,
          item_id = EXCLUDED.item_id,
          count = EXCLUDED.count,
          raw_payload = EXCLUDED.raw_payload,
          locked_by = EXCLUDED.locked_by,
          updated_at = now()
        WHERE ${PLAYER_INVENTORY_ITEM_TABLE}.player_id = EXCLUDED.player_id
          AND ROW(
            ${PLAYER_INVENTORY_ITEM_TABLE}.slot_index,
            ${PLAYER_INVENTORY_ITEM_TABLE}.item_id,
            ${PLAYER_INVENTORY_ITEM_TABLE}.count,
            ${PLAYER_INVENTORY_ITEM_TABLE}.raw_payload,
            ${PLAYER_INVENTORY_ITEM_TABLE}.locked_by
          ) IS DISTINCT FROM ROW(
            EXCLUDED.slot_index,
            EXCLUDED.item_id,
            EXCLUDED.count,
            EXCLUDED.raw_payload,
            EXCLUDED.locked_by
          )
      `,
      [playerId, rowsJson],
    );
    // ON CONFLICT 的 owner guard 会拒绝跨玩家更新；提交前再次读取可覆盖并发插入竞态。
    await assertNoForeignPlayerOwnedIds(
      client,
      PLAYER_INVENTORY_ITEM_TABLE,
      'item_instance_id',
      playerId,
      itemInstanceIds,
      'inventory',
    );
  }
  await refuseEmptyOverwriteIfRowsExist(client, PLAYER_INVENTORY_ITEM_TABLE, playerId, rows.length, 'inventory', options);
  await client.query(
    `
      WITH incoming AS (
        SELECT item_instance_id
        FROM jsonb_to_recordset($2::jsonb) AS entry(item_instance_id varchar(180))
      )
      DELETE FROM ${PLAYER_INVENTORY_ITEM_TABLE} target
      WHERE target.player_id = $1
        ${options.replaceLockedItems === true ? '' : 'AND target.locked_by IS NULL'}
        AND NOT EXISTS (
          SELECT 1
          FROM incoming
          WHERE incoming.item_instance_id = target.item_instance_id
        )
    `,
    [playerId, rowsJson],
  );
}

/** 连续强化中间阶只更新已存在的稳定实例行，并按明确 ID 删除消耗完的物品。 */
export async function patchPlayerInventoryItems(
  client: import('pg').PoolClient,
  playerId: string,
  items: DurableInventoryItemSnapshot[],
  removedItemInstanceIds: readonly string[],
): Promise<'stable_update' | 'guarded_fallback'> {
  const rows: Array<{
    item_instance_id: string;
    item_id: string;
    count: number;
    raw_payload: Record<string, unknown>;
    locked_by: string | null;
  }> = [];
  const incomingIds = new Set<string>();
  for (let index = 0; index < (Array.isArray(items) ? items.length : 0); index += 1) {
    const item = items[index];
    const itemId = normalizeRequiredString(item?.itemId);
    const itemInstanceId = normalizeRequiredString(item?.itemInstanceId);
    if (!itemId || !itemInstanceId || isLegacyItemInstanceId(itemInstanceId) || incomingIds.has(itemInstanceId)) {
      throw new Error(
        `patchPlayerInventoryItems: invalid stable inventory entry playerId=${playerId} index=${index} entry=${safeStringifyDurableEntry(item)}`,
      );
    }
    incomingIds.add(itemInstanceId);
    const count = Math.max(1, Math.trunc(Number(item.count ?? 1)));
    const lockedBy = normalizeOptionalString(item?.lockedBy);
    const rawPayload = buildPersistedInventoryItemRawPayload({
      itemId,
      count,
      name: item.name,
      desc: item.desc,
      enhanceLevel: item.enhanceLevel,
      learnTechniqueId: item.learnTechniqueId,
      learnTechniqueMaxLevel: item.learnTechniqueMaxLevel,
      grade: item.grade,
      level: item.level,
      rawPayload: item.rawPayload,
    });
    if (lockedBy != null) {
      const lockedAt = normalizeOptionalInteger(item?.lockedAt)
        ?? normalizeOptionalInteger((item?.rawPayload as { lockedAt?: unknown } | null | undefined)?.lockedAt);
      if (lockedAt != null) {
        rawPayload.lockedAt = lockedAt;
      }
    }
    rows.push({
      item_instance_id: itemInstanceId,
      item_id: itemId,
      count,
      raw_payload: rawPayload,
      locked_by: lockedBy,
    });
  }
  const removedIds = normalizeStringList(removedItemInstanceIds).sort();
  if (removedIds.some((itemInstanceId) => incomingIds.has(itemInstanceId))) {
    throw new Error(`patch_inventory_remove_update_conflict:playerId=${playerId}`);
  }
  if (rows.length === 0 && removedIds.length === 0) {
    return 'guarded_fallback';
  }
  if (rows.length > 0 && removedIds.length === 0) {
    const stableUpdateResult = await client.query(
      `
        UPDATE ${PLAYER_INVENTORY_ITEM_TABLE} target
        SET item_id = incoming.item_id,
            count = incoming.count,
            raw_payload = COALESCE(incoming.raw_payload, '{}'::jsonb),
            locked_by = incoming.locked_by,
            updated_at = now()
        FROM jsonb_to_recordset($2::jsonb) AS incoming(
          item_instance_id varchar(180),
          item_id varchar(120),
          count bigint,
          raw_payload jsonb,
          locked_by varchar(180)
        )
        WHERE target.player_id = $1
          AND target.item_instance_id = incoming.item_instance_id
          AND ROW(target.item_id, target.count, target.raw_payload, target.locked_by)
            IS DISTINCT FROM ROW(incoming.item_id, incoming.count, COALESCE(incoming.raw_payload, '{}'::jsonb), incoming.locked_by)
        RETURNING target.item_instance_id
      `,
      [playerId, JSON.stringify(rows)],
    );
    if ((stableUpdateResult.rowCount ?? 0) === rows.length) {
      return 'stable_update';
    }
    // no-op、缺失行或跨玩家实例必须继续走完整守卫。前面的局部更新仍处于同一事务，
    // 守卫失败时会随事务整体回滚；守卫成功时也不会重复写入已更新的行。
  }
  const result = await client.query<{
    conflicting_id?: unknown;
    conflicting_owner_id?: unknown;
    existing_incoming_count?: unknown;
  }>(
    `
      WITH incoming AS (
        SELECT *
        FROM jsonb_to_recordset($2::jsonb) AS entry(
          item_instance_id varchar(180),
          item_id varchar(120),
          count bigint,
          raw_payload jsonb,
          locked_by varchar(180)
        )
      ),
      guarded_ids AS (
        SELECT item_instance_id FROM incoming
        UNION
        SELECT unnest($3::varchar[])
      ),
      locked_guarded AS MATERIALIZED (
        SELECT target.item_instance_id, target.player_id
        FROM ${PLAYER_INVENTORY_ITEM_TABLE} target
        INNER JOIN guarded_ids guarded USING (item_instance_id)
        ORDER BY target.item_instance_id
        FOR UPDATE OF target
      ),
      guard_state AS MATERIALIZED (
        SELECT
          (
            SELECT item_instance_id
            FROM locked_guarded
            WHERE player_id <> $1
            ORDER BY item_instance_id
            LIMIT 1
          ) AS conflicting_id,
          (
            SELECT player_id
            FROM locked_guarded
            WHERE player_id <> $1
            ORDER BY item_instance_id
            LIMIT 1
          ) AS conflicting_owner_id,
          (
            SELECT count(*)
            FROM locked_guarded locked
            INNER JOIN incoming USING (item_instance_id)
            WHERE locked.player_id = $1
          ) AS existing_incoming_count,
          (SELECT count(*) FROM incoming) AS incoming_count
      ),
      deleted AS (
        DELETE FROM ${PLAYER_INVENTORY_ITEM_TABLE} target
        USING guard_state guard
        WHERE target.player_id = $1
          AND target.item_instance_id = ANY($3::varchar[])
          AND guard.conflicting_id IS NULL
          AND guard.existing_incoming_count = guard.incoming_count
        RETURNING target.item_instance_id
      ),
      updated AS (
        UPDATE ${PLAYER_INVENTORY_ITEM_TABLE} target
        SET item_id = incoming.item_id,
            count = incoming.count,
            raw_payload = COALESCE(incoming.raw_payload, '{}'::jsonb),
            locked_by = incoming.locked_by,
            updated_at = now()
        FROM incoming, guard_state guard
        WHERE target.player_id = $1
          AND target.item_instance_id = incoming.item_instance_id
          AND guard.conflicting_id IS NULL
          AND guard.existing_incoming_count = guard.incoming_count
          AND ROW(target.item_id, target.count, target.raw_payload, target.locked_by)
            IS DISTINCT FROM ROW(incoming.item_id, incoming.count, COALESCE(incoming.raw_payload, '{}'::jsonb), incoming.locked_by)
        RETURNING target.item_instance_id
      )
      SELECT
        guard.conflicting_id,
        guard.conflicting_owner_id,
        guard.existing_incoming_count
      FROM guard_state guard
      CROSS JOIN (SELECT count(*) FROM deleted) deleted_count
      CROSS JOIN (SELECT count(*) FROM updated) updated_count
    `,
    [playerId, JSON.stringify(rows), removedIds],
  );
  const guard = result.rows[0] ?? null;
  const conflictingId = normalizeRequiredString(guard?.conflicting_id);
  if (conflictingId) {
    throw new Error(
      `replace_inventory_ownership_conflict:playerId=${playerId}`
      + ` id=${conflictingId}`
      + ` owner=${normalizeRequiredString(guard?.conflicting_owner_id) || 'unknown'}`,
    );
  }
  if (Number(guard?.existing_incoming_count ?? 0) !== rows.length) {
    throw new Error(`patch_inventory_missing_item:playerId=${playerId}`);
  }
  return 'guarded_fallback';
}

// createPersistedInventoryRowSignature moved to durable-operation.sql

export async function replacePlayerMarketStorageItems(
  client: import('pg').PoolClient,
  playerId: string,
  items: readonly DurableMarketStorageItemSnapshot[],
  options: DurableReplaceOptions = {},
): Promise<void> {
  type MarketStoragePersistenceRow = {
    storage_item_id: string;
    slot_index: number;
    item_id: string;
    count: number;
    enhance_level: number | null;
    raw_payload: Record<string, unknown>;
  };
  const rowsByStorageItemId = new Map<string, MarketStoragePersistenceRow>();
  const rowsBySlotIndex = new Map<number, MarketStoragePersistenceRow>();
  for (let index = 0; index < (Array.isArray(items) ? items.length : 0); index += 1) {
    const entry = items[index];
    const itemId = normalizeRequiredString(entry?.itemId);
    if (!itemId) {
      throw new Error(
        `replacePlayerMarketStorageItems: invalid market storage entry playerId=${playerId} index=${index} entry=${safeStringifyDurableEntry(entry)}`,
      );
    }
    const slotIndex = normalizeOptionalInteger(entry?.slotIndex) ?? index;
    if (slotIndex < 0) {
      throw new Error(`replacePlayerMarketStorageItems: invalid slot_index playerId=${playerId} slotIndex=${slotIndex}`);
    }
    const storageItemId = `market_storage:${playerId}:${slotIndex}`;
    const count = Math.max(1, Math.trunc(Number(entry?.count ?? 1)));
    const enhanceLevel = normalizeOptionalInteger(entry?.enhanceLevel);
    const rawPayload =
      entry?.rawPayload && typeof entry.rawPayload === 'object'
        ? entry.rawPayload
        : {
        itemId,
        count,
        ...(enhanceLevel == null ? {} : { enhanceLevel }),
      };
    const row = {
      storage_item_id: storageItemId,
      slot_index: slotIndex,
      item_id: itemId,
      count,
      enhance_level: enhanceLevel,
      raw_payload: {
        ...(rawPayload as Record<string, unknown>),
        itemId,
        count,
        ...(enhanceLevel == null ? {} : { enhanceLevel }),
      },
    };
    const existingSlotRow = rowsBySlotIndex.get(slotIndex);
    if (existingSlotRow) {
      if (
        existingSlotRow.storage_item_id !== storageItemId
        || existingSlotRow.item_id !== itemId
        || existingSlotRow.count !== count
        || existingSlotRow.enhance_level !== enhanceLevel
        || !isSameDurablePayload(existingSlotRow.raw_payload, row.raw_payload)
      ) {
        throw new Error(
          `replacePlayerMarketStorageItems: duplicate slot_index with conflicting payload playerId=${playerId} slotIndex=${slotIndex}`,
        );
      }
      continue;
    }
    const existingStorageRow = rowsByStorageItemId.get(storageItemId);
    if (existingStorageRow) {
      throw new Error(
        `replacePlayerMarketStorageItems: duplicate storage_item_id with conflicting slot playerId=${playerId} storageItemId=${storageItemId} slots=${existingStorageRow.slot_index},${slotIndex}`,
      );
    }
    rowsBySlotIndex.set(slotIndex, row);
    rowsByStorageItemId.set(storageItemId, row);
  }
  const rows = Array.from(rowsBySlotIndex.values());
  const rowsJson = JSON.stringify(rows);

  if (rows.length > 0) {
    const result = await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            storage_item_id varchar(180),
            slot_index bigint,
            item_id varchar(120),
            count bigint,
            enhance_level bigint,
            raw_payload jsonb
          )
        )
        INSERT INTO ${PLAYER_MARKET_STORAGE_ITEM_TABLE}(
          storage_item_id,
          player_id,
          slot_index,
          item_id,
          count,
          enhance_level,
          raw_payload,
          updated_at
        )
        SELECT storage_item_id, $1, slot_index, item_id, count, enhance_level, COALESCE(raw_payload, '{}'::jsonb), now()
        FROM incoming
        ON CONFLICT (storage_item_id)
        DO UPDATE SET
          player_id = EXCLUDED.player_id,
          slot_index = EXCLUDED.slot_index,
          item_id = EXCLUDED.item_id,
          count = EXCLUDED.count,
          enhance_level = EXCLUDED.enhance_level,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = now()
        WHERE ${PLAYER_MARKET_STORAGE_ITEM_TABLE}.player_id = EXCLUDED.player_id
      `,
      [playerId, rowsJson],
    );
    if (((result as { rowCount?: number }).rowCount ?? 0) !== rows.length) {
      throw new Error(`replacePlayerMarketStorageItems: storage_item_id conflict outside player scope playerId=${playerId}`);
    }
  }
  await refuseEmptyOverwriteIfRowsExist(client, PLAYER_MARKET_STORAGE_ITEM_TABLE, playerId, rows.length, 'market_storage', options);
  await client.query(
    `
      WITH incoming AS (
        SELECT slot_index
        FROM jsonb_to_recordset($2::jsonb) AS entry(slot_index bigint)
      )
      DELETE FROM ${PLAYER_MARKET_STORAGE_ITEM_TABLE} target
      WHERE target.player_id = $1
        AND NOT EXISTS (
          SELECT 1
          FROM incoming
          WHERE incoming.slot_index = target.slot_index
        )
    `,
    [playerId, rowsJson],
  );
}

export async function replacePlayerEquipmentSlots(
  client: import('pg').PoolClient,
  playerId: string,
  slots: readonly DurableEquipmentSlotSnapshot[],
  options: DurableReplaceOptions = {},
): Promise<void> {
  const rowsBySlotType = new Map<string, EquipmentSlotPersistenceRow>();
  const rowsByInstanceId = new Map<string, EquipmentSlotPersistenceRow>();
  const rowSources = new Map<EquipmentSlotPersistenceRow, ItemInstanceIdPersistenceRowSource>();
  for (const slotEntry of Array.isArray(slots) ? slots : []) {
    const slotType = normalizeRequiredString(slotEntry?.slot);
    if (!EQUIP_SLOTS.includes(slotType as (typeof EQUIP_SLOTS)[number])) {
      throw new Error(
        `replacePlayerEquipmentSlots: invalid equipment slot playerId=${playerId} slot=${slotType || 'null'} entry=${safeStringifyDurableEntry(slotEntry)}`,
      );
    }
    const item = slotEntry?.item && typeof slotEntry.item === 'object'
      ? slotEntry.item as Record<string, unknown>
      : null;
    if (!item) {
      continue;
    }
    const itemId = normalizeRequiredString(item?.itemId);
    if (!itemId) {
      throw new Error(
        `replacePlayerEquipmentSlots: invalid equipment item playerId=${playerId} slot=${slotType} entry=${safeStringifyDurableEntry(slotEntry)}`,
      );
    }
    const itemInstanceId = assignStableItemInstanceId(
      normalizeOptionalString((slotEntry as Record<string, unknown> | null)?.itemInstanceId) || normalizeOptionalString(item?.itemInstanceId),
      {
        entry: slotEntry && typeof slotEntry === 'object' ? slotEntry as Record<string, unknown> : null,
        item,
      },
    );
    const rawPayload = buildPersistedEquipmentItemRawPayload({
      itemId,
      slot: slotType,
      enhanceLevel: item?.enhanceLevel,
      rawPayload: item,
    });
    const row = {
      slot_type: slotType,
      item_instance_id: itemInstanceId,
      item_id: itemId,
      raw_payload: rawPayload,
    };
    const existingSlotRow = rowsBySlotType.get(slotType);
    if (existingSlotRow) {
      if (
        existingSlotRow.item_instance_id !== itemInstanceId
        || existingSlotRow.item_id !== itemId
        || !isSameDurablePayload(existingSlotRow.raw_payload, rawPayload)
      ) {
        throw new Error(
          `replacePlayerEquipmentSlots: duplicate slot with conflicting payload playerId=${playerId} slot=${slotType}`,
        );
      }
      continue;
    }
    const existingInstanceRow = rowsByInstanceId.get(itemInstanceId);
    if (existingInstanceRow) {
      throw new Error(
        `replacePlayerEquipmentSlots: duplicate item_instance_id with conflicting slot playerId=${playerId} itemInstanceId=${itemInstanceId} slots=${existingInstanceRow.slot_type},${slotType}`,
      );
    }
    rowsBySlotType.set(slotType, row);
    rowsByInstanceId.set(itemInstanceId, row);
    rowSources.set(row, {
      entry: slotEntry && typeof slotEntry === 'object' ? slotEntry as Record<string, unknown> : null,
      item,
    });
  }
  const rows = Array.from(rowsBySlotType.values());

  const persistedRows = await client.query<{
    slot_type?: unknown;
    item_instance_id?: unknown;
    item_id?: unknown;
    raw_payload?: unknown;
  }>(
    `
      SELECT slot_type, item_instance_id, item_id, raw_payload
      FROM ${PLAYER_EQUIPMENT_SLOT_TABLE}
      WHERE player_id = $1
      FOR UPDATE
    `,
    [playerId],
  );
  const persistedBySlot = new Map(
    persistedRows.rows.map((persisted) => [normalizeRequiredString(persisted.slot_type), persisted]),
  );
  const changedRows = rows.filter((row) => {
    const persisted = persistedBySlot.get(row.slot_type);
    const persistedPayload = persisted?.raw_payload && typeof persisted.raw_payload === 'object'
      ? persisted.raw_payload as Record<string, unknown>
      : {};
    return !persisted
      || normalizeRequiredString(persisted.item_instance_id) !== row.item_instance_id
      || normalizeRequiredString(persisted.item_id) !== row.item_id
      || !isSameDurablePayload(persistedPayload, row.raw_payload);
  });
  if (changedRows.length > 0) {
    const changedRowSources = new Map<EquipmentSlotPersistenceRow, ItemInstanceIdPersistenceRowSource>();
    for (const row of changedRows) {
      const source = rowSources.get(row);
      if (source) {
        changedRowSources.set(row, source);
      }
    }
    await upsertEquipmentSlotRowsWithItemInstanceIdRepair(client, playerId, changedRows, changedRowSources);
  }
  await refuseEmptyOverwriteIfRowsExist(client, PLAYER_EQUIPMENT_SLOT_TABLE, playerId, rows.length, 'equipment', options);
  await client.query(
    `
      WITH incoming AS (
        SELECT slot_type
        FROM jsonb_to_recordset($2::jsonb) AS entry(slot_type varchar(40))
      )
      DELETE FROM ${PLAYER_EQUIPMENT_SLOT_TABLE} target
      WHERE target.player_id = $1
        AND NOT EXISTS (
          SELECT 1
          FROM incoming
          WHERE incoming.slot_type = target.slot_type
        )
    `,
    [playerId, JSON.stringify(rows.map(({ slot_type }) => ({ slot_type })))],
  );
}

export async function assertPlayerTechniqueActivityQueueHead(
  client: import('pg').PoolClient,
  playerId: string,
  expectedQueueHeadId: string,
): Promise<void> {
  const result = await client.query<{ queue_id?: unknown }>(
    `
      SELECT queue_id
      FROM ${PLAYER_TECHNIQUE_ACTIVITY_QUEUE_TABLE}
      WHERE player_id = $1
      ORDER BY queue_order ASC, created_at ASC, queue_id ASC
      LIMIT 1
      FOR UPDATE
    `,
    [playerId],
  );
  const persistedQueueHeadId = normalizeRequiredString(result.rows[0]?.queue_id);
  if (persistedQueueHeadId !== expectedQueueHeadId) {
    throw new Error(
      [
        'player_technique_activity_queue_cas_conflict',
        `expectedQueueHeadId=${expectedQueueHeadId}`,
        `persistedQueueHeadId=${persistedQueueHeadId || 'null'}`,
      ].join(':'),
    );
  }
}

export async function replacePlayerTechniqueActivityQueue(
  client: import('pg').PoolClient,
  playerId: string,
  rows: readonly PlayerTechniqueActivityQueueUpsertInput[],
): Promise<void> {
  const normalizedRows = normalizeTechniqueActivityQueueSnapshots(rows).map((row, index) => ({
    queue_id: row.queueId,
    kind: row.kind,
    state: row.state,
    label: row.label,
    target_label: row.targetLabel,
    sleep_reason: row.sleepReason,
    retry_after_ticks: row.retryAfterTicks,
    created_at: row.createdAt,
    queue_order: index,
    payload_jsonb: row.payloadJson,
    cancel_ref_jsonb: row.cancelRefJson,
    detail_jsonb: row.detailJson,
  }));

  if (normalizedRows.length > 0) {
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            queue_id varchar(180),
            kind varchar(32),
            state varchar(32),
            label varchar(160),
            target_label varchar(160),
            sleep_reason varchar(240),
            retry_after_ticks bigint,
            created_at bigint,
            queue_order bigint,
            payload_jsonb jsonb,
            cancel_ref_jsonb jsonb,
            detail_jsonb jsonb
          )
        )
        INSERT INTO ${PLAYER_TECHNIQUE_ACTIVITY_QUEUE_TABLE}(
          player_id,
          queue_id,
          kind,
          state,
          label,
          target_label,
          sleep_reason,
          retry_after_ticks,
          created_at,
          queue_order,
          payload_jsonb,
          cancel_ref_jsonb,
          detail_jsonb,
          updated_at
        )
        SELECT
          $1,
          queue_id,
          kind,
          state,
          label,
          target_label,
          sleep_reason,
          retry_after_ticks,
          created_at,
          queue_order,
          COALESCE(payload_jsonb, '{}'::jsonb),
          COALESCE(cancel_ref_jsonb, '{}'::jsonb),
          COALESCE(detail_jsonb, '{}'::jsonb),
          now()
        FROM incoming
        ON CONFLICT (player_id, queue_id)
        DO UPDATE SET
          kind = EXCLUDED.kind,
          state = EXCLUDED.state,
          label = EXCLUDED.label,
          target_label = EXCLUDED.target_label,
          sleep_reason = EXCLUDED.sleep_reason,
          retry_after_ticks = EXCLUDED.retry_after_ticks,
          created_at = EXCLUDED.created_at,
          queue_order = EXCLUDED.queue_order,
          payload_jsonb = EXCLUDED.payload_jsonb,
          cancel_ref_jsonb = EXCLUDED.cancel_ref_jsonb,
          detail_jsonb = EXCLUDED.detail_jsonb,
          updated_at = now()
      `,
      [playerId, JSON.stringify(normalizedRows)],
    );
  }

  await client.query(
    `
      WITH incoming AS (
        SELECT queue_id
        FROM jsonb_to_recordset($2::jsonb) AS entry(queue_id varchar(180))
      )
      DELETE FROM ${PLAYER_TECHNIQUE_ACTIVITY_QUEUE_TABLE} target
      WHERE target.player_id = $1
        AND NOT EXISTS (
          SELECT 1
          FROM incoming
          WHERE incoming.queue_id = target.queue_id
        )
    `,
    [playerId, JSON.stringify(normalizedRows.map(({ queue_id }) => ({ queue_id })))],
  );
}

export async function replacePlayerActiveJob(
  client: import('pg').PoolClient,
  playerId: string,
  row: DurableActiveJobSnapshot | null,
): Promise<void> {
  if (!row) {
    await client.query(`DELETE FROM ${PLAYER_ACTIVE_JOB_TABLE} WHERE player_id = $1`, [playerId]);
    return;
  }

  await client.query(
    `
      INSERT INTO ${PLAYER_ACTIVE_JOB_TABLE}(
        player_id,
        job_run_id,
        job_type,
        status,
        phase,
        started_at,
        finished_at,
        paused_ticks,
        total_ticks,
        remaining_ticks,
        success_rate,
        speed_rate,
        job_version,
        detail_jsonb,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        job_run_id = EXCLUDED.job_run_id,
        job_type = EXCLUDED.job_type,
        status = EXCLUDED.status,
        phase = EXCLUDED.phase,
        started_at = EXCLUDED.started_at,
        finished_at = EXCLUDED.finished_at,
        paused_ticks = EXCLUDED.paused_ticks,
        total_ticks = EXCLUDED.total_ticks,
        remaining_ticks = EXCLUDED.remaining_ticks,
        success_rate = EXCLUDED.success_rate,
        speed_rate = EXCLUDED.speed_rate,
        job_version = EXCLUDED.job_version,
        detail_jsonb = EXCLUDED.detail_jsonb,
        updated_at = now()
    `,
    [
      playerId,
      row.jobRunId,
      row.jobType,
      row.status,
      row.phase,
      row.startedAt,
      row.finishedAt ?? null,
      row.pausedTicks ?? 0,
      row.totalTicks ?? 0,
      row.remainingTicks ?? 0,
      row.successRate ?? 0,
      row.speedRate ?? 1,
      row.jobVersion,
      JSON.stringify(row.detailJson ?? {
        jobRunId: row.jobRunId,
        jobVersion: row.jobVersion,
        jobType: row.jobType,
        status: row.status,
        phase: row.phase,
      }),
    ],
  );
}

export async function replacePlayerEnhancementRecords(
  client: import('pg').PoolClient,
  playerId: string,
  rows: readonly DurableEnhancementRecordSnapshot[],
  options: { deleteMissing?: boolean } = {},
): Promise<void> {
  const normalizedRows: Array<{
    record_id: string;
    item_id: string;
    item_name: string | null;
    highest_level: number;
    levels_payload: unknown[];
    action_started_at: number | null;
    action_ended_at: number | null;
    start_level: number | null;
    initial_target_level: number | null;
    desired_target_level: number | null;
    protection_start_level: number | null;
    status: string | null;
  }> = [];
  for (let index = 0; index < (Array.isArray(rows) ? rows.length : 0); index += 1) {
    const row = rows[index];
    const itemId = normalizeRequiredString(row?.itemId);
    if (!itemId) {
      continue;
    }
    const recordId =
      normalizeRequiredString(row?.recordId)
      || `enhancement_record:${playerId}:${itemId}:${index}`;
    normalizedRows.push({
      record_id: recordId,
      item_id: itemId,
      item_name: normalizePersistedEnhancementItemName(itemId, row?.itemName),
      highest_level: Math.max(0, Math.trunc(Number(row?.highestLevel ?? 0))),
      levels_payload: Array.isArray(row?.levels) ? row.levels : [],
      action_started_at: normalizeOptionalInteger(row?.actionStartedAt),
      action_ended_at: normalizeOptionalInteger(row?.actionEndedAt),
      start_level: normalizeOptionalInteger(row?.startLevel),
      initial_target_level: normalizeOptionalInteger(row?.initialTargetLevel),
      desired_target_level: normalizeOptionalInteger(row?.desiredTargetLevel),
      protection_start_level: normalizeOptionalInteger(row?.protectionStartLevel),
      status: normalizeOptionalString(row?.status),
    });
  }

  if (normalizedRows.length > 0) {
    const recordIds = normalizedRows.map(({ record_id }) => record_id);
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            record_id varchar(180),
            item_id varchar(160),
            item_name varchar(240),
            highest_level bigint,
            levels_payload jsonb,
            action_started_at bigint,
            action_ended_at bigint,
            start_level bigint,
            initial_target_level bigint,
            desired_target_level bigint,
            protection_start_level bigint,
            status varchar(40)
          )
        )
        INSERT INTO ${PLAYER_ENHANCEMENT_RECORD_TABLE}(
          record_id,
          player_id,
          item_id,
          item_name,
          highest_level,
          levels_payload,
          action_started_at,
          action_ended_at,
          start_level,
          initial_target_level,
          desired_target_level,
          protection_start_level,
          status,
          updated_at
        )
        SELECT record_id, $1, item_id, item_name, highest_level, COALESCE(levels_payload, '[]'::jsonb),
          action_started_at, action_ended_at, start_level, initial_target_level,
          desired_target_level, protection_start_level, status, now()
        FROM incoming
        ON CONFLICT (record_id)
        DO UPDATE SET
          player_id = EXCLUDED.player_id,
          item_id = EXCLUDED.item_id,
          item_name = COALESCE(${PLAYER_ENHANCEMENT_RECORD_TABLE}.item_name, EXCLUDED.item_name),
          highest_level = EXCLUDED.highest_level,
          levels_payload = EXCLUDED.levels_payload,
          action_started_at = EXCLUDED.action_started_at,
          action_ended_at = EXCLUDED.action_ended_at,
          start_level = EXCLUDED.start_level,
          initial_target_level = EXCLUDED.initial_target_level,
          desired_target_level = EXCLUDED.desired_target_level,
          protection_start_level = EXCLUDED.protection_start_level,
          status = EXCLUDED.status,
          updated_at = now()
        WHERE ${PLAYER_ENHANCEMENT_RECORD_TABLE}.player_id = EXCLUDED.player_id
          AND ROW(
            ${PLAYER_ENHANCEMENT_RECORD_TABLE}.item_id,
            ${PLAYER_ENHANCEMENT_RECORD_TABLE}.item_name,
            ${PLAYER_ENHANCEMENT_RECORD_TABLE}.highest_level,
            ${PLAYER_ENHANCEMENT_RECORD_TABLE}.levels_payload,
            ${PLAYER_ENHANCEMENT_RECORD_TABLE}.action_started_at,
            ${PLAYER_ENHANCEMENT_RECORD_TABLE}.action_ended_at,
            ${PLAYER_ENHANCEMENT_RECORD_TABLE}.start_level,
            ${PLAYER_ENHANCEMENT_RECORD_TABLE}.initial_target_level,
            ${PLAYER_ENHANCEMENT_RECORD_TABLE}.desired_target_level,
            ${PLAYER_ENHANCEMENT_RECORD_TABLE}.protection_start_level,
            ${PLAYER_ENHANCEMENT_RECORD_TABLE}.status
          ) IS DISTINCT FROM ROW(
            EXCLUDED.item_id,
            COALESCE(${PLAYER_ENHANCEMENT_RECORD_TABLE}.item_name, EXCLUDED.item_name),
            EXCLUDED.highest_level,
            EXCLUDED.levels_payload,
            EXCLUDED.action_started_at,
            EXCLUDED.action_ended_at,
            EXCLUDED.start_level,
            EXCLUDED.initial_target_level,
            EXCLUDED.desired_target_level,
            EXCLUDED.protection_start_level,
            EXCLUDED.status
          )
      `,
      [playerId, JSON.stringify(normalizedRows)],
    );
    // ON CONFLICT 的归属条件阻止覆盖其他玩家；写后回读仍负责捕获已有或并发出现的冲突。
    await assertNoForeignPlayerOwnedIds(
      client,
      PLAYER_ENHANCEMENT_RECORD_TABLE,
      'record_id',
      playerId,
      recordIds,
      'enhancement_record',
    );
  }
  if (options.deleteMissing !== false) {
    await client.query(
      `
        WITH incoming AS (
          SELECT record_id
          FROM jsonb_to_recordset($2::jsonb) AS entry(record_id varchar(180))
        )
        DELETE FROM ${PLAYER_ENHANCEMENT_RECORD_TABLE} target
        WHERE target.player_id = $1
          AND NOT EXISTS (
            SELECT 1
            FROM incoming
            WHERE incoming.record_id = target.record_id
          )
      `,
      [playerId, JSON.stringify(normalizedRows.map(({ record_id }) => ({ record_id })))],
    );
  }
}

export async function replacePlayerProfessionStates(
  client: import('pg').PoolClient,
  playerId: string,
  rows: readonly DurableProfessionStateSnapshot[],
): Promise<void> {
  const normalizedRows = normalizeProfessionStateSnapshots(rows).map((row) => ({
    profession_type: row.professionType,
    level: row.level,
    exp: row.exp,
    exp_to_next: row.expToNext,
  }));
  const rowsJson = JSON.stringify(normalizedRows);
  if (normalizedRows.length > 0) {
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            profession_type varchar(32),
            level bigint,
            exp double precision,
            exp_to_next double precision
          )
        )
        INSERT INTO ${PLAYER_PROFESSION_STATE_TABLE}(
          player_id,
          profession_type,
          level,
          exp,
          exp_to_next,
          updated_at
        )
        SELECT $1, profession_type, level, exp, exp_to_next, now()
        FROM incoming
        ON CONFLICT (player_id, profession_type)
        DO UPDATE SET
          level = EXCLUDED.level,
          exp = EXCLUDED.exp,
          exp_to_next = EXCLUDED.exp_to_next,
          updated_at = now()
        WHERE ROW(
          ${PLAYER_PROFESSION_STATE_TABLE}.level,
          ${PLAYER_PROFESSION_STATE_TABLE}.exp,
          ${PLAYER_PROFESSION_STATE_TABLE}.exp_to_next
        ) IS DISTINCT FROM ROW(
          EXCLUDED.level,
          EXCLUDED.exp,
          EXCLUDED.exp_to_next
        )
      `,
      [playerId, rowsJson],
    );
  }
}

export async function replacePlayerQuestProgressRows(
  client: import('pg').PoolClient,
  playerId: string,
  rows: readonly DurableQuestProgressSnapshot[],
): Promise<void> {
  const normalizedRows: Array<{
    quest_id: string;
    status: string;
    progress_payload: Record<string, unknown> | unknown[] | null;
    raw_payload: Record<string, unknown>;
  }> = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const questId = normalizeRequiredString(row?.questId);
    if (!questId) {
      continue;
    }
    const status = normalizeOptionalString(row?.status) ?? 'active';
    normalizedRows.push({
      quest_id: questId,
      status,
      progress_payload: status === 'completed' ? null : normalizeQuestProgressPayload(row?.progressPayload),
      raw_payload: normalizeQuestRawPayload(row?.rawPayload, questId, status),
    });
  }

  if (normalizedRows.length > 0) {
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            quest_id varchar(120),
            status varchar(40),
            progress_payload jsonb,
            raw_payload jsonb
          )
        )
        INSERT INTO ${PLAYER_QUEST_PROGRESS_TABLE}(
          player_id,
          quest_id,
          status,
          progress_payload,
          raw_payload,
          updated_at
        )
        SELECT $1, quest_id, status, progress_payload, COALESCE(raw_payload, '{}'::jsonb), now()
        FROM incoming
        ON CONFLICT (player_id, quest_id)
        DO UPDATE SET
          status = EXCLUDED.status,
          progress_payload = EXCLUDED.progress_payload,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = now()
      `,
      [playerId, JSON.stringify(normalizedRows)],
    );
  }
  await client.query(
    `
      WITH incoming AS (
        SELECT quest_id
        FROM jsonb_to_recordset($2::jsonb) AS entry(quest_id varchar(120))
      )
      DELETE FROM ${PLAYER_QUEST_PROGRESS_TABLE} target
      WHERE target.player_id = $1
        AND NOT EXISTS (
          SELECT 1
          FROM incoming
          WHERE incoming.quest_id = target.quest_id
        )
    `,
    [playerId, JSON.stringify(normalizedRows.map(({ quest_id }) => ({ quest_id })))],
  );
}

export function isSameActiveJobBehindExpected(
  persistedJobRunId: string,
  persistedJobVersion: number,
  expectedJobRunId: string,
  expectedJobVersion: number | null,
): boolean {
  return Boolean(
    persistedJobRunId
    && expectedJobRunId
    && persistedJobRunId === expectedJobRunId
    && expectedJobVersion != null
    && persistedJobVersion > 0
    && persistedJobVersion < expectedJobVersion,
  );
}

export function isActiveJobCatchUpAllowed(
  persistedJobRunId: string,
  persistedJobVersion: number,
  expectedJobRunId: string,
  expectedJobVersion: number | null,
  nextActiveJob: DurableActiveJobSnapshot | null,
): boolean {
  if (!isSameActiveJobBehindExpected(persistedJobRunId, persistedJobVersion, expectedJobRunId, expectedJobVersion)) {
    return false;
  }
  if (!nextActiveJob) {
    return true;
  }
  return nextActiveJob.jobRunId === expectedJobRunId
    && expectedJobVersion != null
    && nextActiveJob.jobVersion >= expectedJobVersion;
}

export function isActiveJobAlreadyAtOrAheadOfNext(
  persistedJobRunId: string,
  persistedJobVersion: number,
  nextActiveJob: DurableActiveJobSnapshot | null,
): boolean {
  return Boolean(
    nextActiveJob
    && persistedJobRunId
    && persistedJobRunId === nextActiveJob.jobRunId
    && persistedJobVersion >= nextActiveJob.jobVersion,
  );
}

export function isActiveJobSameOrBehindNext(
  persistedJobRunId: string,
  persistedJobVersion: number,
  nextActiveJob: DurableActiveJobSnapshot | null,
): boolean {
  return Boolean(
    nextActiveJob
    && persistedJobRunId
    && persistedJobRunId === nextActiveJob.jobRunId
    && persistedJobVersion > 0
    && persistedJobVersion <= nextActiveJob.jobVersion,
  );
}

export function normalizeActiveJobCompletionKind(value: unknown): ActiveJobCompletionKind {
  const normalized = normalizeRequiredString(value) || 'completed';
  if (normalized === 'completed' || normalized === 'advanced' || normalized === 'stopped') {
    return normalized;
  }
  throw new Error(`invalid_active_job_completion_kind:${normalized}`);
}

export function resolveActiveJobCompletionSemantics(completionKind: ActiveJobCompletionKind): {
  operationType: string;
  outboxTopic: string;
  action: 'complete' | 'advance' | 'stop';
} {
  if (completionKind === 'advanced') {
    return {
      operationType: 'active_job_advance_with_assets',
      outboxTopic: 'player.active_job.advanced',
      action: 'advance',
    };
  }
  if (completionKind === 'stopped') {
    return {
      operationType: 'active_job_stop_with_assets',
      outboxTopic: 'player.active_job.stopped',
      action: 'stop',
    };
  }
  return {
    operationType: 'active_job_complete_with_assets',
    outboxTopic: 'player.active_job.completed',
    action: 'complete',
  };
}

export function normalizeTechniqueActivityQueueSnapshots(
  snapshots: readonly PlayerTechniqueActivityQueueUpsertInput[],
): PlayerTechniqueActivityQueueUpsertInput[] {
  const normalizedRows: PlayerTechniqueActivityQueueUpsertInput[] = [];
  const queueIds = new Set<string>();
  for (let index = 0; index < snapshots.length; index += 1) {
    const snapshot = snapshots[index];
    const queueId = normalizeRequiredString(snapshot?.queueId);
    const kind = normalizeRequiredString(snapshot?.kind);
    if (!queueId || !kind) {
      throw new Error(`invalid_technique_activity_queue_snapshot:index=${index}`);
    }
    if (queueIds.has(queueId)) {
      throw new Error(`duplicate_technique_activity_queue_id:${queueId}`);
    }
    queueIds.add(queueId);
    normalizedRows.push({
      queueId,
      kind,
      state: normalizeRequiredString(snapshot?.state) || 'pending',
      label: normalizeOptionalString(snapshot?.label),
      targetLabel: normalizeOptionalString(snapshot?.targetLabel),
      sleepReason: normalizeOptionalString(snapshot?.sleepReason),
      retryAfterTicks: normalizeOptionalInteger(snapshot?.retryAfterTicks),
      createdAt: Math.max(1, normalizeOptionalInteger(snapshot?.createdAt) ?? 1),
      payloadJson: normalizeDurableJsonValue(snapshot?.payloadJson ?? {}),
      cancelRefJson: normalizeDurableJsonValue(snapshot?.cancelRefJson ?? {}),
      detailJson: normalizeDurableJsonObject(snapshot?.detailJson),
    });
  }
  return normalizedRows;
}

export function buildActiveJobAssetSnapshotDigest(input: {
  playerId: string;
  inventoryItems: readonly DurableInventoryItemSnapshot[];
  walletBalances: readonly DurableWalletBalanceSnapshot[];
  equipmentSlots?: readonly DurableEquipmentSlotSnapshot[];
  enhancementRecords?: readonly DurableEnhancementRecordSnapshot[] | null;
  professionStates?: readonly DurableProfessionStateSnapshot[] | null;
  activeJob: DurableActiveJobSnapshot | null;
  techniqueActivityQueue?: readonly PlayerTechniqueActivityQueueUpsertInput[];
  assetWriteMode?: 'patch';
  removedInventoryItemInstanceIds?: readonly string[];
  removedWalletTypes?: readonly string[];
}): string {
  const canonicalSnapshot = {
    inventory: normalizeInventorySnapshotsForReplay(input.playerId, input.inventoryItems),
    wallet: normalizeWalletSnapshotsForReplay(input.walletBalances),
    equipment: input.equipmentSlots === undefined
      ? { mutation: 'unchanged' }
      : normalizeEquipmentSnapshotsForReplay(input.equipmentSlots),
    enhancementRecords: input.enhancementRecords == null
      ? { mutation: 'unchanged' }
      : input.enhancementRecords,
    ...(input.professionStates == null
      ? {}
      : { professionStates: normalizeProfessionStateSnapshots(input.professionStates) }),
    activeJob: input.activeJob,
    techniqueActivityQueue: input.techniqueActivityQueue === undefined
      ? { mutation: 'unchanged' }
      : normalizeTechniqueActivityQueueSnapshots(input.techniqueActivityQueue),
    ...(input.assetWriteMode === 'patch' ? {
      assetPatch: {
        writeMode: 'patch',
        removedInventoryItemInstanceIds: normalizeStringList(input.removedInventoryItemInstanceIds ?? []).sort(),
        removedWalletTypes: normalizeStringList(input.removedWalletTypes ?? []).sort(),
      },
    } : {}),
  };
  return createHash('sha256').update(stableDurableJson(canonicalSnapshot)).digest('hex');
}

export function normalizeInventorySnapshotsForReplay(
  playerId: string,
  items: readonly DurableInventoryItemSnapshot[],
): unknown[] {
  let lockedSlotCounter = -1;
  return items.map((item, index) => {
    const itemId = normalizeRequiredString(item?.itemId);
    if (!itemId) {
      throw new Error(`invalid_inventory_snapshot_for_replay:index=${index}`);
    }
    const count = Math.max(1, Math.trunc(Number(item?.count ?? 1)));
    const lockedBy = normalizeOptionalString(item?.lockedBy);
    const rawPayload = buildPersistedInventoryItemRawPayload({
      itemId,
      count,
      name: item?.name,
      desc: item?.desc,
      enhanceLevel: item?.enhanceLevel,
      learnTechniqueId: item?.learnTechniqueId,
      learnTechniqueMaxLevel: item?.learnTechniqueMaxLevel,
      grade: item?.grade,
      level: item?.level,
      rawPayload: item?.rawPayload,
    });
    if (lockedBy != null) {
      const lockedAt = normalizeOptionalInteger(item?.lockedAt)
        ?? normalizeOptionalInteger((item?.rawPayload as { lockedAt?: unknown } | null | undefined)?.lockedAt);
      if (lockedAt != null) {
        rawPayload.lockedAt = lockedAt;
      }
    }
    const sourceItemInstanceId = normalizeRequiredString(item?.itemInstanceId)
      || normalizeRequiredString((item?.rawPayload as { itemInstanceId?: unknown } | null | undefined)?.itemInstanceId);
    const itemInstanceId = sourceItemInstanceId && !isLegacyItemInstanceId(sourceItemInstanceId)
      ? sourceItemInstanceId
      : `inv:${playerId}:${index}`;
    return {
      itemInstanceId,
      slotIndex: lockedBy != null ? lockedSlotCounter-- : index,
      itemId,
      count,
      lockedBy,
      rawPayload,
    };
  });
}

export function normalizeWalletSnapshotsForReplay(
  balances: readonly DurableWalletBalanceSnapshot[],
): unknown[] {
  return balances
    .map((balance) => ({
      walletType: normalizeRequiredString(balance?.walletType),
      balance: Math.max(0, Math.trunc(Number(balance?.balance ?? 0))),
      frozenBalance: Math.max(0, Math.trunc(Number(balance?.frozenBalance ?? 0))),
      version: Math.max(1, Math.trunc(Number(balance?.version ?? 1))),
    }))
    .filter(({ walletType }) => walletType.length > 0)
    .sort((left, right) => left.walletType.localeCompare(right.walletType));
}

export function normalizeEquipmentSnapshotsForReplay(
  slots: readonly DurableEquipmentSlotSnapshot[],
): unknown[] {
  return slots
    .map((slotEntry) => {
      const slot = normalizeRequiredString(slotEntry?.slot);
      if (!EQUIP_SLOTS.includes(slot as (typeof EQUIP_SLOTS)[number])) {
        throw new Error(`invalid_equipment_snapshot_for_replay:slot=${slot || 'null'}`);
      }
      const item = slotEntry?.item && typeof slotEntry.item === 'object'
        ? slotEntry.item as Record<string, unknown>
        : null;
      if (!item) {
        return null;
      }
      const itemId = normalizeRequiredString(item.itemId);
      if (!itemId) {
        throw new Error(`invalid_equipment_snapshot_for_replay:slot=${slot}`);
      }
      const sourceItemInstanceId = normalizeRequiredString(slotEntry?.itemInstanceId)
        || normalizeRequiredString(item.itemInstanceId);
      return {
        slot,
        itemInstanceId: sourceItemInstanceId && !isLegacyItemInstanceId(sourceItemInstanceId)
          ? sourceItemInstanceId
          : null,
        itemId,
        rawPayload: buildPersistedEquipmentItemRawPayload({
          itemId,
          slot,
          enhanceLevel: item.enhanceLevel,
          rawPayload: item,
        }),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null)
    .sort((left, right) => left.slot.localeCompare(right.slot));
}

export function normalizeActiveJobSnapshot(snapshot: DurableActiveJobSnapshot): DurableActiveJobSnapshot {
  const jobRunId = normalizeRequiredString(snapshot.jobRunId);
  const jobType = normalizeRequiredString(snapshot.jobType);
  if (!jobRunId || !jobType) {
    throw new Error('invalid_active_job_snapshot');
  }
  const jobVersion = Math.max(1, Math.trunc(Number(snapshot.jobVersion ?? 1)));
  const startedAt = Math.max(1, Math.trunc(Number(snapshot.startedAt ?? Date.now())));
  const finishedAt = normalizeOptionalInteger(snapshot.finishedAt);
  const pausedTicks = Math.max(0, Math.trunc(Number(snapshot.pausedTicks ?? 0)));
  const totalTicks = Math.max(0, Math.trunc(Number(snapshot.totalTicks ?? 0)));
  const remainingTicks = Math.max(0, Math.trunc(Number(snapshot.remainingTicks ?? 0)));
  const successRate = Number.isFinite(Number(snapshot.successRate ?? 0)) ? Number(snapshot.successRate ?? 0) : 0;
  const speedRate = Number.isFinite(Number(snapshot.speedRate ?? 1)) ? Number(snapshot.speedRate ?? 1) : 1;
  const status = normalizeRequiredString(snapshot.status) || 'running';
  const phase = normalizeRequiredString(snapshot.phase) || 'running';
  return {
    jobRunId,
    jobType,
    status,
    phase,
    startedAt,
    finishedAt,
    pausedTicks,
    totalTicks,
    remainingTicks,
    successRate,
    speedRate,
    jobVersion,
    detailJson:
      snapshot.detailJson && typeof snapshot.detailJson === 'object'
        ? snapshot.detailJson
        : {
            jobRunId,
            jobType,
            status,
            phase,
            startedAt,
            finishedAt,
            pausedTicks,
            totalTicks,
            remainingTicks,
            successRate,
            speedRate,
            jobVersion,
          },
  };
}

export function normalizeEnhancementRecordSnapshots(
  playerId: string,
  snapshots: readonly DurableEnhancementRecordSnapshot[],
): DurableEnhancementRecordSnapshot[] {
  const normalizedPlayerId = normalizeRequiredString(playerId) || 'player';
  const rows: DurableEnhancementRecordSnapshot[] = [];
  for (let index = 0; index < snapshots.length; index += 1) {
    const snapshot = snapshots[index];
    const itemId = normalizeRequiredString(snapshot?.itemId);
    if (!itemId) {
      continue;
    }
    rows.push({
      recordId:
        normalizeOptionalString(snapshot?.recordId)
        ?? `enhancement_record:${normalizedPlayerId}:${itemId}:${index}`,
      itemId,
      itemName: normalizePersistedEnhancementItemName(itemId, snapshot?.itemName),
      highestLevel: Math.max(0, Math.trunc(Number(snapshot?.highestLevel ?? 0))),
      levels: Array.isArray(snapshot?.levels) ? snapshot.levels.map((entry) => entry) : [],
      actionStartedAt: normalizeOptionalInteger(snapshot?.actionStartedAt),
      actionEndedAt: normalizeOptionalInteger(snapshot?.actionEndedAt),
      startLevel: normalizeOptionalInteger(snapshot?.startLevel),
      initialTargetLevel: normalizeOptionalInteger(snapshot?.initialTargetLevel),
      desiredTargetLevel: normalizeOptionalInteger(snapshot?.desiredTargetLevel),
      protectionStartLevel: normalizeOptionalInteger(snapshot?.protectionStartLevel),
      status: normalizeOptionalString(snapshot?.status),
    });
  }
  return rows;
}

export function normalizePersistedEnhancementItemName(itemId: string, value: unknown): string | null {
  const itemName = normalizeOptionalString(value);
  return itemName && itemName !== itemId && itemName !== '未知物品' ? itemName : null;
}

export function normalizeProfessionStateSnapshots(
  snapshots: readonly DurableProfessionStateSnapshot[],
): DurableProfessionStateSnapshot[] {
  const allowedTypes = new Set<DurableProfessionStateSnapshot['professionType']>([
    'alchemy',
    'building',
    'gather',
    'enhancement',
    'forging',
    'mining',
    'formation',
    'transmission',
  ]);
  const rows = new Map<DurableProfessionStateSnapshot['professionType'], DurableProfessionStateSnapshot>();
  for (let index = 0; index < snapshots.length; index += 1) {
    const snapshot = snapshots[index];
    const professionType = normalizeRequiredString(snapshot?.professionType) as DurableProfessionStateSnapshot['professionType'];
    if (!allowedTypes.has(professionType)) {
      throw new Error(`invalid_profession_state_snapshot:index=${index}`);
    }
    if (rows.has(professionType)) {
      throw new Error(`duplicate_profession_state_snapshot:${professionType}`);
    }
    const numericLevel = Number(snapshot?.level);
    rows.set(professionType, {
      professionType,
      level: Number.isFinite(numericLevel) ? Math.max(1, Math.trunc(numericLevel)) : 1,
      exp: normalizeNonNegativeOptionalNumber(snapshot?.exp),
      expToNext: normalizeNonNegativeOptionalNumber(snapshot?.expToNext),
    });
  }
  return [...rows.values()].sort((left, right) => left.professionType.localeCompare(right.professionType));
}

export function normalizeNonNegativeOptionalNumber(value: unknown): number | null {
  const numeric = Number(value);
  return value == null || !Number.isFinite(numeric) ? null : Math.max(0, numeric);
}

export function normalizeQuestProgressSnapshots(
  snapshots: readonly DurableQuestProgressSnapshot[],
): DurableQuestProgressSnapshot[] {
  const rows: DurableQuestProgressSnapshot[] = [];
  for (const snapshot of snapshots) {
    const questId = normalizeRequiredString(snapshot?.questId);
    if (!questId) {
      continue;
    }
    const status = normalizeOptionalString(snapshot?.status) ?? 'active';
    rows.push({
      questId,
      status,
      progressPayload: status === 'completed' ? null : normalizeQuestProgressPayload(snapshot?.progressPayload),
      rawPayload: normalizeQuestRawPayload(snapshot?.rawPayload, questId, status),
    });
  }
  return rows;
}

export function normalizeQuestProgressPayload(
  payload: unknown,
): Record<string, unknown> | unknown[] | null {
  if (Array.isArray(payload)) {
    return payload.map((entry) => structuredClone(entry));
  }
  if (payload && typeof payload === 'object') {
    return { ...(payload as Record<string, unknown>) };
  }
  return null;
}

export function normalizeQuestRawPayload(
  rawPayload: unknown,
  questId: string,
  status: string,
): Record<string, unknown> {
  if (rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)) {
    if (status === 'completed') {
      const { progress: _progress, ...rest } = rawPayload as Record<string, unknown>;
      return {
        ...rest,
        id: questId,
        questId,
        status,
      };
    }
    return {
      ...(rawPayload as Record<string, unknown>),
      id: questId,
      questId,
      status,
    };
  }
  return {
    id: questId,
    questId,
    status,
  };
}

export async function readMailCounters(
  client: import('pg').PoolClient,
  playerId: string,
  now: number,
): Promise<{
  unreadCount: number;
  unclaimedCount: number;
  latestMailAt: number | null;
}> {
  const counters = await client.query<{
    unread_count?: string | number;
    unclaimed_count?: string | number;
    latest_mail_at?: string | number | null;
  }>(
    `
      WITH visible_mail AS (
        SELECT mail_id, created_at, read_at, claimed_at
        FROM ${PLAYER_MAIL_TABLE}
        WHERE player_id = $1
          AND deleted_at IS NULL
          AND (expire_at IS NULL OR expire_at > $2)
      ),
      claimable_mail AS (
        SELECT DISTINCT attachment.mail_id
        FROM ${PLAYER_MAIL_ATTACHMENT_TABLE} attachment
        JOIN visible_mail mail ON mail.mail_id = attachment.mail_id
        WHERE attachment.player_id = $1
          AND mail.claimed_at IS NULL
          AND attachment.claimed_at IS NULL
      )
      SELECT
        COALESCE(SUM(CASE WHEN visible_mail.read_at IS NULL THEN 1 ELSE 0 END), 0) AS unread_count,
        COALESCE((SELECT COUNT(*) FROM claimable_mail), 0) AS unclaimed_count,
        MAX(visible_mail.created_at) AS latest_mail_at
      FROM visible_mail
    `,
    [playerId, now],
  );
  const counterRow = counters.rows[0] ?? {};
  const latestMailAt = Number(counterRow.latest_mail_at);
  return {
    unreadCount: Math.max(0, Math.trunc(Number(counterRow.unread_count ?? 0))),
    unclaimedCount: Math.max(0, Math.trunc(Number(counterRow.unclaimed_count ?? 0))),
    latestMailAt: Number.isFinite(latestMailAt)
      ? Math.trunc(latestMailAt)
      : null,
  };
}

export function normalizeInventoryGrantSourceMutation(
  value: DurableInventoryGrantSourceMutation | null | undefined,
): DurableInventoryGrantSourceMutation | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  if (value.kind === 'activity_asset') {
    return normalizeDurableActivityAssetSourceMutation(value);
  }
  if (value.kind === 'player_item_use') {
    return normalizeDurablePlayerItemUseSourceMutation(value);
  }
  const instanceId = normalizeRequiredString(value.instanceId);
  if (!instanceId) {
    return null;
  }
  if (value.kind === 'ground_tile' || value.kind === 'container_state') {
    return normalizeDurableLootSourceMutation(value, instanceId);
  }
  if (value.kind === 'time_chamber_activation') {
    const buildingId = normalizeRequiredString(value.buildingId);
    const chamberInstanceId = normalizeRequiredString(value.chamberInstanceId);
    const playerId = normalizeRequiredString(value.playerId);
    const durationHours = Math.trunc(Number(value.durationHours));
    const expectedRevision = Math.trunc(Number(value.expectedRevision));
    const chargedSpiritStones = Math.trunc(Number(value.chargedSpiritStones));
    if (
      !buildingId
      || !chamberInstanceId
      || !playerId
      || durationHours < TIME_CHAMBER_MIN_USAGE_HOURS
      || durationHours > TIME_CHAMBER_MAX_USAGE_HOURS
      || !Number.isSafeInteger(expectedRevision)
      || expectedRevision < 1
      || !Number.isSafeInteger(chargedSpiritStones)
      || chargedSpiritStones < 0
    ) {
      return null;
    }
    return {
      kind: 'time_chamber_activation',
      instanceId,
      buildingId,
      chamberInstanceId,
      playerId,
      durationHours,
      expectedRevision,
      chargedSpiritStones,
    };
  }
  if (value.kind === 'tile_resource') {
    return normalizeDurableTileResourceSourceMutation(value, instanceId);
  }
  if (value.kind === 'mineral_crystal') {
    return normalizeDurableMineralCrystalSourceMutation(value, instanceId);
  }
  return null;
}

export async function persistInventoryGrantSourceMutation(
  client: import('pg').PoolClient,
  mutation: DurableInventoryGrantSourceMutation,
  persistenceVersion: number,
  operationId: string,
): Promise<void> {
  if (mutation.kind === 'activity_asset') {
    await persistDurableActivityAssetSourceMutation(client, mutation);
    return;
  }
  if (mutation.kind === 'player_item_use') {
    await persistDurablePlayerItemUseSourceMutation(client, mutation, persistenceVersion);
    return;
  }
  await client.query('SELECT pg_advisory_xact_lock($1::integer, hashtext($2))', [7102, mutation.instanceId]);
  if (mutation.kind === 'mineral_crystal') {
    await persistDurableMineralCrystalSourceMutation(client, mutation);
    return;
  }
  if (mutation.kind === 'ground_tile' || mutation.kind === 'container_state') {
    await persistDurableLootSourceMutation(client, mutation);
    return;
  }
  if (mutation.kind === 'time_chamber_activation') {
    await activateDurableTimeChamber(client, mutation);
    return;
  }
  await persistDurableTileResourceSourceMutation(client, mutation);
}

export async function activateDurableTimeChamber(
  client: import('pg').PoolClient,
  mutation: Extract<DurableInventoryGrantSourceMutation, { kind: 'time_chamber_activation' }>,
): Promise<void> {
  const stateResult = await client.query<{
    chamber_instance_id?: unknown;
    capacity?: unknown;
    configured_speed?: unknown;
    size_tier?: unknown;
    active_expires_at_ms?: unknown;
    revision?: unknown;
    now_ms?: unknown;
  }>(
    `SELECT chamber_instance_id, capacity, configured_speed, size_tier,
            active_expires_at_ms, revision,
            floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now_ms
       FROM instance_time_chamber_state
      WHERE source_instance_id = $1 AND building_id = $2
      FOR UPDATE`,
    [mutation.instanceId, mutation.buildingId],
  );
  const state = stateResult.rows[0];
  if (!state) {
    throw new Error('time_chamber_state_not_found');
  }
  if (normalizeRequiredString(state.chamber_instance_id) !== mutation.chamberInstanceId) {
    throw new Error('time_chamber_instance_changed');
  }
  const revision = normalizeSafeInteger(state.revision);
  if (revision !== mutation.expectedRevision) {
    throw new Error('time_chamber_revision_conflict');
  }
  const configuredSpeed = normalizeSafeInteger(state.configured_speed);
  const sizeTier = normalizeTimeChamberSizeTier(state.size_tier);
  if (!requiresTimeChamberActivation(configuredSpeed)) {
    throw new Error('time_chamber_activation_not_required');
  }
  const capacity = Math.max(
    1,
    Math.min(resolveTimeChamberCapacityLimit(sizeTier), normalizeSafeInteger(state.capacity)),
  );
  const chargedSpiritStones = calculateTimeChamberActivationCost(
    configuredSpeed,
    capacity,
    mutation.durationHours,
    sizeTier,
  );
  if (!Number.isSafeInteger(chargedSpiritStones) || chargedSpiritStones !== mutation.chargedSpiritStones) {
    throw new Error('time_chamber_price_changed');
  }

  const nowMs = normalizeSafeInteger(state.now_ms);
  const activeExpiresAt = normalizeSafeInteger(state.active_expires_at_ms);
  if (activeExpiresAt > 0) {
    throw new Error(activeExpiresAt > nowMs ? 'time_chamber_already_active' : 'time_chamber_expiry_pending');
  }
  const expiresAtMs = nowMs + mutation.durationHours * 3_600_000;
  if (!Number.isSafeInteger(expiresAtMs)) {
    throw new Error('time_chamber_usage_time_limit');
  }

  const stateUpdate = await client.query(
    `UPDATE instance_time_chamber_state
        SET active_started_at_ms = $3,
            active_expires_at_ms = $4,
            activation_player_id = $5,
            activation_spirit_stones = $6,
            revision = revision + 1,
            updated_at = now()
      WHERE source_instance_id = $1
        AND building_id = $2
        AND revision = $7
        AND active_expires_at_ms IS NULL`,
    [
      mutation.instanceId,
      mutation.buildingId,
      nowMs,
      expiresAtMs,
      mutation.playerId,
      chargedSpiritStones,
      mutation.expectedRevision,
    ],
  );
  if ((stateUpdate.rowCount ?? 0) !== 1) {
    throw new Error('time_chamber_revision_conflict');
  }
}

export function normalizeDurableJsonValue(value: unknown): unknown {
  try {
    return JSON.parse(stableDurableJson(value ?? {}));
  } catch {
    throw new Error('durable_operation_payload_not_serializable');
  }
}

// normalizeDurableJsonObject moved to durable-operation.sql

export function normalizeDurableOperationId(value: unknown): string {
  const normalized = normalizeRequiredString(value);
  if (!normalized || normalized.length <= DURABLE_OPERATION_ID_SAFE_LENGTH) {
    return normalized;
  }
  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 32);
  const suffix = `:h:${digest}`;
  return `${normalized.slice(0, DURABLE_OPERATION_ID_SAFE_LENGTH - suffix.length)}${suffix}`;
}

export function buildDurableOperationCompactionKey(scope: string, ...parts: readonly unknown[]): string {
  const normalizedScope = normalizeRequiredString(scope);
  const normalizedParts = parts.map((part) => normalizeRequiredString(part)).filter(Boolean);
  if (!normalizedScope || normalizedParts.length !== parts.length) {
    throw new Error('invalid_durable_operation_compaction_key');
  }
  return normalizeDurableOperationId(`compact:${normalizedScope}:${normalizedParts.join(':')}`);
}

export function buildCompactedDurableOperationPayload(input: {
  operationKey: string;
  operationId: string;
  currentPayload: unknown;
  previousPayload: unknown;
  previousOperationId: string | null;
  accumulatePayloadFields?: readonly string[];
  retainPayloadFields?: readonly string[];
}): { payload: Record<string, unknown>; context: AssetMutationCompactionContext } {
  const currentPayload = normalizeDurableJsonObject(input.currentPayload);
  if (Object.prototype.hasOwnProperty.call(currentPayload, DURABLE_OPERATION_COMPACTION_META_KEY)) {
    throw new Error('durable_operation_payload_reserved_compaction_key');
  }
  const previousPayload = normalizeDurableJsonObject(input.previousPayload);
  const previousMeta = normalizeDurableJsonObject(
    previousPayload[DURABLE_OPERATION_COMPACTION_META_KEY],
  );
  const previousCount = Math.max(
    input.previousOperationId ? 1 : 0,
    normalizeOptionalInteger(previousMeta.operationCount) ?? 0,
  );
  const operationCount = input.previousOperationId === input.operationId
    ? Math.max(1, previousCount)
    : previousCount + 1;
  const firstOperationId = normalizeRequiredString(previousMeta.firstOperationId)
    || input.previousOperationId
    || input.operationId;
  const previousTotals = normalizeDurableJsonObject(previousMeta.accumulatedTotals);
  const accumulatedTotals: Record<string, number> = {};
  for (const field of input.accumulatePayloadFields ?? []) {
    const normalizedField = normalizeRequiredString(field);
    if (!normalizedField) {
      continue;
    }
    const previousValue = Number(previousTotals[normalizedField] ?? 0);
    const currentValue = Number(currentPayload[normalizedField] ?? 0);
    if (!Number.isFinite(currentValue)) {
      throw new Error(`invalid_durable_operation_compaction_accumulator:${normalizedField}`);
    }
    const total = (Number.isFinite(previousValue) ? previousValue : 0) + currentValue;
    accumulatedTotals[normalizedField] = Number.isSafeInteger(total)
      ? total
      : Math.sign(total) * Number.MAX_SAFE_INTEGER;
  }
  const context: AssetMutationCompactionContext = {
    operationKey: input.operationKey,
    operationId: input.operationId,
    operationCount,
    firstOperationId,
    accumulatedTotals,
    auditCheckpointDue: operationCount === 1
      || operationCount % HIGH_FREQUENCY_ASSET_AUDIT_CHECKPOINT_INTERVAL === 0,
  };
  const retainedPayload = input.retainPayloadFields
    ? Object.fromEntries(
      input.retainPayloadFields
        .map((field) => normalizeRequiredString(field))
        .filter(Boolean)
        .map((field) => [field, currentPayload[field]]),
    )
    : currentPayload;
  return {
    payload: {
      ...retainedPayload,
      [DURABLE_OPERATION_COMPACTION_META_KEY]: {
        operationCount,
        firstOperationId,
        lastOperationId: input.operationId,
        accumulatedTotals,
        payloadDigest: createHash('sha256').update(stableDurableJson(currentPayload)).digest('hex'),
      },
    },
    context,
  };
}

export function unwrapCompactedDurableOperationPayload(value: unknown): Record<string, unknown> {
  const payload = normalizeDurableJsonObject(value);
  delete payload[DURABLE_OPERATION_COMPACTION_META_KEY];
  return payload;
}

export function assertDurableOperationCompactedReplayIdentity(
  row: { payload_jsonb?: unknown },
  expectedPayload: unknown,
): void {
  const storedPayload = normalizeDurableJsonObject(row.payload_jsonb);
  const storedMeta = normalizeDurableJsonObject(
    storedPayload[DURABLE_OPERATION_COMPACTION_META_KEY],
  );
  const storedDigest = normalizeRequiredString(storedMeta.payloadDigest);
  if (storedDigest) {
    const expectedDigest = createHash('sha256')
      .update(stableDurableJson(expectedPayload))
      .digest('hex');
    if (storedDigest !== expectedDigest) {
      throw new Error('durable_operation_replay_identity_conflict');
    }
    return;
  }
  if (
    stableDurableJson(unwrapCompactedDurableOperationPayload(row.payload_jsonb))
    !== stableDurableJson(expectedPayload)
  ) {
    throw new Error('durable_operation_replay_identity_conflict');
  }
}

export function assertDurableOperationCompactionStreamIdentity(
  row: {
    operation_type?: unknown;
    aggregate_type?: unknown;
    player_id?: unknown;
  },
  expected: {
    operationType: unknown;
    aggregateType: unknown;
    playerId: unknown;
  },
): void {
  if (
    normalizeRequiredString(row.operation_type) !== normalizeRequiredString(expected.operationType)
    || normalizeRequiredString(row.aggregate_type) !== normalizeRequiredString(expected.aggregateType)
    || normalizeRequiredString(row.player_id) !== normalizeRequiredString(expected.playerId)
  ) {
    throw new Error('durable_operation_compaction_identity_conflict');
  }
}

export function assertDurableOperationReplayIdentity(
  row: {
    operation_type?: unknown;
    aggregate_type?: unknown;
    player_id?: unknown;
    payload_jsonb?: unknown;
  },
  expected: {
    operationType: unknown;
    aggregateType: unknown;
    playerId: unknown;
    payload: unknown;
  },
): void {
  const currentOperationType = normalizeRequiredString(row.operation_type);
  const currentAggregateType = normalizeRequiredString(row.aggregate_type);
  const currentPlayerId = normalizeRequiredString(row.player_id);
  const expectedOperationType = normalizeRequiredString(expected.operationType);
  const expectedAggregateType = normalizeRequiredString(expected.aggregateType);
  const expectedPlayerId = normalizeRequiredString(expected.playerId);
  if (
    currentOperationType !== expectedOperationType
    || currentAggregateType !== expectedAggregateType
    || currentPlayerId !== expectedPlayerId
    || stableDurableJson(row.payload_jsonb) !== stableDurableJson(expected.payload)
  ) {
    throw new Error('durable_operation_replay_identity_conflict');
  }
}

/**
 * 市场幂等键只绑定玩家、动作类型与客户端请求本身。
 * 订单版本和结算后快照属于服务端派生结果；重复请求到达时运行态可能已经推进，
 * 不能拿这些派生字段判断是否为同一请求，否则会把正常重放误判成 operationId 冲突。
 */
export function assertDurableMarketOperationReplayIdentity(
  row: {
    operation_type?: unknown;
    aggregate_type?: unknown;
    player_id?: unknown;
    payload_jsonb?: unknown;
  },
  expected: {
    operationType: unknown;
    playerId: unknown;
    request: unknown;
  },
): void {
  const payload = normalizeDurableJsonObject(row.payload_jsonb);
  assertDurableOperationReplayIdentity(
    {
      ...row,
      payload_jsonb: payload.request,
    },
    {
      operationType: expected.operationType,
      aggregateType: 'market_mutation',
      playerId: expected.playerId,
      payload: expected.request,
    },
  );
}

export function stableDurableJson(value: unknown): string {
  let decoded = value;
  if (typeof decoded === 'string') {
    try {
      decoded = JSON.parse(decoded);
    } catch {
      return JSON.stringify(decoded);
    }
  }
  try {
    const serialized = JSON.stringify(decoded ?? {});
    return JSON.stringify(sortDurableJsonValue(JSON.parse(serialized)));
  } catch {
    throw new Error('durable_operation_payload_not_serializable');
  }
}

export function sortDurableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortDurableJsonValue);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortDurableJsonValue((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

// normalizeRequiredString moved to durable-operation.sql

export function waitForDurableOperationReconciliation(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function normalizeCurrentDurableInvocationResult<TResult>(result: TResult): TResult {
  if (!result || typeof result !== 'object' || Array.isArray(result) || !('alreadyCommitted' in result)) {
    return result;
  }
  return {
    ...(result as Record<string, unknown>),
    alreadyCommitted: false,
  } as TResult;
}

export function normalizeOptionalInteger(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

export function normalizeSafeInteger(value: unknown): number {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : 0;
}

export function normalizeTimeChamberSizeTier(value: unknown): 'small' | 'medium' | 'large' {
  return value === 'medium' || value === 'large' ? value : 'small';
}

export function normalizeOptionalString(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized ? normalized : null;
}

export function normalizePositiveInteger(
  value: unknown,
  fallback: number,
  min = 1,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

export function normalizeStringList(values: readonly unknown[]): string[] {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => normalizeRequiredString(value))
    .filter((value) => value.length > 0)));
}

export function buildMarketSessionFenceConflictMessage(
  expectedRuntimeOwnerId: string,
  expectedSessionEpoch: number,
  persistedRuntimeOwnerId: string,
  persistedSessionEpoch: number,
): string {
  return [
    'player_session_fencing_conflict:market_mutation',
    `expectedRuntimeOwnerId=${expectedRuntimeOwnerId || 'null'}`,
    `expectedSessionEpoch=${expectedSessionEpoch > 0 ? Math.trunc(expectedSessionEpoch) : 'null'}`,
    `persistedRuntimeOwnerId=${persistedRuntimeOwnerId || 'null'}`,
    `persistedSessionEpoch=${persistedSessionEpoch > 0 ? Math.trunc(persistedSessionEpoch) : 'null'}`,
  ].join(':');
}

export async function advancePlayerPresenceSessionFence(
  client: import('pg').PoolClient,
  playerId: string,
  runtimeOwnerId: string,
  sessionEpoch: number,
): Promise<void> {
  await client.query(
    `
      INSERT INTO ${PLAYER_PRESENCE_TABLE}(
        player_id, online, in_world, runtime_owner_id, session_epoch, updated_at
      )
      VALUES ($1, true, true, $2, $3, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        online = true,
        in_world = true,
        runtime_owner_id = EXCLUDED.runtime_owner_id,
        session_epoch = EXCLUDED.session_epoch,
        updated_at = now()
      WHERE ${PLAYER_PRESENCE_TABLE}.session_epoch < EXCLUDED.session_epoch
    `,
    [playerId, runtimeOwnerId, Math.max(1, Math.trunc(sessionEpoch))],
  );
}

export function normalizeMarketPlayerMutations(values: readonly DurableMarketPlayerMutationSnapshot[]): DurableMarketPlayerMutationSnapshot[] {
  const byPlayerId = new Map<string, DurableMarketPlayerMutationSnapshot>();
  for (const value of Array.isArray(values) ? values : []) {
    const playerId = normalizeRequiredString(value?.playerId);
    if (!playerId) {
      continue;
    }
    const current = byPlayerId.get(playerId) ?? { playerId };
    const expectedRuntimeOwnerId = normalizeRequiredString(value.expectedRuntimeOwnerId);
    const expectedSessionEpoch = Math.max(0, Math.trunc(Number(value.expectedSessionEpoch ?? 0)));
    if (expectedRuntimeOwnerId && expectedSessionEpoch > 0) {
      current.expectedRuntimeOwnerId = expectedRuntimeOwnerId;
      current.expectedSessionEpoch = expectedSessionEpoch;
    }
    if (Array.isArray(value.nextInventoryItems)) {
      current.nextInventoryItems = value.nextInventoryItems as DurableInventoryItemSnapshot[];
    }
    if (Array.isArray(value.nextWalletBalances)) {
      current.nextWalletBalances = value.nextWalletBalances as DurableWalletBalanceSnapshot[];
    }
    if (Array.isArray(value.nextMarketStorageItems)) {
      current.nextMarketStorageItems = value.nextMarketStorageItems as DurableMarketStorageItemSnapshot[];
    }
    byPlayerId.set(playerId, current);
  }
  return Array.from(byPlayerId.values()).sort((left, right) => left.playerId.localeCompare(right.playerId));
}

export function normalizeMarketExpectedOrders(
  values: readonly DurableMarketExpectedOrderSnapshot[],
): DurableMarketExpectedOrderSnapshot[] {
  const byOrderId = new Map<string, DurableMarketExpectedOrderSnapshot>();
  for (const value of Array.isArray(values) ? values : []) {
    const orderId = normalizeRequiredString(value?.orderId);
    if (!orderId) {
      continue;
    }
    byOrderId.set(orderId, {
      orderId,
      exists: value.exists === true,
      status: normalizeOptionalString(value.status),
      remainingQuantity: normalizeOptionalInteger(value.remainingQuantity),
      updatedAtMs: normalizeOptionalInteger(value.updatedAtMs),
    });
  }
  return Array.from(byOrderId.values()).sort((left, right) => left.orderId.localeCompare(right.orderId));
}

export async function assertMarketParticipantPresenceFences(
  client: import('pg').PoolClient,
  mutations: readonly DurableMarketPlayerMutationSnapshot[],
  primaryPlayerId: string,
): Promise<void> {
  for (const mutation of mutations) {
    if (mutation.playerId === primaryPlayerId) {
      continue;
    }
    const expectedRuntimeOwnerId = normalizeRequiredString(mutation.expectedRuntimeOwnerId);
    const expectedSessionEpoch = Math.max(0, Math.trunc(Number(mutation.expectedSessionEpoch ?? 0)));
    if (!expectedRuntimeOwnerId || expectedSessionEpoch <= 0) {
      continue;
    }
    const result = await client.query<{ runtime_owner_id?: unknown; session_epoch?: unknown }>(
      `SELECT runtime_owner_id, session_epoch FROM ${PLAYER_PRESENCE_TABLE} WHERE player_id = $1 FOR UPDATE`,
      [mutation.playerId],
    );
    const persistedRuntimeOwnerId = normalizeRequiredString(result.rows[0]?.runtime_owner_id);
    const persistedSessionEpoch = Math.max(0, Math.trunc(Number(result.rows[0]?.session_epoch ?? 0)));
    if (
      persistedRuntimeOwnerId !== expectedRuntimeOwnerId
      || persistedSessionEpoch !== expectedSessionEpoch
    ) {
      throw new Error(`market_participant_session_fence_conflict:${mutation.playerId}`);
    }
  }
}

export async function assertMarketExpectedOrders(
  client: import('pg').PoolClient,
  expectedOrders: readonly DurableMarketExpectedOrderSnapshot[],
): Promise<void> {
  if (expectedOrders.length === 0) {
    return;
  }
  const orderIds = expectedOrders.map((entry) => entry.orderId);
  const result = await client.query<{
    order_id?: unknown;
    status?: unknown;
    remaining_quantity?: unknown;
    updated_at_ms?: unknown;
  }>(
    `
      SELECT order_id, status, remaining_quantity, updated_at_ms
      FROM ${MARKET_ORDER_TABLE}
      WHERE order_id = ANY($1::varchar[])
      ORDER BY order_id ASC
      FOR UPDATE
    `,
    [orderIds],
  );
  const rowsByOrderId = new Map(
    result.rows.map((row) => [normalizeRequiredString(row.order_id), row]),
  );
  for (const expected of expectedOrders) {
    const row = rowsByOrderId.get(expected.orderId);
    if (!expected.exists) {
      if (row) {
        throw new Error(`market_order_cas_conflict:${expected.orderId}:expected_absent`);
      }
      continue;
    }
    const persistedStatus = normalizeRequiredString(row?.status);
    const persistedRemainingQuantity = normalizeOptionalInteger(row?.remaining_quantity);
    const persistedUpdatedAtMs = normalizeOptionalInteger(row?.updated_at_ms);
    if (
      !row
      || (expected.status != null && persistedStatus !== expected.status)
      || (expected.remainingQuantity != null && persistedRemainingQuantity !== expected.remainingQuantity)
      || (expected.updatedAtMs != null && persistedUpdatedAtMs !== expected.updatedAtMs)
    ) {
      throw new Error(`market_order_cas_conflict:${expected.orderId}:stale_state`);
    }
  }
}

export async function insertDurableOperationLog(
  client: import('pg').PoolClient,
  operationId: string,
  operationType: string,
  aggregateType: string,
  playerId: string,
  runtimeOwnerId: string,
  sessionEpoch: number,
  payload: unknown,
): Promise<void> {
  await client.query(
    `
      INSERT INTO ${DURABLE_OPERATION_LOG_TABLE}(
        operation_id, operation_type, aggregate_type, aggregate_id, player_id,
        runtime_owner_id, session_epoch, request_id, payload_jsonb, status, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, now())
    `,
    [operationId, operationType, aggregateType, playerId, playerId, runtimeOwnerId || null, sessionEpoch > 0 ? Math.trunc(sessionEpoch) : null, operationId, JSON.stringify(payload ?? {}), 'pending'],
  );
}

export async function upsertMarketOrders(client: import('pg').PoolClient, orders: readonly unknown[]): Promise<void> {
  for (const source of Array.isArray(orders) ? orders : []) {
    const order = source as Record<string, unknown>;
    const item = order.item && typeof order.item === 'object' ? order.item as Record<string, unknown> : {};
    const orderId = normalizeRequiredString(order.id ?? order.orderId);
    const ownerId = normalizeRequiredString(order.ownerId);
    const side = order.side === 'buy' ? 'buy' : 'sell';
    const status = normalizeRequiredString(order.status) || 'open';
    const itemKey = normalizeRequiredString(order.itemKey);
    const itemId = normalizeRequiredString(item.itemId ?? order.itemId);
    if (!orderId || !ownerId || !itemKey || !itemId) {
      throw new Error('invalid_market_order_upsert');
    }
    await client.query(
      `
        INSERT INTO ${MARKET_ORDER_TABLE}(
          order_id, owner_id, side, status, item_key, item_id,
          remaining_quantity, unit_price, created_at_ms, updated_at_ms, raw_payload, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::numeric, $9, $10, $11::jsonb, now())
        ON CONFLICT (order_id)
        DO UPDATE SET
          owner_id = EXCLUDED.owner_id,
          side = EXCLUDED.side,
          status = EXCLUDED.status,
          item_key = EXCLUDED.item_key,
          item_id = EXCLUDED.item_id,
          remaining_quantity = EXCLUDED.remaining_quantity,
          unit_price = EXCLUDED.unit_price,
          created_at_ms = EXCLUDED.created_at_ms,
          updated_at_ms = EXCLUDED.updated_at_ms,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = now()
      `,
      [
        orderId,
        ownerId,
        side,
        status,
        itemKey,
        itemId,
        Math.max(0, Math.trunc(Number(order.remainingQuantity ?? 0))),
        Number.isFinite(Number(order.unitPrice)) ? Number(order.unitPrice) : 1,
        Math.trunc(Number(order.createdAt ?? Date.now())),
        Math.trunc(Number(order.updatedAt ?? Date.now())),
        JSON.stringify(order),
      ],
    );
  }
}

export async function insertMarketTradeRecords(client: import('pg').PoolClient, records: readonly unknown[]): Promise<void> {
  for (const source of Array.isArray(records) ? records : []) {
    const record = source as Record<string, unknown>;
    const tradeId = normalizeRequiredString(record.id ?? record.tradeId);
    const buyerId = normalizeRequiredString(record.buyerId);
    const sellerId = normalizeRequiredString(record.sellerId);
    const itemId = normalizeRequiredString(record.itemId);
    if (!tradeId || !buyerId || !sellerId || !itemId) {
      throw new Error('invalid_market_trade_record');
    }
    await client.query(
      `
        INSERT INTO ${MARKET_TRADE_TABLE}(
          trade_id, buyer_id, seller_id, item_id, quantity,
          unit_price, created_at_ms, raw_payload, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::numeric, $7, $8::jsonb, now())
        ON CONFLICT (trade_id)
        DO UPDATE SET
          buyer_id = EXCLUDED.buyer_id,
          seller_id = EXCLUDED.seller_id,
          item_id = EXCLUDED.item_id,
          quantity = EXCLUDED.quantity,
          unit_price = EXCLUDED.unit_price,
          created_at_ms = EXCLUDED.created_at_ms,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = now()
      `,
      [
        tradeId,
        buyerId,
        sellerId,
        itemId,
        Math.max(1, Math.trunc(Number(record.quantity ?? 1))),
        Number.isFinite(Number(record.unitPrice)) ? Number(record.unitPrice) : 1,
        Math.trunc(Number(record.createdAt ?? Date.now())),
        JSON.stringify(record),
      ],
    );
  }
}

export async function persistMarketPlayerMutation(
  client: import('pg').PoolClient,
  mutation: DurableMarketPlayerMutationSnapshot,
  persistenceVersion: number,
): Promise<void> {
  const watermark: { inventory?: number; wallet?: number; marketStorage?: number } = {};
  if (Array.isArray(mutation.nextInventoryItems)) {
    await replacePlayerInventoryItems(client, mutation.playerId, mutation.nextInventoryItems, { allowEmptyOverwrite: true });
    watermark.inventory = persistenceVersion;
  }
  if (Array.isArray(mutation.nextWalletBalances)) {
    await replacePlayerWalletRows(client, mutation.playerId, mutation.nextWalletBalances);
    watermark.wallet = persistenceVersion;
  }
  if (Array.isArray(mutation.nextMarketStorageItems)) {
    await replacePlayerMarketStorageItems(client, mutation.playerId, mutation.nextMarketStorageItems, { allowEmptyOverwrite: true });
    watermark.marketStorage = persistenceVersion;
  }
  await upsertMarketMutationWatermark(client, mutation.playerId, watermark);
}

export async function upsertMarketMutationWatermark(
  client: import('pg').PoolClient,
  playerId: string,
  watermark: { inventory?: number; wallet?: number; marketStorage?: number },
): Promise<void> {
  if (watermark.inventory == null && watermark.wallet == null && watermark.marketStorage == null) {
    return;
  }
  await client.query(
    `
      INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(
        player_id, inventory_version, wallet_version, market_storage_version, updated_at
      )
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        inventory_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.inventory_version, EXCLUDED.inventory_version),
        wallet_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.wallet_version, EXCLUDED.wallet_version),
        market_storage_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.market_storage_version, EXCLUDED.market_storage_version),
        updated_at = now()
    `,
    [playerId, watermark.inventory ?? 0, watermark.wallet ?? 0, watermark.marketStorage ?? 0],
  );
}

export async function persistDurableMarketBanUser(client: import('pg').PoolClient, banUser: DurableMarketMutationInput['banUser']): Promise<void> {
  const playerId = normalizeRequiredString(banUser?.playerId);
  const bannedAt = normalizeRequiredString(banUser?.bannedAt);
  if (!playerId || !bannedAt) {
    throw new Error('invalid_durable_market_ban_user');
  }
  const banReason = normalizeRequiredString(banUser?.banReason).slice(0, 255) || 'GM 风险复核封禁';
  const bannedBy = normalizeRequiredString(banUser?.bannedBy).slice(0, 64) || 'gm';
  const updateResult = await client.query(
    `
      UPDATE ${PLAYER_AUTH_TABLE}
      SET
        banned_at = $2::text::timestamptz,
        ban_reason = $3::text,
        banned_by = $4::text,
        updated_at = now(),
        payload = jsonb_set(
          jsonb_set(jsonb_set(payload, '{bannedAt}', to_jsonb($2::text), true), '{banReason}', to_jsonb($3::text), true),
          '{bannedBy}', to_jsonb($4::text), true
        )
      WHERE player_id = $1
    `,
    [playerId, bannedAt, banReason, bannedBy],
  );
  if (updateResult.rowCount !== 1) {
    throw new Error('durable_market_ban_user_not_found');
  }
}

export async function insertDurableOutboxEvent(
  client: import('pg').PoolClient,
  operationId: string,
  topic: string,
  partitionKey: string,
  payload: unknown,
): Promise<void> {
  await client.query(
    `
      INSERT INTO ${OUTBOX_EVENT_TABLE}(
        event_id, operation_id, topic, partition_key, payload_jsonb,
        status, attempt_count, next_retry_at, created_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, now(), now())
      ON CONFLICT (event_id) DO NOTHING
    `,
    [`outbox:${operationId}`, operationId, topic, partitionKey, JSON.stringify(payload ?? {}), 'ready', 0],
  );
}

export async function insertAssetAuditLog(
  client: import('pg').PoolClient,
  operationId: string,
  playerId: string,
  assetType: string,
  assetRefId: string,
  action: string,
  delta: unknown,
  before: unknown,
  after: unknown,
  logIdSuffix?: string,
): Promise<void> {
  const logId = buildAssetAuditLogId(operationId, logIdSuffix);
  await client.query(
    `
      INSERT INTO ${ASSET_AUDIT_LOG_TABLE}(
        log_id, operation_id, player_id, asset_type, asset_ref_id, action,
        delta_jsonb, before_jsonb, after_jsonb, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, now())
      ON CONFLICT (log_id) DO NOTHING
    `,
    [logId, operationId, playerId, assetType, assetRefId, action, JSON.stringify(delta ?? {}), JSON.stringify(before ?? {}), JSON.stringify(after ?? {})],
  );
}

export async function upsertCompactedAssetAuditLog(
  client: import('pg').PoolClient,
  compaction: AssetMutationCompactionContext,
  playerId: string,
  assetType: string,
  assetRefId: string,
  action: string,
  delta: unknown,
  before: unknown,
  after: unknown,
): Promise<void> {
  if (!compaction.auditCheckpointDue) {
    return;
  }
  const logId = buildAssetAuditLogId(compaction.operationKey);
  const compactedDelta = {
    ...normalizeDurableJsonObject(delta),
    operationCount: compaction.operationCount,
    accumulatedTotals: compaction.accumulatedTotals,
  };
  const compactedBefore = {
    ...normalizeDurableJsonObject(before),
    firstOperationId: compaction.firstOperationId,
  };
  const compactedAfter = {
    ...normalizeDurableJsonObject(after),
    lastOperationId: compaction.operationId,
  };
  const result = await client.query(
    `
      INSERT INTO ${ASSET_AUDIT_LOG_TABLE}(
        log_id, operation_id, player_id, asset_type, asset_ref_id, action,
        delta_jsonb, before_jsonb, after_jsonb, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, now())
      ON CONFLICT (log_id)
      DO UPDATE SET
        delta_jsonb = EXCLUDED.delta_jsonb,
        after_jsonb = EXCLUDED.after_jsonb,
        created_at = now()
      WHERE ${ASSET_AUDIT_LOG_TABLE}.operation_id = EXCLUDED.operation_id
        AND ${ASSET_AUDIT_LOG_TABLE}.player_id = EXCLUDED.player_id
        AND ${ASSET_AUDIT_LOG_TABLE}.asset_type = EXCLUDED.asset_type
        AND ${ASSET_AUDIT_LOG_TABLE}.asset_ref_id = EXCLUDED.asset_ref_id
        AND ${ASSET_AUDIT_LOG_TABLE}.action = EXCLUDED.action
    `,
    [
      logId,
      compaction.operationKey,
      playerId,
      assetType,
      assetRefId,
      action,
      JSON.stringify(compactedDelta),
      JSON.stringify(compactedBefore),
      JSON.stringify(compactedAfter),
    ],
  );
  if ((result.rowCount ?? 0) !== 1) {
    throw new Error('asset_audit_compaction_identity_conflict');
  }
}

export function buildAssetAuditLogId(operationId: string, logIdSuffix?: string): string {
  const normalizedLogIdSuffix = normalizeOptionalString(logIdSuffix);
  const rawLogId = `audit:${operationId}${normalizedLogIdSuffix ? `:${normalizedLogIdSuffix}` : ''}`;
  return rawLogId.length <= 180
    ? rawLogId
    : `audit:h:${createHash('sha256').update(rawLogId).digest('hex')}`;
}

export async function replacePlayerWalletRows(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  playerId: string,
  balances: readonly unknown[],
  options: { deleteMissing?: boolean } = {},
): Promise<void> {
  const sourceBalances = Array.isArray(balances) ? balances : [];
  const rows: Array<{
    wallet_type: string;
    balance: number;
    frozen_balance: number;
    version: number;
  }> = [];
  for (const row of sourceBalances) {
    const walletType = normalizeRequiredString((row as { walletType?: unknown })?.walletType);
    if (!walletType) {
      continue;
    }
    const balance = Math.max(0, Math.trunc(Number((row as { balance?: unknown })?.balance ?? 0)));
    const frozenBalance = Math.max(0, Math.trunc(Number((row as { frozenBalance?: unknown })?.frozenBalance ?? 0)));
    const version = Math.max(1, Math.trunc(Number((row as { version?: unknown })?.version ?? 1)));
    rows.push({
      wallet_type: walletType,
      balance,
      frozen_balance: frozenBalance,
      version,
    });
  }

  const rowsJson = JSON.stringify(rows);
  if (rows.length > 0) {
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            wallet_type varchar(64),
            balance bigint,
            frozen_balance bigint,
            version bigint
          )
        )
        INSERT INTO ${PLAYER_WALLET_TABLE}(
          player_id,
          wallet_type,
          balance,
          frozen_balance,
          version,
          updated_at
        )
        SELECT $1, wallet_type, balance, frozen_balance, version, now()
        FROM incoming
        ON CONFLICT (player_id, wallet_type)
        DO UPDATE SET
          balance = EXCLUDED.balance,
          frozen_balance = EXCLUDED.frozen_balance,
          version = EXCLUDED.version,
          updated_at = now()
        WHERE ROW(
          ${PLAYER_WALLET_TABLE}.balance,
          ${PLAYER_WALLET_TABLE}.frozen_balance,
          ${PLAYER_WALLET_TABLE}.version
        ) IS DISTINCT FROM ROW(
          EXCLUDED.balance,
          EXCLUDED.frozen_balance,
          EXCLUDED.version
        )
      `,
      [playerId, rowsJson],
    );
  }
  if (options.deleteMissing !== false) {
    await client.query(
      `
        WITH incoming AS (
          SELECT wallet_type
          FROM jsonb_to_recordset($2::jsonb) AS entry(wallet_type varchar(64))
        )
        DELETE FROM ${PLAYER_WALLET_TABLE} target
        WHERE target.player_id = $1
          AND NOT EXISTS (
            SELECT 1
            FROM incoming
            WHERE incoming.wallet_type = target.wallet_type
          )
      `,
      [playerId, rowsJson],
    );
  }
}

export async function patchPlayerWalletRows(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  playerId: string,
  balances: readonly unknown[],
  removedWalletTypes: readonly string[],
): Promise<void> {
  const removedTypes = normalizeStringList(removedWalletTypes).sort();
  const incomingTypes = new Set((Array.isArray(balances) ? balances : [])
    .map((row) => normalizeRequiredString((row as { walletType?: unknown })?.walletType))
    .filter(Boolean));
  if (removedTypes.some((walletType) => incomingTypes.has(walletType))) {
    throw new Error(`patch_wallet_remove_update_conflict:playerId=${playerId}`);
  }
  await replacePlayerWalletRows(client, playerId, balances, { deleteMissing: false });
  if (removedTypes.length > 0) {
    await client.query(
      `DELETE FROM ${PLAYER_WALLET_TABLE}
       WHERE player_id = $1
         AND wallet_type = ANY($2::varchar[])`,
      [playerId, removedTypes],
    );
  }
}

// acquireSchemaInitLock moved to durable-operation.sql

export async function assertInstanceLeaseWritable(
  client: import('pg').PoolClient,
  input: {
    expectedInstanceId: string | null | undefined;
    expectedAssignedNodeId?: string | null | undefined;
    expectedLeaseToken?: string | null | undefined;
    expectedOwnershipEpoch?: number | null | undefined;
    currentNodeId: string;
  },
): Promise<void> {
  const normalizedInstanceId = normalizeRequiredString(input.expectedInstanceId);
  if (!normalizedInstanceId) {
    return;
  }
  await assertInstanceLeaseWriteFence(client, {
    instanceId: normalizedInstanceId,
    expectedAssignedNodeId: input.expectedAssignedNodeId,
    expectedLeaseToken: input.expectedLeaseToken,
    expectedOwnershipEpoch: input.expectedOwnershipEpoch,
    requiredCurrentNodeId: input.currentNodeId,
    conflictCode: 'instance_lease_fencing_conflict',
  });
}

export function resolveCurrentNodeId(): string {
  return resolveNodeId();
}
