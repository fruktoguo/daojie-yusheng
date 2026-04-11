/**
 * 用途：提供配置编辑器本地 API，并按需托管主游戏服。
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');
const { spawn } = require('child_process');
/**
 * 仓库根目录，用于解析编辑器依赖的共享路径。
 */
const ROOT_DIR = path.resolve(__dirname, '../..');
const {
  buildEditableMapList,
  cloneMapDocument,
  compileValueStatsToActualStats,
  normalizeEditableMapDocument,
  resolveMonsterExpMultiplier,
  resolveMonsterTemplateRecord,
  shouldPersistMonsterExpMultiplier,
  shouldPersistMonsterTier,
  validateEditableMapDocument,
} = require(path.join(ROOT_DIR, 'packages/shared/dist/index.js'));

/**
 * 服务端数据根目录。
 */
const SERVER_DATA_DIR = path.join(ROOT_DIR, 'packages/server/data');
/**
 * 地图配置目录。
 */
const MAPS_DIR = path.join(SERVER_DATA_DIR, 'maps');
/**
 * 内容配置目录。
 */
const CONTENT_DIR = path.join(SERVER_DATA_DIR, 'content');
/**
 * 本地配置编辑器 API 监听端口。
 */
const API_PORT = Number(process.env.CONFIG_EDITOR_API_PORT || 3101);
/**
 * 标记编辑器是否托管主游戏服的启动与重启。
 */
const MANAGE_GAME_SERVER = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.CONFIG_EDITOR_MANAGE_GAME_SERVER || '').toLowerCase(),
);
/**
 * 功法与怪物共用的合法品阶列表。
 */
const TECHNIQUE_GRADES = ['mortal', 'yellow', 'mystic', 'earth', 'heaven', 'spirit', 'saint', 'emperor'];
/**
 * 记录功法categories。
 */
const TECHNIQUE_CATEGORIES = ['arts', 'internal', 'divine', 'secret'];
/**
 * 怪物配置允许使用的仇恨模式集合。
 */
const MONSTER_AGGRO_MODES = ['always', 'retaliate', 'day_only', 'night_only'];
/**
 * 编辑器允许识别的物品类型集合。
 */
const ITEM_TYPES = ['consumable', 'equipment', 'material', 'quest_item', 'skill_book'];

/**
 * 记录服务端子进程。
 */
let serverChild = null;
/**
 * 记录服务端restart令牌。
 */
let serverRestartToken = 0;
/**
 * 记录restartdebouncetimer。
 */
let restartDebounceTimer = null;
/**
 * 记录内容目录监听器，供热重启和关闭时统一管理。
 */
const contentWatchers = new Map();
/**
 * 缓存当前被托管游戏服的运行状态与最近重启原因。
 */
const serverState = {
  managed: MANAGE_GAME_SERVER,
  running: false,
  pid: undefined,
  lastRestartAt: undefined,
  lastRestartReason: MANAGE_GAME_SERVER ? '初始化启动' : '未启用编辑器托管',
  mode: MANAGE_GAME_SERVER
    ? 'pnpm --filter @mud/server start:dev'
    : '未托管（设置 CONFIG_EDITOR_MANAGE_GAME_SERVER=1 后启用）',
};

/**
 * 向客户端返回统一格式的 JSON 响应。
 */
function writeJson(res, statusCode, payload) {
/**
 * 记录请求体。
 */
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/**
 * 向客户端返回统一格式的错误响应。
 */
function writeError(res, statusCode, message) {
  writeJson(res, statusCode, { error: message });
}

/**
 * 读取并解析请求体 JSON，同时限制请求体大小。
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
/**
 * 记录raw。
 */
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        reject(new Error('请求体过大'));
      }
    });
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * 校验目标路径仍位于指定根目录内，防止越权访问。
 */
function ensureWithin(baseDir, targetPath) {
/**
 * 记录resolved。
 */
  const resolved = path.resolve(baseDir, targetPath);
  if (resolved === baseDir || resolved.startsWith(`${baseDir}${path.sep}`)) {
    return resolved;
  }
  throw new Error('非法路径');
}

/**
 * 递归收集目录下全部 JSON 配置文件。
 */
function collectJsonFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
/**
 * 汇总当前条目列表。
 */
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
/**
 * 汇总待处理文件列表。
 */
  const files = [];
  for (const entry of entries) {
/**
 * 记录entry路径。
 */
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsonFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(entryPath);
    }
  }
  return files;
}

/**
 * 处理topositiveinteger。
 */
function toPositiveInteger(value, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(Number(value)));
}

/**
 * 处理tononnegativeinteger。
 */
function toNonNegativeInteger(value, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(Number(value)));
}

/**
 * 规范化怪物drop。
 */
function normalizeMonsterDrop(rawDrop) {
  return {
    itemId: typeof rawDrop?.itemId === 'string' ? rawDrop.itemId.trim() : '',
    name: typeof rawDrop?.name === 'string' ? rawDrop.name.trim() : '',
    type: ITEM_TYPES.includes(rawDrop?.type) ? rawDrop.type : 'material',
    count: toPositiveInteger(rawDrop?.count, 1),
    chance: Number.isFinite(rawDrop?.chance) ? Number(rawDrop.chance) : undefined,
  };
}

/**
 * 规范化物品attrs。
 */
function normalizeItemAttrs(attrs) {
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) {
    return undefined;
  }
