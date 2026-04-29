/**
 * 配置编辑器的本地桥接层：负责读写内容文件、同步地图引用，并按需托管主游戏服。
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');
const { spawn } = require('child_process');
/**
 * 仓库根目录，所有配置读取、写回和共享构建路径都以此为基准。
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
  validateEditableMapPortalReciprocity,
} = require(path.join(ROOT_DIR, 'packages/shared/dist/index.js'));

/**
 * 服务端内容数据根目录。
 */
const SERVER_DATA_DIR = path.join(ROOT_DIR, 'packages/server/data');
/**
 * 地图配置所在目录。
 */
const MAPS_DIR = path.join(SERVER_DATA_DIR, 'maps');
/**
 * 其他可编辑内容配置所在目录。
 */
const CONTENT_DIR = path.join(SERVER_DATA_DIR, 'content');
/**
 * 本地 API 默认监听端口。
 */
const API_PORT = Number(process.env.CONFIG_EDITOR_API_PORT || 3101);
/**
 * 是否由编辑器负责启动和重启主游戏服。
 */
const MANAGE_GAME_SERVER = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.CONFIG_EDITOR_MANAGE_GAME_SERVER || '').toLowerCase(),
);
/**
 * 功法和怪物共用的合法品阶。
 */
const TECHNIQUE_GRADES = ['mortal', 'yellow', 'mystic', 'earth', 'heaven', 'spirit', 'saint', 'emperor'];
/**
 * 功法分类枚举，供编辑器列表和校验使用。
 */
const TECHNIQUE_CATEGORIES = ['arts', 'internal', 'divine', 'secret'];
/**
 * 怪物编辑器允许的仇恨模式。
 */
const MONSTER_AGGRO_MODES = ['always', 'retaliate', 'day_only', 'night_only'];
/**
 * 编辑器允许识别的物品类型。
 */
const ITEM_TYPES = ['consumable', 'equipment', 'material', 'quest_item', 'skill_book'];

/**
 * 当前被编辑器托管的主游戏服子进程。
 */
let serverChild = null;
/**
 * 用于丢弃过期重启请求的递增令牌。
 */
let serverRestartToken = 0;
/**
 * 内容文件变更后的重启防抖定时器。
 */
let restartDebounceTimer = null;
/**
 * 按目录保存的文件监听器，便于重建和关闭。
 */
const contentWatchers = new Map();
/**
 * 供前端展示的托管状态、进程号和最近重启原因。
 */
const serverState = {
  managed: MANAGE_GAME_SERVER,
  running: false,
  pid: undefined,
  lastRestartAt: undefined,
  lastRestartReason: MANAGE_GAME_SERVER ? '初始化启动' : '未启用编辑器托管',
  mode: MANAGE_GAME_SERVER
    ? 'pnpm --dir packages/server start:dev'
    : '未托管（设置 CONFIG_EDITOR_MANAGE_GAME_SERVER=1 后启用）',
};

/**
 * 统一写出 JSON 响应头和响应体。
 */
function writeJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/**
 * 统一写出错误响应。
 */
function writeError(res, statusCode, message) {
  writeJson(res, statusCode, { error: message });
}

/**
 * 读取 JSON 请求体，并限制体积避免异常大包。
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
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
 * 把相对路径收束到指定根目录内，避免越权读写。
 */
function ensureWithin(baseDir, targetPath) {
  const resolved = path.resolve(baseDir, targetPath);
  if (resolved === baseDir || resolved.startsWith(`${baseDir}${path.sep}`)) {
    return resolved;
  }
  throw new Error('非法路径');
}

/**
 * 递归收集目录下的 JSON 文件，供列表页和保存接口共用。
 */
function collectJsonFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  const files = [];
  for (const entry of entries) {
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
 * 把输入折算成正整数，失败时回退到默认值。
 */
function toPositiveInteger(value, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(Number(value)));
}

/**
 * 把输入折算成非负整数，失败时回退到默认值。
 */
function toNonNegativeInteger(value, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(Number(value)));
}

/**
 * 将怪物掉落项清洗成可持久化的最小结构。
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
 * 只保留物品装备属性里的六维字段。
 */
