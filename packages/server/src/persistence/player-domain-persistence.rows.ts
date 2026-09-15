/**
 * player-domain-persistence.rows.ts
 *
 * 从 player-domain-persistence.service.ts 拆出的行构建和替换函数。
 * 不包含 @Injectable provider，不修改持久化语义。
 */
import type { PoolClient } from 'pg';
import {
  PLAYER_PRESENCE_TABLE,
  PLAYER_WALLET_TABLE,
  PLAYER_SECT_MEMBERSHIP_TABLE,
  PLAYER_WORLD_ANCHOR_TABLE,
  PLAYER_POSITION_CHECKPOINT_TABLE,
  PLAYER_VITALS_TABLE,
  PLAYER_PROGRESSION_CORE_TABLE,
  PLAYER_ATTR_STATE_TABLE,
  PLAYER_BODY_TRAINING_STATE_TABLE,
  PLAYER_INVENTORY_ITEM_TABLE,
  PLAYER_MARKET_STORAGE_ITEM_TABLE,
  PLAYER_MAP_UNLOCK_TABLE,
  PLAYER_EQUIPMENT_SLOT_TABLE,
  PLAYER_ARTIFACT_SLOT_TABLE,
  PLAYER_TECHNIQUE_STATE_TABLE,
  PLAYER_TECHNIQUE_COMPREHENSION_TABLE,
  PLAYER_PERSISTENT_BUFF_STATE_TABLE,
  PLAYER_QUEST_PROGRESS_TABLE,
  PLAYER_COMBAT_PREFERENCES_TABLE,
  PLAYER_AUTO_BATTLE_SKILL_TABLE,
  PLAYER_AUTO_USE_ITEM_RULE_TABLE,
  PLAYER_PROFESSION_STATE_TABLE,
  PLAYER_ALCHEMY_PRESET_TABLE,
  PLAYER_ACTIVE_JOB_TABLE,
  PLAYER_TECHNIQUE_ACTIVITY_QUEUE_TABLE,
  PLAYER_ENHANCEMENT_RECORD_TABLE,
  PLAYER_LOGBOOK_MESSAGE_TABLE,
  PLAYER_RECOVERY_WATERMARK_TABLE,
  INVENTORY_TEMP_SLOT_BASE,
  PLAYER_DOMAIN_BIGINT_COLUMNS_BY_TABLE,
  PLAYER_DOMAIN_DOUBLE_COLUMNS_BY_TABLE,
  normalizeRequiredString,
  normalizeOptionalString,
  normalizeOptionalInteger,
  normalizeOptionalNumber,
  normalizeIntegerWithFallback,
  normalizeNumberWithFallback,
  normalizeMinimumInteger,
  normalizeMinimumNumber,
  normalizeVersionSeed,
  normalizeJsonArray,
  normalizeStringArray,
  cloneJsonValue,
  normalizeQuestProgressPayload,
  normalizeQuestProgressValue,
  normalizeRuntimeBonuses,
  normalizeRuntimeBonusEntry,
  isDerivedPersistentRuntimeBonusSource,
  normalizePlayerIdList,
  querySingleRow,
  queryRows,
  indexRowsByPlayerId,
  indexMultiRowsByPlayerId,
  acquirePlayerPersistenceLock,
  readFenceEpoch,
  isConvergedPlayerProjectionFenceError,
  isConvergedPlayerPresenceFenceError,
  isSupersededPlayerFlushFenceError,
  isSupersededPlayerAssetFenceError,
  WATERMARK_COLUMNS,
  playerDomainModuleLogger,
  normalizePersistedEnhancementItemName,
} from './player-domain-persistence.helpers';
import type {
  PersistedPlayerSnapshot,
  PlayerPresenceUpsertInput,
  PlayerWalletUpsertInput,
  PlayerWorldAnchorUpsertInput,
  PlayerPositionCheckpointUpsertInput,
  PlayerVitalsUpsertInput,
  PlayerProgressionCoreUpsertInput,
  PlayerInventoryItemUpsertInput,
  PlayerMarketStorageItemUpsertInput,
  PlayerMapUnlockUpsertInput,
  PlayerEquipmentSlotUpsertInput,
  PlayerArtifactSlotUpsertInput,
  PlayerLogbookMessageUpsertInput,
  PlayerTechniqueActivityQueueUpsertInput,
  PlayerDomainWriteOptions,
  PersistedInventoryRow,
  AlchemyPresetRow,
  ActiveJobRow,
  TechniqueActivityQueueRow,
  AttrStateRow,
  TechniqueStateRow,
  TechniqueComprehensionRow,
  PersistentBuffStateRow,
  QuestProgressRow,
  CombatPreferencesRow,
  AutoBattleSkillRow,
  AutoUseItemRuleRow,
  ProfessionStateRow,
  EnhancementRecordRow,
  PlayerDomainPruneOptions,
  TechniqueComprehensionReplaceOptions,
} from './player-domain-persistence.service';
import {
  asRecord,
  decodeJsonValue,
  type RecoveryWatermarkColumn,
  type RecoveryWatermarkPatch,
  normalizeWorldPreferenceLinePreset,
} from './player-domain-persistence.helpers';
import {
  EQUIP_SLOTS,
  isLegacyItemInstanceId,
  createItemStackSignature,
  ARTIFACT_SLOTS,
  resolvePlayerFacingContentName,
  normalizeCombatAttackIntensity,
  DEFAULT_COMBAT_ATTACK_INTENSITY,
} from '@mud/shared';
import { randomUUID } from 'node:crypto';
import {
  assignStableItemInstanceId,
  upsertEquipmentSlotRowsWithItemInstanceIdRepair,
  type EquipmentSlotPersistenceRow,
  type ItemInstanceIdPersistenceRowSource,
} from './compat/item-instance-id-compat';
import {
  buildPersistedEquipmentItemRawPayload,
  buildPersistedInventoryItemRawPayload,
} from './inventory-item-persistence';
import {
  buildTechniqueStateRows,
  buildTechniqueComprehensionRows,
  buildTechniqueComprehensionEmptyOverwriteTechIds,
  buildPersistentBuffStateRows,
  buildQuestProgressRows,
  buildQuestProgressRawPayload,
  buildEnhancementRecordRows,
  buildEnhancementRecordRowsFromEntries,
  buildCombatPreferencesRow,
  buildAutoBattleSkillRows,
  buildAutoUseItemRuleRows,
  buildProfessionStateRows,
  buildAlchemyPresetRows,
  buildActiveJobRow,
  buildTechniqueActivityQueueRows,
  buildGenericTechniqueActiveJobRow,
  buildAlchemyActiveJobRow,
  normalizeJobStatus,
  buildAttrStateRow,
} from './player-domain-persistence.build-rows';

export function safeStringifyInventoryEntry(value: unknown): string {
  const MAX_DIGEST_LENGTH = 240;
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    serialized = '[unserializable]';
  }
  if (typeof serialized !== 'string') {
    return '[non-string]';
  }
  return serialized.length > MAX_DIGEST_LENGTH
    ? `${serialized.slice(0, MAX_DIGEST_LENGTH)}...`
    : serialized;
}

export function isSamePersistedPayload(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  return stableJsonStringify(left) === stableJsonStringify(right);
}

