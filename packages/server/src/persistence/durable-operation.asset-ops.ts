/**
 * durable-operation.asset-ops.ts
 *
 * 从 durable-operation.service.ts 拆出的钱包变更、背包发放、阵法资源/维护提交方法实现。
 * 原类保留一行委托壳，实际逻辑在此文件中以 xxxImpl(self, ...) 形式实现。
 * 不包含 @Injectable provider，不修改持久化语义。
 */
import type { DurableOperationService } from './durable-operation.service';
import {
  type MutatePlayerWalletInput,
  type MutatePlayerWalletResult,
  type GrantInventoryItemsInput,
  type GrantInventoryItemsResult,
  type DurableInventoryItemSnapshot,
  type DurableWalletBalanceSnapshot,
  type DurableEquipmentSlotSnapshot,
  type DurableInventoryGrantSourceMutation,
  type DurableActiveJobSnapshot,
  type AssetMutationCompactionContext,
  type CommitFormationResourceMutationInput,
  type CommitFormationResourceMutationResult,
  type CommitFormationMaintenanceMutationInput,
  type CommitFormationMaintenanceMutationResult,
} from './durable-operation.service';
import {
  savePlayerSnapshotProjectionDomainsWithClient,
  nextPlayerPersistenceVersion,
} from './player-domain-persistence.service';
import { assertPlantSeedSourceMutation } from './plant-seed-source-validation';
import {
  persistDurableFormationWriteWithClient,
  type DurableSectFormationWrite,
} from './sect-durable-persistence';
import {
  normalizeDurableActivityAssetSourceMutation,
  persistDurableActivityAssetSourceMutation,
  type DurableActivityAssetSourceMutation,
} from './activity-asset-durable-persistence';
import {
  normalizeRequiredString,
  acquirePlayerAssetLock,
  assertPlayerItemUseConsumesLastUnlockedInventoryItem,
  assertUnlockedInventoryIsEmpty,
  assertInventoryRemovalConsumesAllUnlockedItems,
  PLAYER_RECOVERY_WATERMARK_TABLE,
  PLAYER_ACTIVE_JOB_TABLE,
  DURABLE_OPERATION_LOG_TABLE,
  OUTBOX_EVENT_TABLE,
  ASSET_AUDIT_LOG_TABLE,
} from './durable-operation.sql';
import {
  normalizeDurableOperationId,
  normalizeOptionalInteger,
  normalizeOptionalString,
  normalizeActiveJobSnapshot,
  normalizeInventoryGrantSourceMutation,
  buildDurableOperationCompactionKey,
  replacePlayerInventoryItems,
  replacePlayerWalletRows,
  persistInventoryGrantSourceMutation,
  insertAssetAuditLog,
  insertDurableOutboxEvent,
  upsertCompactedAssetAuditLog,
} from './durable-operation.persistence';

