/**
 * instance-domain-persistence.helpers.ts
 *
 * 从 instance-domain-persistence.service.ts 拆出的模块级常量与游离函数。
 * 包含：表名/锁命名空间常量、DDL 建表函数、行规范化/投影/payload 构建 helper。
 * 不包含 @Injectable provider，不修改持久化语义。
 */
import { Pool } from 'pg';

import { ensureBigintColumnType, ensureDoubleColumnType } from './schema-bigint-migration';

// ── 表名常量 ──
export const INSTANCE_TILE_RESOURCE_STATE_TABLE = 'instance_tile_resource_state';
export const INSTANCE_TILE_CELL_TABLE = 'instance_tile_cell';
export const INSTANCE_TILE_DAMAGE_STATE_TABLE = 'instance_tile_damage_state';
export const INSTANCE_TEMPORARY_TILE_STATE_TABLE = 'instance_temporary_tile_state';
export const INSTANCE_CHECKPOINT_TABLE = 'instance_checkpoint';
export const INSTANCE_RECOVERY_WATERMARK_TABLE = 'instance_recovery_watermark';
export const INSTANCE_GROUND_ITEM_TABLE = 'instance_ground_item';
export const INSTANCE_CONTAINER_STATE_TABLE = 'instance_container_state';
export const INSTANCE_CONTAINER_ENTRY_TABLE = 'instance_container_entry';
export const INSTANCE_CONTAINER_TIMER_TABLE = 'instance_container_timer';
export const INSTANCE_MONSTER_RUNTIME_STATE_TABLE = 'instance_monster_runtime_state';
export const INSTANCE_EVENT_STATE_TABLE = 'instance_event_state';
export const INSTANCE_OVERLAY_CHUNK_TABLE = 'instance_overlay_chunk';
export const INSTANCE_BUILDING_STATE_TABLE = 'instance_building_state';
export const INSTANCE_BUILDING_CELL_TABLE = 'instance_building_cell';
export const INSTANCE_ROOM_STATE_TABLE = 'instance_room_state';
export const INSTANCE_ROOM_CELL_TABLE = 'instance_room_cell';
export const INSTANCE_FENGSHUI_STATE_TABLE = 'instance_fengshui_state';
export const INSTANCE_BUILDING_AUDIT_LOG_TABLE = 'instance_building_audit_log';
export const INSTANCE_BUILDING_OPERATION_IDEMPOTENCY_TABLE = 'instance_building_operation_idempotency';

// ── 锁命名空间与键 ──
export const INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE = 42871;
export const INSTANCE_TILE_RESOURCE_STATE_LOCK_KEY = 3001;
export const INSTANCE_TILE_CELL_LOCK_KEY = 3012;
export const INSTANCE_TILE_DAMAGE_STATE_LOCK_KEY = 3009;
export const INSTANCE_TEMPORARY_TILE_STATE_LOCK_KEY = 3013;
export const INSTANCE_CHECKPOINT_LOCK_KEY = 3002;
export const INSTANCE_RECOVERY_WATERMARK_LOCK_KEY = 3003;
export const INSTANCE_GROUND_ITEM_LOCK_KEY = 3004;
export const INSTANCE_CONTAINER_STATE_LOCK_KEY = 3005;
export const INSTANCE_CONTAINER_ENTRY_LOCK_KEY = 3010;
export const INSTANCE_CONTAINER_TIMER_LOCK_KEY = 3011;
export const INSTANCE_MONSTER_RUNTIME_STATE_LOCK_KEY = 3006;
export const INSTANCE_EVENT_STATE_LOCK_KEY = 3007;
export const INSTANCE_OVERLAY_CHUNK_LOCK_KEY = 3008;
export const INSTANCE_BUILDING_STATE_LOCK_KEY = 3014;
export const INSTANCE_ROOM_STATE_LOCK_KEY = 3015;
export const INSTANCE_FENGSHUI_STATE_LOCK_KEY = 3016;
export const INSTANCE_BUILDING_CELL_LOCK_KEY = 3017;
export const INSTANCE_ROOM_CELL_LOCK_KEY = 3018;
export const INSTANCE_BUILDING_AUDIT_LOG_LOCK_KEY = 3019;
export const INSTANCE_BUILDING_OPERATION_IDEMPOTENCY_LOCK_KEY = 3020;

