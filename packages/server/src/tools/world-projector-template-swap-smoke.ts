// @ts-nocheck
"use strict";

const assert = require("node:assert/strict");
const { createNumericRatioDivisors, createNumericStats } = require("@mud/shared");
const { WorldProjectorService } = require("../network/world-projector.service");

function createTemplateRepository() {
  const templates = new Map([
    ["sect:old", { id: "sect:old", name: "旧宗门域" }],
    ["sect:new", { id: "sect:new", name: "新宗门域" }],
  ]);
  return {
    has(mapId) {
      return templates.has(mapId);
    },
    getOrThrow(mapId) {
      const template = templates.get(mapId);
      if (!template) {
        throw new Error(`missing template ${mapId}`);
      }
      return template;
    },
  };
}

function buildView(templateId, x, y, worldRevision = 1, selfRevision = 1) {
  return {
    playerId: "player:template-swap",
    tick: 1,
    worldRevision,
    selfRevision,
    instance: {
      instanceId: "sect:template-swap:main",
      templateId,
      name: templateId,
      kind: "sect",
      width: templateId === "sect:new" ? 13 : 5,
      height: 5,
    },
    self: {
      name: "测试",
      displayName: "测试",
      x,
      y,
      facing: 1,
    },
    visiblePlayers: [],
    localMonsters: [],
    localNpcs: [],
    localPortals: [{
      x,
      y,
      targetMapId: "sect:old",
      trigger: "manual",
      kind: "sect_core",
      name: "宗门核心",
      char: "宗",
    }],
    localGroundPiles: [],
    localContainers: [],
    localFormations: [],
  };
}

function buildPlayer(templateId, x, y, selfRevision = 1) {
  return {
    playerId: "player:template-swap",
    instanceId: "sect:template-swap:main",
    templateId,
    x,
    y,
    facing: 1,
    hp: 100,
    maxHp: 100,
    qi: 100,
    maxQi: 100,
    selfRevision,
    wallet: { balances: [] },
    inventory: { revision: 1, capacity: 20, items: [] },
    equipment: { revision: 1, slots: [] },
    techniques: { revision: 1, techniques: [] },
    attrs: {
      revision: 1,
      stage: "炼气",
      baseAttrs: {
        constitution: 1,
        spirit: 1,
        perception: 1,
        talent: 1,
        strength: 1,
        meridians: 1,
      },
      finalAttrs: {
        constitution: 1,
        spirit: 1,
        perception: 1,
        talent: 1,
        strength: 1,
        meridians: 1,
      },
      numericStats: createNumericStats(),
      ratioDivisors: createNumericRatioDivisors(),
    },
    buffs: { revision: 1, buffs: [] },
    actions: { revision: 1, actions: [] },
    combat: {},
  };
}

function main() {
  const projector = new WorldProjectorService(createTemplateRepository());
  projector.createInitialEnvelope(
    { playerId: "player:template-swap", sessionId: "session:template-swap" },
    buildView("sect:old", 2, 2, 1, 1),
    buildPlayer("sect:old", 2, 2, 1),
  );

  const delta = projector.createDeltaEnvelope(
    buildView("sect:new", 10, 2, 2, 2),
    buildPlayer("sect:new", 10, 2, 2),
  );

  assert.ok(delta);
  assert.equal(delta.mapEnter?.mid, "sect:new");
  assert.equal(delta.mapEnter?.iid, "sect:template-swap:main");
  assert.equal(delta.worldDelta?.p?.[0]?.id, "player:template-swap");
  assert.equal(delta.worldDelta?.p?.[0]?.x, 10);
  assert.equal(delta.worldDelta?.o?.[0]?.x, 10);
  assert.equal(delta.selfDelta?.mid, "sect:new");

  console.log(JSON.stringify({ ok: true, case: "world-projector-template-swap" }, null, 2));
}

main();
