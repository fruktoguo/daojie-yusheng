import assert from 'node:assert/strict';
import type { Pool, PoolClient, QueryResult } from 'pg';

import {
  DurableOperationCommitOutcomeUnknownError,
  DurableOperationService,
  type ClaimMailAttachmentsInput,
  type DurableMarketMutationInput,
  type PurchaseNpcShopItemInput,
} from '../persistence/durable-operation.service';
import { isTransientPostgresError } from '../persistence/pg-error-utils';

type CommitMode = 'success' | 'applied_ack_loss' | 'not_applied_ack_loss' | 'replay_rollback_ack_loss';

interface OperationIdentity {
  operationId: string;
  operationType: string;
  aggregateType: string;
  playerId: string;
  payload: unknown;
}

interface CommittedCounters {
  commits: number;
  outboxEvents: number;
  auditLogs: number;
}

class CommitReconciliationPool {
  readonly counters: CommittedCounters = { commits: 0, outboxEvents: 0, auditLogs: 0 };
  connectCount = 0;
  destroyedReleaseCount = 0;
  readonly rollbackAttempts: number[] = [];
  readonly destroyedReleaseAttempts: number[] = [];
  committed: boolean;
  failStatusRead = false;
  statusReadFailuresRemaining = 0;
  statusNullReadsRemaining = 0;
  retryLockFailuresRemaining = 0;
  failConnectAfterFirst = false;
  failBeforeCommitAttempt = 0;
  beforePreCommitFailure: (() => void) | null = null;

  constructor(
    readonly identity: OperationIdentity,
    readonly mode: CommitMode,
    initiallyCommitted = false,
  ) {
    this.committed = initiallyCommitted;
  }

  async query(sql: string): Promise<QueryResult<Record<string, unknown>>> {
    if (this.failStatusRead || this.statusReadFailuresRemaining > 0) {
      this.statusReadFailuresRemaining = Math.max(0, this.statusReadFailuresRemaining - 1);
      throw new Error('simulated_status_read_failure');
    }
    if (sql.includes('SELECT status FROM durable_operation_log')) {
      if (this.statusNullReadsRemaining > 0) {
        this.statusNullReadsRemaining -= 1;
        return result([]);
      }
      return result(this.committed ? [{ status: 'committed' }] : []);
    }
    return result([]);
  }

  async connect(): Promise<PoolClient> {
    this.connectCount += 1;
    if (this.failConnectAfterFirst && this.connectCount > 1) {
      throw new Error('simulated_replay_connect_failure');
    }
    const attempt = this.connectCount;
    const pending = { outboxEvents: 0, auditLogs: 0 };
    const query = async (sqlInput: string): Promise<QueryResult<Record<string, unknown>>> => {
      const sql = String(sqlInput);
      if (
        attempt > 1
        && this.retryLockFailuresRemaining > 0
        && sql.includes('pg_advisory_xact_lock')
      ) {
        this.retryLockFailuresRemaining -= 1;
        throw Object.assign(new Error('canceling statement due to lock timeout'), { code: '55P03' });
      }
      if (sql.includes('FROM durable_operation_log') && sql.includes('FOR UPDATE')) {
        return result(this.committed ? [this.buildCommittedOperationRow()] : []);
      }
      if (sql.includes('FROM player_presence')) {
        if (attempt === this.failBeforeCommitAttempt) {
          this.beforePreCommitFailure?.();
          throw new Error('simulated_pre_commit_query_failure');
        }
        return result([{
          runtime_owner_id: 'runtime:commit-smoke',
          session_epoch: 7,
        }]);
      }
      if (sql.includes('SELECT mail_id, claimed_at, deleted_at, expire_at')) {
        return result([{ mail_id: 'mail:commit-smoke:1', claimed_at: null, deleted_at: null, expire_at: null }]);
      }
      if (sql.includes('FROM player_mail_attachment') && sql.includes('claimed_at IS NULL') && sql.includes('FOR UPDATE')) {
        return result([{ mail_id: 'mail:commit-smoke:1' }]);
      }
      if (sql.includes('SELECT counter_version, welcome_mail_delivered_at')) {
        return result([{ counter_version: 1, welcome_mail_delivered_at: null }]);
      }
      if (sql.includes('WITH visible_mail AS')) {
        return result([{ unread_count: 0, unclaimed_count: 0, latest_mail_at: null }]);
      }
      if (sql.includes('INSERT INTO outbox_event')) {
        pending.outboxEvents += 1;
      }
      if (sql.includes('INSERT INTO asset_audit_log')) {
        pending.auditLogs += 1;
      }
      if (sql.trim() === 'COMMIT') {
        if (attempt === 1 && this.mode === 'applied_ack_loss') {
          this.applyCommit(pending);
          throw new Error('simulated_commit_ack_loss_after_apply');
        }
        if (attempt === 1 && this.mode === 'not_applied_ack_loss') {
          throw new Error('simulated_commit_ack_loss_before_apply');
        }
        this.applyCommit(pending);
        return result([]);
      }
      if (sql.trim() === 'ROLLBACK') {
        this.rollbackAttempts.push(attempt);
        if (this.mode === 'replay_rollback_ack_loss') {
          throw new Error('simulated_replay_rollback_ack_loss');
        }
      }
      return result([], 1);
    };
    return {
      query,
      release: (destroy?: boolean) => {
        if (destroy === true) {
          this.destroyedReleaseCount += 1;
          this.destroyedReleaseAttempts.push(attempt);
        }
      },
    } as unknown as PoolClient;
  }

