/** 怪物出现场所的目录条目。 */
export interface MonsterLocationEntry {
/**
 * monsterId：怪物ID标识。
 */

  monsterId: string;  
  /**
 * monsterName：怪物名称名称或显示文本。
 */

  monsterName: string;  
  /**
 * mapId：地图ID标识。
 */

  mapId: string;  
  /**
 * mapName：地图名称名称或显示文本。
 */

  mapName: string;  
  /**
 * dangerLevel：danger等级数值。
 */

  dangerLevel?: number;  
  /**
 * totalMaps：total地图相关字段。
 */

  totalMaps: number;
}

/** 怪物出现场所目录的内存结构。 */
type MonsterLocationCatalog = Record<string, MonsterLocationEntry>;
/** 已加载到内存的怪物出现场所目录。 */
let monsterLocationCatalog: MonsterLocationCatalog | null = null;
/** 正在进行中的怪物出现场所目录加载任务。 */
let monsterLocationCatalogPromise: Promise<MonsterLocationCatalog> | null = null;

/** 按需加载怪物出现场所目录。该 generated JSON 仍被客户端参考文本和地图说明链路直接消费。 */
function loadMonsterLocationCatalog(): Promise<MonsterLocationCatalog> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 判断怪物出现场所目录是否已经加载。 */
export function hasLoadedMonsterLocationCatalog(): boolean {
  return monsterLocationCatalog !== null;
}

/** 提前预热怪物出现场所目录加载。 */
export async function preloadMonsterLocationCatalog(): Promise<void> {
  await loadMonsterLocationCatalog();
}

/** 读取某个怪物的出现场所条目。 */
export function getMonsterLocationEntry(monsterId: string): MonsterLocationEntry | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!monsterLocationCatalog) {
    void loadMonsterLocationCatalog();
    return null;
  }
  return monsterLocationCatalog[monsterId] ?? null;
}

/** 等待目录加载完成后再读取某个怪物的出现场所条目。 */
export async function loadMonsterLocationEntry(monsterId: string): Promise<MonsterLocationEntry | null> {
  const catalog = await loadMonsterLocationCatalog();
  return catalog[monsterId] ?? null;
}
