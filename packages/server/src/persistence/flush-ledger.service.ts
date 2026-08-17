/**
 * 本文件属于持久化边界，负责数据库真源、flush、兼容转换或失败策略等可靠性逻辑。
 *
 * 维护时要优先考虑幂等、崩溃恢复和自动清理，避免在 tick 内直接引入阻塞 IO。
 */
/**
 * 统一刷盘账本服务。
 * 同时管理玩家和实例两类 flush ledger 表，提供 upsert/claim/markFlushed 和积压摘要查询，
 * 为分布式刷盘调度提供持久化协调。
 */
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Pool } from 'pg';

import { DatabasePoolProvider } from './database-pool.provider';
import type { ClaimFlushTaskInput, FlushTask, FlushTaskPriority, FlushTaskScope } from './flush-task.types';
import { buildPersistedInventoryItemRawPayload } from './inventory-item-persistence';
import {
  listPlayerInventoryPayloadItemInstanceIds,
  readPlayerInventoryPayloadFence,
  rebasePlayerInventoryPayloadFenceForOfflineRecovery,
  repairPlayerInventoryOwnershipConflictPayload,
  type PlayerInventoryItemInstanceIdRemap,
  type PlayerInventoryOwnershipConflict,
} from './player-flush-asset-conflict-repair';

const PLAYER_FLUSH_LEDGER_TABLE = 'player_flush_ledger';
const INSTANCE_FLUSH_LEDGER_TABLE = 'instance_flush_ledger';
export const PLAYER_FLUSH_ASSET_CONFLICT_QUARANTINE = 'startup_asset_conflict';
export const PLAYER_FLUSH_STARTUP_STALL_QUARANTINE = 'startup_deterministic_stall';
export const INSTANCE_FLUSH_STARTUP_STALL_QUARANTINE = 'startup_deterministic_stall';
/**
 * 启动期隔离类别全集：隔离行不会被 claim/count 视为 pending，
 * 等待人工核对数据后显式解除（failure_category 置 NULL）。
 */
const PLAYER_FLUSH_QUARANTINE_CATEGORIES = [
  PLAYER_FLUSH_ASSET_CONFLICT_QUARANTINE,
  PLAYER_FLUSH_STARTUP_STALL_QUARANTINE,
] as const;
const INSTANCE_FLUSH_QUARANTINE_CATEGORIES = [
  INSTANCE_FLUSH_STARTUP_STALL_QUARANTINE,
] as const;
const PLAYER_FLUSH_QUARANTINE_CATEGORIES_SQL = PLAYER_FLUSH_QUARANTINE_CATEGORIES
  .map((category) => `'${category}'`)
  .join(', ');
const INSTANCE_FLUSH_QUARANTINE_CATEGORIES_SQL = INSTANCE_FLUSH_QUARANTINE_CATEGORIES
  .map((category) => `'${category}'`)
  .join(', ');
const PLAYER_FLUSH_NOT_QUARANTINED_SQL = `(
  failure_category IS NULL
  OR failure_category NOT IN (${PLAYER_FLUSH_QUARANTINE_CATEGORIES_SQL})
)`;
const INSTANCE_FLUSH_NOT_QUARANTINED_SQL = `(
  failure_category IS NULL
  OR failure_category NOT IN (${INSTANCE_FLUSH_QUARANTINE_CATEGORIES_SQL})
)`;

function buildNotQuarantinedFilterSql(alias: string): string {
  return `(
    ${alias}.failure_category IS NULL
    OR ${alias}.failure_category NOT IN (${PLAYER_FLUSH_QUARANTINE_CATEGORIES_SQL})
  )`;
}
const FLUSH_LEDGER_LOCK_NAMESPACE = 42871;
const FLUSH_LEDGER_LOCK_KEY = 4001;
const PLAYER_FLUSH_GROUP_CLAIM_LOCK_NAMESPACE = 42872;
const DEFAULT_FLUSH_LEDGER_BATCH_SIZE = 250;
const MAX_FLUSH_LEDGER_BATCH_SIZE = 1_000;
const DEFAULT_FLUSH_TASK_CLAIM_TTL_MS = 30_000;
const MIN_FLUSH_TASK_CLAIM_TTL_MS = 5_000;
const MAX_FLUSH_TASK_CLAIM_TTL_MS = 5 * 60_000;
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

export interface FlushLedgerRetentionResult {
  playerPayloadCleared: number;
  instancePayloadCleared: number;
  playerDeleted: number;
  instanceDeleted: number;
}

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

export interface FlushTaskUpsertIdentity {
  scope: FlushTaskScope;
  id: string;
  domain: string;
  ownershipEpoch: number | null;
}

export interface FlushTaskUpsertResult {
  changed: number;
  accepted: FlushTaskUpsertIdentity[];
}

export interface PlayerFlushAssetConflictRepairDetail extends PlayerInventoryItemInstanceIdRemap {
  playerId: string;
}

export interface PlayerFlushAssetConflictRepairSummary {
  scannedPlayers: number;
  repairedPlayers: number;
  releasedPayloads: number;
  rekeyedItems: number;
  rebasedFences: number;
  coveredByWatermarkPlayers: number;
  unresolvedPlayers: string[];
  repairs: PlayerFlushAssetConflictRepairDetail[];
}

