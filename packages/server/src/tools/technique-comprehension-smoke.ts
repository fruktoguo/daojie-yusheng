import assert from 'node:assert/strict';
import {
  calculateTechniqueComprehensionProgressGain,
  calculateTechniqueComprehensionRequiredProgress,
  computeCraftSkillExpGain,
} from '@mud/shared';
import { PlayerProgressionService } from '../runtime/player/player-progression.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { TechniqueActivityPipelineService } from '../runtime/craft/pipeline/technique-activity-pipeline.service';
import { TransmissionStrategy } from '../runtime/craft/pipeline/strategies/transmission.strategy';

function createTechnique(techId: string, name: string) {
  return {
    techId,
    name,
    level: 1,
    exp: 0,
    expToNext: 100,
    realmLv: 1,
    realm: 'entry',
    grade: 'mortal',
    category: 'internal',
    skillsEnabled: true,
    skills: [],
    layers: [{ level: 1, expToNext: 100, attrs: {} }],
  };
}

const technique = createTechnique('tech.test', '试炼功法');
const createdTechnique = createTechnique('gen_test_created', '自创试炼功法');

const contentTemplateRepository = {
  createTechniqueState(techId: string) {
    if (techId === technique.techId) {
      return { ...technique, layers: [...technique.layers] };
    }
    if (techId === createdTechnique.techId) {
      return { ...createdTechnique, layers: [...createdTechnique.layers] };
    }
    return null;
  },
  getRealmLevel() {
    return null;
  },
  getBreakthroughForRealmLevel() {
    return null;
  },
};

function resolveExpToNextByLevel() {
  return 60;
}

const playerAttributesService = {
  recalculate() {
    return true;
  },
  markPanelDirty() {},
};

function createPlayer(playerId: string, x: number, y: number) {
  return {
    playerId,
    displayName: playerId,
    instanceId: 'instance:test',
    x,
    y,
    hp: 100,
    maxHp: 100,
    qi: 100,
    maxQi: 100,
    foundation: 0,
    combatExp: 0,
    lifeElapsedTicks: 0,
    realm: { realmLv: 1, stage: 'mortal', progress: 0, progressToNext: 100, breakthroughReady: false },
    techniques: { revision: 0, techniques: [], cultivatingTechId: null },
    pendingTechniqueComprehensions: [],
    transmissionSkill: { level: 1, exp: 0, expToNext: 60 },
    transmissionJob: null,
    combat: { cultivationActive: false, autoSwitchCultivation: false, autoBattleSkills: [] },
    notices: { nextId: 1, queue: [] },
    actions: { revision: 0, actions: [], contextActions: [] },
    attrs: {
      revision: 0,
      baseAttrs: {},
      finalAttrs: {},
      numericStats: {
        realmExpPerTick: 0,
        techniqueExpPerTick: 0,
        playerExpRate: 0,
        techniqueExpRate: 0,
      },
      ratioDivisors: {},
    },
    buffs: { revision: 0, buffs: [] },
    inventory: { revision: 0, items: [] },
    equipment: { revision: 0, slots: {} },
    dirtyDomains: new Set<string>(),
    persistentRevision: 0,
  };
}

function createRuntimeService() {
  const progressionService = new PlayerProgressionService(
    contentTemplateRepository as never,
    playerAttributesService as never,
    null,
  );
  progressionService.onModuleInit();
  (progressionService as any).getRealmRuntimeExpToNext = resolveExpToNextByLevel;
  const runtimeService = new PlayerRuntimeService(
    contentTemplateRepository as never,
    null as never,
    playerAttributesService as never,
    {
      refreshPreview() {},
    } as never,
  );
  (runtimeService as any).playerProgressionService.getRealmRuntimeExpToNext = resolveExpToNextByLevel;
  return { progressionService, runtimeService };
}

function createTransmissionPipeline(runtimeService: PlayerRuntimeService) {
  return createTransmissionPipelineWithInstance(runtimeService, null);
}

function createTransmissionPipelineWithInstance(runtimeService: PlayerRuntimeService, instance: any | null) {
  const pipeline = new TechniqueActivityPipelineService();
  pipeline.register(new TransmissionStrategy());
  const ctx = {
    contentTemplateRepository: {
      ...(contentTemplateRepository as Record<string, unknown>),
      getItemName() {
        return null;
      },
      normalizeItem(item: unknown) {
        return item;
      },
    },
    resolveExpToNextByLevel,
    getInstanceRuntime() {
      return instance;
    },
    deps: {
      playerRuntimeService: runtimeService,
      getInstanceRuntime() {
        return instance;
      },
      refreshPlayerContextActions() {},
    },
  };
  return { pipeline, ctx };
}

function startTransmissionWithPipeline(
  runtimeService: PlayerRuntimeService,
  teacherPlayerId: string,
  learner: ReturnType<typeof createPlayer>,
  techniqueId: string,
) {
  const { pipeline, ctx } = createTransmissionPipeline(runtimeService);
  const result = pipeline.start(
    learner,
    'transmission',
    { learnerPlayerId: learner.playerId, teacherPlayerId, techniqueId },
    ctx as never,
  );
  assert.equal(result.ok, true, result.error);
  return { pipeline, ctx };
}

