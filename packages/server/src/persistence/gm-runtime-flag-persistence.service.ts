import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

import { DatabasePoolProvider } from './database-pool.provider';

const GM_RUNTIME_FLAG_TABLE = 'server_gm_runtime_flag';
const GM_RUNTIME_FLAG_LOCK_NAMESPACE = 42873;

@Injectable()
export class GmRuntimeFlagPersistenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GmRuntimeFlagPersistenceService.name);
  private pool: Pool | null = null;
  private enabled = false;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private cache = new Map<string, boolean>();

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
    this.pool = this.databasePoolProvider?.getPool('gm-runtime-flag') ?? null;
    if (!this.pool) {
      this.initialized = true;
      return;
    }
    try {
      await ensureGmRuntimeFlagTable(this.pool);
      await this.loadAllFlags();
      this.enabled = true;
      this.logger.log('GM runtime flag 持久化已启用');
    } catch (error: unknown) {
      this.logger.warn(`GM runtime flag 初始化失败：${error instanceof Error ? error.message : String(error)}`);
    }
    this.initialized = true;
  }

  getFlag(key: string): boolean {
    return this.cache.get(key) ?? false;
  }

  async setFlag(key: string, value: boolean): Promise<void> {
    if (!this.pool || !this.enabled) return;
    const normalizedKey = key.trim();
    if (!normalizedKey) return;
    await this.pool.query(
      `INSERT INTO ${GM_RUNTIME_FLAG_TABLE} (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
      [normalizedKey, value],
    );
    this.cache.set(normalizedKey, value);
  }

  async deleteFlag(key: string): Promise<void> {
    if (!this.pool || !this.enabled) return;
    const normalizedKey = key.trim();
    if (!normalizedKey) return;
    await this.pool.query(`DELETE FROM ${GM_RUNTIME_FLAG_TABLE} WHERE key = $1`, [normalizedKey]);
    this.cache.delete(normalizedKey);
  }

  async listFlags(): Promise<Array<{ key: string; value: boolean }>> {
    if (!this.pool || !this.enabled) return [];
    const result = await this.pool.query(`SELECT key, value FROM ${GM_RUNTIME_FLAG_TABLE} ORDER BY key`);
    return Array.isArray(result.rows) ? result.rows as Array<{ key: string; value: boolean }> : [];
  }

  private async loadAllFlags(): Promise<void> {
    if (!this.pool) return;
    const result = await this.pool.query(`SELECT key, value FROM ${GM_RUNTIME_FLAG_TABLE}`);
    this.cache.clear();
    if (Array.isArray(result.rows)) {
      for (const row of result.rows as Array<{ key: string; value: boolean }>) {
        this.cache.set(row.key, row.value === true);
      }
    }
  }
}

async function ensureGmRuntimeFlagTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(${GM_RUNTIME_FLAG_LOCK_NAMESPACE})`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${GM_RUNTIME_FLAG_TABLE} (
        key varchar(120) PRIMARY KEY,
        value boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      INSERT INTO ${GM_RUNTIME_FLAG_TABLE} (key, value)
      VALUES ('combat_audit_enabled', false)
      ON CONFLICT (key) DO NOTHING
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export { GM_RUNTIME_FLAG_TABLE };
