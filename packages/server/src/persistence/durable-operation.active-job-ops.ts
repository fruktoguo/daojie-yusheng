/**
 * durable-operation.active-job-ops.ts
 *
 * 从 durable-operation.service.ts 拆出的活跃任务操作方法实现。
 * 原类保留一行委托壳，实际逻辑在此文件中以 xxxImpl(self, ...) 形式实现。
 * 不包含 @Injectable provider，不修改持久化语义。
 */
import type { DurableOperationService } from './durable-operation.service';
import {
  DurableOperationCommitOutcomeUnknownError,
  beginDurableOperationSection,
  recordDurableOperationSection,
  recordDurableOperationCount,
  type UpdateActiveJobStateInput,
  type UpdateActiveJobStateResult,
  type StartActiveJobWithAssetsInput,
  type StartActiveJobWithAssetsResult,
  type CancelActiveJobWithAssetsInput,
  type CancelActiveJobWithAssetsResult,
  type CompleteActiveJobWithAssetsInput,
  type CompleteActiveJobWithAssetsResult,
  type ActiveJobCompletionKind,
  type DurableActiveJobSnapshot,
  type DurableInventoryItemSnapshot,
  type DurableWalletBalanceSnapshot,
  type DurableEquipmentSlotSnapshot,
  type DurableEnhancementRecordSnapshot,
  type DurableProfessionStateSnapshot,
  type DurableQuestProgressSnapshot,
  type DurableInventoryGrantSourceMutation,
  type AssetMutationCompactionContext,
} from './durable-operation.service';
import {
  nextPlayerPersistenceVersion,
  savePlayerSnapshotProjectionDomainsWithClient,
  type PlayerTechniqueActivityQueueUpsertInput,
} from './player-domain-persistence.service';
import {
  normalizeRequiredString,
  acquirePlayerAssetLock,
  rollbackTransactionOrDestroyClient,
  disposeFailedDurableTransactionClient,
  PLAYER_PRESENCE_TABLE,
  PLAYER_RECOVERY_WATERMARK_TABLE,
  PLAYER_ACTIVE_JOB_TABLE,
  PLAYER_MAIL_TABLE,
  PLAYER_MAIL_ATTACHMENT_TABLE,
  PLAYER_MAIL_COUNTER_TABLE,
  DURABLE_OPERATION_LOG_TABLE,
  OUTBOX_EVENT_TABLE,
  ASSET_AUDIT_LOG_TABLE,
  ASSET_AUDIT_LOG_ARCHIVE_TABLE,
  PLAYER_HEAVENLY_DAO_SHOP_PURCHASE_TABLE,
} from './durable-operation.sql';
import {
  normalizeDurableOperationId,
  normalizeOptionalInteger,
  normalizeOptionalString,
  normalizePositiveInteger,
  normalizeStringList,
  normalizeActiveJobSnapshot,
  normalizeActiveJobCompletionKind,
  normalizeEnhancementRecordSnapshots,
  normalizeProfessionStateSnapshots,
  normalizeQuestProgressSnapshots,
  normalizeTechniqueActivityQueueSnapshots,
  normalizeInventoryGrantSourceMutation,
  normalizeCurrentDurableInvocationResult,
  buildActiveJobAssetSnapshotDigest,
  buildDurableOperationCompactionKey,
  buildCompactedDurableOperationPayload,
  assertDurableOperationReplayIdentity,
  assertDurableOperationCompactedReplayIdentity,
  assertDurableOperationCompactionStreamIdentity,
  assertPlayerTechniqueActivityQueueHead,
  isActiveJobAlreadyAtOrAheadOfNext,
  isActiveJobCatchUpAllowed,
  isActiveJobSameOrBehindNext,
  isSameActiveJobBehindExpected,
  resolveActiveJobCompletionSemantics,
  replacePlayerInventoryItems,
  replacePlayerWalletRows,
  replacePlayerEquipmentSlots,
  replacePlayerActiveJob,
  replacePlayerEnhancementRecords,
  replacePlayerProfessionStates,
  replacePlayerQuestProgressRows,
  replacePlayerTechniqueActivityQueue,
  patchPlayerInventoryItems,
  patchPlayerWalletRows,
  persistInventoryGrantSourceMutation,
  insertDurableOperationLog,
  insertDurableOutboxEvent,
  insertAssetAuditLog,
  upsertCompactedAssetAuditLog,
  buildAssetAuditLogId,
  waitForDurableOperationReconciliation,
  assertInstanceLeaseWritable,
  resolveCurrentNodeId,
} from './durable-operation.persistence';
import { assertInstanceLeaseWriteFence } from './instance-lease-write-fence';
import { isTransientPostgresError } from './pg-error-utils';
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
  normalizeDurableMineralCrystalSourceMutation,
  persistDurableMineralCrystalSourceMutation,
  type DurableMineralCrystalSourceMutation,
} from './mineral-crystal-durable-persistence';
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
  persistDurableFormationWriteWithClient,
  type DurableSectFormationWrite,
} from './sect-durable-persistence';
import { assertPlantSeedSourceMutation } from './plant-seed-source-validation';
import {
  buildPersistedEquipmentItemRawPayload,
  buildPersistedInventoryItemRawPayload,
} from './inventory-item-persistence';
import {
  calculateTimeChamberActivationCost,
  createItemStackSignature,
  EQUIP_SLOTS,
  isLegacyItemInstanceId,
  requiresTimeChamberActivation,
  resolveTimeChamberCapacityLimit,
  TIME_CHAMBER_MAX_USAGE_HOURS,
  TIME_CHAMBER_MIN_USAGE_HOURS,
} from '@mud/shared';
import { createHash, randomUUID } from 'node:crypto';
import {
  assignStableItemInstanceId,
  upsertEquipmentSlotRowsWithItemInstanceIdRepair,
  type EquipmentSlotPersistenceRow,
  type ItemInstanceIdPersistenceRowSource,
} from './compat/item-instance-id-compat';
import { ensureBigintColumnsWithClient } from './schema-bigint-migration';

