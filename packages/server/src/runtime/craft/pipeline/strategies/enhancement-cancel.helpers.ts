/**
 * 本文件属于服务端权威运行时，负责强化 pipeline strategy 的取消结算。
 *
 * 强化取消必须释放锁定装备、写强化记录并清理 active job。
 */
import type { TechniqueActivityRefundResult } from '@mud/shared';

export function computeEnhancementCancelRefund(craftService: any, player: any): TechniqueActivityRefundResult {
  craftService.ensureCraftSkills(player);
  const job = player?.enhancementJob;
  if (!job || Number(job.remainingTicks) <= 0) {
    return {
      items: [],
      spiritStones: 0,
      messages: [],
    };
  }

  const finishResult = craftService.finishEnhancementJob(player, job.currentLevel, 'cancelled');
  return {
    items: [],
    spiritStones: 0,
    inventoryDelta: {
      changed: Boolean(finishResult.inventoryChanged),
      dropped: finishResult.groundDrops,
    },
    equipmentDelta: {
      changed: Boolean(finishResult.equipmentChanged),
    },
    recordDelta: {
      recordType: 'enhancement',
      changed: true,
    },
    panelDirty: {
      changed: true,
      kinds: ['enhancement'],
      reason: 'cancelled',
    },
    groundDrops: finishResult.groundDrops,
    attrChanged: Boolean(finishResult.attrChanged),
    messages: [{
      kind: 'system',
      key: 'notice.craft.enhancement.cancelled',
      vars: { itemName: job.targetItemName },
      pills: [{ key: 'itemName', style: 'target' }],
    }],
  };
}
