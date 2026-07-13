/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createItemStackSignature, EQUIP_SLOTS, isLegacyItemInstanceId, MAIL_BATCH_OPERATION_MAX } from '@mud/shared';
import { createHash, randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import {
  assignStableItemInstanceId,
  upsertEquipmentSlotRowsWithItemInstanceIdRepair,
  type EquipmentSlotPersistenceRow,
  type ItemInstanceIdPersistenceRowSource,
} from './compat/item-instance-id-compat';
import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from './database-pool.provider';
import { assertInstanceLeaseWriteFence } from './instance-lease-write-fence';
import {
  buildPersistedEquipmentItemRawPayload,
  buildPersistedInventoryItemRawPayload,
} from './inventory-item-persistence';
import { NodeRegistryService } from './node-registry.service';
import type { PersistedPlayerSnapshot } from './player-persistence.service';
import { isTransientPostgresError } from './pg-error-utils';
import {
  savePlayerSnapshotProjectionDomainsWithClient,
  type PlayerTechniqueActivityQueueUpsertInput,
} from './player-domain-persistence.service';
import { ensureBigintColumnsWithClient } from './schema-bigint-migration';
import {
  persistDurableFormationWriteWithClient,
  type DurableSectFormationWrite,
} from './sect-durable-persistence';
import {
  normalizeDurableTileResourceSourceMutation,
  persistDurableTileResourceSourceMutation,
  type DurableTileResourceSourceMutation,
} from './tile-resource-durable-persistence';
import {
  normalizeDurableLootSourceMutation,
  persistDurableLootSourceMutation,
  type DurableContainerStateSourceMutation,
  type DurableGroundTileSourceMutation,
} from './loot-source-durable-persistence';

const PLAYER_PRESENCE_TABLE = 'player_presence';
const PLAYER_WALLET_TABLE = 'player_wallet';
const PLAYER_INVENTORY_ITEM_TABLE = 'player_inventory_item';
const PLAYER_MARKET_STORAGE_ITEM_TABLE = 'player_market_storage_item';
const MARKET_ORDER_TABLE = 'server_market_order';
const MARKET_TRADE_TABLE = 'server_market_trade_history';
const PLAYER_AUTH_TABLE = 'server_player_auth';
const PLAYER_EQUIPMENT_SLOT_TABLE = 'player_equipment_slot';
const PLAYER_QUEST_PROGRESS_TABLE = 'player_quest_progress';
const durableModuleLogger = new Logger('DurableOperation:LegacyCompat');
const PLAYER_ACTIVE_JOB_TABLE = 'player_active_job';
const PLAYER_TECHNIQUE_ACTIVITY_QUEUE_TABLE = 'player_technique_activity_queue';
const PLAYER_ENHANCEMENT_RECORD_TABLE = 'player_enhancement_record';
const PLAYER_PROFESSION_STATE_TABLE = 'player_profession_state';
const PLAYER_MAIL_TABLE = 'player_mail';
const PLAYER_MAIL_ATTACHMENT_TABLE = 'player_mail_attachment';
const PLAYER_MAIL_COUNTER_TABLE = 'player_mail_counter';
const PLAYER_RECOVERY_WATERMARK_TABLE = 'player_recovery_watermark';
const DURABLE_OPERATION_LOG_TABLE = 'durable_operation_log';
const OUTBOX_EVENT_TABLE = 'outbox_event';
const DEAD_LETTER_EVENT_TABLE = 'dead_letter_event';
const ASSET_AUDIT_LOG_TABLE = 'asset_audit_log';
const ASSET_AUDIT_LOG_ARCHIVE_TABLE = 'asset_audit_log_archive';
const MAX_DURABLE_TIME_CHAMBER_FUEL_UNITS = Number.MAX_SAFE_INTEGER;
const DURABLE_OPERATION_ID_SAFE_LENGTH = 173;
const DURABLE_OPERATION_BIGINT_COLUMNS_BY_TABLE = {
  [OUTBOX_EVENT_TABLE]: ['attempt_count'],
  [PLAYER_MAIL_ATTACHMENT_TABLE]: ['count'],
  [PLAYER_MAIL_COUNTER_TABLE]: ['unread_count', 'unclaimed_count'],
  [PLAYER_INVENTORY_ITEM_TABLE]: ['slot_index', 'count'],
  [PLAYER_MARKET_STORAGE_ITEM_TABLE]: ['slot_index', 'count', 'enhance_level'],
  [PLAYER_ACTIVE_JOB_TABLE]: ['paused_ticks', 'total_ticks', 'remaining_ticks'],
  [PLAYER_PROFESSION_STATE_TABLE]: ['level'],
  [PLAYER_ENHANCEMENT_RECORD_TABLE]: [
    'highest_level',
    'start_level',
    'initial_target_level',
    'desired_target_level',
    'protection_start_level',
  ],
} as const;

export interface DurableInventoryItemSnapshot {
  itemId: string;
  itemInstanceId?: string;
  count: number;
  lockedBy?: string | null;
  lockedAt?: number | null;
  name?: string;
  desc?: string;
  enhanceLevel?: number | null;
  learnTechniqueId?: string;
  learnTechniqueMaxLevel?: number;
  grade?: string;
  level?: number;
  rawPayload: unknown;
}

export interface DurableWalletBalanceSnapshot {
  walletType: string;
  balance: number;
  frozenBalance?: number;
  version?: number;
}

export interface ClaimMailAttachmentsInput {
  operationId: string;
  playerId: string;
  expectedRuntimeOwnerId: string;
  expectedSessionEpoch: number;
  expectedInstanceId?: string | null;
  expectedAssignedNodeId?: string | null;
  expectedOwnershipEpoch?: number | null;
  mailIds: string[];
  nextInventoryItems: DurableInventoryItemSnapshot[];
  nextWalletBalances?: DurableWalletBalanceSnapshot[];
  nextPlayerSnapshot: PersistedPlayerSnapshot;
}

export interface ClaimMailAttachmentsResult {
  ok: boolean;
  alreadyCommitted: boolean;
  unreadCount: number;
  unclaimedCount: number;
}

export interface DurableMarketStorageItemSnapshot {
  storageItemId?: string;
  slotIndex?: number;
  itemId: string;
  count: number;
  enhanceLevel?: number | null;
  rawPayload?: unknown;
}

export interface DurableMarketPlayerMutationSnapshot {
  playerId: string;
  expectedRuntimeOwnerId?: string | null;
  expectedSessionEpoch?: number | null;
  nextInventoryItems?: DurableInventoryItemSnapshot[] | null;
  nextWalletBalances?: DurableWalletBalanceSnapshot[] | null;
  nextMarketStorageItems?: DurableMarketStorageItemSnapshot[] | null;
}

export interface DurableMarketExpectedOrderSnapshot {
  orderId: string;
  exists: boolean;
  status?: string | null;
  remainingQuantity?: number | null;
  updatedAtMs?: number | null;
}

export interface DurableMarketBanUserSnapshot {
  playerId: string;
  bannedAt: string;
  banReason?: string | null;
  bannedBy?: string | null;
}

export interface DurableMarketMutationInput {
  operationId: string;
  playerId: string;
  expectedRuntimeOwnerId: string;
  expectedSessionEpoch: number;
  expectedInstanceId?: string | null;
  expectedAssignedNodeId?: string | null;
  expectedOwnershipEpoch?: number | null;
  operationType: string;
  payload?: unknown;
  playerMutations?: DurableMarketPlayerMutationSnapshot[] | null;
  expectedOrders?: DurableMarketExpectedOrderSnapshot[] | null;
  upsertOrders?: readonly unknown[] | null;
  deleteOrderIds?: readonly unknown[] | null;
  tradeRecords?: readonly unknown[] | null;
  banUser?: DurableMarketBanUserSnapshot | null;
  requirePresenceFence?: boolean;
}

export interface ClaimMarketStorageInput {
  operationId: string;
  playerId: string;
  expectedRuntimeOwnerId: string;
  expectedSessionEpoch: number;
  expectedInstanceId?: string | null;
  expectedAssignedNodeId?: string | null;
  expectedOwnershipEpoch?: number | null;
  movedCount: number;
  remainingCount: number;
  nextInventoryItems: DurableInventoryItemSnapshot[];
  nextMarketStorageItems: DurableMarketStorageItemSnapshot[];
}

export interface ClaimMarketStorageResult {
  ok: boolean;
  alreadyCommitted: boolean;
  movedCount: number;
  remainingCount: number;
}

export interface DurableEquipmentSlotSnapshot {
  slot: string;
  itemInstanceId?: string;
  item: unknown;
}

export interface PurchaseNpcShopItemInput {
  operationId: string;
  playerId: string;
  expectedRuntimeOwnerId: string;
  expectedSessionEpoch: number;
  expectedInstanceId?: string | null;
  expectedAssignedNodeId?: string | null;
  expectedOwnershipEpoch?: number | null;
  itemId: string;
  quantity: number;
  totalCost: number;
  nextInventoryItems: DurableInventoryItemSnapshot[];
  nextWalletBalances: DurableWalletBalanceSnapshot[];
}

export interface PurchaseNpcShopItemResult {
  ok: boolean;
  alreadyCommitted: boolean;
  itemId: string;
  quantity: number;
  totalCost: number;
}

export interface MutatePlayerWalletInput {
  operationId: string;
  playerId: string;
  expectedRuntimeOwnerId: string;
  expectedSessionEpoch: number;
  expectedInstanceId?: string | null;
  expectedAssignedNodeId?: string | null;
  expectedOwnershipEpoch?: number | null;
  walletType: string;
  action: 'credit' | 'debit';
  delta: number;
  nextWalletBalances: DurableWalletBalanceSnapshot[];
}

export interface MutatePlayerWalletResult {
  ok: boolean;
  alreadyCommitted: boolean;
  walletType: string;
  action: 'credit' | 'debit';
  delta: number;
}

export interface GrantInventoryItemsInput {
  operationId: string;
  playerId: string;
  expectedRuntimeOwnerId: string;
  expectedSessionEpoch: number;
  expectedInstanceId?: string | null;
  expectedAssignedNodeId?: string | null;
  expectedLeaseToken?: string | null;
  expectedOwnershipEpoch?: number | null;
  sourceType: string;
  sourceRefId?: string | null;
  inventoryAction?: 'grant' | 'remove' | 'transfer';
  grantedItems: DurableInventoryItemSnapshot[];
  nextInventoryItems: DurableInventoryItemSnapshot[];
  sourceMutation?: DurableInventoryGrantSourceMutation | null;
}

export type DurableInventoryGrantSourceMutation =
  | DurableGroundTileSourceMutation
  | DurableContainerStateSourceMutation
  | {
      kind: 'time_chamber_fuel';
      instanceId: string;
      buildingId: string;
      fuelUnits: number;
    }
  | DurableTileResourceSourceMutation;

export interface GrantInventoryItemsResult {
  ok: boolean;
  alreadyCommitted: boolean;
  grantedCount: number;
  sourceType: string;
}

export interface CommitFormationResourceMutationInput {
  operationId: string;
  playerId: string;
  expectedRuntimeOwnerId: string;
  expectedSessionEpoch: number;
  expectedInstanceId: string;
  expectedAssignedNodeId: string;
  expectedLeaseToken: string;
  expectedOwnershipEpoch: number;
  action: 'deploy' | 'refill' | 'inject';
  formationWrite: DurableSectFormationWrite;
  expectedFormationUpdatedAtMs?: number | null;
  expectFormationAbsent?: boolean;
  nextPlayerSnapshot: PersistedPlayerSnapshot;
  spiritStoneCount: number;
  qiAmount: number;
  diskItemInstanceId?: string | null;
}

export interface CommitFormationResourceMutationResult {
  ok: boolean;
  alreadyCommitted: boolean;
  action: 'deploy' | 'refill' | 'inject';
  formationInstanceId: string;
}

export interface CommitFormationMaintenanceMutationInput {
  operationId: string;
  playerId: string;
  expectedRuntimeOwnerId: string;
  expectedSessionEpoch: number;
  expectedInstanceId: string;
  expectedAssignedNodeId: string;
  expectedLeaseToken: string;
  expectedOwnershipEpoch: number;
  formationWrite: DurableSectFormationWrite;
  expectedFormationUpdatedAtMs: number;
  expectedJobRunId: string;
  expectedJobVersion: number;
  nextActiveJob: DurableActiveJobSnapshot;
  nextPlayerSnapshot: PersistedPlayerSnapshot;
  qiAmount: number;
  formationQiAmount: number;
}

export interface CommitFormationMaintenanceMutationResult {
  ok: boolean;
  alreadyCommitted: boolean;
  formationInstanceId: string;
  jobRunId: string;
  jobVersion: number;
}

/**
 * PostgreSQL 已收到 COMMIT 后连接报错时，调用方不能把事务按普通失败回滚运行态。
 * operationId 用于在新连接上查询 durable_operation_log 并完成幂等回读。
 */
export class DurableOperationCommitOutcomeUnknownError extends Error {
  readonly operationId: string;

  constructor(operationId: string, cause: unknown) {
    super(
      `durable_operation_commit_outcome_unknown:${operationId}`,
      cause === undefined ? undefined : { cause },
    );
    this.name = 'DurableOperationCommitOutcomeUnknownError';
    this.operationId = operationId;
  }
}

class DurableOperationShutdownError extends Error {
  constructor() {
    super('durable_operation_shutdown');
  }
}

function createDurableShutdownSignal(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

export interface DurableQuestProgressSnapshot {
  questId: string;
  status: string;
  progressPayload?: Record<string, unknown> | unknown[] | null;
  rawPayload?: Record<string, unknown> | null;
}

export interface SubmitNpcQuestRewardsInput {
  operationId: string;
  playerId: string;
  expectedRuntimeOwnerId: string;
  expectedSessionEpoch: number;
  expectedInstanceId?: string | null;
  expectedAssignedNodeId?: string | null;
  expectedOwnershipEpoch?: number | null;
  questId: string;
  nextInventoryItems: DurableInventoryItemSnapshot[];
  nextWalletBalances: DurableWalletBalanceSnapshot[];
  nextQuestEntries: DurableQuestProgressSnapshot[];
}

export interface SubmitNpcQuestRewardsResult {
  ok: boolean;
  alreadyCommitted: boolean;
  questId: string;
}

export interface UpdateEquipmentLoadoutInput {
  operationId: string;
  playerId: string;
  expectedRuntimeOwnerId: string;
  expectedSessionEpoch: number;
  expectedInstanceId?: string | null;
  expectedAssignedNodeId?: string | null;
  expectedOwnershipEpoch?: number | null;
  action: 'equip' | 'unequip';
  slot: string;
  nextInventoryItems: DurableInventoryItemSnapshot[];
  nextEquipmentSlots: DurableEquipmentSlotSnapshot[];
}

export interface UpdateEquipmentLoadoutResult {
  ok: boolean;
  alreadyCommitted: boolean;
  action: 'equip' | 'unequip';
  slot: string;
}

export interface DurableActiveJobSnapshot {
  jobRunId: string;
  jobType: string;
  status: string;
  phase: string;
  startedAt: number;
  finishedAt?: number | null;
  pausedTicks?: number;
  totalTicks?: number;
  remainingTicks?: number;
  successRate?: number;
  speedRate?: number;
  jobVersion: number;
  detailJson?: unknown;
}

export interface DurableEnhancementRecordSnapshot {
  recordId?: string;
  itemId: string;
  highestLevel?: number;
  levels?: unknown[];
  actionStartedAt?: number | null;
  actionEndedAt?: number | null;
  startLevel?: number | null;
  initialTargetLevel?: number | null;
  desiredTargetLevel?: number | null;
  protectionStartLevel?: number | null;
  status?: string | null;
}

export interface DurableProfessionStateSnapshot {
  professionType: 'alchemy' | 'building' | 'gather' | 'enhancement' | 'forging' | 'mining' | 'formation' | 'transmission';
  level: number;
  exp?: number | null;
  expToNext?: number | null;
}

export interface UpdateActiveJobStateInput {
  operationId: string;
  playerId: string;
  expectedRuntimeOwnerId: string;
  expectedSessionEpoch: number;
  expectedInstanceId?: string | null;
  expectedAssignedNodeId?: string | null;
  expectedOwnershipEpoch?: number | null;
  action: 'start' | 'update' | 'cancel' | 'complete';
  expectedJobRunId?: string | null;
  expectedJobVersion?: number | null;
  nextActiveJob?: DurableActiveJobSnapshot | null;
}

export interface UpdateActiveJobStateResult {
  ok: boolean;
  alreadyCommitted: boolean;
  action: 'start' | 'update' | 'cancel' | 'complete';
  jobRunId: string | null;
  jobVersion: number | null;
}

export interface StartActiveJobWithAssetsInput {
  operationId: string;
  playerId: string;
  expectedRuntimeOwnerId: string;
  expectedSessionEpoch: number;
  expectedInstanceId?: string | null;
  expectedAssignedNodeId?: string | null;
  expectedOwnershipEpoch?: number | null;
  nextInventoryItems: DurableInventoryItemSnapshot[];
  nextWalletBalances: DurableWalletBalanceSnapshot[];
  nextActiveJob: DurableActiveJobSnapshot;
  nextEnhancementRecords?: DurableEnhancementRecordSnapshot[] | null;
  /** 从统一技艺队列启动时，必须与 nextTechniqueActivityQueue 成对提供。 */
  expectedQueueHeadId?: string;
  /** 队首任务启动成功后应保留的剩余队列；与任务及资产在同一事务内替换。 */
  nextTechniqueActivityQueue?: PlayerTechniqueActivityQueueUpsertInput[];
}

export interface StartActiveJobWithAssetsResult {
  ok: boolean;
  alreadyCommitted: boolean;
  action: 'start';
  jobRunId: string;
  jobVersion: number;
}

export interface CancelActiveJobWithAssetsInput {
  operationId: string;
  playerId: string;
  expectedRuntimeOwnerId: string;
  expectedSessionEpoch: number;
  expectedInstanceId?: string | null;
  expectedAssignedNodeId?: string | null;
  expectedOwnershipEpoch?: number | null;
  expectedJobRunId: string;
  expectedJobVersion: number;
  nextInventoryItems: DurableInventoryItemSnapshot[];
  nextWalletBalances: DurableWalletBalanceSnapshot[];
  nextEquipmentSlots?: DurableEquipmentSlotSnapshot[] | null;
  nextEnhancementRecords?: DurableEnhancementRecordSnapshot[] | null;
}

export interface CancelActiveJobWithAssetsResult {
  ok: boolean;
  alreadyCommitted: boolean;
  action: 'cancel';
  jobRunId: null;
  jobVersion: null;
}

export interface CompleteActiveJobWithAssetsInput {
  operationId: string;
  playerId: string;
  expectedRuntimeOwnerId: string;
  expectedSessionEpoch: number;
  expectedInstanceId?: string | null;
  expectedAssignedNodeId?: string | null;
  expectedOwnershipEpoch?: number | null;
  expectedJobRunId: string;
  expectedJobVersion: number;
  nextInventoryItems: DurableInventoryItemSnapshot[];
  nextWalletBalances: DurableWalletBalanceSnapshot[];
  nextEquipmentSlots?: DurableEquipmentSlotSnapshot[] | null;
  nextEnhancementRecords?: DurableEnhancementRecordSnapshot[] | null;
  /** 每阶资产结算实际变更的职业 patch；未提供的职业保持不变。 */
  nextProfessionStates?: DurableProfessionStateSnapshot[] | null;
  nextActiveJob?: DurableActiveJobSnapshot | null;
  completionKind?: ActiveJobCompletionKind;
}

export type ActiveJobCompletionKind = 'completed' | 'advanced' | 'stopped';

export interface CompleteActiveJobWithAssetsResult {
  ok: boolean;
  alreadyCommitted: boolean;
  action: 'complete';
  jobRunId: string | null;
  jobVersion: number | null;
}

export interface DurableOperationRetentionResult {
  operationLogsDeleted: number;
}

export interface DurableMarketSellNowMatchSnapshot {
  buyerId: string;
  tradeQuantity: number;
  totalCost: number;
  nextBuyerInventoryItems: DurableInventoryItemSnapshot[];
}

export interface DurableMarketBuyNowMatchSnapshot {
  sellerId: string;
  tradeQuantity: number;
  totalCost: number;
  nextSellerInventoryItems: DurableInventoryItemSnapshot[];
  nextSellerWalletBalances: DurableWalletBalanceSnapshot[];
}

/** 持久化操作服务：提供邮件领取、市场交易等多表资产变更的幂等事务执行 */
@Injectable()
export class DurableOperationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DurableOperationService.name);
  private pool: Pool | null = null;
  private enabled = false;
  private closing = false;
  private shutdownSignal = createDurableShutdownSignal();
  private readonly unresolvedCommitPlayerIds = new Set<string>();
  private readonly unresolvedCommitInstanceIds = new Set<string>();

  constructor(
    @Inject(NodeRegistryService) private readonly nodeRegistryService: NodeRegistryService | null = null,
    @Inject(DatabasePoolProvider) private readonly databasePoolProvider: DatabasePoolProvider | null = null,
  ) {}

  async onModuleInit(): Promise<void> {
    this.closing = false;
    this.shutdownSignal = createDurableShutdownSignal();
    this.unresolvedCommitPlayerIds.clear();
    this.unresolvedCommitInstanceIds.clear();
    const databaseUrl = resolveServerDatabaseUrl();
    if (!databaseUrl.trim()) {
      this.logger.log('强持久化事务服务已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }

    const sharedPool = this.databasePoolProvider?.getPool('durable-operation') ?? null;
    if (!sharedPool) {
      this.logger.warn('强持久化事务服务已禁用：数据库连接池提供者未提供连接池');
      return;
    }
    this.pool = sharedPool;

    try {
      await ensureDurableOperationTables(this.pool);
      this.enabled = true;
      this.logger.log('强持久化事务服务已启用');
    } catch (error: unknown) {
      this.logger.error(
        '强持久化事务服务初始化失败，已回退为禁用模式',
        error instanceof Error ? error.stack : String(error),
      );
      this.releasePoolReference();
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.beginShutdown();
    this.releasePoolReference();
  }

  /** 在 drain 等待业务队列前先终止未决 COMMIT 收敛循环。 */
  beginShutdown(): void {
    this.closing = true;
    this.shutdownSignal.resolve();
  }

  isShuttingDown(): boolean {
    return this.closing;
  }

  isPlayerCommitOutcomeUnresolved(playerId: string): boolean {
    return this.unresolvedCommitPlayerIds.has(normalizeRequiredString(playerId));
  }

  isInstanceCommitOutcomeUnresolved(instanceId: string): boolean {
    return this.unresolvedCommitInstanceIds.has(normalizeRequiredString(instanceId));
  }

  hasUnresolvedCommitOutcomes(): boolean {
    return this.unresolvedCommitPlayerIds.size > 0 || this.unresolvedCommitInstanceIds.size > 0;
  }

  /**
   * 登记 COMMIT 结果未决的资产边界，阻止 shutdown/flush 越过尚未收敛的数据库事务。
   * 非 DurableOperationService 直接执行的跨域强事务也必须复用同一 fence 真源。
   */
  registerUnresolvedCommitOutcome(input: {
    affectedPlayerIds?: readonly string[];
    affectedInstanceIds?: readonly string[];
  }): void {
    for (const playerId of input.affectedPlayerIds ?? []) {
      const normalizedPlayerId = normalizeRequiredString(playerId);
      if (normalizedPlayerId) this.unresolvedCommitPlayerIds.add(normalizedPlayerId);
    }
    for (const instanceId of input.affectedInstanceIds ?? []) {
      const normalizedInstanceId = normalizeRequiredString(instanceId);
      if (normalizedInstanceId) this.unresolvedCommitInstanceIds.add(normalizedInstanceId);
    }
  }

  isEnabled(): boolean {
    return this.enabled && this.pool !== null;
  }

  /** 按操作 ID 查询已提交的持久化操作记录，用于幂等重放判断 */
  async getOperationReplay(operationId: string): Promise<{
    operation: Record<string, unknown> | null;
    outboxEvents: Array<Record<string, unknown>>;
    assetAuditLogs: Array<Record<string, unknown>>;
  }> {
    if (!this.pool || !this.enabled) {
      throw new Error('durable_operation_service_disabled');
    }
    const normalizedOperationId = normalizeDurableOperationId(operationId);
    if (!normalizedOperationId) {
      throw new Error('invalid_operation_id');
    }
    const [operation, outboxEvents, assetAuditLogs] = await Promise.all([
      this.pool.query(
        `
          SELECT *
          FROM ${DURABLE_OPERATION_LOG_TABLE}
          WHERE operation_id = $1
          LIMIT 1
        `,
        [normalizedOperationId],
      ),
      this.pool.query(
        `
          SELECT *
          FROM ${OUTBOX_EVENT_TABLE}
          WHERE operation_id = $1
          ORDER BY created_at ASC, event_id ASC
        `,
        [normalizedOperationId],
      ),
      this.pool.query(
        `
          SELECT *
          FROM ${ASSET_AUDIT_LOG_TABLE}
          WHERE operation_id = $1
          ORDER BY created_at ASC, log_id ASC
        `,
        [normalizedOperationId],
      ),
    ]);
    return {
      operation: operation.rows[0] ?? null,
      outboxEvents: outboxEvents.rows,
      assetAuditLogs: assetAuditLogs.rows,
    };
  }

  /** 事务性领取邮件附件：校验 presence 归属、扣邮件附件、写背包/钱包、记审计日志 */
  async claimMailAttachments(input: ClaimMailAttachmentsInput): Promise<ClaimMailAttachmentsResult> {
    return this.claimMailAttachmentsAttempt(input, 1);
  }

  private async claimMailAttachmentsAttempt(
    input: ClaimMailAttachmentsInput,
    commitOutcomeRetryRemaining: number,
  ): Promise<ClaimMailAttachmentsResult> {
    if (!this.pool || !this.enabled) {
      throw new Error('durable_operation_service_disabled');
    }

    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeDurableOperationId(input.operationId);
    const normalizedMailIds = Array.from(
      new Set(
        Array.isArray(input.mailIds)
          ? input.mailIds.map((mailId) => normalizeRequiredString(mailId)).filter(Boolean)
          : [],
      ),
    ).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
    if (
      !normalizedPlayerId
      || !normalizedOperationId
      || normalizedOperationId.length > 173
      || normalizedMailIds.length === 0
      || normalizedMailIds.length > MAIL_BATCH_OPERATION_MAX
    ) {
      throw new Error('invalid_claim_mail_attachments_input');
    }

    const now = Date.now();
    const client = await this.pool.connect();
    let clientReleased = false;
    let commitAttempted = false;
    let commitOutcomeUnknown = false;
    let commitOutcomeCause: unknown = null;
    let mutationResult: ClaimMailAttachmentsResult | null = null;
    try {
      await client.query('BEGIN');
      await acquirePlayerAssetLock(client, normalizedPlayerId);

      const existingOperation = await client.query<{
        status?: string;
        operation_type?: string;
        aggregate_type?: string;
        player_id?: string;
        payload_jsonb?: unknown;
      }>(
        `
          SELECT status, operation_type, aggregate_type, player_id, payload_jsonb
          FROM ${DURABLE_OPERATION_LOG_TABLE}
          WHERE operation_id = $1
          FOR UPDATE
        `,
        [normalizedOperationId],
      );
      if (existingOperation.rowCount) {
        assertDurableOperationReplayIdentity(existingOperation.rows[0], {
          operationType: 'mail_claim',
          aggregateType: 'player_mail',
          playerId: normalizedPlayerId,
          payload: { mailIds: normalizedMailIds },
        });
      }
      if (existingOperation.rowCount && existingOperation.rows[0]?.status === 'committed') {
        const existingCounters = await readMailCounters(client, normalizedPlayerId, now);
        clientReleased = await rollbackTransactionOrDestroyClient(client);
        return {
          ok: true,
          alreadyCommitted: true,
          unreadCount: existingCounters.unreadCount,
          unclaimedCount: existingCounters.unclaimedCount,
        };
      }

      const presence = await client.query<{
        runtime_owner_id?: string;
        session_epoch?: string | number;
      }>(
        `
          SELECT runtime_owner_id, session_epoch
          FROM ${PLAYER_PRESENCE_TABLE}
          WHERE player_id = $1
          FOR UPDATE
        `,
        [normalizedPlayerId],
      );
      await assertInstanceLeaseWritable(client, {
        expectedInstanceId: input.expectedInstanceId,
        expectedAssignedNodeId: input.expectedAssignedNodeId,
        expectedOwnershipEpoch: input.expectedOwnershipEpoch,
        currentNodeId: this.getCurrentNodeId(),
      });
      const presenceRow = presence.rows[0] ?? null;
      const persistedRuntimeOwnerId = normalizeRequiredString(presenceRow?.runtime_owner_id);
      const persistedSessionEpoch = Number(presenceRow?.session_epoch ?? 0);
      if (
        !persistedRuntimeOwnerId
        || persistedRuntimeOwnerId !== normalizeRequiredString(input.expectedRuntimeOwnerId)
        || !Number.isFinite(persistedSessionEpoch)
        || Math.trunc(persistedSessionEpoch) !== Math.max(1, Math.trunc(input.expectedSessionEpoch))
      ) {
        throw new Error(
          [
            'player_session_fencing_conflict',
            `expectedRuntimeOwnerId=${normalizeRequiredString(input.expectedRuntimeOwnerId) || 'null'}`,
            `expectedSessionEpoch=${Math.max(1, Math.trunc(input.expectedSessionEpoch))}`,
            `persistedRuntimeOwnerId=${persistedRuntimeOwnerId || 'null'}`,
            `persistedSessionEpoch=${Number.isFinite(persistedSessionEpoch) ? Math.trunc(persistedSessionEpoch) : 'null'}`,
          ].join(':'),
        );
      }

      if (existingOperation.rowCount === 0) {
        await client.query(
          `
            INSERT INTO ${DURABLE_OPERATION_LOG_TABLE}(
              operation_id,
              operation_type,
              aggregate_type,
              aggregate_id,
              player_id,
              runtime_owner_id,
              session_epoch,
              request_id,
              payload_jsonb,
              status,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, now())
          `,
          [
            normalizedOperationId,
            'mail_claim',
            'player_mail',
            normalizedPlayerId,
            normalizedPlayerId,
            persistedRuntimeOwnerId,
            Math.trunc(persistedSessionEpoch),
            normalizedOperationId,
            JSON.stringify({ mailIds: normalizedMailIds }),
            'pending',
          ],
        );
      }

      const mailsResult = await client.query<{
        mail_id?: string;
        claimed_at?: string | number | null;
        deleted_at?: string | number | null;
        expire_at?: string | number | null;
      }>(
        `
          SELECT mail_id, claimed_at, deleted_at, expire_at
          FROM ${PLAYER_MAIL_TABLE}
          WHERE player_id = $1
            AND mail_id = ANY($2::varchar[])
          FOR UPDATE
        `,
        [normalizedPlayerId, normalizedMailIds],
      );
      if ((mailsResult.rowCount ?? 0) !== normalizedMailIds.length) {
        throw new Error('mail_claim_targets_missing');
      }
      for (const row of mailsResult.rows) {
        if (normalizeOptionalInteger(row.deleted_at) != null || normalizeOptionalInteger(row.claimed_at) != null) {
          throw new Error('mail_already_claimed_or_deleted');
        }
        const expireAt = Number(row.expire_at ?? 0);
        if (Number.isFinite(expireAt) && expireAt > 0 && expireAt <= now) {
          throw new Error('mail_already_expired');
        }
      }

      const attachmentsResult = await client.query<{ mail_id?: string }>(
        `
          SELECT mail_id
          FROM ${PLAYER_MAIL_ATTACHMENT_TABLE}
          WHERE player_id = $1
            AND mail_id = ANY($2::varchar[])
            AND claimed_at IS NULL
          FOR UPDATE
        `,
        [normalizedPlayerId, normalizedMailIds],
      );
      const claimableMailIds = new Set(
        attachmentsResult.rows
          .map((row) => normalizeRequiredString(row.mail_id))
          .filter(Boolean),
      );
      if (claimableMailIds.size !== normalizedMailIds.length) {
        throw new Error('mail_claim_attachments_missing');
      }

      const counterBefore = await client.query<{
        counter_version?: string | number | null;
        welcome_mail_delivered_at?: string | number | null;
      }>(
        `
          SELECT counter_version, welcome_mail_delivered_at
          FROM ${PLAYER_MAIL_COUNTER_TABLE}
          WHERE player_id = $1
          FOR UPDATE
        `,
        [normalizedPlayerId],
      );
      const welcomeMailDeliveredAt = normalizeOptionalInteger(
        counterBefore.rows[0]?.welcome_mail_delivered_at,
      );
      const previousCounterVersion = Math.max(
        0,
        Math.trunc(Number(counterBefore.rows[0]?.counter_version ?? 0) || 0),
      );

      await replacePlayerInventoryItems(client, normalizedPlayerId, input.nextInventoryItems);
      const nextWalletBalances = Array.isArray(input.nextWalletBalances) ? input.nextWalletBalances : null;
      if (nextWalletBalances) {
        await replacePlayerWalletRows(client, normalizedPlayerId, nextWalletBalances);
      }

      await client.query(
        `
          UPDATE ${PLAYER_MAIL_ATTACHMENT_TABLE}
          SET
            claim_operation_id = $1,
            claimed_at = $2
          WHERE player_id = $3
            AND mail_id = ANY($4::varchar[])
            AND claimed_at IS NULL
        `,
        [normalizedOperationId, now, normalizedPlayerId, normalizedMailIds],
      );

      await client.query(
        `
          UPDATE ${PLAYER_MAIL_TABLE}
          SET
            read_at = COALESCE(read_at, $1),
            claimed_at = $1,
            mail_version = mail_version + 1,
            updated_at = now()
          WHERE player_id = $2
            AND mail_id = ANY($3::varchar[])
        `,
        [now, normalizedPlayerId, normalizedMailIds],
      );

      const counters = await readMailCounters(client, normalizedPlayerId, now);
      const unreadCount = counters.unreadCount;
      const unclaimedCount = counters.unclaimedCount;
      const latestMailAt = counters.latestMailAt;
      const counterVersion = Math.max(now, previousCounterVersion + 1);

      await client.query(
        `
          INSERT INTO ${PLAYER_MAIL_COUNTER_TABLE}(
            player_id,
            unread_count,
            unclaimed_count,
            latest_mail_at,
            counter_version,
            welcome_mail_delivered_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, now())
          ON CONFLICT (player_id)
          DO UPDATE SET
            unread_count = EXCLUDED.unread_count,
            unclaimed_count = EXCLUDED.unclaimed_count,
            latest_mail_at = EXCLUDED.latest_mail_at,
            counter_version = GREATEST(${PLAYER_MAIL_COUNTER_TABLE}.counter_version, EXCLUDED.counter_version),
            welcome_mail_delivered_at = COALESCE(EXCLUDED.welcome_mail_delivered_at, ${PLAYER_MAIL_COUNTER_TABLE}.welcome_mail_delivered_at),
            updated_at = now()
        `,
        [normalizedPlayerId, unreadCount, unclaimedCount, latestMailAt, counterVersion, welcomeMailDeliveredAt],
      );

      await client.query(
        `
          INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(
            player_id,
            wallet_version,
            inventory_version,
            mail_version,
            mail_counter_version,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, now())
          ON CONFLICT (player_id)
          DO UPDATE SET
            wallet_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.wallet_version, EXCLUDED.wallet_version),
            inventory_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.inventory_version, EXCLUDED.inventory_version),
            mail_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.mail_version, EXCLUDED.mail_version),
            mail_counter_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.mail_counter_version, EXCLUDED.mail_counter_version),
            updated_at = now()
        `,
        [normalizedPlayerId, nextWalletBalances ? now : 0, now, now, counterVersion],
      );

      await client.query(
        `
          INSERT INTO ${OUTBOX_EVENT_TABLE}(
            event_id,
            operation_id,
            topic,
            partition_key,
            payload_jsonb,
            status,
            attempt_count,
            next_retry_at,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, now(), now())
        `,
        [
          `outbox:${normalizedOperationId}`,
          normalizedOperationId,
          'player.mail.claimed',
          normalizedPlayerId,
          JSON.stringify({ playerId: normalizedPlayerId, mailIds: normalizedMailIds }),
          'ready',
          0,
        ],
      );

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
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, now())
        `,
        [
          `audit:${normalizedOperationId}`,
          normalizedOperationId,
          normalizedPlayerId,
          'mail_claim',
          normalizedPlayerId,
          'claim',
          JSON.stringify({ mailIds: normalizedMailIds }),
          JSON.stringify({}),
          JSON.stringify({ unreadCount, unclaimedCount }),
        ],
      );

      await client.query(
        `
          UPDATE ${DURABLE_OPERATION_LOG_TABLE}
          SET
            status = 'committed',
            committed_at = now()
          WHERE operation_id = $1
        `,
        [normalizedOperationId],
      );

      mutationResult = {
        ok: true,
        alreadyCommitted: false,
        unreadCount,
        unclaimedCount,
      };
      commitAttempted = true;
      await client.query('COMMIT');
      commitAttempted = false;
      return mutationResult;
    } catch (error: unknown) {
      clientReleased = await disposeFailedDurableTransactionClient(client, {
        commitAttempted,
        shuttingDown: this.closing,
      }) || clientReleased;
      if (commitAttempted) {
        commitOutcomeUnknown = true;
        commitOutcomeCause = error;
      } else {
        throw error;
      }
    } finally {
      if (!clientReleased) {
        client.release();
      }
    }

    if (commitOutcomeUnknown) {
      if (commitOutcomeRetryRemaining < 0) {
        throw new DurableOperationCommitOutcomeUnknownError(normalizedOperationId, commitOutcomeCause);
      }
      return this.settleUnknownCommitOutcome({
        operationId: normalizedOperationId,
        cause: commitOutcomeCause,
        affectedPlayerIds: [normalizedPlayerId],
        affectedInstanceIds: [normalizeRequiredString(input.expectedInstanceId)].filter(Boolean),
        onSettled: (retryResult) => ({ ...retryResult, alreadyCommitted: false }),
        retry: () => this.claimMailAttachmentsAttempt(input, -1),
      });
    }

    throw new Error(`mail_claim_unreachable_state:${normalizedOperationId}`);
  }

  /** 事务性领取市场托管仓物品：校验 presence、转移仓物品到背包、记审计日志 */
  async claimMarketStorage(input: ClaimMarketStorageInput): Promise<ClaimMarketStorageResult> {
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeDurableOperationId(input.operationId);
    const normalizedInventoryItems = Array.isArray(input.nextInventoryItems) ? input.nextInventoryItems : [];
    const normalizedStorageItems = Array.isArray(input.nextMarketStorageItems) ? input.nextMarketStorageItems : [];
    const movedCount = Math.max(0, Math.trunc(Number(input.movedCount ?? 0)));
    const remainingCount = Math.max(0, Math.trunc(Number(input.remainingCount ?? 0)));
    return this.executeAssetMutation<ClaimMarketStorageResult>({
      operationId: normalizedOperationId,
      playerId: normalizedPlayerId,
      expectedRuntimeOwnerId: input.expectedRuntimeOwnerId,
      expectedSessionEpoch: input.expectedSessionEpoch,
      expectedInstanceId: input.expectedInstanceId,
      expectedAssignedNodeId: input.expectedAssignedNodeId,
      expectedOwnershipEpoch: input.expectedOwnershipEpoch,
      operationType: 'market_storage_claim',
      aggregateType: 'player_market_storage_item',
      payload: {
        movedCount,
        remainingCount,
      },
      onAlreadyCommitted: async () => ({
        ok: true,
        alreadyCommitted: true,
        movedCount,
        remainingCount,
      }),
      onMutate: async (client, now) => {
        await replacePlayerInventoryItems(client, normalizedPlayerId, normalizedInventoryItems);
        await replacePlayerMarketStorageItems(client, normalizedPlayerId, normalizedStorageItems, {
          allowEmptyOverwrite: movedCount > 0 && remainingCount === 0,
        });

        await client.query(
          `
            INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(
              player_id,
              inventory_version,
              market_storage_version,
              updated_at
            )
            VALUES ($1, $2, $3, now())
            ON CONFLICT (player_id)
            DO UPDATE SET
              inventory_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.inventory_version, EXCLUDED.inventory_version),
              market_storage_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.market_storage_version, EXCLUDED.market_storage_version),
              updated_at = now()
          `,
          [normalizedPlayerId, now, now + 1],
        );

        await client.query(
          `
            INSERT INTO ${OUTBOX_EVENT_TABLE}(
              event_id,
              operation_id,
              topic,
              partition_key,
              payload_jsonb,
              status,
              attempt_count,
              next_retry_at,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, now(), now())
          `,
          [
            `outbox:${normalizedOperationId}`,
            normalizedOperationId,
            'player.market.storage.claimed',
            normalizedPlayerId,
            JSON.stringify({
              playerId: normalizedPlayerId,
              movedCount,
              remainingCount,
            }),
            'ready',
            0,
          ],
        );

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
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, now())
          `,
          [
            `audit:${normalizedOperationId}`,
            normalizedOperationId,
            normalizedPlayerId,
            'market_storage',
            normalizedPlayerId,
            'claim',
            JSON.stringify({ movedCount, remainingCount }),
            JSON.stringify({}),
            JSON.stringify({
              inventoryItemCount: normalizedInventoryItems.length,
              marketStorageItemCount: normalizedStorageItems.length,
            }),
          ],
        );

        return {
          ok: true,
          alreadyCommitted: false,
          movedCount,
          remainingCount,
        };
      },
    });
  }

  /** 事务性 NPC 商店购买：扣钱包、写背包、记审计日志和 outbox 事件 */
  async purchaseNpcShopItem(input: PurchaseNpcShopItemInput): Promise<PurchaseNpcShopItemResult> {
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeDurableOperationId(input.operationId);
    const normalizedItemId = normalizeRequiredString(input.itemId);
    const normalizedInventoryItems = Array.isArray(input.nextInventoryItems) ? input.nextInventoryItems : [];
    const normalizedWalletBalances = Array.isArray(input.nextWalletBalances) ? input.nextWalletBalances : [];
    const quantity = Math.max(1, Math.trunc(Number(input.quantity ?? 1)));
    const totalCost = Math.max(1, Math.trunc(Number(input.totalCost ?? 0)));
    if (!normalizedItemId || totalCost <= 0) {
      throw new Error('invalid_purchase_npc_shop_item_input');
    }

    return this.executeAssetMutation<PurchaseNpcShopItemResult>({
      operationId: normalizedOperationId,
      playerId: normalizedPlayerId,
      expectedRuntimeOwnerId: input.expectedRuntimeOwnerId,
      expectedSessionEpoch: input.expectedSessionEpoch,
      expectedInstanceId: input.expectedInstanceId,
      expectedAssignedNodeId: input.expectedAssignedNodeId,
      expectedOwnershipEpoch: input.expectedOwnershipEpoch,
      operationType: 'npc_shop_purchase',
      aggregateType: 'player_wallet',
      payload: {
        itemId: normalizedItemId,
        quantity,
        totalCost,
      },
      onAlreadyCommitted: async () => ({
        ok: true,
        alreadyCommitted: true,
        itemId: normalizedItemId,
        quantity,
        totalCost,
      }),
      onMutate: async (client, now) => {
        await replacePlayerWalletRows(client, normalizedPlayerId, normalizedWalletBalances);
        await replacePlayerInventoryItems(client, normalizedPlayerId, normalizedInventoryItems);

        await client.query(
          `
            INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(
              player_id,
              wallet_version,
              inventory_version,
              updated_at
            )
            VALUES ($1, $2, $3, now())
            ON CONFLICT (player_id)
            DO UPDATE SET
              wallet_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.wallet_version, EXCLUDED.wallet_version),
              inventory_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.inventory_version, EXCLUDED.inventory_version),
              updated_at = now()
          `,
          [normalizedPlayerId, now, now + 1],
        );

        await client.query(
          `
            INSERT INTO ${OUTBOX_EVENT_TABLE}(
              event_id,
              operation_id,
              topic,
              partition_key,
              payload_jsonb,
              status,
              attempt_count,
              next_retry_at,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, now(), now())
          `,
          [
            `outbox:${normalizedOperationId}`,
            normalizedOperationId,
            'player.npc_shop.item_purchased',
            normalizedPlayerId,
            JSON.stringify({
              playerId: normalizedPlayerId,
              itemId: normalizedItemId,
              quantity,
              totalCost,
            }),
            'ready',
            0,
          ],
        );

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
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, now())
          `,
          [
            `audit:${normalizedOperationId}`,
            normalizedOperationId,
            normalizedPlayerId,
            'npc_shop_purchase',
            normalizedPlayerId,
            'purchase',
            JSON.stringify({ itemId: normalizedItemId, quantity, totalCost }),
            JSON.stringify({}),
            JSON.stringify({
              inventoryItemCount: normalizedInventoryItems.length,
              walletBalanceCount: normalizedWalletBalances.length,
            }),
          ],
        );

        return {
          ok: true,
          alreadyCommitted: false,
          itemId: normalizedItemId,
          quantity,
          totalCost,
        };
      },
    });
  }

  /** 事务性钱包变更：增减余额/冻结、记审计日志和 outbox 事件 */
  async mutatePlayerWallet(input: MutatePlayerWalletInput): Promise<MutatePlayerWalletResult> {
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeDurableOperationId(input.operationId);
    const normalizedWalletType = normalizeRequiredString(input.walletType);
    const normalizedWalletBalances = Array.isArray(input.nextWalletBalances) ? input.nextWalletBalances : [];
    const action = input.action === 'credit' ? 'credit' : 'debit';
    const delta = Math.max(1, Math.trunc(Number(input.delta ?? 0)));
    if (!normalizedWalletType || delta <= 0) {
      throw new Error('invalid_mutate_player_wallet_input');
    }

    return this.executeAssetMutation<MutatePlayerWalletResult>({
      operationId: normalizedOperationId,
      playerId: normalizedPlayerId,
      expectedRuntimeOwnerId: input.expectedRuntimeOwnerId,
      expectedSessionEpoch: input.expectedSessionEpoch,
      expectedInstanceId: input.expectedInstanceId,
      expectedAssignedNodeId: input.expectedAssignedNodeId,
      expectedOwnershipEpoch: input.expectedOwnershipEpoch,
      operationType: `wallet_${action}`,
      aggregateType: 'player_wallet',
      payload: {
        walletType: normalizedWalletType,
        action,
        delta,
      },
      onAlreadyCommitted: async () => ({
        ok: true,
        alreadyCommitted: true,
        walletType: normalizedWalletType,
        action,
        delta,
      }),
      onMutate: async (client, now) => {
        await replacePlayerWalletRows(client, normalizedPlayerId, normalizedWalletBalances);

        await client.query(
          `
            INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(
              player_id,
              wallet_version,
              updated_at
            )
            VALUES ($1, $2, now())
            ON CONFLICT (player_id)
            DO UPDATE SET
              wallet_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.wallet_version, EXCLUDED.wallet_version),
              updated_at = now()
          `,
          [normalizedPlayerId, now],
        );

        await client.query(
          `
            INSERT INTO ${OUTBOX_EVENT_TABLE}(
              event_id,
              operation_id,
              topic,
              partition_key,
              payload_jsonb,
              status,
              attempt_count,
              next_retry_at,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, now(), now())
          `,
          [
            `outbox:${normalizedOperationId}`,
            normalizedOperationId,
            'player.wallet.updated',
            normalizedPlayerId,
            JSON.stringify({
              playerId: normalizedPlayerId,
              walletType: normalizedWalletType,
              action,
              delta,
            }),
            'ready',
            0,
          ],
        );

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
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, now())
          `,
          [
            `audit:${normalizedOperationId}`,
            normalizedOperationId,
            normalizedPlayerId,
            'wallet',
            normalizedWalletType,
            action,
            JSON.stringify({ walletType: normalizedWalletType, delta }),
            JSON.stringify({}),
            JSON.stringify({
              walletBalanceCount: normalizedWalletBalances.length,
            }),
          ],
        );

        return {
          ok: true,
          alreadyCommitted: false,
          walletType: normalizedWalletType,
          action,
          delta,
        };
      },
    });
  }

  /** 事务性发放背包物品：写背包快照、记审计日志和 outbox 事件 */
  async grantInventoryItems(input: GrantInventoryItemsInput): Promise<GrantInventoryItemsResult> {
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeDurableOperationId(input.operationId);
    const normalizedSourceType = normalizeRequiredString(input.sourceType) || 'inventory_grant';
    const normalizedSourceRefId = normalizeOptionalString(input.sourceRefId);
    const inventoryAction = input.inventoryAction === 'remove' || input.inventoryAction === 'transfer'
      ? input.inventoryAction
      : 'grant';
    const normalizedGrantedItems = Array.isArray(input.grantedItems) ? input.grantedItems : [];
    const normalizedNextInventoryItems = Array.isArray(input.nextInventoryItems) ? input.nextInventoryItems : [];
    const normalizedSourceMutation = normalizeInventoryGrantSourceMutation(input.sourceMutation);
    if (
      (normalizedSourceType === 'ground_take'
        || normalizedSourceType === 'ground_take_all'
        || normalizedSourceType === 'container_take'
        || normalizedSourceType === 'container_take_all'
        || normalizedSourceType === 'ground_drop'
        || normalizedSourceType === 'tile_resource_use')
      && !normalizedSourceMutation
    ) {
      throw new Error('inventory_grant_source_mutation_required');
    }
    if (
      normalizedSourceMutation
      && normalizeOptionalString(input.expectedInstanceId) !== normalizedSourceMutation.instanceId
    ) {
      throw new Error('inventory_grant_source_instance_mismatch');
    }
    if (normalizedSourceMutation?.kind === 'tile_resource') {
      if (normalizedSourceType !== 'tile_resource_use') {
        throw new Error('tile_resource_source_type_mismatch');
      }
      if (Math.trunc(Number(input.expectedOwnershipEpoch ?? 0)) !== normalizedSourceMutation.ownershipEpoch) {
        throw new Error('tile_resource_source_ownership_epoch_mismatch');
      }
    }
    if (normalizedSourceMutation?.kind === 'ground_tile' || normalizedSourceMutation?.kind === 'container_state') {
      const expectedSourceKind = normalizedSourceMutation.kind === 'ground_tile' ? 'ground' : 'container';
      const sourceTypeMatches = normalizedSourceMutation.kind === 'ground_tile'
        ? normalizedSourceType === 'ground_take'
          || normalizedSourceType === 'ground_take_all'
          || normalizedSourceType === 'ground_drop'
        : normalizedSourceType === 'container_take' || normalizedSourceType === 'container_take_all';
      if (!sourceTypeMatches) {
        throw new Error(`${expectedSourceKind}_source_type_mismatch`);
      }
      if (Math.trunc(Number(input.expectedOwnershipEpoch ?? 0)) !== normalizedSourceMutation.ownershipEpoch) {
        throw new Error(`${expectedSourceKind}_source_ownership_epoch_mismatch`);
      }
      if (!normalizeRequiredString(input.expectedLeaseToken)) {
        throw new Error(`${expectedSourceKind}_source_lease_token_required`);
      }
    }

    return this.executeAssetMutation<GrantInventoryItemsResult>({
      operationId: normalizedOperationId,
      playerId: normalizedPlayerId,
      expectedRuntimeOwnerId: input.expectedRuntimeOwnerId,
      expectedSessionEpoch: input.expectedSessionEpoch,
      expectedInstanceId: input.expectedInstanceId,
      expectedAssignedNodeId: input.expectedAssignedNodeId,
      expectedLeaseToken: input.expectedLeaseToken,
      expectedOwnershipEpoch: input.expectedOwnershipEpoch,
      operationType: `player_inventory_${inventoryAction}`,
      aggregateType: 'player_inventory_item',
      payload: {
        sourceType: normalizedSourceType,
        sourceRefId: normalizedSourceRefId,
        inventoryAction,
        grantedCount: normalizedGrantedItems.length,
        nextInventoryItemCount: normalizedNextInventoryItems.length,
        sourceMutationKind: normalizedSourceMutation?.kind ?? null,
        grantedItems: normalizedGrantedItems,
        nextInventoryItems: normalizedNextInventoryItems,
        sourceMutation: normalizedSourceMutation,
      },
      onAlreadyCommitted: async () => ({
        ok: true,
        alreadyCommitted: true,
        grantedCount: normalizedGrantedItems.reduce((total, entry) => total + Math.max(0, Math.trunc(Number(entry?.count ?? 0))), 0),
        sourceType: normalizedSourceType,
      }),
      onMutate: async (client, now) => {
        if (normalizedSourceMutation) {
          await persistInventoryGrantSourceMutation(client, normalizedSourceMutation);
        }
        await replacePlayerInventoryItems(client, normalizedPlayerId, normalizedNextInventoryItems);

        await client.query(
          `
            INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(
              player_id,
              inventory_version,
              updated_at
            )
            VALUES ($1, $2, now())
            ON CONFLICT (player_id)
            DO UPDATE SET
              inventory_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.inventory_version, EXCLUDED.inventory_version),
              updated_at = now()
          `,
          [normalizedPlayerId, now],
        );

        await client.query(
          `
            INSERT INTO ${OUTBOX_EVENT_TABLE}(
              event_id,
              operation_id,
              topic,
              partition_key,
              payload_jsonb,
              status,
              attempt_count,
              next_retry_at,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, now(), now())
          `,
          [
            `outbox:${normalizedOperationId}`,
            normalizedOperationId,
            `player.inventory.${inventoryAction === 'remove' ? 'removed' : inventoryAction === 'transfer' ? 'transferred' : 'granted'}`,
            normalizedPlayerId,
            JSON.stringify({
              playerId: normalizedPlayerId,
              sourceType: normalizedSourceType,
              sourceRefId: normalizedSourceRefId,
              inventoryAction,
              items: normalizedGrantedItems,
              grantedItems: normalizedGrantedItems,
            }),
            'ready',
            0,
          ],
        );

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
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, now())
          `,
          [
            `audit:${normalizedOperationId}`,
            normalizedOperationId,
            normalizedPlayerId,
            'inventory',
            normalizedSourceRefId ?? normalizedSourceType,
            inventoryAction,
            JSON.stringify({
              sourceType: normalizedSourceType,
              grantedItems: normalizedGrantedItems,
            }),
            JSON.stringify({
              inventoryItemCount: null,
            }),
            JSON.stringify({
              inventoryItemCount: normalizedNextInventoryItems.length,
            }),
          ],
        );

        if (normalizedSourceMutation?.kind === 'tile_resource') {
          await insertAssetAuditLog(
            client,
            normalizedOperationId,
            normalizedPlayerId,
            'tile_resource',
            normalizedSourceMutation.instanceId,
            'increase',
            {
              gains: normalizedSourceMutation.gains,
            },
            {},
            {
              values: normalizedSourceMutation.gains.map((entry) => ({
                resourceKey: entry.resourceKey,
                tileIndex: entry.tileIndex,
                value: entry.nextValue,
              })),
            },
            'tile-resource',
          );
        }

        return {
          ok: true,
          alreadyCommitted: false,
          grantedCount: normalizedGrantedItems.reduce((total, entry) => total + Math.max(0, Math.trunc(Number(entry?.count ?? 0))), 0),
          sourceType: normalizedSourceType,
        };
      },
    });
  }

  /** 玩家背包、钱包、灵力与阵法资源池同事务提交，供布阵和一次性补给命令使用。 */
  async commitFormationResourceMutation(
    input: CommitFormationResourceMutationInput,
  ): Promise<CommitFormationResourceMutationResult> {
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeDurableOperationId(input.operationId);
    const normalizedFormationInstanceId = normalizeRequiredString(input.formationWrite?.formationInstanceId);
    const normalizedFormationWorldInstanceId = normalizeRequiredString(input.formationWrite?.instanceId);
    const normalizedExpectedInstanceId = normalizeRequiredString(input.expectedInstanceId);
    const normalizedExpectedLeaseToken = normalizeRequiredString(input.expectedLeaseToken);
    const action = input.action === 'deploy' || input.action === 'refill' || input.action === 'inject'
      ? input.action
      : null;
    const spiritStoneCount = Math.max(0, Math.trunc(Number(input.spiritStoneCount ?? 0)));
    const qiAmount = Math.max(0, Math.trunc(Number(input.qiAmount ?? 0)));
    const expectedFormationUpdatedAtMs = input.expectedFormationUpdatedAtMs == null
      ? null
      : Math.max(0, Math.trunc(Number(input.expectedFormationUpdatedAtMs)));
    const nextPlayerSnapshot = input.nextPlayerSnapshot;
    const formationSnapshot = input.formationWrite?.snapshot;
    if (
      !normalizedPlayerId
      || !normalizedOperationId
      || !action
      || !normalizedFormationInstanceId
      || !normalizedFormationWorldInstanceId
      || normalizedExpectedInstanceId !== normalizedFormationWorldInstanceId
      || !normalizedExpectedLeaseToken
      || !formationSnapshot
      || normalizeRequiredString(formationSnapshot.id) !== normalizedFormationInstanceId
      || normalizeRequiredString(formationSnapshot.instanceId) !== normalizedFormationWorldInstanceId
      || !nextPlayerSnapshot?.placement?.templateId
      || (spiritStoneCount <= 0 && qiAmount <= 0 && !normalizeOptionalString(input.diskItemInstanceId))
    ) {
      throw new Error('invalid_formation_resource_mutation_input');
    }

    const payload = {
      action,
      formationInstanceId: normalizedFormationInstanceId,
      instanceId: normalizedFormationWorldInstanceId,
      expectedFormationUpdatedAtMs,
      expectFormationAbsent: input.expectFormationAbsent === true,
      spiritStoneCount,
      qiAmount,
      diskItemInstanceId: normalizeOptionalString(input.diskItemInstanceId),
      inventoryItems: nextPlayerSnapshot.inventory?.items ?? [],
      walletBalances: nextPlayerSnapshot.wallet?.balances ?? [],
      vitals: nextPlayerSnapshot.vitals ?? null,
      formationSnapshot,
    };

    return this.executeAssetMutation<CommitFormationResourceMutationResult>({
      operationId: normalizedOperationId,
      playerId: normalizedPlayerId,
      expectedRuntimeOwnerId: input.expectedRuntimeOwnerId,
      expectedSessionEpoch: input.expectedSessionEpoch,
      expectedInstanceId: normalizedExpectedInstanceId,
      expectedAssignedNodeId: input.expectedAssignedNodeId,
      expectedLeaseToken: normalizedExpectedLeaseToken,
      expectedOwnershipEpoch: input.expectedOwnershipEpoch,
      operationType: `formation_resource_${action}`,
      aggregateType: 'instance_formation_state',
      payload,
      onAlreadyCommitted: async () => ({
        ok: true,
        alreadyCommitted: true,
        action,
        formationInstanceId: normalizedFormationInstanceId,
      }),
      onMutate: async (client) => {
        await persistDurableFormationWriteWithClient(
          client,
          {
            formationInstanceId: normalizedFormationInstanceId,
            instanceId: normalizedFormationWorldInstanceId,
            snapshot: formationSnapshot,
          },
          {
            expectAbsent: input.expectFormationAbsent === true,
            expectedUpdatedAtMs: expectedFormationUpdatedAtMs,
          },
        );
        await savePlayerSnapshotProjectionDomainsWithClient(
          client,
          normalizedPlayerId,
          nextPlayerSnapshot,
          ['inventory', 'wallet', 'vitals'],
          { allowInventoryEmptyOverwrite: true },
        );
        await insertDurableOutboxEvent(
          client,
          normalizedOperationId,
          `formation.resource.${action}`,
          normalizedFormationWorldInstanceId,
          {
            playerId: normalizedPlayerId,
            formationInstanceId: normalizedFormationInstanceId,
            instanceId: normalizedFormationWorldInstanceId,
            action,
            spiritStoneCount,
            qiAmount,
          },
        );
        await insertAssetAuditLog(
          client,
          normalizedOperationId,
          normalizedPlayerId,
          'formation_resource',
          normalizedFormationInstanceId,
          action,
          {
            spiritStoneCount: -spiritStoneCount,
            qiAmount: -qiAmount,
            diskItemInstanceId: normalizeOptionalString(input.diskItemInstanceId),
          },
          {
            formationUpdatedAtMs: expectedFormationUpdatedAtMs,
          },
          {
            formationUpdatedAtMs: Math.max(0, Math.trunc(Number(formationSnapshot.updatedAt ?? 0))),
            remainingQiBudget: Number(formationSnapshot.remainingQiBudget ?? 0),
            remainingSpiritStoneBudget: Number(formationSnapshot.remainingSpiritStoneBudget ?? 0),
          },
        );
        return {
          ok: true,
          alreadyCommitted: false,
          action,
          formationInstanceId: normalizedFormationInstanceId,
        };
      },
    });
  }

  /** 阵法维护每息把玩家灵力、技艺/job 与阵法灵力池作为同一资产转换提交。 */
  async commitFormationMaintenanceMutation(
    input: CommitFormationMaintenanceMutationInput,
  ): Promise<CommitFormationMaintenanceMutationResult> {
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeDurableOperationId(input.operationId);
    const normalizedFormationInstanceId = normalizeRequiredString(input.formationWrite?.formationInstanceId);
    const normalizedFormationWorldInstanceId = normalizeRequiredString(input.formationWrite?.instanceId);
    const normalizedExpectedInstanceId = normalizeRequiredString(input.expectedInstanceId);
    const normalizedExpectedLeaseToken = normalizeRequiredString(input.expectedLeaseToken);
    const normalizedExpectedJobRunId = normalizeRequiredString(input.expectedJobRunId);
    const normalizedExpectedJobVersion = Math.max(1, Math.trunc(Number(input.expectedJobVersion) || 0));
    const normalizedNextActiveJob = normalizeActiveJobSnapshot(input.nextActiveJob);
    const expectedFormationUpdatedAtMs = Math.max(1, Math.trunc(Number(input.expectedFormationUpdatedAtMs) || 0));
    const qiAmount = Math.max(1, Math.trunc(Number(input.qiAmount) || 0));
    const formationQiAmount = Math.max(1, Math.trunc(Number(input.formationQiAmount) || 0));
    const formationSnapshot = input.formationWrite?.snapshot;
    const nextPlayerSnapshot = input.nextPlayerSnapshot;
    const nextSnapshotJob = nextPlayerSnapshot?.progression?.formationJob;
    const nextSnapshotJobRunId = normalizeRequiredString(nextSnapshotJob?.jobRunId);
    const nextSnapshotJobVersion = normalizeOptionalInteger(nextSnapshotJob?.jobVersion) ?? 0;
    if (
      !normalizedPlayerId
      || !normalizedOperationId
      || !normalizedFormationInstanceId
      || !normalizedFormationWorldInstanceId
      || normalizedExpectedInstanceId !== normalizedFormationWorldInstanceId
      || !normalizedExpectedLeaseToken
      || !normalizedExpectedJobRunId
      || normalizedNextActiveJob.jobType !== 'formation'
      || normalizedNextActiveJob.jobRunId !== normalizedExpectedJobRunId
      || normalizedNextActiveJob.jobVersion <= normalizedExpectedJobVersion
      || nextSnapshotJobRunId !== normalizedNextActiveJob.jobRunId
      || nextSnapshotJobVersion !== normalizedNextActiveJob.jobVersion
      || !formationSnapshot
      || normalizeRequiredString(formationSnapshot.id) !== normalizedFormationInstanceId
      || normalizeRequiredString(formationSnapshot.instanceId) !== normalizedFormationWorldInstanceId
      || Math.max(0, Math.trunc(Number(formationSnapshot.updatedAt) || 0)) <= expectedFormationUpdatedAtMs
      || !nextPlayerSnapshot?.placement?.templateId
    ) {
      throw new Error('invalid_formation_maintenance_mutation_input');
    }

    const payload = {
      formationInstanceId: normalizedFormationInstanceId,
      instanceId: normalizedFormationWorldInstanceId,
      expectedFormationUpdatedAtMs,
      expectedJobRunId: normalizedExpectedJobRunId,
      expectedJobVersion: normalizedExpectedJobVersion,
      nextJobVersion: normalizedNextActiveJob.jobVersion,
      qiAmount,
      formationQiAmount,
      nextVitals: nextPlayerSnapshot.vitals ?? null,
      nextFormationProfession: nextPlayerSnapshot.progression?.formationSkill ?? null,
      formationSnapshot,
    };

    return this.executeAssetMutation<CommitFormationMaintenanceMutationResult>({
      operationId: normalizedOperationId,
      playerId: normalizedPlayerId,
      expectedRuntimeOwnerId: input.expectedRuntimeOwnerId,
      expectedSessionEpoch: input.expectedSessionEpoch,
      expectedInstanceId: normalizedExpectedInstanceId,
      expectedAssignedNodeId: input.expectedAssignedNodeId,
      expectedLeaseToken: normalizedExpectedLeaseToken,
      expectedOwnershipEpoch: input.expectedOwnershipEpoch,
      operationType: 'formation_maintenance_tick',
      aggregateType: 'instance_formation_state',
      payload,
      onAlreadyCommitted: async () => ({
        ok: true,
        alreadyCommitted: true,
        formationInstanceId: normalizedFormationInstanceId,
        jobRunId: normalizedNextActiveJob.jobRunId,
        jobVersion: normalizedNextActiveJob.jobVersion,
      }),
      onMutate: async (client) => {
        const currentJob = await client.query<{
          job_run_id?: unknown;
          job_version?: unknown;
        }>(
          `SELECT job_run_id, job_version
           FROM ${PLAYER_ACTIVE_JOB_TABLE}
           WHERE player_id = $1
           FOR UPDATE`,
          [normalizedPlayerId],
        );
        const persistedJobRunId = normalizeRequiredString(currentJob.rows[0]?.job_run_id);
        const persistedJobVersion = normalizeOptionalInteger(currentJob.rows[0]?.job_version) ?? 0;
        if (
          (persistedJobRunId && persistedJobRunId !== normalizedExpectedJobRunId)
          || persistedJobVersion > normalizedExpectedJobVersion
        ) {
          throw new Error([
            'formation_maintenance_job_fencing_conflict',
            `expectedJobRunId=${normalizedExpectedJobRunId}`,
            `expectedJobVersion=${normalizedExpectedJobVersion}`,
            `persistedJobRunId=${persistedJobRunId || 'null'}`,
            `persistedJobVersion=${persistedJobVersion}`,
          ].join(':'));
        }

        await persistDurableFormationWriteWithClient(
          client,
          {
            formationInstanceId: normalizedFormationInstanceId,
            instanceId: normalizedFormationWorldInstanceId,
            snapshot: formationSnapshot,
          },
          { expectedUpdatedAtMs: expectedFormationUpdatedAtMs },
        );
        await savePlayerSnapshotProjectionDomainsWithClient(
          client,
          normalizedPlayerId,
          nextPlayerSnapshot,
          ['vitals', 'profession', 'active_job'],
          { expectedProjectionVersion: nextPlayerSnapshot.savedAt },
        );
        await insertDurableOutboxEvent(
          client,
          normalizedOperationId,
          'formation.maintenance.tick',
          normalizedFormationWorldInstanceId,
          {
            playerId: normalizedPlayerId,
            formationInstanceId: normalizedFormationInstanceId,
            instanceId: normalizedFormationWorldInstanceId,
            jobRunId: normalizedNextActiveJob.jobRunId,
            jobVersion: normalizedNextActiveJob.jobVersion,
            qiAmount,
            formationQiAmount,
          },
        );
        await insertAssetAuditLog(
          client,
          normalizedOperationId,
          normalizedPlayerId,
          'formation_maintenance',
          normalizedFormationInstanceId,
          'tick',
          { qiAmount: -qiAmount, formationQiAmount },
          {
            formationUpdatedAtMs: expectedFormationUpdatedAtMs,
            jobVersion: normalizedExpectedJobVersion,
          },
          {
            formationUpdatedAtMs: Math.max(0, Math.trunc(Number(formationSnapshot.updatedAt) || 0)),
            jobVersion: normalizedNextActiveJob.jobVersion,
          },
        );
        return {
          ok: true,
          alreadyCommitted: false,
          formationInstanceId: normalizedFormationInstanceId,
          jobRunId: normalizedNextActiveJob.jobRunId,
          jobVersion: normalizedNextActiveJob.jobVersion,
        };
      },
    });
  }

  /** 事务性提交 NPC 任务奖励：写背包/钱包、更新任务进度、记审计日志 */
  async submitNpcQuestRewards(input: SubmitNpcQuestRewardsInput): Promise<SubmitNpcQuestRewardsResult> {
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeDurableOperationId(input.operationId);
    const normalizedQuestId = normalizeRequiredString(input.questId);
    const normalizedInventoryItems = Array.isArray(input.nextInventoryItems) ? input.nextInventoryItems : [];
    const normalizedWalletBalances = Array.isArray(input.nextWalletBalances) ? input.nextWalletBalances : [];
    const normalizedQuestEntries = normalizeQuestProgressSnapshots(input.nextQuestEntries ?? []);
    if (!normalizedQuestId) {
      throw new Error('invalid_submit_npc_quest_rewards_input');
    }

    return this.executeAssetMutation<SubmitNpcQuestRewardsResult>({
      operationId: normalizedOperationId,
      playerId: normalizedPlayerId,
      expectedRuntimeOwnerId: input.expectedRuntimeOwnerId,
      expectedSessionEpoch: input.expectedSessionEpoch,
      expectedInstanceId: input.expectedInstanceId,
      expectedAssignedNodeId: input.expectedAssignedNodeId,
      expectedOwnershipEpoch: input.expectedOwnershipEpoch,
      operationType: 'npc_quest_submit',
      aggregateType: 'player_quest_progress',
      payload: {
        questId: normalizedQuestId,
        inventoryItemCount: normalizedInventoryItems.length,
        walletBalanceCount: normalizedWalletBalances.length,
        questEntryCount: normalizedQuestEntries.length,
      },
      onAlreadyCommitted: async () => ({
        ok: true,
        alreadyCommitted: true,
        questId: normalizedQuestId,
      }),
      onMutate: async (client, now) => {
        await replacePlayerInventoryItems(client, normalizedPlayerId, normalizedInventoryItems);
        await replacePlayerWalletRows(client, normalizedPlayerId, normalizedWalletBalances);
        await replacePlayerQuestProgressRows(client, normalizedPlayerId, normalizedQuestEntries);

        await client.query(
          `
            INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(
              player_id,
              inventory_version,
              wallet_version,
              quest_version,
              updated_at
            )
            VALUES ($1, $2, $3, $4, now())
            ON CONFLICT (player_id)
            DO UPDATE SET
              inventory_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.inventory_version, EXCLUDED.inventory_version),
              wallet_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.wallet_version, EXCLUDED.wallet_version),
              quest_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.quest_version, EXCLUDED.quest_version),
              updated_at = now()
          `,
          [normalizedPlayerId, now, now + 1, now + 2],
        );

        await client.query(
          `
            INSERT INTO ${OUTBOX_EVENT_TABLE}(
              event_id,
              operation_id,
              topic,
              partition_key,
              payload_jsonb,
              status,
              attempt_count,
              next_retry_at,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, now(), now())
          `,
          [
            `outbox:${normalizedOperationId}`,
            normalizedOperationId,
            'player.quest.submitted',
            normalizedPlayerId,
            JSON.stringify({
              playerId: normalizedPlayerId,
              questId: normalizedQuestId,
              questEntryCount: normalizedQuestEntries.length,
            }),
            'ready',
            0,
          ],
        );

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
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, now())
          `,
          [
            `audit:${normalizedOperationId}`,
            normalizedOperationId,
            normalizedPlayerId,
            'quest',
            normalizedQuestId,
            'submit',
            JSON.stringify({
              inventoryItemCount: normalizedInventoryItems.length,
              walletBalanceCount: normalizedWalletBalances.length,
              questEntryCount: normalizedQuestEntries.length,
            }),
            JSON.stringify({
              inventoryItemCount: null,
              walletBalanceCount: null,
              questEntryCount: null,
            }),
            JSON.stringify({
              inventoryItemCount: normalizedInventoryItems.length,
              walletBalanceCount: normalizedWalletBalances.length,
              questEntryCount: normalizedQuestEntries.length,
            }),
          ],
        );

        return {
          ok: true,
          alreadyCommitted: false,
          questId: normalizedQuestId,
        };
      },
    });
  }

  /** 事务性更新装备栏：写装备槽位快照、记审计日志和 outbox 事件 */
  async updateEquipmentLoadout(input: UpdateEquipmentLoadoutInput): Promise<UpdateEquipmentLoadoutResult> {
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeDurableOperationId(input.operationId);
    const normalizedSlot = normalizeRequiredString(input.slot);
    const normalizedInventoryItems = Array.isArray(input.nextInventoryItems) ? input.nextInventoryItems : [];
    const normalizedEquipmentSlots = Array.isArray(input.nextEquipmentSlots) ? input.nextEquipmentSlots : [];
    const action = input.action === 'unequip' ? 'unequip' : 'equip';
    if (!normalizedSlot) {
      throw new Error('invalid_update_equipment_loadout_input');
    }

    return this.executeAssetMutation<UpdateEquipmentLoadoutResult>({
      operationId: normalizedOperationId,
      playerId: normalizedPlayerId,
      expectedRuntimeOwnerId: input.expectedRuntimeOwnerId,
      expectedSessionEpoch: input.expectedSessionEpoch,
      expectedInstanceId: input.expectedInstanceId,
      expectedAssignedNodeId: input.expectedAssignedNodeId,
      expectedOwnershipEpoch: input.expectedOwnershipEpoch,
      operationType: `equipment_${action}`,
      aggregateType: 'player_equipment_slot',
      payload: {
        action,
        slot: normalizedSlot,
      },
      onAlreadyCommitted: async () => ({
        ok: true,
        alreadyCommitted: true,
        action,
        slot: normalizedSlot,
      }),
      onMutate: async (client, now) => {
        await replacePlayerInventoryItems(client, normalizedPlayerId, normalizedInventoryItems, {
          allowEmptyOverwrite: action === 'equip',
        });
        await replacePlayerEquipmentSlots(client, normalizedPlayerId, normalizedEquipmentSlots, {
          allowEmptyOverwrite: action === 'unequip',
        });

        await client.query(
          `
            INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(
              player_id,
              inventory_version,
              equipment_version,
              updated_at
            )
            VALUES ($1, $2, $3, now())
            ON CONFLICT (player_id)
            DO UPDATE SET
              inventory_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.inventory_version, EXCLUDED.inventory_version),
              equipment_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.equipment_version, EXCLUDED.equipment_version),
              updated_at = now()
          `,
          [normalizedPlayerId, now, now + 1],
        );

        await client.query(
          `
            INSERT INTO ${OUTBOX_EVENT_TABLE}(
              event_id,
              operation_id,
              topic,
              partition_key,
              payload_jsonb,
              status,
              attempt_count,
              next_retry_at,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, now(), now())
          `,
          [
            `outbox:${normalizedOperationId}`,
            normalizedOperationId,
            'player.equipment.updated',
            normalizedPlayerId,
            JSON.stringify({
              playerId: normalizedPlayerId,
              action,
              slot: normalizedSlot,
            }),
            'ready',
            0,
          ],
        );

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
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, now())
          `,
          [
            `audit:${normalizedOperationId}`,
            normalizedOperationId,
            normalizedPlayerId,
            'equipment',
            normalizedSlot,
            action,
            JSON.stringify({ slot: normalizedSlot }),
            JSON.stringify({}),
            JSON.stringify({
              inventoryItemCount: normalizedInventoryItems.length,
              equipmentSlotCount: normalizedEquipmentSlots.length,
            }),
          ],
        );

        return {
          ok: true,
          alreadyCommitted: false,
          action,
          slot: normalizedSlot,
        };
      },
    });
  }

  /** 事务性市场即时卖出结算：扣卖方物品、加买方物品、转移资金、记审计 */
  async settleMarketSellNow(input: {
    operationId: string;
    sellerId: string;
    expectedRuntimeOwnerId: string;
    expectedSessionEpoch: number;
    expectedInstanceId?: string | null;
    expectedAssignedNodeId?: string | null;
    expectedOwnershipEpoch?: number | null;
    itemId: string;
    itemName: string;
    quantity: number;
    totalIncome: number;
    nextSellerInventoryItems: unknown[];
    nextSellerWalletBalances: unknown[];
    matches: Array<{
      buyerId: string;
      tradeQuantity: number;
      totalCost: number;
      nextBuyerInventoryItems: unknown[];
    }>;
  }): Promise<{ ok: boolean; alreadyCommitted: boolean }> {
    const normalizedSellerId = normalizeRequiredString(input.sellerId);
    const normalizedOperationId = normalizeDurableOperationId(input.operationId);
    const normalizedItemId = normalizeRequiredString(input.itemId);
    const normalizedItemName = normalizeRequiredString(input.itemName);
    const normalizedSellerInventoryItems = (Array.isArray(input.nextSellerInventoryItems) ? input.nextSellerInventoryItems : []) as DurableInventoryItemSnapshot[];
    const normalizedSellerWalletBalances = Array.isArray(input.nextSellerWalletBalances) ? input.nextSellerWalletBalances : [];
    const normalizedMatches = Array.isArray(input.matches) ? input.matches : [];
    const quantity = Math.max(1, Math.trunc(Number(input.quantity ?? 0)));
    const totalIncome = Math.max(1, Math.trunc(Number(input.totalIncome ?? 0)));
    if (!normalizedSellerId || !normalizedItemId || !normalizedItemName || quantity <= 0 || totalIncome <= 0 || normalizedMatches.length === 0) {
      throw new Error('invalid_settle_market_sell_now_input');
    }

    return this.executeAssetMutation<{ ok: boolean; alreadyCommitted: boolean }>({
      operationId: normalizedOperationId,
      playerId: normalizedSellerId,
      expectedRuntimeOwnerId: input.expectedRuntimeOwnerId,
      expectedSessionEpoch: input.expectedSessionEpoch,
      expectedInstanceId: input.expectedInstanceId,
      expectedAssignedNodeId: input.expectedAssignedNodeId,
      expectedOwnershipEpoch: input.expectedOwnershipEpoch,
      operationType: 'market_sell_now',
      aggregateType: 'player_inventory_item',
      payload: {
        itemId: normalizedItemId,
        itemName: normalizedItemName,
        quantity,
        totalIncome,
      },
      onAlreadyCommitted: async () => ({
        ok: true,
        alreadyCommitted: true,
      }),
      onMutate: async (client, now) => {
        await replacePlayerInventoryItems(client, normalizedSellerId, normalizedSellerInventoryItems);
        await replacePlayerWalletRows(client, normalizedSellerId, normalizedSellerWalletBalances);
        await client.query(
          `
            INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(
              player_id,
              inventory_version,
              wallet_version,
              updated_at
            )
            VALUES ($1, $2, $3, now())
            ON CONFLICT (player_id)
            DO UPDATE SET
              inventory_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.inventory_version, EXCLUDED.inventory_version),
              wallet_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.wallet_version, EXCLUDED.wallet_version),
              updated_at = now()
          `,
          [normalizedSellerId, now, now + 1],
        );
        await client.query(
          `
            INSERT INTO ${OUTBOX_EVENT_TABLE}(
              event_id,
              operation_id,
              topic,
              partition_key,
              payload_jsonb,
              status,
              attempt_count,
              next_retry_at,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, now(), now())
          `,
          [
            `outbox:${normalizedOperationId}`,
            normalizedOperationId,
            'player.market.sell_now',
            normalizedSellerId,
            JSON.stringify({
              sellerId: normalizedSellerId,
              itemId: normalizedItemId,
              itemName: normalizedItemName,
              quantity,
              totalIncome,
              matches: normalizedMatches.map((entry) => ({
                buyerId: normalizeRequiredString(entry?.buyerId),
                tradeQuantity: Math.max(1, Math.trunc(Number(entry?.tradeQuantity ?? 0))),
                totalCost: Math.max(1, Math.trunc(Number(entry?.totalCost ?? 0))),
              })),
            }),
            'ready',
            0,
          ],
        );
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
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, now())
          `,
          [
            `audit:${normalizedOperationId}`,
            normalizedOperationId,
            normalizedSellerId,
            'market_sell_now',
            normalizedItemId,
            'sell',
            JSON.stringify({ itemId: normalizedItemId, quantity, totalIncome }),
            JSON.stringify({}),
            JSON.stringify({
              sellerInventoryItemCount: normalizedSellerInventoryItems.length,
              sellerWalletBalanceCount: normalizedSellerWalletBalances.length,
              matchCount: normalizedMatches.length,
            }),
          ],
        );

        for (const match of normalizedMatches) {
          const normalizedBuyerId = normalizeRequiredString(match?.buyerId);
          const normalizedBuyerInventoryItems = (Array.isArray(match?.nextBuyerInventoryItems) ? match.nextBuyerInventoryItems : []) as DurableInventoryItemSnapshot[];
          if (!normalizedBuyerId) {
            continue;
          }
          await replacePlayerInventoryItems(client, normalizedBuyerId, normalizedBuyerInventoryItems);
          await client.query(
            `
              INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(
                player_id,
                inventory_version,
                updated_at
              )
              VALUES ($1, $2, now())
              ON CONFLICT (player_id)
              DO UPDATE SET
                inventory_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.inventory_version, EXCLUDED.inventory_version),
                updated_at = now()
            `,
            [normalizedBuyerId, now],
          );
          await client.query(
            `
              INSERT INTO ${OUTBOX_EVENT_TABLE}(
                event_id,
                operation_id,
                topic,
                partition_key,
                payload_jsonb,
                status,
                attempt_count,
                next_retry_at,
                created_at
              )
              VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, now(), now())
            `,
            [
              `outbox:${normalizedOperationId}:${normalizedBuyerId}`,
              normalizedOperationId,
              'player.market.sell_now.trade_delivered',
              normalizedBuyerId,
              JSON.stringify({
                sellerId: normalizedSellerId,
                buyerId: normalizedBuyerId,
                itemId: normalizedItemId,
                itemName: normalizedItemName,
                tradeQuantity: Math.max(1, Math.trunc(Number(match?.tradeQuantity ?? 0))),
                totalCost: Math.max(1, Math.trunc(Number(match?.totalCost ?? 0))),
              }),
              'ready',
              0,
            ],
          );
        }

        return {
          ok: true,
          alreadyCommitted: false,
        };
      },
    });
  }

  /** 事务性市场即时买入结算：扣买方资金、加买方物品、转移收益给卖方、记审计 */
  async settleMarketBuyNow(input: {
    operationId: string;
    buyerId: string;
    expectedRuntimeOwnerId: string;
    expectedSessionEpoch: number;
    expectedInstanceId?: string | null;
    expectedAssignedNodeId?: string | null;
    expectedOwnershipEpoch?: number | null;
    itemId: string;
    itemName: string;
    quantity: number;
    totalCost: number;
    nextBuyerInventoryItems: unknown[];
    nextBuyerWalletBalances: unknown[];
    matches: DurableMarketBuyNowMatchSnapshot[];
  }): Promise<{ ok: boolean; alreadyCommitted: boolean }> {
    const normalizedBuyerId = normalizeRequiredString(input.buyerId);
    const normalizedOperationId = normalizeDurableOperationId(input.operationId);
    const normalizedItemId = normalizeRequiredString(input.itemId);
    const normalizedItemName = normalizeRequiredString(input.itemName);
    const normalizedBuyerInventoryItems = (Array.isArray(input.nextBuyerInventoryItems) ? input.nextBuyerInventoryItems : []) as DurableInventoryItemSnapshot[];
    const normalizedBuyerWalletBalances = (Array.isArray(input.nextBuyerWalletBalances) ? input.nextBuyerWalletBalances : []) as DurableWalletBalanceSnapshot[];
    const normalizedMatches = Array.isArray(input.matches) ? input.matches : [];
    const quantity = Math.max(1, Math.trunc(Number(input.quantity ?? 0)));
    const totalCost = Math.max(1, Math.trunc(Number(input.totalCost ?? 0)));
    if (!normalizedBuyerId || !normalizedItemId || !normalizedItemName || quantity <= 0 || totalCost <= 0 || normalizedMatches.length === 0) {
      throw new Error('invalid_settle_market_buy_now_input');
    }

    return this.executeAssetMutation<{ ok: boolean; alreadyCommitted: boolean }>({
      operationId: normalizedOperationId,
      playerId: normalizedBuyerId,
      expectedRuntimeOwnerId: input.expectedRuntimeOwnerId,
      expectedSessionEpoch: input.expectedSessionEpoch,
      expectedInstanceId: input.expectedInstanceId,
      expectedAssignedNodeId: input.expectedAssignedNodeId,
      expectedOwnershipEpoch: input.expectedOwnershipEpoch,
      operationType: 'market_buy_now',
      aggregateType: 'player_inventory_item',
      payload: {
        itemId: normalizedItemId,
        itemName: normalizedItemName,
        quantity,
        totalCost,
      },
      onAlreadyCommitted: async () => ({
        ok: true,
        alreadyCommitted: true,
      }),
      onMutate: async (client, now) => {
        await replacePlayerInventoryItems(client, normalizedBuyerId, normalizedBuyerInventoryItems);
        await replacePlayerWalletRows(client, normalizedBuyerId, normalizedBuyerWalletBalances);
        await client.query(
          `
            INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(
              player_id,
              inventory_version,
              wallet_version,
              updated_at
            )
            VALUES ($1, $2, $3, now())
            ON CONFLICT (player_id)
            DO UPDATE SET
              inventory_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.inventory_version, EXCLUDED.inventory_version),
              wallet_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.wallet_version, EXCLUDED.wallet_version),
              updated_at = now()
          `,
          [normalizedBuyerId, now, now + 1],
        );
        await client.query(
          `
            INSERT INTO ${OUTBOX_EVENT_TABLE}(
              event_id,
              operation_id,
              topic,
              partition_key,
              payload_jsonb,
              status,
              attempt_count,
              next_retry_at,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, now(), now())
          `,
          [
            `outbox:${normalizedOperationId}`,
            normalizedOperationId,
            'player.market.buy_now',
            normalizedBuyerId,
            JSON.stringify({
              buyerId: normalizedBuyerId,
              itemId: normalizedItemId,
              itemName: normalizedItemName,
              quantity,
              totalCost,
              matches: normalizedMatches.map((entry) => ({
                sellerId: normalizeRequiredString(entry?.sellerId),
                tradeQuantity: Math.max(1, Math.trunc(Number(entry?.tradeQuantity ?? 0))),
                totalCost: Math.max(1, Math.trunc(Number(entry?.totalCost ?? 0))),
              })),
            }),
            'ready',
            0,
          ],
        );
        for (const match of normalizedMatches) {
          const normalizedSellerId = normalizeRequiredString(match?.sellerId);
          const normalizedSellerInventoryItems = (Array.isArray(match?.nextSellerInventoryItems) ? match.nextSellerInventoryItems : []) as DurableInventoryItemSnapshot[];
          const normalizedSellerWalletBalances = (Array.isArray(match?.nextSellerWalletBalances) ? match.nextSellerWalletBalances : []) as DurableWalletBalanceSnapshot[];
          if (!normalizedSellerId) {
            continue;
          }
          await replacePlayerInventoryItems(client, normalizedSellerId, normalizedSellerInventoryItems);
          await replacePlayerWalletRows(client, normalizedSellerId, normalizedSellerWalletBalances);
          await client.query(
            `
              INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(
                player_id,
                inventory_version,
                wallet_version,
                updated_at
              )
              VALUES ($1, $2, $3, now())
              ON CONFLICT (player_id)
              DO UPDATE SET
                inventory_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.inventory_version, EXCLUDED.inventory_version),
                wallet_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.wallet_version, EXCLUDED.wallet_version),
                updated_at = now()
            `,
            [normalizedSellerId, now, now + 1],
          );
        }
        return {
          ok: true,
          alreadyCommitted: false,
        };
      },
    });
  }

  /** 事务性市场撤单结算：退还冻结资金或物品、记审计 */
  async settleMarketCancelOrder(input: {
    operationId: string;
    playerId: string;
    expectedRuntimeOwnerId: string;
    expectedSessionEpoch: number;
    expectedInstanceId?: string | null;
    expectedAssignedNodeId?: string | null;
    expectedOwnershipEpoch?: number | null;
    orderId: string;
    side: 'buy' | 'sell';
    nextInventoryItems: unknown[];
    nextWalletBalances: unknown[];
  }): Promise<{ ok: boolean; alreadyCommitted: boolean }> {
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeDurableOperationId(input.operationId);
    const normalizedOrderId = normalizeRequiredString(input.orderId);
    const normalizedInventoryItems = (Array.isArray(input.nextInventoryItems) ? input.nextInventoryItems : []) as DurableInventoryItemSnapshot[];
    const normalizedWalletBalances = (Array.isArray(input.nextWalletBalances) ? input.nextWalletBalances : []) as DurableWalletBalanceSnapshot[];
    const side = input.side === 'sell' ? 'sell' : 'buy';
    if (!normalizedPlayerId || !normalizedOrderId) {
      throw new Error('invalid_settle_market_cancel_order_input');
    }

    return this.executeAssetMutation<{ ok: boolean; alreadyCommitted: boolean }>({
      operationId: normalizedOperationId,
      playerId: normalizedPlayerId,
      expectedRuntimeOwnerId: input.expectedRuntimeOwnerId,
      expectedSessionEpoch: input.expectedSessionEpoch,
      expectedInstanceId: input.expectedInstanceId,
      expectedAssignedNodeId: input.expectedAssignedNodeId,
      expectedOwnershipEpoch: input.expectedOwnershipEpoch,
      operationType: `market_cancel_${side}`,
      aggregateType: side === 'sell' ? 'player_inventory_item' : 'player_wallet',
      payload: {
        orderId: normalizedOrderId,
        side,
      },
      onAlreadyCommitted: async () => ({
        ok: true,
        alreadyCommitted: true,
      }),
      onMutate: async (client, now) => {
        await replacePlayerInventoryItems(client, normalizedPlayerId, normalizedInventoryItems);
        await replacePlayerWalletRows(client, normalizedPlayerId, normalizedWalletBalances);
        await client.query(`DELETE FROM ${MARKET_ORDER_TABLE} WHERE order_id = $1`, [normalizedOrderId]);
        await client.query(
          `
            INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(
              player_id,
              inventory_version,
              wallet_version,
              updated_at
            )
            VALUES ($1, $2, $3, now())
            ON CONFLICT (player_id)
            DO UPDATE SET
              inventory_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.inventory_version, EXCLUDED.inventory_version),
              wallet_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.wallet_version, EXCLUDED.wallet_version),
              updated_at = now()
          `,
          [normalizedPlayerId, now, now + 1],
        );
        return {
          ok: true,
          alreadyCommitted: false,
        };
      },
    });
  }

  /** 通用市场强事务：收敛订单、成交、托管仓、玩家资产与 GM 封禁态。 */
  async settleMarketMutation(input: DurableMarketMutationInput): Promise<{ ok: boolean; alreadyCommitted: boolean }> {
    return this.settleMarketMutationAttempt(input, 1);
  }

  private async settleMarketMutationAttempt(
    input: DurableMarketMutationInput,
    commitOutcomeRetryRemaining: number,
  ): Promise<{ ok: boolean; alreadyCommitted: boolean }> {
    if (!this.pool || !this.enabled) {
      throw new Error('durable_operation_service_disabled');
    }
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeDurableOperationId(input.operationId);
    const operationType = (normalizeRequiredString(input.operationType) || 'market_mutation').slice(0, 64);
    const playerMutations = normalizeMarketPlayerMutations(input.playerMutations ?? []);
    const expectedOrders = normalizeMarketExpectedOrders(input.expectedOrders ?? []);
    const upsertOrders = Array.isArray(input.upsertOrders) ? input.upsertOrders : [];
    const deleteOrderIds = normalizeStringList(input.deleteOrderIds ?? []);
    const tradeRecords = Array.isArray(input.tradeRecords) ? input.tradeRecords : [];
    const banUser = input.banUser && typeof input.banUser === 'object' ? input.banUser : null;
    if (!normalizedPlayerId || !normalizedOperationId || (playerMutations.length === 0 && upsertOrders.length === 0 && deleteOrderIds.length === 0 && tradeRecords.length === 0 && !banUser)) {
      throw new Error('invalid_settle_market_mutation_input');
    }
    const expectedOrderIds = new Set(expectedOrders.map((entry) => entry.orderId));
    const mutatedOrderIds = new Set([
      ...upsertOrders.map((entry) => normalizeRequiredString((entry as Record<string, unknown>)?.id ?? (entry as Record<string, unknown>)?.orderId)),
      ...deleteOrderIds,
    ].filter(Boolean));
    for (const orderId of mutatedOrderIds) {
      if (!expectedOrderIds.has(orderId)) {
        throw new Error(`market_mutation_expected_order_missing:${orderId}`);
      }
    }
    const operationLogPayload = {
      request: input.payload ?? {},
      expectedOrders,
      playerMutations,
      upsertOrders,
      deleteOrderIds,
      tradeRecords,
      banUser,
    };
    const expectedRuntimeOwnerId = normalizeRequiredString(input.expectedRuntimeOwnerId);
    const expectedSessionEpoch = Math.max(0, Math.trunc(Number(input.expectedSessionEpoch ?? 0)));
    const requirePresenceFence = input.requirePresenceFence !== false;
    if (requirePresenceFence && (!expectedRuntimeOwnerId || expectedSessionEpoch <= 0)) {
      throw new Error('market_mutation_session_fence_missing');
    }
    const now = Date.now();
    const client = await this.pool.connect();
    let clientReleased = false;
    let commitAttempted = false;
    let commitOutcomeUnknown = false;
    let commitOutcomeCause: unknown = null;
    try {
      await client.query('BEGIN');
      const lockPlayerIds = new Set<string>([normalizedPlayerId]);
      for (const mutation of playerMutations) {
        lockPlayerIds.add(mutation.playerId);
      }
      if (banUser) {
        lockPlayerIds.add(normalizeRequiredString(banUser.playerId));
      }
      for (const lockPlayerId of Array.from(lockPlayerIds).filter(Boolean).sort()) {
        await acquirePlayerAssetLock(client, lockPlayerId);
      }
      const existingOperation = await client.query<{
        status?: string;
        operation_type?: string;
        aggregate_type?: string;
        player_id?: string;
        payload_jsonb?: unknown;
      }>(
        `SELECT status, operation_type, aggregate_type, player_id, payload_jsonb FROM ${DURABLE_OPERATION_LOG_TABLE} WHERE operation_id = $1 FOR UPDATE`,
        [normalizedOperationId],
      );
      if (existingOperation.rowCount) {
        assertDurableMarketOperationReplayIdentity(existingOperation.rows[0], {
          operationType,
          playerId: normalizedPlayerId,
          request: input.payload ?? {},
        });
      }
      if (existingOperation.rowCount && existingOperation.rows[0]?.status === 'committed') {
        clientReleased = await rollbackTransactionOrDestroyClient(client);
        return { ok: true, alreadyCommitted: true };
      }
      let persistedRuntimeOwnerId = expectedRuntimeOwnerId;
      let persistedSessionEpoch = expectedSessionEpoch;
      if (requirePresenceFence) {
        const presence = await client.query<{ runtime_owner_id?: string; session_epoch?: string | number }>(`SELECT runtime_owner_id, session_epoch FROM ${PLAYER_PRESENCE_TABLE} WHERE player_id = $1 FOR UPDATE`, [normalizedPlayerId]);
        await assertInstanceLeaseWritable(client, {
          expectedInstanceId: input.expectedInstanceId,
          expectedAssignedNodeId: input.expectedAssignedNodeId,
          expectedOwnershipEpoch: input.expectedOwnershipEpoch,
          currentNodeId: this.getCurrentNodeId(),
        });
        const presenceRow = presence.rows[0] ?? null;
        const persistedOwnerCandidate = normalizeRequiredString(presenceRow?.runtime_owner_id);
        const persistedEpochCandidate = Number(presenceRow?.session_epoch ?? 0);
        const persistedEpoch = Number.isFinite(persistedEpochCandidate)
          ? Math.trunc(persistedEpochCandidate)
          : 0;
        // presence 可能尚未刷入刚绑定的新 runtime session；expected epoch 领先 DB 时，
        // 必须在同一事务内把围栏推进到当前 owner，避免旧 owner 借领先 epoch 写入资产。
        if (persistedEpoch > 0) {
          if (expectedSessionEpoch < persistedEpoch) {
            throw new Error(buildMarketSessionFenceConflictMessage(
              expectedRuntimeOwnerId,
              expectedSessionEpoch,
              persistedOwnerCandidate,
              persistedEpoch,
            ));
          }
          if (expectedSessionEpoch === persistedEpoch && persistedOwnerCandidate && persistedOwnerCandidate !== expectedRuntimeOwnerId) {
            throw new Error(buildMarketSessionFenceConflictMessage(
              expectedRuntimeOwnerId,
              expectedSessionEpoch,
              persistedOwnerCandidate,
              persistedEpoch,
            ));
          }
          if (expectedSessionEpoch === persistedEpoch) {
            persistedRuntimeOwnerId = persistedOwnerCandidate || expectedRuntimeOwnerId;
            persistedSessionEpoch = persistedEpoch;
          }
        }
        if (expectedSessionEpoch > persistedEpoch) {
          await advancePlayerPresenceSessionFence(client, normalizedPlayerId, expectedRuntimeOwnerId, expectedSessionEpoch);
          persistedRuntimeOwnerId = expectedRuntimeOwnerId;
          persistedSessionEpoch = expectedSessionEpoch;
        }
      }
      await assertMarketParticipantPresenceFences(client, playerMutations, normalizedPlayerId);
      await assertMarketExpectedOrders(client, expectedOrders);
      if (existingOperation.rowCount === 0) {
        await insertDurableOperationLog(client, normalizedOperationId, operationType, 'market_mutation', normalizedPlayerId, persistedRuntimeOwnerId, persistedSessionEpoch, operationLogPayload);
      }
      await upsertMarketOrders(client, upsertOrders);
      if (deleteOrderIds.length > 0) {
        await client.query(`DELETE FROM ${MARKET_ORDER_TABLE} WHERE order_id = ANY($1::varchar[])`, [deleteOrderIds]);
      }
      await insertMarketTradeRecords(client, tradeRecords);
      for (const mutation of playerMutations) {
        await persistMarketPlayerMutation(client, mutation, now);
      }
      if (banUser) {
        await persistDurableMarketBanUser(client, banUser);
      }
      await insertDurableOutboxEvent(client, normalizedOperationId, 'player.market.mutation', normalizedPlayerId, {
        playerId: normalizedPlayerId,
        operationType,
        affectedPlayerIds: playerMutations.map((entry) => entry.playerId),
        upsertOrderCount: upsertOrders.length,
        deleteOrderCount: deleteOrderIds.length,
        tradeRecordCount: tradeRecords.length,
        banCommitted: Boolean(banUser),
      });
      await insertAssetAuditLog(client, normalizedOperationId, normalizedPlayerId, 'market_mutation', normalizedPlayerId, operationType, {
        upsertOrderCount: upsertOrders.length,
        deleteOrderCount: deleteOrderIds.length,
        tradeRecordCount: tradeRecords.length,
        playerMutationCount: playerMutations.length,
        banCommitted: Boolean(banUser),
      }, {}, {});
      await client.query(`UPDATE ${DURABLE_OPERATION_LOG_TABLE} SET status = 'committed', committed_at = now() WHERE operation_id = $1`, [normalizedOperationId]);
      commitAttempted = true;
      await client.query('COMMIT');
      commitAttempted = false;
      return { ok: true, alreadyCommitted: false };
    } catch (error: unknown) {
      clientReleased = await disposeFailedDurableTransactionClient(client, {
        commitAttempted,
        shuttingDown: this.closing,
      }) || clientReleased;
      if (commitAttempted) {
        commitOutcomeUnknown = true;
        commitOutcomeCause = error;
      } else {
        throw error;
      }
    } finally {
      if (!clientReleased) {
        client.release();
      }
    }

    if (commitOutcomeUnknown) {
      if (commitOutcomeRetryRemaining < 0) {
        throw new DurableOperationCommitOutcomeUnknownError(normalizedOperationId, commitOutcomeCause);
      }
      return this.settleUnknownCommitOutcome({
        operationId: normalizedOperationId,
        cause: commitOutcomeCause,
        affectedPlayerIds: Array.from(new Set([normalizedPlayerId, ...playerMutations.map((entry) => entry.playerId)])),
        affectedInstanceIds: [normalizeRequiredString(input.expectedInstanceId)].filter(Boolean),
        onSettled: (retryResult) => ({ ...retryResult, alreadyCommitted: false }),
        retry: () => this.settleMarketMutationAttempt(input, -1),
      });
    }

    throw new Error(`market_mutation_unreachable_state:${normalizedOperationId}`);
  }

  /** 事务性更新活跃任务状态：写任务进度快照、记审计日志和 outbox 事件 */
  async updateActiveJobState(input: UpdateActiveJobStateInput): Promise<UpdateActiveJobStateResult> {
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeDurableOperationId(input.operationId);
    const action = input.action === 'start' || input.action === 'cancel' || input.action === 'complete'
      ? input.action
      : 'update';
    const normalizedExpectedJobRunId = normalizeRequiredString(input.expectedJobRunId);
    const normalizedExpectedJobVersion = normalizedExpectedJobRunId
      ? Math.max(1, Math.trunc(Number(input.expectedJobVersion ?? 1)))
      : null;
    const normalizedNextActiveJob = input.nextActiveJob
      ? normalizeActiveJobSnapshot(input.nextActiveJob)
      : null;

    return this.executeAssetMutation<UpdateActiveJobStateResult>({
      operationId: normalizedOperationId,
      playerId: normalizedPlayerId,
      expectedRuntimeOwnerId: input.expectedRuntimeOwnerId,
      expectedSessionEpoch: input.expectedSessionEpoch,
      expectedInstanceId: input.expectedInstanceId,
      expectedAssignedNodeId: input.expectedAssignedNodeId,
      expectedOwnershipEpoch: input.expectedOwnershipEpoch,
      operationType: `active_job_${action}`,
      aggregateType: 'player_active_job',
      payload: {
        action,
        expectedJobRunId: normalizedExpectedJobRunId || null,
        expectedJobVersion: normalizedExpectedJobVersion,
        nextJobRunId: normalizedNextActiveJob?.jobRunId ?? null,
        nextJobVersion: normalizedNextActiveJob?.jobVersion ?? null,
      },
      onAlreadyCommitted: async () => ({
        ok: true,
        alreadyCommitted: true,
        action,
        jobRunId: normalizedNextActiveJob?.jobRunId ?? null,
        jobVersion: normalizedNextActiveJob?.jobVersion ?? null,
      }),
      onMutate: async (client, now) => {
        const currentRow = await client.query<{
          job_run_id?: string | null;
          job_version?: string | number | null;
        }>(
          `
            SELECT job_run_id, job_version
            FROM ${PLAYER_ACTIVE_JOB_TABLE}
            WHERE player_id = $1
            FOR UPDATE
          `,
          [normalizedPlayerId],
        );
        const persistedJobRunId = normalizeRequiredString(currentRow.rows[0]?.job_run_id);
        const persistedJobVersion = normalizeOptionalInteger(currentRow.rows[0]?.job_version) ?? 0;
        if (normalizedExpectedJobRunId) {
          if (
            persistedJobRunId !== normalizedExpectedJobRunId
            || persistedJobVersion !== normalizedExpectedJobVersion
          ) {
            if (isActiveJobAlreadyAtOrAheadOfNext(persistedJobRunId, persistedJobVersion, normalizedNextActiveJob)) {
              return {
                ok: true,
                alreadyCommitted: true,
                action,
                jobRunId: normalizedNextActiveJob?.jobRunId ?? null,
                jobVersion: normalizedNextActiveJob?.jobVersion ?? null,
              };
            }
            if (!isActiveJobCatchUpAllowed(
              persistedJobRunId,
              persistedJobVersion,
              normalizedExpectedJobRunId,
              normalizedExpectedJobVersion,
              normalizedNextActiveJob,
            )) {
              throw new Error(
                [
                  'player_active_job_cas_conflict',
                  `expectedJobRunId=${normalizedExpectedJobRunId}`,
                  `expectedJobVersion=${normalizedExpectedJobVersion}`,
                  `persistedJobRunId=${persistedJobRunId || 'null'}`,
                  `persistedJobVersion=${persistedJobVersion || 0}`,
                ].join(':'),
              );
            }
          }
        } else if (currentRow.rowCount > 0) {
          if (
            !normalizedNextActiveJob
            || persistedJobRunId !== normalizedNextActiveJob.jobRunId
            || persistedJobVersion > normalizedNextActiveJob.jobVersion
          ) {
            throw new Error(
              [
                'player_active_job_cas_conflict',
                'expectedJobRunId=null',
                'expectedJobVersion=null',
                `persistedJobRunId=${persistedJobRunId || 'null'}`,
                `persistedJobVersion=${persistedJobVersion || 0}`,
              ].join(':'),
            );
          }
        }

        await replacePlayerActiveJob(client, normalizedPlayerId, normalizedNextActiveJob);

        await client.query(
          `
            INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(
              player_id,
              active_job_version,
              updated_at
            )
            VALUES ($1, $2, now())
            ON CONFLICT (player_id)
            DO UPDATE SET
              active_job_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.active_job_version, EXCLUDED.active_job_version),
              updated_at = now()
          `,
          [normalizedPlayerId, now],
        );

        await client.query(
          `
            INSERT INTO ${OUTBOX_EVENT_TABLE}(
              event_id,
              operation_id,
              topic,
              partition_key,
              payload_jsonb,
              status,
              attempt_count,
              next_retry_at,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, now(), now())
          `,
          [
            `outbox:${normalizedOperationId}`,
            normalizedOperationId,
            'player.active_job.updated',
            normalizedPlayerId,
            JSON.stringify({
              playerId: normalizedPlayerId,
              action,
              expectedJobRunId: normalizedExpectedJobRunId || null,
              expectedJobVersion: normalizedExpectedJobVersion,
              nextJobRunId: normalizedNextActiveJob?.jobRunId ?? null,
              nextJobVersion: normalizedNextActiveJob?.jobVersion ?? null,
            }),
            'ready',
            0,
          ],
        );

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
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, now())
          `,
          [
            `audit:${normalizedOperationId}`,
            normalizedOperationId,
            normalizedPlayerId,
            'active_job',
            (normalizedNextActiveJob?.jobRunId ?? normalizedExpectedJobRunId) || normalizedPlayerId,
            action,
            JSON.stringify({
              expectedJobRunId: normalizedExpectedJobRunId || null,
              expectedJobVersion: normalizedExpectedJobVersion,
            }),
            JSON.stringify({
              jobRunId: persistedJobRunId || null,
              jobVersion: persistedJobVersion || null,
            }),
            JSON.stringify({
              jobRunId: normalizedNextActiveJob?.jobRunId ?? null,
              jobVersion: normalizedNextActiveJob?.jobVersion ?? null,
            }),
          ],
        );

        return {
          ok: true,
          alreadyCommitted: false,
          action,
          jobRunId: normalizedNextActiveJob?.jobRunId ?? null,
          jobVersion: normalizedNextActiveJob?.jobVersion ?? null,
        };
      },
    });
  }

  /** 事务性开始活跃任务并扣除资产：扣材料/资金、创建任务记录、记审计 */
  async startActiveJobWithAssets(input: StartActiveJobWithAssetsInput): Promise<StartActiveJobWithAssetsResult> {
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeDurableOperationId(input.operationId);
    const normalizedNextInventoryItems = Array.isArray(input.nextInventoryItems) ? input.nextInventoryItems : [];
    const normalizedNextWalletBalances = Array.isArray(input.nextWalletBalances) ? input.nextWalletBalances : [];
    const normalizedNextActiveJob = normalizeActiveJobSnapshot(input.nextActiveJob);
    const normalizedNextEnhancementRecords = Array.isArray(input.nextEnhancementRecords)
      ? normalizeEnhancementRecordSnapshots(normalizedPlayerId, input.nextEnhancementRecords)
      : null;
    const queueMutationRequested = input.expectedQueueHeadId !== undefined
      || input.nextTechniqueActivityQueue !== undefined;
    const normalizedExpectedQueueHeadId = queueMutationRequested
      ? normalizeRequiredString(input.expectedQueueHeadId)
      : null;
    const normalizedNextTechniqueActivityQueue = queueMutationRequested
      && Array.isArray(input.nextTechniqueActivityQueue)
      ? normalizeTechniqueActivityQueueSnapshots(input.nextTechniqueActivityQueue)
      : null;

    if (
      queueMutationRequested
      && (!normalizedExpectedQueueHeadId || !Array.isArray(input.nextTechniqueActivityQueue))
    ) {
      throw new Error('invalid_start_active_job_queue_mutation_input');
    }
    if (
      normalizedExpectedQueueHeadId
      && normalizedNextTechniqueActivityQueue?.some((entry) => entry.queueId === normalizedExpectedQueueHeadId)
    ) {
      throw new Error('invalid_start_active_job_queue_head_not_consumed');
    }
    if (
      normalizedExpectedQueueHeadId
      && normalizedNextTechniqueActivityQueue?.some(({ queueId }) => queueId === normalizedExpectedQueueHeadId)
    ) {
      throw new Error('start_active_job_queue_head_not_consumed');
    }

    const assetSnapshotDigest = buildActiveJobAssetSnapshotDigest({
      playerId: normalizedPlayerId,
      inventoryItems: normalizedNextInventoryItems,
      walletBalances: normalizedNextWalletBalances,
      equipmentSlots: undefined,
      enhancementRecords: normalizedNextEnhancementRecords,
      activeJob: normalizedNextActiveJob,
      techniqueActivityQueue: normalizedNextTechniqueActivityQueue ?? undefined,
    });

    return this.executeAssetMutation<StartActiveJobWithAssetsResult>({
      operationId: normalizedOperationId,
      playerId: normalizedPlayerId,
      expectedRuntimeOwnerId: input.expectedRuntimeOwnerId,
      expectedSessionEpoch: input.expectedSessionEpoch,
      expectedInstanceId: input.expectedInstanceId,
      expectedAssignedNodeId: input.expectedAssignedNodeId,
      expectedOwnershipEpoch: input.expectedOwnershipEpoch,
      operationType: 'active_job_start_with_assets',
      aggregateType: 'player_active_job',
      payload: {
        action: 'start',
        nextJobRunId: normalizedNextActiveJob.jobRunId,
        nextJobVersion: normalizedNextActiveJob.jobVersion,
        inventoryItemCount: normalizedNextInventoryItems.length,
        walletBalanceCount: normalizedNextWalletBalances.length,
        enhancementRecordCount: Array.isArray(normalizedNextEnhancementRecords) ? normalizedNextEnhancementRecords.length : 0,
        expectedQueueHeadId: normalizedExpectedQueueHeadId,
        techniqueActivityQueueCount: Array.isArray(normalizedNextTechniqueActivityQueue)
          ? normalizedNextTechniqueActivityQueue.length
          : null,
        assetSnapshotDigest,
      },
      onAlreadyCommitted: async () => ({
        ok: true,
        alreadyCommitted: true,
        action: 'start',
        jobRunId: normalizedNextActiveJob.jobRunId,
        jobVersion: normalizedNextActiveJob.jobVersion,
      }),
      onMutate: async (client, now) => {
        if (normalizedExpectedQueueHeadId && Array.isArray(normalizedNextTechniqueActivityQueue)) {
          await assertPlayerTechniqueActivityQueueHead(
            client,
            normalizedPlayerId,
            normalizedExpectedQueueHeadId,
          );
        }
        const currentRow = await client.query<{
          job_run_id?: string | null;
          job_version?: string | number | null;
        }>(
          `
            SELECT job_run_id, job_version
            FROM ${PLAYER_ACTIVE_JOB_TABLE}
            WHERE player_id = $1
            FOR UPDATE
          `,
          [normalizedPlayerId],
        );
        if (currentRow.rowCount > 0) {
          const persistedJobRunId = normalizeRequiredString(currentRow.rows[0]?.job_run_id);
          const persistedJobVersion = normalizeOptionalInteger(currentRow.rows[0]?.job_version) ?? 0;
          if (
            persistedJobRunId !== normalizedNextActiveJob.jobRunId
            || persistedJobVersion > normalizedNextActiveJob.jobVersion
          ) {
            throw new Error(
              [
                'player_active_job_cas_conflict',
                'expectedJobRunId=null',
                'expectedJobVersion=null',
                `persistedJobRunId=${persistedJobRunId || 'null'}`,
                `persistedJobVersion=${persistedJobVersion || 0}`,
              ].join(':'),
            );
          }
        }

        await replacePlayerInventoryItems(client, normalizedPlayerId, normalizedNextInventoryItems, {
          replaceLockedItems: true,
        });
        await replacePlayerWalletRows(client, normalizedPlayerId, normalizedNextWalletBalances);
        await replacePlayerActiveJob(client, normalizedPlayerId, normalizedNextActiveJob);
        if (Array.isArray(normalizedNextEnhancementRecords)) {
          await replacePlayerEnhancementRecords(client, normalizedPlayerId, normalizedNextEnhancementRecords);
        }
        if (normalizedExpectedQueueHeadId && Array.isArray(normalizedNextTechniqueActivityQueue)) {
          await replacePlayerTechniqueActivityQueue(
            client,
            normalizedPlayerId,
            normalizedNextTechniqueActivityQueue,
          );
        }

        const activeJobVersion = Array.isArray(normalizedNextTechniqueActivityQueue) ? now + 3 : now + 2;
        await client.query(
          `
            INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(
              player_id,
              inventory_version,
              wallet_version,
              active_job_version,
              enhancement_record_version,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, now())
            ON CONFLICT (player_id)
            DO UPDATE SET
              inventory_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.inventory_version, EXCLUDED.inventory_version),
              wallet_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.wallet_version, EXCLUDED.wallet_version),
              active_job_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.active_job_version, EXCLUDED.active_job_version),
              enhancement_record_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.enhancement_record_version, EXCLUDED.enhancement_record_version),
              updated_at = now()
          `,
          [
            normalizedPlayerId,
            now,
            now + 1,
            activeJobVersion,
            Array.isArray(normalizedNextEnhancementRecords) ? activeJobVersion + 1 : 0,
          ],
        );

        await client.query(
          `
            INSERT INTO ${OUTBOX_EVENT_TABLE}(
              event_id,
              operation_id,
              topic,
              partition_key,
              payload_jsonb,
              status,
              attempt_count,
              next_retry_at,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, now(), now())
          `,
          [
            `outbox:${normalizedOperationId}`,
            normalizedOperationId,
            'player.active_job.started',
            normalizedPlayerId,
            JSON.stringify({
              playerId: normalizedPlayerId,
              action: 'start',
              jobRunId: normalizedNextActiveJob.jobRunId,
              jobVersion: normalizedNextActiveJob.jobVersion,
              consumedQueueHeadId: normalizedExpectedQueueHeadId,
            }),
            'ready',
            0,
          ],
        );

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
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, now())
          `,
          [
            `audit:${normalizedOperationId}`,
            normalizedOperationId,
            normalizedPlayerId,
            'active_job',
            normalizedNextActiveJob.jobRunId,
            'start',
            JSON.stringify({
              inventoryItemCount: normalizedNextInventoryItems.length,
              walletBalanceCount: normalizedNextWalletBalances.length,
              enhancementRecordCount: Array.isArray(normalizedNextEnhancementRecords) ? normalizedNextEnhancementRecords.length : 0,
              consumedQueueHeadId: normalizedExpectedQueueHeadId,
              techniqueActivityQueueCount: Array.isArray(normalizedNextTechniqueActivityQueue)
                ? normalizedNextTechniqueActivityQueue.length
                : null,
            }),
            JSON.stringify({
              jobRunId: null,
              jobVersion: null,
            }),
            JSON.stringify({
              jobRunId: normalizedNextActiveJob.jobRunId,
              jobVersion: normalizedNextActiveJob.jobVersion,
            }),
          ],
        );

        return {
          ok: true,
          alreadyCommitted: false,
          action: 'start',
          jobRunId: normalizedNextActiveJob.jobRunId,
          jobVersion: normalizedNextActiveJob.jobVersion,
        };
      },
    });
  }

  /** 归档过期审计日志：将超过保留期的记录移入归档表并删除原表行 */
  async archiveOldAssetAuditLogs(input?: { retentionDays?: number; limit?: number }): Promise<number> {
    if (!this.pool || !this.enabled) {
      return 0;
    }
    const retentionDays = normalizePositiveInteger(input?.retentionDays, 30, 1, 3650);
    const limit = normalizePositiveInteger(input?.limit, 500, 1, 10_000);
    const result = await this.pool.query(
      `
        WITH archived AS (
          DELETE FROM ${ASSET_AUDIT_LOG_TABLE}
          WHERE log_id IN (
            SELECT log_id
            FROM ${ASSET_AUDIT_LOG_TABLE}
            WHERE created_at < now() - ($1::bigint * interval '1 day')
            ORDER BY created_at ASC, log_id ASC
            LIMIT $2
            FOR UPDATE SKIP LOCKED
          )
          RETURNING log_id, operation_id, player_id, asset_type, asset_ref_id, action, delta_jsonb, before_jsonb, after_jsonb, created_at
        )
        INSERT INTO ${ASSET_AUDIT_LOG_ARCHIVE_TABLE}(
          log_id, operation_id, player_id, asset_type, asset_ref_id, action,
          delta_jsonb, before_jsonb, after_jsonb, created_at, archived_at
        )
        SELECT
          log_id, operation_id, player_id, asset_type, asset_ref_id, action,
          delta_jsonb, before_jsonb, after_jsonb, created_at, now()
        FROM archived
        ON CONFLICT DO NOTHING
        RETURNING log_id
      `,
      [retentionDays, limit],
    );
    return Array.isArray(result.rows) ? result.rowCount ?? result.rows.length : 0;
  }

  /**
   * 清理超过总保留期的归档审计日志。
   * retentionDays 与 combatRetentionDays 均从事件 created_at 起算，避免历史积压在归档后重新获得一轮保留期。
   */
  async purgeArchivedAssetAuditLogs(input?: {
    retentionDays?: number;
    combatRetentionDays?: number;
    limit?: number;
  }): Promise<number> {
    if (!this.pool || !this.enabled) {
      return 0;
    }
    const retentionDays = normalizePositiveInteger(input?.retentionDays, 365, 1, 3650);
    const combatRetentionDays = Math.min(
      retentionDays,
      normalizePositiveInteger(input?.combatRetentionDays, 90, 1, 3650),
    );
    const limit = normalizePositiveInteger(input?.limit, 500, 1, 10_000);
    const result = await this.pool.query(
      `
        WITH targets AS (
          SELECT log_id
          FROM ${ASSET_AUDIT_LOG_ARCHIVE_TABLE}
          WHERE created_at < now() - ($1::bigint * interval '1 day')
            OR (
              asset_type = 'combat'
              AND created_at < now() - ($2::bigint * interval '1 day')
            )
          ORDER BY created_at ASC, log_id ASC
          LIMIT $3
          FOR UPDATE SKIP LOCKED
        )
        DELETE FROM ${ASSET_AUDIT_LOG_ARCHIVE_TABLE} archived
        USING targets
        WHERE archived.log_id = targets.log_id
        RETURNING archived.log_id
      `,
      [retentionDays, combatRetentionDays, limit],
    );
    return Array.isArray(result.rows) ? result.rowCount ?? result.rows.length : 0;
  }

  /** 清理过期 committed durable 操作日志；只删除不再被 outbox 引用的终态行 */
  async retainCommittedOperationLogs(input?: { retentionDays?: number; limit?: number }): Promise<DurableOperationRetentionResult> {
    if (!this.pool || !this.enabled) {
      return { operationLogsDeleted: 0 };
    }
    const retentionDays = normalizePositiveInteger(input?.retentionDays, 7, 1, 3650);
    const limit = normalizePositiveInteger(input?.limit, 1000, 1, 10_000);
    const result = await this.pool.query<{ deleted_count?: string | number }>(
      `
        WITH targets AS (
          SELECT operation_id
          FROM ${DURABLE_OPERATION_LOG_TABLE} operation_log
          WHERE status = 'committed'
            AND COALESCE(committed_at, created_at) < now() - ($1::bigint * interval '1 day')
            AND NOT EXISTS (
              SELECT 1
              FROM ${OUTBOX_EVENT_TABLE} outbox
              WHERE outbox.operation_id = operation_log.operation_id
            )
            AND NOT EXISTS (
              SELECT 1
              FROM ${DEAD_LETTER_EVENT_TABLE} dead_letter
              WHERE dead_letter.operation_id = operation_log.operation_id
            )
          ORDER BY COALESCE(committed_at, created_at) ASC, operation_id ASC
          LIMIT $2
          FOR UPDATE SKIP LOCKED
        ),
        deleted AS (
          DELETE FROM ${DURABLE_OPERATION_LOG_TABLE} operation_log
          USING targets
          WHERE operation_log.operation_id = targets.operation_id
          RETURNING 1
        )
        SELECT COUNT(*)::bigint AS deleted_count FROM deleted
      `,
      [retentionDays, limit],
    );
    return {
      operationLogsDeleted: normalizePositiveInteger(result.rows[0]?.deleted_count, 0, 0, Number.MAX_SAFE_INTEGER),
    };
  }

  /** 事务性取消活跃任务并退还资产：退材料/资金、删除任务记录、记审计 */
  async cancelActiveJobWithAssets(input: CancelActiveJobWithAssetsInput): Promise<CancelActiveJobWithAssetsResult> {
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeDurableOperationId(input.operationId);
    const normalizedExpectedJobRunId = normalizeRequiredString(input.expectedJobRunId);
    const normalizedExpectedJobVersion = Math.max(1, Math.trunc(Number(input.expectedJobVersion ?? 1)));
    const normalizedNextInventoryItems = Array.isArray(input.nextInventoryItems) ? input.nextInventoryItems : [];
    const normalizedNextWalletBalances = Array.isArray(input.nextWalletBalances) ? input.nextWalletBalances : [];
    const normalizedNextEquipmentSlots = Array.isArray(input.nextEquipmentSlots) ? input.nextEquipmentSlots : null;
    const normalizedNextEnhancementRecords = Array.isArray(input.nextEnhancementRecords)
      ? normalizeEnhancementRecordSnapshots(normalizedPlayerId, input.nextEnhancementRecords)
      : null;

    if (!normalizedExpectedJobRunId) {
      throw new Error('invalid_cancel_active_job_with_assets_input');
    }

    const assetSnapshotDigest = buildActiveJobAssetSnapshotDigest({
      playerId: normalizedPlayerId,
      inventoryItems: normalizedNextInventoryItems,
      walletBalances: normalizedNextWalletBalances,
      equipmentSlots: normalizedNextEquipmentSlots ?? undefined,
      enhancementRecords: normalizedNextEnhancementRecords,
      activeJob: null,
      techniqueActivityQueue: undefined,
    });

    return this.executeAssetMutation<CancelActiveJobWithAssetsResult>({
      operationId: normalizedOperationId,
      playerId: normalizedPlayerId,
      expectedRuntimeOwnerId: input.expectedRuntimeOwnerId,
      expectedSessionEpoch: input.expectedSessionEpoch,
      expectedInstanceId: input.expectedInstanceId,
      expectedAssignedNodeId: input.expectedAssignedNodeId,
      expectedOwnershipEpoch: input.expectedOwnershipEpoch,
      operationType: 'active_job_cancel_with_assets',
      aggregateType: 'player_active_job',
      payload: {
        action: 'cancel',
        expectedJobRunId: normalizedExpectedJobRunId,
        expectedJobVersion: normalizedExpectedJobVersion,
        inventoryItemCount: normalizedNextInventoryItems.length,
        walletBalanceCount: normalizedNextWalletBalances.length,
        equipmentSlotCount: Array.isArray(normalizedNextEquipmentSlots) ? normalizedNextEquipmentSlots.length : 0,
        enhancementRecordCount: Array.isArray(normalizedNextEnhancementRecords) ? normalizedNextEnhancementRecords.length : 0,
        assetSnapshotDigest,
      },
      onAlreadyCommitted: async () => ({
        ok: true,
        alreadyCommitted: true,
        action: 'cancel',
        jobRunId: null,
        jobVersion: null,
      }),
      onMutate: async (client, now) => {
        const currentRow = await client.query<{
          job_run_id?: string | null;
          job_version?: string | number | null;
        }>(
          `
            SELECT job_run_id, job_version
            FROM ${PLAYER_ACTIVE_JOB_TABLE}
            WHERE player_id = $1
            FOR UPDATE
          `,
          [normalizedPlayerId],
        );
        const persistedJobRunId = normalizeRequiredString(currentRow.rows[0]?.job_run_id);
        const persistedJobVersion = normalizeOptionalInteger(currentRow.rows[0]?.job_version) ?? 0;
        if (
          persistedJobRunId !== normalizedExpectedJobRunId
          || persistedJobVersion !== normalizedExpectedJobVersion
        ) {
          if (!isSameActiveJobBehindExpected(
            persistedJobRunId,
            persistedJobVersion,
            normalizedExpectedJobRunId,
            normalizedExpectedJobVersion,
          )) {
            throw new Error(
              [
                'player_active_job_cas_conflict',
                `expectedJobRunId=${normalizedExpectedJobRunId}`,
                `expectedJobVersion=${normalizedExpectedJobVersion}`,
                `persistedJobRunId=${persistedJobRunId || 'null'}`,
                `persistedJobVersion=${persistedJobVersion || 0}`,
              ].join(':'),
            );
          }
        }

        await replacePlayerInventoryItems(client, normalizedPlayerId, normalizedNextInventoryItems, {
          replaceLockedItems: true,
        });
        await replacePlayerWalletRows(client, normalizedPlayerId, normalizedNextWalletBalances);
        if (Array.isArray(normalizedNextEquipmentSlots)) {
          await replacePlayerEquipmentSlots(client, normalizedPlayerId, normalizedNextEquipmentSlots);
        }
        if (Array.isArray(normalizedNextEnhancementRecords)) {
          await replacePlayerEnhancementRecords(client, normalizedPlayerId, normalizedNextEnhancementRecords);
        }
        await replacePlayerActiveJob(client, normalizedPlayerId, null);

        await client.query(
          `
            INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(
              player_id,
              inventory_version,
              wallet_version,
              equipment_version,
              active_job_version,
              enhancement_record_version,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, now())
            ON CONFLICT (player_id)
            DO UPDATE SET
              inventory_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.inventory_version, EXCLUDED.inventory_version),
              wallet_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.wallet_version, EXCLUDED.wallet_version),
              equipment_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.equipment_version, EXCLUDED.equipment_version),
              active_job_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.active_job_version, EXCLUDED.active_job_version),
              enhancement_record_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.enhancement_record_version, EXCLUDED.enhancement_record_version),
              updated_at = now()
          `,
          [
            normalizedPlayerId,
            now,
            now + 1,
            Array.isArray(normalizedNextEquipmentSlots) ? now + 2 : 0,
            now + 3,
            Array.isArray(normalizedNextEnhancementRecords) ? now + 4 : 0,
          ],
        );

        await client.query(
          `
            INSERT INTO ${OUTBOX_EVENT_TABLE}(
              event_id,
              operation_id,
              topic,
              partition_key,
              payload_jsonb,
              status,
              attempt_count,
              next_retry_at,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, now(), now())
          `,
          [
            `outbox:${normalizedOperationId}`,
            normalizedOperationId,
            'player.active_job.cancelled',
            normalizedPlayerId,
            JSON.stringify({
              playerId: normalizedPlayerId,
              action: 'cancel',
              expectedJobRunId: normalizedExpectedJobRunId,
              expectedJobVersion: normalizedExpectedJobVersion,
            }),
            'ready',
            0,
          ],
        );

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
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, now())
          `,
          [
            `audit:${normalizedOperationId}`,
            normalizedOperationId,
            normalizedPlayerId,
            'active_job',
            normalizedExpectedJobRunId,
            'cancel',
            JSON.stringify({
              inventoryItemCount: normalizedNextInventoryItems.length,
              walletBalanceCount: normalizedNextWalletBalances.length,
              enhancementRecordCount: Array.isArray(normalizedNextEnhancementRecords) ? normalizedNextEnhancementRecords.length : 0,
            }),
            JSON.stringify({
              jobRunId: persistedJobRunId || null,
              jobVersion: persistedJobVersion || null,
            }),
            JSON.stringify({
              jobRunId: null,
              jobVersion: null,
            }),
          ],
        );

        return {
          ok: true,
          alreadyCommitted: false,
          action: 'cancel',
          jobRunId: null,
          jobVersion: null,
        };
      },
    });
  }

  /** 事务性完成活跃任务并发放产出：写产出物品/资金、删除任务记录、记审计 */
  async completeActiveJobWithAssets(input: CompleteActiveJobWithAssetsInput): Promise<CompleteActiveJobWithAssetsResult> {
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeDurableOperationId(input.operationId);
    const normalizedExpectedJobRunId = normalizeRequiredString(input.expectedJobRunId);
    const normalizedExpectedJobVersion = Math.max(1, Math.trunc(Number(input.expectedJobVersion ?? 1)));
    const normalizedNextInventoryItems = Array.isArray(input.nextInventoryItems) ? input.nextInventoryItems : [];
    const normalizedNextWalletBalances = Array.isArray(input.nextWalletBalances) ? input.nextWalletBalances : [];
    const normalizedNextEquipmentSlots = Array.isArray(input.nextEquipmentSlots) ? input.nextEquipmentSlots : null;
    const normalizedNextEnhancementRecords = Array.isArray(input.nextEnhancementRecords)
      ? normalizeEnhancementRecordSnapshots(normalizedPlayerId, input.nextEnhancementRecords)
      : null;
    const normalizedNextProfessionStates = Array.isArray(input.nextProfessionStates)
      ? normalizeProfessionStateSnapshots(input.nextProfessionStates)
      : null;
    const normalizedNextActiveJob = input.nextActiveJob
      ? normalizeActiveJobSnapshot(input.nextActiveJob)
      : null;
    const completionKind = normalizeActiveJobCompletionKind(input.completionKind);
    const completionSemantics = resolveActiveJobCompletionSemantics(completionKind);

    if (!normalizedExpectedJobRunId) {
      throw new Error('invalid_complete_active_job_with_assets_input');
    }

    const assetSnapshotDigest = buildActiveJobAssetSnapshotDigest({
      playerId: normalizedPlayerId,
      inventoryItems: normalizedNextInventoryItems,
      walletBalances: normalizedNextWalletBalances,
      equipmentSlots: normalizedNextEquipmentSlots ?? undefined,
      enhancementRecords: normalizedNextEnhancementRecords,
      professionStates: normalizedNextProfessionStates,
      activeJob: normalizedNextActiveJob,
      techniqueActivityQueue: undefined,
    });

    return this.executeAssetMutation<CompleteActiveJobWithAssetsResult>({
      operationId: normalizedOperationId,
      playerId: normalizedPlayerId,
      expectedRuntimeOwnerId: input.expectedRuntimeOwnerId,
      expectedSessionEpoch: input.expectedSessionEpoch,
      expectedInstanceId: input.expectedInstanceId,
      expectedAssignedNodeId: input.expectedAssignedNodeId,
      expectedOwnershipEpoch: input.expectedOwnershipEpoch,
      operationType: completionSemantics.operationType,
      aggregateType: 'player_active_job',
      payload: {
        action: completionSemantics.action,
        completionKind,
        expectedJobRunId: normalizedExpectedJobRunId,
        expectedJobVersion: normalizedExpectedJobVersion,
        inventoryItemCount: normalizedNextInventoryItems.length,
        walletBalanceCount: normalizedNextWalletBalances.length,
        equipmentSlotCount: Array.isArray(normalizedNextEquipmentSlots) ? normalizedNextEquipmentSlots.length : 0,
        enhancementRecordCount: Array.isArray(normalizedNextEnhancementRecords) ? normalizedNextEnhancementRecords.length : 0,
        ...(Array.isArray(normalizedNextProfessionStates)
          ? { professionStateCount: normalizedNextProfessionStates.length }
          : {}),
        nextJobRunId: normalizedNextActiveJob?.jobRunId ?? null,
        nextJobVersion: normalizedNextActiveJob?.jobVersion ?? null,
        assetSnapshotDigest,
      },
      onAlreadyCommitted: async () => ({
        ok: true,
        alreadyCommitted: true,
        action: 'complete',
        jobRunId: normalizedNextActiveJob?.jobRunId ?? null,
        jobVersion: normalizedNextActiveJob?.jobVersion ?? null,
      }),
      onMutate: async (client, now) => {
        const currentRow = await client.query<{
          job_run_id?: string | null;
          job_version?: string | number | null;
        }>(
          `
            SELECT job_run_id, job_version
            FROM ${PLAYER_ACTIVE_JOB_TABLE}
            WHERE player_id = $1
            FOR UPDATE
          `,
          [normalizedPlayerId],
        );
        const persistedJobRunId = normalizeRequiredString(currentRow.rows[0]?.job_run_id);
        const persistedJobVersion = normalizeOptionalInteger(currentRow.rows[0]?.job_version) ?? 0;
        if (
          persistedJobRunId !== normalizedExpectedJobRunId
          || persistedJobVersion !== normalizedExpectedJobVersion
        ) {
          if (
            !isSameActiveJobBehindExpected(
              persistedJobRunId,
              persistedJobVersion,
              normalizedExpectedJobRunId,
              normalizedExpectedJobVersion,
            )
            && !isActiveJobSameOrBehindNext(persistedJobRunId, persistedJobVersion, normalizedNextActiveJob)
          ) {
            throw new Error(
              [
                'player_active_job_cas_conflict',
                `expectedJobRunId=${normalizedExpectedJobRunId}`,
                `expectedJobVersion=${normalizedExpectedJobVersion}`,
                `persistedJobRunId=${persistedJobRunId || 'null'}`,
                `persistedJobVersion=${persistedJobVersion || 0}`,
              ].join(':'),
            );
          }
        }

        await replacePlayerInventoryItems(client, normalizedPlayerId, normalizedNextInventoryItems, {
          replaceLockedItems: true,
        });
        await replacePlayerWalletRows(client, normalizedPlayerId, normalizedNextWalletBalances);
        if (Array.isArray(normalizedNextEquipmentSlots)) {
          await replacePlayerEquipmentSlots(client, normalizedPlayerId, normalizedNextEquipmentSlots);
        }
        if (Array.isArray(normalizedNextEnhancementRecords)) {
          await replacePlayerEnhancementRecords(client, normalizedPlayerId, normalizedNextEnhancementRecords);
        }
        if (Array.isArray(normalizedNextProfessionStates)) {
          await replacePlayerProfessionStates(client, normalizedPlayerId, normalizedNextProfessionStates);
        }
        await replacePlayerActiveJob(client, normalizedPlayerId, normalizedNextActiveJob);
        const professionVersion = Array.isArray(normalizedNextProfessionStates) ? now + 3 : 0;
        // 各分域 watermark 独立比较，profession 与 active_job 可共用同一事务版本；
        // 保持 active_job 既有 now+3 口径，避免部署后平白抬高旧链路版本。
        const activeJobVersion = now + 3;
        const enhancementRecordVersion = Array.isArray(normalizedNextEnhancementRecords)
          ? activeJobVersion + 1
          : 0;

        await client.query(
          `
            INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(
              player_id,
              inventory_version,
              wallet_version,
              equipment_version,
              profession_version,
              active_job_version,
              enhancement_record_version,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, now())
            ON CONFLICT (player_id)
            DO UPDATE SET
              inventory_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.inventory_version, EXCLUDED.inventory_version),
              wallet_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.wallet_version, EXCLUDED.wallet_version),
              equipment_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.equipment_version, EXCLUDED.equipment_version),
              profession_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.profession_version, EXCLUDED.profession_version),
              active_job_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.active_job_version, EXCLUDED.active_job_version),
              enhancement_record_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.enhancement_record_version, EXCLUDED.enhancement_record_version),
              updated_at = now()
          `,
          [
            normalizedPlayerId,
            now,
            now + 1,
            Array.isArray(normalizedNextEquipmentSlots) ? now + 2 : 0,
            professionVersion,
            activeJobVersion,
            enhancementRecordVersion,
          ],
        );

        await client.query(
          `
            INSERT INTO ${OUTBOX_EVENT_TABLE}(
              event_id,
              operation_id,
              topic,
              partition_key,
              payload_jsonb,
              status,
              attempt_count,
              next_retry_at,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, now(), now())
          `,
          [
            `outbox:${normalizedOperationId}`,
            normalizedOperationId,
            completionSemantics.outboxTopic,
            normalizedPlayerId,
            JSON.stringify({
              playerId: normalizedPlayerId,
              action: completionSemantics.action,
              completionKind,
              expectedJobRunId: normalizedExpectedJobRunId,
              expectedJobVersion: normalizedExpectedJobVersion,
              nextJobRunId: normalizedNextActiveJob?.jobRunId ?? null,
              nextJobVersion: normalizedNextActiveJob?.jobVersion ?? null,
            }),
            'ready',
            0,
          ],
        );

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
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, now())
          `,
          [
            `audit:${normalizedOperationId}`,
            normalizedOperationId,
            normalizedPlayerId,
            'active_job',
            normalizedExpectedJobRunId,
            completionSemantics.action,
            JSON.stringify({
              completionKind,
              inventoryItemCount: normalizedNextInventoryItems.length,
              walletBalanceCount: normalizedNextWalletBalances.length,
              enhancementRecordCount: Array.isArray(normalizedNextEnhancementRecords) ? normalizedNextEnhancementRecords.length : 0,
              ...(Array.isArray(normalizedNextProfessionStates)
                ? { professionStateCount: normalizedNextProfessionStates.length }
                : {}),
            }),
            JSON.stringify({
              jobRunId: persistedJobRunId || null,
              jobVersion: persistedJobVersion || null,
            }),
            JSON.stringify({
              jobRunId: normalizedNextActiveJob?.jobRunId ?? null,
              jobVersion: normalizedNextActiveJob?.jobVersion ?? null,
            }),
          ],
        );

        return {
          ok: true,
          alreadyCommitted: false,
          action: 'complete',
          jobRunId: normalizedNextActiveJob?.jobRunId ?? null,
          jobVersion: normalizedNextActiveJob?.jobVersion ?? null,
        };
      },
    });
  }

  /** 查询 durable operation 的已提交状态，用于处理 COMMIT 回包不确定后的运行态回读。 */
  async getOperationStatus(operationId: string): Promise<'pending' | 'committed' | null> {
    if (!this.pool || !this.enabled) {
      throw new Error('durable_operation_service_disabled');
    }
    const normalizedOperationId = normalizeDurableOperationId(operationId);
    if (!normalizedOperationId) {
      return null;
    }
    const result = await this.pool.query<{ status?: string }>(
      `SELECT status FROM ${DURABLE_OPERATION_LOG_TABLE} WHERE operation_id = $1 LIMIT 1`,
      [normalizedOperationId],
    );
    const status = normalizeRequiredString(result.rows[0]?.status);
    return status === 'committed' ? 'committed' : status === 'pending' ? 'pending' : null;
  }

  async isOperationCommitted(operationId: string): Promise<boolean> {
    return (await this.getOperationStatus(operationId)) === 'committed';
  }

  /**
   * COMMIT 回包丢失且首次查询也失败时，调用方仍持有运行态资产锁；这里持续收敛到确定结果，
   * 禁止把 unknown 降级成普通失败后回滚内存，或让周期 flush 越过未决事务。
   */
  private async settleUnknownCommitOutcome<TResult>(input: {
    operationId: string;
    cause: unknown;
    affectedPlayerIds?: readonly string[];
    affectedInstanceIds?: readonly string[];
    onSettled: (retryResult: TResult) => TResult;
    retry: () => Promise<TResult>;
  }): Promise<TResult> {
    const initialCause = input.cause;
    let latestCause = input.cause;
    let reconciliationFailureCount = 0;
    let attempt = 0;
    while (!this.closing && this.pool && this.enabled) {
      attempt += 1;
      try {
        await this.awaitStatusReadOrShutdown(this.getOperationStatus(input.operationId));
      } catch (error: unknown) {
        if (error instanceof DurableOperationShutdownError) {
          break;
        }
        latestCause = error;
        reconciliationFailureCount += 1;
        if (attempt === 1 || attempt % 20 === 0) {
          this.logger.error(
            `强事务 COMMIT 结果查询失败，继续持锁重试 operationId=${input.operationId} attempt=${attempt}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
        if (this.closing) {
          break;
        }
        await waitForDurableOperationReconciliation(250);
        continue;
      }
      try {
        // 无论 status 为 committed/pending/null，都重新进入带行锁与 replay identity 校验的幂等入口。
        // status 只用于确认数据库已恢复可读，不能单独作为本次 operation 身份证明。
        const retryResult = await input.retry();
        // 本收敛器只服务已经执行到 COMMIT 的当前调用；身份验证或幂等重试成功后，
        // 仍返回本次 mutation 结果，避免上层误按历史 replay 撤销已提交的乐观运行态。
        return input.onSettled(retryResult);
      } catch (error: unknown) {
        if (
          !(error instanceof DurableOperationCommitOutcomeUnknownError)
          && !isTransientPostgresError(error)
        ) {
          throw error;
        }
        latestCause = error;
        reconciliationFailureCount += 1;
        if (attempt === 1 || attempt % 20 === 0) {
          this.logger.warn(
            `强事务 COMMIT 幂等重放遇到瞬态数据库失败，继续持锁收敛 operationId=${input.operationId} attempt=${attempt}`,
          );
        }
        if (this.closing) {
          break;
        }
        await waitForDurableOperationReconciliation(250);
      }
    }
    this.registerUnresolvedCommitOutcome(input);
    throw new DurableOperationCommitOutcomeUnknownError(
      input.operationId,
      new AggregateError(
        latestCause === initialCause ? [initialCause] : [initialCause, latestCause],
        `durable_operation_reconciliation_stopped:failures=${reconciliationFailureCount}`,
      ),
    );
  }

  private async awaitStatusReadOrShutdown<TResult>(operation: Promise<TResult>): Promise<TResult> {
    return Promise.race([
      operation,
      this.shutdownSignal.promise.then(() => {
        throw new DurableOperationShutdownError();
      }),
    ]);
  }

  private releasePoolReference(): void {
    this.pool = null;
    this.enabled = false;
  }

  private async executeAssetMutation<TResult>(input: {
    operationId: string;
    playerId: string;
    expectedRuntimeOwnerId: string;
    expectedSessionEpoch: number;
    expectedInstanceId?: string | null;
    expectedAssignedNodeId?: string | null;
    expectedLeaseToken?: string | null;
    expectedOwnershipEpoch?: number | null;
    operationType: string;
    aggregateType: string;
    payload: unknown;
    onAlreadyCommitted: (client: import('pg').PoolClient, now: number) => Promise<TResult>;
    onMutate: (client: import('pg').PoolClient, now: number, runtimeOwnerId: string, sessionEpoch: number) => Promise<TResult>;
  }, commitOutcomeRetryRemaining = 1): Promise<TResult> {
    if (!this.pool || !this.enabled) {
      throw new Error('durable_operation_service_disabled');
    }

    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeDurableOperationId(input.operationId);
    if (!normalizedPlayerId || !normalizedOperationId) {
      throw new Error('invalid_execute_asset_mutation_input');
    }

    const now = Date.now();
    const client = await this.pool.connect();
    let clientReleased = false;
    let commitAttempted = false;
    let commitOutcomeUnknown = false;
    let commitOutcomeCause: unknown = null;
    let mutationResult: TResult | undefined;
    try {
      await client.query('BEGIN');
      await acquirePlayerAssetLock(client, normalizedPlayerId);

      const existingOperation = await client.query<{
        status?: string;
        operation_type?: string;
        aggregate_type?: string;
        player_id?: string;
        payload_jsonb?: unknown;
      }>(
        `
          SELECT status, operation_type, aggregate_type, player_id, payload_jsonb
          FROM ${DURABLE_OPERATION_LOG_TABLE}
          WHERE operation_id = $1
          FOR UPDATE
        `,
        [normalizedOperationId],
      );
      if (existingOperation.rowCount) {
        assertDurableOperationReplayIdentity(existingOperation.rows[0], {
          operationType: input.operationType,
          aggregateType: input.aggregateType,
          playerId: normalizedPlayerId,
          payload: input.payload,
        });
      }
      if (existingOperation.rowCount && existingOperation.rows[0]?.status === 'committed') {
        const committedResult = await input.onAlreadyCommitted(client, now);
        clientReleased = await rollbackTransactionOrDestroyClient(client);
        return committedResult;
      }

      const presence = await client.query<{
        runtime_owner_id?: string;
        session_epoch?: string | number;
      }>(
        `
          SELECT runtime_owner_id, session_epoch
          FROM ${PLAYER_PRESENCE_TABLE}
          WHERE player_id = $1
          FOR UPDATE
        `,
        [normalizedPlayerId],
      );
      await assertInstanceLeaseWritable(client, {
        expectedInstanceId: input.expectedInstanceId,
        expectedAssignedNodeId: input.expectedAssignedNodeId,
        expectedLeaseToken: input.expectedLeaseToken,
        expectedOwnershipEpoch: input.expectedOwnershipEpoch,
        currentNodeId: this.getCurrentNodeId(),
      });
      const presenceRow = presence.rows[0] ?? null;
      const persistedRuntimeOwnerId = normalizeRequiredString(presenceRow?.runtime_owner_id);
      const persistedSessionEpoch = Number(presenceRow?.session_epoch ?? 0);
      if (
        !persistedRuntimeOwnerId
        || persistedRuntimeOwnerId !== normalizeRequiredString(input.expectedRuntimeOwnerId)
        || !Number.isFinite(persistedSessionEpoch)
        || Math.trunc(persistedSessionEpoch) !== Math.max(1, Math.trunc(input.expectedSessionEpoch))
      ) {
        throw new Error(
          [
            'player_session_fencing_conflict',
            `expectedRuntimeOwnerId=${normalizeRequiredString(input.expectedRuntimeOwnerId) || 'null'}`,
            `expectedSessionEpoch=${Math.max(1, Math.trunc(input.expectedSessionEpoch))}`,
            `persistedRuntimeOwnerId=${persistedRuntimeOwnerId || 'null'}`,
            `persistedSessionEpoch=${Number.isFinite(persistedSessionEpoch) ? Math.trunc(persistedSessionEpoch) : 'null'}`,
          ].join(':'),
        );
      }

      if (existingOperation.rowCount === 0) {
        await client.query(
          `
            INSERT INTO ${DURABLE_OPERATION_LOG_TABLE}(
              operation_id,
              operation_type,
              aggregate_type,
              aggregate_id,
              player_id,
              runtime_owner_id,
              session_epoch,
              request_id,
              payload_jsonb,
              status,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, now())
          `,
          [
            normalizedOperationId,
            input.operationType,
            input.aggregateType,
            normalizedPlayerId,
            normalizedPlayerId,
            persistedRuntimeOwnerId,
            Math.trunc(persistedSessionEpoch),
            normalizedOperationId,
            JSON.stringify(input.payload ?? {}),
            'pending',
          ],
        );
      }

      mutationResult = await input.onMutate(client, now, persistedRuntimeOwnerId, Math.trunc(persistedSessionEpoch));

      await client.query(
        `
          UPDATE ${DURABLE_OPERATION_LOG_TABLE}
          SET
            status = 'committed',
            committed_at = now()
          WHERE operation_id = $1
        `,
        [normalizedOperationId],
      );

      commitAttempted = true;
      await client.query('COMMIT');
      commitAttempted = false;
      return mutationResult as TResult;
    } catch (error: unknown) {
      clientReleased = await disposeFailedDurableTransactionClient(client, {
        commitAttempted,
        shuttingDown: this.closing,
      }) || clientReleased;
      if (commitAttempted) {
        commitOutcomeUnknown = true;
        commitOutcomeCause = error;
      } else {
        throw error;
      }
    } finally {
      if (!clientReleased) {
        client.release();
      }
    }

    if (commitOutcomeUnknown) {
      if (commitOutcomeRetryRemaining < 0) {
        throw new DurableOperationCommitOutcomeUnknownError(normalizedOperationId, commitOutcomeCause);
      }
      return this.settleUnknownCommitOutcome({
        operationId: normalizedOperationId,
        cause: commitOutcomeCause,
        affectedPlayerIds: [normalizedPlayerId],
        affectedInstanceIds: [normalizeRequiredString(input.expectedInstanceId)].filter(Boolean),
        onSettled: (retryResult) => normalizeCurrentDurableInvocationResult(retryResult),
        retry: () => this.executeAssetMutation(input, -1),
      });
    }

    throw new Error(`durable_operation_unreachable_state:${normalizedOperationId}`);
  }

  private getCurrentNodeId(): string {
    return this.nodeRegistryService?.getNodeId?.() ?? resolveCurrentNodeId();
  }
}

async function rollbackTransactionOrDestroyClient(
  client: import('pg').PoolClient,
): Promise<boolean> {
  try {
    await client.query('ROLLBACK');
    return false;
  } catch {
    client.release(true);
    return true;
  }
}

/** COMMIT 已发送或服务正在关停时，不再向未决连接追加 ROLLBACK。 */
async function disposeFailedDurableTransactionClient(
  client: import('pg').PoolClient,
  input: { commitAttempted: boolean; shuttingDown: boolean },
): Promise<boolean> {
  if (input.commitAttempted || input.shuttingDown) {
    client.release(true);
    return true;
  }
  return rollbackTransactionOrDestroyClient(client);
}

async function acquirePlayerAssetLock(
  client: import('pg').PoolClient,
  playerId: string,
): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock($1::integer, hashtext($2))', [7101, playerId]);
}

export async function ensureDurableOperationTables(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await acquireSchemaInitLock(client);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${DURABLE_OPERATION_LOG_TABLE} (
        operation_id varchar(180) PRIMARY KEY,
        operation_type varchar(64) NOT NULL,
        aggregate_type varchar(64) NOT NULL,
        aggregate_id varchar(180) NOT NULL,
        player_id varchar(100) NOT NULL,
        runtime_owner_id varchar(120),
        session_epoch bigint,
        request_id varchar(180),
        payload_jsonb jsonb NOT NULL,
        status varchar(32) NOT NULL,
        error_code varchar(64),
        created_at timestamptz NOT NULL DEFAULT now(),
        committed_at timestamptz
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS durable_operation_log_player_idx
      ON ${DURABLE_OPERATION_LOG_TABLE}(player_id, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS durable_operation_log_status_idx
      ON ${DURABLE_OPERATION_LOG_TABLE}(status, created_at DESC)
    `);
    await client.query(`
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
    await client.query(`
      CREATE INDEX IF NOT EXISTS outbox_event_operation_idx
      ON ${OUTBOX_EVENT_TABLE}(operation_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS outbox_event_status_retry_idx
      ON ${OUTBOX_EVENT_TABLE}(status, next_retry_at, created_at)
    `);
    await client.query(`
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
    await client.query(`
      CREATE INDEX IF NOT EXISTS asset_audit_log_operation_idx
      ON ${ASSET_AUDIT_LOG_TABLE}(operation_id, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS asset_audit_log_player_idx
      ON ${ASSET_AUDIT_LOG_TABLE}(player_id, created_at DESC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${ASSET_AUDIT_LOG_ARCHIVE_TABLE} (
        log_id varchar(180) PRIMARY KEY,
        operation_id varchar(180) NOT NULL,
        player_id varchar(100) NOT NULL,
        asset_type varchar(64) NOT NULL,
        asset_ref_id varchar(180) NOT NULL,
        action varchar(64) NOT NULL,
        delta_jsonb jsonb NOT NULL,
        before_jsonb jsonb NOT NULL,
        after_jsonb jsonb NOT NULL,
        created_at timestamptz NOT NULL,
        archived_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await ensureVarcharColumnLength(client, ASSET_AUDIT_LOG_ARCHIVE_TABLE, 'operation_id', 180);
    await client.query(`
      CREATE INDEX IF NOT EXISTS asset_audit_log_archive_created_idx
      ON ${ASSET_AUDIT_LOG_ARCHIVE_TABLE}(created_at DESC, archived_at DESC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_MAIL_TABLE} (
        mail_id varchar(180) PRIMARY KEY,
        player_id varchar(100) NOT NULL,
        sender_type varchar(32) NOT NULL DEFAULT 'system',
        sender_label varchar(120) NOT NULL,
        template_id varchar(120),
        mail_type varchar(32) NOT NULL DEFAULT 'system',
        title varchar(240),
        body text,
        source_type varchar(64),
        source_ref_id varchar(180),
        metadata_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
        mail_version bigint NOT NULL DEFAULT 1,
        created_at bigint NOT NULL,
        expire_at bigint,
        first_seen_at bigint,
        read_at bigint,
        claimed_at bigint,
        deleted_at bigint,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_mail_player_idx
      ON ${PLAYER_MAIL_TABLE}(player_id, created_at DESC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_MAIL_ATTACHMENT_TABLE} (
        attachment_id varchar(180) PRIMARY KEY,
        mail_id varchar(180) NOT NULL,
        player_id varchar(100) NOT NULL,
        attachment_kind varchar(32) NOT NULL DEFAULT 'item',
        item_id varchar(120),
        count bigint,
        currency_type varchar(64),
        amount bigint,
        item_payload_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
        claim_operation_id varchar(180),
        claimed_at bigint,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_mail_attachment_mail_idx
      ON ${PLAYER_MAIL_ATTACHMENT_TABLE}(mail_id)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_MAIL_COUNTER_TABLE} (
        player_id varchar(100) PRIMARY KEY,
        unread_count bigint NOT NULL DEFAULT 0,
        unclaimed_count bigint NOT NULL DEFAULT 0,
        latest_mail_at bigint,
        counter_version bigint NOT NULL DEFAULT 0,
        welcome_mail_delivered_at bigint,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      ALTER TABLE ${PLAYER_MAIL_COUNTER_TABLE}
      ADD COLUMN IF NOT EXISTS welcome_mail_delivered_at bigint
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_INVENTORY_ITEM_TABLE} (
        item_instance_id varchar(180) PRIMARY KEY,
        player_id varchar(100) NOT NULL,
        slot_index bigint NOT NULL,
        item_id varchar(120) NOT NULL,
        count bigint NOT NULL,
        raw_payload jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(player_id, slot_index)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${MARKET_ORDER_TABLE} (
        order_id varchar(160) PRIMARY KEY,
        owner_id varchar(100) NOT NULL,
        side varchar(16) NOT NULL,
        status varchar(24) NOT NULL,
        item_key varchar(240) NOT NULL,
        item_id varchar(160) NOT NULL,
        remaining_quantity bigint NOT NULL DEFAULT 0,
        unit_price numeric(20, 2) NOT NULL DEFAULT 1,
        created_at_ms bigint NOT NULL,
        updated_at_ms bigint NOT NULL,
        raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS server_market_order_open_idx
      ON ${MARKET_ORDER_TABLE}(status, item_key, side, unit_price, created_at_ms)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS server_market_order_owner_idx
      ON ${MARKET_ORDER_TABLE}(owner_id, status, updated_at_ms DESC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${MARKET_TRADE_TABLE} (
        trade_id varchar(160) PRIMARY KEY,
        buyer_id varchar(100) NOT NULL,
        seller_id varchar(100) NOT NULL,
        item_id varchar(160) NOT NULL,
        quantity bigint NOT NULL DEFAULT 1,
        unit_price numeric(20, 2) NOT NULL DEFAULT 1,
        created_at_ms bigint NOT NULL,
        raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS server_market_trade_created_idx
      ON ${MARKET_TRADE_TABLE}(created_at_ms DESC, trade_id ASC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS server_market_trade_buyer_created_idx
      ON ${MARKET_TRADE_TABLE}(buyer_id, created_at_ms DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS server_market_trade_seller_created_idx
      ON ${MARKET_TRADE_TABLE}(seller_id, created_at_ms DESC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_MARKET_STORAGE_ITEM_TABLE} (
        storage_item_id varchar(180) PRIMARY KEY,
        player_id varchar(100) NOT NULL,
        slot_index bigint NOT NULL,
        item_id varchar(120) NOT NULL,
        count bigint NOT NULL DEFAULT 1,
        enhance_level bigint,
        raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_market_storage_item_player_idx
      ON ${PLAYER_MARKET_STORAGE_ITEM_TABLE}(player_id, slot_index ASC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_market_storage_item_item_idx
      ON ${PLAYER_MARKET_STORAGE_ITEM_TABLE}(item_id, player_id ASC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_EQUIPMENT_SLOT_TABLE} (
        player_id varchar(100) NOT NULL,
        slot_type varchar(32) NOT NULL,
        item_instance_id varchar(180) NOT NULL,
        item_id varchar(120) NOT NULL,
        raw_payload jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(player_id, slot_type),
        UNIQUE(item_instance_id)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_equipment_slot_player_idx
      ON ${PLAYER_EQUIPMENT_SLOT_TABLE}(player_id)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_ACTIVE_JOB_TABLE} (
        player_id varchar(100) PRIMARY KEY,
        job_run_id varchar(180) NOT NULL UNIQUE,
        job_type varchar(32) NOT NULL,
        status varchar(32) NOT NULL,
        phase varchar(64) NOT NULL,
        started_at bigint NOT NULL,
        finished_at bigint,
        paused_ticks bigint NOT NULL DEFAULT 0,
        total_ticks bigint NOT NULL DEFAULT 0,
        remaining_ticks bigint NOT NULL DEFAULT 0,
        success_rate double precision NOT NULL DEFAULT 0,
        speed_rate double precision NOT NULL DEFAULT 1,
        job_version bigint NOT NULL DEFAULT 1,
        detail_jsonb jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_active_job_job_idx
      ON ${PLAYER_ACTIVE_JOB_TABLE}(job_type, status ASC, player_id ASC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_TECHNIQUE_ACTIVITY_QUEUE_TABLE} (
        player_id varchar(100) NOT NULL,
        queue_id varchar(180) NOT NULL,
        kind varchar(32) NOT NULL,
        state varchar(32) NOT NULL,
        label varchar(160),
        target_label varchar(160),
        sleep_reason varchar(240),
        retry_after_ticks bigint,
        created_at bigint NOT NULL,
        queue_order bigint NOT NULL DEFAULT 0,
        payload_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
        cancel_ref_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
        detail_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(player_id, queue_id)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_technique_activity_queue_player_idx
      ON ${PLAYER_TECHNIQUE_ACTIVITY_QUEUE_TABLE}(player_id, queue_order ASC, created_at ASC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_ENHANCEMENT_RECORD_TABLE} (
        record_id varchar(180) PRIMARY KEY,
        player_id varchar(100) NOT NULL,
        item_id varchar(120) NOT NULL,
        highest_level bigint NOT NULL DEFAULT 0,
        levels_payload jsonb NOT NULL DEFAULT '[]'::jsonb,
        action_started_at bigint,
        action_ended_at bigint,
        start_level bigint,
        initial_target_level bigint,
        desired_target_level bigint,
        protection_start_level bigint,
        status varchar(32),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_enhancement_record_player_idx
      ON ${PLAYER_ENHANCEMENT_RECORD_TABLE}(player_id, item_id ASC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_PROFESSION_STATE_TABLE} (
        player_id varchar(100) NOT NULL,
        profession_type varchar(32) NOT NULL,
        level bigint NOT NULL DEFAULT 1,
        exp double precision,
        exp_to_next double precision,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(player_id, profession_type)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_PRESENCE_TABLE} (
        player_id varchar(100) PRIMARY KEY,
        online boolean NOT NULL DEFAULT false,
        in_world boolean NOT NULL DEFAULT false,
        last_heartbeat_at bigint,
        offline_since_at bigint,
        runtime_owner_id varchar(180),
        session_epoch bigint NOT NULL DEFAULT 1,
        transfer_state varchar(32),
        transfer_target_node_id varchar(120),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await ensurePlayerPresenceColumnsWithClient(client);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_RECOVERY_WATERMARK_TABLE} (
        player_id varchar(100) PRIMARY KEY,
        wallet_version bigint NOT NULL DEFAULT 0,
        inventory_version bigint NOT NULL DEFAULT 0,
        market_storage_version bigint NOT NULL DEFAULT 0,
        equipment_version bigint NOT NULL DEFAULT 0,
        artifact_version bigint NOT NULL DEFAULT 0,
        profession_version bigint NOT NULL DEFAULT 0,
        active_job_version bigint NOT NULL DEFAULT 0,
        enhancement_record_version bigint NOT NULL DEFAULT 0,
        mail_version bigint NOT NULL DEFAULT 0,
        mail_counter_version bigint NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      ALTER TABLE ${PLAYER_RECOVERY_WATERMARK_TABLE}
      ADD COLUMN IF NOT EXISTS wallet_version bigint NOT NULL DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE ${PLAYER_RECOVERY_WATERMARK_TABLE}
      ADD COLUMN IF NOT EXISTS market_storage_version bigint NOT NULL DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE ${PLAYER_RECOVERY_WATERMARK_TABLE}
      ADD COLUMN IF NOT EXISTS equipment_version bigint NOT NULL DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE ${PLAYER_RECOVERY_WATERMARK_TABLE}
      ADD COLUMN IF NOT EXISTS artifact_version bigint NOT NULL DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE ${PLAYER_RECOVERY_WATERMARK_TABLE}
      ADD COLUMN IF NOT EXISTS profession_version bigint NOT NULL DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE ${PLAYER_RECOVERY_WATERMARK_TABLE}
      ADD COLUMN IF NOT EXISTS active_job_version bigint NOT NULL DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE ${PLAYER_RECOVERY_WATERMARK_TABLE}
      ADD COLUMN IF NOT EXISTS enhancement_record_version bigint NOT NULL DEFAULT 0
    `);
    await ensureDurableOperationBigintColumnsWithClient(client);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function ensureDurableOperationBigintColumnsWithClient(client: import('pg').PoolClient): Promise<void> {
  await ensureBigintColumnsWithClient(client, DURABLE_OPERATION_BIGINT_COLUMNS_BY_TABLE);
}

async function ensureVarcharColumnLength(
  queryable: { query: (sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }> },
  tableName: string,
  columnName: string,
  minLength: number,
): Promise<void> {
  assertSafeIdentifier(tableName);
  assertSafeIdentifier(columnName);
  const result = await queryable.query(
    `
      SELECT data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
    `,
    [tableName, columnName],
  );
  const row = Array.isArray(result.rows) ? (result.rows[0] as Record<string, unknown> | undefined) : undefined;
  if (!row || row.data_type === 'text' || row.data_type !== 'character varying') {
    return;
  }
  const currentLength = Number(row.character_maximum_length ?? 0);
  if (Number.isFinite(currentLength) && currentLength >= minLength) {
    return;
  }
  await queryable.query(
    `ALTER TABLE ${quoteIdentifier(tableName)} ALTER COLUMN ${quoteIdentifier(columnName)} TYPE varchar(${minLength})`,
  );
}

function assertSafeIdentifier(identifier: string): void {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`unsafe_sql_identifier:${identifier}`);
  }
}

function quoteIdentifier(identifier: string): string {
  assertSafeIdentifier(identifier);
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function ensurePlayerPresenceColumnsWithClient(client: import('pg').PoolClient): Promise<void> {
  await client.query(`
    ALTER TABLE ${PLAYER_PRESENCE_TABLE}
    ADD COLUMN IF NOT EXISTS online boolean NOT NULL DEFAULT false
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_PRESENCE_TABLE}
    ADD COLUMN IF NOT EXISTS in_world boolean NOT NULL DEFAULT false
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_PRESENCE_TABLE}
    ADD COLUMN IF NOT EXISTS last_heartbeat_at bigint
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_PRESENCE_TABLE}
    ADD COLUMN IF NOT EXISTS offline_since_at bigint
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_PRESENCE_TABLE}
    ADD COLUMN IF NOT EXISTS runtime_owner_id varchar(180)
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_PRESENCE_TABLE}
    ALTER COLUMN runtime_owner_id TYPE varchar(180)
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_PRESENCE_TABLE}
    ADD COLUMN IF NOT EXISTS session_epoch bigint NOT NULL DEFAULT 1
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_PRESENCE_TABLE}
    ADD COLUMN IF NOT EXISTS transfer_state varchar(32)
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_PRESENCE_TABLE}
    ADD COLUMN IF NOT EXISTS transfer_target_node_id varchar(120)
  `);
  await client.query(`
    ALTER TABLE ${PLAYER_PRESENCE_TABLE}
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
  `);
}

interface DurableReplaceOptions {
  allowEmptyOverwrite?: boolean;
  replaceLockedItems?: boolean;
}

function safeStringifyDurableEntry(value: unknown): string {
  const maxLength = 240;
  let serialized = '';
  try {
    serialized = JSON.stringify(value);
  } catch {
    serialized = '[unserializable]';
  }
  if (!serialized) {
    return '[empty]';
  }
  return serialized.length > maxLength ? `${serialized.slice(0, maxLength)}...` : serialized;
}

function isSameDurablePayload(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return stableJsonStringify(left) === stableJsonStringify(right);
}

function stableJsonStringify(value: unknown): string {
  if (value == null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJsonStringify(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries: string[] = [];
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      if (typeof entry === 'undefined' || typeof entry === 'function' || typeof entry === 'symbol') {
        continue;
      }
      entries.push(`${JSON.stringify(key)}:${stableJsonStringify(entry)}`);
    }
    return `{${entries.join(',')}}`;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  return 'null';
}

async function refuseEmptyOverwriteIfRowsExist(
  client: import('pg').PoolClient,
  tableName: string,
  playerId: string,
  incomingCount: number,
  domainTag: string,
  options: DurableReplaceOptions = {},
): Promise<void> {
  if (incomingCount > 0 || options.allowEmptyOverwrite === true) {
    return;
  }
  const result = await client.query(
    `SELECT 1 AS exists FROM ${tableName} WHERE player_id = $1 LIMIT 1`,
    [playerId],
  );
  if ((result.rowCount ?? 0) > 0) {
    throw new Error(`replace_${domainTag}_refused_empty_overwrite:playerId=${playerId} table=${tableName}`);
  }
}

async function assertNoForeignPlayerOwnedIds(
  client: import('pg').PoolClient,
  tableName: string,
  idColumnName: string,
  playerId: string,
  ids: readonly string[],
  domainTag: string,
): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  assertSafeIdentifier(tableName);
  assertSafeIdentifier(idColumnName);
  const result = await client.query<{ conflicting_id?: unknown; owner_id?: unknown }>(
    `
      SELECT ${quoteIdentifier(idColumnName)} AS conflicting_id, player_id AS owner_id
      FROM ${quoteIdentifier(tableName)}
      WHERE ${quoteIdentifier(idColumnName)} = ANY($2::varchar[])
        AND player_id <> $1
      LIMIT 1
      FOR UPDATE
    `,
    [playerId, ids],
  );
  if ((result.rowCount ?? 0) > 0) {
    throw new Error(
      `replace_${domainTag}_ownership_conflict:playerId=${playerId}`
      + ` id=${normalizeRequiredString(result.rows[0]?.conflicting_id) || 'unknown'}`
      + ` owner=${normalizeRequiredString(result.rows[0]?.owner_id) || 'unknown'}`,
    );
  }
}

async function replacePlayerInventoryItems(
  client: import('pg').PoolClient,
  playerId: string,
  items: DurableInventoryItemSnapshot[],
  options: DurableReplaceOptions = {},
): Promise<void> {
  const sourceItems = Array.isArray(items) ? items : [];
  const rowsByInstanceId = new Map<string, {
    item_instance_id: string;
    slot_index: number;
    item_id: string;
    count: number;
    raw_payload: Record<string, unknown>;
    locked_by: string | null;
  }>();
  let lockedSlotCounter = -1;
  for (let index = 0; index < sourceItems.length; index += 1) {
    const item = sourceItems[index];
    const itemId = normalizeRequiredString(item?.itemId);
    if (!itemId) {
      throw new Error(
        `replacePlayerInventoryItems: invalid inventory entry playerId=${playerId} index=${index} entry=${safeStringifyDurableEntry(item)}`,
      );
    }
    const count = Math.max(1, Math.trunc(Number(item.count ?? 1)));
    const lockedBy = normalizeOptionalString(item?.lockedBy);
    const rawPayload = buildPersistedInventoryItemRawPayload({
      itemId,
      count,
      name: item.name,
      desc: item.desc,
      enhanceLevel: item.enhanceLevel,
      learnTechniqueId: item.learnTechniqueId,
      learnTechniqueMaxLevel: item.learnTechniqueMaxLevel,
      grade: item.grade,
      level: item.level,
      rawPayload: item.rawPayload,
    });
    if (lockedBy != null) {
      const lockedAt = normalizeOptionalInteger(item?.lockedAt)
        ?? normalizeOptionalInteger((item?.rawPayload as { lockedAt?: unknown } | null | undefined)?.lockedAt);
      if (lockedAt != null) {
        rawPayload.lockedAt = lockedAt;
      }
    }
    // 优先取 sourceItem 自带的稳定 instanceId（装备类必须有；非装备类回退到 inv:{playerId}:{index}
    // 让 PG 主键稳定，行为与持久化层保持一致）。
    const sourceItemInstanceId = normalizeRequiredString(item?.itemInstanceId)
      || normalizeRequiredString((item?.rawPayload as { itemInstanceId?: unknown })?.itemInstanceId);
    const itemInstanceId = sourceItemInstanceId && !isLegacyItemInstanceId(sourceItemInstanceId)
      ? sourceItemInstanceId
      : `inv:${playerId}:${index}`;
    if (sourceItemInstanceId && isLegacyItemInstanceId(sourceItemInstanceId)) {
      durableModuleLogger.warn(`durable 背包物品携带 legacy itemInstanceId，走 fallback：playerId=${playerId} index=${index} id=${sourceItemInstanceId}`);
    }
    const row = {
      item_instance_id: itemInstanceId,
      slot_index: lockedBy != null ? lockedSlotCounter-- : index,
      item_id: itemId,
      count,
      raw_payload: rawPayload,
      locked_by: lockedBy,
    };
    const rowSignature = createPersistedInventoryRowSignature(itemId, rawPayload);
    const existingRow = rowsByInstanceId.get(itemInstanceId);
    const existingRowSignature = existingRow
      ? createPersistedInventoryRowSignature(existingRow.item_id, existingRow.raw_payload)
      : null;
    if (existingRow) {
      if (existingRowSignature === rowSignature) {
        existingRow.count += count;
        continue;
      }
      if (
        existingRow.slot_index !== row.slot_index
        || existingRow.item_id !== itemId
        || existingRow.locked_by !== lockedBy
        || existingRowSignature !== rowSignature
      ) {
        throw new Error(
          `replacePlayerInventoryItems: duplicate item_instance_id with conflicting payload playerId=${playerId} itemInstanceId=${itemInstanceId} existingSlot=${existingRow.slot_index} incomingSlot=${index} existingItemId=${existingRow.item_id} incomingItemId=${itemId}`,
        );
      }
      existingRow.count += count;
      continue;
    }
    rowsByInstanceId.set(itemInstanceId, row);
  }
  const rows = Array.from(rowsByInstanceId.values());
  const rowsJson = JSON.stringify(rows);

  if (rows.length > 0) {
    const itemInstanceIds = rows.map(({ item_instance_id }) => item_instance_id);
    await assertNoForeignPlayerOwnedIds(
      client,
      PLAYER_INVENTORY_ITEM_TABLE,
      'item_instance_id',
      playerId,
      itemInstanceIds,
      'inventory',
    );
    await client.query(
      `
        WITH incoming AS (
          SELECT item_instance_id, slot_index
          FROM jsonb_to_recordset($2::jsonb) AS entry(item_instance_id varchar(180), slot_index bigint)
        )
        DELETE FROM ${PLAYER_INVENTORY_ITEM_TABLE} target
        WHERE target.player_id = $1
          AND EXISTS (
            SELECT 1
            FROM incoming
            WHERE incoming.slot_index = target.slot_index
              AND incoming.item_instance_id <> target.item_instance_id
          )
      `,
      [playerId, rowsJson],
    );
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            item_instance_id varchar(180),
            slot_index bigint,
            item_id varchar(120),
            count bigint,
            raw_payload jsonb,
            locked_by varchar(180)
          )
        )
        INSERT INTO ${PLAYER_INVENTORY_ITEM_TABLE}(
          item_instance_id,
          player_id,
          slot_index,
          item_id,
          count,
          raw_payload,
          locked_by,
          updated_at
        )
        SELECT item_instance_id, $1, slot_index, item_id, count, COALESCE(raw_payload, '{}'::jsonb), locked_by, now()
        FROM incoming
        ON CONFLICT (item_instance_id)
        DO UPDATE SET
          player_id = EXCLUDED.player_id,
          slot_index = EXCLUDED.slot_index,
          item_id = EXCLUDED.item_id,
          count = EXCLUDED.count,
          raw_payload = EXCLUDED.raw_payload,
          locked_by = EXCLUDED.locked_by,
          updated_at = now()
        WHERE ${PLAYER_INVENTORY_ITEM_TABLE}.player_id = EXCLUDED.player_id
          AND ROW(
            ${PLAYER_INVENTORY_ITEM_TABLE}.slot_index,
            ${PLAYER_INVENTORY_ITEM_TABLE}.item_id,
            ${PLAYER_INVENTORY_ITEM_TABLE}.count,
            ${PLAYER_INVENTORY_ITEM_TABLE}.raw_payload,
            ${PLAYER_INVENTORY_ITEM_TABLE}.locked_by
          ) IS DISTINCT FROM ROW(
            EXCLUDED.slot_index,
            EXCLUDED.item_id,
            EXCLUDED.count,
            EXCLUDED.raw_payload,
            EXCLUDED.locked_by
          )
      `,
      [playerId, rowsJson],
    );
    // ON CONFLICT 的 owner guard 会拒绝跨玩家更新；提交前再次读取可覆盖并发插入竞态。
    await assertNoForeignPlayerOwnedIds(
      client,
      PLAYER_INVENTORY_ITEM_TABLE,
      'item_instance_id',
      playerId,
      itemInstanceIds,
      'inventory',
    );
  }
  await refuseEmptyOverwriteIfRowsExist(client, PLAYER_INVENTORY_ITEM_TABLE, playerId, rows.length, 'inventory', options);
  await client.query(
    `
      WITH incoming AS (
        SELECT item_instance_id
        FROM jsonb_to_recordset($2::jsonb) AS entry(item_instance_id varchar(180))
      )
      DELETE FROM ${PLAYER_INVENTORY_ITEM_TABLE} target
      WHERE target.player_id = $1
        ${options.replaceLockedItems === true ? '' : 'AND target.locked_by IS NULL'}
        AND NOT EXISTS (
          SELECT 1
          FROM incoming
          WHERE incoming.item_instance_id = target.item_instance_id
        )
    `,
    [playerId, rowsJson],
  );
}

function createPersistedInventoryRowSignature(itemId: string, rawPayload: Record<string, unknown>): string {
  return createItemStackSignature({
    itemId,
    ...rawPayload,
  });
}

async function replacePlayerMarketStorageItems(
  client: import('pg').PoolClient,
  playerId: string,
  items: readonly DurableMarketStorageItemSnapshot[],
  options: DurableReplaceOptions = {},
): Promise<void> {
  type MarketStoragePersistenceRow = {
    storage_item_id: string;
    slot_index: number;
    item_id: string;
    count: number;
    enhance_level: number | null;
    raw_payload: Record<string, unknown>;
  };
  const rowsByStorageItemId = new Map<string, MarketStoragePersistenceRow>();
  const rowsBySlotIndex = new Map<number, MarketStoragePersistenceRow>();
  for (let index = 0; index < (Array.isArray(items) ? items.length : 0); index += 1) {
    const entry = items[index];
    const itemId = normalizeRequiredString(entry?.itemId);
    if (!itemId) {
      throw new Error(
        `replacePlayerMarketStorageItems: invalid market storage entry playerId=${playerId} index=${index} entry=${safeStringifyDurableEntry(entry)}`,
      );
    }
    const slotIndex = normalizeOptionalInteger(entry?.slotIndex) ?? index;
    if (slotIndex < 0) {
      throw new Error(`replacePlayerMarketStorageItems: invalid slot_index playerId=${playerId} slotIndex=${slotIndex}`);
    }
    const storageItemId = `market_storage:${playerId}:${slotIndex}`;
    const count = Math.max(1, Math.trunc(Number(entry?.count ?? 1)));
    const enhanceLevel = normalizeOptionalInteger(entry?.enhanceLevel);
    const rawPayload =
      entry?.rawPayload && typeof entry.rawPayload === 'object'
        ? entry.rawPayload
        : {
        itemId,
        count,
        ...(enhanceLevel == null ? {} : { enhanceLevel }),
      };
    const row = {
      storage_item_id: storageItemId,
      slot_index: slotIndex,
      item_id: itemId,
      count,
      enhance_level: enhanceLevel,
      raw_payload: {
        ...(rawPayload as Record<string, unknown>),
        itemId,
        count,
        ...(enhanceLevel == null ? {} : { enhanceLevel }),
      },
    };
    const existingSlotRow = rowsBySlotIndex.get(slotIndex);
    if (existingSlotRow) {
      if (
        existingSlotRow.storage_item_id !== storageItemId
        || existingSlotRow.item_id !== itemId
        || existingSlotRow.count !== count
        || existingSlotRow.enhance_level !== enhanceLevel
        || !isSameDurablePayload(existingSlotRow.raw_payload, row.raw_payload)
      ) {
        throw new Error(
          `replacePlayerMarketStorageItems: duplicate slot_index with conflicting payload playerId=${playerId} slotIndex=${slotIndex}`,
        );
      }
      continue;
    }
    const existingStorageRow = rowsByStorageItemId.get(storageItemId);
    if (existingStorageRow) {
      throw new Error(
        `replacePlayerMarketStorageItems: duplicate storage_item_id with conflicting slot playerId=${playerId} storageItemId=${storageItemId} slots=${existingStorageRow.slot_index},${slotIndex}`,
      );
    }
    rowsBySlotIndex.set(slotIndex, row);
    rowsByStorageItemId.set(storageItemId, row);
  }
  const rows = Array.from(rowsBySlotIndex.values());
  const rowsJson = JSON.stringify(rows);

  if (rows.length > 0) {
    const result = await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            storage_item_id varchar(180),
            slot_index bigint,
            item_id varchar(120),
            count bigint,
            enhance_level bigint,
            raw_payload jsonb
          )
        )
        INSERT INTO ${PLAYER_MARKET_STORAGE_ITEM_TABLE}(
          storage_item_id,
          player_id,
          slot_index,
          item_id,
          count,
          enhance_level,
          raw_payload,
          updated_at
        )
        SELECT storage_item_id, $1, slot_index, item_id, count, enhance_level, COALESCE(raw_payload, '{}'::jsonb), now()
        FROM incoming
        ON CONFLICT (storage_item_id)
        DO UPDATE SET
          player_id = EXCLUDED.player_id,
          slot_index = EXCLUDED.slot_index,
          item_id = EXCLUDED.item_id,
          count = EXCLUDED.count,
          enhance_level = EXCLUDED.enhance_level,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = now()
        WHERE ${PLAYER_MARKET_STORAGE_ITEM_TABLE}.player_id = EXCLUDED.player_id
      `,
      [playerId, rowsJson],
    );
    if (((result as { rowCount?: number }).rowCount ?? 0) !== rows.length) {
      throw new Error(`replacePlayerMarketStorageItems: storage_item_id conflict outside player scope playerId=${playerId}`);
    }
  }
  await refuseEmptyOverwriteIfRowsExist(client, PLAYER_MARKET_STORAGE_ITEM_TABLE, playerId, rows.length, 'market_storage', options);
  await client.query(
    `
      WITH incoming AS (
        SELECT slot_index
        FROM jsonb_to_recordset($2::jsonb) AS entry(slot_index bigint)
      )
      DELETE FROM ${PLAYER_MARKET_STORAGE_ITEM_TABLE} target
      WHERE target.player_id = $1
        AND NOT EXISTS (
          SELECT 1
          FROM incoming
          WHERE incoming.slot_index = target.slot_index
        )
    `,
    [playerId, rowsJson],
  );
}

async function replacePlayerEquipmentSlots(
  client: import('pg').PoolClient,
  playerId: string,
  slots: readonly DurableEquipmentSlotSnapshot[],
  options: DurableReplaceOptions = {},
): Promise<void> {
  const rowsBySlotType = new Map<string, EquipmentSlotPersistenceRow>();
  const rowsByInstanceId = new Map<string, EquipmentSlotPersistenceRow>();
  const rowSources = new Map<EquipmentSlotPersistenceRow, ItemInstanceIdPersistenceRowSource>();
  for (const slotEntry of Array.isArray(slots) ? slots : []) {
    const slotType = normalizeRequiredString(slotEntry?.slot);
    if (!EQUIP_SLOTS.includes(slotType as (typeof EQUIP_SLOTS)[number])) {
      throw new Error(
        `replacePlayerEquipmentSlots: invalid equipment slot playerId=${playerId} slot=${slotType || 'null'} entry=${safeStringifyDurableEntry(slotEntry)}`,
      );
    }
    const item = slotEntry?.item && typeof slotEntry.item === 'object'
      ? slotEntry.item as Record<string, unknown>
      : null;
    if (!item) {
      continue;
    }
    const itemId = normalizeRequiredString(item?.itemId);
    if (!itemId) {
      throw new Error(
        `replacePlayerEquipmentSlots: invalid equipment item playerId=${playerId} slot=${slotType} entry=${safeStringifyDurableEntry(slotEntry)}`,
      );
    }
    const itemInstanceId = assignStableItemInstanceId(
      normalizeOptionalString((slotEntry as Record<string, unknown> | null)?.itemInstanceId) || normalizeOptionalString(item?.itemInstanceId),
      {
        entry: slotEntry && typeof slotEntry === 'object' ? slotEntry as Record<string, unknown> : null,
        item,
      },
    );
    const rawPayload = buildPersistedEquipmentItemRawPayload({
      itemId,
      slot: slotType,
      enhanceLevel: item?.enhanceLevel,
      rawPayload: item,
    });
    const row = {
      slot_type: slotType,
      item_instance_id: itemInstanceId,
      item_id: itemId,
      raw_payload: rawPayload,
    };
    const existingSlotRow = rowsBySlotType.get(slotType);
    if (existingSlotRow) {
      if (
        existingSlotRow.item_instance_id !== itemInstanceId
        || existingSlotRow.item_id !== itemId
        || !isSameDurablePayload(existingSlotRow.raw_payload, rawPayload)
      ) {
        throw new Error(
          `replacePlayerEquipmentSlots: duplicate slot with conflicting payload playerId=${playerId} slot=${slotType}`,
        );
      }
      continue;
    }
    const existingInstanceRow = rowsByInstanceId.get(itemInstanceId);
    if (existingInstanceRow) {
      throw new Error(
        `replacePlayerEquipmentSlots: duplicate item_instance_id with conflicting slot playerId=${playerId} itemInstanceId=${itemInstanceId} slots=${existingInstanceRow.slot_type},${slotType}`,
      );
    }
    rowsBySlotType.set(slotType, row);
    rowsByInstanceId.set(itemInstanceId, row);
    rowSources.set(row, {
      entry: slotEntry && typeof slotEntry === 'object' ? slotEntry as Record<string, unknown> : null,
      item,
    });
  }
  const rows = Array.from(rowsBySlotType.values());

  if (rows.length === 0) {
    return;
  }

  const persistedRows = await client.query<{
    slot_type?: unknown;
    item_instance_id?: unknown;
    item_id?: unknown;
    raw_payload?: unknown;
  }>(
    `
      SELECT slot_type, item_instance_id, item_id, raw_payload
      FROM ${PLAYER_EQUIPMENT_SLOT_TABLE}
      WHERE player_id = $1
      FOR UPDATE
    `,
    [playerId],
  );
  const persistedBySlot = new Map(
    persistedRows.rows.map((persisted) => [normalizeRequiredString(persisted.slot_type), persisted]),
  );
  const changedRows = rows.filter((row) => {
    const persisted = persistedBySlot.get(row.slot_type);
    const persistedPayload = persisted?.raw_payload && typeof persisted.raw_payload === 'object'
      ? persisted.raw_payload as Record<string, unknown>
      : {};
    return !persisted
      || normalizeRequiredString(persisted.item_instance_id) !== row.item_instance_id
      || normalizeRequiredString(persisted.item_id) !== row.item_id
      || !isSameDurablePayload(persistedPayload, row.raw_payload);
  });
  if (changedRows.length > 0) {
    const changedRowSources = new Map<EquipmentSlotPersistenceRow, ItemInstanceIdPersistenceRowSource>();
    for (const row of changedRows) {
      const source = rowSources.get(row);
      if (source) {
        changedRowSources.set(row, source);
      }
    }
    await upsertEquipmentSlotRowsWithItemInstanceIdRepair(client, playerId, changedRows, changedRowSources);
  }
  await refuseEmptyOverwriteIfRowsExist(client, PLAYER_EQUIPMENT_SLOT_TABLE, playerId, rows.length, 'equipment', options);
  await client.query(
    `
      WITH incoming AS (
        SELECT slot_type
        FROM jsonb_to_recordset($2::jsonb) AS entry(slot_type varchar(40))
      )
      DELETE FROM ${PLAYER_EQUIPMENT_SLOT_TABLE} target
      WHERE target.player_id = $1
        AND NOT EXISTS (
          SELECT 1
          FROM incoming
          WHERE incoming.slot_type = target.slot_type
        )
    `,
    [playerId, JSON.stringify(rows.map(({ slot_type }) => ({ slot_type })))],
  );
}

async function assertPlayerTechniqueActivityQueueHead(
  client: import('pg').PoolClient,
  playerId: string,
  expectedQueueHeadId: string,
): Promise<void> {
  const result = await client.query<{ queue_id?: unknown }>(
    `
      SELECT queue_id
      FROM ${PLAYER_TECHNIQUE_ACTIVITY_QUEUE_TABLE}
      WHERE player_id = $1
      ORDER BY queue_order ASC, created_at ASC, queue_id ASC
      LIMIT 1
      FOR UPDATE
    `,
    [playerId],
  );
  const persistedQueueHeadId = normalizeRequiredString(result.rows[0]?.queue_id);
  if (persistedQueueHeadId !== expectedQueueHeadId) {
    throw new Error(
      [
        'player_technique_activity_queue_cas_conflict',
        `expectedQueueHeadId=${expectedQueueHeadId}`,
        `persistedQueueHeadId=${persistedQueueHeadId || 'null'}`,
      ].join(':'),
    );
  }
}

async function replacePlayerTechniqueActivityQueue(
  client: import('pg').PoolClient,
  playerId: string,
  rows: readonly PlayerTechniqueActivityQueueUpsertInput[],
): Promise<void> {
  const normalizedRows = normalizeTechniqueActivityQueueSnapshots(rows).map((row, index) => ({
    queue_id: row.queueId,
    kind: row.kind,
    state: row.state,
    label: row.label,
    target_label: row.targetLabel,
    sleep_reason: row.sleepReason,
    retry_after_ticks: row.retryAfterTicks,
    created_at: row.createdAt,
    queue_order: index,
    payload_jsonb: row.payloadJson,
    cancel_ref_jsonb: row.cancelRefJson,
    detail_jsonb: row.detailJson,
  }));

  if (normalizedRows.length > 0) {
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            queue_id varchar(180),
            kind varchar(32),
            state varchar(32),
            label varchar(160),
            target_label varchar(160),
            sleep_reason varchar(240),
            retry_after_ticks bigint,
            created_at bigint,
            queue_order bigint,
            payload_jsonb jsonb,
            cancel_ref_jsonb jsonb,
            detail_jsonb jsonb
          )
        )
        INSERT INTO ${PLAYER_TECHNIQUE_ACTIVITY_QUEUE_TABLE}(
          player_id,
          queue_id,
          kind,
          state,
          label,
          target_label,
          sleep_reason,
          retry_after_ticks,
          created_at,
          queue_order,
          payload_jsonb,
          cancel_ref_jsonb,
          detail_jsonb,
          updated_at
        )
        SELECT
          $1,
          queue_id,
          kind,
          state,
          label,
          target_label,
          sleep_reason,
          retry_after_ticks,
          created_at,
          queue_order,
          COALESCE(payload_jsonb, '{}'::jsonb),
          COALESCE(cancel_ref_jsonb, '{}'::jsonb),
          COALESCE(detail_jsonb, '{}'::jsonb),
          now()
        FROM incoming
        ON CONFLICT (player_id, queue_id)
        DO UPDATE SET
          kind = EXCLUDED.kind,
          state = EXCLUDED.state,
          label = EXCLUDED.label,
          target_label = EXCLUDED.target_label,
          sleep_reason = EXCLUDED.sleep_reason,
          retry_after_ticks = EXCLUDED.retry_after_ticks,
          created_at = EXCLUDED.created_at,
          queue_order = EXCLUDED.queue_order,
          payload_jsonb = EXCLUDED.payload_jsonb,
          cancel_ref_jsonb = EXCLUDED.cancel_ref_jsonb,
          detail_jsonb = EXCLUDED.detail_jsonb,
          updated_at = now()
      `,
      [playerId, JSON.stringify(normalizedRows)],
    );
  }

  await client.query(
    `
      WITH incoming AS (
        SELECT queue_id
        FROM jsonb_to_recordset($2::jsonb) AS entry(queue_id varchar(180))
      )
      DELETE FROM ${PLAYER_TECHNIQUE_ACTIVITY_QUEUE_TABLE} target
      WHERE target.player_id = $1
        AND NOT EXISTS (
          SELECT 1
          FROM incoming
          WHERE incoming.queue_id = target.queue_id
        )
    `,
    [playerId, JSON.stringify(normalizedRows.map(({ queue_id }) => ({ queue_id })))],
  );
}

async function replacePlayerActiveJob(
  client: import('pg').PoolClient,
  playerId: string,
  row: DurableActiveJobSnapshot | null,
): Promise<void> {
  if (!row) {
    await client.query(`DELETE FROM ${PLAYER_ACTIVE_JOB_TABLE} WHERE player_id = $1`, [playerId]);
    return;
  }

  await client.query(
    `
      INSERT INTO ${PLAYER_ACTIVE_JOB_TABLE}(
        player_id,
        job_run_id,
        job_type,
        status,
        phase,
        started_at,
        finished_at,
        paused_ticks,
        total_ticks,
        remaining_ticks,
        success_rate,
        speed_rate,
        job_version,
        detail_jsonb,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        job_run_id = EXCLUDED.job_run_id,
        job_type = EXCLUDED.job_type,
        status = EXCLUDED.status,
        phase = EXCLUDED.phase,
        started_at = EXCLUDED.started_at,
        finished_at = EXCLUDED.finished_at,
        paused_ticks = EXCLUDED.paused_ticks,
        total_ticks = EXCLUDED.total_ticks,
        remaining_ticks = EXCLUDED.remaining_ticks,
        success_rate = EXCLUDED.success_rate,
        speed_rate = EXCLUDED.speed_rate,
        job_version = EXCLUDED.job_version,
        detail_jsonb = EXCLUDED.detail_jsonb,
        updated_at = now()
    `,
    [
      playerId,
      row.jobRunId,
      row.jobType,
      row.status,
      row.phase,
      row.startedAt,
      row.finishedAt ?? null,
      row.pausedTicks ?? 0,
      row.totalTicks ?? 0,
      row.remainingTicks ?? 0,
      row.successRate ?? 0,
      row.speedRate ?? 1,
      row.jobVersion,
      JSON.stringify(row.detailJson ?? {
        jobRunId: row.jobRunId,
        jobVersion: row.jobVersion,
        jobType: row.jobType,
        status: row.status,
        phase: row.phase,
      }),
    ],
  );
}

async function replacePlayerEnhancementRecords(
  client: import('pg').PoolClient,
  playerId: string,
  rows: readonly DurableEnhancementRecordSnapshot[],
): Promise<void> {
  const normalizedRows: Array<{
    record_id: string;
    item_id: string;
    highest_level: number;
    levels_payload: unknown[];
    action_started_at: number | null;
    action_ended_at: number | null;
    start_level: number | null;
    initial_target_level: number | null;
    desired_target_level: number | null;
    protection_start_level: number | null;
    status: string | null;
  }> = [];
  for (let index = 0; index < (Array.isArray(rows) ? rows.length : 0); index += 1) {
    const row = rows[index];
    const itemId = normalizeRequiredString(row?.itemId);
    if (!itemId) {
      continue;
    }
    const recordId =
      normalizeRequiredString(row?.recordId)
      || `enhancement_record:${playerId}:${itemId}:${index}`;
    normalizedRows.push({
      record_id: recordId,
      item_id: itemId,
      highest_level: Math.max(0, Math.trunc(Number(row?.highestLevel ?? 0))),
      levels_payload: Array.isArray(row?.levels) ? row.levels : [],
      action_started_at: normalizeOptionalInteger(row?.actionStartedAt),
      action_ended_at: normalizeOptionalInteger(row?.actionEndedAt),
      start_level: normalizeOptionalInteger(row?.startLevel),
      initial_target_level: normalizeOptionalInteger(row?.initialTargetLevel),
      desired_target_level: normalizeOptionalInteger(row?.desiredTargetLevel),
      protection_start_level: normalizeOptionalInteger(row?.protectionStartLevel),
      status: normalizeOptionalString(row?.status),
    });
  }

  if (normalizedRows.length > 0) {
    const recordIds = normalizedRows.map(({ record_id }) => record_id);
    await assertNoForeignPlayerOwnedIds(
      client,
      PLAYER_ENHANCEMENT_RECORD_TABLE,
      'record_id',
      playerId,
      recordIds,
      'enhancement_record',
    );
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            record_id varchar(180),
            item_id varchar(160),
            highest_level bigint,
            levels_payload jsonb,
            action_started_at bigint,
            action_ended_at bigint,
            start_level bigint,
            initial_target_level bigint,
            desired_target_level bigint,
            protection_start_level bigint,
            status varchar(40)
          )
        )
        INSERT INTO ${PLAYER_ENHANCEMENT_RECORD_TABLE}(
          record_id,
          player_id,
          item_id,
          highest_level,
          levels_payload,
          action_started_at,
          action_ended_at,
          start_level,
          initial_target_level,
          desired_target_level,
          protection_start_level,
          status,
          updated_at
        )
        SELECT record_id, $1, item_id, highest_level, COALESCE(levels_payload, '[]'::jsonb),
          action_started_at, action_ended_at, start_level, initial_target_level,
          desired_target_level, protection_start_level, status, now()
        FROM incoming
        ON CONFLICT (record_id)
        DO UPDATE SET
          player_id = EXCLUDED.player_id,
          item_id = EXCLUDED.item_id,
          highest_level = EXCLUDED.highest_level,
          levels_payload = EXCLUDED.levels_payload,
          action_started_at = EXCLUDED.action_started_at,
          action_ended_at = EXCLUDED.action_ended_at,
          start_level = EXCLUDED.start_level,
          initial_target_level = EXCLUDED.initial_target_level,
          desired_target_level = EXCLUDED.desired_target_level,
          protection_start_level = EXCLUDED.protection_start_level,
          status = EXCLUDED.status,
          updated_at = now()
        WHERE ${PLAYER_ENHANCEMENT_RECORD_TABLE}.player_id = EXCLUDED.player_id
          AND ROW(
            ${PLAYER_ENHANCEMENT_RECORD_TABLE}.item_id,
            ${PLAYER_ENHANCEMENT_RECORD_TABLE}.highest_level,
            ${PLAYER_ENHANCEMENT_RECORD_TABLE}.levels_payload,
            ${PLAYER_ENHANCEMENT_RECORD_TABLE}.action_started_at,
            ${PLAYER_ENHANCEMENT_RECORD_TABLE}.action_ended_at,
            ${PLAYER_ENHANCEMENT_RECORD_TABLE}.start_level,
            ${PLAYER_ENHANCEMENT_RECORD_TABLE}.initial_target_level,
            ${PLAYER_ENHANCEMENT_RECORD_TABLE}.desired_target_level,
            ${PLAYER_ENHANCEMENT_RECORD_TABLE}.protection_start_level,
            ${PLAYER_ENHANCEMENT_RECORD_TABLE}.status
          ) IS DISTINCT FROM ROW(
            EXCLUDED.item_id,
            EXCLUDED.highest_level,
            EXCLUDED.levels_payload,
            EXCLUDED.action_started_at,
            EXCLUDED.action_ended_at,
            EXCLUDED.start_level,
            EXCLUDED.initial_target_level,
            EXCLUDED.desired_target_level,
            EXCLUDED.protection_start_level,
            EXCLUDED.status
          )
      `,
      [playerId, JSON.stringify(normalizedRows)],
    );
    await assertNoForeignPlayerOwnedIds(
      client,
      PLAYER_ENHANCEMENT_RECORD_TABLE,
      'record_id',
      playerId,
      recordIds,
      'enhancement_record',
    );
  }
  await client.query(
    `
      WITH incoming AS (
        SELECT record_id
        FROM jsonb_to_recordset($2::jsonb) AS entry(record_id varchar(180))
      )
      DELETE FROM ${PLAYER_ENHANCEMENT_RECORD_TABLE} target
      WHERE target.player_id = $1
        AND NOT EXISTS (
          SELECT 1
          FROM incoming
          WHERE incoming.record_id = target.record_id
        )
    `,
    [playerId, JSON.stringify(normalizedRows.map(({ record_id }) => ({ record_id })))],
  );
}

async function replacePlayerProfessionStates(
  client: import('pg').PoolClient,
  playerId: string,
  rows: readonly DurableProfessionStateSnapshot[],
): Promise<void> {
  const normalizedRows = normalizeProfessionStateSnapshots(rows).map((row) => ({
    profession_type: row.professionType,
    level: row.level,
    exp: row.exp,
    exp_to_next: row.expToNext,
  }));
  const rowsJson = JSON.stringify(normalizedRows);
  if (normalizedRows.length > 0) {
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            profession_type varchar(32),
            level bigint,
            exp double precision,
            exp_to_next double precision
          )
        )
        INSERT INTO ${PLAYER_PROFESSION_STATE_TABLE}(
          player_id,
          profession_type,
          level,
          exp,
          exp_to_next,
          updated_at
        )
        SELECT $1, profession_type, level, exp, exp_to_next, now()
        FROM incoming
        ON CONFLICT (player_id, profession_type)
        DO UPDATE SET
          level = EXCLUDED.level,
          exp = EXCLUDED.exp,
          exp_to_next = EXCLUDED.exp_to_next,
          updated_at = now()
        WHERE ROW(
          ${PLAYER_PROFESSION_STATE_TABLE}.level,
          ${PLAYER_PROFESSION_STATE_TABLE}.exp,
          ${PLAYER_PROFESSION_STATE_TABLE}.exp_to_next
        ) IS DISTINCT FROM ROW(
          EXCLUDED.level,
          EXCLUDED.exp,
          EXCLUDED.exp_to_next
        )
      `,
      [playerId, rowsJson],
    );
  }
}

async function replacePlayerQuestProgressRows(
  client: import('pg').PoolClient,
  playerId: string,
  rows: readonly DurableQuestProgressSnapshot[],
): Promise<void> {
  const normalizedRows: Array<{
    quest_id: string;
    status: string;
    progress_payload: Record<string, unknown> | unknown[] | null;
    raw_payload: Record<string, unknown>;
  }> = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const questId = normalizeRequiredString(row?.questId);
    if (!questId) {
      continue;
    }
    const status = normalizeOptionalString(row?.status) ?? 'active';
    normalizedRows.push({
      quest_id: questId,
      status,
      progress_payload: status === 'completed' ? null : normalizeQuestProgressPayload(row?.progressPayload),
      raw_payload: normalizeQuestRawPayload(row?.rawPayload, questId, status),
    });
  }

  if (normalizedRows.length > 0) {
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            quest_id varchar(120),
            status varchar(40),
            progress_payload jsonb,
            raw_payload jsonb
          )
        )
        INSERT INTO ${PLAYER_QUEST_PROGRESS_TABLE}(
          player_id,
          quest_id,
          status,
          progress_payload,
          raw_payload,
          updated_at
        )
        SELECT $1, quest_id, status, progress_payload, COALESCE(raw_payload, '{}'::jsonb), now()
        FROM incoming
        ON CONFLICT (player_id, quest_id)
        DO UPDATE SET
          status = EXCLUDED.status,
          progress_payload = EXCLUDED.progress_payload,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = now()
      `,
      [playerId, JSON.stringify(normalizedRows)],
    );
  }
  await client.query(
    `
      WITH incoming AS (
        SELECT quest_id
        FROM jsonb_to_recordset($2::jsonb) AS entry(quest_id varchar(120))
      )
      DELETE FROM ${PLAYER_QUEST_PROGRESS_TABLE} target
      WHERE target.player_id = $1
        AND NOT EXISTS (
          SELECT 1
          FROM incoming
          WHERE incoming.quest_id = target.quest_id
        )
    `,
    [playerId, JSON.stringify(normalizedRows.map(({ quest_id }) => ({ quest_id })))],
  );
}

function isSameActiveJobBehindExpected(
  persistedJobRunId: string,
  persistedJobVersion: number,
  expectedJobRunId: string,
  expectedJobVersion: number | null,
): boolean {
  return Boolean(
    persistedJobRunId
    && expectedJobRunId
    && persistedJobRunId === expectedJobRunId
    && expectedJobVersion != null
    && persistedJobVersion > 0
    && persistedJobVersion < expectedJobVersion,
  );
}

function isActiveJobCatchUpAllowed(
  persistedJobRunId: string,
  persistedJobVersion: number,
  expectedJobRunId: string,
  expectedJobVersion: number | null,
  nextActiveJob: DurableActiveJobSnapshot | null,
): boolean {
  if (!isSameActiveJobBehindExpected(persistedJobRunId, persistedJobVersion, expectedJobRunId, expectedJobVersion)) {
    return false;
  }
  if (!nextActiveJob) {
    return true;
  }
  return nextActiveJob.jobRunId === expectedJobRunId
    && expectedJobVersion != null
    && nextActiveJob.jobVersion >= expectedJobVersion;
}

function isActiveJobAlreadyAtOrAheadOfNext(
  persistedJobRunId: string,
  persistedJobVersion: number,
  nextActiveJob: DurableActiveJobSnapshot | null,
): boolean {
  return Boolean(
    nextActiveJob
    && persistedJobRunId
    && persistedJobRunId === nextActiveJob.jobRunId
    && persistedJobVersion >= nextActiveJob.jobVersion,
  );
}

function isActiveJobSameOrBehindNext(
  persistedJobRunId: string,
  persistedJobVersion: number,
  nextActiveJob: DurableActiveJobSnapshot | null,
): boolean {
  return Boolean(
    nextActiveJob
    && persistedJobRunId
    && persistedJobRunId === nextActiveJob.jobRunId
    && persistedJobVersion > 0
    && persistedJobVersion <= nextActiveJob.jobVersion,
  );
}

function normalizeActiveJobCompletionKind(value: unknown): ActiveJobCompletionKind {
  const normalized = normalizeRequiredString(value) || 'completed';
  if (normalized === 'completed' || normalized === 'advanced' || normalized === 'stopped') {
    return normalized;
  }
  throw new Error(`invalid_active_job_completion_kind:${normalized}`);
}

function resolveActiveJobCompletionSemantics(completionKind: ActiveJobCompletionKind): {
  operationType: string;
  outboxTopic: string;
  action: 'complete' | 'advance' | 'stop';
} {
  if (completionKind === 'advanced') {
    return {
      operationType: 'active_job_advance_with_assets',
      outboxTopic: 'player.active_job.advanced',
      action: 'advance',
    };
  }
  if (completionKind === 'stopped') {
    return {
      operationType: 'active_job_stop_with_assets',
      outboxTopic: 'player.active_job.stopped',
      action: 'stop',
    };
  }
  return {
    operationType: 'active_job_complete_with_assets',
    outboxTopic: 'player.active_job.completed',
    action: 'complete',
  };
}

function normalizeTechniqueActivityQueueSnapshots(
  snapshots: readonly PlayerTechniqueActivityQueueUpsertInput[],
): PlayerTechniqueActivityQueueUpsertInput[] {
  const normalizedRows: PlayerTechniqueActivityQueueUpsertInput[] = [];
  const queueIds = new Set<string>();
  for (let index = 0; index < snapshots.length; index += 1) {
    const snapshot = snapshots[index];
    const queueId = normalizeRequiredString(snapshot?.queueId);
    const kind = normalizeRequiredString(snapshot?.kind);
    if (!queueId || !kind) {
      throw new Error(`invalid_technique_activity_queue_snapshot:index=${index}`);
    }
    if (queueIds.has(queueId)) {
      throw new Error(`duplicate_technique_activity_queue_id:${queueId}`);
    }
    queueIds.add(queueId);
    normalizedRows.push({
      queueId,
      kind,
      state: normalizeRequiredString(snapshot?.state) || 'pending',
      label: normalizeOptionalString(snapshot?.label),
      targetLabel: normalizeOptionalString(snapshot?.targetLabel),
      sleepReason: normalizeOptionalString(snapshot?.sleepReason),
      retryAfterTicks: normalizeOptionalInteger(snapshot?.retryAfterTicks),
      createdAt: Math.max(1, normalizeOptionalInteger(snapshot?.createdAt) ?? 1),
      payloadJson: normalizeDurableJsonValue(snapshot?.payloadJson ?? {}),
      cancelRefJson: normalizeDurableJsonValue(snapshot?.cancelRefJson ?? {}),
      detailJson: normalizeDurableJsonObject(snapshot?.detailJson),
    });
  }
  return normalizedRows;
}

function buildActiveJobAssetSnapshotDigest(input: {
  playerId: string;
  inventoryItems: readonly DurableInventoryItemSnapshot[];
  walletBalances: readonly DurableWalletBalanceSnapshot[];
  equipmentSlots?: readonly DurableEquipmentSlotSnapshot[];
  enhancementRecords?: readonly DurableEnhancementRecordSnapshot[] | null;
  professionStates?: readonly DurableProfessionStateSnapshot[] | null;
  activeJob: DurableActiveJobSnapshot | null;
  techniqueActivityQueue?: readonly PlayerTechniqueActivityQueueUpsertInput[];
}): string {
  const canonicalSnapshot = {
    inventory: normalizeInventorySnapshotsForReplay(input.playerId, input.inventoryItems),
    wallet: normalizeWalletSnapshotsForReplay(input.walletBalances),
    equipment: input.equipmentSlots === undefined
      ? { mutation: 'unchanged' }
      : normalizeEquipmentSnapshotsForReplay(input.equipmentSlots),
    enhancementRecords: input.enhancementRecords == null
      ? { mutation: 'unchanged' }
      : input.enhancementRecords,
    ...(input.professionStates == null
      ? {}
      : { professionStates: normalizeProfessionStateSnapshots(input.professionStates) }),
    activeJob: input.activeJob,
    techniqueActivityQueue: input.techniqueActivityQueue === undefined
      ? { mutation: 'unchanged' }
      : normalizeTechniqueActivityQueueSnapshots(input.techniqueActivityQueue),
  };
  return createHash('sha256').update(stableDurableJson(canonicalSnapshot)).digest('hex');
}

function normalizeInventorySnapshotsForReplay(
  playerId: string,
  items: readonly DurableInventoryItemSnapshot[],
): unknown[] {
  let lockedSlotCounter = -1;
  return items.map((item, index) => {
    const itemId = normalizeRequiredString(item?.itemId);
    if (!itemId) {
      throw new Error(`invalid_inventory_snapshot_for_replay:index=${index}`);
    }
    const count = Math.max(1, Math.trunc(Number(item?.count ?? 1)));
    const lockedBy = normalizeOptionalString(item?.lockedBy);
    const rawPayload = buildPersistedInventoryItemRawPayload({
      itemId,
      count,
      name: item?.name,
      desc: item?.desc,
      enhanceLevel: item?.enhanceLevel,
      learnTechniqueId: item?.learnTechniqueId,
      learnTechniqueMaxLevel: item?.learnTechniqueMaxLevel,
      grade: item?.grade,
      level: item?.level,
      rawPayload: item?.rawPayload,
    });
    if (lockedBy != null) {
      const lockedAt = normalizeOptionalInteger(item?.lockedAt)
        ?? normalizeOptionalInteger((item?.rawPayload as { lockedAt?: unknown } | null | undefined)?.lockedAt);
      if (lockedAt != null) {
        rawPayload.lockedAt = lockedAt;
      }
    }
    const sourceItemInstanceId = normalizeRequiredString(item?.itemInstanceId)
      || normalizeRequiredString((item?.rawPayload as { itemInstanceId?: unknown } | null | undefined)?.itemInstanceId);
    const itemInstanceId = sourceItemInstanceId && !isLegacyItemInstanceId(sourceItemInstanceId)
      ? sourceItemInstanceId
      : `inv:${playerId}:${index}`;
    return {
      itemInstanceId,
      slotIndex: lockedBy != null ? lockedSlotCounter-- : index,
      itemId,
      count,
      lockedBy,
      rawPayload,
    };
  });
}

function normalizeWalletSnapshotsForReplay(
  balances: readonly DurableWalletBalanceSnapshot[],
): unknown[] {
  return balances
    .map((balance) => ({
      walletType: normalizeRequiredString(balance?.walletType),
      balance: Math.max(0, Math.trunc(Number(balance?.balance ?? 0))),
      frozenBalance: Math.max(0, Math.trunc(Number(balance?.frozenBalance ?? 0))),
      version: Math.max(1, Math.trunc(Number(balance?.version ?? 1))),
    }))
    .filter(({ walletType }) => walletType.length > 0)
    .sort((left, right) => left.walletType.localeCompare(right.walletType));
}

function normalizeEquipmentSnapshotsForReplay(
  slots: readonly DurableEquipmentSlotSnapshot[],
): unknown[] {
  return slots
    .map((slotEntry) => {
      const slot = normalizeRequiredString(slotEntry?.slot);
      if (!EQUIP_SLOTS.includes(slot as (typeof EQUIP_SLOTS)[number])) {
        throw new Error(`invalid_equipment_snapshot_for_replay:slot=${slot || 'null'}`);
      }
      const item = slotEntry?.item && typeof slotEntry.item === 'object'
        ? slotEntry.item as Record<string, unknown>
        : null;
      if (!item) {
        return null;
      }
      const itemId = normalizeRequiredString(item.itemId);
      if (!itemId) {
        throw new Error(`invalid_equipment_snapshot_for_replay:slot=${slot}`);
      }
      const sourceItemInstanceId = normalizeRequiredString(slotEntry?.itemInstanceId)
        || normalizeRequiredString(item.itemInstanceId);
      return {
        slot,
        itemInstanceId: sourceItemInstanceId && !isLegacyItemInstanceId(sourceItemInstanceId)
          ? sourceItemInstanceId
          : null,
        itemId,
        rawPayload: buildPersistedEquipmentItemRawPayload({
          itemId,
          slot,
          enhanceLevel: item.enhanceLevel,
          rawPayload: item,
        }),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null)
    .sort((left, right) => left.slot.localeCompare(right.slot));
}

function normalizeActiveJobSnapshot(snapshot: DurableActiveJobSnapshot): DurableActiveJobSnapshot {
  const jobRunId = normalizeRequiredString(snapshot.jobRunId);
  const jobType = normalizeRequiredString(snapshot.jobType);
  if (!jobRunId || !jobType) {
    throw new Error('invalid_active_job_snapshot');
  }
  const jobVersion = Math.max(1, Math.trunc(Number(snapshot.jobVersion ?? 1)));
  const startedAt = Math.max(1, Math.trunc(Number(snapshot.startedAt ?? Date.now())));
  const finishedAt = normalizeOptionalInteger(snapshot.finishedAt);
  const pausedTicks = Math.max(0, Math.trunc(Number(snapshot.pausedTicks ?? 0)));
  const totalTicks = Math.max(0, Math.trunc(Number(snapshot.totalTicks ?? 0)));
  const remainingTicks = Math.max(0, Math.trunc(Number(snapshot.remainingTicks ?? 0)));
  const successRate = Number.isFinite(Number(snapshot.successRate ?? 0)) ? Number(snapshot.successRate ?? 0) : 0;
  const speedRate = Number.isFinite(Number(snapshot.speedRate ?? 1)) ? Number(snapshot.speedRate ?? 1) : 1;
  const status = normalizeRequiredString(snapshot.status) || 'running';
  const phase = normalizeRequiredString(snapshot.phase) || 'running';
  return {
    jobRunId,
    jobType,
    status,
    phase,
    startedAt,
    finishedAt,
    pausedTicks,
    totalTicks,
    remainingTicks,
    successRate,
    speedRate,
    jobVersion,
    detailJson:
      snapshot.detailJson && typeof snapshot.detailJson === 'object'
        ? snapshot.detailJson
        : {
            jobRunId,
            jobType,
            status,
            phase,
            startedAt,
            finishedAt,
            pausedTicks,
            totalTicks,
            remainingTicks,
            successRate,
            speedRate,
            jobVersion,
          },
  };
}

function normalizeEnhancementRecordSnapshots(
  playerId: string,
  snapshots: readonly DurableEnhancementRecordSnapshot[],
): DurableEnhancementRecordSnapshot[] {
  const normalizedPlayerId = normalizeRequiredString(playerId) || 'player';
  const rows: DurableEnhancementRecordSnapshot[] = [];
  for (let index = 0; index < snapshots.length; index += 1) {
    const snapshot = snapshots[index];
    const itemId = normalizeRequiredString(snapshot?.itemId);
    if (!itemId) {
      continue;
    }
    rows.push({
      recordId:
        normalizeOptionalString(snapshot?.recordId)
        ?? `enhancement_record:${normalizedPlayerId}:${itemId}:${index}`,
      itemId,
      highestLevel: Math.max(0, Math.trunc(Number(snapshot?.highestLevel ?? 0))),
      levels: Array.isArray(snapshot?.levels) ? snapshot.levels.map((entry) => entry) : [],
      actionStartedAt: normalizeOptionalInteger(snapshot?.actionStartedAt),
      actionEndedAt: normalizeOptionalInteger(snapshot?.actionEndedAt),
      startLevel: normalizeOptionalInteger(snapshot?.startLevel),
      initialTargetLevel: normalizeOptionalInteger(snapshot?.initialTargetLevel),
      desiredTargetLevel: normalizeOptionalInteger(snapshot?.desiredTargetLevel),
      protectionStartLevel: normalizeOptionalInteger(snapshot?.protectionStartLevel),
      status: normalizeOptionalString(snapshot?.status),
    });
  }
  return rows;
}

function normalizeProfessionStateSnapshots(
  snapshots: readonly DurableProfessionStateSnapshot[],
): DurableProfessionStateSnapshot[] {
  const allowedTypes = new Set<DurableProfessionStateSnapshot['professionType']>([
    'alchemy',
    'building',
    'gather',
    'enhancement',
    'forging',
    'mining',
    'formation',
    'transmission',
  ]);
  const rows = new Map<DurableProfessionStateSnapshot['professionType'], DurableProfessionStateSnapshot>();
  for (let index = 0; index < snapshots.length; index += 1) {
    const snapshot = snapshots[index];
    const professionType = normalizeRequiredString(snapshot?.professionType) as DurableProfessionStateSnapshot['professionType'];
    if (!allowedTypes.has(professionType)) {
      throw new Error(`invalid_profession_state_snapshot:index=${index}`);
    }
    if (rows.has(professionType)) {
      throw new Error(`duplicate_profession_state_snapshot:${professionType}`);
    }
    const numericLevel = Number(snapshot?.level);
    rows.set(professionType, {
      professionType,
      level: Number.isFinite(numericLevel) ? Math.max(1, Math.trunc(numericLevel)) : 1,
      exp: normalizeNonNegativeOptionalNumber(snapshot?.exp),
      expToNext: normalizeNonNegativeOptionalNumber(snapshot?.expToNext),
    });
  }
  return [...rows.values()].sort((left, right) => left.professionType.localeCompare(right.professionType));
}

function normalizeNonNegativeOptionalNumber(value: unknown): number | null {
  const numeric = Number(value);
  return value == null || !Number.isFinite(numeric) ? null : Math.max(0, numeric);
}

function normalizeQuestProgressSnapshots(
  snapshots: readonly DurableQuestProgressSnapshot[],
): DurableQuestProgressSnapshot[] {
  const rows: DurableQuestProgressSnapshot[] = [];
  for (const snapshot of snapshots) {
    const questId = normalizeRequiredString(snapshot?.questId);
    if (!questId) {
      continue;
    }
    const status = normalizeOptionalString(snapshot?.status) ?? 'active';
    rows.push({
      questId,
      status,
      progressPayload: status === 'completed' ? null : normalizeQuestProgressPayload(snapshot?.progressPayload),
      rawPayload: normalizeQuestRawPayload(snapshot?.rawPayload, questId, status),
    });
  }
  return rows;
}

function normalizeQuestProgressPayload(
  payload: unknown,
): Record<string, unknown> | unknown[] | null {
  if (Array.isArray(payload)) {
    return payload.map((entry) => structuredClone(entry));
  }
  if (payload && typeof payload === 'object') {
    return { ...(payload as Record<string, unknown>) };
  }
  return null;
}

function normalizeQuestRawPayload(
  rawPayload: unknown,
  questId: string,
  status: string,
): Record<string, unknown> {
  if (rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)) {
    if (status === 'completed') {
      const { progress: _progress, ...rest } = rawPayload as Record<string, unknown>;
      return {
        ...rest,
        id: questId,
        questId,
        status,
      };
    }
    return {
      ...(rawPayload as Record<string, unknown>),
      id: questId,
      questId,
      status,
    };
  }
  return {
    id: questId,
    questId,
    status,
  };
}

async function readMailCounters(
  client: import('pg').PoolClient,
  playerId: string,
  now: number,
): Promise<{
  unreadCount: number;
  unclaimedCount: number;
  latestMailAt: number | null;
}> {
  const counters = await client.query<{
    unread_count?: string | number;
    unclaimed_count?: string | number;
    latest_mail_at?: string | number | null;
  }>(
    `
      WITH visible_mail AS (
        SELECT mail_id, created_at, read_at, claimed_at
        FROM ${PLAYER_MAIL_TABLE}
        WHERE player_id = $1
          AND deleted_at IS NULL
          AND (expire_at IS NULL OR expire_at > $2)
      ),
      claimable_mail AS (
        SELECT DISTINCT attachment.mail_id
        FROM ${PLAYER_MAIL_ATTACHMENT_TABLE} attachment
        JOIN visible_mail mail ON mail.mail_id = attachment.mail_id
        WHERE attachment.player_id = $1
          AND mail.claimed_at IS NULL
          AND attachment.claimed_at IS NULL
      )
      SELECT
        COALESCE(SUM(CASE WHEN visible_mail.read_at IS NULL THEN 1 ELSE 0 END), 0) AS unread_count,
        COALESCE((SELECT COUNT(*) FROM claimable_mail), 0) AS unclaimed_count,
        MAX(visible_mail.created_at) AS latest_mail_at
      FROM visible_mail
    `,
    [playerId, now],
  );
  const counterRow = counters.rows[0] ?? {};
  const latestMailAt = Number(counterRow.latest_mail_at);
  return {
    unreadCount: Math.max(0, Math.trunc(Number(counterRow.unread_count ?? 0))),
    unclaimedCount: Math.max(0, Math.trunc(Number(counterRow.unclaimed_count ?? 0))),
    latestMailAt: Number.isFinite(latestMailAt)
      ? Math.trunc(latestMailAt)
      : null,
  };
}

function normalizeInventoryGrantSourceMutation(
  value: DurableInventoryGrantSourceMutation | null | undefined,
): DurableInventoryGrantSourceMutation | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const instanceId = normalizeRequiredString(value.instanceId);
  if (!instanceId) {
    return null;
  }
  if (value.kind === 'ground_tile' || value.kind === 'container_state') {
    return normalizeDurableLootSourceMutation(value, instanceId);
  }
  if (value.kind === 'time_chamber_fuel') {
    const buildingId = normalizeRequiredString(value.buildingId);
    const fuelUnits = Math.trunc(Number(value.fuelUnits) || 0);
    if (!buildingId || !Number.isSafeInteger(fuelUnits) || fuelUnits <= 0) {
      return null;
    }
    return {
      kind: 'time_chamber_fuel',
      instanceId,
      buildingId,
      fuelUnits,
    };
  }
  if (value.kind === 'tile_resource') {
    return normalizeDurableTileResourceSourceMutation(value, instanceId);
  }
  return null;
}

async function persistInventoryGrantSourceMutation(
  client: import('pg').PoolClient,
  mutation: DurableInventoryGrantSourceMutation,
): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock($1::integer, hashtext($2))', [7102, mutation.instanceId]);
  if (mutation.kind === 'ground_tile' || mutation.kind === 'container_state') {
    await persistDurableLootSourceMutation(client, mutation);
    return;
  }
  if (mutation.kind === 'time_chamber_fuel') {
    await addDurableTimeChamberFuel(client, mutation);
    return;
  }
  await persistDurableTileResourceSourceMutation(client, mutation);
}

async function addDurableTimeChamberFuel(
  client: import('pg').PoolClient,
  mutation: Extract<DurableInventoryGrantSourceMutation, { kind: 'time_chamber_fuel' }>,
): Promise<void> {
  const result = await client.query(
    `UPDATE instance_time_chamber_state
        SET fuel_units = fuel_units + $3,
            revision = revision + 1,
            updated_at = now()
      WHERE source_instance_id = $1
        AND building_id = $2
        AND fuel_units <= $4::bigint - $3::bigint`,
    [mutation.instanceId, mutation.buildingId, mutation.fuelUnits, MAX_DURABLE_TIME_CHAMBER_FUEL_UNITS],
  );
  if ((result.rowCount ?? 0) !== 1) {
    const existing = await client.query(
      'SELECT 1 FROM instance_time_chamber_state WHERE source_instance_id = $1 AND building_id = $2 LIMIT 1',
      [mutation.instanceId, mutation.buildingId],
    );
    throw new Error((existing.rowCount ?? 0) > 0 ? 'time_chamber_fuel_limit' : 'time_chamber_state_not_found');
  }
}

function normalizeDurableJsonValue(value: unknown): unknown {
  try {
    return JSON.parse(stableDurableJson(value ?? {}));
  } catch {
    throw new Error('durable_operation_payload_not_serializable');
  }
}

function normalizeDurableJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  try {
    const parsed = JSON.parse(JSON.stringify(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  }
  catch {
    return {};
  }
}

function normalizeDurableOperationId(value: unknown): string {
  const normalized = normalizeRequiredString(value);
  if (!normalized || normalized.length <= DURABLE_OPERATION_ID_SAFE_LENGTH) {
    return normalized;
  }
  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 32);
  const suffix = `:h:${digest}`;
  return `${normalized.slice(0, DURABLE_OPERATION_ID_SAFE_LENGTH - suffix.length)}${suffix}`;
}

function assertDurableOperationReplayIdentity(
  row: {
    operation_type?: unknown;
    aggregate_type?: unknown;
    player_id?: unknown;
    payload_jsonb?: unknown;
  },
  expected: {
    operationType: unknown;
    aggregateType: unknown;
    playerId: unknown;
    payload: unknown;
  },
): void {
  const currentOperationType = normalizeRequiredString(row.operation_type);
  const currentAggregateType = normalizeRequiredString(row.aggregate_type);
  const currentPlayerId = normalizeRequiredString(row.player_id);
  const expectedOperationType = normalizeRequiredString(expected.operationType);
  const expectedAggregateType = normalizeRequiredString(expected.aggregateType);
  const expectedPlayerId = normalizeRequiredString(expected.playerId);
  if (
    currentOperationType !== expectedOperationType
    || currentAggregateType !== expectedAggregateType
    || currentPlayerId !== expectedPlayerId
    || stableDurableJson(row.payload_jsonb) !== stableDurableJson(expected.payload)
  ) {
    throw new Error('durable_operation_replay_identity_conflict');
  }
}

/**
 * 市场幂等键只绑定玩家、动作类型与客户端请求本身。
 * 订单版本和结算后快照属于服务端派生结果；重复请求到达时运行态可能已经推进，
 * 不能拿这些派生字段判断是否为同一请求，否则会把正常重放误判成 operationId 冲突。
 */
function assertDurableMarketOperationReplayIdentity(
  row: {
    operation_type?: unknown;
    aggregate_type?: unknown;
    player_id?: unknown;
    payload_jsonb?: unknown;
  },
  expected: {
    operationType: unknown;
    playerId: unknown;
    request: unknown;
  },
): void {
  const payload = normalizeDurableJsonObject(row.payload_jsonb);
  assertDurableOperationReplayIdentity(
    {
      ...row,
      payload_jsonb: payload.request,
    },
    {
      operationType: expected.operationType,
      aggregateType: 'market_mutation',
      playerId: expected.playerId,
      payload: expected.request,
    },
  );
}

function stableDurableJson(value: unknown): string {
  let decoded = value;
  if (typeof decoded === 'string') {
    try {
      decoded = JSON.parse(decoded);
    } catch {
      return JSON.stringify(decoded);
    }
  }
  try {
    const serialized = JSON.stringify(decoded ?? {});
    return JSON.stringify(sortDurableJsonValue(JSON.parse(serialized)));
  } catch {
    throw new Error('durable_operation_payload_not_serializable');
  }
}

function sortDurableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortDurableJsonValue);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortDurableJsonValue((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function waitForDurableOperationReconciliation(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function normalizeCurrentDurableInvocationResult<TResult>(result: TResult): TResult {
  if (!result || typeof result !== 'object' || Array.isArray(result) || !('alreadyCommitted' in result)) {
    return result;
  }
  return {
    ...(result as Record<string, unknown>),
    alreadyCommitted: false,
  } as TResult;
}

function normalizeOptionalInteger(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized ? normalized : null;
}

function normalizePositiveInteger(
  value: unknown,
  fallback: number,
  min = 1,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

function normalizeStringList(values: readonly unknown[]): string[] {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => normalizeRequiredString(value))
    .filter((value) => value.length > 0)));
}

function buildMarketSessionFenceConflictMessage(
  expectedRuntimeOwnerId: string,
  expectedSessionEpoch: number,
  persistedRuntimeOwnerId: string,
  persistedSessionEpoch: number,
): string {
  return [
    'player_session_fencing_conflict:market_mutation',
    `expectedRuntimeOwnerId=${expectedRuntimeOwnerId || 'null'}`,
    `expectedSessionEpoch=${expectedSessionEpoch > 0 ? Math.trunc(expectedSessionEpoch) : 'null'}`,
    `persistedRuntimeOwnerId=${persistedRuntimeOwnerId || 'null'}`,
    `persistedSessionEpoch=${persistedSessionEpoch > 0 ? Math.trunc(persistedSessionEpoch) : 'null'}`,
  ].join(':');
}

async function advancePlayerPresenceSessionFence(
  client: import('pg').PoolClient,
  playerId: string,
  runtimeOwnerId: string,
  sessionEpoch: number,
): Promise<void> {
  await client.query(
    `
      INSERT INTO ${PLAYER_PRESENCE_TABLE}(
        player_id, online, in_world, runtime_owner_id, session_epoch, updated_at
      )
      VALUES ($1, true, true, $2, $3, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        online = true,
        in_world = true,
        runtime_owner_id = EXCLUDED.runtime_owner_id,
        session_epoch = EXCLUDED.session_epoch,
        updated_at = now()
      WHERE ${PLAYER_PRESENCE_TABLE}.session_epoch < EXCLUDED.session_epoch
    `,
    [playerId, runtimeOwnerId, Math.max(1, Math.trunc(sessionEpoch))],
  );
}

function normalizeMarketPlayerMutations(values: readonly DurableMarketPlayerMutationSnapshot[]): DurableMarketPlayerMutationSnapshot[] {
  const byPlayerId = new Map<string, DurableMarketPlayerMutationSnapshot>();
  for (const value of Array.isArray(values) ? values : []) {
    const playerId = normalizeRequiredString(value?.playerId);
    if (!playerId) {
      continue;
    }
    const current = byPlayerId.get(playerId) ?? { playerId };
    const expectedRuntimeOwnerId = normalizeRequiredString(value.expectedRuntimeOwnerId);
    const expectedSessionEpoch = Math.max(0, Math.trunc(Number(value.expectedSessionEpoch ?? 0)));
    if (expectedRuntimeOwnerId && expectedSessionEpoch > 0) {
      current.expectedRuntimeOwnerId = expectedRuntimeOwnerId;
      current.expectedSessionEpoch = expectedSessionEpoch;
    }
    if (Array.isArray(value.nextInventoryItems)) {
      current.nextInventoryItems = value.nextInventoryItems as DurableInventoryItemSnapshot[];
    }
    if (Array.isArray(value.nextWalletBalances)) {
      current.nextWalletBalances = value.nextWalletBalances as DurableWalletBalanceSnapshot[];
    }
    if (Array.isArray(value.nextMarketStorageItems)) {
      current.nextMarketStorageItems = value.nextMarketStorageItems as DurableMarketStorageItemSnapshot[];
    }
    byPlayerId.set(playerId, current);
  }
  return Array.from(byPlayerId.values()).sort((left, right) => left.playerId.localeCompare(right.playerId));
}

function normalizeMarketExpectedOrders(
  values: readonly DurableMarketExpectedOrderSnapshot[],
): DurableMarketExpectedOrderSnapshot[] {
  const byOrderId = new Map<string, DurableMarketExpectedOrderSnapshot>();
  for (const value of Array.isArray(values) ? values : []) {
    const orderId = normalizeRequiredString(value?.orderId);
    if (!orderId) {
      continue;
    }
    byOrderId.set(orderId, {
      orderId,
      exists: value.exists === true,
      status: normalizeOptionalString(value.status),
      remainingQuantity: normalizeOptionalInteger(value.remainingQuantity),
      updatedAtMs: normalizeOptionalInteger(value.updatedAtMs),
    });
  }
  return Array.from(byOrderId.values()).sort((left, right) => left.orderId.localeCompare(right.orderId));
}

async function assertMarketParticipantPresenceFences(
  client: import('pg').PoolClient,
  mutations: readonly DurableMarketPlayerMutationSnapshot[],
  primaryPlayerId: string,
): Promise<void> {
  for (const mutation of mutations) {
    if (mutation.playerId === primaryPlayerId) {
      continue;
    }
    const expectedRuntimeOwnerId = normalizeRequiredString(mutation.expectedRuntimeOwnerId);
    const expectedSessionEpoch = Math.max(0, Math.trunc(Number(mutation.expectedSessionEpoch ?? 0)));
    if (!expectedRuntimeOwnerId || expectedSessionEpoch <= 0) {
      continue;
    }
    const result = await client.query<{ runtime_owner_id?: unknown; session_epoch?: unknown }>(
      `SELECT runtime_owner_id, session_epoch FROM ${PLAYER_PRESENCE_TABLE} WHERE player_id = $1 FOR UPDATE`,
      [mutation.playerId],
    );
    const persistedRuntimeOwnerId = normalizeRequiredString(result.rows[0]?.runtime_owner_id);
    const persistedSessionEpoch = Math.max(0, Math.trunc(Number(result.rows[0]?.session_epoch ?? 0)));
    if (
      persistedRuntimeOwnerId !== expectedRuntimeOwnerId
      || persistedSessionEpoch !== expectedSessionEpoch
    ) {
      throw new Error(`market_participant_session_fence_conflict:${mutation.playerId}`);
    }
  }
}

async function assertMarketExpectedOrders(
  client: import('pg').PoolClient,
  expectedOrders: readonly DurableMarketExpectedOrderSnapshot[],
): Promise<void> {
  if (expectedOrders.length === 0) {
    return;
  }
  const orderIds = expectedOrders.map((entry) => entry.orderId);
  const result = await client.query<{
    order_id?: unknown;
    status?: unknown;
    remaining_quantity?: unknown;
    updated_at_ms?: unknown;
  }>(
    `
      SELECT order_id, status, remaining_quantity, updated_at_ms
      FROM ${MARKET_ORDER_TABLE}
      WHERE order_id = ANY($1::varchar[])
      ORDER BY order_id ASC
      FOR UPDATE
    `,
    [orderIds],
  );
  const rowsByOrderId = new Map(
    result.rows.map((row) => [normalizeRequiredString(row.order_id), row]),
  );
  for (const expected of expectedOrders) {
    const row = rowsByOrderId.get(expected.orderId);
    if (!expected.exists) {
      if (row) {
        throw new Error(`market_order_cas_conflict:${expected.orderId}:expected_absent`);
      }
      continue;
    }
    const persistedStatus = normalizeRequiredString(row?.status);
    const persistedRemainingQuantity = normalizeOptionalInteger(row?.remaining_quantity);
    const persistedUpdatedAtMs = normalizeOptionalInteger(row?.updated_at_ms);
    if (
      !row
      || (expected.status != null && persistedStatus !== expected.status)
      || (expected.remainingQuantity != null && persistedRemainingQuantity !== expected.remainingQuantity)
      || (expected.updatedAtMs != null && persistedUpdatedAtMs !== expected.updatedAtMs)
    ) {
      throw new Error(`market_order_cas_conflict:${expected.orderId}:stale_state`);
    }
  }
}

async function insertDurableOperationLog(
  client: import('pg').PoolClient,
  operationId: string,
  operationType: string,
  aggregateType: string,
  playerId: string,
  runtimeOwnerId: string,
  sessionEpoch: number,
  payload: unknown,
): Promise<void> {
  await client.query(
    `
      INSERT INTO ${DURABLE_OPERATION_LOG_TABLE}(
        operation_id, operation_type, aggregate_type, aggregate_id, player_id,
        runtime_owner_id, session_epoch, request_id, payload_jsonb, status, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, now())
    `,
    [operationId, operationType, aggregateType, playerId, playerId, runtimeOwnerId || null, sessionEpoch > 0 ? Math.trunc(sessionEpoch) : null, operationId, JSON.stringify(payload ?? {}), 'pending'],
  );
}

async function upsertMarketOrders(client: import('pg').PoolClient, orders: readonly unknown[]): Promise<void> {
  for (const source of Array.isArray(orders) ? orders : []) {
    const order = source as Record<string, unknown>;
    const item = order.item && typeof order.item === 'object' ? order.item as Record<string, unknown> : {};
    const orderId = normalizeRequiredString(order.id ?? order.orderId);
    const ownerId = normalizeRequiredString(order.ownerId);
    const side = order.side === 'buy' ? 'buy' : 'sell';
    const status = normalizeRequiredString(order.status) || 'open';
    const itemKey = normalizeRequiredString(order.itemKey);
    const itemId = normalizeRequiredString(item.itemId ?? order.itemId);
    if (!orderId || !ownerId || !itemKey || !itemId) {
      throw new Error('invalid_market_order_upsert');
    }
    await client.query(
      `
        INSERT INTO ${MARKET_ORDER_TABLE}(
          order_id, owner_id, side, status, item_key, item_id,
          remaining_quantity, unit_price, created_at_ms, updated_at_ms, raw_payload, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::numeric, $9, $10, $11::jsonb, now())
        ON CONFLICT (order_id)
        DO UPDATE SET
          owner_id = EXCLUDED.owner_id,
          side = EXCLUDED.side,
          status = EXCLUDED.status,
          item_key = EXCLUDED.item_key,
          item_id = EXCLUDED.item_id,
          remaining_quantity = EXCLUDED.remaining_quantity,
          unit_price = EXCLUDED.unit_price,
          created_at_ms = EXCLUDED.created_at_ms,
          updated_at_ms = EXCLUDED.updated_at_ms,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = now()
      `,
      [
        orderId,
        ownerId,
        side,
        status,
        itemKey,
        itemId,
        Math.max(0, Math.trunc(Number(order.remainingQuantity ?? 0))),
        Number.isFinite(Number(order.unitPrice)) ? Number(order.unitPrice) : 1,
        Math.trunc(Number(order.createdAt ?? Date.now())),
        Math.trunc(Number(order.updatedAt ?? Date.now())),
        JSON.stringify(order),
      ],
    );
  }
}

async function insertMarketTradeRecords(client: import('pg').PoolClient, records: readonly unknown[]): Promise<void> {
  for (const source of Array.isArray(records) ? records : []) {
    const record = source as Record<string, unknown>;
    const tradeId = normalizeRequiredString(record.id ?? record.tradeId);
    const buyerId = normalizeRequiredString(record.buyerId);
    const sellerId = normalizeRequiredString(record.sellerId);
    const itemId = normalizeRequiredString(record.itemId);
    if (!tradeId || !buyerId || !sellerId || !itemId) {
      throw new Error('invalid_market_trade_record');
    }
    await client.query(
      `
        INSERT INTO ${MARKET_TRADE_TABLE}(
          trade_id, buyer_id, seller_id, item_id, quantity,
          unit_price, created_at_ms, raw_payload, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::numeric, $7, $8::jsonb, now())
        ON CONFLICT (trade_id)
        DO UPDATE SET
          buyer_id = EXCLUDED.buyer_id,
          seller_id = EXCLUDED.seller_id,
          item_id = EXCLUDED.item_id,
          quantity = EXCLUDED.quantity,
          unit_price = EXCLUDED.unit_price,
          created_at_ms = EXCLUDED.created_at_ms,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = now()
      `,
      [
        tradeId,
        buyerId,
        sellerId,
        itemId,
        Math.max(1, Math.trunc(Number(record.quantity ?? 1))),
        Number.isFinite(Number(record.unitPrice)) ? Number(record.unitPrice) : 1,
        Math.trunc(Number(record.createdAt ?? Date.now())),
        JSON.stringify(record),
      ],
    );
  }
}

async function persistMarketPlayerMutation(
  client: import('pg').PoolClient,
  mutation: DurableMarketPlayerMutationSnapshot,
  now: number,
): Promise<void> {
  const watermark: { inventory?: number; wallet?: number; marketStorage?: number } = {};
  if (Array.isArray(mutation.nextInventoryItems)) {
    await replacePlayerInventoryItems(client, mutation.playerId, mutation.nextInventoryItems, { allowEmptyOverwrite: true });
    watermark.inventory = now;
  }
  if (Array.isArray(mutation.nextWalletBalances)) {
    await replacePlayerWalletRows(client, mutation.playerId, mutation.nextWalletBalances);
    watermark.wallet = now + 1;
  }
  if (Array.isArray(mutation.nextMarketStorageItems)) {
    await replacePlayerMarketStorageItems(client, mutation.playerId, mutation.nextMarketStorageItems, { allowEmptyOverwrite: true });
    watermark.marketStorage = now + 2;
  }
  await upsertMarketMutationWatermark(client, mutation.playerId, watermark);
}

async function upsertMarketMutationWatermark(
  client: import('pg').PoolClient,
  playerId: string,
  watermark: { inventory?: number; wallet?: number; marketStorage?: number },
): Promise<void> {
  if (watermark.inventory == null && watermark.wallet == null && watermark.marketStorage == null) {
    return;
  }
  await client.query(
    `
      INSERT INTO ${PLAYER_RECOVERY_WATERMARK_TABLE}(
        player_id, inventory_version, wallet_version, market_storage_version, updated_at
      )
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        inventory_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.inventory_version, EXCLUDED.inventory_version),
        wallet_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.wallet_version, EXCLUDED.wallet_version),
        market_storage_version = GREATEST(${PLAYER_RECOVERY_WATERMARK_TABLE}.market_storage_version, EXCLUDED.market_storage_version),
        updated_at = now()
    `,
    [playerId, watermark.inventory ?? 0, watermark.wallet ?? 0, watermark.marketStorage ?? 0],
  );
}

async function persistDurableMarketBanUser(client: import('pg').PoolClient, banUser: DurableMarketMutationInput['banUser']): Promise<void> {
  const playerId = normalizeRequiredString(banUser?.playerId);
  const bannedAt = normalizeRequiredString(banUser?.bannedAt);
  if (!playerId || !bannedAt) {
    throw new Error('invalid_durable_market_ban_user');
  }
  const banReason = normalizeRequiredString(banUser?.banReason).slice(0, 255) || 'GM 风险复核封禁';
  const bannedBy = normalizeRequiredString(banUser?.bannedBy).slice(0, 64) || 'gm';
  const updateResult = await client.query(
    `
      UPDATE ${PLAYER_AUTH_TABLE}
      SET
        banned_at = $2::timestamptz,
        ban_reason = $3,
        banned_by = $4,
        updated_at = now(),
        payload = jsonb_set(
          jsonb_set(jsonb_set(payload, '{bannedAt}', to_jsonb($2::text), true), '{banReason}', to_jsonb($3::text), true),
          '{bannedBy}', to_jsonb($4::text), true
        )
      WHERE player_id = $1
    `,
    [playerId, bannedAt, banReason, bannedBy],
  );
  if (updateResult.rowCount !== 1) {
    throw new Error('durable_market_ban_user_not_found');
  }
}

async function insertDurableOutboxEvent(
  client: import('pg').PoolClient,
  operationId: string,
  topic: string,
  partitionKey: string,
  payload: unknown,
): Promise<void> {
  await client.query(
    `
      INSERT INTO ${OUTBOX_EVENT_TABLE}(
        event_id, operation_id, topic, partition_key, payload_jsonb,
        status, attempt_count, next_retry_at, created_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, now(), now())
      ON CONFLICT (event_id) DO NOTHING
    `,
    [`outbox:${operationId}`, operationId, topic, partitionKey, JSON.stringify(payload ?? {}), 'ready', 0],
  );
}

async function insertAssetAuditLog(
  client: import('pg').PoolClient,
  operationId: string,
  playerId: string,
  assetType: string,
  assetRefId: string,
  action: string,
  delta: unknown,
  before: unknown,
  after: unknown,
  logIdSuffix?: string,
): Promise<void> {
  const normalizedLogIdSuffix = normalizeOptionalString(logIdSuffix);
  const rawLogId = `audit:${operationId}${normalizedLogIdSuffix ? `:${normalizedLogIdSuffix}` : ''}`;
  const logId = rawLogId.length <= 180
    ? rawLogId
    : `audit:h:${createHash('sha256').update(rawLogId).digest('hex')}`;
  await client.query(
    `
      INSERT INTO ${ASSET_AUDIT_LOG_TABLE}(
        log_id, operation_id, player_id, asset_type, asset_ref_id, action,
        delta_jsonb, before_jsonb, after_jsonb, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, now())
      ON CONFLICT (log_id) DO NOTHING
    `,
    [logId, operationId, playerId, assetType, assetRefId, action, JSON.stringify(delta ?? {}), JSON.stringify(before ?? {}), JSON.stringify(after ?? {})],
  );
}

async function replacePlayerWalletRows(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  playerId: string,
  balances: readonly unknown[],
): Promise<void> {
  const sourceBalances = Array.isArray(balances) ? balances : [];
  const rows: Array<{
    wallet_type: string;
    balance: number;
    frozen_balance: number;
    version: number;
  }> = [];
  for (const row of sourceBalances) {
    const walletType = normalizeRequiredString((row as { walletType?: unknown })?.walletType);
    if (!walletType) {
      continue;
    }
    const balance = Math.max(0, Math.trunc(Number((row as { balance?: unknown })?.balance ?? 0)));
    const frozenBalance = Math.max(0, Math.trunc(Number((row as { frozenBalance?: unknown })?.frozenBalance ?? 0)));
    const version = Math.max(1, Math.trunc(Number((row as { version?: unknown })?.version ?? 1)));
    rows.push({
      wallet_type: walletType,
      balance,
      frozen_balance: frozenBalance,
      version,
    });
  }

  const rowsJson = JSON.stringify(rows);
  if (rows.length > 0) {
    await client.query(
      `
        WITH incoming AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS entry(
            wallet_type varchar(64),
            balance bigint,
            frozen_balance bigint,
            version bigint
          )
        )
        INSERT INTO ${PLAYER_WALLET_TABLE}(
          player_id,
          wallet_type,
          balance,
          frozen_balance,
          version,
          updated_at
        )
        SELECT $1, wallet_type, balance, frozen_balance, version, now()
        FROM incoming
        ON CONFLICT (player_id, wallet_type)
        DO UPDATE SET
          balance = EXCLUDED.balance,
          frozen_balance = EXCLUDED.frozen_balance,
          version = EXCLUDED.version,
          updated_at = now()
        WHERE ROW(
          ${PLAYER_WALLET_TABLE}.balance,
          ${PLAYER_WALLET_TABLE}.frozen_balance,
          ${PLAYER_WALLET_TABLE}.version
        ) IS DISTINCT FROM ROW(
          EXCLUDED.balance,
          EXCLUDED.frozen_balance,
          EXCLUDED.version
        )
      `,
      [playerId, rowsJson],
    );
  }
  await client.query(
    `
      WITH incoming AS (
        SELECT wallet_type
        FROM jsonb_to_recordset($2::jsonb) AS entry(wallet_type varchar(64))
      )
      DELETE FROM ${PLAYER_WALLET_TABLE} target
      WHERE target.player_id = $1
        AND NOT EXISTS (
          SELECT 1
          FROM incoming
          WHERE incoming.wallet_type = target.wallet_type
        )
    `,
    [playerId, rowsJson],
  );
}

async function acquireSchemaInitLock(client: import('pg').PoolClient): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock($1::integer, $2::integer)', [7100, 1]);
}

async function assertInstanceLeaseWritable(
  client: import('pg').PoolClient,
  input: {
    expectedInstanceId: string | null | undefined;
    expectedAssignedNodeId?: string | null | undefined;
    expectedLeaseToken?: string | null | undefined;
    expectedOwnershipEpoch?: number | null | undefined;
    currentNodeId: string;
  },
): Promise<void> {
  const normalizedInstanceId = normalizeRequiredString(input.expectedInstanceId);
  if (!normalizedInstanceId) {
    return;
  }
  await assertInstanceLeaseWriteFence(client, {
    instanceId: normalizedInstanceId,
    expectedAssignedNodeId: input.expectedAssignedNodeId,
    expectedLeaseToken: input.expectedLeaseToken,
    expectedOwnershipEpoch: input.expectedOwnershipEpoch,
    requiredCurrentNodeId: input.currentNodeId,
    conflictCode: 'instance_lease_fencing_conflict',
  });
}

function resolveCurrentNodeId(): string {
  const explicit = typeof process.env.SERVER_NODE_ID === 'string' ? process.env.SERVER_NODE_ID.trim() : '';
  if (explicit) {
    return explicit;
  }
  const publicPort = Number(
    typeof process.env.SERVER_PUBLIC_PORT === 'string' && process.env.SERVER_PUBLIC_PORT.trim()
      ? process.env.SERVER_PUBLIC_PORT.trim()
      : process.env.SERVER_PORT,
  );
  const stablePort = Number.isFinite(publicPort) ? Math.max(1, Math.trunc(publicPort)) : 13001;
  return `${hostname().trim() || 'node'}:${stablePort}`;
}
