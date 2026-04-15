#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const itemsDir = path.join(repoRoot, 'legacy/server/data/content/items');
const monstersDir = path.join(repoRoot, 'legacy/server/data/content/monsters');
const mapsDir = path.join(repoRoot, 'legacy/server/data/maps');
const recipesPath = path.join(repoRoot, 'legacy/server/data/content/alchemy/recipes.json');
const resourceNodesPath = path.join(repoRoot, 'legacy/server/data/content/resource-nodes.json');

const GRADE_ORDER = ['mortal', 'yellow', 'mystic', 'earth', 'heaven', 'dao'];
const MAX_POWER_RATIO = 1.5;
const MAX_LEVEL_GAP = 6;

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

function resolveGradeValue(grade) {
  const index = GRADE_ORDER.indexOf(grade ?? 'mortal');
  return Math.max(1, index + 1);
}

function computeMaterialPower(level, grade, count = 1) {
  const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
  const normalizedCount = Math.max(0, Math.floor(Number(count) || 0));
  return normalizedLevel * (resolveGradeValue(grade) ** 2) * normalizedCount;
}

function pad(value, width) {
  const text = String(value);
  return text.length >= width ? text : `${text}${' '.repeat(width - text.length)}`;
}

function summarizeSource(hasResourceSource, hasMonsterDrop) {
  if (hasResourceSource && hasMonsterDrop) {
    return '双来源';
  }
  if (hasResourceSource) {
    return '采集';
  }
  if (hasMonsterDrop) {
    return '怪落';
  }
  return '未知';
}

const items = new Map();
for (const filePath of walkJsonFiles(itemsDir)) {
  const entries = readJson(filePath);
  for (const item of entries) {
    if (!item || typeof item.itemId !== 'string') {
      continue;
    }
    items.set(item.itemId, item);
  }
}

const recipes = readJson(recipesPath);
const resourceNodeData = readJson(resourceNodesPath);
const resourceNodes = Array.isArray(resourceNodeData?.resourceNodes)
  ? resourceNodeData.resourceNodes
  : [];
const resourceNodesById = new Map(resourceNodes.map((node) => [node.id, node]));

const resourceItemIds = new Set();
for (const filePath of walkJsonFiles(mapsDir)) {
  const map = readJson(filePath);
  for (const landmark of map.landmarks ?? []) {
    const drops = Array.isArray(landmark?.container?.drops) ? landmark.container.drops : [];
    for (const drop of drops) {
      if (typeof drop?.itemId === 'string' && drop.itemId.trim()) {
        resourceItemIds.add(drop.itemId.trim());
      }
    }
  }
  for (const group of map.resourceNodeGroups ?? []) {
    if (typeof group?.resourceNodeId !== 'string') {
      continue;
    }
    const node = resourceNodesById.get(group.resourceNodeId);
    if (!node) {
      continue;
    }
    if (typeof node.itemId === 'string' && node.itemId.trim()) {
      resourceItemIds.add(node.itemId.trim());
    }
    const drops = Array.isArray(node?.container?.drops) ? node.container.drops : [];
    for (const drop of drops) {
      if (typeof drop?.itemId === 'string' && drop.itemId.trim()) {
        resourceItemIds.add(drop.itemId.trim());
      }
    }
  }
}

const monsterDropItemIds = new Set();
for (const filePath of walkJsonFiles(monstersDir)) {
  const monsters = readJson(filePath);
  for (const monster of monsters) {
    for (const drop of monster?.drops ?? []) {
      if (typeof drop?.itemId === 'string' && drop.itemId.trim()) {
        monsterDropItemIds.add(drop.itemId.trim());
      }
    }
  }
}

const mainRoles = new Set();
const auxRoles = new Set();
const usedMaterialIds = new Set();
for (const recipe of recipes) {
  for (const ingredient of recipe.ingredients ?? []) {
    const itemId = typeof ingredient?.itemId === 'string' ? ingredient.itemId.trim() : '';
    if (!itemId) {
      continue;
    }
    usedMaterialIds.add(itemId);
    if (ingredient.role === 'main') {
      mainRoles.add(itemId);
    } else if (ingredient.role === 'aux') {
      auxRoles.add(itemId);
    }
  }
}

const overlapItemIds = [...mainRoles]
  .filter((itemId) => auxRoles.has(itemId))
  .sort((left, right) => left.localeCompare(right, 'zh-CN'));

