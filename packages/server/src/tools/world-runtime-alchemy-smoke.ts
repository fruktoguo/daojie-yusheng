import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { ARTIFACT_CRAFT_BASE_SUCCESS_RATE, computeAlchemyBrewTicks, computeFivePhaseElementMatch } from '@mud/shared';
import type { AlchemyRecipeCatalogEntry, RuntimeTechniqueActivityKind } from '@mud/shared';
import { WorldRuntimeAlchemyService } from '../runtime/world/world-runtime-alchemy.service';
import { WorldRuntimeCraftMutationService } from '../runtime/world/world-runtime-craft-mutation.service';
import { CraftPanelRuntimeService } from '../runtime/craft/craft-panel-runtime.service';

type SmokeNotice = [event: 'queuePlayerNotice', playerId: string, text: string, kind: string, structuredKey?: string | null];
type SmokeEmit = [event: 'emit', socketEvent: string, ok: boolean];
type SmokeLog = SmokeNotice | SmokeEmit;

const ALCHEMY_RECIPE: AlchemyRecipeCatalogEntry = {
  recipeId: 'alchemy.qi_pill',
  outputItemId: 'pill.qi',
  outputName: '聚气丹',
  category: 'recovery',
  outputCount: 1,
  outputLevel: 1,
  baseBrewTicks: 2,
  fullPower: 1,
  ingredients: [{
    itemId: 'herb.qi',
    name: '灵草',
    count: 1,
    role: 'main',
    level: 1,
    grade: 'mortal',
    powerPerUnit: 1,
  }],
};

const FORGING_RECIPE: AlchemyRecipeCatalogEntry = {
  recipeId: 'forging.copper_sword',
  outputItemId: 'equip.copper_sword',
  outputName: '铜剑',
  category: 'special',
  outputCount: 1,
  outputLevel: 1,
  baseBrewTicks: 3,
  fullPower: 1,
  ingredients: [{
    itemId: 'ore.copper',
    name: '铜矿',
    count: 1,
    role: 'main',
    level: 1,
    grade: 'mortal',
    powerPerUnit: 1,
  }],
};

async function main(): Promise<void> {
  testAlchemyForgingCancelUsesPipelineLifecycle();
  testAlchemyCustomFormulaMaterialCountAdjustsBrewTicks();
  testMainOnlyForgingRecipeStartsWithFullFivePhaseMatch();
  testArtifactForgingCapsBaseSuccessRateAtTenPercent();
  await testDirectAlchemyJobNoPreparationAndSeparateInterruptWait();
  await testAlchemyQuantityUsesResourceLimitsWithoutFixedCap();
  await testAlchemyQueueStartsNextJobFromUnifiedQueue();
  await testAlchemyFailureDoesNotCreateOutput();
  await testAlchemyOutputDropsWhenInventoryFull();
  await testLegacyActiveAlchemyAndForgingJobsContinueToCompletion();
  await testForgingUsesIndependentJobSlot();
  await testForgingResolveEdges();
  await testForgingInterruptCancelAndQueue();
  await testWorldAlchemyWritePathFlushesCurrentPipelineResult();

  console.log(JSON.stringify({
    ok: true,
    answers: [
      '炼丹/炼器创建后直接进入实际制作 job，不再创建玩家可见准备阶段。',
      '打断等待独立于 workRemainingTicks/workTotalTicks。',
      '炼丹/炼器单次任务数量不再卡固定上限，资源足够时可创建 10000 批，资源不足时按材料/灵石校验失败。',
      '制造型队列写入 techniqueActivityQueue，当前任务完成后能启动下一项。',
      '炼丹/炼器入队不会提前消耗材料或灵石。',
      '炼丹/炼器取消不再暴露 strategy executeCancel，公共 cancelLifecycle 通过 computeRefund 物化退款。',
      '炼丹/炼器中断不再暴露 strategy executeInterrupt，公共 interrupt lifecycle 统一刷新独立等待条和 active job version。',
      '炼丹失败不产出，背包满时产出掉地。',
      '旧 active alchemy/forging job 能继续 tick 到完成。',
      '炼器使用独立 forgingJob 槽位。',
      '炼器成功、失败、背包满掉地、打断、取消和队列都有独立 proof。',
      'WorldRuntimeAlchemyService 通过统一 technique activity 入口启动并刷新面板。',
    ],
  }, null, 2));
}

function testAlchemyCustomFormulaMaterialCountAdjustsBrewTicks(): void {
  const recipe: Pick<AlchemyRecipeCatalogEntry, 'fullPower' | 'ingredients' | 'mainIngredients' | 'requiredAuxElements'> = {
    fullPower: 0,
    mainIngredients: [{ itemId: 'mat.main', name: '主材', count: 5 }],
    requiredAuxElements: { wood: 5 },
    ingredients: [
      { itemId: 'mat.main', name: '主材', count: 5, role: 'main', level: 1, grade: 'mortal', powerPerUnit: 1 },
      { itemId: 'mat.aux', name: '辅材', count: 5, role: 'aux', level: 1, grade: 'mortal', powerPerUnit: 1 },
    ],
  };

  assert.equal(computeAlchemyBrewTicks(50, recipe, [
    { itemId: 'mat.main', count: 5 },
    { itemId: 'mat.aux', count: 4 },
  ]), 42);
  assert.equal(computeAlchemyBrewTicks(50, recipe, [
    { itemId: 'mat.main', count: 5 },
    { itemId: 'mat.aux', count: 6 },
  ]), 58);
  assert.equal(computeAlchemyBrewTicks(50, recipe, [
    { itemId: 'mat.main', count: 5 },
    { itemId: 'mat.aux', count: 5 },
  ]), 50);
}

