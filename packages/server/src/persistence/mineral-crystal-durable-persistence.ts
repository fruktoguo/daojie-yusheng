import { MINERAL_CRYSTALS } from '@mud/shared';
import type { PoolClient } from 'pg';
import { persistInstanceFlushLedgerBarrier } from './instance-flush-ledger-fence';

export interface TemporaryMineralTileEntry {
  tileIndex: number;
  x: number;
  y: number;
  tileType: string;
  hp: number;
  maxHp: number;
  expiresAtTick: number;
  ownerPlayerId: string | null;
  sourceSkillId?: string | null;
  sourceItemId?: string | null;
  mineralLevel?: number | null;
  createdAt: number;
  modifiedAt: number;
}

export interface DurableMineralCrystalSourceMutation {
  kind: 'mineral_crystal';
  instanceId: string;
  ownershipEpoch: number;
  flushLedgerVersion: number;
  createdTileIndex: number;
  entries: TemporaryMineralTileEntry[];
}

export function normalizeDurableMineralCrystalSourceMutation(
  value: DurableMineralCrystalSourceMutation,
  instanceId: string,
): DurableMineralCrystalSourceMutation | null {
  if (!Number.isSafeInteger(value.ownershipEpoch) || value.ownershipEpoch <= 0
    || !Number.isSafeInteger(value.flushLedgerVersion) || value.flushLedgerVersion <= 0
    || !Array.isArray(value.entries) || value.entries.length === 0) return null;
  const indices = new Set<number>();
  for (const entry of value.entries) {
    if (!entry || !Number.isSafeInteger(entry.tileIndex) || entry.tileIndex < 0 || indices.has(entry.tileIndex)
      || !Number.isSafeInteger(entry.x) || !Number.isSafeInteger(entry.y)
      || !entry.tileType || !Number.isFinite(entry.hp) || entry.hp <= 0
      || !Number.isFinite(entry.maxHp) || entry.maxHp < entry.hp
      || !Number.isSafeInteger(entry.expiresAtTick) || entry.expiresAtTick <= 0) return null;
    indices.add(entry.tileIndex);
  }
  const created = value.entries.find((entry) => entry.tileIndex === value.createdTileIndex);
  if (!created || !created.ownerPlayerId || !Number.isSafeInteger(created.mineralLevel)
    || Number(created.mineralLevel) <= 0
    || !MINERAL_CRYSTALS.some((entry) => entry.itemId === created.sourceItemId && entry.tileType === created.tileType)) return null;
  return { ...value, instanceId };
}

/** 与背包消耗同事务保存完整临时地块域，并阻止旧 flush 快照覆盖新矿脉。 */
export async function persistDurableMineralCrystalSourceMutation(
  client: PoolClient,
  mutation: DurableMineralCrystalSourceMutation,
): Promise<void> {
  const payload = JSON.stringify(mutation.entries.map((entry) => ({
    tile_index: entry.tileIndex, x: entry.x, y: entry.y, tile_type: entry.tileType,
    hp: entry.hp, max_hp: entry.maxHp, expires_at_tick: entry.expiresAtTick,
    owner_player_id: entry.ownerPlayerId, source_skill_id: entry.sourceSkillId ?? null,
    source_item_id: entry.sourceItemId ?? null, mineral_level: entry.mineralLevel ?? null,
    created_at_ms: entry.createdAt, modified_at_ms: entry.modifiedAt,
  })));
  await client.query(`WITH incoming AS (
    SELECT * FROM jsonb_to_recordset($2::jsonb) AS entry(
      tile_index bigint, x bigint, y bigint, tile_type varchar(64), hp double precision,
      max_hp double precision, expires_at_tick bigint, owner_player_id varchar(100),
      source_skill_id varchar(160), source_item_id varchar(160), mineral_level integer,
      created_at_ms bigint, modified_at_ms bigint)
    ) INSERT INTO instance_temporary_tile_state(
      instance_id, tile_index, x, y, tile_type, hp, max_hp, expires_at_tick,
      owner_player_id, source_skill_id, source_item_id, mineral_level, created_at_ms, modified_at_ms)
    SELECT $1, tile_index, x, y, tile_type, hp, max_hp, expires_at_tick,
      owner_player_id, source_skill_id, source_item_id, mineral_level, created_at_ms, modified_at_ms FROM incoming
    ON CONFLICT (instance_id, tile_index) DO UPDATE SET
      x=EXCLUDED.x, y=EXCLUDED.y, tile_type=EXCLUDED.tile_type, hp=EXCLUDED.hp,
      max_hp=EXCLUDED.max_hp, expires_at_tick=EXCLUDED.expires_at_tick,
      owner_player_id=EXCLUDED.owner_player_id, source_skill_id=EXCLUDED.source_skill_id,
      source_item_id=EXCLUDED.source_item_id, mineral_level=EXCLUDED.mineral_level,
      created_at_ms=EXCLUDED.created_at_ms, modified_at_ms=EXCLUDED.modified_at_ms, updated_at=now()`,
  [mutation.instanceId, payload]);
  await client.query(`DELETE FROM instance_temporary_tile_state target WHERE instance_id=$1
    AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS entry(tile_index bigint)
      WHERE entry.tile_index=target.tile_index)`, [mutation.instanceId, payload]);
  await persistInstanceFlushLedgerBarrier(client, {
    instanceId: mutation.instanceId, domain: 'temporary_tile',
    ownershipEpoch: mutation.ownershipEpoch, version: mutation.flushLedgerVersion,
  });
}