const materialRows = [...usedMaterialIds]
  .map((itemId) => {
    const item = items.get(itemId);
    const level = Number.isInteger(item?.level) ? Number(item.level) : 1;
    const grade = typeof item?.grade === 'string' ? item.grade : 'mortal';
    const name = typeof item?.name === 'string' ? item.name : itemId;
    const unitPower = computeMaterialPower(level, grade, 1);
    const roles = [
      mainRoles.has(itemId) ? '主药' : null,
      auxRoles.has(itemId) ? '辅药' : null,
    ].filter(Boolean).join('/');
    const hasResourceSource = resourceItemIds.has(itemId);
    const hasMonsterDrop = monsterDropItemIds.has(itemId);
    return {
      itemId,
      name,
      level,
      grade,
      unitPower,
      roles,
      source: summarizeSource(hasResourceSource, hasMonsterDrop),
    };
  })
  .sort((left, right) => (
    left.level - right.level
    || left.unitPower - right.unitPower
    || left.itemId.localeCompare(right.itemId, 'zh-CN')
  ));

const recipeRows = recipes.map((recipe) => {
  const entries = (recipe.ingredients ?? []).map((ingredient) => {
    const item = items.get(ingredient.itemId);
    const level = Number.isInteger(item?.level) ? Number(item.level) : 1;
    const grade = typeof item?.grade === 'string' ? item.grade : 'mortal';
    return {
      itemId: ingredient.itemId,
      role: ingredient.role,
      count: ingredient.count,
      level,
      power: computeMaterialPower(level, grade, ingredient.count),
      hasMonsterDrop: monsterDropItemIds.has(ingredient.itemId),
      hasResourceSource: resourceItemIds.has(ingredient.itemId),
    };
  });
  const mainEntries = entries.filter((entry) => entry.role === 'main');
  const auxEntries = entries.filter((entry) => entry.role === 'aux');
  const mainPower = mainEntries.reduce((sum, entry) => sum + entry.power, 0);
  const auxPower = auxEntries.reduce((sum, entry) => sum + entry.power, 0);
  const ratio = mainPower > 0 && auxPower > 0
    ? Math.max(mainPower, auxPower) / Math.min(mainPower, auxPower)
    : Number.POSITIVE_INFINITY;
  const levels = entries.map((entry) => entry.level);
  const gap = levels.length > 0 ? Math.max(...levels) - Math.min(...levels) : 0;
  const monsterOnlyMain = mainEntries
    .filter((entry) => !entry.hasResourceSource && entry.hasMonsterDrop)
    .map((entry) => entry.itemId);
  const flags = [];
  if (ratio > MAX_POWER_RATIO) {
    flags.push(`药力比>${MAX_POWER_RATIO}`);
  }
  if (gap > MAX_LEVEL_GAP) {
    flags.push(`等级差>${MAX_LEVEL_GAP}`);
  }
  if (monsterOnlyMain.length > 0) {
    flags.push(`主药含怪落:${monsterOnlyMain.join(',')}`);
  }
  return {
    recipeId: recipe.recipeId,
    mainPower,
    auxPower,
    ratio: Number.isFinite(ratio) ? ratio : null,
    gap,
    flags,
    main: mainEntries.map((entry) => `${entry.itemId}x${entry.count}(P${entry.power},L${entry.level})`).join(' + '),
    aux: auxEntries.map((entry) => `${entry.itemId}x${entry.count}(P${entry.power},L${entry.level})`).join(' + '),
  };
});

console.log('=== 材料药力 ===');
console.log(`${pad('itemId', 28)} ${pad('名称', 10)} ${pad('等级', 4)} ${pad('品阶', 7)} ${pad('单件药力', 8)} ${pad('角色', 9)} 来源`);
for (const row of materialRows) {
  console.log(`${pad(row.itemId, 28)} ${pad(row.name, 10)} ${pad(row.level, 4)} ${pad(row.grade, 7)} ${pad(row.unitPower, 8)} ${pad(row.roles || '-', 9)} ${row.source}`);
}

console.log('');
console.log('=== 丹方体检 ===');
for (const row of recipeRows) {
  const ratioText = row.ratio === null ? 'n/a' : row.ratio.toFixed(2);
  const flagText = row.flags.length > 0 ? ` [${row.flags.join(' | ')}]` : '';
  console.log(`${row.recipeId} | main=${row.mainPower} aux=${row.auxPower} ratio=${ratioText} gap=${row.gap}${flagText}`);
  console.log(`  主药: ${row.main}`);
  console.log(`  辅药: ${row.aux}`);
}

if (overlapItemIds.length > 0) {
  console.log('');
  console.log(`=== 角色冲突 === ${overlapItemIds.join(', ')}`);
}