function testMainOnlyForgingRecipeStartsWithFullFivePhaseMatch(): void {
  const player = createPlayer('player:forging:main-only-fivephase', [
    { itemId: 'ore.copper', count: 1 },
    { itemId: 'spirit_stone', count: 20 },
  ]);
  const { craftService } = createCraftHarness(player);
  const normalized = (craftService as unknown as {
    toAlchemyCatalogEntry?: (entry: unknown) => AlchemyRecipeCatalogEntry | null;
  }).toAlchemyCatalogEntry?.({
    recipeId: 'forging.main_only',
    outputItemId: 'equip.copper_sword',
    outputCount: 1,
    level: 1,
    grade: 'mortal',
    baseBrewTicks: 3,
    ingredients: [{ itemId: 'ore.copper', count: 1, role: 'main' }],
    mainIngredients: [{ itemId: 'ore.copper', count: 1 }],
  });
  assert.ok(normalized);

  const elementMatch = computeFivePhaseElementMatch(
    { metal: 6, earth: 3 },
    { metal: 6, earth: 3 },
  );
  assert.equal(elementMatch.baseElementSuccessRate, 1);

  craftService.forgingCatalog = [normalized];
  const start = craftService.startTechniqueActivity(player, 'forging', {
    kind: 'forging',
    recipeId: normalized.recipeId,
    ingredients: [{ itemId: 'ore.copper', count: 1 }],
    quantity: 1,
  }, createDeps([]));
  assert.equal(start.ok, true);
  assert.equal(player.forgingJob?.baseElementSuccessRate, 1);
}

function testArtifactForgingCapsBaseSuccessRateAtTenPercent(): void {
  const player = createPlayer('player:forging:artifact-base-rate', [
    { itemId: 'ore.copper', count: 1 },
    { itemId: 'spirit_stone', count: 20 },
  ]);
  const { craftService } = createCraftHarness(player);
  const normalized = (craftService as unknown as {
    toAlchemyCatalogEntry?: (entry: unknown) => AlchemyRecipeCatalogEntry | null;
  }).toAlchemyCatalogEntry?.({
    recipeId: 'forging.artifact_sky_sword',
    outputItemId: 'artifact.sky_sword',
    outputCount: 1,
    level: 1,
    grade: 'mortal',
    baseBrewTicks: 3,
    ingredients: [{ itemId: 'ore.copper', count: 1, role: 'main' }],
    mainIngredients: [{ itemId: 'ore.copper', count: 1 }],
  });
  assert.ok(normalized);
  assert.equal(normalized.category, 'artifact');

  craftService.forgingCatalog = [normalized];
  const start = craftService.startTechniqueActivity(player, 'forging', {
    kind: 'forging',
    recipeId: normalized.recipeId,
    ingredients: [{ itemId: 'ore.copper', count: 1 }],
    quantity: 1,
  }, createDeps([]));
  assert.equal(start.ok, true);
  assert.equal(player.forgingJob?.exactRecipe, true);
  assert.equal(player.forgingJob?.baseElementSuccessRate, ARTIFACT_CRAFT_BASE_SUCCESS_RATE);
  assert.equal(player.forgingJob?.successRate, ARTIFACT_CRAFT_BASE_SUCCESS_RATE);
}

function testAlchemyForgingCancelUsesPipelineLifecycle(): void {
  const player = createPlayer('player:alchemy:lifecycle-cancel', []);
  const { craftService } = createCraftHarness(player);
  const pipeline = (craftService as unknown as { pipeline?: { getStrategy?: (kind: RuntimeTechniqueActivityKind) => unknown } }).pipeline;
  const alchemyStrategy = pipeline?.getStrategy?.('alchemy') as { executeCancel?: unknown; executeInterrupt?: unknown; computeRefund?: unknown } | undefined;
  const forgingStrategy = pipeline?.getStrategy?.('forging') as { executeCancel?: unknown; executeInterrupt?: unknown; computeRefund?: unknown } | undefined;

  assert.equal(typeof alchemyStrategy?.executeCancel, 'undefined');
  assert.equal(typeof forgingStrategy?.executeCancel, 'undefined');
  assert.equal(typeof alchemyStrategy?.executeInterrupt, 'undefined');
  assert.equal(typeof forgingStrategy?.executeInterrupt, 'undefined');
  assert.equal(typeof alchemyStrategy?.computeRefund, 'function');
  assert.equal(typeof forgingStrategy?.computeRefund, 'function');
}

