/**
 * flush-ledger.helpers.ts
 *
 * 从 flush-ledger.service.ts 拆出的模块级常量、接口与游离函数。
 * 包含：表名/锁命名空间/隔离类别等常量、DDL 建表函数、行去重/规范化/映射 helper。
 * 纯函数与类型定义，不包含 @Injectable provider，不修改持久化语义。
 */
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Pool } from 'pg';

import { buildPersistedInventoryItemRawPayload } from './inventory-item-persistence';
import type { PlayerInventoryOwnershipConflict } from './player-flush-asset-conflict-repair';
import type { FlushTask, FlushTaskPriority, FlushTaskScope } from './flush-task.types';

// ── 表名 ──
export const PLAYER_FLUSH_LEDGER_TABLE = 'player_flush_ledger';
export const INSTANCE_FLUSH_LEDGER_TABLE = 'instance_flush_ledger';

// ── 隔离类别（已导出，供外部引用） ──
export const PLAYER_FLUSH_ASSET_CONFLICT_QUARANTINE = 'startup_asset_conflict';
export const PLAYER_FLUSH_STARTUP_STALL_QUARANTINE = 'startup_deterministic_stall';
export const INSTANCE_FLUSH_STARTUP_STALL_QUARANTINE = 'startup_deterministic_stall';

// ── 隔离类别集合 ──
export const PLAYER_FLUSH_QUARANTINE_CATEGORIES = [
  PLAYER_FLUSH_ASSET_CONFLICT_QUARANTINE,
  PLAYER_FLUSH_STARTUP_STALL_QUARANTINE,
] as const;
export const INSTANCE_FLUSH_QUARANTINE_CATEGORIES = [
  INSTANCE_FLUSH_STARTUP_STALL_QUARANTINE,
] as const;

export const PLAYER_FLUSH_QUARANTINE_CATEGORIES_SQL = PLAYER_FLUSH_QUARANTINE_CATEGORIES
  .map((category) => `'${category}'`)
  .join(', ');
export const INSTANCE_FLUSH_QUARANTINE_CATEGORIES_SQL = INSTANCE_FLUSH_QUARANTINE_CATEGORIES
  .map((category) => `'${category}'`)
  .join(', ');

export const PLAYER_FLUSH_NOT_QUARANTINED_SQL = `(
  failure_category IS NULL
  OR failure_category NOT IN (${PLAYER_FLUSH_QUARANTINE_CATEGORIES_SQL})
)`;
export const INSTANCE_FLUSH_NOT_QUARANTINED_SQL = `(
  failure_category IS NULL
  OR failure_category NOT IN (${INSTANCE_FLUSH_QUARANTINE_CATEGORIES_SQL})
)`;

export function buildNotQuarantinedFilterSql(alias: string): string {
  return `(
    ${alias}.failure_category IS NULL
    OR ${alias}.failure_category NOT IN (${PLAYER_FLUSH_QUARANTINE_CATEGORIES_SQL})
  )`;
}

// ── 锁与批次常量 ──
export const FLUSH_LEDGER_LOCK_NAMESPACE = 42871;
export const FLUSH_LEDGER_LOCK_KEY = 4001;
export const PLAYER_FLUSH_GROUP_CLAIM_LOCK_NAMESPACE = 42872;
export const DEFAULT_FLUSH_LEDGER_BATCH_SIZE = 250;
export const MAX_FLUSH_LEDGER_BATCH_SIZE = 1_000;
export const DEFAULT_FLUSH_TASK_CLAIM_TTL_MS = 30_000;
export const MIN_FLUSH_TASK_CLAIM_TTL_MS = 5_000;
export const MAX_FLUSH_TASK_CLAIM_TTL_MS = 5 * 60_000;

// ── 积压查询 SQL 片段 ──
export const PLAYER_ACTIVE_BACKLOG_FILTER_SQL = `
  latest_version > flushed_version
  OR (claimed_by IS NOT NULL AND claim_until >= now())
  OR (next_attempt_at IS NOT NULL AND next_attempt_at > now())
`;
export const INSTANCE_ACTIVE_BACKLOG_FILTER_SQL = `
  latest_version > flushed_version
  OR (claimed_by IS NOT NULL AND claim_until >= now())
  OR (COALESCE(next_attempt_at, retry_after) IS NOT NULL AND COALESCE(next_attempt_at, retry_after) > now())
`;

