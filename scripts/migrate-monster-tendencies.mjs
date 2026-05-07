import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const monstersDir = path.join(repoRoot, 'packages/server/data/content/monsters');

const ATTR_KEYS = ['constitution', 'spirit', 'perception', 'talent', 'strength', 'meridians'];
const PRIMARY_ATTR_SCALE = new Set(['constitution', 'spirit', 'perception', 'talent']);
const STAT_KEYS = [
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
  'viewRange',
  'moveSpeed',
  'realmExpPerTick',
  'techniqueExpPerTick',
];
const IGNORED_OLD_STAT_KEYS = new Set(['maxHp', 'viewRange']);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function collectJsonFiles(dirPath) {
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'))
    .flatMap((entry) => {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) return collectJsonFiles(entryPath);
      return entry.isFile() && entry.name.endsWith('.json') ? [entryPath] : [];
    });
}

function normalizeIntegerPercents(weights, totalPercent) {
  const totalWeight = weights.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (totalWeight <= 0) {
    return weights.map(() => Math.floor(totalPercent / weights.length));
  }
  const raw = weights.map((weight, index) => {
    const value = Math.max(0, weight) / totalWeight * totalPercent;
    return { index, floor: Math.floor(value), fraction: value - Math.floor(value) };
  });
  let remaining = totalPercent - raw.reduce((sum, entry) => sum + entry.floor, 0);
  raw.sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (const entry of raw) {
    if (remaining <= 0) break;
    entry.floor += 1;
    remaining -= 1;
  }
  raw.sort((left, right) => left.index - right.index);
  return raw.map((entry) => entry.floor);
}

function deriveAttrTendency(attrs) {
  if (!attrs || typeof attrs !== 'object') {
    return undefined;
  }
  const weights = ATTR_KEYS.map((key) => {
    const value = Number(attrs[key]);
    if (!Number.isFinite(value)) return 0;
    return PRIMARY_ATTR_SCALE.has(key) ? value / 10 : value;
  });
  const percents = normalizeIntegerPercents(weights, 600);
  const result = {};
  for (let index = 0; index < ATTR_KEYS.length; index += 1) {
    const value = percents[index];
    if (value !== 100) {
      result[ATTR_KEYS[index]] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function deriveStatTendency(statPercents, level) {
  const source = statPercents && typeof statPercents === 'object' ? statPercents : {};
  const result = {};
  const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
  const oldMaxHp = Number(source.maxHp);
  const hpTendency = Number.isFinite(oldMaxHp)
    ? Math.round(oldMaxHp / (normalizedLevel * 10) * 100)
    : 100;
  if (hpTendency !== 100) {
    result.maxHp = Math.max(0, hpTendency);
  }

  const explicitEntries = STAT_KEYS
    .filter((key) => !IGNORED_OLD_STAT_KEYS.has(key))
    .map((key) => [key, Number(source[key])])
    .filter(([, value]) => Number.isFinite(value) && value > 0);
  const average = explicitEntries.length > 0
    ? explicitEntries.reduce((sum, [, value]) => sum + value, 0) / explicitEntries.length
    : 100;
  if (average > 0) {
    for (const [key, value] of explicitEntries) {
      const percent = Math.max(0, Math.round(value / average * 100));
      if (percent !== 100) {
        result[key] = percent;
      }
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function migrateMonster(monster) {
  const next = { ...monster };
  const attrTendency = next.attrTendency ?? deriveAttrTendency(next.attrs);
  const statTendency = next.statTendency ?? deriveStatTendency(next.statPercents, next.level);
  delete next.attrs;
  delete next.statPercents;
  delete next.valueStats;
  delete next.viewRange;
  if (attrTendency && Object.keys(attrTendency).length > 0) {
    next.attrTendency = attrTendency;
  } else {
    delete next.attrTendency;
  }
  if (statTendency && Object.keys(statTendency).length > 0) {
    next.statTendency = statTendency;
  } else {
    delete next.statTendency;
  }
  return next;
}

const write = process.argv.includes('--write');
let changedFiles = 0;
let monsterCount = 0;
for (const filePath of collectJsonFiles(monstersDir)) {
  const original = readJson(filePath);
  if (!Array.isArray(original)) continue;
  const migrated = original.map((monster) => {
    monsterCount += 1;
    return migrateMonster(monster);
  });
  if (JSON.stringify(original) !== JSON.stringify(migrated)) {
    changedFiles += 1;
    if (write) {
      writeJson(filePath, migrated);
    }
  }
}

const mode = write ? '已写入' : '试运行';
console.log(`${mode}：检查 ${monsterCount} 个怪物，${changedFiles} 个文件需要迁移。`);
