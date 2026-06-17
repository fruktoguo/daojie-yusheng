/**
 * 本文件属于服务端权威运行时，负责强化 pipeline strategy 的取消结算。
 *
 * 强化取消必须释放锁定装备、写强化记录并清理 active job。
 */
import type { TechniqueActivityRefundResult } from '@mud/shared';

export function computeEnhancementCancelRefund(craftService: any, player: any): TechniqueActivityRefundResult {
  craftService.ensureCraftSkills(player);
  const job = player?.enhancementJob;
  // 只要存在强化 job 就走权威清理：释放锁定装备、写记录、清 job。
  // 不再因 remainingTicks<=0 提前返回——否则损坏/历史遗留的僵死 job（remainingTicks 与
  // workRemainingTicks 背离、phase=paused 残留）会既无法推进也无法取消，永久卡死。
  // finishEnhancementJob 含锁定工件丢失兜底，对异常状态同样安全。
  if (!job) {
    return {
      items: [],
      spiritStones: 0,
      messages: [],
    };
  }

  const resultingLevel = Math.max(0, Math.floor(Number(job.currentLevel ?? 0)));
  const finishResult = craftService.finishEnhancementJob(player, resultingLevel, 'cancelled');
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
