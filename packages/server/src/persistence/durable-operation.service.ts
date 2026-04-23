import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { NodeRegistryService } from './node-registry.service';
import type { PersistedPlayerSnapshot } from './player-persistence.service';

const PLAYER_PRESENCE_TABLE = 'player_presence';
const PLAYER_WALLET_TABLE = 'player_wallet';
const PLAYER_INVENTORY_ITEM_TABLE = 'player_inventory_item';
const PLAYER_MARKET_STORAGE_ITEM_TABLE = 'player_market_storage_item';
const PLAYER_EQUIPMENT_SLOT_TABLE = 'player_equipment_slot';
const PLAYER_QUEST_PROGRESS_TABLE = 'player_quest_progress';
const PLAYER_ACTIVE_JOB_TABLE = 'player_active_job';
const PLAYER_ENHANCEMENT_RECORD_TABLE = 'player_enhancement_record';
const PLAYER_MAIL_TABLE = 'player_mail';
const PLAYER_MAIL_ATTACHMENT_TABLE = 'player_mail_attachment';
const PLAYER_MAIL_COUNTER_TABLE = 'player_mail_counter';
const PLAYER_RECOVERY_WATERMARK_TABLE = 'player_recovery_watermark';
const PLAYER_SNAPSHOT_TABLE = 'server_player_snapshot';
const DURABLE_OPERATION_LOG_TABLE = 'durable_operation_log';
const OUTBOX_EVENT_TABLE = 'outbox_event';
const ASSET_AUDIT_LOG_TABLE = 'asset_audit_log';
const ASSET_AUDIT_LOG_ARCHIVE_TABLE = 'asset_audit_log_archive';

export interface DurableInventoryItemSnapshot {
  itemId: string;
  count: number;
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
  expectedOwnershipEpoch?: number | null;
  sourceType: string;
  sourceRefId?: string | null;
  grantedItems: DurableInventoryItemSnapshot[];
  nextInventoryItems: DurableInventoryItemSnapshot[];
}

export interface GrantInventoryItemsResult {
  ok: boolean;
  alreadyCommitted: boolean;
  grantedCount: number;
  sourceType: string;
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
}

