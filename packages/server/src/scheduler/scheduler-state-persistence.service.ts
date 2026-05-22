/**
 * 本文件属于服务端调度器模块，负责登记、控制和持久化后台任务的运行状态。
 *
 * 维护时要区分任务定义、运行开关和实际 worker 逻辑，避免多个节点重复执行同一职责。
 */
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import type { SchedulerSnapshot } from './scheduler.types';

const SCHEDULER_STATE_TABLE = 'scheduler_runtime_state';
const SCHEDULER_STATE_KEY = 'scheduler_snapshot';
const SCHEDULER_STATE_LOCK_NAMESPACE = 42874;

@Injectable()
export class SchedulerStatePersistenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerStatePersistenceService.name);
  private pool: Pool | null = null;
  private enabled = false;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(@Inject(DatabasePoolProvider) private readonly databasePoolProvider: DatabasePoolProvider | null = null) {}

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

  async loadSnapshot(): Promise<SchedulerSnapshot | null> {
    if (!this.pool || !this.enabled) return null;
    const result = await this.pool.query(`SELECT payload FROM ${SCHEDULER_STATE_TABLE} WHERE state_key = $1 LIMIT 1`, [SCHEDULER_STATE_KEY]);
    const payload = result.rows?.[0]?.payload;
    if (!payload || typeof payload !== 'object') return null;
    return payload as SchedulerSnapshot;
  }

  async saveSnapshot(snapshot: SchedulerSnapshot): Promise<void> {
    if (!this.pool || !this.enabled) return;
    await this.pool.query(
      `INSERT INTO ${SCHEDULER_STATE_TABLE} (state_key, payload, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (state_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
      [SCHEDULER_STATE_KEY, JSON.stringify(snapshot)],
    );
  }

  private async initialize(): Promise<void> {
    this.pool = this.databasePoolProvider?.getPool('scheduler-state') ?? null;
    if (!this.pool) {
      this.initialized = true;
      return;
    }
    try {
      await ensureSchedulerStateTable(this.pool);
      this.enabled = true;
      this.logger.log('Scheduler state persistence 已启用');
    } catch (error: unknown) {
      this.logger.warn(`Scheduler state persistence 初始化失败：${error instanceof Error ? error.message : String(error)}`);
      this.pool = null;
      this.enabled = false;
    }
    this.initialized = true;
  }
}

async function ensureSchedulerStateTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(${SCHEDULER_STATE_LOCK_NAMESPACE})`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEDULER_STATE_TABLE} (
        state_key varchar(120) PRIMARY KEY,
        payload jsonb NOT NULL,
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