export async function mutatePlayerWalletImpl(
  self: DurableOperationService,
  input: MutatePlayerWalletInput): Promise<MutatePlayerWalletResult> {
    const normalizedPlayerId = normalizeRequiredString(input.playerId);
    const normalizedOperationId = normalizeDurableOperationId(input.operationId);
    const normalizedWalletType = normalizeRequiredString(input.walletType);
    const normalizedWalletBalances = Array.isArray(input.nextWalletBalances) ? input.nextWalletBalances : [];
    const action = input.action === 'credit' ? 'credit' : 'debit';
    const delta = Math.max(1, Math.trunc(Number(input.delta ?? 0)));
    if (!normalizedWalletType || delta <= 0) {
      throw new Error('invalid_mutate_player_wallet_input');
    }

    return self.executeAssetMutation<MutatePlayerWalletResult>({
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
      onMutate: async (client, persistenceVersion) => {
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

export async function grantInventoryItemsImpl(
  self: DurableOperationService,
  input: GrantInventoryItemsInput): Promise<GrantInventoryItemsResult> {
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
        || normalizedSourceType === 'tile_resource_use'
        || normalizedSourceType === 'mineral_crystal_use'
        || normalizedSourceType === 'plant_seed_use'
        || normalizedSourceType === 'activity_month_card_activation'
        || normalizedSourceType === 'activity_eternal_activation'
        || normalizedSourceType === 'activity_month_card_claim'
        || normalizedSourceType === 'activity_daily_sign_in_claim'
        || normalizedSourceType === 'activity_invitation_reward_claim'
        || normalizedSourceType === 'item_map_unlock'
        || normalizedSourceType === 'item_respawn_bind'
        || normalizedSourceType === 'item_stamina_restore'
        || normalizedSourceType === 'time_chamber_activation')
      && !normalizedSourceMutation
    ) {
      throw new Error('inventory_grant_source_mutation_required');
    }
    if (
      normalizedSourceMutation
      && normalizedSourceMutation.kind !== 'activity_asset'
      && normalizedSourceMutation.kind !== 'player_item_use'
      && normalizeOptionalString(input.expectedInstanceId) !== normalizedSourceMutation.instanceId
    ) {
      throw new Error('inventory_grant_source_instance_mismatch');
    }
    if (normalizedSourceMutation?.kind === 'activity_asset') {
      const expectedSourceTypeByAction: Record<DurableActivityAssetSourceMutation['action'], string> = {
        activate_month_card: 'activity_month_card_activation',
        activate_eternal: 'activity_eternal_activation',
        claim_month_card: 'activity_month_card_claim',
        claim_daily_sign_in: 'activity_daily_sign_in_claim',
        claim_invitation_rewards: 'activity_invitation_reward_claim',
      };
      if (normalizedSourceMutation.playerId !== normalizedPlayerId) {
        throw new Error('activity_source_player_mismatch');
      }
      if (expectedSourceTypeByAction[normalizedSourceMutation.action] !== normalizedSourceType) {
        throw new Error('activity_source_type_mismatch');
      }
    }
    if (normalizedSourceMutation?.kind === 'player_item_use') {
      const expectedSourceType = normalizedSourceMutation.action === 'unlock_maps'
        ? 'item_map_unlock'
        : normalizedSourceMutation.action === 'bind_respawn'
          ? 'item_respawn_bind'
          : 'item_stamina_restore';
      if (normalizedSourceMutation.playerId !== normalizedPlayerId) {
        throw new Error('player_item_use_source_player_mismatch');
      }
      if (expectedSourceType !== normalizedSourceType) {
        throw new Error('player_item_use_source_type_mismatch');
      }
    }
    if (normalizedSourceMutation?.kind === 'mineral_crystal') {
      const created = normalizedSourceMutation.entries.find((entry) => entry.tileIndex === normalizedSourceMutation.createdTileIndex);
      if (normalizedSourceType !== 'mineral_crystal_use' || inventoryAction !== 'remove'
        || created?.ownerPlayerId !== normalizedPlayerId
        || normalizedGrantedItems.length !== 1 || normalizedGrantedItems[0].itemId !== created.sourceItemId
        || normalizedGrantedItems[0].count !== 1
        || input.expectedOwnershipEpoch !== normalizedSourceMutation.ownershipEpoch) {
        throw new Error('mineral_crystal_source_mismatch');
      }
    }
    if (normalizedSourceMutation?.kind === 'tile_resource') {
      if (normalizedSourceType !== 'tile_resource_use') {
        throw new Error('tile_resource_source_type_mismatch');
      }
      if (Math.trunc(Number(input.expectedOwnershipEpoch ?? 0)) !== normalizedSourceMutation.ownershipEpoch) {
        throw new Error('tile_resource_source_ownership_epoch_mismatch');
      }
    }
    if (normalizedSourceMutation?.kind === 'time_chamber_activation') {
      if (normalizedSourceType !== 'time_chamber_activation') {
        throw new Error('time_chamber_activation_source_type_mismatch');
      }
      if (normalizedSourceMutation.playerId !== normalizedPlayerId) {
        throw new Error('time_chamber_activation_player_mismatch');
      }
    }
    if (normalizedSourceMutation?.kind === 'ground_tile' || normalizedSourceMutation?.kind === 'container_state') {
      const expectedSourceKind = normalizedSourceMutation.kind === 'ground_tile' ? 'ground' : 'container';
      const sourceTypeMatches = normalizedSourceMutation.kind === 'ground_tile'
        ? normalizedSourceType === 'ground_take'
          || normalizedSourceType === 'ground_take_all'
          || normalizedSourceType === 'ground_drop'
        : normalizedSourceType === 'container_take' || normalizedSourceType === 'container_take_all' || normalizedSourceType === 'plant_seed_use';
      if (!sourceTypeMatches) {
        throw new Error(`${expectedSourceKind}_source_type_mismatch`);
      }
      if (Math.trunc(Number(input.expectedOwnershipEpoch ?? 0)) !== normalizedSourceMutation.ownershipEpoch) {
        throw new Error(`${expectedSourceKind}_source_ownership_epoch_mismatch`);
      }
      if (!normalizeRequiredString(input.expectedLeaseToken)) {
        throw new Error(`${expectedSourceKind}_source_lease_token_required`);
      }
      if (normalizedSourceType === 'plant_seed_use' && normalizedSourceMutation.kind === 'container_state') {
        assertPlantSeedSourceMutation(normalizedSourceMutation, normalizedPlayerId, inventoryAction, normalizedGrantedItems);
      }
    }

    return self.executeAssetMutation<GrantInventoryItemsResult>({
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
      onMutate: async (client, persistenceVersion) => {
        const allowEmptyInventoryOverwrite = normalizedNextInventoryItems.length === 0
          && (
            inventoryAction === 'remove'
            || inventoryAction === 'transfer'
          )
          && (
            normalizedSourceMutation?.kind === 'player_item_use' || normalizedSourceMutation?.kind === 'mineral_crystal' || normalizedSourceType === 'plant_seed_use'
              ? await assertPlayerItemUseConsumesLastUnlockedInventoryItem(
                client,
                normalizedPlayerId,
                normalizedGrantedItems,
              )
              : normalizedSourceMutation?.kind === 'time_chamber_activation'
                  ? normalizedSourceMutation.chargedSpiritStones === 0
                    ? await assertUnlockedInventoryIsEmpty(client, normalizedPlayerId)
                    : await assertInventoryRemovalConsumesAllUnlockedItems(
                      client,
                      normalizedPlayerId,
                      normalizedGrantedItems,
                    )
                  : false
          );
        if (normalizedSourceMutation) {
          await persistInventoryGrantSourceMutation(
            client,
            normalizedSourceMutation,
            persistenceVersion,
            normalizedOperationId,
          );
        }
        await replacePlayerInventoryItems(client, normalizedPlayerId, normalizedNextInventoryItems, {
          allowEmptyOverwrite: allowEmptyInventoryOverwrite,
        });

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

        if (normalizedSourceType === 'plant_seed_use' && normalizedSourceMutation?.kind === 'container_state') {
          await insertAssetAuditLog(client, normalizedOperationId, normalizedPlayerId,
            'planted_herb', normalizedSourceMutation.containerId, 'create', {}, {},
            { plantedHerb: normalizedSourceMutation.statePayload.plantedHerb }, 'plant-seed');
        }
        if (normalizedSourceMutation?.kind === 'mineral_crystal') {
          await insertAssetAuditLog(client, normalizedOperationId, normalizedPlayerId,
            'temporary_tile', normalizedSourceMutation.instanceId, 'create', {}, {},
            { tile: normalizedSourceMutation.entries.find((entry) => entry.tileIndex === normalizedSourceMutation.createdTileIndex) },
            'mineral-crystal');
        }
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
        if (normalizedSourceMutation?.kind === 'activity_asset') {
          await insertAssetAuditLog(
            client,
            normalizedOperationId,
            normalizedPlayerId,
            'activity_asset',
            normalizedSourceRefId ?? normalizedSourceType,
            normalizedSourceMutation.action,
            {
              sourceType: normalizedSourceType,
              sourceMutation: normalizedSourceMutation,
            },
            {},
            {
              committed: true,
            },
            'activity-source',
          );
        }
        if (normalizedSourceMutation?.kind === 'player_item_use') {
          await insertAssetAuditLog(
            client,
            normalizedOperationId,
            normalizedPlayerId,
            'player_item_use',
            normalizedSourceRefId ?? normalizedSourceType,
            normalizedSourceMutation.action,
            { sourceMutation: normalizedSourceMutation },
            {},
            { committed: true },
            'player-item-source',
          );
        }
        if (normalizedSourceMutation?.kind === 'time_chamber_activation') {
          await insertAssetAuditLog(
            client,
            normalizedOperationId,
            normalizedPlayerId,
            'time_chamber',
            normalizedSourceMutation.chamberInstanceId,
            'activate',
            { sourceMutation: normalizedSourceMutation },
            {},
            { committed: true },
            'time-chamber-source',
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

export async function commitFormationResourceMutationImpl(
  self: DurableOperationService,
  
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

    return self.executeAssetMutation<CommitFormationResourceMutationResult>({
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

export async function commitFormationMaintenanceMutationImpl(
  self: DurableOperationService,
  
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
    const compactionKey = buildDurableOperationCompactionKey(
      'formation-maintenance',
      normalizedPlayerId,
      normalizedExpectedJobRunId,
      normalizedFormationInstanceId,
    );

    return self.executeAssetMutation<CommitFormationMaintenanceMutationResult>({
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
      compaction: {
        operationKey: compactionKey,
        accumulatePayloadFields: ['qiAmount', 'formationQiAmount'],
        retainPayloadFields: [
          'formationInstanceId',
          'instanceId',
          'expectedFormationUpdatedAtMs',
          'expectedJobRunId',
          'expectedJobVersion',
          'nextJobVersion',
          'qiAmount',
          'formationQiAmount',
        ],
      },
      onAlreadyCommitted: async () => ({
        ok: true,
        alreadyCommitted: true,
        formationInstanceId: normalizedFormationInstanceId,
        jobRunId: normalizedNextActiveJob.jobRunId,
        jobVersion: normalizedNextActiveJob.jobVersion,
      }),
      onMutate: async (client, _persistenceVersion, _runtimeOwnerId, _sessionEpoch, compaction) => {
        const currentJob = await client.query<{
          job_run_id?: unknown;
          job_version?: unknown;
          job_type?: unknown;
          status?: unknown;
          phase?: unknown;
          finished_at?: unknown;
          detail_jsonb?: unknown;
        }>(
          `SELECT job_run_id, job_version, job_type, status, phase, finished_at, detail_jsonb
           FROM ${PLAYER_ACTIVE_JOB_TABLE}
           WHERE player_id = $1
           FOR UPDATE`,
          [normalizedPlayerId],
        );
        const persistedJobRow = currentJob.rows[0];
        const persistedJobRunId = normalizeRequiredString(persistedJobRow?.job_run_id);
        const persistedJobVersion = normalizeOptionalInteger(persistedJobRow?.job_version) ?? 0;
        const persistedJobDetail = persistedJobRow?.detail_jsonb && typeof persistedJobRow.detail_jsonb === 'object'
          ? persistedJobRow.detail_jsonb as Record<string, unknown>
          : null;
        const persistedJobIsCheckpointPrefix = persistedJobRunId === normalizedExpectedJobRunId
          && persistedJobVersion > normalizedExpectedJobVersion
          && persistedJobVersion <= normalizedNextActiveJob.jobVersion
          && normalizeRequiredString(persistedJobRow?.job_type) === 'formation'
          && normalizeRequiredString(persistedJobRow?.status) === 'running'
          && normalizeRequiredString(persistedJobRow?.phase) === 'maintaining'
          && persistedJobRow?.finished_at == null
          && normalizeRequiredString(persistedJobDetail?.jobRunId) === normalizedExpectedJobRunId
          && (normalizeOptionalInteger(persistedJobDetail?.jobVersion) ?? 0) === persistedJobVersion;
        if (
          (persistedJobRunId && persistedJobRunId !== normalizedExpectedJobRunId)
          || (persistedJobVersion > normalizedExpectedJobVersion && !persistedJobIsCheckpointPrefix)
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
        if (!compaction) {
          throw new Error('formation_maintenance_compaction_context_missing');
        }
        await upsertCompactedAssetAuditLog(
          client,
          compaction,
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