export function stableJsonStringify(value: unknown): string {
  if (value == null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJsonStringify(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries: string[] = [];
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      if (typeof entry === 'undefined' || typeof entry === 'function' || typeof entry === 'symbol') {
        continue;
      }
      entries.push(`${JSON.stringify(key)}:${stableJsonStringify(entry)}`);
    }
    return `{${entries.join(',')}}`;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  return 'null';
}

export function isExplicitEquipmentSlotProjection(slots: readonly unknown[]): boolean {
  if (!Array.isArray(slots) || slots.length < EQUIP_SLOTS.length) {
    return false;
  }
  const projectedSlots = new Set<string>();
  for (const slotEntry of slots) {
    const slotType = normalizeRequiredString(asRecord(slotEntry)?.slot);
    if (slotType) {
      projectedSlots.add(slotType);
    }
  }
  return EQUIP_SLOTS.every((slotType) => projectedSlots.has(slotType));
}

/**
 * 拒绝"用空 incoming 把整玩家分域表清空"的 SQL 层最终防御。
 *
 * 背景：玩家分域 replace 函数（inventory/wallet/equipment/market_storage/technique/buff/quest）末尾都有
 * 一段 `WHERE player_id = $1 AND NOT EXISTS (SELECT 1 FROM <incoming> ...)` 形态的 cleanup DELETE。
 * 当 incoming 为空数组时这条 SQL 退化为"无差别清空整玩家该域所有 row"，曾经被 ensureNativeStarterSnapshot
 * 的 silent-rebirth fallback（PG 读失败 → catch null → fall through 写空 starter）触发过事故。
 *
 * 这个 helper 在每个 replace 函数末尾的 cleanup DELETE 之前调用：
 * - incoming 不为空 → 正常进入 cleanup（合法 stale 删除）；
 * - incoming 为空 + PG 中该玩家在该域有 N>0 行 → throw，让 withTransaction 整体 rollback；
 * - incoming 为空 + PG 中本来也是空 → no-op 通过（合法零状态）。
 *
 * 玩家正常游戏中 inventory/equipment/market_storage 不会从有变成全空（至少有起步装备），
 * technique/buff/quest 同样不会一次清光。如果有合法 reset 场景，应该走显式专门 API，不能通过整快照 replace 触发。
 */
export async function refuseEmptyOverwriteIfRowsExist(
  client: PoolClient,
  tableName: string,
  playerId: string,
  incomingCount: number,
  domainTag: string,
): Promise<void> {
  if (incomingCount > 0) {
    return;
  }
  const result = await client.query(
    `SELECT 1 AS exists FROM ${tableName} WHERE player_id = $1 LIMIT 1`,
    [playerId],
  );
  if ((result.rowCount ?? 0) > 0) {
    throw new Error(
      `replace_${domainTag}_refused_empty_overwrite:playerId=${playerId} table=${tableName}`,
    );
  }
}

/**
 * 仅处理调用方已经显式允许的“空背包即清空持久化背包”语义。
 *
 * 单独收敛这个终止分支，避免边界审计把合法清空与“先整域 DELETE、再全量重插”的
 * 快照重写混为一谈；普通非空快照仍必须走下面的行级差量删除和 upsert。
 */
export async function deletePlayerInventoryForExplicitEmptySnapshot(
  client: PoolClient,
  playerId: string,
): Promise<void> {
  await client.query(`DELETE FROM ${PLAYER_INVENTORY_ITEM_TABLE} WHERE player_id = $1`, [playerId]);
}

export async function replacePlayerInventoryItems(
  client: PoolClient,
  playerId: string,
  items: unknown[],
  options: PlayerDomainPruneOptions = {},
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
  // 锁定行使用负数 slot_index 与常规背包行 (>=0) 自避让，避免命中 (player_id, slot_index)
  // 唯一约束。这样保留旧 DDL 约束语义、又不需要把约束改成 partial unique index。
  let lockedSlotCounter = -1;
  for (let index = 0; index < sourceItems.length; index += 1) {
    const entry = asRecord(sourceItems[index]);
    const itemId = normalizeRequiredString(entry?.itemId);
    if (!itemId) {
      // 静默 continue 是商业级 MMO 资产丢失的隐藏通道：玩家会无声丢东西，运维事后无法定位。
      // 这里改为抛错，让外层 withTransaction 整体 rollback（DELETE 也一起撤销），DB 维持
      // 上一次成功 flush 的状态；同时错误信息携带 playerId/index/原始 entry 摘要，便于排障。
      const entryDigest = safeStringifyInventoryEntry(sourceItems[index]);
      throw new Error(
        `replacePlayerInventoryItems: 非法 inventory entry 拒绝写入 playerId=${playerId} index=${index} entry=${entryDigest}`,
      );
    }
    const lockedBy = normalizeOptionalString(entry?.lockedBy);
    const slotIndex = lockedBy != null
      ? lockedSlotCounter--
      : (normalizeOptionalInteger(entry?.slotIndex) ?? index);
    const sourceItemInstanceId = normalizeOptionalString(entry?.itemInstanceId);
    let itemInstanceId = sourceItemInstanceId && !isLegacyItemInstanceId(sourceItemInstanceId)
      ? sourceItemInstanceId
      : `inv:${playerId}:${slotIndex}`;
    if (sourceItemInstanceId && isLegacyItemInstanceId(sourceItemInstanceId)) {
      playerDomainModuleLogger.debug(`背包物品携带 legacy itemInstanceId，走 fallback：playerId=${playerId} slot=${slotIndex} id=${sourceItemInstanceId}`);
    }
    const rawPayload = asRecord(entry?.rawPayload);
    const count = normalizeMinimumInteger(entry?.count, rawPayload?.count, 1);
    const persistedPayload = buildPersistedInventoryItemRawPayload({
      itemId,
      count,
      name: entry?.name,
      desc: entry?.desc,
      enhanceLevel: entry?.enhanceLevel,
      learnTechniqueId: entry?.learnTechniqueId,
      learnTechniqueMaxLevel: entry?.learnTechniqueMaxLevel,
      grade: entry?.grade,
      level: entry?.level,
      rawPayload,
    });
    if (lockedBy != null) {
      // 锁定空间还需要保留 lockedAt 才能在水合后还原 LockedItem 形态。lockedAt 不进
      // buildPersistedInventoryItemRawPayload（保持其"只 enhanceLevel"的最小 payload 语义），
      // 而是在 locked 行单独追加进 raw_payload。
      const lockedAt = normalizeOptionalInteger(entry?.lockedAt)
        ?? normalizeOptionalInteger(rawPayload?.lockedAt);
      if (lockedAt != null) {
        persistedPayload.lockedAt = lockedAt;
      }
    }
    const row = {
      item_instance_id: itemInstanceId,
      slot_index: slotIndex,
      item_id: itemId,
      count,
      raw_payload: persistedPayload,
      locked_by: lockedBy,
    };
    const persistedRowSignature = createPersistedInventoryRowSignature(itemId, persistedPayload);
    const existingRow = rowsByInstanceId.get(itemInstanceId);
    const existingRowSignature = existingRow
      ? createPersistedInventoryRowSignature(existingRow.item_id, existingRow.raw_payload)
      : null;
    if (existingRow) {
      if (
        existingRow.locked_by == null
        && lockedBy == null
        && existingRowSignature === persistedRowSignature
      ) {
        existingRow.count += count;
        continue;
      }
      if (
        existingRow.slot_index !== slotIndex
        || existingRow.item_id !== itemId
        || existingRow.locked_by !== lockedBy
        || existingRowSignature !== persistedRowSignature
      ) {
        if (lockedBy == null) {
          itemInstanceId = randomUUID();
          row.item_instance_id = itemInstanceId;
          rowsByInstanceId.set(itemInstanceId, row);
          continue;
        }
        if (existingRow.locked_by == null) {
          const reassignedExistingId = randomUUID();
          rowsByInstanceId.delete(itemInstanceId);
          existingRow.item_instance_id = reassignedExistingId;
          rowsByInstanceId.set(reassignedExistingId, existingRow);
          rowsByInstanceId.set(itemInstanceId, row);
          continue;
        }
        throw new Error(
          `replacePlayerInventoryItems: duplicate item_instance_id with conflicting payload playerId=${playerId} itemInstanceId=${itemInstanceId} existingSlot=${existingRow.slot_index} incomingSlot=${slotIndex} existingLockedBy=${existingRow.locked_by ?? 'null'} incomingLockedBy=${lockedBy ?? 'null'} existingItemId=${existingRow.item_id} incomingItemId=${itemId}`,
        );
      }
      existingRow.count += count;
      continue;
    }
    rowsByInstanceId.set(itemInstanceId, row);
  }
  const rows = assignUniqueInventorySlots(Array.from(rowsByInstanceId.values()));
  if (rows.length === 0) {
    if (options.allowEmptyOverwrite !== true) {
      await refuseEmptyOverwriteIfRowsExist(client, PLAYER_INVENTORY_ITEM_TABLE, playerId, 0, 'inventory');
      return;
    }
    await deletePlayerInventoryForExplicitEmptySnapshot(client, playerId);
    return;
  }

  const existingRowsResult = await client.query(
    `
      SELECT item_instance_id, slot_index, item_id, count, raw_payload, locked_by
      FROM ${PLAYER_INVENTORY_ITEM_TABLE}
      WHERE player_id = $1
      FOR UPDATE
    `,
    [playerId],
  );
  const existingRows = (existingRowsResult.rows ?? []).map((row) => ({
    item_instance_id: normalizeRequiredString(row?.item_instance_id),
    slot_index: normalizeIntegerWithFallback(row?.slot_index, 0),
    item_id: normalizeRequiredString(row?.item_id),
    count: normalizeMinimumInteger(row?.count, 1, 1),
    raw_payload: asRecord(decodeJsonValue(row?.raw_payload)) ?? {},
    locked_by: normalizeOptionalString(row?.locked_by),
  })).filter((row): row is PersistedInventoryRow => row.item_instance_id.length > 0 && row.item_id.length > 0);
  const existingRowsByInstanceId = new Map(existingRows.map((row) => [row.item_instance_id, row]));
  const incomingRowsByInstanceId = new Map(rows.map((row) => [row.item_instance_id, row]));

  const staleInstanceIds: string[] = [];
  const sameSlotUpdateRows: PersistedInventoryRow[] = [];
  const movedRows: Array<PersistedInventoryRow & { temp_slot_index: number }> = [];
  const newRows: PersistedInventoryRow[] = [];
  let tempSlotOffset = 0;

  for (const row of rows) {
    const existingRow = existingRowsByInstanceId.get(row.item_instance_id);
    if (!existingRow) {
      newRows.push(row);
      continue;
    }

    const sameSlotIdentity = existingRow.slot_index === row.slot_index
      && existingRow.item_id === row.item_id
      && existingRow.locked_by === row.locked_by;
    const samePayload = isSamePersistedPayload(existingRow.raw_payload, row.raw_payload);
    if (sameSlotIdentity && existingRow.count === row.count && samePayload) {
      continue;
    }
    if (sameSlotIdentity) {
      sameSlotUpdateRows.push(row);
      continue;
    }
    movedRows.push({
      ...row,
      temp_slot_index: INVENTORY_TEMP_SLOT_BASE + tempSlotOffset,
    });
    tempSlotOffset += 1;
  }

  for (const existingRow of existingRows) {
    if (!incomingRowsByInstanceId.has(existingRow.item_instance_id)) {
      staleInstanceIds.push(existingRow.item_instance_id);
    }
  }

  if (staleInstanceIds.length > 0) {
    await client.query(
      `DELETE FROM ${PLAYER_INVENTORY_ITEM_TABLE} WHERE player_id = $1 AND item_instance_id = ANY($2::varchar[])
      `,
      [playerId, staleInstanceIds],
    );
  }

  if (sameSlotUpdateRows.length > 0) {
    const sameSlotUpdateRowsJson = JSON.stringify(sameSlotUpdateRows);
    const result = await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            item_instance_id varchar(180),
            slot_index bigint,
            item_id varchar(160),
            count bigint,
            raw_payload jsonb,
            locked_by varchar(180)
          )
        )
        UPDATE ${PLAYER_INVENTORY_ITEM_TABLE} target
        SET
          item_id = incoming.item_id,
          count = incoming.count,
          raw_payload = COALESCE(incoming.raw_payload, '{}'::jsonb),
          locked_by = incoming.locked_by,
          updated_at = now()
        FROM incoming
        WHERE target.player_id = $1
          AND target.item_instance_id = incoming.item_instance_id
          AND target.slot_index = incoming.slot_index
          AND target.item_id = incoming.item_id
          AND target.locked_by IS NOT DISTINCT FROM incoming.locked_by
      `,
      [playerId, sameSlotUpdateRowsJson],
    );
    if ((result.rowCount ?? 0) !== sameSlotUpdateRows.length) {
      throw new Error(`replacePlayerInventoryItems: same-slot inventory update mismatch playerId=${playerId}`);
    }
  }

  if (movedRows.length > 0) {
    const movedRowsJson = JSON.stringify(movedRows);
    const stageResult = await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            item_instance_id varchar(180),
            temp_slot_index bigint,
            slot_index bigint,
            item_id varchar(160),
            count bigint,
            raw_payload jsonb,
            locked_by varchar(180)
          )
        )
        UPDATE ${PLAYER_INVENTORY_ITEM_TABLE} target
        SET
          slot_index = incoming.temp_slot_index,
          item_id = incoming.item_id,
          count = incoming.count,
          raw_payload = COALESCE(incoming.raw_payload, '{}'::jsonb),
          locked_by = incoming.locked_by,
          updated_at = now()
        FROM incoming
        WHERE target.player_id = $1
          AND target.item_instance_id = incoming.item_instance_id
      `,
      [playerId, movedRowsJson],
    );
    if ((stageResult.rowCount ?? 0) !== movedRows.length) {
      throw new Error(`replacePlayerInventoryItems: staged inventory move mismatch playerId=${playerId}`);
    }

    const finalizeResult = await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            item_instance_id varchar(180),
            slot_index bigint,
            temp_slot_index bigint
          )
        )
        UPDATE ${PLAYER_INVENTORY_ITEM_TABLE} target
        SET
          slot_index = incoming.slot_index,
          updated_at = now()
        FROM incoming
        WHERE target.player_id = $1
          AND target.item_instance_id = incoming.item_instance_id
          AND target.slot_index = incoming.temp_slot_index
      `,
      [playerId, movedRowsJson],
    );
    if ((finalizeResult.rowCount ?? 0) !== movedRows.length) {
      throw new Error(`replacePlayerInventoryItems: finalized inventory move mismatch playerId=${playerId}`);
    }
  }

  if (newRows.length > 0) {
    const newRowsJson = JSON.stringify(newRows);
    const result = await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            item_instance_id varchar(180),
            slot_index bigint,
            item_id varchar(160),
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
      `,
      [playerId, newRowsJson],
    );
    if ((result.rowCount ?? 0) !== newRows.length) {
      throw new Error(`replacePlayerInventoryItems: item_instance_id conflict outside player scope playerId=${playerId}`);
    }
  }
}

