import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REQUIRED_KINDS = ['alchemy', 'forging', 'enhancement', 'gather', 'building', 'mining', 'formation'] as const;

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf-8');
}

function assertMatch(source: string, pattern: RegExp, message: string): void {
  assert.match(source, pattern, message);
}

function assertNoMatch(source: string, pattern: RegExp, message: string): void {
  assert.doesNotMatch(source, pattern, message);
}

function assertRegistersAllStrategies(source: string, label: string): void {
  for (const strategyName of ['Alchemy', 'Forging', 'Enhancement', 'Gather', 'Mining', 'Building', 'Formation']) {
    assertMatch(source, new RegExp(`\\.register\\(new ${strategyName}Strategy\\(`), `${label} must register ${strategyName}Strategy`);
  }
}

function main(): void {
  const craftRuntimeSource = readSource('packages/server/src/runtime/craft/craft-panel-runtime.service.ts');
  const worldTickSource = readSource('packages/server/src/runtime/world/world-runtime-craft-tick.service.ts');
  const worldInterruptSource = readSource('packages/server/src/runtime/world/world-runtime-craft-interrupt.service.ts');
  const commandSource = readSource('packages/server/src/runtime/world/command/world-runtime-player-command.service.ts');
  const alchemyWorldSource = readSource('packages/server/src/runtime/world/world-runtime-alchemy.service.ts');
  const enhancementWorldSource = readSource('packages/server/src/runtime/world/world-runtime-enhancement.service.ts');
  const lootContainerSource = readSource('packages/server/src/runtime/world/world-runtime-loot-container.service.ts');
  const buildingWorldSource = readSource('packages/server/src/runtime/world/world-runtime-building.service.ts');
  const mutationSource = readSource('packages/server/src/runtime/world/world-runtime-craft-mutation.service.ts');
  const taskViewSource = readSource('packages/server/src/runtime/craft/technique-activity-task-view.helpers.ts');
  const queueSource = readSource('packages/server/src/runtime/craft/pipeline/technique-activity-queue.service.ts');
  const strategyDir = resolve(process.cwd(), 'packages/server/src/runtime/craft/pipeline/strategies');
  const strategySources = readdirSync(strategyDir)
    .filter((fileName) => fileName.endsWith('.strategy.ts'))
    .map((fileName) => [fileName, readFileSync(join(strategyDir, fileName), 'utf-8')] as const);

  assertRegistersAllStrategies(craftRuntimeSource, 'CraftPanelRuntimeService');
  assertRegistersAllStrategies(worldTickSource, 'WorldRuntimeCraftTickService');
  assertRegistersAllStrategies(worldInterruptSource, 'WorldRuntimeCraftInterruptService');

  assertMatch(craftRuntimeSource, /startTechniqueActivity\(player, kind[\s\S]*?return this\.pipeline\.start\(player, kind, payload, ctx\);/, 'startTechniqueActivity must delegate to pipeline.start');
  assertMatch(craftRuntimeSource, /cancelTechniqueActivity\(player, kind[\s\S]*?return this\.pipeline\.cancel\(player, kind, ctx\);/, 'cancelTechniqueActivity must delegate to pipeline.cancel');
  assertMatch(craftRuntimeSource, /interruptTechniqueActivity\(player, kind[\s\S]*?return this\.pipeline\.interrupt\(player, kind, reason, ctx\);/, 'interruptTechniqueActivity must delegate to pipeline.interrupt');
  assertMatch(craftRuntimeSource, /tickTechniqueActivity\(player, kind[\s\S]*?return this\.pipeline\.tick\(player, kind, ctx\);/, 'tickTechniqueActivity must delegate to pipeline.tick');

  assertMatch(worldTickSource, /for \(const kind of this\.craftPanelRuntimeService\.listActiveTechniqueActivityKinds\(player\)\) \{[\s\S]*?this\.craftPanelRuntimeService\.tickTechniqueActivity\(player, kind, deps\)/, 'world craft tick must enumerate active kinds and tick through the craft pipeline entry');
  assertNoMatch(worldTickSource, /\btickAlchemy\s*\(|\btickEnhancement\s*\(|\btickGather\s*\(|\btickBuildingConstruction\s*\(/, 'world craft tick must not directly dispatch per-technique tick services');
  assertMatch(worldInterruptSource, /for \(const kind of this\.craftPanelRuntimeService\.listActiveTechniqueActivityKinds\(player\)\) \{[\s\S]*?this\.craftPanelRuntimeService\.interruptTechniqueActivity\(player, kind, reason, deps\)/, 'world craft interrupt must enumerate active kinds and interrupt through the craft pipeline entry');

  for (const kind of REQUIRED_KINDS) {
    assertMatch(commandSource, new RegExp(`case '${kind === 'formation' ? 'startFormationMaintenance' : kind === 'alchemy' ? 'startAlchemy' : kind === 'forging' ? 'startForging' : kind === 'enhancement' ? 'startEnhancement' : kind === 'gather' ? 'startGather' : kind === 'building' ? 'startBuilding' : 'startMining'}'`), `command router must expose start command for ${kind}`);
  }
  assertMatch(alchemyWorldSource, /craftPanelRuntimeService\.startTechniqueActivity\(player, activityKind, payload, deps\)/, 'alchemy/forging world facade must start through unified craft activity entry');
  assertMatch(alchemyWorldSource, /craftPanelRuntimeService\.cancelTechniqueActivity\(player, normalizedActivityKind, deps\)/, 'alchemy/forging world facade must cancel through unified craft activity entry');
  assertMatch(alchemyWorldSource, /craftPanelRuntimeService\.tickTechniqueActivity\(player, normalizedActivityKind, deps\)/, 'alchemy/forging world facade must tick through unified craft activity entry');
  assertMatch(enhancementWorldSource, /craftPanelRuntimeService\.startTechniqueActivity\(player, 'enhancement', payload, deps\)/, 'enhancement world facade must start through unified craft activity entry');
  assertMatch(enhancementWorldSource, /craftPanelRuntimeService\.cancelTechniqueActivity\(player, 'enhancement', deps\)/, 'enhancement world facade must cancel through unified craft activity entry');
  assertMatch(enhancementWorldSource, /craftPanelRuntimeService\.tickTechniqueActivity\(player, 'enhancement', deps\)/, 'enhancement world facade must tick through unified craft activity entry');

  for (const [fileName, source] of strategySources) {
    assertNoMatch(source, /\bexecuteStart\s*\(/, `${fileName} must not implement full start delegation`);
    assertNoMatch(source, /\bexecuteCancel\s*\(/, `${fileName} must not implement full cancel delegation`);
    assertNoMatch(source, /\bexecuteInterrupt\s*\(/, `${fileName} must not implement full interrupt delegation`);
  }

  assertMatch(queueSource, /const QUEUE_SLOT = 'techniqueActivityQueue';/, 'unified queue service must use techniqueActivityQueue as runtime queue slot');
  assertMatch(craftRuntimeSource, /enqueueCraftQueueItem\(player[\s\S]*?player\.techniqueActivityQueue = queue/, 'craft runtime queue writes must target techniqueActivityQueue');
  assertNoMatch(craftRuntimeSource, /\.queuedJobs\s*=/, 'craft runtime must not write new legacy queuedJobs');
  assertMatch(craftRuntimeSource, /migrateLegacyCraftQueueToUnifiedQueue\(player, job\.queuedJobs\)/, 'legacy queuedJobs may only be migrated into unified queue during compatibility recovery');
  assertMatch(commandSource, /holder\.queuedJobs = nextQueue/, 'legacy queuedJobs direct mutation is limited to cancel compatibility for old buttons');

  assertMatch(taskViewSource, /const LEGACY_ACTIVE_JOB_SLOTS = \[[\s\S]*?\['alchemy', 'alchemyJob'\][\s\S]*?\['formation', 'formationJob'\][\s\S]*?\['mining', 'miningJob'\]/, 'task view must include all active job slots including conditional kinds');
  assertMatch(taskViewSource, /workRemainingTicks: resolveNonNegativeInteger\(job\.workRemainingTicks \?\? job\.remainingTicks\)/, 'task view must expose work progress from workRemainingTicks');
  assertMatch(taskViewSource, /task\.interruptWaitRemainingTicks = interruptWaitRemainingTicks/, 'task view must expose interrupt wait separately from work progress');

  assertMatch(lootContainerSource, /async tickGather\(playerId, deps\) \{[\s\S]*?return executeGatherTick\(playerId,[\s\S]*?worldRuntimeLootContainerService: this/, 'legacy loot tickGather facade must delegate to strategy tick helper');
  assertMatch(buildingWorldSource, /export function tickBuildingConstruction\(runtime, playerId\) \{[\s\S]*?return executeBuildingTick\(playerId,/, 'legacy building tick facade must delegate to strategy tick helper');
  assertNoMatch(buildingWorldSource, /MapInstanceRuntime\.tickOnce\(\)[\s\S]*?tickBuildingConstruction/, 'building construction must not be advanced from map instance tick');

  assertMatch(mutationSource, /emitTechniqueActivityTaskUpdate\(playerId\) \{[\s\S]*?emitTechniqueActivityTasks\(socket, this\.craftPanelRuntimeService\.buildTechniqueActivityTaskListPayload\(player\)\)/, 'craft mutation task update must emit unified task list payload');
  assertMatch(mutationSource, /flushCraftMutation\([\s\S]*?this\.emitTechniqueActivityTaskUpdate\(playerId\)/, 'craft mutation flush must refresh the unified task list when activity state changes');
  assertMatch(mutationSource, /emitCraftPanelUpdate\(playerId, panel[\s\S]*?buildTechniqueActivityPanelPatchPayload\(player, panel\)/, 'craft mutation flush must keep active panel updates on patch payload paths');

  console.log(JSON.stringify({
    ok: true,
    answers: [
      '所有 runtime kind 都注册到 CraftPanelRuntimeService、WorldRuntimeCraftTickService 和 WorldRuntimeCraftInterruptService 的 TechniqueActivityPipelineService。',
      'start/cancel/interrupt/tick 的权威入口均委托 pipeline，world tick 不再直接分发单技艺 tick service。',
      '炼丹/炼器/强化 world service 只保留 facade，内部调用统一技艺活动入口。',
      'strategy 不再实现 executeStart/executeCancel/executeInterrupt，旧 start/cancel/interrupt 完整委托已移除。',
      '运行时队列写入只进入 techniqueActivityQueue，legacy queuedJobs 只作为兼容迁移/旧按钮取消来源。',
      '统一任务视图覆盖所有 active job、队列和独立 interrupt wait。',
      '采集/建造旧 tick service 已降级为 helper facade，真实推进由统一技艺 tick 调用链驱动。',
      '技艺 mutation flush 发统一任务列表，并保留面板 patch payload。',
    ],
  }, null, 2));
}

main();
