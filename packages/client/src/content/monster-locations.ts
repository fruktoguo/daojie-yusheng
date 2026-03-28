export interface MonsterLocationEntry {
  monsterId: string;
  monsterName: string;
  mapId: string;
  mapName: string;
  dangerLevel?: number;
  totalMaps: number;
}

type MonsterLocationCatalog = Record<string, MonsterLocationEntry>;
let monsterLocationCatalog: MonsterLocationCatalog | null = null;
let monsterLocationCatalogPromise: Promise<MonsterLocationCatalog> | null = null;

function loadMonsterLocationCatalog(): Promise<MonsterLocationCatalog> {
  if (monsterLocationCatalog) {
    return Promise.resolve(monsterLocationCatalog);
  }
  if (!monsterLocationCatalogPromise) {
    monsterLocationCatalogPromise = import('../constants/world/monster-locations.generated.json')
      .then((module) => {
        monsterLocationCatalog = module.default as MonsterLocationCatalog;
        return monsterLocationCatalog;
      });
  }
  return monsterLocationCatalogPromise;
}

export function hasLoadedMonsterLocationCatalog(): boolean {
  return monsterLocationCatalog !== null;
}

export async function preloadMonsterLocationCatalog(): Promise<void> {
  await loadMonsterLocationCatalog();
}

export function getMonsterLocationEntry(monsterId: string): MonsterLocationEntry | null {
  if (!monsterLocationCatalog) {
    void loadMonsterLocationCatalog();
    return null;
  }
  return monsterLocationCatalog[monsterId] ?? null;
}

export async function loadMonsterLocationEntry(monsterId: string): Promise<MonsterLocationEntry | null> {
  const catalog = await loadMonsterLocationCatalog();
  return catalog[monsterId] ?? null;
}
