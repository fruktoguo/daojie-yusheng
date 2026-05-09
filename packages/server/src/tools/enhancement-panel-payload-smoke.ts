// @ts-nocheck

const assert = require("node:assert/strict");

const {
  computeAlchemyAdjustedSuccessRate,
  computeCraftAdjustedSuccessRate,
  computeEnhancementAdjustedSuccessRate,
  getEnhancementTargetSuccessRate,
} = require("@mud/shared");
const { CraftPanelRuntimeService } = require("../runtime/craft/craft-panel-runtime.service");
const { CraftPanelEnhancementQueryService } = require("../runtime/craft/craft-panel-enhancement-query.service");

function createEquipment(itemId, count = 1, overrides = {}) {
  return {
    itemId,
    name: itemId === "equip.test_blade" ? "测试剑" : "测试护符",
    type: "equipment",
    desc: "这段长描述不应该进入强化面板同步包。",
    grade: "yellow",
    level: 3,
    equipSlot: "weapon",
    equipValueStats: {
      physAtk: 12,
      hit: 3,
    },
    effects: [
      {
        effectId: "long-static-effect",
        type: "stat_aura",
        valueStats: {
          hit: 1,
        },
      },
    ],
    tags: ["static-tag"],
    count,
    enhanceLevel: 0,
    ...overrides,
  };
}

function createPlayer() {
  return {
    playerId: "player:enhancement-panel-payload-smoke",
    enhancementSkill: {
      level: 8,
      exp: 0,
      expToNext: 100,
    },
    enhancementSkillLevel: 8,
    inventory: {
      items: [
        createEquipment("equip.test_blade", 1),
        createEquipment("equip.test_blade", 2),
      ],
    },
    equipment: {
      slots: [
        {
          slot: "weapon",
          item: {
            ...createEquipment("equip.copper_enhancement_hammer", 1),
            tags: ["enhancement_hammer"],
          },
        },
      ],
    },
    enhancementRecords: [],
    enhancementJob: null,
    alchemyJob: null,
  };
}

function assertCompactItem(item, label) {
  assert.equal(typeof item.itemId, "string", `${label} should keep itemId`);
  assert.equal(typeof item.name, "string", `${label} should keep display name`);
  assert.equal(typeof item.level, "number", `${label} should keep level`);
  assert.equal(typeof item.count, "number", `${label} should keep count`);
  assert.equal(Object.prototype.hasOwnProperty.call(item, "desc"), false, `${label} must not include desc`);
  assert.equal(Object.prototype.hasOwnProperty.call(item, "effects"), false, `${label} must not include effects`);
  assert.equal(Object.prototype.hasOwnProperty.call(item, "equipValueStats"), false, `${label} must not include static stats`);
  assert.equal(Object.prototype.hasOwnProperty.call(item, "tags"), false, `${label} must not include tags`);
}

function main() {
  const repository = {
    getItemName(itemId) {
      return itemId;
    },
  };
  const expectedAlchemyRate = computeCraftAdjustedSuccessRate(0.64, 30, 24, 0.15);
  assert.equal(computeAlchemyAdjustedSuccessRate(0.64, 30, 24, 0.15), expectedAlchemyRate, "alchemy success modifier must use common craft formula");
  assert.equal(computeAlchemyAdjustedSuccessRate(0.64, 30, 24, 0.15), expectedAlchemyRate, "forging reuses alchemy-like success modifier and must use common craft formula");
  assert.equal(
    computeEnhancementAdjustedSuccessRate(1, 24, 30, 0.15),
    computeCraftAdjustedSuccessRate(getEnhancementTargetSuccessRate(1), 30, 24, 0.15),
    "enhancement success modifier must use common craft formula",
  );

  const service = new CraftPanelEnhancementQueryService(repository);
  const player = createPlayer();
  const fullPayload = service.buildEnhancementPanelPayload(player, new Map());
  const candidate = fullPayload.state.candidates.find((entry) => entry.item.itemId === "equip.test_blade");
  assert.ok(candidate, "expected enhancement candidate");
  assertCompactItem(candidate.item, "candidate item");
  assert.ok(candidate.protectionCandidates.length > 0, "expected protection candidate");
  assertCompactItem(candidate.protectionCandidates[0].item, "protection item");

  const highLevelTarget = createEquipment("equip.high_level_blade", 1, { level: 30 });
  player.enhancementSkill.level = 30;
  player.enhancementSkillLevel = 30;
  player.inventory.items = [highLevelTarget];
  const highLevelPayload = service.buildEnhancementPanelPayload(player, new Map());
  const highLevelCandidate = highLevelPayload.state.candidates.find((entry) => entry.item.itemId === "equip.high_level_blade");
  const expectedHighLevelRate = computeEnhancementAdjustedSuccessRate(1, 30, 30, 0);
  assert.equal(highLevelCandidate?.successRate, expectedHighLevelRate, "query success rate must follow main shared formula without capping role enhancement level at 20");

  const runtimeService = new CraftPanelRuntimeService(repository, null, null, null, service);
  const runtimeCandidate = runtimeService.buildEnhancementCandidate(player, { source: "inventory", slotIndex: 0 }, highLevelTarget);
  assert.equal(runtimeCandidate?.successRate, expectedHighLevelRate, "runtime success rate must follow main shared formula without capping role enhancement level at 20");

  player.enhancementSkill.level = 8;
  player.enhancementSkillLevel = 8;
  player.inventory.items = [
    createEquipment("equip.test_blade", 1),
    createEquipment("equip.test_blade", 2),
  ];

  player.enhancementJob = {
    jobRunId: "job:test:enhancement:1",
    jobType: "enhancement",
    target: {
      source: "inventory",
      slotIndex: 0,
    },
    item: createEquipment("equip.test_blade", 1),
    targetItemId: "equip.test_blade",
    targetItemName: "测试剑",
    targetItemLevel: 3,
    currentLevel: 0,
    targetLevel: 1,
    desiredTargetLevel: 2,
    spiritStoneCost: 1,
    materials: [],
    protectionUsed: false,
    phase: "enhancing",
    pausedTicks: 0,
    successRate: 0.5,
    totalTicks: 5,
    remainingTicks: 4,
    startedAt: 1,
    roleEnhancementLevel: 8,
    totalSpeedRate: 1,
    jobVersion: 2,
    queuedJobs: [],
  };

  const patchPayload = service.buildEnhancementPanelPatchPayload(player);
  assert.equal(Object.prototype.hasOwnProperty.call(patchPayload, "state"), false, "patch must not include full state");
  assert.equal(Object.prototype.hasOwnProperty.call(patchPayload.statePatch, "candidates"), false, "patch must not include candidates");
  assert.equal(Object.prototype.hasOwnProperty.call(patchPayload.statePatch, "records"), false, "patch must not include records");
  assert.equal(patchPayload.statePatch.job.targetItemId, "equip.test_blade");
  assertCompactItem(patchPayload.statePatch.job.item, "patch job item");
}

main();
console.log("enhancement-panel-payload-smoke ok");
