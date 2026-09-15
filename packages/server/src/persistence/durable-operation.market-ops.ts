/**
 * durable-operation.market-ops.ts
 *
 * 从 durable-operation.service.ts 拆出的市场操作方法实现。
 * 原类保留一行委托壳，实际逻辑在此文件中以 xxxImpl(self, ...) 形式实现。
 * 不包含 @Injectable provider，不修改持久化语义。
 */
import type { DurableOperationService } from './durable-operation.service';
import type { DurableMarketMutationInput, DurableInventoryItemSnapshot, DurableWalletBalanceSnapshot, DurableMarketBuyNowMatchSnapshot } from './durable-operation.service';
import { DurableOperationCommitOutcomeUnknownError } from './durable-operation.service';
import { nextPlayerPersistenceVersion } from './player-domain-persistence.service';
import {
  normalizeRequiredString,
  acquirePlayerAssetLock,
  rollbackTransactionOrDestroyClient,
  disposeFailedDurableTransactionClient,
  MARKET_ORDER_TABLE,
  MARKET_TRADE_TABLE,
  PLAYER_PRESENCE_TABLE,
  PLAYER_RECOVERY_WATERMARK_TABLE,
  PLAYER_HEAVENLY_DAO_SHOP_PURCHASE_TABLE,
  DURABLE_OPERATION_LOG_TABLE,
  OUTBOX_EVENT_TABLE,
  ASSET_AUDIT_LOG_TABLE,
  ASSET_AUDIT_LOG_ARCHIVE_TABLE,
} from './durable-operation.sql';
import {
  normalizeDurableOperationId,
  normalizeOptionalInteger,
  normalizeOptionalString,
  normalizePositiveInteger,
  normalizeStringList,
  normalizeMarketPlayerMutations,
  normalizeMarketExpectedOrders,
  assertMarketExpectedOrders,
  assertMarketParticipantPresenceFences,
  advancePlayerPresenceSessionFence,
  buildMarketSessionFenceConflictMessage,
  insertDurableOperationLog,
  insertMarketTradeRecords,
  upsertMarketOrders,
  persistMarketPlayerMutation,
  persistDurableMarketBanUser,
  insertDurableOutboxEvent,
  insertAssetAuditLog,
  upsertCompactedAssetAuditLog,
  buildAssetAuditLogId,
  buildDurableOperationCompactionKey,
  buildCompactedDurableOperationPayload,
  assertDurableMarketOperationReplayIdentity,
  assertDurableOperationCompactedReplayIdentity,
  assertDurableOperationCompactionStreamIdentity,
  assertDurableOperationReplayIdentity,
  waitForDurableOperationReconciliation,
  replacePlayerInventoryItems,
  replacePlayerWalletRows,
  assertInstanceLeaseWritable,
  normalizeCurrentDurableInvocationResult,
} from './durable-operation.persistence';

export async function settleMarketSellNowImpl(
  self: DurableOperationService,
  input: {
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

    return self.executeAssetMutation<{ ok: boolean; alreadyCommitted: boolean }>({
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

export async function settleMarketBuyNowImpl(
  self: DurableOperationService,
  input: {
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

    return self.executeAssetMutation<{ ok: boolean; alreadyCommitted: boolean }>({
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

export async function settleMarketCancelOrderImpl(
  self: DurableOperationService,
  input: {
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

    return self.executeAssetMutation<{ ok: boolean; alreadyCommitted: boolean }>({
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

export async function settleMarketMutationImpl(
  self: DurableOperationService,
  input: DurableMarketMutationInput): Promise<{ ok: boolean; alreadyCommitted: boolean }> {
    return settleMarketMutationAttemptImpl(self, input, 1);
  }

export async function settleMarketMutationAttemptImpl(
  self: DurableOperationService,
  
    input: DurableMarketMutationInput,
    commitOutcomeRetryRemaining: number,
  ): Promise<{ ok: boolean; alreadyCommitted: boolean }> {
    if (!self.pool || !self.enabled) {
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
    const client = await self.pool.connect();
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
          currentNodeId: self.getCurrentNodeId(),
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
        affectedPlayerIds: Array.from(new Set([normalizedPlayerId, ...playerMutations.map((entry) => entry.playerId)])),
        affectedInstanceIds: [normalizeRequiredString(input.expectedInstanceId)].filter(Boolean),
        onSettled: (retryResult) => ({ ...retryResult, alreadyCommitted: false }),
        retry: () => settleMarketMutationAttemptImpl(self, input, -1),
      });
    }

    throw new Error(`market_mutation_unreachable_state:${normalizedOperationId}`);
  }