export function assignUniqueInventorySlots(rows: PersistedInventoryRow[]): PersistedInventoryRow[] {
  const occupiedSlots = new Set<number>();
  let nextVisibleSlot = 0;
  let nextLockedSlot = -1;
  return rows.map((row) => {
    const visible = row.locked_by == null;
    const requestedSlot = Number.isFinite(row.slot_index) ? Math.trunc(row.slot_index) : 0;
    if (
      (visible ? requestedSlot >= 0 : requestedSlot < 0)
      && !occupiedSlots.has(requestedSlot)
    ) {
      occupiedSlots.add(requestedSlot);
      return row;
    }
    if (visible) {
      while (occupiedSlots.has(nextVisibleSlot)) {
        nextVisibleSlot += 1;
      }
      const reassigned = { ...row, slot_index: nextVisibleSlot };
      occupiedSlots.add(nextVisibleSlot);
      nextVisibleSlot += 1;
      return reassigned;
    }
    while (occupiedSlots.has(nextLockedSlot)) {
      nextLockedSlot -= 1;
    }
    const reassigned = { ...row, slot_index: nextLockedSlot };
    occupiedSlots.add(nextLockedSlot);
    nextLockedSlot -= 1;
    return reassigned;
  });
}


export function createPersistedInventoryRowSignature(itemId: string, rawPayload: Record<string, unknown>): string {
  return createItemStackSignature({
    itemId,
    ...rawPayload,
  });
}

export async function replacePlayerWalletRows(
  client: PoolClient,
  playerId: string,
  rows: readonly PlayerWalletUpsertInput[],
  versionSeed: number,
  options: PlayerDomainPruneOptions = {},
): Promise<void> {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const normalizedRows: Array<{
    wallet_type: string;
    balance: number;
    frozen_balance: number;
    version: number;
  }> = [];
  for (const row of sourceRows) {
    const walletType = normalizeRequiredString(row?.walletType);
    if (!walletType) {
      throw new Error(
        `replacePlayerWalletRows: 非法 wallet entry 拒绝写入 playerId=${playerId} entry=${safeStringifyInventoryEntry(row)}`,
      );
    }
    const balance = normalizeMinimumInteger(row?.balance, 0, 0);
    const frozenBalance = normalizeMinimumInteger(row?.frozenBalance, 0, 0);
    const version = normalizeMinimumInteger(row?.version, versionSeed, 1);
    normalizedRows.push({
      wallet_type: walletType,
      balance,
      frozen_balance: frozenBalance,
      version,
    });
  }

  if (normalizedRows.length === 0) {
    if (options.allowEmptyOverwrite === true) {
      await deletePlayerWalletForExplicitEmptySnapshot(client, playerId);
      return;
    }
    await refuseEmptyOverwriteIfRowsExist(client, PLAYER_WALLET_TABLE, playerId, 0, 'wallet');
    return;
  }
  const normalizedRowsJson = JSON.stringify(normalizedRows);
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
    `,
    [playerId, normalizedRowsJson],
  );
  await refuseEmptyOverwriteIfRowsExist(client, PLAYER_WALLET_TABLE, playerId, normalizedRows.length, 'wallet');
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
    [playerId, normalizedRowsJson],
  );
}

/** 仅处理投影 payload 明确携带空钱包数组的合法清空。 */
export async function deletePlayerWalletForExplicitEmptySnapshot(
  client: PoolClient,
  playerId: string,
): Promise<void> {
  await client.query(`DELETE FROM ${PLAYER_WALLET_TABLE} WHERE player_id = $1`, [playerId]);
}

export async function replacePlayerMapUnlockRows(
  client: PoolClient,
  playerId: string,
  mapUnlocks: readonly unknown[],
  unlockedAtSeed: number,
): Promise<void> {
  const normalizedMapUnlocks = new Map<string, number>();
  for (const entry of Array.isArray(mapUnlocks) ? mapUnlocks : []) {
    const record = asRecord(entry);
    const mapId = normalizeRequiredString(record?.mapId ?? entry);
    if (!mapId) {
      continue;
    }
    const unlockedAt = normalizeOptionalInteger(record?.unlockedAt) ?? unlockedAtSeed;
    if (!normalizedMapUnlocks.has(mapId) || unlockedAt < (normalizedMapUnlocks.get(mapId) ?? unlockedAt)) {
      normalizedMapUnlocks.set(mapId, unlockedAt);
    }
  }
  const rows = Array.from(normalizedMapUnlocks.entries()).map(([mapId, unlockedAt]) => ({
    map_id: mapId,
    unlocked_at: unlockedAt,
  }));
  const normalizedRowsJson = JSON.stringify(rows);

  if (rows.length > 0) {
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(map_id varchar(120), unlocked_at bigint)
        )
        INSERT INTO ${PLAYER_MAP_UNLOCK_TABLE}(
          player_id,
          map_id,
          unlocked_at,
          updated_at
        )
        SELECT $1, map_id, unlocked_at, now()
        FROM incoming
        ON CONFLICT (player_id, map_id)
        DO UPDATE SET
          unlocked_at = EXCLUDED.unlocked_at,
          updated_at = now()
      `,
      [playerId, normalizedRowsJson],
    );
  }
  await prunePlayerRowsBySnapshotKeys(
    client,
    PLAYER_MAP_UNLOCK_TABLE,
    playerId,
    rows.map(({ map_id }) => ({ map_id })),
    'map_id varchar(120)',
    'incoming.map_id = target.map_id',
  );
}

