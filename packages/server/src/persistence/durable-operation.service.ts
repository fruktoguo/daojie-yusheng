/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  calculateTimeChamberActivationCost,
  createItemStackSignature,
  EQUIP_SLOTS,
  isLegacyItemInstanceId,
  MAIL_BATCH_OPERATION_MAX,
  requiresTimeChamberActivation,
  resolveTimeChamberCapacityLimit,
  TIME_CHAMBER_MAX_USAGE_HOURS,
  TIME_CHAMBER_MIN_USAGE_HOURS,
} from '@mud/shared';
import { createHash, randomUUID } from 'node:crypto';
import { assertPlantSeedSourceMutation } from './plant-seed-source-validation';
import {
  assignStableItemInstanceId,
  upsertEquipmentSlotRowsWithItemInstanceIdRepair,
  type EquipmentSlotPersistenceRow,
  type ItemInstanceIdPersistenceRowSource,
} from './compat/item-instance-id-compat';
import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { resolveNodeId } from '../config/node-runtime-config';
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
  nextPlayerPersistenceVersion,
  savePlayerSnapshotProjectionDomainsWithClient,
  type PlayerTechniqueActivityQueueUpsertInput,
} from './player-domain-persistence.service';
import { ensureBigintColumnsWithClient } from './schema-bigint-migration';
import { normalizeDurableMineralCrystalSourceMutation, persistDurableMineralCrystalSourceMutation, type DurableMineralCrystalSourceMutation } from './mineral-crystal-durable-persistence';
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
import {
  normalizeDurableActivityAssetSourceMutation,
  persistDurableActivityAssetSourceMutation,
  type DurableActivityAssetSourceMutation,
} from './activity-asset-durable-persistence';
import {
  normalizeDurablePlayerItemUseSourceMutation,
  persistDurablePlayerItemUseSourceMutation,
  type DurablePlayerItemUseSourceMutation,
} from './player-item-use-durable-persistence';
import {
  acquirePlayerAssetLock,
  assertInventoryRemovalConsumesAllUnlockedItems,
  assertPlayerItemUseConsumesLastUnlockedInventoryItem,
  assertUnlockedInventoryIsEmpty,
  disposeFailedDurableTransactionClient,
  ensureDurableOperationTables,
  rollbackTransactionOrDestroyClient,
  normalizeRequiredString,
  ASSET_AUDIT_LOG_ARCHIVE_TABLE,
  ASSET_AUDIT_LOG_TABLE,
  DEAD_LETTER_EVENT_TABLE,
  DURABLE_OPERATION_LOG_TABLE,
  MARKET_ORDER_TABLE,
  OUTBOX_EVENT_TABLE,
  PLAYER_ACTIVE_JOB_TABLE,
  PLAYER_HEAVENLY_DAO_SHOP_PURCHASE_TABLE,
  PLAYER_MAIL_ATTACHMENT_TABLE,
  PLAYER_MAIL_COUNTER_TABLE,
  PLAYER_MAIL_TABLE,
  PLAYER_PRESENCE_TABLE,
  PLAYER_RECOVERY_WATERMARK_TABLE,
} from './durable-operation.sql';
import {
  advancePlayerPresenceSessionFence,
  assertDurableMarketOperationReplayIdentity,
  assertDurableOperationCompactedReplayIdentity,
  assertDurableOperationCompactionStreamIdentity,
  assertDurableOperationReplayIdentity,
  assertInstanceLeaseWritable,
  assertMarketExpectedOrders,
  assertMarketParticipantPresenceFences,
  assertPlayerTechniqueActivityQueueHead,
  buildActiveJobAssetSnapshotDigest,
  buildCompactedDurableOperationPayload,
  buildDurableOperationCompactionKey,
  buildMarketSessionFenceConflictMessage,
  insertAssetAuditLog,
  insertDurableOperationLog,
  insertDurableOutboxEvent,
  insertMarketTradeRecords,
  isActiveJobAlreadyAtOrAheadOfNext,
  isActiveJobCatchUpAllowed,
  isActiveJobSameOrBehindNext,
  isSameActiveJobBehindExpected,
  normalizeActiveJobCompletionKind,
  normalizeActiveJobSnapshot,
  normalizeCurrentDurableInvocationResult,
  normalizeDurableOperationId,
  normalizeEnhancementRecordSnapshots,
  normalizeInventoryGrantSourceMutation,
  normalizeMarketExpectedOrders,
  normalizeMarketPlayerMutations,
  normalizeOptionalInteger,
  normalizeOptionalString,
  normalizePositiveInteger,
  normalizeProfessionStateSnapshots,
  normalizeQuestProgressSnapshots,
  normalizeStringList,
  normalizeTechniqueActivityQueueSnapshots,
  patchPlayerInventoryItems,
  patchPlayerWalletRows,
  persistDurableMarketBanUser,
  persistInventoryGrantSourceMutation,
  persistMarketPlayerMutation,
  readMailCounters,
  replacePlayerActiveJob,
  replacePlayerEnhancementRecords,
  replacePlayerEquipmentSlots,
  replacePlayerInventoryItems,
  replacePlayerMarketStorageItems,
  replacePlayerProfessionStates,
  replacePlayerQuestProgressRows,
  replacePlayerTechniqueActivityQueue,
  replacePlayerWalletRows,
  resolveActiveJobCompletionSemantics,
  resolveCurrentNodeId,
  upsertCompactedAssetAuditLog,
  upsertMarketOrders,
  waitForDurableOperationReconciliation,
} from './durable-operation.persistence';
import {
  updateActiveJobStateImpl,
  startActiveJobWithAssetsImpl,
  cancelActiveJobWithAssetsImpl,
  completeActiveJobWithAssetsImpl,
} from './durable-operation.active-job-ops';
import {
  settleMarketSellNowImpl,
  settleMarketBuyNowImpl,
  settleMarketCancelOrderImpl,
  settleMarketMutationImpl,
} from './durable-operation.market-ops';
import {
  claimMailAttachmentsImpl,
  claimMailAttachmentsAttemptImpl,
  claimMarketStorageImpl,
  purchaseNpcShopItemImpl,
} from './durable-operation.mail-ops';
import {
  mutatePlayerWalletImpl,
  grantInventoryItemsImpl,
  commitFormationResourceMutationImpl,
  commitFormationMaintenanceMutationImpl,
} from './durable-operation.asset-ops';

