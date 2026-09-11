import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  MINERAL_CRYSTALS, MINERAL_CRYSTAL_DURATION_TICKS, MINERAL_CRYSTAL_USE_BEHAVIOR,
  calculateTerrainDurability, getItemDisplayName, getStructureDurabilityProfile, resolveTileLayerSeedFromTileType,
} from '@mud/shared';
import { nextPlayerPersistenceVersion } from '../../persistence/player-domain-persistence.service';
import type { DurableMineralCrystalSourceMutation, TemporaryMineralTileEntry } from '../../persistence/mineral-crystal-durable-persistence';
import { findBuildingProtectedPlacementConflict, formatBuildingProtectedPlacementConflictReason } from './building-protected-placement.helpers';
import { isVirtualPublicWorldInstance } from './world-runtime.normalization.helpers';
import { buildGrantedInventorySnapshots, buildNextInventorySnapshots } from './world-runtime-inventory-grant.helpers';
import { isDurableCommitOutcomeUnknownError, reconcileDurableInventoryCommitOutcome } from './durable-source-asset-reconciliation.helpers';
import { buildStructuredNotice } from './structured-notice.helpers';
import type { WorldRuntimeUseItemService } from './world-runtime-use-item.service';

/** 玩家资产串行锁与实例域锁共同覆盖规划、提交、运行态应用。 */
export async function useMineralCrystal(
  service: WorldRuntimeUseItemService, playerId: string, itemInstanceId: string, item: any, deps: any,
): Promise<void> {
  await service.runExclusivePersistentPlayerItemUse(playerId, async () => {
    const location = deps.getPlayerLocationOrThrow(playerId);
    const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
    await instance.runExclusivePersistenceDomainMutation(['temporary_tile'], async () => {
      const durable = deps.durableOperationService;
      if (durable?.isEnabled?.()) {
        if (!await service.syncCurrentPlayerPresence(playerId)) {
          throw new ServiceUnavailableException('玩家资产事务围栏暂不可用，请稍后重试');
        }
      } else {
        service.assertVolatilePersistentItemUseAllowed();
      }
      const player = service.playerRuntimeService.getPlayerOrThrow(playerId);
      const current = service.requireUnchangedInventoryItem(playerId, itemInstanceId, item.itemId);
      const crystal = MINERAL_CRYSTALS.find((entry) => entry.itemId === current.itemId);
      if (!crystal || current.useBehavior !== MINERAL_CRYSTAL_USE_BEHAVIOR) {
        throw new BadRequestException('该物品不是矿脉晶精');
      }
      if (deps.getPlayerLocationOrThrow(playerId).instanceId !== location.instanceId) {
        throw new BadRequestException('地图已变化，请重试');
      }
      assertMineralCrystalPlacement(instance, player, deps);
      const x = player.x;
      const y = player.y;
      const mineralLevel = Math.max(1, Math.trunc(Number(instance.template.source?.mapLv) || 1), Math.trunc(Number(player.realm?.realmLv) || 1));
      const profile = getStructureDurabilityProfile(resolveTileLayerSeedFromTileType(crystal.tileType).structure);
      if (!profile) throw new Error('mineral_crystal_durability_profile_missing');
      const maxHp = Math.min(Number.MAX_SAFE_INTEGER, calculateTerrainDurability(mineralLevel, profile.multiplier));
      const now = Date.now();
      const entry: TemporaryMineralTileEntry = {
        tileIndex: instance.toTileIndex(x, y), x, y, tileType: crystal.tileType, hp: maxHp, maxHp,
        expiresAtTick: instance.tick + MINERAL_CRYSTAL_DURATION_TICKS, ownerPlayerId: playerId,
        sourceItemId: crystal.itemId, sourceSkillId: null, mineralLevel, createdAt: now, modifiedAt: now,
      };
      const nextItems = player.inventory.items.map((entry: any) => ({ ...entry }));
      const itemIndex = nextItems.findIndex((entry: any) => entry.itemInstanceId === itemInstanceId);
      if (itemIndex < 0 || nextItems[itemIndex].count < 1) throw new BadRequestException('晶精数量不足');
      if (nextItems[itemIndex].count === 1) nextItems.splice(itemIndex, 1);
      else nextItems[itemIndex].count -= 1;
      let committedItems = nextItems;
      const releaseHold = instance.acquirePersistenceDomainHold('temporary_tile');
      let outcomeUnknown = false;
      try {
        if (durable?.isEnabled?.()) {
          const meta = instance.meta;
          if (!meta.assignedNodeId || !meta.leaseToken || !(meta.ownershipEpoch > 0)
            || !player.runtimeOwnerId || !(player.sessionEpoch > 0)
            || (deps.isInstanceLeaseWritable && !deps.isInstanceLeaseWritable(instance))) {
            throw new ServiceUnavailableException('当前地图资产事务围栏暂不可用，请稍后重试');
          }
          const sourceMutation: DurableMineralCrystalSourceMutation = {
            kind: 'mineral_crystal', instanceId: meta.instanceId, ownershipEpoch: meta.ownershipEpoch,
            flushLedgerVersion: nextPlayerPersistenceVersion(), createdTileIndex: entry.tileIndex,
            entries: [...instance.buildTemporaryTilePersistenceEntries(), entry],
          };
          const request = {
            operationId: `mineral-crystal:${playerId}:${randomUUID()}`, playerId,
            expectedRuntimeOwnerId: player.runtimeOwnerId, expectedSessionEpoch: player.sessionEpoch,
            expectedInstanceId: meta.instanceId, expectedAssignedNodeId: meta.assignedNodeId,
            expectedLeaseToken: meta.leaseToken, expectedOwnershipEpoch: meta.ownershipEpoch,
            sourceType: 'mineral_crystal_use', sourceRefId: itemInstanceId, inventoryAction: 'remove' as const,
            sourceMutation, grantedItems: buildGrantedInventorySnapshots([{ ...current, count: 1 }]),
            nextInventoryItems: buildNextInventorySnapshots(nextItems),
          };
          try {
            await durable.grantInventoryItems(request);
          } catch (error) {
            if (!isDurableCommitOutcomeUnknownError(error)) throw error;
            const reconciled = await reconcileDurableInventoryCommitOutcome(durable, request);
            if (reconciled.outcome === 'failed') throw reconciled.error;
            if (reconciled.outcome === 'unknown') {
              // 关停期间不确定的 COMMIT 留待重启回读，禁止旧地图快照覆盖事务结果。
              outcomeUnknown = true;
              throw error;
            }
            committedItems = reconciled.inventoryItems;
          }
        }
        const result = instance.createTemporaryTile(x, y, crystal.tileType, maxHp,
          MINERAL_CRYSTAL_DURATION_TICKS, entry.expiresAtTick - MINERAL_CRYSTAL_DURATION_TICKS,
          { allowOccupied: true, ownerPlayerId: playerId, sourceItemId: crystal.itemId, mineralLevel });
        if (!result.created) throw new Error(`mineral_crystal_runtime_apply_failed:${result.reason}`);
        service.playerRuntimeService.replaceInventoryItems(playerId, committedItems);
        deps.refreshQuestStates?.(playerId);
        const notice = buildStructuredNotice('success', 'notice.item.used', '已使用矿脉晶精', {
          vars: { itemName: getItemDisplayName(current) }, pills: [{ key: 'itemName', style: 'target' }],
        });
        deps.queuePlayerNotice(playerId, notice.text, notice.kind, undefined, undefined, notice.structured);
      } finally {
        if (!outcomeUnknown) releaseHold();
      }
    });
  });
}