export async function replacePlayerMarketStorageItems(
  client: PoolClient,
  playerId: string,
  items: readonly PlayerMarketStorageItemUpsertInput[],
): Promise<void> {
  if (!Array.isArray(items) || items.length === 0) {
    await refuseEmptyOverwriteIfRowsExist(client, PLAYER_MARKET_STORAGE_ITEM_TABLE, playerId, 0, 'market_storage');
    return;
  }

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
  for (let index = 0; index < items.length; index += 1) {
    const entry = items[index];
    const itemId = normalizeRequiredString(entry?.itemId);
    if (!itemId) {
      throw new Error(
        `replacePlayerMarketStorageItems: 非法 market_storage entry 拒绝写入 playerId=${playerId} index=${index} entry=${safeStringifyInventoryEntry(entry)}`,
      );
    }
    const slotIndex = normalizeOptionalInteger(entry?.slotIndex) ?? index;
    if (slotIndex < 0) {
      throw new Error(`replacePlayerMarketStorageItems: invalid slot_index playerId=${playerId} slotIndex=${slotIndex}`);
    }
    const storageItemId = `market_storage:${playerId}:${slotIndex}`;
    const rawPayload = asRecord(entry?.rawPayload);
    const count = normalizeMinimumInteger(entry?.count, rawPayload?.count, 1);
    const enhanceLevel = normalizeOptionalInteger(entry?.enhanceLevel ?? rawPayload?.enhanceLevel ?? rawPayload?.enhancementLevel ?? rawPayload?.level);
    const persistedPayload = buildPersistedInventoryItemRawPayload({
      itemId,
      count,
      name: entry?.name,
      desc: entry?.desc,
      enhanceLevel,
      learnTechniqueId: entry?.learnTechniqueId,
      learnTechniqueMaxLevel: entry?.learnTechniqueMaxLevel,
      grade: entry?.grade,
      level: entry?.level,
      rawPayload,
    });
    const row = {
      storage_item_id: storageItemId,
      slot_index: slotIndex,
      item_id: itemId,
      count,
      enhance_level: enhanceLevel,
      raw_payload: persistedPayload,
    };
    const existingSlotRow = rowsBySlotIndex.get(slotIndex);
    if (existingSlotRow) {
      if (
        existingSlotRow.storage_item_id !== storageItemId
        || existingSlotRow.item_id !== itemId
        || existingSlotRow.count !== count
        || existingSlotRow.enhance_level !== enhanceLevel
        || !isSamePersistedPayload(existingSlotRow.raw_payload, persistedPayload)
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

  if (rows.length === 0) {
    await prunePlayerMarketStorageStaleSlots(client, playerId, []);
    return;
  }

  const result = await client.query(
    `
      WITH incoming AS (
        SELECT *
        FROM jsonb_to_recordset($2::jsonb) AS entry(
          storage_item_id varchar(160),
          slot_index bigint,
          item_id varchar(160),
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
    [playerId, JSON.stringify(rows)],
  );
  if ((result.rowCount ?? 0) !== rows.length) {
    throw new Error(`replacePlayerMarketStorageItems: storage_item_id conflict outside player scope playerId=${playerId}`);
  }
  await prunePlayerMarketStorageStaleSlots(client, playerId, rows.map((entry) => entry.slot_index));
}

export async function prunePlayerMarketStorageStaleSlots(
  client: PoolClient,
  playerId: string,
  slotIndices: readonly number[],
): Promise<void> {
  if (slotIndices.length === 0) {
    return;
  }
  await refuseEmptyOverwriteIfRowsExist(
    client,
    PLAYER_MARKET_STORAGE_ITEM_TABLE,
    playerId,
    slotIndices.length,
    'market_storage',
  );
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
    [
      playerId,
      JSON.stringify(slotIndices.map((slotIndex) => ({ slot_index: Math.max(0, Math.trunc(Number(slotIndex))) }))),
    ],
  );
}

export async function prunePlayerRowsBySnapshotKeys(
  client: PoolClient,
  tableName: string,
  playerId: string,
  keys: readonly Record<string, unknown>[],
  recordsetColumns: string,
  matchPredicate: string,
  options: PlayerDomainPruneOptions = {},
): Promise<void> {
  // 把 PG 表名 (e.g. 'player_inventory_item') 转成 domain tag (e.g. 'inventory_item') 用于错误日志。
  // SQL 表名是稳定的常量，不会出现注入风险；这里只是给运维一个比 tableName 短的 tag。
  const domainTag = typeof tableName === 'string'
    ? tableName.replace(/^player_/u, '').replace(/_table$/u, '') || tableName
    : 'unknown';
  if (options.allowEmptyOverwrite !== true) {
    await refuseEmptyOverwriteIfRowsExist(client, tableName, playerId, keys.length, domainTag);
  }
  await client.query(
    `
      WITH incoming AS (
        SELECT *
        FROM jsonb_to_recordset($2::jsonb) AS entry(${recordsetColumns})
      )
      DELETE FROM ${tableName} target
      WHERE target.player_id = $1
        AND NOT EXISTS (
          SELECT 1
          FROM incoming
          WHERE ${matchPredicate}
        )
    `,
    [playerId, JSON.stringify(keys)],
  );
}

export async function replacePlayerEquipmentSlots(
  client: PoolClient,
  playerId: string,
  slots: unknown[],
  options: PlayerDomainPruneOptions = {},
): Promise<void> {
  const rowsBySlotType = new Map<string, EquipmentSlotPersistenceRow>();
  const rowsByInstanceId = new Map<string, EquipmentSlotPersistenceRow>();
  const equipmentRowSources = new Map<EquipmentSlotPersistenceRow, ItemInstanceIdPersistenceRowSource>();
  for (const slotEntry of Array.isArray(slots) ? slots : []) {
    const entry = asRecord(slotEntry);
    const slotType = normalizeRequiredString(entry?.slot);
    if (!EQUIP_SLOTS.includes(slotType as (typeof EQUIP_SLOTS)[number])) {
      throw new Error(
        `replacePlayerEquipmentSlots: 非法 equipment slot 拒绝写入 playerId=${playerId} slot=${slotType || 'null'} entry=${safeStringifyInventoryEntry(slotEntry)}`,
      );
    }
    const item = asRecord(entry?.item);
    if (!item) {
      continue;
    }
    const itemId = normalizeRequiredString(item?.itemId);
    if (!itemId) {
      throw new Error(
        `replacePlayerEquipmentSlots: 非法 equipment item 拒绝写入 playerId=${playerId} slot=${slotType} entry=${safeStringifyInventoryEntry(slotEntry)}`,
      );
    }
    const itemInstanceId = assignStableItemInstanceId(
      normalizeOptionalString(entry?.itemInstanceId) || normalizeOptionalString(item?.itemInstanceId),
      { entry, item },
    );
    const persistedPayload = buildPersistedEquipmentItemRawPayload({
      itemId,
      slot: slotType,
      enhanceLevel: item?.enhanceLevel,
      rawPayload: item,
    });
    const row = {
      slot_type: slotType,
      item_instance_id: itemInstanceId,
      item_id: itemId,
      raw_payload: persistedPayload,
    };
    const existingSlotRow = rowsBySlotType.get(slotType);
    if (existingSlotRow) {
      if (
        existingSlotRow.item_instance_id !== itemInstanceId
        || existingSlotRow.item_id !== itemId
        || !isSamePersistedPayload(existingSlotRow.raw_payload, persistedPayload)
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
    equipmentRowSources.set(row, { entry, item });
  }
  const rows = Array.from(rowsBySlotType.values());
  const rowsJson = JSON.stringify(rows);

  if (rows.length === 0) {
    if (options.allowEmptyOverwrite === true) {
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
        [playerId, rowsJson],
      );
    } else {
      await refuseEmptyOverwriteIfRowsExist(client, PLAYER_EQUIPMENT_SLOT_TABLE, playerId, 0, 'equipment');
    }
    return;
  }

  await upsertEquipmentSlotRowsWithItemInstanceIdRepair(client, playerId, rows, equipmentRowSources);
  if (options.allowEmptyOverwrite !== true) {
    await refuseEmptyOverwriteIfRowsExist(client, PLAYER_EQUIPMENT_SLOT_TABLE, playerId, rows.length, 'equipment');
  }
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
    [playerId, rowsJson],
  );
}

export async function replacePlayerArtifactSlots(
  client: PoolClient,
  playerId: string,
  slots: unknown[],
  options: PlayerDomainPruneOptions = {},
): Promise<void> {
  const rowsBySlotType = new Map<string, {
    slot_type: string;
    unlocked: boolean;
    enabled: boolean;
    qi: number;
    max_qi: number;
    item_instance_id: string | null;
    item_id: string | null;
    raw_payload: Record<string, unknown>;
  }>();
  const rowsByInstanceId = new Map<string, string>();
  for (const slotEntry of Array.isArray(slots) ? slots : []) {
    const entry = asRecord(slotEntry);
    const slotType = normalizeRequiredString(entry?.slot);
    if (!ARTIFACT_SLOTS.includes(slotType as (typeof ARTIFACT_SLOTS)[number])) {
      throw new Error(
        `replacePlayerArtifactSlots: 非法 artifact slot 拒绝写入 playerId=${playerId} slot=${slotType || 'null'} entry=${safeStringifyInventoryEntry(slotEntry)}`,
      );
    }
    const item = asRecord(entry?.item);
    const itemId = item ? normalizeRequiredString(item.itemId) : '';
    if (item && !itemId) {
      throw new Error(
        `replacePlayerArtifactSlots: 非法 artifact item 拒绝写入 playerId=${playerId} slot=${slotType} entry=${safeStringifyInventoryEntry(slotEntry)}`,
      );
    }
    const itemInstanceId = item
      ? assignStableItemInstanceId(
        normalizeOptionalString(entry?.itemInstanceId) || normalizeOptionalString(item.itemInstanceId),
        { entry, item },
      )
      : null;
    if (itemInstanceId) {
      const existingSlotType = rowsByInstanceId.get(itemInstanceId);
      if (existingSlotType && existingSlotType !== slotType) {
        throw new Error(
          `replacePlayerArtifactSlots: duplicate item_instance_id with conflicting slot playerId=${playerId} itemInstanceId=${itemInstanceId} slots=${existingSlotType},${slotType}`,
        );
      }
      rowsByInstanceId.set(itemInstanceId, slotType);
    }
    const row = {
      slot_type: slotType,
      unlocked: entry?.unlocked === true,
      enabled: entry?.enabled !== false,
      qi: normalizeMinimumNumber(entry?.qi, 0, 0),
      max_qi: normalizeMinimumNumber(entry?.maxQi, 0, 0),
      item_instance_id: itemInstanceId,
      item_id: item ? itemId : null,
      raw_payload: item
        ? buildPersistedInventoryItemRawPayload({
          itemId,
          count: 1,
          rawPayload: item,
        })
        : {},
    };
    const existingSlotRow = rowsBySlotType.get(slotType);
    if (existingSlotRow) {
      if (
        existingSlotRow.unlocked !== row.unlocked
        || existingSlotRow.enabled !== row.enabled
        || existingSlotRow.qi !== row.qi
        || existingSlotRow.max_qi !== row.max_qi
        || existingSlotRow.item_instance_id !== row.item_instance_id
        || existingSlotRow.item_id !== row.item_id
        || !isSamePersistedPayload(existingSlotRow.raw_payload, row.raw_payload)
      ) {
        throw new Error(
          `replacePlayerArtifactSlots: duplicate slot with conflicting payload playerId=${playerId} slot=${slotType}`,
        );
      }
      continue;
    }
    rowsBySlotType.set(slotType, row);
  }
  const rows = Array.from(rowsBySlotType.values());
  const rowsJson = JSON.stringify(rows);

  if (rows.length === 0) {
    if (options.allowEmptyOverwrite === true) {
      await client.query(`DELETE FROM ${PLAYER_ARTIFACT_SLOT_TABLE} WHERE player_id = $1`, [playerId]);
    } else {
      await refuseEmptyOverwriteIfRowsExist(client, PLAYER_ARTIFACT_SLOT_TABLE, playerId, 0, 'artifact');
    }
    return;
  }

  await client.query(
    `
      WITH incoming AS (
        SELECT
          slot_type,
          unlocked,
          enabled,
          qi,
          max_qi,
          item_instance_id,
          item_id,
          raw_payload
        FROM jsonb_to_recordset($2::jsonb) AS entry(
          slot_type varchar(40),
          unlocked boolean,
          enabled boolean,
          qi double precision,
          max_qi double precision,
          item_instance_id varchar(180),
          item_id varchar(120),
          raw_payload jsonb
        )
      )
      INSERT INTO ${PLAYER_ARTIFACT_SLOT_TABLE}(
        player_id,
        slot_type,
        unlocked,
        enabled,
        qi,
        max_qi,
        item_instance_id,
        item_id,
        raw_payload,
        updated_at
      )
      SELECT
        $1,
        slot_type,
        COALESCE(unlocked, false),
        COALESCE(enabled, true),
        GREATEST(0, COALESCE(qi, 0)),
        GREATEST(0, COALESCE(max_qi, 0)),
        item_instance_id,
        item_id,
        COALESCE(raw_payload, '{}'::jsonb),
        now()
      FROM incoming
      ON CONFLICT (player_id, slot_type)
      DO UPDATE SET
        unlocked = EXCLUDED.unlocked,
        enabled = EXCLUDED.enabled,
        qi = EXCLUDED.qi,
        max_qi = EXCLUDED.max_qi,
        item_instance_id = EXCLUDED.item_instance_id,
        item_id = EXCLUDED.item_id,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = now()
    `,
    [playerId, rowsJson],
  );
  if (options.allowEmptyOverwrite !== true) {
    await refuseEmptyOverwriteIfRowsExist(client, PLAYER_ARTIFACT_SLOT_TABLE, playerId, rows.length, 'artifact');
  }
  await client.query(
    `
      WITH incoming AS (
        SELECT slot_type
        FROM jsonb_to_recordset($2::jsonb) AS entry(slot_type varchar(40))
      )
      DELETE FROM ${PLAYER_ARTIFACT_SLOT_TABLE} target
      WHERE target.player_id = $1
        AND NOT EXISTS (
          SELECT 1
          FROM incoming
          WHERE incoming.slot_type = target.slot_type
        )
    `,
    [playerId, rowsJson],
  );
}

export async function replacePlayerTechniqueStates(
  client: PoolClient,
  playerId: string,
  rows: TechniqueStateRow[],
): Promise<void> {
  const normalizedRows = rows.map((row) => ({
    tech_id: row.techId,
    level: row.level,
    exp: row.exp,
    exp_to_next: row.expToNext,
    realm_lv: row.realmLv,
    skills_enabled: row.skillsEnabled,
    raw_payload: row.rawPayload,
  }));
  const normalizedRowsJson = JSON.stringify(normalizedRows);
  if (normalizedRows.length > 0) {
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            tech_id varchar(120),
            level bigint,
            exp double precision,
            exp_to_next double precision,
            realm_lv bigint,
            skills_enabled boolean,
            raw_payload jsonb
          )
        )
        INSERT INTO ${PLAYER_TECHNIQUE_STATE_TABLE}(
          player_id,
          tech_id,
          level,
          exp,
          exp_to_next,
          realm_lv,
          skills_enabled,
          raw_payload,
          updated_at
        )
        SELECT $1, tech_id, level, exp, exp_to_next, realm_lv, skills_enabled, COALESCE(raw_payload, '{}'::jsonb), now()
        FROM incoming
        ON CONFLICT (player_id, tech_id)
        DO UPDATE SET
          level = EXCLUDED.level,
          exp = EXCLUDED.exp,
          exp_to_next = EXCLUDED.exp_to_next,
          realm_lv = EXCLUDED.realm_lv,
          skills_enabled = EXCLUDED.skills_enabled,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = now()
      `,
      [playerId, normalizedRowsJson],
    );
  }
  await prunePlayerRowsBySnapshotKeys(
    client,
    PLAYER_TECHNIQUE_STATE_TABLE,
    playerId,
    normalizedRows.map(({ tech_id }) => ({ tech_id })),
    'tech_id varchar(120)',
    'incoming.tech_id = target.tech_id',
  );
}

export async function replacePlayerTechniqueComprehensions(
  client: PoolClient,
  playerId: string,
  rows: TechniqueComprehensionRow[],
  options: TechniqueComprehensionReplaceOptions = {},
): Promise<void> {
  const normalizedRows = rows.map((row) => ({
    tech_id: row.techId,
    source_kind: row.sourceKind,
    progress: row.progress,
    required_progress: row.requiredProgress,
    realm_lv: row.realmLv,
    grade: row.grade,
    category: row.category,
    creator_player_id: row.creatorPlayerId,
    self_comprehension_allowed: row.selfComprehensionAllowed,
    created_at_tick: row.createdAtTick,
    updated_at_tick: row.updatedAtTick,
    active_transfer_job_id: row.activeTransferJobId,
    active_transfer_teacher_id: row.activeTransferTeacherId,
    raw_payload: row.rawPayload,
  }));
  if (normalizedRows.length > 0) {
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            tech_id varchar(120),
            source_kind varchar(24),
            progress double precision,
            required_progress double precision,
            realm_lv bigint,
            grade varchar(32),
            category varchar(32),
            creator_player_id varchar(100),
            self_comprehension_allowed boolean,
            created_at_tick bigint,
            updated_at_tick bigint,
            active_transfer_job_id varchar(180),
            active_transfer_teacher_id varchar(100),
            raw_payload jsonb
          )
        )
        INSERT INTO ${PLAYER_TECHNIQUE_COMPREHENSION_TABLE}(
          player_id,
          tech_id,
          source_kind,
          progress,
          required_progress,
          realm_lv,
          grade,
          category,
          creator_player_id,
          self_comprehension_allowed,
          created_at_tick,
          updated_at_tick,
          active_transfer_job_id,
          active_transfer_teacher_id,
          raw_payload,
          updated_at
        )
        SELECT $1, tech_id, source_kind, progress, required_progress, realm_lv, grade, category, creator_player_id, COALESCE(self_comprehension_allowed, true), COALESCE(created_at_tick, 0), COALESCE(updated_at_tick, 0), active_transfer_job_id, active_transfer_teacher_id, COALESCE(raw_payload, '{}'::jsonb), now()
        FROM incoming
        ON CONFLICT (player_id, tech_id)
        DO UPDATE SET
          source_kind = EXCLUDED.source_kind,
          progress = EXCLUDED.progress,
          required_progress = EXCLUDED.required_progress,
          realm_lv = EXCLUDED.realm_lv,
          grade = EXCLUDED.grade,
          category = EXCLUDED.category,
          creator_player_id = EXCLUDED.creator_player_id,
          self_comprehension_allowed = EXCLUDED.self_comprehension_allowed,
          created_at_tick = EXCLUDED.created_at_tick,
          updated_at_tick = EXCLUDED.updated_at_tick,
          active_transfer_job_id = EXCLUDED.active_transfer_job_id,
          active_transfer_teacher_id = EXCLUDED.active_transfer_teacher_id,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = now()
      `,
      [playerId, JSON.stringify(normalizedRows)],
    );
  }
  const allowEmptyOverwrite = normalizedRows.length === 0
    ? await canPruneEmptyTechniqueComprehensionsWithClient(
      client,
      playerId,
      options.completedTechniqueIds,
      options.allowExplicitEmptyOverwrite === true,
      options.explicitlyRemovedTechniqueIds,
    )
    : false;
  await prunePlayerRowsBySnapshotKeys(
    client,
    PLAYER_TECHNIQUE_COMPREHENSION_TABLE,
    playerId,
    normalizedRows.map(({ tech_id }) => ({ tech_id })),
    'tech_id varchar(120)',
    'incoming.tech_id = target.tech_id',
    { allowEmptyOverwrite },
  );
}

export async function canPruneEmptyTechniqueComprehensionsWithClient(
  client: PoolClient,
  playerId: string,
  completedTechniqueIds: ReadonlySet<string> | undefined,
  allowExplicitEmptyOverwrite: boolean,
  explicitlyRemovedTechniqueIds: ReadonlySet<string> | undefined,
): Promise<boolean> {
  if (
    !allowExplicitEmptyOverwrite
    && (!completedTechniqueIds || completedTechniqueIds.size === 0)
    && (!explicitlyRemovedTechniqueIds || explicitlyRemovedTechniqueIds.size === 0)
  ) {
    return false;
  }
  const result = await client.query<{ tech_id: string }>(
    `SELECT tech_id FROM ${PLAYER_TECHNIQUE_COMPREHENSION_TABLE} WHERE player_id = $1`,
    [playerId],
  );
  const existingTechIds = result.rows
    .map((row) => normalizeRequiredString(row.tech_id))
    .filter((techId) => techId.length > 0);
  return canPruneEmptyTechniqueComprehensions(
    existingTechIds,
    completedTechniqueIds,
    allowExplicitEmptyOverwrite,
    explicitlyRemovedTechniqueIds,
  );
}

/** 空 pending 快照只接受完成态闭环或显式放弃授权，普通空投影继续 fail closed。 */
export function canPruneEmptyTechniqueComprehensions(
  existingTechniqueIds: readonly string[],
  completedTechniqueIds: ReadonlySet<string> | undefined,
  allowExplicitEmptyOverwrite: boolean,
  explicitlyRemovedTechniqueIds: ReadonlySet<string> | undefined = undefined,
): boolean {
  const normalizedExplicitlyRemovedIds = new Set(
    Array.from(explicitlyRemovedTechniqueIds ?? [], (techniqueId) => normalizeRequiredString(techniqueId))
      .filter((techniqueId) => techniqueId.length > 0),
  );
  // 兼容修复发布前已经 durable staging 的显式放弃 payload；新 payload 必须携带精确功法 ID。
  if (allowExplicitEmptyOverwrite && normalizedExplicitlyRemovedIds.size === 0) {
    return true;
  }
  const normalizedExistingIds = existingTechniqueIds
    .map((techniqueId) => normalizeRequiredString(techniqueId))
    .filter((techniqueId) => techniqueId.length > 0);
  if (normalizedExistingIds.length === 0) {
    return false;
  }
  return normalizedExistingIds.every((techniqueId) =>
    completedTechniqueIds?.has(techniqueId) === true
    || normalizedExplicitlyRemovedIds.has(techniqueId),
  );
}

export async function replacePlayerPersistentBuffStates(
  client: PoolClient,
  playerId: string,
  rows: PersistentBuffStateRow[],
  options: PlayerDomainWriteOptions = {},
): Promise<void> {
  const normalizedRows = rows.map((row) => ({
    buff_id: row.buffId,
    source_skill_id: row.sourceSkillId,
    source_caster_id: row.sourceCasterId,
    realm_lv: row.realmLv,
    remaining_ticks: row.remainingTicks,
    duration: row.duration,
    stacks: row.stacks,
    max_stacks: row.maxStacks,
    sustain_ticks_elapsed: row.sustainTicksElapsed,
    raw_payload: row.rawPayload,
  }));
  const normalizedRowsJson = JSON.stringify(normalizedRows);
  if (normalizedRows.length > 0) {
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            buff_id varchar(160),
            source_skill_id varchar(160),
            source_caster_id varchar(120),
            realm_lv bigint,
            remaining_ticks bigint,
            duration bigint,
            stacks bigint,
            max_stacks bigint,
            sustain_ticks_elapsed bigint,
            raw_payload jsonb
          )
        )
        INSERT INTO ${PLAYER_PERSISTENT_BUFF_STATE_TABLE}(
          player_id,
          buff_id,
          source_skill_id,
          source_caster_id,
          realm_lv,
          remaining_ticks,
          duration,
          stacks,
          max_stacks,
          sustain_ticks_elapsed,
          raw_payload,
          updated_at
        )
        SELECT $1, buff_id, source_skill_id, source_caster_id, realm_lv, remaining_ticks, duration, stacks, max_stacks, sustain_ticks_elapsed, COALESCE(raw_payload, '{}'::jsonb), now()
        FROM incoming
        ON CONFLICT (player_id, buff_id, source_skill_id)
        DO UPDATE SET
          source_caster_id = EXCLUDED.source_caster_id,
          realm_lv = EXCLUDED.realm_lv,
          remaining_ticks = EXCLUDED.remaining_ticks,
          duration = EXCLUDED.duration,
          stacks = EXCLUDED.stacks,
          max_stacks = EXCLUDED.max_stacks,
          sustain_ticks_elapsed = EXCLUDED.sustain_ticks_elapsed,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = now()
      `,
      [playerId, normalizedRowsJson],
    );
  }
  await prunePlayerRowsBySnapshotKeys(
    client,
    PLAYER_PERSISTENT_BUFF_STATE_TABLE,
    playerId,
    normalizedRows.map(({ buff_id, source_skill_id }) => ({ buff_id, source_skill_id })),
    'buff_id varchar(160), source_skill_id varchar(160)',
    'incoming.buff_id = target.buff_id AND incoming.source_skill_id = target.source_skill_id',
    { allowEmptyOverwrite: options.allowBuffEmptyOverwrite === true },
  );
}

