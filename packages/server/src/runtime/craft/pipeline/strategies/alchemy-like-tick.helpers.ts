/**
 * 本文件属于服务端权威运行时，负责炼丹/炼器 pipeline strategy 的每息推进。
 *
 * 维护时要保持 active job、背包、技艺经验和队列启动的服务端真源一致。
 */
import type { TechniqueActivityResolveResult } from '@mud/shared';
import {
  applyTechniqueActivityResolveInventory,
  applyTechniqueActivityResolveExperience,
  materializeTechniqueActivityResolveResult,
} from '../technique-activity-pipeline.service';
import type { PipelineContext } from '../technique-activity-strategy';

export function executeAlchemyLikeTick(craftService: any, player: unknown, jobKindInput: 'alchemy' | 'forging', ctx: PipelineContext): unknown {
  const jobKind = jobKindInput === 'forging' ? 'forging' : 'alchemy';
  craftService.ensureCraftSkills(player);
  const job = craftService.getAlchemyLikeActiveJob(player, jobKind);
  if (!job || Number(job.remainingTicks) <= 0) {
    return craftService.buildAlchemyLikeTickResult();
  }

  if (job.phase === 'paused') {
    const resumed = craftService.advanceAlchemyLikePausedJob(player, job);
    return craftService.buildAlchemyLikeTickResult(Boolean(resumed?.resumed));
  }

  job.phase = 'brewing';
  job.remainingTicks = Math.max(0, Number(job.remainingTicks) - 1);
  job.workRemainingTicks = Math.max(0, Math.floor(Number(job.workRemainingTicks ?? job.remainingTicks + 1) || 0) - 1);
  job.currentBatchRemainingTicks = Math.max(0, Number(job.currentBatchRemainingTicks) - 1);

  if (job.currentBatchRemainingTicks > 0 && job.remainingTicks > 0) {
    craftService.finalizeMutation(player, {
      persistentOnly: true,
      dirtyDomains: ['active_job'],
    });
    return craftService.buildAlchemyLikeTickResult();
  }

  const successCount = craftService.resolveAlchemyLikeBatchSuccess(job);
  const failureCount = Math.max(0, Number(job.outputCount) - successCount);
  job.completedCount += 1;
  job.successCount += successCount;
  job.failureCount += failureCount;

  const jobCompleted = job.completedCount >= job.quantity || job.remainingTicks <= 0;
  const resolved = craftService.buildAlchemyLikeBatchResolveResult(
    player,
    jobKind,
    job,
    successCount,
    failureCount,
    jobCompleted,
    jobCompleted
      ? [craftService.buildAlchemyLikeCompletionMessage(jobKind, job)]
      : [craftService.buildAlchemyLikeBatchMessage(jobKind, job, successCount)],
  ) as TechniqueActivityResolveResult;
  const inventoryResult = applyTechniqueActivityResolveInventory(player, resolved, ctx);
  const expResult = applyTechniqueActivityResolveExperience(
    player,
    jobKind === 'forging' ? 'forgingSkill' : 'alchemySkill',
    resolved,
    ctx,
  );
  resolved.craftRealmExpGain = expResult.finalGain / 2;

  craftService.finalizeMutation(player, {
    inventoryChanged: inventoryResult.inventoryChanged,
    attrChanged: expResult.attrChanged,
    persistentOnly: true,
    dirtyDomains: [
      ...(jobCompleted ? [] : ['active_job']),
      ...(expResult.attrChanged ? ['profession'] : []),
    ],
  });

  if (jobCompleted) {
    const nextStartResult = craftService.completeAlchemyLikeJob(player, jobKind, job);
    resolved.messages = [
      ...(resolved.messages ?? []),
      ...(nextStartResult.messages ?? []),
    ];
    return materializeTechniqueActivityResolveResult(resolved, {
      inventoryChanged: Boolean(nextStartResult.inventoryChanged),
      equipmentChanged: Boolean(nextStartResult.equipmentChanged),
      attrChanged: expResult.attrChanged || Boolean(nextStartResult.attrChanged),
      additionalGroundDrops: nextStartResult.groundDrops ?? [],
    });
  }

  job.currentBatchRemainingTicks = job.batchBrewTicks;
  return materializeTechniqueActivityResolveResult(resolved, {
    attrChanged: expResult.attrChanged,
  });
}