// re-export 供外部工具引用
export { ensureDurableOperationTables } from './durable-operation.sql';



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
 heavenlyDaoShopPurchase?: {
  itemId: string;
  purchaseDate: string;
  quantity: number;
  dailyLimit: number;
 } | null;
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
      kind: 'time_chamber_activation';
      instanceId: string;
      buildingId: string;
      chamberInstanceId: string;
      playerId: string;
      durationHours: number;
      expectedRevision: number;
      chargedSpiritStones: number;
    }
  | DurableTileResourceSourceMutation
  | DurableMineralCrystalSourceMutation
  | DurableActivityAssetSourceMutation
  | DurablePlayerItemUseSourceMutation;

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

interface AssetMutationCompactionOptions {
  operationKey: string;
  accumulatePayloadFields?: readonly string[];
  retainPayloadFields?: readonly string[];
}

export interface AssetMutationCompactionContext {
  operationKey: string;
  operationId: string;
  operationCount: number;
  firstOperationId: string;
  accumulatedTotals: Record<string, number>;
  auditCheckpointDue: boolean;
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

export class DurableOperationShutdownError extends Error {
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
  itemName?: string | null;
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

export type DurableOperationSectionRecorder = (key: string, durationMs: number, count?: number) => void;

export function beginDurableOperationSection(recorder: DurableOperationSectionRecorder | null | undefined): number | null {
  return typeof recorder === 'function' ? performance.now() : null;
}

export function recordDurableOperationSection(
  recorder: DurableOperationSectionRecorder | null | undefined,
  key: string,
  startedAt: number | null,
): void {
  if (typeof recorder !== 'function' || startedAt === null) {
    return;
  }
  const durationMs = performance.now() - startedAt;
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return;
  }
  try {
    recorder(key, durationMs, 1);
  } catch {
    // 性能统计失败不能影响权威资产事务。
  }
}

export function recordDurableOperationCount(
  recorder: DurableOperationSectionRecorder | null | undefined,
  key: string,
  count = 1,
): void {
  if (typeof recorder !== 'function' || !Number.isFinite(count) || count <= 0) {
    return;
  }
  try {
    recorder(key, 0, count);
  } catch {
    // 性能统计失败不能影响权威资产事务。
  }
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
  /** 连续强化中间阶可只提交实际变化行；其他完成类型仍使用完整替换。 */
  assetWriteMode?: 'replace' | 'patch';
  /** patch 模式下本阶明确移除的背包实例。 */
  removedInventoryItemInstanceIds?: string[] | null;
  /** patch 模式下本阶余额归零并应删除的钱包类型。 */
  removedWalletTypes?: string[] | null;
  /** 可选固定维度耗时记录器；诊断失败不得影响资产事务。 */
  recordSectionDuration?: DurableOperationSectionRecorder | null;
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
  pool: Pool | null = null;
  enabled = false;
  closing = false;
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
    let operation = await this.pool.query(
      `SELECT * FROM ${DURABLE_OPERATION_LOG_TABLE} WHERE operation_id = $1 LIMIT 1`,
      [normalizedOperationId],
    );
    if (!operation.rowCount) {
      operation = await this.pool.query(
        `SELECT * FROM ${DURABLE_OPERATION_LOG_TABLE} WHERE request_id = $1 LIMIT 1`,
        [normalizedOperationId],
      );
    }
    const operationRow = operation.rows[0] ?? null;
    const replayOperationIds = Array.from(new Set([
      normalizedOperationId,
      normalizeRequiredString(operationRow?.operation_id),
    ].filter(Boolean)));
    const [outboxEvents, assetAuditLogs] = await Promise.all([
      this.pool.query(
        `
          SELECT *
          FROM ${OUTBOX_EVENT_TABLE}
          WHERE operation_id = ANY($1::varchar[])
          ORDER BY created_at ASC, event_id ASC
        `,
        [replayOperationIds],
      ),
      this.pool.query(
        `
          SELECT *
          FROM ${ASSET_AUDIT_LOG_TABLE}
          WHERE operation_id = ANY($1::varchar[])
          ORDER BY created_at ASC, log_id ASC
        `,
        [replayOperationIds],
      ),
    ]);
    return {
      operation: operationRow,
      outboxEvents: outboxEvents.rows,
      assetAuditLogs: assetAuditLogs.rows,
    };
  }

