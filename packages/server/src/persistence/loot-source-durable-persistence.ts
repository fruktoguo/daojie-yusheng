import type { PoolClient } from 'pg';

import { supersedeInstanceFlushLedgerPayload } from './instance-flush-ledger-fence';

const INSTANCE_GROUND_ITEM_TABLE = 'instance_ground_item';
const INSTANCE_CONTAINER_STATE_TABLE = 'instance_container_state';
const INSTANCE_CONTAINER_ENTRY_TABLE = 'instance_container_entry';
const INSTANCE_CONTAINER_TIMER_TABLE = 'instance_container_timer';

interface DurableLootSourceMutationBase {
  instanceId: string;
  ownershipEpoch: number;
  flushLedgerVersion: number;
  flushLedgerPayload: Record<string, unknown>;
}

export interface DurableGroundTileSourceMutation extends DurableLootSourceMutationBase {
  kind: 'ground_tile';
  tileIndex: number;
  remainingItems: Array<Record<string, unknown>>;
}

export interface DurableContainerStateSourceMutation extends DurableLootSourceMutationBase {
  kind: 'container_state';
  containerId: string;
  sourceId: string;
  statePayload: Record<string, unknown>;
}

export type DurableLootSourceMutation = DurableGroundTileSourceMutation | DurableContainerStateSourceMutation;

export function normalizeDurableLootSourceMutation(
  value: DurableLootSourceMutation,
  instanceId: string,
): DurableLootSourceMutation | null {
  const ownershipEpoch = Math.trunc(Number(value.ownershipEpoch));
  const flushLedgerVersion = Math.trunc(Number(value.flushLedgerVersion));
  if (
    !Number.isSafeInteger(ownershipEpoch)
    || ownershipEpoch <= 0
    || !Number.isSafeInteger(flushLedgerVersion)
    || flushLedgerVersion <= 0
  ) {
    return null;
  }
  if (value.kind === 'ground_tile') {
    const tileIndex = Math.trunc(Number(value.tileIndex));
    const flushLedgerPayload = normalizeFlushLedgerPayload(value.flushLedgerPayload, 'ground_item', flushLedgerVersion);
    if (!Number.isSafeInteger(tileIndex) || tileIndex < 0 || !flushLedgerPayload) {
      return null;
    }
    return {
      kind: 'ground_tile',
      instanceId,
      ownershipEpoch,
      flushLedgerVersion,
      flushLedgerPayload,
      tileIndex,
      remainingItems: Array.isArray(value.remainingItems)
        ? value.remainingItems.map(normalizeJsonObject)
        : [],
    };
  }
  const containerId = normalizeRequiredString(value.containerId);
  const sourceId = normalizeRequiredString(value.sourceId);
  const flushLedgerPayload = normalizeFlushLedgerPayload(value.flushLedgerPayload, 'container_state', flushLedgerVersion);
  if (!containerId || !sourceId || !flushLedgerPayload || !Array.isArray(flushLedgerPayload.payload)) {
    return null;
  }
  return {
    kind: 'container_state',
    instanceId,
    ownershipEpoch,
    flushLedgerVersion,
    flushLedgerPayload,
    containerId,
    sourceId,
    statePayload: normalizeJsonObject(value.statePayload),
  };
}

export async function persistDurableLootSourceMutation(
  client: PoolClient,
  mutation: DurableLootSourceMutation,
): Promise<void> {
  if (mutation.kind === 'ground_tile') {
    await replaceDurableGroundTile(client, mutation);
    await supersedeInstanceFlushLedgerPayload(client, {
      instanceId: mutation.instanceId,
      domain: 'ground_item',
      ownershipEpoch: mutation.ownershipEpoch,
      version: mutation.flushLedgerVersion,
      payload: mutation.flushLedgerPayload,
    });
    return;
  }
  await replaceDurableContainerState(client, mutation);
  await supersedeInstanceFlushLedgerPayload(client, {
    instanceId: mutation.instanceId,
    domain: 'container_state',
    ownershipEpoch: mutation.ownershipEpoch,
    version: mutation.flushLedgerVersion,
    payload: mutation.flushLedgerPayload,
  });
}

async function replaceDurableGroundTile(client: PoolClient, mutation: DurableGroundTileSourceMutation): Promise<void> {
  await client.query(
    `DELETE FROM ${INSTANCE_GROUND_ITEM_TABLE} WHERE instance_id = $1 AND tile_index = $2`,
    [mutation.instanceId, mutation.tileIndex],
  );
  if (mutation.remainingItems.length === 0) {
    return;
  }
  const rows = mutation.remainingItems.map((itemPayload, index) => ({
    ground_item_id: buildDurableInstanceRowId('ground', mutation.instanceId, `${mutation.tileIndex}:${index}`),
    tile_index: mutation.tileIndex,
    item_instance_payload: normalizeJsonObject(itemPayload),
    expire_at: resolveDurableGroundExpireAt(itemPayload),
  }));
  await client.query(
    `WITH incoming AS (
       SELECT *
       FROM jsonb_to_recordset($2::jsonb) AS entry(
         ground_item_id varchar(100), tile_index bigint,
         item_instance_payload jsonb, expire_at timestamptz
       )
     )
     INSERT INTO ${INSTANCE_GROUND_ITEM_TABLE}(
       ground_item_id, instance_id, tile_index, item_instance_payload, expire_at, updated_at
     )
     SELECT ground_item_id, $1, tile_index, COALESCE(item_instance_payload, '{}'::jsonb), expire_at, now()
     FROM incoming
     ON CONFLICT (ground_item_id)
     DO UPDATE SET
       instance_id = EXCLUDED.instance_id,
       tile_index = EXCLUDED.tile_index,
       item_instance_payload = EXCLUDED.item_instance_payload,
       expire_at = EXCLUDED.expire_at,
       updated_at = now()`,
    [mutation.instanceId, JSON.stringify(rows)],
  );
}

