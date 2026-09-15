/**
 * instance-domain-persistence.tiles.ts
 *
 * 从 instance-domain-persistence.service.ts 按模式 B 拆出的 tile 族方法实现。
 * 包含：tile resource、tile cell、tile damage、temporary tile 的读写与批量操作。
 * 原类保留一行委托壳，实际逻辑在此文件中以 xxxImpl(self, ...args) 形式实现。
 * 不包含 @Injectable provider，不修改持久化语义。
 */
import type { Pool } from 'pg';

import type { InstanceDomainPersistenceService } from './instance-domain-persistence.service';
import {
  isCurrentClaimedInstanceFlushPayload,
  normalizeInstanceFlushLedgerClaim,
  type InstanceFlushLedgerClaim,
} from './instance-flush-ledger-fence';
import {
  acquireInstanceDomainLock,
  INSTANCE_TEMPORARY_TILE_STATE_TABLE,
  INSTANCE_TILE_CELL_TABLE,
  INSTANCE_TILE_DAMAGE_STATE_TABLE,
  INSTANCE_TILE_RESOURCE_STATE_TABLE,
  normalizeNullableInteger,
  normalizeNullableNumber,
  normalizeNumberWithFallback,
  normalizeOptionalString,
  normalizeRequiredString,
  rollbackQuietly,
} from './instance-domain-persistence.helpers';

export async function saveTileResourceDiffsImpl(
  self: InstanceDomainPersistenceService,
    instanceId: string,
    entries: Array<{ resourceKey: string; tileIndex: number; value: number }>,
  ): Promise<void> {
    if (!self.pool || !self.enabled) {
      return;
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return;
    }

    const resourceRows: Array<{ resource_key: string; tile_index: number; value: number }> = [];
    const resourceKeyRows: Array<{ resource_key: string; tile_index: number }> = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!entry
        || typeof entry.resourceKey !== 'string'
        || entry.resourceKey.trim().length === 0
        || !Number.isFinite(entry.tileIndex)
        || !Number.isFinite(entry.value)) {
        continue;
      }
      const resourceKey = entry.resourceKey.trim();
      const tileIndex = Math.trunc(entry.tileIndex);
      resourceRows.push({
        resource_key: resourceKey,
        tile_index: tileIndex,
        value: Math.max(0, entry.value),
      });
      resourceKeyRows.push({ resource_key: resourceKey, tile_index: tileIndex });
    }
    const resourceRowsJson = JSON.stringify(resourceRows);
    const resourceKeyRowsJson = JSON.stringify(resourceKeyRows);
    const client = await self.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, normalizedInstanceId);
      if (resourceRows.length > 0) {
        await client.query(
          `
            WITH incoming AS (
              SELECT resource_key, tile_index, value
              FROM jsonb_to_recordset($2::jsonb) AS entry(resource_key varchar(100), tile_index bigint, value double precision)
            )
            INSERT INTO ${INSTANCE_TILE_RESOURCE_STATE_TABLE}(
              instance_id,
              resource_key,
              tile_index,
              value,
              updated_at
            )
            SELECT $1, resource_key, tile_index, value, now()
            FROM incoming
            ON CONFLICT (instance_id, resource_key, tile_index)
            DO UPDATE SET
              value = EXCLUDED.value,
              updated_at = now()
          `,
          [normalizedInstanceId, resourceRowsJson],
        );
      }
      await client.query(
        `
          WITH incoming AS (
            SELECT resource_key, tile_index
            FROM jsonb_to_recordset($2::jsonb) AS entry(resource_key varchar(100), tile_index bigint)
          )
          DELETE FROM ${INSTANCE_TILE_RESOURCE_STATE_TABLE} target
          WHERE target.instance_id = $1
            AND NOT EXISTS (
              SELECT 1
              FROM incoming
              WHERE incoming.resource_key = target.resource_key
                AND incoming.tile_index = target.tile_index
            )
        `,
        [normalizedInstanceId, resourceKeyRowsJson],
      );
      await client.query('COMMIT');
    } catch (error: unknown) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  /** 增量更新地块资源状态：仅 upsert/delete 变化的条目 */
