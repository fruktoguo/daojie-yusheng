/**
 * 本文件属于服务端权威运行时，负责炼丹/炼器 pipeline strategy 的取消结算。
 *
 * 取消会影响材料、灵石、背包和 active job，必须保持服务端单点裁定。
 */
import {
  type TechniqueActivityRefundResult,
  type TechniqueActivityResolveResult,
} from '@mud/shared';
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
  void ctx;
  // 只要存在 job 就走权威清理；材料和灵石改为每批完成前才扣除，取消时不再退还未完成批次。
  // 不再因 remainingTicks<=0 提前返回——否则损坏/历史遗留的僵死 job（remainingTicks 已耗尽
  // 但 completedCount<quantity 未完成）会既无法推进也无法取消，永久卡死。
  if (!job) {
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
  const compatibility = craftService.ensureAlchemyLikeJobResourceCompatibility(player, jobKind, job);

  const resolved: TechniqueActivityResolveResult = {
    successCount: 0,
    failureCount: 0,
    outputs: [],
    inventoryDelta: {
      granted: [],
      dropped: [],
      changed: Boolean(compatibility.inventoryChanged),
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
      key: jobKind === 'forging'
        ? 'notice.craft.forging.cancel-no-refund'
        : 'notice.craft.alchemy.cancel-no-refund',
    }],
  };

  craftService.finalizeMutation(player, {
    inventoryChanged: Boolean(compatibility.inventoryChanged),
    persistentOnly: true,
  });

  return {
    items: [],
    spiritStones: 0,
    inventoryDelta: {
      ...(resolved.inventoryDelta ?? {}),
      changed: Boolean(compatibility.inventoryChanged),
    },
    walletDelta: {
      spiritStones: Number(compatibility.spiritStones ?? 0),
      changed: Boolean(compatibility.walletChanged),
    },
    panelDirty: resolved.panelDirty,
    messages: resolved.messages,
  };
}
