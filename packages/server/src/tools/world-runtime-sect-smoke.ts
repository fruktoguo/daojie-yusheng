// @ts-nocheck
"use strict";

const assert = require("node:assert/strict");
const { MapTemplateRepository } = require("../runtime/map/map-template.repository");
const { MapInstanceRuntime } = require("../runtime/instance/map-instance.runtime");
const { WorldRuntimeSectService } = require("../runtime/world/world-runtime-sect.service");
const { WorldRuntimePlayerSessionService } = require("../runtime/world/world-runtime-player-session.service");
const { WorldRuntimeUseItemService } = require("../runtime/world/world-runtime-use-item.service");
const { Direction } = require("@mud/shared");

const playerId = "player:sect-smoke";
const publicInstanceId = "public:sect_smoke_world";

function main() {
  const templateRepository = new MapTemplateRepository();
  templateRepository.registerRuntimeMapTemplate({
    id: "sect_smoke_world",
    name: "宗门测试主世界",
    width: 5,
    height: 5,
    routeDomain: "system",
    tiles: [
      ".....",
      ".....",
      ".....",
      ".....",
      ".....",
    ],
    spawnPoint: { x: 2, y: 2 },
    portals: [],
    npcs: [],
    monsters: [],
    safeZones: [],
    landmarks: [],
    containers: [],
    auras: [],
  });
  const contentTemplateRepository = {
    getLearnTechniqueId() { return null; },
    createRuntimeMonstersForMap() { return []; },
  };
  const publicInstance = new MapInstanceRuntime({
    instanceId: publicInstanceId,
    template: templateRepository.getOrThrow("sect_smoke_world"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "宗门测试主世界",
    linePreset: "peaceful",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  const player = {
    playerId,
    name: "烟测",
    displayName: "烟测",
    sectId: null,
    x: 2,
    y: 2,
    inventory: {
      items: [{
        itemId: "sect_founding_token",
        name: "建宗令",
        type: "consumable",
        count: 1,
        useBehavior: "create_sect",
      }],
    },
  };
  const instances = new Map([[publicInstanceId, publicInstance]]);
  const notices = [];
  const guardians = [];
  const playerRuntimeService = {
    getPlayerOrThrow(targetPlayerId) {
      assert.equal(targetPlayerId, playerId);
      return player;
    },
    getPlayer(targetPlayerId) {
      assert.equal(targetPlayerId, playerId);
      return player;
    },
    peekInventoryItem(targetPlayerId, slotIndex) {
      assert.equal(targetPlayerId, playerId);
      return player.inventory.items[slotIndex] ?? null;
    },
    consumeInventoryItem(targetPlayerId, slotIndex, count) {
      assert.equal(targetPlayerId, playerId);
      player.inventory.items[slotIndex].count -= count;
    },
    setPlayerSectId(targetPlayerId, sectId) {
      assert.equal(targetPlayerId, playerId);
      player.sectId = sectId;
    },
  };
  const sectService = new WorldRuntimeSectService(contentTemplateRepository, templateRepository, playerRuntimeService);
  sectService.ensurePersistencePool = async () => null;
  const useItemService = new WorldRuntimeUseItemService(contentTemplateRepository, templateRepository, playerRuntimeService);
  const deps = {
    worldRuntimeSectService: sectService,
    worldRuntimeFormationService: {
      upsertSectGuardianFormation(input) {
        guardians.push(input);
        return input;
      },
    },
    getPlayerLocationOrThrow(targetPlayerId) {
      assert.equal(targetPlayerId, playerId);
      return { instanceId: publicInstanceId, sessionId: "session:sect-smoke" };
    },
    getInstanceRuntime(instanceId) {
      return instances.get(instanceId) ?? null;
    },
    getInstanceRuntimeOrThrow(instanceId) {
      const instance = instances.get(instanceId);
      if (!instance) throw new Error(`missing instance ${instanceId}`);
      return instance;
    },
    createInstance(input) {
      const template = templateRepository.getOrThrow(input.templateId);
      const instance = new MapInstanceRuntime({
        instanceId: input.instanceId,
        template,
        monsterSpawns: [],
        kind: input.kind,
        persistent: input.persistent,
        createdAt: Date.now(),
        displayName: input.displayName,
        linePreset: input.linePreset,
        lineIndex: input.lineIndex,
        instanceOrigin: input.instanceOrigin,
        defaultEntry: input.defaultEntry,
        canDamageTile: true,
        ownerSectId: input.ownerSectId,
        routeDomain: input.routeDomain,
      });
      instances.set(input.instanceId, instance);
      return instance;
    },
    queuePlayerNotice(targetPlayerId, text, kind) {
      assert.equal(targetPlayerId, playerId);
      notices.push({ text, kind });
    },
    refreshQuestStates() {},
  };

  useItemService.dispatchUseItem(playerId, 0, deps, { sectName: "青玄宗", sectMark: "玄" });
  assert.ok(player.sectId?.startsWith("sect:"));
  assert.equal(player.inventory.items[0].count, 0);
  assert.equal(guardians.length, 1);
  assert.equal(guardians[0].ownerSectId, player.sectId);
  assert.equal(sectService.findSectById(player.sectId).name, "青玄宗");
  assert.equal(sectService.findSectById(player.sectId).mark, "玄");

  const entrance = publicInstance.getPortalAtTile(2, 2);
  assert.equal(entrance.kind, "sect_entrance");
  assert.equal(entrance.char, "玄");
  assert.equal(entrance.targetInstanceId, `sect:${player.sectId}:main`);

  const sectInstance = instances.get(entrance.targetInstanceId);
  assert.ok(sectInstance);
  assert.equal(sectInstance.template.width, 5);
  assert.equal(sectInstance.template.height, 5);
  const core = sectInstance.getPortalAtTile(2, 2);
  assert.equal(core.kind, "sect_core");
  assert.equal(core.targetInstanceId, publicInstanceId);
  assert.equal(sectService.isSectInnateStabilized(sectInstance.meta.instanceId, 2, 2), true);
  assert.equal(sectService.isSectInnateStabilized(sectInstance.meta.instanceId, 4, 2), true);
  assert.equal(sectInstance.getTileCombatState(1, 1), null);
  assert.equal(sectInstance.getTileCombatState(4, 2).maxHp, 200000);
  const innerSectStone = sectInstance.damageTile(0, 2, Number.MAX_SAFE_INTEGER);
  assert.equal(innerSectStone.destroyed, true);
  const innerSectStoneState = sectInstance.getTileCombatState(0, 2);
  assert.equal(innerSectStoneState.destroyed, true);
  assert.equal(sectInstance.advanceTileRecovery((x, y) => sectService.isSectInnateStabilized(sectInstance.meta.instanceId, x, y)), false);
  assert.equal(sectInstance.getTileCombatState(0, 2).destroyed, true);
  assert.equal(sectInstance.getTileCombatState(0, 2).respawnLeft, innerSectStoneState.respawnLeft);
  const sectRuntimePlayer = sectInstance.connectPlayer({ playerId, sessionId: "session:sect-smoke", preferredX: 2, preferredY: 2 });
  assert.equal(sectRuntimePlayer.x, 2);
  assert.equal(sectRuntimePlayer.y, 2);
  assert.equal(sectInstance.isWalkable(3, 2, playerId), true);
  assert.equal(sectInstance.enqueueMove({ playerId, direction: Direction.East }), true);
  sectInstance.tickOnce();
  assert.equal(sectInstance.getPlayerPosition(playerId).x, 3);
  assert.equal(sectInstance.getPlayerPosition(playerId).y, 2);
  sectInstance.disconnectPlayer(playerId);
  const coreActions = sectService.buildSectCoreActions({
    playerId,
    self: { x: 2, y: 2 },
    instance: { instanceId: sectInstance.meta.instanceId },
  }, deps);
  assert.ok(coreActions.some((action) => action.id === "sect:manage"));
  const manageAction = coreActions.find((action) => action.id === "sect:manage");
  assert.match(manageAction.desc, /地域\s+25格/);
  assert.doesNotMatch(manageAction.desc, /地域\s+\d+x\d+/);
  assert.ok(!coreActions.some((action) => action.id === "sect:guardian:refill"));

  const badRealSectInstanceId = `real:${entrance.targetMapId}`;
  instances.set(badRealSectInstanceId, new MapInstanceRuntime({
    instanceId: badRealSectInstanceId,
    template: templateRepository.getOrThrow(entrance.targetMapId),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "错误宗门分线",
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  }));
  const sessionService = new WorldRuntimePlayerSessionService({
    getPlayerViewOrThrow() {
      return {};
    },
  });
  const resolvedSectInstance = sessionService.resolveTargetInstance({
    playerId,
    requestedInstanceId: badRealSectInstanceId,
    requestedMapId: entrance.targetMapId,
  }, {
    ...deps,
    logger: { debug() {}, warn() {} },
    templateRepository,
    worldRuntimeSectService: sectService,
    worldRuntimeGmQueueService: { clearPendingRespawn() {} },
    worldRuntimeNavigationService: { clearNavigationIntent() {} },
    worldSessionService: { purgePlayerSession() {} },
    playerRuntimeService: {
      ensurePlayer() { return { attrs: { numericStats: { moveSpeed: 0 } } }; },
      getPlayer() { return player; },
      removePlayerRuntime() {},
      syncFromWorldView() {},
    },
    getPlayerLocation() { return null; },
    setPlayerLocation() {},
    clearPlayerLocation() {},
    clearPendingCommand() {},
  });
  assert.equal(resolvedSectInstance.meta.instanceId, sectInstance.meta.instanceId);
  instances.delete(badRealSectInstanceId);

  const edgeX = sectInstance.template.width - 1;
  const destroyed = sectInstance.damageTile(edgeX, 2, Number.MAX_SAFE_INTEGER);
  assert.equal(destroyed.destroyed, true);
  assert.equal(sectService.expandSectForDestroyedTile(sectInstance.meta.instanceId, edgeX, 2, deps), true);
  assert.equal(sectInstance.template.width, 5);
  assert.equal(sectInstance.template.height, 5);
  assert.equal(sectInstance.isInBounds(edgeX + 2, 2), true);
  assert.equal(sectInstance.getTileCombatState(edgeX + 2, 2).tileType, "stone");
  assert.equal(sectInstance.tilePlane.getCellCount(), 35);
  const recoveringEdge = sectInstance.damageTile(edgeX + 2, 2, 1);
  assert.equal(recoveringEdge.destroyed, false);
  assert.equal(sectInstance.getTileCombatState(edgeX + 2, 2).hp, recoveringEdge.maxHp - 1);
  assert.equal(sectInstance.advanceTileRecovery((x, y) => sectService.isSectInnateStabilized(sectInstance.meta.instanceId, x, y)), true);
  assert.equal(sectInstance.getTileCombatState(edgeX + 2, 2).hp, recoveringEdge.maxHp);
  const expandedCoreActions = sectService.buildSectCoreActions({
    playerId,
    self: { x: 2, y: 2 },
    instance: { instanceId: sectInstance.meta.instanceId },
  }, deps);
  assert.match(expandedCoreActions.find((action) => action.id === "sect:manage").desc, /地域\s+35格/);
  const innerDynamicStone = sectInstance.damageTile(edgeX + 1, 2, Number.MAX_SAFE_INTEGER);
  assert.equal(innerDynamicStone.destroyed, true);
  assert.equal(sectService.expandSectForDestroyedTile(sectInstance.meta.instanceId, edgeX + 1, 2, deps), false);
  assert.equal(sectInstance.tilePlane.getCellCount(), 35);

  console.log("world-runtime-sect-smoke passed");
}

main();
