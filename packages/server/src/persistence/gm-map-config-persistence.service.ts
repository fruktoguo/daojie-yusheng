import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';

import { DatabasePoolProvider } from './database-pool.provider';

export const GM_MAP_CONFIG_SCOPE = 'server_gm_map_config_v1';
export const GM_MAP_CONFIG_TABLE = 'server_gm_map_config';
const GM_MAP_CONFIG_LOCK_NAMESPACE = 42872;

export interface GmMapConfigPayload {
  speed?: number;
  paused?: boolean;
  scale?: number;
  offsetTicks?: number;
}

export interface GmMapConfigRecord extends GmMapConfigPayload {
  mapId: string;
}

@Injectable()
export class GmMapConfigPersistenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GmMapConfigPersistenceService.name);
  private pool: Pool | null = null;
  private enabled = false;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly databasePoolProvider: DatabasePoolProvider | null = null) {}

  async onModuleInit(): Promise<void> {
    await this.ensureInitialized();
  }

  async onModuleDestroy(): Promise<void> {
    this.pool = null;
    this.enabled = false;
    this.initialized = false;
    this.initPromise = null;
  }

  isEnabled(): boolean {
    return this.enabled && this.pool !== null;
  }

  async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    await this.initPromise;
  }

  private async initialize(): Promise<void> {
    this.pool = this.databasePoolProvider?.getPool('gm-map-config') ?? null;
    if (!this.pool) {
      this.logger.log('GM 地图配置持久化已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      this.initialized = true;
      return;
    }
    try {
      await ensureGmMapConfigTable(this.pool);
      this.enabled = true;
      this.initialized = true;
      this.logger.log('GM 地图配置持久化已启用（server_gm_map_config）');
    } catch (error: unknown) {
      this.logger.error(
        'GM 地图配置持久化初始化失败，已回退为禁用模式',
        error instanceof Error ? error.stack : String(error),
      );
      this.pool = null;
      this.enabled = false;
      this.initialized = true;
    }
  }

  /** 合并保存：事务内串行合并单张地图配置，避免 tick 与 time 并发更新互相覆盖。 */
  async mergeMapConfig(mapId: string, partial: GmMapConfigPayload): Promise<void> {
    await this.ensureInitialized();
    const normalizedMapId = normalizeMapId(mapId);
    if (!normalizedMapId || !this.pool || !this.enabled) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT pg_advisory_xact_lock($1::integer, hashtext($2)::integer)',
        [GM_MAP_CONFIG_LOCK_NAMESPACE, normalizedMapId],
      );
      const current = await this.loadMapConfigPayload(client, normalizedMapId);
      const cleaned = cleanPayload(mergePayload(current, partial));
      if (!cleaned) {
        await this.removeMapConfigWithClient(client, normalizedMapId);
      } else {
        await this.upsertMapConfig(client, normalizedMapId, cleaned);
      }
      await client.query('COMMIT');
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** 读取单张地图的原始 payload（仅持久化层内部与合并逻辑使用）。 */
  private async loadMapConfigPayload(client: Pool | PoolClient, mapId: string): Promise<GmMapConfigPayload> {
    const result = await client.query(
      `SELECT speed, paused, scale, offset_ticks FROM ${GM_MAP_CONFIG_TABLE} WHERE map_id = $1`,
      [mapId],
    );
    const row = result.rows?.[0] as Record<string, unknown> | undefined;
    return normalizePayload({
      speed: row?.speed,
      paused: row?.paused,
      scale: row?.scale,
      offsetTicks: row?.offset_ticks,
    });
  }

  /** 写入单张地图配置（upsert），不检查是否默认值。 */
  private async upsertMapConfig(client: Pool | PoolClient, mapId: string, payload: GmMapConfigPayload): Promise<void> {
    await client.query(
      `INSERT INTO ${GM_MAP_CONFIG_TABLE} (map_id, speed, paused, scale, offset_ticks, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (map_id)
       DO UPDATE SET
         speed = EXCLUDED.speed,
         paused = EXCLUDED.paused,
         scale = EXCLUDED.scale,
         offset_ticks = EXCLUDED.offset_ticks,
         updated_at = now()`,
      [
        mapId,
        normalizeOptionalNumber(payload.speed) ?? null,
        typeof payload.paused === 'boolean' ? payload.paused : null,
        normalizeOptionalNumber(payload.scale) ?? null,
        normalizeOptionalNumber(payload.offsetTicks) ?? null,
      ],
    );
  }

  /** 加载所有已持久化的地图 GM 配置。 */
  async loadAllMapConfigs(): Promise<GmMapConfigRecord[]> {
    await this.ensureInitialized();
    if (!this.pool || !this.enabled) return [];
    const result = await this.pool.query(
      `SELECT map_id, speed, paused, scale, offset_ticks FROM ${GM_MAP_CONFIG_TABLE} ORDER BY map_id ASC`,
    );
    return (result.rows ?? [])
      .map((row: Record<string, unknown>) => {
        const mapId = normalizeMapId(row?.map_id);
        return {
          mapId,
          ...normalizePayload({
            speed: row?.speed,
            paused: row?.paused,
            scale: row?.scale,
            offsetTicks: row?.offset_ticks,
          }),
        } satisfies GmMapConfigRecord;
      })
      .filter((r) => Boolean(r.mapId));
  }

  /** 删除单张地图的 GM 配置（用于清理已删除地图的脏数据）。 */
  async removeMapConfig(mapId: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.pool || !this.enabled) return;
    const normalizedMapId = normalizeMapId(mapId);
    if (!normalizedMapId) return;
    await this.removeMapConfigWithClient(this.pool, normalizedMapId);
  }

  private async removeMapConfigWithClient(client: Pool | PoolClient, mapId: string): Promise<void> {
    if (!mapId) return;
    await client.query(
      `DELETE FROM ${GM_MAP_CONFIG_TABLE} WHERE map_id = $1`,
      [mapId],
    );
  }

  /** 批量清理已不存在的地图配置。 */
  async pruneMapConfigs(validMapIds: Set<string>): Promise<void> {
    await this.ensureInitialized();
    if (!this.pool || !this.enabled) return;
    const normalizedValidMapIds = new Set(
      Array.from(validMapIds)
        .map((entry) => normalizeMapId(entry))
        .filter(Boolean),
    );
    const existing = await this.loadAllMapConfigs();
    for (const record of existing) {
      if (!normalizedValidMapIds.has(record.mapId)) {
        await this.removeMapConfig(record.mapId);
      }
    }
  }
}