// ── Upsert 输入接口（从 service 移出，service 仍 re-export） ──
export interface PlayerFlushLedgerUpsertInput {
  playerId: string;
  domain: string;
  latestVersion: number;
  priority?: FlushTaskPriority | null;
  flushedVersion?: number;
  dirtySinceAt?: string | null;
  nextAttemptAt?: string | null;
  claimedBy?: string | null;
  claimUntil?: string | null;
  runtimeOwnerId?: string | null;
  fencingToken?: string | null;
  idempotencyKey?: string | null;
  payloadJson?: unknown;
  failureCategory?: string | null;
}

export interface InstanceFlushLedgerUpsertInput {
  instanceId: string;
  domain: string;
  ownershipEpoch: number;
  latestVersion: number;
  priority?: FlushTaskPriority | null;
  flushedVersion?: number;
  dirtySinceAt?: string | null;
  nextAttemptAt?: string | null;
  claimedBy?: string | null;
  claimUntil?: string | null;
  runtimeOwnerId?: string | null;
  fencingToken?: string | null;
  idempotencyKey?: string | null;
  payloadJson?: unknown;
  failureCategory?: string | null;
}
export async function clearCompletedFlushLedgerPayload(
  pool: Pool,
  tableName: string,
  retentionMs: number,
  limit: number,
): Promise<number> {
  const result = await pool.query<{ updated_count?: unknown }>(
    `
      WITH targets AS (
        SELECT ctid
        FROM ${tableName}
        WHERE latest_version <= flushed_version
          AND (claimed_by IS NULL OR claim_until < now())
          AND (COALESCE(next_attempt_at, retry_after) IS NULL OR COALESCE(next_attempt_at, retry_after) <= now())
          AND payload_jsonb IS NOT NULL
          AND updated_at < now() - ($1::bigint * interval '1 millisecond')
        ORDER BY updated_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      ),
      updated AS (
        UPDATE ${tableName} ledger
        SET payload_jsonb = NULL,
            updated_at = now()
        FROM targets
        WHERE ledger.ctid = targets.ctid
        RETURNING 1
      )
      SELECT COUNT(*)::bigint AS updated_count FROM updated
    `,
    [retentionMs, limit],
  );
  return Math.max(0, Math.trunc(Number(result.rows[0]?.updated_count ?? 0)));
}

export async function deleteCompletedFlushLedgerRows(
  pool: Pool,
  tableName: string,
  retentionMs: number,
  limit: number,
): Promise<number> {
  const result = await pool.query<{ deleted_count?: unknown }>(
    `
      WITH targets AS (
        SELECT ctid
        FROM ${tableName}
        WHERE latest_version <= flushed_version
          AND (claimed_by IS NULL OR claim_until < now())
          AND (COALESCE(next_attempt_at, retry_after) IS NULL OR COALESCE(next_attempt_at, retry_after) <= now())
          AND updated_at < now() - ($1::bigint * interval '1 millisecond')
        ORDER BY updated_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      ),
      deleted AS (
        DELETE FROM ${tableName} ledger
        USING targets
        WHERE ledger.ctid = targets.ctid
        RETURNING 1
      )
      SELECT COUNT(*)::bigint AS deleted_count FROM deleted
    `,
    [retentionMs, limit],
  );
  return Math.max(0, Math.trunc(Number(result.rows[0]?.deleted_count ?? 0)));
}

export async function ensurePlayerFlushLedgerTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_lock($1, $2)', [FLUSH_LEDGER_LOCK_NAMESPACE, FLUSH_LEDGER_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_FLUSH_LEDGER_TABLE} (
        player_id varchar(100) NOT NULL,
        domain varchar(64) NOT NULL,
        latest_version bigint NOT NULL DEFAULT 0,
        flushed_version bigint NOT NULL DEFAULT 0,
        dirty_since_at timestamptz NULL,
        next_attempt_at timestamptz NULL,
        claimed_by varchar(120) NULL,
        claim_until timestamptz NULL,
        priority varchar(16) NOT NULL DEFAULT 'normal',
        runtime_owner_id varchar(120) NULL,
        fencing_token varchar(120) NULL,
        idempotency_key varchar(180) NULL,
        payload_jsonb jsonb NULL,
        failure_category varchar(64) NULL,
        retry_after timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (player_id, domain)
      )
    `);
    await client.query(`
      ALTER TABLE ${PLAYER_FLUSH_LEDGER_TABLE}
      ADD COLUMN IF NOT EXISTS priority varchar(16) NOT NULL DEFAULT 'normal',
      ADD COLUMN IF NOT EXISTS runtime_owner_id varchar(120) NULL,
      ADD COLUMN IF NOT EXISTS fencing_token varchar(120) NULL,
      ADD COLUMN IF NOT EXISTS idempotency_key varchar(180) NULL,
      ADD COLUMN IF NOT EXISTS payload_jsonb jsonb NULL,
      ADD COLUMN IF NOT EXISTS failure_category varchar(64) NULL,
      ADD COLUMN IF NOT EXISTS retry_after timestamptz NULL,
      ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()
    `);
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = '${PLAYER_FLUSH_LEDGER_TABLE}'
            AND column_name = 'dirty_since_at'
            AND data_type = 'bigint'
        ) THEN
          ALTER TABLE ${PLAYER_FLUSH_LEDGER_TABLE}
          ALTER COLUMN dirty_since_at TYPE timestamptz
          USING CASE
            WHEN dirty_since_at IS NULL THEN NULL
            ELSE to_timestamp(dirty_since_at::double precision / 1000)
          END;
        END IF;
      END $$;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_flush_ledger_priority_pending_idx
      ON ${PLAYER_FLUSH_LEDGER_TABLE}(priority, domain, dirty_since_at, player_id)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1, $2)', [FLUSH_LEDGER_LOCK_NAMESPACE, FLUSH_LEDGER_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

export async function ensureInstanceFlushLedgerTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_lock($1, $2)', [FLUSH_LEDGER_LOCK_NAMESPACE, FLUSH_LEDGER_LOCK_KEY + 1]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${INSTANCE_FLUSH_LEDGER_TABLE} (
        instance_id varchar(100) NOT NULL,
        domain varchar(64) NOT NULL,
        ownership_epoch bigint NOT NULL DEFAULT 0,
        latest_version bigint NOT NULL DEFAULT 0,
        flushed_version bigint NOT NULL DEFAULT 0,
        dirty_since_at timestamptz NULL,
        next_attempt_at timestamptz NULL,
        claimed_by varchar(120) NULL,
        claim_until timestamptz NULL,
        priority varchar(16) NOT NULL DEFAULT 'normal',
        runtime_owner_id varchar(120) NULL,
        fencing_token varchar(120) NULL,
        idempotency_key varchar(180) NULL,
        payload_jsonb jsonb NULL,
        failure_category varchar(64) NULL,
        retry_after timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (instance_id, domain, ownership_epoch)
      )
    `);
    await client.query(`
      ALTER TABLE ${INSTANCE_FLUSH_LEDGER_TABLE}
      ADD COLUMN IF NOT EXISTS priority varchar(16) NOT NULL DEFAULT 'normal',
      ADD COLUMN IF NOT EXISTS runtime_owner_id varchar(120) NULL,
      ADD COLUMN IF NOT EXISTS fencing_token varchar(120) NULL,
      ADD COLUMN IF NOT EXISTS idempotency_key varchar(180) NULL,
      ADD COLUMN IF NOT EXISTS payload_jsonb jsonb NULL,
      ADD COLUMN IF NOT EXISTS failure_category varchar(64) NULL,
      ADD COLUMN IF NOT EXISTS retry_after timestamptz NULL,
      ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_flush_ledger_priority_pending_idx
      ON ${INSTANCE_FLUSH_LEDGER_TABLE}(priority, domain, ownership_epoch, dirty_since_at, instance_id)
    `);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1, $2)', [FLUSH_LEDGER_LOCK_NAMESPACE, FLUSH_LEDGER_LOCK_KEY + 1]).catch(() => undefined);
    client.release();
  }
}


