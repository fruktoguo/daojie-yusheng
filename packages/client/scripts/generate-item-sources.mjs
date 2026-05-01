/**
 * 用途：为 client-next 生成物品来源与怪物地点索引。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildResourceNodeIndexes } from '../../../scripts/lib/resource-nodes.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/**
 * 记录客户端包目录。
 */
const clientDir = path.resolve(__dirname, '..');
/**
 * 记录仓库根目录。
 */
const repoRoot = path.resolve(clientDir, '..', '..');
/**
 * 记录物品目录。
 */
const itemsDir = path.join(repoRoot, 'packages/server/data/content/items');
/**
 * 记录怪物目录。
 */
const monstersDir = path.join(repoRoot, 'packages/server/data/content/monsters');
/**
 * 记录任务目录。
 */
const questsDir = path.join(repoRoot, 'packages/server/data/content/quests');
/**
 * 记录地图目录。
 */
const mapsDir = path.join(repoRoot, 'packages/server/data/maps');
/**
 * 记录炼丹配方路径。
 */
const alchemyRecipesPath = path.join(repoRoot, 'packages/server/data/content/alchemy/recipes.json');
/**
 * 记录输出文件路径。
 */
const outputPath = path.join(clientDir, 'src/constants/world/item-sources.generated.json');
/**
 * 记录怪物location输出路径。
 */
const monsterLocationOutputPath = path.join(clientDir, 'src/constants/world/monster-locations.generated.json');
const { runtimeTileNodes, landmarkNodesById } = buildResourceNodeIndexes();

/**
 * 记录品阶order。
 */
const GRADE_ORDER = ['mortal', 'yellow', 'mystic', 'earth', 'heaven', 'spirit', 'saint', 'emperor'];
/**
 * 记录品阶索引。
 */
const GRADE_INDEX = new Map(GRADE_ORDER.map((grade, index) => [grade, index]));
/**
 * 记录玩家战斗血精奖励物品ID。
 */
const BLOOD_ESSENCE_ITEM_ID = 'stone.blood_essence';

/**
 * 递归遍历json文件列表。
 */
function walkJsonFiles(dirPath) {
/**
 * 汇总待处理文件列表。
 */
  const files = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
/**
 * 记录entry路径。
 */
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkJsonFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(entryPath);
    }
  }
  return files.sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

/**
 * 读取json。
 */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * 规整nonfiniteinteger。
 */
function escapeNonFiniteInteger(value) {
  return Number.isInteger(value) ? Number(value) : undefined;
}

/**
 * 获取物品等级。
 */
function getItemLevel(item) {
  return Number.isInteger(item.level) ? Number(item.level) : 1;
}

/**
 * 获取物品品阶。
 */
function getItemGrade(item) {
  return typeof item.grade === 'string' ? item.grade : 'mortal';
}

/**
 * 规范化taggroups。
 */
