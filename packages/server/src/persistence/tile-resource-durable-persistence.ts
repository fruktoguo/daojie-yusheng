import type { PoolClient } from 'pg';

const INSTANCE_TILE_RESOURCE_STATE_TABLE = 'instance_tile_resource_state';
const INSTANCE_FLUSH_LEDGER_TABLE = 'instance_flush_ledger';

export interface DurableTileResourceSourceMutation {
  kind: 'tile_resource';
  instanceId: string;
  ownershipEpoch: number;
  flushLedgerVersion: number;
  upserts: Array<{ resourceKey: string; tileIndex: number; value: number }>;
  deletes: Array<{ resourceKey: string; tileIndex: number }>;
  gains: Array<{ resourceKey: string; tileIndex: number; amount: number; nextValue: number }>;
}

export function normalizeDurableTileResourceSourceMutation(
  value: DurableTileResourceSourceMutation,
  instanceId: string,
): DurableTileResourceSourceMutation | null {
  const ownershipEpoch = Math.trunc(Number(value.ownershipEpoch) || 0);
  const flushLedgerVersion = Math.trunc(Number(value.flushLedgerVersion) || 0);
  const upserts = normalizeTileResourceUpserts(value.upserts);
  const deletes = normalizeTileResourceDeletes(value.deletes);
  const gains = normalizeTileResourceGains(value.gains);
  if (
    !Number.isSafeInteger(ownershipEpoch)
    || ownershipEpoch <= 0
    || !Number.isSafeInteger(flushLedgerVersion)
    || flushLedgerVersion <= 0
    || upserts.length <= 0
    || gains.length <= 0
  ) {
    return null;
  }
  const valueByKey = new Map(upserts.map((entry) => [
    `${entry.resourceKey}\u0000${entry.tileIndex}`,
    entry.value,
  ]));
  if (gains.some((entry) => valueByKey.get(`${entry.resourceKey}\u0000${entry.tileIndex}`) !== entry.nextValue)) {
    return null;
  }
  return {
    kind: 'tile_resource',
    instanceId,
    ownershipEpoch,
    flushLedgerVersion,
    upserts,
    deletes,
    gains,
  };
}

