/**
 * 地图实例分域持久化服务。
 * 管理 instance_tile_resource_state、instance_tile_cell、instance_tile_damage_state、
 * instance_temporary_tile_state、instance_checkpoint、instance_ground_item、
 * instance_container_*、instance_monster_runtime_state、instance_event_state、
 * instance_overlay_chunk、instance_building_*、instance_room_*、instance_fengshui_state 等表，
 * 按域独立读写，支持增量刷盘和恢复水位。
 */
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

import { DatabasePoolProvider } from './database-pool.provider';
import { normalizeMonsterTier } from '@mud/shared';
import { ensureBigintColumnType, ensureDoubleColumnType } from './schema-bigint-migration';

const INSTANCE_TILE_RESOURCE_STATE_TABLE = 'instance_tile_resource_state';
const INSTANCE_TILE_CELL_TABLE = 'instance_tile_cell';
const INSTANCE_TILE_DAMAGE_STATE_TABLE = 'instance_tile_damage_state';
const INSTANCE_TEMPORARY_TILE_STATE_TABLE = 'instance_temporary_tile_state';
const INSTANCE_CHECKPOINT_TABLE = 'instance_checkpoint';
const INSTANCE_RECOVERY_WATERMARK_TABLE = 'instance_recovery_watermark';
const INSTANCE_GROUND_ITEM_TABLE = 'instance_ground_item';
const INSTANCE_CONTAINER_STATE_TABLE = 'instance_container_state';
const INSTANCE_CONTAINER_ENTRY_TABLE = 'instance_container_entry';
const INSTANCE_CONTAINER_TIMER_TABLE = 'instance_container_timer';
const INSTANCE_MONSTER_RUNTIME_STATE_TABLE = 'instance_monster_runtime_state';
const INSTANCE_EVENT_STATE_TABLE = 'instance_event_state';
const INSTANCE_OVERLAY_CHUNK_TABLE = 'instance_overlay_chunk';
const INSTANCE_BUILDING_STATE_TABLE = 'instance_building_state';
const INSTANCE_BUILDING_CELL_TABLE = 'instance_building_cell';
const INSTANCE_ROOM_STATE_TABLE = 'instance_room_state';
const INSTANCE_ROOM_CELL_TABLE = 'instance_room_cell';
const INSTANCE_FENGSHUI_STATE_TABLE = 'instance_fengshui_state';
const INSTANCE_BUILDING_AUDIT_LOG_TABLE = 'instance_building_audit_log';
const INSTANCE_BUILDING_OPERATION_IDEMPOTENCY_TABLE = 'instance_building_operation_idempotency';
const INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE = 42871;
const INSTANCE_TILE_RESOURCE_STATE_LOCK_KEY = 3001;
const INSTANCE_TILE_CELL_LOCK_KEY = 3012;
const INSTANCE_TILE_DAMAGE_STATE_LOCK_KEY = 3009;
const INSTANCE_TEMPORARY_TILE_STATE_LOCK_KEY = 3013;
const INSTANCE_CHECKPOINT_LOCK_KEY = 3002;
const INSTANCE_RECOVERY_WATERMARK_LOCK_KEY = 3003;
const INSTANCE_GROUND_ITEM_LOCK_KEY = 3004;
const INSTANCE_CONTAINER_STATE_LOCK_KEY = 3005;
const INSTANCE_CONTAINER_ENTRY_LOCK_KEY = 3010;
const INSTANCE_CONTAINER_TIMER_LOCK_KEY = 3011;
const INSTANCE_MONSTER_RUNTIME_STATE_LOCK_KEY = 3006;
const INSTANCE_EVENT_STATE_LOCK_KEY = 3007;
const INSTANCE_OVERLAY_CHUNK_LOCK_KEY = 3008;
const INSTANCE_BUILDING_STATE_LOCK_KEY = 3014;
const INSTANCE_ROOM_STATE_LOCK_KEY = 3015;
const INSTANCE_FENGSHUI_STATE_LOCK_KEY = 3016;
const INSTANCE_BUILDING_CELL_LOCK_KEY = 3017;
const INSTANCE_ROOM_CELL_LOCK_KEY = 3018;
const INSTANCE_BUILDING_AUDIT_LOG_LOCK_KEY = 3019;
const INSTANCE_BUILDING_OPERATION_IDEMPOTENCY_LOCK_KEY = 3020;
const INSTANCE_DOMAIN_BIGINT_COLUMNS_BY_TABLE = {
  [INSTANCE_TILE_RESOURCE_STATE_TABLE]: ['tile_index'],
  [INSTANCE_TILE_CELL_TABLE]: ['x', 'y'],
  [INSTANCE_TILE_DAMAGE_STATE_TABLE]: ['tile_index', 'x', 'y', 'respawn_left_ticks'],
  [INSTANCE_TEMPORARY_TILE_STATE_TABLE]: ['tile_index', 'x', 'y', 'expires_at_tick', 'created_at_ms', 'modified_at_ms'],
  [INSTANCE_GROUND_ITEM_TABLE]: ['tile_index'],
  [INSTANCE_CONTAINER_ENTRY_TABLE]: ['entry_index'],
    [INSTANCE_MONSTER_RUNTIME_STATE_TABLE]: [
    'monster_level',
    'tile_index',
    'x',
    'y',
    'respawn_left',
      'respawn_ticks',
    ],
  [INSTANCE_BUILDING_STATE_TABLE]: ['x', 'y', 'created_at_tick', 'updated_at_tick', 'revision'],
  [INSTANCE_BUILDING_CELL_TABLE]: ['tile_index', 'x', 'y'],
  [INSTANCE_ROOM_STATE_TABLE]: ['min_x', 'min_y', 'max_x', 'max_y', 'area', 'perimeter', 'door_count', 'window_count', 'revision', 'updated_at_tick'],
  [INSTANCE_ROOM_CELL_TABLE]: ['tile_index', 'x', 'y', 'edge_flags'],
  [INSTANCE_FENGSHUI_STATE_TABLE]: [
    'score',
    'shape_score',
    'enclosure_score',
    'sha_score',
    'comfort_score',
    'integrity_score',
    'element_score',
    'formation_score',
    'revision',
    'updated_at_tick',
  ],
  } as const;
const INSTANCE_DOMAIN_DOUBLE_COLUMNS_BY_TABLE = {
  [INSTANCE_TILE_RESOURCE_STATE_TABLE]: ['value'],
  [INSTANCE_TILE_DAMAGE_STATE_TABLE]: ['hp', 'max_hp'],
  [INSTANCE_TEMPORARY_TILE_STATE_TABLE]: ['hp', 'max_hp'],
  [INSTANCE_MONSTER_RUNTIME_STATE_TABLE]: ['hp', 'max_hp'],
  [INSTANCE_BUILDING_STATE_TABLE]: ['hp', 'max_hp'],
  [INSTANCE_FENGSHUI_STATE_TABLE]: ['qi_score'],
} as const;

