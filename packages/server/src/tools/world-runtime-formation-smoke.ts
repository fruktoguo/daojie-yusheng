// @ts-nocheck
"use strict";

/**
 * 用途：证明布阵会在 tick 执行路径内留下 runtime 阵法实体，并进入世界投影。
 */

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require("node:assert/strict");
const { Pool } = require("pg");
const { resolveServerDatabaseUrl } = require("../config/env-alias");
const { WorldRuntimeFormationService } = require("../runtime/world/world-runtime-formation.service");
const { buildFullWorldDelta } = require("../network/world-projector.helpers");
const { FORMATION_TICKS_PER_DAY, QI_HALF_LIFE_RATE_SCALE, buildQiHalfLifeRateScaled } = require("@mud/shared");

const playerId = "player:formation-smoke";
const sectPlayerId = "player:formation-sect-member";
const outsiderPlayerId = "player:formation-outsider";
const detachedOwnerPlayerId = "player:formation-owner-detached";
const instanceId = "real:formation_smoke";

async function main() {
  const notices = [];
  const player = {
    playerId,
    sectId: "sect:smoke",
    qi: 20000,
    inventory: {
      items: [
        {
          itemId: "formation_disk.mystic",
          name: "玄阶阵盘",
          count: 2,
          formationDiskTier: "mystic",
          formationDiskMultiplier: 4,
        },
      ],
    },
    wallet: {
      spirit_stone: 1000,
    },
  };
  const tileResources = new Map();
  const instance = {
    meta: { instanceId, kind: "public", linePreset: "real" },
    template: { width: 16, height: 16 },
    worldRevision: 10,
    getPlayerPosition(targetPlayerId) {
      assert.equal(targetPlayerId, playerId);
      return { x: 4, y: 5 };
    },
    getTileResource(resourceKey, x, y) {
      return tileResources.get(`${resourceKey}:${x},${y}`) ?? 0;
    },
    addTileResource(resourceKey, x, y, value) {
      const key = `${resourceKey}:${x},${y}`;
      tileResources.set(key, (tileResources.get(key) ?? 0) + value);
    },
  };
  const playerRuntimeService = {
    getPlayerOrThrow(targetPlayerId) {
      if (targetPlayerId === playerId || targetPlayerId === sectPlayerId) {
        return player;
      }
      if (targetPlayerId === outsiderPlayerId) {
        return { playerId: outsiderPlayerId, sectId: "sect:outsider" };
      }
      throw new Error(`unknown player ${targetPlayerId}`);
    },
    spendQi(targetPlayerId, amount) {
      assert.equal(targetPlayerId, playerId);
      player.qi -= amount;
    },
    canAffordWallet(targetPlayerId, itemId, count) {
      assert.equal(targetPlayerId, playerId);
      return (player.wallet[itemId] ?? 0) >= count;
    },
    debitWallet(targetPlayerId, itemId, count) {
      assert.equal(targetPlayerId, playerId);
      player.wallet[itemId] = (player.wallet[itemId] ?? 0) - count;
    },
    consumeInventoryItem(targetPlayerId, slotIndex, count) {
      assert.equal(targetPlayerId, playerId);
      player.inventory.items[slotIndex].count -= count;
    },
    enqueueNotice(targetPlayerId, notice) {
      notices.push({ targetPlayerId, ...notice });
    },
  };
  const service = new WorldRuntimeFormationService(
    { getFormationTemplate: () => null },
    playerRuntimeService,
  );
  service.ensurePersistencePool = async () => null;
  const deps = {
    getPlayerLocationOrThrow(targetPlayerId) {
      assert.equal(targetPlayerId, playerId);
      return { instanceId, sessionId: "session:formation-smoke" };
    },
    getInstanceRuntime(targetInstanceId) {
      return targetInstanceId === instanceId ? instance : null;
    },
    refreshPlayerContextActions(targetPlayerId) {
      assert.ok([playerId, detachedOwnerPlayerId, outsiderPlayerId].includes(targetPlayerId));
      deps.contextActionsRefreshed = true;
    },
    contextActionsRefreshed: false,
  };

  const virtualInstance = {
    ...instance,
    meta: { instanceId: "public:formation_smoke", kind: "public", linePreset: "peaceful" },
  };
  assert.throws(() => service.dispatchCreateFormation(playerId, {
    slotIndex: 0,
    formationId: "spirit_gathering",
    spiritStoneCount: 100,
    allocation: { effectPercent: 80, rangePercent: 10, durationPercent: 10 },
  }, {
    ...deps,
    getPlayerLocationOrThrow(targetPlayerId) {
      assert.equal(targetPlayerId, playerId);
      return { instanceId: "public:formation_smoke", sessionId: "session:formation-smoke" };
    },
    getInstanceRuntime(targetInstanceId) {
      return targetInstanceId === "public:formation_smoke" ? virtualInstance : null;
    },
  }), /虚境不能布置阵法/);
  assert.equal(player.qi, 20000);
  assert.equal(player.wallet.spirit_stone, 1000);
  assert.equal(player.inventory.items[0].count, 2);

  assert.throws(() => service.dispatchCreateFormation(playerId, {
    slotIndex: 0,
    formationId: "spirit_gathering",
    spiritStoneCount: 99,
    qiCost: 1,
    allocation: { effectPercent: 80, rangePercent: 10, durationPercent: 10 },
  }, deps), /至少需要投入 100 灵石/);
  assert.equal(player.qi, 20000);
  assert.equal(player.wallet.spirit_stone, 1000);
  assert.equal(player.inventory.items[0].count, 2);
  assert.throws(() => service.dispatchCreateFormation(playerId, {
    slotIndex: 0,
    formationId: "sect_guardian_barrier",
    spiritStoneCount: 1,
    qiCost: 1,
    allocation: { effectPercent: 33, rangePercent: 33, durationPercent: 33 },
  }, deps), /不能通过阵盘布置/);

  const formation = service.dispatchCreateFormation(playerId, {
    slotIndex: 0,
    formationId: "spirit_gathering",
    spiritStoneCount: 100,
    qiCost: 1,
    allocation: { effectPercent: 80, rangePercent: 10, durationPercent: 10 },
  }, deps);

  assert.equal(player.qi, 10000);
  assert.equal(player.wallet.spirit_stone, 900);
  assert.equal(player.inventory.items[0].count, 1);
  assert.equal(formation.qiCost, 10000);
  assert.equal(instance.worldRevision, 11);
  assert.equal(deps.contextActionsRefreshed, true);
  assert.equal(notices.at(-1)?.kind, "success");

  const runtimeFormations = service.listRuntimeFormations(instanceId);
  assert.equal(runtimeFormations.length, 1);
  assert.equal(runtimeFormations[0].id, formation.id);
  assert.equal(runtimeFormations[0].x, 4);
  assert.equal(runtimeFormations[0].y, 5);
  assert.equal(runtimeFormations[0].radius, 2);
  assert.equal(runtimeFormations[0].rangeShape, "circle");
  assert.equal(runtimeFormations[0].char, "◎");
  assert.equal(runtimeFormations[0].color, "#4da3ff");
  assert.equal(runtimeFormations[0].rangeHighlightColor, "#3b82f6");
  assert.equal(runtimeFormations[0].showText, true);
  assert.equal(runtimeFormations[0].damagePerAura, 100);

  const ownedAtEye = service.listOwnedFormationsAt(instanceId, playerId, 4, 5);
  assert.equal(ownedAtEye.length, 1);
  assert.equal(ownedAtEye[0].id, formation.id);
  assert.equal(ownedAtEye[0].refillSpiritStoneCount, 100);
  assert.equal(ownedAtEye[0].refillQiCost, 10000);
  assert.equal(ownedAtEye[0].refillAuraBudget, 40000);

  const worldDelta = buildFullWorldDelta({
    tick: 1,
    worldRevision: instance.worldRevision,
    selfRevision: 1,
    playerId,
    instance: { instanceId, templateId: "formation_smoke" },
    self: { x: 4, y: 5, name: "阵法测试", displayName: "阵" },
    visiblePlayers: [
      { playerId: "player:visible", name: "凌梦雨", displayName: "凌", x: 5, y: 5 },
      { playerId: "player:legacy-placeholder", name: "旧档修士", displayName: "@", x: 6, y: 5 },
      { playerId: "p_28be0b16-0f11-4583-a397-bb7741016e75_1773932128803", name: "p_28be0b16-0f11-4583-a397-bb7741016e75_1773932128803", displayName: "p_28be0b16-0f11-4583-a397-bb7741016e75_1773932128803", x: 7, y: 5 },
    ],
    localNpcs: [],
    localMonsters: [],
    localPortals: [],
    localGroundPiles: [],
    localContainers: [],
    localFormations: runtimeFormations,
  });
  const selfProjection = worldDelta.p.find((entry) => entry.id === playerId);
  const visibleProjection = worldDelta.p.find((entry) => entry.id === "player:visible");
  const legacyProjection = worldDelta.p.find((entry) => entry.id === "player:legacy-placeholder");
  const idOnlyProjection = worldDelta.p.find((entry) => entry.id === "p_28be0b16-0f11-4583-a397-bb7741016e75_1773932128803");
  assert.equal(selfProjection.n, "阵法测试");
  assert.equal(selfProjection.ch, "阵");
  assert.equal(visibleProjection.n, "凌梦雨");
  assert.equal(visibleProjection.ch, "凌");
  assert.equal(legacyProjection.n, "旧档修士");
  assert.equal(legacyProjection.ch, "旧");
  assert.equal(idOnlyProjection.n, "修士");
  assert.equal(idOnlyProjection.ch, "人");
  assert.equal(worldDelta.fmn?.length, 1);
  assert.equal(worldDelta.fmn[0].id, formation.id);
  assert.equal(worldDelta.fmn[0].ch, "◎");
  assert.equal(worldDelta.fmn[0].c, "#4da3ff");
  assert.equal(worldDelta.fmn[0].rs, 2);
  assert.equal(worldDelta.fmn[0].sh, "circle");
  assert.equal(worldDelta.fmn[0].hl, "#3b82f6");
  assert.equal(worldDelta.fmn[0].os, "sect:smoke");
  assert.equal(worldDelta.fmn[0].op, playerId);
  assert.equal(worldDelta.fmn[0].tx, 1);
  assert.equal(worldDelta.fmn[0].bd, 0);
  assert.equal(worldDelta.fmn[0].lt, 0);

  service.advanceInstanceFormations(instance, 2, deps);
  assert.equal(service.listRuntimeFormations(instanceId).length, 1);
  assert.ok(tileResources.size > 0);
  const auraBeforeRefill = service.getFormationCombatState(instanceId, formation.id).remainingAuraBudget;
  service.dispatchRefillFormation(playerId, {
    formationInstanceId: formation.id,
    spiritStoneCount: 1,
    qiCost: 1,
  }, deps);
  assert.equal(player.qi, 0);
  assert.equal(player.wallet.spirit_stone, 800);
  assert.equal(Math.round(service.getFormationCombatState(instanceId, formation.id).remainingAuraBudget - auraBeforeRefill), 40000);

  player.qi = 200000;
  player.wallet.spirit_stone = 2000;
  const earthFormation = service.dispatchCreateFormation(playerId, {
    slotIndex: 0,
    formationId: "earth_stabilizing",
    spiritStoneCount: 1000,
    qiCost: 1,
    allocation: { effectPercent: 80, rangePercent: 10, durationPercent: 10 },
  }, deps);
  assert.equal(earthFormation.stats.effectValue, 320000);
  assert.equal(service.isTerrainStabilized(instanceId, 4, 5), true);
  const reduction = service.resolveTerrainDamageReduction(instanceId, 4, 5);
  assert.ok(Math.abs(reduction - (320000 / 420000)) < 0.000001);
  assert.equal(Math.round(service.mitigateTerrainDamage(instanceId, 4, 5, 1000)), 238);
  assert.equal(service.mitigateTerrainDamage(instanceId, 15, 15, 1000), 1000);
  const beforeDamageState = service.getFormationCombatState(instanceId, earthFormation.id);
  assert.equal(beforeDamageState.damagePerAura, 100);
  assert.equal(beforeDamageState.remainingAuraBudget, 400000);
  const damageResult = service.applyDamageToFormation(instanceId, earthFormation.id, 25000, playerId, deps);
  assert.equal(damageResult.destroyed, false);
  assert.equal(damageResult.auraDamage, 250);
  assert.equal(damageResult.appliedDamage, 25000);
  assert.equal(service.getFormationCombatState(instanceId, earthFormation.id).remainingAuraBudget, 399750);
  const destroyResult = service.applyDamageToFormation(instanceId, earthFormation.id, 999999999999, playerId, deps);
  assert.equal(destroyResult.destroyed, true);
  assert.equal(service.getFormationCombatState(instanceId, earthFormation.id), null);
  assert.equal(service.isTerrainStabilized(instanceId, 4, 5), false);

  player.inventory.items[0].count = 1;
  const barrierFormation = service.dispatchCreateFormation(playerId, {
    slotIndex: 0,
    formationId: "warding_barrier",
    spiritStoneCount: 100,
    qiCost: 1,
    allocation: { effectPercent: 10, rangePercent: 80, durationPercent: 10 },
  }, deps);
  assert.equal(barrierFormation.stats.totalAuraBudget, 40000);
  assert.equal(barrierFormation.stats.radius >= 1, true);
  const boundaryX = 4 + barrierFormation.stats.radius;
  const boundaryY = 5;
  assert.equal(service.isBoundaryBarrierBlocked(instanceId, boundaryX, boundaryY), true);
  assert.equal(service.isBoundaryBarrierBlocked(instanceId, 4, 5), false);
  const boundaryState = service.getBoundaryBarrierCombatState(instanceId, boundaryX, boundaryY);
  assert.equal(boundaryState.formationId, barrierFormation.id);
  assert.equal(boundaryState.damagePerAura, 100);
  const barrierDelta = buildFullWorldDelta({
    tick: 2,
    worldRevision: instance.worldRevision,
    selfRevision: 1,
    playerId,
    instance: { instanceId, templateId: "formation_smoke" },
    self: { x: 4, y: 5, name: "阵法测试", displayName: "阵" },
    visiblePlayers: [],
    localNpcs: [],
    localMonsters: [],
    localPortals: [],
    localGroundPiles: [],
    localContainers: [],
    localFormations: service.listRuntimeFormations(instanceId),
  });
  const projectedBarrier = barrierDelta.fmn.find((entry) => entry.id === barrierFormation.id);
  assert.equal(projectedBarrier.bd, 1);
  assert.equal(projectedBarrier.sh, "square");
  assert.equal(projectedBarrier.n, "太玄封界阵");
  assert.equal(projectedBarrier.ch, "玄");
  assert.equal(projectedBarrier.bch, "封");
  assert.equal(projectedBarrier.bc, "#67e8f9");
  assert.equal(projectedBarrier.bhl, "#22d3ee");
  assert.equal(projectedBarrier.ev, 0);
  assert.equal(projectedBarrier.rv, 0);
  assert.equal(projectedBarrier.bv, 1);
  assert.equal(projectedBarrier.os, "sect:smoke");
  assert.equal(projectedBarrier.op, playerId);
  service.dispatchSetFormationActive(playerId, {
    formationInstanceId: barrierFormation.id,
    active: false,
  }, deps);
  assert.equal(service.isBoundaryBarrierBlocked(instanceId, boundaryX, boundaryY), false);
  const inactiveBarrierDelta = buildFullWorldDelta({
    tick: 3,
    worldRevision: instance.worldRevision,
    selfRevision: 1,
    playerId,
    instance: { instanceId, templateId: "formation_smoke" },
    self: { x: 4, y: 5, name: "阵法测试", displayName: "阵" },
    visiblePlayers: [],
    localNpcs: [],
    localMonsters: [],
    localPortals: [],
    localGroundPiles: [],
    localContainers: [],
    localFormations: service.listRuntimeFormations(instanceId),
  });
  const inactiveProjectedBarrier = inactiveBarrierDelta.fmn.find((entry) => entry.id === barrierFormation.id);
  assert.equal(inactiveProjectedBarrier.ac, 0);
  assert.equal(inactiveProjectedBarrier.bv, 1);
  service.dispatchSetFormationActive(playerId, {
    formationInstanceId: barrierFormation.id,
    active: true,
  }, deps);
  assert.equal(service.isBoundaryBarrierBlocked(instanceId, boundaryX, boundaryY), true);
  const beforeBoundaryDamage = service.getFormationCombatState(instanceId, barrierFormation.id).remainingAuraBudget;
  const boundaryDamageResult = service.applyDamageToBoundaryBarrier(instanceId, boundaryX, boundaryY, 25000, playerId, deps);
  const expectedBoundaryReduction = barrierFormation.stats.effectValue / (barrierFormation.stats.effectValue + 100000);
  const expectedBoundaryAuraDamage = 25000 * (1 - expectedBoundaryReduction) / 100;
  assert.equal(boundaryDamageResult.destroyed, false);
  assert.ok(Math.abs(boundaryDamageResult.selfDamageReduction - expectedBoundaryReduction) < 0.000001);
  assert.ok(Math.abs(boundaryDamageResult.auraDamage - expectedBoundaryAuraDamage) < 0.000001);
  assert.ok(Math.abs(service.getFormationCombatState(instanceId, barrierFormation.id).remainingAuraBudget - (beforeBoundaryDamage - expectedBoundaryAuraDamage)) < 0.000001);
  service.applyDamageToBoundaryBarrier(instanceId, boundaryX, boundaryY, 999999999999, playerId, deps);
  assert.equal(service.getFormationCombatState(instanceId, barrierFormation.id), null);
  assert.equal(service.isBoundaryBarrierBlocked(instanceId, boundaryX, boundaryY), false);

  const guardian = service.upsertSectGuardianFormation({
    instanceId,
    x: 8,
    y: 8,
    ownerSectId: "sect:smoke",
    ownerPlayerId: detachedOwnerPlayerId,
    eyeInstanceId: "sect:smoke:inner",
    eyeX: 3,
    eyeY: 4,
    radius: 1,
    remainingAuraBudget: 100000,
    active: true,
  }, deps);
  assert.equal(guardian.formationId, "sect_guardian_barrier");
  assert.equal(guardian.spiritStoneCount, 1000);
  assert.equal(guardian.ownerSectId, "sect:smoke");
  assert.equal(guardian.eyeInstanceId, "sect:smoke:inner");
  assert.equal(guardian.eyeX, 3);
  assert.equal(guardian.eyeY, 4);
  assert.equal(guardian.stats.radius, 1);
  const restoredGuardian = service.restoreFormationEntry(instanceId, {
    id: "formation:sect_guardian:restored",
    formationId: "sect_guardian_barrier",
    lifecycle: "persistent",
    ownerSectId: "sect:smoke",
    spiritStoneCount: 1,
    remainingAuraBudget: 100000,
    x: 8,
    y: 8,
    active: true,
  });
  assert.equal(restoredGuardian.stats.radius, 1);
  assert.equal(service.isBoundaryBarrierBlocked(instanceId, 9, 8, outsiderPlayerId), true);
  assert.equal(service.isBoundaryBarrierBlocked(instanceId, 9, 8, sectPlayerId), false);
  assert.equal(service.isBoundaryBarrierBlocked(instanceId, 9, 8, detachedOwnerPlayerId), false);
  assert.equal(service.isBoundaryBarrierBlocked(instanceId, 8, 8, outsiderPlayerId), false);
  const guardianProjection = service.listRuntimeFormations(instanceId).find((entry) => entry.id === guardian.id);
  assert.equal(guardianProjection.name, "护宗大阵");
  assert.equal(guardianProjection.ownerSectId, "sect:smoke");
  assert.equal(guardianProjection.eyeInstanceId, "sect:smoke:inner");
  assert.equal(guardianProjection.showText, false);
  assert.equal(guardianProjection.boundaryChar, "护");
  assert.equal(guardianProjection.boundaryColor, "#e0f7ff");
  assert.equal(guardianProjection.boundaryRangeHighlightColor, "#67e8f9");
  const guardianEyeProjection = service.listRuntimeFormations("sect:smoke:inner").find((entry) => entry.id === guardian.id);
  assert.equal(guardianEyeProjection.name, "护宗大阵阵眼");
  assert.equal(guardianEyeProjection.x, 3);
  assert.equal(guardianEyeProjection.y, 4);
  assert.equal(guardianEyeProjection.blocksBoundary, false);
  const guardianEyeCombatState = service.getFormationCombatState("sect:smoke:inner", guardian.id);
  assert.equal(guardianEyeCombatState.x, 3);
  assert.equal(guardianEyeCombatState.y, 4);
  assert.equal(service.getFormationCombatState(instanceId, guardian.id), null);
  const guardianDelta = buildFullWorldDelta({
    tick: 4,
    worldRevision: instance.worldRevision,
    selfRevision: 1,
    playerId,
    instance: { instanceId, templateId: "formation_smoke" },
    self: { x: 4, y: 5, name: "阵法测试", displayName: "阵" },
    visiblePlayers: [],
    localNpcs: [],
    localMonsters: [],
    localPortals: [],
    localGroundPiles: [],
    localContainers: [],
    localFormations: service.listRuntimeFormations(instanceId),
  });
  const projectedGuardian = guardianDelta.fmn.find((entry) => entry.id === guardian.id);
  assert.equal(projectedGuardian.os, "sect:smoke");
  assert.equal(projectedGuardian.op, detachedOwnerPlayerId);
  assert.equal(projectedGuardian.lt, 1);
  const guardianAuraBeforeTick = service.findFormationInInstance(instanceId, guardian.id).remainingAuraBudget;
  service.advanceInstanceFormations(instance, 5, deps);
  const guardianAuraAfterTick = service.findFormationInInstance(instanceId, guardian.id).remainingAuraBudget;
  const guardianActiveDecayRate = buildQiHalfLifeRateScaled(FORMATION_TICKS_PER_DAY * 3) / QI_HALF_LIFE_RATE_SCALE;
  assert.ok(guardianAuraAfterTick < guardianAuraBeforeTick);
  assert.ok(Math.abs((guardianAuraBeforeTick - guardianAuraAfterTick) - (guardianAuraBeforeTick * guardianActiveDecayRate)) < 0.000001);
  service.dispatchSetPersistentFormationActive(detachedOwnerPlayerId, {
    instanceId,
    formationInstanceId: guardian.id,
    active: false,
  }, deps);
  const guardianInactiveAuraBeforeTick = service.findFormationInInstance(instanceId, guardian.id).remainingAuraBudget;
  service.advanceInstanceFormations(instance, 6, deps);
  const guardianInactiveAuraAfterTick = service.findFormationInInstance(instanceId, guardian.id).remainingAuraBudget;
  assert.ok(Math.abs((guardianInactiveAuraBeforeTick - guardianInactiveAuraAfterTick) - (guardianInactiveAuraBeforeTick * guardianActiveDecayRate / 10)) < 0.000001);
  service.dispatchSetPersistentFormationActive(detachedOwnerPlayerId, {
    instanceId,
    formationInstanceId: guardian.id,
    active: true,
  }, deps);
  service.applyDamageToFormation("sect:smoke:inner", guardian.id, 999999999999, outsiderPlayerId, deps);
  const damagedGuardian = service.findFormationInInstance(instanceId, guardian.id);
  assert.equal(damagedGuardian.id, guardian.id);
  assert.equal(damagedGuardian.active, false);
  assert.equal(damagedGuardian.remainingAuraBudget, 0);
  assert.equal(service.isBoundaryBarrierBlocked(instanceId, 9, 8, outsiderPlayerId), false);
  player.qi = 1000;
  player.wallet.spirit_stone = 1000;
  service.dispatchInjectPersistentFormationEnergy(playerId, {
    instanceId,
    formationInstanceId: guardian.id,
    spiritStoneCount: 7,
  }, deps);
  assert.equal(player.qi, 300);
  assert.equal(player.wallet.spirit_stone, 993);
  assert.equal(Math.round(service.findFormationInInstance(instanceId, guardian.id).remainingAuraBudget), 700);
  assert.equal(service.findFormationInInstance(instanceId, guardian.id).active, true);
  assert.equal(service.isBoundaryBarrierBlocked(instanceId, 9, 8, outsiderPlayerId), true);

  const persistedFormationCount = await runFormationPersistenceSmoke(playerRuntimeService);

  console.log(JSON.stringify({
    ok: true,
    formationId: formation.id,
    worldRevision: instance.worldRevision,
    projectedFormationCount: worldDelta.fmn.length,
    affectedAuraTiles: tileResources.size,
    persistedFormationCount,
  }, null, 2));
}

