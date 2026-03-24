const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');
const { spawn } = require('child_process');
const ROOT_DIR = path.resolve(__dirname, '../..');
const {
  buildEditableMapList,
  cloneMapDocument,
  inferMonsterValueStatsFromLegacy,
  normalizeEditableMapDocument,
  resolveMonsterNumericStatsFromValueStats,
  validateEditableMapDocument,
} = require(path.join(ROOT_DIR, 'packages/shared/dist/index.js'));

const SERVER_DATA_DIR = path.join(ROOT_DIR, 'packages/server/data');
const MAPS_DIR = path.join(SERVER_DATA_DIR, 'maps');
const CONTENT_DIR = path.join(SERVER_DATA_DIR, 'content');
const API_PORT = Number(process.env.CONFIG_EDITOR_API_PORT || 3101);
const TECHNIQUE_GRADES = ['mortal', 'yellow', 'mystic', 'earth', 'heaven', 'spirit', 'saint', 'emperor'];
const MONSTER_AGGRO_MODES = ['always', 'retaliate', 'day_only', 'night_only'];
const ITEM_TYPES = ['consumable', 'equipment', 'material', 'quest_item', 'skill_book'];

let serverChild = null;
let serverRestartToken = 0;
let restartDebounceTimer = null;
const contentWatchers = new Map();
const serverState = {
  running: false,
  pid: undefined,
  lastRestartAt: undefined,
  lastRestartReason: '初始化启动',
  mode: 'pnpm --filter @mud/server start:dev',
};

function writeJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function writeError(res, statusCode, message) {
  writeJson(res, statusCode, { error: message });
}

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

function ensureWithin(baseDir, targetPath) {
  const resolved = path.resolve(baseDir, targetPath);
  if (resolved === baseDir || resolved.startsWith(`${baseDir}${path.sep}`)) {
    return resolved;
  }
  throw new Error('非法路径');
}

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

function toPositiveInteger(value, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(Number(value)));
}

function toNonNegativeInteger(value, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(Number(value)));
}

function normalizeMonsterDrop(rawDrop) {
  return {
    itemId: typeof rawDrop?.itemId === 'string' ? rawDrop.itemId.trim() : '',
    name: typeof rawDrop?.name === 'string' ? rawDrop.name.trim() : '',
    type: ITEM_TYPES.includes(rawDrop?.type) ? rawDrop.type : 'material',
    count: toPositiveInteger(rawDrop?.count, 1),
    chance: Number.isFinite(rawDrop?.chance) ? Number(rawDrop.chance) : undefined,
  };
}

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
        desc: typeof entry.desc === 'string' ? entry.desc.trim() : undefined,
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
    'techniqueExpPerTick',
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