export interface PlayerFlushAssetConflictRepairOptions {
  allowOfflineFenceRebase?: boolean;
  logUnresolved?: boolean;
  /**
   * 登录恢复持有玩家资产锁时提供的运行时物品身份。
   * 只有待换发旧 ID 仍由该运行时持有，且 itemId 与完整持久化实例态一致，事务才允许解除隔离。
   */
  runtimeInventoryItems?: ReadonlyArray<{
    itemInstanceId?: unknown;
    itemId?: unknown;
    [key: string]: unknown;
  }>;
}

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
    await this.upsertFlushTasks([task]);
  }

  /**
   * 批量写入统一刷盘账本。输入会先按主键归并，再以有限批次执行单条 SQL，
   * 避免同一批中重复主键触发 PostgreSQL ON CONFLICT 二次更新错误。
   * staging 与 consumer 会并发修改同一批行，所有批量 DML 必须保持主键锁序一致。
   */
  async upsertFlushTasks(tasks: FlushTask[], batchSize = DEFAULT_FLUSH_LEDGER_BATCH_SIZE): Promise<number> {
    return (await this.upsertFlushTasksDetailed(tasks, batchSize)).changed;
  }

  /**
   * 批量写入账本并返回实际通过 generation CAS 的任务主键。
   *
   * staging 在组包期间允许 durable writer 抢先写入更新版本；调用方必须只对 accepted
   * 条目转移 runtime dirty 义务，被更新版本覆盖的条目应保留 dirty 并在下一轮重建。
   */
  async upsertFlushTasksDetailed(
    tasks: FlushTask[],
    batchSize = DEFAULT_FLUSH_LEDGER_BATCH_SIZE,
  ): Promise<FlushTaskUpsertResult> {
    if (!this.pool || !this.enabled || tasks.length === 0) {
      return { changed: 0, accepted: [] };
    }
    const stagedAt = new Date().toISOString();
    const playerInputs: PlayerFlushLedgerUpsertInput[] = [];
    const instanceInputs: InstanceFlushLedgerUpsertInput[] = [];
    for (const task of tasks) {
      if (task.scope === 'player') {
        playerInputs.push({
          playerId: task.id,
          domain: task.domain,
          priority: task.priority,
          latestVersion: task.latestRevision,
          dirtySinceAt: task.dirtySinceAt ?? stagedAt,
          nextAttemptAt: task.nextAttemptAt ?? stagedAt,
          runtimeOwnerId: task.runtimeOwnerId ?? null,
          fencingToken: task.fencingToken ?? null,
          idempotencyKey: task.idempotencyKey ?? buildFlushTaskIdempotencyKey(task),
          payloadJson: task.payloadJson ?? null,
          failureCategory: task.failureCategory ?? null,
        });
      } else {
        instanceInputs.push({
          instanceId: task.id,
          domain: task.domain,
          priority: task.priority,
          ownershipEpoch: normalizePositiveInteger(task.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER),
          latestVersion: task.latestRevision,
          dirtySinceAt: task.dirtySinceAt ?? stagedAt,
          nextAttemptAt: task.nextAttemptAt ?? stagedAt,
          runtimeOwnerId: task.runtimeOwnerId ?? null,
          fencingToken: task.fencingToken ?? null,
          idempotencyKey: task.idempotencyKey ?? buildFlushTaskIdempotencyKey(task),
          payloadJson: task.payloadJson ?? null,
          failureCategory: task.failureCategory ?? null,
        });
      }
    }
    const playerResult = await this.upsertPlayerFlushLedgersDetailed(playerInputs, batchSize);
    const instanceResult = await this.upsertInstanceFlushLedgersDetailed(instanceInputs, batchSize);
    return {
      changed: playerResult.changed + instanceResult.changed,
      accepted: [...playerResult.accepted, ...instanceResult.accepted],
    };
  }

  async claimReadyFlushTasks(input: ClaimFlushTaskInput): Promise<FlushTask[]> {
    const rows = input.scope === 'player'
      ? await this.claimPlayerFlushLedger(input)
      : await this.claimInstanceFlushLedger(input);
    return mapFlushLedgerRowsToTasks(input.scope, rows);
  }

  /**
   * 以 playerId 为认领单位：候选优先级和额度按玩家计算，一旦选中便接管该玩家指定领域范围内的全部待刷行。
   * 事务级 advisory lock 与“范围内任一活跃 claim 则整组跳过”共同阻止不同 worker 拆分同一玩家投影。
   */
  async claimReadyPlayerFlushTaskGroups(
    input: Omit<ClaimFlushTaskInput, 'scope' | 'ownershipEpoch'> & { includedDomains?: readonly string[] },
  ): Promise<FlushTask[]> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const workerId = normalizeRequiredString(input.workerId);
    if (!workerId) {
      return [];
    }
    const claimOwnerId = buildClaimOwnerId(workerId);
    const claimTtlMs = resolveFlushTaskClaimTtlMs(input.claimTtlMs);
    const playerLimit = normalizePositiveInteger(input.limit, 32, 1, 5_000);
    const candidateLimit = Math.min(20_000, Math.max(playerLimit, playerLimit * 4));
    const queryParams: Array<string | number | string[]> = [
      claimOwnerId,
      claimTtlMs,
      PLAYER_FLUSH_GROUP_CLAIM_LOCK_NAMESPACE,
    ];
    const candidateFilters = [
      'candidate.latest_version > candidate.flushed_version',
      '(candidate.claim_until IS NULL OR candidate.claim_until < now())',
      buildNotQuarantinedFilterSql('candidate'),
    ];
    if (input.includeDelayed !== true) {
      candidateFilters.push('(COALESCE(candidate.next_attempt_at, candidate.retry_after) IS NULL OR COALESCE(candidate.next_attempt_at, candidate.retry_after) <= now())');
    }
    if (input.payloadRequired === true) {
      candidateFilters.push('candidate.payload_jsonb IS NOT NULL');
    }
    const includedDomains = Array.from(new Set(
      (input.includedDomains ?? [])
        .map((entry) => normalizeRequiredString(entry))
        .filter(Boolean),
    )).sort();
    let includedDomainsParam: string | null = null;
    if (input.includedDomains && includedDomains.length === 0) {
      return [];
    }
    if (includedDomains.length > 0) {
      queryParams.push(includedDomains);
      includedDomainsParam = `$${queryParams.length}`;
      candidateFilters.push(`candidate.domain = ANY(${includedDomainsParam}::varchar[])`);
    }
    const playerId = normalizeRequiredString(input.id);
    if (playerId) {
      queryParams.push(playerId);
      candidateFilters.push(`candidate.player_id = $${queryParams.length}`);
    }
    const domain = normalizeRequiredString(input.domain);
    if (domain) {
      queryParams.push(domain);
      candidateFilters.push(`candidate.domain = $${queryParams.length}`);
    }
    const priority = normalizeOptionalPriority(input.priority);
    if (priority) {
      queryParams.push(priority);
      candidateFilters.push(`candidate.priority = $${queryParams.length}`);
    }
    queryParams.push(candidateLimit);
    const candidateLimitParam = `$${queryParams.length}`;
    queryParams.push(playerLimit);
    const playerLimitParam = `$${queryParams.length}`;
    const claimedPayloadFilter = input.payloadRequired === true ? 'AND ledger.payload_jsonb IS NOT NULL' : '';
    const claimedDomainFilter = includedDomainsParam
      ? `AND ledger.domain = ANY(${includedDomainsParam}::varchar[])`
      : '';
    const activeClaimDomainFilter = includedDomainsParam
      ? `AND active_claim.domain = ANY(${includedDomainsParam}::varchar[])`
      : '';
    const result = await this.pool.query<Record<string, unknown>>(
      `
        WITH candidate_players AS MATERIALIZED (
          SELECT
            candidate.player_id,
            MIN(candidate.dirty_since_at) AS oldest_dirty_since_at,
            MIN(candidate.updated_at) AS oldest_updated_at
          FROM ${PLAYER_FLUSH_LEDGER_TABLE} candidate
          WHERE ${candidateFilters.join(' AND ')}
            AND NOT EXISTS (
              SELECT 1
              FROM ${PLAYER_FLUSH_LEDGER_TABLE} active_claim
              WHERE active_claim.player_id = candidate.player_id
                AND active_claim.latest_version > active_claim.flushed_version
                ${activeClaimDomainFilter}
                AND active_claim.claimed_by IS NOT NULL
                AND active_claim.claim_until >= now()
            )
          GROUP BY candidate.player_id
          ORDER BY MIN(candidate.dirty_since_at) ASC NULLS LAST,
                   MIN(candidate.updated_at) ASC,
                   candidate.player_id ASC
          LIMIT ${candidateLimitParam}
        ), locked_players AS MATERIALIZED (
          SELECT candidate.player_id
          FROM candidate_players candidate
          WHERE pg_try_advisory_xact_lock($3::integer, hashtext(candidate.player_id))
          ORDER BY candidate.oldest_dirty_since_at ASC NULLS LAST,
                   candidate.oldest_updated_at ASC,
                   candidate.player_id ASC
          LIMIT ${playerLimitParam}
        ), claimable AS MATERIALIZED (
          SELECT ledger.player_id, ledger.domain
          FROM ${PLAYER_FLUSH_LEDGER_TABLE} ledger
          INNER JOIN locked_players ON locked_players.player_id = ledger.player_id
          WHERE ledger.latest_version > ledger.flushed_version
            AND (ledger.claim_until IS NULL OR ledger.claim_until < now())
            AND ${buildNotQuarantinedFilterSql('ledger')}
            ${claimedPayloadFilter}
            ${claimedDomainFilter}
          ORDER BY ledger.player_id ASC, ledger.domain ASC
          FOR UPDATE OF ledger
        ), claimed AS (
          UPDATE ${PLAYER_FLUSH_LEDGER_TABLE} ledger
          SET claimed_by = $1,
              claim_until = now() + ($2::bigint * interval '1 millisecond')
          FROM claimable
          WHERE ledger.player_id = claimable.player_id
            AND ledger.domain = claimable.domain
          RETURNING ledger.player_id, ledger.domain, ledger.priority, ledger.latest_version,
            ledger.flushed_version, ledger.dirty_since_at, ledger.next_attempt_at, ledger.claimed_by,
            ledger.claim_until, ledger.runtime_owner_id, ledger.fencing_token, ledger.idempotency_key,
            ledger.payload_jsonb, ledger.failure_category, ledger.retry_after, ledger.created_at,
            ledger.updated_at
        )
        SELECT *
        FROM claimed
        ORDER BY player_id ASC,
                 CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 WHEN 'low' THEN 2 ELSE 1 END ASC,
                 domain ASC
      `,
      queryParams,
    );
    return mapFlushLedgerRowsToTasks('player', result.rows);
  }

  async markFlushTaskFlushed(task: FlushTask, flushedRevision = task.latestRevision): Promise<boolean> {
    const claimOwnerId = normalizeOptionalString(task.claimOwnerId);
    if (!claimOwnerId) {
      return false;
    }
    if (task.scope === 'player') {
      return this.markPlayerFlushLedgerFlushed({
        playerId: task.id,
        domain: task.domain,
        flushedVersion: flushedRevision,
        claimOwnerId,
        fencingToken: task.fencingToken ?? null,
      });
    }
    return this.markInstanceFlushLedgerFlushed({
      instanceId: task.id,
      domain: task.domain,
      ownershipEpoch: normalizePositiveInteger(task.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER),
      flushedVersion: flushedRevision,
      claimOwnerId,
      fencingToken: task.fencingToken ?? null,
    });
  }

  async markFlushTasksFlushed(tasks: FlushTask[]): Promise<number> {
    if (!this.pool || !this.enabled || tasks.length === 0) {
      return 0;
    }
    const claimedTasks = dedupeClaimedFlushTasks(tasks);
    const playerTasks = claimedTasks.filter((task) => task.scope === 'player');
    const instanceTasks = claimedTasks.filter((task) => task.scope === 'instance');
    let updated = 0;
    if (playerTasks.length > 0) {
      const result = await this.pool.query(
        `
          WITH input AS MATERIALIZED (
            SELECT * FROM jsonb_to_recordset($1::jsonb) AS claimed(
              player_id varchar(100), domain varchar(64), flushed_version bigint,
              claim_owner_id varchar(120), fencing_token varchar(120)
            )
          ), locked AS MATERIALIZED (
            SELECT ledger.player_id, ledger.domain, input.flushed_version
            FROM ${PLAYER_FLUSH_LEDGER_TABLE} ledger
            INNER JOIN input
              ON input.player_id = ledger.player_id
             AND input.domain = ledger.domain
            WHERE ledger.claimed_by = input.claim_owner_id
              AND ledger.fencing_token IS NOT DISTINCT FROM input.fencing_token
            ORDER BY ledger.player_id ASC, ledger.domain ASC
            FOR UPDATE OF ledger
          )
          UPDATE ${PLAYER_FLUSH_LEDGER_TABLE} ledger
          SET flushed_version = LEAST(GREATEST(ledger.flushed_version, locked.flushed_version), ledger.latest_version),
              dirty_since_at = CASE
                WHEN LEAST(GREATEST(ledger.flushed_version, locked.flushed_version), ledger.latest_version) >= ledger.latest_version THEN NULL
                ELSE ledger.dirty_since_at
              END,
              payload_jsonb = CASE
                WHEN LEAST(GREATEST(ledger.flushed_version, locked.flushed_version), ledger.latest_version) >= ledger.latest_version THEN NULL
                ELSE ledger.payload_jsonb
              END,
              claimed_by = NULL,
              claim_until = NULL,
              next_attempt_at = NULL,
              retry_after = NULL,
              failure_category = NULL,
              updated_at = now()
          FROM locked
          WHERE ledger.player_id = locked.player_id
            AND ledger.domain = locked.domain
        `,
        [
          JSON.stringify(playerTasks.map((task) => ({
            player_id: task.id,
            domain: task.domain,
            flushed_version: normalizeRevision(task.latestRevision),
            claim_owner_id: task.claimOwnerId,
            fencing_token: task.fencingToken ?? null,
          }))),
        ],
      );
      updated += result.rowCount ?? 0;
    }
    if (instanceTasks.length > 0) {
      const result = await this.pool.query(
        `
          WITH input AS MATERIALIZED (
            SELECT * FROM jsonb_to_recordset($1::jsonb) AS claimed(
              instance_id varchar(100), domain varchar(64), ownership_epoch bigint,
              flushed_version bigint, claim_owner_id varchar(120), fencing_token varchar(120)
            )
          ), locked AS MATERIALIZED (
            SELECT ledger.instance_id, ledger.domain, ledger.ownership_epoch, input.flushed_version
            FROM ${INSTANCE_FLUSH_LEDGER_TABLE} ledger
            INNER JOIN input
              ON input.instance_id = ledger.instance_id
             AND input.domain = ledger.domain
             AND input.ownership_epoch = ledger.ownership_epoch
            WHERE ledger.claimed_by = input.claim_owner_id
              AND ledger.fencing_token IS NOT DISTINCT FROM input.fencing_token
            ORDER BY ledger.instance_id ASC, ledger.domain ASC, ledger.ownership_epoch ASC
            FOR UPDATE OF ledger
          )
          UPDATE ${INSTANCE_FLUSH_LEDGER_TABLE} ledger
          SET flushed_version = LEAST(GREATEST(ledger.flushed_version, locked.flushed_version), ledger.latest_version),
              dirty_since_at = CASE
                WHEN LEAST(GREATEST(ledger.flushed_version, locked.flushed_version), ledger.latest_version) >= ledger.latest_version THEN NULL
                ELSE ledger.dirty_since_at
              END,
              payload_jsonb = CASE
                WHEN LEAST(GREATEST(ledger.flushed_version, locked.flushed_version), ledger.latest_version) >= ledger.latest_version THEN NULL
                ELSE ledger.payload_jsonb
              END,
              claimed_by = NULL,
              claim_until = NULL,
              next_attempt_at = NULL,
              retry_after = NULL,
              failure_category = NULL,
              updated_at = now()
          FROM locked
          WHERE ledger.instance_id = locked.instance_id
            AND ledger.domain = locked.domain
            AND ledger.ownership_epoch = locked.ownership_epoch
        `,
        [
          JSON.stringify(instanceTasks.map((task) => ({
            instance_id: task.id,
            domain: task.domain,
            ownership_epoch: normalizePositiveInteger(task.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER),
            flushed_version: normalizeRevision(task.latestRevision),
            claim_owner_id: task.claimOwnerId,
            fencing_token: task.fencingToken ?? null,
          }))),
        ],
      );
      updated += result.rowCount ?? 0;
    }
    return updated;
  }

  async markFlushTaskRetry(task: FlushTask, retryDelayMs = 5_000): Promise<boolean> {
    const claimOwnerId = normalizeOptionalString(task.claimOwnerId);
    if (!claimOwnerId) {
      return false;
    }
    return task.scope === 'player'
      ? this.markPlayerFlushLedgerRetry({
          playerId: task.id,
          domain: task.domain,
          retryDelayMs,
          claimOwnerId,
          fencingToken: task.fencingToken ?? null,
        })
      : this.markInstanceFlushLedgerRetry({
          instanceId: task.id,
          domain: task.domain,
          ownershipEpoch: normalizePositiveInteger(task.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER),
          retryDelayMs,
          claimOwnerId,
          fencingToken: task.fencingToken ?? null,
        });
  }

  async markFlushTasksRetry(tasks: FlushTask[], retryDelayMs = 5_000): Promise<number> {
    if (!this.pool || !this.enabled || tasks.length === 0) {
      return 0;
    }
    const normalizedRetryDelayMs = normalizePositiveInteger(retryDelayMs, 5_000, 250, 300_000);
    const claimedTasks = dedupeClaimedFlushTasks(tasks);
    const playerTasks = claimedTasks.filter((task) => task.scope === 'player');
    const instanceTasks = claimedTasks.filter((task) => task.scope === 'instance');
    let updated = 0;
    if (playerTasks.length > 0) {
      const result = await this.pool.query(
        `
          WITH input AS MATERIALIZED (
            SELECT * FROM jsonb_to_recordset($1::jsonb) AS claimed(
              player_id varchar(100), domain varchar(64), claim_owner_id varchar(120), fencing_token varchar(120)
            )
          ), locked AS MATERIALIZED (
            SELECT ledger.player_id, ledger.domain
            FROM ${PLAYER_FLUSH_LEDGER_TABLE} ledger
            INNER JOIN input
              ON input.player_id = ledger.player_id
             AND input.domain = ledger.domain
            WHERE ledger.claimed_by = input.claim_owner_id
              AND ledger.fencing_token IS NOT DISTINCT FROM input.fencing_token
            ORDER BY ledger.player_id ASC, ledger.domain ASC
            FOR UPDATE OF ledger
          )
          UPDATE ${PLAYER_FLUSH_LEDGER_TABLE} ledger
          SET next_attempt_at = now() + ($2::bigint * interval '1 millisecond'),
              retry_after = now() + ($2::bigint * interval '1 millisecond'),
              claimed_by = NULL,
              claim_until = NULL,
              updated_at = now()
          FROM locked
          WHERE ledger.player_id = locked.player_id
            AND ledger.domain = locked.domain
        `,
        [
          JSON.stringify(playerTasks.map((task) => ({
            player_id: task.id,
            domain: task.domain,
            claim_owner_id: task.claimOwnerId,
            fencing_token: task.fencingToken ?? null,
          }))),
          normalizedRetryDelayMs,
        ],
      );
      updated += result.rowCount ?? 0;
    }
    if (instanceTasks.length > 0) {
      const result = await this.pool.query(
        `
          WITH input AS MATERIALIZED (
            SELECT * FROM jsonb_to_recordset($1::jsonb) AS claimed(
              instance_id varchar(100), domain varchar(64), ownership_epoch bigint,
              claim_owner_id varchar(120), fencing_token varchar(120)
            )
          ), locked AS MATERIALIZED (
            SELECT ledger.instance_id, ledger.domain, ledger.ownership_epoch
            FROM ${INSTANCE_FLUSH_LEDGER_TABLE} ledger
            INNER JOIN input
              ON input.instance_id = ledger.instance_id
             AND input.domain = ledger.domain
             AND input.ownership_epoch = ledger.ownership_epoch
            WHERE ledger.claimed_by = input.claim_owner_id
              AND ledger.fencing_token IS NOT DISTINCT FROM input.fencing_token
            ORDER BY ledger.instance_id ASC, ledger.domain ASC, ledger.ownership_epoch ASC
            FOR UPDATE OF ledger
          )
          UPDATE ${INSTANCE_FLUSH_LEDGER_TABLE} ledger
          SET next_attempt_at = now() + ($2::bigint * interval '1 millisecond'),
              retry_after = now() + ($2::bigint * interval '1 millisecond'),
              claimed_by = NULL,
              claim_until = NULL,
              updated_at = now()
          FROM locked
          WHERE ledger.instance_id = locked.instance_id
            AND ledger.domain = locked.domain
            AND ledger.ownership_epoch = locked.ownership_epoch
        `,
        [
          JSON.stringify(instanceTasks.map((task) => ({
            instance_id: task.id,
            domain: task.domain,
            ownership_epoch: normalizePositiveInteger(task.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER),
            claim_owner_id: task.claimOwnerId,
            fencing_token: task.fencingToken ?? null,
          }))),
          normalizedRetryDelayMs,
        ],
      );
      updated += result.rowCount ?? 0;
    }
    return updated;
  }

  /**
   * 隔离无法自动裁定归属的玩家资产 payload（启动期资产冲突）。
   *
   * 这里只释放 claim 并记录失败分类，不推进 flushed_version、也不清除 payload；
   * 后续启动重放和普通 worker 会跳过这些行，等待 GM 核对资产归属后显式处理。
   */
  async quarantinePlayerFlushTasksForAssetConflict(tasks: FlushTask[]): Promise<number> {
    return this.quarantinePlayerFlushTasks(tasks, PLAYER_FLUSH_ASSET_CONFLICT_QUARANTINE);
  }

  /**
   * 隔离启动重放中确定性不可恢复的玩家 payload（数据不一致/非法载荷等）。
   *
   * 与资产冲突隔离共用同一套语义：释放 claim、标记 failure_category、不清 payload、
   * 不再参与 pending 计数与认领，等待人工核对数据后解除隔离；
   * 玩家在线产生更新版本 payload 时，upsert 会以新真源覆盖隔离标记自动放行。
   */
  async quarantinePlayerFlushTasksForStartupFailure(tasks: FlushTask[]): Promise<number> {
    return this.quarantinePlayerFlushTasks(tasks, PLAYER_FLUSH_STARTUP_STALL_QUARANTINE);
  }

  /**
   * 隔离启动重放中确定性不可恢复的实例 payload（格式/领域不一致等）。
   *
   * 只释放 claim 并记录失败分类，不推进 flushed_version、不清 payload；
   * 后续启动重放和普通 worker 均跳过这些行，等待 GM 核对或新版本 payload 覆盖。
   */
  async quarantineInstanceFlushTasksForStartupFailure(tasks: FlushTask[]): Promise<number> {
    if (!this.pool || !this.enabled || tasks.length === 0) {
      return 0;
    }
    const instanceTasks = dedupeClaimedFlushTasks(tasks).filter((task) => task.scope === 'instance');
    if (instanceTasks.length === 0) {
      return 0;
    }
    const sql = [
      'WITH input AS MATERIALIZED (',
      '  SELECT * FROM jsonb_to_recordset($1::jsonb) AS claimed(',
      '    instance_id varchar(100), domain varchar(64), ownership_epoch bigint,',
      '    claim_owner_id varchar(120), fencing_token varchar(120)',
      '  )',
      '), locked AS MATERIALIZED (',
      '  SELECT ledger.instance_id, ledger.domain, ledger.ownership_epoch',
      '  FROM ' + INSTANCE_FLUSH_LEDGER_TABLE + ' ledger',
      '  INNER JOIN input',
      '    ON input.instance_id = ledger.instance_id',
      '   AND input.domain = ledger.domain',
      '   AND input.ownership_epoch = ledger.ownership_epoch',
      '  WHERE ledger.claimed_by = input.claim_owner_id',
      '    AND ledger.fencing_token IS NOT DISTINCT FROM input.fencing_token',
      '    AND ledger.latest_version > ledger.flushed_version',
      '    AND ledger.payload_jsonb IS NOT NULL',
      '  ORDER BY ledger.instance_id ASC, ledger.domain ASC, ledger.ownership_epoch ASC',
      '  FOR UPDATE OF ledger',
      ')',
      'UPDATE ' + INSTANCE_FLUSH_LEDGER_TABLE + ' ledger',
      'SET failure_category = $2,',
      '    claimed_by = NULL,',
      '    claim_until = NULL,',
      '    next_attempt_at = NULL,',
      '    retry_after = NULL,',
      '    updated_at = now()',
      'FROM locked',
      'WHERE ledger.instance_id = locked.instance_id',
      '  AND ledger.domain = locked.domain',
      '  AND ledger.ownership_epoch = locked.ownership_epoch',
    ].join(String.fromCharCode(10));
    const result = await this.pool.query(sql, [
      JSON.stringify(instanceTasks.map((task) => ({
        instance_id: task.id,
        domain: task.domain,
        ownership_epoch: normalizePositiveInteger(task.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER),
        claim_owner_id: task.claimOwnerId,
        fencing_token: task.fencingToken ?? null,
      }))),
      INSTANCE_FLUSH_STARTUP_STALL_QUARANTINE,
    ]);
    return result.rowCount ?? 0;
  }

  private async quarantinePlayerFlushTasks(
    tasks: FlushTask[],
    failureCategory: string,
  ): Promise<number> {
    if (!this.pool || !this.enabled || tasks.length === 0) {
      return 0;
    }
    const playerTasks = dedupeClaimedFlushTasks(tasks).filter((task) => task.scope === 'player');
    if (playerTasks.length === 0) {
      return 0;
    }
    const result = await this.pool.query(
      `
        WITH input AS MATERIALIZED (
          SELECT * FROM jsonb_to_recordset($1::jsonb) AS claimed(
            player_id varchar(100), domain varchar(64), claim_owner_id varchar(120), fencing_token varchar(120)
          )
        ), locked AS MATERIALIZED (
          SELECT ledger.player_id, ledger.domain
          FROM ${PLAYER_FLUSH_LEDGER_TABLE} ledger
          INNER JOIN input
            ON input.player_id = ledger.player_id
           AND input.domain = ledger.domain
          WHERE ledger.claimed_by = input.claim_owner_id
            AND ledger.fencing_token IS NOT DISTINCT FROM input.fencing_token
            AND ledger.latest_version > ledger.flushed_version
            AND ledger.payload_jsonb IS NOT NULL
          ORDER BY ledger.player_id ASC, ledger.domain ASC
          FOR UPDATE OF ledger
        )
        UPDATE ${PLAYER_FLUSH_LEDGER_TABLE} ledger
        SET failure_category = $2,
            claimed_by = NULL,
            claim_until = NULL,
            next_attempt_at = NULL,
            retry_after = NULL,
            updated_at = now()
        FROM locked
        WHERE ledger.player_id = locked.player_id
          AND ledger.domain = locked.domain
      `,
      [
        JSON.stringify(playerTasks.map((task) => ({
          player_id: task.id,
          domain: task.domain,
          claim_owner_id: task.claimOwnerId,
          fencing_token: task.fencingToken ?? null,
        }))),
        failureCategory,
      ],
    );
    return result.rowCount ?? 0;
  }

  /**
   * 修复已隔离 payload 中可证明为“仅实例 ID 撞车”的背包条目。
   *
   * 数据库当前持有人行保持不变；待重放 payload 使用新 UUID 后解除隔离。若物品模板、
   * 实例态或锁定状态任一不一致，则整名玩家继续隔离，等待人工核对。
   */
  async repairPlayerFlushAssetConflictQuarantines(
    playerIdInput?: string | null,
    options: PlayerFlushAssetConflictRepairOptions = {},
  ): Promise<PlayerFlushAssetConflictRepairSummary> {
    const summary: PlayerFlushAssetConflictRepairSummary = {
      scannedPlayers: 0,
      repairedPlayers: 0,
      releasedPayloads: 0,
      rekeyedItems: 0,
      rebasedFences: 0,
      coveredByWatermarkPlayers: 0,
      unresolvedPlayers: [],
      repairs: [],
    };
    const pool = this.pool;
    if (!pool || !this.enabled) {
      return summary;
    }
    const playerId = normalizeOptionalString(playerIdInput);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const quarantinedResult = await client.query<{
        player_id: string;
        payload_jsonb: unknown;
      }>(
        `
          SELECT player_id, payload_jsonb
          FROM ${PLAYER_FLUSH_LEDGER_TABLE}
          WHERE domain = 'inventory'
            AND latest_version > flushed_version
            AND payload_jsonb IS NOT NULL
            AND failure_category = $1
            AND ($2::varchar IS NULL OR player_id = $2)
          ORDER BY player_id ASC
          FOR UPDATE
        `,
        [PLAYER_FLUSH_ASSET_CONFLICT_QUARANTINE, playerId],
      );
      summary.scannedPlayers = quarantinedResult.rowCount ?? 0;
      for (const quarantinedRow of quarantinedResult.rows) {
        const quarantinedPlayerId = normalizeRequiredString(quarantinedRow.player_id);
        const itemInstanceIds = listPlayerInventoryPayloadItemInstanceIds(quarantinedRow.payload_jsonb);
        if (!quarantinedPlayerId || itemInstanceIds.length === 0) {
          if (quarantinedPlayerId) {
            summary.unresolvedPlayers.push(quarantinedPlayerId);
          }
          continue;
        }
        await client.query(
          'SELECT pg_advisory_xact_lock($1::integer, hashtext($2))',
          [7101, quarantinedPlayerId],
        );
        const conflictResult = await client.query<{
          item_instance_id: string;
          player_id: string;
          item_id: string;
          raw_payload: unknown;
          locked_by: string | null;
        }>(
          `
            SELECT item_instance_id, player_id, item_id, raw_payload, locked_by
            FROM player_inventory_item
            WHERE player_id <> $1
              AND item_instance_id = ANY($2::varchar[])
            ORDER BY item_instance_id ASC
            FOR UPDATE
          `,
          [quarantinedPlayerId, itemInstanceIds],
        );
        const conflicts: PlayerInventoryOwnershipConflict[] = conflictResult.rows.map((row) => ({
          itemInstanceId: normalizeRequiredString(row.item_instance_id),
          ownerPlayerId: normalizeRequiredString(row.player_id),
          itemId: normalizeRequiredString(row.item_id),
          rawPayload: normalizeJsonObject(row.raw_payload),
          lockedBy: normalizeOptionalString(row.locked_by),
        }));
        const repair = repairPlayerInventoryOwnershipConflictPayload(
          quarantinedRow.payload_jsonb,
          conflicts,
        );
        if (!repair.canReleaseQuarantine) {
          summary.unresolvedPlayers.push(quarantinedPlayerId);
          continue;
        }
        if (options.runtimeInventoryItems !== undefined) {
          const runtimeItemsById = new Map<string, Record<string, unknown>>();
          for (const runtimeItem of options.runtimeInventoryItems) {
            const runtimeItemInstanceId = normalizeRequiredString(runtimeItem?.itemInstanceId);
            if (runtimeItemInstanceId) {
              runtimeItemsById.set(runtimeItemInstanceId, runtimeItem);
            }
          }
          const runtimeIdentityMismatch = repair.remaps.some((remap) => (
            !isRuntimeInventoryIdentityEquivalent(
              runtimeItemsById.get(remap.previousItemInstanceId),
              conflicts.find((conflict) => conflict.itemInstanceId === remap.previousItemInstanceId),
            )
          ));
          if (runtimeIdentityMismatch) {
            summary.unresolvedPlayers.push(quarantinedPlayerId);
            continue;
          }
        }

        const payloadFence = readPlayerInventoryPayloadFence(repair.payloadJson);
        if (!payloadFence) {
          summary.unresolvedPlayers.push(quarantinedPlayerId);
          continue;
        }
        const presenceResult = await client.query<{
          online: boolean;
          runtime_owner_id: string | null;
          session_epoch: string | number | null;
        }>(
          `
            SELECT online, runtime_owner_id, session_epoch
            FROM player_presence
            WHERE player_id = $1
            FOR UPDATE
          `,
          [quarantinedPlayerId],
        );
        const watermarkResult = await client.query<{ inventory_version: string | number | null }>(
          `
            SELECT inventory_version
            FROM player_recovery_watermark
            WHERE player_id = $1
            FOR UPDATE
          `,
          [quarantinedPlayerId],
        );
        const presence = presenceResult.rows[0];
        const persistedEpoch = normalizeNonNegativeSafeInteger(presence?.session_epoch);
        const persistedOwner = normalizeOptionalString(presence?.runtime_owner_id);
        const inventoryVersion = normalizeNonNegativeSafeInteger(watermarkResult.rows[0]?.inventory_version);
        const fenceDecision = resolvePlayerPayloadFenceDecision(
          payloadFence.sessionEpoch,
          payloadFence.runtimeOwnerId,
          persistedEpoch,
          persistedOwner,
          presence != null,
        );
        const coveredByWatermark = payloadFence.projectionVersion > 0
          && inventoryVersion >= payloadFence.projectionVersion;
        let repairedPayloadJson = repair.payloadJson;
        if (fenceDecision !== 'current' && !coveredByWatermark) {
          const canRebaseOfflineFence = options.allowOfflineFenceRebase === true
            && fenceDecision === 'superseded'
            && presence?.online === false
            && payloadFence.projectionVersion > inventoryVersion;
          if (!canRebaseOfflineFence) {
            summary.unresolvedPlayers.push(quarantinedPlayerId);
            continue;
          }
          const rebasedPayload = rebasePlayerInventoryPayloadFenceForOfflineRecovery(repair.payloadJson);
          if (!rebasedPayload) {
            summary.unresolvedPlayers.push(quarantinedPlayerId);
            continue;
          }
          repairedPayloadJson = rebasedPayload;
          summary.rebasedFences += 1;
        } else if (coveredByWatermark) {
          summary.coveredByWatermarkPlayers += 1;
        }

        await client.query(
          `
            SELECT domain
            FROM ${PLAYER_FLUSH_LEDGER_TABLE}
            WHERE player_id = $1
              AND latest_version > flushed_version
              AND payload_jsonb IS NOT NULL
              AND failure_category = $2
            ORDER BY domain ASC
            FOR UPDATE
          `,
          [quarantinedPlayerId, PLAYER_FLUSH_ASSET_CONFLICT_QUARANTINE],
        );
        const releasedResult = await client.query<{ domain: string }>(
          `
            UPDATE ${PLAYER_FLUSH_LEDGER_TABLE}
            SET payload_jsonb = CASE
                  WHEN domain = 'inventory' THEN $3::jsonb
                  ELSE payload_jsonb
                END,
                failure_category = NULL,
                claimed_by = NULL,
                claim_until = NULL,
                next_attempt_at = now(),
                retry_after = now(),
                updated_at = now()
            WHERE player_id = $1
              AND latest_version > flushed_version
              AND payload_jsonb IS NOT NULL
              AND failure_category = $2
            RETURNING domain
          `,
          [
            quarantinedPlayerId,
            PLAYER_FLUSH_ASSET_CONFLICT_QUARANTINE,
            JSON.stringify(repairedPayloadJson),
          ],
        );
        if ((releasedResult.rowCount ?? 0) === 0) {
          summary.unresolvedPlayers.push(quarantinedPlayerId);
          continue;
        }
        summary.repairedPlayers += 1;
        summary.releasedPayloads += releasedResult.rowCount ?? 0;
        summary.rekeyedItems += repair.remaps.length;
        summary.repairs.push(...repair.remaps.map((remap) => ({
          playerId: quarantinedPlayerId,
          ...remap,
        })));
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    summary.unresolvedPlayers = Array.from(new Set(summary.unresolvedPlayers)).sort();
    if (summary.repairedPlayers > 0) {
      this.logger.warn(
        `已修复玩家资产刷盘隔离：players=${summary.repairedPlayers}`
        + ` payloads=${summary.releasedPayloads} rekeyedItems=${summary.rekeyedItems}`
        + ` rebasedFences=${summary.rebasedFences}`
        + ` coveredByWatermarkPlayers=${summary.coveredByWatermarkPlayers}`
        + ` repairs=${JSON.stringify(summary.repairs)}`,
      );
    }
    if (summary.unresolvedPlayers.length > 0 && options.logUnresolved !== false) {
      this.logger.error(
        `玩家资产刷盘隔离无法自动裁定：players=${summary.unresolvedPlayers.join(',')}`,
      );
    }
    return summary;
  }

  /** 玩家存在待人工核对的资产冲突 payload 时，禁止恢复为可写运行态。 */
  async isPlayerFlushAssetConflictQuarantined(playerIdInput: string): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const playerId = normalizeRequiredString(playerIdInput);
    if (!playerId) {
      return false;
    }
    const result = await this.pool.query(
      `
        SELECT 1
        FROM ${PLAYER_FLUSH_LEDGER_TABLE}
        WHERE player_id = $1
          AND latest_version > flushed_version
          AND payload_jsonb IS NOT NULL
          AND failure_category = $2
        LIMIT 1
      `,
      [playerId, PLAYER_FLUSH_ASSET_CONFLICT_QUARANTINE],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** 延长统一任务认领租约；旧 claim 或 generation 已变化时 CAS 必然失败。 */
  async renewFlushTaskClaim(task: FlushTask, ttlMs?: number): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const id = normalizeRequiredString(task.id);
    const domain = normalizeRequiredString(task.domain);
    const claimOwnerId = normalizeOptionalString(task.claimOwnerId);
    if (!id || !domain || !claimOwnerId) {
      return false;
    }
    const claimTtlMs = resolveFlushTaskClaimTtlMs(ttlMs);
    if (task.scope === 'player') {
      const result = await this.pool.query(
        `
          UPDATE ${PLAYER_FLUSH_LEDGER_TABLE}
          SET claim_until = now() + ($5::bigint * interval '1 millisecond')
          WHERE player_id = $1
            AND domain = $2
            AND claimed_by = $3
            AND fencing_token IS NOT DISTINCT FROM $4
            AND latest_version > flushed_version
        `,
        [id, domain, claimOwnerId, task.fencingToken ?? null, claimTtlMs],
      );
      return (result.rowCount ?? 0) > 0;
    }
    const result = await this.pool.query(
      `
        UPDATE ${INSTANCE_FLUSH_LEDGER_TABLE}
        SET claim_until = now() + ($6::bigint * interval '1 millisecond')
        WHERE instance_id = $1
          AND domain = $2
          AND ownership_epoch = $3
          AND claimed_by = $4
          AND fencing_token IS NOT DISTINCT FROM $5
          AND latest_version > flushed_version
      `,
      [
        id,
        domain,
        normalizePositiveInteger(task.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER),
        claimOwnerId,
        task.fencingToken ?? null,
        claimTtlMs,
      ],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** 批量延长同一轮认领，避免玩家多域事务在写入前后逐行续租放大 SQL。 */
  async renewFlushTaskClaims(tasks: FlushTask[], ttlMs?: number): Promise<number> {
    if (!this.pool || !this.enabled || tasks.length === 0) {
      return 0;
    }
    const claimedTasks = dedupeClaimedFlushTasks(tasks);
    const claimTtlMs = resolveFlushTaskClaimTtlMs(ttlMs);
    let renewed = 0;
    const playerTasks = claimedTasks.filter((task) => task.scope === 'player');
    if (playerTasks.length > 0) {
      const result = await this.pool.query(
        `
          WITH input AS MATERIALIZED (
            SELECT *
            FROM jsonb_to_recordset($1::jsonb) AS claimed(
              player_id varchar(100), domain varchar(64), claim_owner_id varchar(120), fencing_token varchar(120)
            )
          ), locked AS MATERIALIZED (
            SELECT ledger.player_id, ledger.domain
            FROM ${PLAYER_FLUSH_LEDGER_TABLE} ledger
            INNER JOIN input
              ON input.player_id = ledger.player_id
             AND input.domain = ledger.domain
            WHERE ledger.claimed_by = input.claim_owner_id
              AND ledger.fencing_token IS NOT DISTINCT FROM input.fencing_token
              AND ledger.latest_version > ledger.flushed_version
            ORDER BY ledger.player_id ASC, ledger.domain ASC
            FOR UPDATE OF ledger
          )
          UPDATE ${PLAYER_FLUSH_LEDGER_TABLE} ledger
          SET claim_until = now() + ($2::bigint * interval '1 millisecond')
          FROM locked
          WHERE ledger.player_id = locked.player_id
            AND ledger.domain = locked.domain
        `,
        [
          JSON.stringify(playerTasks.map((task) => ({
            player_id: task.id,
            domain: task.domain,
            claim_owner_id: task.claimOwnerId,
            fencing_token: task.fencingToken ?? null,
          }))),
          claimTtlMs,
        ],
      );
      renewed += result.rowCount ?? 0;
    }
    const instanceTasks = claimedTasks.filter((task) => task.scope === 'instance');
    if (instanceTasks.length > 0) {
      const result = await this.pool.query(
        `
          WITH input AS MATERIALIZED (
            SELECT *
            FROM jsonb_to_recordset($1::jsonb) AS claimed(
              instance_id varchar(100), domain varchar(64), ownership_epoch bigint,
              claim_owner_id varchar(120), fencing_token varchar(120)
            )
          ), locked AS MATERIALIZED (
            SELECT ledger.instance_id, ledger.domain, ledger.ownership_epoch
            FROM ${INSTANCE_FLUSH_LEDGER_TABLE} ledger
            INNER JOIN input
              ON input.instance_id = ledger.instance_id
             AND input.domain = ledger.domain
             AND input.ownership_epoch = ledger.ownership_epoch
            WHERE ledger.claimed_by = input.claim_owner_id
              AND ledger.fencing_token IS NOT DISTINCT FROM input.fencing_token
              AND ledger.latest_version > ledger.flushed_version
            ORDER BY ledger.instance_id ASC, ledger.domain ASC, ledger.ownership_epoch ASC
            FOR UPDATE OF ledger
          )
          UPDATE ${INSTANCE_FLUSH_LEDGER_TABLE} ledger
          SET claim_until = now() + ($2::bigint * interval '1 millisecond')
          FROM locked
          WHERE ledger.instance_id = locked.instance_id
            AND ledger.domain = locked.domain
            AND ledger.ownership_epoch = locked.ownership_epoch
        `,
        [
          JSON.stringify(instanceTasks.map((task) => ({
            instance_id: task.id,
            domain: task.domain,
            ownership_epoch: normalizePositiveInteger(task.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER),
            claim_owner_id: task.claimOwnerId,
            fencing_token: task.fencingToken ?? null,
          }))),
          claimTtlMs,
        ],
      );
      renewed += result.rowCount ?? 0;
    }
    return renewed;
  }

  /**
   * 统计仍可 durable replay 的 payload；故意包含 delayed 与有效 claim，
   * 供启动恢复区分“已经清空”和“暂被其他 worker 占用”。
   */
  async countPendingPayloadTasks(input?: {
    scope?: FlushTaskScope | null;
    id?: string | null;
    domain?: string | null;
    ownershipEpoch?: number | null;
  }): Promise<number> {
    if (!this.pool || !this.enabled) {
      return 0;
    }
    const scope = input?.scope === 'player' || input?.scope === 'instance' ? input.scope : null;
    const id = normalizeRequiredString(input?.id);
    const domain = normalizeRequiredString(input?.domain);
    const params: Array<string | number> = [];
    const countQueries: string[] = [];
    if (scope !== 'instance') {
      const filters = [
        'latest_version > flushed_version',
        'payload_jsonb IS NOT NULL',
        PLAYER_FLUSH_NOT_QUARANTINED_SQL,
      ];
      if (id) {
        params.push(id);
        filters.push(`player_id = $${params.length}`);
      }
      if (domain) {
        params.push(domain);
        filters.push(`domain = $${params.length}`);
      }
      countQueries.push(`
        SELECT COUNT(*)::bigint AS pending_count
        FROM ${PLAYER_FLUSH_LEDGER_TABLE}
        WHERE ${filters.join(' AND ')}
      `);
    }
    if (scope !== 'player') {
      const filters = [
        'latest_version > flushed_version',
        'payload_jsonb IS NOT NULL',
        INSTANCE_FLUSH_NOT_QUARANTINED_SQL,
      ];
      if (id) {
        params.push(id);
        filters.push(`instance_id = $${params.length}`);
      }
      if (domain) {
        params.push(domain);
        filters.push(`domain = $${params.length}`);
      }
      const parsedOwnershipEpoch = Number(input?.ownershipEpoch);
      if (input?.ownershipEpoch !== null && input?.ownershipEpoch !== undefined
        && Number.isFinite(parsedOwnershipEpoch) && parsedOwnershipEpoch >= 0) {
        params.push(Math.trunc(parsedOwnershipEpoch));
        filters.push(`ownership_epoch = $${params.length}`);
      }
      countQueries.push(`
        SELECT COUNT(*)::bigint AS pending_count
        FROM ${INSTANCE_FLUSH_LEDGER_TABLE}
        WHERE ${filters.join(' AND ')}
      `);
    }
    const result = await this.pool.query<{ pending_count?: unknown }>(
      `
        SELECT COALESCE(SUM(pending_count), 0)::bigint AS pending_count
        FROM (${countQueries.join(' UNION ALL ')}) pending
      `,
      params,
    );
    return normalizePositiveInteger(result.rows[0]?.pending_count, 0, 0, Number.MAX_SAFE_INTEGER);
  }

  async upsertPlayerFlushLedger(input: PlayerFlushLedgerUpsertInput): Promise<void> {
    await this.upsertPlayerFlushLedgers([input], 1);
  }

  async upsertPlayerFlushLedgers(
    inputs: PlayerFlushLedgerUpsertInput[],
    batchSize = DEFAULT_FLUSH_LEDGER_BATCH_SIZE,
  ): Promise<number> {
    return (await this.upsertPlayerFlushLedgersDetailed(inputs, batchSize)).changed;
  }

  private async upsertPlayerFlushLedgersDetailed(
    inputs: PlayerFlushLedgerUpsertInput[],
    batchSize = DEFAULT_FLUSH_LEDGER_BATCH_SIZE,
  ): Promise<FlushTaskUpsertResult> {
    if (!this.pool || !this.enabled || inputs.length === 0) {
      return { changed: 0, accepted: [] };
    }
    const rows = dedupePlayerFlushLedgerInputs(inputs);
    const normalizedBatchSize = normalizePositiveInteger(
      batchSize,
      DEFAULT_FLUSH_LEDGER_BATCH_SIZE,
      1,
      MAX_FLUSH_LEDGER_BATCH_SIZE,
    );
    let changed = 0;
    const accepted: FlushTaskUpsertIdentity[] = [];
    for (const batch of chunkRows(rows, normalizedBatchSize)) {
      const result = await this.pool.query<{ player_id: string; domain: string }>(
        `
          WITH input AS (
            SELECT *
            FROM jsonb_to_recordset($1::jsonb) AS staged(
              player_id varchar(100), domain varchar(64), priority varchar(16), latest_version bigint,
              flushed_version bigint, dirty_since_at timestamptz, next_attempt_at timestamptz,
              claimed_by varchar(120), claim_until timestamptz, runtime_owner_id varchar(120),
              fencing_token varchar(120), idempotency_key varchar(180), payload_jsonb jsonb,
              failure_category varchar(64), retry_after timestamptz
            )
          )
          INSERT INTO ${PLAYER_FLUSH_LEDGER_TABLE}(
            player_id, domain, priority, latest_version, flushed_version, dirty_since_at, next_attempt_at,
            claimed_by, claim_until, runtime_owner_id, fencing_token, idempotency_key, payload_jsonb,
            failure_category, retry_after, updated_at
          )
          SELECT player_id, domain, priority, latest_version, flushed_version, dirty_since_at, next_attempt_at,
            claimed_by, claim_until, runtime_owner_id, fencing_token, idempotency_key,
            CASE WHEN flushed_version >= latest_version THEN NULL ELSE payload_jsonb END,
            failure_category, retry_after, now()
          FROM input
          ORDER BY player_id ASC, domain ASC
          ON CONFLICT (player_id, domain)
          DO UPDATE SET
            priority = ${PLAYER_FLUSH_LEDGER_TABLE}.priority,
            latest_version = GREATEST(${PLAYER_FLUSH_LEDGER_TABLE}.latest_version, EXCLUDED.latest_version),
            flushed_version = CASE WHEN EXCLUDED.latest_version > ${PLAYER_FLUSH_LEDGER_TABLE}.latest_version
              THEN LEAST(
                GREATEST(${PLAYER_FLUSH_LEDGER_TABLE}.flushed_version, EXCLUDED.flushed_version),
                EXCLUDED.latest_version
              ) ELSE ${PLAYER_FLUSH_LEDGER_TABLE}.flushed_version END,
            dirty_since_at = CASE WHEN EXCLUDED.latest_version > ${PLAYER_FLUSH_LEDGER_TABLE}.latest_version
              THEN COALESCE(${PLAYER_FLUSH_LEDGER_TABLE}.dirty_since_at, EXCLUDED.dirty_since_at)
              ELSE ${PLAYER_FLUSH_LEDGER_TABLE}.dirty_since_at END,
            next_attempt_at = CASE WHEN EXCLUDED.latest_version > ${PLAYER_FLUSH_LEDGER_TABLE}.latest_version
              THEN LEAST(
                COALESCE(${PLAYER_FLUSH_LEDGER_TABLE}.next_attempt_at, EXCLUDED.next_attempt_at),
                COALESCE(EXCLUDED.next_attempt_at, ${PLAYER_FLUSH_LEDGER_TABLE}.next_attempt_at)
              )
              ELSE ${PLAYER_FLUSH_LEDGER_TABLE}.next_attempt_at END,
            claimed_by = CASE WHEN EXCLUDED.latest_version > ${PLAYER_FLUSH_LEDGER_TABLE}.latest_version
              THEN CASE WHEN EXCLUDED.fencing_token IS DISTINCT FROM ${PLAYER_FLUSH_LEDGER_TABLE}.fencing_token
                THEN EXCLUDED.claimed_by
                ELSE COALESCE(EXCLUDED.claimed_by, ${PLAYER_FLUSH_LEDGER_TABLE}.claimed_by) END
              ELSE ${PLAYER_FLUSH_LEDGER_TABLE}.claimed_by END,
            claim_until = CASE WHEN EXCLUDED.latest_version > ${PLAYER_FLUSH_LEDGER_TABLE}.latest_version
              THEN CASE WHEN EXCLUDED.fencing_token IS DISTINCT FROM ${PLAYER_FLUSH_LEDGER_TABLE}.fencing_token
                THEN EXCLUDED.claim_until
                ELSE COALESCE(EXCLUDED.claim_until, ${PLAYER_FLUSH_LEDGER_TABLE}.claim_until) END
              ELSE ${PLAYER_FLUSH_LEDGER_TABLE}.claim_until END,
            runtime_owner_id = CASE WHEN EXCLUDED.latest_version > ${PLAYER_FLUSH_LEDGER_TABLE}.latest_version
              THEN EXCLUDED.runtime_owner_id
              ELSE ${PLAYER_FLUSH_LEDGER_TABLE}.runtime_owner_id END,
            fencing_token = CASE WHEN EXCLUDED.latest_version > ${PLAYER_FLUSH_LEDGER_TABLE}.latest_version
              THEN EXCLUDED.fencing_token
              ELSE ${PLAYER_FLUSH_LEDGER_TABLE}.fencing_token END,
            idempotency_key = CASE WHEN EXCLUDED.latest_version > ${PLAYER_FLUSH_LEDGER_TABLE}.latest_version
              THEN EXCLUDED.idempotency_key
              ELSE ${PLAYER_FLUSH_LEDGER_TABLE}.idempotency_key END,
            payload_jsonb = CASE
              WHEN EXCLUDED.latest_version > ${PLAYER_FLUSH_LEDGER_TABLE}.latest_version
              THEN CASE
                WHEN GREATEST(${PLAYER_FLUSH_LEDGER_TABLE}.flushed_version, EXCLUDED.flushed_version) >= EXCLUDED.latest_version
                THEN NULL ELSE EXCLUDED.payload_jsonb END
              ELSE EXCLUDED.payload_jsonb END,
            failure_category = CASE
              WHEN ${PLAYER_FLUSH_LEDGER_TABLE}.failure_category = '${PLAYER_FLUSH_ASSET_CONFLICT_QUARANTINE}'
                THEN ${PLAYER_FLUSH_LEDGER_TABLE}.failure_category
              WHEN EXCLUDED.latest_version > ${PLAYER_FLUSH_LEDGER_TABLE}.latest_version
                THEN EXCLUDED.failure_category
              ELSE ${PLAYER_FLUSH_LEDGER_TABLE}.failure_category
            END,
            retry_after = CASE WHEN EXCLUDED.latest_version > ${PLAYER_FLUSH_LEDGER_TABLE}.latest_version
              THEN LEAST(
                COALESCE(${PLAYER_FLUSH_LEDGER_TABLE}.retry_after, EXCLUDED.retry_after),
                COALESCE(EXCLUDED.retry_after, ${PLAYER_FLUSH_LEDGER_TABLE}.retry_after)
              )
              ELSE ${PLAYER_FLUSH_LEDGER_TABLE}.retry_after END,
            updated_at = now()
          WHERE EXCLUDED.latest_version > ${PLAYER_FLUSH_LEDGER_TABLE}.latest_version
            OR (
              EXCLUDED.fencing_token IS NOT DISTINCT FROM ${PLAYER_FLUSH_LEDGER_TABLE}.fencing_token
              AND EXCLUDED.latest_version = ${PLAYER_FLUSH_LEDGER_TABLE}.latest_version
              AND ${PLAYER_FLUSH_LEDGER_TABLE}.latest_version > ${PLAYER_FLUSH_LEDGER_TABLE}.flushed_version
              AND ${PLAYER_FLUSH_LEDGER_TABLE}.payload_jsonb IS NULL
              AND EXCLUDED.payload_jsonb IS NOT NULL
            )
          RETURNING player_id, domain
        `,
        [JSON.stringify(batch)],
      );
      changed += result.rowCount ?? 0;
      for (const row of result.rows) {
        accepted.push({
          scope: 'player',
          id: row.player_id,
          domain: row.domain,
          ownershipEpoch: null,
        });
      }
    }
    return { changed, accepted };
  }

  async upsertInstanceFlushLedger(input: InstanceFlushLedgerUpsertInput): Promise<void> {
    await this.upsertInstanceFlushLedgers([input], 1);
  }

  async upsertInstanceFlushLedgers(
    inputs: InstanceFlushLedgerUpsertInput[],
    batchSize = DEFAULT_FLUSH_LEDGER_BATCH_SIZE,
  ): Promise<number> {
    return (await this.upsertInstanceFlushLedgersDetailed(inputs, batchSize)).changed;
  }

  private async upsertInstanceFlushLedgersDetailed(
    inputs: InstanceFlushLedgerUpsertInput[],
    batchSize = DEFAULT_FLUSH_LEDGER_BATCH_SIZE,
  ): Promise<FlushTaskUpsertResult> {
    if (!this.pool || !this.enabled || inputs.length === 0) {
      return { changed: 0, accepted: [] };
    }
    const rows = dedupeInstanceFlushLedgerInputs(inputs);
    const normalizedBatchSize = normalizePositiveInteger(
      batchSize,
      DEFAULT_FLUSH_LEDGER_BATCH_SIZE,
      1,
      MAX_FLUSH_LEDGER_BATCH_SIZE,
    );
    let changed = 0;
    const accepted: FlushTaskUpsertIdentity[] = [];
    for (const batch of chunkRows(rows, normalizedBatchSize)) {
      const result = await this.pool.query<{ instance_id: string; domain: string; ownership_epoch: string | number }>(
        `
          WITH input AS (
            SELECT *
            FROM jsonb_to_recordset($1::jsonb) AS staged(
              instance_id varchar(100), domain varchar(64), ownership_epoch bigint, priority varchar(16),
              latest_version bigint, flushed_version bigint, dirty_since_at timestamptz,
              next_attempt_at timestamptz, claimed_by varchar(120), claim_until timestamptz,
              runtime_owner_id varchar(120), fencing_token varchar(120), idempotency_key varchar(180),
              payload_jsonb jsonb, failure_category varchar(64), retry_after timestamptz
            )
          )
          INSERT INTO ${INSTANCE_FLUSH_LEDGER_TABLE}(
            instance_id, domain, ownership_epoch, priority, latest_version, flushed_version, dirty_since_at,
            next_attempt_at, claimed_by, claim_until, runtime_owner_id, fencing_token, idempotency_key,
            payload_jsonb, failure_category, retry_after, updated_at
          )
          SELECT instance_id, domain, ownership_epoch, priority, latest_version, flushed_version, dirty_since_at,
            next_attempt_at, claimed_by, claim_until, runtime_owner_id, fencing_token, idempotency_key,
            CASE WHEN flushed_version >= latest_version THEN NULL ELSE payload_jsonb END,
            failure_category, retry_after, now()
          FROM input
          ORDER BY instance_id ASC, domain ASC, ownership_epoch ASC
          ON CONFLICT (instance_id, domain, ownership_epoch)
          DO UPDATE SET
            priority = ${INSTANCE_FLUSH_LEDGER_TABLE}.priority,
            latest_version = GREATEST(${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version, EXCLUDED.latest_version),
            flushed_version = CASE WHEN EXCLUDED.latest_version > ${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version
              THEN LEAST(
                GREATEST(${INSTANCE_FLUSH_LEDGER_TABLE}.flushed_version, EXCLUDED.flushed_version),
                EXCLUDED.latest_version
              ) ELSE ${INSTANCE_FLUSH_LEDGER_TABLE}.flushed_version END,
            dirty_since_at = CASE WHEN EXCLUDED.latest_version > ${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version
              THEN COALESCE(${INSTANCE_FLUSH_LEDGER_TABLE}.dirty_since_at, EXCLUDED.dirty_since_at)
              ELSE ${INSTANCE_FLUSH_LEDGER_TABLE}.dirty_since_at END,
            next_attempt_at = CASE WHEN EXCLUDED.latest_version > ${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version
              THEN LEAST(
                COALESCE(${INSTANCE_FLUSH_LEDGER_TABLE}.next_attempt_at, EXCLUDED.next_attempt_at),
                COALESCE(EXCLUDED.next_attempt_at, ${INSTANCE_FLUSH_LEDGER_TABLE}.next_attempt_at)
              ) ELSE ${INSTANCE_FLUSH_LEDGER_TABLE}.next_attempt_at END,
            claimed_by = CASE WHEN EXCLUDED.latest_version > ${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version
              THEN CASE WHEN EXCLUDED.fencing_token IS DISTINCT FROM ${INSTANCE_FLUSH_LEDGER_TABLE}.fencing_token
                THEN EXCLUDED.claimed_by
                ELSE COALESCE(EXCLUDED.claimed_by, ${INSTANCE_FLUSH_LEDGER_TABLE}.claimed_by) END
              ELSE ${INSTANCE_FLUSH_LEDGER_TABLE}.claimed_by END,
            claim_until = CASE WHEN EXCLUDED.latest_version > ${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version
              THEN CASE WHEN EXCLUDED.fencing_token IS DISTINCT FROM ${INSTANCE_FLUSH_LEDGER_TABLE}.fencing_token
                THEN EXCLUDED.claim_until
                ELSE COALESCE(EXCLUDED.claim_until, ${INSTANCE_FLUSH_LEDGER_TABLE}.claim_until) END
              ELSE ${INSTANCE_FLUSH_LEDGER_TABLE}.claim_until END,
            runtime_owner_id = CASE WHEN EXCLUDED.latest_version > ${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version
              THEN EXCLUDED.runtime_owner_id
              ELSE ${INSTANCE_FLUSH_LEDGER_TABLE}.runtime_owner_id END,
            fencing_token = CASE WHEN EXCLUDED.latest_version > ${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version
              THEN EXCLUDED.fencing_token
              ELSE ${INSTANCE_FLUSH_LEDGER_TABLE}.fencing_token END,
            idempotency_key = CASE WHEN EXCLUDED.latest_version > ${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version
              THEN EXCLUDED.idempotency_key
              ELSE ${INSTANCE_FLUSH_LEDGER_TABLE}.idempotency_key END,
            payload_jsonb = CASE
              WHEN EXCLUDED.latest_version > ${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version
              THEN CASE
                WHEN GREATEST(${INSTANCE_FLUSH_LEDGER_TABLE}.flushed_version, EXCLUDED.flushed_version) >= EXCLUDED.latest_version
                THEN NULL ELSE EXCLUDED.payload_jsonb END
              ELSE EXCLUDED.payload_jsonb END,
            failure_category = CASE WHEN EXCLUDED.latest_version > ${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version
              THEN EXCLUDED.failure_category ELSE ${INSTANCE_FLUSH_LEDGER_TABLE}.failure_category END,
            retry_after = CASE WHEN EXCLUDED.latest_version > ${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version
              THEN LEAST(
                COALESCE(${INSTANCE_FLUSH_LEDGER_TABLE}.retry_after, EXCLUDED.retry_after),
                COALESCE(EXCLUDED.retry_after, ${INSTANCE_FLUSH_LEDGER_TABLE}.retry_after)
              ) ELSE ${INSTANCE_FLUSH_LEDGER_TABLE}.retry_after END,
            updated_at = now()
          WHERE EXCLUDED.latest_version > ${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version
            OR (
              EXCLUDED.fencing_token IS NOT DISTINCT FROM ${INSTANCE_FLUSH_LEDGER_TABLE}.fencing_token
              AND EXCLUDED.latest_version = ${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version
              AND ${INSTANCE_FLUSH_LEDGER_TABLE}.latest_version > ${INSTANCE_FLUSH_LEDGER_TABLE}.flushed_version
              AND ${INSTANCE_FLUSH_LEDGER_TABLE}.payload_jsonb IS NULL
              AND EXCLUDED.payload_jsonb IS NOT NULL
            )
          RETURNING instance_id, domain, ownership_epoch
        `,
        [JSON.stringify(batch)],
      );
      changed += result.rowCount ?? 0;
      for (const row of result.rows) {
        accepted.push({
          scope: 'instance',
          id: row.instance_id,
          domain: row.domain,
          ownershipEpoch: normalizePositiveInteger(row.ownership_epoch, 0, 0, Number.MAX_SAFE_INTEGER),
        });
      }
    }
    return { changed, accepted };
  }

  async claimPlayerFlushLedger(input: {
    workerId: string;
    id?: string | null;
    domain?: string | null;
    priority?: FlushTaskPriority | null;
    limit?: number;
    claimTtlMs?: number;
    payloadRequired?: boolean;
    includeDelayed?: boolean;
  }): Promise<Array<Record<string, unknown>>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const workerId = normalizeRequiredString(input.workerId);
    if (!workerId) {
      return [];
    }
    const claimOwnerId = buildClaimOwnerId(workerId);
    const claimTtlMs = resolveFlushTaskClaimTtlMs(input.claimTtlMs);
    const domain = normalizeRequiredString(input.domain);
    const limit = normalizePositiveInteger(input.limit, 32, 1, 5_000);
    const queryParams: Array<string | number> = [claimOwnerId, claimTtlMs];
    const filters = [
      'latest_version > flushed_version',
      '(claim_until IS NULL OR claim_until < now())',
      PLAYER_FLUSH_NOT_QUARANTINED_SQL,
    ];
    if (input.includeDelayed !== true) {
      filters.push('(COALESCE(next_attempt_at, retry_after) IS NULL OR COALESCE(next_attempt_at, retry_after) <= now())');
    }
    if (input.payloadRequired === true) {
      filters.push('payload_jsonb IS NOT NULL');
    }
    const playerId = normalizeRequiredString(input.id);
    if (playerId) {
      queryParams.push(playerId);
      filters.push(`player_id = $${queryParams.length}`);
    }
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
              claim_until = now() + ($2::bigint * interval '1 millisecond')
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
    id?: string | null;
    domain?: string | null;
    priority?: FlushTaskPriority | null;
    ownershipEpoch?: number | null;
    limit?: number;
    claimTtlMs?: number;
    payloadRequired?: boolean;
    includeDelayed?: boolean;
  }): Promise<Array<Record<string, unknown>>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const workerId = normalizeRequiredString(input.workerId);
    if (!workerId) {
      return [];
    }
    const claimOwnerId = buildClaimOwnerId(workerId);
    const claimTtlMs = resolveFlushTaskClaimTtlMs(input.claimTtlMs);
    const limit = normalizePositiveInteger(input.limit, 32, 1, 5_000);
    const queryParams: Array<string | number> = [claimOwnerId, claimTtlMs];
    const filters = [
      'latest_version > flushed_version',
      '(claim_until IS NULL OR claim_until < now())',
      INSTANCE_FLUSH_NOT_QUARANTINED_SQL,
    ];
    if (input.includeDelayed !== true) {
      filters.push('(COALESCE(next_attempt_at, retry_after) IS NULL OR COALESCE(next_attempt_at, retry_after) <= now())');
    }
    if (input.payloadRequired === true) {
      filters.push('payload_jsonb IS NOT NULL');
    }
    const instanceId = normalizeRequiredString(input.id);
    if (instanceId) {
      queryParams.push(instanceId);
      filters.push(`instance_id = $${queryParams.length}`);
    }
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
    if (input.ownershipEpoch !== null && input.ownershipEpoch !== undefined
      && Number.isFinite(parsedOwnershipEpoch) && parsedOwnershipEpoch >= 0) {
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
              claim_until = now() + ($2::bigint * interval '1 millisecond')
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

  async markPlayerFlushLedgerFlushed(input: {
    playerId: string;
    domain: string;
    flushedVersion: number;
    claimOwnerId: string;
    fencingToken: string | null;
  }): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const playerId = normalizeRequiredString(input.playerId);
    const domain = normalizeRequiredString(input.domain);
    const claimOwnerId = normalizeOptionalString(input.claimOwnerId);
    if (!playerId || !domain || !claimOwnerId) {
      return false;
    }
    const result = await this.pool.query(
      `
        UPDATE ${PLAYER_FLUSH_LEDGER_TABLE}
        SET flushed_version = LEAST(GREATEST(flushed_version, $3), latest_version),
            dirty_since_at = CASE WHEN LEAST(GREATEST(flushed_version, $3), latest_version) >= latest_version THEN NULL ELSE dirty_since_at END,
            payload_jsonb = CASE WHEN LEAST(GREATEST(flushed_version, $3), latest_version) >= latest_version THEN NULL ELSE payload_jsonb END,
            claimed_by = NULL,
            claim_until = NULL,
            next_attempt_at = NULL,
            retry_after = NULL,
            failure_category = NULL,
            updated_at = now()
        WHERE player_id = $1 AND domain = $2
          AND claimed_by = $4
          AND fencing_token IS NOT DISTINCT FROM $5::varchar
      `,
      [playerId, domain, normalizeRevision(input.flushedVersion), claimOwnerId, input.fencingToken ?? null],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markInstanceFlushLedgerFlushed(input: {
    instanceId: string;
    domain: string;
    ownershipEpoch: number;
    flushedVersion: number;
    claimOwnerId: string;
    fencingToken: string | null;
  }): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const instanceId = normalizeRequiredString(input.instanceId);
    const domain = normalizeRequiredString(input.domain);
    const claimOwnerId = normalizeOptionalString(input.claimOwnerId);
    if (!instanceId || !domain || !claimOwnerId) {
      return false;
    }
    const result = await this.pool.query(
      `
        UPDATE ${INSTANCE_FLUSH_LEDGER_TABLE}
        SET flushed_version = LEAST(GREATEST(flushed_version, $4), latest_version),
            dirty_since_at = CASE WHEN LEAST(GREATEST(flushed_version, $4), latest_version) >= latest_version THEN NULL ELSE dirty_since_at END,
            payload_jsonb = CASE WHEN LEAST(GREATEST(flushed_version, $4), latest_version) >= latest_version THEN NULL ELSE payload_jsonb END,
            claimed_by = NULL,
            claim_until = NULL,
            next_attempt_at = NULL,
            retry_after = NULL,
            failure_category = NULL,
            updated_at = now()
        WHERE instance_id = $1 AND domain = $2 AND ownership_epoch = $3
          AND claimed_by = $5
          AND fencing_token IS NOT DISTINCT FROM $6::varchar
      `,
      [
        instanceId,
        domain,
        normalizePositiveInteger(input.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER),
        normalizeRevision(input.flushedVersion),
        claimOwnerId,
        input.fencingToken ?? null,
      ],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markPlayerFlushLedgerRetry(input: {
    playerId: string;
    domain: string;
    retryDelayMs?: number;
    claimOwnerId: string;
    fencingToken: string | null;
  }): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const playerId = normalizeRequiredString(input.playerId);
    const domain = normalizeRequiredString(input.domain);
    const claimOwnerId = normalizeOptionalString(input.claimOwnerId);
    if (!playerId || !domain || !claimOwnerId) {
      return false;
    }
    const retryDelayMs = normalizePositiveInteger(input.retryDelayMs, 5_000, 250, 300_000);
    const result = await this.pool.query(
      `
        UPDATE ${PLAYER_FLUSH_LEDGER_TABLE}
        SET next_attempt_at = now() + ($3::bigint * interval '1 millisecond'),
            retry_after = now() + ($3::bigint * interval '1 millisecond'),
            claimed_by = NULL,
            claim_until = NULL,
            updated_at = now()
        WHERE player_id = $1 AND domain = $2
          AND claimed_by = $4
          AND fencing_token IS NOT DISTINCT FROM $5::varchar
      `,
      [playerId, domain, retryDelayMs, claimOwnerId, input.fencingToken ?? null],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markInstanceFlushLedgerRetry(input: {
    instanceId: string;
    domain: string;
    ownershipEpoch: number;
    retryDelayMs?: number;
    claimOwnerId: string;
    fencingToken: string | null;
  }): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const instanceId = normalizeRequiredString(input.instanceId);
    const domain = normalizeRequiredString(input.domain);
    const claimOwnerId = normalizeOptionalString(input.claimOwnerId);
    if (!instanceId || !domain || !claimOwnerId) {
      return false;
    }
    const retryDelayMs = normalizePositiveInteger(input.retryDelayMs, 5_000, 250, 300_000);
    const result = await this.pool.query(
      `
        UPDATE ${INSTANCE_FLUSH_LEDGER_TABLE}
        SET next_attempt_at = now() + ($4::bigint * interval '1 millisecond'),
            retry_after = now() + ($4::bigint * interval '1 millisecond'),
            claimed_by = NULL,
            claim_until = NULL,
            updated_at = now()
        WHERE instance_id = $1 AND domain = $2 AND ownership_epoch = $3
          AND claimed_by = $5
          AND fencing_token IS NOT DISTINCT FROM $6::varchar
      `,
      [
        instanceId,
        domain,
        normalizePositiveInteger(input.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER),
        retryDelayMs,
        claimOwnerId,
        input.fencingToken ?? null,
      ],
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

  /** 统计每个 domain 中 payload 为空的积压记录数（worker 无法处理的 stale 记录） */
  async listPlayerStalePayloadCountByDomain(): Promise<Map<string, number>> {
    if (!this.pool || !this.enabled) {
      return new Map();
    }
    const result = await this.pool.query(
      `
        SELECT domain, COUNT(*)::bigint AS stale_count
        FROM ${PLAYER_FLUSH_LEDGER_TABLE}
        WHERE latest_version > flushed_version
          AND payload_jsonb IS NULL
        GROUP BY domain
      `,
    );
    const map = new Map<string, number>();
    for (const row of (result.rows ?? []) as Array<Record<string, unknown>>) {
      const domain = String(row.domain ?? '').trim();
      const count = normalizePositiveInteger(row.stale_count, 0, 0, Number.MAX_SAFE_INTEGER);
      if (domain && count > 0) {
        map.set(domain, count);
      }
    }
    return map;
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

  async retainCompletedFlushLedger(input?: {
    payloadRetentionMinutes?: number;
    rowRetentionDays?: number;
    limit?: number;
  }): Promise<FlushLedgerRetentionResult> {
    if (!this.pool || !this.enabled) {
      return {
        playerPayloadCleared: 0,
        instancePayloadCleared: 0,
        playerDeleted: 0,
        instanceDeleted: 0,
      };
    }
    const payloadRetentionMs = normalizePositiveInteger(
      Number(input?.payloadRetentionMinutes ?? 10) * 60_000,
      10 * 60_000,
      60_000,
      24 * 60 * 60_000,
    );
    const rowRetentionMs = normalizePositiveInteger(
      Number(input?.rowRetentionDays ?? 1) * 24 * 60 * 60_000,
      24 * 60 * 60_000,
      60 * 60_000,
      365 * 24 * 60 * 60_000,
    );
    const limit = normalizePositiveInteger(input?.limit, 500, 1, 10_000);
    const playerPayloadCleared = await clearCompletedFlushLedgerPayload(
      this.pool,
      PLAYER_FLUSH_LEDGER_TABLE,
      payloadRetentionMs,
      limit,
    );
    const instancePayloadCleared = await clearCompletedFlushLedgerPayload(
      this.pool,
      INSTANCE_FLUSH_LEDGER_TABLE,
      payloadRetentionMs,
      limit,
    );
    const playerDeleted = await deleteCompletedFlushLedgerRows(this.pool, PLAYER_FLUSH_LEDGER_TABLE, rowRetentionMs, limit);
    const instanceDeleted = await deleteCompletedFlushLedgerRows(this.pool, INSTANCE_FLUSH_LEDGER_TABLE, rowRetentionMs, limit);
    return {
      playerPayloadCleared,
      instancePayloadCleared,
      playerDeleted,
      instanceDeleted,
    };
  }

  private async safeClosePool(): Promise<void> {
    // 共享连接池由 DatabasePoolProvider 统一关闭，此处只释放引用。
    this.pool = null;
    this.enabled = false;
  }
}

async function clearCompletedFlushLedgerPayload(
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

async function deleteCompletedFlushLedgerRows(
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

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isRuntimeInventoryIdentityEquivalent(
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

function resolvePlayerPayloadFenceDecision(
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

function normalizeNonNegativeSafeInteger(value: unknown): number {
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

function dedupePlayerFlushLedgerInputs(inputs: PlayerFlushLedgerUpsertInput[]): PlayerFlushLedgerJsonRow[] {
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

function shouldReplacePlayerBatchRow(current: PlayerFlushLedgerJsonRow, incoming: PlayerFlushLedgerJsonRow): boolean {
  if (incoming.latest_version !== current.latest_version) {
    return incoming.latest_version > current.latest_version;
  }
  return incoming.fencing_token === current.fencing_token
    && current.payload_jsonb === null
    && incoming.payload_jsonb !== null;
}

function dedupeInstanceFlushLedgerInputs(inputs: InstanceFlushLedgerUpsertInput[]): InstanceFlushLedgerJsonRow[] {
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

function dedupeClaimedFlushTasks(tasks: FlushTask[]): FlushTask[] {
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

function compareCanonicalString(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function chunkRows<T>(rows: T[], batchSize: number): T[][] {
  const chunks: T[][] = [];
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    chunks.push(rows.slice(offset, offset + batchSize));
  }
  return chunks;
}

function normalizeRevision(value: unknown): number {
  return normalizePositiveInteger(value, 0, 0, Number.MAX_SAFE_INTEGER);
}

function buildClaimOwnerId(workerId: string): string {
  const prefix = normalizeRequiredString(workerId).slice(0, 80) || 'flush-worker';
  return `${prefix}:${randomUUID()}`;
}

function resolveFlushTaskClaimTtlMs(value?: number): number {
  const configured = value ?? Number(process.env.SERVER_FLUSH_TASK_CLAIM_TTL_MS);
  return normalizePositiveInteger(
    configured,
    DEFAULT_FLUSH_TASK_CLAIM_TTL_MS,
    MIN_FLUSH_TASK_CLAIM_TTL_MS,
    MAX_FLUSH_TASK_CLAIM_TTL_MS,
  );
}

function buildFlushTaskIdempotencyKey(task: FlushTask): string {
  const epoch = task.scope === 'instance' ? normalizePositiveInteger(task.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER) : 0;
  return `${task.scope}:${task.id}:${task.domain}:${epoch}:${Math.max(0, Math.trunc(Number(task.latestRevision ?? 0)))}`;
}

function normalizePriority(value: unknown): FlushTaskPriority {
  return value === 'high' || value === 'low' || value === 'normal' ? value : 'normal';
}

function mapFlushLedgerRowsToTasks(
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
