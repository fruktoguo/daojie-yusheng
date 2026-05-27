import assert from 'node:assert/strict';
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
    attrs: { revision: 0, baseAttrs: {}, finalAttrs: {}, numericStats: {}, ratioDivisors: {} },
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
  const runtimeService = new PlayerRuntimeService(
    contentTemplateRepository as never,
    null as never,
    playerAttributesService as never,
    {
      refreshPreview() {},
    } as never,
  );
  return { progressionService, runtimeService };
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

  const progressed = progressionService.advanceTechniqueProgressInternal(learner, 4, { allowPendingComprehension: true });
  assert.equal(progressed.changed, true);
  assert.equal(learner.pendingTechniqueComprehensions[0]?.progress, 4);

  learner.pendingTechniqueComprehensions[0]!.activeTransferJob = {
    jobId: 'job:test',
    teacherPlayerId: 'teacher:1',
    startedAtTick: 0,
    status: 'running',
    range: 2,
  };
  const blocked = progressionService.advanceTechniqueProgressInternal(learner, 4, { allowPendingComprehension: true });
  assert.equal(blocked.changed, false);
  assert.equal(learner.pendingTechniqueComprehensions[0]?.progress, 4);
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

  teacherA.x = 99;
  runtimeService.advanceTechniqueTransmissionForPlayer(learner, 2);
  assert.equal(pending.progress, 1);
  assert.equal(pending.activeTransferJob?.status, 'blocked');

  runtimeService.cancelTechniqueTransmission(learner.playerId, createdTechnique.techId);
  assert.equal(pending.activeTransferJob, null);
  runtimeService.startTechniqueTransmission(teacherB.playerId, learner.playerId, createdTechnique.techId);
  learner.pendingTechniqueComprehensions[0]!.requiredProgress = 3;
  runtimeService.advanceTechniqueTransmissionForPlayer(learner, 3);
  runtimeService.advanceTechniqueTransmissionForPlayer(learner, 4);
  assert.equal(learner.pendingTechniqueComprehensions.length, 0);
  assert.equal(learner.techniques.techniques.some((entry) => entry.techId === createdTechnique.techId), true);
}

testSelfComprehensionProgressesOnlyWithoutTransmission();
testTransmissionBlocksCancelsAndContinues();

console.log(JSON.stringify({ ok: true, case: 'technique-comprehension' }, null, 2));
