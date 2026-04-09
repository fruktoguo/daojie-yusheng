#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const BASE_ALLOWED_VARS = new Set([
  'caster.stat.physAtk',
  'caster.stat.spellAtk',
]);

const GRADE_BONUS = {
  '凡阶': 0,
  '黄阶': 1,
  '玄阶': 2,
  '地阶': 3,
  '天阶': 4,
  '灵阶': 5,
  '圣阶': 6,
  '帝阶': 7,
  mortal: 0,
  yellow: 1,
  mystic: 2,
  earth: 3,
  heaven: 4,
  spirit: 5,
  saint: 6,
  emperor: 7,
};

const BASE_COOLDOWN_BY_GRADE = {
  '凡阶': 8,
  '黄阶': 12,
  '玄阶': 18,
  '地阶': 24,
  '天阶': 32,
  '灵阶': 38,
  '圣阶': 44,
  '帝阶': 50,
  mortal: 8,
  yellow: 12,
  mystic: 18,
  earth: 24,
  heaven: 32,
  spirit: 38,
  saint: 44,
  emperor: 50,
};

const BASE_COST_BY_GRADE = {
  '凡阶': 1,
  '黄阶': 1,
  '玄阶': 2,
  '地阶': 3,
  '天阶': 4,
  '灵阶': 5,
  '圣阶': 6,
  '帝阶': 6,
  mortal: 1,
  yellow: 1,
  mystic: 2,
  earth: 3,
  heaven: 4,
  spirit: 5,
  saint: 6,
  emperor: 6,
};

const THREE_POINT_ATTR_KEYS = new Set([
  'constitution',
  'spirit',
  'perception',
  'talent',
]);

const ONE_POINT_ATTR_KEYS = new Set([
  'comprehension',
  'luck',
]);

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = value;
    index += 1;
  }
  return args;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function snap(value, step) {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) {
    return value;
  }
  return Math.round(value / step) * step;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundEven(value) {
  return Math.max(2, Math.round(value / 2) * 2);
}

function normalizeWeights(entries, label) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(`${label} 至少需要一项`);
  }
  const normalized = entries.map((entry) => {
    if (!entry || typeof entry !== 'object' || typeof entry.var !== 'string' || !Number.isFinite(entry.weight)) {
      throw new Error(`${label} 的每一项都必须包含 var 和 weight`);
    }
    return {
      ...entry,
      weight: Number(entry.weight),
    };
  });
  const totalWeight = normalized.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (totalWeight <= 0) {
    throw new Error(`${label} 的权重总和必须大于 0`);
  }
  return normalized.map((entry) => ({
    ...entry,
    ratio: Math.max(0, entry.weight) / totalWeight,
  }));
}

function getLevelBonus(lv) {
  if (!Number.isFinite(lv)) {
    return 0;
  }
  return Number(lv) * 0.1;
}

function getGradeBonus(grade) {
  return GRADE_BONUS[grade] ?? 0;
}

function buildReferenceRanges(lv, grade, policy = 'midpoint') {
  const bonus = getLevelBonus(lv) + getGradeBonus(grade);
  const reference = {
    base: {
      lower: round(0.8 + bonus),
      upper: round(1.2 + bonus),
    },
    percent: {
      lower: round(0 + bonus),
      upper: round(0 + bonus),
    },
    range: {
      lower: round(0 + bonus),
      upper: round(1 + bonus),
    },
    area: {
      lower: round(0 + bonus),
      upper: round(1 + bonus),
    },
  };
  for (const key of Object.keys(reference)) {
    const current = reference[key];
    current.target = policy === 'lower'
      ? current.lower
      : policy === 'upper'
        ? current.upper
        : round((current.lower + current.upper) / 2);
  }
  return reference;
}

function calcRangeScore(range) {
  return round(Math.max(0, Number(range) - 1) / 2);
}

function calcAreaScore(maxTargets) {
  return round(Math.max(0, Number(maxTargets) - 1) / 10);
}

function calcTargetCountFromAreaScore(areaScore) {
  return Math.max(1, Math.round(1 + Math.max(0, Number(areaScore)) * 10));
}

function nearestOdd(value) {
  const rounded = Math.max(1, Math.round(value));
  return rounded % 2 === 1 ? rounded : Math.max(1, rounded - 1);
}

function buildTargetingHint(targeting, desiredTargetCount) {
  const shape = typeof targeting?.shape === 'string' ? targeting.shape : 'single';
  if (shape === 'single') {
    return {
      shape,
      desiredTargetCount: 1,
      suggestedTargeting: { shape: 'single', maxTargets: 1 },
      approxTargetCount: 1,
    };
  }
  if (shape === 'line') {
    return {
      shape,
      desiredTargetCount,
      suggestedTargeting: { shape: 'line', maxTargets: desiredTargetCount },
      approxTargetCount: desiredTargetCount,
    };
  }
  if (shape === 'box') {
    const side = nearestOdd(Math.sqrt(desiredTargetCount));
    return {
      shape,
      desiredTargetCount,
      suggestedTargeting: { shape: 'box', width: side, height: side, maxTargets: side * side },
      approxTargetCount: side * side,
    };
  }
  if (shape === 'area') {
    const diameter = nearestOdd(Math.sqrt(desiredTargetCount));
    const radius = Math.max(1, Math.floor((diameter - 1) / 2));
    const approxTargetCount = diameter * diameter;
    return {
      shape,
      desiredTargetCount,
      suggestedTargeting: { shape: 'area', radius, maxTargets: approxTargetCount },
      approxTargetCount,
    };
  }
  return {
    shape,
    desiredTargetCount,
    suggestedTargeting: { ...(targeting ?? {}), maxTargets: desiredTargetCount },
    approxTargetCount: desiredTargetCount,
  };
}

