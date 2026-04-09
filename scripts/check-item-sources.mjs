/**
 * 用途：检查物品来源生成结果与服务端内容引用是否一致。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildResourceNodeIndexes } from './lib/resource-nodes.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/**
 * 记录仓库根目录。
 */
const repoRoot = path.resolve(__dirname, '..');
/**
 * 指向物品内容目录，作为物品真源扫描入口。
 */
const itemsDir = path.join(repoRoot, 'packages/server/data/content/items');
/**
 * 指向怪物内容目录，用于收集掉落和装备来源。
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
 * 记录starterinventory路径。
 */
const starterInventoryPath = path.join(repoRoot, 'packages/server/data/content/starter-inventory.json');
/**
 * 指定审计 Markdown 报告的输出位置。
 */
const reportOutputPath = path.join(repoRoot, 'docs', '物品来源审计.md');

/**
 * 定义品阶比较时使用的固定顺序。
 */
const GRADE_ORDER = ['mortal', 'yellow', 'mystic', 'earth', 'heaven', 'spirit', 'saint', 'emperor'];
/**
 * 把品阶映射为排序索引，便于做区间判断。
 */
const GRADE_INDEX = new Map(GRADE_ORDER.map((grade, index) => [grade, index]));
/**
 * 记录spiritstone物品ID。
 */
const SPIRIT_STONE_ITEM_ID = 'spirit_stone';
/**
 * 记录怪物equipmentslots。
 */
const MONSTER_EQUIPMENT_SLOTS = ['weapon', 'head', 'body', 'legs', 'feet', 'ring', 'amulet', 'offhand', 'hands', 'waist', 'shoulder', 'accessory'];
/**
 * 标记允许无来源的特殊物品，避免被误报。
 */
const INTENTIONAL_NO_SOURCE_ITEM_IDS = new Set(['root_seed.heaven', 'root_seed.divine']);
const { runtimeTileNodes, landmarkNodesById } = buildResourceNodeIndexes();

/**
 * 递归收集目录下的全部 JSON 文件并按中文顺序排序。
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
 * 读取并解析单个 JSON 文件。
 */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * 把 JSON 内容统一包装成数组，方便后续遍历。
 */
function readJsonArray(filePath) {
/**
 * 记录价值。
 */
  const value = readJson(filePath);
  return Array.isArray(value) ? value : [value];
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
 * 清洗掉落池标签组，去除空值和重复标签。
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
 * 判断物品标签是否满足掉落池配置的标签组条件。
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
 * 根据等级、品阶和标签规则解析掉落池可产出的物品 ID。
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
 * 从地标配置反查关联的资源节点模板。
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
 * 根据资源节点或地标文本特征识别采矿类地标。
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
 * 建立怪物到地图的反向引用索引，便于标注怪物出现位置。
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
      });
      mapRefsByMonsterId.set(monsterId, refs);
    }
  }
  return mapRefsByMonsterId;
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
 * 创建物品record。
 */
function createItemRecord(item, filePath) {
  return {
    itemId: String(item.itemId),
    name: typeof item.name === 'string' ? item.name : '',
    type: typeof item.type === 'string' ? item.type : 'unknown',
    sourceFile: path.relative(repoRoot, filePath),
  };
}

/**
 * 把合法来源挂到物品来源表，或把无效引用记入异常列表。
 */
function pushKnownSource(sourceByItemId, invalidRefs, itemId, source) {
  if (typeof itemId !== 'string' || itemId.length === 0) {
    return;
  }
/**
 * 汇总当前条目列表。
 */
  const entries = sourceByItemId.get(itemId);
  if (!entries) {
    invalidRefs.push({ itemId, ...source });
    return;
  }
  entries.push(source);
}

/**
 * 处理summarizeby。
 */
