import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

import { DatabasePoolProvider } from './database-pool.provider';
import { normalizeMonsterTier } from '@mud/shared';

const INSTANCE_TILE_RESOURCE_STATE_TABLE = 'instance_tile_resource_state';
const INSTANCE_TILE_CELL_TABLE = 'instance_tile_cell';
const INSTANCE_TILE_DAMAGE_STATE_TABLE = 'instance_tile_damage_state';
const INSTANCE_CHECKPOINT_TABLE = 'instance_checkpoint';
const INSTANCE_RECOVERY_WATERMARK_TABLE = 'instance_recovery_watermark';
const INSTANCE_GROUND_ITEM_TABLE = 'instance_ground_item';
const INSTANCE_CONTAINER_STATE_TABLE = 'instance_container_state';
const INSTANCE_CONTAINER_ENTRY_TABLE = 'instance_container_entry';
const INSTANCE_CONTAINER_TIMER_TABLE = 'instance_container_timer';
const INSTANCE_MONSTER_RUNTIME_STATE_TABLE = 'instance_monster_runtime_state';
const INSTANCE_EVENT_STATE_TABLE = 'instance_event_state';
const INSTANCE_OVERLAY_CHUNK_TABLE = 'instance_overlay_chunk';
const INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE = 42871;
const INSTANCE_TILE_RESOURCE_STATE_LOCK_KEY = 3001;
const INSTANCE_TILE_CELL_LOCK_KEY = 3012;
const INSTANCE_TILE_DAMAGE_STATE_LOCK_KEY = 3009;
const INSTANCE_CHECKPOINT_LOCK_KEY = 3002;
const INSTANCE_RECOVERY_WATERMARK_LOCK_KEY = 3003;
const INSTANCE_GROUND_ITEM_LOCK_KEY = 3004;
const INSTANCE_CONTAINER_STATE_LOCK_KEY = 3005;
const INSTANCE_CONTAINER_ENTRY_LOCK_KEY = 3010;
const INSTANCE_CONTAINER_TIMER_LOCK_KEY = 3011;
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
      await ensureInstanceTileCellTable(this.pool);
      await ensureInstanceTileDamageStateTable(this.pool);
      await ensureInstanceCheckpointTable(this.pool);
      await ensureInstanceRecoveryWatermarkTable(this.pool);
      await ensureInstanceGroundItemTable(this.pool);
      await ensureInstanceContainerStateTable(this.pool);
      await ensureInstanceContainerEntryTable(this.pool);
      await ensureInstanceContainerTimerTable(this.pool);
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
    if (!normalizedInstanceId) {
      return;
    }

    const normalizedEntries = (Array.isArray(entries) ? entries : [])
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
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, normalizedInstanceId);
      await client.query(`DELETE FROM ${INSTANCE_TILE_RESOURCE_STATE_TABLE} WHERE instance_id = $1`, [normalizedInstanceId]);
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

  async replaceRuntimeTileCells(
    instanceId: string,
    entries: Array<{ x: number; y: number; tileType: string }>,
  ): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return;
    }
    const normalizedEntries = (Array.isArray(entries) ? entries : [])
      .filter((entry) => Boolean(entry)
        && Number.isFinite(Number(entry.x))
        && Number.isFinite(Number(entry.y))
        && typeof entry.tileType === 'string'
        && entry.tileType.trim().length > 0)
      .map((entry) => ({
        x: Math.trunc(Number(entry.x)),
        y: Math.trunc(Number(entry.y)),
        tileType: entry.tileType.trim(),
      }));
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, normalizedInstanceId);
      await client.query(`DELETE FROM ${INSTANCE_TILE_CELL_TABLE} WHERE instance_id = $1`, [normalizedInstanceId]);
      for (const entry of normalizedEntries) {
        await client.query(
          `
            INSERT INTO ${INSTANCE_TILE_CELL_TABLE}(
              instance_id,
              x,
              y,
              tile_type,
              updated_at
            )
            VALUES ($1, $2, $3, $4, now())
            ON CONFLICT (instance_id, x, y)
            DO UPDATE SET
              tile_type = EXCLUDED.tile_type,
              updated_at = now()
          `,
          [normalizedInstanceId, entry.x, entry.y, entry.tileType],
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

  async loadRuntimeTileCells(instanceId: string): Promise<Array<{ x: number; y: number; tileType: string }>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return [];
    }
    const result = await this.pool.query(
      `
        SELECT x, y, tile_type
        FROM ${INSTANCE_TILE_CELL_TABLE}
        WHERE instance_id = $1
        ORDER BY y ASC, x ASC
      `,
      [normalizedInstanceId],
    );
    return Array.isArray(result.rows)
      ? result.rows.map((row) => ({
          x: Number.isFinite(row.x) ? Math.trunc(Number(row.x)) : 0,
          y: Number.isFinite(row.y) ? Math.trunc(Number(row.y)) : 0,
          tileType: typeof row.tile_type === 'string' ? row.tile_type : '',
        })).filter((entry) => entry.tileType.length > 0)
      : [];
  }

  async saveTileDamageStates(
    instanceId: string,
    entries: Array<{
      tileIndex: number;
      hp: number;
      maxHp: number;
      destroyed: boolean;
      respawnLeft?: number | null;
      modifiedAt?: number | null;
    }>,
  ): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return;
    }
    const normalizedEntries = Array.isArray(entries)
      ? entries
          .filter((entry) => Boolean(entry) && Number.isFinite(entry.tileIndex))
          .map((entry) => ({
            tileIndex: Math.max(0, Math.trunc(Number(entry.tileIndex))),
            hp: Math.max(0, Math.trunc(Number(entry.hp) || 0)),
            maxHp: Math.max(1, Math.trunc(Number(entry.maxHp) || 1)),
            destroyed: entry.destroyed === true,
            respawnLeft: Math.max(0, Math.trunc(Number(entry.respawnLeft) || 0)),
            modifiedAt: Number.isFinite(Number(entry.modifiedAt)) ? Math.max(0, Math.trunc(Number(entry.modifiedAt))) : Date.now(),
          }))
      : [];
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, normalizedInstanceId);
      await client.query(`DELETE FROM ${INSTANCE_TILE_DAMAGE_STATE_TABLE} WHERE instance_id = $1`, [normalizedInstanceId]);
      for (const entry of normalizedEntries) {
        await client.query(
          `
            INSERT INTO ${INSTANCE_TILE_DAMAGE_STATE_TABLE}(
              instance_id,
              tile_index,
              hp,
              max_hp,
              destroyed,
              respawn_left_ticks,
              modified_at_ms,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, now())
            ON CONFLICT (instance_id, tile_index)
            DO UPDATE SET
              hp = EXCLUDED.hp,
              max_hp = EXCLUDED.max_hp,
              destroyed = EXCLUDED.destroyed,
              respawn_left_ticks = EXCLUDED.respawn_left_ticks,
              modified_at_ms = EXCLUDED.modified_at_ms,
              updated_at = now()
          `,
          [
            normalizedInstanceId,
            entry.tileIndex,
            entry.hp,
            entry.maxHp,
            entry.destroyed,
            entry.respawnLeft,
            entry.modifiedAt,
          ],
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

  async deleteTileDamageStates(instanceId: string, tileIndices: number[] | null = null): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return;
    }
    const normalizedTileIndices = Array.isArray(tileIndices)
      ? tileIndices
          .filter((tileIndex) => Number.isFinite(Number(tileIndex)))
          .map((tileIndex) => Math.max(0, Math.trunc(Number(tileIndex))))
      : null;
    if (Array.isArray(normalizedTileIndices) && normalizedTileIndices.length === 0) {
      return;
    }
    if (Array.isArray(normalizedTileIndices)) {
      await this.pool.query(
        `DELETE FROM ${INSTANCE_TILE_DAMAGE_STATE_TABLE} WHERE instance_id = $1 AND tile_index = ANY($2::integer[])`,
        [normalizedInstanceId, normalizedTileIndices],
      );
      return;
    }
    await this.pool.query(`DELETE FROM ${INSTANCE_TILE_DAMAGE_STATE_TABLE} WHERE instance_id = $1`, [normalizedInstanceId]);
  }

  async loadTileDamageStates(instanceId: string): Promise<Array<{
    tileIndex: number;
    hp: number;
    maxHp: number;
    destroyed: boolean;
    respawnLeft: number;
    modifiedAt: number;
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
        SELECT tile_index, hp, max_hp, destroyed, respawn_left_ticks, modified_at_ms
        FROM ${INSTANCE_TILE_DAMAGE_STATE_TABLE}
        WHERE instance_id = $1
        ORDER BY tile_index ASC
      `,
      [normalizedInstanceId],
    );
    return Array.isArray(result.rows)
      ? result.rows.map((row) => ({
          tileIndex: Number.isFinite(row.tile_index) ? Math.trunc(Number(row.tile_index)) : 0,
          hp: Number.isFinite(row.hp) ? Math.max(0, Math.trunc(Number(row.hp))) : 0,
          maxHp: Number.isFinite(row.max_hp) ? Math.max(1, Math.trunc(Number(row.max_hp))) : 1,
          destroyed: row.destroyed === true,
          respawnLeft: Number.isFinite(row.respawn_left_ticks) ? Math.max(0, Math.trunc(Number(row.respawn_left_ticks))) : 0,
          modifiedAt: Number.isFinite(Number(row.modified_at_ms)) ? Math.max(0, Math.trunc(Number(row.modified_at_ms))) : 0,
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

  async replaceGroundItems(
    instanceId: string,
    entries: Array<{ tileIndex: number; items: unknown[] }>,
  ): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return;
    }
    const normalizedEntries: Array<{ groundItemId: string; tileIndex: number; itemPayload: unknown }> = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!entry || !Number.isFinite(Number(entry.tileIndex)) || !Array.isArray(entry.items)) {
        continue;
      }
      const tileIndex = Math.max(0, Math.trunc(Number(entry.tileIndex)));
      entry.items.forEach((itemPayload, index) => {
        normalizedEntries.push({
          groundItemId: buildStableDomainRowId('ground', normalizedInstanceId, `${tileIndex}:${index}`),
          tileIndex,
          itemPayload: itemPayload ?? {},
        });
      });
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, normalizedInstanceId);
      await client.query(`DELETE FROM ${INSTANCE_GROUND_ITEM_TABLE} WHERE instance_id = $1`, [normalizedInstanceId]);
      for (const entry of normalizedEntries) {
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
            VALUES ($1, $2, $3, $4::jsonb, NULL, now())
          `,
          [entry.groundItemId, normalizedInstanceId, entry.tileIndex, JSON.stringify(entry.itemPayload ?? {})],
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
    const sourcePayload = input.statePayload && typeof input.statePayload === 'object'
      ? input.statePayload as Record<string, unknown>
      : {};
    const metadataPayload = buildContainerMetadataPayload(sourcePayload);
    const generatedAtTick = normalizeNullableInteger(sourcePayload.generatedAtTick);
    const refreshAtTick = normalizeNullableInteger(sourcePayload.refreshAtTick);
    const activeSearchPayload = sourcePayload.activeSearch && typeof sourcePayload.activeSearch === 'object'
      ? sourcePayload.activeSearch
      : null;
    const entries = Array.isArray(sourcePayload.entries) ? sourcePayload.entries : [];
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, instanceId);
      await client.query(
        `DELETE FROM ${INSTANCE_CONTAINER_ENTRY_TABLE} WHERE instance_id = $1 AND container_id = $2`,
        [instanceId, containerId],
      );
      await client.query(
        `DELETE FROM ${INSTANCE_CONTAINER_TIMER_TABLE} WHERE instance_id = $1 AND container_id = $2`,
        [instanceId, containerId],
      );
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
        [instanceId, containerId, sourceId, JSON.stringify(metadataPayload)],
      );
      await client.query(
        `
          INSERT INTO ${INSTANCE_CONTAINER_TIMER_TABLE}(
            instance_id,
            container_id,
            generated_at_tick,
            refresh_at_tick,
            active_search_payload,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, now())
        `,
        [
          instanceId,
          containerId,
          generatedAtTick,
          refreshAtTick,
          JSON.stringify(activeSearchPayload ?? {}),
        ],
      );
      for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
        const entry = entries[entryIndex] && typeof entries[entryIndex] === 'object'
          ? entries[entryIndex] as Record<string, unknown>
          : {};
        await client.query(
          `
            INSERT INTO ${INSTANCE_CONTAINER_ENTRY_TABLE}(
              instance_id,
              container_id,
              entry_index,
              item_payload,
              created_tick,
              visible,
              updated_at
            )
            VALUES ($1, $2, $3, $4::jsonb, $5, $6, now())
          `,
          [
            instanceId,
            containerId,
            entryIndex,
            JSON.stringify(entry.item ?? {}),
            normalizeNullableInteger(entry.createdTick),
            entry.visible === true,
          ],
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

  async replaceContainerStates(
    instanceId: string,
    states: Array<{ containerId: string; sourceId: string; [key: string]: unknown }>,
  ): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return;
    }
    const normalizedStates = (Array.isArray(states) ? states : [])
      .map((state) => ({
        containerId: normalizeRequiredString(state?.containerId),
        sourceId: normalizeRequiredString(state?.sourceId) || normalizeRequiredString(state?.containerId),
        statePayload: buildContainerMetadataPayload(state),
        generatedAtTick: normalizeNullableInteger(state?.generatedAtTick),
        refreshAtTick: normalizeNullableInteger(state?.refreshAtTick),
        activeSearchPayload: state?.activeSearch && typeof state.activeSearch === 'object' ? state.activeSearch : null,
        entries: Array.isArray(state?.entries) ? state.entries : [],
      }))
      .filter((state) => state.containerId && state.sourceId);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, normalizedInstanceId);
      await client.query(`DELETE FROM ${INSTANCE_CONTAINER_ENTRY_TABLE} WHERE instance_id = $1`, [normalizedInstanceId]);
      await client.query(`DELETE FROM ${INSTANCE_CONTAINER_TIMER_TABLE} WHERE instance_id = $1`, [normalizedInstanceId]);
      await client.query(`DELETE FROM ${INSTANCE_CONTAINER_STATE_TABLE} WHERE instance_id = $1`, [normalizedInstanceId]);
      for (const state of normalizedStates) {
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
          `,
          [normalizedInstanceId, state.containerId, state.sourceId, JSON.stringify(state.statePayload ?? {})],
        );
        await client.query(
          `
            INSERT INTO ${INSTANCE_CONTAINER_TIMER_TABLE}(
              instance_id,
              container_id,
              generated_at_tick,
              refresh_at_tick,
              active_search_payload,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, now())
          `,
          [
            normalizedInstanceId,
            state.containerId,
            state.generatedAtTick,
            state.refreshAtTick,
            JSON.stringify(state.activeSearchPayload ?? {}),
          ],
        );
        for (let entryIndex = 0; entryIndex < state.entries.length; entryIndex += 1) {
          const entry = state.entries[entryIndex];
          await client.query(
            `
              INSERT INTO ${INSTANCE_CONTAINER_ENTRY_TABLE}(
                instance_id,
                container_id,
                entry_index,
                item_payload,
                created_tick,
                visible,
                updated_at
              )
              VALUES ($1, $2, $3, $4::jsonb, $5, $6, now())
            `,
            [
              normalizedInstanceId,
              state.containerId,
              entryIndex,
              JSON.stringify(entry?.item ?? {}),
              normalizeNullableInteger(entry?.createdTick),
              entry?.visible === true,
            ],
          );
        }
      }
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
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, normalizedInstanceId);
      await client.query(
        `DELETE FROM ${INSTANCE_CONTAINER_ENTRY_TABLE} WHERE instance_id = $1 AND container_id = $2`,
        [normalizedInstanceId, normalizedContainerId],
      );
      await client.query(
        `DELETE FROM ${INSTANCE_CONTAINER_TIMER_TABLE} WHERE instance_id = $1 AND container_id = $2`,
        [normalizedInstanceId, normalizedContainerId],
      );
      const result = await client.query(
        `DELETE FROM ${INSTANCE_CONTAINER_STATE_TABLE} WHERE instance_id = $1 AND container_id = $2`,
        [normalizedInstanceId, normalizedContainerId],
      );
      await client.query('COMMIT');
      return (result.rowCount ?? 0) > 0;
    } catch (error: unknown) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
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
    const rows = Array.isArray(result.rows) ? result.rows : [];
    if (rows.length === 0) {
      return [];
    }
    const entriesByContainerId = await this.loadContainerEntriesByContainerId(normalizedInstanceId);
    const timersByContainerId = await this.loadContainerTimersByContainerId(normalizedInstanceId);
    return rows.map((row) => {
      const containerId = typeof row.container_id === 'string' ? row.container_id : '';
      const basePayload = row.state_payload && typeof row.state_payload === 'object' ? row.state_payload : {};
      const timer = timersByContainerId.get(containerId) ?? {};
      return {
        instanceId: typeof row.instance_id === 'string' ? row.instance_id : '',
        containerId,
        sourceId: typeof row.source_id === 'string' ? row.source_id : '',
        statePayload: {
          ...basePayload,
          sourceId: typeof row.source_id === 'string' ? row.source_id : basePayload.sourceId,
          containerId,
          generatedAtTick: timer.generatedAtTick ?? basePayload.generatedAtTick,
          refreshAtTick: timer.refreshAtTick ?? basePayload.refreshAtTick,
          entries: entriesByContainerId.get(containerId) ?? [],
          activeSearch: timer.activeSearch ?? basePayload.activeSearch,
        },
      };
    });
  }

  private async loadContainerEntriesByContainerId(instanceId: string): Promise<Map<string, Array<{
    item: unknown;
    createdTick: number | null;
    visible: boolean;
  }>>> {
    const result = await this.pool!.query(
      `
        SELECT container_id, item_payload, created_tick, visible
        FROM ${INSTANCE_CONTAINER_ENTRY_TABLE}
        WHERE instance_id = $1
        ORDER BY container_id ASC, entry_index ASC
      `,
      [instanceId],
    );
    const entriesByContainerId = new Map<string, Array<{ item: unknown; createdTick: number | null; visible: boolean }>>();
    for (const row of Array.isArray(result.rows) ? result.rows : []) {
      const containerId = typeof row.container_id === 'string' ? row.container_id : '';
      if (!containerId) {
        continue;
      }
      const entries = entriesByContainerId.get(containerId) ?? [];
      entries.push({
        item: row.item_payload ?? {},
        createdTick: Number.isFinite(Number(row.created_tick)) ? Math.trunc(Number(row.created_tick)) : null,
        visible: row.visible === true,
      });
      entriesByContainerId.set(containerId, entries);
    }
    return entriesByContainerId;
  }

  private async loadContainerTimersByContainerId(instanceId: string): Promise<Map<string, {
    generatedAtTick?: number | null;
    refreshAtTick?: number | null;
    activeSearch?: unknown;
  }>> {
    const result = await this.pool!.query(
      `
        SELECT container_id, generated_at_tick, refresh_at_tick, active_search_payload
        FROM ${INSTANCE_CONTAINER_TIMER_TABLE}
        WHERE instance_id = $1
        ORDER BY container_id ASC
      `,
      [instanceId],
    );
    const timersByContainerId = new Map<string, { generatedAtTick?: number | null; refreshAtTick?: number | null; activeSearch?: unknown }>();
    for (const row of Array.isArray(result.rows) ? result.rows : []) {
      const containerId = typeof row.container_id === 'string' ? row.container_id : '';
      if (!containerId) {
        continue;
      }
      const activeSearchPayload = row.active_search_payload && typeof row.active_search_payload === 'object'
        ? row.active_search_payload
        : null;
      timersByContainerId.set(containerId, {
        generatedAtTick: Number.isFinite(Number(row.generated_at_tick)) ? Math.trunc(Number(row.generated_at_tick)) : null,
        refreshAtTick: Number.isFinite(Number(row.refresh_at_tick)) ? Math.trunc(Number(row.refresh_at_tick)) : null,
        activeSearch: activeSearchPayload && Object.keys(activeSearchPayload).length > 0 ? activeSearchPayload : undefined,
      });
    }
    return timersByContainerId;
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

  async replaceMonsterRuntimeStates(
    instanceId: string,
    entries: Array<{
      monsterRuntimeId: string;
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
    }>,
  ): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return;
    }
    const normalizedEntries = Array.isArray(entries)
      ? entries
          .map((entry) => ({
            monsterRuntimeId: normalizeRequiredString(entry?.monsterRuntimeId),
            monsterId: normalizeRequiredString(entry?.monsterId),
            monsterName: normalizeRequiredString(entry?.monsterName),
            monsterTier: normalizeMonsterTier(entry?.monsterTier),
            monsterLevel: Number.isFinite(Number(entry?.monsterLevel)) ? Math.trunc(Number(entry.monsterLevel)) : null,
            tileIndex: Math.max(0, Math.trunc(Number(entry?.tileIndex) || 0)),
            x: Math.trunc(Number(entry?.x) || 0),
            y: Math.trunc(Number(entry?.y) || 0),
            hp: Math.max(0, Math.trunc(Number(entry?.hp) || 0)),
            maxHp: Math.max(1, Math.trunc(Number(entry?.maxHp) || 1)),
            alive: entry?.alive === true,
            respawnLeft: Number.isFinite(Number(entry?.respawnLeft)) ? Math.max(0, Math.trunc(Number(entry.respawnLeft))) : null,
            respawnTicks: Number.isFinite(Number(entry?.respawnTicks)) ? Math.max(0, Math.trunc(Number(entry.respawnTicks))) : null,
            aggroTargetPlayerId: normalizeRequiredString(entry?.aggroTargetPlayerId),
            statePayload: entry?.statePayload ?? {},
          }))
          .filter((entry) => entry.monsterRuntimeId && entry.monsterId && entry.monsterName && entry.monsterTier !== 'mortal_blood')
      : [];
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, normalizedInstanceId);
      await client.query(`DELETE FROM ${INSTANCE_MONSTER_RUNTIME_STATE_TABLE} WHERE instance_id = $1`, [normalizedInstanceId]);
      for (const entry of normalizedEntries) {
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
            entry.monsterRuntimeId,
            normalizedInstanceId,
            entry.monsterId,
            entry.monsterName,
            entry.monsterTier,
            entry.monsterLevel,
            entry.tileIndex,
            entry.x,
            entry.y,
            entry.hp,
            entry.maxHp,
            entry.alive,
            entry.respawnLeft,
            entry.respawnTicks,
            entry.aggroTargetPlayerId,
            JSON.stringify(entry.statePayload ?? {}),
          ],
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

  async replaceOverlayChunks(
    instanceId: string,
    entries: Array<{
      patchKind: 'tile' | 'portal' | 'npc' | 'container' | 'rule';
      chunkKey: string;
      patchVersion: number;
      patchPayload: unknown;
    }>,
  ): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return;
    }
    const normalizedEntries = Array.isArray(entries)
      ? entries
          .map((entry) => {
            const patchKind = normalizeRequiredString(entry?.patchKind);
            return {
              patchKind: ['tile', 'portal', 'npc', 'container', 'rule'].includes(patchKind) ? patchKind : '',
              chunkKey: normalizeRequiredString(entry?.chunkKey),
              patchVersion: Number.isFinite(Number(entry?.patchVersion)) ? Math.max(0, Math.trunc(Number(entry.patchVersion))) : 0,
              patchPayload: entry?.patchPayload ?? {},
            };
          })
          .filter((entry) => entry.patchKind && entry.chunkKey)
      : [];
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, normalizedInstanceId);
      await client.query(`DELETE FROM ${INSTANCE_OVERLAY_CHUNK_TABLE} WHERE instance_id = $1`, [normalizedInstanceId]);
      for (const entry of normalizedEntries) {
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
          [
            normalizedInstanceId,
            entry.patchKind,
            entry.chunkKey,
            entry.patchVersion,
            JSON.stringify(entry.patchPayload ?? {}),
          ],
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
        `DELETE FROM ${INSTANCE_TILE_DAMAGE_STATE_TABLE} WHERE instance_id = $1`,
        `DELETE FROM ${INSTANCE_CHECKPOINT_TABLE} WHERE instance_id = $1`,
        `DELETE FROM ${INSTANCE_RECOVERY_WATERMARK_TABLE} WHERE instance_id = $1`,
        `DELETE FROM ${INSTANCE_GROUND_ITEM_TABLE} WHERE instance_id = $1`,
        `DELETE FROM ${INSTANCE_CONTAINER_STATE_TABLE} WHERE instance_id = $1`,
        `DELETE FROM ${INSTANCE_CONTAINER_ENTRY_TABLE} WHERE instance_id = $1`,
        `DELETE FROM ${INSTANCE_CONTAINER_TIMER_TABLE} WHERE instance_id = $1`,
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

async function ensureInstanceTileCellTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_lock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_TILE_CELL_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INSTANCE_TILE_CELL_TABLE} (
        instance_id varchar(100) NOT NULL,
        x integer NOT NULL,
        y integer NOT NULL,
        tile_type varchar(64) NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (instance_id, x, y)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_tile_cell_instance_idx
      ON ${INSTANCE_TILE_CELL_TABLE}(instance_id, y, x)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_TILE_CELL_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

async function ensureInstanceTileDamageStateTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_lock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_TILE_DAMAGE_STATE_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INSTANCE_TILE_DAMAGE_STATE_TABLE} (
        instance_id varchar(100) NOT NULL,
        tile_index integer NOT NULL,
        hp integer NOT NULL DEFAULT 0,
        max_hp integer NOT NULL DEFAULT 1,
        destroyed boolean NOT NULL DEFAULT false,
        respawn_left_ticks integer NOT NULL DEFAULT 0,
        modified_at_ms bigint NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (instance_id, tile_index)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_tile_damage_state_instance_idx
      ON ${INSTANCE_TILE_DAMAGE_STATE_TABLE}(instance_id, tile_index)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_TILE_DAMAGE_STATE_LOCK_KEY]).catch(() => undefined);
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

async function ensureInstanceContainerEntryTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_lock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_CONTAINER_ENTRY_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INSTANCE_CONTAINER_ENTRY_TABLE} (
        instance_id varchar(100) NOT NULL,
        container_id varchar(100) NOT NULL,
        entry_index integer NOT NULL,
        item_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_tick bigint NULL,
        visible boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (instance_id, container_id, entry_index)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_container_entry_instance_idx
      ON ${INSTANCE_CONTAINER_ENTRY_TABLE}(instance_id, container_id, entry_index)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_CONTAINER_ENTRY_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

async function ensureInstanceContainerTimerTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_lock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_CONTAINER_TIMER_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INSTANCE_CONTAINER_TIMER_TABLE} (
        instance_id varchar(100) NOT NULL,
        container_id varchar(100) NOT NULL,
        generated_at_tick bigint NULL,
        refresh_at_tick bigint NULL,
        active_search_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (instance_id, container_id)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_container_timer_instance_idx
      ON ${INSTANCE_CONTAINER_TIMER_TABLE}(instance_id, container_id)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_CONTAINER_TIMER_LOCK_KEY]).catch(() => undefined);
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

function buildStableDomainRowId(prefix: string, instanceId: string, suffix: string): string {
  return `${prefix}:${hashString(`${instanceId}:${suffix}`)}:${suffix}`.slice(0, 100);
}

function buildContainerMetadataPayload(state: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const source = state && typeof state === 'object' ? state : {};
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === 'entries' || key === 'generatedAtTick' || key === 'refreshAtTick' || key === 'activeSearch') {
      continue;
    }
    payload[key] = value;
  }
  return payload;
}

function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNullableInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.trunc(parsed);
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