export async function updateActiveJobStateImpl(
  self: DurableOperationService,
  input: UpdateActiveJobStateInput): Promise<UpdateActiveJobStateResult> {
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

    return self.executeAssetMutation<UpdateActiveJobStateResult>({
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
      onMutate: async (client, persistenceVersion) => {
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
          [normalizedPlayerId, persistenceVersion],
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

export async function startActiveJobWithAssetsImpl(
  self: DurableOperationService,
  input: StartActiveJobWithAssetsInput): Promise<StartActiveJobWithAssetsResult> {
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

    return self.executeAssetMutation<StartActiveJobWithAssetsResult>({
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
      onMutate: async (client, persistenceVersion) => {
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

        const activeJobVersion = persistenceVersion;
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
            persistenceVersion,
            persistenceVersion,
            activeJobVersion,
            Array.isArray(normalizedNextEnhancementRecords) ? persistenceVersion : 0,
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

export async function cancelActiveJobWithAssetsImpl(
  self: DurableOperationService,
  input: CancelActiveJobWithAssetsInput): Promise<CancelActiveJobWithAssetsResult> {
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

    return self.executeAssetMutation<CancelActiveJobWithAssetsResult>({
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
      onMutate: async (client, persistenceVersion) => {
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
            persistenceVersion,
            persistenceVersion,
            Array.isArray(normalizedNextEquipmentSlots) ? persistenceVersion : 0,
            persistenceVersion,
            Array.isArray(normalizedNextEnhancementRecords) ? persistenceVersion : 0,
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

export async function completeActiveJobWithAssetsImpl(
  self: DurableOperationService,
  input: CompleteActiveJobWithAssetsInput): Promise<CompleteActiveJobWithAssetsResult> {
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
    const assetWriteMode = input.assetWriteMode === 'patch' ? 'patch' : 'replace';
    const removedInventoryItemInstanceIds = assetWriteMode === 'patch'
      ? normalizeStringList(input.removedInventoryItemInstanceIds ?? [])
      : [];
    const removedWalletTypes = assetWriteMode === 'patch'
      ? normalizeStringList(input.removedWalletTypes ?? [])
      : [];

    if (
      !normalizedExpectedJobRunId
      || (assetWriteMode === 'patch' && completionKind !== 'advanced')
      || (assetWriteMode === 'patch' && normalizedNextEquipmentSlots !== null)
    ) {
      throw new Error('invalid_complete_active_job_with_assets_input');
    }
    const compactionKey = completionKind === 'advanced'
      ? buildDurableOperationCompactionKey(
        'active-job-advance',
        normalizedPlayerId,
        normalizedExpectedJobRunId,
      )
      : null;

    const assetSnapshotDigest = buildActiveJobAssetSnapshotDigest({
      playerId: normalizedPlayerId,
      inventoryItems: normalizedNextInventoryItems,
      walletBalances: normalizedNextWalletBalances,
      equipmentSlots: normalizedNextEquipmentSlots ?? undefined,
      enhancementRecords: normalizedNextEnhancementRecords,
      professionStates: normalizedNextProfessionStates,
      activeJob: normalizedNextActiveJob,
      techniqueActivityQueue: undefined,
      ...(assetWriteMode === 'patch' ? {
        assetWriteMode,
        removedInventoryItemInstanceIds,
        removedWalletTypes,
      } : {}),
    });

    const inventoryMutated = assetWriteMode === 'replace'
      || normalizedNextInventoryItems.length > 0
      || removedInventoryItemInstanceIds.length > 0;
    const walletMutated = assetWriteMode === 'replace'
      || normalizedNextWalletBalances.length > 0
      || removedWalletTypes.length > 0;

    return self.executeAssetMutation<CompleteActiveJobWithAssetsResult>({
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
        ...(assetWriteMode === 'patch' ? {
          assetWriteMode,
          removedInventoryItemCount: removedInventoryItemInstanceIds.length,
          removedWalletTypeCount: removedWalletTypes.length,
        } : {}),
        ...(Array.isArray(normalizedNextProfessionStates)
          ? { professionStateCount: normalizedNextProfessionStates.length }
          : {}),
        nextJobRunId: normalizedNextActiveJob?.jobRunId ?? null,
        nextJobVersion: normalizedNextActiveJob?.jobVersion ?? null,
        assetSnapshotDigest,
      },
      compaction: compactionKey ? { operationKey: compactionKey } : null,
      recordSectionDuration: input.recordSectionDuration,
      onAlreadyCommitted: async () => ({
        ok: true,
        alreadyCommitted: true,
        action: 'complete',
        jobRunId: normalizedNextActiveJob?.jobRunId ?? null,
        jobVersion: normalizedNextActiveJob?.jobVersion ?? null,
      }),
      onMutate: async (client, persistenceVersion, _runtimeOwnerId, _sessionEpoch, compaction) => {
        let mutationSectionStartedAt = beginDurableOperationSection(input.recordSectionDuration);
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
        recordDurableOperationSection(
          input.recordSectionDuration,
          'instance.craftJob.enhancementDurableJobCasMs',
          mutationSectionStartedAt,
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

        mutationSectionStartedAt = beginDurableOperationSection(input.recordSectionDuration);
        if (assetWriteMode === 'patch') {
          const inventoryPatchPath = await patchPlayerInventoryItems(
            client,
            normalizedPlayerId,
            normalizedNextInventoryItems,
            removedInventoryItemInstanceIds,
          );
          recordDurableOperationCount(
            input.recordSectionDuration,
            inventoryPatchPath === 'stable_update'
              ? 'instance.craftJob.enhancementDurableInventoryStableUpdate'
              : 'instance.craftJob.enhancementDurableInventoryGuardedFallback',
          );
        } else {
          await replacePlayerInventoryItems(client, normalizedPlayerId, normalizedNextInventoryItems, {
            replaceLockedItems: true,
          });
        }
        recordDurableOperationSection(
          input.recordSectionDuration,
          'instance.craftJob.enhancementDurableInventoryMs',
          mutationSectionStartedAt,
        );

        mutationSectionStartedAt = beginDurableOperationSection(input.recordSectionDuration);
        if (assetWriteMode === 'patch') {
          await patchPlayerWalletRows(
            client,
            normalizedPlayerId,
            normalizedNextWalletBalances,
            removedWalletTypes,
          );
        } else {
          await replacePlayerWalletRows(client, normalizedPlayerId, normalizedNextWalletBalances);
        }
        recordDurableOperationSection(
          input.recordSectionDuration,
          'instance.craftJob.enhancementDurableWalletMs',
          mutationSectionStartedAt,
        );
        if (Array.isArray(normalizedNextEquipmentSlots)) {
          mutationSectionStartedAt = beginDurableOperationSection(input.recordSectionDuration);
          await replacePlayerEquipmentSlots(client, normalizedPlayerId, normalizedNextEquipmentSlots);
          recordDurableOperationSection(
            input.recordSectionDuration,
            'instance.craftJob.enhancementDurableEquipmentMs',
            mutationSectionStartedAt,
          );
        }
        if (Array.isArray(normalizedNextEnhancementRecords)) {
          mutationSectionStartedAt = beginDurableOperationSection(input.recordSectionDuration);
          await replacePlayerEnhancementRecords(
            client,
            normalizedPlayerId,
            normalizedNextEnhancementRecords,
            { deleteMissing: assetWriteMode !== 'patch' },
          );
          recordDurableOperationSection(
            input.recordSectionDuration,
            'instance.craftJob.enhancementDurableRecordMs',
            mutationSectionStartedAt,
          );
        }
        if (Array.isArray(normalizedNextProfessionStates)) {
          mutationSectionStartedAt = beginDurableOperationSection(input.recordSectionDuration);
          await replacePlayerProfessionStates(client, normalizedPlayerId, normalizedNextProfessionStates);
          recordDurableOperationSection(
            input.recordSectionDuration,
            'instance.craftJob.enhancementDurableProfessionMs',
            mutationSectionStartedAt,
          );
        }
        mutationSectionStartedAt = beginDurableOperationSection(input.recordSectionDuration);
        await replacePlayerActiveJob(client, normalizedPlayerId, normalizedNextActiveJob);
        recordDurableOperationSection(
          input.recordSectionDuration,
          'instance.craftJob.enhancementDurableActiveJobMs',
          mutationSectionStartedAt,
        );
        const professionVersion = Array.isArray(normalizedNextProfessionStates) ? persistenceVersion : 0;
        const activeJobVersion = persistenceVersion;
        const enhancementRecordVersion = Array.isArray(normalizedNextEnhancementRecords)
          ? persistenceVersion
          : 0;

        mutationSectionStartedAt = beginDurableOperationSection(input.recordSectionDuration);
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
            inventoryMutated ? persistenceVersion : 0,
            walletMutated ? persistenceVersion : 0,
            Array.isArray(normalizedNextEquipmentSlots) ? persistenceVersion : 0,
            professionVersion,
            activeJobVersion,
            enhancementRecordVersion,
          ],
        );
        recordDurableOperationSection(
          input.recordSectionDuration,
          'instance.craftJob.enhancementDurableWatermarkMs',
          mutationSectionStartedAt,
        );

        const auditDelta = {
          completionKind,
          assetWriteMode,
          inventoryItemCount: normalizedNextInventoryItems.length,
          walletBalanceCount: normalizedNextWalletBalances.length,
          enhancementRecordCount: Array.isArray(normalizedNextEnhancementRecords) ? normalizedNextEnhancementRecords.length : 0,
          removedInventoryItemCount: removedInventoryItemInstanceIds.length,
          removedWalletTypeCount: removedWalletTypes.length,
          ...(Array.isArray(normalizedNextProfessionStates)
            ? { professionStateCount: normalizedNextProfessionStates.length }
            : {}),
        };
        const auditBefore = {
          jobRunId: persistedJobRunId || null,
          jobVersion: persistedJobVersion || null,
        };
        const auditAfter = {
          jobRunId: normalizedNextActiveJob?.jobRunId ?? null,
          jobVersion: normalizedNextActiveJob?.jobVersion ?? null,
        };
        mutationSectionStartedAt = beginDurableOperationSection(input.recordSectionDuration);
        if (compaction) {
          await upsertCompactedAssetAuditLog(
            client,
            compaction,
            normalizedPlayerId,
            'active_job',
            normalizedExpectedJobRunId,
            completionSemantics.action,
            auditDelta,
            auditBefore,
            auditAfter,
          );
        } else {
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
          await insertAssetAuditLog(
            client,
            normalizedOperationId,
            normalizedPlayerId,
            'active_job',
            normalizedExpectedJobRunId,
            completionSemantics.action,
            auditDelta,
            auditBefore,
            auditAfter,
          );
        }
        recordDurableOperationSection(
          input.recordSectionDuration,
          'instance.craftJob.enhancementDurableAuditMs',
          mutationSectionStartedAt,
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