/**
 * 记录normalized。
 */
  const normalized = {};
  for (const key of ['constitution', 'spirit', 'perception', 'talent', 'comprehension', 'luck']) {
    if (Number.isFinite(attrs[key])) {
      normalized[key] = Number(attrs[key]);
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

/**
 * 汇总编辑器可展示的物品模板并补齐展示字段。
 */
function listEditorItems() {
/**
 * 记录物品目录。
 */
  const itemsDir = path.join(CONTENT_DIR, 'items');
/**
 * 累计当前结果。
 */
  const result = [];
  for (const filePath of collectJsonFiles(itemsDir)) {
/**
 * 汇总当前条目列表。
 */
    const entries = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!Array.isArray(entries)) {
      continue;
    }
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
/**
 * 记录物品ID。
 */
      const itemId = typeof entry.itemId === 'string' ? entry.itemId.trim() : '';
/**
 * 记录名称。
 */
      const name = typeof entry.name === 'string' ? entry.name.trim() : '';
      if (!itemId || !name) {
        continue;
      }
      result.push({
        itemId,
        name,
        type: ITEM_TYPES.includes(entry.type) ? entry.type : 'material',
        groundLabel: typeof entry.groundLabel === 'string' ? entry.groundLabel.trim() : undefined,
        grade: TECHNIQUE_GRADES.includes(entry.grade) ? entry.grade : undefined,
        level: Number.isFinite(entry.level) ? toPositiveInteger(entry.level, 1) : undefined,
        desc: typeof entry.desc === 'string' ? entry.desc.trim() : '',
        equipSlot: typeof entry.equipSlot === 'string' ? entry.equipSlot : undefined,
        equipAttrs: normalizeItemAttrs(entry.equipAttrs),
        equipStats: compileValueStatsToActualStats(normalizeMonsterValueStats(entry.equipValueStats)) ?? normalizeMonsterValueStats(entry.equipStats),
        equipValueStats: normalizeMonsterValueStats(entry.equipValueStats),
        effects: Array.isArray(entry.effects) ? entry.effects : undefined,
        tags: Array.isArray(entry.tags) ? entry.tags.filter((tag) => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean) : undefined,
        mapUnlockId: typeof entry.mapUnlockId === 'string' ? entry.mapUnlockId.trim() : undefined,
        tileAuraGainAmount: Number.isFinite(entry.tileAuraGainAmount) ? Number(entry.tileAuraGainAmount) : undefined,
        allowBatchUse: entry.allowBatchUse === true ? true : undefined,
      });
    }
  }
  return result.sort((left, right) => {
/**
 * 记录名称order。
 */
    const nameOrder = left.name.localeCompare(right.name, 'zh-CN');
    if (nameOrder !== 0) {
      return nameOrder;
    }
    return left.itemId.localeCompare(right.itemId, 'zh-CN');
  });
}

/**
 * 规范化怪物价值属性字段。
 */