export async function replacePlayerQuestProgressRows(
  client: PoolClient,
  playerId: string,
  rows: QuestProgressRow[],
): Promise<void> {
  const normalizedRows = rows.map((row) => {
    const status = normalizeOptionalString(row.status) ?? 'active';
    return {
      quest_id: row.questId,
      status,
      progress_payload: status === 'completed' ? null : row.progressPayload,
      raw_payload: buildQuestProgressRawPayload(row.rawPayload ?? {}, row.questId, status),
    };
  });
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
  await prunePlayerRowsBySnapshotKeys(
    client,
    PLAYER_QUEST_PROGRESS_TABLE,
    playerId,
    normalizedRows.map(({ quest_id }) => ({ quest_id })),
    'quest_id varchar(120)',
    'incoming.quest_id = target.quest_id',
  );
}

export async function replacePlayerCombatPreferences(
  client: PoolClient,
  playerId: string,
  row: CombatPreferencesRow | null,
): Promise<void> {
  if (!row) {
    await client.query(`DELETE FROM ${PLAYER_COMBAT_PREFERENCES_TABLE} WHERE player_id = $1`, [playerId]);
    return;
  }

  await client.query(
    `
      INSERT INTO ${PLAYER_COMBAT_PREFERENCES_TABLE}(
        player_id,
        auto_battle,
        auto_retaliate,
        auto_battle_stationary,
        auto_battle_targeting_mode,
        retaliate_player_target_id,
        retaliate_player_target_last_attack_tick,
        combat_target_id,
        combat_target_locked,
        allow_aoe_player_hit,
        auto_idle_cultivation,
        auto_switch_cultivation,
        auto_root_foundation,
        combat_attack_intensity,
        sense_qi_active,
        cultivation_active,
        cultivating_tech_id,
        targeting_rules_payload,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        auto_battle = EXCLUDED.auto_battle,
        auto_retaliate = EXCLUDED.auto_retaliate,
        auto_battle_stationary = EXCLUDED.auto_battle_stationary,
        auto_battle_targeting_mode = EXCLUDED.auto_battle_targeting_mode,
        retaliate_player_target_id = EXCLUDED.retaliate_player_target_id,
        retaliate_player_target_last_attack_tick = EXCLUDED.retaliate_player_target_last_attack_tick,
        combat_target_id = EXCLUDED.combat_target_id,
        combat_target_locked = EXCLUDED.combat_target_locked,
        allow_aoe_player_hit = EXCLUDED.allow_aoe_player_hit,
        auto_idle_cultivation = EXCLUDED.auto_idle_cultivation,
        auto_switch_cultivation = EXCLUDED.auto_switch_cultivation,
        auto_root_foundation = EXCLUDED.auto_root_foundation,
        combat_attack_intensity = EXCLUDED.combat_attack_intensity,
        sense_qi_active = EXCLUDED.sense_qi_active,
        cultivation_active = EXCLUDED.cultivation_active,
        cultivating_tech_id = EXCLUDED.cultivating_tech_id,
        targeting_rules_payload = EXCLUDED.targeting_rules_payload,
        updated_at = now()
    `,
    [
      playerId,
      row.autoBattle,
      row.autoRetaliate,
      row.autoBattleStationary,
      row.autoBattleTargetingMode,
      row.retaliatePlayerTargetId,
      row.retaliatePlayerTargetLastAttackTick,
      row.combatTargetId,
      row.combatTargetLocked,
      row.allowAoePlayerHit,
      row.autoIdleCultivation,
      row.autoSwitchCultivation,
      row.autoRootFoundation,
      row.combatAttackIntensity,
      row.senseQiActive,
      row.cultivationActive,
      row.cultivatingTechId,
      JSON.stringify(row.targetingRulesPayload),
    ],
  );
}