  /** 事务性领取邮件附件：校验 presence 归属、扣邮件附件、写背包/钱包、记审计日志 */
  async claimMailAttachments(input: ClaimMailAttachmentsInput): Promise<ClaimMailAttachmentsResult> {
    return claimMailAttachmentsImpl(this, input);
  }

  async claimMailAttachmentsAttempt(
    input: ClaimMailAttachmentsInput,
    commitOutcomeRetryRemaining: number,
  ): Promise<ClaimMailAttachmentsResult> {
    return claimMailAttachmentsAttemptImpl(this, input, commitOutcomeRetryRemaining);
  }

  /** 事务性领取市场托管仓物品：校验 presence、转移仓物品到背包、记审计日志 */
  async claimMarketStorage(input: ClaimMarketStorageInput): Promise<ClaimMarketStorageResult> {
    return claimMarketStorageImpl(this, input);
  }

  /** 事务性 NPC 商店购买：扣钱包、写背包、记审计日志和 outbox 事件 */
  async purchaseNpcShopItem(input: PurchaseNpcShopItemInput): Promise<PurchaseNpcShopItemResult> {
    return purchaseNpcShopItemImpl(this, input);
  }

  /** 事务性钱包变更：增减余额/冻结、记审计日志和 outbox 事件 */
  async mutatePlayerWallet(input: MutatePlayerWalletInput): Promise<MutatePlayerWalletResult> {
    return mutatePlayerWalletImpl(this, input);
  }
 /** 读取玩家某日某商品的天道商店已购数量。 */
 async getHeavenlyDaoShopPurchasedCount(playerIdInput: string, itemIdInput: string, purchaseDateInput: string): Promise<number> {
  if (!this.pool || !this.enabled) {
   return 0;
  }
  const playerId = normalizeRequiredString(playerIdInput);
  const itemId = normalizeRequiredString(itemIdInput);
  const purchaseDate = normalizeRequiredString(purchaseDateInput);
  if (!playerId || !itemId || !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
   return 0;
  }
  const result = await this.pool.query<{ purchased_count?: unknown }>(
   `SELECT purchased_count FROM ${PLAYER_HEAVENLY_DAO_SHOP_PURCHASE_TABLE} WHERE player_id = $1 AND item_id = $2 AND purchase_date = $3`,
   [playerId, itemId, purchaseDate],
  );
  return Math.max(0, Math.trunc(Number(result.rows[0]?.purchased_count ?? 0)));
 }