function normalizeMonsterValueStats(rawValueStats) {
  if (!rawValueStats || typeof rawValueStats !== 'object' || Array.isArray(rawValueStats)) {
    return undefined;
  }
/**
 * 记录normalized。
 */
  const normalized = {};
  for (const key of [
    'maxHp',
    'maxQi',
    'physAtk',
    'spellAtk',
    'physDef',
    'spellDef',
    'hit',
    'dodge',
    'crit',
    'antiCrit',
    'critDamage',
    'breakPower',
    'resolvePower',
    'maxQiOutputPerTick',
    'qiRegenRate',
    'hpRegenRate',
    'cooldownSpeed',
    'auraCostReduce',
    'auraPowerRate',
    'playerExpRate',
    'techniqueExpRate',
    'realmExpPerTick',
    'lootRate',
    'rareLootRate',
    'viewRange',
    'moveSpeed',
  ]) {
    if (Number.isFinite(rawValueStats[key])) {
      normalized[key] = Number(rawValueStats[key]);
    }
  }
/**
 * 记录normalizeelementgroup。
 */
  const normalizeElementGroup = (key) => {
/**
 * 记录group。
 */
    const group = rawValueStats[key];
    if (!group || typeof group !== 'object' || Array.isArray(group)) {
      return undefined;
    }
/**
 * 记录normalizedgroup。
 */
    const normalizedGroup = {};
    for (const element of ['metal', 'wood', 'water', 'fire', 'earth']) {
      if (Number.isFinite(group[element])) {
        normalizedGroup[element] = Number(group[element]);
      }
    }
    return Object.keys(normalizedGroup).length > 0 ? normalizedGroup : undefined;
  };
/**
 * 记录elementdamagebonus。
 */
  const elementDamageBonus = normalizeElementGroup('elementDamageBonus');
/**
 * 记录elementdamagereduce。
 */
  const elementDamageReduce = normalizeElementGroup('elementDamageReduce');
  if (elementDamageBonus) {
    normalized.elementDamageBonus = elementDamageBonus;
  }
  if (elementDamageReduce) {
    normalized.elementDamageReduce = elementDamageReduce;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

/**
 * 构建编辑器物品lookup。
 */
function buildEditorItemLookup() {
  return new Map(listEditorItems().map((item) => [item.itemId, item]));
}

/**
 * 校验怪物模板的核心字段、掉落和唯一性约束。
 */
function validateMonsterTemplate(monster, currentKey) {
  if (!monster.id) {
    throw new Error('怪物 ID 不能为空');
  }
  if (!monster.name) {
    throw new Error('怪物名称不能为空');
  }
  if (!monster.char) {
    throw new Error('怪物字符不能为空');
  }
  if (!monster.color) {
    throw new Error('怪物颜色不能为空');
  }
  if (!TECHNIQUE_GRADES.includes(monster.grade)) {
    throw new Error(`怪物 ${monster.id} 的品阶非法`);
  }
  if (!MONSTER_AGGRO_MODES.includes(monster.aggroMode)) {
    throw new Error(`怪物 ${monster.id} 的仇恨模式非法`);
  }/**
 * 标记是否已价值属性字段。
 */

  const hasValueStats = monster.valueStats && typeof monster.valueStats === 'object' && !Array.isArray(monster.valueStats) && Object.keys(monster.valueStats).length > 0;/**
 * 标记是否已attrs。
 */

  const hasAttrs = monster.attrs && typeof monster.attrs === 'object' && !Array.isArray(monster.attrs) && Object.keys(monster.attrs).length > 0;/**
 * 标记是否已legacy。
 */

  const hasLegacy = Number.isFinite(monster.hp) || Number.isFinite(monster.maxHp) || Number.isFinite(monster.attack);
  if (!hasValueStats && !hasAttrs && !hasLegacy) {
    throw new Error(`怪物 ${monster.id} 至少需要配置 attrs、valueStats 或旧 hp/attack`);
  }
  if (monster.equipment && (typeof monster.equipment !== 'object' || Array.isArray(monster.equipment))) {
    throw new Error(`怪物 ${monster.id} 的装备配置非法`);
  }
  for (const drop of monster.drops) {
    if (!drop.itemId || !drop.name) {
      throw new Error(`怪物 ${monster.id} 存在不完整掉落配置`);
    }
    if (!ITEM_TYPES.includes(drop.type)) {
      throw new Error(`怪物 ${monster.id} 存在非法掉落类型 ${drop.type}`);
    }
  }

/**
 * 汇总当前条目列表。
 */
  const entries = listMonsterTemplates();
/**
 * 记录duplicated。
 */
  const duplicated = entries.find((entry) => entry.monster.id === monster.id && entry.key !== currentKey);
  if (duplicated) {
    throw new Error(`怪物 ID 重复：${monster.id}`);
  }
}

/**
 * 处理assignoptional。
 */
function assignOptional(target, key, value) {
  if (value === undefined) {
    delete target[key];
    return;
  }
  target[key] = value;
}

/**
 * 把编辑器态怪物模板整理回可持久化的服务端格式。
 */
function serializeMonsterTemplate(existing, monster) {
/**
 * 记录next。
 */
  const next = existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};
  next.id = monster.id;
  next.name = monster.name;
  next.char = monster.char;
  next.color = monster.color;
  next.grade = monster.grade;
  assignOptional(next, 'tier', shouldPersistMonsterTier(monster.tier, monster.name) ? monster.tier : undefined);
  next.radius = monster.radius;
  next.respawnSec = monster.respawnSec;
  assignOptional(next, 'level', monster.level);
  next.count = monster.count;
  next.maxAlive = monster.maxAlive;
  next.aggroRange = monster.aggroRange;
  next.viewRange = monster.viewRange;
  next.aggroMode = monster.aggroMode;
  assignOptional(next, 'respawnTicks', monster.respawnTicks);
  assignOptional(next, 'expMultiplier', shouldPersistMonsterExpMultiplier(monster.expMultiplier, monster.tier) ? monster.expMultiplier : undefined);
  assignOptional(next, 'valueStats', monster.valueStats && Object.keys(monster.valueStats).length > 0 ? monster.valueStats : undefined);
  assignOptional(next, 'attrs', monster.attrs && Object.keys(monster.attrs).length > 0 ? monster.attrs : undefined);
  assignOptional(next, 'statPercents', monster.statPercents && Object.keys(monster.statPercents).length > 0 ? monster.statPercents : undefined);
  assignOptional(next, 'equipment', monster.equipment && Object.keys(monster.equipment).length > 0 ? monster.equipment : undefined);
  assignOptional(next, 'skills', Array.isArray(monster.skills) && monster.skills.length > 0 ? monster.skills : undefined);
  next.drops = Array.isArray(monster.drops) ? monster.drops.map((drop) => normalizeMonsterDrop(drop)) : [];

  delete next.computedStats;
  delete next.combatModel;
  delete next.sourceMode;
  delete next.resolvedAttrs;
  delete next.resolvedStatPercents;

  if ((monster.attrs && Object.keys(monster.attrs).length > 0) || (monster.valueStats && Object.keys(monster.valueStats).length > 0)) {
    delete next.hp;
    delete next.maxHp;
    delete next.attack;
  }

  return next;
}

/**
 * 创建怪物entrykey。
 */
function createMonsterEntryKey(filePath, index) {
  return `${filePath}#${index}`;
}

/**
 * 解析怪物entrykey。
 */
function parseMonsterEntryKey(key) {
/**
 * 记录split索引。
 */
  const splitIndex = key.lastIndexOf('#');
  if (splitIndex <= 0) {
    throw new Error('非法怪物模板键');
  }
  const filePath = key.slice(0, splitIndex);
  const index = Number.parseInt(key.slice(splitIndex + 1), 10);
  if (!filePath.endsWith('.json') || !Number.isInteger(index) || index < 0) {
    throw new Error('非法怪物模板键');
  }
  return { filePath, index };
}

/**
 * 读取全部怪物模板并生成带文件定位信息的列表。
 */
function listMonsterTemplates() {
/**
 * 记录怪物目录。
 */
  const monstersDir = path.join(CONTENT_DIR, 'monsters');
/**
 * 记录物品lookup。
 */
  const itemLookup = buildEditorItemLookup();
/**
 * 累计当前结果。
 */
  const result = [];
  for (const filePath of collectJsonFiles(monstersDir)) {
/**
 * 记录relative路径。
 */
    const relativePath = path.relative(CONTENT_DIR, filePath).replaceAll(path.sep, '/');
/**
 * 汇总当前条目列表。
 */
    const entries = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!Array.isArray(entries)) {
      continue;
    }
    entries.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      result.push({
        key: createMonsterEntryKey(relativePath, index),
        filePath: relativePath,
        index,
        monster: resolveMonsterTemplateRecord(entry, itemLookup),
      });
    });
  }
  return result.sort((left, right) => {
/**
 * 记录名称order。
 */
    const nameOrder = left.monster.name.localeCompare(right.monster.name, 'zh-CN');
    if (nameOrder !== 0) {
      return nameOrder;
    }
    return left.monster.id.localeCompare(right.monster.id, 'zh-CN');
  });
}

/**
 * 处理update地图怪物references。
 */
