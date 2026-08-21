/**
 * 本文件属于服务端权威运行时，负责炼丹/炼器 pipeline strategy 的每息推进。
 *
 * 维护时要保持 active job、背包、技艺经验和队列启动的服务端真源一致。
 */
import {
  type TechniqueActivityResolveResult,
  resolveStochasticBatchesPerTick,
  resolveStochasticCraftTicks,
} from '@mud/shared';
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
  if (!job) {
    return craftService.buildAlchemyLikeTickResult();
  }
  const compatibility = craftService.ensureAlchemyLikeJobResourceCompatibility(player, jobKind, job);
  if (Number(job.remainingTicks) <= 0) {
    return craftService.buildAlchemyLikeTickResult(
      Boolean(compatibility.inventoryChanged),
      [],
      Boolean(compatibility.inventoryChanged),
    );
  }

  if (job.phase === 'paused') {
    const resumed = craftService.advanceAlchemyLikePausedJob(player, job);
    return craftService.buildAlchemyLikeTickResult(
      Boolean(resumed?.resumed) || Boolean(compatibility.inventoryChanged),
      [],
      Boolean(compatibility.inventoryChanged),
    );
  }

  job.phase = 'brewing';
  job.remainingTicks = Math.max(0, Number(job.remainingTicks) - 1);
  job.workRemainingTicks = Math.max(0, Math.floor(Number(job.workRemainingTicks ?? job.remainingTicks + 1) || 0) - 1);
  job.currentBatchRemainingTicks = Math.max(0, Number(job.currentBatchRemainingTicks) - 1);

  if (job.currentBatchRemainingTicks > 0 && job.remainingTicks > 0) {
    craftService.finalizeMutation(player, {
      inventoryChanged: Boolean(compatibility.inventoryChanged),
      persistentOnly: true,
      dirtyDomains: ['active_job'],
    });
    return craftService.buildAlchemyLikeTickResult(
      Boolean(compatibility.inventoryChanged),
      [],
      Boolean(compatibility.inventoryChanged),
    );
  }

  const rawBrewTicks = typeof job.rawBrewTicks === 'number' && Number.isFinite(job.rawBrewTicks)
    ? job.rawBrewTicks
    : job.batchBrewTicks;

  const batchesToProcess = rawBrewTicks < 1
    ? Math.min(Math.max(1, job.quantity - job.completedCount), resolveStochasticBatchesPerTick(rawBrewTicks))
    : 1;

  let totalSuccessCount = 0;
  let totalFailureCount = 0;
  let batchesCompletedThisTick = 0;
  let anyInventoryChanged = Boolean(compatibility.inventoryChanged);
  let resourceMissingMessage: any = null;

  for (let b = 0; b < batchesToProcess; b++) {
    const batchConsume = craftService.consumeAlchemyLikeBatchResources(player, job);
    if (!batchConsume.ok) {
      resourceMissingMessage = {
        kind: 'system',
        key: jobKind === 'forging'
          ? 'notice.craft.forging.batch-resources-missing'
          : 'notice.craft.alchemy.batch-resources-missing',
      };
      break;
    }
    if (batchConsume.inventoryChanged) {
      anyInventoryChanged = true;
    }
    const currentSuccessRate = craftService.resolveAlchemyLikeCurrentSuccessRate(player, jobKind, job);
    job.successRate = currentSuccessRate;
    const successCount = craftService.resolveAlchemyLikeBatchSuccess(job, currentSuccessRate);
    const failureCount = Math.max(0, Number(job.outputCount) - successCount);
    job.completedCount += 1;
    job.successCount += successCount;
    job.failureCount += failureCount;
    totalSuccessCount += successCount;
    totalFailureCount += failureCount;
    batchesCompletedThisTick += 1;
  }

  if (batchesCompletedThisTick === 0) {
    craftService.setAlchemyLikeActiveJob(player, jobKind, null);
    craftService.finalizeMutation(player, {
      persistentOnly: true,
      dirtyDomains: ['active_job'],
    });
    return {
      ok: true,
      panelChanged: true,
      inventoryChanged: anyInventoryChanged,
      equipmentChanged: false,
      attrChanged: false,
      messages: resourceMissingMessage ? [resourceMissingMessage] : [],
      groundDrops: [],
      craftRealmExpGain: 0,
    };
  }

  const jobCompleted = job.completedCount >= job.quantity || job.remainingTicks <= 0 || Boolean(resourceMissingMessage);
  const extraMessages: any[] = [];
  if (resourceMissingMessage) {
    extraMessages.push(resourceMissingMessage);
  }
  const resolved = craftService.buildAlchemyLikeBatchResolveResult(
    player,
    jobKind,
    job,
    totalSuccessCount,
    totalFailureCount,
    jobCompleted,
    jobCompleted
      ? [craftService.buildAlchemyLikeCompletionMessage(jobKind, job), ...extraMessages]
      : [craftService.buildAlchemyLikeBatchMessage(jobKind, job, totalSuccessCount), ...extraMessages],
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
    inventoryChanged: inventoryResult.inventoryChanged || anyInventoryChanged,
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
      inventoryChanged: Boolean(nextStartResult.inventoryChanged)
        || anyInventoryChanged,
      equipmentChanged: Boolean(nextStartResult.equipmentChanged),
      attrChanged: expResult.attrChanged || Boolean(nextStartResult.attrChanged),
      additionalGroundDrops: nextStartResult.groundDrops ?? [],
    });
  }

  job.currentBatchRemainingTicks = resolveStochasticCraftTicks(rawBrewTicks);
  return materializeTechniqueActivityResolveResult(resolved, {
    inventoryChanged: anyInventoryChanged,
    attrChanged: expResult.attrChanged,
  });
}
