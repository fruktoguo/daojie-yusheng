/**
 * 本文件属于服务端权威运行时，负责炼丹/炼器 pipeline strategy 的取消结算。
 *
 * 取消会影响材料、灵石、背包和 active job，必须保持服务端单点裁定。
 */
import {
  ENHANCEMENT_SPIRIT_STONE_ITEM_ID,
  type TechniqueActivityRefundResult,
  type TechniqueActivityResolveResult,
} from '@mud/shared';
import {
  applyTechniqueActivityResolveInventory,
} from '../technique-activity-pipeline.service';
import type { PipelineContext } from '../technique-activity-strategy';

export function computeAlchemyLikeCancelRefund(
  craftService: any,
  player: any,
  jobKindInput: 'alchemy' | 'forging',
  ctx: PipelineContext,
): TechniqueActivityRefundResult {
  craftService.ensureCraftSkills(player);
  const jobKind = jobKindInput === 'forging' ? 'forging' : 'alchemy';
  const job = craftService.getAlchemyLikeActiveJob(player, jobKind);
  if (!job || Number(job.remainingTicks) <= 0) {
    return {
      items: [],
      spiritStones: 0,
      messages: [{
        kind: 'system',
        key: jobKind === 'forging'
          ? 'notice.craft.forging.cancel-no-active'
          : 'notice.craft.alchemy.cancel-no-active',
      }],
    };
  }

  const refundableBatchCount = Math.max(
    0,
    Math.floor(Number(job.quantity) || 0)
      - Math.floor(Number(job.completedCount) || 0)
      - (job.phase === 'brewing' ? 1 : 0),
  );
  const refundItems: Array<{ itemId: string; count: number }> = [];
  let walletChanged = false;
  let walletRefunded = 0;

  for (const ingredient of Array.isArray(job.ingredients) ? job.ingredients : []) {
    const refundCount = Math.max(0, Math.floor(Number(ingredient.count) || 0) * refundableBatchCount);
    if (refundCount <= 0 || typeof ingredient.itemId !== 'string') {
      continue;
    }
    if (ingredient.itemId === ENHANCEMENT_SPIRIT_STONE_ITEM_ID) {
      craftService.playerRuntimeService.creditWallet(player.playerId, ENHANCEMENT_SPIRIT_STONE_ITEM_ID, refundCount);
      walletChanged = true;
      walletRefunded += refundCount;
      continue;
    }
    refundItems.push({ itemId: ingredient.itemId, count: refundCount });
  }

  if (Number(job.spiritStoneCost) > 0 && refundableBatchCount > 0) {
    const refundableSpiritStones = Math.floor(
      Number(job.spiritStoneCost) * (refundableBatchCount / Math.max(1, Math.floor(Number(job.quantity) || 1))),
    );
    if (refundableSpiritStones > 0) {
      craftService.playerRuntimeService.creditWallet(player.playerId, ENHANCEMENT_SPIRIT_STONE_ITEM_ID, refundableSpiritStones);
      walletChanged = true;
      walletRefunded += refundableSpiritStones;
    }
  }

  const resolved: TechniqueActivityResolveResult = {
    successCount: 0,
    failureCount: 0,
    outputs: refundItems,
    inventoryDelta: {
      granted: refundItems,
      dropped: [],
      changed: false,
    },
    panelDirty: {
      changed: true,
      kinds: [jobKind],
      reason: 'cancelled',
    },
    expParams: {
      skillLevel: 1,
      targetLevel: 1,
      baseActionTicks: 1,
      successCount: 0,
      failureCount: 0,
      getExpToNextByLevel: () => 0,
    },
    completed: true,
    messages: [{
      kind: 'system',
      key: refundableBatchCount > 0
        ? 'notice.craft.alchemy.cancel-refunded'
        : 'notice.craft.alchemy.cancel-no-refund',
    }],
  };
  const inventoryResult = applyTechniqueActivityResolveInventory(player, resolved, ctx);

  craftService.finalizeMutation(player, {
    inventoryChanged: inventoryResult.inventoryChanged || walletChanged,
    persistentOnly: true,
  });

  return {
    items: [],
    spiritStones: 0,
    inventoryDelta: {
      ...(resolved.inventoryDelta ?? {}),
      changed: Boolean(resolved.inventoryDelta?.changed) || inventoryResult.inventoryChanged || walletChanged,
    },
    walletDelta: {
      spiritStones: walletRefunded,
      changed: walletChanged,
    },
    panelDirty: resolved.panelDirty,
    messages: resolved.messages,
  };
}