function normalizeMonsterTemplate(rawMonster) {
  const level = Number.isFinite(rawMonster?.level) ? toPositiveInteger(rawMonster.level, 1) : undefined;
  const legacyMaxHp = toPositiveInteger(rawMonster?.maxHp, toPositiveInteger(rawMonster?.hp, 1));
  const legacyAttack = toPositiveInteger(rawMonster?.attack, 1);
  const valueStats = normalizeMonsterValueStats(rawMonster?.valueStats)
    ?? inferMonsterValueStatsFromLegacy({
      maxHp: legacyMaxHp,
      attack: legacyAttack,
      level,
      viewRange: Number.isFinite(rawMonster?.viewRange) ? toNonNegativeInteger(rawMonster.viewRange, 6) : 6,
    });
  const computedStats = resolveMonsterNumericStatsFromValueStats(valueStats, level);
  const count = toPositiveInteger(rawMonster?.count, 1);
  const aggroRange = toNonNegativeInteger(rawMonster?.aggroRange, 6);
  return {
    id: typeof rawMonster?.id === 'string' ? rawMonster.id.trim() : '',
    name: typeof rawMonster?.name === 'string' ? rawMonster.name.trim() : '',
    char: typeof rawMonster?.char === 'string' ? rawMonster.char.trim() : '',
    color: typeof rawMonster?.color === 'string' ? rawMonster.color.trim() : '',
    grade: TECHNIQUE_GRADES.includes(rawMonster?.grade) ? rawMonster.grade : 'mortal',
    hp: toPositiveInteger(computedStats.maxHp, legacyMaxHp),
    maxHp: toPositiveInteger(computedStats.maxHp, legacyMaxHp),
    attack: toPositiveInteger(computedStats.physAtk || computedStats.spellAtk, legacyAttack),
    count,
    radius: toNonNegativeInteger(rawMonster?.radius, 3),
    maxAlive: toPositiveInteger(rawMonster?.maxAlive, count),
    aggroRange,
    viewRange: toNonNegativeInteger(rawMonster?.viewRange, aggroRange),
    aggroMode: MONSTER_AGGRO_MODES.includes(rawMonster?.aggroMode) ? rawMonster.aggroMode : 'always',
    respawnSec: toPositiveInteger(rawMonster?.respawnSec, 15),
    respawnTicks: Number.isFinite(rawMonster?.respawnTicks) ? toPositiveInteger(rawMonster.respawnTicks, 1) : undefined,
    level,
    expMultiplier: Number.isFinite(rawMonster?.expMultiplier) ? Math.max(0, Number(rawMonster.expMultiplier)) : 1,
    valueStats,
    computedStats,
    combatModel: normalizeMonsterValueStats(rawMonster?.valueStats) ? 'value_stats' : 'legacy',
    drops: Array.isArray(rawMonster?.drops)
      ? rawMonster.drops.map((drop) => normalizeMonsterDrop(drop)).filter((drop) => drop.itemId && drop.name)
      : [],
  };
}

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
  if (!monster.valueStats || typeof monster.valueStats !== 'object' || Array.isArray(monster.valueStats) || Object.keys(monster.valueStats).length === 0) {
    throw new Error(`怪物 ${monster.id} 的基准数值不能为空`);
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

function serializeMonsterTemplate(monster) {
  return {
    id: monster.id,
    name: monster.name,
    char: monster.char,
    color: monster.color,
    grade: monster.grade,
    radius: monster.radius,
    respawnSec: monster.respawnSec,
    level: monster.level,
    count: monster.count,
    maxAlive: monster.maxAlive,
    aggroRange: monster.aggroRange,
    viewRange: monster.viewRange,
    aggroMode: monster.aggroMode,
    respawnTicks: monster.respawnTicks,
    expMultiplier: monster.expMultiplier,
    valueStats: monster.valueStats,
    drops: monster.drops,
  };
}

function createMonsterEntryKey(filePath, index) {
  return `${filePath}#${index}`;
}

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

function listMonsterTemplates() {
  const monstersDir = path.join(CONTENT_DIR, 'monsters');
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
        monster: normalizeMonsterTemplate(entry),
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

function saveMonsterTemplateEntry(key, rawMonster) {
  const { filePath, index } = parseMonsterEntryKey(key);
  const absolutePath = ensureWithin(CONTENT_DIR, filePath);
  const entries = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
  if (!Array.isArray(entries) || !entries[index] || typeof entries[index] !== 'object') {
    throw new Error('目标怪物模板不存在');
  }
  const previousMonster = normalizeMonsterTemplate(entries[index]);
  const monster = normalizeMonsterTemplate(rawMonster);
  validateMonsterTemplate(monster, key);
  entries[index] = serializeMonsterTemplate(monster);
  fs.writeFileSync(absolutePath, `${JSON.stringify(entries, null, 2)}\n`, 'utf-8');
  const updatedMapCount = updateMapMonsterReferences(previousMonster.id, monster.id);
  return {
    monster,
    updatedMapCount,
  };
}

function loadMonsterTemplates() {
  const monstersDir = path.join(CONTENT_DIR, 'monsters');
  const templates = new Map();
  for (const filePath of collectJsonFiles(monstersDir)) {
    const entries = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string') continue;
      templates.set(entry.id, normalizeMonsterTemplate(entry));
    }
  }
  return templates;
}

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
  return {
    ...template,
    ...raw,
    templateId,
  };
}

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
  if (spawn.name !== template.name) persisted.name = spawn.name;
  if (spawn.char !== template.char) persisted.char = spawn.char;
  if (spawn.color !== template.color) persisted.color = spawn.color;
  if (spawn.grade !== template.grade) persisted.grade = spawn.grade;
  if (spawn.hp !== template.hp) persisted.hp = spawn.hp;
  if ((spawn.maxHp ?? spawn.hp) !== template.maxHp) persisted.maxHp = spawn.maxHp;
  if (spawn.attack !== template.attack) persisted.attack = spawn.attack;
  if ((spawn.count ?? spawn.maxAlive ?? 1) !== template.count) persisted.count = spawn.count;
  if ((spawn.radius ?? 3) !== template.radius) persisted.radius = spawn.radius;
  if ((spawn.maxAlive ?? spawn.count ?? 1) !== (template.maxAlive ?? template.count ?? 1)) persisted.maxAlive = spawn.maxAlive;
  if ((spawn.aggroRange ?? 6) !== template.aggroRange) persisted.aggroRange = spawn.aggroRange;
  if ((spawn.viewRange ?? spawn.aggroRange ?? 6) !== template.viewRange) persisted.viewRange = spawn.viewRange;
  if ((spawn.aggroMode ?? 'always') !== template.aggroMode) persisted.aggroMode = spawn.aggroMode;
  const currentRespawn = spawn.respawnTicks ?? spawn.respawnSec ?? 15;
  const templateRespawn = template.respawnTicks ?? template.respawnSec ?? 15;
  if (currentRespawn !== templateRespawn) {
    if (spawn.respawnTicks !== undefined) persisted.respawnTicks = spawn.respawnTicks;
    else if (spawn.respawnSec !== undefined) persisted.respawnSec = spawn.respawnSec;
  }
  if ((spawn.level ?? undefined) !== template.level) persisted.level = spawn.level;
  if ((spawn.expMultiplier ?? 1) !== template.expMultiplier) persisted.expMultiplier = spawn.expMultiplier;
  if (JSON.stringify(spawn.drops ?? []) !== JSON.stringify(template.drops ?? [])) persisted.drops = spawn.drops;
  return persisted;
}

