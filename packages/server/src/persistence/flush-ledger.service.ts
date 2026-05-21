/**
 * 统一刷盘账本服务。
 * 同时管理玩家和实例两类 flush ledger 表，提供 upsert/claim/markFlushed 和积压摘要查询，
 * 为分布式刷盘调度提供持久化协调。
 */
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

import { DatabasePoolProvider } from './database-pool.provider';
import type { ClaimFlushTaskInput, FlushTask, FlushTaskPriority } from './flush-task.types';

const PLAYER_FLUSH_LEDGER_TABLE = 'player_flush_ledger';
const INSTANCE_FLUSH_LEDGER_TABLE = 'instance_flush_ledger';
const FLUSH_LEDGER_LOCK_NAMESPACE = 42871;
const FLUSH_LEDGER_LOCK_KEY = 4001;
const PLAYER_ACTIVE_BACKLOG_FILTER_SQL = `
  latest_version > flushed_version
  OR (claimed_by IS NOT NULL AND claim_until >= now())
  OR (next_attempt_at IS NOT NULL AND next_attempt_at > now())
`;
const INSTANCE_ACTIVE_BACKLOG_FILTER_SQL = `
  latest_version > flushed_version
  OR (claimed_by IS NOT NULL AND claim_until >= now())
  OR (COALESCE(next_attempt_at, retry_after) IS NOT NULL AND COALESCE(next_attempt_at, retry_after) > now())
`;

