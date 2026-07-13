import assert from 'node:assert/strict';

import { TileType } from '@mud/shared';

import { getDefaultBuildingRuntime } from '../runtime/building/building-default-content';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';
import { resolvePlayerComprehensionSpeedRate } from '../runtime/player/player-progression-rule.helpers';

const WINDOW_ANCHOR = { x: -1, y: -8 };
const MAT_ANCHOR = { x: 0, y: -8 };
const STALE_WINDOW_CELL = { x: -15, y: -13 };
const STALE_MAT_CELL = { x: -14, y: -13 };
const ORPHAN_WINDOW_CELL = { x: -13, y: -13 };
const ORPHAN_DOOR_CELL = { x: -12, y: -13 };

function createInstance(sectMap = true): MapInstanceRuntime {
  const templateRepository = new MapTemplateRepository();
  templateRepository.registerRuntimeMapTemplate({
    id: 'building_cell_recovery_smoke',
    name: '建筑占格恢复烟测',
    width: 3,
    height: 3,
    routeDomain: 'system',
    sectMap,
    tiles: [
      '...',
      '...',
      '...',
    ],
    spawnPoint: { x: 1, y: 1 },
    portals: [],
    npcs: [],
    monsters: [],
    safeZones: [],
    landmarks: [],
    containers: [],
    auras: [],
  });
  const instance = new MapInstanceRuntime({
    instanceId: 'public:building_cell_recovery_smoke',
    template: templateRepository.getOrThrow('building_cell_recovery_smoke'),
    monsterSpawns: [],
    kind: 'public',
    persistent: true,
    createdAt: Date.now(),
    displayName: '建筑占格恢复烟测',
    linePreset: 'peaceful',
    lineIndex: 1,
    instanceOrigin: 'smoke',
    defaultEntry: true,
    canDamageTile: true,
  });
  const { catalog, rules } = getDefaultBuildingRuntime();
  instance.configureBuildingRuntime(catalog, rules);
  return instance;
}

function buildPreviousTilePersistenceState(previousState: Record<string, unknown>) {
  return {
    previousTileType: previousState.tileType,
    previousTerrainType: previousState.terrainType,
    previousSurfaceType: previousState.surfaceType,
    previousStructureType: previousState.structureType,
    previousInteractableKinds: previousState.interactableKinds,
  };
}

