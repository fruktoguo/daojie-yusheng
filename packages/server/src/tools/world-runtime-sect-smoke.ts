// @ts-nocheck
"use strict";

const assert = require("node:assert/strict");
const { MapTemplateRepository } = require("../runtime/map/map-template.repository");
const { MapInstanceRuntime } = require("../runtime/instance/map-instance.runtime");
const { WorldRuntimeSectService } = require("../runtime/world/world-runtime-sect.service");
const { WorldRuntimePlayerSessionService } = require("../runtime/world/world-runtime-player-session.service");
const { WorldRuntimeUseItemService } = require("../runtime/world/world-runtime-use-item.service");
const { Direction } = require("@mud/shared");
const { WorldSyncMapSnapshotService } = require("../network/world-sync-map-snapshot.service");
const { buildFullWorldDelta } = require("../network/world-projector.helpers");
const { WorldRuntimeDetailQueryService } = require("../runtime/world/query/world-runtime-detail-query.service");
const { buildTechniqueActivityTaskListView } = require("../runtime/craft/technique-activity-task-view.helpers");
const { findOptimalPathOnMap } = require("../runtime/world/world-runtime.path-planning.helpers");

const playerId = "player:sect-smoke";
const deputyPlayerId = "player:sect-deputy";
const elderPlayerId = "player:sect-elder";
const laborPlayerId = "player:sect-labor";
const offlinePlayerId = "player:sect-offline";
const publicInstanceId = "real:sect_smoke_world";