  private applyCommit(pending: { outboxEvents: number; auditLogs: number }): void {
    if (this.committed) {
      return;
    }
    this.committed = true;
    this.counters.commits += 1;
    this.counters.outboxEvents += pending.outboxEvents;
    this.counters.auditLogs += pending.auditLogs;
  }

  private buildCommittedOperationRow(): Record<string, unknown> {
    return {
      status: 'committed',
      operation_type: this.identity.operationType,
      aggregate_type: this.identity.aggregateType,
      player_id: this.identity.playerId,
      payload_jsonb: this.identity.payload,
    };
  }
}

async function main(): Promise<void> {
  proveTransientPostgresClassificationKeepsDeterministicConflictsDistinct();
  await proveAppliedCommitAckLossIsConfirmedWithoutDuplicate();
  await proveUnappliedCommitAckLossIsRetriedOnce();
  await proveUnknownOutcomeWaitsForStatusRecovery();
  await proveNullStatusAndTransientRetryEventuallyConfirmCommitted();
  await proveStatusConfirmationStillValidatesReplayIdentity();
  await proveShutdownBeforeCommitDestroysClientWithoutRollback();
  await proveShutdownInterruptsPendingStatusRead();
  await proveCommittedReplayIgnoresRollbackAckLoss();
  await proveMailCommitAckLossIsConfirmed();
  await proveMarketCommitAckLossReturnsReplaySemantics();

  console.log(JSON.stringify({
    ok: true,
    case: 'durable-operation-commit-reconciliation',
    answers: '通用资产、邮件与市场事务在 COMMIT 回包丢失后持续持锁收敛；状态可读后遇到锁、查询或连接瞬态错误会继续幂等重放，身份冲突仍立即失败，shutdown 会为受影响玩家和实例登记 fence。',
  }));
}

function proveTransientPostgresClassificationKeepsDeterministicConflictsDistinct(): void {
  assert.equal(isTransientPostgresError(Object.assign(new Error('lock timeout'), { code: '55P03' })), true);
  assert.equal(isTransientPostgresError(Object.assign(new Error('statement timeout'), { code: '57014' })), true);
  assert.equal(isTransientPostgresError(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })), true);
  assert.equal(isTransientPostgresError({ cause: { code: '08006' } }), true);
  assert.equal(isTransientPostgresError(new Error('durable_operation_replay_identity_conflict')), false);
}

async function proveNullStatusAndTransientRetryEventuallyConfirmCommitted(): Promise<void> {
  const input = buildPurchaseInput('op:commit-smoke:transient-retry');
  const pool = buildPoolForPurchase(input, 'applied_ack_loss');
  pool.statusNullReadsRemaining = 1;
  pool.retryLockFailuresRemaining = 1;
  const service = buildService(pool);

  const resultValue = await service.purchaseNpcShopItem(input);
  assert.equal(resultValue.ok, true);
  assert.equal(resultValue.alreadyCommitted, false);
  assert.equal(pool.statusNullReadsRemaining, 0);
  assert.equal(pool.retryLockFailuresRemaining, 0);
  assert.equal(pool.connectCount, 3);
  assert.deepEqual(pool.counters, { commits: 1, outboxEvents: 1, auditLogs: 1 });
}

async function proveShutdownBeforeCommitDestroysClientWithoutRollback(): Promise<void> {
  const input = buildPurchaseInput('op:commit-smoke:shutdown-pre-commit');
  const pool = buildPoolForPurchase(input, 'success');
  const service = buildService(pool);
  pool.failBeforeCommitAttempt = 1;
  pool.beforePreCommitFailure = () => service.beginShutdown();

  await assert.rejects(service.purchaseNpcShopItem(input), /simulated_pre_commit_query_failure/);
  assert.equal(service.isShuttingDown(), true);
  assert.deepEqual(pool.rollbackAttempts, []);
  assert.deepEqual(pool.destroyedReleaseAttempts, [1]);
}

