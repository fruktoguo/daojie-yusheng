"use strict";

const assert = require("node:assert/strict");
const { createNumericRatioDivisors, createNumericStats } = require("@mud/shared");
const { WorldProjectorService } = require("../network/world-projector.service");

function main() {
  const formationProof = proveFormationActivePatchSurvivesObjectCache();
  const artifactProof = proveArtifactOnlyPanelDeltaIsEmitted();
  const lifeProof = proveLifeElapsedTicksPanelDeltaIsEmitted();
  const transmissionProof = proveTransmissionJobPanelDeltaIsEmitted();
  const combatTargetProof = proveCombatTargetPanelDeltaIsEmitted();
  console.log(JSON.stringify({
    ok: true,
    formationProof,
    artifactProof,
    lifeProof,
    transmissionProof,
    combatTargetProof,
    answers: "阵法 active 原地切换会产生世界实体 patch；仅法宝槽位开关变化也会产生 panelDelta.art，前端无需刷新即可更新世界表现。",
  }, null, 2));
}

function proveFormationActivePatchSurvivesObjectCache() {
  const projector = createProjector();
  const player = createPlayer();
  const formation = createFormation(true);
  projector.createInitialEnvelope(
    { playerId: player.playerId, sessionId: "visual_state_session" },
    createView({ tick: 1, worldRevision: 1, formations: [formation] }),
    player,
  );

  formation.active = false;
  const envelope = projector.createDeltaEnvelope(
    createView({ tick: 2, worldRevision: 2, formations: [formation] }),
    player,
  );
  const patch = envelope?.worldDelta?.fmn?.find((entry) => entry.id === formation.id);

  assert.equal(patch?.ac, 0);
  assert.equal(patch?.c, "#9aa0a6");
  return { formationId: formation.id, activePatch: patch?.ac, colorPatch: patch?.c };
}

function proveArtifactOnlyPanelDeltaIsEmitted() {
  const projector = createProjector();
  const player = createPlayer();
  projector.createInitialEnvelope(
    { playerId: player.playerId, sessionId: "visual_state_session" },
    createView({ tick: 1, worldRevision: 1, formations: [] }),
    player,
  );

  const slot = player.artifacts.slots[0];
  slot.enabled = true;
  player.artifacts.revision += 1;
  const envelope = projector.createDeltaEnvelope(
    createView({ tick: 2, worldRevision: 1, formations: [] }),
    player,
  );
  const artifactPatch = envelope?.panelDelta?.art?.slots?.[0];

  assert.equal(envelope?.panelDelta?.art?.r, 2);
  assert.equal(artifactPatch?.slot, "artifact_1");
  assert.equal(artifactPatch?.enabled, true);
  return { revision: envelope?.panelDelta?.art?.r, slot: artifactPatch?.slot, enabled: artifactPatch?.enabled };
}

function proveLifeElapsedTicksPanelDeltaIsEmitted() {
  const projector = createProjector();
  const player = createPlayer();
  projector.createInitialEnvelope(
    { playerId: player.playerId, sessionId: "visual_state_session" },
    createView({ tick: 1, worldRevision: 1, formations: [] }),
    player,
  );

  player.lifeElapsedTicks = 128;
  const envelope = projector.createDeltaEnvelope(
    createView({ tick: 2, worldRevision: 1, formations: [] }),
    player,
  );

  assert.equal(envelope?.panelDelta?.attr?.lifeElapsedTicks, 128);
  return { lifeElapsedTicks: envelope?.panelDelta?.attr?.lifeElapsedTicks };
}

function proveTransmissionJobPanelDeltaIsEmitted() {
  const projector = createProjector();
  const player = createPlayer();
  player.pendingTechniqueComprehensions = [createPendingComprehension()];
  player.transmissionJob = createTransmissionJob("running");
  projector.createInitialEnvelope(
    { playerId: player.playerId, sessionId: "visual_state_session" },
    createView({ tick: 1, worldRevision: 1, formations: [] }),
    player,
  );

  player.transmissionJob.status = "blocked";
  player.transmissionJob.blockedReason = "teacher_out_of_range";
  player.transmissionJob.interruptWaitRemainingTicks = 7;
  player.transmissionJob.interruptState = {
    reason: "move",
    waitTotalTicks: 10,
    waitRemainingTicks: 7,
    startedAtTick: 2,
  };
  const envelope = projector.createDeltaEnvelope(
    createView({ tick: 2, worldRevision: 1, formations: [] }),
    player,
  );
  const job = envelope?.panelDelta?.tech?.pendingComprehensions?.[0]?.activeTransferJob;

  assert.equal(job?.status, "blocked");
  assert.equal(job?.blockedReason, "teacher_out_of_range");
  assert.equal(job?.interruptWaitRemainingTicks, 7);
  assert.equal(job?.interruptState?.waitRemainingTicks, 7);
  return { status: job?.status, blockedReason: job?.blockedReason, interruptWaitRemainingTicks: job?.interruptWaitRemainingTicks };
}