/** 统一刷盘账本服务：管理玩家和实例的脏版本跟踪与分布式认领 */
@Injectable()
export class FlushLedgerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FlushLedgerService.name);
  private pool: Pool | null = null;
  private enabled = false;

  constructor(@Inject(DatabasePoolProvider) private readonly databasePoolProvider: DatabasePoolProvider | null = null) {}

  async onModuleInit(): Promise<void> {
    this.pool = this.databasePoolProvider?.getPool('flush-ledger') ?? null;
    if (!this.pool) {
      this.logger.log('刷盘账本已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }
    try {
      await ensurePlayerFlushLedgerTable(this.pool);
      await ensureInstanceFlushLedgerTable(this.pool);
      this.enabled = true;
      this.logger.log('刷盘账本已启用');
    } catch (error: unknown) {
      this.logger.error('刷盘账本初始化失败，已回退为禁用模式', error instanceof Error ? error.stack : String(error));
      await this.safeClosePool();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.safeClosePool();
  }

  isEnabled(): boolean {
    return this.enabled && this.pool !== null;
  }

  async upsertFlushTask(task: FlushTask): Promise<void> {
    if (task.scope === 'player') {
      await this.upsertPlayerFlushLedger({
        playerId: task.id,
        domain: task.domain,
        priority: task.priority,
        latestVersion: task.latestRevision,
        dirtySinceAt: task.dirtySinceAt ?? new Date().toISOString(),
        nextAttemptAt: task.nextAttemptAt ?? new Date().toISOString(),
        runtimeOwnerId: task.runtimeOwnerId ?? null,
        fencingToken: task.fencingToken ?? null,
        idempotencyKey: task.idempotencyKey ?? buildFlushTaskIdempotencyKey(task),
        payloadJson: task.payloadJson ?? null,
        failureCategory: task.failureCategory ?? null,
      });
      return;
    }
    await this.upsertInstanceFlushLedger({
      instanceId: task.id,
      domain: task.domain,
      priority: task.priority,
      ownershipEpoch: normalizePositiveInteger(task.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER),
      latestVersion: task.latestRevision,
      dirtySinceAt: task.dirtySinceAt ?? new Date().toISOString(),
      nextAttemptAt: task.nextAttemptAt ?? new Date().toISOString(),
      runtimeOwnerId: task.runtimeOwnerId ?? null,
      fencingToken: task.fencingToken ?? null,
      idempotencyKey: task.idempotencyKey ?? buildFlushTaskIdempotencyKey(task),
      payloadJson: task.payloadJson ?? null,
      failureCategory: task.failureCategory ?? null,
    });
  }

  async claimReadyFlushTasks(input: ClaimFlushTaskInput): Promise<FlushTask[]> {
    const rows = input.scope === 'player'
      ? await this.claimPlayerFlushLedger(input)
      : await this.claimInstanceFlushLedger(input);
    return rows
      .map((row) => {
        const id = input.scope === 'player'
          ? normalizeRequiredString(row.player_id)
          : normalizeRequiredString(row.instance_id);
        const domain = normalizeRequiredString(row.domain);
        if (!id || !domain) {
          return null;
        }
        const task: FlushTask = {
          scope: input.scope,
          id,
          domain,
          priority: normalizePriority(row.priority),
          latestRevision: normalizePositiveInteger(row.latest_version, 0, 0, Number.MAX_SAFE_INTEGER),
          ownershipEpoch: input.scope === 'instance'
            ? normalizePositiveInteger(row.ownership_epoch, 0, 0, Number.MAX_SAFE_INTEGER)
            : null,
          runtimeOwnerId: normalizeOptionalString(row.runtime_owner_id),
          fencingToken: normalizeOptionalString(row.fencing_token),
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

  async markFlushTaskFlushed(task: FlushTask, flushedRevision = task.latestRevision): Promise<boolean> {
    if (task.scope === 'player') {
      return this.markPlayerFlushLedgerFlushed({ playerId: task.id, domain: task.domain, flushedVersion: flushedRevision });
    }
    return this.markInstanceFlushLedgerFlushed({
      instanceId: task.id,
      domain: task.domain,
      ownershipEpoch: normalizePositiveInteger(task.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER),
      flushedVersion: flushedRevision,
    });
  }

  async markFlushTasksFlushed(tasks: FlushTask[]): Promise<number> {
    if (!this.pool || !this.enabled || tasks.length === 0) {
      return 0;
    }
    const playerTasks = tasks.filter((task) => task.scope === 'player');
    const instanceTasks = tasks.filter((task) => task.scope === 'instance');
    let updated = 0;
    if (playerTasks.length > 0) {
      const result = await this.pool.query(
        `
          WITH input AS (
            SELECT *
            FROM unnest($1::varchar[], $2::varchar[], $3::bigint[])
              AS t(player_id, domain, flushed_version)
          )
          UPDATE ${PLAYER_FLUSH_LEDGER_TABLE} ledger
          SET flushed_version = GREATEST(ledger.flushed_version, input.flushed_version),
              dirty_since_at = CASE
                WHEN GREATEST(ledger.flushed_version, input.flushed_version) >= ledger.latest_version THEN NULL
                ELSE ledger.dirty_since_at
              END,
              claimed_by = NULL,
              claim_until = NULL,
              next_attempt_at = NULL,
              retry_after = NULL,
              failure_category = NULL,
              updated_at = now()
          FROM input
          WHERE ledger.player_id = input.player_id
            AND ledger.domain = input.domain
        `,
        [
          playerTasks.map((task) => task.id),
          playerTasks.map((task) => task.domain),
          playerTasks.map((task) => Math.max(0, Math.trunc(Number(task.latestRevision ?? 0)))),
        ],
      );
      updated += result.rowCount ?? 0;
    }
    if (instanceTasks.length > 0) {
      const result = await this.pool.query(
        `
          WITH input AS (
            SELECT *
            FROM unnest($1::varchar[], $2::varchar[], $3::bigint[], $4::bigint[])
              AS t(instance_id, domain, ownership_epoch, flushed_version)
          )
          UPDATE ${INSTANCE_FLUSH_LEDGER_TABLE} ledger
          SET flushed_version = GREATEST(ledger.flushed_version, input.flushed_version),
              dirty_since_at = CASE
                WHEN GREATEST(ledger.flushed_version, input.flushed_version) >= ledger.latest_version THEN NULL
                ELSE ledger.dirty_since_at
              END,
              claimed_by = NULL,
              claim_until = NULL,
              next_attempt_at = NULL,
              retry_after = NULL,
              failure_category = NULL,
              updated_at = now()
          FROM input
          WHERE ledger.instance_id = input.instance_id
            AND ledger.domain = input.domain
            AND ledger.ownership_epoch = input.ownership_epoch
        `,
        [
          instanceTasks.map((task) => task.id),
          instanceTasks.map((task) => task.domain),
          instanceTasks.map((task) => normalizePositiveInteger(task.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER)),
          instanceTasks.map((task) => Math.max(0, Math.trunc(Number(task.latestRevision ?? 0)))),
        ],
      );
      updated += result.rowCount ?? 0;
    }
    return updated;
  }

  async markFlushTaskRetry(task: FlushTask, retryDelayMs = 5_000): Promise<boolean> {
    const ledger = this as FlushLedgerService & {
      markPlayerFlushLedgerRetry(input: { playerId: string; domain: string; retryDelayMs?: number }): Promise<boolean>;
      markInstanceFlushLedgerRetry(input: { instanceId: string; domain: string; ownershipEpoch: number; retryDelayMs?: number }): Promise<boolean>;
    };
    return task.scope === 'player'
      ? ledger.markPlayerFlushLedgerRetry({ playerId: task.id, domain: task.domain, retryDelayMs })
      : ledger.markInstanceFlushLedgerRetry({
          instanceId: task.id,
          domain: task.domain,
          ownershipEpoch: normalizePositiveInteger(task.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER),
          retryDelayMs,
        });
  }

  async markFlushTasksRetry(tasks: FlushTask[], retryDelayMs = 5_000): Promise<number> {
    if (!this.pool || !this.enabled || tasks.length === 0) {
      return 0;
    }
    const normalizedRetryDelayMs = normalizePositiveInteger(retryDelayMs, 5_000, 250, 300_000);
    const playerTasks = tasks.filter((task) => task.scope === 'player');
    const instanceTasks = tasks.filter((task) => task.scope === 'instance');
    let updated = 0;
    if (playerTasks.length > 0) {
      const result = await this.pool.query(
        `
          WITH input AS (
            SELECT *
            FROM unnest($1::varchar[], $2::varchar[])
              AS t(player_id, domain)
          )
          UPDATE ${PLAYER_FLUSH_LEDGER_TABLE} ledger
          SET next_attempt_at = now() + ($3::bigint * interval '1 millisecond'),
              retry_after = now() + ($3::bigint * interval '1 millisecond'),
              claimed_by = NULL,
              claim_until = NULL,
              updated_at = now()
          FROM input
          WHERE ledger.player_id = input.player_id
            AND ledger.domain = input.domain
        `,
        [
          playerTasks.map((task) => task.id),
          playerTasks.map((task) => task.domain),
          normalizedRetryDelayMs,
        ],
      );
      updated += result.rowCount ?? 0;
    }
    if (instanceTasks.length > 0) {
      const result = await this.pool.query(
        `
          WITH input AS (
            SELECT *
            FROM unnest($1::varchar[], $2::varchar[], $3::bigint[])
              AS t(instance_id, domain, ownership_epoch)
          )
          UPDATE ${INSTANCE_FLUSH_LEDGER_TABLE} ledger
          SET next_attempt_at = now() + ($4::bigint * interval '1 millisecond'),
              retry_after = now() + ($4::bigint * interval '1 millisecond'),
              claimed_by = NULL,
              claim_until = NULL,
              updated_at = now()
          FROM input
          WHERE ledger.instance_id = input.instance_id
            AND ledger.domain = input.domain
            AND ledger.ownership_epoch = input.ownership_epoch
        `,
        [
          instanceTasks.map((task) => task.id),
          instanceTasks.map((task) => task.domain),
          instanceTasks.map((task) => normalizePositiveInteger(task.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER)),
          normalizedRetryDelayMs,
        ],
      );
      updated += result.rowCount ?? 0;
    }
    return updated;
  }

  async upsertPlayerFlushLedger(input: {
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
  }): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    const playerId = normalizeRequiredString(input.playerId);
    const domain = normalizeRequiredString(input.domain);
    if (!playerId || !domain) {
      return;
    }
    await this.pool.query(
      `
        INSERT INTO ${PLAYER_FLUSH_LEDGER_TABLE}(
          player_id, domain, priority, latest_version, flushed_version, dirty_since_at, next_attempt_at,
          claimed_by, claim_until, runtime_owner_id, fencing_token, idempotency_key, payload_jsonb,
          failure_category, retry_after, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $7, now())
        ON CONFLICT (player_id, domain)
        DO UPDATE SET
          priority = EXCLUDED.priority,
          latest_version = GREATEST(${PLAYER_FLUSH_LEDGER_TABLE}.latest_version, EXCLUDED.latest_version),
          flushed_version = GREATEST(${PLAYER_FLUSH_LEDGER_TABLE}.flushed_version, EXCLUDED.flushed_version),
          dirty_since_at = COALESCE(EXCLUDED.dirty_since_at, ${PLAYER_FLUSH_LEDGER_TABLE}.dirty_since_at),
          next_attempt_at = COALESCE(EXCLUDED.next_attempt_at, ${PLAYER_FLUSH_LEDGER_TABLE}.next_attempt_at),
          claimed_by = COALESCE(EXCLUDED.claimed_by, ${PLAYER_FLUSH_LEDGER_TABLE}.claimed_by),
          claim_until = COALESCE(EXCLUDED.claim_until, ${PLAYER_FLUSH_LEDGER_TABLE}.claim_until),
          runtime_owner_id = COALESCE(EXCLUDED.runtime_owner_id, ${PLAYER_FLUSH_LEDGER_TABLE}.runtime_owner_id),
          fencing_token = COALESCE(EXCLUDED.fencing_token, ${PLAYER_FLUSH_LEDGER_TABLE}.fencing_token),
          idempotency_key = COALESCE(EXCLUDED.idempotency_key, ${PLAYER_FLUSH_LEDGER_TABLE}.idempotency_key),
          payload_jsonb = COALESCE(EXCLUDED.payload_jsonb, ${PLAYER_FLUSH_LEDGER_TABLE}.payload_jsonb),
          failure_category = COALESCE(EXCLUDED.failure_category, ${PLAYER_FLUSH_LEDGER_TABLE}.failure_category),
          retry_after = COALESCE(EXCLUDED.retry_after, ${PLAYER_FLUSH_LEDGER_TABLE}.retry_after),
          updated_at = now()
      `,
      [
        playerId,
        domain,
        normalizePriority(input.priority),
        Math.max(0, Math.trunc(Number(input.latestVersion ?? 0))),
        Math.max(0, Math.trunc(Number(input.flushedVersion ?? 0))),
        input.dirtySinceAt ?? null,
        input.nextAttemptAt ?? null,
        input.claimedBy ?? null,
        input.claimUntil ?? null,
        input.runtimeOwnerId ?? null,
        input.fencingToken ?? null,
        input.idempotencyKey ?? null,
        serializePayloadJson(input.payloadJson),
        input.failureCategory ?? null,
      ],
    );
  }

  async upsertInstanceFlushLedger(input: {
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
  }): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    const instanceId = normalizeRequiredString(input.instanceId);
    const domain = normalizeRequiredString(input.domain);
    if (!instanceId || !domain) {
      return;
    }
    await this.pool.query(
      `
        INSERT INTO ${INSTANCE_FLUSH_LEDGER_TABLE}(
          instance_id, domain, ownership_epoch, priority, latest_version, flushed_version, dirty_since_at,
          next_attempt_at, claimed_by, claim_until, runtime_owner_id, fencing_token, idempotency_key,
          payload_jsonb, failure_category, retry_after, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $8, now())
        ON CONFLICT (instance_id, domain, ownership_epoch)
        DO UPDATE SET
          priority = EXCLUDED.priority,
          latest_version = GREATEST(${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version, EXCLUDED.latest_version),
          flushed_version = GREATEST(${INSTANCE_FLUSH_LEDGER_TABLE}.flushed_version, EXCLUDED.flushed_version),
          dirty_since_at = COALESCE(EXCLUDED.dirty_since_at, ${INSTANCE_FLUSH_LEDGER_TABLE}.dirty_since_at),
          next_attempt_at = COALESCE(EXCLUDED.next_attempt_at, ${INSTANCE_FLUSH_LEDGER_TABLE}.next_attempt_at),
          claimed_by = COALESCE(EXCLUDED.claimed_by, ${INSTANCE_FLUSH_LEDGER_TABLE}.claimed_by),
          claim_until = COALESCE(EXCLUDED.claim_until, ${INSTANCE_FLUSH_LEDGER_TABLE}.claim_until),
          runtime_owner_id = COALESCE(EXCLUDED.runtime_owner_id, ${INSTANCE_FLUSH_LEDGER_TABLE}.runtime_owner_id),
          fencing_token = COALESCE(EXCLUDED.fencing_token, ${INSTANCE_FLUSH_LEDGER_TABLE}.fencing_token),
          idempotency_key = COALESCE(EXCLUDED.idempotency_key, ${INSTANCE_FLUSH_LEDGER_TABLE}.idempotency_key),
          payload_jsonb = COALESCE(EXCLUDED.payload_jsonb, ${INSTANCE_FLUSH_LEDGER_TABLE}.payload_jsonb),
          failure_category = COALESCE(EXCLUDED.failure_category, ${INSTANCE_FLUSH_LEDGER_TABLE}.failure_category),
          retry_after = COALESCE(EXCLUDED.retry_after, ${INSTANCE_FLUSH_LEDGER_TABLE}.retry_after),
          updated_at = now()
      `,
      [
        instanceId,
        domain,
        Math.max(0, Math.trunc(Number(input.ownershipEpoch ?? 0))),
        normalizePriority(input.priority),
        Math.max(0, Math.trunc(Number(input.latestVersion ?? 0))),
        Math.max(0, Math.trunc(Number(input.flushedVersion ?? 0))),
        input.dirtySinceAt ?? null,
        input.nextAttemptAt ?? null,
        input.claimedBy ?? null,
        input.claimUntil ?? null,
        input.runtimeOwnerId ?? null,
        input.fencingToken ?? null,
        input.idempotencyKey ?? null,
        serializePayloadJson(input.payloadJson),
        input.failureCategory ?? null,
      ],
    );
  }

  async claimPlayerFlushLedger(input: {
    workerId: string;
    domain?: string | null;
    priority?: FlushTaskPriority | null;
    limit?: number;
  }): Promise<Array<Record<string, unknown>>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const workerId = normalizeRequiredString(input.workerId);
    if (!workerId) {
      return [];
    }
    const domain = normalizeRequiredString(input.domain);
    const limit = normalizePositiveInteger(input.limit, 32, 1, 5_000);
    const queryParams: Array<string | number> = [workerId];
    const filters = [
      'latest_version > flushed_version',
      '(COALESCE(next_attempt_at, retry_after) IS NULL OR COALESCE(next_attempt_at, retry_after) <= now())',
      '(claim_until IS NULL OR claim_until < now())',
    ];
    if (domain) {
      queryParams.push(domain);
      filters.push(`domain = $${queryParams.length}`);
    }
    const priority = normalizeOptionalPriority(input.priority);
    if (priority) {
      queryParams.push(priority);
      filters.push(`priority = $${queryParams.length}`);
    }
    queryParams.push(limit);
    const limitParam = `$${queryParams.length}`;
    const result = await this.pool.query(
      `
        WITH claimed AS (
          UPDATE ${PLAYER_FLUSH_LEDGER_TABLE}
          SET claimed_by = $1,
              claim_until = now() + interval '5 second'
          WHERE (player_id, domain) IN (
            SELECT player_id, domain
            FROM ${PLAYER_FLUSH_LEDGER_TABLE}
            WHERE ${filters.join(' AND ')}
            ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 WHEN 'low' THEN 2 ELSE 1 END ASC,
                     dirty_since_at ASC NULLS LAST,
                     updated_at ASC,
                     player_id ASC
            LIMIT ${limitParam}
            FOR UPDATE SKIP LOCKED
          )
          RETURNING player_id, domain, priority, latest_version, flushed_version, dirty_since_at, next_attempt_at,
            claimed_by, claim_until, runtime_owner_id, fencing_token, idempotency_key, payload_jsonb,
            failure_category, retry_after, created_at, updated_at
        )
        SELECT * FROM claimed
      `,
      queryParams,
    );
    return Array.isArray(result.rows) ? (result.rows as Record<string, unknown>[]) : [];
  }

  async claimInstanceFlushLedger(input: {
    workerId: string;
    domain?: string | null;
    priority?: FlushTaskPriority | null;
    ownershipEpoch?: number | null;
    limit?: number;
  }): Promise<Array<Record<string, unknown>>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const workerId = normalizeRequiredString(input.workerId);
    if (!workerId) {
      return [];
    }
    const limit = normalizePositiveInteger(input.limit, 32, 1, 5_000);
    const queryParams: Array<string | number> = [workerId];
    const filters = [
      'latest_version > flushed_version',
      '(COALESCE(next_attempt_at, retry_after) IS NULL OR COALESCE(next_attempt_at, retry_after) <= now())',
      '(claim_until IS NULL OR claim_until < now())',
    ];
    const domain = normalizeRequiredString(input.domain);
    if (domain) {
      queryParams.push(domain);
      filters.push(`domain = $${queryParams.length}`);
    }
    const priority = normalizeOptionalPriority(input.priority);
    if (priority) {
      queryParams.push(priority);
      filters.push(`priority = $${queryParams.length}`);
    }
    const parsedOwnershipEpoch = Number(input.ownershipEpoch);
    if (Number.isFinite(parsedOwnershipEpoch) && parsedOwnershipEpoch >= 0) {
      queryParams.push(Math.trunc(parsedOwnershipEpoch));
      filters.push(`ownership_epoch = $${queryParams.length}`);
    }
    queryParams.push(limit);
    const limitParam = `$${queryParams.length}`;
    const result = await this.pool.query(
      `
        WITH claimed AS (
          UPDATE ${INSTANCE_FLUSH_LEDGER_TABLE}
          SET claimed_by = $1,
              claim_until = now() + interval '5 second'
          WHERE (instance_id, domain, ownership_epoch) IN (
            SELECT instance_id, domain, ownership_epoch
            FROM ${INSTANCE_FLUSH_LEDGER_TABLE}
            WHERE ${filters.join(' AND ')}
            ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 WHEN 'low' THEN 2 ELSE 1 END ASC,
                     dirty_since_at ASC NULLS LAST,
                     updated_at ASC,
                     instance_id ASC
            LIMIT ${limitParam}
            FOR UPDATE SKIP LOCKED
          )
          RETURNING instance_id, domain, ownership_epoch, priority, latest_version, flushed_version, dirty_since_at,
            next_attempt_at, claimed_by, claim_until, runtime_owner_id, fencing_token, idempotency_key,
            payload_jsonb, failure_category, retry_after, created_at, updated_at
        )
        SELECT * FROM claimed
      `,
      queryParams,
    );
    return Array.isArray(result.rows) ? (result.rows as Record<string, unknown>[]) : [];
  }

  async markPlayerFlushLedgerFlushed(input: { playerId: string; domain: string; flushedVersion: number }): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const playerId = normalizeRequiredString(input.playerId);
    const domain = normalizeRequiredString(input.domain);
    if (!playerId || !domain) {
      return false;
    }
    const result = await this.pool.query(
      `
        UPDATE ${PLAYER_FLUSH_LEDGER_TABLE}
        SET flushed_version = GREATEST(flushed_version, $3),
            dirty_since_at = CASE WHEN GREATEST(flushed_version, $3) >= latest_version THEN NULL ELSE dirty_since_at END,
            claimed_by = NULL,
            claim_until = NULL,
            next_attempt_at = NULL,
            updated_at = now()
        WHERE player_id = $1 AND domain = $2
      `,
      [playerId, domain, Math.max(0, Math.trunc(Number(input.flushedVersion ?? 0)))],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markInstanceFlushLedgerFlushed(input: { instanceId: string; domain: string; ownershipEpoch: number; flushedVersion: number }): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const instanceId = normalizeRequiredString(input.instanceId);
    const domain = normalizeRequiredString(input.domain);
    if (!instanceId || !domain) {
      return false;
    }
    const result = await this.pool.query(
      `
        UPDATE ${INSTANCE_FLUSH_LEDGER_TABLE}
        SET flushed_version = GREATEST(flushed_version, $4),
            dirty_since_at = CASE WHEN GREATEST(flushed_version, $4) >= latest_version THEN NULL ELSE dirty_since_at END,
            claimed_by = NULL,
            claim_until = NULL,
            next_attempt_at = NULL,
            updated_at = now()
        WHERE instance_id = $1 AND domain = $2 AND ownership_epoch = $3
      `,
      [instanceId, domain, Math.max(0, Math.trunc(Number(input.ownershipEpoch ?? 0))), Math.max(0, Math.trunc(Number(input.flushedVersion ?? 0)))],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markPlayerFlushLedgerRetry(input: { playerId: string; domain: string; retryDelayMs?: number }): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const playerId = normalizeRequiredString(input.playerId);
    const domain = normalizeRequiredString(input.domain);
    if (!playerId || !domain) {
      return false;
    }
    const retryDelayMs = normalizePositiveInteger(input.retryDelayMs, 5_000, 250, 300_000);
    const result = await this.pool.query(
      `
        UPDATE ${PLAYER_FLUSH_LEDGER_TABLE}
        SET next_attempt_at = now() + ($3::bigint * interval '1 millisecond'),
            claimed_by = NULL,
            claim_until = NULL,
            updated_at = now()
        WHERE player_id = $1 AND domain = $2
      `,
      [playerId, domain, retryDelayMs],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markInstanceFlushLedgerRetry(input: { instanceId: string; domain: string; ownershipEpoch: number; retryDelayMs?: number }): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const instanceId = normalizeRequiredString(input.instanceId);
    const domain = normalizeRequiredString(input.domain);
    if (!instanceId || !domain) {
      return false;
    }
    const retryDelayMs = normalizePositiveInteger(input.retryDelayMs, 5_000, 250, 300_000);
    const result = await this.pool.query(
      `
        UPDATE ${INSTANCE_FLUSH_LEDGER_TABLE}
        SET next_attempt_at = now() + ($4::bigint * interval '1 millisecond'),
            claimed_by = NULL,
            claim_until = NULL,
            updated_at = now()
        WHERE instance_id = $1 AND domain = $2 AND ownership_epoch = $3
      `,
      [instanceId, domain, normalizePositiveInteger(input.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER), retryDelayMs],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listPlayerBacklogSummary(): Promise<Array<Record<string, unknown>>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const result = await this.pool.query(
      `
        SELECT
          domain,
          MAX(priority) AS priority,
          COUNT(*)::bigint AS backlog_count,
          COUNT(*) FILTER (WHERE latest_version > flushed_version)::bigint AS dirty_count,
          COUNT(*) FILTER (
            WHERE latest_version > flushed_version
              AND (next_attempt_at IS NULL OR next_attempt_at <= now())
              AND (claim_until IS NULL OR claim_until < now())
          )::bigint AS due_count,
          COUNT(*) FILTER (WHERE claimed_by IS NOT NULL AND claim_until >= now())::bigint AS claimed_count,
          COUNT(*) FILTER (WHERE next_attempt_at IS NOT NULL AND next_attempt_at > now())::bigint AS delayed_count,
          COALESCE(MIN(next_attempt_at), MIN(updated_at)) AS oldest_pending_at
        FROM ${PLAYER_FLUSH_LEDGER_TABLE}
        WHERE ${PLAYER_ACTIVE_BACKLOG_FILTER_SQL}
        GROUP BY domain
        ORDER BY backlog_count DESC, domain ASC
      `,
    );
    return Array.isArray(result.rows) ? (result.rows as Record<string, unknown>[]) : [];
  }

  async listInstanceBacklogSummary(): Promise<Array<Record<string, unknown>>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const result = await this.pool.query(
      `
        SELECT
          domain,
          ownership_epoch,
          MAX(priority) AS priority,
          COUNT(*)::bigint AS backlog_count,
          COUNT(*) FILTER (WHERE latest_version > flushed_version)::bigint AS dirty_count,
          COUNT(*) FILTER (
            WHERE latest_version > flushed_version
              AND (COALESCE(next_attempt_at, retry_after) IS NULL OR COALESCE(next_attempt_at, retry_after) <= now())
              AND (claim_until IS NULL OR claim_until < now())
          )::bigint AS due_count,
          COUNT(*) FILTER (WHERE claimed_by IS NOT NULL AND claim_until >= now())::bigint AS claimed_count,
          COUNT(*) FILTER (WHERE COALESCE(next_attempt_at, retry_after) IS NOT NULL AND COALESCE(next_attempt_at, retry_after) > now())::bigint AS delayed_count,
          COALESCE(MIN(COALESCE(next_attempt_at, retry_after)), MIN(updated_at)) AS oldest_pending_at
        FROM ${INSTANCE_FLUSH_LEDGER_TABLE}
        WHERE ${INSTANCE_ACTIVE_BACKLOG_FILTER_SQL}
        GROUP BY domain, ownership_epoch
        ORDER BY backlog_count DESC, domain ASC, ownership_epoch ASC
      `,
    );
    return Array.isArray(result.rows) ? (result.rows as Record<string, unknown>[]) : [];
  }

  async listPlayerRecentThroughputSummary(input?: { windowSeconds?: number }): Promise<Array<Record<string, unknown>>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const windowSeconds = normalizePositiveInteger(input?.windowSeconds, 60, 1, 86_400);
    const result = await this.pool.query(
      `
        SELECT
          domain,
          COUNT(*)::bigint AS write_count,
          ROUND(COUNT(*)::numeric / NULLIF($1::numeric, 0), 6) AS writes_per_second,
          COALESCE(MAX(updated_at), MAX(COALESCE(dirty_since_at, TO_CHAR(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::timestamptz)) AS latest_updated_at
        FROM ${PLAYER_FLUSH_LEDGER_TABLE}
        WHERE updated_at >= now() - ($1::bigint * interval '1 second')
        GROUP BY domain
        ORDER BY write_count DESC, domain ASC
      `,
      [windowSeconds],
    );
    return Array.isArray(result.rows) ? (result.rows as Record<string, unknown>[]) : [];
  }

  async listInstanceRecentThroughputSummary(input?: { windowSeconds?: number }): Promise<Array<Record<string, unknown>>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const windowSeconds = normalizePositiveInteger(input?.windowSeconds, 60, 1, 86_400);
    const result = await this.pool.query(
      `
        SELECT
          domain,
          ownership_epoch,
          COUNT(*)::bigint AS write_count,
          ROUND(COUNT(*)::numeric / NULLIF($1::numeric, 0), 6) AS writes_per_second,
          COALESCE(MAX(updated_at), MAX(COALESCE(dirty_since_at, now()))) AS latest_updated_at
        FROM ${INSTANCE_FLUSH_LEDGER_TABLE}
        WHERE updated_at >= now() - ($1::bigint * interval '1 second')
        GROUP BY domain, ownership_epoch
        ORDER BY write_count DESC, domain ASC, ownership_epoch ASC
      `,
      [windowSeconds],
    );
    return Array.isArray(result.rows) ? (result.rows as Record<string, unknown>[]) : [];
  }

  private async safeClosePool(): Promise<void> {
    // 共享连接池由 DatabasePoolProvider 统一关闭，此处只释放引用。
    this.pool = null;
    this.enabled = false;
  }
}

async function ensurePlayerFlushLedgerTable(pool: Pool): Promise<void> {
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
      ON ${PLAYER_FLUSH_LEDGER_TABLE}(priority, domain, latest_version, flushed_version, claim_until, dirty_since_at, updated_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_flush_ledger_domain_pending_idx
      ON ${PLAYER_FLUSH_LEDGER_TABLE}(priority, domain, latest_version, flushed_version, claim_until, dirty_since_at, updated_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_flush_ledger_claim_idx
      ON ${PLAYER_FLUSH_LEDGER_TABLE}(claimed_by, claim_until)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_flush_ledger_idempotency_idx
      ON ${PLAYER_FLUSH_LEDGER_TABLE}(idempotency_key)
      WHERE idempotency_key IS NOT NULL
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

async function ensureInstanceFlushLedgerTable(pool: Pool): Promise<void> {
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
      ON ${INSTANCE_FLUSH_LEDGER_TABLE}(priority, domain, ownership_epoch, latest_version, flushed_version, claim_until, dirty_since_at, updated_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_flush_ledger_domain_pending_idx
      ON ${INSTANCE_FLUSH_LEDGER_TABLE}(priority, domain, ownership_epoch, latest_version, flushed_version, claim_until, dirty_since_at, updated_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_flush_ledger_claim_idx
      ON ${INSTANCE_FLUSH_LEDGER_TABLE}(claimed_by, claim_until)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS instance_flush_ledger_idempotency_idx
      ON ${INSTANCE_FLUSH_LEDGER_TABLE}(idempotency_key)
      WHERE idempotency_key IS NOT NULL
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


function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalTimestamp(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function serializePayloadJson(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return JSON.stringify(value);
}

function buildFlushTaskIdempotencyKey(task: FlushTask): string {
  const epoch = task.scope === 'instance' ? normalizePositiveInteger(task.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER) : 0;
  return `${task.scope}:${task.id}:${task.domain}:${epoch}:${Math.max(0, Math.trunc(Number(task.latestRevision ?? 0)))}`;
}

function normalizePriority(value: unknown): FlushTaskPriority {
  return value === 'high' || value === 'low' || value === 'normal' ? value : 'normal';
}

function normalizeOptionalPriority(value: unknown): FlushTaskPriority | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return normalizePriority(value);
}

function normalizePositiveInteger(value: unknown, defaultValue: number, min: number, max: number): number {
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
