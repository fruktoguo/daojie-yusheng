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

function testPlayerViewKeepsFormationVisibleWhenRangeIntersectsView() {
  const player = {
    playerId: 'player:formation-view',
    instanceId: 'real:sky_ruins',
    x: 16,
    y: 30,
    attrs: { numericStats: { viewRange: 3 } },
  };
  const service = new WorldRuntimePlayerViewQueryService({
    getPlayer(playerId) {
      return playerId === player.playerId ? player : null;
    },
  }, {
    getPreparedContainerLootSource() {
      return null;
    },
  }, {
    resolveNpcQuestMarker() {
      return null;
    },
  });
  const instance = {
    meta: { instanceId: 'real:sky_ruins', templateId: 'sky_ruins' },
    template: { id: 'sky_ruins', width: 64, height: 64, source: {} },
    buildPlayerView() {
      return {
        tick: 1,
        instance: { instanceId: 'real:sky_ruins', templateId: 'sky_ruins', width: 64, height: 64 },
        self: { x: player.x, y: player.y, facing: 0 },
        visibleTileIndices: [
          (30 * 64) + 16,
          (31 * 64) + 16,
        ],
        localGroundPiles: [],
        localNpcs: [],
      };
    },
  };
  const runtime = {
    getPlayerLocation(playerId) {
      return playerId === player.playerId ? { instanceId: 'real:sky_ruins' } : null;
    },
    getInstanceRuntime(instanceId) {
      return instanceId === 'real:sky_ruins' ? instance : null;
    },
    worldRuntimeFormationService: {
      listRuntimeFormations(instanceId) {
        assert.equal(instanceId, 'real:sky_ruins');
        return [{
          id: 'formation:real:sky_ruins:4',
          x: 16,
          y: 34,
          name: '固脉阵',
          radius: 7,
          rangeShape: 'box',
          active: true,
        }];
      },
    },
  };

  const view = service.getPlayerView(runtime, player.playerId);
  assert.equal(view.localFormations.length, 1);
  assert.equal(view.localFormations[0].id, 'formation:real:sky_ruins:4');
}

function testPlayerViewUsesVisibleTileKeysForFormationRange() {
  const player = {
    playerId: 'player:formation-key-view',
    instanceId: 'real:sky_ruins',
    x: 16,
    y: 30,
    attrs: { numericStats: { viewRange: 3 } },
  };
  const service = new WorldRuntimePlayerViewQueryService({
    getPlayer(playerId) {
      return playerId === player.playerId ? player : null;
    },
  }, {
    getPreparedContainerLootSource() {
      return null;
    },
  }, {
    resolveNpcQuestMarker() {
      return null;
    },
  });
  const instance = {
    meta: { instanceId: 'real:sky_ruins', templateId: 'sky_ruins' },
    template: { id: 'sky_ruins', width: 64, height: 64, source: {} },
    buildPlayerView() {
      return {
        tick: 1,
        instance: { instanceId: 'real:sky_ruins', templateId: 'sky_ruins', width: 64, height: 64 },
        self: { x: player.x, y: player.y, facing: 0 },
        visibleTileIndices: [],
        visibleTileKeys: ['16,31'],
        localGroundPiles: [],
        localNpcs: [],
      };
    },
  };
  const runtime = {
    getPlayerLocation(playerId) {
      return playerId === player.playerId ? { instanceId: 'real:sky_ruins' } : null;
    },
    getInstanceRuntime(instanceId) {
      return instanceId === 'real:sky_ruins' ? instance : null;
    },
    worldRuntimeFormationService: {
      listRuntimeFormations(instanceId) {
        assert.equal(instanceId, 'real:sky_ruins');
        return [{
          id: 'formation:real:sky_ruins:key',
          x: 16,
          y: 34,
          name: '固脉阵',
          radius: 7,
          rangeShape: 'box',
          active: true,
        }];
      },
    },
  };

  const view = service.getPlayerView(runtime, player.playerId);
  assert.equal(view.localFormations.length, 1);
  assert.equal(view.localFormations[0].id, 'formation:real:sky_ruins:key');
}

testLootWindowUsesInstanceTickForContainerProjection();
testLootWindowUsesSearchTitleForNonHerbSources();
testPlayerViewKeepsFormationVisibleWhenRangeIntersectsView();
testPlayerViewUsesVisibleTileKeysForFormationRange();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-player-view-query' }, null, 2));
