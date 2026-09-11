import { SPIRIT_FARMLAND_BUILDING_ID } from '@mud/shared';

export interface PlantedHerbState {
  ownerPlayerId: string;
  seedItemId: string;
  farmlandBuildingId: string;
  expiresAtTick: number;
  container: Record<string, any>;
}

/** 动态植物只进入实例私有容器索引，不修改多实例共用的地图模板。 */
export function registerPlantedHerb(instance: any, planted: PlantedHerbState): void {
  const container = planted.container;
  const tileIndex = instance.toTileIndex(container.x, container.y);
  if (tileIndex < 0 || (instance.containerIdByTile.has(tileIndex)
    && instance.containerIdByTile.get(tileIndex) !== container.id)) {
    throw new Error('planted_herb_cell_occupied');
  }
  instance.containersById.set(container.id, { ...container, plantedExpiresAtTick: planted.expiresAtTick });
  instance.containerIdByTile.set(tileIndex, container.id);
  instance.markStaticTileSyncDirtyByIndex(tileIndex);
}

export function isPlantedHerbExpired(instance: any, planted: PlantedHerbState): boolean {
  if (instance.tick >= planted.expiresAtTick) return true;
  const farmland = instance.buildingById.get(planted.farmlandBuildingId);
  return !farmland || farmland.defId !== SPIRIT_FARMLAND_BUILDING_ID || farmland.state === 'destroyed';
}

export function removePlantedHerb(instance: any, planted: PlantedHerbState): void {
  const container = planted.container;
  const tileIndex = instance.toTileIndex(container.x, container.y);
  instance.containersById.delete(container.id);
  if (instance.containerIdByTile.get(tileIndex) === container.id) instance.containerIdByTile.delete(tileIndex);
  instance.localContainerViewCacheById.delete(container.id);
  instance.markStaticTileSyncDirtyByIndex(tileIndex);
}
