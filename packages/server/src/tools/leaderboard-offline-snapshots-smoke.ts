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
  cultivationActive?: boolean;
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
    monsterKillCount: 0,
    eliteMonsterKillCount: 0,
    bossMonsterKillCount: 0,
    playerKillCount: input.playerKillCount ?? 0,
    deathCount: 0,
    bodyTraining: { level: 0, exp: 0, expToNext: 1 },
    inventory: { items: [] },
    wallet: { balances: [] },
    marketStorage: { items: [] },
    combat: {
      cultivationActive: input.cultivationActive === true,
      autoBattle: false,
      combatTargetId: null,
    },
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
    cultivationActive: true,
  });

  const projectedEntries: SnapshotEntry[] = [
    { playerId: offlinePlayer.playerId, snapshot: offlinePlayer },
    { playerId: offlineIdlePlayer.playerId, snapshot: offlineIdlePlayer },
  ];

  const playerRuntimeService = {
    listPlayerSnapshots() {
      return [onlinePlayer];
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
    openOrders: [],
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

  const service = new LeaderboardRuntimeService(
    playerRuntimeService as never,
    marketRuntimeService as never,
    mapTemplateRepository as never,
    playerDomainPersistenceService as never,
    playerIdentityPersistenceService as never,
  );

  const leaderboard = await service.buildLeaderboard(10, null);
  assert.deepEqual(
    leaderboard.boards.realm.map((entry) => entry.playerId),
    ['player:offline', 'player:offline-idle', 'player:online'],
  );
  assert.deepEqual(
    leaderboard.boards.realm.map((entry) => entry.playerName),
    ['离线真名', '挂机真名', '在线真名'],
  );
  assert.deepEqual(
    leaderboard.boards.playerKills.map((entry) => entry.playerId),
    ['player:offline', 'player:offline-idle', 'player:online'],
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

  console.log('leaderboard-offline-snapshots-smoke passed');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