// ── BigInt 列迁移映射 ──
export const INSTANCE_DOMAIN_BIGINT_COLUMNS_BY_TABLE = {
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

// ── Double 列迁移映射 ──
export const INSTANCE_DOMAIN_DOUBLE_COLUMNS_BY_TABLE = {
  [INSTANCE_TILE_RESOURCE_STATE_TABLE]: ['value'],
  [INSTANCE_TILE_DAMAGE_STATE_TABLE]: ['hp', 'max_hp'],
  [INSTANCE_TEMPORARY_TILE_STATE_TABLE]: ['hp', 'max_hp'],
  [INSTANCE_MONSTER_RUNTIME_STATE_TABLE]: ['hp', 'max_hp'],
  [INSTANCE_BUILDING_STATE_TABLE]: ['hp', 'max_hp'],
  [INSTANCE_FENGSHUI_STATE_TABLE]: ['qi_score'],
} as const;
export async function ensureInstanceTileResourceStateTable(pool: Pool): Promise<void> {
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

export async function ensureInstanceTileCellTable(pool: Pool): Promise<void> {
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

export async function ensureInstanceTileDamageStateTable(pool: Pool): Promise<void> {
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

export async function ensureInstanceTemporaryTileStateTable(pool: Pool): Promise<void> {
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
    await client.query(`ALTER TABLE ${INSTANCE_TEMPORARY_TILE_STATE_TABLE}
      ADD COLUMN IF NOT EXISTS source_item_id varchar(160),
      ADD COLUMN IF NOT EXISTS mineral_level integer`);
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

export async function ensureInstanceCheckpointTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_lock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_CHECKPOINT_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INSTANCE_CHECKPOINT_TABLE} (
        instance_id varchar(100) NOT NULL PRIMARY KEY,
        checkpoint_version bigint NOT NULL DEFAULT 0,
        checkpoint_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      ALTER TABLE ${INSTANCE_CHECKPOINT_TABLE}
      ADD COLUMN IF NOT EXISTS checkpoint_version bigint NOT NULL DEFAULT 0
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

export async function ensureInstanceRecoveryWatermarkTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_lock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_RECOVERY_WATERMARK_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INSTANCE_RECOVERY_WATERMARK_TABLE} (
        instance_id varchar(100) NOT NULL PRIMARY KEY,
        watermark_version bigint NOT NULL DEFAULT 0,
        watermark_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      ALTER TABLE ${INSTANCE_RECOVERY_WATERMARK_TABLE}
      ADD COLUMN IF NOT EXISTS watermark_version bigint NOT NULL DEFAULT 0
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

export async function ensureInstanceGroundItemTable(pool: Pool): Promise<void> {
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

export async function ensureInstanceContainerStateTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_lock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_CONTAINER_STATE_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INSTANCE_CONTAINER_STATE_TABLE} (
        instance_id varchar(100) NOT NULL,
        container_id varchar(100) NOT NULL,
        source_id varchar(220) NOT NULL,
        state_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (instance_id, container_id)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_container_state_instance_idx
      ON ${INSTANCE_CONTAINER_STATE_TABLE}(instance_id, container_id)
    `);
    // 来源 ID 由两个最长 100 字符的身份及分隔符构成，不能按单个身份长度截断。
    const sourceColumn = await client.query(`SELECT character_maximum_length FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1 AND column_name = 'source_id'`, [INSTANCE_CONTAINER_STATE_TABLE]);
    if (Number(sourceColumn.rows[0]?.character_maximum_length) < 220) {
      await client.query(`ALTER TABLE ${INSTANCE_CONTAINER_STATE_TABLE} ALTER COLUMN source_id TYPE varchar(220)`);
    }
    await client.query('COMMIT');
  } catch (error: unknown) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1, $2)`, [INSTANCE_TILE_RESOURCE_STATE_LOCK_NAMESPACE, INSTANCE_CONTAINER_STATE_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

export async function ensureInstanceContainerEntryTable(pool: Pool): Promise<void> {
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

export async function ensureInstanceContainerTimerTable(pool: Pool): Promise<void> {
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

export async function ensureInstanceMonsterRuntimeStateTable(pool: Pool): Promise<void> {
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

export async function ensureInstanceEventStateTable(pool: Pool): Promise<void> {
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

export async function ensureInstanceOverlayChunkTable(pool: Pool): Promise<void> {
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

export async function ensureInstanceBuildingStateTable(pool: Pool): Promise<void> {
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

export async function ensureInstanceBuildingCellTable(pool: Pool): Promise<void> {
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

export async function ensureInstanceRoomStateTable(pool: Pool): Promise<void> {
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

export async function ensureInstanceRoomCellTable(pool: Pool): Promise<void> {
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

export async function ensureInstanceFengShuiStateTable(pool: Pool): Promise<void> {
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

export async function ensureInstanceBuildingAuditLogTable(pool: Pool): Promise<void> {
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

export async function ensureInstanceBuildingOperationIdempotencyTable(pool: Pool): Promise<void> {
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

export async function acquireInstanceDomainLock(client: any, instanceId: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock($1::integer, hashtext($2))', [7102, instanceId]);
}

export async function ensureBigintColumns(client: any, tableName: keyof typeof INSTANCE_DOMAIN_BIGINT_COLUMNS_BY_TABLE): Promise<void> {
  for (const column of INSTANCE_DOMAIN_BIGINT_COLUMNS_BY_TABLE[tableName]) {
    await ensureBigintColumnType(client, tableName, column);
  }
}

export async function ensureDoubleColumns(client: any, tableName: keyof typeof INSTANCE_DOMAIN_DOUBLE_COLUMNS_BY_TABLE): Promise<void> {
  for (const column of INSTANCE_DOMAIN_DOUBLE_COLUMNS_BY_TABLE[tableName]) {
    await ensureDoubleColumnType(client, tableName, column);
  }
}

export async function rollbackQuietly(client: any): Promise<void> {
  await client.query('ROLLBACK').catch(() => undefined);
}

export function buildStableDomainRowId(prefix: string, instanceId: string, suffix: string): string {
  return `${prefix}:${hashString(`${instanceId}:${suffix}`)}:${suffix}`.slice(0, 100);
}

export function buildContainerMetadataPayload(state: Record<string, unknown> | null | undefined): Record<string, unknown> {
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

export function normalizePersistedItemPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  try {
    const serialized = JSON.stringify(value);
    if (!serialized || serialized === 'null') {
      return {};
    }
    const parsed = JSON.parse(serialized);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function normalizeDbTimestamp(value: unknown): string | null {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? value.toISOString() : null;
  }
  if (typeof value === 'string' && value.trim()) {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
  }
  return null;
}

export function resolvePersistedGroundExpireAt(itemPayload: unknown): string | null {
  if (!itemPayload || typeof itemPayload !== 'object') {
    return null;
  }
  const expiresAtMs = Number((itemPayload as { groundExpiresAtMs?: unknown }).groundExpiresAtMs);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= 0) {
    return null;
  }
  const date = new Date(Math.trunc(expiresAtMs));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function normalizeJsonObjectPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  try {
    const serialized = JSON.stringify(value);
    if (!serialized || serialized === 'null') {
      return {};
    }
    const parsed = JSON.parse(serialized);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function resolveInstanceCheckpointVersion(payload: unknown): number {
  const root = normalizeJsonObjectPayload(payload);
  const snapshot = normalizeJsonObjectPayload(root.snapshot);
  return normalizeMonotonicVersion(
    snapshot.persistenceRevision,
    root.persistenceRevision,
    snapshot.tick,
    root.tick,
    snapshot.savedAt,
    root.savedAt,
  );
}

export function resolveInstanceWatermarkVersion(payload: unknown): number {
  const root = normalizeJsonObjectPayload(payload);
  return normalizeMonotonicVersion(
    root.persistenceRevision,
    root.tick,
    root.flushedAt,
  );
}

export function normalizeMonotonicVersion(...values: unknown[]): number {
  for (const value of values) {
    const parsed = normalizeNullableInteger(value);
    if (parsed !== null && parsed >= 0) {
      return parsed;
    }
  }
  return 0;
}

export function shouldReplaceContainerState(
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

export function buildCanonicalContainerSourceId(instanceId: string, containerId: string): string {
  return `container:${instanceId}:${containerId}`;
}

export function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeOptionalString(value: unknown): string | null {
  const normalized = normalizeRequiredString(value);
  return normalized.length > 0 ? normalized : null;
}

export function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim())
    : [];
}

export function normalizeNullableInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.trunc(parsed);
}

export function normalizeNullableNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeNumberWithFallback(value: unknown, fallback: unknown): number {
  return normalizeNullableNumber(value) ?? normalizeNullableNumber(fallback) ?? 0;
}

export function dedupeRecordRowsByKey<T extends Record<string, unknown>>(rows: T[], keyOf: (row: T) => string): T[] {
  const byKey = new Map<string, T>();
  const keyOrder: string[] = [];
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) {
      continue;
    }
    if (!byKey.has(key)) {
      keyOrder.push(key);
    }
    byKey.set(key, row);
  }
  return keyOrder.map((key) => byKey.get(key)).filter((row): row is T => row !== undefined);
}

export function normalizeRecordIntegerKey(value: unknown): string {
  const parsed = normalizeNullableInteger(value);
  return parsed === null ? '' : String(parsed);
}

export function normalizeBuildingPersistenceRow(value: unknown): Record<string, unknown> {
  const source = toRecord(value);
  const buildingId = normalizeRequiredString(source.id) || normalizeRequiredString(source.buildingId);
  const defId = normalizeRequiredString(source.defId) || normalizeRequiredString(source.def_id);
  const payload = buildPayload(source, [
    'id',
    'buildingId',
    'building_id',
    'defId',
    'def_id',
    'defHandle',
    'def_handle',
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
  // 旧行可能从 payload 回读出漂移句柄；新快照必须主动清除，避免再次写回。
  delete payload.defHandle;
  delete payload.def_handle;
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

export function normalizeBuildingCellPersistenceRows(value: unknown): Record<string, unknown>[] {
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

export function normalizeRoomPersistenceRow(value: unknown): Record<string, unknown> {
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

export function normalizeRoomCellPersistenceRow(value: unknown): Record<string, unknown> {
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

export function normalizeFengShuiPersistenceRow(value: unknown): Record<string, unknown> {
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

export function projectBuildingPersistenceRow(row: Record<string, unknown>): Record<string, unknown> {
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

export function projectBuildingCellPersistenceRow(row: Record<string, unknown>): Record<string, unknown> {
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

export function projectRoomPersistenceRow(row: Record<string, unknown>): Record<string, unknown> {
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

export function projectRoomCellPersistenceRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    roomId: normalizeRequiredString(row.room_id),
    tileIndex: Math.max(0, normalizeIntegerWithFallback(row.tile_index, 0)),
    x: normalizeIntegerWithFallback(row.x, 0),
    y: normalizeIntegerWithFallback(row.y, 0),
    edgeFlags: Math.max(0, normalizeIntegerWithFallback(row.edge_flags, 0)),
  };
}

export function projectFengShuiPersistenceRow(row: Record<string, unknown>): Record<string, unknown> {
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

export function buildPayload(source: Record<string, unknown>, excludedKeys: readonly string[]): Record<string, unknown> {
  const base = toRecord(source.payload);
  const excluded = new Set(excludedKeys);
  for (const [key, value] of Object.entries(source)) {
    if (!excluded.has(key)) {
      base[key] = value;
    }
  }
  return base;
}

export function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export function normalizeIntegerWithFallback(value: unknown, fallback: number): number {
  const parsed = normalizeNullableInteger(value);
  return parsed === null ? fallback : parsed;
}

export function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = normalizeNullableInteger(value);
  if (parsed === null) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

export function normalizeRotation(value: unknown): 0 | 90 | 180 | 270 {
  const normalized = ((normalizeIntegerWithFallback(value, 0) % 360) + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized;
  }
  return 0;
}

export function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
