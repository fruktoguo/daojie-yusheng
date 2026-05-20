/**
 * 游戏配置持久化服务。
 * 使用 server_gm_config 表存储重启生效的调参项，内存 Map 缓存供 GM API 查询。
 * 与 GmRuntimeFlagPersistenceService 并存：flag 管热生效布尔开关，config 管重启生效调参。
 */
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

import { DatabasePoolProvider } from './database-pool.provider';
import { listGameConfigDescriptors, type GameConfigDescriptor } from '../config/game-config-registry';

const GM_CONFIG_TABLE = 'server_gm_config';
const GM_CONFIG_LOCK_NAMESPACE = 42874;

export interface GameConfigEntry {
  key: string;
  value: string;
  updatedAt: string;
}

@Injectable()
export class GmConfigPersistenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GmConfigPersistenceService.name);
  private pool: Pool | null = null;
  private enabled = false;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private cache = new Map<string, GameConfigEntry>();

  constructor(@Inject(DatabasePoolProvider) private readonly databasePoolProvider: DatabasePoolProvider | null = null) {}

  async onModuleInit(): Promise<void> {
    await this.ensureInitialized();
  }

  async onModuleDestroy(): Promise<void> {
    this.pool = null;
    this.enabled = false;
    this.initialized = false;
    this.initPromise = null;
    this.cache.clear();
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
    this.pool = this.databasePoolProvider?.getPool('gm-config') ?? null;
    if (!this.pool) {
      this.initialized = true;
      return;
    }
    try {
      await ensureGmConfigTable(this.pool);
      await this.loadAll();
      this.enabled = true;
      this.logger.log('GM config 持久化已启用');
    } catch (error: unknown) {
      this.logger.warn(`GM config 初始化失败：${error instanceof Error ? error.message : String(error)}`);
    }
    this.initialized = true;
  }

  /** 获取单个配置值（从缓存）。 */
  getValue(key: string): string | null {
    return this.cache.get(key)?.value ?? null;
  }

  /** 获取所有已持久化的配置条目。 */
  listEntries(): GameConfigEntry[] {
    return [...this.cache.values()];
  }

  /** 设置配置值（写 DB + 刷新缓存）。 */
  async setValue(key: string, value: string): Promise<void> {
    if (!this.pool || !this.enabled) return;
    const normalizedKey = key.trim();
    if (!normalizedKey) return;
    await this.pool.query(
      `INSERT INTO ${GM_CONFIG_TABLE} (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
      [normalizedKey, value],
    );
    this.cache.set(normalizedKey, { key: normalizedKey, value, updatedAt: new Date().toISOString() });
  }

  /** 删除配置值（恢复为注册表默认值）。 */
  async deleteValue(key: string): Promise<void> {
    if (!this.pool || !this.enabled) return;
    const normalizedKey = key.trim();
    if (!normalizedKey) return;
    await this.pool.query(`DELETE FROM ${GM_CONFIG_TABLE} WHERE key = $1`, [normalizedKey]);
    this.cache.delete(normalizedKey);
  }

  /** 重新从数据库加载所有配置到缓存。 */
  async reload(): Promise<number> {
    await this.loadAll();
    return this.cache.size;
  }

  private async loadAll(): Promise<void> {
    if (!this.pool) return;
    const result = await this.pool.query(`SELECT key, value, updated_at FROM ${GM_CONFIG_TABLE}`);
    this.cache.clear();
    if (Array.isArray(result.rows)) {
      for (const row of result.rows as Array<{ key: string; value: string; updated_at: string }>) {
        this.cache.set(row.key, { key: row.key, value: row.value, updatedAt: row.updated_at });
      }
    }
  }
}

async function ensureGmConfigTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(${GM_CONFIG_LOCK_NAMESPACE})`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${GM_CONFIG_TABLE} (
        key varchar(120) PRIMARY KEY,
        value text NOT NULL DEFAULT '',
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

export { GM_CONFIG_TABLE };