async function proveShutdownInterruptsPendingStatusRead(): Promise<void> {
  const service = new DurableOperationService(null, null);
  const mutable = service as unknown as {
    pool: Pool;
    enabled: boolean;
    settleUnknownCommitOutcome<T>(input: {
      operationId: string;
      cause: unknown;
      affectedPlayerIds?: string[];
      affectedInstanceIds?: string[];
      onSettled: (result: T) => T;
      retry: () => Promise<T>;
    }): Promise<T>;
  };
  mutable.pool = {
    query: () => new Promise(() => undefined),
  } as unknown as Pool;
  mutable.enabled = true;
  const pending = mutable.settleUnknownCommitOutcome({
    operationId: 'op:commit-smoke:shutdown',
    cause: new Error('simulated_commit_ack_loss'),
    affectedPlayerIds: ['player:commit-smoke'],
    affectedInstanceIds: ['instance:commit-smoke'],
    onSettled: (result) => result,
    retry: async () => ({ ok: true }),
  });
  await Promise.resolve();
  service.beginShutdown();
  await assert.rejects(
    pending,
    (error: unknown) => error instanceof DurableOperationCommitOutcomeUnknownError,
  );
  assert.equal(service.isPlayerCommitOutcomeUnresolved('player:commit-smoke'), true);
  assert.equal(service.isInstanceCommitOutcomeUnresolved('instance:commit-smoke'), true);
}

async function proveStatusConfirmationStillValidatesReplayIdentity(): Promise<void> {
  const input = buildPurchaseInput('op:commit-smoke:identity');
  const pool = new CommitReconciliationPool({
    operationId: input.operationId,
    operationType: 'npc_shop_purchase',
    aggregateType: 'player_wallet',
    playerId: 'player:other',
    payload: {
      itemId: input.itemId,
      quantity: input.quantity,
      totalCost: input.totalCost,
    },
  }, 'applied_ack_loss');
  const service = buildService(pool);

  await assert.rejects(
    service.purchaseNpcShopItem(input),
    /durable_operation_replay_identity_conflict/,
  );
  assert.equal(pool.connectCount, 2);
}

async function proveAppliedCommitAckLossIsConfirmedWithoutDuplicate(): Promise<void> {
  const input = buildPurchaseInput('op:commit-smoke:applied');
  const pool = buildPoolForPurchase(input, 'applied_ack_loss');
  const service = buildService(pool);
  const resultValue = await service.purchaseNpcShopItem(input);

  assert.equal(resultValue.ok, true);
  assert.equal(resultValue.alreadyCommitted, false);
  assert.equal(pool.connectCount, 2);
  assert.equal(pool.rollbackAttempts.includes(1), false);
  assert.equal(pool.destroyedReleaseAttempts.includes(1), true);
  assert.deepEqual(pool.counters, { commits: 1, outboxEvents: 1, auditLogs: 1 });
}

async function proveUnappliedCommitAckLossIsRetriedOnce(): Promise<void> {
  const input = buildPurchaseInput('op:commit-smoke:retry');
  const pool = buildPoolForPurchase(input, 'not_applied_ack_loss');
  const service = buildService(pool);
  const resultValue = await service.purchaseNpcShopItem(input);

  assert.equal(resultValue.ok, true);
  assert.equal(resultValue.alreadyCommitted, false);
  assert.equal(pool.connectCount, 2);
  assert.equal(pool.rollbackAttempts.includes(1), false);
  assert.equal(pool.destroyedReleaseAttempts.includes(1), true);
  assert.deepEqual(pool.counters, { commits: 1, outboxEvents: 1, auditLogs: 1 });
}

async function proveUnknownOutcomeWaitsForStatusRecovery(): Promise<void> {
  const input = buildPurchaseInput('op:commit-smoke:unknown');
  const pool = buildPoolForPurchase(input, 'not_applied_ack_loss');
  pool.statusReadFailuresRemaining = 2;
  const service = buildService(pool);

  const resultValue = await service.purchaseNpcShopItem(input);
  assert.equal(resultValue.ok, true);
  assert.equal(resultValue.alreadyCommitted, false);
  assert.equal(pool.statusReadFailuresRemaining, 0);
  assert.equal(pool.connectCount, 2);
  assert.deepEqual(pool.counters, { commits: 1, outboxEvents: 1, auditLogs: 1 });
}

async function proveCommittedReplayIgnoresRollbackAckLoss(): Promise<void> {
  const input = buildPurchaseInput('op:commit-smoke:replay');
  const pool = buildPoolForPurchase(input, 'replay_rollback_ack_loss', true);
  const service = buildService(pool);
  const resultValue = await service.purchaseNpcShopItem(input);

  assert.equal(resultValue.ok, true);
  assert.equal(resultValue.alreadyCommitted, true);
  assert.equal(pool.connectCount, 1);
  assert.equal(pool.destroyedReleaseCount, 1);
  assert.deepEqual(pool.counters, { commits: 0, outboxEvents: 0, auditLogs: 0 });
}

