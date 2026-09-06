import { DUNGEON_MAX_STAMINA, resolveRecoveredStamina } from '@mud/shared';
import type { PoolClient } from 'pg';

const PLAYER_MAP_UNLOCK_TABLE = 'player_map_unlock';
const PLAYER_WORLD_ANCHOR_TABLE = 'player_world_anchor';
const PLAYER_RECOVERY_WATERMARK_TABLE = 'player_recovery_watermark';
const PLAYER_PROGRESSION_CORE_TABLE = 'player_progression_core';

interface RespawnPointSnapshot {
  templateId: string;
  instanceId: string | null;
  x: number;
  y: number;
}

export type DurablePlayerItemUseSourceMutation =
  | {
      kind: 'player_item_use';
      action: 'unlock_maps';
      playerId: string;
      expectedUnlockedMapIds: string[];
      unlockMapIds: string[];
    }
  | {
      kind: 'player_item_use';
      action: 'bind_respawn';
      playerId: string;
      expectedRespawn: RespawnPointSnapshot;
      nextRespawn: RespawnPointSnapshot;
  }
  | {
    kind: 'player_item_use';
    action: 'restore_stamina';
    playerId: string;
    expectedStamina: number;
    expectedStaminaUpdatedAt: number;
    restoreAmount: number;
    nextStamina: number;
    nextStaminaUpdatedAt: number;
    };

export function normalizeDurablePlayerItemUseSourceMutation(
  value: unknown,
): DurablePlayerItemUseSourceMutation | null {
  if (!isRecord(value) || value.kind !== 'player_item_use') {
    return null;
  }
  const playerId = normalizeRequiredString(value.playerId);
  if (!playerId) {
    return null;
  }
  if (value.action === 'unlock_maps') {
    const expectedUnlockedMapIds = normalizeStringSet(value.expectedUnlockedMapIds);
    const unlockMapIds = normalizeStringSet(value.unlockMapIds);
    if (
      unlockMapIds.length === 0
      || unlockMapIds.some((mapId) => expectedUnlockedMapIds.includes(mapId))
    ) {
      return null;
    }
    return {
      kind: 'player_item_use',
      action: 'unlock_maps',
      playerId,
      expectedUnlockedMapIds,
      unlockMapIds,
    };
  }
  if (value.action === 'bind_respawn') {
    const expectedRespawn = normalizeRespawnPoint(value.expectedRespawn);
    const nextRespawn = normalizeRespawnPoint(value.nextRespawn);
    if (!expectedRespawn || !nextRespawn || isSameRespawnPoint(expectedRespawn, nextRespawn)) {
      return null;
    }
    return {
      kind: 'player_item_use',
      action: 'bind_respawn',
      playerId,
      expectedRespawn,
      nextRespawn,
    };
  }
  if (value.action === 'restore_stamina') {
    const expectedStamina = normalizeInteger(value.expectedStamina);
    const expectedStaminaUpdatedAt = normalizeInteger(value.expectedStaminaUpdatedAt);
    const restoreAmount = normalizeInteger(value.restoreAmount);
    const nextStamina = normalizeInteger(value.nextStamina);
    const nextStaminaUpdatedAt = normalizeInteger(value.nextStaminaUpdatedAt);
    if (
      expectedStamina === null
      || expectedStamina < 0
      || expectedStamina > DUNGEON_MAX_STAMINA
      || expectedStaminaUpdatedAt === null
      || expectedStaminaUpdatedAt < 0
      || restoreAmount === null
      || restoreAmount <= 0
      || nextStamina === null
      || nextStamina !== Math.min(DUNGEON_MAX_STAMINA, expectedStamina + restoreAmount)
      || nextStaminaUpdatedAt === null
      || nextStaminaUpdatedAt < expectedStaminaUpdatedAt
    ) {
      return null;
    }
    return {
      kind: 'player_item_use',
      action: 'restore_stamina',
      playerId,
      expectedStamina,
      expectedStaminaUpdatedAt,
      restoreAmount,
      nextStamina,
      nextStaminaUpdatedAt,
    };
  }
  return null;
}

export async function persistDurablePlayerItemUseSourceMutation(
  client: PoolClient,
  mutation: DurablePlayerItemUseSourceMutation,
  persistenceVersion: number,
): Promise<void> {
  if (mutation.action === 'unlock_maps') {
    await persistMapUnlockMutation(client, mutation, persistenceVersion);
    return;
  }
  if (mutation.action === 'bind_respawn') {
  await persistRespawnBindMutation(client, mutation, persistenceVersion);
    return;
  }
  await persistStaminaRestoreMutation(client, mutation, persistenceVersion);
}

async function persistMapUnlockMutation(
  client: PoolClient,
  mutation: Extract<DurablePlayerItemUseSourceMutation, { action: 'unlock_maps' }>,
  persistenceVersion: number,
): Promise<void> {
  const current = await client.query<{ map_id?: unknown }>(
    `SELECT map_id
       FROM ${PLAYER_MAP_UNLOCK_TABLE}
      WHERE player_id = $1
      ORDER BY map_id ASC
      FOR UPDATE`,
    [mutation.playerId],
  );
  const currentMapIds = normalizeStringSet(current.rows.map((row) => row.map_id));
  if (!isSameStringList(currentMapIds, mutation.expectedUnlockedMapIds)) {
    throw new Error('player_map_unlock_snapshot_changed');
  }
  await client.query(
    `INSERT INTO ${PLAYER_MAP_UNLOCK_TABLE}(player_id, map_id, unlocked_at, updated_at)
     SELECT $1, map_id, $3, now()
       FROM unnest($2::varchar[]) AS map_id
     ON CONFLICT (player_id, map_id) DO NOTHING`,
    [mutation.playerId, mutation.unlockMapIds, persistenceVersion],
  );
  await upsertPlayerItemUseWatermark(client, mutation.playerId, 'map_unlock_version', persistenceVersion);
}

