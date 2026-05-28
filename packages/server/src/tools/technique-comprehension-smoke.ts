import assert from 'node:assert/strict';
import {
  calculateTechniqueComprehensionProgressGain,
  calculateTechniqueComprehensionRequiredProgress,
  computeCraftSkillExpGain,
} from '@mud/shared';
import { PlayerProgressionService } from '../runtime/player/player-progression.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';

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
    lifeElapsedTicks: 0,
    realm: { realmLv: 1, stage: 'mortal', progress: 0, progressToNext: 100, breakthroughReady: false },
    techniques: { revision: 0, techniques: [], cultivatingTechId: null },
    pendingTechniqueComprehensions: [],
    transmissionSkill: { level: 1, exp: 0, expToNext: 60 },
    combat: { cultivationActive: false },
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

function testRequiredProgressIgnoresDynamicLearnerAndTeacherFactors() {
  const baseline = calculateTechniqueComprehensionRequiredProgress({
    sourceKind: 'created',
    techniqueRealmLv: 8,
    grade: 'earth',
    learnerRealmLv: 1,
    learnerTransmissionLevel: 1,
    teacherTransmissionLevel: 1,
  });
  const changedDynamicFactors = calculateTechniqueComprehensionRequiredProgress({
    sourceKind: 'created',
    techniqueRealmLv: 8,
    grade: 'earth',
    learnerRealmLv: 80,
    learnerTransmissionLevel: 80,
    teacherTransmissionLevel: 80,
  });

  assert.equal(baseline, 300 * 8 * 4);
  assert.equal(changedDynamicFactors, baseline);
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
  learner.techniques.cultivatingTechId = technique.techId;
  learner.pendingTechniqueComprehensions.push({
    techId: technique.techId,
    name: technique.name,
    sourceKind: 'normal',
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

  learner.pendingTechniqueComprehensions[0]!.activeTransferJob = {
    jobId: 'job:test',
    teacherPlayerId: 'teacher:1',
    startedAtTick: 0,
    status: 'running',
    range: 2,
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
  assert.equal(learner.pendingTechniqueComprehensions[0]?.requiredProgress, 300);
  assert.equal(learner.pendingTechniqueComprehensions[0]?.progress, 1);
  assert.equal(learner.transmissionSkill.exp, getExpectedTransmissionExpGain(1, 1, 1));
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

  runtimeService.startTechniqueTransmission(teacher.playerId, learner.playerId, createdTechnique.techId);
  const pending = learner.pendingTechniqueComprehensions[0]!;
  pending.requiredProgress = 999999;
  runtimeService.advanceTechniqueTransmissionForPlayer(learner, 1);

  assert.equal(pending.requiredProgress, 300);
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
  learner.pendingTechniqueComprehensions.push({
    techId: technique.techId,
    name: technique.name,
    sourceKind: 'normal',
    progress: 0,
    requiredProgress: 3,
    realmLv: 1,
    grade: 'mortal',
    category: 'internal',
    createdAtTick: 0,
    updatedAtTick: 0,
    activeTransferJob: {
      jobId: 'legacy-normal-technique-job',
      teacherPlayerId: teacherA.playerId,
      startedAtTick: 0,
      status: 'running',
      range: 2,
    },
  });
  runtimeService.advanceTechniqueTransmissionForPlayer(learner, 1);
  assert.equal(learner.pendingTechniqueComprehensions[0]?.progress, 0);
  assert.equal(learner.pendingTechniqueComprehensions[0]?.activeTransferJob?.blockedReason, 'not_created_technique');
  learner.pendingTechniqueComprehensions = [];

  runtimeService.startTechniqueTransmission(teacherA.playerId, learner.playerId, createdTechnique.techId);
  const pending = learner.pendingTechniqueComprehensions[0]!;
  pending.requiredProgress = 3;
  runtimeService.advanceTechniqueTransmissionForPlayer(learner, 1);
  assert.equal(pending.progress, 1);
  assert.equal(learner.transmissionSkill.exp, getExpectedTransmissionExpGain(1, 1, 1));

  assert.equal(runtimeService.interruptTechniqueTransmissionForPlayer(learner.playerId, 'move', 2), true);
  assert.equal(pending.activeTransferJob?.interruptWaitRemainingTicks, 10);
  for (let tick = 2; tick <= 11; tick += 1) {
    runtimeService.advanceTechniqueTransmissionForPlayer(learner, tick);
  }
  assert.equal(pending.progress, 1);
  assert.equal(pending.activeTransferJob?.interruptWaitRemainingTicks, 0);
  assert.equal(pending.activeTransferJob?.interruptState, null);

  runtimeService.advanceTechniqueTransmissionForPlayer(learner, 12);
  assert.equal(pending.progress, 2);
  assert.equal(learner.transmissionSkill.exp, getExpectedRepeatedTransmissionExpGain(1, 1, 2));

  teacherA.x = 99;
  runtimeService.advanceTechniqueTransmissionForPlayer(learner, 13);
  assert.equal(pending.progress, 2);
  assert.equal(pending.activeTransferJob?.status, 'blocked');

  runtimeService.cancelTechniqueTransmission(learner.playerId, createdTechnique.techId);
  assert.equal(pending.activeTransferJob, null);
  runtimeService.startTechniqueTransmission(teacherB.playerId, learner.playerId, createdTechnique.techId);
  learner.pendingTechniqueComprehensions[0]!.progress = 299;
  runtimeService.advanceTechniqueTransmissionForPlayer(learner, 14);
  assert.equal(learner.pendingTechniqueComprehensions.length, 0);
  assert.equal(learner.techniques.techniques.some((entry) => entry.techId === createdTechnique.techId), true);
  assert.equal(learner.transmissionSkill.exp, getExpectedRepeatedTransmissionExpGain(1, 1, 3));
}

testSelfComprehensionProgressesOnlyWithoutTransmission();
testRequiredProgressIgnoresDynamicLearnerAndTeacherFactors();
testDynamicFactorsApplyToProgressGain();
testCultivationUsesElapsedTicksForPendingComprehension();
testCultivationCanStoreFractionalComprehensionProgress();
testPendingTechniqueNameResolvesDisplayName();
testTransmissionRefreshesStaleRequiredProgress();
testTransmissionBlocksCancelsAndContinues();

console.log(JSON.stringify({ ok: true, case: 'technique-comprehension' }, null, 2));