function main() {
  const instance = createInstance();
  const windowDef = instance.buildingCatalog?.defById?.get('wooden_window');
  assert.ok(windowDef);

  const staleWindowCellIndex = instance.activateRuntimeTile(
    STALE_WINDOW_CELL.x,
    STALE_WINDOW_CELL.y,
    TileType.Floor,
  ).tileIndex;
  const staleMatCellIndex = instance.activateRuntimeTile(
    STALE_MAT_CELL.x,
    STALE_MAT_CELL.y,
    TileType.Floor,
  ).tileIndex;
  const canonicalWindowCellIndex = instance.activateRuntimeTile(
    WINDOW_ANCHOR.x,
    WINDOW_ANCHOR.y,
    TileType.Floor,
  ).tileIndex;
  const canonicalMatCellIndex = instance.activateRuntimeTile(
    MAT_ANCHOR.x,
    MAT_ANCHOR.y,
    TileType.Floor,
  ).tileIndex;

  const previousWindowState = instance.captureBuildingPreviousTileState(staleWindowCellIndex);
  instance.applyBuildingVisualTileType(staleWindowCellIndex, windowDef);
  assert.equal(instance.getEffectiveTileType(STALE_WINDOW_CELL.x, STALE_WINDOW_CELL.y), TileType.Window);
  instance.clearDirtyDomains();

  const hydrateResult = instance.hydrateBuildingRoomFengShuiState({
    buildings: [
      {
        id: 'building:recovery:window',
        defId: 'wooden_window',
        x: WINDOW_ANCHOR.x,
        y: WINDOW_ANCHOR.y,
        rotation: 0,
        state: 'active',
        hp: 60,
        maxHp: 60,
        cells: [{
          tileIndex: staleWindowCellIndex,
          x: STALE_WINDOW_CELL.x,
          y: STALE_WINDOW_CELL.y,
          ...buildPreviousTilePersistenceState(previousWindowState),
        }],
      },
      {
        id: 'building:recovery:mat',
        defId: 'meditation_mat',
        x: MAT_ANCHOR.x,
        y: MAT_ANCHOR.y,
        rotation: 0,
        state: 'active',
        hp: 60,
        maxHp: 60,
        cells: [{
          tileIndex: staleMatCellIndex,
          x: STALE_MAT_CELL.x,
          y: STALE_MAT_CELL.y,
        }],
      },
    ],
    rooms: [],
    roomCells: [],
    fengShui: [],
  });

  assert.equal(hydrateResult.repairedBuildingCellCount, 2);
  assert.equal(hydrateResult.repairedBuildingVisualCellCount, 1);
  assert.equal(hydrateResult.restoredStaleBuildingVisualCellCount, 1);
  assert.deepEqual(
    instance.getBuildingRoomFengShuiAt(WINDOW_ANCHOR.x, WINDOW_ANCHOR.y)?.buildingIds,
    ['building:recovery:window'],
  );
  assert.deepEqual(
    instance.getBuildingRoomFengShuiAt(MAT_ANCHOR.x, MAT_ANCHOR.y)?.buildingIds,
    ['building:recovery:mat'],
  );
  assert.deepEqual(
    instance.getBuildingRoomFengShuiAt(STALE_WINDOW_CELL.x, STALE_WINDOW_CELL.y)?.buildingIds,
    [],
  );
  assert.equal(instance.getEffectiveTileType(WINDOW_ANCHOR.x, WINDOW_ANCHOR.y), TileType.Window);
  assert.equal(instance.getEffectiveTileType(STALE_WINDOW_CELL.x, STALE_WINDOW_CELL.y), TileType.Floor);

  const player = {
    instanceId: instance.meta.instanceId,
    x: MAT_ANCHOR.x,
    y: MAT_ANCHOR.y,
    attrs: {
      numericStats: { techniqueExpRate: 0 },
      craftEffectStats: {},
    },
  };
  assert.equal(resolvePlayerComprehensionSpeedRate(player, { instanceRuntime: instance }), 1);

  const persistedBuildings = instance.buildBuildingPersistenceEntries();
  const persistedWindowCell = persistedBuildings
    .find((building) => building.id === 'building:recovery:window')
    ?.cells?.[0];
  const persistedMatCell = persistedBuildings
    .find((building) => building.id === 'building:recovery:mat')
    ?.cells?.[0];
  assert.deepEqual(
    { tileIndex: persistedWindowCell?.tileIndex, x: persistedWindowCell?.x, y: persistedWindowCell?.y },
    { tileIndex: canonicalWindowCellIndex, ...WINDOW_ANCHOR },
  );
  assert.deepEqual(
    { tileIndex: persistedMatCell?.tileIndex, x: persistedMatCell?.x, y: persistedMatCell?.y },
    { tileIndex: canonicalMatCellIndex, ...MAT_ANCHOR },
  );
  assert.equal(instance.getDirtyDomains().has('building'), true);
  assert.equal(instance.getDirtyDomains().has('tile_cell'), true);

  const doorDef = instance.buildingCatalog?.defById?.get('wooden_door');
  assert.ok(doorDef);
  const orphanWindowCellIndex = instance.activateRuntimeTile(
    ORPHAN_WINDOW_CELL.x,
    ORPHAN_WINDOW_CELL.y,
    TileType.Floor,
  ).tileIndex;
  const orphanDoorCellIndex = instance.activateRuntimeTile(
    ORPHAN_DOOR_CELL.x,
    ORPHAN_DOOR_CELL.y,
    TileType.Floor,
  ).tileIndex;
  instance.applyBuildingVisualTileType(orphanWindowCellIndex, windowDef);
  instance.applyBuildingVisualTileType(orphanDoorCellIndex, doorDef);
  const damagedOrphanWindow = instance.damageTile(
    ORPHAN_WINDOW_CELL.x,
    ORPHAN_WINDOW_CELL.y,
    1,
  );
  assert.equal(damagedOrphanWindow?.destroyed, false);
  instance.clearDirtyDomains();

  const orphanScan = instance.scanOrphanSectBuildingVisuals();
  assert.equal(orphanScan.eligible, true);
  assert.deepEqual(
    orphanScan.candidates.map((candidate) => [candidate.x, candidate.y, candidate.structureType]),
    [
      [ORPHAN_WINDOW_CELL.x, ORPHAN_WINDOW_CELL.y, TileType.Window],
      [ORPHAN_DOOR_CELL.x, ORPHAN_DOOR_CELL.y, TileType.Door],
    ],
  );
  assert.equal(
    orphanScan.candidates.some((candidate) => (
      candidate.x === WINDOW_ANCHOR.x && candidate.y === WINDOW_ANCHOR.y
    )),
    false,
  );

  const orphanCleanup = instance.removeOrphanSectBuildingVisuals();
  assert.equal(orphanCleanup.removedCount, 2);
  assert.equal(orphanCleanup.clearedTileDamageCount, 1);
  assert.equal(instance.getEffectiveTileType(ORPHAN_WINDOW_CELL.x, ORPHAN_WINDOW_CELL.y), TileType.Floor);
  assert.equal(instance.getEffectiveTileType(ORPHAN_DOOR_CELL.x, ORPHAN_DOOR_CELL.y), TileType.Floor);
  assert.equal(instance.getEffectiveTileType(WINDOW_ANCHOR.x, WINDOW_ANCHOR.y), TileType.Window);
  assert.equal(
    instance.buildTileDamagePersistenceEntries().some((entry) => (
      entry.x === ORPHAN_WINDOW_CELL.x && entry.y === ORPHAN_WINDOW_CELL.y
    )),
    false,
  );
  assert.equal(instance.getDirtyDomains().has('tile_cell'), true);
  assert.equal(instance.getDirtyDomains().has('tile_damage'), true);
  assert.equal(instance.getDirtyDomains().has('room'), true);
  assert.equal(instance.getDirtyDomains().has('fengshui'), true);
  assert.equal(instance.removeOrphanSectBuildingVisuals().removedCount, 0);

  const ordinaryInstance = createInstance(false);
  const ordinaryWindowDef = ordinaryInstance.buildingCatalog?.defById?.get('wooden_window');
  assert.ok(ordinaryWindowDef);
  const ordinaryWindowCellIndex = ordinaryInstance.activateRuntimeTile(-1, -1, TileType.Floor).tileIndex;
  ordinaryInstance.applyBuildingVisualTileType(ordinaryWindowCellIndex, ordinaryWindowDef);
  assert.equal(ordinaryInstance.scanOrphanSectBuildingVisuals().eligible, false);
  assert.equal(ordinaryInstance.removeOrphanSectBuildingVisuals().removedCount, 0);
  assert.equal(ordinaryInstance.getEffectiveTileType(-1, -1), TileType.Window);

  const destroyedWindow = instance.damageTile(
    WINDOW_ANCHOR.x,
    WINDOW_ANCHOR.y,
    Number.MAX_SAFE_INTEGER,
  );
  assert.equal(destroyedWindow?.destroyed, true);
  assert.equal(instance.getEffectiveTileType(WINDOW_ANCHOR.x, WINDOW_ANCHOR.y), TileType.Floor);
  assert.equal(instance.getEffectiveTileType(STALE_WINDOW_CELL.x, STALE_WINDOW_CELL.y), TileType.Floor);

  console.log('building-cell-recovery-smoke passed');
}

main();