function dehydrateMapDocument(document) {
  const monsterTemplates = loadMonsterTemplates();
  return {
    ...document,
    monsterSpawns: Array.isArray(document.monsterSpawns)
      ? document.monsterSpawns.map((spawn) => dehydrateMonsterSpawnRecord(spawn, monsterTemplates))
      : [],
  };
}

function getAllMapDocuments() {
  const files = fs.readdirSync(MAPS_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right, 'zh-CN'));
  return files.map((file) => {
    const raw = JSON.parse(fs.readFileSync(path.join(MAPS_DIR, file), 'utf-8'));
    return normalizeEditableMapDocument(hydrateMapDocument(raw));
  });
}

function getMapDocument(mapId) {
  if (!/^[a-zA-Z0-9._-]+$/.test(mapId)) {
    throw new Error('非法地图 ID');
  }
  const filePath = path.join(MAPS_DIR, `${mapId}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error('目标地图不存在');
  }
  return normalizeEditableMapDocument(hydrateMapDocument(JSON.parse(fs.readFileSync(filePath, 'utf-8'))));
}

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
  const persisted = dehydrateMapDocument(normalized);
  fs.writeFileSync(path.join(MAPS_DIR, `${mapId}.json`), `${JSON.stringify(persisted, null, 2)}\n`, 'utf-8');
}

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

function saveContentFile(relativePath, content) {
  const filePath = ensureWithin(CONTENT_DIR, relativePath);
  if (!filePath.endsWith('.json')) {
    throw new Error('只允许保存 JSON 配置文件');
  }
  const parsed = JSON.parse(content);
  fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf-8');
}

function getServerStatus() {
  return { ...serverState };
}

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

async function restartServer(reason) {
  serverRestartToken += 1;
  const token = serverRestartToken;
  await stopServerProcess();
  if (token !== serverRestartToken) {
    return;
  }

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

function scheduleRestart(reason) {
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

async function handleRequest(req, res) {
  if (!req.url) {
    writeError(res, 400, '缺少请求地址');
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = url.pathname;

  try {
    if (req.method === 'GET' && pathname === '/api/maps') {
      writeJson(res, 200, buildEditableMapList(getAllMapDocuments()));
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

async function bootstrap() {
  refreshContentWatchers();
  await restartServer('配置编辑器启动');

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
