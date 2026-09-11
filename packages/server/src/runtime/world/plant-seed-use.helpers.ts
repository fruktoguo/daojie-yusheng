import { randomUUID } from 'node:crypto';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { PLANTED_HERB_DURATION_TICKS, PLANT_SEED_USE_BEHAVIOR, SPIRIT_FARMLAND_BUILDING_ID, getItemDisplayName } from '@mud/shared';
import type { WorldRuntimeUseItemService } from './world-runtime-use-item.service';
import { findBuildingProtectedPlacementConflict, formatBuildingProtectedPlacementConflictReason } from './building-protected-placement.helpers';
import { isVirtualPublicWorldInstance } from './world-runtime.normalization.helpers';
import { buildGrantedInventorySnapshots, buildNextInventorySnapshots } from './world-runtime-inventory-grant.helpers';
import { isDurableCommitOutcomeUnknownError, reconcileDurableInventoryCommitOutcome } from './durable-source-asset-reconciliation.helpers';
import { buildStructuredNotice } from './structured-notice.helpers';

export function assertPlantSeedPlacement(instance: any, player: any, deps: any): string {
  if (isVirtualPublicWorldInstance(instance) || !instance.meta.persistent || !instance.meta.canDamageTile) {
    throw new BadRequestException('当前地图不能种植');
  }
  const sectService = deps.worldRuntimeSectService;
  const sectId = sectService?.findSectByInstanceId?.(instance.meta.instanceId)?.sectId ?? instance.meta.ownerSectId;
  if (sectId && sectService?.resolveSectInstancePermission?.(player.playerId, instance.meta.instanceId, 'building_create') !== true) {
    throw new BadRequestException('没有宗门建造权限');
  }
  const conflict = findBuildingProtectedPlacementConflict(instance, [{ x: player.x, y: player.y }]);
  if (conflict.ok === false) throw new BadRequestException(formatBuildingProtectedPlacementConflictReason(conflict.reason));
  const tileIndex = instance.toTileIndex(player.x, player.y);
  const buildings = instance.getBuildingsAtTile(player.x, player.y);
  const farmland = buildings.find(({ building }: any) => building.defId === SPIRIT_FARMLAND_BUILDING_ID && building.state === 'active');
  if (!farmland || buildings.length !== 1 || tileIndex < 0 || !instance.isCellIndexWalkable(tileIndex)
    || instance.temporaryTileByTile.has(tileIndex) || instance.containerIdByTile.has(tileIndex)
    || instance.monsterRuntimeIdByTile.has(tileIndex) || instance.npcIdByTile.has(tileIndex)) {
    throw new BadRequestException('种子只能放在脚下已建成且未种植的灵田中');
  }
  return farmland.building.id;
}

/** 与晶精一致：先提交背包与实例来源域，再同步应用运行态。 */
export async function usePlantSeed(service: WorldRuntimeUseItemService, playerId: string, itemInstanceId: string, item: any, deps: any): Promise<void> {
  await service.runExclusivePersistentPlayerItemUse(playerId, async () => {
    const location = deps.getPlayerLocationOrThrow(playerId);
    const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
    await instance.runExclusivePersistenceDomainMutation(['container_state'], async () => {
      const durable = deps.durableOperationService;
      if (durable?.isEnabled?.()) {
        if (!await service.syncCurrentPlayerPresence(playerId)) throw new ServiceUnavailableException('玩家资产事务围栏暂不可用');
      } else service.assertVolatilePersistentItemUseAllowed();
      const player = service.playerRuntimeService.getPlayerOrThrow(playerId);
      const current = service.requireUnchangedInventoryItem(playerId, itemInstanceId, item.itemId);
      const definition = deps.contentTemplateRepository.plantingContent.bySeedItemId.get(current.itemId);
      if (!definition || current.useBehavior !== PLANT_SEED_USE_BEHAVIOR) throw new BadRequestException('该物品不是种子');
      if (deps.getPlayerLocationOrThrow(playerId).instanceId !== location.instanceId) throw new BadRequestException('地图已变化，请重试');
      const farmlandBuildingId = assertPlantSeedPlacement(instance, player, deps);
      const container = { ...definition.container, id: `planted_${randomUUID()}`, x: player.x, y: player.y };
      const plantedHerb = { ownerPlayerId: playerId, seedItemId: current.itemId, farmlandBuildingId,
        expiresAtTick: instance.tick + PLANTED_HERB_DURATION_TICKS, container };
      const loot = deps.worldRuntimeLootContainerService;
      const state = loot.planPlantedHerbState(instance, container, plantedHerb);
      const nextItems = player.inventory.items.map((entry: any) => ({ ...entry }));
      const itemIndex = nextItems.findIndex((entry: any) => entry.itemInstanceId === itemInstanceId);
      if (itemIndex < 0 || nextItems[itemIndex].count < 1) throw new BadRequestException('种子数量不足');
      if (nextItems[itemIndex].count === 1) nextItems.splice(itemIndex, 1);
      else nextItems[itemIndex].count -= 1;
      let committedItems = nextItems;
      const releaseHold = instance.acquirePersistenceDomainHold('container_state');
      let outcomeUnknown = false;
      try {
        if (durable?.isEnabled?.()) {
          const meta = instance.meta;
          if (!meta.assignedNodeId || !meta.leaseToken || !(meta.ownershipEpoch > 0)
            || !player.runtimeOwnerId || !(player.sessionEpoch > 0)
            || (deps.isInstanceLeaseWritable && !deps.isInstanceLeaseWritable(instance))) {
            throw new ServiceUnavailableException('当前地图资产事务围栏暂不可用');
          }
          const request = {
            operationId: `plant-seed:${playerId}:${randomUUID()}`, playerId,
            expectedRuntimeOwnerId: player.runtimeOwnerId, expectedSessionEpoch: player.sessionEpoch,
            expectedInstanceId: meta.instanceId, expectedAssignedNodeId: meta.assignedNodeId,
            expectedLeaseToken: meta.leaseToken, expectedOwnershipEpoch: meta.ownershipEpoch,
            sourceType: 'plant_seed_use', sourceRefId: itemInstanceId, inventoryAction: 'remove' as const,
            sourceMutation: loot.buildDurableContainerSourceMutation(instance, meta.instanceId, state.sourceId, state),
            grantedItems: buildGrantedInventorySnapshots([{ ...current, count: 1 }]),
            nextInventoryItems: buildNextInventorySnapshots(nextItems),
          };
          try {
            await durable.grantInventoryItems(request);
          } catch (error) {
            if (!isDurableCommitOutcomeUnknownError(error)) throw error;
            const reconciled = await reconcileDurableInventoryCommitOutcome(durable, request);
            if (reconciled.outcome === 'failed') throw reconciled.error;
            if (reconciled.outcome === 'unknown') {
              outcomeUnknown = true;
              throw error;
            }
            committedItems = reconciled.inventoryItems;
          }
        }
        loot.applyPlantedHerbState(instance, state);
        service.playerRuntimeService.replaceInventoryItems(playerId, committedItems);
        deps.refreshQuestStates?.(playerId);
        const notice = buildStructuredNotice('success', 'notice.item.used', '已使用种子', {
          vars: { itemName: getItemDisplayName(current) }, pills: [{ key: 'itemName', style: 'target' }],
        });
        deps.queuePlayerNotice(playerId, notice.text, notice.kind, undefined, undefined, notice.structured);
      } finally {
        if (!outcomeUnknown) releaseHold();
      }
    });
  });
}
