/**
 * 本文件属于持久化边界，负责 flush 运行时、兼容转换或失败策略等数据可靠性逻辑。
 *
 * 维护时要优先考虑幂等、崩溃恢复和数据库真源，避免在 tick 内直接引入阻塞 IO。
 */
import { isLegacyItemInstanceId } from '@mud/shared';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

export interface ItemInstanceIdPersistenceRowSource {
  entry: Record<string, unknown> | null;
  item: Record<string, unknown> | null;
}

export interface EquipmentSlotPersistenceRow {
  item_instance_id: string;
  slot_type: string;
  item_id: string;
  raw_payload: Record<string, unknown>;
}

export function assignStableItemInstanceId(
  sourceItemInstanceId: string | null | undefined,
  sourceRecords?: ItemInstanceIdPersistenceRowSource | null,
): string {
  const normalizedSource = typeof sourceItemInstanceId === 'string' ? sourceItemInstanceId.trim() : '';
  const nextItemInstanceId = normalizedSource && !isLegacyItemInstanceId(normalizedSource)
    ? normalizedSource
    : randomUUID();
  if (nextItemInstanceId !== normalizedSource && sourceRecords) {
    writeItemInstanceIdToSources(sourceRecords, nextItemInstanceId);
  }
  return nextItemInstanceId;
}

export function writeItemInstanceIdToSources(
  source: ItemInstanceIdPersistenceRowSource | undefined,
  itemInstanceId: string,
): void {
  for (const record of [source?.entry, source?.item]) {
    if (!record) {
      continue;
    }
    Object.defineProperty(record, 'itemInstanceId', {
      value: itemInstanceId,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
}

export async function repairEquipmentSlotItemInstanceIdConflicts(
  client: PoolClient,
  playerId: string,
  rows: EquipmentSlotPersistenceRow[],
  rowSources: Map<EquipmentSlotPersistenceRow, ItemInstanceIdPersistenceRowSource>,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const result = await client.query(
    `
      SELECT item_instance_id
      FROM player_equipment_slot
      WHERE player_id <> $2
        AND item_instance_id = ANY($1::varchar[])
      FOR UPDATE
    `,
    [rows.map(({ item_instance_id }) => item_instance_id), playerId],
  );
  const conflictedIds = new Set(
    ((result as { rows?: Array<Record<string, unknown>> }).rows ?? [])
      .map((row) => normalizeOptionalString(row?.item_instance_id))
      .filter((itemInstanceId): itemInstanceId is string => itemInstanceId.length > 0),
  );
  if (conflictedIds.size === 0) {
    return;
  }
  reassignEquipmentSlotItemInstanceIds(rows, rowSources, conflictedIds);
}

export async function upsertEquipmentSlotRowsWithItemInstanceIdRepair(
  client: PoolClient,
  playerId: string,
  rows: EquipmentSlotPersistenceRow[],
  rowSources: Map<EquipmentSlotPersistenceRow, ItemInstanceIdPersistenceRowSource>,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await repairEquipmentSlotItemInstanceIdConflicts(client, playerId, rows, rowSources);
    const rowsJson = JSON.stringify(rows);
    await client.query(
      `
        WITH incoming AS (
          SELECT slot_type, item_instance_id
          FROM jsonb_to_recordset($2::jsonb) AS entry(slot_type varchar(40), item_instance_id varchar(180))
        )
        DELETE FROM player_equipment_slot target
        WHERE target.player_id = $1
          AND EXISTS (
            SELECT 1
            FROM incoming
            WHERE incoming.slot_type = target.slot_type
              OR incoming.item_instance_id = target.item_instance_id
          )
      `,
      [playerId, rowsJson],
    );
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            slot_type varchar(40),
            item_instance_id varchar(180),
            item_id varchar(160),
            raw_payload jsonb
          )
        )
        INSERT INTO player_equipment_slot(
          player_id,
          slot_type,
          item_instance_id,
          item_id,
          raw_payload,
          updated_at
        )
        SELECT $1, slot_type, item_instance_id, item_id, COALESCE(raw_payload, '{}'::jsonb), now()
        FROM incoming
        ON CONFLICT (item_instance_id)
        DO UPDATE SET
          player_id = EXCLUDED.player_id,
          slot_type = EXCLUDED.slot_type,
          item_id = EXCLUDED.item_id,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = now()
        WHERE player_equipment_slot.player_id = EXCLUDED.player_id
      `,
      [playerId, rowsJson],
    );
    const persistedResult = await client.query(
      `
        SELECT item_instance_id
        FROM player_equipment_slot
        WHERE player_id = $1
          AND item_instance_id = ANY($2::varchar[])
      `,
      [playerId, rows.map(({ item_instance_id }) => item_instance_id)],
    );
    const persistedIds = new Set(
      ((persistedResult as { rows?: Array<Record<string, unknown>> }).rows ?? [])
        .map((row) => normalizeOptionalString(row?.item_instance_id))
        .filter((itemInstanceId): itemInstanceId is string => itemInstanceId.length > 0),
    );
    if (persistedIds.size === rows.length) {
      return;
    }
    const missingIds = new Set(
      rows
        .filter((row) => !persistedIds.has(row.item_instance_id))
        .map((row) => row.item_instance_id),
    );
    if (missingIds.size === 0) {
      return;
    }
    reassignEquipmentSlotItemInstanceIds(rows, rowSources, missingIds);
  }
  throw new Error(`replacePlayerEquipmentSlots: item_instance_id conflict outside player scope playerId=${playerId}`);
}

function reassignEquipmentSlotItemInstanceIds(
  rows: EquipmentSlotPersistenceRow[],
  rowSources: Map<EquipmentSlotPersistenceRow, ItemInstanceIdPersistenceRowSource>,
  conflictedIds: Set<string>,
): void {
  const usedIds = new Set(rows.map(({ item_instance_id }) => item_instance_id));
  for (const row of rows) {
    if (!conflictedIds.has(row.item_instance_id)) {
      continue;
    }
    usedIds.delete(row.item_instance_id);
    row.item_instance_id = createUniqueItemInstanceId(usedIds);
    usedIds.add(row.item_instance_id);
    writeItemInstanceIdToSources(rowSources.get(row), row.item_instance_id);
  }
}

function createUniqueItemInstanceId(usedIds: Set<string>): string {
  let nextItemInstanceId = randomUUID();
  while (usedIds.has(nextItemInstanceId)) {
    nextItemInstanceId = randomUUID();
  }
  return nextItemInstanceId;
}

function normalizeOptionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
