import assert from 'node:assert/strict';

import { Direction } from '@mud/shared';

import { installSmokeTimeout } from './smoke-timeout';
import { LeaderboardRuntimeService } from '../runtime/player/leaderboard-runtime.service';

installSmokeTimeout(__filename);

type SnapshotEntry = {
  playerId: string;
  snapshot: Record<string, unknown>;
  updatedAt?: number;
};

function createRuntimePlayer(input: {
  playerId: string;
  playerName: string;
  sessionId: string | null;
  templateId: string;
  x: number;
  y: number;
  realmLv: number;
  progress: number;
  playerKillCount?: number;
  monsterKillCount?: number;
  eliteMonsterKillCount?: number;
  bossMonsterKillCount?: number;
  deathCount?: number;
  cultivationActive?: boolean;
  autoBattle?: boolean;
  alchemyJob?: Record<string, unknown> | null;
  enhancementJob?: Record<string, unknown> | null;
}) {
  return {
    playerId: input.playerId,
    name: input.playerName,
    displayName: input.playerName,
    sessionId: input.sessionId,
    templateId: input.templateId,
    x: input.x,
    y: input.y,
    facing: Direction.South,
    realm: {
      realmLv: input.realmLv,
      displayName: `第 ${input.realmLv} 重`,
      shortName: `${input.realmLv}重`,
      progress: input.progress,
    },
    foundation: input.realmLv * 10,
    monsterKillCount: input.monsterKillCount ?? 0,
    eliteMonsterKillCount: input.eliteMonsterKillCount ?? 0,
    bossMonsterKillCount: input.bossMonsterKillCount ?? 0,
    playerKillCount: input.playerKillCount ?? 0,
    deathCount: input.deathCount ?? 0,
    bodyTraining: { level: 0, exp: 0, expToNext: 1 },
    inventory: { items: [] },
    wallet: { balances: [] },
    marketStorage: { items: [] },
    combat: {
      cultivationActive: input.cultivationActive === true,
      autoBattle: input.autoBattle === true,
      combatTargetId: null,
    },
    alchemyJob: input.alchemyJob ?? null,
    enhancementJob: input.enhancementJob ?? null,
    attrs: {
      finalAttrs: {
        constitution: input.realmLv,
        spirit: input.realmLv,
        perception: input.realmLv,
        talent: input.realmLv,
        strength: input.realmLv,
        meridians: input.realmLv,
      },
    },
  };
}