export async function replacePlayerAutoBattleSkills(
  client: PoolClient,
  playerId: string,
  rows: AutoBattleSkillRow[],
): Promise<void> {
  const normalizedRows = rows.map((row) => ({
    skill_id: row.skillId,
    enabled: row.enabled,
    skill_enabled: row.skillEnabled,
    auto_battle_order: row.autoBattleOrder,
  }));
  if (normalizedRows.length > 0) {
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            skill_id varchar(120),
            enabled boolean,
            skill_enabled boolean,
            auto_battle_order bigint
          )
        )
        INSERT INTO ${PLAYER_AUTO_BATTLE_SKILL_TABLE}(
          player_id,
          skill_id,
          enabled,
          skill_enabled,
          auto_battle_order,
          updated_at
        )
        SELECT $1, skill_id, enabled, skill_enabled, auto_battle_order, now()
        FROM incoming
        ON CONFLICT (player_id, skill_id)
        DO UPDATE SET
          enabled = EXCLUDED.enabled,
          skill_enabled = EXCLUDED.skill_enabled,
          auto_battle_order = EXCLUDED.auto_battle_order,
          updated_at = now()
      `,
      [playerId, JSON.stringify(normalizedRows)],
    );
  }
  await prunePlayerRowsBySnapshotKeys(
    client,
    PLAYER_AUTO_BATTLE_SKILL_TABLE,
    playerId,
    normalizedRows.map(({ skill_id }) => ({ skill_id })),
    'skill_id varchar(120)',
    'incoming.skill_id = target.skill_id',
    // 自动战斗技能列表是玩家偏好，清空列表表示关闭配置，不属于资产/进度空覆盖事故。
    { allowEmptyOverwrite: true },
  );
}

export async function replacePlayerAutoUseItemRules(
  client: PoolClient,
  playerId: string,
  rows: AutoUseItemRuleRow[],
): Promise<void> {
  const normalizedRows = rows.map((row) => ({
    item_id: row.itemId,
    condition_payload: row.conditionPayload,
  }));
  if (normalizedRows.length > 0) {
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(item_id varchar(120), condition_payload jsonb)
        )
        INSERT INTO ${PLAYER_AUTO_USE_ITEM_RULE_TABLE}(
          player_id,
          item_id,
          condition_payload,
          updated_at
        )
        SELECT $1, item_id, COALESCE(condition_payload, '{}'::jsonb), now()
        FROM incoming
        ON CONFLICT (player_id, item_id)
        DO UPDATE SET
          condition_payload = EXCLUDED.condition_payload,
          updated_at = now()
      `,
      [playerId, JSON.stringify(normalizedRows)],
    );
  }
  await prunePlayerRowsBySnapshotKeys(
    client,
    PLAYER_AUTO_USE_ITEM_RULE_TABLE,
    playerId,
    normalizedRows.map(({ item_id }) => ({ item_id })),
    'item_id varchar(120)',
    'incoming.item_id = target.item_id',
    // 自动用药规则是玩家偏好，清空列表表示关闭配置，不属于资产/进度空覆盖事故。
    { allowEmptyOverwrite: true },
  );
}