export async function persistDurableTileResourceSourceMutation(
  client: PoolClient,
  mutation: DurableTileResourceSourceMutation,
): Promise<void> {
  if (mutation.deletes.length > 0) {
    await client.query(
      `WITH incoming AS (
         SELECT resource_key, tile_index
         FROM jsonb_to_recordset($2::jsonb) AS entry(resource_key varchar(100), tile_index bigint)
       )
       DELETE FROM ${INSTANCE_TILE_RESOURCE_STATE_TABLE} target
       USING incoming
       WHERE target.instance_id = $1
         AND target.resource_key = incoming.resource_key
         AND target.tile_index = incoming.tile_index`,
      [mutation.instanceId, JSON.stringify(mutation.deletes.map((entry) => ({
        resource_key: entry.resourceKey,
        tile_index: entry.tileIndex,
      })))],
    );
  }
  await client.query(
    `WITH incoming AS (
       SELECT resource_key, tile_index, value
       FROM jsonb_to_recordset($2::jsonb) AS entry(
         resource_key varchar(100), tile_index bigint, value double precision
       )
     )
     INSERT INTO ${INSTANCE_TILE_RESOURCE_STATE_TABLE}(
       instance_id, resource_key, tile_index, value, updated_at
     )
     SELECT $1, resource_key, tile_index, value, now()
     FROM incoming
     ON CONFLICT (instance_id, resource_key, tile_index)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [mutation.instanceId, JSON.stringify(mutation.upserts.map((entry) => ({
      resource_key: entry.resourceKey,
      tile_index: entry.tileIndex,
      value: entry.value,
    })))],
  );
  await client.query(
    `INSERT INTO ${INSTANCE_FLUSH_LEDGER_TABLE}(
       instance_id, domain, ownership_epoch, latest_version, flushed_version,
       priority, payload_jsonb, updated_at
     )
     VALUES ($1, 'tile_resource', $2, $3, $3, 'low', NULL, now())
     ON CONFLICT (instance_id, domain, ownership_epoch)
     DO UPDATE SET
       latest_version = GREATEST(${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version, EXCLUDED.latest_version),
       flushed_version = CASE
         WHEN EXCLUDED.latest_version >= ${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version
         THEN EXCLUDED.latest_version
         ELSE ${INSTANCE_FLUSH_LEDGER_TABLE}.flushed_version
       END,
       dirty_since_at = CASE
         WHEN EXCLUDED.latest_version >= ${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version THEN NULL
         ELSE ${INSTANCE_FLUSH_LEDGER_TABLE}.dirty_since_at
       END,
       next_attempt_at = CASE
         WHEN EXCLUDED.latest_version >= ${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version THEN NULL
         ELSE ${INSTANCE_FLUSH_LEDGER_TABLE}.next_attempt_at
       END,
       claimed_by = CASE
         WHEN EXCLUDED.latest_version >= ${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version THEN NULL
         ELSE ${INSTANCE_FLUSH_LEDGER_TABLE}.claimed_by
       END,
       claim_until = CASE
         WHEN EXCLUDED.latest_version >= ${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version THEN NULL
         ELSE ${INSTANCE_FLUSH_LEDGER_TABLE}.claim_until
       END,
       payload_jsonb = CASE
         WHEN EXCLUDED.latest_version >= ${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version THEN NULL
         ELSE ${INSTANCE_FLUSH_LEDGER_TABLE}.payload_jsonb
       END,
       failure_category = CASE
         WHEN EXCLUDED.latest_version >= ${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version THEN NULL
         ELSE ${INSTANCE_FLUSH_LEDGER_TABLE}.failure_category
       END,
       retry_after = CASE
         WHEN EXCLUDED.latest_version >= ${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version THEN NULL
         ELSE ${INSTANCE_FLUSH_LEDGER_TABLE}.retry_after
       END,
       updated_at = now()`,
    [mutation.instanceId, mutation.ownershipEpoch, mutation.flushLedgerVersion],
  );
}

function normalizeTileResourceUpserts(
  input: Array<{ resourceKey: string; tileIndex: number; value: number }> | null | undefined,
): Array<{ resourceKey: string; tileIndex: number; value: number }> {
  const byKey = new Map<string, { resourceKey: string; tileIndex: number; value: number }>();
  for (const raw of Array.isArray(input) ? input : []) {
    const resourceKey = normalizeRequiredString(raw?.resourceKey);
    const tileIndex = Math.trunc(Number(raw?.tileIndex));
    const value = Number(raw?.value);
    if (!resourceKey || !Number.isSafeInteger(tileIndex) || tileIndex < 0 || !Number.isFinite(value) || value < 0) {
      continue;
    }
    byKey.set(`${resourceKey}\u0000${tileIndex}`, { resourceKey, tileIndex, value });
  }
  return Array.from(byKey.values()).sort(compareTileResourceEntries);
}

function normalizeTileResourceDeletes(
  input: Array<{ resourceKey: string; tileIndex: number }> | null | undefined,
): Array<{ resourceKey: string; tileIndex: number }> {
  const byKey = new Map<string, { resourceKey: string; tileIndex: number }>();
  for (const raw of Array.isArray(input) ? input : []) {
    const resourceKey = normalizeRequiredString(raw?.resourceKey);
    const tileIndex = Math.trunc(Number(raw?.tileIndex));
    if (!resourceKey || !Number.isSafeInteger(tileIndex) || tileIndex < 0) {
      continue;
    }
    byKey.set(`${resourceKey}\u0000${tileIndex}`, { resourceKey, tileIndex });
  }
  return Array.from(byKey.values()).sort(compareTileResourceEntries);
}

function normalizeTileResourceGains(
  input: Array<{ resourceKey: string; tileIndex: number; amount: number; nextValue: number }> | null | undefined,
): Array<{ resourceKey: string; tileIndex: number; amount: number; nextValue: number }> {
  const byKey = new Map<string, { resourceKey: string; tileIndex: number; amount: number; nextValue: number }>();
  for (const raw of Array.isArray(input) ? input : []) {
    const resourceKey = normalizeRequiredString(raw?.resourceKey);
    const tileIndex = Math.trunc(Number(raw?.tileIndex));
    const amount = Number(raw?.amount);
    const nextValue = Number(raw?.nextValue);
    if (
      !resourceKey
      || !Number.isSafeInteger(tileIndex)
      || tileIndex < 0
      || !Number.isFinite(amount)
      || amount <= 0
      || !Number.isFinite(nextValue)
      || nextValue < 0
    ) {
      continue;
    }
    const key = `${resourceKey}\u0000${tileIndex}`;
    const previous = byKey.get(key);
    byKey.set(key, {
      resourceKey,
      tileIndex,
      amount: (previous?.amount ?? 0) + amount,
      nextValue,
    });
  }
  return Array.from(byKey.values()).sort(compareTileResourceEntries);
}

function compareTileResourceEntries(
  left: { resourceKey: string; tileIndex: number },
  right: { resourceKey: string; tileIndex: number },
): number {
  return left.resourceKey.localeCompare(right.resourceKey) || left.tileIndex - right.tileIndex;
}

function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
