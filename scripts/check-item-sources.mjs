import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildResourceNodeIndexes } from './lib/resource-nodes.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const itemsDir = path.join(repoRoot, 'packages/server/data/content/items');
const monstersDir = path.join(repoRoot, 'packages/server/data/content/monsters');
const questsDir = path.join(repoRoot, 'packages/server/data/content/quests');
const mapsDir = path.join(repoRoot, 'packages/server/data/maps');
const starterInventoryPath = path.join(repoRoot, 'packages/server/data/content/starter-inventory.json');
const reportOutputPath = path.join(repoRoot, 'docs', '物品来源审计.md');

const GRADE_ORDER = ['mortal', 'yellow', 'mystic', 'earth', 'heaven', 'spirit', 'saint', 'emperor'];
const GRADE_INDEX = new Map(GRADE_ORDER.map((grade, index) => [grade, index]));
const SPIRIT_STONE_ITEM_ID = 'spirit_stone';
const MONSTER_EQUIPMENT_SLOTS = ['weapon', 'head', 'body', 'legs', 'feet', 'ring', 'amulet', 'offhand', 'hands', 'waist', 'shoulder', 'accessory'];
const INTENTIONAL_NO_SOURCE_ITEM_IDS = new Set(['root_seed.heaven', 'root_seed.divine']);
const { runtimeTileNodes, landmarkNodesById } = buildResourceNodeIndexes();

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

function readJsonArray(filePath) {
  const value = readJson(filePath);
  return Array.isArray(value) ? value : [value];
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
      });
      mapRefsByMonsterId.set(monsterId, refs);
    }
  }
  return mapRefsByMonsterId;
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

function createItemRecord(item, filePath) {
  return {
    itemId: String(item.itemId),
    name: typeof item.name === 'string' ? item.name : '',
    type: typeof item.type === 'string' ? item.type : 'unknown',
    sourceFile: path.relative(repoRoot, filePath),
  };
}

function pushKnownSource(sourceByItemId, invalidRefs, itemId, source) {
  if (typeof itemId !== 'string' || itemId.length === 0) {
    return;
  }
  const entries = sourceByItemId.get(itemId);
  if (!entries) {
    invalidRefs.push({ itemId, ...source });
    return;
  }
  entries.push(source);
}

function summarizeBy(values, keyFn) {
  const counts = new Map();
  for (const value of values) {
    const key = keyFn(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }
    return String(left[0]).localeCompare(String(right[0]), 'zh-CN');
  });
}

function formatItem(item) {
  const namePart = item.name ? ` ${item.name}` : '';
  return `${item.itemId}${namePart} [${item.type}]`;
}

function printSection(title, lines) {
  if (lines.length === 0) {
    return;
  }
  console.log(`\n${title}`);
  for (const line of lines) {
    console.log(line);
  }
}

function formatInvalidRef(entry) {
  switch (entry.kind) {
    case 'monster_drop':
      return `- ${entry.itemId} <- 怪物 ${entry.monsterId} ${entry.monsterName} @ ${entry.mapId}`;
    case 'shop':
      return `- ${entry.itemId} <- 商店 ${entry.npcId} ${entry.npcName} @ ${entry.mapId}`;
    case 'search':
    case 'mining':
      return `- ${entry.itemId} <- ${entry.kind} ${entry.landmarkId} ${entry.landmarkName} @ ${entry.mapId}`;
    case 'quest':
      return `- ${entry.itemId} <- 任务 ${entry.questId} ${entry.questTitle} @ ${entry.mapId}`;
    case 'starter':
      return `- ${entry.itemId} <- 初始携带`;
    default:
      return `- ${entry.itemId} <- ${entry.kind}`;
  }
}

function extractEquipmentItemId(entry) {
  if (typeof entry === 'string' && entry.length > 0) {
    return entry;
  }
  if (entry && typeof entry === 'object' && typeof entry.itemId === 'string' && entry.itemId.length > 0) {
    return entry.itemId;
  }
  return null;
}