export async function saveTileResourceDeltaImpl(
  self: InstanceDomainPersistenceService,
    instanceId: string,
    upserts: Array<{ resourceKey: string; tileIndex: number; value: number }>,
    deletes: Array<{ resourceKey: string; tileIndex: number }>,
  ): Promise<void> {
    if (!self.pool || !self.enabled) {
      return;
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return;
    }
    const normalizedUpserts = (Array.isArray(upserts) ? upserts : [])
      .filter((entry) => Boolean(entry)
        && typeof entry.resourceKey === 'string'
        && entry.resourceKey.trim().length > 0
        && Number.isFinite(Number(entry.tileIndex))
        && Number.isFinite(Number(entry.value)))
      .map((entry) => ({
        resourceKey: entry.resourceKey.trim(),
        tileIndex: Math.max(0, Math.trunc(Number(entry.tileIndex))),
        value: Math.max(0, normalizeNumberWithFallback(entry.value, 0)),
      }));
    const normalizedDeletes = (Array.isArray(deletes) ? deletes : [])
      .filter((entry) => Boolean(entry)
        && typeof entry.resourceKey === 'string'
        && entry.resourceKey.trim().length > 0
        && Number.isFinite(Number(entry.tileIndex)))
      .map((entry) => ({
        resourceKey: entry.resourceKey.trim(),
        tileIndex: Math.max(0, Math.trunc(Number(entry.tileIndex))),
      }));
    if (normalizedUpserts.length === 0 && normalizedDeletes.length === 0) {
      return;
    }
    const client = await self.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, normalizedInstanceId);
      if (normalizedDeletes.length > 0) {
        await client.query(
          `
            WITH incoming AS (
              SELECT resource_key, tile_index
              FROM jsonb_to_recordset($2::jsonb) AS entry(resource_key varchar(100), tile_index bigint)
            )
            DELETE FROM ${INSTANCE_TILE_RESOURCE_STATE_TABLE} target
            USING incoming
            WHERE target.instance_id = $1
              AND target.resource_key = incoming.resource_key
              AND target.tile_index = incoming.tile_index
          `,
          [
            normalizedInstanceId,
            JSON.stringify(normalizedDeletes.map((entry) => ({
              resource_key: entry.resourceKey,
              tile_index: entry.tileIndex,
            }))),
          ],
        );
      }
      if (normalizedUpserts.length > 0) {
        await client.query(
          `
            WITH incoming AS (
              SELECT resource_key, tile_index, value
              FROM jsonb_to_recordset($2::jsonb) AS entry(resource_key varchar(100), tile_index bigint, value double precision)
            )
            INSERT INTO ${INSTANCE_TILE_RESOURCE_STATE_TABLE}(
              instance_id,
              resource_key,
              tile_index,
              value,
              updated_at
            )
            SELECT $1, resource_key, tile_index, value, now()
            FROM incoming
            ON CONFLICT (instance_id, resource_key, tile_index)
            DO UPDATE SET
              value = EXCLUDED.value,
              updated_at = now()
          `,
          [
            normalizedInstanceId,
            JSON.stringify(normalizedUpserts.map((entry) => ({
              resource_key: entry.resourceKey,
              tile_index: entry.tileIndex,
              value: entry.value,
            }))),
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

  /** 加载指定实例的全部地块资源状态 */
export async function loadTileResourceDiffsImpl(self: InstanceDomainPersistenceService, instanceId: string): Promise<Array<{ resourceKey: string; tileIndex: number; value: number }>> {
    if (!self.pool || !self.enabled) {
      return [];
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return [];
    }
    const result = await self.pool.query(
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
          tileIndex: normalizeNullableInteger(row.tile_index) ?? 0,
          value: normalizeNullableNumber(row.value) ?? 0,
        }))
      : [];
  }

  /** 保存指定实例的运行时地块格子快照：批量 upsert 当前地块，并删除快照外 stale 坐标。 */
export async function replaceRuntimeTileCellsImpl(
  self: InstanceDomainPersistenceService,
    instanceId: string,
    entries: Array<{
      x: number;
      y: number;
      tileType: string;
      terrainType?: string | null;
      surfaceType?: string | null;
      structureType?: string | null;
      interactableKinds?: string[] | null;
    }>,
  ): Promise<void> {
    if (!self.pool || !self.enabled) {
      return;
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return;
    }
    const tileCellRows: Array<{
      x: number;
      y: number;
      tile_type: string;
      terrain_type: string | null;
      surface_type: string | null;
      structure_type: string | null;
      interactable_kinds: string[];
    }> = [];
    const tileCellKeyRows: Array<{ x: number; y: number }> = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!entry
        || !Number.isFinite(Number(entry.x))
        || !Number.isFinite(Number(entry.y))
        || typeof entry.tileType !== 'string'
        || entry.tileType.trim().length === 0) {
        continue;
      }
      const x = Math.trunc(Number(entry.x));
      const y = Math.trunc(Number(entry.y));
      const tileType = entry.tileType.trim();
      const interactableKinds = Array.isArray(entry.interactableKinds)
        ? entry.interactableKinds.filter((kind) => typeof kind === 'string' && kind.trim()).map((kind) => kind.trim())
        : [];
      tileCellRows.push({
        x,
        y,
        tile_type: tileType,
        terrain_type: normalizeOptionalString(entry.terrainType),
        surface_type: normalizeOptionalString(entry.surfaceType),
        structure_type: normalizeOptionalString(entry.structureType),
        interactable_kinds: interactableKinds,
      });
      tileCellKeyRows.push({ x, y });
    }
    const tileCellRowsJson = JSON.stringify(tileCellRows);
    const tileCellKeyRowsJson = JSON.stringify(tileCellKeyRows);
    const client = await self.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, normalizedInstanceId);
      if (tileCellRows.length > 0) {
        await client.query(
          `
            WITH incoming AS (
              SELECT *
              FROM jsonb_to_recordset($2::jsonb) AS entry(
                x bigint,
                y bigint,
                tile_type varchar(64),
                terrain_type varchar(64),
                surface_type varchar(64),
                structure_type varchar(64),
                interactable_kinds text[]
              )
            )
            INSERT INTO ${INSTANCE_TILE_CELL_TABLE}(
              instance_id,
              x,
              y,
              tile_type,
              terrain_type,
              surface_type,
              structure_type,
              interactable_kinds,
              updated_at
            )
            SELECT $1, x, y, tile_type, terrain_type, surface_type, structure_type, COALESCE(interactable_kinds, '{}'::text[]), now()
            FROM incoming
            ON CONFLICT (instance_id, x, y)
            DO UPDATE SET
              tile_type = EXCLUDED.tile_type,
              terrain_type = EXCLUDED.terrain_type,
              surface_type = EXCLUDED.surface_type,
              structure_type = EXCLUDED.structure_type,
              interactable_kinds = EXCLUDED.interactable_kinds,
              updated_at = now()
          `,
          [normalizedInstanceId, tileCellRowsJson],
        );
      }
      await client.query(
        `
          WITH incoming AS (
            SELECT x, y
            FROM jsonb_to_recordset($2::jsonb) AS entry(x bigint, y bigint)
          )
          DELETE FROM ${INSTANCE_TILE_CELL_TABLE} target
          WHERE target.instance_id = $1
            AND NOT EXISTS (
              SELECT 1
              FROM incoming
              WHERE incoming.x = target.x
                AND incoming.y = target.y
            )
        `,
        [normalizedInstanceId, tileCellKeyRowsJson],
      );
      await client.query('COMMIT');
    } catch (error: unknown) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  /** 加载指定实例的运行时地块格子 */
