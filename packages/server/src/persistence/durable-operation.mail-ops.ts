/**
 * durable-operation.mail-ops.ts
 *
 * 从 durable-operation.service.ts 拆出的邮件领取、市场仓储领取、NPC 商店购买方法实现。
 * 原类保留一行委托壳，实际逻辑在此文件中以 xxxImpl(self, ...) 形式实现。
 * 不包含 @Injectable provider，不修改持久化语义。
 */
import type { DurableOperationService } from './durable-operation.service';
import {
  DurableOperationCommitOutcomeUnknownError,
  type ClaimMailAttachmentsInput,
  type ClaimMailAttachmentsResult,
  type ClaimMarketStorageInput,
  type ClaimMarketStorageResult,
  type PurchaseNpcShopItemInput,
  type PurchaseNpcShopItemResult,
  type DurableInventoryItemSnapshot,
  type DurableWalletBalanceSnapshot,
  type DurableMarketStorageItemSnapshot,
} from './durable-operation.service';
import { MAIL_BATCH_OPERATION_MAX } from '@mud/shared';
import { nextPlayerPersistenceVersion } from './player-domain-persistence.service';
import {
  normalizeRequiredString,
  acquirePlayerAssetLock,
  rollbackTransactionOrDestroyClient,
  disposeFailedDurableTransactionClient,
  PLAYER_PRESENCE_TABLE,
  PLAYER_RECOVERY_WATERMARK_TABLE,
  PLAYER_MAIL_TABLE,
  PLAYER_MAIL_ATTACHMENT_TABLE,
  PLAYER_MAIL_COUNTER_TABLE,
  DURABLE_OPERATION_LOG_TABLE,
  OUTBOX_EVENT_TABLE,
  ASSET_AUDIT_LOG_TABLE,
} from './durable-operation.sql';
import {
  normalizeDurableOperationId,
  normalizeOptionalInteger,
  assertDurableOperationReplayIdentity,
  assertInstanceLeaseWritable,
  replacePlayerInventoryItems,
  replacePlayerWalletRows,
  replacePlayerMarketStorageItems,
  readMailCounters,
  insertDurableOperationLog,
  insertAssetAuditLog,
  insertDurableOutboxEvent,
} from './durable-operation.persistence';

export async function claimMailAttachmentsImpl(
  self: DurableOperationService,
  input: ClaimMailAttachmentsInput): Promise<ClaimMailAttachmentsResult> {
    return claimMailAttachmentsAttemptImpl(self, input, 1);
  }

export async function claimMailAttachmentsAttemptImpl(
  self: DurableOperationService,
  
    input: ClaimMailAttachmentsInput,
    commitOutcomeRetryRemaining: number,
  ): Promise<ClaimMailAttachmentsResult> {
    if (!self.pool || !self.enabled) {
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

    const client = await self.pool.connect();
    let clientReleased = false;
    let commitAttempted = false;
    let commitOutcomeUnknown = false;
    let commitOutcomeCause: unknown = null;
    let mutationResult: ClaimMailAttachmentsResult | null = null;
    try {
      await client.query('BEGIN');
      await acquirePlayerAssetLock(client, normalizedPlayerId);
      const occurredAtMs = Date.now();

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
        const existingCounters = await readMailCounters(client, normalizedPlayerId, occurredAtMs);
        clientReleased = await rollbackTransactionOrDestroyClient(client);
        return {
          ok: true,
          alreadyCommitted: true,
          unreadCount: existingCounters.unreadCount,
          unclaimedCount: existingCounters.unclaimedCount,
        };
      }
      const persistenceVersion = nextPlayerPersistenceVersion(occurredAtMs);

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
        currentNodeId: self.getCurrentNodeId(),
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
        if (Number.isFinite(expireAt) && expireAt > 0 && expireAt <= occurredAtMs) {
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
        [normalizedOperationId, occurredAtMs, normalizedPlayerId, normalizedMailIds],
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
        [occurredAtMs, normalizedPlayerId, normalizedMailIds],
      );

      const counters = await readMailCounters(client, normalizedPlayerId, occurredAtMs);
      const unreadCount = counters.unreadCount;
      const unclaimedCount = counters.unclaimedCount;
      const latestMailAt = counters.latestMailAt;
      const counterVersion = Math.max(persistenceVersion, previousCounterVersion + 1);

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
        [
          normalizedPlayerId,
          nextWalletBalances ? persistenceVersion : 0,
          persistenceVersion,
          persistenceVersion,
          counterVersion,
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
        shuttingDown: self.closing,
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
      return self.settleUnknownCommitOutcome({
        operationId: normalizedOperationId,
        cause: commitOutcomeCause,
        affectedPlayerIds: [normalizedPlayerId],
        affectedInstanceIds: [normalizeRequiredString(input.expectedInstanceId)].filter(Boolean),
        onSettled: (retryResult) => ({ ...retryResult, alreadyCommitted: false }),
        retry: () => claimMailAttachmentsAttemptImpl(self, input, -1),
      });
    }

    throw new Error(`mail_claim_unreachable_state:${normalizedOperationId}`);
  }

export async function claimMarketStorageImpl(
  self: DurableOperationService,
  input: ClaimMarketStorageInput): Promise<ClaimMarketStorageResult> {
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeDurableOperationId(input.operationId);
    const normalizedInventoryItems = Array.isArray(input.nextInventoryItems) ? input.nextInventoryItems : [];
    const normalizedStorageItems = Array.isArray(input.nextMarketStorageItems) ? input.nextMarketStorageItems : [];
    const movedCount = Math.max(0, Math.trunc(Number(input.movedCount ?? 0)));
    const remainingCount = Math.max(0, Math.trunc(Number(input.remainingCount ?? 0)));
    return self.executeAssetMutation<ClaimMarketStorageResult>({
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
      onMutate: async (client, persistenceVersion) => {
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

export async function purchaseNpcShopItemImpl(
  self: DurableOperationService,
  input: PurchaseNpcShopItemInput): Promise<PurchaseNpcShopItemResult> {
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

    return self.executeAssetMutation<PurchaseNpcShopItemResult>({
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
      onMutate: async (client, persistenceVersion) => {
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

