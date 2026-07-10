import assert from 'node:assert/strict';
import type { Pool, PoolClient, QueryResult } from 'pg';

import {
  DurableOperationCommitOutcomeUnknownError,
  DurableOperationService,
  type ClaimMailAttachmentsInput,
  type DurableMarketMutationInput,
  type PurchaseNpcShopItemInput,
} from '../persistence/durable-operation.service';

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
  committed: boolean;
  failStatusRead = false;
  statusReadFailuresRemaining = 0;
  failConnectAfterFirst = false;

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
      if (sql.includes('FROM durable_operation_log') && sql.includes('FOR UPDATE')) {
        return result(this.committed ? [this.buildCommittedOperationRow()] : []);
      }
      if (sql.includes('FROM player_presence')) {
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
      if (sql.trim() === 'ROLLBACK' && this.mode === 'replay_rollback_ack_loss') {
        throw new Error('simulated_replay_rollback_ack_loss');
      }
      return result([], 1);
    };
    return {
      query,
      release: (destroy?: boolean) => {
        if (destroy === true) {
          this.destroyedReleaseCount += 1;
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
  await proveAppliedCommitAckLossIsConfirmedWithoutDuplicate();
  await proveUnappliedCommitAckLossIsRetriedOnce();
  await proveUnknownOutcomeWaitsForStatusRecovery();
  await proveStatusConfirmationStillValidatesReplayIdentity();
  await proveShutdownInterruptsPendingStatusRead();
  await proveCommittedReplayIgnoresRollbackAckLoss();
  await proveMailCommitAckLossIsConfirmed();
  await proveMarketCommitAckLossReturnsReplaySemantics();

  console.log(JSON.stringify({
    ok: true,
    case: 'durable-operation-commit-reconciliation',
    answers: '通用资产、邮件与市场事务在 COMMIT 回包丢失后持续持锁到数据库恢复可读，再通过带身份校验的幂等入口收敛；当前调用确认成功后仍返回本次语义，显式历史重放才返回 alreadyCommitted。',
  }));
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