  /** 事务性发放背包物品：写背包快照、记审计日志和 outbox 事件 */
  async grantInventoryItems(input: GrantInventoryItemsInput): Promise<GrantInventoryItemsResult> {
    return grantInventoryItemsImpl(this, input);
  }

  /** 玩家背包、钱包、灵力与阵法资源池同事务提交，供布阵和一次性补给命令使用。 */
  async commitFormationResourceMutation(
    input: CommitFormationResourceMutationInput,
  ): Promise<CommitFormationResourceMutationResult> {
    return commitFormationResourceMutationImpl(this, input);
  }

  /** 阵法维护每息原子提交资产真源；幂等日志按维护任务压缩，避免逐息扩张 outbox 与审计表。 */
  async commitFormationMaintenanceMutation(
    input: CommitFormationMaintenanceMutationInput,
  ): Promise<CommitFormationMaintenanceMutationResult> {
    return commitFormationMaintenanceMutationImpl(this, input);
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
      onMutate: async (client, persistenceVersion) => {
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
          [normalizedPlayerId, persistenceVersion, persistenceVersion, persistenceVersion],
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
      onMutate: async (client, persistenceVersion) => {
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
          [normalizedPlayerId, persistenceVersion, persistenceVersion],
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
      onMutate: async (client, persistenceVersion) => {
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
          [normalizedSellerId, persistenceVersion, persistenceVersion],
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
            [normalizedBuyerId, persistenceVersion],
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
      onMutate: async (client, persistenceVersion) => {
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
          [normalizedBuyerId, persistenceVersion, persistenceVersion],
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
            [normalizedSellerId, persistenceVersion, persistenceVersion],
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
      onMutate: async (client, persistenceVersion) => {
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
          [normalizedPlayerId, persistenceVersion, persistenceVersion],
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
  const rawHeavenlyDaoShopPurchase = input.heavenlyDaoShopPurchase && typeof input.heavenlyDaoShopPurchase === 'object'
   ? input.heavenlyDaoShopPurchase
   : null;
  const heavenlyDaoShopPurchase = rawHeavenlyDaoShopPurchase
   ? {
    itemId: normalizeRequiredString(rawHeavenlyDaoShopPurchase.itemId),
    purchaseDate: normalizeRequiredString(rawHeavenlyDaoShopPurchase.purchaseDate),
    quantity: Math.max(0, Math.trunc(Number(rawHeavenlyDaoShopPurchase.quantity) || 0)),
    dailyLimit: Math.max(0, Math.trunc(Number(rawHeavenlyDaoShopPurchase.dailyLimit) || 0)),
   }
   : null;
  if (rawHeavenlyDaoShopPurchase && (
   !heavenlyDaoShopPurchase?.itemId
   || !/^\d{4}-\d{2}-\d{2}$/.test(heavenlyDaoShopPurchase.purchaseDate)
   || heavenlyDaoShopPurchase.quantity <= 0
   || heavenlyDaoShopPurchase.dailyLimit <= 0
   || heavenlyDaoShopPurchase.quantity > heavenlyDaoShopPurchase.dailyLimit
  )) {
   throw new Error('invalid_heavenly_dao_shop_purchase_quota');
  }
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
   heavenlyDaoShopPurchase,
    };
    const expectedRuntimeOwnerId = normalizeRequiredString(input.expectedRuntimeOwnerId);
    const expectedSessionEpoch = Math.max(0, Math.trunc(Number(input.expectedSessionEpoch ?? 0)));
    const requirePresenceFence = input.requirePresenceFence !== false;
    if (requirePresenceFence && (!expectedRuntimeOwnerId || expectedSessionEpoch <= 0)) {
      throw new Error('market_mutation_session_fence_missing');
    }
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
      const persistenceVersion = nextPlayerPersistenceVersion();
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
   if (heavenlyDaoShopPurchase) {
    const quotaResult = await client.query(
     `INSERT INTO ${PLAYER_HEAVENLY_DAO_SHOP_PURCHASE_TABLE}(player_id, item_id, purchase_date, purchased_count, updated_at)
           VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (player_id, item_id, purchase_date)
           DO UPDATE SET purchased_count = ${PLAYER_HEAVENLY_DAO_SHOP_PURCHASE_TABLE}.purchased_count + EXCLUDED.purchased_count, updated_at = now()
           WHERE ${PLAYER_HEAVENLY_DAO_SHOP_PURCHASE_TABLE}.purchased_count + EXCLUDED.purchased_count <= $5
           RETURNING purchased_count`,
     [normalizedPlayerId, heavenlyDaoShopPurchase.itemId, heavenlyDaoShopPurchase.purchaseDate, heavenlyDaoShopPurchase.quantity, heavenlyDaoShopPurchase.dailyLimit],
    );
    if ((quotaResult.rowCount ?? 0) !== 1) {
     throw new Error('heavenly_dao_shop_daily_limit_exceeded');
    }
   }
      await upsertMarketOrders(client, upsertOrders);
      if (deleteOrderIds.length > 0) {
        await client.query(`DELETE FROM ${MARKET_ORDER_TABLE} WHERE order_id = ANY($1::varchar[])`, [deleteOrderIds]);
      }
      await insertMarketTradeRecords(client, tradeRecords);
      for (const mutation of playerMutations) {
        await persistMarketPlayerMutation(client, mutation, persistenceVersion);
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
    return updateActiveJobStateImpl(this, input);
  }

  /** 事务性开始活跃任务并扣除资产：扣材料/资金、创建任务记录、记审计 */
  async startActiveJobWithAssets(input: StartActiveJobWithAssetsInput): Promise<StartActiveJobWithAssetsResult> {
    return startActiveJobWithAssetsImpl(this, input);
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
    return cancelActiveJobWithAssetsImpl(this, input);
  }

  /** 事务性完成活跃任务并发放产出：写产出物品/资金、删除任务记录、记审计 */
  async completeActiveJobWithAssets(input: CompleteActiveJobWithAssetsInput): Promise<CompleteActiveJobWithAssetsResult> {
    return completeActiveJobWithAssetsImpl(this, input);
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
    let result = await this.pool.query<{ status?: string }>(
      `SELECT status FROM ${DURABLE_OPERATION_LOG_TABLE} WHERE operation_id = $1 LIMIT 1`,
      [normalizedOperationId],
    );
    if (!result.rowCount) {
      result = await this.pool.query<{ status?: string }>(
        `SELECT status FROM ${DURABLE_OPERATION_LOG_TABLE} WHERE request_id = $1 LIMIT 1`,
        [normalizedOperationId],
      );
    }
    const status = normalizeRequiredString(result.rows[0]?.status);
    return status === 'committed' ? 'committed' : status === 'pending' ? 'pending' : null;
  }

  async isOperationCommitted(operationId: string): Promise<boolean> {
    return (await this.getOperationStatus(operationId)) === 'committed';
  }

  async getCompactedOperationStatus(
    operationKey: string,
    operationId: string,
  ): Promise<'pending' | 'committed' | null> {
    if (!this.pool || !this.enabled) {
      throw new Error('durable_operation_service_disabled');
    }
    const result = await this.pool.query<{ status?: unknown; request_id?: unknown }>(
      `SELECT status, request_id FROM ${DURABLE_OPERATION_LOG_TABLE} WHERE operation_id = $1 LIMIT 1`,
      [operationKey],
    );
    if (normalizeRequiredString(result.rows[0]?.request_id) !== operationId) {
      return null;
    }
    const status = normalizeRequiredString(result.rows[0]?.status);
    return status === 'committed' ? 'committed' : status === 'pending' ? 'pending' : null;
  }

  /**
   * COMMIT 回包丢失且首次查询也失败时，调用方仍持有运行态资产锁；这里持续收敛到确定结果，
   * 禁止把 unknown 降级成普通失败后回滚内存，或让周期 flush 越过未决事务。
   */
  async settleUnknownCommitOutcome<TResult>(input: {
    operationId: string;
    cause: unknown;
    affectedPlayerIds?: readonly string[];
    affectedInstanceIds?: readonly string[];
    readStatus?: () => Promise<'pending' | 'committed' | null>;
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
        await this.awaitStatusReadOrShutdown(
          input.readStatus ? input.readStatus() : this.getOperationStatus(input.operationId),
        );
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

  async awaitStatusReadOrShutdown<TResult>(operation: Promise<TResult>): Promise<TResult> {
    return Promise.race([
      operation,
      this.shutdownSignal.promise.then(() => {
        throw new DurableOperationShutdownError();
      }),
    ]);
  }

  releasePoolReference(): void {
    this.pool = null;
    this.enabled = false;
  }

  async executeAssetMutation<TResult>(input: {
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
    compaction?: AssetMutationCompactionOptions | null;
    recordSectionDuration?: DurableOperationSectionRecorder | null;
    onAlreadyCommitted: (client: import('pg').PoolClient, occurredAtMs: number) => Promise<TResult>;
    onMutate: (
      client: import('pg').PoolClient,
      persistenceVersion: number,
      runtimeOwnerId: string,
      sessionEpoch: number,
      compaction: AssetMutationCompactionContext | null,
    ) => Promise<TResult>;
  }, commitOutcomeRetryRemaining = 1): Promise<TResult> {
    if (!this.pool || !this.enabled) {
      throw new Error('durable_operation_service_disabled');
    }

    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeDurableOperationId(input.operationId);
    const normalizedCompactionKey = input.compaction
      ? normalizeDurableOperationId(input.compaction.operationKey)
      : '';
    if (
      !normalizedPlayerId
      || !normalizedOperationId
      || (input.compaction && !normalizedCompactionKey)
    ) {
      throw new Error('invalid_execute_asset_mutation_input');
    }
    const durableOperationKey = normalizedCompactionKey || normalizedOperationId;

    let durableSectionStartedAt = beginDurableOperationSection(input.recordSectionDuration);
    const client = await this.pool.connect();
    recordDurableOperationSection(
      input.recordSectionDuration,
      'instance.craftJob.enhancementDurablePoolWaitMs',
      durableSectionStartedAt,
    );
    let clientReleased = false;
    let commitAttempted = false;
    let commitOutcomeUnknown = false;
    let commitOutcomeCause: unknown = null;
    let mutationResult: TResult | undefined;
    try {
      durableSectionStartedAt = beginDurableOperationSection(input.recordSectionDuration);
      await client.query('BEGIN');
      await acquirePlayerAssetLock(client, normalizedPlayerId);
      recordDurableOperationSection(
        input.recordSectionDuration,
        'instance.craftJob.enhancementDurableBeginLockMs',
        durableSectionStartedAt,
      );

      durableSectionStartedAt = beginDurableOperationSection(input.recordSectionDuration);
      const existingOperation = await client.query<{
        status?: string;
        operation_type?: string;
        aggregate_type?: string;
        player_id?: string;
        request_id?: string;
        payload_jsonb?: unknown;
      }>(
        `
          SELECT status, operation_type, aggregate_type, player_id, request_id, payload_jsonb
          FROM ${DURABLE_OPERATION_LOG_TABLE}
          WHERE operation_id = $1
          FOR UPDATE
        `,
        [durableOperationKey],
      );
      recordDurableOperationSection(
        input.recordSectionDuration,
        'instance.craftJob.enhancementDurableOperationFenceMs',
        durableSectionStartedAt,
      );
      const existingOperationRow = existingOperation.rows[0] ?? null;
      const existingRequestId = normalizeRequiredString(existingOperationRow?.request_id)
        || durableOperationKey;
      const sameCompactedInvocation = Boolean(
        normalizedCompactionKey
        && existingOperationRow
        && existingRequestId === normalizedOperationId
      );
      if (existingOperationRow && normalizedCompactionKey) {
        assertDurableOperationCompactionStreamIdentity(existingOperationRow, {
          operationType: input.operationType,
          aggregateType: input.aggregateType,
          playerId: normalizedPlayerId,
        });
        if (sameCompactedInvocation) {
          assertDurableOperationCompactedReplayIdentity(existingOperationRow, input.payload);
        } else if (normalizeRequiredString(existingOperationRow.status) !== 'committed') {
          throw new Error('durable_operation_compaction_stream_not_committed');
        }
      } else if (existingOperationRow) {
        assertDurableOperationReplayIdentity(existingOperation.rows[0], {
          operationType: input.operationType,
          aggregateType: input.aggregateType,
          playerId: normalizedPlayerId,
          payload: input.payload,
        });
      }
      if (
        existingOperationRow?.status === 'committed'
        && (!normalizedCompactionKey || sameCompactedInvocation)
      ) {
        const committedResult = await input.onAlreadyCommitted(client, Date.now());
        clientReleased = await rollbackTransactionOrDestroyClient(client);
        return committedResult;
      }
      // 版本必须在取得与普通玩家 flush 共用的数据库锁后生成。
      // 否则等待锁期间排队的旧运行态快照可能拿到更大版本，并在 durable 提交后反向覆盖资产真源。
      const persistenceVersion = nextPlayerPersistenceVersion();

      durableSectionStartedAt = beginDurableOperationSection(input.recordSectionDuration);
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
      recordDurableOperationSection(
        input.recordSectionDuration,
        'instance.craftJob.enhancementDurableSessionFenceMs',
        durableSectionStartedAt,
      );
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

      if (!normalizedCompactionKey && existingOperation.rowCount === 0) {
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

      const compactedPayload = normalizedCompactionKey
        ? buildCompactedDurableOperationPayload({
          operationKey: normalizedCompactionKey,
          operationId: normalizedOperationId,
          currentPayload: input.payload,
          previousPayload: existingOperationRow?.payload_jsonb,
          previousOperationId: existingOperationRow ? existingRequestId : null,
          accumulatePayloadFields: input.compaction?.accumulatePayloadFields,
          retainPayloadFields: input.compaction?.retainPayloadFields,
        })
        : null;

      durableSectionStartedAt = beginDurableOperationSection(input.recordSectionDuration);
      mutationResult = await input.onMutate(
        client,
        persistenceVersion,
        persistedRuntimeOwnerId,
        Math.trunc(persistedSessionEpoch),
        compactedPayload?.context ?? null,
      );
      recordDurableOperationSection(
        input.recordSectionDuration,
        'instance.craftJob.enhancementDurableMutationMs',
        durableSectionStartedAt,
      );

      durableSectionStartedAt = beginDurableOperationSection(input.recordSectionDuration);
      if (compactedPayload) {
        if (existingOperationRow) {
          const createdAtRefreshSql = compactedPayload.context.auditCheckpointDue
            ? 'created_at = now(),'
            : '';
          const updateResult = await client.query(
            `
              UPDATE ${DURABLE_OPERATION_LOG_TABLE}
              SET
                runtime_owner_id = $2,
                session_epoch = $3,
                request_id = $4,
                payload_jsonb = $5::jsonb,
                error_code = NULL,
                ${createdAtRefreshSql}
                committed_at = now()
              WHERE operation_id = $1
            `,
            [
              normalizedCompactionKey,
              persistedRuntimeOwnerId,
              Math.trunc(persistedSessionEpoch),
              normalizedOperationId,
              JSON.stringify(compactedPayload.payload),
            ],
          );
          if ((updateResult.rowCount ?? 0) !== 1) {
            throw new Error('durable_operation_compaction_checkpoint_missing');
          }
        } else {
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
                created_at,
                committed_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'committed', now(), now())
            `,
            [
              normalizedCompactionKey,
              input.operationType,
              input.aggregateType,
              normalizedPlayerId,
              normalizedPlayerId,
              persistedRuntimeOwnerId,
              Math.trunc(persistedSessionEpoch),
              normalizedOperationId,
              JSON.stringify(compactedPayload.payload),
            ],
          );
        }
      } else {
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
      }
      recordDurableOperationSection(
        input.recordSectionDuration,
        'instance.craftJob.enhancementDurableOperationLogMs',
        durableSectionStartedAt,
      );

      durableSectionStartedAt = beginDurableOperationSection(input.recordSectionDuration);
      commitAttempted = true;
      await client.query('COMMIT');
      recordDurableOperationSection(
        input.recordSectionDuration,
        'instance.craftJob.enhancementDurableCommitAckMs',
        durableSectionStartedAt,
      );
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
        readStatus: normalizedCompactionKey
          ? () => this.getCompactedOperationStatus(normalizedCompactionKey, normalizedOperationId)
          : undefined,
        onSettled: (retryResult) => normalizeCurrentDurableInvocationResult(retryResult),
        retry: () => this.executeAssetMutation(input, -1),
      });
    }

    throw new Error(`durable_operation_unreachable_state:${normalizedOperationId}`);
  }

  getCurrentNodeId(): string {
    return this.nodeRegistryService?.getNodeId?.() ?? resolveCurrentNodeId();
  }
}

