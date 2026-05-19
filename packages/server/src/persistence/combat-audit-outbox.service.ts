/**
 * 战斗审计 Outbox 服务。
 * 将战斗事件入队并异步批量写入 outbox_event + asset_audit_log 表，
 * 支持按玩家/实例/目标/时间范围查询审计记录。
 */
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import { Pool } from 'pg';

import { DatabasePoolProvider } from './database-pool.provider';
import { GmRuntimeFlagPersistenceService } from './gm-runtime-flag-persistence.service';

const OUTBOX_EVENT_TABLE = 'outbox_event';
const ASSET_AUDIT_LOG_TABLE = 'asset_audit_log';
const COMBAT_AUDIT_TOPIC = 'combat.audit.recorded';
const MAX_QUEUE_SIZE = 5_000;
const FLUSH_BATCH_SIZE = 100;
const COMBAT_AUDIT_ACTIONS = new Set([
  'damage',
  'defeat',
  'destroy',
  'dodge',
  'immune',
  'resolve',
  'kill',
  'death',
  'loot_drop',
  'loot_grant',
  'exp_gain',
]);

/** 战斗审计 Outbox 服务：内存队列 + 异步批量落库 */
@Injectable()
export class CombatAuditOutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CombatAuditOutboxService.name);
  private pool: Pool | null = null;
  private enabled = false;
  private queue: Array<QueuedCombatAuditEvent> = [];
  private flushScheduled = false;
  private flushing = false;
  private sequence = 0;
  private droppedCount = 0;
  private lastDropWarnAt = 0;

  constructor(
    @Inject(DatabasePoolProvider) private readonly databasePoolProvider: DatabasePoolProvider | null = null,
    @Inject(GmRuntimeFlagPersistenceService) private readonly flagService: GmRuntimeFlagPersistenceService | null = null,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.flagService) {
      await this.flagService.ensureInitialized();
      if (!this.flagService.getFlag('combat_audit_enabled')) {
        this.logger.log('combat audit outbox 已禁用：runtime flag combat_audit_enabled = false');
        return;
      }
    } else if (process.env.SERVER_COMBAT_AUDIT_ENABLED !== 'true') {
      this.logger.log('combat audit outbox 已禁用：SERVER_COMBAT_AUDIT_ENABLED !== true');
      return;
    }
    this.pool = this.databasePoolProvider?.getPool('combat-audit-outbox') ?? null;
    if (!this.pool) {
      this.logger.log('combat audit outbox 已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }
    await ensureCombatAuditOutboxTables(this.pool);
    this.enabled = true;
    this.logger.log('combat audit outbox 已启用');
  }

  async onModuleDestroy(): Promise<void> {
    await this.flushOnce().catch((error: unknown) => {
      this.logger.warn(`combat audit outbox 关闭前 flush 失败：${error instanceof Error ? error.message : String(error)}`);
    });
    this.queue = [];
    this.enabled = false;
    this.pool = null;
  }

  isEnabled(): boolean {
    return this.enabled && this.pool !== null;
  }

  enqueue(event: Record<string, unknown> | null | undefined): boolean {
    if (!this.isEnabled() || !event || typeof event !== 'object') {
      return false;
    }
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      this.queue.shift();
      this.droppedCount += 1;
      const now = Date.now();
      if (now - this.lastDropWarnAt >= 10_000) {
        this.logger.warn(`combat audit outbox 队列溢出，已丢弃 ${this.droppedCount} 条事件`);
        this.lastDropWarnAt = now;
      }
    }
    this.sequence += 1;
    this.queue.push({
      operationId: buildCombatAuditOperationId(event, this.sequence),
      event,
      queuedAt: new Date().toISOString(),
    });
    this.scheduleFlush();
    return true;
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  async flushOnce(limit = FLUSH_BATCH_SIZE): Promise<number> {
    if (!this.pool || !this.enabled || this.flushing) {
      return 0;
    }
    const batchSize = normalizePositiveInteger(limit, FLUSH_BATCH_SIZE, 1, 500);
    const batch = this.queue.splice(0, batchSize);
    if (batch.length <= 0) {
      return 0;
    }
    this.flushing = true;
    try {
      await insertCombatAuditBatch(this.pool, batch);
      return batch.length;
    } catch (error: unknown) {
      this.queue = batch.concat(this.queue).slice(0, MAX_QUEUE_SIZE);
      this.logger.warn(`combat audit outbox flush 失败：${error instanceof Error ? error.message : String(error)}`);
      return 0;
    } finally {
      this.flushing = false;
      if (this.queue.length > 0) {
        this.scheduleFlush();
      }
    }
  }

  async queryCombatAuditRows(input?: {
    playerId?: string | null;
    instanceId?: string | null;
    targetId?: string | null;
    since?: string | Date | null;
    until?: string | Date | null;
    limit?: number;
  }): Promise<Array<Record<string, unknown>>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const limit = normalizePositiveInteger(input?.limit, 20, 1, 200);
    const playerId = normalizeString(input?.playerId);
    const instanceId = normalizeString(input?.instanceId);
    const targetId = normalizeString(input?.targetId);
    const since = normalizeOptionalDate(input?.since);
    const until = normalizeOptionalDate(input?.until);
    const whereClauses = ['asset_type = $2'];
    const params: unknown[] = [limit, 'combat'];
    if (playerId) {
      params.push(playerId);
      whereClauses.push(`player_id = $${params.length}`);
    }
    if (instanceId) {
      params.push(instanceId);
      whereClauses.push(`after_jsonb->>'instanceId' = $${params.length}`);
    }
    if (targetId) {
      params.push(targetId);
      whereClauses.push(`before_jsonb->'target'->>'id' = $${params.length}`);
    }
    if (since) {
      params.push(since);
      whereClauses.push(`created_at >= $${params.length}::timestamptz`);
    }
    if (until) {
      params.push(until);
      whereClauses.push(`created_at <= $${params.length}::timestamptz`);
    }
    const result = await this.pool.query(
      `
        SELECT log_id, operation_id, player_id, asset_type, asset_ref_id, action, delta_jsonb, before_jsonb, after_jsonb, created_at
        FROM ${ASSET_AUDIT_LOG_TABLE}
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY created_at DESC, log_id DESC
        LIMIT $1
      `,
      params,
    );
    return Array.isArray(result.rows) ? result.rows as Array<Record<string, unknown>> : [];
  }

  async listRecentCombatAuditRows(input?: { playerId?: string | null; limit?: number }): Promise<Array<Record<string, unknown>>> {
    return this.queryCombatAuditRows(input);
  }

  async cleanupByOperationIds(operationIds: string[]): Promise<void> {
    if (!this.pool || !this.enabled || !Array.isArray(operationIds) || operationIds.length <= 0) {
      return;
    }
    const ids = operationIds.map((entry) => normalizeString(entry)).filter(Boolean);
    if (ids.length <= 0) {
      return;
    }
    await this.pool.query(`DELETE FROM ${OUTBOX_EVENT_TABLE} WHERE operation_id = ANY($1::varchar[])`, [ids]);
    await this.pool.query(`DELETE FROM ${ASSET_AUDIT_LOG_TABLE} WHERE operation_id = ANY($1::varchar[])`, [ids]);
  }

  private scheduleFlush(): void {
    if (this.flushScheduled || this.flushing) {
      return;
    }
    this.flushScheduled = true;
    const handle = setImmediate(async () => {
      this.flushScheduled = false;
      await this.flushOnce().catch((error: unknown) => {
        this.logger.warn(`combat audit outbox 异步 flush 失败：${error instanceof Error ? error.message : String(error)}`);
      });
    });
    if (typeof handle.unref === 'function') {
      handle.unref();
    }
  }
}