async function main() {
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
    linePreset: "real",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  const player = {
    playerId,
    name: "烟测",
    displayName: "烟",
    sessionId: "session:sect-smoke",
    realm: { realmLv: 7, displayName: "不用于宗门成员显示" },
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
  const deputyPlayer = {
    playerId: deputyPlayerId,
    name: "副宗",
    displayName: "副",
    realm: { realmLv: 6, displayName: "不用于宗门成员显示" },
    sectId: null,
    x: 2,
    y: 2,
  };
  const elderPlayer = {
    playerId: elderPlayerId,
    name: "长老",
    displayName: "长",
    realm: { realmLv: 8, displayName: "不用于宗门成员显示" },
    sectId: null,
    x: 2,
    y: 2,
  };
  const laborPlayer = {
    playerId: laborPlayerId,
    name: "杂役",
    displayName: "杂",
    realm: { realmLv: 1, displayName: "不用于宗门成员显示" },
    sectId: null,
    x: 2,
    y: 2,
  };
  const players = new Map([
    [playerId, player],
    [deputyPlayerId, deputyPlayer],
    [elderPlayerId, elderPlayer],
    [laborPlayerId, laborPlayer],
  ]);
  const instances = new Map([[publicInstanceId, publicInstance]]);
  const notices = [];
  const mails = [];
  const transfers = [];
  const guardians = [];
  const pendingCommands = [];
  const craftMutationFlushes = [];
  const playerRuntimeService = {
    getPlayerOrThrow(targetPlayerId) {
      const target = players.get(targetPlayerId);
      if (!target) throw new Error(`missing player ${targetPlayerId}`);
      return target;
    },
    getPlayer(targetPlayerId) {
      return players.get(targetPlayerId) ?? null;
    },
    peekInventoryItem(targetPlayerId, slotIndex) {
      assert.equal(targetPlayerId, playerId);
      return player.inventory.items[slotIndex] ?? null;
    },
    peekInventoryItemByInstanceId(targetPlayerId, itemInstanceId) {
      assert.equal(targetPlayerId, playerId);
      return player.inventory.items[Number(itemInstanceId)] ?? null;
    },
    consumeInventoryItem(targetPlayerId, slotIndex, count) {
      assert.equal(targetPlayerId, playerId);
      player.inventory.items[slotIndex].count -= count;
    },
    consumeInventoryItemByInstanceId(targetPlayerId, itemInstanceId, count) {
      assert.equal(targetPlayerId, playerId);
      player.inventory.items[Number(itemInstanceId)].count -= count;
    },
    setPlayerSectId(targetPlayerId, sectId) {
      const target = players.get(targetPlayerId);
      if (target) target.sectId = sectId;
    },
  };
  const mailRuntimeService = {
    async createDirectMail(targetPlayerId, input) {
      mails.push({ playerId: targetPlayerId, ...input });
      return `mail:${targetPlayerId}:${mails.length}`;
    },
  };
  const sectService = new WorldRuntimeSectService(contentTemplateRepository, templateRepository, playerRuntimeService, mailRuntimeService);
  sectService.ensurePersistencePool = async () => null;
  const useItemService = new WorldRuntimeUseItemService(contentTemplateRepository, templateRepository, playerRuntimeService);
  const deps = {
    playerRuntimeService,
    worldRuntimeSectService: sectService,
    worldRuntimeFormationService: {
      upsertSectGuardianFormation(input) {
        const existing = guardians.find((entry) => entry.id === input.id);
        if (existing) {
          Object.assign(existing, input);
          return existing;
        }
        guardians.push(input);
        return input;
      },
      findFormationInInstance(_instanceId, formationId) {
        return guardians.find((entry) => entry.id === formationId) ?? null;
      },
      dispatchSetPersistentFormationActive(_playerId, payload) {
        const guardian = guardians.find((entry) => entry.id === payload.formationInstanceId);
        if (guardian) guardian.active = payload.active !== false;
        return guardian;
      },
      dispatchInjectPersistentFormationEnergy(_playerId, payload) {
        const guardian = guardians.find((entry) => entry.id === payload.formationInstanceId);
        if (guardian) guardian.remainingAuraBudget = (guardian.remainingAuraBudget ?? 0) + (payload.spiritStoneCount * 100);
        return guardian;
      },
      checkFormationMaintenanceCondition() {
        return { satisfied: true };
      },
    },
    craftPanelRuntimeService: {
      startTechniqueActivity(targetPlayer, kind, payload) {
        assert.equal(kind, "formation");
        const formation = guardians.find((entry) => entry.id === payload.formationInstanceId);
        targetPlayer.formationJob = {
          jobRunId: `job:${targetPlayer.playerId}:formation:test`,
          jobType: "formation",
          formationInstanceId: payload.formationInstanceId,
          formationName: formation?.name ?? "护宗大阵",
          instanceId: formation?.instanceId,
          controlInstanceId: formation?.eyeInstanceId ?? formation?.instanceId,
          controlX: formation?.eyeX ?? formation?.x,
          controlY: formation?.eyeY ?? formation?.y,
          phase: "maintaining",
          totalTicks: 1,
          remainingTicks: 1,
          workTotalTicks: 1,
          workRemainingTicks: 1,
        };
        return {
          ok: true,
          panelChanged: true,
          messages: [{
            kind: "quest",
            key: "notice.craft.formation.start",
            vars: { formationName: targetPlayer.formationJob.formationName },
          }],
          groundDrops: [],
        };
      },
      cancelTechniqueActivity(targetPlayer, kind) {
        assert.equal(kind, "formation");
        const formationName = targetPlayer.formationJob?.formationName ?? "护宗大阵";
        targetPlayer.formationJob = null;
        return {
          ok: true,
          panelChanged: true,
          messages: [{
            kind: "system",
            key: "notice.craft.formation.stopped",
            vars: { formationName },
          }],
          groundDrops: [],
        };
      },
    },
    worldRuntimeCraftMutationService: {
      flushCraftMutation(targetPlayerId, result, panel) {
        craftMutationFlushes.push({ playerId: targetPlayerId, result, panel });
        for (const message of result.messages ?? []) {
          notices.push({ playerId: targetPlayerId, text: message.key, kind: message.kind, structured: message });
        }
      },
    },
    getPlayerLocationOrThrow(targetPlayerId) {
      assert.ok(players.has(targetPlayerId));
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
    getPlayerViewOrThrow(targetPlayerId) {
      return { playerId: targetPlayerId };
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
        supportsPvp: input.supportsPvp,
        canDamageTile: true,
        ownerSectId: input.ownerSectId,
        routeDomain: input.routeDomain,
      });
      instances.set(input.instanceId, instance);
      return instance;
    },
    queuePlayerNotice(targetPlayerId, text, kind) {
      assert.ok(players.has(targetPlayerId));
      notices.push({ text, kind });
    },
    applyTransfer(transfer) {
      transfers.push(transfer);
    },
    enqueuePendingCommand(targetPlayerId, command) {
      pendingCommands.push({ playerId: targetPlayerId, command });
    },
    refreshQuestStates() {},
    refreshPlayerContextActions() {},
  };

  const virtualInstanceId = "public:sect_smoke_world";
  const virtualInstance = new MapInstanceRuntime({
    instanceId: virtualInstanceId,
    template: templateRepository.getOrThrow("sect_smoke_world"),
    monsterSpawns: [],
    kind: "public",
    persistent: true,
    createdAt: Date.now(),
    displayName: "宗门测试虚境",
    linePreset: "peaceful",
    lineIndex: 1,
    instanceOrigin: "smoke",
    defaultEntry: true,
    canDamageTile: true,
  });
  assert.throws(() => sectService.dispatchCreateSect(playerId, 0, player.inventory.items[0], {
    ...deps,
    getPlayerLocationOrThrow(targetPlayerId) {
      assert.equal(targetPlayerId, playerId);
      return { instanceId: virtualInstanceId, sessionId: "session:sect-smoke" };
    },
    getInstanceRuntime(instanceId) {
      return instanceId === virtualInstanceId ? virtualInstance : instances.get(instanceId) ?? null;
    },
    getInstanceRuntimeOrThrow(instanceId) {
      if (instanceId === virtualInstanceId) return virtualInstance;
      const instance = instances.get(instanceId);
      if (!instance) throw new Error(`missing instance ${instanceId}`);
      return instance;
    },
  }, { sectName: "虚境宗", sectMark: "虚" }), /只能在大地图现世线建立宗门/);
  assert.equal(player.inventory.items[0].count, 1);
  assert.equal(player.sectId, null);

  publicInstance.addRuntimePortal({
    x: 4,
    y: 4,
    kind: "portal",
    trigger: "manual",
    targetMapId: "sect_smoke_world",
    targetX: 0,
    targetY: 0,
    name: "近邻界门",
  });
  await assert.rejects(() => useItemService.dispatchUseItem(playerId, 0, deps, { sectName: "近门宗", sectMark: "近" }), /五格阵基内不能有传送点/);
  publicInstance.runtimePortals = [];
  assert.equal(player.inventory.items[0].count, 1);
  assert.equal(player.sectId, null);

  await useItemService.dispatchUseItem(playerId, 0, deps, { sectName: "青玄宗", sectMark: "玄" });
  assert.ok(player.sectId?.startsWith("sect:"));
  assert.equal(player.inventory.items[0].count, 0);
  assert.equal(guardians.length, 1);
  assert.equal(guardians[0].ownerSectId, player.sectId);
  assert.equal(sectService.findSectById(player.sectId).name, "青玄宗");
  assert.equal(sectService.findSectById(player.sectId).mark, "玄");
  assert.equal(sectService.findSectById(player.sectId).members.find((entry) => entry.playerId === playerId).name, "烟测");

  const entrance = publicInstance.getPortalAtTile(2, 2);
  assert.equal(entrance.kind, "sect_entrance");
  assert.equal(entrance.char, "玄");
  assert.equal(entrance.targetInstanceId, `sect:${player.sectId}:main`);
  assert.throws(() => sectService.dispatchCreateSect(deputyPlayerId, 0, {
    itemId: "sect_founding_token",
    name: "建宗令",
    type: "consumable",
    count: 1,
    useBehavior: "create_sect",
  }, deps, { sectName: "玄同门", sectMark: "玄" }), /宗门印记已被占用/);
  assert.equal(deputyPlayer.sectId, null);

  const sectInstance = instances.get(entrance.targetInstanceId);
  assert.ok(sectInstance);
  assert.equal(sectInstance.meta.supportsPvp, true);
  assert.equal(sectInstance.meta.canDamageTile, true);
  const previousSectId = "sect:previous-smoke";
  const previousSect = {
    sectId: previousSectId,
    name: "旧雨宗",
    mark: "旧",
    founderPlayerId: "player:previous-leader",
    leaderPlayerId: "player:previous-leader",
    status: "active",
    entranceInstanceId: publicInstanceId,
    entranceTemplateId: "sect_smoke_world",
    entranceX: 0,
    entranceY: 0,
    sectInstanceId: `sect:${previousSectId}:main`,
    sectTemplateId: `sect_domain:${previousSectId}:x-2_2:y-2_2`,
    coreX: 0,
    coreY: 0,
    expansionRadius: 2,
    mapMinX: -2,
    mapMaxX: 2,
    mapMinY: -2,
    mapMaxY: 2,
    members: [
      { playerId: "player:previous-leader", name: "旧宗主", roleId: "leader", joinedAt: Date.now() },
      { playerId: deputyPlayerId, name: "副宗", roleId: "outer", joinedAt: Date.now() },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  sectService.sectsById.set(previousSectId, previousSect);
  sectService.playerSectId.set(deputyPlayerId, previousSectId);
  deputyPlayer.sectId = previousSectId;
  publicInstance.connectPlayer({ playerId: deputyPlayerId, sessionId: "session:sect-deputy", preferredX: 4, preferredY: 4 });

  const farEntranceActions = sectService.buildSectEntranceActions({
    playerId: deputyPlayerId,
    self: { x: 5, y: 5 },
    instance: { instanceId: publicInstanceId },
    localPortals: [entrance],
  }, deps);
  assert.equal(farEntranceActions.some((action) => action.id.startsWith("sect:apply:")), false);
  const deputyEntranceView = publicInstance.buildPlayerView(deputyPlayerId, 10);
  const projectedEntrance = deputyEntranceView.localPortals.find((portal) => portal.kind === "sect_entrance");
  assert.equal(projectedEntrance?.sectId, player.sectId);
  const entranceDelta = buildFullWorldDelta({
    ...deputyEntranceView,
    localFormations: [],
  });
  const entrancePortalPatch = entranceDelta.o.find((portal) => portal.sid === player.sectId);
  assert.equal(entrancePortalPatch.k, "sect_entrance");
  assert.equal(entrancePortalPatch.ch, "玄");
  assert.equal(entrancePortalPatch.c, "#c8a15a");
  const entranceActions = sectService.buildSectEntranceActions(deputyEntranceView, deps);
  const joinAction = entranceActions.find((action) => action.id.startsWith("sect:apply:"));
  assert.ok(joinAction);
  assert.match(joinAction.name, /申请加入青玄宗/);
  assert.equal(entranceActions.some((action) => action.id.startsWith("sect:enter:")), false);
  deputyPlayer.x = 4;
  deputyPlayer.y = 4;
  sectService.executeSectAction(deputyPlayerId, joinAction.id, deps);
  assert.equal(deputyPlayer.sectId, previousSectId);
  assert.equal(sectService.findSectById(player.sectId).members.some((entry) => entry.playerId === deputyPlayerId), false);
  assert.equal(sectService.findSectById(player.sectId).applications.some((entry) => entry.playerId === deputyPlayerId && entry.status === "pending"), true);
  assert.equal(mails.some((entry) => entry.playerId === playerId && /申请加入青玄宗/.test(entry.fallbackTitle)), true);
  deputyPlayer.x = 3;
  deputyPlayer.y = 3;
  const nearEntranceActions = sectService.buildSectEntranceActions({
    playerId: deputyPlayerId,
    self: { x: 3, y: 3 },
    instance: { instanceId: publicInstanceId },
    localPortals: [entrance],
  }, deps);
  const nonMemberEnterAction = nearEntranceActions.find((action) => action.id.startsWith("sect:enter:"));
  assert.ok(nonMemberEnterAction);
  sectService.executeSectAction(deputyPlayerId, nonMemberEnterAction.id, deps);
  assert.equal(deputyPlayer.sectId, previousSectId);
  assert.equal(transfers.at(-1).targetInstanceId, entrance.targetInstanceId);
  sectService.executeSectAction(playerId, `sect:application:approve:${encodeURIComponent(deputyPlayerId)}`, deps);
  assert.equal(deputyPlayer.sectId, player.sectId);
  assert.equal(sectService.findSectById(player.sectId).members.find((entry) => entry.playerId === deputyPlayerId).roleId, "outer");
  assert.equal(sectService.findSectById(player.sectId).members.find((entry) => entry.playerId === deputyPlayerId).name, "副宗");
  assert.equal(sectService.findSectById(player.sectId).applications.some((entry) => entry.playerId === deputyPlayerId && entry.status === "pending"), false);
  assert.equal(previousSect.members.some((entry) => entry.playerId === deputyPlayerId), false);
  assert.equal(mails.some((entry) => entry.playerId === deputyPlayerId && /已准你入山/.test(entry.fallbackTitle)), true);
  deputyPlayer.sectId = null;
  assert.equal(sectService.reconcilePlayerSectId(deputyPlayerId), player.sectId);
  assert.equal(deputyPlayer.sectId, player.sectId);
  const sameSectEntranceActions = sectService.buildSectEntranceActions({
    playerId: deputyPlayerId,
    self: { x: 3, y: 3 },
    instance: { instanceId: publicInstanceId },
    localPortals: [entrance],
  }, deps);
  assert.equal(sameSectEntranceActions.some((action) => action.id.startsWith("sect:apply:")), false);
  const enterAction = sameSectEntranceActions.find((action) => action.id.startsWith("sect:enter:"));
  assert.ok(enterAction);
  sectService.executeSectAction(deputyPlayerId, enterAction.id, deps);
  assert.equal(transfers.at(-1).targetInstanceId, entrance.targetInstanceId);

  player.inventory.items[1] = {
    itemId: "sect_entrance_relocation_token",
    name: "迁宗令",
    type: "consumable",
    count: 1,
    useBehavior: "relocate_sect_entrance",
  };
  player.x = 4;
  player.y = 0;
  await useItemService.dispatchUseItem(playerId, 1, deps);
  const relocatedSect = sectService.findSectById(player.sectId);
  assert.equal(player.inventory.items[1].count, 0);
  assert.equal(relocatedSect.entranceInstanceId, publicInstanceId);
  assert.equal(relocatedSect.entranceX, 4);
  assert.equal(relocatedSect.entranceY, 0);
  assert.ok(relocatedSect.entranceRelocationCooldownUntil > Date.now());
  assert.equal(publicInstance.getPortalAtTile(2, 2), null);
  const relocatedEntrance = publicInstance.getPortalAtTile(4, 0);
  assert.equal(relocatedEntrance.kind, "sect_entrance");
  assert.equal(relocatedEntrance.sectId, relocatedSect.sectId);
  assert.equal(relocatedEntrance.targetInstanceId, entrance.targetInstanceId);
  const relocatedCore = sectInstance.getPortalAtTile(0, 0);
  assert.equal(relocatedCore.kind, "sect_core");
  assert.equal(relocatedCore.targetInstanceId, publicInstanceId);
  assert.equal(relocatedCore.targetX, 4);
  assert.equal(relocatedCore.targetY, 0);
  const relocatedGuardian = guardians.find((entry) => entry.id === `formation:sect_guardian:${relocatedSect.sectId}`);
  assert.equal(relocatedGuardian.instanceId, publicInstanceId);
  assert.equal(relocatedGuardian.x, 4);
  assert.equal(relocatedGuardian.y, 0);
  player.inventory.items[2] = {
    itemId: "sect_entrance_relocation_token",
    name: "迁宗令",
    type: "consumable",
    count: 1,
    useBehavior: "relocate_sect_entrance",
  };
  player.x = 4;
  player.y = 1;
  await assert.rejects(() => useItemService.dispatchUseItem(playerId, 2, deps), /宗门迁移冷却尚未结束/);
  assert.equal(player.inventory.items[2].count, 1);
  relocatedSect.entranceRelocationCooldownUntil = 0;

  assert.equal(sectInstance.template.width, 1);
  assert.equal(sectInstance.template.height, 1);
  assert.equal(sectInstance.meta.templateId, `sect_domain:${player.sectId}`);
  assert.equal(sectService.findSectById(player.sectId).coreX, 0);
  assert.equal(sectService.findSectById(player.sectId).coreY, 0);
  assert.equal(sectInstance.tilePlane.getCellCount(), 25);
  const core = sectInstance.getPortalAtTile(0, 0);
  assert.equal(core.kind, "sect_core");
  assert.equal(core.targetInstanceId, publicInstanceId);
  assert.equal(sectService.isSectInnateStabilized(sectInstance.meta.instanceId, 0, 0), true);
  assert.equal(sectService.isSectInnateStabilized(sectInstance.meta.instanceId, 8, 0), true);
  assert.equal(sectInstance.getTileCombatState(-1, -1), null);
  assert.equal(sectInstance.getTileCombatState(2, 0).maxHp, 200000);
  const innerSectStone = sectInstance.damageTile(-2, 0, Number.MAX_SAFE_INTEGER);
  assert.equal(innerSectStone.destroyed, true);
  assert.equal(innerSectStone.sectBoundaryOpened, true);
  assert.equal(sectInstance.getTileCombatState(-2, 0), null);
  assert.equal(sectInstance.getEffectiveTileType(-2, 0), "floor");
  assert.equal(sectInstance.advanceTileRecovery((x, y) => sectService.isSectInnateStabilized(sectInstance.meta.instanceId, x, y)), false);
  assert.equal(sectInstance.getTileCombatState(-2, 0), null);
  const sectRuntimePlayer = sectInstance.connectPlayer({ playerId, sessionId: "session:sect-smoke", preferredX: 0, preferredY: 0 });
  assert.equal(sectRuntimePlayer.x, 0);
  assert.equal(sectRuntimePlayer.y, 0);
  assert.equal(sectInstance.isWalkable(1, 0, playerId), true);
  assert.equal(sectInstance.enqueueMove({ playerId, direction: Direction.East }), true);
  sectInstance.tickOnce();
  assert.equal(sectInstance.getPlayerPosition(playerId).x, 1);
  assert.equal(sectInstance.getPlayerPosition(playerId).y, 0);
  const virtualBoundaryState = sectInstance.getTileCombatState(3, 0);
  assert.equal(virtualBoundaryState.tileType, "stone");
  assert.equal(virtualBoundaryState.destroyed, false);
  assert.equal(virtualBoundaryState.virtualBoundary, true);
  assert.equal(virtualBoundaryState.maxHp, 400000);
  assert.equal(sectInstance.getTileLayerState(3, 0).structure, "stone");
  sectInstance.disconnectPlayer(playerId);
  const coreActions = sectService.buildSectCoreActions({
    playerId,
    self: { x: 0, y: 0 },
    instance: { instanceId: sectInstance.meta.instanceId },
  }, deps);
  assert.ok(coreActions.some((action) => action.id === "sect:manage"));
  assert.ok(!coreActions.some((action) => action.id === "sect:exit"));
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
  assert.ok(resolvedSectInstance);
  assert.equal(resolvedSectInstance.meta.instanceId, sectInstance.meta.instanceId);
  instances.delete(badRealSectInstanceId);

  const edgeX = 2;
  const edgeY = 0;
  const stableSectTemplateId = sectInstance.meta.templateId;
  sectInstance.consumeStaticTileSyncDirtyTiles();
  const destroyedEdge = sectInstance.damageTile(edgeX, edgeY, Number.MAX_SAFE_INTEGER);
  assert.equal(destroyedEdge.destroyed, true);
  assert.equal(sectService.expandSectForDestroyedTile(sectInstance.meta.instanceId, edgeX, edgeY, deps), true);
  const boundaryOpenSyncPlan = sectInstance.consumeStaticTileSyncDirtyTiles();
  assert.ok(boundaryOpenSyncPlan.tileKeys.includes(`${edgeX},${edgeY}`));
  assert.ok(boundaryOpenSyncPlan.tileKeys.includes(`${edgeX + 1},${edgeY}`));
  assert.equal(sectInstance.template.width, 1);
  assert.equal(sectInstance.template.height, 1);
  assert.equal(sectInstance.tilePlane.getCellCount(), 30);
  assert.equal(sectInstance.meta.templateId, stableSectTemplateId);
  assert.equal(sectService.findSectById(player.sectId).mapMaxX, 3);
  assert.equal(sectInstance.isInBounds(edgeX + 1, edgeY), true);
  assert.equal(sectInstance.isWalkable(edgeX, edgeY, playerId), true);
  assert.equal(sectInstance.isWalkable(edgeX + 1, edgeY, playerId), false);
  assert.ok(findOptimalPathOnMap(sectInstance, playerId, 1, 0, [{ x: edgeX, y: edgeY }]));
  const boundaryViewPlayer = sectInstance.connectPlayer({ playerId, sessionId: "session:sect-smoke", preferredX: 1, preferredY: 0 });
  assert.equal(boundaryViewPlayer.x, 1);
  assert.equal(boundaryViewPlayer.y, 0);
  const sectBoundaryView = sectInstance.buildPlayerView(playerId, 3);
  assert.ok(sectBoundaryView.visibleTileKeys.includes("3,0"));
  const sectSnapshotService = new WorldSyncMapSnapshotService({
    getInstanceTileState(instanceId, x, y) {
      const instance = instances.get(instanceId);
      if (!instance) return null;
      const aura = instance.getTileAura(x, y);
      if (aura === null) return null;
      return {
        tileType: instance.getEffectiveTileType(x, y),
        walkable: instance.isWalkable(x, y, null),
        blocksSight: instance.isTileSightBlocked(x, y),
        layers: instance.getTileLayerState(x, y),
        aura,
        resources: instance.listTileResources(x, y) ?? [],
        safeZone: instance.getSafeZoneAtTile(x, y),
        container: instance.getContainerAtTile(x, y),
        groundPile: instance.getTileGroundPile(x, y),
        combat: instance.getTileCombatState(x, y),
      };
    },
  }, playerRuntimeService, templateRepository, {
    getMapTimeConfig() { return null; },
    getMapTickSpeed() { return null; },
  }, {
    buildMinimapSnapshotSync() { return null; },
  });
  const fullHpBoundaryTile = sectSnapshotService.buildTileSyncState(sectInstance.template, sectInstance.meta.instanceId, edgeX + 1, edgeY, player);
  assert.equal(fullHpBoundaryTile.type, "stone");
  assert.equal(fullHpBoundaryTile.maxHp, undefined);
  assert.equal(fullHpBoundaryTile.hpVisible, undefined);
  sectInstance.disconnectPlayer(playerId);
  const damagedBoundary = sectInstance.damageTile(edgeX + 1, edgeY, 1);
  assert.equal(damagedBoundary.destroyed, false);
  assert.equal(sectInstance.template.width, 1);
  assert.equal(sectInstance.template.height, 1);
  assert.equal(sectInstance.isInBounds(edgeX + 1, edgeY), true);
  assert.equal(sectInstance.getTileLayerState(edgeX + 1, edgeY).terrain, "grass");
  assert.equal(sectInstance.getTileLayerState(edgeX + 1, edgeY).surface, "floor");
  assert.equal(sectInstance.getTileLayerState(edgeX + 1, edgeY).structure, "stone");
  assert.equal(sectInstance.isWalkable(edgeX + 1, edgeY, playerId), false);
  assert.equal(sectInstance.tilePlane.getCellCount(), 30);
  assert.equal(sectInstance.getTileCombatState(edgeX + 1, edgeY).hp, damagedBoundary.maxHp - 1);
  const damagedBoundaryTile = sectSnapshotService.buildTileSyncState(sectInstance.template, sectInstance.meta.instanceId, edgeX + 1, edgeY, player);
  assert.equal(damagedBoundaryTile.hpVisible, true);
  assert.equal(sectInstance.advanceTileRecovery((x, y) => sectService.isSectInnateStabilized(sectInstance.meta.instanceId, x, y)), true);
  assert.equal(sectInstance.getTileCombatState(edgeX + 1, edgeY).hp, damagedBoundary.maxHp);
  const destroyed = sectInstance.damageTile(edgeX + 1, edgeY, Number.MAX_SAFE_INTEGER);
  assert.equal(destroyed.destroyed, true);
  assert.equal(destroyed.sectBoundaryOpened, true);
  assert.equal(sectInstance.getTileCombatState(edgeX + 1, edgeY), null);
  assert.equal(sectInstance.getEffectiveTileType(edgeX + 1, edgeY), "floor");
  assert.equal(sectInstance.getTileLayerState(edgeX + 1, edgeY).structure, null);
  const openedBoundaryTile = sectSnapshotService.buildTileSyncState(sectInstance.template, sectInstance.meta.instanceId, edgeX + 1, edgeY, player);
  assert.equal(openedBoundaryTile.type, "floor");
  assert.equal(sectInstance.getTileLayerState(edgeX + 1, edgeY).terrain, "grass");
  assert.equal(sectInstance.getTileLayerState(edgeX + 1, edgeY).surface, "floor");
  assert.equal(sectInstance.getTileLayerState(edgeX + 1, edgeY).structure, null);
  assert.equal(sectInstance.isWalkable(edgeX + 1, edgeY, playerId), true);
  assert.equal(sectInstance.isTileSightBlocked(edgeX + 1, edgeY), false);
  const sectDetailService = new WorldRuntimeDetailQueryService(contentTemplateRepository, templateRepository, playerRuntimeService);
  const openedBoundaryDetail = sectDetailService.buildTileDetail({
    view: {
      self: { x: 1, y: 0 },
      visibleTileKeys: [`${edgeX + 1},${edgeY}`],
      localNpcs: [],
      localMonsters: [],
      visiblePlayers: [],
      localPortals: [],
      localGroundPiles: [],
    },
    viewer: {
      ...player,
      attrs: {
        numericStats: { viewRange: 8 },
        finalAttrs: { spirit: 100 },
      },
    },
    location: { instanceId: sectInstance.meta.instanceId },
    instance: sectInstance,
  }, { x: edgeX + 1, y: edgeY });
  assert.equal(openedBoundaryDetail.type, "floor");
  assert.equal(openedBoundaryDetail.terrainType, "grass");
  assert.equal(openedBoundaryDetail.surfaceType, "floor");
  assert.equal(openedBoundaryDetail.structureType, null);
  assert.equal(openedBoundaryDetail.walkable, true);
  assert.equal(sectService.expandSectForDestroyedTile(sectInstance.meta.instanceId, edgeX + 1, edgeY, deps), true);
  assert.equal(sectInstance.template.width, 1);
  assert.equal(sectInstance.template.height, 1);
  assert.equal(sectInstance.meta.templateId, stableSectTemplateId);
  assert.equal(sectInstance.tilePlane.getCellCount(), 35);
  assert.equal(sectService.findSectById(player.sectId).mapMaxX, 4);
  assert.equal(sectInstance.isInBounds(edgeX + 2, edgeY), true);
  assert.equal(sectInstance.isWalkable(edgeX + 1, edgeY, playerId), true);
  assert.equal(sectInstance.isWalkable(edgeX + 2, edgeY, playerId), false);
  assert.ok(findOptimalPathOnMap(sectInstance, playerId, 1, 0, [{ x: edgeX + 1, y: edgeY }]));
  const expandedSectAfterBoundaryOpen = sectService.findSectById(player.sectId);
  const expandedCoreActions = sectService.buildSectCoreActions({
    playerId,
    self: { x: expandedSectAfterBoundaryOpen.coreX, y: expandedSectAfterBoundaryOpen.coreY },
    instance: { instanceId: sectInstance.meta.instanceId },
  }, deps);
  assert.match(expandedCoreActions.find((action) => action.id === "sect:manage").desc, /地域\s+35格/);
  const dynamicRuntimeTileEntries = sectInstance.buildRuntimeTilePersistenceEntries();
  const dynamicTileDamageEntries = sectInstance.buildTileDamagePersistenceEntries();
  assert.equal(dynamicRuntimeTileEntries.length, 34);
  assert.equal(dynamicRuntimeTileEntries.some((entry) => entry.x === edgeX + 1 && entry.y === edgeY && entry.tileType === "floor"), true);
  assert.equal(dynamicTileDamageEntries.some((entry) => entry.x === edgeX + 1 && entry.y === edgeY && entry.destroyed === true), false);
  const rehydratedSectInstance = new MapInstanceRuntime({
    instanceId: `${sectInstance.meta.instanceId}:rehydrated`,
    template: sectInstance.template,
    monsterSpawns: [],
    kind: "sect",
    persistent: true,
    createdAt: Date.now(),
    displayName: "宗门重启恢复测试",
    linePreset: "peaceful",
    lineIndex: 1,
    instanceOrigin: "sect",
    defaultEntry: false,
    canDamageTile: true,
  });
  rehydratedSectInstance.hydrateRuntimeTiles([...dynamicRuntimeTileEntries].reverse());
  rehydratedSectInstance.hydrateTileDamage(dynamicTileDamageEntries);
  assert.equal(rehydratedSectInstance.getTileCombatState(edgeX + 1, edgeY), null);
  assert.equal(rehydratedSectInstance.getEffectiveTileType(edgeX + 1, edgeY), "floor");
  assert.equal(rehydratedSectInstance.getTileLayerState(edgeX + 1, edgeY).terrain, "grass");
  assert.equal(rehydratedSectInstance.getTileLayerState(edgeX + 1, edgeY).surface, "floor");
  assert.equal(rehydratedSectInstance.getTileLayerState(edgeX + 1, edgeY).structure, null);
  const legacyDirtySectInstance = new MapInstanceRuntime({
    instanceId: `${sectInstance.meta.instanceId}:legacy-dirty`,
    template: sectInstance.template,
    monsterSpawns: [],
    kind: "sect",
    persistent: true,
    createdAt: Date.now(),
    displayName: "宗门旧脏数据恢复测试",
    linePreset: "peaceful",
    lineIndex: 1,
    instanceOrigin: "sect",
    defaultEntry: false,
    canDamageTile: true,
  });
  legacyDirtySectInstance.hydrateRuntimeTiles([{
    x: edgeX + 1,
    y: edgeY,
    tileType: "floor",
    terrainType: "stone_ground",
    surfaceType: null,
    structureType: null,
    interactableKinds: [],
  }]);
  assert.equal(legacyDirtySectInstance.getEffectiveTileType(edgeX + 1, edgeY), "floor");
  assert.equal(legacyDirtySectInstance.getTileLayerState(edgeX + 1, edgeY).terrain, "grass");
  assert.equal(legacyDirtySectInstance.getTileLayerState(edgeX + 1, edgeY).surface, "floor");
  assert.equal(legacyDirtySectInstance.getTileLayerState(edgeX + 1, edgeY).structure, null);
  const repairedLegacyRuntimeTileEntries = legacyDirtySectInstance.buildRuntimeTilePersistenceEntries();
  assert.equal(repairedLegacyRuntimeTileEntries[0].tileType, "floor");
  assert.equal(repairedLegacyRuntimeTileEntries[0].terrainType, "grass");
  assert.equal(repairedLegacyRuntimeTileEntries[0].surfaceType, "floor");
  assert.equal(repairedLegacyRuntimeTileEntries[0].structureType, null);
  const legacyStoneGroundSectInstance = new MapInstanceRuntime({
    instanceId: `${sectInstance.meta.instanceId}:legacy-stone-ground`,
    template: sectInstance.template,
    monsterSpawns: [],
    kind: "sect",
    persistent: true,
    createdAt: Date.now(),
    displayName: "宗门旧石地恢复测试",
    linePreset: "peaceful",
    lineIndex: 1,
    instanceOrigin: "sect",
    defaultEntry: false,
    canDamageTile: true,
  });
  legacyStoneGroundSectInstance.hydrateRuntimeTiles([{
    x: 10,
    y: 4,
    tileType: "stone",
    terrainType: "stone_ground",
    surfaceType: null,
    structureType: null,
    interactableKinds: [],
  }]);
  assert.equal(legacyStoneGroundSectInstance.getEffectiveTileType(10, 4), "floor");
  assert.equal(legacyStoneGroundSectInstance.getTileLayerState(10, 4).terrain, "grass");
  assert.equal(legacyStoneGroundSectInstance.getTileLayerState(10, 4).surface, "floor");
  assert.equal(legacyStoneGroundSectInstance.getTileLayerState(10, 4).structure, null);
  const repairedLegacyStoneGroundEntries = legacyStoneGroundSectInstance.buildRuntimeTilePersistenceEntries();
  assert.equal(repairedLegacyStoneGroundEntries[0].tileType, "floor");
  assert.equal(repairedLegacyStoneGroundEntries[0].terrainType, "grass");
  assert.equal(repairedLegacyStoneGroundEntries[0].surfaceType, "floor");
  assert.equal(repairedLegacyStoneGroundEntries[0].structureType, null);
  const secondBoundaryStone = sectInstance.damageTile(edgeX + 2, edgeY, Number.MAX_SAFE_INTEGER);
  assert.equal(secondBoundaryStone.destroyed, true);
  assert.equal(sectService.expandSectForDestroyedTile(sectInstance.meta.instanceId, edgeX + 2, edgeY, deps), true);
  assert.equal(sectInstance.getTileCombatState(edgeX + 3, edgeY).virtualBoundary, undefined);
  assert.equal(sectInstance.getTileCombatState(edgeX + 3, edgeY).tileType, "stone");
  assert.equal(sectInstance.template.width, 1);
  assert.equal(sectInstance.template.height, 1);
  assert.equal(sectInstance.tilePlane.getCellCount(), 40);
  assert.equal(sectInstance.meta.templateId, stableSectTemplateId);
  const expandedSect = sectService.findSectById(player.sectId);
  assert.equal(sectService.expandSect(expandedSect, deps), true);
  assert.equal(sectInstance.template.width, 1);
  assert.equal(sectInstance.template.height, 1);
  assert.equal(sectInstance.tilePlane.getCellCount(), 504);
  assert.equal(sectInstance.meta.templateId, stableSectTemplateId);
  assert.equal(expandedSect.coreX, 0);
  assert.equal(expandedSect.coreY, 0);
  assert.equal(expandedSect.mapMinX, -10);
  assert.equal(expandedSect.mapMaxX, 13);
  assert.equal(expandedSect.mapMinY, -10);
  assert.equal(expandedSect.mapMaxY, 10);
  assert.equal(sectInstance.isInBounds(expandedSect.coreX + 9, expandedSect.coreY), true);

  expandedSect.members.push(
    { playerId: elderPlayerId, name: "长老", roleId: "elder", joinedAt: Date.now() },
    { playerId: laborPlayerId, name: "杂役", roleId: "labor", joinedAt: Date.now() },
    { playerId: offlinePlayerId, name: "离线道友", roleId: "outer", joinedAt: Date.now() },
  );
  elderPlayer.sectId = expandedSect.sectId;
  laborPlayer.sectId = expandedSect.sectId;
  const memberCoreActions = sectService.buildSectCoreActions({
    playerId: deputyPlayerId,
    self: { x: expandedSect.coreX, y: expandedSect.coreY },
    instance: { instanceId: sectInstance.meta.instanceId },
  }, deps);
  assert.ok(memberCoreActions.some((action) => action.id === "sect:manage"));
  assert.ok(memberCoreActions.some((action) => action.id === "sect:guardian:maintain"));
  const memberManageDesc = memberCoreActions.find((action) => action.id === "sect:manage").desc;
  assert.match(memberManageDesc, /@@sect:/);
  const memberManageData = decodeURIComponent(/@@sect:(.*)@@/.exec(memberManageDesc)?.[1] ?? "");
  assert.match(memberManageData, /"statusLabel":"在线"/);
  assert.match(memberManageData, /"statusLabel":"离线挂机"/);
  assert.match(memberManageData, /"statusLabel":"离线"/);
  assert.match(memberManageData, /"realmLv":7/);
  assert.match(memberManageData, /"realmLv":6/);
  assert.throws(() => sectService.executeSectAction(deputyPlayerId, "sect:guardian:toggle", deps), /当前职位没有该宗门权限/);
  assert.throws(() => sectService.executeSectAction(laborPlayerId, "sect:guardian:toggle", deps), /当前职位没有该宗门权限/);
  assert.throws(() => sectService.dispatchRelocateSectEntrance(laborPlayerId, 0, {
    itemId: "sect_entrance_relocation_token",
    name: "迁宗令",
  }, deps), /只有宗主或副宗主/);
  const laborCoreActions = sectService.buildSectCoreActions({
    playerId: laborPlayerId,
    self: { x: expandedSect.coreX, y: expandedSect.coreY },
    instance: { instanceId: sectInstance.meta.instanceId },
  }, deps);
  const laborMaintainAction = laborCoreActions.find((action) => action.id === "sect:guardian:maintain");
  assert.ok(laborMaintainAction);
  assert.match(laborMaintainAction.desc, /当前大阵灵力\s+10万/);
  sectService.executeSectAction(laborPlayerId, "sect:guardian:maintain", deps);
  assert.equal(pendingCommands.length, 0);
  assert.equal(laborPlayer.formationJob?.formationInstanceId, `formation:sect_guardian:${expandedSect.sectId}`);
  assert.equal(craftMutationFlushes.at(-1)?.playerId, laborPlayerId);
  assert.equal(craftMutationFlushes.at(-1)?.panel, "formation");
  assert.equal(notices.at(-1)?.structured?.key, "notice.craft.formation.start");
  const laborTaskList = buildTechniqueActivityTaskListView(laborPlayer).tasks;
  assert.ok(laborTaskList.some((task) => task.kind === "formation" && task.state === "running" && task.label === "护宗大阵"));
  const laborMaintainingCoreActions = sectService.buildSectCoreActions({
    playerId: laborPlayerId,
    self: { x: expandedSect.coreX, y: expandedSect.coreY },
    instance: { instanceId: sectInstance.meta.instanceId },
  }, deps);
  const laborCancelAction = laborMaintainingCoreActions.find((action) => action.id === "sect:guardian:cancel_maintain");
  assert.ok(laborCancelAction);
  assert.match(laborCancelAction.desc, /当前大阵灵力\s+10万/);
  sectService.executeSectAction(laborPlayerId, "sect:guardian:cancel_maintain", deps);
  assert.equal(pendingCommands.length, 0);
  assert.equal(laborPlayer.formationJob, null);
  assert.equal(notices.at(-1)?.structured?.key, "notice.craft.formation.stopped");
  sectService.executeSectAction(playerId, `sect:member:role:${encodeURIComponent(deputyPlayerId)}:deputy`, deps);
  assert.equal(expandedSect.members.find((entry) => entry.playerId === deputyPlayerId).roleId, "deputy");
  sectService.executeSectAction(deputyPlayerId, "sect:guardian:toggle", deps);
  assert.equal(guardians.find((entry) => entry.id === `formation:sect_guardian:${expandedSect.sectId}`).active, false);
  sectService.executeSectAction(deputyPlayerId, "sect:guardian:maintain", deps);
  const deputyMaintainingCoreActions = sectService.buildSectCoreActions({
    playerId: deputyPlayerId,
    self: { x: expandedSect.coreX, y: expandedSect.coreY },
    instance: { instanceId: sectInstance.meta.instanceId },
  }, deps);
  assert.ok(deputyMaintainingCoreActions.some((action) => action.id === "sect:guardian:cancel_maintain"));
  sectService.executeSectAction(deputyPlayerId, "sect:guardian:cancel_maintain", deps);
  assert.equal(deputyPlayer.formationJob, null);
  assert.throws(() => sectService.executeSectAction(playerId, `sect:member:role:${encodeURIComponent(elderPlayerId)}:supreme_elder`, deps), /太上长老暂时无法任命/);
  sectService.executeSectAction(playerId, `sect:member:remove:${encodeURIComponent(elderPlayerId)}`, deps);
  assert.equal(expandedSect.members.some((entry) => entry.playerId === elderPlayerId), false);
  assert.equal(elderPlayer.sectId, null);
  sectService.executeSectAction(laborPlayerId, "sect:leave", deps);
  assert.equal(laborPlayer.sectId, null);
  assert.equal(expandedSect.members.some((entry) => entry.playerId === laborPlayerId), false);
  assert.equal(sectService.playerSectId.has(laborPlayerId), false);
  sectService.executeSectAction(playerId, `sect:permission:toggle:elder:member_remove`, deps);
  assert.equal(expandedSect.rolePermissions.elder.member_remove, true);
  sectService.executeSectAction(playerId, `sect:transfer:${encodeURIComponent(deputyPlayerId)}`, deps);
  assert.equal(expandedSect.leaderPlayerId, deputyPlayerId);
  assert.equal(expandedSect.members.find((entry) => entry.playerId === deputyPlayerId).roleId, "leader");
  assert.equal(expandedSect.members.find((entry) => entry.playerId === playerId).roleId, "deputy");
  sectService.executeSectAction(deputyPlayerId, "sect:dissolve", deps);
  assert.equal(sectService.findSectById(expandedSect.sectId), null);
  assert.equal(player.sectId, null);
  assert.equal(deputyPlayer.sectId, null);

  console.log("world-runtime-sect-smoke passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