function updateMapMonsterReferences(previousId, nextId) {
  if (!previousId || !nextId || previousId === nextId) {
    return 0;
  }
/**
 * 记录updated文件数量。
 */
  let updatedFileCount = 0;
  for (const filePath of collectJsonFiles(MAPS_DIR)) {
/**
 * 记录raw。
 */
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!Array.isArray(raw?.monsterSpawns)) {
      continue;
    }
/**
 * 记录changed。
 */
    let changed = false;
    raw.monsterSpawns = raw.monsterSpawns.map((spawn) => {
      if (!spawn || typeof spawn !== 'object') {
        return spawn;
      }
/**
 * 记录next出生点。
 */
      const nextSpawn = { ...spawn };
      if (nextSpawn.templateId === previousId) {
        nextSpawn.templateId = nextId;
        changed = true;
        return nextSpawn;
      }
      if ((nextSpawn.templateId === undefined || nextSpawn.templateId === null || nextSpawn.templateId === '') && nextSpawn.id === previousId) {
        nextSpawn.id = nextId;
        changed = true;
      }
      return nextSpawn;
    });
    if (!changed) {
      continue;
    }
    fs.writeFileSync(filePath, `${JSON.stringify(raw, null, 2)}\n`, 'utf-8');
    updatedFileCount += 1;
  }
  return updatedFileCount;
}

/**
 * 保存单个怪物模板，并同步更新地图中的怪物引用。
 */
function saveMonsterTemplateEntry(key, rawMonster) {
  const { filePath, index } = parseMonsterEntryKey(key);
/**
 * 记录absolute路径。
 */
  const absolutePath = ensureWithin(CONTENT_DIR, filePath);
/**
 * 汇总当前条目列表。
 */
  const entries = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
  if (!Array.isArray(entries) || !entries[index] || typeof entries[index] !== 'object') {
    throw new Error('目标怪物模板不存在');
  }
/**
 * 记录物品lookup。
 */
  const itemLookup = buildEditorItemLookup();
/**
 * 记录previous怪物。
 */
  const previousMonster = resolveMonsterTemplateRecord(entries[index], itemLookup);
/**
 * 记录怪物。
 */
  const monster = resolveMonsterTemplateRecord(rawMonster, itemLookup);
  validateMonsterTemplate(monster, key);
  entries[index] = serializeMonsterTemplate(entries[index], monster);
  fs.writeFileSync(absolutePath, `${JSON.stringify(entries, null, 2)}\n`, 'utf-8');
/**
 * 记录updated地图数量。
 */
  const updatedMapCount = updateMapMonsterReferences(previousMonster.id, monster.id);
  return {
    monster,
    updatedMapCount,
  };
}

/**
 * 比较功法entries。
 */
function compareTechniqueEntries(left, right) {
/**
 * 记录left境界。
 */
  const leftRealm = Number.isFinite(left.technique.realmLv) ? Math.max(1, Math.floor(Number(left.technique.realmLv))) : 1;
/**
 * 记录right境界。
 */
  const rightRealm = Number.isFinite(right.technique.realmLv) ? Math.max(1, Math.floor(Number(right.technique.realmLv))) : 1;
  if (leftRealm !== rightRealm) {
    return leftRealm - rightRealm;
  }
/**
 * 记录left品阶。
 */
  const leftGrade = TECHNIQUE_GRADES.indexOf(left.technique.grade);
/**
 * 记录right品阶。
 */
  const rightGrade = TECHNIQUE_GRADES.indexOf(right.technique.grade);
  if (leftGrade !== rightGrade) {
    return leftGrade - rightGrade;
  }
/**
 * 记录left类别。
 */
  const leftCategory = TECHNIQUE_CATEGORIES.indexOf(left.technique.category);
/**
 * 记录right类别。
 */
  const rightCategory = TECHNIQUE_CATEGORIES.indexOf(right.technique.category);
  if (leftCategory !== rightCategory) {
    return leftCategory - rightCategory;
  }
/**
 * 记录名称order。
 */
  const nameOrder = String(left.technique.name ?? left.technique.id).localeCompare(String(right.technique.name ?? right.technique.id), 'zh-CN');
  if (nameOrder !== 0) {
    return nameOrder;
  }
  return String(left.technique.id).localeCompare(String(right.technique.id), 'zh-CN');
}

/**
 * 读取并排序全部功法模板供编辑器使用。
 */
function listTechniqueTemplates() {
/**
 * 记录techniques目录。
 */
  const techniquesDir = path.join(CONTENT_DIR, 'techniques');
/**
 * 累计当前结果。
 */
  const result = [];
  for (const filePath of collectJsonFiles(techniquesDir)) {
/**
 * 记录relative路径。
 */
    const relativePath = path.relative(CONTENT_DIR, filePath).replaceAll(path.sep, '/');
/**
 * 汇总当前条目列表。
 */
    const entries = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!Array.isArray(entries)) {
      continue;
    }
    entries.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return;
      }
      if (typeof entry.id !== 'string' || !entry.id.trim()) {
        return;
      }
      result.push({
        key: createMonsterEntryKey(relativePath, index),
        filePath: relativePath,
        index,
        technique: entry,
      });
    });
  }
  return result.sort(compareTechniqueEntries);
}

/**
 * 处理列表功法Bufftemplates。
 */
function listTechniqueBuffTemplates() {
/**
 * 记录buffs目录。
 */
  const buffsDir = path.join(CONTENT_DIR, 'technique-buffs');
/**
 * 累计当前结果。
 */
  const result = [];
  for (const filePath of collectJsonFiles(buffsDir)) {
/**
 * 汇总当前条目列表。
 */
    const entries = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!Array.isArray(entries)) {
      continue;
    }
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        continue;
      }
      if (typeof entry.id !== 'string' || !entry.id.trim()) {
        continue;
      }
      result.push(entry);
    }
  }
  return result.sort((left, right) => String(left.id).localeCompare(String(right.id), 'zh-CN'));
}

/**
 * 校验功法template。
 */
