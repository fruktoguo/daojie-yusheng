import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

import { DatabasePoolProvider } from './database-pool.provider';
import { normalizeMonsterTier } from '@mud/shared';

const INSTANCE_TILE_RESOURCE_STATE_TABLE = 'instance_tile_resource_state';
const INSTANCE_CHECKPOINT_TABLE = 'instance_checkpoint';
const INSTANCE_RECOVERY_WATERMARK_TABLE = 'instance_recovery_watermark';
const INSTANCE_GROUND_ITEM_TABLE = 'instance_ground_item';
const INSTANCE_CONTAINER_STATE_TABLE = 'instance_container_state';
const INSTANCE_MONSTER_RUNTIME_STATE_TABLE = 'instance_monster_runtime_state';
const INSTANCE_EVENT_STATE_TABLE = 'instance_event_state';
const INSTANCE_OVERLAY_CHUNK_TABLE = 'instance_overlay_chunk';
const INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE = 42871;
const INSTANCE_TILE_RESOURCE_STATE_LOCK_KEY = 3001;
const INSTANCE_CHECKPOINT_LOCK_KEY = 3002;
const INSTANCE_RECOVERY_WATERMARK_LOCK_KEY = 3003;
const INSTANCE_GROUND_ITEM_LOCK_KEY = 3004;
const INSTANCE_CONTAINER_STATE_LOCK_KEY = 3005;
const INSTANCE_MONSTER_RUNTIME_STATE_LOCK_KEY = 3006;
const INSTANCE_EVENT_STATE_LOCK_KEY = 3007;
const INSTANCE_OVERLAY_CHUNK_LOCK_KEY = 3008;

