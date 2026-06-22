#!/usr/bin/env node
/**
 * 生成玩家最终基准属性表。
 *
 * 运行前请先执行 `pnpm build:shared`，本脚本读取已构建的 shared 常量，避免复制一套
 * 与运行时代码分叉的境界模板、六维权重和属性换算表。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const defaultRealmLevelsPath = path.join(repoRoot, 'packages/server/data/content/realm-levels.json');
const defaultRealmAttrBaselinesPath = path.join(repoRoot, 'packages/server/data/content/realm-attr-baselines.json');
const defaultOutputPath = path.join(repoRoot, 'packages/shared/src/constants/gameplay/player-final-attr-baselines.json');
const sharedDistPath = path.join(repoRoot, 'packages/shared/dist/index.js');

const EXPECTED_ENHANCEMENT_ANCHORS = [
  { realmLv: 1, enhanceLevel: 0 },
  { realmLv: 18, enhanceLevel: 5 },
  { realmLv: 30, enhanceLevel: 7 },
  { realmLv: 42, enhanceLevel: 10 },
  { realmLv: 67, enhanceLevel: 15 },
];

const ATTR_KEYS = ['constitution', 'spirit', 'perception', 'talent', 'strength', 'meridians'];
const EXPONENTIAL_NUMERIC_KEYS = new Set([
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
  'breakPower',
  'resolvePower',
  'maxQiOutputPerTick',
  'qiRegenRate',
  'hpRegenRate',
]);
const LINEAR_NUMERIC_GROWTH_RATES = {
  realmExpPerTick: 0.1,
  techniqueExpPerTick: 0.1,
};
const STANDARD_EQUIPMENT_BASELINE_EXCLUDED_STATS = new Set([
  'critDamage',
]);
const ELEMENT_GROUP_KEYS = ['elementDamageBonus', 'elementDamageReduce'];

function parseArgs(argv) {
  const args = {
    realmLevelsPath: defaultRealmLevelsPath,
    realmAttrBaselinesPath: defaultRealmAttrBaselinesPath,
    outputPath: defaultOutputPath,
  };
  for (const arg of argv) {
    if (arg.startsWith('--realm-levels=')) {
      args.realmLevelsPath = path.resolve(repoRoot, arg.slice('--realm-levels='.length));
      continue;
    }
    if (arg.startsWith('--realm-attr-baselines=')) {
      args.realmAttrBaselinesPath = path.resolve(repoRoot, arg.slice('--realm-attr-baselines='.length));
      continue;
    }
    if (arg.startsWith('--output=')) {
      args.outputPath = path.resolve(repoRoot, arg.slice('--output='.length));
      continue;
    }
    throw new Error(`未知参数：${arg}`);
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function roundNumber(value, digits) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function requireSharedDist() {
  if (!fs.existsSync(sharedDistPath)) {
    throw new Error('缺少 packages/shared/dist/index.js，请先运行 pnpm build:shared');
  }
  return require(sharedDistPath);
}

function resolveRealmStage(shared, realmLv) {
  for (const [stageKey, range] of Object.entries(shared.PLAYER_REALM_STAGE_LEVEL_RANGES)) {
    if (realmLv >= range.levelFrom && realmLv <= range.levelTo) {
      return Number(stageKey);
    }
  }
  return shared.PlayerRealmStage?.SoulTransformLate ?? 0;
}

function resolveExpectedEnhanceLevel(realmLv) {
  for (let index = 1; index < EXPECTED_ENHANCEMENT_ANCHORS.length; index += 1) {
    const previous = EXPECTED_ENHANCEMENT_ANCHORS[index - 1];
    const current = EXPECTED_ENHANCEMENT_ANCHORS[index];
    if (realmLv <= current.realmLv) {
      const span = Math.max(1, current.realmLv - previous.realmLv);
      const ratio = Math.max(0, Math.min(1, (realmLv - previous.realmLv) / span));
      return previous.enhanceLevel + (current.enhanceLevel - previous.enhanceLevel) * ratio;
    }
  }
  return EXPECTED_ENHANCEMENT_ANCHORS[EXPECTED_ENHANCEMENT_ANCHORS.length - 1].enhanceLevel;
}

function calculateStandardEquipmentSinglePool(realmLv) {
  const basePool = 8 + (realmLv - 1) * 0.5;
  const expectedEnhanceLevel = resolveExpectedEnhanceLevel(realmLv);
  return basePool * (1.1 ** expectedEnhanceLevel);
}

function addStandardEquipmentPool(shared, stats, standardEquipmentSinglePool) {
  for (const key of shared.NUMERIC_SCALAR_STAT_KEYS) {
    if (STANDARD_EQUIPMENT_BASELINE_EXCLUDED_STATS.has(key)) {
      continue;
    }
    const pointsPerValue = shared.NUMERIC_STAT_POINTS_PER_VALUE[key];
    if (typeof pointsPerValue !== 'number' || !Number.isFinite(pointsPerValue)) {
      continue;
    }
    stats[key] += standardEquipmentSinglePool * pointsPerValue;
  }
}

function buildSixDimPercentBonuses(shared, singleAttr) {
  const bonuses = {};
  for (const attrKey of ATTR_KEYS) {
    const weights = shared.ATTR_TO_PERCENT_NUMERIC_WEIGHTS[attrKey];
    if (!weights) {
      continue;
    }
    for (const [statKey, weight] of Object.entries(weights)) {
      if (typeof weight === 'number' && Number.isFinite(weight) && weight !== 0) {
        bonuses[statKey] = (bonuses[statKey] ?? 0) + singleAttr * weight;
      }
    }
  }
  return bonuses;
}

function applySixDimPercentBonuses(shared, stats, percentBonuses) {
  for (const key of shared.NUMERIC_SCALAR_STAT_KEYS) {
    const bonus = percentBonuses[key];
    if (typeof bonus !== 'number' || !Number.isFinite(bonus) || bonus === 0) {
      continue;
    }
    stats[key] *= 1 + bonus / 100;
  }
}

function applyRealmMultipliers(shared, stats, realmLv) {
  const exponentialMultiplier = shared.getRealmAttributeMultiplier(realmLv);
  for (const key of EXPONENTIAL_NUMERIC_KEYS) {
    stats[key] *= exponentialMultiplier;
  }
  for (const [key, growthRate] of Object.entries(LINEAR_NUMERIC_GROWTH_RATES)) {
    stats[key] *= shared.getRealmLinearGrowthMultiplier(realmLv, growthRate);
  }
}

function roundStats(shared, stats) {
  for (const key of shared.NUMERIC_SCALAR_STAT_KEYS) {
    stats[key] = Math.max(0, Math.round(stats[key]));
  }
  for (const groupKey of ELEMENT_GROUP_KEYS) {
    for (const element of Object.keys(stats[groupKey] ?? {})) {
      stats[groupKey][element] = Math.max(0, Math.round(stats[groupKey][element]));
    }
  }
}

function buildPlayerFinalBaselineRow(shared, realmLevel, realmAttrBaseline) {
  const realmLv = Number(realmLevel.realmLv);
  const realmStage = resolveRealmStage(shared, realmLv);
  const realmTemplate = shared.resolvePlayerRealmNumericTemplate(realmStage);
  const stats = cloneJson(realmTemplate.stats);
  const standardEquipmentSinglePool = calculateStandardEquipmentSinglePool(realmLv);
  const singleAttr = Number(realmAttrBaseline.singleAttr);
  addStandardEquipmentPool(shared, stats, standardEquipmentSinglePool);
  applySixDimPercentBonuses(shared, stats, buildSixDimPercentBonuses(shared, singleAttr));
  applyRealmMultipliers(shared, stats, realmLv);
  roundStats(shared, stats);
  return {
    realmLv,
    realmName: realmLevel.displayName ?? realmLevel.name ?? `等级${realmLv}`,
    realmStage: shared.PLAYER_REALM_CONFIG[realmStage]?.shortName ?? String(realmStage),
    singleAttr: roundNumber(singleAttr, 2),
    standardEquipmentSinglePool: roundNumber(standardEquipmentSinglePool, 2),
    stats,
  };
}

function buildPlayerFinalBaselines(shared, realmLevels, realmAttrBaselines) {
  const attrByLevel = new Map(realmAttrBaselines.levels.map((entry) => [Number(entry.realmLv), entry]));
  const levels = realmLevels.levels
    .filter((entry) => Number(entry.realmLv) >= 1 && attrByLevel.has(Number(entry.realmLv)))
    .map((entry) => buildPlayerFinalBaselineRow(shared, entry, attrByLevel.get(Number(entry.realmLv))));
  return {
    version: 1,
    formula: {
      base: 'final = round((realmTemplateBase + standardEquipmentSinglePool * statPointsPerValue) * sixDimMultiplier * realmMultiplier)',
      standardEquipmentSinglePool: '8 + (realmLv - 1) * 0.5, then multiplied by expected enhancement multiplier from enhancement anchors; critDamage is excluded until an explicit source exists',
      sixDim: 'balanced singleAttr from realm-attr-baselines.json; numeric percent weights follow ATTR_TO_PERCENT_NUMERIC_WEIGHTS',
      realmMultiplier: 'exponential stats use 1.1^(realmLv - 1); listed linear stats use configured linear growth; other stats use 1',
    },
    levels,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const shared = requireSharedDist();
  const realmLevels = readJson(args.realmLevelsPath);
  const realmAttrBaselines = readJson(args.realmAttrBaselinesPath);
  const output = buildPlayerFinalBaselines(shared, realmLevels, realmAttrBaselines);
  fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
  fs.writeFileSync(args.outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`已生成 ${path.relative(repoRoot, args.outputPath).replaceAll(path.sep, '/')}`);
}

main();