export async function replacePlayerBodyTrainingState(
  client: PoolClient,
  playerId: string,
  row:
    | {
        level?: unknown;
        exp?: unknown;
        expToNext?: unknown;
      }
    | null,
): Promise<void> {
  await client.query(`DELETE FROM ${PLAYER_BODY_TRAINING_STATE_TABLE} WHERE player_id = $1`, [playerId]);
  if (!row) {
    return;
  }

  await client.query(
    `
      INSERT INTO ${PLAYER_BODY_TRAINING_STATE_TABLE}(
        player_id,
        level,
        exp,
        exp_to_next,
        updated_at
      )
      VALUES ($1, $2, $3, $4, now())
    `,
    [
      playerId,
      normalizeMinimumInteger(row.level, 0, 0),
      normalizeMinimumNumber(row.exp, 0, 0),
      normalizeMinimumNumber(row.expToNext, 1, 1),
    ],
  );
}

export async function replacePlayerAttrState(
  client: PoolClient,
  playerId: string,
  row: AttrStateRow | null,
): Promise<void> {
  if (!row) {
    await client.query(`DELETE FROM ${PLAYER_ATTR_STATE_TABLE} WHERE player_id = $1`, [playerId]);
    return;
  }

  await client.query(
    `
      INSERT INTO ${PLAYER_ATTR_STATE_TABLE}(
        player_id,
        base_attrs_payload,
        bonus_entries_payload,
        revealed_breakthrough_requirement_ids,
        realm_payload,
        heaven_gate_payload,
        spiritual_roots_payload,
        updated_at
      )
      VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        base_attrs_payload = EXCLUDED.base_attrs_payload,
        bonus_entries_payload = EXCLUDED.bonus_entries_payload,
        revealed_breakthrough_requirement_ids = EXCLUDED.revealed_breakthrough_requirement_ids,
        realm_payload = EXCLUDED.realm_payload,
        heaven_gate_payload = EXCLUDED.heaven_gate_payload,
        spiritual_roots_payload = EXCLUDED.spiritual_roots_payload,
        updated_at = now()
    `,
    [
      playerId,
      JSON.stringify(row.baseAttrsPayload),
      JSON.stringify(row.bonusEntriesPayload),
      JSON.stringify(row.revealedBreakthroughRequirementIds),
      JSON.stringify(row.realmPayload),
      JSON.stringify(row.heavenGatePayload),
      JSON.stringify(row.spiritualRootsPayload),
    ],
  );
}

export async function replacePlayerProfessionStates(
  client: PoolClient,
  playerId: string,
  rows: ProfessionStateRow[],
): Promise<void> {
  const normalizedRows = rows.map((row) => ({
    profession_type: row.professionType,
    level: row.level,
    exp: row.exp,
    exp_to_next: row.expToNext,
  }));
  if (normalizedRows.length > 0) {
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            profession_type varchar(80),
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
      `,
      [playerId, JSON.stringify(normalizedRows)],
    );
  }
  await prunePlayerRowsBySnapshotKeys(
    client,
    PLAYER_PROFESSION_STATE_TABLE,
    playerId,
    normalizedRows.map(({ profession_type }) => ({ profession_type })),
    'profession_type varchar(80)',
    'incoming.profession_type = target.profession_type',
  );
}

export async function replacePlayerAlchemyPresets(
  client: PoolClient,
  playerId: string,
  rows: AlchemyPresetRow[],
): Promise<void> {
  const normalizedRows = rows.map((row) => ({
    preset_id: row.presetId,
    recipe_id: row.recipeId,
    name: row.name,
    ingredients_payload: row.ingredients,
  }));
  if (normalizedRows.length > 0) {
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            preset_id varchar(120),
            recipe_id varchar(120),
            name varchar(120),
            ingredients_payload jsonb
          )
        )
        INSERT INTO ${PLAYER_ALCHEMY_PRESET_TABLE}(
          preset_id,
          player_id,
          recipe_id,
          name,
          ingredients_payload,
          updated_at
        )
        SELECT preset_id, $1, recipe_id, name, COALESCE(ingredients_payload, '[]'::jsonb), now()
        FROM incoming
        ON CONFLICT (player_id, preset_id)
        DO UPDATE SET
          recipe_id = EXCLUDED.recipe_id,
          name = EXCLUDED.name,
          ingredients_payload = EXCLUDED.ingredients_payload,
          updated_at = now()
      `,
      [playerId, JSON.stringify(normalizedRows)],
    );
  }
  await prunePlayerRowsBySnapshotKeys(
    client,
    PLAYER_ALCHEMY_PRESET_TABLE,
    playerId,
    normalizedRows.map(({ preset_id }) => ({ preset_id })),
    'preset_id varchar(120)',
    'incoming.preset_id = target.preset_id',
  );
}

