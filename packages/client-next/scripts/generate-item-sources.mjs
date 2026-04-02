import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildResourceNodeIndexes } from '../../../scripts/lib/resource-nodes.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(clientDir, '..', '..');
const itemsDir = path.join(repoRoot, 'packages/server/data/content/items');
const monstersDir = path.join(repoRoot, 'packages/server/data/content/monsters');
const questsDir = path.join(repoRoot, 'packages/server/data/content/quests');
const mapsDir = path.join(repoRoot, 'packages/server/data/maps');
const outputPath = path.join(clientDir, 'src/constants/world/item-sources.generated.json');
const monsterLocationOutputPath = path.join(clientDir, 'src/constants/world/monster-locations.generated.json');
const { runtimeTileNodes, landmarkNodesById } = buildResourceNodeIndexes();

const GRADE_ORDER = ['mortal', 'yellow', 'mystic', 'earth', 'heaven', 'spirit', 'saint', 'emperor'];
const GRADE_INDEX = new Map(GRADE_ORDER.map((grade, index) => [grade, index]));

function walkJsonFiles(dirPath) {
  const files = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function escapeNonFiniteInteger(value) {
  return Number.isInteger(value) ? Number(value) : undefined;
}

function getItemLevel(item) {
  return Number.isInteger(item.level) ? Number(item.level) : 1;
}

function getItemGrade(item) {
  return typeof item.grade === 'string' ? item.grade : 'mortal';
}

function normalizeTagGroups(tagGroups) {
  if (!Array.isArray(tagGroups)) {
    return undefined;
  }
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

function matchesTagGroups(itemTags, tagGroups) {
  if (!tagGroups || tagGroups.length === 0) {
    return true;
  }
  const tagSet = new Set(Array.isArray(itemTags) ? itemTags : []);
  return tagGroups.every((group) => group.some((tag) => tagSet.has(tag)));
}

function isGradeWithinRange(itemGrade, maxGrade) {
  const currentIndex = GRADE_INDEX.get(itemGrade) ?? 0;
  const maxIndex = maxGrade ? (GRADE_INDEX.get(maxGrade) ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
  return currentIndex <= maxIndex;
}

function resolveLootPoolItemIds(items, pool) {
  const tagGroups = normalizeTagGroups(pool.tagGroups);
  const minLevel = escapeNonFiniteInteger(pool.minLevel);
  const maxLevel = escapeNonFiniteInteger(pool.maxLevel);
  const maxGrade = typeof pool.maxGrade === 'string' ? pool.maxGrade : undefined;
  return items
    .filter((item) => {
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

function resolveLandmarkResourceNode(landmark) {
  if (typeof landmark?.resourceNodeId !== 'string') {
    return undefined;
  }
  const resourceNodeId = landmark.resourceNodeId.trim();
  return resourceNodeId ? landmarkNodesById.get(resourceNodeId) : undefined;
}

function isMiningLandmark(landmark, resourceNode) {
  if (resourceNode) {
    return true;
  }
  const id = typeof landmark.id === 'string' ? landmark.id : '';
  const name = typeof landmark.name === 'string' ? landmark.name : '';
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

function pushSource(sourceByItemId, itemId, source) {
  const entries = sourceByItemId.get(itemId);
  if (!entries) {
    return;
  }
  entries.push(source);
}

function buildMonsterMapRefs(maps) {
  const mapRefsByMonsterId = new Map();
  for (const map of maps) {
    for (const spawn of map.monsterSpawns ?? []) {
      const monsterId = typeof spawn?.templateId === 'string'
        ? spawn.templateId
        : (typeof spawn?.id === 'string' ? spawn.id : null);
      if (!monsterId) {
        continue;
      }
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

function getComparableDangerLevel(mapRef) {
  return typeof mapRef.dangerLevel === 'number' ? mapRef.dangerLevel : Number.POSITIVE_INFINITY;
}

function buildMonsterLocationCatalog(monsters, mapRefsByMonsterId) {
  return Object.fromEntries(
    monsters
      .slice()
      .sort((left, right) => String(left.id ?? '').localeCompare(String(right.id ?? ''), 'zh-CN'))
      .flatMap((monster) => {
        if (typeof monster?.id !== 'string' || typeof monster?.name !== 'string') {
          return [];
        }
        const mapRefs = [...(mapRefsByMonsterId.get(monster.id)?.values() ?? [])]
          .sort((left, right) => {
            const dangerDelta = getComparableDangerLevel(left) - getComparableDangerLevel(right);
            if (dangerDelta !== 0) {
              return dangerDelta;
            }
            return left.mapId.localeCompare(right.mapId, 'zh-CN');
          });
        if (mapRefs.length === 0) {
          return [];
        }
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

function buildMapNameById(maps) {
  return new Map(
    maps
      .filter((map) => typeof map?.id === 'string' && typeof map?.name === 'string')
      .map((map) => [map.id, map.name]),
  );
}

function resolveQuestMapRef(quest, mapNameById) {
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

function sortSources(entries) {
  const kindPriority = {
    monster_drop: 0,
    mining: 1,
    search: 1,
    shop: 2,
    quest: 3,
  };
  const seen = new Set();
  return entries
    .filter((entry) => {
      const key = JSON.stringify(entry);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((left, right) => {
      const kindDelta = kindPriority[left.kind] - kindPriority[right.kind];
      if (kindDelta !== 0) {
        return kindDelta;
      }
      if (left.kind === 'monster_drop' && right.kind === 'monster_drop') {
        const chanceDelta = (right.chance ?? 0) - (left.chance ?? 0);
        if (chanceDelta !== 0) {
          return chanceDelta;
        }
        const mapDelta = left.mapId.localeCompare(right.mapId, 'zh-CN');
        if (mapDelta !== 0) {
          return mapDelta;
        }
        return left.monsterId.localeCompare(right.monsterId, 'zh-CN');
      }
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
      const landmarkDelta = left.landmarkId.localeCompare(right.landmarkId, 'zh-CN');
      if (landmarkDelta !== 0) {
        return landmarkDelta;
      }
      return (left.poolIndex ?? -1) - (right.poolIndex ?? -1);
    });
}

function main() {
  const itemFiles = walkJsonFiles(itemsDir);
  const monsterFiles = walkJsonFiles(monstersDir);
  const questFiles = walkJsonFiles(questsDir);
  const mapFiles = walkJsonFiles(mapsDir);

  const items = itemFiles.flatMap((filePath) => readJson(filePath));
  const monsters = monsterFiles.flatMap((filePath) => readJson(filePath));
  const questGroups = questFiles.map((filePath) => readJson(filePath));
  const maps = mapFiles.map((filePath) => readJson(filePath));
  const mapRefsByMonsterId = buildMonsterMapRefs(maps);
  const mapNameById = buildMapNameById(maps);
  const monsterLocationCatalog = buildMonsterLocationCatalog(monsters, mapRefsByMonsterId);
  const sourceByItemId = new Map(
    items
      .slice()
      .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-CN'))
      .map((item) => [item.itemId, []]),
  );

  for (const monster of monsters) {
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
      const resourceNode = resolveLandmarkResourceNode(landmark);
      const container = landmark.container ?? (resourceNode?.kind === 'landmark_container' ? resourceNode.container : undefined);
      if (
        (typeof landmark.id !== 'string' || typeof landmark.name !== 'string')
        || (!container && resourceNode?.kind !== 'landmark_marker')
      ) {
        continue;
      }
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
      const lootPools = Array.isArray(container.lootPools) ? container.lootPools : [];
      if (lootPools.length > 0) {
        lootPools.forEach((pool, poolIndex) => {
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
      const mapRef = resolveQuestMapRef(quest, mapNameById);
      if (!mapRef) {
        continue;
      }
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

  const catalog = Object.fromEntries(
    [...sourceByItemId.entries()].map(([itemId, entries]) => [itemId, sortSources(entries)]),
  );
  const nextContent = `${JSON.stringify(catalog, null, 2)}\n`;
  const nextMonsterLocationContent = `${JSON.stringify(monsterLocationCatalog, null, 2)}\n`;
  const currentContent = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : null;
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