function validateTechniqueTemplate(technique, currentKey) {
  if (!technique || typeof technique !== 'object' || Array.isArray(technique)) {
    throw new Error('功法配置非法');
  }
  if (typeof technique.id !== 'string' || technique.id.trim().length === 0) {
    throw new Error('功法 ID 不能为空');
  }
  if (typeof technique.name !== 'string' || technique.name.trim().length === 0) {
    throw new Error(`功法 ${technique.id} 的名称不能为空`);
  }
  if (!TECHNIQUE_GRADES.includes(technique.grade)) {
    throw new Error(`功法 ${technique.id} 的品阶非法`);
  }
  if (technique.category !== undefined && !TECHNIQUE_CATEGORIES.includes(technique.category)) {
    throw new Error(`功法 ${technique.id} 的分类非法`);
  }
  if (!Array.isArray(technique.skills)) {
    throw new Error(`功法 ${technique.id} 的技能列表非法`);
  }
  for (const skill of technique.skills) {
    if (!skill || typeof skill !== 'object' || Array.isArray(skill)) {
      throw new Error(`功法 ${technique.id} 存在非法技能项`);
    }
    if (typeof skill.id !== 'string' || skill.id.trim().length === 0) {
      throw new Error(`功法 ${technique.id} 存在空技能 ID`);
    }
    if (typeof skill.name !== 'string' || skill.name.trim().length === 0) {
      throw new Error(`功法 ${technique.id} 的技能 ${skill.id} 名称不能为空`);
    }
    if (!Array.isArray(skill.effects)) {
      throw new Error(`功法 ${technique.id} 的技能 ${skill.id} effects 非数组`);
    }
  }
/**
 * 记录duplicated。
 */
  const duplicated = listTechniqueTemplates().find((entry) => entry.technique.id === technique.id && entry.key !== currentKey);
  if (duplicated) {
    throw new Error(`功法 ID 重复：${technique.id}`);
  }
}

/**
 * 处理save功法templateentry。
 */
function saveTechniqueTemplateEntry(key, technique) {
  const { filePath, index } = parseMonsterEntryKey(key);
  if (!filePath.startsWith('techniques/')) {
    throw new Error('目标功法文件路径非法');
  }
/**
 * 记录absolute路径。
 */
  const absolutePath = ensureWithin(CONTENT_DIR, filePath);
/**
 * 汇总当前条目列表。
 */
  const entries = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
  if (!Array.isArray(entries) || !entries[index] || typeof entries[index] !== 'object') {
    throw new Error('目标功法不存在');
  }
  validateTechniqueTemplate(technique, key);
  entries[index] = technique;
  fs.writeFileSync(absolutePath, `${JSON.stringify(entries, null, 2)}\n`, 'utf-8');
  return {
    technique,
  };
}

/**
 * 加载怪物templates。
 */
function loadMonsterTemplates() {
/**
 * 记录怪物目录。
 */
  const monstersDir = path.join(CONTENT_DIR, 'monsters');
/**
 * 记录物品lookup。
 */
  const itemLookup = buildEditorItemLookup();
/**
 * 记录templates。
 */
  const templates = new Map();
  for (const filePath of collectJsonFiles(monstersDir)) {
/**
 * 汇总当前条目列表。
 */
    const entries = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string') continue;
      templates.set(entry.id, resolveMonsterTemplateRecord(entry, itemLookup));
    }
  }
  return templates;
}

/**
 * 处理hydrate怪物出生点record。
 */
function hydrateMonsterSpawnRecord(raw, monsterTemplates) {
  if (!raw || typeof raw !== 'object') {
    return raw;
  }
/**
 * 记录templateID。
 */
  const templateId = typeof raw.templateId === 'string'
    ? raw.templateId
    : (typeof raw.id === 'string' ? raw.id : undefined);
/**
 * 记录template。
 */
  const template = templateId ? monsterTemplates.get(templateId) : undefined;
  if (!template) {
    return raw;
  }
/**
 * 记录radius。
 */
  const radius = Number.isInteger(raw.radius) ? Math.max(0, Number(raw.radius)) : template.radius;
/**
 * 记录maxalive。
 */
  const maxAlive = Number.isInteger(raw.maxAlive) ? Math.max(1, Number(raw.maxAlive)) : template.maxAlive;
  return {
    ...template,
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : template.id,
    x: Number.isInteger(raw.x) ? Number(raw.x) : 0,
    y: Number.isInteger(raw.y) ? Number(raw.y) : 0,
    grade: raw.grade ?? template.grade,
    count: Number.isInteger(raw.count) ? Math.max(1, Number(raw.count)) : template.count,
    radius,
    maxAlive,
    wanderRadius: Number.isInteger(raw.wanderRadius) ? Math.max(0, Number(raw.wanderRadius)) : radius,
    respawnTicks: Number.isInteger(raw.respawnTicks)
      ? Math.max(1, Number(raw.respawnTicks))
      : undefined,
    respawnSec: Number.isInteger(raw.respawnSec) ? Math.max(1, Number(raw.respawnSec)) : undefined,
    level: Number.isInteger(raw.level) ? Math.max(1, Number(raw.level)) : template.level,
    templateId,
  };
}

/**
 * 把地图里的怪物刷点补全为带模板详情的编辑器态结构。
 */
function hydrateMapDocument(rawDocument) {
  if (!rawDocument || typeof rawDocument !== 'object') {
    return rawDocument;
  }
/**
 * 记录怪物templates。
 */
  const monsterTemplates = loadMonsterTemplates();
  return {
    ...rawDocument,
    monsterSpawns: Array.isArray(rawDocument.monsterSpawns)
      ? rawDocument.monsterSpawns.map((spawn) => hydrateMonsterSpawnRecord(spawn, monsterTemplates))
      : [],
  };
}

/**
 * 处理dehydrate怪物出生点record。
 */
