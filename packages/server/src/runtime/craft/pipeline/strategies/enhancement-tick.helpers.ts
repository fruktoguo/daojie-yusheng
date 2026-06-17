/**
 * 本文件属于服务端权威运行时，负责强化 pipeline strategy 的每息推进。
 *
 * 强化 tick 必须保持锁定装备、保护物、灵石扣费、强化记录和连续冲级的一致性。
 */
import {
  ENHANCEMENT_SPIRIT_STONE_ITEM_ID,
  computeCraftSkillExpGain,
  computeEnhancementJobBaseTicks,
} from '@mud/shared';
import { getLockedItem } from '../../../player/inventory-lock.helpers';
import { advanceTechniqueActivityPause } from '../../technique-activity-runtime.helpers';
import type { PipelineContext } from '../technique-activity-strategy';

export function executeEnhancementTick(craftService: any, player: any, ctx: PipelineContext): unknown {
  craftService.ensureCraftSkills(player);
  const job = player?.enhancementJob;
  if (!job) {
    return buildEnhancementTickResult();
  }
  if (Number(job.remainingTicks) <= 0) {
    // 僵死自愈：remainingTicks 已耗尽但 job 仍未清理（损坏/历史遗留，常伴随 phase=paused
    // 与 workRemainingTicks 背离），走权威清理释放锁定装备、写记录、清 job，避免永久卡死。
    const resultingLevel = Math.max(0, Math.floor(Number(job.currentLevel ?? 0)));
    const finishResult = craftService.finishEnhancementJob(player, resultingLevel, 'stopped');
    return buildEnhancementTickResult(
      true,
      [{
        kind: 'system',
        key: 'notice.craft.enhancement.cancelled',
        vars: { itemName: job.targetItemName },
        pills: [{ key: 'itemName', style: 'target' }],
      }],
      finishResult.inventoryChanged,
      finishResult.equipmentChanged,
      finishResult.attrChanged,
      finishResult.groundDrops,
    );
  }

  if (job.phase === 'paused') {
    const resumed = advanceTechniqueActivityPause(job, 'enhancing');
    craftService.finalizeMutation(player, {
      persistentOnly: true,
      dirtyDomains: ['active_job'],
    });
    return buildEnhancementTickResult(Boolean(resumed.resumed));
  }

  job.remainingTicks = Math.max(0, Number(job.remainingTicks) - 1);
  job.workRemainingTicks = Math.max(
    0,
    Math.floor(Number(job.workRemainingTicks ?? job.remainingTicks + 1) || 0) - 1,
  );
  if (job.remainingTicks > 0) {
    craftService.finalizeMutation(player, {
      persistentOnly: true,
      dirtyDomains: ['active_job'],
    });
    return buildEnhancementTickResult();
  }

  if (!getLockedItem(player.inventory.lockedItems ?? [], job.itemInstanceId)) {
    const finishResult = craftService.finishEnhancementJob(player, job.currentLevel, 'stopped');
    return buildEnhancementTickResult(true, [{
      kind: 'system',
      key: 'notice.craft.enhancement.target-missing',
      vars: { itemName: job.targetItemName },
      pills: [{ key: 'itemName', style: 'target' }],
    }], finishResult.inventoryChanged, finishResult.equipmentChanged, finishResult.attrChanged, finishResult.groundDrops);
  }

  const success = Math.random() < job.successRate;
  if (success) {
    try {
      craftService.playerRuntimeService.debitWallet(player.playerId, ENHANCEMENT_SPIRIT_STONE_ITEM_ID, job.spiritStoneCost);
    } catch (error) {
      if (error instanceof TypeError || error instanceof ReferenceError) {
        console.error(`[制作] 扣费异常 player=${player.playerId}：`, error);
      }
      const finishResult = craftService.finishEnhancementJob(player, job.currentLevel, 'stopped');
      return buildEnhancementTickResult(true, [{
        kind: 'system',
        key: 'notice.craft.enhancement.wallet-insufficient',
        vars: { itemName: job.targetItemName },
        pills: [{ key: 'itemName', style: 'target' }],
      }], finishResult.inventoryChanged, finishResult.equipmentChanged, finishResult.attrChanged, finishResult.groundDrops);
    }
  }

  const protectionActiveForStep = craftService.shouldUseProtectionForStep(job.targetLevel, job.protectionStartLevel);
  if (!success && protectionActiveForStep && !craftService.consumeProtectionItemForFailure(player, job)) {
    const finishResult = craftService.finishEnhancementJob(player, job.currentLevel, 'stopped');
    return buildEnhancementTickResult(true, [{
      kind: 'system',
      key: 'notice.craft.enhancement.protection-missing',
      vars: { itemName: job.targetItemName },
      pills: [{ key: 'itemName', style: 'target' }],
    }], finishResult.inventoryChanged, finishResult.equipmentChanged, finishResult.attrChanged, finishResult.groundDrops);
  }

  const resultingLevel = success
    ? job.targetLevel
    : protectionActiveForStep
      ? Math.max(0, job.currentLevel - 1)
      : 0;
  craftService.recordEnhancementStepResult(player, job, success, resultingLevel);

  const skillGain = resolveEnhancementSkillExpGain(player.enhancementSkill, job.targetItemLevel, success, ctx);
  const skillChanged = applyEnhancementSkillExp(player.enhancementSkill, skillGain, ctx);
  player.enhancementSkillLevel = player.enhancementSkill.level;
  if (skillChanged) {
    craftService.finalizeMutation(player, {
      attrChanged: true,
      persistentOnly: true,
      dirtyDomains: ['profession'],
    });
  }

  if (resultingLevel < job.desiredTargetLevel) {
    const continueResult = craftService.advanceEnhancementJob(player, resultingLevel);
    if (continueResult) {
      return buildEnhancementTickResult(
        true,
        continueResult.messages,
        continueResult.inventoryChanged,
        continueResult.equipmentChanged,
        skillChanged || continueResult.attrChanged,
        continueResult.groundDrops,
        skillGain / 2,
      );
    }
  }

  craftService.migrateLegacyCraftQueueToUnifiedQueue?.(player, job.queuedJobs);
  const finishResult = craftService.finishEnhancementJob(player, resultingLevel, 'completed');
  const nextStartResult = craftService.startNextQueuedCraftJob(player);
  return buildEnhancementTickResult(true, [{
    kind: success ? 'quest' : 'system',
    key: success
      ? 'notice.craft.enhancement.success'
      : protectionActiveForStep
        ? 'notice.craft.enhancement.failed-protected'
        : 'notice.craft.enhancement.failed-reset',
    vars: {
      itemName: job.targetItemName,
      level: resultingLevel,
    },
    pills: [{ key: 'itemName', style: 'target' }],
  }, ...(nextStartResult.messages ?? [])],
  finishResult.inventoryChanged || Boolean(nextStartResult.inventoryChanged),
  finishResult.equipmentChanged || Boolean(nextStartResult.equipmentChanged),
  finishResult.attrChanged || skillChanged || Boolean(nextStartResult.attrChanged),
  [...(finishResult.groundDrops ?? []), ...(nextStartResult.groundDrops ?? [])],
  skillGain / 2);
}

