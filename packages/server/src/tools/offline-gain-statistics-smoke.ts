// @ts-nocheck
"use strict";

const assert = require("node:assert/strict");

const { PlayerRuntimeService } = require("../runtime/player/player-runtime.service");

function createService() {
  const contentTemplateRepository = {
    getItemName(itemId) {
      return itemId;
    },
    createItem(itemId, count = 1) {
      const normalizedItemId = typeof itemId === "string" ? itemId.trim() : "";
      const normalizedCount = Math.max(1, Math.trunc(Number(count) || 1));
      if (!normalizedItemId) {
        return null;
      }
      return {
        itemId: normalizedItemId,
        count: normalizedCount,
      };
    },
  };
  const playerAttributesService = {
    recalculate() {},
  };
  const playerProgressionService = {
    refreshPreview() {},
    gainRealmProgress(player, amount) {
      const gain = Math.max(0, Math.trunc(Number(amount) || 0));
      player.realm.progress = Math.min(player.realm.progressToNext, player.realm.progress + gain);
      return {
        changed: gain > 0,
        notices: [],
        actionsDirty: false,
        dirtyDomains: ["progression"],
      };
    },
    advanceCultivation(player) {
      player.realm.progress = Math.min(player.realm.progressToNext, player.realm.progress + 120);
      return {
        changed: true,
        notices: [],
        actionsDirty: false,
        dirtyDomains: ["progression"],
      };
    },
    refineRootFoundation(player) {
      const consumed = Math.min(100, player.realm.progress);
      player.realm.progress -= consumed;
      return {
        changed: consumed > 0,
        notices: [],
        actionsDirty: true,
        dirtyDomains: ["progression"],
      };
    },
  };
  return new PlayerRuntimeService(
    contentTemplateRepository,
    {},
    playerAttributesService,
    playerProgressionService,
    undefined,
  );
}

function createPlayer(overrides = {}) {
  return {
    playerId: "player:offline-gain-smoke",
    sessionId: "sid:online",
    hp: 100,
    maxHp: 100,
    qi: 100,
    maxQi: 100,
    realm: {
      realmLv: 19,
      level: 19,
      progress: 36_000,
      exp: 36_000,
      progressToNext: 120_000,
      expToNext: 120_000,
      breakthroughReady: false,
    },
    foundation: 0,
    rootFoundation: 0,
    combatExp: 0,
    bodyTraining: {
      level: 0,
      exp: 0,
      expToNext: 100,
    },
    inventory: {
      revision: 1,
      items: [],
    },
    techniques: {
      revision: 1,
      techniques: [],
      cultivatingTechId: null,
    },
    alchemySkill: null,
    gatherSkill: null,
    enhancementSkill: null,
    buffs: {
      revision: 1,
      buffs: [],
    },
    combat: {
      cultivationActive: true,
      autoIdleCultivation: true,
      lastActiveTick: 0,
      cooldownReadyTickBySkillId: {},
      autoBattleSkills: [],
    },
    attrs: {
      numericStats: {
        realmExpPerTick: 120,
        techniqueExpPerTick: 0,
        playerExpRate: 0,
        techniqueExpRate: 0,
      },
    },
    actions: {
      revision: 1,
      actions: [],
      contextActions: [],
    },
    notices: {
      nextId: 1,
      queue: [],
    },
    dirtyDomains: new Set(),
    selfRevision: 1,
    persistentRevision: 1,
    ...overrides,
  };
}

async function testOfflineAccumulatedGainWinsOverSnapshotLoss() {
  const service = createService();
  const player = createPlayer();
  service.players.set(player.playerId, player);

  service.detachSession(player.playerId);
  player.offlineSinceAt = 1_000;
  await service.beginOfflineGainSession(player.playerId, 1_000);
  service.advanceSinglePlayerTick(player, 1);
  service.advanceSinglePlayerTick(player, 2);

  player.realm.progress = 0;
  const report = await service.finalizeOfflineGainSessionForPlayer(player, 10_000);
  const realmRow = report.progress.find((entry) => entry.kind === "realmExp");

  assert.ok(realmRow, "expected accumulated offline cultivation gain row");
  assert.equal(realmRow.gained, 240);
  assert.equal(realmRow.lost, 0);
  assert.equal(realmRow.net, 240);
  assert.equal(report.durationMs, 2_000);
  assert.equal(report.startedAt, 1_000);
  assert.equal(report.endedAt, 3_000);
}

