/**
 * 本文件属于服务端权威运行时，负责强化 pipeline strategy 的中断等待。
 *
 * 强化中断只刷新等待状态，不能修改实际工作总量或剩余工作量。
 */
import { applyTechniqueActivityInterrupt } from '../../technique-activity-runtime.helpers';
import type { PipelineContext } from '../technique-activity-strategy';

const ENHANCEMENT_INTERRUPT_PAUSE_TICKS = 10;

export function executeEnhancementInterrupt(
  craftService: any,
  player: any,
  reason: string,
  _ctx: PipelineContext,
): unknown {
  craftService.ensureCraftSkills(player);
  const job = player?.enhancementJob;
  const addedPauseTicks = applyTechniqueActivityInterrupt(job, ENHANCEMENT_INTERRUPT_PAUSE_TICKS, normalizeInterruptReason(reason));
  if (addedPauseTicks <= 0) {
    return buildEnhancementInterruptResult();
  }
  craftService.finalizeMutation(player, {
    persistentOnly: true,
    dirtyDomains: ['active_job'],
  });
  return buildEnhancementInterruptResult(true, [{
    kind: 'system',
    key: 'notice.craft.activity-interrupted-wait',
    vars: {
      itemName: job.targetItemName,
      activityLabel: '强化',
      ticks: ENHANCEMENT_INTERRUPT_PAUSE_TICKS,
    },
    pills: [{ key: 'itemName', style: 'target' }],
  }]);
}

function normalizeInterruptReason(reason: string): 'move' | 'attack' | 'cancel' | 'cultivate' {
  return reason === 'move' || reason === 'cancel' || reason === 'cultivate' ? reason : 'attack';
}

function buildEnhancementInterruptResult(
  panelChanged = false,
  messages: any[] = [],
): Record<string, unknown> {
  return {
    ok: true,
    panelChanged,
    inventoryChanged: false,
    equipmentChanged: false,
    attrChanged: false,
    messages,
    groundDrops: [],
    craftRealmExpGain: 0,
  };
}
