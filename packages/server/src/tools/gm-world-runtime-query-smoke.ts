// @ts-nocheck

/**
 * 用途：验证 GM 世界实例运行态会从 live instance 真源读取怪物实体。
 */
Object.defineProperty(exports, "__esModule", { value: true });

const assert = require('node:assert/strict');
const { NativeGmMapRuntimeQueryService } = require('../http/native/native-gm-map-runtime-query.service');

function createService(log = []) {
  const liveInstance = {
    tilePlane: {
      getCellCount() {
        return 65;
      },
      getX(cellIndex) {
        return cellIndex < 64 ? cellIndex % 8 : 9;
      },
      getY(cellIndex) {
        return cellIndex < 64 ? Math.trunc(cellIndex / 8) : 7;
      },
    },
    isInBounds(x, y) {
      return (x >= 0 && y >= 0 && x < 8 && y < 8) || (x === 9 && y === 7);
    },
    getEffectiveTileType(x, y) {
      if (x === 1 && y === 1) {
        return 'wall';
      }
      if (x === 9 && y === 7) {
        return 'stone';
      }
      return 'floor';
    },
    getTileAura() {
      return 7;
    },
    listTileResources() {
      return [];
    },
    listMonsters() {
      log.push(['listMonsters']);
      return [
        {
          runtimeId: 'monster:slime:1',
          x: 2,
          y: 3,
          char: '妖',
          color: '#7cb342',
          name: '试炼史莱姆',
          hp: 18,
          maxHp: 20,
          alive: true,
          aggroTargetPlayerId: 'player:test',
          respawnLeft: 0,
        },
      ];
    },
  };

  return new NativeGmMapRuntimeQueryService(
    {
      getOrThrow(mapId) {
        assert.equal(mapId, 'yunlai_town');
        return {
          id: 'yunlai_town',
          name: '云来镇',
          width: 8,
          height: 8,
          source: {
            tiles: Array.from({ length: 8 }, () => '........'),
            time: {},
          },
          baseAuraByTile: Array.from({ length: 64 }, () => 3),
          npcs: [],
          containers: [],
        };
      },
    },
    {
      getPlayer() {
        return undefined;
      },
    },
    {
      getInstance(instanceId) {
        log.push(['getInstance', instanceId]);
        if (instanceId !== 'public:yunlai_town') {
          return null;
        }
        return {
          instanceId,
          displayName: '云来镇·和平',
          templateId: 'yunlai_town',
          linePreset: 'peaceful',
          lineIndex: 1,
          instanceOrigin: 'bootstrap',
          defaultEntry: true,
          supportsPvp: false,
          canDamageTile: true,
          playerCount: 0,
          players: [],
          tick: 12,
          worldRevision: 34,
        };
      },
      getInstanceRuntime(instanceId) {
        log.push(['getInstanceRuntime', instanceId]);
        return instanceId === 'public:yunlai_town' ? liveInstance : null;
      },
      getRuntimeSummary() {
        return { tick: 99 };
      },
    },
    {
      getMapTickSpeed(mapId) {
        assert.equal(mapId, 'yunlai_town');
        return 1;
      },
      getMapTimeConfig(_mapId, fallback) {
        return fallback ?? {};
      },
      isMapPaused() {
        return false;
      },
    },
  );
}

function main() {
  const log = [];
  const service = createService(log);
  const runtime = service.getInstanceRuntime('public:yunlai_town', 0, 0, 5, 5);
  const monster = runtime.entities.find((entity) => entity.kind === 'monster');
  const runtimeTile = runtime.tiles[1]?.[1];
  const expandedRuntime = service.getInstanceRuntime('public:yunlai_town', 8, 7, 5, 5);

  assert.ok(monster, 'gm world runtime should include live monsters');
  assert.equal(runtimeTile?.type, 'wall', 'gm world runtime should project live effective tile type');
  assert.equal(runtimeTile?.walkable, false, 'gm world runtime should project live tile walkability');
  assert.equal(expandedRuntime.width, 10, 'gm world runtime should include live tile-plane width');
  assert.equal(expandedRuntime.tiles[0]?.[1]?.type, 'stone', 'gm world runtime should read expanded live tiles');
  assert.deepEqual(monster, {
    id: 'monster:slime:1',
    x: 2,
    y: 3,
    char: '妖',
    color: '#7cb342',
    name: '试炼史莱姆',
    kind: 'monster',
    hp: 18,
    maxHp: 20,
    dead: false,
    alive: true,
    targetPlayerId: 'player:test',
    respawnLeft: 0,
  });
  assert.deepEqual(log, [
    ['getInstance', 'public:yunlai_town'],
    ['getInstanceRuntime', 'public:yunlai_town'],
    ['listMonsters'],
    ['getInstance', 'public:yunlai_town'],
    ['getInstanceRuntime', 'public:yunlai_town'],
    ['listMonsters'],
  ]);

  console.log(JSON.stringify({
    ok: true,
    case: 'gm-world-runtime-query',
    monster,
  }, null, 2));
}

main();