function dehydrateMonsterSpawnRecord(spawn, monsterTemplates) {
  if (!spawn || typeof spawn !== 'object') {
    return spawn;
  }
/**
 * 记录templateID。
 */
  const templateId = typeof spawn.templateId === 'string' && spawn.templateId.trim()
    ? spawn.templateId
    : spawn.id;
/**
 * 记录template。
 */
  const template = templateId ? monsterTemplates.get(templateId) : undefined;
  if (!template) {
    return spawn;
  }
/**
 * 记录persisted。
 */
  const persisted = {
    id: spawn.id,
    x: spawn.x,
    y: spawn.y,
  };
  if (templateId !== spawn.id) persisted.templateId = templateId;
  if (spawn.grade !== template.grade) persisted.grade = spawn.grade;
  if ((spawn.count ?? spawn.maxAlive ?? 1) !== template.count) persisted.count = spawn.count;
  if ((spawn.radius ?? 3) !== template.radius) persisted.radius = spawn.radius;
  if ((spawn.maxAlive ?? spawn.count ?? 1) !== (template.maxAlive ?? template.count ?? 1)) persisted.maxAlive = spawn.maxAlive;
/**
 * 记录defaultwanderradius。
 */
  const defaultWanderRadius = spawn.radius ?? template.radius;
  if ((spawn.wanderRadius ?? defaultWanderRadius) !== defaultWanderRadius) persisted.wanderRadius = spawn.wanderRadius;
/**
 * 记录effectiverespawnticks。
 */
  const effectiveRespawnTicks = Number.isInteger(spawn.respawnTicks)
    ? Math.max(1, Number(spawn.respawnTicks))
    : Number.isInteger(spawn.respawnSec)
      ? Math.max(1, Number(spawn.respawnSec))
      : (template.respawnTicks ?? template.respawnSec ?? 15);
/**
 * 记录templaterespawn。
 */
  const templateRespawn = template.respawnTicks ?? template.respawnSec ?? 15;
  if (effectiveRespawnTicks !== templateRespawn) {
    if (spawn.respawnTicks !== undefined) persisted.respawnTicks = spawn.respawnTicks;
    else if (spawn.respawnSec !== undefined) persisted.respawnSec = spawn.respawnSec;
  }
  if ((spawn.level ?? undefined) !== template.level) persisted.level = spawn.level;
  return persisted;
}

/**
 * 把编辑器态地图压回精简持久化结构，避免重复写模板字段。
 */
function dehydrateMapDocument(document) {
/**
 * 记录怪物templates。
 */
  const monsterTemplates = loadMonsterTemplates();
  return {
    ...document,
    monsterSpawns: Array.isArray(document.monsterSpawns)
      ? document.monsterSpawns.map((spawn) => dehydrateMonsterSpawnRecord(spawn, monsterTemplates))
      : [],
  };
}

/**
 * 获取all地图文件paths。
 */
function getAllMapFilePaths() {
  return collectJsonFiles(MAPS_DIR);
}

/**
 * 查找地图文件路径。
 */
function findMapFilePath(mapId) {
  return getAllMapFilePaths().find((filePath) => path.basename(filePath, '.json') === mapId) || null;
}

/**
 * 获取地图目录meta。
 */
function getMapCatalogMeta(filePath, mainMapNameById) {
/**
 * 记录relative路径。
 */
  const relativePath = path.relative(MAPS_DIR, filePath).replaceAll(path.sep, '/');
/**
 * 记录segments。
 */
  const segments = relativePath.split('/').filter(Boolean);
  if (segments[0] === 'compose' && segments.length >= 3) {
/**
 * 记录groupID。
 */
    const groupId = segments[1];
    return {
      catalogMode: 'piece',
      catalogGroupId: groupId,
      catalogGroupName: mainMapNameById.get(groupId) || groupId,
      sourcePath: relativePath,
    };
  }
  return {
    catalogMode: 'main',
    sourcePath: relativePath,
  };
}

/**
 * 构建地图总览列表，供编辑器首页展示和分组。
 */
function buildLocalEditableMapList() {
/**
 * 汇总当前条目列表。
 */
  const entries = getAllMapFilePaths().map((filePath) => {
/**
 * 记录raw。
 */
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
/**
 * 记录文档。
 */
    const document = normalizeEditableMapDocument(hydrateMapDocument(raw));
    return { filePath, document };
  });/**
 * 按 ID 组织main名称by映射。
 */

  const mainMapNameById = new Map(
    entries
      .filter(({ filePath }) => !path.relative(MAPS_DIR, filePath).replaceAll(path.sep, '/').startsWith('compose/'))
      .map(({ document }) => [document.id, document.name]),
  );
  return {
    maps: entries
      .map(({ filePath, document }) => ({
        id: document.id,
        name: document.name,
        width: document.width,
        height: document.height,
        description: document.description,
        dangerLevel: document.dangerLevel,
        recommendedRealm: document.recommendedRealm,
        portalCount: document.portals.length,
        npcCount: document.npcs.length,
        monsterSpawnCount: document.monsterSpawns.length,
        ...getMapCatalogMeta(filePath, mainMapNameById),
      }))
      .sort((left, right) => {
        if ((left.catalogMode ?? 'main') !== (right.catalogMode ?? 'main')) {
          return (left.catalogMode ?? 'main').localeCompare(right.catalogMode ?? 'main', 'zh-CN');
        }
        if ((left.catalogGroupName ?? '') !== (right.catalogGroupName ?? '')) {
          return (left.catalogGroupName ?? '').localeCompare(right.catalogGroupName ?? '', 'zh-CN');
        }
        return left.id.localeCompare(right.id, 'zh-CN');
      }),
  };
}

/**
 * 获取all地图documents。
 */
function getAllMapDocuments() {
  return getAllMapFilePaths().map((filePath) => {
/**
 * 记录raw。
 */
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return normalizeEditableMapDocument(hydrateMapDocument(raw));
  });
}

