/**
 * 本文件属于服务端权威运行时，负责强化 pipeline strategy 的取消结算。
 *
 * 强化取消必须释放锁定装备、写强化记录并清理 active job。
 */
import type { PipelineContext } from '../technique-activity-strategy';

export function executeEnhancementCancel(craftService: any, player: any, _ctx: PipelineContext): unknown {
  craftService.ensureCraftSkills(player);
  const job = player?.enhancementJob;
  if (!job || Number(job.remainingTicks) <= 0) {
    return {
      ok: false,
      error: '当前没有可取消的强化任务。',
      panelChanged: false,
      messages: [],
    };
  }

  const finishResult = craftService.finishEnhancementJob(player, job.currentLevel, 'cancelled');
  return {
    ok: true,
    panelChanged: true,
    inventoryChanged: finishResult.inventoryChanged,
    equipmentChanged: finishResult.equipmentChanged,
    attrChanged: finishResult.attrChanged,
    groundDrops: finishResult.groundDrops,
    messages: [{
      kind: 'system',
      key: 'notice.craft.enhancement.cancelled',
      vars: { itemName: job.targetItemName },
      pills: [{ key: 'itemName', style: 'target' }],
    }],
  };
}