function summarizeBy(values, keyFn) {
/**
 * 记录counts。
 */
  const counts = new Map();
  for (const value of values) {
/**
 * 记录key。
 */
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

/**
 * 格式化物品。
 */
function formatItem(item) {
/**
 * 记录名称part。
 */
  const namePart = item.name ? ` ${item.name}` : '';
  return `${item.itemId}${namePart} [${item.type}]`;
}

/**
 * 输出分节。
 */
function printSection(title, lines) {
  if (lines.length === 0) {
    return;
  }
  console.log(`\n${title}`);
  for (const line of lines) {
    console.log(line);
  }
}

/**
 * 格式化invalidref。
 */
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

/**
 * 提取equipment物品ID。
 */
function extractEquipmentItemId(entry) {
  if (typeof entry === 'string' && entry.length > 0) {
    return entry;
  }
  if (entry && typeof entry === 'object' && typeof entry.itemId === 'string' && entry.itemId.length > 0) {
    return entry.itemId;
  }
  return null;
}

/**
 * 构建怪物equipment引用列表。
 */
function buildMonsterEquipmentRefs(monsters, fileByMonsterId) {
/**
 * 记录引用列表by物品ID。
 */
  const refsByItemId = new Map();
  for (const monster of monsters) {
    if (!monster || typeof monster.id !== 'string' || !monster.equipment || typeof monster.equipment !== 'object') {
      continue;
    }
    for (const slot of MONSTER_EQUIPMENT_SLOTS) {
/**
 * 记录物品ID。
 */
      const itemId = extractEquipmentItemId(monster.equipment[slot]);
      if (!itemId) {
        continue;
      }
/**
 * 记录引用列表。
 */
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

/**
 * 构建contenttext引用列表。
 */
function buildContentTextRefs(itemIds, filePaths) {
/**
 * 记录引用列表by物品ID。
 */
  const refsByItemId = new Map(itemIds.map((itemId) => [itemId, []]));
  for (const filePath of filePaths) {
/**
 * 记录text。
 */
    const text = fs.readFileSync(filePath, 'utf8');
/**
 * 记录relative路径。
 */
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

/**
 * 按怪物装备、文本引用等线索对缺失来源物品做分类。
 */
function classifyMissingItems(missingItems, monsterEquipmentRefs, contentTextRefs) {
/**
 * 记录categories。
 */
  const categories = {
    monsterExclusiveEquipment: [],
    playerEquipment: [],
    unusedSpecialItems: [],
    referencedSpecialItems: [],
  };
  for (const item of missingItems) {
/**
 * 记录equipment引用列表。
 */
    const equipmentRefs = monsterEquipmentRefs.get(item.itemId) ?? [];
/**
 * 记录text引用列表。
 */
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

/**
 * 判断是否intentionalno来源物品。
 */
function isIntentionalNoSourceItem(itemId) {
  return INTENTIONAL_NO_SOURCE_ITEM_IDS.has(itemId);
}

/**
 * 规整markdowncell。
 */
function escapeMarkdownCell(value) {
  return String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', '<br>');
}

/**
 * 处理rendermarkdown表格。
 */
function renderMarkdownTable(headers, rows) {
/**
 * 汇总输出行。
 */
  const lines = [
    `| ${headers.map((header) => escapeMarkdownCell(header)).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
  ];
  for (const row of rows) {
    lines.push(`| ${row.map((cell) => escapeMarkdownCell(cell)).join(' | ')} |`);
  }
  return lines.join('\n');
}

/**
 * 格式化timestamp。
 */
function formatTimestamp(date = new Date()) {
/**
 * 记录formatter。
 */
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Shanghai',
    hour12: false,
  });
  return `${formatter.format(date)} CST`;
}

/**
 * 确保目录for文件。
 */
function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

/**
 * 把审计统计和异常明细渲染成 Markdown 报告正文。
 */
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
/**
 * 汇总输出行。
 */
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

/**
 * 执行整套物品来源审计流程并写出结果报告。
 */
function main() {
  const itemFiles = walkJsonFiles(itemsDir);
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
 * 记录物品records。
 */
  const itemRecords = [];
  for (const filePath of itemFiles) {
    for (const item of readJsonArray(filePath)) {
      if (typeof item?.itemId !== 'string' || item.itemId.length === 0) {
        continue;
      }
      itemRecords.push(createItemRecord(item, filePath));
    }
  }

/**
 * 记录items。
 */
  const items = itemFiles.flatMap((filePath) => readJsonArray(filePath));
/**
 * 记录monsters。
 */
  const monsters = monsterFiles.flatMap((filePath) => readJsonArray(filePath));
/**
 * 记录任务groups。
 */
  const questGroups = questFiles.map((filePath) => readJson(filePath));
/**
 * 记录maps。
 */
  const maps = mapFiles.map((filePath) => readJson(filePath));
/**
 * 记录starterinventory。
 */
  const starterInventory = readJson(starterInventoryPath);
/**
 * 记录怪物文件byID。
 */
  const monsterFileById = new Map();
  for (const filePath of monsterFiles) {
    for (const monster of readJsonArray(filePath)) {
      if (monster && typeof monster.id === 'string') {
        monsterFileById.set(monster.id, path.relative(repoRoot, filePath));
      }
    }
  }

/**
 * 记录来源by物品ID。
 */
  const sourceByItemId = new Map(
    itemRecords
      .slice()
      .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-CN'))
      .map((item) => [item.itemId, []]),
  );
/**
 * 记录invalid引用列表。
 */
  const invalidRefs = [];
/**
 * 记录unplaced怪物drops。
 */
  const unplacedMonsterDrops = [];/**
 * 保存任务奖励列表without映射。
 */

  const questRewardsWithoutMap = [];/**
 * 按 ID 组织引用列表by怪物映射。
 */

  const mapRefsByMonsterId = buildMonsterMapRefs(maps);/**
 * 按 ID 组织名称by映射。
 */

  const mapNameById = buildMapNameById(maps);

  for (const monster of monsters) {
    if (typeof monster?.id !== 'string' || typeof monster?.name !== 'string') {
      continue;
    }
/**
 * 记录地图引用列表。
 */
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
/**
 * 记录掉落pools。
 */
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
/**
 * 记录奖励物品ids。
 */
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
/**
 * 记录地图ref。
 */
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

/**
 * 记录intentionalno来源items。
 */
  const intentionalNoSourceItems = itemRecords.filter((item) => isIntentionalNoSourceItem(item.itemId));
/**
 * 记录missingitems。
 */
  const missingItems = itemRecords.filter((item) => !isIntentionalNoSourceItem(item.itemId) && (sourceByItemId.get(item.itemId)?.length ?? 0) === 0);
/**
 * 记录sourceditems。
 */
  const sourcedItems = itemRecords.length - missingItems.length - intentionalNoSourceItems.length;
/**
 * 记录来源kind汇总。
 */
  const sourceKindSummary = summarizeBy(
    [...sourceByItemId.values()].flat(),
    (entry) => entry.kind,
  );
/**
 * 记录missingby文件。
 */
  const missingByFile = summarizeBy(missingItems, (item) => item.sourceFile);
/**
 * 记录missingbytype。
 */
  const missingByType = summarizeBy(missingItems, (item) => item.type);
/**
 * 记录missing物品ids。
 */
  const missingItemIds = missingItems.map((item) => item.itemId);
/**
 * 记录怪物equipment引用列表。
 */
  const monsterEquipmentRefs = buildMonsterEquipmentRefs(monsters, monsterFileById);
/**
 * 记录contenttext引用列表。
 */
  const contentTextRefs = buildContentTextRefs(
    missingItemIds,
    [
      ...monsterFiles,
      ...questFiles,
      ...mapFiles,
      starterInventoryPath,
    ],
  );
/**
 * 记录missing物品categories。
 */
  const missingItemCategories = classifyMissingItems(missingItems, monsterEquipmentRefs, contentTextRefs);
/**
 * 记录生成结果at。
 */
  const generatedAt = formatTimestamp();
/**
 * 记录markdown报表。
 */
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
/**
 * 记录报表。
 */
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