function buildMonsterEquipmentRefs(monsters, fileByMonsterId) {
  const refsByItemId = new Map();
  for (const monster of monsters) {
    if (!monster || typeof monster.id !== 'string' || !monster.equipment || typeof monster.equipment !== 'object') {
      continue;
    }
    for (const slot of MONSTER_EQUIPMENT_SLOTS) {
      const itemId = extractEquipmentItemId(monster.equipment[slot]);
      if (!itemId) {
        continue;
      }
      const refs = refsByItemId.get(itemId) ?? [];
      refs.push({
        monsterId: monster.id,
        monsterName: typeof monster.name === 'string' ? monster.name : monster.id,
        slot,
        sourceFile: fileByMonsterId.get(monster.id) ?? '',
      });
      refsByItemId.set(itemId, refs);
    }
  }
  return refsByItemId;
}

function buildContentTextRefs(itemIds, filePaths) {
  const refsByItemId = new Map(itemIds.map((itemId) => [itemId, []]));
  for (const filePath of filePaths) {
    const text = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(repoRoot, filePath);
    for (const itemId of itemIds) {
      if (!text.includes(itemId)) {
        continue;
      }
      refsByItemId.get(itemId).push(relativePath);
    }
  }
  return refsByItemId;
}

function classifyMissingItems(missingItems, monsterEquipmentRefs, contentTextRefs) {
  const categories = {
    monsterExclusiveEquipment: [],
    playerEquipment: [],
    unusedSpecialItems: [],
    referencedSpecialItems: [],
  };
  for (const item of missingItems) {
    const equipmentRefs = monsterEquipmentRefs.get(item.itemId) ?? [];
    const textRefs = contentTextRefs.get(item.itemId) ?? [];
    if (item.type === 'equipment') {
      if (equipmentRefs.length > 0) {
        categories.monsterExclusiveEquipment.push({ ...item, equipmentRefs, textRefs });
      } else {
        categories.playerEquipment.push({ ...item, equipmentRefs, textRefs });
      }
      continue;
    }
    if (textRefs.length === 0) {
      categories.unusedSpecialItems.push({ ...item, equipmentRefs, textRefs });
    } else {
      categories.referencedSpecialItems.push({ ...item, equipmentRefs, textRefs });
    }
  }
  return categories;
}

function isIntentionalNoSourceItem(itemId) {
  return INTENTIONAL_NO_SOURCE_ITEM_IDS.has(itemId);
}

function escapeMarkdownCell(value) {
  return String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', '<br>');
}