function baseScalePerScore(variable) {
  switch (variable) {
    case 'caster.stat.physAtk':
    case 'caster.stat.spellAtk':
      return 1;
    default:
      throw new Error(`不允许的基础伤害来源: ${variable}`);
  }
}

function percentScalePerScore(entry) {
  if (Number.isFinite(entry.scalePerScore)) {
    return Number(entry.scalePerScore);
  }
  if (entry.var.startsWith('caster.attr.') || entry.var.startsWith('target.attr.')) {
    const attrKey = entry.var.slice(entry.var.lastIndexOf('.') + 1);
    if (THREE_POINT_ATTR_KEYS.has(attrKey)) {
      return 1 / 300;
    }
    if (ONE_POINT_ATTR_KEYS.has(attrKey)) {
      return 0.01;
    }
  }
  switch (entry.var) {
    case 'techLevel':
      return 0.15;
    case 'caster.stat.hit':
    case 'caster.stat.crit':
    case 'caster.stat.dodge':
    case 'caster.stat.breakPower':
    case 'caster.stat.resolvePower':
    case 'caster.stat.physDef':
    case 'caster.stat.spellDef':
      return 0.01;
    case 'caster.stat.moveSpeed':
      return 0.005;
    case 'target.stat.hit':
    case 'target.stat.crit':
    case 'target.stat.dodge':
    case 'target.stat.breakPower':
    case 'target.stat.resolvePower':
    case 'target.stat.physDef':
    case 'target.stat.spellDef':
      return 1 / 60;
    case 'target.stat.moveSpeed':
      return 1 / 120;
    default:
      throw new Error(`百分比项 ${entry.var} 不是内建规则，必须显式提供 scalePerScore`);
  }
}

function prettifyBaseScale(variable, scale) {
  if (variable === 'caster.stat.physAtk' || variable === 'caster.stat.spellAtk') {
    return round(snap(scale, scale >= 3 ? 0.1 : 0.05));
  }
  return round(scale);
}

function prettifyPercentScale(variable, scale) {
  if (variable === 'techLevel') {
    return round(snap(scale, 0.05));
  }
  if (variable.endsWith('.moveSpeed')) {
    return round(snap(scale, 0.005));
  }
  if (variable.includes('.stat.')) {
    return round(snap(scale, 0.0005));
  }
  if (Math.abs(scale) >= 1) {
    return round(snap(scale, 0.1));
  }
  if (Math.abs(scale) >= 0.1) {
    return round(snap(scale, 0.01));
  }
  if (Math.abs(scale) >= 0.01) {
    return round(snap(scale, 0.005));
  }
  return round(snap(scale, 0.0005));
}

function buildBaseTerms(baseWeights, baseScoreTarget) {
  return normalizeWeights(baseWeights, 'baseWeights').map((entry) => ({
    var: entry.var,
    scale: prettifyBaseScale(entry.var, baseScoreTarget * entry.ratio * baseScalePerScore(entry.var)),
  }));
}

function buildPercentTerms(percentWeights, percentScoreTarget) {
  if (!Array.isArray(percentWeights) || percentWeights.length === 0 || percentScoreTarget <= 0) {
    return [];
  }
  return normalizeWeights(percentWeights, 'percentWeights').map((entry) => ({
    var: entry.var,
    scale: prettifyPercentScale(entry.var, percentScoreTarget * entry.ratio * percentScalePerScore(entry)),
  }));
}

function buildBaseFormula(baseTerms) {
  if (baseTerms.length === 1) {
    return {
      var: baseTerms[0].var,
      scale: baseTerms[0].scale,
    };
  }
  return {
    op: 'add',
    args: baseTerms.map((entry) => ({
      var: entry.var,
      scale: entry.scale,
    })),
  };
}

function buildPercentFormula(percentTerms) {
  return {
    op: 'add',
    args: [
      1,
      ...percentTerms.map((entry) => ({
        var: entry.var,
        scale: entry.scale,
      })),
    ],
  };
}

function suggestCooldown(totalScore, grade, lv) {
  const base = BASE_COOLDOWN_BY_GRADE[grade] ?? 12;
  const lvBonus = getLevelBonus(lv) * 4;
  const cooldown = base + lvBonus + totalScore * 1.8;
  return roundEven(clamp(cooldown, 6, 80));
}