async function testOfflineGlobalStatisticsKeepGainAndLossSeparated() {
  const service = createService();
  const player = createPlayer();
  service.players.set(player.playerId, player);

  service.detachSession(player.playerId);
  player.offlineSinceAt = 1_000;
  await service.beginOfflineGainSession(player.playerId, 1_000);

  service.gainRealmProgress(player.playerId, 100);
  service.refineRootFoundation(player.playerId, 2);

  const report = await service.finalizeOfflineGainSessionForPlayer(player, 10_000);
  const realmRow = report.progress.find((entry) => entry.kind === "realmExp");

  assert.ok(realmRow, "expected realm progress row");
  assert.equal(realmRow.gained, 100);
  assert.equal(realmRow.lost, 100);
  assert.equal(realmRow.net, 0);
  assert.equal(report.durationMs, 2_000);
  assert.equal(report.endedAt, report.startedAt + report.durationMs);
}

async function testOfflineSnapshotFallbackDoesNotFabricateStoppedServerChanges() {
  const service = createService();
  const player = createPlayer();
  service.players.set(player.playerId, player);

  service.detachSession(player.playerId);
  player.offlineSinceAt = 1_000;
  await service.beginOfflineGainSession(player.playerId, 1_000);

  player.realm.progress = 35_900;
  const report = await service.finalizeOfflineGainSessionForPlayer(player, 10_000);

  assert.equal(report.progress.some((entry) => entry.kind === "realmExp"), false);
}

async function testOfflineDurationIncludesNoGainTicks() {
  const service = createService();
  const player = createPlayer({
    combat: {
      cultivationActive: false,
      autoIdleCultivation: false,
      lastActiveTick: 0,
      cooldownReadyTickBySkillId: {},
    },
  });
  service.players.set(player.playerId, player);

  service.detachSession(player.playerId);
  player.offlineSinceAt = 1_000;
  await service.beginOfflineGainSession(player.playerId, 1_000);
  service.advanceSinglePlayerTick(player, 1);
  player.combat.cultivationActive = true;
  service.advanceSinglePlayerTick(player, 2);

  const report = await service.finalizeOfflineGainSessionForPlayer(player, 10_000);
  const realmRow = report.progress.find((entry) => entry.kind === "realmExp");

  assert.ok(realmRow, "expected one tick of offline cultivation gain");
  assert.equal(realmRow.gained, 120);
  assert.equal(realmRow.lost, 0);
  assert.equal(realmRow.net, 120);
  assert.equal(report.durationMs, 2_000);
  assert.equal(report.endedAt, report.startedAt + report.durationMs);
}

async function testUnconfirmedOfflineReportsMergeIntoOnePendingRecord() {
  const service = createService();
  const player = createPlayer();
  service.players.set(player.playerId, player);

  service.detachSession(player.playerId);
  player.offlineSinceAt = 1_000;
  await service.beginOfflineGainSession(player.playerId, 1_000);
  for (let tick = 1; tick <= 60; tick += 1) {
    service.advanceSinglePlayerTick(player, tick);
  }
  const firstReport = await service.finalizeOfflineGainSessionForPlayer(player, 70_000);

  player.sessionId = "sid:reconnected";
  player.offlineSinceAt = null;
  service.detachSession(player.playerId);
  player.offlineSinceAt = 80_000;
  await service.beginOfflineGainSession(player.playerId, 80_000);
  for (let tick = 61; tick <= 120; tick += 1) {
    service.advanceSinglePlayerTick(player, tick);
  }
  const secondReport = await service.finalizeOfflineGainSessionForPlayer(player, 160_000);

  const records = service.getPendingPlayerStatisticRecords(player.playerId);
  assert.equal(records.length, 1);
  assert.equal(records[0].id, firstReport.id);
  assert.equal(records[0].startedAt, firstReport.startedAt);
  assert.equal(records[0].durationMs, firstReport.durationMs + secondReport.durationMs);
  assert.equal(records[0].endedAt, records[0].startedAt + records[0].durationMs);

  const realmRow = records[0].progress.find((entry) => entry.kind === "realmExp");
  assert.ok(realmRow, "expected merged realm progress row");
  assert.equal(realmRow.gained, 14_400);
  assert.equal(realmRow.lost, 0);
  assert.equal(realmRow.net, 14_400);
}