async function ensureGmMapConfigTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1::integer, $2::integer)', [GM_MAP_CONFIG_LOCK_NAMESPACE, 0]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${GM_MAP_CONFIG_TABLE} (
        map_id varchar(120) PRIMARY KEY,
        speed double precision,
        paused boolean,
        scale double precision,
        offset_ticks bigint,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function mergePayload(current: GmMapConfigPayload, partial: GmMapConfigPayload): GmMapConfigPayload {
  const merged: GmMapConfigPayload = {};
  const speed = normalizeOptionalNumber(partial.speed) ?? normalizeOptionalNumber(current.speed);
  if (speed !== undefined) merged.speed = speed;
  const paused = partial.paused !== undefined ? partial.paused : current.paused;
  if (paused !== undefined) merged.paused = paused;
  const scale = normalizeOptionalNumber(partial.scale) ?? normalizeOptionalNumber(current.scale);
  if (scale !== undefined) merged.scale = scale;
  const offsetTicks = normalizeOptionalNumber(partial.offsetTicks) ?? normalizeOptionalNumber(current.offsetTicks);
  if (offsetTicks !== undefined) merged.offsetTicks = offsetTicks;
  return merged;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeMapId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePayload(payload: Record<string, unknown> | undefined): GmMapConfigPayload {
  if (!payload) return {};
  return {
    speed: normalizeOptionalNumber(payload.speed),
    paused: typeof payload.paused === 'boolean' ? payload.paused : undefined,
    scale: normalizeOptionalNumber(payload.scale),
    offsetTicks: normalizeOptionalNumber(payload.offsetTicks),
  };
}

/** 如果 payload 全是默认值则返回 null，否则返回去除了 undefined 字段的副本。 */
function cleanPayload(payload: GmMapConfigPayload): GmMapConfigPayload | null {
  const out: GmMapConfigPayload = {};
  if (Number.isFinite(payload.speed) && payload.speed !== 1) out.speed = payload.speed;
  if (payload.paused === true) out.paused = true;
  if (Number.isFinite(payload.scale) && payload.scale !== 1) out.scale = payload.scale;
  if (Number.isFinite(payload.offsetTicks) && payload.offsetTicks !== 0) out.offsetTicks = payload.offsetTicks;
  if (Object.keys(out).length === 0) return null;
  return out;
}
