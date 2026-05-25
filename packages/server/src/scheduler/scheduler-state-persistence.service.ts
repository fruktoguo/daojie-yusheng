/**
 * 本文件属于服务端调度器模块，负责登记、控制和持久化后台任务的运行状态。
 *
 * 维护时要区分任务定义、运行开关和实际 worker 逻辑，避免多个节点重复执行同一职责。
 */
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { hostname } from 'node:os';
import { Pool } from 'pg';

import { resolveServerRuntimeRole, type ServerRuntimeRole } from '../config/runtime-role';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import type { SchedulerSnapshot } from './scheduler.types';

const SCHEDULER_STATE_TABLE = 'scheduler_runtime_state';
const SCHEDULER_STATE_KEY_PREFIX = 'scheduler_snapshot';
const SCHEDULER_STATE_LOCK_NAMESPACE = 42874;
const DEFAULT_CLUSTER_SNAPSHOT_MAX_AGE_MS = 5 * 60 * 1000;

export interface SchedulerPersistedSnapshotRecord {
  stateKey: string;
  nodeId: string;
  runtimeRole: ServerRuntimeRole | string;
  processId: number;
  updatedAt: string;
  snapshot: SchedulerSnapshot;
}

@Injectable()
export class SchedulerStatePersistenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerStatePersistenceService.name);
  private pool: Pool | null = null;
  private enabled = false;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private readonly identity = resolveSchedulerStateIdentity();

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
    const result = await this.pool.query(`SELECT payload FROM ${SCHEDULER_STATE_TABLE} WHERE state_key = $1 LIMIT 1`, [this.identity.stateKey]);
    const payload = result.rows?.[0]?.payload;
    if (!payload || typeof payload !== 'object') return null;
    return payload as SchedulerSnapshot;
  }

  async saveSnapshot(snapshot: SchedulerSnapshot): Promise<void> {
    if (!this.pool || !this.enabled) return;
    await this.pool.query(
      `INSERT INTO ${SCHEDULER_STATE_TABLE} (state_key, payload, updated_at, node_id, runtime_role, process_id)
       VALUES ($1, $2::jsonb, now(), $3, $4, $5)
       ON CONFLICT (state_key) DO UPDATE SET
         payload = EXCLUDED.payload,
         updated_at = now(),
         node_id = EXCLUDED.node_id,
         runtime_role = EXCLUDED.runtime_role,
         process_id = EXCLUDED.process_id`,
      [
        this.identity.stateKey,
        JSON.stringify(snapshot),
        this.identity.nodeId,
        this.identity.runtimeRole,
        this.identity.processId,
      ],
    );
  }

  async listRecentSnapshots(input?: { maxAgeMs?: number }): Promise<SchedulerPersistedSnapshotRecord[]> {
    if (!this.pool || !this.enabled) return [];
    const maxAgeMs = normalizePositiveInteger(input?.maxAgeMs, DEFAULT_CLUSTER_SNAPSHOT_MAX_AGE_MS, 1_000, 24 * 60 * 60 * 1000);
    const result = await this.pool.query(
      `
        SELECT state_key, payload, updated_at, node_id, runtime_role, process_id
        FROM ${SCHEDULER_STATE_TABLE}
        WHERE state_key LIKE $1
          AND updated_at >= now() - ($2::bigint * interval '1 millisecond')
        ORDER BY updated_at DESC, state_key ASC
      `,
      [`${SCHEDULER_STATE_KEY_PREFIX}:%`, maxAgeMs],
    );
    return (result.rows ?? [])
      .map((row): SchedulerPersistedSnapshotRecord | null => {
        const payload = row?.payload;
        if (!payload || typeof payload !== 'object') {
          return null;
        }
        const stateKey = normalizeString(row.state_key);
        if (!stateKey) {
          return null;
        }
        return {
          stateKey,
          nodeId: normalizeString(row.node_id) || 'unknown',
          runtimeRole: normalizeString(row.runtime_role) || 'unknown',
          processId: normalizePositiveInteger(row.process_id, 0, 0, Number.MAX_SAFE_INTEGER),
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date(0).toISOString(),
          snapshot: payload as SchedulerSnapshot,
        };
      })
      .filter((entry): entry is SchedulerPersistedSnapshotRecord => entry !== null);
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
      this.logger.log(`调度器状态持久化已启用：stateKey=${this.identity.stateKey} nodeId=${this.identity.nodeId} role=${this.identity.runtimeRole}`);
    } catch (error: unknown) {
      this.logger.warn(`调度器状态持久化初始化失败：${error instanceof Error ? error.message : String(error)}`);
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
        updated_at timestamptz NOT NULL DEFAULT now(),
        node_id varchar(120) NOT NULL DEFAULT 'legacy',
        runtime_role varchar(32) NOT NULL DEFAULT 'unknown',
        process_id bigint NOT NULL DEFAULT 0
      )
    `);
    await client.query(`ALTER TABLE ${SCHEDULER_STATE_TABLE} ADD COLUMN IF NOT EXISTS node_id varchar(120) NOT NULL DEFAULT 'legacy'`);
    await client.query(`ALTER TABLE ${SCHEDULER_STATE_TABLE} ADD COLUMN IF NOT EXISTS runtime_role varchar(32) NOT NULL DEFAULT 'unknown'`);
    await client.query(`ALTER TABLE ${SCHEDULER_STATE_TABLE} ADD COLUMN IF NOT EXISTS process_id bigint NOT NULL DEFAULT 0`);
    await client.query(`
      CREATE INDEX IF NOT EXISTS scheduler_runtime_state_role_updated_idx
      ON ${SCHEDULER_STATE_TABLE}(runtime_role, updated_at DESC)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function resolveSchedulerStateIdentity(): {
  stateKey: string;
  nodeId: string;
  runtimeRole: ServerRuntimeRole;
  processId: number;
} {
  const runtimeRole = resolveServerRuntimeRole();
  const nodeId = resolveNodeId(runtimeRole);
  const hash = createHash('sha1').update(`${runtimeRole}:${nodeId}`).digest('hex').slice(0, 16);
  return {
    stateKey: `${SCHEDULER_STATE_KEY_PREFIX}:${runtimeRole}:${hash}`,
    nodeId,
    runtimeRole,
    processId: process.pid,
  };
}

function resolveNodeId(runtimeRole: ServerRuntimeRole): string {
  const explicit = normalizeString(process.env.SERVER_NODE_ID);
  if (explicit) {
    return explicit;
  }
  const publicPort = Number(
    normalizeString(process.env.SERVER_PUBLIC_PORT) || normalizeString(process.env.SERVER_PORT),
  );
  const stablePort = Number.isFinite(publicPort) ? Math.max(1, Math.trunc(publicPort)) : 13001;
  const host = hostname().trim() || 'node';
  return `${host}:${stablePort}:${runtimeRole}`;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePositiveInteger(value: unknown, defaultValue: number, min: number, max: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return defaultValue;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}