function tickTransmissionWithPipeline(runtimeService: PlayerRuntimeService, learner: ReturnType<typeof createPlayer>) {
  const { pipeline, ctx } = createTransmissionPipeline(runtimeService);
  return pipeline.tick(learner, 'transmission', ctx as never);
}

function interruptTransmissionWithPipeline(
  runtimeService: PlayerRuntimeService,
  learner: ReturnType<typeof createPlayer>,
  reason: 'move' | 'attack' | 'cancel' | 'cultivate' | 'defeat',
) {
  const { pipeline, ctx } = createTransmissionPipeline(runtimeService);
  return pipeline.interrupt(learner, 'transmission', reason, ctx as never);
}

function cancelTransmissionWithPipeline(runtimeService: PlayerRuntimeService, learner: ReturnType<typeof createPlayer>) {
  const { pipeline, ctx } = createTransmissionPipeline(runtimeService);
  return pipeline.cancel(learner, 'transmission', ctx as never);
}

function getExpectedTransmissionExpGain(skillLevel: number, targetLevel: number, ticks: number): number {
  return computeCraftSkillExpGain({
    skillLevel,
    targetLevel,
    baseActionTicks: ticks,
    getExpToNextByLevel: resolveExpToNextByLevel,
    successCount: 1,
    failureCount: 0,
    successMultiplier: 1,
  }).finalGain;
}

function getExpectedRepeatedTransmissionExpGain(skillLevel: number, targetLevel: number, ticks: number): number {
  const normalizedTicks = Math.max(0, Math.floor(Number(ticks) || 0));
  let level = Math.max(1, Math.floor(Number(skillLevel) || 1));
  let exp = 0;
  const expToNext = resolveExpToNextByLevel();
  for (let index = 0; index < normalizedTicks; index += 1) {
    exp += getExpectedTransmissionExpGain(level, targetLevel, 1);
    while (expToNext > 0 && exp >= expToNext) {
      exp -= expToNext;
      level += 1;
    }
  }
  return exp;
}

