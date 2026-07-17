import assert from 'node:assert/strict';
import {
  calculateTechniqueComprehensionProgressGain,
  calculateTechniqueComprehensionRequiredProgress,
  computeCraftSkillExpGain,
  fromWireAttrUpdate,
  fromWireTechniqueEntry,
  isTechniqueFullyMastered,
  toWireAttrUpdate,
  toWireTechniqueEntry,
} from '@mud/shared';
import { buildBootstrapPanelDelta } from '../network/world-projector.helpers';
import { projectBootstrapTechniqueStateForSync } from '../network/world-sync-player-state.service';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';
import {
  refreshPlayerComprehensionSpeedRateProjection,
  resolvePlayerComprehensionSpeedRate,
} from '../runtime/player/player-comprehension-speed.helpers';
import { PlayerProgressionService } from '../runtime/player/player-progression.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { TechniqueActivityPipelineService } from '../runtime/craft/pipeline/technique-activity-pipeline.service';
import { TransmissionStrategy } from '../runtime/craft/pipeline/strategies/transmission.strategy';
import { WorldRuntimeUseItemService } from '../runtime/world/world-runtime-use-item.service';

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
const runtimeTechniqueTemplates = new Map<string, ReturnType<typeof createTechnique>>();
const fragmentLimitedTechnique = {
  ...createTechnique('gen_fragment_limited', '残卷试炼功法'),
  layers: Array.from({ length: 9 }, (_, index) => ({
    level: index + 1,
    expToNext: index < 8 ? 10 : 0,
    attrs: {},
  })),
  expToNext: 10,
};