export async function loadRuntimeTileCellsImpl(self: InstanceDomainPersistenceService, instanceId: string): Promise<Array<{
    x: number;
    y: number;
    tileType: string;
    terrainType?: string | null;
    surfaceType?: string | null;
    structureType?: string | null;
    interactableKinds?: string[];
  }>> {
    if (!self.pool || !self.enabled) {
      return [];
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return [];
    }
    const result = await self.pool.query(
      `
        SELECT x, y, tile_type, terrain_type, surface_type, structure_type, interactable_kinds
        FROM ${INSTANCE_TILE_CELL_TABLE}
        WHERE instance_id = $1
        ORDER BY y ASC, x ASC
      `,
      [normalizedInstanceId],
    );
    return Array.isArray(result.rows)
      ? result.rows.map((row) => ({
          x: normalizeNullableInteger(row.x) ?? 0,
          y: normalizeNullableInteger(row.y) ?? 0,
          tileType: typeof row.tile_type === 'string' ? row.tile_type : '',
          terrainType: normalizeOptionalString(row.terrain_type),
          surfaceType: normalizeOptionalString(row.surface_type),
          structureType: normalizeOptionalString(row.structure_type),
          interactableKinds: Array.isArray(row.interactable_kinds)
            ? row.interactable_kinds.filter((kind: unknown): kind is string => typeof kind === 'string' && kind.length > 0)
            : [],
        })).filter((entry) => entry.tileType.length > 0)
      : [];
  }

  /** 保存指定实例的地块破坏快照：批量 upsert 当前状态，并删除快照外 stale 地块。 */
