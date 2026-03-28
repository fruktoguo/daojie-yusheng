import monsterLocationCatalog from '../constants/world/monster-locations.generated.json';

export interface MonsterLocationEntry {
  monsterId: string;
  monsterName: string;
  mapId: string;
  mapName: string;
  dangerLevel?: number;
  totalMaps: number;
}

type MonsterLocationCatalog = Record<string, MonsterLocationEntry>;

const MONSTER_LOCATION_CATALOG = monsterLocationCatalog as MonsterLocationCatalog;

export function getMonsterLocationEntry(monsterId: string): MonsterLocationEntry | null {
  return MONSTER_LOCATION_CATALOG[monsterId] ?? null;
}
