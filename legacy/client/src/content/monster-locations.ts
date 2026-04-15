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

/** loadMonsterLocationCatalog：加载外部资源或状态。 */
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

/** hasLoadedMonsterLocationCatalog：判断并返回条件结果。 */
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

/** loadMonsterLocationEntry：加载外部资源或状态。 */
export async function loadMonsterLocationEntry(monsterId: string): Promise<MonsterLocationEntry | null> {
  const catalog = await loadMonsterLocationCatalog();
  return catalog[monsterId] ?? null;
}