export async function saveTileDamageStatesImpl(
  self: InstanceDomainPersistenceService,
    instanceId: string,
    entries: Array<{
      tileIndex: number;
      x?: number | null;
      y?: number | null;
      hp: number;
      maxHp: number;
      destroyed: boolean;
      respawnLeft?: number | null;
      modifiedAt?: number | null;
    }>,
    ledgerClaim: InstanceFlushLedgerClaim | null = null,
  ): Promise<boolean> {
    if (!self.pool || !self.enabled) {
      return false;
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return false;
    }
    const normalizedEntries = Array.isArray(entries)
      ? entries
          .filter((entry) => Boolean(entry) && Number.isFinite(entry.tileIndex))
          .map((entry) => ({
            tileIndex: Math.max(0, Math.trunc(Number(entry.tileIndex))),
            x: Number.isFinite(Number(entry.x)) ? Math.trunc(Number(entry.x)) : null,
            y: Number.isFinite(Number(entry.y)) ? Math.trunc(Number(entry.y)) : null,
            hp: Math.max(0, normalizeNumberWithFallback(entry.hp, 0)),
            maxHp: Math.max(1, normalizeNumberWithFallback(entry.maxHp, 1)),
            destroyed: entry.destroyed === true,
            respawnLeft: Math.max(0, Math.trunc(Number(entry.respawnLeft) || 0)),
            modifiedAt: Number.isFinite(Number(entry.modifiedAt)) ? Math.max(0, Math.trunc(Number(entry.modifiedAt))) : Date.now(),
          }))
      : [];
    const client = await self.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, normalizedInstanceId);
      if (ledgerClaim && !await isCurrentClaimedInstanceFlushPayload(
        client,
        normalizedInstanceId,
        'tile_damage',
        ledgerClaim,
      )) {
        await client.query('COMMIT');
        return false;
      }
      if (normalizedEntries.length > 0) {
        await client.query(
          `
            WITH incoming AS (
              SELECT
                tile_index,
                x,
                y,
                hp,
                max_hp,
                destroyed,
                respawn_left_ticks,
                modified_at_ms
              FROM jsonb_to_recordset($2::jsonb) AS entry(
                tile_index bigint,
                x bigint,
                y bigint,
                hp double precision,
                max_hp double precision,
                destroyed boolean,
                respawn_left_ticks bigint,
                modified_at_ms bigint
              )
            )
            INSERT INTO ${INSTANCE_TILE_DAMAGE_STATE_TABLE}(
              instance_id,
              tile_index,
              x,
              y,
              hp,
              max_hp,
              destroyed,
              respawn_left_ticks,
              modified_at_ms,
              updated_at
            )
            SELECT $1, tile_index, x, y, hp, max_hp, destroyed, respawn_left_ticks, modified_at_ms, now()
            FROM incoming
            ON CONFLICT (instance_id, tile_index)
            DO UPDATE SET
              x = EXCLUDED.x,
              y = EXCLUDED.y,
              hp = EXCLUDED.hp,
              max_hp = EXCLUDED.max_hp,
              destroyed = EXCLUDED.destroyed,
              respawn_left_ticks = EXCLUDED.respawn_left_ticks,
              modified_at_ms = EXCLUDED.modified_at_ms,
              updated_at = now()
          `,
          [
            normalizedInstanceId,
            JSON.stringify(normalizedEntries.map((entry) => ({
              tile_index: entry.tileIndex,
              x: entry.x,
              y: entry.y,
              hp: entry.hp,
              max_hp: entry.maxHp,
              destroyed: entry.destroyed,
              respawn_left_ticks: entry.respawnLeft,
              modified_at_ms: entry.modifiedAt,
            }))),
          ],
        );
      }
      await client.query(
        `
          WITH incoming AS (
            SELECT tile_index
            FROM jsonb_to_recordset($2::jsonb) AS entry(tile_index bigint)
          )
          DELETE FROM ${INSTANCE_TILE_DAMAGE_STATE_TABLE} target
          WHERE target.instance_id = $1
            AND NOT EXISTS (
              SELECT 1
              FROM incoming
              WHERE incoming.tile_index = target.tile_index
            )
        `,
        [
          normalizedInstanceId,
          JSON.stringify(normalizedEntries.map((entry) => ({
            tile_index: entry.tileIndex,
          }))),
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

  /** 删除指定实例的地块破坏状态（可按 tileIndex 过滤） */
export async function deleteTileDamageStatesImpl(self: InstanceDomainPersistenceService, instanceId: string, tileIndices: number[] | null = null): Promise<void> {
    if (!self.pool || !self.enabled) {
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
      await self.pool.query(
        `DELETE FROM ${INSTANCE_TILE_DAMAGE_STATE_TABLE} WHERE instance_id = $1 AND tile_index = ANY($2::bigint[])`,
        [normalizedInstanceId, normalizedTileIndices],
      );
      return;
    }
    await self.pool.query(`DELETE FROM ${INSTANCE_TILE_DAMAGE_STATE_TABLE} WHERE instance_id = $1`, [normalizedInstanceId]);
  }

  /** 增量更新地块破坏状态：仅 upsert/delete 变化的条目 */
export async function saveTileDamageDeltaImpl(
  self: InstanceDomainPersistenceService,
    instanceId: string,
    upserts: Array<{
      tileIndex: number;
      x?: number | null;
      y?: number | null;
      hp: number;
      maxHp: number;
      destroyed: boolean;
      respawnLeft?: number | null;
      modifiedAt?: number | null;
    }>,
    deletes: number[],
  ): Promise<void> {
    if (!self.pool || !self.enabled) {
      return;
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return;
    }
    const normalizedUpserts = Array.isArray(upserts)
      ? upserts
          .filter((entry) => Boolean(entry) && Number.isFinite(Number(entry.tileIndex)))
          .map((entry) => ({
            tileIndex: Math.max(0, Math.trunc(Number(entry.tileIndex))),
            x: Number.isFinite(Number(entry.x)) ? Math.trunc(Number(entry.x)) : null,
            y: Number.isFinite(Number(entry.y)) ? Math.trunc(Number(entry.y)) : null,
            hp: Math.max(0, normalizeNumberWithFallback(entry.hp, 0)),
            maxHp: Math.max(1, normalizeNumberWithFallback(entry.maxHp, 1)),
            destroyed: entry.destroyed === true,
            respawnLeft: Math.max(0, Math.trunc(Number(entry.respawnLeft) || 0)),
            modifiedAt: Number.isFinite(Number(entry.modifiedAt)) ? Math.max(0, Math.trunc(Number(entry.modifiedAt))) : Date.now(),
          }))
      : [];
    const normalizedDeletes = Array.isArray(deletes)
      ? deletes
          .filter((tileIndex) => Number.isFinite(Number(tileIndex)))
          .map((tileIndex) => Math.max(0, Math.trunc(Number(tileIndex))))
      : [];
    if (normalizedUpserts.length === 0 && normalizedDeletes.length === 0) {
      return;
    }
    const client = await self.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, normalizedInstanceId);
      if (normalizedDeletes.length > 0) {
        await client.query(
          `DELETE FROM ${INSTANCE_TILE_DAMAGE_STATE_TABLE} WHERE instance_id = $1 AND tile_index = ANY($2::bigint[])`,
          [normalizedInstanceId, normalizedDeletes],
        );
      }
      if (normalizedUpserts.length > 0) {
        await client.query(
          `
            WITH incoming AS (
              SELECT
                tile_index,
                x,
                y,
                hp,
                max_hp,
                destroyed,
                respawn_left_ticks,
                modified_at_ms
              FROM jsonb_to_recordset($2::jsonb) AS entry(
                tile_index bigint,
                x bigint,
                y bigint,
                hp double precision,
                max_hp double precision,
                destroyed boolean,
                respawn_left_ticks bigint,
                modified_at_ms bigint
              )
            )
            INSERT INTO ${INSTANCE_TILE_DAMAGE_STATE_TABLE}(
              instance_id,
              tile_index,
              x,
              y,
              hp,
              max_hp,
              destroyed,
              respawn_left_ticks,
              modified_at_ms,
              updated_at
            )
            SELECT
              $1,
              tile_index,
              x,
              y,
              hp,
              max_hp,
              destroyed,
              respawn_left_ticks,
              modified_at_ms,
              now()
            FROM incoming
            ON CONFLICT (instance_id, tile_index)
            DO UPDATE SET
              x = EXCLUDED.x,
              y = EXCLUDED.y,
              hp = EXCLUDED.hp,
              max_hp = EXCLUDED.max_hp,
              destroyed = EXCLUDED.destroyed,
              respawn_left_ticks = EXCLUDED.respawn_left_ticks,
              modified_at_ms = EXCLUDED.modified_at_ms,
              updated_at = now()
          `,
          [
            normalizedInstanceId,
            JSON.stringify(normalizedUpserts.map((entry) => ({
              tile_index: entry.tileIndex,
              x: entry.x,
              y: entry.y,
              hp: entry.hp,
              max_hp: entry.maxHp,
              destroyed: entry.destroyed,
              respawn_left_ticks: entry.respawnLeft,
              modified_at_ms: entry.modifiedAt,
            }))),
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

  /** 加载指定实例的全部地块破坏状态 */
export async function loadTileDamageStatesImpl(self: InstanceDomainPersistenceService, instanceId: string): Promise<Array<{
    tileIndex: number;
    hp: number;
    maxHp: number;
    destroyed: boolean;
    respawnLeft: number;
    modifiedAt: number;
    x?: number | null;
    y?: number | null;
  }>> {
    if (!self.pool || !self.enabled) {
      return [];
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return [];
    }
    const result = await self.pool.query(
      `
        SELECT tile_index, x, y, hp, max_hp, destroyed, respawn_left_ticks, modified_at_ms
        FROM ${INSTANCE_TILE_DAMAGE_STATE_TABLE}
        WHERE instance_id = $1
        ORDER BY tile_index ASC
      `,
      [normalizedInstanceId],
    );
    return Array.isArray(result.rows)
      ? result.rows.map((row) => ({
          tileIndex: normalizeNullableInteger(row.tile_index) ?? 0,
          x: normalizeNullableInteger(row.x),
          y: normalizeNullableInteger(row.y),
          hp: Math.max(0, normalizeNullableNumber(row.hp) ?? 0),
          maxHp: Math.max(1, normalizeNullableNumber(row.max_hp) ?? 1),
          destroyed: row.destroyed === true,
          respawnLeft: Math.max(0, normalizeNullableInteger(row.respawn_left_ticks) ?? 0),
          modifiedAt: Number.isFinite(Number(row.modified_at_ms)) ? Math.max(0, Math.trunc(Number(row.modified_at_ms))) : 0,
        }))
      : [];
  }

  /** 保存指定实例的临时地块快照：批量 upsert 当前临时地块，并删除快照外 stale tile。 */
export async function replaceTemporaryTileStatesImpl(
  self: InstanceDomainPersistenceService,
    instanceId: string,
    entries: Array<{
      tileIndex: number;
      x?: number | null;
      y?: number | null;
      tileType: string;
      hp: number;
      maxHp: number;
      expiresAtTick: number;
      ownerPlayerId?: string | null;
      sourceSkillId?: string | null;
      sourceItemId?: string | null;
      mineralLevel?: number | null;
      createdAt?: number | null;
      modifiedAt?: number | null;
    }>,
    ledgerClaim: InstanceFlushLedgerClaim | null = null,
  ): Promise<boolean> {
    if (!self.pool || !self.enabled) {
      return false;
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return false;
    }
    const normalizedEntries = Array.isArray(entries)
      ? entries
          .filter((entry) => Boolean(entry) && Number.isFinite(Number(entry.tileIndex)))
          .map((entry) => ({
            tileIndex: Math.max(0, Math.trunc(Number(entry.tileIndex))),
            x: Number.isFinite(Number(entry.x)) ? Math.trunc(Number(entry.x)) : null,
            y: Number.isFinite(Number(entry.y)) ? Math.trunc(Number(entry.y)) : null,
            tileType: typeof entry.tileType === 'string' && entry.tileType.trim() ? entry.tileType.trim() : 'stone',
            hp: Math.max(1, normalizeNumberWithFallback(entry.hp, 1)),
            maxHp: Math.max(1, normalizeNumberWithFallback(entry.maxHp, 1)),
            expiresAtTick: Math.max(1, Math.trunc(Number(entry.expiresAtTick) || 1)),
            ownerPlayerId: normalizeRequiredString(entry.ownerPlayerId),
            sourceSkillId: normalizeRequiredString(entry.sourceSkillId),
            sourceItemId: normalizeRequiredString(entry.sourceItemId),
            mineralLevel: entry.mineralLevel == null ? null : Math.max(1, Math.trunc(entry.mineralLevel)),
            createdAt: Number.isFinite(Number(entry.createdAt)) ? Math.max(0, Math.trunc(Number(entry.createdAt))) : Date.now(),
            modifiedAt: Number.isFinite(Number(entry.modifiedAt)) ? Math.max(0, Math.trunc(Number(entry.modifiedAt))) : Date.now(),
          }))
      : [];
    const client = await self.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, normalizedInstanceId);
      if (ledgerClaim && !await isCurrentClaimedInstanceFlushPayload(client, normalizedInstanceId, 'temporary_tile', ledgerClaim)) {
        await client.query('COMMIT');
        return false;
      }
      if (normalizedEntries.length > 0) {
        await client.query(
          `
            WITH incoming AS (
              SELECT *
              FROM jsonb_to_recordset($2::jsonb) AS entry(
                tile_index bigint,
                x bigint,
                y bigint,
                tile_type varchar(64),
                hp double precision,
                max_hp double precision,
                expires_at_tick bigint,
                owner_player_id varchar(100),
                source_skill_id varchar(160),
                source_item_id varchar(160),
                mineral_level integer,
                created_at_ms bigint,
                modified_at_ms bigint
              )
            )
            INSERT INTO ${INSTANCE_TEMPORARY_TILE_STATE_TABLE}(
              instance_id,
              tile_index,
              x,
              y,
              tile_type,
              hp,
              max_hp,
              expires_at_tick,
              owner_player_id,
              source_skill_id,
              source_item_id,
              mineral_level,
              created_at_ms,
              modified_at_ms,
              updated_at
            )
            SELECT $1, tile_index, x, y, tile_type, hp, max_hp, expires_at_tick,
              owner_player_id, source_skill_id, source_item_id, mineral_level, created_at_ms, modified_at_ms, now()
            FROM incoming
            ON CONFLICT (instance_id, tile_index)
            DO UPDATE SET
              x = EXCLUDED.x,
              y = EXCLUDED.y,
              tile_type = EXCLUDED.tile_type,
              hp = EXCLUDED.hp,
              max_hp = EXCLUDED.max_hp,
              expires_at_tick = EXCLUDED.expires_at_tick,
              owner_player_id = EXCLUDED.owner_player_id,
              source_skill_id = EXCLUDED.source_skill_id,
              source_item_id = EXCLUDED.source_item_id,
              mineral_level = EXCLUDED.mineral_level,
              created_at_ms = EXCLUDED.created_at_ms,
              modified_at_ms = EXCLUDED.modified_at_ms,
              updated_at = now()
          `,
          [
            normalizedInstanceId,
            JSON.stringify(normalizedEntries.map((entry) => ({
              tile_index: entry.tileIndex,
              x: entry.x,
              y: entry.y,
              tile_type: entry.tileType,
              hp: entry.hp,
              max_hp: entry.maxHp,
              expires_at_tick: entry.expiresAtTick,
              owner_player_id: entry.ownerPlayerId || null,
              source_skill_id: entry.sourceSkillId || null,
              source_item_id: entry.sourceItemId || null,
              mineral_level: entry.mineralLevel,
              created_at_ms: entry.createdAt,
              modified_at_ms: entry.modifiedAt,
            }))),
          ],
        );
      }
      await client.query(
        `
          WITH incoming AS (
            SELECT tile_index
            FROM jsonb_to_recordset($2::jsonb) AS entry(tile_index bigint)
          )
          DELETE FROM ${INSTANCE_TEMPORARY_TILE_STATE_TABLE} target
          WHERE target.instance_id = $1
            AND NOT EXISTS (
              SELECT 1
              FROM incoming
              WHERE incoming.tile_index = target.tile_index
            )
        `,
        [normalizedInstanceId, JSON.stringify(normalizedEntries.map(({ tileIndex }) => ({ tile_index: tileIndex })))],
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

  /** 加载指定实例的全部临时地块状态 */
export async function loadTemporaryTileStatesImpl(self: InstanceDomainPersistenceService, instanceId: string): Promise<Array<{
    tileIndex: number;
    x: number | null;
    y: number | null;
    tileType: string;
    hp: number;
    maxHp: number;
    expiresAtTick: number;
    ownerPlayerId: string | null;
    sourceSkillId: string | null;
    sourceItemId?: string | null;
    mineralLevel?: number | null;
    createdAt: number;
    modifiedAt: number;
  }>> {
    if (!self.pool || !self.enabled) {
      return [];
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return [];
    }
    const result = await self.pool.query(
      `
        SELECT tile_index, x, y, tile_type, hp, max_hp, expires_at_tick, owner_player_id, source_skill_id, source_item_id, mineral_level, created_at_ms, modified_at_ms
        FROM ${INSTANCE_TEMPORARY_TILE_STATE_TABLE}
        WHERE instance_id = $1
        ORDER BY tile_index ASC
      `,
      [normalizedInstanceId],
    );
    return Array.isArray(result.rows)
      ? result.rows.map((row) => ({
          tileIndex: normalizeNullableInteger(row.tile_index) ?? 0,
          x: normalizeNullableInteger(row.x),
          y: normalizeNullableInteger(row.y),
          tileType: typeof row.tile_type === 'string' && row.tile_type.length > 0 ? row.tile_type : 'stone',
          hp: Math.max(1, normalizeNullableNumber(row.hp) ?? 1),
          maxHp: Math.max(1, normalizeNullableNumber(row.max_hp) ?? 1),
          expiresAtTick: Math.max(1, normalizeNullableInteger(row.expires_at_tick) ?? 1),
          ownerPlayerId: typeof row.owner_player_id === 'string' ? row.owner_player_id : null,
          sourceSkillId: typeof row.source_skill_id === 'string' ? row.source_skill_id : null,
          ...(row.source_item_id ? { sourceItemId: row.source_item_id, mineralLevel: normalizeNullableInteger(row.mineral_level) } : {}),
          createdAt: Number.isFinite(Number(row.created_at_ms)) ? Math.max(0, Math.trunc(Number(row.created_at_ms))) : 0,
          modifiedAt: Number.isFinite(Number(row.modified_at_ms)) ? Math.max(0, Math.trunc(Number(row.modified_at_ms))) : 0,
        }))
      : [];
  }

  /**
   * 批量写入多个实例的 tile_damage delta。
   * 单事务内按 instanceId 有序获取 advisory lock，避免死锁。
   */
export async function saveTileDamageDeltaBatchImpl(
  self: InstanceDomainPersistenceService,
    batch: Array<{
      instanceId: string;
      upserts: Array<{
        tileIndex: number;
        x?: number | null;
        y?: number | null;
        hp: number;
        maxHp: number;
        destroyed: boolean;
        respawnLeft?: number | null;
        modifiedAt?: number | null;
      }>;
      deletes: number[];
      ledgerClaim?: InstanceFlushLedgerClaim | null;
    }>,
  ): Promise<string[]> {
    if (!self.pool || !self.enabled || !Array.isArray(batch) || batch.length === 0) {
      return [];
    }
    // 归一化并过滤空条目
    const entries = batch
      .map((item) => {
        const instanceId = normalizeRequiredString(item.instanceId);
        if (!instanceId) return null;
        const upserts = (Array.isArray(item.upserts) ? item.upserts : [])
          .filter((e) => Boolean(e) && Number.isFinite(Number(e.tileIndex)))
          .map((e) => ({
            tileIndex: Math.max(0, Math.trunc(Number(e.tileIndex))),
            x: Number.isFinite(Number(e.x)) ? Math.trunc(Number(e.x)) : null,
            y: Number.isFinite(Number(e.y)) ? Math.trunc(Number(e.y)) : null,
            hp: Math.max(0, normalizeNumberWithFallback(e.hp, 0)),
            maxHp: Math.max(1, normalizeNumberWithFallback(e.maxHp, 1)),
            destroyed: e.destroyed === true,
            respawnLeft: Math.max(0, Math.trunc(Number(e.respawnLeft) || 0)),
            modifiedAt: Number.isFinite(Number(e.modifiedAt)) ? Math.max(0, Math.trunc(Number(e.modifiedAt))) : Date.now(),
          }));
        const deletes = (Array.isArray(item.deletes) ? item.deletes : [])
          .filter((t) => Number.isFinite(Number(t)))
          .map((t) => Math.max(0, Math.trunc(Number(t))));
        if (upserts.length === 0 && deletes.length === 0) return null;
        const ledgerClaim = normalizeInstanceFlushLedgerClaim(item.ledgerClaim);
        if (item.ledgerClaim && !ledgerClaim) {
          return null;
        }
        return { instanceId, upserts, deletes, ledgerClaim };
      })
      .filter(Boolean) as Array<{ instanceId: string; upserts: any[]; deletes: number[]; ledgerClaim: InstanceFlushLedgerClaim | null }>;
    if (entries.length === 0) return [];
    // 按 instanceId 排序获取锁，避免死锁
    entries.sort((a, b) => a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0);
    const client = await self.pool.connect();
    try {
      await client.query('BEGIN');
      for (const entry of entries) {
        await acquireInstanceDomainLock(client, entry.instanceId);
      }
      const appliedInstanceIds: string[] = [];
      for (const entry of entries) {
        if (entry.ledgerClaim && !await isCurrentClaimedInstanceFlushPayload(
          client,
          entry.instanceId,
          'tile_damage',
          entry.ledgerClaim,
        )) {
          continue;
        }
        if (entry.deletes.length > 0) {
          await client.query(
            `DELETE FROM ${INSTANCE_TILE_DAMAGE_STATE_TABLE} WHERE instance_id = $1 AND tile_index = ANY($2::bigint[])`,
            [entry.instanceId, entry.deletes],
          );
        }
        if (entry.upserts.length > 0) {
          await client.query(
            `
            WITH incoming AS (
              SELECT tile_index, x, y, hp, max_hp, destroyed, respawn_left_ticks, modified_at_ms
              FROM jsonb_to_recordset($2::jsonb) AS e(
                tile_index bigint, x bigint, y bigint, hp double precision,
                max_hp double precision, destroyed boolean, respawn_left_ticks bigint, modified_at_ms bigint
              )
            )
            INSERT INTO ${INSTANCE_TILE_DAMAGE_STATE_TABLE}(
              instance_id, tile_index, x, y, hp, max_hp, destroyed, respawn_left_ticks, modified_at_ms, updated_at
            )
            SELECT $1, tile_index, x, y, hp, max_hp, destroyed, respawn_left_ticks, modified_at_ms, now()
            FROM incoming
            ON CONFLICT (instance_id, tile_index)
            DO UPDATE SET x=EXCLUDED.x, y=EXCLUDED.y, hp=EXCLUDED.hp, max_hp=EXCLUDED.max_hp,
              destroyed=EXCLUDED.destroyed, respawn_left_ticks=EXCLUDED.respawn_left_ticks,
              modified_at_ms=EXCLUDED.modified_at_ms, updated_at=now()
            `,
            [entry.instanceId, JSON.stringify(entry.upserts.map((u) => ({
              tile_index: u.tileIndex, x: u.x, y: u.y, hp: u.hp,
              max_hp: u.maxHp, destroyed: u.destroyed,
              respawn_left_ticks: u.respawnLeft, modified_at_ms: u.modifiedAt,
            })))],
          );
        }
        appliedInstanceIds.push(entry.instanceId);
      }
      await client.query('COMMIT');
      return appliedInstanceIds;
    } catch (error: unknown) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 批量写入多个实例的 tile_resource delta。
   * 单事务内按 instanceId 有序获取 advisory lock，避免死锁。
   */
export async function saveTileResourceDeltaBatchImpl(
  self: InstanceDomainPersistenceService,
    batch: Array<{
      instanceId: string;
      upserts: Array<{ resourceKey: string; tileIndex: number; value: number }>;
      deletes: Array<{ resourceKey: string; tileIndex: number }>;
      ledgerClaim?: {
        ownershipEpoch: number;
        latestVersion: number;
        claimOwnerId: string;
        fencingToken?: string | null;
      } | null;
    }>,
  ): Promise<string[]> {
    if (!self.pool || !self.enabled || !Array.isArray(batch) || batch.length === 0) {
      return [];
    }
    const entries = batch
      .map((item) => {
        const instanceId = normalizeRequiredString(item.instanceId);
        if (!instanceId) return null;
        const upsertRows: Array<{ resource_key: string; tile_index: number; value: number }> = [];
        for (const entry of Array.isArray(item.upserts) ? item.upserts : []) {
          if (!entry
            || typeof entry.resourceKey !== 'string'
            || !Number.isFinite(Number(entry.tileIndex))
            || !Number.isFinite(Number(entry.value))) {
            continue;
          }
          const resourceKey = entry.resourceKey.trim();
          if (!resourceKey) {
            continue;
          }
          upsertRows.push({
            resource_key: resourceKey,
            tile_index: Math.max(0, Math.trunc(Number(entry.tileIndex))),
            value: Math.max(0, normalizeNumberWithFallback(entry.value, 0)),
          });
        }
        const deleteRows: Array<{ resource_key: string; tile_index: number }> = [];
        for (const entry of Array.isArray(item.deletes) ? item.deletes : []) {
          if (!entry
            || typeof entry.resourceKey !== 'string'
            || !Number.isFinite(Number(entry.tileIndex))) {
            continue;
          }
          const resourceKey = entry.resourceKey.trim();
          if (!resourceKey) {
            continue;
          }
          deleteRows.push({
            resource_key: resourceKey,
            tile_index: Math.max(0, Math.trunc(Number(entry.tileIndex))),
          });
        }
        if (upsertRows.length === 0 && deleteRows.length === 0) return null;
        const ledgerClaim = normalizeInstanceFlushLedgerClaim(item.ledgerClaim);
        if (item.ledgerClaim && !ledgerClaim) {
          return null;
        }
        return {
          instanceId,
          upsertsJson: JSON.stringify(upsertRows),
          deletesJson: JSON.stringify(deleteRows),
          ledgerClaim,
        };
      })
      .filter(Boolean) as Array<{
        instanceId: string;
        upsertsJson: string;
        deletesJson: string;
        ledgerClaim: InstanceFlushLedgerClaim | null;
      }>;
    if (entries.length === 0) return [];
    entries.sort((a, b) => a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0);
    const client = await self.pool.connect();
    const appliedInstanceIds: string[] = [];
    try {
      await client.query('BEGIN');
      for (const entry of entries) {
        await acquireInstanceDomainLock(client, entry.instanceId);
      }
      for (const entry of entries) {
        if (entry.ledgerClaim && !await isCurrentClaimedInstanceFlushPayload(
          client,
          entry.instanceId,
          'tile_resource',
          entry.ledgerClaim,
        )) {
          continue;
        }
        if (entry.deletesJson !== '[]') {
          await client.query(
            `WITH incoming AS (
              SELECT resource_key, tile_index
              FROM jsonb_to_recordset($2::jsonb) AS e(resource_key varchar(100), tile_index bigint)
            )
            DELETE FROM ${INSTANCE_TILE_RESOURCE_STATE_TABLE} target
            USING incoming
            WHERE target.instance_id = $1 AND target.resource_key = incoming.resource_key
              AND target.tile_index = incoming.tile_index`,
            [entry.instanceId, entry.deletesJson],
          );
        }
        if (entry.upsertsJson !== '[]') {
          await client.query(
            `WITH incoming AS (
              SELECT resource_key, tile_index, value
              FROM jsonb_to_recordset($2::jsonb) AS e(resource_key varchar(100), tile_index bigint, value double precision)
            )
            INSERT INTO ${INSTANCE_TILE_RESOURCE_STATE_TABLE}(instance_id, resource_key, tile_index, value, updated_at)
            SELECT $1, resource_key, tile_index, value, now() FROM incoming
            ON CONFLICT (instance_id, resource_key, tile_index)
            DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
            [entry.instanceId, entry.upsertsJson],
          );
        }
        appliedInstanceIds.push(entry.instanceId);
      }
      await client.query('COMMIT');
    } catch (error: unknown) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
    return appliedInstanceIds;
  }
