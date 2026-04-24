// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimePlayerViewQueryService } = require("../runtime/world/world-runtime-player-view-query.service");

function testLootWindowUsesInstanceTickForContainerProjection() {
  const log = [];
  const playerRuntimeService = {
    getPlayer(playerId) {
      return playerId === 'player:1'
        ? {
            playerId,
            instanceId: 'public:yunlai_town',
            x: 10,
            y: 10,
            attrs: { numericStats: { viewRange: 6 } },
          }
        : null;
    },
  };
  const lootContainerService = {
    getPreparedContainerLootSource(instanceId, container, _player, tick) {
      log.push(['getPreparedContainerLootSource', instanceId, container.id, tick]);
      return {
        sourceId: `container:${instanceId}:${container.id}`,
        kind: 'container',
        title: container.name,
        variant: container.variant,
        searchable: false,
        items: [],
        emptyText: `还需 ${tick} 息`,
      };
    },
  };
  const service = new WorldRuntimePlayerViewQueryService(playerRuntimeService, lootContainerService, {
    resolveNpcQuestMarker() {
      return null;
    },
  });
  const instance = {
    meta: { instanceId: 'public:yunlai_town' },
    tick: 7,
    buildPlayerView() {
      return {
        tick: 7,
        localGroundPiles: [],
        localNpcs: [],
      };
    },
    getContainerAtTile(x, y) {
      return x === 10 && y === 10
        ? { id: 'herb:1', name: '青灵茎', x, y, variant: 'herb' }
        : null;
    },
  };
  const runtime = {
    tick: 999,
    getPlayerLocation(playerId) {
      return playerId === 'player:1' ? { instanceId: 'public:yunlai_town' } : null;
    },
    getInstanceRuntime(instanceId) {
      return instanceId === 'public:yunlai_town' ? instance : null;
    },
    getInstanceRuntimeOrThrow(instanceId) {
      assert.equal(instanceId, 'public:yunlai_town');
      return instance;
    },
  };

  const window = service.buildLootWindowSyncState(runtime, 'player:1', 10, 10);
  assert.equal(window?.sources.length, 1);
  assert.equal(window?.title, '采集 · (10, 10)');
  assert.deepEqual(log, [['getPreparedContainerLootSource', 'public:yunlai_town', 'herb:1', 7]]);
}

function testLootWindowUsesSearchTitleForNonHerbSources() {
  const playerRuntimeService = {
    getPlayer(playerId) {
      return playerId === 'player:1'
        ? {
            playerId,
            instanceId: 'public:yunlai_town',
            x: 10,
            y: 10,
            attrs: { numericStats: { viewRange: 6 } },
          }
        : null;
    },
  };
  const service = new WorldRuntimePlayerViewQueryService(playerRuntimeService, {
    getPreparedContainerLootSource() {
      return null;
    },
  }, {
    resolveNpcQuestMarker() {
      return null;
    },
  });
  const instance = {
    meta: { instanceId: 'public:yunlai_town' },
    tick: 7,
    buildPlayerView() {
      return {
        tick: 7,
        localGroundPiles: [{
          sourceId: 'ground:1',
          x: 10,
          y: 10,
          items: [{
            itemKey: 'item:1',
            itemId: 'mat.stone',
            count: 1,
            name: '碎石',
            type: 'material',
          }],
        }],
        localNpcs: [],
      };
    },
    getContainerAtTile() {
      return null;
    },
  };
  const runtime = {
    tick: 999,
    getPlayerLocation(playerId) {
      return playerId === 'player:1' ? { instanceId: 'public:yunlai_town' } : null;
    },
    getInstanceRuntime(instanceId) {
      return instanceId === 'public:yunlai_town' ? instance : null;
    },
    getInstanceRuntimeOrThrow(instanceId) {
      assert.equal(instanceId, 'public:yunlai_town');
      return instance;
    },
  };

  const window = service.buildLootWindowSyncState(runtime, 'player:1', 10, 10);
  assert.equal(window?.title, '搜索 · (10, 10)');
}

testLootWindowUsesInstanceTickForContainerProjection();
testLootWindowUsesSearchTitleForNonHerbSources();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-player-view-query' }, null, 2));