function buildEnhancementTickResult(
  panelChanged = false,
  messages: any[] = [],
  inventoryChanged = false,
  equipmentChanged = false,
  attrChanged = false,
  groundDrops: any[] = [],
  craftRealmExpGain = 0,
): Record<string, unknown> {
  return {
    ok: true,
    panelChanged,
    inventoryChanged,
    equipmentChanged,
    attrChanged,
    messages,
    groundDrops,
    craftRealmExpGain,
  };
}

function resolveEnhancementSkillExpGain(
  skill: any,
  targetItemLevel: number,
  success: boolean,
  ctx: PipelineContext,
): number {
  if (!skill || Number(skill.expToNext ?? 0) <= 0) {
    return 0;
  }
  const gainResult = computeCraftSkillExpGain({
    skillLevel: skill.level,
    targetLevel: targetItemLevel,
    baseActionTicks: computeEnhancementJobBaseTicks(targetItemLevel),
    successCount: success ? 1 : 0,
    failureCount: success ? 0 : 1,
    successMultiplier: 1,
    getExpToNextByLevel: ctx.resolveExpToNextByLevel,
  });
  return gainResult.finalGain;
}

function applyEnhancementSkillExp(skill: any, amount: number, ctx: PipelineContext): boolean {
  if (!skill) {
    return false;
  }
  let changed = false;
  const resolvedExpToNext = Math.max(0, Math.floor(Number(ctx.resolveExpToNextByLevel(skill.level)) || 0));
  if (skill.expToNext !== resolvedExpToNext) {
    skill.expToNext = resolvedExpToNext;
    changed = true;
  }
  skill.exp += Math.max(0, Math.floor(Number(amount) || 0));
  while (skill.expToNext > 0 && skill.exp >= skill.expToNext) {
    skill.exp -= skill.expToNext;
    skill.level += 1;
    skill.expToNext = Math.max(0, Math.floor(Number(ctx.resolveExpToNextByLevel(skill.level)) || 0));
    changed = true;
  }
  return changed || amount > 0;
}