async function proveMailCommitAckLossIsConfirmed(): Promise<void> {
  const input = buildMailInput();
  const pool = new CommitReconciliationPool({
    operationId: input.operationId,
    operationType: 'mail_claim',
    aggregateType: 'player_mail',
    playerId: input.playerId,
    payload: { mailIds: input.mailIds },
  }, 'applied_ack_loss');
  const service = buildService(pool);
  const resultValue = await service.claimMailAttachments(input);

  assert.equal(resultValue.ok, true);
  assert.equal(resultValue.alreadyCommitted, false);
  assert.equal(pool.connectCount, 2);
  assert.equal(pool.rollbackAttempts.includes(1), false);
  assert.equal(pool.destroyedReleaseAttempts.includes(1), true);
  assert.deepEqual(pool.counters, { commits: 1, outboxEvents: 1, auditLogs: 1 });
}

async function proveMarketCommitAckLossReturnsReplaySemantics(): Promise<void> {
  const input: DurableMarketMutationInput = {
    operationId: 'op:commit-smoke:market',
    operationType: 'market_gm_ban',
    playerId: 'player:commit-smoke',
    expectedRuntimeOwnerId: '',
    expectedSessionEpoch: 0,
    requirePresenceFence: false,
    payload: { targetPlayerId: 'player:commit-smoke' },
    banUser: {
      playerId: 'player:commit-smoke',
      bannedAt: '2026-07-10T00:00:00.000Z',
      banReason: 'smoke',
      bannedBy: 'smoke',
    },
  };
  const pool = new CommitReconciliationPool({
    operationId: input.operationId,
    operationType: input.operationType,
    aggregateType: 'market_mutation',
    playerId: input.playerId,
    payload: { request: input.payload },
  }, 'applied_ack_loss');
  const service = buildService(pool);
  const resultValue = await service.settleMarketMutation(input);

  assert.equal(resultValue.ok, true);
  assert.equal(resultValue.alreadyCommitted, false);
  assert.deepEqual(pool.counters, { commits: 1, outboxEvents: 1, auditLogs: 1 });
  assert.equal(pool.rollbackAttempts.includes(1), false);
  assert.equal(pool.destroyedReleaseAttempts.includes(1), true);
}

function buildPurchaseInput(operationId: string): PurchaseNpcShopItemInput {
  return {
    operationId,
    playerId: 'player:commit-smoke',
    expectedRuntimeOwnerId: 'runtime:commit-smoke',
    expectedSessionEpoch: 7,
    itemId: 'smoke_item',
    quantity: 1,
    totalCost: 2,
    nextInventoryItems: [{
      itemId: 'smoke_item',
      itemInstanceId: '00000000-0000-4000-8000-000000000001',
      count: 1,
      rawPayload: { itemId: 'smoke_item', count: 1 },
    }],
    nextWalletBalances: [{ walletType: 'spirit_stone', balance: 8, frozenBalance: 0, version: 2 }],
  };
}

function buildMailInput(): ClaimMailAttachmentsInput {
  return {
    operationId: 'op:commit-smoke:mail',
    playerId: 'player:commit-smoke',
    expectedRuntimeOwnerId: 'runtime:commit-smoke',
    expectedSessionEpoch: 7,
    mailIds: ['mail:commit-smoke:1'],
    nextInventoryItems: [{
      itemId: 'mail_item',
      itemInstanceId: '00000000-0000-4000-8000-000000000002',
      count: 1,
      rawPayload: { itemId: 'mail_item', count: 1 },
    }],
    nextPlayerSnapshot: {
      playerId: 'player:commit-smoke',
      savedAt: Date.now(),
    } as unknown as ClaimMailAttachmentsInput['nextPlayerSnapshot'],
  };
}

function buildPoolForPurchase(
  input: PurchaseNpcShopItemInput,
  mode: CommitMode,
  initiallyCommitted = false,
): CommitReconciliationPool {
  return new CommitReconciliationPool({
    operationId: input.operationId,
    operationType: 'npc_shop_purchase',
    aggregateType: 'player_wallet',
    playerId: input.playerId,
    payload: {
      itemId: input.itemId,
      quantity: input.quantity,
      totalCost: input.totalCost,
    },
  }, mode, initiallyCommitted);
}

function buildService(pool: CommitReconciliationPool): DurableOperationService {
  const service = new DurableOperationService(null, null);
  const mutable = service as unknown as {
    pool: Pool;
    enabled: boolean;
  };
  mutable.pool = pool as unknown as Pool;
  mutable.enabled = true;
  return service;
}

function result<T extends Record<string, unknown>>(rows: T[], rowCount = rows.length): QueryResult<T> {
  return {
    command: '',
    rowCount,
    oid: 0,
    fields: [],
    rows,
  };
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