/**
 * 获取地图文档。
 */
function getMapDocument(mapId) {
  if (!/^[a-zA-Z0-9._-]+$/.test(mapId)) {
    throw new Error('非法地图 ID');
  }
/**
 * 记录文件路径。
 */
  const filePath = findMapFilePath(mapId);
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('目标地图不存在');
  }
  return normalizeEditableMapDocument(hydrateMapDocument(JSON.parse(fs.readFileSync(filePath, 'utf-8'))));
}

/**
 * 校验并保存单张地图配置。
 */
function saveMapDocument(mapId, rawDocument) {
  if (!/^[a-zA-Z0-9._-]+$/.test(mapId)) {
    throw new Error('非法地图 ID');
  }
/**
 * 记录normalized。
 */
  const normalized = normalizeEditableMapDocument(hydrateMapDocument(rawDocument));
  if (normalized.id !== mapId) {
    throw new Error('地图 ID 不允许在编辑器中直接修改');
  }
/**
 * 记录validationerror。
 */
  const validationError = validateEditableMapDocument(normalized);
  if (validationError) {
    throw new Error(validationError);
  }
/**
 * 记录persisted。
 */
  const persisted = dehydrateMapDocument(normalized);
/**
 * 记录目标路径。
 */
  const targetPath = findMapFilePath(mapId) || path.join(MAPS_DIR, `${mapId}.json`);
  fs.writeFileSync(targetPath, `${JSON.stringify(persisted, null, 2)}\n`, 'utf-8');
}

/**
 * 处理列表contentjson文件列表。
 */
function listContentJsonFiles() {
/**
 * 汇总待处理文件列表。
 */
  const files = [];
/**
 * 记录walk。
 */
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
/**
 * 记录完整流程路径。
 */
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue;
      }
/**
 * 记录relative路径。
 */
      const relativePath = path.relative(CONTENT_DIR, fullPath).replaceAll(path.sep, '/');
      files.push({
        path: relativePath,
        name: entry.name,
        category: path.dirname(relativePath) === '.' ? 'content' : path.dirname(relativePath),
      });
    }
  };
  walk(CONTENT_DIR);
  return files.sort((left, right) => left.path.localeCompare(right.path, 'zh-CN'));
}

/**
 * 读取content文件。
 */
function readContentFile(relativePath) {
/**
 * 记录文件路径。
 */
  const filePath = ensureWithin(CONTENT_DIR, relativePath);
  if (!filePath.endsWith('.json') || !fs.existsSync(filePath)) {
    throw new Error('目标配置文件不存在');
  }
  return {
    path: path.relative(CONTENT_DIR, filePath).replaceAll(path.sep, '/'),
    content: fs.readFileSync(filePath, 'utf-8'),
  };
}

/**
 * 处理savecontent文件。
 */
function saveContentFile(relativePath, content) {
/**
 * 记录文件路径。
 */
  const filePath = ensureWithin(CONTENT_DIR, relativePath);
  if (!filePath.endsWith('.json')) {
    throw new Error('只允许保存 JSON 配置文件');
  }
/**
 * 记录parsed。
 */
  const parsed = JSON.parse(content);
  fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf-8');
}

/**
 * 获取服务端status。
 */
function getServerStatus() {
  return { ...serverState };
}

/**
 * 优雅停止当前被编辑器托管的主游戏服进程。
 */
function stopServerProcess() {
  return new Promise((resolve) => {
    if (!serverChild || serverChild.killed) {
      serverChild = null;
      serverState.running = false;
      serverState.pid = undefined;
      resolve();
      return;
    }

/**
 * 记录子进程。
 */
    const child = serverChild;
/**
 * 记录超时时间。
 */
    const timeout = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {}
    }, 5000);

    child.once('exit', () => {
      clearTimeout(timeout);
      if (serverChild === child) {
        serverChild = null;
        serverState.running = false;
        serverState.pid = undefined;
      }
      resolve();
    });

    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      clearTimeout(timeout);
      serverChild = null;
      serverState.running = false;
      serverState.pid = undefined;
      resolve();
    }
  });
}

/**
 * 重启被托管的主游戏服，并刷新状态信息。
 */
async function restartServer(reason) {
  if (!MANAGE_GAME_SERVER) {
    throw new Error('当前配置编辑器未托管主游戏服；如需启用，请使用 CONFIG_EDITOR_MANAGE_GAME_SERVER=1 重新启动。');
  }
  serverRestartToken += 1;
/**
 * 记录令牌。
 */
  const token = serverRestartToken;
  await stopServerProcess();
  if (token !== serverRestartToken) {
    return;
  }

/**
 * 记录子进程。
 */
  const child = spawn('pnpm', ['--filter', '@mud/server', 'start:dev'], {
    cwd: ROOT_DIR,
    detached: true,
    stdio: 'inherit',
  });

  serverChild = child;
  serverState.running = true;
  serverState.pid = child.pid;
  serverState.lastRestartAt = new Date().toISOString();
  serverState.lastRestartReason = reason;

  child.on('exit', () => {
    if (serverChild !== child) {
      return;
    }
    serverChild = null;
    serverState.running = false;
    serverState.pid = undefined;
  });
}

/**
 * 对频繁文件变更做防抖后触发游戏服自动重启。
 */
function scheduleRestart(reason) {
  if (!MANAGE_GAME_SERVER) {
    return;
  }
  if (restartDebounceTimer) {
    clearTimeout(restartDebounceTimer);
  }
  restartDebounceTimer = setTimeout(() => {
    restartDebounceTimer = null;
    restartServer(reason).catch((error) => {
      console.error('[config-editor] 自动重启服务失败:', error);
    });
  }, 250);
}

/**
 * 刷新内容目录监听器集合，确保新增子目录也能触发重启。
 */
