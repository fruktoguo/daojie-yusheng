import { ContentTemplateRepository } from '../content/content-template.repository';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { getDefaultBuildingRuntime } from '../runtime/building/building-default-content';

export function createPlantingContent(): ContentTemplateRepository {
  const content = new ContentTemplateRepository();
  content.itemRegistry.loadAll();
  content.plantingContent.load(content.itemRegistry);
  return content;
}

export function createPlantingInstance(instanceId = 'real:planting-smoke'): MapInstanceRuntime {
  const maps = new MapTemplateRepository();
  maps.registerRuntimeMapTemplate({
    id: 'planting-smoke', name: '种植验证', width: 9, height: 9, routeDomain: 'system',
    tiles: Array.from({ length: 9 }, () => '.........'), spawnPoint: { x: 8, y: 8 },
    portals: [], npcs: [], monsters: [], safeZones: [], landmarks: [], containers: [], auras: [], mapLv: 2,
  });
  const instance = new MapInstanceRuntime({
    instanceId, template: maps.getOrThrow('planting-smoke'), monsterSpawns: [], kind: 'public',
    persistent: true, createdAt: Date.now(), displayName: '种植验证', linePreset: 'real', lineIndex: 1,
    instanceOrigin: 'smoke', defaultEntry: true, canDamageTile: true,
  });
  const building = getDefaultBuildingRuntime();
  instance.configureBuildingRuntime(building.catalog, building.rules);
  return instance;
}

export function withPlantingRandom<T>(value: number, run: () => T): T {
  const previous = Math.random;
  Math.random = () => value;
  try { return run(); } finally { Math.random = previous; }
}