/** 地图实例分域持久化服务：按域独立管理地块、资源、容器、怪物、建筑等实例状态的落库与恢复 */
@Injectable()
export class InstanceDomainPersistenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InstanceDomainPersistenceService.name);
  private pool: Pool | null = null;
  private enabled = false;

  constructor(@Inject(DatabasePoolProvider) private readonly databasePoolProvider: DatabasePoolProvider | null = null) {}

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
      await ensureInstanceTemporaryTileStateTable(this.pool);
      await ensureInstanceCheckpointTable(this.pool);
      await ensureInstanceRecoveryWatermarkTable(this.pool);
      await ensureInstanceGroundItemTable(this.pool);
      await ensureInstanceContainerStateTable(this.pool);
      await ensureInstanceContainerEntryTable(this.pool);
      await ensureInstanceContainerTimerTable(this.pool);
      await ensureInstanceMonsterRuntimeStateTable(this.pool);
      await ensureInstanceEventStateTable(this.pool);
      await ensureInstanceOverlayChunkTable(this.pool);
      await ensureInstanceBuildingStateTable(this.pool);
      await ensureInstanceBuildingCellTable(this.pool);
      await ensureInstanceRoomStateTable(this.pool);
      await ensureInstanceRoomCellTable(this.pool);
      await ensureInstanceFengShuiStateTable(this.pool);
      await ensureInstanceBuildingAuditLogTable(this.pool);
      await ensureInstanceBuildingOperationIdempotencyTable(this.pool);
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

  /** 事务性保存建筑/房间/风水状态：全量替换指定实例的建筑、房间、房间格子和风水记录 */
  async saveBuildingRoomFengShuiState(
    instanceId: string,
    state: {
      buildings?: unknown[];
      rooms?: unknown[];
      roomCells?: unknown[];
      fengShui?: unknown[];
    },
  ): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return;
    }
    const buildings = Array.isArray(state?.buildings) ? state.buildings : [];
    const rooms = Array.isArray(state?.rooms) ? state.rooms : [];
    const buildingCells = buildings.flatMap(normalizeBuildingCellPersistenceRows);
    const roomCells = Array.isArray(state?.roomCells) ? state.roomCells.map(normalizeRoomCellPersistenceRow).filter((row) => normalizeRequiredString(row.room_id)) : [];
    const fengShui = Array.isArray(state?.fengShui) ? state.fengShui : [];
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, normalizedInstanceId);
      await client.query(`DELETE FROM ${INSTANCE_BUILDING_CELL_TABLE} WHERE instance_id = $1`, [normalizedInstanceId]);
      await client.query(`DELETE FROM ${INSTANCE_BUILDING_STATE_TABLE} WHERE instance_id = $1`, [normalizedInstanceId]);
      await client.query(`DELETE FROM ${INSTANCE_ROOM_CELL_TABLE} WHERE instance_id = $1`, [normalizedInstanceId]);
      await client.query(`DELETE FROM ${INSTANCE_ROOM_STATE_TABLE} WHERE instance_id = $1`, [normalizedInstanceId]);
      await client.query(`DELETE FROM ${INSTANCE_FENGSHUI_STATE_TABLE} WHERE instance_id = $1`, [normalizedInstanceId]);
      if (buildings.length > 0) {
        await client.query(
          `
            WITH incoming AS (
              SELECT *
              FROM jsonb_to_recordset($2::jsonb) AS entry(
                building_id varchar(120),
                def_id varchar(120),
                x bigint,
                y bigint,
                rotation int,
                owner_player_id varchar(100),
                owner_sect_id varchar(100),
                room_id varchar(160),
                hp double precision,
                max_hp double precision,
                state varchar(40),
                created_at_tick bigint,
                updated_at_tick bigint,
                revision bigint,
                payload jsonb
              )
            )
            INSERT INTO ${INSTANCE_BUILDING_STATE_TABLE}(
              instance_id, building_id, def_id, x, y, rotation, owner_player_id, owner_sect_id,
              room_id, hp, max_hp, state, created_at_tick, updated_at_tick, revision, payload, updated_at
            )
            SELECT $1, building_id, def_id, x, y, rotation, owner_player_id, owner_sect_id,
              room_id, hp, max_hp, state, created_at_tick, updated_at_tick, revision, COALESCE(payload, '{}'::jsonb), now()
            FROM incoming
            ON CONFLICT (instance_id, building_id) DO UPDATE SET
              def_id = EXCLUDED.def_id,
              x = EXCLUDED.x,
              y = EXCLUDED.y,
              rotation = EXCLUDED.rotation,
              owner_player_id = EXCLUDED.owner_player_id,
              owner_sect_id = EXCLUDED.owner_sect_id,
              room_id = EXCLUDED.room_id,
              hp = EXCLUDED.hp,
              max_hp = EXCLUDED.max_hp,
              state = EXCLUDED.state,
              created_at_tick = EXCLUDED.created_at_tick,
              updated_at_tick = EXCLUDED.updated_at_tick,
              revision = EXCLUDED.revision,
              payload = EXCLUDED.payload,
              updated_at = now()
          `,
          [normalizedInstanceId, JSON.stringify(buildings.map(normalizeBuildingPersistenceRow))],
        );
      }
      if (buildingCells.length > 0) {
        await client.query(
          `
            WITH incoming AS (
              SELECT *
              FROM jsonb_to_recordset($2::jsonb) AS entry(
                building_id varchar(160),
                tile_index bigint,
                x bigint,
                y bigint,
                tile_type varchar(80),
                previous_tile_type varchar(80),
                previous_terrain_type varchar(80),
                previous_surface_type varchar(80),
                previous_structure_type varchar(80),
                previous_interactable_kinds text[],
                blocks_move boolean,
                blocks_sight boolean
              )
            )
            INSERT INTO ${INSTANCE_BUILDING_CELL_TABLE}(
              instance_id, building_id, tile_index, x, y, tile_type, previous_tile_type,
              previous_terrain_type, previous_surface_type, previous_structure_type, previous_interactable_kinds,
              blocks_move, blocks_sight, updated_at
            )
            SELECT $1, building_id, tile_index, x, y, tile_type, previous_tile_type,
              previous_terrain_type, previous_surface_type, previous_structure_type, COALESCE(previous_interactable_kinds, '{}'::text[]),
              blocks_move, blocks_sight, now()
            FROM incoming
            ON CONFLICT (instance_id, tile_index) DO UPDATE SET
              building_id = EXCLUDED.building_id,
              x = EXCLUDED.x,
              y = EXCLUDED.y,
              tile_type = EXCLUDED.tile_type,
              previous_tile_type = EXCLUDED.previous_tile_type,
              previous_terrain_type = EXCLUDED.previous_terrain_type,
              previous_surface_type = EXCLUDED.previous_surface_type,
              previous_structure_type = EXCLUDED.previous_structure_type,
              previous_interactable_kinds = EXCLUDED.previous_interactable_kinds,
              blocks_move = EXCLUDED.blocks_move,
              blocks_sight = EXCLUDED.blocks_sight,
              updated_at = now()
          `,
          [normalizedInstanceId, JSON.stringify(buildingCells)],
        );
      }
      if (rooms.length > 0) {
        await client.query(
          `
            WITH incoming AS (
              SELECT *
              FROM jsonb_to_recordset($2::jsonb) AS entry(
                room_id varchar(160),
                role varchar(60),
                enclosed boolean,
                semi_outdoor boolean,
                min_x bigint,
                min_y bigint,
                max_x bigint,
                max_y bigint,
                area bigint,
                perimeter bigint,
                door_count bigint,
                window_count bigint,
                roof_coverage_ratio int,
                room_hash varchar(120),
                revision bigint,
                updated_at_tick bigint,
                payload jsonb
              )
            )
            INSERT INTO ${INSTANCE_ROOM_STATE_TABLE}(
              instance_id, room_id, role, enclosed, semi_outdoor, min_x, min_y, max_x, max_y,
              area, perimeter, door_count, window_count, roof_coverage_ratio, room_hash,
              revision, updated_at_tick, payload, updated_at
            )
            SELECT $1, room_id, role, enclosed, semi_outdoor, min_x, min_y, max_x, max_y,
              area, perimeter, door_count, window_count, roof_coverage_ratio, room_hash,
              revision, updated_at_tick, COALESCE(payload, '{}'::jsonb), now()
            FROM incoming
            ON CONFLICT (instance_id, room_id) DO UPDATE SET
              role = EXCLUDED.role,
              enclosed = EXCLUDED.enclosed,
              semi_outdoor = EXCLUDED.semi_outdoor,
              min_x = EXCLUDED.min_x,
              min_y = EXCLUDED.min_y,
              max_x = EXCLUDED.max_x,
              max_y = EXCLUDED.max_y,
              area = EXCLUDED.area,
              perimeter = EXCLUDED.perimeter,
              door_count = EXCLUDED.door_count,
              window_count = EXCLUDED.window_count,
              roof_coverage_ratio = EXCLUDED.roof_coverage_ratio,
              room_hash = EXCLUDED.room_hash,
              revision = EXCLUDED.revision,
              updated_at_tick = EXCLUDED.updated_at_tick,
              payload = EXCLUDED.payload,
              updated_at = now()
          `,
          [normalizedInstanceId, JSON.stringify(rooms.map(normalizeRoomPersistenceRow))],
        );
      }
      if (roomCells.length > 0) {
        await client.query(
          `
            WITH incoming AS (
              SELECT *
              FROM jsonb_to_recordset($2::jsonb) AS entry(
                room_id varchar(160),
                tile_index bigint,
                x bigint,
                y bigint,
                edge_flags bigint
              )
            )
            INSERT INTO ${INSTANCE_ROOM_CELL_TABLE}(
              instance_id, room_id, tile_index, x, y, edge_flags, updated_at
            )
            SELECT $1, room_id, tile_index, x, y, edge_flags, now()
            FROM incoming
            ON CONFLICT (instance_id, tile_index) DO UPDATE SET
              room_id = EXCLUDED.room_id,
              x = EXCLUDED.x,
              y = EXCLUDED.y,
              edge_flags = EXCLUDED.edge_flags,
              updated_at = now()
          `,
          [normalizedInstanceId, JSON.stringify(roomCells)],
        );
      }
      if (fengShui.length > 0) {
        await client.query(
          `
            WITH incoming AS (
              SELECT *
              FROM jsonb_to_recordset($2::jsonb) AS entry(
                room_id varchar(160),
                score bigint,
                grade varchar(40),
                primary_element varchar(20),
                function_element varchar(20),
                shape_score bigint,
                enclosure_score bigint,
                qi_score double precision,
                sha_score bigint,
                comfort_score bigint,
                integrity_score bigint,
                element_score bigint,
                formation_score bigint,
                revision bigint,
                updated_at_tick bigint,
                detail_json jsonb
              )
            )
            INSERT INTO ${INSTANCE_FENGSHUI_STATE_TABLE}(
              instance_id, room_id, score, grade, primary_element, function_element,
              shape_score, enclosure_score, qi_score, sha_score, comfort_score, integrity_score,
              element_score, formation_score, revision, updated_at_tick, detail_json, updated_at
            )
            SELECT $1, room_id, score, grade, primary_element, function_element,
              shape_score, enclosure_score, qi_score, sha_score, comfort_score, integrity_score,
              element_score, formation_score, revision, updated_at_tick, COALESCE(detail_json, '{}'::jsonb), now()
            FROM incoming
            ON CONFLICT (instance_id, room_id) DO UPDATE SET
              score = EXCLUDED.score,
              grade = EXCLUDED.grade,
              primary_element = EXCLUDED.primary_element,
              function_element = EXCLUDED.function_element,
              shape_score = EXCLUDED.shape_score,
              enclosure_score = EXCLUDED.enclosure_score,
              qi_score = EXCLUDED.qi_score,
              sha_score = EXCLUDED.sha_score,
              comfort_score = EXCLUDED.comfort_score,
              integrity_score = EXCLUDED.integrity_score,
              element_score = EXCLUDED.element_score,
              formation_score = EXCLUDED.formation_score,
              revision = EXCLUDED.revision,
              updated_at_tick = EXCLUDED.updated_at_tick,
              detail_json = EXCLUDED.detail_json,
              updated_at = now()
          `,
          [normalizedInstanceId, JSON.stringify(fengShui.map(normalizeFengShuiPersistenceRow))],
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

  /** 加载指定实例的建筑/房间/风水完整状态 */
  async loadBuildingRoomFengShuiState(instanceId: string): Promise<{ buildings: unknown[]; rooms: unknown[]; roomCells: unknown[]; fengShui: unknown[] }> {
    if (!this.pool || !this.enabled) {
      return { buildings: [], rooms: [], roomCells: [], fengShui: [] };
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return { buildings: [], rooms: [], roomCells: [], fengShui: [] };
    }
    const [buildingRows, buildingCellRows, roomRows, roomCellRows, fengShuiRows] = await Promise.all([
      this.pool.query(`SELECT * FROM ${INSTANCE_BUILDING_STATE_TABLE} WHERE instance_id = $1 ORDER BY building_id ASC`, [normalizedInstanceId]),
      this.pool.query(`SELECT * FROM ${INSTANCE_BUILDING_CELL_TABLE} WHERE instance_id = $1 ORDER BY building_id ASC, tile_index ASC`, [normalizedInstanceId]),
      this.pool.query(`SELECT * FROM ${INSTANCE_ROOM_STATE_TABLE} WHERE instance_id = $1 ORDER BY room_id ASC`, [normalizedInstanceId]),
      this.pool.query(`SELECT * FROM ${INSTANCE_ROOM_CELL_TABLE} WHERE instance_id = $1 ORDER BY room_id ASC, tile_index ASC`, [normalizedInstanceId]),
      this.pool.query(`SELECT * FROM ${INSTANCE_FENGSHUI_STATE_TABLE} WHERE instance_id = $1 ORDER BY room_id ASC`, [normalizedInstanceId]),
    ]);
    const buildingCellsById = new Map<string, Record<string, unknown>[]>();
    for (const row of buildingCellRows.rows) {
      const projected = projectBuildingCellPersistenceRow(row);
      const buildingId = normalizeRequiredString(projected.buildingId);
      if (!buildingId) {
        continue;
      }
      const cells = buildingCellsById.get(buildingId) ?? [];
      cells.push(projected);
      buildingCellsById.set(buildingId, cells);
    }
    const buildings = buildingRows.rows.map((row) => {
      const projected = projectBuildingPersistenceRow(row);
      const cells = buildingCellsById.get(normalizeRequiredString(projected.id));
      return cells && cells.length > 0 ? { ...projected, cells } : projected;
    });
    return {
      buildings,
      rooms: roomRows.rows.map(projectRoomPersistenceRow),
      roomCells: roomCellRows.rows.map(projectRoomCellPersistenceRow),
      fengShui: fengShuiRows.rows.map(projectFengShuiPersistenceRow),
    };
  }

  /** 全量替换指定实例的地块资源状态（灵气等） */
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
        value: Math.max(0, entry.value),
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

  /** 增量更新地块资源状态：仅 upsert/delete 变化的条目 */
  async saveTileResourceDelta(
    instanceId: string,
    upserts: Array<{ resourceKey: string; tileIndex: number; value: number }>,
    deletes: Array<{ resourceKey: string; tileIndex: number }>,
  ): Promise<void> {
    if (!this.pool || !this.enabled) {
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
    const client = await this.pool.connect();
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
          tileIndex: normalizeNullableInteger(row.tile_index) ?? 0,
          value: normalizeNullableInteger(row.value) ?? 0,
        }))
      : [];
  }

  /** 全量替换指定实例的运行时地块格子（地形变更） */
  async replaceRuntimeTileCells(
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
        terrainType: normalizeOptionalString(entry.terrainType),
        surfaceType: normalizeOptionalString(entry.surfaceType),
        structureType: normalizeOptionalString(entry.structureType),
        interactableKinds: Array.isArray(entry.interactableKinds)
          ? entry.interactableKinds.filter((kind) => typeof kind === 'string' && kind.trim()).map((kind) => kind.trim())
          : [],
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
              terrain_type,
              surface_type,
              structure_type,
              interactable_kinds,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
            ON CONFLICT (instance_id, x, y)
            DO UPDATE SET
              tile_type = EXCLUDED.tile_type,
              terrain_type = EXCLUDED.terrain_type,
              surface_type = EXCLUDED.surface_type,
              structure_type = EXCLUDED.structure_type,
              interactable_kinds = EXCLUDED.interactable_kinds,
              updated_at = now()
          `,
          [
            normalizedInstanceId,
            entry.x,
            entry.y,
            entry.tileType,
            entry.terrainType,
            entry.surfaceType,
            entry.structureType,
            entry.interactableKinds,
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

  /** 加载指定实例的运行时地块格子 */
  async loadRuntimeTileCells(instanceId: string): Promise<Array<{
    x: number;
    y: number;
    tileType: string;
    terrainType?: string | null;
    surfaceType?: string | null;
    structureType?: string | null;
    interactableKinds?: string[];
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

  /** 全量替换指定实例的地块破坏状态 */
  async saveTileDamageStates(
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
            x: Number.isFinite(Number(entry.x)) ? Math.trunc(Number(entry.x)) : null,
            y: Number.isFinite(Number(entry.y)) ? Math.trunc(Number(entry.y)) : null,
            hp: Math.max(0, normalizeNumberWithFallback(entry.hp, 0)),
            maxHp: Math.max(1, normalizeNumberWithFallback(entry.maxHp, 1)),
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
              x,
              y,
              hp,
              max_hp,
              destroyed,
              respawn_left_ticks,
              modified_at_ms,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
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
            entry.tileIndex,
            entry.x,
            entry.y,
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

  /** 删除指定实例的地块破坏状态（可按 tileIndex 过滤） */
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
        `DELETE FROM ${INSTANCE_TILE_DAMAGE_STATE_TABLE} WHERE instance_id = $1 AND tile_index = ANY($2::bigint[])`,
        [normalizedInstanceId, normalizedTileIndices],
      );
      return;
    }
    await this.pool.query(`DELETE FROM ${INSTANCE_TILE_DAMAGE_STATE_TABLE} WHERE instance_id = $1`, [normalizedInstanceId]);
  }

  /** 增量更新地块破坏状态：仅 upsert/delete 变化的条目 */
  async saveTileDamageDelta(
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
    if (!this.pool || !this.enabled) {
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
    const client = await this.pool.connect();
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
  async loadTileDamageStates(instanceId: string): Promise<Array<{
    tileIndex: number;
    hp: number;
    maxHp: number;
    destroyed: boolean;
    respawnLeft: number;
    modifiedAt: number;
    x?: number | null;
    y?: number | null;
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

  /** 全量替换指定实例的临时地块状态（技能生成地块等） */
  async replaceTemporaryTileStates(
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
      createdAt?: number | null;
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
            createdAt: Number.isFinite(Number(entry.createdAt)) ? Math.max(0, Math.trunc(Number(entry.createdAt))) : Date.now(),
            modifiedAt: Number.isFinite(Number(entry.modifiedAt)) ? Math.max(0, Math.trunc(Number(entry.modifiedAt))) : Date.now(),
          }))
      : [];
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, normalizedInstanceId);
      await client.query(`DELETE FROM ${INSTANCE_TEMPORARY_TILE_STATE_TABLE} WHERE instance_id = $1`, [normalizedInstanceId]);
      for (const entry of normalizedEntries) {
        await client.query(
          `
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
              created_at_ms,
              modified_at_ms,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
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
              created_at_ms = EXCLUDED.created_at_ms,
              modified_at_ms = EXCLUDED.modified_at_ms,
              updated_at = now()
          `,
          [
            normalizedInstanceId,
            entry.tileIndex,
            entry.x,
            entry.y,
            entry.tileType,
            entry.hp,
            entry.maxHp,
            entry.expiresAtTick,
            entry.ownerPlayerId || null,
            entry.sourceSkillId || null,
            entry.createdAt,
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

  /** 加载指定实例的全部临时地块状态 */
  async loadTemporaryTileStates(instanceId: string): Promise<Array<{
    tileIndex: number;
    x: number | null;
    y: number | null;
    tileType: string;
    hp: number;
    maxHp: number;
    expiresAtTick: number;
    ownerPlayerId: string | null;
    sourceSkillId: string | null;
    createdAt: number;
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
        SELECT tile_index, x, y, tile_type, hp, max_hp, expires_at_tick, owner_player_id, source_skill_id, created_at_ms, modified_at_ms
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
          createdAt: Number.isFinite(Number(row.created_at_ms)) ? Math.max(0, Math.trunc(Number(row.created_at_ms))) : 0,
          modifiedAt: Number.isFinite(Number(row.modified_at_ms)) ? Math.max(0, Math.trunc(Number(row.modified_at_ms))) : 0,
        }))
      : [];
  }

  /** 保存实例检查点（tick/时间等元数据） */
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

  /** 加载实例检查点 */
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

  /** 保存实例恢复水位标记 */
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

  /** 加载实例恢复水位标记 */
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

  /** 保存单个地面物品 */
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

  /** 全量替换指定实例的地面物品 */
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

  /** 按地块批量替换地面物品（增量刷盘用） */
  async replaceGroundItemTiles(
    instanceId: string,
    tileIndices: number[],
    entries: Array<{ tileIndex: number; items: unknown[] }>,
  ): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return;
    }
    const normalizedTileIndices = Array.from(new Set((Array.isArray(tileIndices) ? tileIndices : [])
      .filter((tileIndex) => Number.isFinite(Number(tileIndex)))
      .map((tileIndex) => Math.max(0, Math.trunc(Number(tileIndex))))));
    if (normalizedTileIndices.length === 0) {
      return;
    }
    const dirtyTileIndexSet = new Set(normalizedTileIndices);
    const normalizedEntries: Array<{ groundItemId: string; tileIndex: number; itemPayload: unknown }> = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!entry || !Number.isFinite(Number(entry.tileIndex)) || !Array.isArray(entry.items)) {
        continue;
      }
      const tileIndex = Math.max(0, Math.trunc(Number(entry.tileIndex)));
      if (!dirtyTileIndexSet.has(tileIndex)) {
        continue;
      }
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
      await client.query(
        `DELETE FROM ${INSTANCE_GROUND_ITEM_TABLE} WHERE instance_id = $1 AND tile_index = ANY($2::bigint[])`,
        [normalizedInstanceId, normalizedTileIndices],
      );
      if (normalizedEntries.length > 0) {
        await client.query(
          `
            WITH incoming AS (
              SELECT
                ground_item_id,
                tile_index,
                COALESCE(item_instance_payload, '{}'::jsonb) AS item_instance_payload
              FROM jsonb_to_recordset($2::jsonb) AS entry(
                ground_item_id varchar(100),
                tile_index bigint,
                item_instance_payload jsonb
              )
            )
            INSERT INTO ${INSTANCE_GROUND_ITEM_TABLE}(
              ground_item_id,
              instance_id,
              tile_index,
              item_instance_payload,
              expire_at,
              updated_at
            )
            SELECT ground_item_id, $1, tile_index, item_instance_payload, NULL, now()
            FROM incoming
            ON CONFLICT (ground_item_id)
            DO UPDATE SET
              instance_id = EXCLUDED.instance_id,
              tile_index = EXCLUDED.tile_index,
              item_instance_payload = EXCLUDED.item_instance_payload,
              expire_at = EXCLUDED.expire_at,
              updated_at = now()
          `,
          [
            normalizedInstanceId,
            JSON.stringify(normalizedEntries.map((entry) => ({
              ground_item_id: entry.groundItemId,
              tile_index: entry.tileIndex,
              item_instance_payload: entry.itemPayload ?? {},
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

  /** 加载指定实例的全部地面物品 */
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
          tileIndex: normalizeNullableInteger(row.tile_index) ?? 0,
          itemPayload: row.item_instance_payload ?? null,
          expireAt: typeof row.expire_at === 'string' ? row.expire_at : null,
        }))
      : [];
  }

  /** 保存单个容器状态（含条目和搜索计时器） */
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

  /** 全量替换指定实例的容器状态 */
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
    const normalizedStatesByContainerId = new Map<string, {
      containerId: string;
      sourceId: string;
      statePayload: Record<string, unknown>;
      generatedAtTick: number | null;
      refreshAtTick: number | null;
      activeSearchPayload: unknown;
      entries: Array<{ item?: unknown; createdTick?: unknown; visible?: unknown }>;
    }>();
    for (const state of Array.isArray(states) ? states : []) {
      const containerId = normalizeRequiredString(state?.containerId);
      const sourceId = normalizeRequiredString(state?.sourceId) || containerId;
      if (!containerId || !sourceId) {
        continue;
      }
      const normalizedState = {
        containerId,
        sourceId,
        statePayload: buildContainerMetadataPayload(state),
        generatedAtTick: normalizeNullableInteger(state?.generatedAtTick),
        refreshAtTick: normalizeNullableInteger(state?.refreshAtTick),
        activeSearchPayload: state?.activeSearch && typeof state.activeSearch === 'object' ? state.activeSearch : null,
        entries: Array.isArray(state?.entries) ? state.entries : [],
      };
      const currentState = normalizedStatesByContainerId.get(containerId);
      if (!currentState || shouldReplaceContainerState(normalizedInstanceId, containerId, currentState.sourceId, sourceId)) {
        normalizedStatesByContainerId.set(containerId, normalizedState);
      }
    }
    const normalizedStates = Array.from(normalizedStatesByContainerId.values());
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

  /** 加载指定实例的全部容器状态（含条目和搜索计时器） */
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

  /** 保存单个妖兽运行时状态 */
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
          Math.max(0, normalizeNumberWithFallback(input.hp, 0)),
          Math.max(1, normalizeNumberWithFallback(input.maxHp, 1)),
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

  /** 全量替换指定实例的妖兽运行时状态 */
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
            hp: Math.max(0, normalizeNumberWithFallback(entry?.hp, 0)),
            maxHp: Math.max(1, normalizeNumberWithFallback(entry?.maxHp, 1)),
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
      await client.query(
        `
          WITH incoming AS (
            SELECT
              monster_runtime_id,
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
              COALESCE(state_payload, '{}'::jsonb) AS state_payload
            FROM jsonb_to_recordset($2::jsonb) AS entry(
              monster_runtime_id varchar(100),
              monster_id varchar(100),
              monster_name varchar(200),
              monster_tier varchar(32),
              monster_level bigint,
              tile_index bigint,
              x bigint,
              y bigint,
              hp double precision,
              max_hp double precision,
              alive boolean,
              respawn_left bigint,
              respawn_ticks bigint,
              aggro_target_player_id varchar(100),
              state_payload jsonb
            )
          ),
          deleted AS (
            DELETE FROM ${INSTANCE_MONSTER_RUNTIME_STATE_TABLE} target
            WHERE target.instance_id = $1
              AND NOT EXISTS (
                SELECT 1
                FROM incoming
                WHERE incoming.monster_runtime_id = target.monster_runtime_id
              )
            RETURNING 1
          )
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
          SELECT
            monster_runtime_id,
            $1,
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
            NULLIF(aggro_target_player_id, ''),
            state_payload,
            now()
          FROM incoming
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
          normalizedInstanceId,
          JSON.stringify(normalizedEntries.map((entry) => ({
            monster_runtime_id: entry.monsterRuntimeId,
            monster_id: entry.monsterId,
            monster_name: entry.monsterName,
            monster_tier: entry.monsterTier,
            monster_level: entry.monsterLevel,
            tile_index: entry.tileIndex,
            x: entry.x,
            y: entry.y,
            hp: entry.hp,
            max_hp: entry.maxHp,
            alive: entry.alive,
            respawn_left: entry.respawnLeft,
            respawn_ticks: entry.respawnTicks,
            aggro_target_player_id: entry.aggroTargetPlayerId || null,
            state_payload: entry.statePayload ?? {},
          }))),
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

  /** 加载指定实例的全部妖兽运行时状态 */
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
          monsterLevel: normalizeNullableInteger(row.monster_level),
          tileIndex: normalizeNullableInteger(row.tile_index) ?? 0,
          x: normalizeNullableInteger(row.x) ?? 0,
          y: normalizeNullableInteger(row.y) ?? 0,
          hp: normalizeNullableNumber(row.hp) ?? 0,
          maxHp: normalizeNullableNumber(row.max_hp) ?? 0,
          alive: row.alive === true,
          respawnLeft: normalizeNullableInteger(row.respawn_left),
          respawnTicks: normalizeNullableInteger(row.respawn_ticks),
          aggroTargetPlayerId: typeof row.aggro_target_player_id === 'string' ? row.aggro_target_player_id : null,
          statePayload: row.state_payload ?? null,
        }))
      : [];
  }

  /** 保存实例事件状态 */
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

  /** 加载指定实例的全部事件状态 */
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

  /** 保存单个覆盖层分块 */
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

  /** 全量替换指定实例的覆盖层分块 */
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

  async saveMonsterRuntimeDelta(
    instanceId: string,
    upserts: Array<{
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
    deletes: string[],
  ): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    const normalizedInstanceId = normalizeRequiredString(instanceId);
    if (!normalizedInstanceId) {
      return;
    }
    const normalizedDeletes = Array.isArray(deletes)
      ? deletes.map((entry) => normalizeRequiredString(entry)).filter(Boolean)
      : [];
    const normalizedUpserts = Array.isArray(upserts)
      ? upserts
          .map((entry) => ({
            monsterRuntimeId: normalizeRequiredString(entry?.monsterRuntimeId),
            monsterId: normalizeRequiredString(entry?.monsterId),
            monsterName: normalizeRequiredString(entry?.monsterName),
            monsterTier: normalizeMonsterTier(entry?.monsterTier),
            monsterLevel: Number.isFinite(Number(entry?.monsterLevel)) ? Math.trunc(Number(entry.monsterLevel)) : null,
            tileIndex: Math.max(0, Math.trunc(Number(entry?.tileIndex) || 0)),
            x: Math.trunc(Number(entry?.x) || 0),
            y: Math.trunc(Number(entry?.y) || 0),
            hp: Math.max(0, normalizeNumberWithFallback(entry?.hp, 0)),
            maxHp: Math.max(1, normalizeNumberWithFallback(entry?.maxHp, 1)),
            alive: entry?.alive === true,
            respawnLeft: Number.isFinite(Number(entry?.respawnLeft)) ? Math.max(0, Math.trunc(Number(entry.respawnLeft))) : null,
            respawnTicks: Number.isFinite(Number(entry?.respawnTicks)) ? Math.max(0, Math.trunc(Number(entry.respawnTicks))) : null,
            aggroTargetPlayerId: normalizeRequiredString(entry?.aggroTargetPlayerId),
            statePayload: entry?.statePayload ?? {},
          }))
          .filter((entry) => entry.monsterRuntimeId && entry.monsterId && entry.monsterName && entry.monsterTier !== 'mortal_blood')
      : [];
    if (normalizedUpserts.length === 0 && normalizedDeletes.length === 0) {
      return;
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await acquireInstanceDomainLock(client, normalizedInstanceId);
      if (normalizedDeletes.length > 0) {
        await client.query(
          `DELETE FROM ${INSTANCE_MONSTER_RUNTIME_STATE_TABLE} WHERE instance_id = $1 AND monster_runtime_id = ANY($2::varchar[])`,
          [normalizedInstanceId, normalizedDeletes],
        );
      }
      if (normalizedUpserts.length > 0) {
        await client.query(
          `
            WITH incoming AS (
              SELECT
                monster_runtime_id,
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
                COALESCE(state_payload, '{}'::jsonb) AS state_payload
              FROM jsonb_to_recordset($2::jsonb) AS entry(
                monster_runtime_id varchar(100),
                monster_id varchar(100),
                monster_name varchar(200),
                monster_tier varchar(32),
                monster_level bigint,
                tile_index bigint,
                x bigint,
                y bigint,
                hp double precision,
                max_hp double precision,
                alive boolean,
                respawn_left bigint,
                respawn_ticks bigint,
                aggro_target_player_id varchar(100),
                state_payload jsonb
              )
            )
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
            SELECT
              monster_runtime_id,
              $1,
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
              NULLIF(aggro_target_player_id, ''),
              state_payload,
              now()
            FROM incoming
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
            normalizedInstanceId,
            JSON.stringify(normalizedUpserts.map((entry) => ({
              monster_runtime_id: entry.monsterRuntimeId,
              monster_id: entry.monsterId,
              monster_name: entry.monsterName,
              monster_tier: entry.monsterTier,
              monster_level: entry.monsterLevel,
              tile_index: entry.tileIndex,
              x: entry.x,
              y: entry.y,
              hp: entry.hp,
              max_hp: entry.maxHp,
              alive: entry.alive,
              respawn_left: entry.respawnLeft,
              respawn_ticks: entry.respawnTicks,
              aggro_target_player_id: entry.aggroTargetPlayerId || null,
              state_payload: entry.statePayload ?? {},
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

  /** 清除指定实例的全部持久化状态（所有分域表） */
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
        `DELETE FROM ${INSTANCE_TEMPORARY_TILE_STATE_TABLE} WHERE instance_id = $1`,
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

  /** 加载指定实例的全部覆盖层分块 */
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
        tile_index bigint NOT NULL,
        value double precision NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (instance_id, resource_key, tile_index)
      )
    `);
    await ensureBigintColumns(client, INSTANCE_TILE_RESOURCE_STATE_TABLE);
    await ensureDoubleColumns(client, INSTANCE_TILE_RESOURCE_STATE_TABLE);
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
        x bigint NOT NULL,
        y bigint NOT NULL,
        tile_type varchar(64) NOT NULL,
        terrain_type varchar(64),
        surface_type varchar(64),
        structure_type varchar(64),
        interactable_kinds text[] NOT NULL DEFAULT '{}',
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (instance_id, x, y)
      )
    `);
    await client.query(`ALTER TABLE ${INSTANCE_TILE_CELL_TABLE} ADD COLUMN IF NOT EXISTS terrain_type varchar(64)`);
    await client.query(`ALTER TABLE ${INSTANCE_TILE_CELL_TABLE} ADD COLUMN IF NOT EXISTS surface_type varchar(64)`);
    await client.query(`ALTER TABLE ${INSTANCE_TILE_CELL_TABLE} ADD COLUMN IF NOT EXISTS structure_type varchar(64)`);
    await client.query(`ALTER TABLE ${INSTANCE_TILE_CELL_TABLE} ADD COLUMN IF NOT EXISTS interactable_kinds text[] NOT NULL DEFAULT '{}'`);
    await ensureBigintColumns(client, INSTANCE_TILE_CELL_TABLE);
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
        tile_index bigint NOT NULL,
        x bigint,
        y bigint,
        hp double precision NOT NULL DEFAULT 0,
        max_hp double precision NOT NULL DEFAULT 1,
        destroyed boolean NOT NULL DEFAULT false,
        respawn_left_ticks bigint NOT NULL DEFAULT 0,
        modified_at_ms bigint NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (instance_id, tile_index)
      )
    `);
    await client.query(`ALTER TABLE ${INSTANCE_TILE_DAMAGE_STATE_TABLE} ADD COLUMN IF NOT EXISTS x bigint`);
    await client.query(`ALTER TABLE ${INSTANCE_TILE_DAMAGE_STATE_TABLE} ADD COLUMN IF NOT EXISTS y bigint`);
    await ensureBigintColumns(client, INSTANCE_TILE_DAMAGE_STATE_TABLE);
    await ensureDoubleColumns(client, INSTANCE_TILE_DAMAGE_STATE_TABLE);
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

async function ensureInstanceTemporaryTileStateTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_lock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_TEMPORARY_TILE_STATE_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INSTANCE_TEMPORARY_TILE_STATE_TABLE} (
        instance_id varchar(100) NOT NULL,
        tile_index bigint NOT NULL,
        x bigint,
        y bigint,
        tile_type varchar(64) NOT NULL DEFAULT 'stone',
        hp double precision NOT NULL DEFAULT 1,
        max_hp double precision NOT NULL DEFAULT 1,
        expires_at_tick bigint NOT NULL DEFAULT 1,
        owner_player_id varchar(100),
        source_skill_id varchar(160),
        created_at_ms bigint NOT NULL DEFAULT 0,
        modified_at_ms bigint NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (instance_id, tile_index)
      )
    `);
    await ensureBigintColumns(client, INSTANCE_TEMPORARY_TILE_STATE_TABLE);
    await ensureDoubleColumns(client, INSTANCE_TEMPORARY_TILE_STATE_TABLE);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_temporary_tile_state_instance_idx
      ON ${INSTANCE_TEMPORARY_TILE_STATE_TABLE}(instance_id, tile_index)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_TEMPORARY_TILE_STATE_LOCK_KEY]).catch(() => undefined);
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
        tile_index bigint NOT NULL,
        item_instance_payload jsonb NOT NULL,
        expire_at timestamptz NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await ensureBigintColumns(client, INSTANCE_GROUND_ITEM_TABLE);
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
        entry_index bigint NOT NULL,
        item_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_tick bigint NULL,
        visible boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (instance_id, container_id, entry_index)
      )
    `);
    await ensureBigintColumns(client, INSTANCE_CONTAINER_ENTRY_TABLE);
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
        monster_level bigint NULL,
        tile_index bigint NOT NULL,
        x bigint NOT NULL,
        y bigint NOT NULL,
        hp double precision NOT NULL DEFAULT 0,
        max_hp double precision NOT NULL DEFAULT 0,
        alive boolean NOT NULL DEFAULT true,
        respawn_left bigint NULL,
        respawn_ticks bigint NULL,
        aggro_target_player_id varchar(100) NULL,
        state_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await ensureBigintColumns(client, INSTANCE_MONSTER_RUNTIME_STATE_TABLE);
    await ensureDoubleColumns(client, INSTANCE_MONSTER_RUNTIME_STATE_TABLE);
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

async function ensureInstanceBuildingStateTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_lock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_BUILDING_STATE_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INSTANCE_BUILDING_STATE_TABLE} (
        instance_id varchar(100) NOT NULL,
        building_id varchar(160) NOT NULL,
        def_id varchar(120) NOT NULL,
        x bigint NOT NULL,
        y bigint NOT NULL,
        rotation int NOT NULL DEFAULT 0,
        owner_player_id varchar(100) NULL,
        owner_sect_id varchar(100) NULL,
        room_id varchar(160) NULL,
        hp double precision NOT NULL DEFAULT 1,
        max_hp double precision NOT NULL DEFAULT 1,
        state varchar(40) NOT NULL DEFAULT 'active',
        created_at_tick bigint NOT NULL DEFAULT 0,
        updated_at_tick bigint NOT NULL DEFAULT 0,
        revision bigint NOT NULL DEFAULT 1,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (instance_id, building_id)
      )
    `);
    await ensureBigintColumns(client, INSTANCE_BUILDING_STATE_TABLE);
    await ensureDoubleColumns(client, INSTANCE_BUILDING_STATE_TABLE);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_building_state_instance_room_idx
      ON ${INSTANCE_BUILDING_STATE_TABLE}(instance_id, room_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_building_state_instance_def_idx
      ON ${INSTANCE_BUILDING_STATE_TABLE}(instance_id, def_id)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_BUILDING_STATE_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

async function ensureInstanceBuildingCellTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_lock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_BUILDING_CELL_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INSTANCE_BUILDING_CELL_TABLE} (
        instance_id varchar(100) NOT NULL,
        building_id varchar(160) NOT NULL,
        tile_index bigint NOT NULL,
        x bigint NOT NULL,
        y bigint NOT NULL,
        tile_type varchar(80) NOT NULL DEFAULT 'floor',
        previous_tile_type varchar(80) NULL,
        previous_terrain_type varchar(80) NULL,
        previous_surface_type varchar(80) NULL,
        previous_structure_type varchar(80) NULL,
        previous_interactable_kinds text[] NOT NULL DEFAULT '{}',
        blocks_move boolean NOT NULL DEFAULT false,
        blocks_sight boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (instance_id, tile_index)
      )
    `);
    await client.query(`
      ALTER TABLE ${INSTANCE_BUILDING_CELL_TABLE}
      ADD COLUMN IF NOT EXISTS previous_tile_type varchar(80) NULL
    `);
    await client.query(`
      ALTER TABLE ${INSTANCE_BUILDING_CELL_TABLE}
      ADD COLUMN IF NOT EXISTS previous_terrain_type varchar(80) NULL
    `);
    await client.query(`
      ALTER TABLE ${INSTANCE_BUILDING_CELL_TABLE}
      ADD COLUMN IF NOT EXISTS previous_surface_type varchar(80) NULL
    `);
    await client.query(`
      ALTER TABLE ${INSTANCE_BUILDING_CELL_TABLE}
      ADD COLUMN IF NOT EXISTS previous_structure_type varchar(80) NULL
    `);
    await client.query(`
      ALTER TABLE ${INSTANCE_BUILDING_CELL_TABLE}
      ADD COLUMN IF NOT EXISTS previous_interactable_kinds text[] NOT NULL DEFAULT '{}'
    `);
    await client.query(`
      ALTER TABLE ${INSTANCE_BUILDING_CELL_TABLE}
      ADD COLUMN IF NOT EXISTS blocks_move boolean NOT NULL DEFAULT false
    `);
    await client.query(`
      ALTER TABLE ${INSTANCE_BUILDING_CELL_TABLE}
      ADD COLUMN IF NOT EXISTS blocks_sight boolean NOT NULL DEFAULT false
    `);
    await ensureBigintColumns(client, INSTANCE_BUILDING_CELL_TABLE);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_building_cell_building_idx
      ON ${INSTANCE_BUILDING_CELL_TABLE}(instance_id, building_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_building_cell_xy_idx
      ON ${INSTANCE_BUILDING_CELL_TABLE}(instance_id, x, y)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_BUILDING_CELL_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

async function ensureInstanceRoomStateTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_lock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_ROOM_STATE_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INSTANCE_ROOM_STATE_TABLE} (
        instance_id varchar(100) NOT NULL,
        room_id varchar(160) NOT NULL,
        role varchar(60) NOT NULL DEFAULT 'generic',
        enclosed boolean NOT NULL DEFAULT false,
        semi_outdoor boolean NOT NULL DEFAULT false,
        min_x bigint NOT NULL DEFAULT 0,
        min_y bigint NOT NULL DEFAULT 0,
        max_x bigint NOT NULL DEFAULT 0,
        max_y bigint NOT NULL DEFAULT 0,
        area bigint NOT NULL DEFAULT 0,
        perimeter bigint NOT NULL DEFAULT 0,
        door_count bigint NOT NULL DEFAULT 0,
        window_count bigint NOT NULL DEFAULT 0,
        roof_coverage_ratio int NOT NULL DEFAULT 0,
        room_hash varchar(120) NOT NULL DEFAULT '',
        revision bigint NOT NULL DEFAULT 1,
        updated_at_tick bigint NOT NULL DEFAULT 0,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (instance_id, room_id)
      )
    `);
    await ensureBigintColumns(client, INSTANCE_ROOM_STATE_TABLE);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_room_state_instance_role_idx
      ON ${INSTANCE_ROOM_STATE_TABLE}(instance_id, role)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_room_state_instance_hash_idx
      ON ${INSTANCE_ROOM_STATE_TABLE}(instance_id, room_hash)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_ROOM_STATE_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

async function ensureInstanceRoomCellTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_lock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_ROOM_CELL_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INSTANCE_ROOM_CELL_TABLE} (
        instance_id varchar(100) NOT NULL,
        room_id varchar(160) NOT NULL,
        tile_index bigint NOT NULL,
        x bigint NOT NULL,
        y bigint NOT NULL,
        edge_flags bigint NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (instance_id, tile_index)
      )
    `);
    await ensureBigintColumns(client, INSTANCE_ROOM_CELL_TABLE);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_room_cell_room_idx
      ON ${INSTANCE_ROOM_CELL_TABLE}(instance_id, room_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_room_cell_xy_idx
      ON ${INSTANCE_ROOM_CELL_TABLE}(instance_id, x, y)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_ROOM_CELL_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

async function ensureInstanceFengShuiStateTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_lock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_FENGSHUI_STATE_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INSTANCE_FENGSHUI_STATE_TABLE} (
        instance_id varchar(100) NOT NULL,
        room_id varchar(160) NOT NULL,
        score bigint NOT NULL DEFAULT 0,
        grade varchar(40) NOT NULL DEFAULT 'plain',
        primary_element varchar(20) NOT NULL DEFAULT 'neutral',
        function_element varchar(20) NOT NULL DEFAULT 'neutral',
        shape_score bigint NOT NULL DEFAULT 0,
        enclosure_score bigint NOT NULL DEFAULT 0,
        qi_score double precision NOT NULL DEFAULT 0,
        sha_score bigint NOT NULL DEFAULT 0,
        comfort_score bigint NOT NULL DEFAULT 0,
        integrity_score bigint NOT NULL DEFAULT 0,
        element_score bigint NOT NULL DEFAULT 0,
        formation_score bigint NOT NULL DEFAULT 0,
        detail_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        revision bigint NOT NULL DEFAULT 1,
        updated_at_tick bigint NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (instance_id, room_id)
      )
    `);
    await ensureBigintColumns(client, INSTANCE_FENGSHUI_STATE_TABLE);
    await ensureDoubleColumns(client, INSTANCE_FENGSHUI_STATE_TABLE);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_fengshui_state_instance_grade_idx
      ON ${INSTANCE_FENGSHUI_STATE_TABLE}(instance_id, grade)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_fengshui_state_updated_idx
      ON ${INSTANCE_FENGSHUI_STATE_TABLE}(updated_at DESC)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_FENGSHUI_STATE_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

async function ensureInstanceBuildingAuditLogTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_lock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_BUILDING_AUDIT_LOG_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INSTANCE_BUILDING_AUDIT_LOG_TABLE} (
        id bigserial PRIMARY KEY,
        instance_id varchar(100) NOT NULL,
        operation_key varchar(220) NULL,
        request_id varchar(160) NULL,
        player_id varchar(100) NULL,
        action varchar(60) NOT NULL,
        building_id varchar(160) NULL,
        def_id varchar(120) NULL,
        ok boolean NOT NULL DEFAULT false,
        reason varchar(160) NULL,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at_tick bigint NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_building_audit_instance_idx
      ON ${INSTANCE_BUILDING_AUDIT_LOG_TABLE}(instance_id, created_at DESC, id DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_building_audit_operation_idx
      ON ${INSTANCE_BUILDING_AUDIT_LOG_TABLE}(operation_key)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_BUILDING_AUDIT_LOG_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

async function ensureInstanceBuildingOperationIdempotencyTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_lock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_BUILDING_OPERATION_IDEMPOTENCY_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INSTANCE_BUILDING_OPERATION_IDEMPOTENCY_TABLE} (
        operation_key varchar(220) NOT NULL PRIMARY KEY,
        instance_id varchar(100) NOT NULL,
        request_id varchar(160) NOT NULL,
        player_id varchar(100) NULL,
        action varchar(60) NOT NULL,
        result_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at_tick bigint NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_building_operation_instance_idx
      ON ${INSTANCE_BUILDING_OPERATION_IDEMPOTENCY_TABLE}(instance_id, request_id, action)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_building_operation_updated_idx
      ON ${INSTANCE_BUILDING_OPERATION_IDEMPOTENCY_TABLE}(updated_at DESC)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_BUILDING_OPERATION_IDEMPOTENCY_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

async function acquireInstanceDomainLock(client: any, instanceId: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [instanceId]);
}

async function ensureBigintColumns(client: any, tableName: keyof typeof INSTANCE_DOMAIN_BIGINT_COLUMNS_BY_TABLE): Promise<void> {
  for (const column of INSTANCE_DOMAIN_BIGINT_COLUMNS_BY_TABLE[tableName]) {
    await ensureBigintColumnType(client, tableName, column);
  }
}

async function ensureDoubleColumns(client: any, tableName: keyof typeof INSTANCE_DOMAIN_DOUBLE_COLUMNS_BY_TABLE): Promise<void> {
  for (const column of INSTANCE_DOMAIN_DOUBLE_COLUMNS_BY_TABLE[tableName]) {
    await ensureDoubleColumnType(client, tableName, column);
  }
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

function shouldReplaceContainerState(
  instanceId: string,
  containerId: string,
  currentSourceId: string,
  nextSourceId: string,
): boolean {
  const canonicalSourceId = buildCanonicalContainerSourceId(instanceId, containerId);
  if (nextSourceId === canonicalSourceId) {
    return true;
  }
  if (currentSourceId === canonicalSourceId) {
    return false;
  }
  return true;
}

function buildCanonicalContainerSourceId(instanceId: string, containerId: string): string {
  return `container:${instanceId}:${containerId}`;
}

function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = normalizeRequiredString(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim())
    : [];
}

function normalizeNullableInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.trunc(parsed);
}

function normalizeNullableNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeNumberWithFallback(value: unknown, fallback: unknown): number {
  return normalizeNullableNumber(value) ?? normalizeNullableNumber(fallback) ?? 0;
}

function normalizeBuildingPersistenceRow(value: unknown): Record<string, unknown> {
  const source = toRecord(value);
  const buildingId = normalizeRequiredString(source.id) || normalizeRequiredString(source.buildingId);
  const defId = normalizeRequiredString(source.defId) || normalizeRequiredString(source.def_id);
  const payload = buildPayload(source, [
    'id',
    'buildingId',
    'building_id',
    'defId',
    'def_id',
    'x',
    'y',
    'rotation',
    'ownerPlayerId',
    'owner_player_id',
    'ownerSectId',
    'owner_sect_id',
    'roomId',
    'room_id',
    'hp',
    'maxHp',
    'max_hp',
    'state',
    'createdAtTick',
    'created_at_tick',
    'updatedAtTick',
    'updated_at_tick',
    'revision',
    'payload',
  ]);
  return {
    building_id: buildingId,
    def_id: defId,
    x: normalizeIntegerWithFallback(source.x, 0),
    y: normalizeIntegerWithFallback(source.y, 0),
    rotation: normalizeRotation(source.rotation),
    owner_player_id: normalizeRequiredString(source.ownerPlayerId) || normalizeRequiredString(source.owner_player_id) || null,
    owner_sect_id: normalizeRequiredString(source.ownerSectId) || normalizeRequiredString(source.owner_sect_id) || null,
    room_id: normalizeRequiredString(source.roomId) || normalizeRequiredString(source.room_id) || null,
    hp: Math.max(0, normalizeNumberWithFallback(source.hp, 0)),
    max_hp: Math.max(1, normalizeNumberWithFallback(source.maxHp ?? source.max_hp, 1)),
    state: normalizeRequiredString(source.state) || 'active',
    created_at_tick: Math.max(0, normalizeIntegerWithFallback(source.createdAtTick ?? source.created_at_tick, 0)),
    updated_at_tick: Math.max(0, normalizeIntegerWithFallback(source.updatedAtTick ?? source.updated_at_tick, 0)),
    revision: Math.max(1, normalizeIntegerWithFallback(source.revision, 1)),
    payload,
  };
}

function normalizeBuildingCellPersistenceRows(value: unknown): Record<string, unknown>[] {
  const source = toRecord(value);
  const buildingId = normalizeRequiredString(source.id) || normalizeRequiredString(source.buildingId) || normalizeRequiredString(source.building_id);
  if (!buildingId || !Array.isArray(source.cells)) {
    return [];
  }
  const rows: Record<string, unknown>[] = [];
  for (const cell of source.cells) {
    const cellSource = toRecord(cell);
    const tileIndex = normalizeNullableInteger(cellSource.tileIndex ?? cellSource.tile_index);
    const x = normalizeNullableInteger(cellSource.x);
    const y = normalizeNullableInteger(cellSource.y);
    if (tileIndex === null || x === null || y === null || tileIndex < 0) {
      continue;
    }
    rows.push({
      building_id: buildingId,
      tile_index: tileIndex,
      x,
      y,
      tile_type: normalizeRequiredString(cellSource.tileType) || normalizeRequiredString(cellSource.tile_type) || 'floor',
      previous_tile_type: normalizeRequiredString(cellSource.previousTileType) || normalizeRequiredString(cellSource.previous_tile_type) || null,
      previous_terrain_type: normalizeRequiredString(cellSource.previousTerrainType) || normalizeRequiredString(cellSource.previous_terrain_type) || null,
      previous_surface_type: normalizeRequiredString(cellSource.previousSurfaceType) || normalizeRequiredString(cellSource.previous_surface_type) || null,
      previous_structure_type: normalizeRequiredString(cellSource.previousStructureType) || normalizeRequiredString(cellSource.previous_structure_type) || null,
      previous_interactable_kinds: normalizeStringArray(cellSource.previousInteractableKinds ?? cellSource.previous_interactable_kinds),
      blocks_move: cellSource.blocksMove === true || cellSource.blocks_move === true,
      blocks_sight: cellSource.blocksSight === true || cellSource.blocks_sight === true,
    });
  }
  return rows;
}

function normalizeRoomPersistenceRow(value: unknown): Record<string, unknown> {
  const source = toRecord(value);
  const roomId = normalizeRequiredString(source.id) || normalizeRequiredString(source.roomId) || normalizeRequiredString(source.room_id);
  const payload = buildPayload(source, [
    'id',
    'roomId',
    'room_id',
    'role',
    'enclosed',
    'semiOutdoor',
    'semi_outdoor',
    'minX',
    'min_x',
    'minY',
    'min_y',
    'maxX',
    'max_x',
    'maxY',
    'max_y',
    'area',
    'perimeter',
    'doorCount',
    'door_count',
    'windowCount',
    'window_count',
    'roofCoverageRatio',
    'roof_coverage_ratio',
    'roomHash',
    'room_hash',
    'revision',
    'updatedAtTick',
    'updated_at_tick',
    'payload',
  ]);
  const revision = normalizeIntegerWithFallback(source.revision ?? source.topologyRevision, 1);
  return {
    room_id: roomId,
    role: normalizeRequiredString(source.role) || 'generic',
    enclosed: source.enclosed === true,
    semi_outdoor: source.semiOutdoor === true || source.semi_outdoor === true,
    min_x: normalizeIntegerWithFallback(source.minX ?? source.min_x, 0),
    min_y: normalizeIntegerWithFallback(source.minY ?? source.min_y, 0),
    max_x: normalizeIntegerWithFallback(source.maxX ?? source.max_x, 0),
    max_y: normalizeIntegerWithFallback(source.maxY ?? source.max_y, 0),
    area: Math.max(0, normalizeIntegerWithFallback(source.area, 0)),
    perimeter: Math.max(0, normalizeIntegerWithFallback(source.perimeter, 0)),
    door_count: Math.max(0, normalizeIntegerWithFallback(source.doorCount ?? source.door_count, 0)),
    window_count: Math.max(0, normalizeIntegerWithFallback(source.windowCount ?? source.window_count, 0)),
    roof_coverage_ratio: clampInteger(source.roofCoverageRatio ?? source.roof_coverage_ratio, 0, 100, 0),
    room_hash: normalizeRequiredString(source.roomHash) || normalizeRequiredString(source.room_hash) || roomId,
    revision: Math.max(1, revision),
    updated_at_tick: Math.max(0, normalizeIntegerWithFallback(source.updatedAtTick ?? source.updated_at_tick, 0)),
    payload,
  };
}

function normalizeRoomCellPersistenceRow(value: unknown): Record<string, unknown> {
  const source = toRecord(value);
  const roomId = normalizeRequiredString(source.roomId) || normalizeRequiredString(source.room_id);
  return {
    room_id: roomId,
    tile_index: Math.max(0, normalizeIntegerWithFallback(source.tileIndex ?? source.tile_index, 0)),
    x: normalizeIntegerWithFallback(source.x, 0),
    y: normalizeIntegerWithFallback(source.y, 0),
    edge_flags: Math.max(0, normalizeIntegerWithFallback(source.edgeFlags ?? source.edge_flags, 0)),
  };
}

function normalizeFengShuiPersistenceRow(value: unknown): Record<string, unknown> {
  const source = toRecord(value);
  const roomId = normalizeRequiredString(source.roomId) || normalizeRequiredString(source.room_id);
  const payload = buildPayload(source, [
    'instanceId',
    'instance_id',
    'roomId',
    'room_id',
    'score',
    'grade',
    'primaryElement',
    'primary_element',
    'functionElement',
    'function_element',
    'shapeScore',
    'shape_score',
    'enclosureScore',
    'enclosure_score',
    'qiScore',
    'qi_score',
    'shaScore',
    'sha_score',
    'comfortScore',
    'comfort_score',
    'integrityScore',
    'integrity_score',
    'elementScore',
    'element_score',
    'formationScore',
    'formation_score',
    'revision',
    'updatedAtTick',
    'updated_at_tick',
    'detail_json',
  ]);
  if (Array.isArray(source.reasons)) {
    payload.reasons = source.reasons;
  }
  return {
    room_id: roomId,
    score: clampInteger(source.score, 0, 1000, 0),
    grade: normalizeRequiredString(source.grade) || 'plain',
    primary_element: normalizeRequiredString(source.primaryElement) || normalizeRequiredString(source.primary_element) || 'neutral',
    function_element: normalizeRequiredString(source.functionElement) || normalizeRequiredString(source.function_element) || 'neutral',
    shape_score: normalizeIntegerWithFallback(source.shapeScore ?? source.shape_score, 0),
    enclosure_score: normalizeIntegerWithFallback(source.enclosureScore ?? source.enclosure_score, 0),
    qi_score: normalizeNumberWithFallback(source.qiScore ?? source.qi_score, 0),
    sha_score: normalizeIntegerWithFallback(source.shaScore ?? source.sha_score, 0),
    comfort_score: normalizeIntegerWithFallback(source.comfortScore ?? source.comfort_score, 0),
    integrity_score: normalizeIntegerWithFallback(source.integrityScore ?? source.integrity_score, 0),
    element_score: normalizeIntegerWithFallback(source.elementScore ?? source.element_score, 0),
    formation_score: normalizeIntegerWithFallback(source.formationScore ?? source.formation_score, 0),
    revision: Math.max(1, normalizeIntegerWithFallback(source.revision, 1)),
    updated_at_tick: Math.max(0, normalizeIntegerWithFallback(source.updatedAtTick ?? source.updated_at_tick, 0)),
    detail_json: payload,
  };
}

function projectBuildingPersistenceRow(row: Record<string, unknown>): Record<string, unknown> {
  const payload = toRecord(row.payload);
  return {
    ...payload,
    id: normalizeRequiredString(row.building_id),
    defId: normalizeRequiredString(row.def_id),
    x: normalizeIntegerWithFallback(row.x, 0),
    y: normalizeIntegerWithFallback(row.y, 0),
    rotation: normalizeRotation(row.rotation),
    ownerPlayerId: normalizeRequiredString(row.owner_player_id) || null,
    ownerSectId: normalizeRequiredString(row.owner_sect_id) || null,
    roomId: normalizeRequiredString(row.room_id) || null,
    hp: Math.max(0, normalizeNumberWithFallback(row.hp, 0)),
    maxHp: Math.max(1, normalizeNumberWithFallback(row.max_hp, 1)),
    state: normalizeRequiredString(row.state) || 'active',
    createdAtTick: Math.max(0, normalizeIntegerWithFallback(row.created_at_tick, 0)),
    updatedAtTick: Math.max(0, normalizeIntegerWithFallback(row.updated_at_tick, 0)),
    revision: Math.max(1, normalizeIntegerWithFallback(row.revision, 1)),
  };
}

function projectBuildingCellPersistenceRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    buildingId: normalizeRequiredString(row.building_id),
    tileIndex: Math.max(0, normalizeIntegerWithFallback(row.tile_index, 0)),
    x: normalizeIntegerWithFallback(row.x, 0),
    y: normalizeIntegerWithFallback(row.y, 0),
    tileType: normalizeRequiredString(row.tile_type) || 'floor',
    previousTileType: normalizeRequiredString(row.previous_tile_type) || null,
    previousTerrainType: normalizeRequiredString(row.previous_terrain_type) || null,
    previousSurfaceType: normalizeRequiredString(row.previous_surface_type) || null,
    previousStructureType: normalizeRequiredString(row.previous_structure_type) || null,
    previousInteractableKinds: normalizeStringArray(row.previous_interactable_kinds),
    blocksMove: row.blocks_move === true,
    blocksSight: row.blocks_sight === true,
  };
}

function projectRoomPersistenceRow(row: Record<string, unknown>): Record<string, unknown> {
  const payload = toRecord(row.payload);
  return {
    ...payload,
    id: normalizeRequiredString(row.room_id),
    role: normalizeRequiredString(row.role) || 'generic',
    enclosed: row.enclosed === true,
    semiOutdoor: row.semi_outdoor === true,
    minX: normalizeIntegerWithFallback(row.min_x, 0),
    minY: normalizeIntegerWithFallback(row.min_y, 0),
    maxX: normalizeIntegerWithFallback(row.max_x, 0),
    maxY: normalizeIntegerWithFallback(row.max_y, 0),
    area: Math.max(0, normalizeIntegerWithFallback(row.area, 0)),
    perimeter: Math.max(0, normalizeIntegerWithFallback(row.perimeter, 0)),
    doorCount: Math.max(0, normalizeIntegerWithFallback(row.door_count, 0)),
    windowCount: Math.max(0, normalizeIntegerWithFallback(row.window_count, 0)),
    roofCoverageRatio: clampInteger(row.roof_coverage_ratio, 0, 100, 0),
    roomHash: normalizeRequiredString(row.room_hash),
    revision: Math.max(1, normalizeIntegerWithFallback(row.revision, 1)),
    updatedAtTick: Math.max(0, normalizeIntegerWithFallback(row.updated_at_tick, 0)),
  };
}

function projectRoomCellPersistenceRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    roomId: normalizeRequiredString(row.room_id),
    tileIndex: Math.max(0, normalizeIntegerWithFallback(row.tile_index, 0)),
    x: normalizeIntegerWithFallback(row.x, 0),
    y: normalizeIntegerWithFallback(row.y, 0),
    edgeFlags: Math.max(0, normalizeIntegerWithFallback(row.edge_flags, 0)),
  };
}

function projectFengShuiPersistenceRow(row: Record<string, unknown>): Record<string, unknown> {
  const detail = toRecord(row.detail_json);
  return {
    ...detail,
    roomId: normalizeRequiredString(row.room_id),
    score: clampInteger(row.score, 0, 1000, 0),
    grade: normalizeRequiredString(row.grade) || 'plain',
    primaryElement: normalizeRequiredString(row.primary_element) || 'neutral',
    functionElement: normalizeRequiredString(row.function_element) || 'neutral',
    shapeScore: normalizeIntegerWithFallback(row.shape_score, 0),
    enclosureScore: normalizeIntegerWithFallback(row.enclosure_score, 0),
    qiScore: normalizeNumberWithFallback(row.qi_score, 0),
    shaScore: normalizeIntegerWithFallback(row.sha_score, 0),
    comfortScore: normalizeIntegerWithFallback(row.comfort_score, 0),
    integrityScore: normalizeIntegerWithFallback(row.integrity_score, 0),
    elementScore: normalizeIntegerWithFallback(row.element_score, 0),
    formationScore: normalizeIntegerWithFallback(row.formation_score, 0),
    revision: Math.max(1, normalizeIntegerWithFallback(row.revision, 1)),
    updatedAtTick: Math.max(0, normalizeIntegerWithFallback(row.updated_at_tick, 0)),
  };
}

function buildPayload(source: Record<string, unknown>, excludedKeys: readonly string[]): Record<string, unknown> {
  const base = toRecord(source.payload);
  const excluded = new Set(excludedKeys);
  for (const [key, value] of Object.entries(source)) {
    if (!excluded.has(key)) {
      base[key] = value;
    }
  }
  return base;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function normalizeIntegerWithFallback(value: unknown, fallback: number): number {
  const parsed = normalizeNullableInteger(value);
  return parsed === null ? fallback : parsed;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = normalizeNullableInteger(value);
  if (parsed === null) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function normalizeRotation(value: unknown): 0 | 90 | 180 | 270 {
  const normalized = ((normalizeIntegerWithFallback(value, 0) % 360) + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized;
  }
  return 0;
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