function normalizeItemAttrs(attrs) {
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) {
    return undefined;
  }
  const normalized = {};
  for (const key of ['constitution', 'spirit', 'perception', 'talent', 'comprehension', 'luck']) {
    if (Number.isFinite(attrs[key])) {
      normalized[key] = Number(attrs[key]);
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

/**
 * 汇总编辑器可展示的物品模板，并补齐筛选和展示所需字段。
 */
function listEditorItems() {
  const itemsDir = path.join(CONTENT_DIR, 'items');
  const result = [];
  for (const filePath of collectJsonFiles(itemsDir)) {
    const entries = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!Array.isArray(entries)) {
      continue;
    }
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const itemId = typeof entry.itemId === 'string' ? entry.itemId.trim() : '';
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
    const nameOrder = left.name.localeCompare(right.name, 'zh-CN');
    if (nameOrder !== 0) {
      return nameOrder;
    }
    return left.itemId.localeCompare(right.itemId, 'zh-CN');
  });
}

/**
 * 只保留怪物 valueStats 里的数值字段和五行增减分组。
 */
function normalizeMonsterValueStats(rawValueStats) {
  if (!rawValueStats || typeof rawValueStats !== 'object' || Array.isArray(rawValueStats)) {
    return undefined;
  }
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
  const normalizeElementGroup = (key) => {
    const group = rawValueStats[key];
    if (!group || typeof group !== 'object' || Array.isArray(group)) {
      return undefined;
    }
    const normalizedGroup = {};
    for (const element of ['metal', 'wood', 'water', 'fire', 'earth']) {
      if (Number.isFinite(group[element])) {
        normalizedGroup[element] = Number(group[element]);
      }
    }
    return Object.keys(normalizedGroup).length > 0 ? normalizedGroup : undefined;
  };
  const elementDamageBonus = normalizeElementGroup('elementDamageBonus');
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
 * 构建按物品 ID 索引的目录，便于掉落和装备校验。
 */
function buildEditorItemLookup() {
  return new Map(listEditorItems().map((item) => [item.itemId, item]));
}

/**
 * 校验怪物模板的必填字段、掉落完整性和 ID 唯一性。
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
  }

  const hasValueStats = monster.valueStats && typeof monster.valueStats === 'object' && !Array.isArray(monster.valueStats) && Object.keys(monster.valueStats).length > 0;
  const hasAttrs = monster.attrs && typeof monster.attrs === 'object' && !Array.isArray(monster.attrs) && Object.keys(monster.attrs).length > 0;
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

  const entries = listMonsterTemplates();
  const duplicated = entries.find((entry) => entry.monster.id === monster.id && entry.key !== currentKey);
  if (duplicated) {
    throw new Error(`怪物 ID 重复：${monster.id}`);
  }
}

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
 * 用文件路径和索引生成怪物模板的稳定定位键。
 */
function createMonsterEntryKey(filePath, index) {
  return `${filePath}#${index}`;
}

/**
 * 反解怪物模板定位键，取回文件路径和数组索引。
 */
function parseMonsterEntryKey(key) {
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
 * 读取全部怪物模板，并附上文件路径和索引信息供编辑器定位。
 */
function listMonsterTemplates() {
  const monstersDir = path.join(CONTENT_DIR, 'monsters');
  const itemLookup = buildEditorItemLookup();
  const result = [];
  for (const filePath of collectJsonFiles(monstersDir)) {
    const relativePath = path.relative(CONTENT_DIR, filePath).replaceAll(path.sep, '/');
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
    const nameOrder = left.monster.name.localeCompare(right.monster.name, 'zh-CN');
    if (nameOrder !== 0) {
      return nameOrder;
    }
    return left.monster.id.localeCompare(right.monster.id, 'zh-CN');
  });
}

/**
 * 保存怪物 ID 变更后，回写所有地图中的怪物刷点引用。
 */
function updateMapMonsterReferences(previousId, nextId) {
  if (!previousId || !nextId || previousId === nextId) {
    return 0;
  }
  let updatedFileCount = 0;
  for (const filePath of collectJsonFiles(MAPS_DIR)) {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!Array.isArray(raw?.monsterSpawns)) {
      continue;
    }
    let changed = false;
    raw.monsterSpawns = raw.monsterSpawns.map((spawn) => {
      if (!spawn || typeof spawn !== 'object') {
        return spawn;
      }
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
 * 保存单个怪物模板，并在 ID 变化时同步更新地图引用。
 */
function saveMonsterTemplateEntry(key, rawMonster) {
  const { filePath, index } = parseMonsterEntryKey(key);
  const absolutePath = ensureWithin(CONTENT_DIR, filePath);
  const entries = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
  if (!Array.isArray(entries) || !entries[index] || typeof entries[index] !== 'object') {
    throw new Error('目标怪物模板不存在');
  }
  const itemLookup = buildEditorItemLookup();
  const previousMonster = resolveMonsterTemplateRecord(entries[index], itemLookup);
  const monster = resolveMonsterTemplateRecord(rawMonster, itemLookup);
  validateMonsterTemplate(monster, key);
  entries[index] = serializeMonsterTemplate(entries[index], monster);
  fs.writeFileSync(absolutePath, `${JSON.stringify(entries, null, 2)}\n`, 'utf-8');
  const updatedMapCount = updateMapMonsterReferences(previousMonster.id, monster.id);
  return {
    monster,
    updatedMapCount,
  };
}

/**
 * 按境界、品阶、分类和名称排序功法模板列表。
 */
function compareTechniqueEntries(left, right) {
  const leftRealm = Number.isFinite(left.technique.realmLv) ? Math.max(1, Math.floor(Number(left.technique.realmLv))) : 1;
  const rightRealm = Number.isFinite(right.technique.realmLv) ? Math.max(1, Math.floor(Number(right.technique.realmLv))) : 1;
  if (leftRealm !== rightRealm) {
    return leftRealm - rightRealm;
  }
  const leftGrade = TECHNIQUE_GRADES.indexOf(left.technique.grade);
  const rightGrade = TECHNIQUE_GRADES.indexOf(right.technique.grade);
  if (leftGrade !== rightGrade) {
    return leftGrade - rightGrade;
  }
  const leftCategory = TECHNIQUE_CATEGORIES.indexOf(left.technique.category);
  const rightCategory = TECHNIQUE_CATEGORIES.indexOf(right.technique.category);
  if (leftCategory !== rightCategory) {
    return leftCategory - rightCategory;
  }
  const nameOrder = String(left.technique.name ?? left.technique.id).localeCompare(String(right.technique.name ?? right.technique.id), 'zh-CN');
  if (nameOrder !== 0) {
    return nameOrder;
  }
  return String(left.technique.id).localeCompare(String(right.technique.id), 'zh-CN');
}

/**
 * 读取全部功法模板，供编辑器列表和详情页复用。
 */
function listTechniqueTemplates() {
  const techniquesDir = path.join(CONTENT_DIR, 'techniques');
  const result = [];
  for (const filePath of collectJsonFiles(techniquesDir)) {
    const relativePath = path.relative(CONTENT_DIR, filePath).replaceAll(path.sep, '/');
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
 * 读取所有共享 Buff 模板，供功法编辑器做引用解析。
 */
function listTechniqueBuffTemplates() {
  const buffsDir = path.join(CONTENT_DIR, 'technique-buffs');
  const result = [];
  for (const filePath of collectJsonFiles(buffsDir)) {
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
 * 校验功法模板的基础字段、技能列表和 ID 唯一性。
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
  const duplicated = listTechniqueTemplates().find((entry) => entry.technique.id === technique.id && entry.key !== currentKey);
  if (duplicated) {
    throw new Error(`功法 ID 重复：${technique.id}`);
  }
}

/**
 * 保存功法模板到原文件位置。
 */
function saveTechniqueTemplateEntry(key, technique) {
  const { filePath, index } = parseMonsterEntryKey(key);
  if (!filePath.startsWith('techniques/')) {
    throw new Error('目标功法文件路径非法');
  }
  const absolutePath = ensureWithin(CONTENT_DIR, filePath);
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
 * 读取所有怪物模板，生成按 ID 查询的解析表。
 */
function loadMonsterTemplates() {
  const monstersDir = path.join(CONTENT_DIR, 'monsters');
  const itemLookup = buildEditorItemLookup();
  const templates = new Map();
  for (const filePath of collectJsonFiles(monstersDir)) {
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
 * 把地图里的刷点补成编辑器可直接展示的完整怪物记录。
 */
function hydrateMonsterSpawnRecord(raw, monsterTemplates) {
  if (!raw || typeof raw !== 'object') {
    return raw;
  }
  const templateId = typeof raw.templateId === 'string'
    ? raw.templateId
    : (typeof raw.id === 'string' ? raw.id : undefined);
  const template = templateId ? monsterTemplates.get(templateId) : undefined;
  if (!template) {
    return raw;
  }
  const radius = Number.isInteger(raw.radius) ? Math.max(0, Number(raw.radius)) : template.radius;
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
 * 把地图文件补成编辑器态结构，方便页面直接预览和编辑。
 */
function hydrateMapDocument(rawDocument) {
  if (!rawDocument || typeof rawDocument !== 'object') {
    return rawDocument;
  }
  const monsterTemplates = loadMonsterTemplates();
  return {
    ...rawDocument,
    monsterSpawns: Array.isArray(rawDocument.monsterSpawns)
      ? rawDocument.monsterSpawns.map((spawn) => hydrateMonsterSpawnRecord(spawn, monsterTemplates))
      : [],
  };
}

/**
 * 把编辑器态刷点压回精简的持久化结构，避免重复写模板字段。
 */
function dehydrateMonsterSpawnRecord(spawn, monsterTemplates) {
  if (!spawn || typeof spawn !== 'object') {
    return spawn;
  }
  const templateId = typeof spawn.templateId === 'string' && spawn.templateId.trim()
    ? spawn.templateId
    : spawn.id;
  const template = templateId ? monsterTemplates.get(templateId) : undefined;
  if (!template) {
    return spawn;
  }
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
  const defaultWanderRadius = spawn.radius ?? template.radius;
  if ((spawn.wanderRadius ?? defaultWanderRadius) !== defaultWanderRadius) persisted.wanderRadius = spawn.wanderRadius;
  const effectiveRespawnTicks = Number.isInteger(spawn.respawnTicks)
    ? Math.max(1, Number(spawn.respawnTicks))
    : Number.isInteger(spawn.respawnSec)
      ? Math.max(1, Number(spawn.respawnSec))
      : (template.respawnTicks ?? template.respawnSec ?? 15);
  const templateRespawn = template.respawnTicks ?? template.respawnSec ?? 15;
  if (effectiveRespawnTicks !== templateRespawn) {
    if (spawn.respawnTicks !== undefined) persisted.respawnTicks = spawn.respawnTicks;
    else if (spawn.respawnSec !== undefined) persisted.respawnSec = spawn.respawnSec;
  }
  if ((spawn.level ?? undefined) !== template.level) persisted.level = spawn.level;
  return persisted;
}

/**
 * 把编辑器态地图压回可写回磁盘的精简结构。
 */
function dehydrateMapDocument(document) {
  const monsterTemplates = loadMonsterTemplates();
  return {
    ...document,
    monsterSpawns: Array.isArray(document.monsterSpawns)
      ? document.monsterSpawns.map((spawn) => dehydrateMonsterSpawnRecord(spawn, monsterTemplates))
      : [],
  };
}

/**
 * 获取地图目录下的全部 JSON 文件。
 */
function getAllMapFilePaths() {
  return collectJsonFiles(MAPS_DIR);
}

/**
 * 按地图 ID 查找对应的文件路径。
 */
function findMapFilePath(mapId) {
  return getAllMapFilePaths().find((filePath) => path.basename(filePath, '.json') === mapId) || null;
}

/**
 * 计算地图在编辑器目录页里展示的分组信息。
 */
function getMapCatalogMeta(filePath, mainMapNameById) {
  const relativePath = path.relative(MAPS_DIR, filePath).replaceAll(path.sep, '/');
  const segments = relativePath.split('/').filter(Boolean);
  if (segments[0] === 'compose' && segments.length >= 3) {
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
 * 构建地图总览，给首页和分组视图共用。
 */
function buildLocalEditableMapList() {
  const entries = getAllMapFilePaths().map((filePath) => {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const document = normalizeEditableMapDocument(hydrateMapDocument(raw));
    return { filePath, document };
  });

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
 * 读取全部地图文档，供列表和详情接口复用。
 */
function getAllMapDocuments() {
  return getAllMapFilePaths().map((filePath) => {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return normalizeEditableMapDocument(hydrateMapDocument(raw));
  });
}

/**
 * 按地图 ID 读取单张地图并补全为编辑器态结构。
 */
function getMapDocument(mapId) {
  if (!/^[a-zA-Z0-9._-]+$/.test(mapId)) {
    throw new Error('非法地图 ID');
  }
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
  const normalized = normalizeEditableMapDocument(hydrateMapDocument(rawDocument));
  if (normalized.id !== mapId) {
    throw new Error('地图 ID 不允许在编辑器中直接修改');
  }
  const validationError = validateEditableMapDocument(normalized);
  if (validationError) {
    throw new Error(validationError);
  }
  const allDocuments = getAllMapDocuments().map((document) => document.id === mapId ? normalized : document);
  const portalValidationError = validateEditableMapPortalReciprocity(allDocuments);
  if (portalValidationError) {
    throw new Error(portalValidationError);
  }
  const persisted = dehydrateMapDocument(normalized);
  const targetPath = findMapFilePath(mapId) || path.join(MAPS_DIR, `${mapId}.json`);
  fs.writeFileSync(targetPath, `${JSON.stringify(persisted, null, 2)}\n`, 'utf-8');
}

/**
 * 递归读取内容目录下的 JSON 文件，用于配置文件列表页。
 */
function listContentJsonFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue;
      }
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
 * 读取单个内容配置文件。
 */
function readContentFile(relativePath) {
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
 * 写回单个内容配置文件。
 */
function saveContentFile(relativePath, content) {
  const filePath = ensureWithin(CONTENT_DIR, relativePath);
  if (!filePath.endsWith('.json')) {
    throw new Error('只允许保存 JSON 配置文件');
  }
  const parsed = JSON.parse(content);
  fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf-8');
}

/**
 * 返回当前托管状态的快照，供前端轮询展示。
 */
function getServerStatus() {
  return { ...serverState };
}

/**
 * 尽量平滑地停止被编辑器托管的主游戏服进程。
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

    const child = serverChild;
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
 * 重新启动托管的主游戏服，并刷新前端可见的状态。
 */
async function restartServer(reason) {
  if (!MANAGE_GAME_SERVER) {
    throw new Error('当前配置编辑器未托管主游戏服；如需启用，请使用 CONFIG_EDITOR_MANAGE_GAME_SERVER=1 重新启动。');
  }
  serverRestartToken += 1;
  const token = serverRestartToken;
  await stopServerProcess();
  if (token !== serverRestartToken) {
    return;
  }

  const child = spawn('pnpm', ['--dir', 'packages/server', 'start:dev'], {
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
 * 对连续文件变更做防抖，避免写盘时重复重启。
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
 * 重新扫描内容目录并维护监听器，保证新增子目录也能触发重启。
 */
function refreshContentWatchers() {
  const nextDirs = new Set();
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
    const watcher = fs.watch(dir, (eventType, filename) => {
      if (!filename) {
        scheduleRestart('配置目录发生变更');
        return;
      }
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
 * 分发本地 API 路由，把读写内容文件和服务托管能力统一暴露给前端。
 */
async function handleRequest(req, res) {
  if (!req.url) {
    writeError(res, 400, '缺少请求地址');
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = url.pathname;

  try {
    if (req.method === 'GET' && pathname === '/api/maps') {
      writeJson(res, 200, buildLocalEditableMapList());
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/api/maps/')) {

      const mapId = decodeURIComponent(pathname.slice('/api/maps/'.length));
      writeJson(res, 200, { map: cloneMapDocument(getMapDocument(mapId)) });
      return;
    }

    if (req.method === 'PUT' && pathname.startsWith('/api/maps/')) {

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
      const body = await readJsonBody(req);
      if (!body || typeof body.key !== 'string' || !body.monster || typeof body.monster !== 'object') {
        writeError(res, 400, '缺少怪物模板键或怪物数据');
        return;
      }
      const result = saveMonsterTemplateEntry(body.key, body.monster);
      writeJson(res, 200, { ok: true, updatedMapCount: result.updatedMapCount, monster: result.monster });
      return;
    }

    if (req.method === 'PUT' && pathname === '/api/techniques') {
      const body = await readJsonBody(req);
      if (!body || typeof body.key !== 'string' || !body.technique || typeof body.technique !== 'object') {
        writeError(res, 400, '缺少功法键或功法数据');
        return;
      }
      const result = saveTechniqueTemplateEntry(body.key, body.technique);
      writeJson(res, 200, { ok: true, technique: result.technique });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/config-file') {
      const filePath = url.searchParams.get('path');
      if (!filePath) {
        writeError(res, 400, '缺少配置文件路径');
        return;
      }
      writeJson(res, 200, readContentFile(filePath));
      return;
    }

    if (req.method === 'PUT' && pathname === '/api/config-file') {
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
 * 启动本地 API、目录监听和可选的主游戏服托管流程。
 */
async function bootstrap() {
  refreshContentWatchers();
  if (MANAGE_GAME_SERVER) {
    await restartServer('配置编辑器启动');
  } else {
    console.log('[config-editor] 已以独立模式启动，不会自动拉起或重启 packages/server');
  }

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      writeError(res, 500, error instanceof Error ? error.message : '服务内部错误');
    });
  });

  server.listen(API_PORT, '127.0.0.1', () => {
    console.log(`[config-editor] local api running at http://127.0.0.1:${API_PORT}`);
  });

  /** 关闭 HTTP 服务、监听器和托管中的主游戏服。 */
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