async function testDirectAlchemyJobNoPreparationAndSeparateInterruptWait(): Promise<void> {
  const player = createPlayer('player:alchemy:direct', [
    { itemId: 'herb.qi', count: 4 },
    { itemId: 'spirit_stone', count: 20 },
  ]);
  const { craftService } = createCraftHarness(player);
  const ctx = craftService.buildPipelineContext(createDeps([]));

  const start = craftService.startTechniqueActivity(player, 'alchemy', {
    recipeId: ALCHEMY_RECIPE.recipeId,
    ingredients: [{ itemId: 'herb.qi', count: 1 }],
    quantity: 2,
  }, ctx.deps);
  assert.equal(start.ok, true);
  assert.equal(player.alchemyJob?.phase, 'brewing');
  assert.equal(player.alchemyJob?.preparationTicks, 0);
  assert.equal(player.alchemyJob?.totalTicks, player.alchemyJob?.workTotalTicks);
  assert.equal(player.alchemyJob?.remainingTicks, player.alchemyJob?.workRemainingTicks);
  assert.equal(String(start.messages?.[0]?.text ?? '').includes('炉'), false);

  const workRemainingBeforeInterrupt = player.alchemyJob?.workRemainingTicks;
  const totalBeforeInterrupt = player.alchemyJob?.workTotalTicks;
  const interrupt = craftService.interruptTechniqueActivity(player, 'alchemy', 'attack', ctx.deps);
  assert.equal(interrupt.ok, true);
  assert.equal(interrupt.messages?.[0]?.key, 'notice.craft.activity-interrupted-wait-generic');
  assert.equal(player.alchemyJob?.phase, 'paused');
  assert.equal(player.alchemyJob?.workRemainingTicks, workRemainingBeforeInterrupt);
  assert.equal(player.alchemyJob?.workTotalTicks, totalBeforeInterrupt);
  assert.equal(player.alchemyJob?.interruptWaitRemainingTicks, 10);

  const tickWhilePaused = craftService.tickTechniqueActivity(player, 'alchemy', ctx.deps);
  assert.equal(tickWhilePaused.ok, true);
  assert.equal(player.alchemyJob?.workRemainingTicks, workRemainingBeforeInterrupt);
  assert.equal(player.alchemyJob?.interruptWaitRemainingTicks, 9);

  const cancel = craftService.cancelTechniqueActivity(player, 'alchemy', ctx.deps);
  assert.equal(cancel.ok, true);
  assert.equal(player.alchemyJob, null);
  assert.equal((cancel.messages ?? []).some((message) => String(message.text ?? '').includes('炉')), false);
}

async function testAlchemyQuantityUsesResourceLimitsWithoutFixedCap(): Promise<void> {
  const player = createPlayer('player:alchemy:quantity:three-digits', [
    { itemId: 'herb.qi', count: 120 },
    { itemId: 'spirit_stone', count: 120 },
  ]);
  const { craftService } = createCraftHarness(player);
  const ctx = craftService.buildPipelineContext(createDeps([]));

  const start = craftService.startTechniqueActivity(player, 'alchemy', {
    recipeId: ALCHEMY_RECIPE.recipeId,
    ingredients: [{ itemId: 'herb.qi', count: 1 }],
    quantity: 100,
  }, ctx.deps);

  assert.equal(start.ok, true);
  assert.equal(player.alchemyJob?.quantity, 100);
  assert.equal(player.alchemyJob?.workTotalTicks, ALCHEMY_RECIPE.baseBrewTicks * 100);

  const highQuantity = 10000;
  const highQuantityPlayer = createPlayer('player:alchemy:quantity:resource-limit', [
    { itemId: 'herb.qi', count: highQuantity },
    { itemId: 'spirit_stone', count: highQuantity },
  ]);
  const { craftService: highQuantityCraftService } = createCraftHarness(highQuantityPlayer);
  const highQuantityCtx = highQuantityCraftService.buildPipelineContext(createDeps([]));

  const highQuantityStart = highQuantityCraftService.startTechniqueActivity(highQuantityPlayer, 'alchemy', {
    recipeId: ALCHEMY_RECIPE.recipeId,
    ingredients: [{ itemId: 'herb.qi', count: 1 }],
    quantity: highQuantity,
  }, highQuantityCtx.deps);

  assert.equal(highQuantityStart.ok, true);
  assert.equal(highQuantityPlayer.alchemyJob?.quantity, highQuantity);

  const overResourcePlayer = createPlayer('player:alchemy:quantity:over-resource', [
    { itemId: 'herb.qi', count: highQuantity },
    { itemId: 'spirit_stone', count: highQuantity },
  ]);
  const { craftService: overResourceCraftService } = createCraftHarness(overResourcePlayer);
  const overResourceCtx = overResourceCraftService.buildPipelineContext(createDeps([]));

  const overResourceStart = overResourceCraftService.startTechniqueActivity(overResourcePlayer, 'alchemy', {
    recipeId: ALCHEMY_RECIPE.recipeId,
    ingredients: [{ itemId: 'herb.qi', count: 1 }],
    quantity: highQuantity + 1,
  }, overResourceCtx.deps);

  assert.equal(overResourceStart.ok, false);
  assert.match(String(overResourceStart.error ?? ''), /数量不足|灵石不足/);
  assert.equal(overResourcePlayer.alchemyJob, null);
}