function assertAlmostEqual(actual: number, expected: number, label: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: expected ${expected}, got ${actual}`);
}

function expectedRequiredProgress(
  sourceKind: 'normal' | 'created',
  techniqueEntry: { realmLv?: number; grade?: any },
  learnerRealmLv: number,
): number {
  return calculateTechniqueComprehensionRequiredProgress({
    sourceKind,
    techniqueRealmLv: techniqueEntry.realmLv,
    grade: techniqueEntry.grade,
    learnerRealmLv,
  });
}

function testRequiredProgressUsesPreFoundationLearnerReduction() {
  const createdLevel1 = calculateTechniqueComprehensionRequiredProgress({
    sourceKind: 'created',
    techniqueRealmLv: 8,
    grade: 'earth',
    learnerRealmLv: 1,
    learnerTransmissionLevel: 1,
    teacherTransmissionLevel: 1,
  });
  const createdLevel30 = calculateTechniqueComprehensionRequiredProgress({
    sourceKind: 'created',
    techniqueRealmLv: 8,
    grade: 'earth',
    learnerRealmLv: 30,
    learnerTransmissionLevel: 1,
    teacherTransmissionLevel: 1,
  });
  const createdFoundation = calculateTechniqueComprehensionRequiredProgress({
    sourceKind: 'created',
    techniqueRealmLv: 8,
    grade: 'earth',
    learnerRealmLv: 31,
    learnerTransmissionLevel: 1,
    teacherTransmissionLevel: 1,
  });
  const normalLevel1 = calculateTechniqueComprehensionRequiredProgress({
    sourceKind: 'normal',
    techniqueRealmLv: 8,
    grade: 'earth',
    learnerRealmLv: 1,
  });
  const normalLevel30 = calculateTechniqueComprehensionRequiredProgress({
    sourceKind: 'normal',
    techniqueRealmLv: 8,
    grade: 'earth',
    learnerRealmLv: 30,
  });
  const changedSkillFactors = calculateTechniqueComprehensionRequiredProgress({
    sourceKind: 'created',
    techniqueRealmLv: 8,
    grade: 'earth',
    learnerRealmLv: 30,
    learnerTransmissionLevel: 80,
    teacherTransmissionLevel: 80,
  });

  assert.equal(createdLevel1, 480);
  assert.equal(createdLevel30, 4800);
  assert.equal(createdFoundation, 300 * 8 * 4);
  assert.equal(normalLevel1, 16);
  assert.equal(normalLevel30, 160);
  assert.equal(changedSkillFactors, createdLevel30);
}

function testDynamicFactorsApplyToProgressGain() {
  const lowLearnerGain = calculateTechniqueComprehensionProgressGain({
    baseProgress: 10,
    techniqueRealmLv: 8,
    learnerRealmLv: 1,
    learnerTransmissionLevel: 1,
  });
  const highLearnerGain = calculateTechniqueComprehensionProgressGain({
    baseProgress: 10,
    techniqueRealmLv: 8,
    learnerRealmLv: 12,
    learnerTransmissionLevel: 12,
  });

  assert.ok(lowLearnerGain < 10);
  assert.ok(highLearnerGain > 10);
  assertAlmostEqual(lowLearnerGain, 10 / ((1.1 ** 7) * (1.05 ** 7)), 'low learner gain');
  assertAlmostEqual(highLearnerGain, 10 / ((0.98 ** 4) * (0.95 ** 4)), 'high learner gain');
}

function testSelfComprehensionProgressesOnlyWithoutTransmission() {
  const { progressionService } = createRuntimeService();
  const learner = createPlayer('learner:self', 0, 0);
  learner.techniques.cultivatingTechId = createdTechnique.techId;
  learner.pendingTechniqueComprehensions.push({
    techId: createdTechnique.techId,
    name: createdTechnique.name,
    sourceKind: 'created',
    selfComprehensionAllowed: true,
    progress: 0,
    requiredProgress: 10,
    realmLv: 1,
    grade: 'mortal',
    category: 'internal',
    createdAtTick: 0,
    updatedAtTick: 0,
    activeTransferJob: null,
  });

  const progressed = progressionService.advanceTechniqueProgressInternal(learner, 999, {
    allowPendingComprehension: true,
    expBonus: 100000,
    pendingComprehensionTicks: 4,
  });
  assert.equal(progressed.changed, true);
  assert.equal(learner.pendingTechniqueComprehensions[0]?.progress, 4);
  assert.equal(learner.transmissionSkill.exp, getExpectedTransmissionExpGain(1, 1, 4));

  const acceleratedLearner = createPlayer('learner:self-accelerated', 0, 0);
  acceleratedLearner.realm.realmLv = 8;
  acceleratedLearner.transmissionSkill.level = 8;
  acceleratedLearner.techniques.cultivatingTechId = createdTechnique.techId;
  acceleratedLearner.pendingTechniqueComprehensions.push({
    techId: createdTechnique.techId,
    name: createdTechnique.name,
    sourceKind: 'created',
    selfComprehensionAllowed: true,
    progress: 0,
    requiredProgress: 100,
    realmLv: 1,
    grade: 'mortal',
    category: 'internal',
    createdAtTick: 0,
    updatedAtTick: 0,
    activeTransferJob: null,
  });
  const acceleratedProgressed = progressionService.advanceTechniqueProgressInternal(acceleratedLearner, 999, {
    allowPendingComprehension: true,
    expBonus: 100000,
    pendingComprehensionTicks: 4,
  });
  assert.equal(acceleratedProgressed.changed, true);
  assert.ok((acceleratedLearner.pendingTechniqueComprehensions[0]?.progress ?? 0) > 4);
  assert.equal(acceleratedLearner.transmissionSkill.exp, getExpectedTransmissionExpGain(8, 1, 4));

  learner.transmissionJob = {
    jobRunId: 'job:test',
    jobType: 'transmission',
    techniqueId: createdTechnique.techId,
    techniqueName: createdTechnique.name,
    teacherPlayerId: 'teacher:1',
    startedAt: 0,
    status: 'running',
    phase: 'transmitting',
    totalTicks: 100,
    remainingTicks: 100,
    workTotalTicks: 100,
    workRemainingTicks: 100,
    pausedTicks: 0,
    range: 2,
    realmLv: 1,
    successRate: 1,
    spiritStoneCost: 0,
  };
  const blocked = progressionService.advanceTechniqueProgressInternal(learner, 999, {
    allowPendingComprehension: true,
    expBonus: 100000,
    pendingComprehensionTicks: 4,
  });
  assert.equal(blocked.changed, false);
  assert.equal(learner.pendingTechniqueComprehensions[0]?.progress, 4);
  assert.equal(learner.transmissionSkill.exp, getExpectedTransmissionExpGain(1, 1, 4));
}

function testTransmittedPendingCannotSelfComprehendWithoutActiveJob() {
  const { progressionService } = createRuntimeService();
  const learner = createPlayer('learner:self-blocked', 0, 0);
  learner.techniques.cultivatingTechId = createdTechnique.techId;
  learner.pendingTechniqueComprehensions.push({
    techId: createdTechnique.techId,
    name: createdTechnique.name,
    sourceKind: 'created',
    selfComprehensionAllowed: false,
    progress: 0,
    requiredProgress: 10,
    realmLv: 1,
    grade: 'mortal',
    category: 'internal',
    createdAtTick: 0,
    updatedAtTick: 0,
    activeTransferJob: null,
  });

  const result = progressionService.advanceTechniqueProgressInternal(learner, 999, {
    allowPendingComprehension: true,
    expBonus: 100000,
    pendingComprehensionTicks: 4,
  });

  assert.equal(result.changed, true);
  assert.equal(learner.techniques.cultivatingTechId, null);
  assert.equal(learner.pendingTechniqueComprehensions[0]?.progress, 0);
  assert.equal(learner.transmissionSkill.exp, 0);
}

function testTransmittedPendingCannotBeSetAsMainTechnique() {
  const { runtimeService } = createRuntimeService();
  const learner = createPlayer('learner:set-main-blocked', 0, 0);
  learner.pendingTechniqueComprehensions.push({
    techId: createdTechnique.techId,
    name: createdTechnique.name,
    sourceKind: 'created',
    selfComprehensionAllowed: false,
    progress: 0,
    requiredProgress: 10,
    realmLv: 1,
    grade: 'mortal',
    category: 'internal',
    createdAtTick: 0,
    updatedAtTick: 0,
    activeTransferJob: null,
  });
  runtimeService.players.set(learner.playerId, learner);

  assert.throws(
    () => runtimeService.cultivateTechnique(learner.playerId, createdTechnique.techId),
    /只能通过传法领悟/,
  );
  assert.equal(learner.techniques.cultivatingTechId, null);
}

function testCreatedPendingRefreshDoesNotUnlockTransmittedTechnique() {
  const { runtimeService } = createRuntimeService();
  const learner = createPlayer('learner:refresh-blocked', 0, 0);
  learner.pendingTechniqueComprehensions.push({
    techId: createdTechnique.techId,
    name: createdTechnique.name,
    sourceKind: 'created',
    selfComprehensionAllowed: false,
    progress: 2,
    requiredProgress: 10,
    realmLv: 1,
    grade: 'mortal',
    category: 'internal',
    createdAtTick: 0,
    updatedAtTick: 0,
    activeTransferJob: null,
  });
  runtimeService.players.set(learner.playerId, learner);

  assert.equal(runtimeService.addPendingTechniqueComprehensionById(learner.playerId, createdTechnique.techId, 'created'), true);
  assert.equal(learner.pendingTechniqueComprehensions.length, 1);
  assert.equal(learner.pendingTechniqueComprehensions[0]?.selfComprehensionAllowed, false);

  assert.equal(
    runtimeService.addPendingTechniqueComprehensionById(
      learner.playerId,
      createdTechnique.techId,
      'created',
      learner.playerId,
    ),
    true,
  );
  assert.equal(learner.pendingTechniqueComprehensions[0]?.selfComprehensionAllowed, true);
}

function testCreatedPendingWithoutCreatorDoesNotAutoMainTechnique() {
  const { runtimeService } = createRuntimeService();
  const learner = createPlayer('learner:auto-main-blocked', 0, 0);
  runtimeService.players.set(learner.playerId, learner);

  assert.equal(runtimeService.addPendingTechniqueComprehensionById(learner.playerId, createdTechnique.techId, 'created'), true);
  assert.equal(learner.pendingTechniqueComprehensions[0]?.selfComprehensionAllowed, false);
  assert.equal(learner.techniques.cultivatingTechId, null);
}

function testCultivationUsesElapsedTicksForPendingComprehension() {
  const { progressionService } = createRuntimeService();
  const learner = createPlayer('learner:cultivation', 0, 0);
  learner.combat.cultivationActive = true;
  learner.attrs.numericStats.techniqueExpPerTick = 999;
  learner.attrs.numericStats.techniqueExpRate = 100000;
  learner.techniques.cultivatingTechId = createdTechnique.techId;
  learner.pendingTechniqueComprehensions.push({
    techId: createdTechnique.techId,
    name: createdTechnique.name,
    sourceKind: 'created',
    progress: 0,
    requiredProgress: 10,
    realmLv: 1,
    grade: 'mortal',
    category: 'internal',
    createdAtTick: 0,
    updatedAtTick: 0,
    activeTransferJob: null,
  });

  const result = progressionService.advanceCultivation(learner, 1, { auraMultiplier: 10 });
  assert.equal(result.changed, true);
  assert.equal(learner.pendingTechniqueComprehensions[0]?.requiredProgress, expectedRequiredProgress('created', createdTechnique, learner.realm.realmLv));
  assert.equal(learner.pendingTechniqueComprehensions[0]?.progress, 1);
  assert.equal(learner.transmissionSkill.exp, getExpectedTransmissionExpGain(1, 1, 1));
}

function testAutoSwitchCultivationCanSelectPendingComprehension() {
  const { progressionService } = createRuntimeService();
  const learner = createPlayer('learner:auto-switch-pending', 0, 0);
  const perfected = {
    ...technique,
    techId: 'tech.perfected',
    name: '圆满试炼功法',
    exp: 0,
    expToNext: 0,
    layers: [{ level: 1, expToNext: 0, attrs: {} }],
  };
  learner.combat.cultivationActive = true;
  learner.combat.autoSwitchCultivation = true;
  learner.attrs.numericStats.techniqueExpPerTick = 999;
  learner.techniques.techniques.push(perfected);
  learner.techniques.cultivatingTechId = perfected.techId;
  learner.pendingTechniqueComprehensions.push({
    techId: createdTechnique.techId,
    name: createdTechnique.name,
    sourceKind: 'created',
    selfComprehensionAllowed: true,
    progress: 0,
    requiredProgress: 300,
    realmLv: 1,
    grade: 'mortal',
    category: 'internal',
    createdAtTick: 0,
    updatedAtTick: 0,
    activeTransferJob: null,
  });

  const result = progressionService.advanceCultivation(learner, 1, { auraMultiplier: 10 });
  assert.equal(result.changed, true);
  assert.equal(learner.techniques.cultivatingTechId, createdTechnique.techId);
  assert.equal(learner.pendingTechniqueComprehensions[0]?.progress, 1);
  assert.equal(learner.transmissionSkill.exp, getExpectedTransmissionExpGain(1, 1, 1));
  assert.ok(result.notices.some((notice: any) => notice.structured?.key === 'notice.progression.technique-auto-switch'));
}

function testMonsterKillProgressesComprehensionByOneCultivationTick() {
  const { progressionService } = createRuntimeService();
  const learner = createPlayer('learner:kill-comprehension', 0, 0);
  learner.attrs.numericStats.playerExpRate = 0;
  learner.attrs.numericStats.techniqueExpRate = 100000;
  learner.techniques.cultivatingTechId = createdTechnique.techId;
  learner.pendingTechniqueComprehensions.push({
    techId: createdTechnique.techId,
    name: createdTechnique.name,
    sourceKind: 'created',
    selfComprehensionAllowed: true,
    progress: 0,
    requiredProgress: 300,
    realmLv: 1,
    grade: 'mortal',
    category: 'internal',
    createdAtTick: 0,
    updatedAtTick: 0,
    activeTransferJob: null,
  });

  const result = progressionService.grantMonsterKillProgress(learner, {
    monsterLevel: 120,
    monsterName: '极境试炼妖',
    monsterTier: 'demon_king',
    expMultiplier: 1000000,
    contributionRatio: 1,
    expAdjustmentRealmLv: 1,
    isKiller: true,
  });
  assert.equal(result.changed, true);
  assert.equal(learner.pendingTechniqueComprehensions[0]?.progress, 1);
  assert.equal(learner.transmissionSkill.exp, getExpectedTransmissionExpGain(1, 1, 1));
  assert.ok(
    result.notices.some((notice: any) => String(notice.structured?.vars?.details ?? '').includes(`${createdTechnique.name} 领悟进度 +1`)),
  );
}

function testMonsterKillAutoSwitchesAndProgressesPendingComprehension() {
  const { progressionService } = createRuntimeService();
  const learner = createPlayer('learner:kill-auto-switch-pending', 0, 0);
  const perfected = {
    ...technique,
    techId: 'tech.kill-perfected',
    name: '击杀圆满功法',
    exp: 0,
    expToNext: 0,
    layers: [{ level: 1, expToNext: 0, attrs: {} }],
  };
  learner.combat.autoSwitchCultivation = true;
  learner.techniques.techniques.push(perfected);
  learner.techniques.cultivatingTechId = perfected.techId;
  learner.pendingTechniqueComprehensions.push({
    techId: createdTechnique.techId,
    name: createdTechnique.name,
    sourceKind: 'created',
    selfComprehensionAllowed: true,
    progress: 0,
    requiredProgress: 300,
    realmLv: 1,
    grade: 'mortal',
    category: 'internal',
    createdAtTick: 0,
    updatedAtTick: 0,
    activeTransferJob: null,
  });

  const result = progressionService.grantMonsterKillProgress(learner, {
    monsterLevel: 120,
    monsterName: '切换试炼妖',
    monsterTier: 'demon_king',
    expMultiplier: 1000000,
    contributionRatio: 1,
    expAdjustmentRealmLv: 1,
    isKiller: true,
  });
  assert.equal(result.changed, true);
  assert.equal(learner.techniques.cultivatingTechId, createdTechnique.techId);
  assert.equal(learner.pendingTechniqueComprehensions[0]?.progress, 1);
  assert.ok(result.notices.some((notice: any) => notice.structured?.key === 'notice.progression.technique-auto-switch'));
}

function testCultivationCanStoreFractionalComprehensionProgress() {
  const { progressionService } = createRuntimeService();
  const learner = createPlayer('learner:fractional', 0, 0);
  learner.combat.cultivationActive = true;
  learner.attrs.numericStats.techniqueExpPerTick = 999;
  learner.attrs.numericStats.techniqueExpRate = 100000;
  learner.techniques.cultivatingTechId = createdTechnique.techId;
  learner.pendingTechniqueComprehensions.push({
    techId: createdTechnique.techId,
    name: createdTechnique.name,
    sourceKind: 'created',
    progress: 0,
    requiredProgress: 10,
    realmLv: 2,
    grade: 'mortal',
    category: 'internal',
    createdAtTick: 0,
    updatedAtTick: 0,
    activeTransferJob: null,
  });

  const result = progressionService.advanceCultivation(learner, 1, { auraMultiplier: 10 });
  assert.equal(result.changed, true);
  assertAlmostEqual(learner.pendingTechniqueComprehensions[0]?.progress ?? 0, 1 / (1.1 * 1.05), 'fractional self comprehension progress');
}

function testPendingTechniqueNameResolvesDisplayName() {
  const { runtimeService } = createRuntimeService();
  const learner = createPlayer('learner:name', 0, 0);
  learner.pendingTechniqueComprehensions.push({
    techId: createdTechnique.techId,
    name: createdTechnique.name,
    sourceKind: 'created',
    progress: 0,
    requiredProgress: 10,
    realmLv: 1,
    grade: 'mortal',
    category: 'internal',
    createdAtTick: 0,
    updatedAtTick: 0,
    activeTransferJob: null,
  });
  runtimeService.players.set(learner.playerId, learner);

  assert.equal(runtimeService.getTechniqueName(learner.playerId, createdTechnique.techId), createdTechnique.name);
}

function testTransmissionRefreshesStaleRequiredProgress() {
  const { runtimeService } = createRuntimeService();
  const teacher = createPlayer('teacher:stale-required', 0, 0);
  const learner = createPlayer('learner:stale-required', 0, 1);
  teacher.techniques.techniques.push({ ...createdTechnique });
  runtimeService.players.set(teacher.playerId, teacher);
  runtimeService.players.set(learner.playerId, learner);

  startTransmissionWithPipeline(runtimeService, teacher.playerId, learner, createdTechnique.techId);
  const pending = learner.pendingTechniqueComprehensions[0]!;
  pending.requiredProgress = 999999;
  tickTransmissionWithPipeline(runtimeService, learner);

  assert.equal(pending.requiredProgress, expectedRequiredProgress('created', createdTechnique, learner.realm.realmLv));
  assert.equal(pending.progress, 1);
}

function testTransmissionBlocksCancelsAndContinues() {
  const { runtimeService } = createRuntimeService();
  const teacherA = createPlayer('teacher:a', 0, 0);
  const teacherB = createPlayer('teacher:b', 1, 0);
  const learner = createPlayer('learner:tx', 0, 1);
  teacherA.techniques.techniques.push({ ...technique });
  teacherA.techniques.techniques.push({ ...createdTechnique });
  teacherB.techniques.techniques.push({ ...createdTechnique });
  runtimeService.players.set(teacherA.playerId, teacherA);
  runtimeService.players.set(teacherB.playerId, teacherB);
  runtimeService.players.set(learner.playerId, learner);

  assert.throws(
    () => runtimeService.startTechniqueTransmission(teacherA.playerId, learner.playerId, technique.techId),
    /只能传授自创功法/,
  );
  startTransmissionWithPipeline(runtimeService, teacherA.playerId, learner, createdTechnique.techId);
  const pending = learner.pendingTechniqueComprehensions[0]!;
  assert.equal(pending.selfComprehensionAllowed, false);
  assert.equal(teacherA.notices.queue[0]?.structured?.key, 'notice.craft.transmission.teacher-start');
  pending.requiredProgress = 3;
  tickTransmissionWithPipeline(runtimeService, learner);
  assert.equal(pending.progress, 1);
  assert.equal(learner.transmissionSkill.exp, getExpectedTransmissionExpGain(1, 1, 1));
  assert.equal(teacherA.transmissionSkill.exp, getExpectedTransmissionExpGain(1, 1, 1));
  assertAlmostEqual(learner.transmissionJob?.progressGainPerTick ?? 0, 1, 'transmission progress gain per tick');
  const expectedCreatedRequired = expectedRequiredProgress('created', createdTechnique, learner.realm.realmLv);
  assert.equal(learner.transmissionJob?.estimatedRemainingTicks, expectedCreatedRequired - 1);
  assert.equal(learner.transmissionJob?.progressBreakdown?.baseProgress, 1);
  assert.equal(learner.transmissionJob?.progressBreakdown?.realmFactor, 1);
  assert.equal(learner.transmissionJob?.progressBreakdown?.learnerTransmissionFactor, 1);
  assert.equal(learner.transmissionJob?.progressBreakdown?.teacherTransmissionFactor, 1);

  assert.equal(interruptTransmissionWithPipeline(runtimeService, learner, 'move').panelChanged, true);
  assert.equal(learner.transmissionJob?.interruptWaitRemainingTicks, 10);
  for (let tick = 2; tick <= 11; tick += 1) {
    learner.lifeElapsedTicks = tick;
    tickTransmissionWithPipeline(runtimeService, learner);
  }
  assert.equal(pending.progress, 1);
  assert.equal(learner.transmissionJob?.interruptWaitRemainingTicks, 0);
  assert.equal(learner.transmissionJob?.interruptState, null);

  tickTransmissionWithPipeline(runtimeService, learner);
  assert.equal(pending.progress, 2);
  assert.equal(learner.transmissionSkill.exp, getExpectedRepeatedTransmissionExpGain(1, 1, 2));
  assert.equal(teacherA.transmissionSkill.exp, getExpectedRepeatedTransmissionExpGain(1, 1, 2));

  teacherA.x = 99;
  tickTransmissionWithPipeline(runtimeService, learner);
  assert.equal(pending.progress, 2);
  assert.equal(teacherA.transmissionSkill.exp, getExpectedRepeatedTransmissionExpGain(1, 1, 2));
  assert.equal(learner.transmissionJob?.status, 'blocked');

  assert.equal(cancelTransmissionWithPipeline(runtimeService, learner).ok, true);
  assert.equal(learner.transmissionJob, null);
  startTransmissionWithPipeline(runtimeService, teacherB.playerId, learner, createdTechnique.techId);
  learner.pendingTechniqueComprehensions[0]!.progress = expectedCreatedRequired - 1;
  tickTransmissionWithPipeline(runtimeService, learner);
  assert.equal(learner.pendingTechniqueComprehensions.length, 0);
  assert.equal(learner.techniques.techniques.some((entry) => entry.techId === createdTechnique.techId), true);
  assert.equal(learner.transmissionSkill.exp, getExpectedRepeatedTransmissionExpGain(1, 1, 3));
  assert.equal(teacherB.transmissionSkill.exp, getExpectedTransmissionExpGain(1, 1, 1));
}

function testScriptureRecordingUsesTransmissionJobAndLocksBuilding() {
  const { runtimeService } = createRuntimeService();
  const recorder = createPlayer('recorder:scripture', 0, 0);
  recorder.realm.realmLv = 2;
  recorder.transmissionSkill.level = 2;
  recorder.transmissionSkill.expToNext = resolveExpToNextByLevel();
  const scriptureTechnique = {
    ...technique,
    techId: 'gen_scripture',
    name: '藏经试炼功法',
    realmLv: 2,
    grade: 'yellow',
    level: 1,
    expToNext: 0,
    layers: [{ level: 1, expToNext: 0, attrs: {} }],
  };
  recorder.techniques.techniques.push(scriptureTechnique);
  runtimeService.players.set(recorder.playerId, recorder);
  const scriptureRequired = expectedRequiredProgress('created', scriptureTechnique, recorder.realm.realmLv);
  const building: any = {
    id: 'building:scripture',
    defId: 'scripture_platform',
    instanceId: recorder.instanceId,
    x: 0,
    y: 0,
    state: 'active',
    ownerPlayerId: recorder.playerId,
    ownerSectId: null,
    revision: 1,
    updatedAtTick: 0,
  };
  const dirtyDomains: string[] = [];
  const instance: any = {
    buildingById: new Map([[building.id, building]]),
    localBuildingViewCacheById: new Map(),
    markPersistenceDirtyDomainsHighPriority(domains: string[]) {
      dirtyDomains.push(...domains);
    },
    persistentRevision: 0,
  };
  const { pipeline, ctx } = createTransmissionPipelineWithInstance(runtimeService, instance);
  const startResult = pipeline.start(recorder, 'transmission', {
    mode: 'scripture_recording',
    learnerPlayerId: recorder.playerId,
    techniqueId: scriptureTechnique.techId,
    buildingId: building.id,
  }, ctx as never);
  assert.equal(startResult.ok, true, startResult.error);
  assert.equal(recorder.transmissionJob?.jobType, 'scripture_recording');
  assert.equal(recorder.transmissionJob?.progressBreakdown?.baseProgress, 10);
  assert.equal(building.scriptureTechniqueId, scriptureTechnique.techId);
  assert.equal(building.scriptureProgress, 0);
  assert.equal(building.scriptureRequiredProgress, scriptureRequired);

  recorder.lifeElapsedTicks = 1;
  pipeline.tick(recorder, 'transmission', ctx as never);
  assert.equal(building.scriptureProgress, 10);
  assert.equal(recorder.transmissionSkill.exp, getExpectedTransmissionExpGain(2, 2, 1));
  assert.equal(recorder.transmissionJob?.remainingTicks, scriptureRequired - 10);

  const normalTechnique = { ...scriptureTechnique, techId: 'tech.scripture.normal', name: '普通功法' };
  recorder.techniques.techniques.push(normalTechnique);
  recorder.transmissionJob = null;
  building.scriptureTechniqueId = null;
  building.scriptureTechniqueName = null;
  building.scriptureProgress = 0;
  building.scriptureRequiredProgress = undefined;
  building.scriptureRecordingJobRunId = null;
  const normalResult = pipeline.start(recorder, 'transmission', {
    mode: 'scripture_recording',
    learnerPlayerId: recorder.playerId,
    techniqueId: normalTechnique.techId,
    buildingId: building.id,
  }, ctx as never);
  assert.equal(normalResult.ok, false);
  assert.match(normalResult.error ?? '', /只能录入自创功法/);
  const restartResult = pipeline.start(recorder, 'transmission', {
    mode: 'scripture_recording',
    learnerPlayerId: recorder.playerId,
    techniqueId: scriptureTechnique.techId,
    buildingId: building.id,
  }, ctx as never);
  assert.equal(restartResult.ok, true, restartResult.error);

  const otherTechnique = { ...scriptureTechnique, techId: 'gen_scripture_other', name: '另一门功法' };
  recorder.techniques.techniques.push(otherTechnique);
  const lockedResult = pipeline.start(recorder, 'transmission', {
    mode: 'scripture_recording',
    learnerPlayerId: recorder.playerId,
    techniqueId: otherTechnique.techId,
    buildingId: building.id,
  }, ctx as never);
  assert.equal(lockedResult.ok, false);
  assert.match(lockedResult.error ?? '', /已有进行中的技艺任务|已有藏书/);

  let recordingTick = 2;
  while (recorder.transmissionJob && recordingTick <= Math.ceil(scriptureRequired / 10) + 2) {
    recorder.lifeElapsedTicks = recordingTick;
    pipeline.tick(recorder, 'transmission', ctx as never);
    recordingTick += 1;
  }
  assert.equal(building.scriptureProgress, scriptureRequired);
  assert.equal(building.scriptureRecordingJobRunId, null);
  assert.ok(Number(building.scriptureRecordedAtTick) > 0 && Number(building.scriptureRecordedAtTick) <= Math.ceil(scriptureRequired / 10) + 1);
  assert.equal(recorder.transmissionJob, null);
  assert.ok(dirtyDomains.includes('building'));

  const visitor = createPlayer('visitor:scripture', 0, 0);
  const visitorTechnique = {
    ...scriptureTechnique,
    techId: 'gen_scripture_visitor',
    name: '访客藏经功法',
  };
  visitor.techniques.techniques.push(visitorTechnique);
  runtimeService.players.set(visitor.playerId, visitor);
  const publicBuilding: any = {
    ...building,
    id: 'building:scripture:public',
    scriptureTechniqueId: null,
    scriptureTechniqueName: null,
    scriptureProgress: 0,
    scriptureRequiredProgress: undefined,
    scriptureRecordingJobRunId: null,
    scriptureRecordedAtTick: 0,
    ownerPlayerId: recorder.playerId,
    ownerSectId: 'sect:owner',
  };
  instance.buildingById.set(publicBuilding.id, publicBuilding);
  const visitorResult = pipeline.start(visitor, 'transmission', {
    mode: 'scripture_recording',
    learnerPlayerId: visitor.playerId,
    techniqueId: visitorTechnique.techId,
    buildingId: publicBuilding.id,
  }, ctx as never);
  assert.equal(visitorResult.ok, true, visitorResult.error);
  assert.equal(publicBuilding.scriptureRecorderPlayerId, visitor.playerId);
}

function testScriptureContemplationStartsJobAndCompletesTechnique() {
  const { runtimeService } = createRuntimeService();
  const learner = createPlayer('learner:scripture', 0, 0);
  learner.realm.realmLv = 2;
  learner.transmissionSkill.level = 2;
  learner.transmissionSkill.expToNext = resolveExpToNextByLevel();
  runtimeService.players.set(learner.playerId, learner);
  const contemplationRequired = expectedRequiredProgress('created', createdTechnique, learner.realm.realmLv);
  const building: any = {
    id: 'building:scripture:contemplate',
    defId: 'scripture_platform',
    instanceId: learner.instanceId,
    x: 0,
    y: 0,
    state: 'active',
    ownerPlayerId: 'player:other',
    ownerSectId: 'sect:other',
    scriptureTechniqueId: createdTechnique.techId,
    scriptureTechniqueName: createdTechnique.name,
    scriptureProgress: 600,
    scriptureRequiredProgress: 600,
    scriptureRealmLv: 1,
    scriptureGrade: 'mortal',
    scriptureCategory: 'internal',
    scriptureRecorderPlayerId: 'player:other',
    scriptureRecordingJobRunId: null,
    scriptureRecordedAtTick: 1,
    revision: 1,
    updatedAtTick: 0,
  };
  const instance: any = {
    buildingById: new Map([[building.id, building]]),
    localBuildingViewCacheById: new Map(),
    markPersistenceDirtyDomainsHighPriority() {},
    persistentRevision: 0,
  };
  const { pipeline, ctx } = createTransmissionPipelineWithInstance(runtimeService, instance);
  const startResult = pipeline.start(learner, 'transmission', {
    mode: 'scripture_contemplation',
    learnerPlayerId: learner.playerId,
    techniqueId: 'ignored-by-scripture-platform',
    buildingId: building.id,
  }, ctx as never);
  assert.equal(startResult.ok, true, startResult.error);
  assert.equal(learner.transmissionJob?.jobType, 'scripture_contemplation');
  assert.equal(learner.transmissionJob?.label, '藏经参悟');
  assert.equal(learner.pendingTechniqueComprehensions[0]?.techId, createdTechnique.techId);
  assert.equal(learner.pendingTechniqueComprehensions[0]?.selfComprehensionAllowed, false);
  assert.equal(learner.pendingTechniqueComprehensions[0]?.requiredProgress, contemplationRequired);
  assert.equal(startResult.messages?.[0]?.key, 'notice.craft.scripture-contemplation.start');

  for (let tick = 1; tick <= contemplationRequired && learner.transmissionJob; tick += 1) {
    learner.lifeElapsedTicks = tick;
    pipeline.tick(learner, 'transmission', ctx as never);
  }
  assert.equal(learner.transmissionJob, null);
  assert.equal(learner.pendingTechniqueComprehensions.length, 0);
  assert.equal(learner.techniques.techniques.some((entry) => entry.techId === createdTechnique.techId), true);
}

testSelfComprehensionProgressesOnlyWithoutTransmission();
testTransmittedPendingCannotSelfComprehendWithoutActiveJob();
testTransmittedPendingCannotBeSetAsMainTechnique();
testCreatedPendingRefreshDoesNotUnlockTransmittedTechnique();
testCreatedPendingWithoutCreatorDoesNotAutoMainTechnique();
testRequiredProgressUsesPreFoundationLearnerReduction();
testDynamicFactorsApplyToProgressGain();
testCultivationUsesElapsedTicksForPendingComprehension();
testAutoSwitchCultivationCanSelectPendingComprehension();
testMonsterKillProgressesComprehensionByOneCultivationTick();
testMonsterKillAutoSwitchesAndProgressesPendingComprehension();
testCultivationCanStoreFractionalComprehensionProgress();
testPendingTechniqueNameResolvesDisplayName();
testTransmissionRefreshesStaleRequiredProgress();
testTransmissionBlocksCancelsAndContinues();
testScriptureRecordingUsesTransmissionJobAndLocksBuilding();
testScriptureContemplationStartsJobAndCompletesTechnique();

console.log(JSON.stringify({ ok: true, case: 'technique-comprehension' }, null, 2));
