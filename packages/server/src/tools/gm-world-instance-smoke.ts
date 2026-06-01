// @ts-nocheck

const assert = require('node:assert/strict');

const { NativeGmWorldService } = require('../http/native/native-gm-world.service');
const { NativeGmMapRuntimeQueryService } = require('../http/native/native-gm-map-runtime-query.service');

function createService(log = [], overrides = {}) {
  const templates = new Map([
    ['yunlai_town', { id: 'yunlai_town', name: '云来镇', source: { time: { mode: 'day' } } }],
  ]);
  const instances = overrides.instances ?? [
    {
      instanceId: 'real:yunlai_town',
      displayName: '云来镇·真实',
      templateId: 'yunlai_town',
      templateName: '云来镇',
      linePreset: 'real',
      lineIndex: 1,
      instanceOrigin: 'bootstrap',
      defaultEntry: true,
      persistent: true,
      supportsPvp: true,
      canDamageTile: true,
      playerCount: 3,
    },
    {
      instanceId: 'line:yunlai_town:real:2',
      displayName: '云来镇·真实二线',
      templateId: 'yunlai_town',
      templateName: '云来镇',
      linePreset: 'real',
      lineIndex: 2,
      instanceOrigin: 'gm_manual',
      defaultEntry: false,
      persistent: false,
      persistentPolicy: 'ephemeral',
      supportsPvp: true,
      canDamageTile: true,
      playerCount: 1,
    },
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
      playerCount: 8,
    },
    {
      instanceId: 'line:yunlai_town:peaceful:2',
      displayName: '云来镇·和平二线',
      templateId: 'yunlai_town',
      templateName: '云来镇',
      linePreset: 'peaceful',
      lineIndex: 2,
      instanceOrigin: 'gm_manual',
      defaultEntry: false,
      persistent: false,
      persistentPolicy: 'ephemeral',
      supportsPvp: false,
      canDamageTile: true,
      playerCount: 2,
    },
  ];
  const onlinePlayers = new Map([
    ['player:online', { instanceId: 'public:yunlai_town', sessionId: 'session:online' }],
  ]);
  const runtimeInstances = overrides.runtimeInstances ?? instances.map((entry) => ({
    template: { id: entry.templateId },
    meta: { instanceId: entry.instanceId, persistent: entry.persistent === true },
    tickSpeed: 1,
    paused: false,
    markPersistenceDirtyDomains(domains) {
      log.push(['markPersistenceDirtyDomains', entry.instanceId, domains]);
    },
  }));
  const runtimeResponse = overrides.runtimeResponse ?? {
    instanceId: 'line:yunlai_town:real:2',
    instanceName: '云来镇·真实二线',
    mapId: 'yunlai_town',
    mapName: '云来镇',
    templateId: 'yunlai_town',
    templateName: '云来镇',
    linePreset: 'real',
    lineIndex: 2,
    instanceOrigin: 'gm_manual',
    defaultEntry: false,
    supportsPvp: true,
    canDamageTile: true,
    playerCount: 1,
    width: 64,
    height: 64,
    tiles: [],
    entities: [],
    time: {},
    timeConfig: {},
    tickSpeed: 1,
    tickPaused: false,
  };
  const worldRuntimeService = {
    listInstances() {
      log.push(['listInstances']);
      return instances.map((entry) => ({ ...entry }));
    },
    getInstance(instanceId) {
      log.push(['getInstance', instanceId]);
      return instances.find((entry) => entry.instanceId === instanceId) ? { instanceId } : null;
    },
    getPlayerLocation(playerId) {
      log.push(['getPlayerLocation', playerId]);
      return onlinePlayers.get(playerId) ?? null;
    },
    createInstance(input) {
      log.push(['createInstance', input]);
      return {
        snapshot() {
          return {
            ...input,
            templateName: templates.get(input.templateId)?.name ?? input.templateId,
            playerCount: 0,
            supportsPvp: input.linePreset === 'real',
            canDamageTile: true,
          };
        },
      };
    },
    listInstanceRuntimes() {
      log.push(['listInstanceRuntimes']);
      return runtimeInstances;
    },
    playerRuntimeService: {
      getPlayer(playerId) {
        log.push(['getRuntimePlayer', playerId]);
        return playerId === 'player:online'
          ? { playerId, hp: 100 }
          : null;
      },
    },
    worldRuntimeGmQueueService: {
      hasPendingRespawn(playerId) {
        log.push(['hasPendingRespawn', playerId]);
        return false;
      },
    },
    worldRuntimeCommandIntakeFacadeService: {
      enqueueGmUpdatePlayer(input) {
        log.push(['enqueueGmUpdatePlayer', input]);
        return { queued: true };
      },
    },
    getPool() {
      return null;
    },
  };

  return new NativeGmWorldService(
    { loadAll() {} },
    { buildPerformanceSnapshot() { return {}; }, resetNetworkPerfCounters() {} },
    {
      getOrThrow(mapId) {
        const template = templates.get(mapId);
        if (!template) {
          throw new Error(`unknown map ${mapId}`);
        }
        return template;
      },
      loadAll() {},
      listSummaries() {
        return Array.from(templates.values()).map((entry) => ({ id: entry.id }));
      },
    },
    {
      updateMapTick(mapId, body) { log.push(['updateMapTick', mapId, body]); },
      updateMapTime() {},
      pruneMapConfigs() {},
    },
    {
      getState() { return {}; },
      invalidatePlayerListCaches() {
        log.push(['invalidatePlayerListCaches']);
      },
    },
    { getEditorCatalog() { return {}; } },
    { getMaps() { return {}; } },
    {
      getMapRuntime(mapId, x, y, w, h) {
        log.push(['getMapRuntime', mapId, x, y, w, h]);
        return { mapId };
      },
      getInstanceRuntime(instanceId, x, y, w, h) {
        log.push(['getInstanceRuntime', instanceId, x, y, w, h]);
        return {
          ...runtimeResponse,
          instanceId,
        };
      },
    },
    { listNodes() { return []; }, isEnabled() { return true; }, getNodeId() { return 'node:test'; } },
    { listRetryQueue() { return []; }, getPool() { return null; }, listInstances() { return []; } },
    { getOperationReplay() { return {}; }, getPool() { return null; }, listInstances() { return []; } },
    { flushPlayer() {}, getPool() { return null; }, listInstances() { return []; } },
    {
      flushInstance(instanceId) {
        log.push(['flushInstance', instanceId]);
      },
      getPool() { return null; },
      listInstances() { return []; },
    },
    { getPool() { return null; } },
    worldRuntimeService,
  );
}