async function testAlchemyQueueStartsNextJobFromUnifiedQueue(): Promise<void> {
  const player = createPlayer('player:alchemy:queue', [
    { itemId: 'herb.qi', count: 8 },
    { itemId: 'spirit_stone', count: 20 },
  ]);
  const { craftService } = createCraftHarness(player);
  const ctx = craftService.buildPipelineContext(createDeps([]));

  const first = craftService.startTechniqueActivity(player, 'alchemy', {
    recipeId: ALCHEMY_RECIPE.recipeId,
    ingredients: [{ itemId: 'herb.qi', count: 1 }],
    quantity: 1,
  }, ctx.deps);
  assert.equal(first.ok, true);
  const herbCountAfterFirstStart = countPlayerItem(player, 'herb.qi');
  const spiritStonesAfterFirstStart = resolveWalletBalance(player, 'spirit_stone');

  const queued = craftService.startTechniqueActivity(player, 'alchemy', {
    recipeId: ALCHEMY_RECIPE.recipeId,
    ingredients: [{ itemId: 'herb.qi', count: 1 }],
    quantity: 1,
    queueMode: 'append',
  }, ctx.deps);
  assert.equal(queued.ok, true);
  assert.equal(countPlayerItem(player, 'herb.qi'), herbCountAfterFirstStart);
  assert.equal(resolveWalletBalance(player, 'spirit_stone'), spiritStonesAfterFirstStart);
  assert.equal(player.alchemyJob?.queuedJobs, undefined);
  assert.equal(player.techniqueActivityQueue.length, 1);
  assert.equal(player.techniqueActivityQueue[0]?.state, 'pending');
  assert.deepEqual(player.techniqueActivityQueue[0]?.cancelRef, {
    kind: 'alchemy',
    queueId: player.techniqueActivityQueue[0]?.queueId,
  });

  if (!player.alchemyJob) {
    throw new Error('alchemy job missing before queue completion tick');
  }
  player.alchemyJob.remainingTicks = 1;
  player.alchemyJob.workRemainingTicks = 1;
  player.alchemyJob.currentBatchRemainingTicks = 1;
  const completed = craftService.tickTechniqueActivity(player, 'alchemy', ctx.deps);
  assert.equal(completed.ok, true);
  assert.equal(player.techniqueActivityQueue.length, 0);
  assert.equal(player.alchemyJob?.phase, 'brewing');
  assert.equal(player.alchemyJob?.completedCount, 0);
  assert.equal(player.alchemyJob?.workRemainingTicks, player.alchemyJob?.workTotalTicks);
}

async function testAlchemyFailureDoesNotCreateOutput(): Promise<void> {
  const player = createPlayer('player:alchemy:failure', [
    { itemId: 'herb.qi', count: 2 },
  ]);
  const { craftService } = createCraftHarness(player);
  const ctx = craftService.buildPipelineContext(createDeps([]));

  const start = craftService.startTechniqueActivity(player, 'alchemy', {
    recipeId: ALCHEMY_RECIPE.recipeId,
    ingredients: [{ itemId: 'herb.qi', count: 1 }],
    quantity: 1,
  }, ctx.deps);
  assert.equal(start.ok, true);
  forceAlchemyLikeJobReadyToResolve(player.alchemyJob, 0);

  const result = craftService.tickTechniqueActivity(player, 'alchemy', ctx.deps);
  assert.equal(result.ok, true);
  assert.equal(player.alchemyJob, null);
  assert.equal(countPlayerItem(player, 'pill.qi'), 0);
  assert.deepEqual(result.groundDrops, []);
}

async function testAlchemyOutputDropsWhenInventoryFull(): Promise<void> {
  const player = createPlayer('player:alchemy:drop-full', [
    { itemId: 'herb.qi', count: 2 },
  ]);
  const { craftService } = createCraftHarness(player);
  const ctx = craftService.buildPipelineContext(createDeps([]));

  const start = craftService.startTechniqueActivity(player, 'alchemy', {
    recipeId: ALCHEMY_RECIPE.recipeId,
    ingredients: [{ itemId: 'herb.qi', count: 1 }],
    quantity: 1,
  }, ctx.deps);
  assert.equal(start.ok, true);
  player.inventory.capacity = 0;
  forceAlchemyLikeJobReadyToResolve(player.alchemyJob, 1);

  const result = craftService.tickTechniqueActivity(player, 'alchemy', ctx.deps);
  assert.equal(result.ok, true);
  assert.equal(player.alchemyJob, null);
  assert.equal(countPlayerItem(player, 'pill.qi'), 0);
  assert.equal(result.groundDrops?.[0]?.itemId, 'pill.qi');
  assert.equal(result.groundDrops?.[0]?.count, 6);
}

async function testLegacyActiveAlchemyAndForgingJobsContinueToCompletion(): Promise<void> {
  const alchemyPlayer = createPlayer('player:alchemy:legacy-active', []);
  const forgingPlayer = createPlayer('player:forging:legacy-active', []);
  const { craftService: alchemyCraftService } = createCraftHarness(alchemyPlayer);
  const { craftService: forgingCraftService } = createCraftHarness(forgingPlayer);
  const alchemyCtx = alchemyCraftService.buildPipelineContext(createDeps([]));
  const forgingCtx = forgingCraftService.buildPipelineContext(createDeps([]));

  alchemyPlayer.alchemyJob = createLegacyAlchemyLikeJob('alchemy');
  forgingPlayer.forgingJob = createLegacyAlchemyLikeJob('forging');

  const alchemyResult = alchemyCraftService.tickTechniqueActivity(alchemyPlayer, 'alchemy', alchemyCtx.deps);
  const forgingResult = forgingCraftService.tickTechniqueActivity(forgingPlayer, 'forging', forgingCtx.deps);

  assert.equal(alchemyResult.ok, true);
  assert.equal(forgingResult.ok, true);
  assert.equal(alchemyPlayer.alchemyJob, null);
  assert.equal(forgingPlayer.forgingJob, null);
  assert.equal(countPlayerItem(alchemyPlayer, 'pill.qi'), 1);
  assert.equal(countPlayerItem(forgingPlayer, 'equip.copper_sword'), 1);
}