async function testBlockingOfflineGainPreviewKeepsAccumulatingUntilAck() {
  const service = createService();
  const player = createPlayer();
  service.players.set(player.playerId, player);

  service.detachSession(player.playerId);
  player.offlineSinceAt = 1_000;
  await service.beginOfflineGainSession(player.playerId, 1_000);
  for (let tick = 1; tick <= 60; tick += 1) {
    service.advanceSinglePlayerTick(player, tick);
  }

  const previewBefore = await service.loadOfflineGainPreviewReports(player.playerId);
  assert.equal(previewBefore.length, 1);
  assert.equal(previewBefore[0].durationMs, 60_000);
  assert.equal(await service.hasActiveOfflineGainSession(player.playerId), true);
  assert.equal(service.getPendingPlayerStatisticRecords(player.playerId).length, 0);

  for (let tick = 61; tick <= 62; tick += 1) {
    service.advanceSinglePlayerTick(player, tick);
  }
  const previewAfter = await service.loadOfflineGainPreviewReports(player.playerId);
  assert.equal(previewAfter.length, 1);
  assert.equal(previewAfter[0].id, previewBefore[0].id);
  assert.equal(previewAfter[0].durationMs, 62_000);

  await service.acknowledgeOfflineGainReports(player.playerId, [previewAfter[0].id], { sessionId: "sid:confirmed" });
  assert.equal(await service.hasActiveOfflineGainSession(player.playerId), false);
  assert.equal(player.sessionId, "sid:confirmed");
  assert.equal(service.getPendingPlayerStatisticRecords(player.playerId).length, 0);
}

async function testBlockingOfflineGainReconnectDoesNotResetSession() {
  const service = createService();
  const player = createPlayer();
  service.players.set(player.playerId, player);

  service.detachSession(player.playerId);
  player.offlineSinceAt = 1_000;
  await service.beginOfflineGainSession(player.playerId, 1_000);
  for (let tick = 1; tick <= 60; tick += 1) {
    service.advanceSinglePlayerTick(player, tick);
  }

  const previewBeforeReconnect = await service.loadOfflineGainPreviewReports(player.playerId);
  assert.equal(previewBeforeReconnect.length, 1);
  assert.equal(previewBeforeReconnect[0].durationMs, 60_000);
  const sessionId = previewBeforeReconnect[0].id;

  player.sessionId = null;
  await service.beginOfflineGainSession(player.playerId, 61_000);
  service.advanceSinglePlayerTick(player, 61);

  const previewAfterReconnect = await service.loadOfflineGainPreviewReports(player.playerId);
  assert.equal(previewAfterReconnect.length, 1);
  assert.equal(previewAfterReconnect[0].id, sessionId);
  assert.equal(previewAfterReconnect[0].startedAt, previewBeforeReconnect[0].startedAt);
  assert.equal(previewAfterReconnect[0].durationMs, 61_000);
}

async function testShortOfflineGainDoesNotBlockReconnect() {
  const service = createService();
  const player = createPlayer();
  service.players.set(player.playerId, player);

  service.detachSession(player.playerId);
  player.offlineSinceAt = 1_000;
  await service.beginOfflineGainSession(player.playerId, 1_000);
  for (let tick = 1; tick <= 4; tick += 1) {
    service.advanceSinglePlayerTick(player, tick);
  }

  assert.equal(await service.hasActiveOfflineGainSession(player.playerId), false);
  assert.deepEqual(await service.loadOfflineGainPreviewReports(player.playerId), []);

  await service.loadOrCreatePlayer(player.playerId, "sid:return", async () => null, {
    deferOfflineGainSettlement: true,
  });

  assert.equal(player.sessionId, "sid:return");
  assert.equal(await service.hasActiveOfflineGainSession(player.playerId), false);
  assert.equal(service.getPendingPlayerStatisticRecords(player.playerId).length, 0);
}

async function testOnlineAssetMutationsCreateIndependentStatisticReports() {
  const service = createService();
  const player = createPlayer();
  service.players.set(player.playerId, player);

  service.creditWallet(player.playerId, "spirit_stone", 25);
  service.debitWallet(player.playerId, "spirit_stone", 5);

  const records = service.getPendingPlayerStatisticRecords(player.playerId);
  assert.equal(records.length, 2);
  assert.equal(records.every((entry) => entry.scope === "online"), true);

  assert.equal(records[0].spiritStones.gained, 25);
  assert.equal(records[0].spiritStones.lost, 0);
  assert.equal(records[1].spiritStones.gained, 0);
  assert.equal(records[1].spiritStones.lost, 5);
}

async function main() {
  await testOfflineAccumulatedGainWinsOverSnapshotLoss();
  await testOfflineGlobalStatisticsKeepGainAndLossSeparated();
  await testOfflineSnapshotFallbackDoesNotFabricateStoppedServerChanges();
  await testOfflineDurationIncludesNoGainTicks();
  await testUnconfirmedOfflineReportsMergeIntoOnePendingRecord();
  await testBlockingOfflineGainPreviewKeepsAccumulatingUntilAck();
  await testBlockingOfflineGainReconnectDoesNotResetSession();
  await testShortOfflineGainDoesNotBlockReconnect();
  await testOnlineAssetMutationsCreateIndependentStatisticReports();
  console.log("offline-gain-statistics-smoke passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
