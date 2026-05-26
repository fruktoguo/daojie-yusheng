/**
 * 本文件属于服务端权威运行时，负责炼丹/炼器 pipeline strategy 的每息推进。
 *
 * 维护时要保持 active job、背包、技艺经验和队列启动的服务端真源一致。
 */

export function executeAlchemyLikeTick(craftService: any, player: unknown, jobKindInput: 'alchemy' | 'forging'): unknown {
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

  const outputResult = craftService.grantAlchemyLikeBatchOutput(player, job, successCount);
  const expResult = craftService.applyAlchemyLikeBatchSkillExp(player, jobKind, job, successCount, failureCount);
  const jobCompleted = job.completedCount >= job.quantity || job.remainingTicks <= 0;

  craftService.finalizeMutation(player, {
    inventoryChanged: outputResult.inventoryChanged,
    attrChanged: expResult.skillChanged,
    persistentOnly: true,
    dirtyDomains: [
      ...(jobCompleted ? [] : ['active_job']),
      ...(expResult.skillChanged ? ['profession'] : []),
    ],
  });

  if (jobCompleted) {
    const nextStartResult = craftService.completeAlchemyLikeJob(player, jobKind, job);
    return craftService.buildAlchemyLikeTickResult(
      true,
      [
        craftService.buildAlchemyLikeCompletionMessage(jobKind, job),
        ...(nextStartResult.messages ?? []),
      ],
      outputResult.inventoryChanged || Boolean(nextStartResult.inventoryChanged),
      Boolean(nextStartResult.equipmentChanged),
      expResult.skillChanged || Boolean(nextStartResult.attrChanged),
      [...outputResult.groundDrops, ...(nextStartResult.groundDrops ?? [])],
      expResult.skillGain / 2,
    );
  }

  job.currentBatchRemainingTicks = job.batchBrewTicks;
  return craftService.buildAlchemyLikeTickResult(
    true,
    [craftService.buildAlchemyLikeBatchMessage(jobKind, job, successCount)],
    outputResult.inventoryChanged,
    false,
    expResult.skillChanged,
    outputResult.groundDrops,
    expResult.skillGain / 2,
  );
}