async function replaceDurableContainerState(
  client: PoolClient,
  mutation: DurableContainerStateSourceMutation,
): Promise<void> {
  const source = mutation.statePayload;
  const entries = Array.isArray(source.entries) ? source.entries : [];
  const metadata: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (key !== 'entries' && key !== 'generatedAtTick' && key !== 'refreshAtTick' && key !== 'activeSearch') {
      metadata[key] = entry;
    }
  }
  await client.query(
    `DELETE FROM ${INSTANCE_CONTAINER_ENTRY_TABLE} WHERE instance_id = $1 AND container_id = $2`,
    [mutation.instanceId, mutation.containerId],
  );
  await client.query(
    `DELETE FROM ${INSTANCE_CONTAINER_TIMER_TABLE} WHERE instance_id = $1 AND container_id = $2`,
    [mutation.instanceId, mutation.containerId],
  );
  await client.query(
    `INSERT INTO ${INSTANCE_CONTAINER_STATE_TABLE}(
       instance_id, container_id, source_id, state_payload, updated_at
     )
     VALUES ($1, $2, $3, $4::jsonb, now())
     ON CONFLICT (instance_id, container_id)
     DO UPDATE SET source_id = EXCLUDED.source_id, state_payload = EXCLUDED.state_payload, updated_at = now()`,
    [mutation.instanceId, mutation.containerId, mutation.sourceId, JSON.stringify(metadata)],
  );
  await client.query(
    `INSERT INTO ${INSTANCE_CONTAINER_TIMER_TABLE}(
       instance_id, container_id, generated_at_tick, refresh_at_tick,
       active_search_payload, updated_at
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, now())`,
    [
      mutation.instanceId,
      mutation.containerId,
      normalizeOptionalInteger(source.generatedAtTick),
      normalizeOptionalInteger(source.refreshAtTick),
      JSON.stringify(normalizeJsonObject(source.activeSearch)),
    ],
  );
  if (entries.length === 0) {
    return;
  }
  const entryRows = entries.map((value, entryIndex) => {
    const entry = normalizeJsonObject(value);
    return {
      container_id: mutation.containerId,
      entry_index: entryIndex,
      item_payload: normalizeJsonObject(entry.item),
      created_tick: normalizeOptionalInteger(entry.createdTick),
      visible: entry.visible === true,
    };
  });
  await client.query(
    `WITH incoming AS (
       SELECT *
       FROM jsonb_to_recordset($2::jsonb) AS entry(
         container_id varchar(100), entry_index bigint, item_payload jsonb,
         created_tick bigint, visible boolean
       )
     )
     INSERT INTO ${INSTANCE_CONTAINER_ENTRY_TABLE}(
       instance_id, container_id, entry_index, item_payload, created_tick, visible, updated_at
     )
     SELECT $1, container_id, entry_index, COALESCE(item_payload, '{}'::jsonb), created_tick,
       COALESCE(visible, false), now()
     FROM incoming`,
    [mutation.instanceId, JSON.stringify(entryRows)],
  );
}

function normalizeFlushLedgerPayload(
  input: unknown,
  expectedDomain: 'ground_item' | 'container_state',
  expectedVersion: number,
): Record<string, unknown> | null {
  const payload = normalizeJsonObject(input);
  if (
    payload.kind !== 'instance_domain_state'
    || payload.domain !== expectedDomain
    || Math.trunc(Number(payload.revision)) !== expectedVersion
    || !Object.prototype.hasOwnProperty.call(payload, 'payload')
  ) {
    return null;
  }
  return payload;
}

function resolveDurableGroundExpireAt(itemPayload: unknown): string | null {
  const payload = normalizeJsonObject(itemPayload);
  const expiresAtMs = Number(payload.groundExpiresAtMs);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= 0) {
    return null;
  }
  const expireAt = new Date(Math.trunc(expiresAtMs));
  return Number.isFinite(expireAt.getTime()) ? expireAt.toISOString() : null;
}

function buildDurableInstanceRowId(prefix: string, instanceId: string, suffix: string): string {
  return `${prefix}:${hashDurableString(`${instanceId}:${suffix}`)}:${suffix}`.slice(0, 100);
}

function hashDurableString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeOptionalInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const normalized = Math.trunc(Number(value));
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  try {
    const parsed = JSON.parse(JSON.stringify(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
