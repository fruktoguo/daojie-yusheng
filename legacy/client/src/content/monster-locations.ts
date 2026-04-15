/** MonsterLocationEntry：定义该接口的能力与字段约束。 */
export interface MonsterLocationEntry {
/** monsterId：定义该变量以承载业务值。 */
  monsterId: string;
/** monsterName：定义该变量以承载业务值。 */
  monsterName: string;
/** mapId：定义该变量以承载业务值。 */
  mapId: string;
/** mapName：定义该变量以承载业务值。 */
  mapName: string;
  dangerLevel?: number;
/** totalMaps：定义该变量以承载业务值。 */
  totalMaps: number;
}

/** MonsterLocationCatalog：定义该类型的结构与数据语义。 */
type MonsterLocationCatalog = Record<string, MonsterLocationEntry>;
/** monsterLocationCatalog：定义该变量以承载业务值。 */
let monsterLocationCatalog: MonsterLocationCatalog | null = null;
/** monsterLocationCatalogPromise：定义该变量以承载业务值。 */
let monsterLocationCatalogPromise: Promise<MonsterLocationCatalog> | null = null;

/** loadMonsterLocationCatalog：执行对应的业务逻辑。 */
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

/** hasLoadedMonsterLocationCatalog：执行对应的业务逻辑。 */
export function hasLoadedMonsterLocationCatalog(): boolean {
  return monsterLocationCatalog !== null;
}

/** preloadMonsterLocationCatalog：执行对应的业务逻辑。 */
export async function preloadMonsterLocationCatalog(): Promise<void> {
  await loadMonsterLocationCatalog();
}

/** getMonsterLocationEntry：执行对应的业务逻辑。 */
export function getMonsterLocationEntry(monsterId: string): MonsterLocationEntry | null {
  if (!monsterLocationCatalog) {
    void loadMonsterLocationCatalog();
    return null;
  }
  return monsterLocationCatalog[monsterId] ?? null;
}

/** loadMonsterLocationEntry：执行对应的业务逻辑。 */
export async function loadMonsterLocationEntry(monsterId: string): Promise<MonsterLocationEntry | null> {
/** catalog：定义该变量以承载业务值。 */
  const catalog = await loadMonsterLocationCatalog();
  return catalog[monsterId] ?? null;
}