async function testForgingUsesIndependentJobSlot(): Promise<void> {
  const player = createPlayer('player:forging:direct', [
    { itemId: 'ore.copper', count: 4 },
    { itemId: 'spirit_stone', count: 20 },
  ]);
  const { craftService } = createCraftHarness(player);
  const ctx = craftService.buildPipelineContext(createDeps([]));

  const start = craftService.startTechniqueActivity(player, 'forging', {
    kind: 'forging',
    recipeId: FORGING_RECIPE.recipeId,
    ingredients: [{ itemId: 'ore.copper', count: 1 }],
    quantity: 1,
  }, ctx.deps);
  assert.equal(start.ok, true);
  assert.equal(player.alchemyJob, null);
  assert.equal(player.forgingJob?.jobType, 'forging');
  assert.equal(player.forgingJob?.phase, 'brewing');
  assert.equal(player.forgingJob?.preparationTicks, 0);
}

async function testForgingResolveEdges(): Promise<void> {
  const successPlayer = createPlayer('player:forging:success', [
    { itemId: 'ore.copper', count: 2 },
  ]);
  const { craftService: successCraftService } = createCraftHarness(successPlayer);
  const successCtx = successCraftService.buildPipelineContext(createDeps([]));
  const successStart = startForgingJob(successCraftService, successPlayer, successCtx.deps);
  assert.equal(successStart.ok, true);
  forceAlchemyLikeJobReadyToResolve(successPlayer.forgingJob, 1);
  const successResult = successCraftService.tickTechniqueActivity(successPlayer, 'forging', successCtx.deps);
  assert.equal(successResult.ok, true);
  assert.equal(successPlayer.forgingJob, null);
  assert.equal(countPlayerItem(successPlayer, 'equip.copper_sword'), 1);

  const failurePlayer = createPlayer('player:forging:failure', [
    { itemId: 'ore.copper', count: 2 },
  ]);
  const { craftService: failureCraftService } = createCraftHarness(failurePlayer);
  const failureCtx = failureCraftService.buildPipelineContext(createDeps([]));
  const failureStart = startForgingJob(failureCraftService, failurePlayer, failureCtx.deps);
  assert.equal(failureStart.ok, true);
  forceAlchemyLikeJobReadyToResolve(failurePlayer.forgingJob, 0);
  const failureResult = failureCraftService.tickTechniqueActivity(failurePlayer, 'forging', failureCtx.deps);
  assert.equal(failureResult.ok, true);
  assert.equal(failurePlayer.forgingJob, null);
  assert.equal(countPlayerItem(failurePlayer, 'equip.copper_sword'), 0);
  assert.deepEqual(failureResult.groundDrops, []);

  const dropPlayer = createPlayer('player:forging:drop-full', [
    { itemId: 'ore.copper', count: 2 },
  ]);
  const { craftService: dropCraftService } = createCraftHarness(dropPlayer);
  const dropCtx = dropCraftService.buildPipelineContext(createDeps([]));
  const dropStart = startForgingJob(dropCraftService, dropPlayer, dropCtx.deps);
  assert.equal(dropStart.ok, true);
  dropPlayer.inventory.capacity = 0;
  forceAlchemyLikeJobReadyToResolve(dropPlayer.forgingJob, 1);
  const dropResult = dropCraftService.tickTechniqueActivity(dropPlayer, 'forging', dropCtx.deps);
  assert.equal(dropResult.ok, true);
  assert.equal(dropPlayer.forgingJob, null);
  assert.equal(countPlayerItem(dropPlayer, 'equip.copper_sword'), 0);
  assert.equal(dropResult.groundDrops?.[0]?.itemId, 'equip.copper_sword');
  assert.equal(dropResult.groundDrops?.[0]?.count, 1);
}