function suggestCostMultiplier(totalScore, grade, lv) {
  const base = BASE_COST_BY_GRADE[grade] ?? 1;
  const lvBonus = Math.floor(getLevelBonus(lv));
  return clamp(base + lvBonus + Math.floor(totalScore / 6), 1, 8);
}

function buildDynamicSkill(spec) {
  if (!spec || typeof spec !== 'object') {
    throw new Error('spec 必须是对象');
  }
  const realm = typeof spec.realm === 'string' ? spec.realm : '';
  const grade = typeof spec.grade === 'string' ? spec.grade : '';
  const lv = Number.isFinite(spec.lv) ? Number(spec.lv) : 0;
  const skill = spec.skill;
  if (!skill || typeof skill !== 'object') {
    throw new Error('spec.skill 缺失');
  }
  if (!Array.isArray(skill.baseWeights) || skill.baseWeights.length === 0) {
    throw new Error('skill.baseWeights 至少需要一项');
  }
  for (const entry of skill.baseWeights) {
    if (!BASE_ALLOWED_VARS.has(entry.var)) {
      throw new Error(`基础伤害来源不允许: ${entry.var}`);
    }
  }

  const reference = buildReferenceRanges(lv, grade, typeof spec.scorePolicy === 'string' ? spec.scorePolicy : 'midpoint');
  const range = Number.isFinite(skill.range) ? Math.max(1, Number(skill.range)) : 1;
  const rangeScore = calcRangeScore(range);
  const explicitAreaScore = Number.isFinite(skill.areaScoreTarget)
    ? Number(skill.areaScoreTarget)
    : Number.isFinite(skill.targetingScore)
      ? Number(skill.targetingScore)
      : null;
  const fallbackMaxTargets = Number.isFinite(skill.targeting?.maxTargets)
    ? Math.max(1, Number(skill.targeting.maxTargets))
    : 1;
  const areaScore = round(
    explicitAreaScore ?? calcAreaScore(fallbackMaxTargets),
  );
  const desiredTargetCount = calcTargetCountFromAreaScore(areaScore);
  const targetingHint = buildTargetingHint(skill.targeting, desiredTargetCount);
  const percentWeights = Array.isArray(skill.percentWeights) ? skill.percentWeights : [];
  const percentScore = round(
    Number.isFinite(skill.percentScoreTarget)
      ? Number(skill.percentScoreTarget)
      : (percentWeights.length > 0 ? reference.percent.target : 0),
  );

  const weightedBudget = round(
    reference.base.target
    + reference.percent.target * 3
    + reference.range.target
    + reference.area.target,
  );

  const baseScore = round(
    Number.isFinite(skill.baseScoreTarget)
      ? Number(skill.baseScoreTarget)
      : Math.max(0.1, weightedBudget - percentScore * 3 - rangeScore - areaScore),
  );

  const baseTerms = buildBaseTerms(skill.baseWeights, baseScore);
  const resolvedPercentTerms = buildPercentTerms(percentWeights, percentScore);
  const baseFormula = buildBaseFormula(baseTerms);
  const formula = resolvedPercentTerms.length > 0
    ? { op: 'mul', args: [baseFormula, buildPercentFormula(resolvedPercentTerms)] }
    : baseFormula;

  const totalScore = round(baseScore * (1 + percentScore * 3) * (1 + rangeScore) * (1 + areaScore));
  const cooldown = suggestCooldown(totalScore, grade, lv);
  const costMultiplier = suggestCostMultiplier(totalScore, grade, lv);

  return {
    meta: {
      realm,
      grade,
      lv,
    },
    reference,
    weightedBudget,
    scores: {
      baseScore,
      percentScore,
      rangeScore,
      areaScore,
      totalScore,
    },
    targetingHint,
    suggested: {
      cooldown,
      costMultiplier,
    },
    resolvedTerms: {
      baseTerms,
      percentTerms: resolvedPercentTerms,
    },
    skill: {
      id: skill.id,
      name: skill.name,
      desc: skill.desc,
      cooldown,
      costMultiplier,
      range,
      ...(skill.targeting && typeof skill.targeting === 'object' ? { targeting: skill.targeting } : {}),
      effects: [
        {
          type: 'damage',
          damageKind: skill.damageKind,
          ...(typeof skill.element === 'string' && skill.element.trim().length > 0 ? { element: skill.element } : {}),
          formula,
        },
        ...(Array.isArray(skill.buffEffects) ? skill.buffEffects : []),
      ],
      unlockLevel: Number.isFinite(skill.unlockLevel) ? Math.max(1, Math.floor(Number(skill.unlockLevel))) : 1,
    },
  };
}

const args = parseArgs(process.argv.slice(2));
if (!args.spec) {
  fail('用法: node generate-technique-skill.mjs --spec /tmp/spec.json [--out /tmp/result.json]');
}

const specPath = path.resolve(process.cwd(), String(args.spec));
const spec = readJson(specPath);
let result;
try {
  result = buildDynamicSkill(spec);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const output = `${JSON.stringify(result, null, 2)}\n`;
if (args.out) {
  const outPath = path.resolve(process.cwd(), String(args.out));
  fs.writeFileSync(outPath, output);
}
process.stdout.write(output);