function normalizeTagGroups(tagGroups) {
  if (!Array.isArray(tagGroups)) {
    return undefined;
  }
/**
 * 记录normalized。
 */
  const normalized = tagGroups
    .map((group) => (
      Array.isArray(group)
        ? [...new Set(group
          .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
          .map((entry) => entry.trim()))]
        : []
    ))
    .filter((group) => group.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

/**
 * 判断是否匹配taggroups。
 */
function matchesTagGroups(itemTags, tagGroups) {
  if (!tagGroups || tagGroups.length === 0) {
    return true;
  }
/**
 * 收集tag集合。
 */
  const tagSet = new Set(Array.isArray(itemTags) ? itemTags : []);
  return tagGroups.every((group) => group.some((tag) => tagSet.has(tag)));
}

/**
 * 判断是否品阶withinrange。
 */
function isGradeWithinRange(itemGrade, maxGrade) {
/**
 * 记录当前值索引。
 */
  const currentIndex = GRADE_INDEX.get(itemGrade) ?? 0;
/**
 * 记录max索引。
 */
  const maxIndex = maxGrade ? (GRADE_INDEX.get(maxGrade) ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
  return currentIndex <= maxIndex;
}

/**
 * 解析掉落pool物品ids。
 */
function resolveLootPoolItemIds(items, pool) {
/**
 * 记录taggroups。
 */
  const tagGroups = normalizeTagGroups(pool.tagGroups);
/**
 * 记录min等级。
 */
  const minLevel = escapeNonFiniteInteger(pool.minLevel);
/**
 * 记录max等级。
 */
  const maxLevel = escapeNonFiniteInteger(pool.maxLevel);
/**
 * 记录max品阶。
 */
  const maxGrade = typeof pool.maxGrade === 'string' ? pool.maxGrade : undefined;
  return items
    .filter((item) => {
/**
 * 记录等级。
 */
      const level = getItemLevel(item);
      if (minLevel !== undefined && level < minLevel) {
        return false;
      }
      if (maxLevel !== undefined && level > maxLevel) {
        return false;
      }
      if (!isGradeWithinRange(getItemGrade(item), maxGrade)) {
        return false;
      }
      return matchesTagGroups(item.tags, tagGroups);
    })
    .map((item) => item.itemId)
    .sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

/**
 * 解析地标资源节点。
 */
function resolveLandmarkResourceNode(landmark) {
  if (typeof landmark?.resourceNodeId !== 'string') {
    return undefined;
  }
/**
 * 记录资源节点ID。
 */
  const resourceNodeId = landmark.resourceNodeId.trim();
  return resourceNodeId ? landmarkNodesById.get(resourceNodeId) : undefined;
}

/**
 * 判断是否mining地标。
 */
function isMiningLandmark(landmark, resourceNode) {
  if (resourceNode) {
    return true;
  }
/**
 * 记录ID。
 */
  const id = typeof landmark.id === 'string' ? landmark.id : '';
/**
 * 记录名称。
 */
  const name = typeof landmark.name === 'string' ? landmark.name : '';
/**
 * 记录desc。
 */
  const desc = typeof landmark.desc === 'string' ? landmark.desc : '';
  if (/vein/.test(id)) {
    return true;
  }
  if (/(矿脉|矿层|矿壁|裸矿|灵石矿)/.test(name)) {
    return true;
  }
  return /(开凿|撬取|撬下|剥开过|露出成片玄铁|嵌着零散灵石)/.test(desc)
    && !/(木箱|工具架|箱|架)/.test(name);
}

/**
 * 追加来源。
 */
function pushSource(sourceByItemId, itemId, source) {
/**
 * 汇总当前条目列表。
 */
  const entries = sourceByItemId.get(itemId);
  if (!entries) {
    return;
  }
  entries.push(source);
}

/**
 * 构建怪物地图引用列表。
 */
function buildMonsterMapRefs(maps) {/**
 * 按 ID 组织引用列表by怪物映射。
 */

  const mapRefsByMonsterId = new Map();
  for (const map of maps) {
    for (const spawn of map.monsterSpawns ?? []) {
      const monsterId = typeof spawn?.templateId === 'string'
        ? spawn.templateId
        : (typeof spawn?.id === 'string' ? spawn.id : null);
      if (!monsterId) {
        continue;
      }
/**
 * 记录引用列表。
 */
      const refs = mapRefsByMonsterId.get(monsterId) ?? new Map();
      refs.set(map.id, {
        mapId: map.id,
        mapName: map.name,
        dangerLevel: escapeNonFiniteInteger(map.dangerLevel),
      });
      mapRefsByMonsterId.set(monsterId, refs);
    }
  }
  return mapRefsByMonsterId;
}

/**
 * 获取comparable危险度等级。
 */
function getComparableDangerLevel(mapRef) {
  return typeof mapRef.dangerLevel === 'number' ? mapRef.dangerLevel : Number.POSITIVE_INFINITY;
}

/**
 * 构建怪物location目录。
 */
function buildMonsterLocationCatalog(monsters, mapRefsByMonsterId) {
  return Object.fromEntries(
    monsters
      .slice()
      .sort((left, right) => String(left.id ?? '').localeCompare(String(right.id ?? ''), 'zh-CN'))
      .flatMap((monster) => {
        if (typeof monster?.id !== 'string' || typeof monster?.name !== 'string') {
          return [];
        }
/**
 * 记录地图引用列表。
 */
        const mapRefs = [...(mapRefsByMonsterId.get(monster.id)?.values() ?? [])]
          .sort((left, right) => {
/**
 * 记录危险度delta。
 */
            const dangerDelta = getComparableDangerLevel(left) - getComparableDangerLevel(right);
            if (dangerDelta !== 0) {
              return dangerDelta;
            }
            return left.mapId.localeCompare(right.mapId, 'zh-CN');
          });
        if (mapRefs.length === 0) {
          return [];
        }/**
 * 保存优先值映射。
 */

        const preferredMap = mapRefs[0];
        return [[monster.id, {
          monsterId: monster.id,
          monsterName: monster.name,
          mapId: preferredMap.mapId,
          mapName: preferredMap.mapName,
          dangerLevel: preferredMap.dangerLevel,
          totalMaps: mapRefs.length,
        }]];
      }),
  );
}

/**
 * 构建地图名称byID。
 */
function buildMapNameById(maps) {
  return new Map(
    maps
      .filter((map) => typeof map?.id === 'string' && typeof map?.name === 'string')
      .map((map) => [map.id, map.name]),
  );
}

/**
 * 解析任务地图ref。
 */
function resolveQuestMapRef(quest, mapNameById) {/**
 * 按 ID 组织mapId映射。
 */

  const mapId = [
    typeof quest.giverMapId === 'string' ? quest.giverMapId : null,
    typeof quest.submitMapId === 'string' ? quest.submitMapId : null,
    typeof quest.targetMapId === 'string' ? quest.targetMapId : null,
  ].find((value) => typeof value === 'string' && value.length > 0);
  if (!mapId) {
    return null;
  }
  return {
    mapId,
    mapName: mapNameById.get(mapId) ?? mapId,
  };
}

/**
 * 排序sources。
 */
function sortSources(entries) {
/**
 * 记录kindpriority。
 */
  const kindPriority = {
    monster_drop: 0,
    mining: 1,
    search: 1,
    shop: 2,
    quest: 3,
    alchemy: 4,
    runtime_pvp_reward: 5,
  };
/**
 * 记录seen。
 */
  const seen = new Set();
  return entries
    .filter((entry) => {
/**
 * 记录key。
 */
      const key = JSON.stringify(entry);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((left, right) => {
/**
 * 记录kinddelta。
 */
      const kindDelta = (kindPriority[left.kind] ?? 99) - (kindPriority[right.kind] ?? 99);
      if (kindDelta !== 0) {
        return kindDelta;
      }
      if (left.kind === 'monster_drop' && right.kind === 'monster_drop') {
/**
 * 记录chancedelta。
 */
        const chanceDelta = (right.chance ?? 0) - (left.chance ?? 0);
        if (chanceDelta !== 0) {
          return chanceDelta;
        }
/**
 * 记录地图delta。
 */
        const mapDelta = left.mapId.localeCompare(right.mapId, 'zh-CN');
        if (mapDelta !== 0) {
          return mapDelta;
        }
        return left.monsterId.localeCompare(right.monsterId, 'zh-CN');
      }
/**
 * 记录地图delta。
 */
      const mapDelta = left.mapId.localeCompare(right.mapId, 'zh-CN');
      if (mapDelta !== 0) {
        return mapDelta;
      }
      if (left.kind === 'quest' && right.kind === 'quest') {
        return left.questId.localeCompare(right.questId, 'zh-CN');
      }
      if (left.kind === 'shop' && right.kind === 'shop') {
        return left.npcId.localeCompare(right.npcId, 'zh-CN');
      }
      if (left.kind === 'alchemy' && right.kind === 'alchemy') {
        return left.recipeId.localeCompare(right.recipeId, 'zh-CN');
      }
/**
 * 记录地标delta。
 */
      const landmarkDelta = (left.landmarkId ?? '').localeCompare(right.landmarkId ?? '', 'zh-CN');
      if (landmarkDelta !== 0) {
        return landmarkDelta;
      }
      return (left.poolIndex ?? -1) - (right.poolIndex ?? -1);
    });
}

/**
 * 串联执行脚本主流程。
 */
function main() {
/**
 * 汇总物品文件列表。
 */
  const itemFiles = walkJsonFiles(itemsDir);
/**
 * 汇总怪物文件列表。
 */
  const monsterFiles = walkJsonFiles(monstersDir);
/**
 * 汇总任务文件列表。
 */
  const questFiles = walkJsonFiles(questsDir);
/**
 * 汇总地图文件列表。
 */
  const mapFiles = walkJsonFiles(mapsDir);

/**
 * 记录items。
 */
  const items = itemFiles.flatMap((filePath) => readJson(filePath));
/**
 * 记录monsters。
 */
  const monsters = monsterFiles.flatMap((filePath) => readJson(filePath));
/**
 * 记录任务groups。
 */
  const questGroups = questFiles.map((filePath) => readJson(filePath));
/**
 * 记录maps。
 */
  const maps = mapFiles.map((filePath) => readJson(filePath));/**
 * 按 ID 组织引用列表by怪物映射。
 */

  const mapRefsByMonsterId = buildMonsterMapRefs(maps);/**
 * 按 ID 组织名称by映射。
 */

  const mapNameById = buildMapNameById(maps);
  const monsterLocationCatalog = buildMonsterLocationCatalog(monsters, mapRefsByMonsterId);
  const alchemyRecipes = readJson(alchemyRecipesPath);
  const sourceByItemId = new Map(
    items
      .slice()
      .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-CN'))
      .map((item) => [item.itemId, []]),
  );

  for (const monster of monsters) {
/**
 * 记录地图引用列表。
 */
    const mapRefs = [...(mapRefsByMonsterId.get(monster.id)?.values() ?? [])]
      .sort((left, right) => left.mapId.localeCompare(right.mapId, 'zh-CN'));
    for (const drop of monster.drops ?? []) {
      for (const mapRef of mapRefs) {
        pushSource(sourceByItemId, drop.itemId, {
          kind: 'monster_drop',
          mapId: mapRef.mapId,
          mapName: mapRef.mapName,
          monsterId: monster.id,
          monsterName: monster.name,
          chance: typeof drop.chance === 'number' ? drop.chance : undefined,
          count: escapeNonFiniteInteger(drop.count) ?? 1,
        });
      }
    }
  }

  for (const map of maps) {
    for (const npc of map.npcs ?? []) {
      if (typeof npc?.id !== 'string' || typeof npc?.name !== 'string') {
        continue;
      }
      for (const shopItem of npc.shopItems ?? []) {
        if (typeof shopItem?.itemId !== 'string') {
          continue;
        }
        pushSource(sourceByItemId, shopItem.itemId, {
          kind: 'shop',
          mapId: map.id,
          mapName: map.name,
          npcId: npc.id,
          npcName: npc.name,
        });
      }
    }

    for (const landmark of map.landmarks ?? []) {
/**
 * 记录资源节点。
 */
      const resourceNode = resolveLandmarkResourceNode(landmark);
/**
 * 记录container。
 */
      const container = landmark.container ?? (resourceNode?.kind === 'landmark_container' ? resourceNode.container : undefined);
      if (
        (typeof landmark.id !== 'string' || typeof landmark.name !== 'string')
        || (!container && resourceNode?.kind !== 'landmark_marker')
      ) {
        continue;
      }
/**
 * 记录来源kind。
 */
      const sourceKind = isMiningLandmark(landmark, resourceNode) ? 'mining' : 'search';
      if (resourceNode?.kind === 'landmark_marker') {
        pushSource(sourceByItemId, resourceNode.itemId, {
          kind: sourceKind,
          mapId: map.id,
          mapName: map.name,
          landmarkId: landmark.id,
          landmarkName: landmark.name,
          mode: 'direct',
          count: 1,
        });
        continue;
      }
/**
 * 记录掉落pools。
 */
      const lootPools = Array.isArray(container.lootPools) ? container.lootPools : [];
      if (lootPools.length > 0) {
        lootPools.forEach((pool, poolIndex) => {
/**
 * 记录taggroups。
 */
          const tagGroups = normalizeTagGroups(pool.tagGroups);
          for (const itemId of resolveLootPoolItemIds(items, pool)) {
            pushSource(sourceByItemId, itemId, {
              kind: sourceKind,
              mapId: map.id,
              mapName: map.name,
              landmarkId: landmark.id,
              landmarkName: landmark.name,
              mode: 'pool',
              poolIndex,
              poolChance: typeof pool.chance === 'number' ? pool.chance : undefined,
              countMin: escapeNonFiniteInteger(pool.countMin),
              countMax: escapeNonFiniteInteger(pool.countMax),
              minLevel: escapeNonFiniteInteger(pool.minLevel),
              maxLevel: escapeNonFiniteInteger(pool.maxLevel),
              maxGrade: typeof pool.maxGrade === 'string' ? pool.maxGrade : undefined,
              tagGroups,
            });
          }
        });
        continue;
      }

      for (const drop of container.drops ?? []) {
        pushSource(sourceByItemId, drop.itemId, {
          kind: sourceKind,
          mapId: map.id,
          mapName: map.name,
          landmarkId: landmark.id,
          landmarkName: landmark.name,
          mode: 'direct',
          chance: typeof drop.chance === 'number' ? drop.chance : undefined,
          count: escapeNonFiniteInteger(drop.count) ?? 1,
        });
      }
    }
  }

  for (const group of questGroups) {
    for (const quest of group.quests ?? []) {
      if (typeof quest?.id !== 'string' || typeof quest?.title !== 'string') {
        continue;
      }
/**
 * 记录地图ref。
 */
      const mapRef = resolveQuestMapRef(quest, mapNameById);
      if (!mapRef) {
        continue;
      }
/**
 * 记录奖励items。
 */
      const rewardItems = Array.isArray(quest.reward) ? quest.reward : [];
      for (const reward of rewardItems) {
        if (typeof reward?.itemId !== 'string') {
          continue;
        }
        pushSource(sourceByItemId, reward.itemId, {
          kind: 'quest',
          mapId: mapRef.mapId,
          mapName: mapRef.mapName,
          questId: quest.id,
          questTitle: quest.title,
          line: typeof quest.line === 'string' ? quest.line : undefined,
          chapter: typeof quest.chapter === 'string' ? quest.chapter : undefined,
        });
      }
      if (typeof quest.rewardItemId === 'string' && quest.rewardItemId.length > 0) {
        pushSource(sourceByItemId, quest.rewardItemId, {
          kind: 'quest',
          mapId: mapRef.mapId,
          mapName: mapRef.mapName,
          questId: quest.id,
          questTitle: quest.title,
          line: typeof quest.line === 'string' ? quest.line : undefined,
          chapter: typeof quest.chapter === 'string' ? quest.chapter : undefined,
        });
      }
    }
  }

  for (const source of runtimeTileNodes) {
    pushSource(sourceByItemId, source.itemId, {
      kind: 'mining',
      mapId: 'runtime',
      mapName: '运行时资源点',
      landmarkId: `runtime:${source.itemId}`,
      landmarkName: source.sourceLabel,
      mode: 'direct',
      count: 1,
    });
  }

  for (const recipe of Array.isArray(alchemyRecipes) ? alchemyRecipes : []) {
    pushSource(sourceByItemId, recipe.outputItemId, {
      kind: 'alchemy',
      mapId: 'crafting',
      mapName: '炼丹',
      recipeId: recipe.recipeId,
    });
  }

  pushSource(sourceByItemId, BLOOD_ESSENCE_ITEM_ID, {
    kind: 'runtime_pvp_reward',
    mapId: 'runtime_pvp',
    mapName: '玩家战斗',
    sourceLabel: '击败其他玩家时按战斗规则结算',
  });

/**
 * 记录目录。
 */
  const catalog = Object.fromEntries(
    [...sourceByItemId.entries()].map(([itemId, entries]) => [itemId, sortSources(entries)]),
  );
/**
 * 记录nextcontent。
 */
  const nextContent = `${JSON.stringify(catalog, null, 2)}\n`;
/**
 * 记录next怪物locationcontent。
 */
  const nextMonsterLocationContent = `${JSON.stringify(monsterLocationCatalog, null, 2)}\n`;
/**
 * 记录当前值content。
 */
  const currentContent = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : null;
/**
 * 记录当前值怪物locationcontent。
 */
  const currentMonsterLocationContent = fs.existsSync(monsterLocationOutputPath)
    ? fs.readFileSync(monsterLocationOutputPath, 'utf8')
    : null;
  if (currentContent === nextContent) {
    console.log('item-sources.generated.json 无变更');
  } else {
    fs.writeFileSync(outputPath, nextContent);
    console.log(`已生成 ${path.relative(repoRoot, outputPath)}`);
  }

  if (currentMonsterLocationContent === nextMonsterLocationContent) {
    console.log('monster-locations.generated.json 无变更');
    return;
  }

  fs.writeFileSync(monsterLocationOutputPath, nextMonsterLocationContent);
  console.log(`已生成 ${path.relative(repoRoot, monsterLocationOutputPath)}`);
}

main();