@Injectable()
export class InstanceDomainPersistenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InstanceDomainPersistenceService.name);
  private pool: Pool | null = null;
  private enabled = false;

  constructor(private readonly databasePoolProvider: DatabasePoolProvider | null = null) {}

  async onModuleInit(): Promise<void> {
    this.pool = this.databasePoolProvider?.getPool('instance-domain') ?? null;
    if (!this.pool) {
      this.logger.log('实例分域持久化已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }

    try {
      await ensureInstanceTileResourceStateTable(this.pool);
      await ensureInstanceCheckpointTable(this.pool);
      await ensureInstanceRecoveryWatermarkTable(this.pool);
      await ensureInstanceGroundItemTable(this.pool);
      await ensureInstanceContainerStateTable(this.pool);
      await ensureInstanceMonsterRuntimeStateTable(this.pool);
      await ensureInstanceEventStateTable(this.pool);
      await ensureInstanceOverlayChunkTable(this.pool);
      this.enabled = true;
      this.logger.log('实例分域持久化已启用');
    } catch (error: unknown) {
      this.logger.error(
        '实例分域持久化初始化失败，已回退为禁用模式',
        error instanceof Error ? error.stack : String(error),
      );
      await this.safeClosePool();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.safeClosePool();
  }

  isEnabled(): boolean {
    return this.enabled && this.pool !== null;
  }

  async saveTileResourceDiffs(
    instanceId: string,
    entries: Array<{ resourceKey: string; tileIndex: number; value: number }>,
  ): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId || !Array.isArray(entries) || entries.length === 0) {
      return;
    }

    const normalizedEntries = entries
      .filter((entry) => Boolean(entry)
        && typeof entry.resourceKey === 'string'
        && entry.resourceKey.trim().length > 0
        && Number.isFinite(entry.tileIndex)
        && Number.isFinite(entry.value))
      .map((entry) => ({
        resourceKey: entry.resourceKey.trim(),
        tileIndex: Math.trunc(entry.tileIndex),
        value: Math.max(0, Math.trunc(entry.value)),
      }));
    if (normalizedEntries.length === 0) {
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, normalizedInstanceId);
      for (const entry of normalizedEntries) {
        await client.query(
          `
            INSERT INTO ${INSTANCE_TILE_RESOURCE_STATE_TABLE}(
              instance_id,
              resource_key,
              tile_index,
              value,
              updated_at
            )
            VALUES ($1, $2, $3, $4, now())
            ON CONFLICT (instance_id, resource_key, tile_index)
            DO UPDATE SET
              value = EXCLUDED.value,
              updated_at = now()
          `,
          [normalizedInstanceId, entry.resourceKey, entry.tileIndex, entry.value],
        );
      }
      await client.query('COMMIT');
    } catch (error: unknown) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async loadTileResourceDiffs(instanceId: string): Promise<Array<{ resourceKey: string; tileIndex: number; value: number }>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return [];
    }
    const result = await this.pool.query(
      `
        SELECT resource_key, tile_index, value
        FROM ${INSTANCE_TILE_RESOURCE_STATE_TABLE}
        WHERE instance_id = $1
        ORDER BY resource_key ASC, tile_index ASC
      `,
      [normalizedInstanceId],
    );
    return Array.isArray(result.rows)
      ? result.rows.map((row) => ({
          resourceKey: typeof row.resource_key === 'string' ? row.resource_key : '',
          tileIndex: Number.isFinite(row.tile_index) ? Math.trunc(Number(row.tile_index)) : 0,
          value: Number.isFinite(row.value) ? Math.trunc(Number(row.value)) : 0,
        }))
      : [];
  }

  async saveInstanceCheckpoint(instanceId: string, payload: unknown): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return;
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, normalizedInstanceId);
      await client.query(
        `
          INSERT INTO ${INSTANCE_CHECKPOINT_TABLE}(
            instance_id,
            checkpoint_payload,
            updated_at
          )
          VALUES ($1, $2::jsonb, now())
          ON CONFLICT (instance_id)
          DO UPDATE SET
            checkpoint_payload = EXCLUDED.checkpoint_payload,
            updated_at = now()
        `,
        [normalizedInstanceId, JSON.stringify(payload ?? {})],
      );
      await client.query('COMMIT');
    } catch (error: unknown) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async loadInstanceCheckpoint(instanceId: string): Promise<unknown | null> {
    if (!this.pool || !this.enabled) {
      return null;
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return null;
    }
    const result = await this.pool.query(
      `SELECT checkpoint_payload FROM ${INSTANCE_CHECKPOINT_TABLE} WHERE instance_id = $1 LIMIT 1`,
      [normalizedInstanceId],
    );
    if ((result.rowCount ?? 0) === 0) {
      return null;
    }
    return result.rows[0]?.checkpoint_payload ?? null;
  }

  async saveInstanceRecoveryWatermark(instanceId: string, payload: unknown): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return;
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, normalizedInstanceId);
      await client.query(
        `
          INSERT INTO ${INSTANCE_RECOVERY_WATERMARK_TABLE}(
            instance_id,
            watermark_payload,
            updated_at
          )
          VALUES ($1, $2::jsonb, now())
          ON CONFLICT (instance_id)
          DO UPDATE SET
            watermark_payload = EXCLUDED.watermark_payload,
            updated_at = now()
        `,
        [normalizedInstanceId, JSON.stringify(payload ?? {})],
      );
      await client.query('COMMIT');
    } catch (error: unknown) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async loadInstanceRecoveryWatermark(instanceId: string): Promise<unknown | null> {
    if (!this.pool || !this.enabled) {
      return null;
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return null;
    }
    const result = await this.pool.query(
      `SELECT watermark_payload FROM ${INSTANCE_RECOVERY_WATERMARK_TABLE} WHERE instance_id = $1 LIMIT 1`,
      [normalizedInstanceId],
    );
    if ((result.rowCount ?? 0) === 0) {
      return null;
    }
    return result.rows[0]?.watermark_payload ?? null;
  }

  async saveGroundItem(
    input: {
      groundItemId: string;
      instanceId: string;
      tileIndex: number;
      itemPayload: unknown;
      expireAt?: string | null;
    },
  ): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    const groundItemId = normalizeRequiredString(input.groundItemId);
    const instanceId = normalizeRequiredString(input.instanceId);
    if (!groundItemId || !instanceId) {
      return;
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, instanceId);
      await client.query(
        `
          INSERT INTO ${INSTANCE_GROUND_ITEM_TABLE}(
            ground_item_id,
            instance_id,
            tile_index,
            item_instance_payload,
            expire_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4::jsonb, $5, now())
          ON CONFLICT (ground_item_id)
          DO UPDATE SET
            instance_id = EXCLUDED.instance_id,
            tile_index = EXCLUDED.tile_index,
            item_instance_payload = EXCLUDED.item_instance_payload,
            expire_at = EXCLUDED.expire_at,
            updated_at = now()
        `,
        [
          groundItemId,
          instanceId,
          Math.trunc(Number(input.tileIndex ?? 0)),
          JSON.stringify(input.itemPayload ?? {}),
          input.expireAt ?? null,
        ],
      );
      await client.query('COMMIT');
    } catch (error: unknown) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async removeGroundItem(groundItemId: string): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const normalizedGroundItemId = normalizeRequiredString(groundItemId);
    if (!normalizedGroundItemId) {
      return false;
    }
    const result = await this.pool.query(
      `DELETE FROM ${INSTANCE_GROUND_ITEM_TABLE} WHERE ground_item_id = $1`,
      [normalizedGroundItemId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async loadGroundItems(instanceId: string): Promise<Array<{
    groundItemId: string;
    instanceId: string;
    tileIndex: number;
    itemPayload: unknown;
    expireAt: string | null;
  }>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return [];
    }
    const result = await this.pool.query(
      `
        SELECT ground_item_id, instance_id, tile_index, item_instance_payload, expire_at
        FROM ${INSTANCE_GROUND_ITEM_TABLE}
        WHERE instance_id = $1
        ORDER BY tile_index ASC, ground_item_id ASC
      `,
      [normalizedInstanceId],
    );
    return Array.isArray(result.rows)
      ? result.rows.map((row) => ({
          groundItemId: typeof row.ground_item_id === 'string' ? row.ground_item_id : '',
          instanceId: typeof row.instance_id === 'string' ? row.instance_id : '',
          tileIndex: Number.isFinite(row.tile_index) ? Math.trunc(Number(row.tile_index)) : 0,
          itemPayload: row.item_instance_payload ?? null,
          expireAt: typeof row.expire_at === 'string' ? row.expire_at : null,
        }))
      : [];
  }

  async saveContainerState(input: {
    instanceId: string;
    containerId: string;
    sourceId: string;
    statePayload: unknown;
  }): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    const instanceId = normalizeRequiredString(input.instanceId);
    const containerId = normalizeRequiredString(input.containerId);
    const sourceId = normalizeRequiredString(input.sourceId);
    if (!instanceId || !containerId || !sourceId) {
      return;
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, instanceId);
      await client.query(
        `
          INSERT INTO ${INSTANCE_CONTAINER_STATE_TABLE}(
            instance_id,
            container_id,
            source_id,
            state_payload,
            updated_at
          )
          VALUES ($1, $2, $3, $4::jsonb, now())
          ON CONFLICT (instance_id, container_id)
          DO UPDATE SET
            source_id = EXCLUDED.source_id,
            state_payload = EXCLUDED.state_payload,
            updated_at = now()
        `,
        [instanceId, containerId, sourceId, JSON.stringify(input.statePayload ?? {})],
      );
      await client.query('COMMIT');
    } catch (error: unknown) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async removeContainerState(instanceId: string, containerId: string): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    const normalizedContainerId = normalizeRequiredString(containerId);
    if (!normalizedInstanceId || !normalizedContainerId) {
      return false;
    }
    const result = await this.pool.query(
      `DELETE FROM ${INSTANCE_CONTAINER_STATE_TABLE} WHERE instance_id = $1 AND container_id = $2`,
      [normalizedInstanceId, normalizedContainerId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async loadContainerStates(instanceId: string): Promise<Array<{
    instanceId: string;
    containerId: string;
    sourceId: string;
    statePayload: unknown;
  }>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return [];
    }
    const result = await this.pool.query(
      `
        SELECT instance_id, container_id, source_id, state_payload
        FROM ${INSTANCE_CONTAINER_STATE_TABLE}
        WHERE instance_id = $1
        ORDER BY container_id ASC
      `,
      [normalizedInstanceId],
    );
    return Array.isArray(result.rows)
      ? result.rows.map((row) => ({
          instanceId: typeof row.instance_id === 'string' ? row.instance_id : '',
          containerId: typeof row.container_id === 'string' ? row.container_id : '',
          sourceId: typeof row.source_id === 'string' ? row.source_id : '',
          statePayload: row.state_payload ?? null,
        }))
      : [];
  }

  async saveMonsterRuntimeState(input: {
    monsterRuntimeId: string;
    instanceId: string;
    monsterId: string;
    monsterName: string;
    monsterTier: unknown;
    monsterLevel?: number | null;
    tileIndex: number;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    alive: boolean;
    respawnLeft?: number | null;
    respawnTicks?: number | null;
    aggroTargetPlayerId?: string | null;
    statePayload: unknown;
  }): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const monsterRuntimeId = normalizeRequiredString(input.monsterRuntimeId);
    const instanceId = normalizeRequiredString(input.instanceId);
    const monsterId = normalizeRequiredString(input.monsterId);
    const monsterName = normalizeRequiredString(input.monsterName);
    const normalizedTier = normalizeMonsterTier(input.monsterTier);
    if (!monsterRuntimeId || !instanceId || !monsterId || !monsterName || normalizedTier === 'mortal_blood') {
      return false;
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, instanceId);
      await client.query(
        `
          INSERT INTO ${INSTANCE_MONSTER_RUNTIME_STATE_TABLE}(
            monster_runtime_id,
            instance_id,
            monster_id,
            monster_name,
            monster_tier,
            monster_level,
            tile_index,
            x,
            y,
            hp,
            max_hp,
            alive,
            respawn_left,
            respawn_ticks,
            aggro_target_player_id,
            state_payload,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, now())
          ON CONFLICT (monster_runtime_id)
          DO UPDATE SET
            instance_id = EXCLUDED.instance_id,
            monster_id = EXCLUDED.monster_id,
            monster_name = EXCLUDED.monster_name,
            monster_tier = EXCLUDED.monster_tier,
            monster_level = EXCLUDED.monster_level,
            tile_index = EXCLUDED.tile_index,
            x = EXCLUDED.x,
            y = EXCLUDED.y,
            hp = EXCLUDED.hp,
            max_hp = EXCLUDED.max_hp,
            alive = EXCLUDED.alive,
            respawn_left = EXCLUDED.respawn_left,
            respawn_ticks = EXCLUDED.respawn_ticks,
            aggro_target_player_id = EXCLUDED.aggro_target_player_id,
            state_payload = EXCLUDED.state_payload,
            updated_at = now()
        `,
        [
          monsterRuntimeId,
          instanceId,
          monsterId,
          monsterName,
          normalizedTier,
          Number.isFinite(input.monsterLevel) ? Math.trunc(Number(input.monsterLevel)) : null,
          Math.trunc(Number(input.tileIndex ?? 0)),
          Math.trunc(Number(input.x ?? 0)),
          Math.trunc(Number(input.y ?? 0)),
          Math.max(0, Math.trunc(Number(input.hp ?? 0))),
          Math.max(1, Math.trunc(Number(input.maxHp ?? 1))),
          input.alive === true,
          Number.isFinite(input.respawnLeft) ? Math.max(0, Math.trunc(Number(input.respawnLeft))) : null,
          Number.isFinite(input.respawnTicks) ? Math.max(0, Math.trunc(Number(input.respawnTicks))) : null,
          normalizeRequiredString(input.aggroTargetPlayerId),
          JSON.stringify(input.statePayload ?? {}),
        ],
      );
      await client.query('COMMIT');
      return true;
    } catch (error: unknown) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async removeMonsterRuntimeState(monsterRuntimeId: string): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const normalizedMonsterRuntimeId = normalizeRequiredString(monsterRuntimeId);
    if (!normalizedMonsterRuntimeId) {
      return false;
    }
    const result = await this.pool.query(
      `DELETE FROM ${INSTANCE_MONSTER_RUNTIME_STATE_TABLE} WHERE monster_runtime_id = $1`,
      [normalizedMonsterRuntimeId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async loadMonsterRuntimeStates(instanceId: string): Promise<Array<{
    monsterRuntimeId: string;
    instanceId: string;
    monsterId: string;
    monsterName: string;
    monsterTier: string;
    monsterLevel: number | null;
    tileIndex: number;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    alive: boolean;
    respawnLeft: number | null;
    respawnTicks: number | null;
    aggroTargetPlayerId: string | null;
    statePayload: unknown;
  }>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return [];
    }
    const result = await this.pool.query(
      `
        SELECT
          monster_runtime_id,
          instance_id,
          monster_id,
          monster_name,
          monster_tier,
          monster_level,
          tile_index,
          x,
          y,
          hp,
          max_hp,
          alive,
          respawn_left,
          respawn_ticks,
          aggro_target_player_id,
          state_payload
        FROM ${INSTANCE_MONSTER_RUNTIME_STATE_TABLE}
        WHERE instance_id = $1
        ORDER BY monster_runtime_id ASC
      `,
      [normalizedInstanceId],
    );
    return Array.isArray(result.rows)
      ? result.rows.map((row) => ({
          monsterRuntimeId: typeof row.monster_runtime_id === 'string' ? row.monster_runtime_id : '',
          instanceId: typeof row.instance_id === 'string' ? row.instance_id : '',
          monsterId: typeof row.monster_id === 'string' ? row.monster_id : '',
          monsterName: typeof row.monster_name === 'string' ? row.monster_name : '',
          monsterTier: typeof row.monster_tier === 'string' ? row.monster_tier : 'mortal_blood',
          monsterLevel: Number.isFinite(row.monster_level) ? Math.trunc(Number(row.monster_level)) : null,
          tileIndex: Number.isFinite(row.tile_index) ? Math.trunc(Number(row.tile_index)) : 0,
          x: Number.isFinite(row.x) ? Math.trunc(Number(row.x)) : 0,
          y: Number.isFinite(row.y) ? Math.trunc(Number(row.y)) : 0,
          hp: Number.isFinite(row.hp) ? Math.trunc(Number(row.hp)) : 0,
          maxHp: Number.isFinite(row.max_hp) ? Math.trunc(Number(row.max_hp)) : 0,
          alive: row.alive === true,
          respawnLeft: Number.isFinite(row.respawn_left) ? Math.trunc(Number(row.respawn_left)) : null,
          respawnTicks: Number.isFinite(row.respawn_ticks) ? Math.trunc(Number(row.respawn_ticks)) : null,
          aggroTargetPlayerId: typeof row.aggro_target_player_id === 'string' ? row.aggro_target_player_id : null,
          statePayload: row.state_payload ?? null,
        }))
      : [];
  }

  async saveEventState(input: {
    eventId: string;
    instanceId: string;
    eventKind: string;
    eventKey: string;
    statePayload: unknown;
    resolvedAt?: string | null;
  }): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const eventId = normalizeRequiredString(input.eventId);
    const instanceId = normalizeRequiredString(input.instanceId);
    const eventKind = normalizeRequiredString(input.eventKind);
    const eventKey = normalizeRequiredString(input.eventKey);
    if (!eventId || !instanceId || !eventKind || !eventKey) {
      return false;
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, instanceId);
      await client.query(
        `
          INSERT INTO ${INSTANCE_EVENT_STATE_TABLE}(
            event_id,
            instance_id,
            event_kind,
            event_key,
            state_payload,
            resolved_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, $6, now())
          ON CONFLICT (event_id)
          DO UPDATE SET
            instance_id = EXCLUDED.instance_id,
            event_kind = EXCLUDED.event_kind,
            event_key = EXCLUDED.event_key,
            state_payload = EXCLUDED.state_payload,
            resolved_at = EXCLUDED.resolved_at,
            updated_at = now()
        `,
        [eventId, instanceId, eventKind, eventKey, JSON.stringify(input.statePayload ?? {}), input.resolvedAt ?? null],
      );
      await client.query('COMMIT');
      return true;
    } catch (error: unknown) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async removeEventState(eventId: string): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const normalizedEventId = normalizeRequiredString(eventId);
    if (!normalizedEventId) {
      return false;
    }
    const result = await this.pool.query(`DELETE FROM ${INSTANCE_EVENT_STATE_TABLE} WHERE event_id = $1`, [normalizedEventId]);
    return (result.rowCount ?? 0) > 0;
  }

  async loadEventStates(instanceId: string): Promise<Array<{
    eventId: string;
    instanceId: string;
    eventKind: string;
    eventKey: string;
    statePayload: unknown;
    resolvedAt: string | null;
  }>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return [];
    }
    const result = await this.pool.query(
      `
        SELECT event_id, instance_id, event_kind, event_key, state_payload, resolved_at
        FROM ${INSTANCE_EVENT_STATE_TABLE}
        WHERE instance_id = $1
        ORDER BY event_kind ASC, event_key ASC, event_id ASC
      `,
      [normalizedInstanceId],
    );
    return Array.isArray(result.rows)
      ? result.rows.map((row) => ({
          eventId: typeof row.event_id === 'string' ? row.event_id : '',
          instanceId: typeof row.instance_id === 'string' ? row.instance_id : '',
          eventKind: typeof row.event_kind === 'string' ? row.event_kind : '',
          eventKey: typeof row.event_key === 'string' ? row.event_key : '',
          statePayload: row.state_payload ?? null,
          resolvedAt: typeof row.resolved_at === 'string' ? row.resolved_at : null,
        }))
      : [];
  }

  async saveOverlayChunk(input: {
    instanceId: string;
    patchKind: 'tile' | 'portal' | 'npc' | 'container' | 'rule';
    chunkKey: string;
    patchVersion: number;
    patchPayload: unknown;
  }): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const instanceId = normalizeRequiredString(input.instanceId);
    const chunkKey = normalizeRequiredString(input.chunkKey);
    const patchKind = normalizeRequiredString(input.patchKind);
    if (!instanceId || !chunkKey || !patchKind) {
      return false;
    }
    const normalizedPatchKind = ['tile', 'portal', 'npc', 'container', 'rule'].includes(patchKind) ? patchKind : '';
    if (!normalizedPatchKind) {
      return false;
    }
    const patchVersion = Number.isFinite(input.patchVersion) ? Math.max(0, Math.trunc(Number(input.patchVersion))) : 0;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, instanceId);
      await client.query(
        `
          INSERT INTO ${INSTANCE_OVERLAY_CHUNK_TABLE}(
            instance_id,
            patch_kind,
            chunk_key,
            patch_version,
            patch_payload,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, now())
          ON CONFLICT (instance_id, patch_kind, chunk_key)
          DO UPDATE SET
            patch_version = EXCLUDED.patch_version,
            patch_payload = EXCLUDED.patch_payload,
            updated_at = now()
        `,
        [instanceId, normalizedPatchKind, chunkKey, patchVersion, JSON.stringify(input.patchPayload ?? {})],
      );
      await client.query('COMMIT');
      return true;
    } catch (error: unknown) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async removeOverlayChunk(instanceId: string, patchKind: string, chunkKey: string): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    const normalizedPatchKind = normalizeRequiredString(patchKind);
    const normalizedChunkKey = normalizeRequiredString(chunkKey);
    if (!normalizedInstanceId || !normalizedPatchKind || !normalizedChunkKey) {
      return false;
    }
    const result = await this.pool.query(
      `DELETE FROM ${INSTANCE_OVERLAY_CHUNK_TABLE} WHERE instance_id = $1 AND patch_kind = $2 AND chunk_key = $3`,
      [normalizedInstanceId, normalizedPatchKind, normalizedChunkKey],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async purgeInstanceState(instanceId: string): Promise<number> {
    if (!this.pool || !this.enabled) {
      return 0;
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return 0;
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, normalizedInstanceId);
      const statements = [
        `DELETE FROM ${INSTANCE_TILE_RESOURCE_STATE_TABLE} WHERE instance_id = $1`,
        `DELETE FROM ${INSTANCE_CHECKPOINT_TABLE} WHERE instance_id = $1`,
        `DELETE FROM ${INSTANCE_RECOVERY_WATERMARK_TABLE} WHERE instance_id = $1`,
        `DELETE FROM ${INSTANCE_GROUND_ITEM_TABLE} WHERE instance_id = $1`,
        `DELETE FROM ${INSTANCE_CONTAINER_STATE_TABLE} WHERE instance_id = $1`,
        `DELETE FROM ${INSTANCE_MONSTER_RUNTIME_STATE_TABLE} WHERE instance_id = $1`,
        `DELETE FROM ${INSTANCE_EVENT_STATE_TABLE} WHERE instance_id = $1`,
        `DELETE FROM ${INSTANCE_OVERLAY_CHUNK_TABLE} WHERE instance_id = $1`,
      ];
      let deleted = 0;
      for (const statement of statements) {
        const result = await client.query(statement, [normalizedInstanceId]);
        deleted += Number(result.rowCount ?? 0);
      }
      await client.query('COMMIT');
      return deleted;
    } catch (error: unknown) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async loadOverlayChunks(instanceId: string): Promise<Array<{
    instanceId: string;
    patchKind: string;
    chunkKey: string;
    patchVersion: number;
    patchPayload: unknown;
  }>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return [];
    }
    const result = await this.pool.query(
      `
        SELECT instance_id, patch_kind, chunk_key, patch_version, patch_payload
        FROM ${INSTANCE_OVERLAY_CHUNK_TABLE}
        WHERE instance_id = $1
        ORDER BY patch_kind ASC, chunk_key ASC
      `,
      [normalizedInstanceId],
    );
    return Array.isArray(result.rows)
      ? result.rows.map((row) => ({
          instanceId: typeof row.instance_id === 'string' ? row.instance_id : '',
          patchKind: typeof row.patch_kind === 'string' ? row.patch_kind : '',
          chunkKey: typeof row.chunk_key === 'string' ? row.chunk_key : '',
          patchVersion: Number.isFinite(Number(row.patch_version)) ? Math.trunc(Number(row.patch_version)) : 0,
          patchPayload: row.patch_payload ?? null,
        }))
      : [];
  }

  private async safeClosePool(): Promise<void> {
    const pool = this.pool;
    this.pool = null;
    this.enabled = false;
    if (pool) {
      await pool.end().catch(() => undefined);
    }
  }
}

async function ensureInstanceTileResourceStateTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_lock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_TILE_RESOURCE_STATE_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INSTANCE_TILE_RESOURCE_STATE_TABLE} (
        instance_id varchar(100) NOT NULL,
        resource_key varchar(100) NOT NULL,
        tile_index integer NOT NULL,
        value integer NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (instance_id, resource_key, tile_index)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_tile_resource_state_instance_idx
      ON ${INSTANCE_TILE_RESOURCE_STATE_TABLE}(instance_id, resource_key, tile_index)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_TILE_RESOURCE_STATE_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

async function ensureInstanceCheckpointTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_lock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_CHECKPOINT_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INSTANCE_CHECKPOINT_TABLE} (
        instance_id varchar(100) NOT NULL PRIMARY KEY,
        checkpoint_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_checkpoint_updated_idx
      ON ${INSTANCE_CHECKPOINT_TABLE}(updated_at DESC)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_CHECKPOINT_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

async function ensureInstanceRecoveryWatermarkTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_lock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_RECOVERY_WATERMARK_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INSTANCE_RECOVERY_WATERMARK_TABLE} (
        instance_id varchar(100) NOT NULL PRIMARY KEY,
        watermark_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_recovery_watermark_updated_idx
      ON ${INSTANCE_RECOVERY_WATERMARK_TABLE}(updated_at DESC)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_RECOVERY_WATERMARK_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

async function ensureInstanceGroundItemTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_lock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_GROUND_ITEM_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INSTANCE_GROUND_ITEM_TABLE} (
        ground_item_id varchar(100) NOT NULL PRIMARY KEY,
        instance_id varchar(100) NOT NULL,
        tile_index integer NOT NULL,
        item_instance_payload jsonb NOT NULL,
        expire_at timestamptz NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_ground_item_instance_idx
      ON ${INSTANCE_GROUND_ITEM_TABLE}(instance_id, tile_index, ground_item_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_ground_item_expire_idx
      ON ${INSTANCE_GROUND_ITEM_TABLE}(expire_at ASC)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_GROUND_ITEM_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

async function ensureInstanceContainerStateTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_lock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_CONTAINER_STATE_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INSTANCE_CONTAINER_STATE_TABLE} (
        instance_id varchar(100) NOT NULL,
        container_id varchar(100) NOT NULL,
        source_id varchar(100) NOT NULL,
        state_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (instance_id, container_id)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_container_state_instance_idx
      ON ${INSTANCE_CONTAINER_STATE_TABLE}(instance_id, container_id)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_CONTAINER_STATE_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

async function ensureInstanceMonsterRuntimeStateTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_lock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_MONSTER_RUNTIME_STATE_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INSTANCE_MONSTER_RUNTIME_STATE_TABLE} (
        monster_runtime_id varchar(100) NOT NULL PRIMARY KEY,
        instance_id varchar(100) NOT NULL,
        monster_id varchar(100) NOT NULL,
        monster_name varchar(200) NOT NULL,
        monster_tier varchar(32) NOT NULL,
        monster_level integer NULL,
        tile_index integer NOT NULL,
        x integer NOT NULL,
        y integer NOT NULL,
        hp integer NOT NULL DEFAULT 0,
        max_hp integer NOT NULL DEFAULT 0,
        alive boolean NOT NULL DEFAULT true,
        respawn_left integer NULL,
        respawn_ticks integer NULL,
        aggro_target_player_id varchar(100) NULL,
        state_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_monster_runtime_state_instance_idx
      ON ${INSTANCE_MONSTER_RUNTIME_STATE_TABLE}(instance_id, monster_tier, monster_runtime_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_monster_runtime_state_updated_idx
      ON ${INSTANCE_MONSTER_RUNTIME_STATE_TABLE}(updated_at DESC)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_MONSTER_RUNTIME_STATE_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

async function ensureInstanceEventStateTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_lock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_EVENT_STATE_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INSTANCE_EVENT_STATE_TABLE} (
        event_id varchar(180) NOT NULL PRIMARY KEY,
        instance_id varchar(100) NOT NULL,
        event_kind varchar(80) NOT NULL,
        event_key varchar(180) NOT NULL,
        state_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        resolved_at timestamptz NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_event_state_instance_idx
      ON ${INSTANCE_EVENT_STATE_TABLE}(instance_id, event_kind, event_key)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_event_state_resolved_idx
      ON ${INSTANCE_EVENT_STATE_TABLE}(resolved_at DESC)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_EVENT_STATE_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

async function ensureInstanceOverlayChunkTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_lock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_OVERLAY_CHUNK_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INSTANCE_OVERLAY_CHUNK_TABLE} (
        instance_id varchar(100) NOT NULL,
        patch_kind varchar(32) NOT NULL,
        chunk_key varchar(180) NOT NULL,
        patch_version bigint NOT NULL DEFAULT 0,
        patch_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (instance_id, patch_kind, chunk_key)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_overlay_chunk_instance_idx
      ON ${INSTANCE_OVERLAY_CHUNK_TABLE}(instance_id, patch_kind, chunk_key)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_overlay_chunk_updated_idx
      ON ${INSTANCE_OVERLAY_CHUNK_TABLE}(updated_at DESC)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_OVERLAY_CHUNK_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

async function acquireInstanceDomainLock(client: any, instanceId: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [instanceId]);
}

async function rollbackQuietly(client: any): Promise<void> {
  await client.query('ROLLBACK').catch(() => undefined);
}

function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