async function testGetWorldInstancesSortsByPresetAndIndex() {
  const service = createService([]);
  const result = await service.getWorldInstances();
  assert.deepEqual(
    result.instances.map((entry) => entry.instanceId),
    [
      'public:yunlai_town',
      'line:yunlai_town:peaceful:2',
      'real:yunlai_town',
      'line:yunlai_town:real:2',
    ],
  );
}

async function testGetWorldInstanceRuntimeDelegatesToInstanceQuery() {
  const log = [];
  const service = createService(log);
  const result = await service.getWorldInstanceRuntime('line:yunlai_town:real:2', '1', '2', '3', '4', 'viewer:gm');
  assert.equal(result.instanceId, 'line:yunlai_town:real:2');
  assert.deepEqual(log, [
    ['getInstanceRuntime', 'line:yunlai_town:real:2', '1', '2', '3', '4'],
  ]);
}

function testCreateWorldInstanceBuildsNextManualLine() {
  const log = [];
  const service = createService(log);
  const result = service.createWorldInstance({
    templateId: 'yunlai_town',
    linePreset: 'real',
    displayName: '云来镇·真实三线',
  });
  assert.deepEqual(result, {
    instance: {
      instanceId: 'line:yunlai_town:real:3',
      templateId: 'yunlai_town',
      kind: 'public',
      persistent: true,
      persistentPolicy: 'persistent',
      displayName: '云来镇·真实三线',
      linePreset: 'real',
      lineIndex: 3,
      instanceOrigin: 'gm_manual',
      defaultEntry: false,
      templateName: '云来镇',
      playerCount: 0,
      supportsPvp: true,
      canDamageTile: true,
    },
  });
  assert.deepEqual(log, [
    ['listInstances'],
    ['createInstance', {
      instanceId: 'line:yunlai_town:real:3',
      templateId: 'yunlai_town',
      kind: 'public',
      persistent: true,
      persistentPolicy: 'persistent',
      displayName: '云来镇·真实三线',
      linePreset: 'real',
      lineIndex: 3,
      instanceOrigin: 'gm_manual',
      defaultEntry: false,
    }],
  ]);
}

function testCreateWorldInstanceSupportsLifecycleOptions() {
  const log = [];
  const service = createService(log);
  const expireAt = Date.now() + 60_000;
  const result = service.createWorldInstance({
    templateId: 'yunlai_town',
    linePreset: 'peaceful',
    persistentPolicy: 'session',
    expireAt,
  });
  assert.equal(result.instance.persistent, true);
  assert.equal(result.instance.persistentPolicy, 'session');
  assert.equal(result.instance.destroyAt, new Date(expireAt).toISOString());
}