async function testForgingInterruptCancelAndQueue(): Promise<void> {
  const interruptPlayer = createPlayer('player:forging:interrupt-cancel', [
    { itemId: 'ore.copper', count: 4 },
  ]);
  const { craftService: interruptCraftService } = createCraftHarness(interruptPlayer);
  const interruptCtx = interruptCraftService.buildPipelineContext(createDeps([]));
  const start = startForgingJob(interruptCraftService, interruptPlayer, interruptCtx.deps);
  assert.equal(start.ok, true);
  const workRemainingBeforeInterrupt = interruptPlayer.forgingJob?.workRemainingTicks;
  const totalBeforeInterrupt = interruptPlayer.forgingJob?.workTotalTicks;
  const interrupt = interruptCraftService.interruptTechniqueActivity(
    interruptPlayer,
    'forging',
    'attack',
    interruptCtx.deps,
  );
  assert.equal(interrupt.ok, true);
  assert.equal(interrupt.messages?.[0]?.key, 'notice.craft.activity-interrupted-wait-generic');
  assert.equal(interruptPlayer.forgingJob?.phase, 'paused');
  assert.equal(interruptPlayer.forgingJob?.workRemainingTicks, workRemainingBeforeInterrupt);
  assert.equal(interruptPlayer.forgingJob?.workTotalTicks, totalBeforeInterrupt);
  assert.equal(interruptPlayer.forgingJob?.interruptWaitRemainingTicks, 10);

  const tickWhilePaused = interruptCraftService.tickTechniqueActivity(interruptPlayer, 'forging', interruptCtx.deps);
  assert.equal(tickWhilePaused.ok, true);
  assert.equal(interruptPlayer.forgingJob?.workRemainingTicks, workRemainingBeforeInterrupt);
  assert.equal(interruptPlayer.forgingJob?.interruptWaitRemainingTicks, 9);

  const cancel = interruptCraftService.cancelTechniqueActivity(interruptPlayer, 'forging', interruptCtx.deps);
  assert.equal(cancel.ok, true);
  assert.equal(interruptPlayer.forgingJob, null);

  const queuePlayer = createPlayer('player:forging:queue', [
    { itemId: 'ore.copper', count: 8 },
  ]);
  const { craftService: queueCraftService } = createCraftHarness(queuePlayer);
  const queueCtx = queueCraftService.buildPipelineContext(createDeps([]));
  const first = startForgingJob(queueCraftService, queuePlayer, queueCtx.deps);
  assert.equal(first.ok, true);
  const oreCountAfterFirstStart = countPlayerItem(queuePlayer, 'ore.copper');
  const queued = startForgingJob(queueCraftService, queuePlayer, queueCtx.deps, 'append');
  assert.equal(queued.ok, true);
  assert.equal(countPlayerItem(queuePlayer, 'ore.copper'), oreCountAfterFirstStart);
  assert.equal(queuePlayer.forgingJob?.queuedJobs, undefined);
  assert.equal(queuePlayer.techniqueActivityQueue.length, 1);
  assert.equal(queuePlayer.techniqueActivityQueue[0]?.state, 'pending');
  assert.deepEqual(queuePlayer.techniqueActivityQueue[0]?.cancelRef, {
    kind: 'forging',
    queueId: queuePlayer.techniqueActivityQueue[0]?.queueId,
  });

  forceAlchemyLikeJobReadyToResolve(queuePlayer.forgingJob, 1);
  const completed = queueCraftService.tickTechniqueActivity(queuePlayer, 'forging', queueCtx.deps);
  assert.equal(completed.ok, true);
  assert.equal(queuePlayer.techniqueActivityQueue.length, 0);
  assert.equal(queuePlayer.forgingJob?.phase, 'brewing');
  assert.equal(queuePlayer.forgingJob?.completedCount, 0);
  assert.equal(queuePlayer.forgingJob?.workRemainingTicks, queuePlayer.forgingJob?.workTotalTicks);
}

function startForgingJob(
  craftService: CraftPanelRuntimeService,
  player: any,
  deps: any,
  queueMode?: 'append',
): { ok: boolean } {
  return craftService.startTechniqueActivity(player, 'forging', {
    kind: 'forging',
    recipeId: FORGING_RECIPE.recipeId,
    ingredients: [{ itemId: 'ore.copper', count: 1 }],
    quantity: 1,
    queueMode,
  }, deps) as { ok: boolean };
}

function forceAlchemyLikeJobReadyToResolve(job: any, successRate: number): void {
  if (!job) {
    throw new Error('missing alchemy-like job');
  }
  job.successRate = successRate;
  job.remainingTicks = 1;
  job.workRemainingTicks = 1;
  job.currentBatchRemainingTicks = 1;
}

function createLegacyAlchemyLikeJob(kind: 'alchemy' | 'forging'): any {
  const recipe = kind === 'forging' ? FORGING_RECIPE : ALCHEMY_RECIPE;
  return {
    jobRunId: `job:${kind}:legacy-active`,
    jobType: kind,
    recipeId: recipe.recipeId,
    outputItemId: recipe.outputItemId,
    outputCount: 1,
    quantity: 1,
    completedCount: 0,
    successCount: 0,
    failureCount: 0,
    ingredients: recipe.ingredients.map((entry) => ({ itemId: entry.itemId, count: entry.count })),
    phase: 'brewing',
    preparationTicks: 0,
    batchBrewTicks: 1,
    currentBatchRemainingTicks: 1,
    pausedTicks: 0,
    spiritStoneCost: 0,
    totalTicks: 1,
    remainingTicks: 1,
    workTotalTicks: 1,
    workRemainingTicks: 1,
    successRate: 1,
    exactRecipe: true,
    startedAt: 100,
  };
}