const contentTemplateRepository = {
  createTechniqueState(techId: string) {
    const runtimeTechnique = runtimeTechniqueTemplates.get(techId);
    if (runtimeTechnique) {
      return { ...runtimeTechnique, layers: [...runtimeTechnique.layers] };
    }
    if (techId === technique.techId) {
      return { ...technique, layers: [...technique.layers] };
    }
    if (techId === createdTechnique.techId) {
      return { ...createdTechnique, layers: [...createdTechnique.layers] };
    }
    if (techId === fragmentLimitedTechnique.techId) {
      return { ...fragmentLimitedTechnique, layers: [...fragmentLimitedTechnique.layers] };
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

function createMeditationMatInstance(players: Array<{ id: string; x: number; y: number }>): MapInstanceRuntime {
  const templateRepository = new MapTemplateRepository();
  templateRepository.registerRuntimeMapTemplate({
    id: 'technique_comprehension_mat_smoke',
    name: '蒲团领悟烟测',
    width: 8,
    height: 8,
    routeDomain: 'system',
    tiles: Array.from({ length: 8 }, () => '........'),
    spawnPoint: { x: 7, y: 7 },
    portals: [],
    npcs: [],
    monsters: [],
    safeZones: [],
    landmarks: [],
    containers: [],
    auras: [],
  });
  const instance = new MapInstanceRuntime({
    instanceId: 'instance:test',
    template: templateRepository.getOrThrow('technique_comprehension_mat_smoke'),
    monsterSpawns: [],
    kind: 'public',
    persistent: true,
    createdAt: Date.now(),
    displayName: '蒲团领悟烟测',
    linePreset: 'peaceful',
    lineIndex: 1,
    instanceOrigin: 'smoke',
    defaultEntry: true,
    canDamageTile: true,
  });
  for (const player of players) {
    const buildingId = `mat:${player.id}`;
    const placed = instance.placeBuildingInstance({
      buildingId,
      defId: 'meditation_mat',
      x: player.x,
      y: player.y,
      ownerPlayerId: player.id,
      state: 'active',
      ignoreOccupancy: true,
    });
    assert.equal(placed.ok, true, `蒲团放置失败: ${(placed as { reason?: string }).reason ?? 'unknown'}`);
  }
  return instance;
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

  const insightfulLearner = createPlayer('learner:self-insightful', 0, 0);
  insightfulLearner.attrs.numericStats.techniqueExpRate = 10000;
  insightfulLearner.techniques.cultivatingTechId = createdTechnique.techId;
  insightfulLearner.pendingTechniqueComprehensions.push({
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
  const insightfulProgressed = progressionService.advanceTechniqueProgressInternal(insightfulLearner, 999, {
    allowPendingComprehension: true,
    pendingComprehensionTicks: 4,
  });
  assert.equal(insightfulProgressed.changed, true);
  assert.equal(insightfulLearner.pendingTechniqueComprehensions[0]?.progress, 8);
  assert.equal(insightfulLearner.transmissionSkill.exp, getExpectedTransmissionExpGain(1, 1, 4));

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
  assert.equal(learner.pendingTechniqueComprehensions[0]?.progress, 11);
  assert.equal(learner.transmissionSkill.exp, getExpectedTransmissionExpGain(1, 1, 1));
}

function testSelfComprehensionUsesStandingFacilitySpeed() {
  const { progressionService } = createRuntimeService();
  const learner = createPlayer('learner:self-mat', 0, 0);
  learner.combat.cultivationActive = true;
  learner.attrs.numericStats.techniqueExpPerTick = 999;
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
  const instance = createMeditationMatInstance([{ id: learner.playerId, x: learner.x, y: learner.y }]);
  const initialAttrRevision = learner.attrs.revision;
  assert.equal(
    refreshPlayerComprehensionSpeedRateProjection(learner, { instanceRuntime: instance }),
    true,
  );
  assert.equal((learner as any).comprehensionSpeedRate, 1);
  assert.ok(learner.attrs.revision > initialAttrRevision);
  assert.equal(
    refreshPlayerComprehensionSpeedRateProjection(learner, { instanceRuntime: instance }),
    false,
    '站位和属性未变化时不得重复推动属性增量',
  );

  const result = progressionService.advanceCultivation(learner, 1, {
    auraMultiplier: 10,
    getInstanceRuntime(instanceId: string) {
      return instanceId === learner.instanceId ? instance : null;
    },
  });
  assert.equal(result.changed, true);
  assert.equal(learner.pendingTechniqueComprehensions[0]?.progress, 2);
  assert.equal(learner.transmissionSkill.exp, getExpectedTransmissionExpGain(1, 1, 1));

  learner.x = 1;
  assert.equal(refreshPlayerComprehensionSpeedRateProjection(learner, { instanceRuntime: instance }), true);
  assert.equal((learner as any).comprehensionSpeedRate, 0);
  const offMatResult = progressionService.advanceCultivation(learner, 1, {
    getInstanceRuntime: () => instance,
  });
  assert.equal(offMatResult.changed, true);
  assert.equal(learner.pendingTechniqueComprehensions[0]?.progress, 3, '离开蒲团后应回落到基础自悟速度');

  learner.x = 0;
  const mat = instance.buildingById.get(`mat:${learner.playerId}`);
  assert.ok(mat);
  mat.state = 'damaged';
  assert.equal(
    resolvePlayerComprehensionSpeedRate(learner, { instanceRuntime: instance }),
    1,
    '已建成但受损的蒲团仍应提供站立领悟速度',
  );
  assert.equal(refreshPlayerComprehensionSpeedRateProjection(learner, { instanceRuntime: instance }), true);
  assert.equal((learner as any).comprehensionSpeedRate, 1);
  const damagedMatResult = progressionService.advanceCultivation(learner, 1, {
    getInstanceRuntime: () => instance,
  });
  assert.equal(damagedMatResult.changed, true);
  assert.equal(learner.pendingTechniqueComprehensions[0]?.progress, 5);
}

function testComprehensionSpeedRateProjectionAndCodec() {
  const player = createPlayer('learner:projection-speed', 0, 0);
  (player as any).comprehensionSpeedRate = 1.25;
  const bootstrap = buildBootstrapPanelDelta(player as never);
  assert.equal(
    bootstrap.attr?.comprehensionSpeedRate,
    undefined,
    '初始属性增量不得重复发送 Bootstrap 已携带的个人领悟速度',
  );
  assert.equal(
    fromWireAttrUpdate(toWireAttrUpdate({ comprehensionSpeedRate: 1.25 })).comprehensionSpeedRate,
    1.25,
    '个人领悟速度不得在属性增量编解码中丢失',
  );
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
  assert.equal(learner.pendingTechniqueComprehensions[0]?.progress, 11);
  assert.equal(learner.transmissionSkill.exp, getExpectedTransmissionExpGain(1, 1, 1));
  assert.ok(
    result.notices.some((notice: any) => String(notice.structured?.vars?.details ?? '').includes(`${createdTechnique.name} 领悟进度 +11`)),
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
  assertAlmostEqual(learner.pendingTechniqueComprehensions[0]?.progress ?? 0, 11 / (1.1 * 1.05), 'fractional self comprehension progress');
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
  assert.equal(teacherA.notices.queue[0]?.kind, 'transmission');
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

function testTransmissionUsesStandingFacilitySpeedForBothPlayers() {
  const { runtimeService } = createRuntimeService();
  const teacher = createPlayer('teacher:mat', 0, 0);
  const learner = createPlayer('learner:mat', 0, 1);
  teacher.techniques.techniques.push({ ...createdTechnique });
  teacher.attrs.numericStats.techniqueExpRate = -5000;
  learner.attrs.numericStats.techniqueExpRate = 10000;
  runtimeService.players.set(teacher.playerId, teacher);
  runtimeService.players.set(learner.playerId, learner);
  const instance = createMeditationMatInstance([
    { id: teacher.playerId, x: teacher.x, y: teacher.y },
    { id: learner.playerId, x: learner.x, y: learner.y },
  ]);
  const { pipeline, ctx } = createTransmissionPipelineWithInstance(runtimeService, instance);
  const startResult = pipeline.start(learner, 'transmission', {
    learnerPlayerId: learner.playerId,
    teacherPlayerId: teacher.playerId,
    techniqueId: createdTechnique.techId,
  }, ctx as never);
  assert.equal(startResult.ok, true, startResult.error);
  assert.equal(learner.transmissionJob?.progressBreakdown?.learnerTransmissionSpeedRate, 2);
  assert.equal(learner.transmissionJob?.progressBreakdown?.teacherTransmissionSpeedRate, 0.5);
  assert.equal(learner.transmissionJob?.progressBreakdown?.transmissionSpeedRate, 2.5);
  assert.equal(learner.transmissionJob?.progressBreakdown?.transmissionSpeedFactor, 3.5);
  assert.equal(learner.transmissionJob?.progressGainPerTick, 3.5);

  pipeline.tick(learner, 'transmission', ctx as never);
  assert.equal(learner.pendingTechniqueComprehensions[0]?.progress, 3.5);
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
  runtimeTechniqueTemplates.set(scriptureTechnique.techId, scriptureTechnique);
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
  runtimeTechniqueTemplates.set(visitorTechnique.techId, visitorTechnique);
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
  assert.equal(startResult.messages?.[0]?.kind, 'transmission');
  assert.equal(startResult.messages?.[0]?.key, 'notice.craft.scripture-contemplation.start');

  for (let tick = 1; tick <= contemplationRequired && learner.transmissionJob; tick += 1) {
    learner.lifeElapsedTicks = tick;
    pipeline.tick(learner, 'transmission', ctx as never);
  }
  assert.equal(learner.transmissionJob, null);
  assert.equal(learner.pendingTechniqueComprehensions.length, 0);
  assert.equal(learner.techniques.techniques.some((entry) => entry.techId === createdTechnique.techId), true);
}

function testFragmentLearnLimitCannotBecomePropagationAuthority() {
  const { progressionService, runtimeService } = createRuntimeService();
  const learner = createPlayer('learner:fragment-limit', 0, 0);
  const requiredProgress = expectedRequiredProgress('created', fragmentLimitedTechnique, learner.realm.realmLv);
  learner.techniques.cultivatingTechId = fragmentLimitedTechnique.techId;
  learner.pendingTechniqueComprehensions.push({
    techId: fragmentLimitedTechnique.techId,
    name: fragmentLimitedTechnique.name,
    sourceKind: 'created',
    selfComprehensionAllowed: true,
    progress: requiredProgress - 1,
    requiredProgress,
    realmLv: fragmentLimitedTechnique.realmLv,
    grade: fragmentLimitedTechnique.grade,
    category: fragmentLimitedTechnique.category,
    maxLevel: 8,
    createdAtTick: 0,
    updatedAtTick: 0,
    activeTransferJob: null,
  });

  const comprehensionResult = progressionService.advanceTechniqueProgressInternal(learner, 1, {
    allowPendingComprehension: true,
    pendingComprehensionTicks: 1,
  });
  assert.equal(comprehensionResult.changed, true);
  assert.equal(learner.pendingTechniqueComprehensions.length, 0);

  const learned = learner.techniques.techniques.find((entry) => entry.techId === fragmentLimitedTechnique.techId);
  assert.ok(learned);
  assert.equal(learned.layers?.length, 9, '残卷学习后不得截断原功法模板层级');
  assert.equal(learned.learnTechniqueMaxLevel, 8);
  const bootstrapProjection = projectBootstrapTechniqueStateForSync(learned);
  assert.equal(bootstrapProjection.learnTechniqueMaxLevel, 8, '首包功法投影必须携带残卷修炼上限');
  assert.equal(
    fromWireTechniqueEntry(toWireTechniqueEntry(bootstrapProjection)).learnTechniqueMaxLevel,
    8,
    '功法增量 protobuf 编解码不得丢失残卷修炼上限',
  );

  learner.techniques.cultivatingTechId = fragmentLimitedTechnique.techId;
  const trainingResult = progressionService.advanceTechniqueProgressInternal(learner, 1_000);
  assert.equal(trainingResult.changed, true);
  assert.equal(learned.level, 8);
  assert.equal(learned.exp, 0);
  assert.equal(learned.expToNext, 0);
  assert.equal(isTechniqueFullyMastered(learned), false);
  assert.equal(
    trainingResult.notices.some((notice: any) => notice.structured?.key === 'notice.progression.technique-perfected'),
    false,
  );

  const transmissionTarget = createPlayer('learner:fragment-target', 0, 1);
  runtimeService.players.set(learner.playerId, learner);
  runtimeService.players.set(transmissionTarget.playerId, transmissionTarget);
  const { pipeline, ctx } = createTransmissionPipeline(runtimeService);
  const transmissionResult = pipeline.start(transmissionTarget, 'transmission', {
    learnerPlayerId: transmissionTarget.playerId,
    teacherPlayerId: learner.playerId,
    techniqueId: fragmentLimitedTechnique.techId,
  }, ctx as never);
  assert.equal(transmissionResult.ok, false);
  assert.match(transmissionResult.error ?? '', /原功法满层/);

  const scriptureBuilding: any = {
    id: 'building:scripture:fragment-limit',
    defId: 'scripture_platform',
    instanceId: learner.instanceId,
    x: learner.x,
    y: learner.y,
    state: 'active',
    revision: 1,
    updatedAtTick: 0,
  };
  const scriptureInstance: any = {
    buildingById: new Map([[scriptureBuilding.id, scriptureBuilding]]),
    localBuildingViewCacheById: new Map(),
    markPersistenceDirtyDomainsHighPriority() {},
    persistentRevision: 0,
  };
  const scripturePipeline = createTransmissionPipelineWithInstance(runtimeService, scriptureInstance);
  const scriptureResult = scripturePipeline.pipeline.start(learner, 'transmission', {
    mode: 'scripture_recording',
    learnerPlayerId: learner.playerId,
    techniqueId: fragmentLimitedTechnique.techId,
    buildingId: scriptureBuilding.id,
  }, scripturePipeline.ctx as never);
  assert.equal(scriptureResult.ok, false);
  assert.match(scriptureResult.error ?? '', /只有练满的功法/);

  const refiningBuilding = {
    id: 'building:refining:fragment-limit',
    defId: 'technique_refining_table',
    state: 'active',
    x: learner.x,
    y: learner.y,
  };
  const useItemService = new WorldRuntimeUseItemService(
    contentTemplateRepository as never,
    null as never,
    runtimeService as never,
  );
  assert.throws(
    () => useItemService.dispatchCraftTechniqueBook(
      learner.playerId,
      fragmentLimitedTechnique.techId,
      8,
      {
        getInstanceRuntime() {
          return { buildingById: new Map([[refiningBuilding.id, refiningBuilding]]) };
        },
        refreshQuestStates() {},
        queuePlayerNotice() {},
      },
    ),
    /原功法满层/,
  );
}

function testTransmissionStatusesUseAuthoritativeTargetAndTechniqueState() {
  const { runtimeService } = createRuntimeService();
  const unlearnedTechnique = createTechnique('gen_status_unlearned', '未学状态功法');
  runtimeTechniqueTemplates.set(unlearnedTechnique.techId, unlearnedTechnique);
  const teacher = createPlayer('teacher:status', 0, 0);
  const learnedTarget = createPlayer('learner:learned', 1, 0);
  const unlearnedTarget = createPlayer('learner:unlearned', 2, 2);
  const farTarget = createPlayer('learner:far', 3, 0);
  const otherInstanceTarget = createPlayer('learner:other-instance', 1, 0);
  otherInstanceTarget.instanceId = 'instance:other';
  teacher.techniques.techniques.push(
    { ...createdTechnique },
    { ...unlearnedTechnique },
    { ...technique },
    { ...createdTechnique },
  );
  learnedTarget.techniques.techniques.push({ ...createdTechnique });
  runtimeService.players.set(teacher.playerId, teacher);
  runtimeService.players.set(learnedTarget.playerId, learnedTarget);
  runtimeService.players.set(unlearnedTarget.playerId, unlearnedTarget);
  runtimeService.players.set(farTarget.playerId, farTarget);
  runtimeService.players.set(otherInstanceTarget.playerId, otherInstanceTarget);

  assert.deepEqual(
    runtimeService.buildTechniqueTransmissionStatuses(
      teacher.playerId,
      learnedTarget.playerId,
    ),
    [
      { techId: createdTechnique.techId, learned: true },
      { techId: unlearnedTechnique.techId, learned: false },
    ],
  );
  assert.deepEqual(
    runtimeService.buildTechniqueTransmissionStatuses(
      teacher.playerId,
      unlearnedTarget.playerId,
    ),
    [
      { techId: createdTechnique.techId, learned: false },
      { techId: unlearnedTechnique.techId, learned: false },
    ],
  );
  assert.deepEqual(runtimeService.buildTechniqueTransmissionStatuses(teacher.playerId, farTarget.playerId), []);
  assert.deepEqual(runtimeService.buildTechniqueTransmissionStatuses(teacher.playerId, otherInstanceTarget.playerId), []);
  assert.deepEqual(runtimeService.buildTechniqueTransmissionStatuses(teacher.playerId, teacher.playerId), []);
  runtimeTechniqueTemplates.delete(unlearnedTechnique.techId);
}

testSelfComprehensionProgressesOnlyWithoutTransmission();
testTransmittedPendingCannotSelfComprehendWithoutActiveJob();
testTransmittedPendingCannotBeSetAsMainTechnique();
testCreatedPendingRefreshDoesNotUnlockTransmittedTechnique();
testCreatedPendingWithoutCreatorDoesNotAutoMainTechnique();
testRequiredProgressUsesPreFoundationLearnerReduction();
testDynamicFactorsApplyToProgressGain();
testCultivationUsesElapsedTicksForPendingComprehension();
testSelfComprehensionUsesStandingFacilitySpeed();
testComprehensionSpeedRateProjectionAndCodec();
testAutoSwitchCultivationCanSelectPendingComprehension();
testMonsterKillProgressesComprehensionByOneCultivationTick();
testMonsterKillAutoSwitchesAndProgressesPendingComprehension();
testCultivationCanStoreFractionalComprehensionProgress();
testPendingTechniqueNameResolvesDisplayName();
testTransmissionRefreshesStaleRequiredProgress();
testTransmissionBlocksCancelsAndContinues();
testTransmissionUsesStandingFacilitySpeedForBothPlayers();
testScriptureRecordingUsesTransmissionJobAndLocksBuilding();
testScriptureContemplationStartsJobAndCompletesTechnique();
testFragmentLearnLimitCannotBecomePropagationAuthority();
testTransmissionStatusesUseAuthoritativeTargetAndTechniqueState();

console.log(JSON.stringify({ ok: true, case: 'technique-comprehension' }, null, 2));