export async function replacePlayerActiveJob(
  client: PoolClient,
  playerId: string,
  row: ActiveJobRow | null,
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
      row.finishedAt,
      row.pausedTicks,
      row.totalTicks,
      row.remainingTicks,
      row.successRate,
      row.speedRate,
      row.jobVersion,
      JSON.stringify(row.detailJson),
    ],
  );
}

export async function replacePlayerTechniqueActivityQueue(
  client: PoolClient,
  playerId: string,
  rows: readonly TechniqueActivityQueueRow[],
): Promise<void> {
  const normalizedRows = rows
    .map((row, index) => ({
      queue_id: normalizeRequiredString(row.queueId),
      kind: normalizeRequiredString(row.kind),
      state: normalizeOptionalString(row.state) ?? 'pending',
      label: normalizeOptionalString(row.label),
      target_label: normalizeOptionalString(row.targetLabel),
      sleep_reason: normalizeOptionalString(row.sleepReason),
      retry_after_ticks: normalizeOptionalInteger(row.retryAfterTicks),
      created_at: normalizeMinimumInteger(row.createdAt, Date.now(), 1),
      queue_order: index,
      payload_jsonb: cloneJsonValue(row.payloadJson ?? {}),
      cancel_ref_jsonb: cloneJsonValue(row.cancelRefJson ?? {}),
      detail_jsonb: cloneJsonValue(row.detailJson ?? {}),
    }))
    .filter((row) => row.queue_id && row.kind);

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

  await prunePlayerRowsBySnapshotKeys(
    client,
    PLAYER_TECHNIQUE_ACTIVITY_QUEUE_TABLE,
    playerId,
    normalizedRows.map(({ queue_id }) => ({ queue_id })),
    'queue_id varchar(180)',
    'incoming.queue_id = target.queue_id',
    { allowEmptyOverwrite: true },
  );
}

export async function replacePlayerEnhancementRecords(
  client: PoolClient,
  playerId: string,
  rows: EnhancementRecordRow[],
): Promise<void> {
  const normalizedRows = rows.map((row) => ({
    record_id: row.recordId,
    item_id: row.itemId,
    item_name: normalizePersistedEnhancementItemName(row.itemId, row.itemName),
    highest_level: row.highestLevel,
    levels_payload: row.levelsPayload,
    action_started_at: row.actionStartedAt,
    action_ended_at: row.actionEndedAt,
    start_level: row.startLevel,
    initial_target_level: row.initialTargetLevel,
    desired_target_level: row.desiredTargetLevel,
    protection_start_level: row.protectionStartLevel,
    status: row.status,
  }));
  if (normalizedRows.length > 0) {
    const result = await client.query(
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
      `,
      [playerId, JSON.stringify(normalizedRows)],
    );
    if ((result.rowCount ?? 0) !== normalizedRows.length) {
      throw new Error(`replacePlayerEnhancementRecords: record_id conflict outside player scope playerId=${playerId}`);
    }
  }
  await prunePlayerRowsBySnapshotKeys(
    client,
    PLAYER_ENHANCEMENT_RECORD_TABLE,
    playerId,
    normalizedRows.map(({ record_id }) => ({ record_id })),
    'record_id varchar(180)',
    'incoming.record_id = target.record_id',
  );
}

export async function replacePlayerLogbookMessages(
  client: PoolClient,
  playerId: string,
  rows: unknown[],
): Promise<void> {
  const allowExplicitEmptyOverwrite = rows.length === 0;
  const normalizedRows: Array<{
    message_id: string;
    kind: string;
    text: string;
    from_name: string | null;
    occurred_at: number;
    acked_at: number | null;
    structured_payload: Record<string, unknown> | null;
    structured_group_payload: Array<Record<string, unknown>> | null;
  }> = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const entry = asRecord(row);
    const messageId = normalizeRequiredString(entry?.id ?? entry?.messageId);
    const kind = normalizeRequiredString(entry?.kind);
    const text = typeof entry?.text === 'string' ? entry.text : '';
    if (!messageId || !kind || !text) {
      continue;
    }
    normalizedRows.push({
      message_id: messageId,
      kind,
      text,
      from_name: normalizeOptionalString(entry?.from ?? entry?.fromName),
      occurred_at: normalizeOptionalInteger(entry?.at ?? entry?.occurredAt) ?? Date.now(),
      acked_at: normalizeOptionalInteger(entry?.ackedAt),
      structured_payload: asRecord(entry?.structured),
      structured_group_payload: normalizeJsonArray(entry?.structuredGroup)
        .map((item) => asRecord(item))
        .filter((item): item is Record<string, unknown> => item !== null),
    });
  }

  if (normalizedRows.length > 0) {
    const result = await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            message_id varchar(180),
            kind varchar(40),
            text text,
            from_name varchar(120),
            occurred_at bigint,
            acked_at bigint,
            structured_payload jsonb,
            structured_group_payload jsonb
          )
        )
        INSERT INTO ${PLAYER_LOGBOOK_MESSAGE_TABLE}(
          message_id,
          player_id,
          kind,
          text,
          from_name,
          occurred_at,
          acked_at,
          structured_payload,
          structured_group_payload,
          updated_at
        )
        SELECT message_id, $1, kind, text, from_name, occurred_at, acked_at,
               structured_payload, structured_group_payload, now()
        FROM incoming
        ON CONFLICT (player_id, message_id)
        DO UPDATE SET
          kind = EXCLUDED.kind,
          text = EXCLUDED.text,
          from_name = EXCLUDED.from_name,
          occurred_at = EXCLUDED.occurred_at,
          acked_at = EXCLUDED.acked_at,
          structured_payload = EXCLUDED.structured_payload,
          structured_group_payload = EXCLUDED.structured_group_payload,
          updated_at = now()
      `,
      [playerId, JSON.stringify(normalizedRows)],
    );
    if ((result.rowCount ?? 0) !== normalizedRows.length) {
      throw new Error(`replacePlayerLogbookMessages: message conflict outside player scope playerId=${playerId}`);
    }
  }
  await prunePlayerRowsBySnapshotKeys(
    client,
    PLAYER_LOGBOOK_MESSAGE_TABLE,
    playerId,
    normalizedRows.map(({ message_id }) => ({ message_id })),
    'message_id varchar(180)',
    'incoming.message_id = target.message_id',
    // pendingLogbookMessages 是待 ACK 队列；上游显式传入空数组表示全部消息均已确认。
    { allowEmptyOverwrite: allowExplicitEmptyOverwrite },
  );
}

export async function upsertRecoveryWatermark(
  client: PoolClient,
  playerId: string,
  patch: RecoveryWatermarkPatch,
): Promise<void> {
  const entries = Object.entries(patch).filter((entry): entry is [RecoveryWatermarkColumn, number] => {
    return WATERMARK_COLUMNS.includes(entry[0] as RecoveryWatermarkColumn) && Number.isFinite(entry[1]);
  });
  if (entries.length === 0) {
    return;
  }

  const insertColumns = ['player_id', ...entries.map(([column]) => column), 'updated_at'];
  const watermarkVersionSeed = Math.max(...entries.map(([, value]) => Math.max(0, Math.trunc(value))));
  const insertValues: unknown[] = [playerId, ...entries.map(([, value]) => Math.max(0, Math.trunc(value))),];
  const updatedAtPlaceholder = `$${insertValues.length + 1}`;
  insertValues.push(new Date(Math.max(1, watermarkVersionSeed)).toISOString());

  const valuePlaceholders = insertColumns.map((_, index) => `$${index + 1}`);
  valuePlaceholders[valuePlaceholders.length - 1] = updatedAtPlaceholder;

  const updateClauses = entries.map(([column]) => {
    return `${column} = GREATEST(COALESCE(${PLAYER_RECOVERY_WATERMARK_TABLE}.${column}, 0), EXCLUDED.${column})`;
  });
  updateClauses.push('updated_at = now()');

  await client.query(
    `
      INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(${insertColumns.join(', ')})
      VALUES (${valuePlaceholders.join(', ')})
      ON CONFLICT (player_id)
      DO UPDATE SET ${updateClauses.join(', ')}
    `,
    insertValues,
  );
}