interface QueuedCombatAuditEvent {
  operationId: string;
  event: Record<string, unknown>;
  queuedAt: string;
}

async function insertCombatAuditBatch(pool: Pool, batch: QueuedCombatAuditEvent[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const entry of batch) {
      const event = entry.event;
      const playerId = resolveCombatAuditPlayerId(event);
      const assetRefId = resolveCombatAuditAssetRefId(event);
      const payload = {
        ...event,
        queuedAt: entry.queuedAt,
      };
      await client.query(
        `
          INSERT INTO ${ASSET_AUDIT_LOG_TABLE}(
            log_id,
            operation_id,
            player_id,
            asset_type,
            asset_ref_id,
            action,
            delta_jsonb,
            before_jsonb,
            after_jsonb,
            created_at
          )
          VALUES ($1, $2, $3, 'combat', $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, now())
          ON CONFLICT (log_id) DO NOTHING
        `,
        [
          `audit:${entry.operationId}`,
          entry.operationId,
          playerId || 'system:combat',
          assetRefId,
          resolveCombatAuditAction(event),
          JSON.stringify({
            action: resolveCombatAuditAction(event),
            phase: event.phase ?? null,
            result: event.result ?? {},
            application: event.application ?? null,
            tags: Array.isArray(event.tags) ? event.tags : [],
          }),
          JSON.stringify({
            actor: event.actor ?? null,
            target: event.target ?? null,
          }),
          JSON.stringify(payload),
        ],
      );
    }
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function ensureCombatAuditOutboxTables(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${OUTBOX_EVENT_TABLE} (
      event_id varchar(180) PRIMARY KEY,
      operation_id varchar(180) NOT NULL,
      topic varchar(120) NOT NULL,
      partition_key varchar(180) NOT NULL,
      payload_jsonb jsonb NOT NULL,
      status varchar(32) NOT NULL,
      attempt_count bigint NOT NULL DEFAULT 0,
      next_retry_at timestamptz,
      claimed_by varchar(120),
      claim_until timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      delivered_at timestamptz
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS outbox_event_operation_idx
    ON ${OUTBOX_EVENT_TABLE}(operation_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS outbox_event_partition_claim_idx
    ON ${OUTBOX_EVENT_TABLE}(partition_key, status, claim_until, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS outbox_event_status_retry_idx
    ON ${OUTBOX_EVENT_TABLE}(status, next_retry_at, created_at)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${ASSET_AUDIT_LOG_TABLE} (
      log_id varchar(180) PRIMARY KEY,
      operation_id varchar(180) NOT NULL,
      player_id varchar(100) NOT NULL,
      asset_type varchar(64) NOT NULL,
      asset_ref_id varchar(180) NOT NULL,
      action varchar(64) NOT NULL,
      delta_jsonb jsonb NOT NULL,
      before_jsonb jsonb NOT NULL,
      after_jsonb jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS asset_audit_log_operation_idx
    ON ${ASSET_AUDIT_LOG_TABLE}(operation_id, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS asset_audit_log_player_idx
    ON ${ASSET_AUDIT_LOG_TABLE}(player_id, created_at DESC)
  `);
}

function buildCombatAuditOperationId(event: Record<string, unknown>, sequence: number): string {
  const createdAt = normalizeString(event.createdAt) || new Date().toISOString();
  const hash = createHash('sha1')
    .update(`${createdAt}:${sequence}:${normalizeString(event.actionId)}:${normalizeString(event.instanceId)}`)
    .digest('hex')
    .slice(0, 16);
  return `combat:${Date.now().toString(36)}:${sequence.toString(36)}:${hash}`;
}

function resolveCombatAuditPlayerId(event: Record<string, unknown>): string {
  const actor = event.actor && typeof event.actor === 'object' ? event.actor as Record<string, unknown> : null;
  const target = event.target && typeof event.target === 'object' ? event.target as Record<string, unknown> : null;
  if (actor?.kind === 'player') {
    return normalizeString(actor.id);
  }
  if (target?.kind === 'player') {
    return normalizeString(target.id);
  }
  return '';
}

function resolveCombatAuditAssetRefId(event: Record<string, unknown>): string {
  const target = event.target && typeof event.target === 'object' ? event.target as Record<string, unknown> : null;
  const targetKind = normalizeString(target?.kind) || 'target';
  const targetId = normalizeString(target?.id);
  if (targetId) {
    return `${targetKind}:${targetId}`.slice(0, 180);
  }
  const x = Number(target?.x);
  const y = Number(target?.y);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    return `${targetKind}:${Math.trunc(x)},${Math.trunc(y)}`.slice(0, 180);
  }
  return (normalizeString(event.instanceId) || 'combat').slice(0, 180);
}

function resolveCombatAuditAction(event: Record<string, unknown>): string {
  const explicitAction = normalizeString(event.action);
  if (COMBAT_AUDIT_ACTIONS.has(explicitAction)) {
    return explicitAction;
  }
  const result = event.result && typeof event.result === 'object' ? event.result as Record<string, unknown> : null;
  if (result?.defeated === true) return 'defeat';
  if (result?.destroyed === true || result?.broken === true) return 'destroy';
  if (Number(result?.damage ?? 0) > 0) return 'damage';
  if (result?.dodged === true) return 'dodge';
  if (result?.immune === true) return 'immune';
  return 'resolve';
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalDate(value: unknown): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return '';
}

function normalizePositiveInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const normalized = Math.trunc(parsed);
  if (normalized < min) return min;
  if (normalized > max) return max;
  return normalized;
}

export { COMBAT_AUDIT_TOPIC };