export function assertMineralCrystalPlacement(instance: any, player: any, deps: any): void {
  if (isVirtualPublicWorldInstance(instance)) throw new BadRequestException('虚境中不能放置矿脉');
  if (!instance.meta.persistent || !instance.meta.canDamageTile) throw new BadRequestException('当前地图不能放置矿脉');
  const sectService = deps.worldRuntimeSectService;
  const sectId = sectService?.findSectByInstanceId?.(instance.meta.instanceId)?.sectId ?? instance.meta.ownerSectId;
  if (sectId && sectService?.resolveSectInstancePermission?.(player.playerId, instance.meta.instanceId, 'building_create') !== true) {
    throw new BadRequestException('没有宗门建造权限');
  }
  const conflict = findBuildingProtectedPlacementConflict(instance, [{ x: player.x, y: player.y }]);
  if (conflict.ok === false) throw new BadRequestException(formatBuildingProtectedPlacementConflictReason(conflict.reason));
  const tileIndex = instance.toTileIndex(player.x, player.y);
  if (tileIndex < 0 || !instance.isCellIndexWalkable(tileIndex)
    || instance.temporaryTileByTile.has(tileIndex)
    || instance.monsterRuntimeIdByTile.has(tileIndex) || instance.npcIdByTile.has(tileIndex)
    || [1, 2, 3, 4, 5].some((layer) => instance.hasBuildingLayerOverlapAtCell(tileIndex, layer))) {
    throw new BadRequestException('脚下没有可放置矿脉的空地');
  }
}