function refreshContentWatchers() {
/**
 * 记录nextdirs。
 */
  const nextDirs = new Set();
/**
 * 记录walk。
 */
  const walk = (dir) => {
    nextDirs.add(dir);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name));
      }
    }
  };
  walk(CONTENT_DIR);

  for (const watchedDir of contentWatchers.keys()) {
    if (!nextDirs.has(watchedDir)) {
      contentWatchers.get(watchedDir).close();
      contentWatchers.delete(watchedDir);
    }
  }

  for (const dir of nextDirs) {
    if (contentWatchers.has(dir)) {
      continue;
    }
/**
 * 记录监听器。
 */
    const watcher = fs.watch(dir, (eventType, filename) => {
      if (!filename) {
        scheduleRestart('配置目录发生变更');
        return;
      }
/**
 * 记录完整流程路径。
 */
      const fullPath = path.join(dir, filename.toString());
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        refreshContentWatchers();
      }
      scheduleRestart(`配置文件变更: ${path.relative(CONTENT_DIR, fullPath).replaceAll(path.sep, '/')}`);
      if (eventType === 'rename') {
        refreshContentWatchers();
      }
    });
    contentWatchers.set(dir, watcher);
  }
}

/**
 * 分发配置编辑器本地 API 的全部路由请求。
 */
async function handleRequest(req, res) {
  if (!req.url) {
    writeError(res, 400, '缺少请求地址');
    return;
  }

/**
 * 记录url地址。
 */
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = url.pathname;

  try {
    if (req.method === 'GET' && pathname === '/api/maps') {
      writeJson(res, 200, buildLocalEditableMapList());
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/api/maps/')) {/**
 * 按 ID 组织mapId映射。
 */

      const mapId = decodeURIComponent(pathname.slice('/api/maps/'.length));
      writeJson(res, 200, { map: cloneMapDocument(getMapDocument(mapId)) });
      return;
    }

    if (req.method === 'PUT' && pathname.startsWith('/api/maps/')) {/**
 * 按 ID 组织mapId映射。
 */

      const mapId = decodeURIComponent(pathname.slice('/api/maps/'.length));
      const body = await readJsonBody(req);
      if (!body || typeof body !== 'object' || !body.map) {
        writeError(res, 400, '缺少地图数据');
        return;
      }
      saveMapDocument(mapId, body.map);
      writeJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/config-files') {
      writeJson(res, 200, { files: listContentJsonFiles() });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/monsters') {
      writeJson(res, 200, { monsters: listMonsterTemplates() });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/techniques') {
      writeJson(res, 200, {
        techniques: listTechniqueTemplates(),
        sharedBuffs: listTechniqueBuffTemplates(),
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/editor-catalog') {
      writeJson(res, 200, { items: listEditorItems() });
      return;
    }

    if (req.method === 'PUT' && pathname === '/api/monsters') {
/**
 * 记录请求体。
 */
      const body = await readJsonBody(req);
      if (!body || typeof body.key !== 'string' || !body.monster || typeof body.monster !== 'object') {
        writeError(res, 400, '缺少怪物模板键或怪物数据');
        return;
      }
/**
 * 累计当前结果。
 */
      const result = saveMonsterTemplateEntry(body.key, body.monster);
      writeJson(res, 200, { ok: true, updatedMapCount: result.updatedMapCount, monster: result.monster });
      return;
    }

    if (req.method === 'PUT' && pathname === '/api/techniques') {
/**
 * 记录请求体。
 */
      const body = await readJsonBody(req);
      if (!body || typeof body.key !== 'string' || !body.technique || typeof body.technique !== 'object') {
        writeError(res, 400, '缺少功法键或功法数据');
        return;
      }
/**
 * 累计当前结果。
 */
      const result = saveTechniqueTemplateEntry(body.key, body.technique);
      writeJson(res, 200, { ok: true, technique: result.technique });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/config-file') {
/**
 * 记录文件路径。
 */
      const filePath = url.searchParams.get('path');
      if (!filePath) {
        writeError(res, 400, '缺少配置文件路径');
        return;
      }
      writeJson(res, 200, readContentFile(filePath));
      return;
    }

    if (req.method === 'PUT' && pathname === '/api/config-file') {
/**
 * 记录请求体。
 */
      const body = await readJsonBody(req);
      if (!body || typeof body.path !== 'string' || typeof body.content !== 'string') {
        writeError(res, 400, '缺少配置文件路径或内容');
        return;
      }
      saveContentFile(body.path, body.content);
      writeJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/server/status') {
      writeJson(res, 200, getServerStatus());
      return;
    }

    if (req.method === 'POST' && pathname === '/api/server/restart') {
      await restartServer('手动重启');
      writeJson(res, 200, { ok: true });
      return;
    }

    writeError(res, 404, '接口不存在');
  } catch (error) {
    writeError(res, 400, error instanceof Error ? error.message : '请求处理失败');
  }
}

/**
 * 启动本地 API 服务、文件监听和可选的主游戏服托管流程。
 */
async function bootstrap() {
  refreshContentWatchers();
  if (MANAGE_GAME_SERVER) {
    await restartServer('配置编辑器启动');
  } else {
    console.log('[config-editor] 已以独立模式启动，不会自动拉起或重启 @mud/server');
  }

/**
 * 记录服务端。
 */
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      writeError(res, 500, error instanceof Error ? error.message : '服务内部错误');
    });
  });

  server.listen(API_PORT, '127.0.0.1', () => {
    console.log(`[config-editor] local api running at http://127.0.0.1:${API_PORT}`);
  });

  const shutdown = async () => {
    for (const watcher of contentWatchers.values()) {
      watcher.close();
    }
    contentWatchers.clear();
    server.close();
    await stopServerProcess();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    shutdown().catch(() => process.exit(1));
  });
  process.on('SIGTERM', () => {
    shutdown().catch(() => process.exit(1));
  });
}

bootstrap().catch((error) => {
  console.error('[config-editor] 启动失败:', error);
  process.exit(1);
});