function testTransferPlayerToInstanceEnqueuesExplicitInstanceId() {
  const log = [];
  const service = createService(log);
  const result = service.transferPlayerToInstance({
    playerId: ' player:online ',
    instanceId: ' line:yunlai_town:real:2 ',
    x: 18.9,
    y: 7.2,
  });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(log, [
    ['getInstance', 'line:yunlai_town:real:2'],
    ['getPlayerLocation', 'player:online'],
    ['getRuntimePlayer', 'player:online'],
    ['hasPendingRespawn', 'player:online'],
    ['enqueueGmUpdatePlayer', {
      playerId: 'player:online',
      instanceId: 'line:yunlai_town:real:2',
      x: 18,
      y: 7,
    }],
    ['invalidatePlayerListCaches'],
  ]);
}

function testCreateWorldInstanceRejectsInvalidInput() {
  const service = createService([]);
  assert.throws(() => {
    service.createWorldInstance({ templateId: 'yunlai_town', linePreset: 'invalid' });
  }, /分线预设必须是和平线或真实线/);
}

function testTransferPlayerToInstanceRejectsOfflinePlayer() {
  const service = createService([]);
  assert.throws(() => {
    service.transferPlayerToInstance({
      playerId: 'player:offline',
      instanceId: 'line:yunlai_town:real:2',
    });
  }, /目标玩家未在线/);
}

async function testUpdateMapTickPersistsAffectedInstanceCheckpoints() {
  const log = [];
  const service = createService(log);
  await service.updateMapTick('yunlai_town', { speed: 5, paused: false });
  assert.deepEqual(
    log.filter((entry) => Array.isArray(entry) && entry[0] === 'markPersistenceDirtyDomains'),
    [
      ['markPersistenceDirtyDomains', 'real:yunlai_town', ['time']],
      ['markPersistenceDirtyDomains', 'line:yunlai_town:real:2', ['time']],
      ['markPersistenceDirtyDomains', 'public:yunlai_town', ['time']],
      ['markPersistenceDirtyDomains', 'line:yunlai_town:peaceful:2', ['time']],
    ],
  );
  assert.deepEqual(
    log.filter((entry) => Array.isArray(entry) && entry[0] === 'flushInstance'),
    [
      ['flushInstance', 'real:yunlai_town'],
      ['flushInstance', 'line:yunlai_town:real:2'],
      ['flushInstance', 'public:yunlai_town'],
      ['flushInstance', 'line:yunlai_town:peaceful:2'],
    ],
  );
}

function testMapRuntimeQueryUsesInstanceTickSpeedAfterRestart() {
  const template = {
    id: 'yunlai_town',
    name: '云来镇',
    width: 1,
    height: 1,
    baseAuraByTile: [0],
    source: {
      tiles: ['.'],
      time: { scale: 1 },
    },
    npcs: [],
    containers: [],
  };
  const query = new NativeGmMapRuntimeQueryService(
    {
      getOrThrow(mapId) {
        assert.equal(mapId, 'yunlai_town');
        return template;
      },
    },
    { getPlayer() { return null; } },
    {
      getInstance(instanceId) {
        assert.equal(instanceId, 'public:yunlai_town');
        return {
          instanceId,
          displayName: '云来镇·和平',
          templateId: 'yunlai_town',
          players: [],
          tick: 900,
          playerCount: 0,
        };
      },
      getInstanceRuntime(instanceId) {
        assert.equal(instanceId, 'public:yunlai_town');
        return {
          tickSpeed: 7,
          paused: false,
          getTileAura() { return 0; },
          listMonsters() { return []; },
        };
      },
      getRuntimeSummary() {
        return { tick: 1 };
      },
      worldRuntimeFormationService: {
        listRuntimeFormations() {
          return [];
        },
      },
    },
    {
      getMapTickSpeed() { return 1; },
      getMapTimeConfig(_mapId, fallback) { return fallback; },
      isMapPaused() { return false; },
    },
  );
  const runtime = query.getInstanceRuntime('public:yunlai_town', 0, 0, 1, 1);
  assert.equal(runtime.tickSpeed, 7);
  assert.equal(runtime.tickPaused, false);
}

void (async () => {
  await testGetWorldInstancesSortsByPresetAndIndex();
  await testGetWorldInstanceRuntimeDelegatesToInstanceQuery();
  testCreateWorldInstanceBuildsNextManualLine();
  testCreateWorldInstanceSupportsLifecycleOptions();
  testTransferPlayerToInstanceEnqueuesExplicitInstanceId();
  testCreateWorldInstanceRejectsInvalidInput();
  testTransferPlayerToInstanceRejectsOfflinePlayer();
  await testUpdateMapTickPersistsAffectedInstanceCheckpoints();
  testMapRuntimeQueryUsesInstanceTickSpeedAfterRestart();
  console.log(JSON.stringify({ ok: true, case: 'gm-world-instance' }, null, 2));
})();