async function persistRespawnBindMutation(
  client: PoolClient,
  mutation: Extract<DurablePlayerItemUseSourceMutation, { action: 'bind_respawn' }>,
  persistenceVersion: number,
): Promise<void> {
  const current = await client.query<{
    respawn_template_id?: unknown;
    respawn_instance_id?: unknown;
    respawn_x?: unknown;
    respawn_y?: unknown;
  }>(
    `SELECT respawn_template_id, respawn_instance_id, respawn_x, respawn_y
       FROM ${PLAYER_WORLD_ANCHOR_TABLE}
      WHERE player_id = $1
      FOR UPDATE`,
    [mutation.playerId],
  );
  const currentRespawn = normalizeRespawnPoint({
    templateId: current.rows[0]?.respawn_template_id,
    instanceId: current.rows[0]?.respawn_instance_id,
    x: current.rows[0]?.respawn_x,
    y: current.rows[0]?.respawn_y,
  });
  if (!currentRespawn || !isSameRespawnPoint(currentRespawn, mutation.expectedRespawn)) {
    throw new Error('player_respawn_snapshot_changed');
  }
  const updated = await client.query(
    `UPDATE ${PLAYER_WORLD_ANCHOR_TABLE}
        SET respawn_template_id = $2,
            respawn_instance_id = $3,
            respawn_x = $4,
            respawn_y = $5,
            updated_at = now()
      WHERE player_id = $1`,
    [
      mutation.playerId,
      mutation.nextRespawn.templateId,
      mutation.nextRespawn.instanceId,
      mutation.nextRespawn.x,
      mutation.nextRespawn.y,
    ],
  );
  if ((updated.rowCount ?? 0) !== 1) {
    throw new Error('player_world_anchor_missing');
  }
  await upsertPlayerItemUseWatermark(client, mutation.playerId, 'anchor_version', persistenceVersion);
}

async function persistStaminaRestoreMutation(
  client: PoolClient,
  mutation: Extract<DurablePlayerItemUseSourceMutation, { action: 'restore_stamina' }>,
  persistenceVersion: number,
): Promise<void> {
  const current = await client.query<{ stamina?: unknown; stamina_updated_at?: unknown }>(
    `SELECT stamina, stamina_updated_at
              FROM ${PLAYER_PROGRESSION_CORE_TABLE}
            WHERE player_id = $1
            FOR UPDATE`,
    [mutation.playerId],
  );
  const row = current.rows[0];
  if (!row) {
    throw new Error('player_progression_core_missing');
  }
  const recovered = resolveRecoveredStamina(
    Number(row.stamina ?? DUNGEON_MAX_STAMINA),
    Number(row.stamina_updated_at ?? mutation.nextStaminaUpdatedAt),
    mutation.nextStaminaUpdatedAt,
  );
  if (
    recovered.current !== mutation.expectedStamina
    || recovered.updatedAt !== mutation.expectedStaminaUpdatedAt
  ) {
    throw new Error('player_stamina_snapshot_changed');
  }
  const updated = await client.query(
    `UPDATE ${PLAYER_PROGRESSION_CORE_TABLE}
                SET stamina = $2,
                        stamina_updated_at = $3,
                        updated_at = now()
            WHERE player_id = $1`,
    [mutation.playerId, mutation.nextStamina, mutation.nextStaminaUpdatedAt],
  );
  if ((updated.rowCount ?? 0) !== 1) {
    throw new Error('player_progression_core_missing');
  }
  await upsertPlayerItemUseWatermark(client, mutation.playerId, 'progression_version', persistenceVersion);
}

async function upsertPlayerItemUseWatermark(
  client: PoolClient,
  playerId: string,
  column: 'map_unlock_version' | 'anchor_version' | 'progression_version',
  persistenceVersion: number,
): Promise<void> {
  await client.query(
    `INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(player_id, ${column}, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (player_id)
     DO UPDATE SET
       ${column} = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.${column}, EXCLUDED.${column}),
       updated_at = now()`,
    [playerId, persistenceVersion],
  );
}

function normalizeRespawnPoint(value: unknown): RespawnPointSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }
  const templateId = normalizeRequiredString(value.templateId);
  const instanceId = normalizeOptionalString(value.instanceId);
  const x = normalizeInteger(value.x);
  const y = normalizeInteger(value.y);
  return !templateId || x === null || y === null ? null : { templateId, instanceId, x, y };
}

function isSameRespawnPoint(left: RespawnPointSnapshot, right: RespawnPointSnapshot): boolean {
  return left.templateId === right.templateId
    && left.instanceId === right.instanceId
    && left.x === right.x
    && left.y === right.y;
}

function normalizeStringSet(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.map((entry) => normalizeRequiredString(entry)).filter(Boolean))).sort();
}

function isSameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalString(value: unknown): string | null {
  return normalizeRequiredString(value) || null;
}

function normalizeInteger(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
