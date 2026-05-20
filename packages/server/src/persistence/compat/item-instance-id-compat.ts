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