async function testWorldAlchemyWritePathFlushesCurrentPipelineResult(): Promise<void> {
  const log: SmokeLog[] = [];
  const player = createPlayer('player:world:alchemy', [
    { itemId: 'herb.qi', count: 4 },
    { itemId: 'spirit_stone', count: 20 },
  ]);
  const { craftService, playerRuntimeService, persistedActiveJobs } = createCraftHarness(player);
  const mutationService = new WorldRuntimeCraftMutationService(
    playerRuntimeService,
    craftService,
    {
      getSocketByPlayerId(): unknown {
        return {
          emit(event: string, payload: { ok?: boolean }): void {
            log.push(['emit', event, Boolean(payload?.ok)]);
          },
        };
      },
    },
    {
      prefersMainline(): boolean {
        return true;
      },
    },
  );
  const worldAlchemyService = new WorldRuntimeAlchemyService(playerRuntimeService, craftService, mutationService);

  await worldAlchemyService.dispatchStartAlchemy(player.playerId, {
    recipeId: ALCHEMY_RECIPE.recipeId,
    ingredients: [{ itemId: 'herb.qi', count: 1 }],
    quantity: 1,
  }, createDeps(log));
  await waitForAsyncPersistence();

  assert.equal(player.alchemyJob?.phase, 'brewing');
  assert.equal(log.some((entry) => entry[0] === 'queuePlayerNotice' && entry[2].includes('炉')), false);
  assert.equal(log.some((entry) => entry[0] === 'queuePlayerNotice' && entry[4] === 'notice.craft.alchemy.start'), true);
  assert.equal(log.some((entry) => entry[0] === 'emit' && entry[1] === 'n:s:alchemyPanel' && entry[2] === true), true);
  assert.equal(persistedActiveJobs.at(-1)?.jobType, 'alchemy');
  assert.equal(persistedActiveJobs.at(-1)?.phase, 'brewing');
}

function createCraftHarness(player: any): {
  craftService: CraftPanelRuntimeService;
  playerRuntimeService: any;
  persistedActiveJobs: any[];
} {
  const persistedActiveJobs: any[] = [];
  const persistedTechniqueActivityQueues: Array<readonly unknown[]> = [];
  const contentTemplateRepository = createContentTemplateRepository();
  const playerRuntimeService = createPlayerRuntimeService(player);
  const playerDomainPersistenceService = {
    isEnabled(): boolean {
      return true;
    },
    async savePlayerActiveJob(_playerId: string, activeJob: unknown): Promise<void> {
      persistedActiveJobs.push(activeJob);
    },
    async savePlayerTechniqueActivityQueue(_playerId: string, rows: readonly unknown[]): Promise<void> {
      persistedTechniqueActivityQueues.push(rows);
    },
  };
  const alchemyQueryService = {
    buildAlchemyPanelPayload(): { ok: boolean } {
      return { ok: true };
    },
    buildAlchemyPanelPatchPayload(): { ok: boolean } {
      return { ok: true };
    },
    buildAlchemyPanelState(targetPlayer: any): { job: unknown; queue: unknown[] } {
      return {
        job: targetPlayer.alchemyJob,
        queue: targetPlayer.techniqueActivityQueue,
      };
    },
  };
  const enhancementQueryService = {
    buildEnhancementPanelPayload(): { ok: boolean } {
      return { ok: true };
    },
    buildEnhancementPanelPatchPayload(): { ok: boolean } {
      return { ok: true };
    },
  };
  const craftService = new CraftPanelRuntimeService(
    contentTemplateRepository as never,
    playerRuntimeService as never,
    playerDomainPersistenceService as never,
    alchemyQueryService as never,
    enhancementQueryService as never,
  );
  craftService.alchemyCatalog = [ALCHEMY_RECIPE];
  craftService.forgingCatalog = [FORGING_RECIPE];
  craftService.ensurePipelineInitialized();
  return { craftService, playerRuntimeService, persistedActiveJobs };
}

function createPlayer(playerId: string, items: Array<{ itemId: string; count: number }>): any {
  return {
    playerId,
    instanceId: 'instance:technique-smoke',
    x: 1,
    y: 2,
    inventory: {
      items: items.map((item) => createItemStack(item.itemId, item.count)),
      capacity: 40,
      revision: 1,
    },
    equipment: {
      slots: [],
      revision: 1,
    },
    wallet: {
      balances: [{ walletType: 'spirit_stone', balance: 100, frozenBalance: 0, version: 1 }],
    },
    realm: { realmLv: 1 },
    alchemySkill: { level: 1, exp: 0, expToNext: 60 },
    forgingSkill: { level: 1, exp: 0, expToNext: 60 },
    gatherSkill: { level: 1, exp: 0, expToNext: 60 },
    miningSkill: { level: 1, exp: 0, expToNext: 60 },
    formationSkill: { level: 1, exp: 0, expToNext: 60 },
    enhancementSkill: { level: 1, exp: 0, expToNext: 60 },
    enhancementSkillLevel: 1,
    alchemyPresets: [],
    enhancementRecords: [],
    alchemyJob: null,
    forgingJob: null,
    enhancementJob: null,
    techniqueActivityQueue: [],
    persistentRevision: 1,
    selfRevision: 1,
    dirtyDomains: new Set<string>(),
  };
}

