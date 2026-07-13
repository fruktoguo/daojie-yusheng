import assert from 'node:assert/strict';

import { StructureType, TileType } from '@mud/shared';

import { OrphanSectBuildingVisualsConversion } from '../gm/compat-conversions/conversions/building/orphan-sect-building-visuals';
import { getDefaultBuildingRuntime } from '../runtime/building/building-default-content';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';

const INSTANCE_ID = 'sect:conversion-smoke:main';
const ORPHAN_CELL = { x: -4, y: -3 };

function createInstance(): MapInstanceRuntime {
  const templateRepository = new MapTemplateRepository();
  templateRepository.registerRuntimeMapTemplate({
    id: 'orphan_sect_building_visual_conversion_smoke',
    name: '宗门孤儿门窗转换烟测',
    width: 1,
    height: 1,
    routeDomain: 'sect:conversion-smoke',
    sectMap: true,
    tiles: ['P'],
    spawnPoint: { x: 0, y: 0 },
    portals: [],
    npcs: [],
    monsters: [],
    safeZones: [],
    landmarks: [],
    containers: [],
    auras: [],
  });
  const instance = new MapInstanceRuntime({
    instanceId: INSTANCE_ID,
    template: templateRepository.getOrThrow('orphan_sect_building_visual_conversion_smoke'),
    monsterSpawns: [],
    kind: 'sect',
    persistent: true,
    createdAt: Date.now(),
    displayName: '宗门孤儿门窗转换烟测',
    linePreset: 'peaceful',
    lineIndex: 1,
    instanceOrigin: 'smoke',
    defaultEntry: false,
    canDamageTile: true,
  });
  const { catalog, rules } = getDefaultBuildingRuntime();
  instance.configureBuildingRuntime(catalog, rules);
  return instance;
}

async function main(): Promise<void> {
  const instance = createInstance();
  const windowDef = instance.buildingCatalog?.defById?.get('wooden_window');
  assert.ok(windowDef);
  const orphanCellIndex = instance.activateRuntimeTile(
    ORPHAN_CELL.x,
    ORPHAN_CELL.y,
    TileType.Floor,
  ).tileIndex;
  instance.applyBuildingVisualTileType(orphanCellIndex, windowDef);
  assert.equal(instance.getEffectiveTileType(ORPHAN_CELL.x, ORPHAN_CELL.y), TileType.Window);

  let persistedRows: Array<Record<string, unknown>> = [{
    instance_id: INSTANCE_ID,
    x: ORPHAN_CELL.x,
    y: ORPHAN_CELL.y,
    tile_type: TileType.Window,
    structure_type: StructureType.Window,
    has_tile_damage: false,
  }];
  let flushCount = 0;
  const pool = {
    async query() {
      return { rows: persistedRows, rowCount: persistedRows.length };
    },
  };
  const databasePoolProvider = {
    getPool() {
      return pool;
    },
  };
  const worldRuntimeService = {
    listInstanceEntries() {
      return [[INSTANCE_ID, instance]] as Array<[string, MapInstanceRuntime]>;
    },
    isInstanceLeaseWritable(target: MapInstanceRuntime) {
      return target === instance;
    },
    async flushInstanceDomains(instanceId: string, domains: readonly string[]) {
      assert.equal(instanceId, INSTANCE_ID);
      assert.deepEqual(domains, ['building', 'tile_cell', 'tile_damage', 'room', 'fengshui']);
      flushCount += 1;
      persistedRows = [];
      instance.clearDirtyDomains();
      return { persistedDomains: [...domains], skipped: false };
    },
  };
  const conversion = new OrphanSectBuildingVisualsConversion(
    databasePoolProvider as never,
    worldRuntimeService,
    null,
  );

  const preview = await conversion.run({ mode: 'dry-run' });
  assert.equal(preview.matchedRows, 1);
  assert.equal(preview.convertedRows, 1);
  assert.equal(preview.skippedRows, 0);
  assert.equal(preview.failedRows, 0);
  assert.equal(preview.verifiedRows, 1);
  assert.equal(instance.getEffectiveTileType(ORPHAN_CELL.x, ORPHAN_CELL.y), TileType.Window);
  assert.equal(flushCount, 0);

  // 模拟前一次尝试已修正运行态、但刷盘失败的中间态；重试必须能用运行态全量覆盖数据库。
  assert.equal(instance.removeOrphanSectBuildingVisuals().removedCount, 1);
  assert.equal(instance.getEffectiveTileType(ORPHAN_CELL.x, ORPHAN_CELL.y), TileType.Floor);

  const retryPreview = await conversion.run({ mode: 'dry-run' });
  assert.equal(retryPreview.matchedRows, 1);
  assert.equal(retryPreview.convertedRows, 1);
  assert.equal(retryPreview.skippedRows, 0);

  const applied = await conversion.run({ mode: 'apply' });
  assert.equal(applied.matchedRows, 1);
  assert.equal(applied.convertedRows, 1);
  assert.equal(applied.skippedRows, 0);
  assert.equal(applied.failedRows, 0);
  assert.equal(applied.verifiedRows, 1);
  assert.equal(typeof applied.appliedAt, 'string');
  assert.equal(instance.getEffectiveTileType(ORPHAN_CELL.x, ORPHAN_CELL.y), TileType.Floor);
  assert.equal(flushCount, 1);

  const repeated = await conversion.run({ mode: 'dry-run' });
  assert.equal(repeated.matchedRows, 0);
  assert.equal(repeated.convertedRows, 0);
  assert.equal(repeated.failedRows, 0);

  console.log('orphan-sect-building-visual-conversion-smoke passed');
}

void main();
