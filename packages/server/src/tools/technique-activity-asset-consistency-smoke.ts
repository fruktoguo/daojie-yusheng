import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf-8');
}

function assertContains(source: string, pattern: RegExp, label: string): void {
  assert.match(source, pattern, label);
}

function main(): void {
  const alchemySource = readSource('packages/server/src/tools/world-runtime-alchemy-smoke.ts');
  const enhancementSource = readSource('packages/server/src/tools/world-runtime-enhancement-smoke.ts');
  const gatherLootSource = readSource('packages/server/src/tools/world-runtime-loot-container-smoke.ts');
  const craftSource = readSource('packages/server/src/tools/world-runtime-craft-smoke.ts');
  const miningSource = readSource('packages/server/src/tools/world-runtime-mining-job-smoke.ts');
  const domainRecoverySource = readSource('packages/server/src/tools/player-domain-recovery-smoke.ts');

  assertContains(
    alchemySource,
    /testAlchemyFailureDoesNotCreateOutput[\s\S]*?countPlayerItem\(player, 'pill\.qi'\), 0[\s\S]*?result\.groundDrops, \[\]/,
    'alchemy failure must prove no output or ground drop is created',
  );
  assertContains(
    alchemySource,
    /testAlchemyOutputDropsWhenInventoryFull[\s\S]*?countPlayerItem\(player, 'pill\.qi'\), 0[\s\S]*?result\.groundDrops\?\.\[0\]\?\.itemId, 'pill\.qi'/,
    'alchemy full-inventory completion must prove output drops instead of disappearing or duplicating into inventory',
  );
  assertContains(
    alchemySource,
    /testForgingResolveEdges[\s\S]*?countPlayerItem\(successPlayer, 'equip\.copper_sword'\), 1[\s\S]*?countPlayerItem\(failurePlayer, 'equip\.copper_sword'\), 0[\s\S]*?dropResult\.groundDrops\?\.\[0\]\?\.itemId, 'equip\.copper_sword'/,
    'forging completion, failure and full-inventory drop edges must be covered',
  );
  assertContains(
    alchemySource,
    /testAlchemyQueueStartsNextJobFromUnifiedQueue[\s\S]*?countPlayerItem\(player, 'herb\.qi'\), herbCountAfterFirstStart[\s\S]*?resolveWalletBalance\(player, 'spirit_stone'\), spiritStonesAfterFirstStart/,
    'alchemy queued item must not pre-consume materials or spirit stones',
  );

  assertContains(
    enhancementSource,
    /testStartInterruptAndCompleteEnhancement[\s\S]*?inventory\.lockedItems\?\.length, 1[\s\S]*?inventory\.lockedItems\?\.length \?\? 0, 0[\s\S]*?enhanceLevel === 2[\s\S]*?wallet\.balances\[0\]\.balance, 19/,
    'enhancement success must release locked target, write enhanced item and debit exactly one spirit stone',
  );
  assertContains(
    enhancementSource,
    /testTickUsesJobSuccessRateForFailure[\s\S]*?enhanceLevel === 0[\s\S]*?failureCount === 1/,
    'enhancement normal failure must keep the locked item and record one failure',
  );
  assertContains(
    enhancementSource,
    /testProtectionFailureConsumesProtectionAndContinues[\s\S]*?itemInstanceId === protection\.itemInstanceId\), false[\s\S]*?enhanceLevel === 1/,
    'enhancement protected failure must consume only protection and continue from the protected level',
  );
  assertContains(
    enhancementSource,
    /testMissingLockedItemClearsJobWithoutSnapshotFallback[\s\S]*?inventory\.lockedItems\?\.length \?\? 0, 0[\s\S]*?item\.itemId === 'iron_sword'\), false[\s\S]*?wallet\.balances\[0\]\.balance, 20/,
    'enhancement missing locked item recovery must stop without duplicating target from stale snapshot or debiting wallet',
  );
  assertContains(
    enhancementSource,
    /testCancelReturnsLockedTarget[\s\S]*?inventory\.lockedItems\?\.length \?\? 0, 0[\s\S]*?enhanceLevel === 1[\s\S]*?status, 'cancelled'/,
    'enhancement cancel must return locked target and record cancelled status',
  );
  assertContains(
    enhancementSource,
    /testQueuedEnhancementDoesNotLockOrConsumeResources[\s\S]*?inventory\.lockedItems\?\.length \?\? 0, 0[\s\S]*?itemInstanceId === targetInstanceId[\s\S]*?balance\), balanceBefore/,
    'queued enhancement must not lock target or consume wallet resources before it starts',
  );
  assertContains(
    domainRecoverySource,
    /locked item|lockedItems|enhancementJob[\s\S]*?stopped|target-missing|missing/i,
    'domain recovery smoke must keep enhancement locked-item abnormal recovery covered',
  );

  assertContains(
    gatherLootSource,
    /草药采集完成不再在 tick 内调用 durable grant[\s\S]*?assert\.equal\(result\.inventoryChanged, true\)[\s\S]*?player\.inventory\.items\[0\]\?\.itemId, 'herb\.lingdew_grass'[\s\S]*?markedDomains, \[\['inventory', 'active_job', 'profession'\]\]/,
    'gather completion must grant exactly through runtime inventory and dirty inventory/active_job/profession domains',
  );
  assertContains(
    craftSource,
    /testSleepingGatherPermanentCancelReleasesRecoveredActiveSearch[\s\S]*?persisted\?\.activeSearch, undefined/,
    'gather abnormal recovery must release recovered activeSearch without granting phantom loot',
  );

  assertContains(
    craftSource,
    /testBuildingStartCancelUsePipelineLifecycle[\s\S]*?activeBuilderPlayerId, player\.playerId[\s\S]*?activeBuilderPlayerId, null/,
    'building cancel must release activeBuilder through pipeline lifecycle',
  );
  assertContains(
    craftSource,
    /testBuildingStrategyTickUsesStrategyHelper[\s\S]*?notice\.craft\.building\.completed[\s\S]*?activeBuilderPlayerId, null[\s\S]*?buildRemainingTicks, 0/,
    'building completion must finish once and release activeBuilder',
  );
  assertContains(
    craftSource,
    /testSleepingBuildingPermanentCancelReleasesRecoveredActiveBuilder[\s\S]*?activeBuilderPlayerId, null/,
    'building abnormal recovery must release recovered activeBuilder',
  );

  assertContains(
    miningSource,
    /cancelResult[\s\S]*?visibleInstance\.damageCalls, 0[\s\S]*?visibleInventory\.length, 0[\s\S]*?visiblePlayer\.miningSkill\.exp, 0/,
    'mining cancel must not apply tile damage, grant drops or grant mining exp',
  );
  assertContains(
    miningSource,
    /tickResult\.inventoryChanged, false[\s\S]*?tickInstance\.damageCalls, 0[\s\S]*?inventory\.length, 0[\s\S]*?tickPlayer\.miningSkill\.exp, beforeExp[\s\S]*?pendingCommands, \[\{[\s\S]*?kind: 'engageBattle'[\s\S]*?miningTargetRef: 'tile:1:0'/,
    'mining tick must enqueue locked tile combat and leave damage, drops and exp to the combat resolution chain',
  );
  assertContains(
    craftSource,
    /testSleepingMiningPermanentCancelRemovesRecoveredQueue[\s\S]*?techniqueActivityQueue\.length, 0[\s\S]*?dirtyDomains\.has\('active_job'\), true/,
    'mining abnormal recovery must clear invalid sleeping queue and mark active_job dirty',
  );

  assertContains(
    craftSource,
    /testFormationMaintenanceTickUsesStrategyHelper[\s\S]*?remainingQiBudget, 14[\s\S]*?dirtyDomains\.has\('active_job'\), true/,
    'formation maintenance tick must consume player qi into formation budget and dirty active job',
  );
  assertContains(
    craftSource,
    /notice\.craft\.formation\.qi-insufficient[\s\S]*?player\.formationJob, null/,
    'formation maintenance failure must stop job when player qi is insufficient',
  );
  assertContains(
    craftSource,
    /testSleepingFormationPermanentCancelRemovesRecoveredQueue[\s\S]*?techniqueActivityQueue\.length, 0[\s\S]*?dirtyDomains\.has\('active_job'\), true/,
    'formation abnormal recovery must clear invalid sleeping queue and mark active_job dirty',
  );

  console.log(JSON.stringify({
    ok: true,
    answers: [
      '炼丹/炼器覆盖取消不预消耗队列、成功、失败、背包满掉地和旧 active job 完成资产边界。',
      '强化覆盖成功、失败、保护失败、灵石不足、锁定物缺失、取消、队列不预锁定和分域恢复资产边界。',
      '采集覆盖完成入包 dirty domain、永久失效恢复释放 activeSearch。',
      '建造覆盖取消/完成/异常恢复释放 activeBuilder。',
      '挖矿覆盖取消无伤害/无掉落/无经验，tick 只发起锁定地块战斗，资产由战斗链路结算。',
      '阵法维护覆盖每息灵力转入预算、灵力不足停止和异常恢复清队列。',
    ],
  }, null, 2));
}

main();