function createPlayerRuntimeService(player: any): any {
  return {
    getPlayer(playerId: string): any | null {
      return playerId === player.playerId ? player : null;
    },
    getPlayerOrThrow(playerId: string): any {
      if (playerId !== player.playerId) {
        throw new Error(`unknown player: ${playerId}`);
      }
      return player;
    },
    canAffordWallet(_playerId: string, itemId: string, amount: number): boolean {
      return countPlayerItem(player, itemId) >= amount || resolveWalletBalance(player, itemId) >= amount;
    },
    debitWallet(_playerId: string, itemId: string, amount: number): void {
      const balance = player.wallet.balances[0];
      balance.balance = Math.max(0, Number(balance.balance ?? 0) - amount);
      consumePlayerItem(player, itemId, Math.min(amount, countPlayerItem(player, itemId)));
    },
    creditWallet(_playerId: string, itemId: string, amount: number): void {
      const balance = player.wallet.balances[0];
      balance.balance = Number(balance.balance ?? 0) + amount;
      receivePlayerItem(player, createItemStack(itemId, amount));
    },
    markPersistenceDirtyDomains(targetPlayer: any, domains: string[]): void {
      if (!(targetPlayer.dirtyDomains instanceof Set)) {
        targetPlayer.dirtyDomains = new Set<string>();
      }
      for (const domain of domains) {
        targetPlayer.dirtyDomains.add(domain);
      }
    },
    bumpPersistentRevision(targetPlayer: any): void {
      targetPlayer.persistentRevision = Math.max(0, Number(targetPlayer.persistentRevision ?? 0)) + 1;
    },
    receiveInventoryItem(_playerId: string, item: { itemId: string; count: number }): void {
      receivePlayerItem(player, item);
    },
    playerProgressionService: {
      refreshPreview(): void {},
      grantCraftRealmExp(): null {
        return null;
      },
    },
    playerAttributesService: {
      recalculate(): void {},
    },
    rebuildActionState(): void {},
  };
}

function createContentTemplateRepository(): any {
  return {
    createItem(itemId: string, count: number): unknown {
      return createItemStack(itemId, count);
    },
    normalizeItem(item: { itemId: string; count?: number; name?: string }): unknown {
      return createItemStack(item.itemId, item.count ?? 1, item.name);
    },
    getItemName(itemId: string): string {
      return resolveItemName(itemId);
    },
  };
}

function createDeps(log: SmokeLog[]): any {
  return {
    queuePlayerNotice(playerId: string, text: string, kind: string, _title?: unknown, _icon?: unknown, structured?: { key?: string }): void {
      log.push(['queuePlayerNotice', playerId, text, kind, structured?.key ?? null]);
    },
    getInstanceRuntimeOrThrow(): any {
      return {
        dropGroundItem(): { sourceId: string } {
          return { sourceId: 'ground:smoke' };
        },
      };
    },
    spawnGroundItem(): void {},
  };
}

function createItemStack(itemId: string, count: number, name = resolveItemName(itemId)): any {
  const materialValues = resolveMaterialValues(itemId);
  return {
    itemId,
    name,
    type: itemId.startsWith('equip.') ? 'equipment' : itemId.startsWith('artifact.') ? 'artifact' : 'material',
    count,
    level: 1,
    grade: 'mortal',
    ...(materialValues ? { materialValues } : {}),
  };
}

function resolveMaterialValues(itemId: string): { elements: Record<string, number> } | null {
  switch (itemId) {
    case 'herb.qi':
      return { elements: { wood: 1 } };
    case 'ore.copper':
      return { elements: { metal: 6, earth: 3 } };
    default:
      return null;
  }
}

function resolveItemName(itemId: string): string {
  switch (itemId) {
    case 'herb.qi':
      return '灵草';
    case 'ore.copper':
      return '铜矿';
    case 'pill.qi':
      return '聚气丹';
    case 'equip.copper_sword':
      return '铜剑';
    case 'artifact.sky_sword':
      return '巡天飞剑';
    case 'spirit_stone':
      return '灵石';
    default:
      return itemId;
  }
}

function countPlayerItem(player: any, itemId: string): number {
  return Array.isArray(player.inventory?.items)
    ? player.inventory.items.reduce((total: number, item: { itemId?: string; count?: number }) => (
      item.itemId === itemId ? total + Math.max(0, Math.floor(Number(item.count) || 0)) : total
    ), 0)
    : 0;
}

function consumePlayerItem(player: any, itemId: string, amount: number): void {
  let remaining = Math.max(0, Math.floor(Number(amount) || 0));
  if (remaining <= 0) {
    return;
  }
  for (let index = player.inventory.items.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const item = player.inventory.items[index];
    if (item?.itemId !== itemId) {
      continue;
    }
    const consumed = Math.min(remaining, Math.max(0, Math.floor(Number(item.count) || 0)));
    item.count -= consumed;
    remaining -= consumed;
    if (item.count <= 0) {
      player.inventory.items.splice(index, 1);
    }
  }
}

function receivePlayerItem(player: any, item: { itemId: string; count: number }): void {
  const existing = player.inventory.items.find((entry: { itemId?: string }) => entry.itemId === item.itemId);
  if (existing) {
    existing.count = Math.max(0, Math.floor(Number(existing.count) || 0)) + item.count;
    return;
  }
  player.inventory.items.push(createItemStack(item.itemId, item.count));
}

function resolveWalletBalance(player: any, itemId: string): number {
  if (itemId !== 'spirit_stone') {
    return 0;
  }
  const balance = player.wallet?.balances?.[0]?.balance;
  return Math.max(0, Math.floor(Number(balance) || 0));
}

async function waitForAsyncPersistence(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

void main();
