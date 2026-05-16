import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { NativeGmWorldService } from '../http/native/native-gm-world.service';

type QueryCall = {
  reason: string;
  sql: string;
  params: unknown[];
};

function createService(queryCalls: QueryCall[]): NativeGmWorldService {
  const runtimeInstances = [
    {
      instanceId: 'public:yunlai_town',
      displayName: '云来镇·和平',
      templateId: 'yunlai_town',
      templateName: '云来镇',
      linePreset: 'peaceful',
      lineIndex: 1,
      instanceOrigin: 'bootstrap',
      defaultEntry: true,
      persistent: true,
      supportsPvp: false,
      canDamageTile: true,
      playerCount: 1,
      players: [{ playerId: 'player:online' }],
    },
  ];

  const databasePoolProvider = {
    getPool(reason: string) {
      return {
        async query(sql: string, params: unknown[] = []) {
          queryCalls.push({ reason, sql, params });
          if (reason === 'gm-world-offline-hanging-counts') {
            assert.deepEqual(params[0], ['player:online']);
            return {
              rows: [
                { instance_id: 'public:yunlai_town', count: '2' },
              ],
            };
          }
          if (reason === 'gm-world-offline-hanging-players') {
            assert.equal(params[0], 'public:yunlai_town');
            assert.deepEqual(params.slice(1, 5), [0, 20, 0, 20]);
            assert.deepEqual(params[5], ['player:online']);
            return {
              rows: [
                {
                  player_id: 'player:offline-a',
                  x: '4',
                  y: '5',
                  player_name: '离线甲',
                  display_name: '离线甲',
                  hp: '80',
                  max_hp: '100',
                },
                {
                  player_id: 'player:offline-b',
                  x: '6',
                  y: '7',
                  player_name: '离线乙',
                  display_name: '离线乙',
                  hp: '0',
                  max_hp: '100',
                },
              ],
            };
          }
          throw new Error(`unexpected pool reason: ${reason}`);
        },
      };
    },
  };

  return new NativeGmWorldService(
    { loadAll() {} } as never,
    { buildPerformanceSnapshot() { return {}; }, resetNetworkPerfCounters() {}, resetCpuPerfCounters() {}, writeHeapSnapshot() { return {}; } } as never,
    {
      getOrThrow(mapId: string) {
        if (mapId !== 'yunlai_town') {
          throw new Error(`unexpected mapId ${mapId}`);
        }
        return { id: 'yunlai_town', name: '云来镇', source: { time: {} } };
      },
      loadAll() {},
      listSummaries() { return [{ id: 'yunlai_town' }]; },
    } as never,
    { markCompleted() { return false; }, addReply() { return false; }, remove() { return false; } } as never,
    { updateMapTick() {}, updateMapTime() {}, pruneMapConfigs() {} } as never,
    { invalidatePlayerListCaches() {}, listPlayers() { return { players: [] }; }, getState() { return {}; } } as never,
    { getEditorCatalog() { return {}; } } as never,
    { getMaps() { return {}; } } as never,
    {
      getMapRuntime() {
        return {
          mapId: 'yunlai_town',
          instanceId: 'public:yunlai_town',
          playerCount: 1,
          width: 64,
          height: 64,
          entities: [
            {
              id: 'player:online',
              kind: 'player',
              online: true,
              x: 1,
              y: 2,
            },
          ],
        };
      },
      getInstanceRuntime() {
        return {
          mapId: 'yunlai_town',
          instanceId: 'public:yunlai_town',
          playerCount: 1,
          width: 64,
          height: 64,
          entities: [
            {
              id: 'player:online',
              kind: 'player',
              online: true,
              x: 1,
              y: 2,
            },
          ],
        };
      },
    } as never,
    { getSuggestions() { return {}; } } as never,
    { listNodes() { return []; }, isEnabled() { return true; }, getNodeId() { return 'node:test'; } } as never,
    { ensureInitialized() {}, isEnabled() { return true; }, mergeMapConfig() {}, pruneMapConfigs() {} } as never,
    { listRetryQueue() { return []; } } as never,
    { getOperationReplay() { return {}; } } as never,
    { flushPlayer() {} } as never,
    { flushInstance() {} } as never,
    databasePoolProvider as never,
    {
      listInstances() {
        return runtimeInstances.map((entry) => ({ ...entry, players: entry.players.map((player) => ({ ...player })) }));
      },
      getRuntimeSummary() { return {}; },
    } as never,
  );
}

async function main(): Promise<void> {
  const queryCalls: QueryCall[] = [];
  const service = createService(queryCalls);

  const instancesPayload = await service.getWorldInstances();
  assert.equal(instancesPayload.instances.length, 1);
  assert.equal(instancesPayload.instances[0].instanceId, 'public:yunlai_town');
  assert.equal(instancesPayload.instances[0].playerCount, 3);

  const runtimePayload = await service.getWorldInstanceRuntime('public:yunlai_town', 0, 0, 20, 20, 'viewer:gm') as {
    playerCount: number;
    entities: Array<Record<string, unknown>>;
  };
  assert.equal(runtimePayload.playerCount, 3);
  assert.deepEqual(
    runtimePayload.entities.map((entry) => [entry.id, entry.kind, entry.online, entry.dead]),
    [
      ['player:online', 'player', true, undefined],
      ['player:offline-a', 'player', false, false],
      ['player:offline-b', 'player', false, true],
    ],
  );

  assert.deepEqual(
    queryCalls.map((entry) => entry.reason),
    ['gm-world-offline-hanging-counts', 'gm-world-offline-hanging-players'],
  );

  console.log(JSON.stringify({
    ok: true,
    case: 'gm-world-offline-hanging-presence',
    answers: 'GM 世界管理实例列表会按 player_position_checkpoint/player_presence 合并离线挂机人数；实例运行态视口会补投影离线挂机玩家实体，并排除当前运行时已存在的在线玩家。',
    excludes: '不证明真实数据库数据、浏览器渲染或服务器完整重启；证明世界管理服务端行为会消费持久化离线挂机投影，且不改变运行时真源。',
    completionMapping: 'release:proof:gm-world-offline-hanging-presence',
  }, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