function renderMarkdownTable(headers, rows) {
  const lines = [
    `| ${headers.map((header) => escapeMarkdownCell(header)).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
  ];
  for (const row of rows) {
    lines.push(`| ${row.map((cell) => escapeMarkdownCell(cell)).join(' | ')} |`);
  }
  return lines.join('\n');
}

function formatTimestamp(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Shanghai',
    hour12: false,
  });
  return `${formatter.format(date)} CST`;
}

function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function renderMarkdownReport({
  generatedAt,
  totalItems,
  sourcedItems,
  missingItems,
  missingItemCategories,
  intentionalNoSourceItems,
  invalidRefs,
  unplacedMonsterDrops,
  questRewardsWithoutMap,
  sourceKindSummary,
  missingByType,
  missingByFile,
}) {
  const lines = [
    '# 物品来源审计',
    '',
    `- 生成时间: ${generatedAt}`,
    `- 检查脚本: \`scripts/check-item-sources.mjs\``,
    '- 统计口径: 只认“玩家实际可获得”的来源，包括怪物 `drops`、任务奖励、商店 `shopItems`、地图容器/搜索/矿点掉落、`starter-inventory`，以及运行时资源地块掉落（如灵石矿、玄铁矿、断剑堆、云墙）。',
    '- 特别说明: 怪物 `equipment`、仅作为配置引用的物品，不计入可获得来源。',
    '',
    '## 汇总',
    '',
    renderMarkdownTable(
      ['指标', '数值'],
      [
        ['物品总数', totalItems],
        ['已有来源', sourcedItems],
        ['缺少来源', missingItems.length],
        ['设计上不掉落', intentionalNoSourceItems.length],
        ['无效物品引用', invalidRefs.length],
        ['未投放怪物掉落', unplacedMonsterDrops.length],
        ['缺少地图信息的任务奖励', questRewardsWithoutMap.length],
      ],
    ),
    '',
    '## 来源类型统计',
    '',
    renderMarkdownTable(
      ['来源类型', '数量'],
      sourceKindSummary.map(([kind, count]) => [kind, count]),
    ),
    '',
    '## 缺少来源分类统计',
    '',
  ];

  if (missingByType.length === 0) {
    lines.push('- 无。', '');
  } else {
    lines.push(
      renderMarkdownTable(
        ['物品类型', '数量'],
        missingByType.map(([type, count]) => [type, count]),
      ),
      '',
    );
  }

  lines.push('## 缺少来源文件分布', '');
  if (missingByFile.length === 0) {
    lines.push('- 无。', '');
  } else {
    lines.push(
      renderMarkdownTable(
        ['文件', '数量'],
        missingByFile.map(([filePath, count]) => [filePath, count]),
      ),
      '',
    );
  }

  lines.push(
    '## 缺少来源分类说明',
    '',
    renderMarkdownTable(
      ['分类', '说明', '数量'],
      [
        ['怪物专属装备', '装备物品，且当前只在怪物 `equipment` 中被使用，没有任何可获得来源。', missingItemCategories.monsterExclusiveEquipment.length],
        ['玩家装备', '装备物品，但没有挂在怪物 `equipment` 中；通常是玩家可穿戴模板，当前也没有任何来源。', missingItemCategories.playerEquipment.length],
        ['未使用特殊物品', '非装备物品，且在怪物、任务、地图、初始携带等内容里完全没有被引用。', missingItemCategories.unusedSpecialItems.length],
        ['已引用但不可获得的特殊物品', '非装备物品，内容里有引用，但不在可获得来源口径中。', missingItemCategories.referencedSpecialItems.length],
      ],
    ),
    '',
    '## 怪物专属装备',
    '',
  );

  if (missingItemCategories.monsterExclusiveEquipment.length === 0) {
    lines.push('- 无。', '');
  } else {
    lines.push(
      renderMarkdownTable(
        ['itemId', '名称', '怪物引用数', '示例怪物', '来源文件'],
        missingItemCategories.monsterExclusiveEquipment
          .slice()
          .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-CN'))
          .map((item) => [
            item.itemId,
            item.name,
            item.equipmentRefs.length,
            item.equipmentRefs.slice(0, 2).map((entry) => `${entry.monsterName}(${entry.slot})`).join(' / '),
            item.sourceFile,
          ]),
      ),
      '',
    );
  }

  lines.push('## 玩家装备', '');
  if (missingItemCategories.playerEquipment.length === 0) {
    lines.push('- 无。', '');
  } else {
    lines.push(
      renderMarkdownTable(
        ['itemId', '名称', '来源文件'],
        missingItemCategories.playerEquipment
          .slice()
          .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-CN'))
          .map((item) => [item.itemId, item.name, item.sourceFile]),
      ),
      '',
    );
  }

  lines.push('## 未使用特殊物品', '');
  if (missingItemCategories.unusedSpecialItems.length === 0) {
    lines.push('- 无。', '');
  } else {
    lines.push(
      renderMarkdownTable(
        ['itemId', '名称', '类型', '来源文件'],
        missingItemCategories.unusedSpecialItems
          .slice()
          .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-CN'))
          .map((item) => [item.itemId, item.name, item.type, item.sourceFile]),
      ),
      '',
    );
  }

  lines.push('## 已引用但不可获得的特殊物品', '');
  if (missingItemCategories.referencedSpecialItems.length === 0) {
    lines.push('- 无。', '');
  } else {
    lines.push(
      renderMarkdownTable(
        ['itemId', '名称', '类型', '引用文件'],
        missingItemCategories.referencedSpecialItems
          .slice()
          .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-CN'))
          .map((item) => [item.itemId, item.name, item.type, item.textRefs.join(' / ')]),
      ),
      '',
    );
  }

  lines.push('## 设计上不掉落的物品', '');
  if (intentionalNoSourceItems.length === 0) {
    lines.push('- 无。', '');
  } else {
    lines.push(
      renderMarkdownTable(
        ['itemId', '名称', '类型', '来源文件'],
        intentionalNoSourceItems
          .slice()
          .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-CN'))
          .map((item) => [item.itemId, item.name, item.type, item.sourceFile]),
      ),
      '',
    );
  }

  lines.push('## 无效物品引用', '');
  if (invalidRefs.length === 0) {
    lines.push('- 无。', '');
  } else {
    lines.push(
      renderMarkdownTable(
        ['itemId', '来源类型', '来源详情'],
        invalidRefs.map((entry) => [entry.itemId, entry.kind, formatInvalidRef(entry).slice(2)]),
      ),
      '',
    );
  }

  lines.push('## 未投放怪物的掉落配置', '');
  if (unplacedMonsterDrops.length === 0) {
    lines.push('- 无。', '');
  } else {
    lines.push(
      renderMarkdownTable(
        ['itemId', '怪物ID', '怪物名'],
        unplacedMonsterDrops.map((entry) => [entry.itemId, entry.monsterId, entry.monsterName]),
      ),
      '',
    );
  }

  lines.push('## 缺少地图信息的任务奖励', '');
  if (questRewardsWithoutMap.length === 0) {
    lines.push('- 无。', '');
  } else {
    lines.push(
      renderMarkdownTable(
        ['itemId', '任务ID', '任务标题'],
        questRewardsWithoutMap.map((entry) => [entry.itemId, entry.questId, entry.questTitle]),
      ),
      '',
    );
  }

  lines.push('## 备注', '', '- 报告由 `scripts/check-item-sources.mjs` 自动生成。', '- 本次审计不检查 UI、深色模式、手机模式，也不改变任何内容真源。', '');
  return lines.join('\n');
}