function proveCombatTargetPanelDeltaIsEmitted() {
  const projector = createProjector();
  const player = createPlayer();
  projector.createInitialEnvelope(
    { playerId: player.playerId, sessionId: "visual_state_session" },
    createView({ tick: 1, worldRevision: 1, formations: [] }),
    player,
  );

  player.combat.combatTargetId = "monster:visual-state";
  player.combat.combatTargetLocked = true;
  const envelope = projector.createDeltaEnvelope(
    createView({ tick: 2, worldRevision: 1, formations: [] }),
    player,
  );

  assert.equal(envelope?.panelDelta?.act?.combatTargetId, "monster:visual-state");
  assert.equal(envelope?.panelDelta?.act?.combatTargetLocked, true);
  return {
    combatTargetId: envelope?.panelDelta?.act?.combatTargetId,
    combatTargetLocked: envelope?.panelDelta?.act?.combatTargetLocked,
  };
}

function createProjector() {
  return new WorldProjectorService({
    has() {
      return false;
    },
    getOrThrow(mapId) {
      return { id: mapId };
    },
  });
}

function createView({ tick, worldRevision, formations }) {
  return {
    playerId: "player:visual-state",
    sessionId: "visual_state_session",
    tick,
    worldRevision,
    selfRevision: 1,
    instance: {
      instanceId: "instance:visual-state",
      templateId: "map.visual_state",
      name: "表现同步测试",
      kind: "public",
      width: 32,
      height: 32,
    },
    self: {
      name: "表现同步测试",
      displayName: "表现同步测试",
      x: 5,
      y: 5,
      facing: 1,
      buffs: { revision: 1, buffs: [] },
    },
    visiblePlayers: [],
    localMonsters: [],
    localNpcs: [],
    localPortals: [],
    localGroundPiles: [],
    localContainers: [],
    localBuildings: [],
    localFormations: formations,
  };
}

function createFormation(active) {
  return {
    id: "formation:visual-state",
    x: 6,
    y: 5,
    name: "表现同步阵",
    char: "阵",
    color: "#4da3ff",
    active,
    radius: 3,
    rangeShape: "circle",
    rangeHighlightColor: "#4da3ff",
    showText: true,
    ownerPlayerId: "player:visual-state",
  };
}

function createPlayer() {
  return {
    playerId: "player:visual-state",
    instanceId: "instance:visual-state",
    templateId: "map.visual_state",
    x: 5,
    y: 5,
    facing: 1,
    hp: 100,
    maxHp: 100,
    qi: 100,
    maxQi: 100,
    selfRevision: 1,
    realmLv: 1,
    realm: { realmLv: 1, stage: "炼气", name: "炼气一层", displayName: "炼气一层" },
    combat: {
      autoBattle: false,
      autoUsePills: [],
      combatTargetingRules: null,
      autoBattleTargetingMode: "auto",
      retaliatePlayerTargetId: null,
      combatTargetId: null,
      combatTargetLocked: false,
      autoRetaliate: true,
      autoBattleStationary: false,
      allowAoePlayerHit: false,
      autoIdleCultivation: true,
      autoSwitchCultivation: false,
      autoRootFoundation: false,
      cultivationActive: false,
      senseQiActive: false,
      wangQiActive: false,
    },
    movementCapabilities: { staticObstacleIgnore: false },
    wallet: { balances: [] },
    inventory: { revision: 1, capacity: 20, items: [] },
    equipment: { revision: 1, slots: [] },
    artifacts: {
      revision: 1,
      slots: [{
        slot: "artifact_1",
        unlocked: true,
        enabled: false,
        qi: 100,
        maxQi: 100,
        item: { itemId: "artifact.flying_sword", count: 1, name: "巡天飞剑", type: "artifact" },
      }],
    },
    techniques: { revision: 1, techniques: [] },
    pendingTechniqueComprehensions: [],
    attrs: {
      revision: 1,
      stage: "炼气",
      baseAttrs: createBaseAttrs(),
      finalAttrs: createBaseAttrs(),
      numericStats: createNumericStats(),
      ratioDivisors: createNumericRatioDivisors(),
    },
    actions: { revision: 1, actions: [] },
    buffs: { revision: 1, buffs: [] },
    lifeElapsedTicks: 0,
    transmissionSkill: { level: 1, exp: 0, expToNext: 100 },
  };
}

function createPendingComprehension() {
  return {
    techId: "tech.visual_state",
    name: "表现同步诀",
    sourceKind: "transmission",
    creatorPlayerId: "player:teacher",
    selfComprehensionAllowed: false,
    progress: 10,
    requiredProgress: 100,
    realmLv: 1,
    grade: "mortal",
    category: "combat",
    createdAtTick: 1,
    updatedAtTick: 1,
  };
}

function createTransmissionJob(status) {
  return {
    jobRunId: "job:visual-state",
    techniqueId: "tech.visual_state",
    teacherPlayerId: "player:teacher",
    teacherName: "授法者",
    startedAt: 1,
    status,
    remainingTicks: 90,
    range: 2,
    progressGainPerTick: 1,
    estimatedRemainingTicks: 90,
    progressBreakdown: {
      baseProgress: 1,
      progressGain: 1,
      difficultyFactor: 1,
      techniqueRealmLv: 1,
      learnerRealmLv: 1,
      learnerTransmissionLevel: 1,
      realmFactor: 1,
      learnerTransmissionFactor: 1,
    },
    interruptWaitRemainingTicks: 0,
    interruptState: null,
  };
}

function createBaseAttrs() {
  return {
    constitution: 1,
    spirit: 1,
    perception: 1,
    talent: 1,
    strength: 1,
    meridians: 1,
  };
}

main();