async function main(): Promise<void> {
  const onlinePlayer = createRuntimePlayer({
    playerId: 'player:online',
    playerName: '在线修士',
    sessionId: 'session:online',
    templateId: 'yunlai_town',
    x: 5,
    y: 6,
    realmLv: 3,
    progress: 10,
    playerKillCount: 1,
    monsterKillCount: 2,
    eliteMonsterKillCount: 1,
    cultivationActive: true,
  });
  const offlinePlayer = createRuntimePlayer({
    playerId: 'player:offline',
    playerName: '离线修士',
    sessionId: null,
    templateId: 'black_mountain',
    x: 11,
    y: 12,
    realmLv: 9,
    progress: 90,
    playerKillCount: 7,
    monsterKillCount: 3,
    bossMonsterKillCount: 1,
    cultivationActive: true,
    autoBattle: true,
    alchemyJob: { jobRunId: 'job:ordinary-offline:alchemy' },
    enhancementJob: { jobRunId: 'job:ordinary-offline:enhancement' },
  });
  const offlineIdlePlayer = createRuntimePlayer({
    playerId: 'player:offline-idle',
    playerName: '离线挂机',
    sessionId: null,
    templateId: 'yunlai_town',
    x: 13,
    y: 14,
    realmLv: 7,
    progress: 70,
    playerKillCount: 5,
    monsterKillCount: 4,
    deathCount: 2,
    cultivationActive: true,
    alchemyJob: { jobRunId: 'job:hanging:alchemy' },
    enhancementJob: { jobRunId: 'job:hanging:enhancement' },
  });
  const bannedOnlinePlayer = createRuntimePlayer({
    playerId: 'player:banned-online',
    playerName: '封禁在线',
    sessionId: 'session:banned-online',
    templateId: 'yunlai_town',
    x: 21,
    y: 22,
    realmLv: 99,
    progress: 99,
    playerKillCount: 999,
    monsterKillCount: 999,
    cultivationActive: true,
  });
  const bannedOfflinePlayer = createRuntimePlayer({
    playerId: 'player:banned-offline',
    playerName: '封禁离线',
    sessionId: null,
    templateId: 'black_mountain',
    x: 31,
    y: 32,
    realmLv: 100,
    progress: 100,
    playerKillCount: 1000,
    monsterKillCount: 1000,
    deathCount: 1000,
    cultivationActive: true,
  });

  const projectedEntries: SnapshotEntry[] = [
    { playerId: offlinePlayer.playerId, snapshot: offlinePlayer },
    { playerId: offlineIdlePlayer.playerId, snapshot: offlineIdlePlayer },
    { playerId: bannedOfflinePlayer.playerId, snapshot: bannedOfflinePlayer },
  ];

  const playerRuntimeService = {
    listLeaderboardPlayerProjections() {
      return [onlinePlayer, bannedOnlinePlayer];
    },
    listPlayerSnapshots() {
      throw new Error('leaderboard smoke should use listLeaderboardPlayerProjections instead of listPlayerSnapshots');
    },
    buildStarterPersistenceSnapshot(playerId: string) {
      return createRuntimePlayer({
        playerId,
        playerName: playerId,
        sessionId: null,
        templateId: 'yunlai_town',
        x: 1,
        y: 1,
        realmLv: 1,
        progress: 0,
      });
    },
    hydrateFromSnapshot(playerId: string, sessionId: string | null, snapshot: Record<string, unknown>) {
      return {
        ...snapshot,
        playerId,
        sessionId,
      };
    },
  };
  const playerDomainPersistenceService = {
    isEnabled() {
      return true;
    },
    async listProjectedSnapshots(buildStarterSnapshot: (playerId: string) => Record<string, unknown> | null) {
      assert.ok(buildStarterSnapshot('player:starter'), 'expected starter snapshot builder');
      return projectedEntries;
    },
    async loadPlayerPresence(playerId: string) {
      if (playerId === 'player:offline-idle') {
        return { playerId, online: false, inWorld: true };
      }
      if (playerId === 'player:offline') {
        return { playerId, online: false, inWorld: false };
      }
      return null;
    },
  };
  const playerIdentityPersistenceService = {
    isEnabled() {
      return true;
    },
    async listPlayerIdentitiesByPlayerIds(playerIds: Iterable<string>) {
      return new Map(Array.from(playerIds).map((playerId) => [
        playerId,
        {
          playerId,
          playerName: playerId === 'player:offline'
            ? '离线真名'
            : playerId === 'player:offline-idle'
              ? '挂机真名'
              : '在线真名',
          displayName: playerId,
        },
      ]));
    },
  };
  const marketRuntimeService = {
    openOrders: [
      {
        ownerId: offlinePlayer.playerId,
        side: 'buy',
        status: 'open',
        remainingQuantity: 2,
        unitPrice: 100,
      },
      {
        ownerId: onlinePlayer.playerId,
        side: 'buy',
        status: 'open',
        remainingQuantity: 100,
        unitPrice: 0.01,
      },
      {
        ownerId: offlineIdlePlayer.playerId,
        side: 'sell',
        status: 'open',
        remainingQuantity: 999,
        unitPrice: 100,
      },
      {
        ownerId: bannedOnlinePlayer.playerId,
        side: 'buy',
        status: 'open',
        remainingQuantity: 999,
        unitPrice: 1000,
      },
    ],
    buildMarketStorage() {
      return { items: [] };
    },
  };
  const mapTemplateRepository = {
    listSummaries() {
      return [
        { id: 'yunlai_town', name: '云来镇' },
        { id: 'black_mountain', name: '黑山' },
      ];
    },
  };
  const playerCountersPersistenceService = {
    getAll(playerId: string) {
      const countersByPlayerId = new Map<string, Map<string, number>>([
        [onlinePlayer.playerId, new Map([
          ['monsterKillCount', 9],
          ['eliteMonsterKillCount', 2],
          ['playerKillCount', 4],
        ])],
        [offlinePlayer.playerId, new Map([
          ['monsterKillCount', 11],
          ['bossMonsterKillCount', 3],
          ['playerKillCount', 8],
        ])],
      ]);
      return countersByPlayerId.get(playerId) ?? new Map<string, number>();
    },
  };
  const authStore = {
    listBannedPlayerIds() {
      return [bannedOnlinePlayer.playerId, bannedOfflinePlayer.playerId];
    },
  };
  const syncedInvitationHighestRealmLevels = new Map<string, number>();
  const activityPersistenceService = {
    isEnabled() {
      return true;
    },
    async syncInvitationInviteeHighestRealmLevels(highestRealmLvByPlayerId: Map<string, number>) {
      highestRealmLvByPlayerId.forEach((highestRealmLv, playerId) => {
        syncedInvitationHighestRealmLevels.set(playerId, highestRealmLv);
      });
    },
    async listInvitationLeaderboardRows(excludedPlayerIds: Iterable<string>) {
      const excluded = new Set(excludedPlayerIds);
      assert.equal(excluded.has(bannedOnlinePlayer.playerId), true);
      assert.equal(excluded.has(bannedOfflinePlayer.playerId), true);
      return [
        {
          inviterPlayerId: onlinePlayer.playerId,
          totalInvitees: 4,
          qiReachedCount: 2,
          foundationReachedCount: 1,
        },
        {
          inviterPlayerId: offlinePlayer.playerId,
          totalInvitees: 3,
          qiReachedCount: 3,
          foundationReachedCount: 2,
        },
        {
          inviterPlayerId: offlineIdlePlayer.playerId,
          totalInvitees: 2,
          qiReachedCount: 1,
          foundationReachedCount: 0,
        },
        {
          inviterPlayerId: bannedOnlinePlayer.playerId,
          totalInvitees: 999,
          qiReachedCount: 999,
          foundationReachedCount: 999,
        },
      ];
    },
  };
  const sectService = {
    buildSectMemberCountLeaderboard(limit: number, excludedPlayerIds: Set<string>) {
      assert.equal(limit, 10);
      assert.equal(excludedPlayerIds.has(bannedOnlinePlayer.playerId), true);
      assert.equal(excludedPlayerIds.has(bannedOfflinePlayer.playerId), true);
      return [
        {
          rank: 1,
          sectId: 'sect:visible',
          sectName: '可见宗门',
          mark: '可',
          memberCount: 2,
          leaderPlayerId: onlinePlayer.playerId,
          leaderName: onlinePlayer.displayName,
        },
      ];
    },
  };

  const service = new LeaderboardRuntimeService(
    playerRuntimeService as never,
    marketRuntimeService as never,
    mapTemplateRepository as never,
    playerDomainPersistenceService as never,
    playerIdentityPersistenceService as never,
    playerCountersPersistenceService as never,
    null,
    authStore as never,
    activityPersistenceService as never,
  );

  const leaderboard = await service.buildLeaderboard(10, sectService);
  assert.deepEqual(
    leaderboard.boards.realm.map((entry) => entry.playerId),
    ['player:offline', 'player:offline-idle', 'player:online'],
  );
  assert.equal(
    leaderboard.boards.realm.some((entry) => entry.playerId === bannedOnlinePlayer.playerId || entry.playerId === bannedOfflinePlayer.playerId),
    false,
  );
  assert.deepEqual(
    leaderboard.boards.realm.map((entry) => entry.playerName),
    ['离线真名', '挂机真名', '在线真名'],
  );
  assert.deepEqual(
    leaderboard.boards.spiritStones.map((entry) => ({
      playerId: entry.playerId,
      spiritStoneCount: entry.spiritStoneCount,
    })),
    [
      { playerId: 'player:offline', spiritStoneCount: 200 },
      { playerId: 'player:online', spiritStoneCount: 1 },
      { playerId: 'player:offline-idle', spiritStoneCount: 0 },
    ],
  );
  assert.deepEqual(
    leaderboard.boards.playerKills.map((entry) => entry.playerId),
    ['player:offline', 'player:offline-idle', 'player:online'],
  );
  assert.deepEqual(
    leaderboard.boards.playerKills.map((entry) => entry.playerKillCount),
    [8, 5, 4],
  );
  assert.deepEqual(
    leaderboard.boards.monsterKills.map((entry) => ({
      playerId: entry.playerId,
      totalKills: entry.totalKills,
      eliteKills: entry.eliteKills,
      bossKills: entry.bossKills,
    })),
    [
      { playerId: 'player:offline', totalKills: 11, eliteKills: 0, bossKills: 3 },
      { playerId: 'player:online', totalKills: 9, eliteKills: 2, bossKills: 0 },
      { playerId: 'player:offline-idle', totalKills: 4, eliteKills: 0, bossKills: 0 },
    ],
  );
  assert.deepEqual(leaderboard.boards.sects.map((entry) => entry.sectId), ['sect:visible']);
  assert.equal(syncedInvitationHighestRealmLevels.get(onlinePlayer.playerId), 3);
  assert.equal(syncedInvitationHighestRealmLevels.get(offlinePlayer.playerId), 9);
  assert.deepEqual(
    leaderboard.boards.invitation.totalInvitees.map((entry) => ({
      playerId: entry.playerId,
      count: entry.count,
    })),
    [
      { playerId: 'player:online', count: 4 },
      { playerId: 'player:offline', count: 3 },
      { playerId: 'player:offline-idle', count: 2 },
    ],
  );
  assert.deepEqual(
    leaderboard.boards.invitation.qiReached.map((entry) => ({
      playerId: entry.playerId,
      count: entry.count,
    })),
    [
      { playerId: 'player:offline', count: 3 },
      { playerId: 'player:online', count: 2 },
      { playerId: 'player:offline-idle', count: 1 },
    ],
  );
  assert.deepEqual(
    leaderboard.boards.invitation.foundationReached.map((entry) => ({
      playerId: entry.playerId,
      count: entry.count,
    })),
    [
      { playerId: 'player:offline', count: 2 },
      { playerId: 'player:online', count: 1 },
    ],
  );

  const locations = await service.buildLeaderboardPlayerLocations([
    'player:offline',
    'player:offline-idle',
    'player:missing',
  ]);
  assert.deepEqual(locations.entries[0], {
    playerId: 'player:offline',
    mapId: 'black_mountain',
    mapName: '黑山',
    x: 11,
    y: 12,
    online: false,
  });
  assert.deepEqual(locations.entries[1], {
    playerId: 'player:offline-idle',
    mapId: 'yunlai_town',
    mapName: '云来镇',
    x: 13,
    y: 14,
    online: false,
  });
  assert.equal(locations.entries[2].mapName, '离线');

  marketRuntimeService.openOrders = [
    {
      ownerId: offlinePlayer.playerId,
      side: 'buy',
      status: 'open',
      remainingQuantity: 3,
      unitPrice: 100,
    },
    {
      ownerId: onlinePlayer.playerId,
      side: 'buy',
      status: 'open',
      remainingQuantity: 100,
      unitPrice: 0.01,
    },
    {
      ownerId: bannedOfflinePlayer.playerId,
      side: 'buy',
      status: 'open',
      remainingQuantity: 1000,
      unitPrice: 1000,
    },
  ];
  const worldSummary = await service.buildWorldSummary();
  assert.deepEqual(worldSummary.summary.realmCounts, {
    initial: 0,
    mortal: 3,
    qiRefiningOrAbove: 0,
  });
  assert.deepEqual(worldSummary.summary.killCounts, {
    normalMonsters: 19,
    eliteMonsters: 2,
    bossMonsters: 3,
    playerKills: 17,
    playerDeaths: 2,
  });
  assert.equal(worldSummary.summary.totalSpiritStones, 301);
  assert.equal(worldSummary.summary.actionCounts.cultivation, 2);
  assert.equal(worldSummary.summary.actionCounts.combat, 0);
  assert.equal(worldSummary.summary.actionCounts.alchemy, 1);
  assert.equal(worldSummary.summary.actionCounts.enhancement, 1);

  console.log('leaderboard-offline-snapshots-smoke passed');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
