/**
 * 本文件属于服务端权威运行时，负责炼丹/炼器 pipeline strategy 的中断等待。
 *
 * 配方型技艺中断只刷新等待状态，不能修改实际制作工作量。
 */
import { applyTechniqueActivityInterrupt } from '../../technique-activity-runtime.helpers';
import type { PipelineContext } from '../technique-activity-strategy';

const ALCHEMY_INTERRUPT_PAUSE_TICKS = 10;

export function executeAlchemyLikeInterrupt(
  craftService: any,
  player: any,
  jobKindInput: 'alchemy' | 'forging',
  reason: string,
  ctx: PipelineContext,
): unknown {
  craftService.ensureCraftSkills(player);
  const jobKind = jobKindInput === 'forging' ? 'forging' : 'alchemy';
  const job = craftService.getAlchemyLikeActiveJob(player, jobKind);
  const addedPauseTicks = applyTechniqueActivityInterrupt(job, ALCHEMY_INTERRUPT_PAUSE_TICKS, normalizeInterruptReason(reason));
  if (addedPauseTicks <= 0) {
    return buildAlchemyLikeInterruptResult();
  }
  craftService.finalizeMutation(player, {
    persistentOnly: true,
    dirtyDomains: ['active_job'],
  });
  return buildAlchemyLikeInterruptResult(true, [{
    kind: 'system',
    key: 'notice.craft.activity-interrupted-wait',
    vars: {
      itemName: ctx.contentTemplateRepository.getItemName(job.outputItemId) ?? job.outputItemId,
      activityLabel: jobKind === 'forging' ? '炼器' : '炼制',
      ticks: ALCHEMY_INTERRUPT_PAUSE_TICKS,
      reason,
    },
    pills: [{ key: 'itemName', style: 'target' }],
  }]);
}

function buildAlchemyLikeInterruptResult(
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

function normalizeInterruptReason(reason: string): 'move' | 'attack' | 'cancel' | 'cultivate' {
  return reason === 'move' || reason === 'cancel' || reason === 'cultivate' ? reason : 'attack';
}