export interface CompleteActiveJobWithAssetsResult {
  ok: boolean;
  alreadyCommitted: boolean;
  action: 'complete';
  jobRunId: null;
  jobVersion: null;
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

@Injectable()
export class DurableOperationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DurableOperationService.name);
  private pool: Pool | null = null;
  private enabled = false;

  constructor(private readonly nodeRegistryService: NodeRegistryService | null = null) {}

  async onModuleInit(): Promise<void> {
    const databaseUrl = resolveServerDatabaseUrl();
    if (!databaseUrl.trim()) {
      this.logger.log('强持久化事务服务已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
    });

    try {
      await ensureDurableOperationTables(this.pool);
      this.enabled = true;
      this.logger.log('强持久化事务服务已启用');
    } catch (error: unknown) {
      this.logger.error(
        '强持久化事务服务初始化失败，已回退为禁用模式',
        error instanceof Error ? error.stack : String(error),
      );
      await this.safeClosePool();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.safeClosePool();
  }

  isEnabled(): boolean {
    return this.enabled && this.pool !== null;
  }

  async getOperationReplay(operationId: string): Promise<{
    operation: Record<string, unknown> | null;
    outboxEvents: Array<Record<string, unknown>>;
    assetAuditLogs: Array<Record<string, unknown>>;
  }> {
    if (!this.pool || !this.enabled) {
      throw new Error('durable_operation_service_disabled');
    }
    const normalizedOperationId = normalizeRequiredString(operationId);
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

  async claimMailAttachments(input: ClaimMailAttachmentsInput): Promise<ClaimMailAttachmentsResult> {
    if (!this.pool || !this.enabled) {
      throw new Error('durable_operation_service_disabled');
    }

    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeRequiredString(input.operationId);
    const normalizedMailIds = Array.from(
      new Set(
        Array.isArray(input.mailIds)
          ? input.mailIds.map((mailId) => normalizeRequiredString(mailId)).filter(Boolean)
          : [],
      ),
    );
    if (!normalizedPlayerId || !normalizedOperationId || normalizedMailIds.length === 0) {
      throw new Error('invalid_claim_mail_attachments_input');
    }

    const now = Date.now();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await acquirePlayerAssetLock(client, normalizedPlayerId);

      const existingOperation = await client.query<{ status?: string }>(
        `
          SELECT status
          FROM ${DURABLE_OPERATION_LOG_TABLE}
          WHERE operation_id = $1
          FOR UPDATE
        `,
        [normalizedOperationId],
      );
      if (existingOperation.rowCount && existingOperation.rows[0]?.status === 'committed') {
        const existingCounters = await readMailCounters(client, normalizedPlayerId, now);
        await client.query('ROLLBACK');
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
        if (Number.isFinite(row.deleted_at) || Number.isFinite(row.claimed_at)) {
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
          WHERE mail_id = ANY($1::varchar[])
            AND claimed_at IS NULL
          FOR UPDATE
        `,
        [normalizedMailIds],
      );
      if ((attachmentsResult.rowCount ?? 0) === 0) {
        throw new Error('mail_claim_attachments_missing');
      }

      const counterBefore = await client.query<{ welcome_mail_delivered_at?: string | number | null }>(
        `
          SELECT welcome_mail_delivered_at
          FROM ${PLAYER_MAIL_COUNTER_TABLE}
          WHERE player_id = $1
          FOR UPDATE
        `,
        [normalizedPlayerId],
      );
      const welcomeMailDeliveredAt = normalizeOptionalInteger(
        counterBefore.rows[0]?.welcome_mail_delivered_at,
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
          WHERE mail_id = ANY($3::varchar[])
            AND claimed_at IS NULL
        `,
        [normalizedOperationId, now, normalizedMailIds],
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
            counter_version = EXCLUDED.counter_version,
            welcome_mail_delivered_at = COALESCE(EXCLUDED.welcome_mail_delivered_at, ${PLAYER_MAIL_COUNTER_TABLE}.welcome_mail_delivered_at),
            updated_at = now()
        `,
        [normalizedPlayerId, unreadCount, unclaimedCount, latestMailAt, now, welcomeMailDeliveredAt],
      );

      await upsertPlayerSnapshot(client, normalizedPlayerId, input.nextPlayerSnapshot);

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
        [normalizedPlayerId, nextWalletBalances ? now : 0, now, now, now],
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

      await client.query('COMMIT');
      return {
        ok: true,
        alreadyCommitted: false,
        unreadCount,
        unclaimedCount,
      };
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async claimMarketStorage(input: ClaimMarketStorageInput): Promise<ClaimMarketStorageResult> {
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeRequiredString(input.operationId);
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
        await replacePlayerMarketStorageItems(client, normalizedPlayerId, normalizedStorageItems);

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

  async purchaseNpcShopItem(input: PurchaseNpcShopItemInput): Promise<PurchaseNpcShopItemResult> {
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeRequiredString(input.operationId);
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

  async mutatePlayerWallet(input: MutatePlayerWalletInput): Promise<MutatePlayerWalletResult> {
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeRequiredString(input.operationId);
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

  async grantInventoryItems(input: GrantInventoryItemsInput): Promise<GrantInventoryItemsResult> {
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeRequiredString(input.operationId);
    const normalizedSourceType = normalizeRequiredString(input.sourceType) || 'inventory_grant';
    const normalizedSourceRefId = normalizeOptionalString(input.sourceRefId);
    const normalizedGrantedItems = Array.isArray(input.grantedItems) ? input.grantedItems : [];
    const normalizedNextInventoryItems = Array.isArray(input.nextInventoryItems) ? input.nextInventoryItems : [];

    return this.executeAssetMutation<GrantInventoryItemsResult>({
      operationId: normalizedOperationId,
      playerId: normalizedPlayerId,
      expectedRuntimeOwnerId: input.expectedRuntimeOwnerId,
      expectedSessionEpoch: input.expectedSessionEpoch,
      expectedInstanceId: input.expectedInstanceId,
      expectedAssignedNodeId: input.expectedAssignedNodeId,
      expectedOwnershipEpoch: input.expectedOwnershipEpoch,
      operationType: 'player_inventory_grant',
      aggregateType: 'player_inventory_item',
      payload: {
        sourceType: normalizedSourceType,
        sourceRefId: normalizedSourceRefId,
        grantedCount: normalizedGrantedItems.length,
        nextInventoryItemCount: normalizedNextInventoryItems.length,
      },
      onAlreadyCommitted: async () => ({
        ok: true,
        alreadyCommitted: true,
        grantedCount: normalizedGrantedItems.reduce((total, entry) => total + Math.max(0, Math.trunc(Number(entry?.count ?? 0))), 0),
        sourceType: normalizedSourceType,
      }),
      onMutate: async (client, now) => {
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
            'player.inventory.granted',
            normalizedPlayerId,
            JSON.stringify({
              playerId: normalizedPlayerId,
              sourceType: normalizedSourceType,
              sourceRefId: normalizedSourceRefId,
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
            'grant',
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

        return {
          ok: true,
          alreadyCommitted: false,
          grantedCount: normalizedGrantedItems.reduce((total, entry) => total + Math.max(0, Math.trunc(Number(entry?.count ?? 0))), 0),
          sourceType: normalizedSourceType,
        };
      },
    });
  }

  async submitNpcQuestRewards(input: SubmitNpcQuestRewardsInput): Promise<SubmitNpcQuestRewardsResult> {
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeRequiredString(input.operationId);
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

  async updateEquipmentLoadout(input: UpdateEquipmentLoadoutInput): Promise<UpdateEquipmentLoadoutResult> {
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeRequiredString(input.operationId);
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
        await replacePlayerInventoryItems(client, normalizedPlayerId, normalizedInventoryItems);
        await replacePlayerEquipmentSlots(client, normalizedPlayerId, normalizedEquipmentSlots);

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
    const normalizedOperationId = normalizeRequiredString(input.operationId);
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
    const normalizedOperationId = normalizeRequiredString(input.operationId);
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
    const normalizedOperationId = normalizeRequiredString(input.operationId);
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

  async updateActiveJobState(input: UpdateActiveJobStateInput): Promise<UpdateActiveJobStateResult> {
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeRequiredString(input.operationId);
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
        } else if (currentRow.rowCount > 0) {
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

  async startActiveJobWithAssets(input: StartActiveJobWithAssetsInput): Promise<StartActiveJobWithAssetsResult> {
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeRequiredString(input.operationId);
    const normalizedNextInventoryItems = Array.isArray(input.nextInventoryItems) ? input.nextInventoryItems : [];
    const normalizedNextWalletBalances = Array.isArray(input.nextWalletBalances) ? input.nextWalletBalances : [];
    const normalizedNextActiveJob = normalizeActiveJobSnapshot(input.nextActiveJob);
    const normalizedNextEnhancementRecords = Array.isArray(input.nextEnhancementRecords)
      ? normalizeEnhancementRecordSnapshots(normalizedPlayerId, input.nextEnhancementRecords)
      : null;

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
      },
      onAlreadyCommitted: async () => ({
        ok: true,
        alreadyCommitted: true,
        action: 'start',
        jobRunId: normalizedNextActiveJob.jobRunId,
        jobVersion: normalizedNextActiveJob.jobVersion,
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
        if (currentRow.rowCount > 0) {
          const persistedJobRunId = normalizeRequiredString(currentRow.rows[0]?.job_run_id);
          const persistedJobVersion = normalizeOptionalInteger(currentRow.rows[0]?.job_version) ?? 0;
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

        await replacePlayerInventoryItems(client, normalizedPlayerId, normalizedNextInventoryItems);
        await replacePlayerWalletRows(client, normalizedPlayerId, normalizedNextWalletBalances);
        await replacePlayerActiveJob(client, normalizedPlayerId, normalizedNextActiveJob);
        if (Array.isArray(normalizedNextEnhancementRecords)) {
          await replacePlayerEnhancementRecords(client, normalizedPlayerId, normalizedNextEnhancementRecords);
        }

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
          [normalizedPlayerId, now, now + 1, now + 2, Array.isArray(normalizedNextEnhancementRecords) ? now + 3 : 0],
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

  async cancelActiveJobWithAssets(input: CancelActiveJobWithAssetsInput): Promise<CancelActiveJobWithAssetsResult> {
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeRequiredString(input.operationId);
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

        await replacePlayerInventoryItems(client, normalizedPlayerId, normalizedNextInventoryItems);
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

  async completeActiveJobWithAssets(input: CompleteActiveJobWithAssetsInput): Promise<CompleteActiveJobWithAssetsResult> {
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeRequiredString(input.operationId);
    const normalizedExpectedJobRunId = normalizeRequiredString(input.expectedJobRunId);
    const normalizedExpectedJobVersion = Math.max(1, Math.trunc(Number(input.expectedJobVersion ?? 1)));
    const normalizedNextInventoryItems = Array.isArray(input.nextInventoryItems) ? input.nextInventoryItems : [];
    const normalizedNextWalletBalances = Array.isArray(input.nextWalletBalances) ? input.nextWalletBalances : [];
    const normalizedNextEquipmentSlots = Array.isArray(input.nextEquipmentSlots) ? input.nextEquipmentSlots : null;
    const normalizedNextEnhancementRecords = Array.isArray(input.nextEnhancementRecords)
      ? normalizeEnhancementRecordSnapshots(normalizedPlayerId, input.nextEnhancementRecords)
      : null;

    if (!normalizedExpectedJobRunId) {
      throw new Error('invalid_complete_active_job_with_assets_input');
    }

    return this.executeAssetMutation<CompleteActiveJobWithAssetsResult>({
      operationId: normalizedOperationId,
      playerId: normalizedPlayerId,
      expectedRuntimeOwnerId: input.expectedRuntimeOwnerId,
      expectedSessionEpoch: input.expectedSessionEpoch,
      expectedInstanceId: input.expectedInstanceId,
      expectedAssignedNodeId: input.expectedAssignedNodeId,
      expectedOwnershipEpoch: input.expectedOwnershipEpoch,
      operationType: 'active_job_complete_with_assets',
      aggregateType: 'player_active_job',
      payload: {
        action: 'complete',
        expectedJobRunId: normalizedExpectedJobRunId,
        expectedJobVersion: normalizedExpectedJobVersion,
        inventoryItemCount: normalizedNextInventoryItems.length,
        walletBalanceCount: normalizedNextWalletBalances.length,
        equipmentSlotCount: Array.isArray(normalizedNextEquipmentSlots) ? normalizedNextEquipmentSlots.length : 0,
        enhancementRecordCount: Array.isArray(normalizedNextEnhancementRecords) ? normalizedNextEnhancementRecords.length : 0,
      },
      onAlreadyCommitted: async () => ({
        ok: true,
        alreadyCommitted: true,
        action: 'complete',
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

        await replacePlayerInventoryItems(client, normalizedPlayerId, normalizedNextInventoryItems);
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
            'player.active_job.completed',
            normalizedPlayerId,
            JSON.stringify({
              playerId: normalizedPlayerId,
              action: 'complete',
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
            'complete',
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
          action: 'complete',
          jobRunId: null,
          jobVersion: null,
        };
      },
    });
  }

  private async safeClosePool(): Promise<void> {
    const pool = this.pool;
    this.pool = null;
    this.enabled = false;
    if (pool) {
      await pool.end().catch(() => undefined);
    }
  }

  private async executeAssetMutation<TResult>(input: {
    operationId: string;
    playerId: string;
    expectedRuntimeOwnerId: string;
    expectedSessionEpoch: number;
    expectedInstanceId?: string | null;
    expectedAssignedNodeId?: string | null;
    expectedOwnershipEpoch?: number | null;
    operationType: string;
    aggregateType: string;
    payload: unknown;
    onAlreadyCommitted: (client: import('pg').PoolClient, now: number) => Promise<TResult>;
    onMutate: (client: import('pg').PoolClient, now: number, runtimeOwnerId: string, sessionEpoch: number) => Promise<TResult>;
  }): Promise<TResult> {
    if (!this.pool || !this.enabled) {
      throw new Error('durable_operation_service_disabled');
    }

    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeRequiredString(input.operationId);
    if (!normalizedPlayerId || !normalizedOperationId) {
      throw new Error('invalid_execute_asset_mutation_input');
    }

    const now = Date.now();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await acquirePlayerAssetLock(client, normalizedPlayerId);

      const existingOperation = await client.query<{ status?: string }>(
        `
          SELECT status
          FROM ${DURABLE_OPERATION_LOG_TABLE}
          WHERE operation_id = $1
          FOR UPDATE
        `,
        [normalizedOperationId],
      );
      if (existingOperation.rowCount && existingOperation.rows[0]?.status === 'committed') {
        const committedResult = await input.onAlreadyCommitted(client, now);
        await client.query('ROLLBACK');
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

      const result = await input.onMutate(client, now, persistedRuntimeOwnerId, Math.trunc(persistedSessionEpoch));

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

      await client.query('COMMIT');
      return result;
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private getCurrentNodeId(): string {
    return this.nodeRegistryService?.getNodeId?.() ?? resolveCurrentNodeId();
  }
}

async function acquirePlayerAssetLock(
  client: import('pg').PoolClient,
  playerId: string,
): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock($1::integer, hashtext($2))', [7101, playerId]);
}

async function ensureDurableOperationTables(pool: Pool): Promise<void> {
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
        attempt_count integer NOT NULL DEFAULT 0,
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
      CREATE INDEX IF NOT EXISTS outbox_event_partition_claim_idx
      ON ${OUTBOX_EVENT_TABLE}(partition_key, status, claim_until, created_at DESC)
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
        operation_id varchar(120) NOT NULL,
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
        count integer,
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
        unread_count integer NOT NULL DEFAULT 0,
        unclaimed_count integer NOT NULL DEFAULT 0,
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
        slot_index integer NOT NULL,
        item_id varchar(120) NOT NULL,
        count integer NOT NULL,
        raw_payload jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(player_id, slot_index)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_MARKET_STORAGE_ITEM_TABLE} (
        storage_item_id varchar(180) PRIMARY KEY,
        player_id varchar(100) NOT NULL,
        slot_index integer NOT NULL,
        item_id varchar(120) NOT NULL,
        count integer NOT NULL DEFAULT 1,
        enhance_level integer,
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
        paused_ticks integer NOT NULL DEFAULT 0,
        total_ticks integer NOT NULL DEFAULT 0,
        remaining_ticks integer NOT NULL DEFAULT 0,
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
      CREATE TABLE IF NOT EXISTS ${PLAYER_ENHANCEMENT_RECORD_TABLE} (
        record_id varchar(180) PRIMARY KEY,
        player_id varchar(100) NOT NULL,
        item_id varchar(120) NOT NULL,
        highest_level integer NOT NULL DEFAULT 0,
        levels_payload jsonb NOT NULL DEFAULT '[]'::jsonb,
        action_started_at bigint,
        action_ended_at bigint,
        start_level integer,
        initial_target_level integer,
        desired_target_level integer,
        protection_start_level integer,
        status varchar(32),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS player_enhancement_record_player_idx
      ON ${PLAYER_ENHANCEMENT_RECORD_TABLE}(player_id, item_id ASC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_PRESENCE_TABLE} (
        player_id varchar(100) PRIMARY KEY,
        online boolean NOT NULL DEFAULT false,
        in_world boolean NOT NULL DEFAULT false,
        last_heartbeat_at bigint,
        offline_since_at bigint,
        runtime_owner_id varchar(120),
        session_epoch bigint NOT NULL DEFAULT 1,
        transfer_state varchar(32),
        transfer_target_node_id varchar(120),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_RECOVERY_WATERMARK_TABLE} (
        player_id varchar(100) PRIMARY KEY,
        wallet_version bigint NOT NULL DEFAULT 0,
        inventory_version bigint NOT NULL DEFAULT 0,
        market_storage_version bigint NOT NULL DEFAULT 0,
        equipment_version bigint NOT NULL DEFAULT 0,
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
      ADD COLUMN IF NOT EXISTS active_job_version bigint NOT NULL DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE ${PLAYER_RECOVERY_WATERMARK_TABLE}
      ADD COLUMN IF NOT EXISTS enhancement_record_version bigint NOT NULL DEFAULT 0
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PLAYER_SNAPSHOT_TABLE} (
        player_id varchar(100) PRIMARY KEY,
        template_id varchar(120) NOT NULL,
        instance_id varchar(160),
        persisted_source varchar(32) NOT NULL,
        seeded_at bigint,
        saved_at bigint NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        payload jsonb NOT NULL
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

async function replacePlayerInventoryItems(
  client: import('pg').PoolClient,
  playerId: string,
  items: DurableInventoryItemSnapshot[],
): Promise<void> {
  await client.query(`DELETE FROM ${PLAYER_INVENTORY_ITEM_TABLE} WHERE player_id = $1`, [playerId]);
  if (!Array.isArray(items) || items.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let parameterIndex = 1;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const itemId = normalizeRequiredString(item?.itemId);
    if (!itemId) {
      continue;
    }
    placeholders.push(
      `($${parameterIndex}, $${parameterIndex + 1}, $${parameterIndex + 2}, $${parameterIndex + 3}, $${parameterIndex + 4}, $${parameterIndex + 5}::jsonb, now())`,
    );
    values.push(
      `inv:${playerId}:${index}`,
      playerId,
      index,
      itemId,
      Math.max(1, Math.trunc(Number(item.count ?? 1))),
      JSON.stringify(item.rawPayload ?? item),
    );
    parameterIndex += 6;
  }

  if (placeholders.length === 0) {
    return;
  }

  await client.query(
    `
      INSERT INTO ${PLAYER_INVENTORY_ITEM_TABLE}(
        item_instance_id,
        player_id,
        slot_index,
        item_id,
        count,
        raw_payload,
        updated_at
      )
      VALUES ${placeholders.join(',\n')}
    `,
    values,
  );
}

async function replacePlayerMarketStorageItems(
  client: import('pg').PoolClient,
  playerId: string,
  items: readonly DurableMarketStorageItemSnapshot[],
): Promise<void> {
  await client.query(`DELETE FROM ${PLAYER_MARKET_STORAGE_ITEM_TABLE} WHERE player_id = $1`, [playerId]);
  if (!Array.isArray(items) || items.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let parameterIndex = 1;
  for (let index = 0; index < items.length; index += 1) {
    const entry = items[index];
    const itemId = normalizeRequiredString(entry?.itemId);
    if (!itemId) {
      continue;
    }
    const slotIndex = Number.isFinite(entry?.slotIndex) ? Math.max(0, Math.trunc(Number(entry.slotIndex))) : index;
    const storageItemId = normalizeRequiredString(entry?.storageItemId) || `market_storage:${playerId}:${slotIndex}`;
    const count = Math.max(1, Math.trunc(Number(entry?.count ?? 1)));
    const enhanceLevel = Number.isFinite(entry?.enhanceLevel)
      ? Math.max(0, Math.trunc(Number(entry.enhanceLevel)))
      : null;
    const rawPayload =
      entry?.rawPayload && typeof entry.rawPayload === 'object'
        ? entry.rawPayload
        : {
            itemId,
            count,
            ...(enhanceLevel == null ? {} : { enhanceLevel }),
          };
    placeholders.push(
      `($${parameterIndex}, $${parameterIndex + 1}, $${parameterIndex + 2}, $${parameterIndex + 3}, $${parameterIndex + 4}, $${parameterIndex + 5}, $${parameterIndex + 6}::jsonb, now())`,
    );
    values.push(
      storageItemId,
      playerId,
      slotIndex,
      itemId,
      count,
      enhanceLevel,
      JSON.stringify({
        ...(rawPayload as Record<string, unknown>),
        itemId,
        count,
        ...(enhanceLevel == null ? {} : { enhanceLevel }),
      }),
    );
    parameterIndex += 7;
  }

  if (placeholders.length === 0) {
    return;
  }

  await client.query(
    `
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
      VALUES ${placeholders.join(',\n')}
    `,
    values,
  );
}

async function replacePlayerEquipmentSlots(
  client: import('pg').PoolClient,
  playerId: string,
  slots: readonly DurableEquipmentSlotSnapshot[],
): Promise<void> {
  await client.query(`DELETE FROM ${PLAYER_EQUIPMENT_SLOT_TABLE} WHERE player_id = $1`, [playerId]);
  if (!Array.isArray(slots) || slots.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let parameterIndex = 1;
  for (const slotEntry of slots) {
    const slotType = normalizeRequiredString(slotEntry?.slot);
    const item = slotEntry?.item && typeof slotEntry.item === 'object'
      ? slotEntry.item as Record<string, unknown>
      : null;
    const itemId = normalizeRequiredString(item?.itemId);
    if (!slotType || !itemId) {
      continue;
    }
    const itemInstanceId =
      normalizeRequiredString(slotEntry?.itemInstanceId)
      || normalizeRequiredString(item?.itemInstanceId)
      || `equip:${playerId}:${slotType}`;
    placeholders.push(
      `($${parameterIndex}, $${parameterIndex + 1}, $${parameterIndex + 2}, $${parameterIndex + 3}, $${parameterIndex + 4}::jsonb, now())`,
    );
    values.push(
      playerId,
      slotType,
      itemInstanceId,
      itemId,
      JSON.stringify(item),
    );
    parameterIndex += 5;
  }

  if (placeholders.length === 0) {
    return;
  }

  await client.query(
    `
      INSERT INTO ${PLAYER_EQUIPMENT_SLOT_TABLE}(
        player_id,
        slot_type,
        item_instance_id,
        item_id,
        raw_payload,
        updated_at
      )
      VALUES ${placeholders.join(',\n')}
    `,
    values,
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
  await client.query(`DELETE FROM ${PLAYER_ENHANCEMENT_RECORD_TABLE} WHERE player_id = $1`, [playerId]);
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let parameterIndex = 1;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const itemId = normalizeRequiredString(row?.itemId);
    if (!itemId) {
      continue;
    }
    const recordId =
      normalizeRequiredString(row?.recordId)
      || `enhancement_record:${playerId}:${itemId}:${index}`;
    placeholders.push(
      `($${parameterIndex}, $${parameterIndex + 1}, $${parameterIndex + 2}, $${parameterIndex + 3}, $${parameterIndex + 4}::jsonb, $${parameterIndex + 5}, $${parameterIndex + 6}, $${parameterIndex + 7}, $${parameterIndex + 8}, $${parameterIndex + 9}, $${parameterIndex + 10}, $${parameterIndex + 11}, now())`,
    );
    values.push(
      recordId,
      playerId,
      itemId,
      Math.max(0, Math.trunc(Number(row?.highestLevel ?? 0))),
      JSON.stringify(Array.isArray(row?.levels) ? row.levels : []),
      normalizeOptionalInteger(row?.actionStartedAt),
      normalizeOptionalInteger(row?.actionEndedAt),
      normalizeOptionalInteger(row?.startLevel),
      normalizeOptionalInteger(row?.initialTargetLevel),
      normalizeOptionalInteger(row?.desiredTargetLevel),
      normalizeOptionalInteger(row?.protectionStartLevel),
      normalizeOptionalString(row?.status),
    );
    parameterIndex += 12;
  }

  if (placeholders.length === 0) {
    return;
  }

  await client.query(
    `
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
      VALUES ${placeholders.join(',\n')}
    `,
    values,
  );
}

async function replacePlayerQuestProgressRows(
  client: import('pg').PoolClient,
  playerId: string,
  rows: readonly DurableQuestProgressSnapshot[],
): Promise<void> {
  await client.query(`DELETE FROM ${PLAYER_QUEST_PROGRESS_TABLE} WHERE player_id = $1`, [playerId]);
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let parameterIndex = 1;
  for (const row of rows) {
    const questId = normalizeRequiredString(row?.questId);
    if (!questId) {
      continue;
    }
    placeholders.push(
      `($${parameterIndex}, $${parameterIndex + 1}, $${parameterIndex + 2}, $${parameterIndex + 3}::jsonb, $${parameterIndex + 4}::jsonb, now())`,
    );
    values.push(
      playerId,
      questId,
      normalizeOptionalString(row?.status) ?? 'active',
      JSON.stringify(normalizeQuestProgressPayload(row?.progressPayload)),
      JSON.stringify(normalizeQuestRawPayload(row?.rawPayload, questId, row?.status)),
    );
    parameterIndex += 5;
  }

  if (placeholders.length === 0) {
    return;
  }

  await client.query(
    `
      INSERT INTO ${PLAYER_QUEST_PROGRESS_TABLE}(
        player_id,
        quest_id,
        status,
        progress_payload,
        raw_payload,
        updated_at
      )
      VALUES ${placeholders.join(',\n')}
    `,
    values,
  );
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
      progressPayload: normalizeQuestProgressPayload(snapshot?.progressPayload),
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
    progress: null,
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
        SELECT mail_id, created_at, read_at
        FROM ${PLAYER_MAIL_TABLE}
        WHERE player_id = $1
          AND deleted_at IS NULL
          AND (expire_at IS NULL OR expire_at > $2)
      ),
      claimable_mail AS (
        SELECT DISTINCT attachment.mail_id
        FROM ${PLAYER_MAIL_ATTACHMENT_TABLE} attachment
        JOIN visible_mail mail ON mail.mail_id = attachment.mail_id
        WHERE attachment.claimed_at IS NULL
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
  return {
    unreadCount: Math.max(0, Math.trunc(Number(counterRow.unread_count ?? 0))),
    unclaimedCount: Math.max(0, Math.trunc(Number(counterRow.unclaimed_count ?? 0))),
    latestMailAt: Number.isFinite(counterRow.latest_mail_at)
      ? Math.trunc(Number(counterRow.latest_mail_at))
      : null,
  };
}

async function upsertPlayerSnapshot(
  client: import('pg').PoolClient,
  playerId: string,
  snapshot: PersistedPlayerSnapshot,
): Promise<void> {
  const templateId =
    typeof snapshot?.placement?.templateId === 'string' ? snapshot.placement.templateId.trim() : '';
  if (!templateId) {
    throw new Error('invalid_next_player_snapshot');
  }
  const instanceId =
    typeof snapshot?.placement?.instanceId === 'string' && snapshot.placement.instanceId.trim()
      ? snapshot.placement.instanceId.trim()
      : `public:${templateId}`;
  const savedAt = Number.isFinite(snapshot?.savedAt)
    ? Math.max(0, Math.trunc(Number(snapshot.savedAt)))
    : Date.now();
  await client.query(
    `
      INSERT INTO ${PLAYER_SNAPSHOT_TABLE}(
        player_id,
        template_id,
        instance_id,
        persisted_source,
        seeded_at,
        saved_at,
        updated_at,
        payload
      )
      VALUES ($1, $2, $3, $4, NULL, $5, now(), $6::jsonb)
      ON CONFLICT (player_id)
      DO UPDATE SET
        template_id = EXCLUDED.template_id,
        instance_id = EXCLUDED.instance_id,
        persisted_source = EXCLUDED.persisted_source,
        seeded_at = EXCLUDED.seeded_at,
        saved_at = EXCLUDED.saved_at,
        updated_at = now(),
        payload = EXCLUDED.payload
    `,
    [playerId, templateId, instanceId, 'native', savedAt, JSON.stringify(snapshot)],
  );
}

function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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

async function replacePlayerWalletRows(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  playerId: string,
  balances: readonly unknown[],
): Promise<void> {
  await client.query(`DELETE FROM ${PLAYER_WALLET_TABLE} WHERE player_id = $1`, [playerId]);
  if (!Array.isArray(balances) || balances.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let index = 1;
  for (const row of balances) {
    const walletType = normalizeRequiredString((row as { walletType?: unknown })?.walletType);
    if (!walletType) {
      continue;
    }
    const balance = Math.max(0, Math.trunc(Number((row as { balance?: unknown })?.balance ?? 0)));
    const frozenBalance = Math.max(0, Math.trunc(Number((row as { frozenBalance?: unknown })?.frozenBalance ?? 0)));
    const version = Math.max(1, Math.trunc(Number((row as { version?: unknown })?.version ?? 1)));
    placeholders.push(`($${index}, $${index + 1}, $${index + 2}, $${index + 3}, $${index + 4}, now())`);
    values.push(playerId, walletType, balance, frozenBalance, version);
    index += 5;
  }

  if (placeholders.length === 0) {
    return;
  }

  await client.query(
    `
      INSERT INTO ${PLAYER_WALLET_TABLE}(
        player_id,
        wallet_type,
        balance,
        frozen_balance,
        version,
        updated_at
      )
      VALUES ${placeholders.join(',\n')}
    `,
    values,
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
    expectedOwnershipEpoch?: number | null | undefined;
    currentNodeId: string;
  },
): Promise<void> {
  const normalizedInstanceId = normalizeRequiredString(input.expectedInstanceId);
  if (!normalizedInstanceId) {
    return;
  }
  const normalizedExpectedAssignedNodeId = normalizeRequiredString(input.expectedAssignedNodeId);
  const normalizedExpectedOwnershipEpoch = normalizeOptionalInteger(input.expectedOwnershipEpoch);
  const currentNodeId = normalizeRequiredString(input.currentNodeId);

  const result = await client.query<{
    assigned_node_id?: string | null;
    lease_token?: string | null;
    lease_expire_at?: string | Date | null;
    ownership_epoch?: string | number | null;
  }>(
    `
      SELECT assigned_node_id, lease_token, lease_expire_at, ownership_epoch
      FROM instance_catalog
      WHERE instance_id = $1
      FOR UPDATE
    `,
    [normalizedInstanceId],
  );
  if (result.rowCount === 0) {
    throw new Error(`instance_lease_missing:${normalizedInstanceId}`);
  }

  const row = result.rows[0] ?? null;
  const assignedNodeId = normalizeRequiredString(row?.assigned_node_id);
  const leaseToken = normalizeRequiredString(row?.lease_token);
  const leaseExpireAt = row?.lease_expire_at ? new Date(row.lease_expire_at).getTime() : 0;
  const ownershipEpoch = normalizeOptionalInteger(row?.ownership_epoch);
  if (
    !assignedNodeId
    || !leaseToken
    || assignedNodeId !== currentNodeId
    || (normalizedExpectedAssignedNodeId && assignedNodeId !== normalizedExpectedAssignedNodeId)
    || (normalizedExpectedOwnershipEpoch != null && ownershipEpoch !== normalizedExpectedOwnershipEpoch)
    || !Number.isFinite(leaseExpireAt)
    || leaseExpireAt <= Date.now()
  ) {
    throw new Error(
      [
        'instance_lease_fencing_conflict',
        `instanceId=${normalizedInstanceId}`,
        `expectedNodeId=${currentNodeId || 'null'}`,
        `expectedAssignedNodeId=${normalizedExpectedAssignedNodeId || 'null'}`,
        `expectedOwnershipEpoch=${normalizedExpectedOwnershipEpoch ?? 'null'}`,
        `assignedNodeId=${assignedNodeId || 'null'}`,
        `ownershipEpoch=${ownershipEpoch ?? 'null'}`,
        `leaseToken=${leaseToken || 'null'}`,
        `leaseExpireAt=${Number.isFinite(leaseExpireAt) ? new Date(leaseExpireAt).toISOString() : 'null'}`,
      ].join(':'),
    );
  }
}

function resolveCurrentNodeId(): string {
  const explicit = typeof process.env.SERVER_NODE_ID === 'string' ? process.env.SERVER_NODE_ID.trim() : '';
  if (explicit) {
    return explicit;
  }
  return `${require('node:os').hostname().trim() || 'node'}:${process.pid}:${require('node:crypto').randomUUID().slice(0, 8)}`;
}