function main() {
  const itemFiles = walkJsonFiles(itemsDir);
  const monsterFiles = walkJsonFiles(monstersDir);
  const questFiles = walkJsonFiles(questsDir);
  const mapFiles = walkJsonFiles(mapsDir);

  const itemRecords = [];
  for (const filePath of itemFiles) {
    for (const item of readJsonArray(filePath)) {
      if (typeof item?.itemId !== 'string' || item.itemId.length === 0) {
        continue;
      }
      itemRecords.push(createItemRecord(item, filePath));
    }
  }

  const items = itemFiles.flatMap((filePath) => readJsonArray(filePath));
  const monsters = monsterFiles.flatMap((filePath) => readJsonArray(filePath));
  const questGroups = questFiles.map((filePath) => readJson(filePath));
  const maps = mapFiles.map((filePath) => readJson(filePath));
  const starterInventory = readJson(starterInventoryPath);
  const monsterFileById = new Map();
  for (const filePath of monsterFiles) {
    for (const monster of readJsonArray(filePath)) {
      if (monster && typeof monster.id === 'string') {
        monsterFileById.set(monster.id, path.relative(repoRoot, filePath));
      }
    }
  }

  const sourceByItemId = new Map(
    itemRecords
      .slice()
      .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-CN'))
      .map((item) => [item.itemId, []]),
  );
  const invalidRefs = [];
  const unplacedMonsterDrops = [];
  const questRewardsWithoutMap = [];
  const mapRefsByMonsterId = buildMonsterMapRefs(maps);
  const mapNameById = buildMapNameById(maps);

  for (const monster of monsters) {
    if (typeof monster?.id !== 'string' || typeof monster?.name !== 'string') {
      continue;
    }
    const mapRefs = [...(mapRefsByMonsterId.get(monster.id)?.values() ?? [])]
      .sort((left, right) => left.mapId.localeCompare(right.mapId, 'zh-CN'));
    if (mapRefs.length === 0 && Array.isArray(monster.drops) && monster.drops.length > 0) {
      for (const drop of monster.drops) {
        if (typeof drop?.itemId !== 'string') {
          continue;
        }
        unplacedMonsterDrops.push({
          itemId: drop.itemId,
          monsterId: monster.id,
          monsterName: monster.name,
        });
      }
      continue;
    }
    for (const drop of monster.drops ?? []) {
      for (const mapRef of mapRefs) {
        pushKnownSource(sourceByItemId, invalidRefs, drop.itemId, {
          kind: 'monster_drop',
          mapId: mapRef.mapId,
          mapName: mapRef.mapName,
          monsterId: monster.id,
          monsterName: monster.name,
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
        pushKnownSource(sourceByItemId, invalidRefs, shopItem?.itemId, {
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
        pushKnownSource(sourceByItemId, invalidRefs, resourceNode.itemId, {
          kind: sourceKind,
          mapId: map.id,
          mapName: map.name,
          landmarkId: landmark.id,
          landmarkName: landmark.name,
          mode: 'direct',
        });
        continue;
      }
      const lootPools = Array.isArray(container.lootPools) ? container.lootPools : [];
      if (lootPools.length > 0) {
        lootPools.forEach((pool) => {
          for (const itemId of resolveLootPoolItemIds(items, pool)) {
            pushKnownSource(sourceByItemId, invalidRefs, itemId, {
              kind: sourceKind,
              mapId: map.id,
              mapName: map.name,
              landmarkId: landmark.id,
              landmarkName: landmark.name,
              mode: 'pool',
            });
          }
        });
        continue;
      }

      for (const drop of container.drops ?? []) {
        pushKnownSource(sourceByItemId, invalidRefs, drop?.itemId, {
          kind: sourceKind,
          mapId: map.id,
          mapName: map.name,
          landmarkId: landmark.id,
          landmarkName: landmark.name,
          mode: 'direct',
        });
      }
    }
  }

  for (const group of questGroups) {
    for (const quest of group.quests ?? []) {
      if (typeof quest?.id !== 'string' || typeof quest?.title !== 'string') {
        continue;
      }
      const rewardItemIds = [];
      for (const reward of Array.isArray(quest.reward) ? quest.reward : []) {
        if (typeof reward?.itemId === 'string' && reward.itemId.length > 0) {
          rewardItemIds.push(reward.itemId);
        }
      }
      if (typeof quest.rewardItemId === 'string' && quest.rewardItemId.length > 0) {
        rewardItemIds.push(quest.rewardItemId);
      }
      if (rewardItemIds.length === 0) {
        continue;
      }
      const mapRef = resolveQuestMapRef(quest, mapNameById);
      if (!mapRef) {
        for (const itemId of rewardItemIds) {
          questRewardsWithoutMap.push({
            itemId,
            questId: quest.id,
            questTitle: quest.title,
          });
        }
        continue;
      }
      for (const itemId of rewardItemIds) {
        pushKnownSource(sourceByItemId, invalidRefs, itemId, {
          kind: 'quest',
          mapId: mapRef.mapId,
          mapName: mapRef.mapName,
          questId: quest.id,
          questTitle: quest.title,
        });
      }
    }
  }

  for (const starterItem of starterInventory.items ?? []) {
    pushKnownSource(sourceByItemId, invalidRefs, starterItem?.itemId, {
      kind: 'starter',
      mapId: 'starter_inventory',
      mapName: '初始携带',
    });
  }

  for (const runtimeSource of runtimeTileNodes) {
    if (!sourceByItemId.has(runtimeSource.itemId)) {
      continue;
    }
    sourceByItemId.get(runtimeSource.itemId).push({
      kind: runtimeSource.itemId === SPIRIT_STONE_ITEM_ID ? 'runtime_monster_drop' : 'runtime_terrain_drop',
      mapId: 'runtime',
      mapName: '运行时资源掉落',
      sourceLabel: runtimeSource.sourceLabel,
    });
  }

  const intentionalNoSourceItems = itemRecords.filter((item) => isIntentionalNoSourceItem(item.itemId));
  const missingItems = itemRecords.filter((item) => !isIntentionalNoSourceItem(item.itemId) && (sourceByItemId.get(item.itemId)?.length ?? 0) === 0);
  const sourcedItems = itemRecords.length - missingItems.length - intentionalNoSourceItems.length;
  const sourceKindSummary = summarizeBy(
    [...sourceByItemId.values()].flat(),
    (entry) => entry.kind,
  );
  const missingByFile = summarizeBy(missingItems, (item) => item.sourceFile);
  const missingByType = summarizeBy(missingItems, (item) => item.type);
  const missingItemIds = missingItems.map((item) => item.itemId);
  const monsterEquipmentRefs = buildMonsterEquipmentRefs(monsters, monsterFileById);
  const contentTextRefs = buildContentTextRefs(
    missingItemIds,
    [
      ...monsterFiles,
      ...questFiles,
      ...mapFiles,
      starterInventoryPath,
    ],
  );
  const missingItemCategories = classifyMissingItems(missingItems, monsterEquipmentRefs, contentTextRefs);
  const generatedAt = formatTimestamp();
  const markdownReport = renderMarkdownReport({
    generatedAt,
    totalItems: itemRecords.length,
    sourcedItems,
    missingItems,
    missingItemCategories,
    intentionalNoSourceItems,
    invalidRefs,
    unplacedMonsterDrops,
    questRewardsWithoutMap,
    sourceKindSummary,
    missingByType,
    missingByFile,
  });
  ensureDirForFile(reportOutputPath);
  fs.writeFileSync(reportOutputPath, `${markdownReport}\n`, 'utf8');

  if (process.argv.includes('--json')) {
    const report = {
      generatedAt,
      totalItems: itemRecords.length,
      sourcedItems,
      intentionalNoSourceItems: intentionalNoSourceItems.map((item) => ({
        itemId: item.itemId,
        name: item.name,
        type: item.type,
        sourceFile: item.sourceFile,
      })),
      missingItems: missingItems.map((item) => ({
        itemId: item.itemId,
        name: item.name,
        type: item.type,
        sourceFile: item.sourceFile,
      })),
      missingItemCategories: {
        monsterExclusiveEquipment: missingItemCategories.monsterExclusiveEquipment.map((item) => item.itemId),
        playerEquipment: missingItemCategories.playerEquipment.map((item) => item.itemId),
        unusedSpecialItems: missingItemCategories.unusedSpecialItems.map((item) => item.itemId),
        referencedSpecialItems: missingItemCategories.referencedSpecialItems.map((item) => item.itemId),
      },
      invalidRefs,
      unplacedMonsterDrops,
      questRewardsWithoutMap,
      sourceKindSummary: Object.fromEntries(sourceKindSummary),
      markdownReportPath: path.relative(repoRoot, reportOutputPath),
    };
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`共检查 ${itemRecords.length} 个物品，已有来源 ${sourcedItems} 个，缺少来源 ${missingItems.length} 个。`);
    console.log(`设计上不掉落 ${intentionalNoSourceItems.length} 个。`);
    console.log(`无效物品引用 ${invalidRefs.length} 条，未投放怪物掉落 ${unplacedMonsterDrops.length} 条，缺少地图信息的任务奖励 ${questRewardsWithoutMap.length} 条。`);
    console.log(`Markdown 报告已生成: ${path.relative(repoRoot, reportOutputPath)}`);

    printSection(
      '来源类型统计',
      sourceKindSummary.map(([kind, count]) => `- ${kind}: ${count}`),
    );

    printSection(
      '缺少来源的物品分类统计',
      missingByType.map(([type, count]) => `- ${type}: ${count}`),
    );

    printSection(
      '缺少来源的物品文件分布',
      missingByFile.map(([filePath, count]) => `- ${filePath}: ${count}`),
    );

    printSection(
      '怪物专属装备',
      missingItemCategories.monsterExclusiveEquipment
        .slice()
        .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-CN'))
        .map((item) => `- ${formatItem(item)} @ ${item.sourceFile} <- ${item.equipmentRefs.slice(0, 2).map((entry) => `${entry.monsterName}(${entry.slot})`).join(' / ')}`),
    );

    printSection(
      '玩家装备',
      missingItemCategories.playerEquipment
        .slice()
        .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-CN'))
        .map((item) => `- ${formatItem(item)} @ ${item.sourceFile}`),
    );

    printSection(
      '未使用特殊物品',
      missingItemCategories.unusedSpecialItems
        .slice()
        .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-CN'))
        .map((item) => `- ${formatItem(item)} @ ${item.sourceFile}`),
    );

    printSection(
      '已引用但不可获得的特殊物品',
      missingItemCategories.referencedSpecialItems
        .slice()
        .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-CN'))
        .map((item) => `- ${formatItem(item)} @ ${item.sourceFile} <- ${item.textRefs.join(' / ')}`),
    );

    printSection(
      '设计上不掉落的物品',
      intentionalNoSourceItems
        .slice()
        .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-CN'))
        .map((item) => `- ${formatItem(item)} @ ${item.sourceFile}`),
    );

    printSection(
      '无效物品引用',
      invalidRefs.map((entry) => formatInvalidRef(entry)),
    );

    printSection(
      '未投放怪物的掉落配置',
      unplacedMonsterDrops.map((entry) => `- ${entry.itemId} <- ${entry.monsterId} ${entry.monsterName}`),
    );

    printSection(
      '缺少地图信息的任务奖励',
      questRewardsWithoutMap.map((entry) => `- ${entry.itemId} <- ${entry.questId} ${entry.questTitle}`),
    );
  }

  if (missingItems.length > 0 || invalidRefs.length > 0 || unplacedMonsterDrops.length > 0 || questRewardsWithoutMap.length > 0) {
    process.exitCode = 1;
  }
}

main();