async function runFormationPersistenceSmoke(playerRuntimeService) {
  const databaseUrl = resolveServerDatabaseUrl();
  if (!databaseUrl.trim()) {
    return 0;
  }
  const persistenceInstanceId = `public:formation_persist_${Date.now().toString(36)}`;
  const formationId = `formation:${persistenceInstanceId}:1`;
  const largeSpiritStoneCount = 100_000_009;
  const largeQiCost = 10_000_000_900;
  const pool = new Pool({ connectionString: databaseUrl });
  const saveService = new WorldRuntimeFormationService(
    { getFormationTemplate: () => null },
    playerRuntimeService,
  );
  const restoreService = new WorldRuntimeFormationService(
    { getFormationTemplate: () => null },
    playerRuntimeService,
  );
  const guardianStartupService = new WorldRuntimeFormationService(
    { getFormationTemplate: () => null },
    playerRuntimeService,
  );
  try {
    await pool.query("DELETE FROM instance_formation_state WHERE instance_id = $1", [persistenceInstanceId]).catch(() => undefined);
    const template = saveService.resolveFormationTemplate("spirit_gathering");
    const allocation = { effectPercent: 80, rangePercent: 10, durationPercent: 10 };
    const stats = require("@mud/shared").resolveFormationStats(template, 100, 4, allocation);
    saveService.formationsByInstanceId.set(persistenceInstanceId, [{
      instanceId: persistenceInstanceId,
      id: formationId,
      ownerPlayerId: playerId,
      ownerSectId: "sect:smoke",
      formationId: "spirit_gathering",
      lifecycle: "deployed",
      name: template.name,
      template,
      diskItemId: "formation_disk.mystic",
      diskTier: "mystic",
      diskMultiplier: 4,
      spiritStoneCount: largeSpiritStoneCount,
      qiCost: largeQiCost,
      x: 2,
      y: 3,
      eyeInstanceId: persistenceInstanceId,
      eyeX: 2,
      eyeY: 3,
      allocation,
      stats,
      active: true,
      remainingAuraBudget: 12345,
      createdAt: 111,
      updatedAt: 222,
    }]);
    await saveService.saveInstanceFormations(persistenceInstanceId);
    const rows = await pool.query("SELECT formation_instance_id, formation_id, lifecycle, spirit_stone_count, qi_cost, remaining_aura_budget FROM instance_formation_state WHERE instance_id = $1", [persistenceInstanceId]);
    assert.equal(rows.rowCount, 1);
    assert.equal(rows.rows[0].formation_instance_id, formationId);
    assert.equal(rows.rows[0].formation_id, "spirit_gathering");
    assert.equal(rows.rows[0].lifecycle, "deployed");
    assert.equal(Number(rows.rows[0].spirit_stone_count), largeSpiritStoneCount);
    assert.equal(Number(rows.rows[0].qi_cost), largeQiCost);
    assert.equal(Number(rows.rows[0].remaining_aura_budget), 12345);
    const guardian = guardianStartupService.upsertSectGuardianFormation({
      instanceId: persistenceInstanceId,
      id: `formation:sect_guardian:formation-smoke`,
      ownerSectId: "sect:smoke",
      ownerPlayerId: detachedOwnerPlayerId,
      x: 7,
      y: 8,
      eyeInstanceId: "sect:smoke:inner",
      eyeX: 1,
      eyeY: 2,
      radius: 1,
      remainingAuraBudget: 100000,
      active: true,
    });
    await guardianStartupService.saveInstanceFormations(persistenceInstanceId);
    const rowsAfterGuardianStartup = await pool.query("SELECT formation_instance_id, formation_id, lifecycle, x, y FROM instance_formation_state WHERE instance_id = $1 ORDER BY formation_instance_id ASC", [persistenceInstanceId]);
    assert.equal(rowsAfterGuardianStartup.rowCount, 2);
    assert.ok(rowsAfterGuardianStartup.rows.some((row) => row.formation_instance_id === formationId && row.formation_id === "spirit_gathering" && row.lifecycle === "deployed"));
    assert.ok(rowsAfterGuardianStartup.rows.some((row) => row.formation_instance_id === guardian.id && row.formation_id === "sect_guardian_barrier" && row.lifecycle === "persistent"));
    const restoredCount = await restoreService.restoreInstanceFormations(persistenceInstanceId);
    assert.equal(restoredCount, 2);
    const restored = restoreService.findFormationInInstance(persistenceInstanceId, formationId);
    assert.equal(restored.remainingAuraBudget, 12345);
    assert.equal(restored.ownerSectId, "sect:smoke");
    assert.equal(restored.lifecycle, "deployed");
    assert.equal(restored.spiritStoneCount, largeSpiritStoneCount);
    assert.equal(restored.qiCost, largeQiCost);
    const restoredGuardian = restoreService.findFormationInInstance(persistenceInstanceId, guardian.id);
    assert.equal(restoredGuardian.lifecycle, "persistent");
    assert.equal(restoredGuardian.eyeInstanceId, "sect:smoke:inner");
    return restoredCount;
  } finally {
    await saveService.closePersistencePool().catch(() => undefined);
    await restoreService.closePersistencePool().catch(() => undefined);
    await guardianStartupService.closePersistencePool().catch(() => undefined);
    await pool.query("DELETE FROM instance_formation_state WHERE instance_id = $1", [persistenceInstanceId]).catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