export function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeOptionalTimestamp(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function isRuntimeInventoryIdentityEquivalent(
  runtimeItem: Record<string, unknown> | undefined,
  conflict: PlayerInventoryOwnershipConflict | undefined,
): boolean {
  if (!runtimeItem || !conflict) {
    return false;
  }
  const itemId = normalizeRequiredString(runtimeItem.itemId);
  if (
    itemId !== conflict.itemId
    || normalizeOptionalString(runtimeItem.lockedBy) != null
    || conflict.lockedBy != null
  ) {
    return false;
  }
  const runtimePayload = buildPersistedInventoryItemRawPayload({
    itemId,
    count: runtimeItem.count,
    name: runtimeItem.name,
    desc: runtimeItem.desc,
    enhanceLevel: runtimeItem.enhanceLevel,
    learnTechniqueId: runtimeItem.learnTechniqueId,
    learnTechniqueMaxLevel: runtimeItem.learnTechniqueMaxLevel,
    grade: runtimeItem.grade,
    level: runtimeItem.level,
    rawPayload: runtimeItem.rawPayload,
  });
  return isDeepStrictEqual(runtimePayload, conflict.rawPayload);
}

type PlayerPayloadFenceDecision = 'current' | 'superseded' | 'indeterminate';

export function resolvePlayerPayloadFenceDecision(
  payloadEpoch: number,
  payloadOwner: string | null,
  persistedEpoch: number,
  persistedOwner: string | null,
  presenceExists: boolean,
): PlayerPayloadFenceDecision {
  if (payloadEpoch <= 0 && !payloadOwner) {
    return 'current';
  }
  if (!presenceExists || payloadEpoch <= 0 || persistedEpoch <= 0 || persistedEpoch < payloadEpoch) {
    return 'indeterminate';
  }
  if (persistedEpoch > payloadEpoch) {
    return 'superseded';
  }
  if (payloadOwner) {
    return payloadOwner === persistedOwner ? 'current' : 'superseded';
  }
  return persistedOwner ? 'superseded' : 'current';
}

export function normalizeNonNegativeSafeInteger(value: unknown): number {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : 0;
}

interface PlayerFlushLedgerJsonRow {
  player_id: string;
  domain: string;
  priority: FlushTaskPriority;
  latest_version: number;
  flushed_version: number;
  dirty_since_at: string | null;
  next_attempt_at: string | null;
  claimed_by: string | null;
  claim_until: string | null;
  runtime_owner_id: string | null;
  fencing_token: string | null;
  idempotency_key: string | null;
  payload_jsonb: unknown;
  failure_category: string | null;
  retry_after: string | null;
}

interface InstanceFlushLedgerJsonRow extends Omit<PlayerFlushLedgerJsonRow, 'player_id'> {
  instance_id: string;
  ownership_epoch: number;
}

export function dedupePlayerFlushLedgerInputs(inputs: PlayerFlushLedgerUpsertInput[]): PlayerFlushLedgerJsonRow[] {
  const rows = new Map<string, PlayerFlushLedgerJsonRow>();
  for (const input of inputs) {
    const playerId = normalizeRequiredString(input.playerId);
    const domain = normalizeRequiredString(input.domain);
    if (!playerId || !domain) {
      continue;
    }
    const latestVersion = normalizeRevision(input.latestVersion);
    const row: PlayerFlushLedgerJsonRow = {
      player_id: playerId,
      domain,
      priority: normalizePriority(input.priority),
      latest_version: latestVersion,
      flushed_version: Math.min(normalizeRevision(input.flushedVersion), latestVersion),
      dirty_since_at: normalizeOptionalTimestamp(input.dirtySinceAt),
      next_attempt_at: normalizeOptionalTimestamp(input.nextAttemptAt),
      claimed_by: normalizeOptionalString(input.claimedBy),
      claim_until: normalizeOptionalTimestamp(input.claimUntil),
      runtime_owner_id: normalizeOptionalString(input.runtimeOwnerId),
      fencing_token: normalizeOptionalString(input.fencingToken),
      idempotency_key: normalizeOptionalString(input.idempotencyKey),
      payload_jsonb: input.payloadJson ?? null,
      failure_category: normalizeOptionalString(input.failureCategory),
      retry_after: normalizeOptionalTimestamp(input.nextAttemptAt),
    };
    const key = `${playerId}\u0000${domain}`;
    const current = rows.get(key);
    if (!current || shouldReplacePlayerBatchRow(current, row)) {
      rows.set(key, row);
    }
  }
  return Array.from(rows.values()).sort((left, right) => (
    compareCanonicalString(left.player_id, right.player_id)
    || compareCanonicalString(left.domain, right.domain)
  ));
}

export function shouldReplacePlayerBatchRow(current: PlayerFlushLedgerJsonRow, incoming: PlayerFlushLedgerJsonRow): boolean {
  if (incoming.latest_version !== current.latest_version) {
    return incoming.latest_version > current.latest_version;
  }
  return incoming.fencing_token === current.fencing_token
    && current.payload_jsonb === null
    && incoming.payload_jsonb !== null;
}

export function dedupeInstanceFlushLedgerInputs(inputs: InstanceFlushLedgerUpsertInput[]): InstanceFlushLedgerJsonRow[] {
  const rows = new Map<string, InstanceFlushLedgerJsonRow>();
  for (const input of inputs) {
    const instanceId = normalizeRequiredString(input.instanceId);
    const domain = normalizeRequiredString(input.domain);
    if (!instanceId || !domain) {
      continue;
    }
    const ownershipEpoch = normalizePositiveInteger(input.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER);
    const latestVersion = normalizeRevision(input.latestVersion);
    const row: InstanceFlushLedgerJsonRow = {
      instance_id: instanceId,
      domain,
      ownership_epoch: ownershipEpoch,
      priority: normalizePriority(input.priority),
      latest_version: latestVersion,
      flushed_version: Math.min(normalizeRevision(input.flushedVersion), latestVersion),
      dirty_since_at: normalizeOptionalTimestamp(input.dirtySinceAt),
      next_attempt_at: normalizeOptionalTimestamp(input.nextAttemptAt),
      claimed_by: normalizeOptionalString(input.claimedBy),
      claim_until: normalizeOptionalTimestamp(input.claimUntil),
      runtime_owner_id: normalizeOptionalString(input.runtimeOwnerId),
      fencing_token: normalizeOptionalString(input.fencingToken),
      idempotency_key: normalizeOptionalString(input.idempotencyKey),
      payload_jsonb: input.payloadJson ?? null,
      failure_category: normalizeOptionalString(input.failureCategory),
      retry_after: normalizeOptionalTimestamp(input.nextAttemptAt),
    };
    const key = `${instanceId}\u0000${domain}\u0000${ownershipEpoch}`;
    const current = rows.get(key);
    if (
      !current
      || row.latest_version > current.latest_version
      || (
        row.latest_version === current.latest_version
        && row.fencing_token === current.fencing_token
        && current.payload_jsonb === null
        && row.payload_jsonb !== null
      )
    ) {
      rows.set(key, row);
    }
  }
  return Array.from(rows.values()).sort((left, right) => (
    compareCanonicalString(left.instance_id, right.instance_id)
    || compareCanonicalString(left.domain, right.domain)
    || left.ownership_epoch - right.ownership_epoch
  ));
}

export function dedupeClaimedFlushTasks(tasks: FlushTask[]): FlushTask[] {
  const result = new Map<string, FlushTask>();
  for (const task of tasks) {
    const id = normalizeRequiredString(task.id);
    const domain = normalizeRequiredString(task.domain);
    const claimOwnerId = normalizeOptionalString(task.claimOwnerId);
    if (!id || !domain || !claimOwnerId) {
      continue;
    }
    const ownershipEpoch = task.scope === 'instance'
      ? normalizePositiveInteger(task.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER)
      : 0;
    const normalizedTask: FlushTask = {
      ...task,
      id,
      domain,
      ownershipEpoch: task.scope === 'instance' ? ownershipEpoch : null,
      latestRevision: normalizeRevision(task.latestRevision),
      fencingToken: normalizeOptionalString(task.fencingToken),
      claimOwnerId,
    };
    const key = `${task.scope}\u0000${id}\u0000${domain}\u0000${ownershipEpoch}`
      + `\u0000${claimOwnerId}\u0000${normalizedTask.fencingToken ?? ''}`;
    const current = result.get(key);
    if (!current || normalizedTask.latestRevision >= current.latestRevision) {
      result.set(key, normalizedTask);
    }
  }
  return Array.from(result.values()).sort((left, right) => (
    compareCanonicalString(left.scope, right.scope)
    || compareCanonicalString(left.id, right.id)
    || compareCanonicalString(left.domain, right.domain)
    || normalizePositiveInteger(left.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER)
      - normalizePositiveInteger(right.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER)
    || compareCanonicalString(left.claimOwnerId ?? '', right.claimOwnerId ?? '')
    || compareCanonicalString(left.fencingToken ?? '', right.fencingToken ?? '')
  ));
}

export function compareCanonicalString(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

export function chunkRows<T>(rows: T[], batchSize: number): T[][] {
  const chunks: T[][] = [];
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    chunks.push(rows.slice(offset, offset + batchSize));
  }
  return chunks;
}

export function normalizeRevision(value: unknown): number {
  return normalizePositiveInteger(value, 0, 0, Number.MAX_SAFE_INTEGER);
}

export function buildClaimOwnerId(workerId: string): string {
  const prefix = normalizeRequiredString(workerId).slice(0, 80) || 'flush-worker';
  return `${prefix}:${randomUUID()}`;
}

export function resolveFlushTaskClaimTtlMs(value?: number): number {
  const configured = value ?? Number(process.env.SERVER_FLUSH_TASK_CLAIM_TTL_MS);
  return normalizePositiveInteger(
    configured,
    DEFAULT_FLUSH_TASK_CLAIM_TTL_MS,
    MIN_FLUSH_TASK_CLAIM_TTL_MS,
    MAX_FLUSH_TASK_CLAIM_TTL_MS,
  );
}

export function buildFlushTaskIdempotencyKey(task: FlushTask): string {
  const epoch = task.scope === 'instance' ? normalizePositiveInteger(task.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER) : 0;
  return `${task.scope}:${task.id}:${task.domain}:${epoch}:${Math.max(0, Math.trunc(Number(task.latestRevision ?? 0)))}`;
}

export function normalizePriority(value: unknown): FlushTaskPriority {
  return value === 'high' || value === 'low' || value === 'normal' ? value : 'normal';
}

export function mapFlushLedgerRowsToTasks(
  scope: FlushTaskScope,
  rows: readonly Record<string, unknown>[],
): FlushTask[] {
  return rows
    .map((row) => {
      const id = scope === 'player'
        ? normalizeRequiredString(row.player_id)
        : normalizeRequiredString(row.instance_id);
      const domain = normalizeRequiredString(row.domain);
      if (!id || !domain) {
        return null;
      }
      const task: FlushTask = {
        scope,
        id,
        domain,
        priority: normalizePriority(row.priority),
        latestRevision: normalizePositiveInteger(row.latest_version, 0, 0, Number.MAX_SAFE_INTEGER),
        ownershipEpoch: scope === 'instance'
          ? normalizePositiveInteger(row.ownership_epoch, 0, 0, Number.MAX_SAFE_INTEGER)
          : null,
        runtimeOwnerId: normalizeOptionalString(row.runtime_owner_id),
        fencingToken: normalizeOptionalString(row.fencing_token),
        claimOwnerId: normalizeOptionalString(row.claimed_by),
        idempotencyKey: normalizeOptionalString(row.idempotency_key),
        payloadJson: row.payload_jsonb ?? null,
        failureCategory: normalizeOptionalString(row.failure_category),
        dirtySinceAt: normalizeOptionalTimestamp(row.dirty_since_at),
        nextAttemptAt: normalizeOptionalTimestamp(row.next_attempt_at ?? row.retry_after),
        createdAt: normalizeOptionalTimestamp(row.created_at),
      };
      return task;
    })
    .filter((task): task is FlushTask => task !== null);
}

export function normalizeOptionalPriority(value: unknown): FlushTaskPriority | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return normalizePriority(value);
}

export function normalizePositiveInteger(value: unknown, defaultValue: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }
  const normalized = Math.trunc(parsed);
  if (normalized < min) {
    return min;
  }
  if (normalized > max) {
    return max;
  }
  return normalized;
}
