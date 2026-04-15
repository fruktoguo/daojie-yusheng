#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const GENERATOR_PATH = path.resolve(ROOT, '.codex/skills/technique-skill-generator/scripts/generate-technique-skill.mjs');
const TARGET_FILES = [
  'legacy/server/data/content/techniques/练气期/术法/黄阶.json',
  'legacy/server/data/content/techniques/练气期/术法/玄阶.json',
  'legacy/server/data/content/techniques/练气期/术法/地阶.json',
  'legacy/server/data/content/techniques/练气期/神通/玄阶.json',
];

const ALLOWED_BASE_VARS = new Set([
  'caster.stat.physAtk',
  'caster.stat.spellAtk',
  'caster.maxHp',
  'caster.maxQi',
  'caster.stat.maxHp',
  'caster.stat.maxQi',
]);

const BASE_SCORE_SCALE = {
  'caster.stat.physAtk': 1,
  'caster.stat.spellAtk': 1,
  'caster.maxHp': 0.1,
  'caster.stat.maxHp': 0.1,
  'caster.maxQi': 0.15,
  'caster.stat.maxQi': 0.15,
};

const BUILTIN_PERCENT_SCORE_SCALE = {
  techLevel: 0.15,
  'caster.stat.hit': 0.01,
  'caster.stat.crit': 0.01,
  'caster.stat.dodge': 0.01,
  'caster.stat.breakPower': 0.01,
  'caster.stat.resolvePower': 0.01,
  'caster.stat.physDef': 0.01,
  'caster.stat.spellDef': 0.01,
  'caster.stat.moveSpeed': 0.005,
  'target.stat.hit': 1 / 60,
  'target.stat.crit': 1 / 60,
  'target.stat.dodge': 1 / 60,
  'target.stat.breakPower': 1 / 60,
  'target.stat.resolvePower': 1 / 60,
  'target.stat.physDef': 1 / 60,
  'target.stat.spellDef': 1 / 60,
  'target.stat.moveSpeed': 1 / 120,
  'caster.attr.constitution': 1 / 300,
  'caster.attr.spirit': 1 / 300,
  'caster.attr.perception': 1 / 300,
  'caster.attr.talent': 1 / 300,
  'caster.attr.comprehension': 0.01,
  'caster.attr.luck': 0.01,
  'target.attr.constitution': 1 / 300,
  'target.attr.spirit': 1 / 300,
  'target.attr.perception': 1 / 300,
  'target.attr.talent': 1 / 300,
  'target.attr.comprehension': 0.01,
  'target.attr.luck': 0.01,
};

const CUSTOM_STACK_SCALE_PER_SCORE = 0.15;

const GRADE_LABELS = {
  yellow: '黄阶',
  mystic: '玄阶',
  earth: '地阶',
  heaven: '天阶',
  spirit: '灵阶',
  saint: '圣阶',
  emperor: '帝阶',
  mortal: '凡阶',
};

const GRADE_BONUS = {
  mortal: 0,
  yellow: 1,
  mystic: 2,
  earth: 3,
  heaven: 4,
  spirit: 5,
  saint: 6,
  emperor: 7,
};

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function snap(value, step) {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) {
    return value;
  }
  return Math.round(value / step) * step;
}

function prettifyScore(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value < 0.5) {
    return round(snap(value, 0.05), 2);
  }
  if (value < 2) {
    return round(snap(value, 0.1), 2);
  }
  return round(snap(value, 0.25), 2);
}

function roundEven(value) {
  return Math.max(2, Math.round(value / 2) * 2);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(ROOT, filePath), 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(path.resolve(ROOT, filePath), `${JSON.stringify(data, null, 2)}\n`);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function addScale(map, variable, scale) {
  if (typeof variable !== 'string' || !Number.isFinite(scale) || scale === 0) {
    return;
  }
  map.set(variable, round((map.get(variable) ?? 0) + scale));
}

function collectBaseTerms(node, terms) {
  if (Number.isFinite(node)) {
    return;
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      collectBaseTerms(entry, terms);
    }
    return;
  }
  if (!isObject(node)) {
    return;
  }
  if (typeof node.var === 'string' && Number.isFinite(node.scale)) {
    addScale(terms, node.var, Number(node.scale));
    return;
  }
  if (node.op === 'add' && Array.isArray(node.args)) {
    for (const entry of node.args) {
      collectBaseTerms(entry, terms);
    }
  }
}

function collectPercentTerms(node, terms, multiplier = 1) {
  if (Number.isFinite(node)) {
    return;
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      collectPercentTerms(entry, terms, multiplier);
    }
    return;
  }
  if (!isObject(node)) {
    return;
  }
  if (typeof node.var === 'string' && Number.isFinite(node.scale)) {
    addScale(terms, node.var, Number(node.scale) * multiplier);
    return;
  }
  if (node.op === 'add' && Array.isArray(node.args)) {
    for (const entry of node.args) {
      collectPercentTerms(entry, terms, multiplier);
    }
    return;
  }
  if (node.op === 'mul' && Array.isArray(node.args)) {
    let numberFactor = 1;
    const exprArgs = [];
    for (const entry of node.args) {
      if (Number.isFinite(entry)) {
        numberFactor *= Number(entry);
      } else {
        exprArgs.push(entry);
      }
    }
    if (exprArgs.length === 1) {
      collectPercentTerms(exprArgs[0], terms, multiplier * numberFactor);
      return;
    }
    if (exprArgs.length > 1) {
      for (const entry of exprArgs) {
        collectPercentTerms(entry, terms, multiplier * numberFactor);
      }
    }
  }
}

function splitFormula(formula) {
  if (isObject(formula) && formula.op === 'mul' && Array.isArray(formula.args) && formula.args.length >= 2) {
    return {
      base: formula.args[0],
      percent: formula.args[1],
    };
  }
  return {
    base: formula,
    percent: null,
  };
}

function mapDisallowedBaseVar(variable, damageKind) {
  if (variable === 'caster.attr.constitution') {
    return 'caster.maxHp';
  }
  if (variable === 'caster.attr.spirit') {
    return 'caster.maxQi';
  }
  if (damageKind === 'physical') {
    return 'caster.stat.physAtk';
  }
  return 'caster.stat.spellAtk';
}

function buildBaseWeights(baseFormula, damageKind) {
  const rawTerms = new Map();
  collectBaseTerms(baseFormula, rawTerms);

  const weights = new Map();
  for (const [variable, scale] of rawTerms.entries()) {
    if (ALLOWED_BASE_VARS.has(variable)) {
      addScale(weights, variable, Math.abs(scale) / BASE_SCORE_SCALE[variable]);
      continue;
    }
    if (variable === 'caster.attr.constitution' || variable === 'caster.attr.spirit') {
      addScale(weights, mapDisallowedBaseVar(variable, damageKind), 1);
    }
  }

  if (weights.size === 0) {
    addScale(weights, damageKind === 'physical' ? 'caster.stat.physAtk' : 'caster.stat.spellAtk', 1);
  }

  return Array.from(weights.entries()).map(([variable, weight]) => ({
    var: variable,
    weight: prettifyScore(weight),
  }));
}

function ensureWeight(entries, variable, weight) {
  if (entries.some((entry) => entry.var === variable)) {
    return entries;
  }
  return [
    ...entries,
    {
      var: variable,
      weight,
    },
  ];
}

function resolveCustomScalePerScore(variable) {
  if (variable.includes('.stacks')) {
    return CUSTOM_STACK_SCALE_PER_SCORE;
  }
  return 0.15;
}

function buildPercentWeights(percentFormula) {
  if (!percentFormula) {
    return {
      percentWeights: [],
      percentScoreTarget: 0,
    };
  }

  const rawTerms = new Map();
  collectPercentTerms(percentFormula, rawTerms);
  rawTerms.delete('1');

  const percentWeights = [];
  let percentScoreTarget = 0;

  for (const [variable, scale] of rawTerms.entries()) {
    if (!Number.isFinite(scale) || scale === 0 || variable === '1') {
      continue;
    }
    const scalePerScore = BUILTIN_PERCENT_SCORE_SCALE[variable] ?? resolveCustomScalePerScore(variable);
    const contribution = prettifyScore(Math.abs(scale) / scalePerScore);
    if (contribution <= 0) {
      continue;
    }
    percentScoreTarget = round(percentScoreTarget + contribution, 2);
    if (BUILTIN_PERCENT_SCORE_SCALE[variable]) {
      percentWeights.push({
        var: variable,
        weight: contribution,
      });
    } else {
      percentWeights.push({
        var: variable,
        weight: contribution,
        scalePerScore: scalePerScore,
      });
    }
  }

  return {
    percentWeights,
    percentScoreTarget: prettifyScore(percentScoreTarget),
  };
}

function normalizeTargeting(shape, targeting, desiredTargetCount) {
  if (!targeting || typeof targeting !== 'object') {
    return undefined;
  }
  if (shape === 'line') {
    return {
      ...targeting,
      shape: 'line',
      maxTargets: Math.max(1, Math.round(desiredTargetCount)),
    };
  }
  if (shape === 'box') {
    const currentWidth = Number.isFinite(targeting.width) ? Number(targeting.width) : 1;
    const currentHeight = Number.isFinite(targeting.height) ? Number(targeting.height) : currentWidth;
    const side = Math.max(1, currentWidth, currentHeight);
    const oddSide = side % 2 === 1 ? side : side - 1;
    return {
      ...targeting,
      shape: 'box',
      width: oddSide,
      height: oddSide,
      maxTargets: oddSide * oddSide,
    };
  }
  if (shape === 'area') {
    return {
      ...targeting,
      shape: 'area',
      radius: Number.isFinite(targeting.radius) ? Number(targeting.radius) : 1,
      maxTargets: Math.max(1, Math.round(Number.isFinite(targeting.maxTargets) ? Number(targeting.maxTargets) : desiredTargetCount)),
    };
  }
  return targeting;
}

function buildSpec(technique, skill, damageEffect) {
  const { base, percent } = splitFormula(damageEffect.formula);
  const { percentWeights, percentScoreTarget } = buildPercentWeights(percent);
  const gradeBonus = GRADE_BONUS[technique.grade] ?? 0;
  const rangeScore = round(Math.max(0, Number(skill.range ?? 1) - 1) / 2, 2);
  const currentMaxTargets = Number.isFinite(skill.targeting?.maxTargets) ? Number(skill.targeting.maxTargets) : 1;
  const areaScore = round(Math.max(0, currentMaxTargets - 1) / 10, 2);
  const weightedBudget = round(1 + gradeBonus + gradeBonus * 3 + (0.5 + gradeBonus) + (0.5 + gradeBonus), 2);
  const computedBaseScore = round(weightedBudget - percentScoreTarget * 3 - rangeScore - areaScore, 2);
  const minBaseScore = technique.category === 'divine' || skill.targeting?.shape === 'box' ? 1.5 : 1;

  const spec = {
    realm: '练气期',
    grade: GRADE_LABELS[technique.grade] ?? technique.grade,
    // 先将练气期整体视作同一境界档，品阶负责拉开主预算。
    lv: 0,
    skill: {
      id: skill.id,
      name: skill.name,
      desc: skill.desc,
      unlockLevel: skill.unlockLevel,
      damageKind: damageEffect.damageKind,
      element: damageEffect.element,
      range: skill.range,
      baseWeights: (() => {
        let weights = buildBaseWeights(base, damageEffect.damageKind);
        if (technique.category === 'divine') {
          weights = ensureWeight(
            weights,
            damageEffect.damageKind === 'physical' ? 'caster.maxHp' : 'caster.maxQi',
            1,
          );
        }
        return weights;
      })(),
      baseScoreTarget: prettifyScore(Math.max(minBaseScore, computedBaseScore)),
      percentWeights,
      percentScoreTarget,
      buffEffects: (skill.effects ?? []).filter((effect) => effect.type !== 'damage'),
    },
  };

  if (Object.prototype.hasOwnProperty.call(skill, 'targeting')) {
    spec.skill.targeting = skill.targeting;
  }

  return spec;
}

function runGenerator(spec, key) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lianqi-skill-'));
  const specPath = path.join(tempDir, `${key}.spec.json`);
  const outPath = path.join(tempDir, `${key}.result.json`);
  fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  const result = spawnSync(process.execPath, [GENERATOR_PATH, '--spec', specPath, '--out', outPath], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `${key} 生成失败`);
  }
  return JSON.parse(fs.readFileSync(outPath, 'utf8'));
}

function selectCooldown(technique, result) {
  const { totalScore, rangeScore, areaScore } = result.scores;
  const grade = technique.grade;
  const baseCooldown = technique.category === 'divine'
    ? (grade === 'earth' ? 38 : 30)
    : grade === 'earth'
      ? 20
      : grade === 'mystic'
        ? 18
        : 14;
  const factor = technique.category === 'divine' ? 0.25 : 0.18;
  const rawCooldown = baseCooldown + totalScore * factor + rangeScore * 4 + areaScore * 8;
  const cappedCooldown = technique.category === 'divine'
    ? Math.min(80, rawCooldown)
    : grade === 'earth'
      ? Math.min(50, rawCooldown)
      : grade === 'mystic'
        ? Math.min(42, rawCooldown)
        : Math.min(32, rawCooldown);
  return roundEven(cappedCooldown);
}

function selectCostMultiplier(technique, result) {
  const { totalScore, rangeScore, areaScore } = result.scores;
  const baseCost = technique.category === 'divine' ? 3 : 1;
  let cost = baseCost;
  if (totalScore >= 30) {
    cost += 1;
  }
  if (totalScore >= 80) {
    cost += 1;
  }
  if (totalScore >= 140) {
    cost += 1;
  }
  if (rangeScore >= 2 || areaScore >= 2) {
    cost += 1;
  }
  const cap = technique.category === 'divine' ? 6 : technique.grade === 'earth' ? 4 : 3;
  return Math.min(cap, cost);
}

function migrateFile(filePath) {
  const techniques = readJson(filePath);
  const report = [];

  for (const technique of techniques) {
    for (let index = 0; index < (technique.skills ?? []).length; index += 1) {
      const skill = technique.skills[index];
      const damageEffect = (skill.effects ?? []).find((effect) => effect.type === 'damage');
      if (!damageEffect) {
        continue;
      }

      const spec = buildSpec(technique, skill, damageEffect);
      const result = runGenerator(spec, skill.id.replaceAll('.', '_'));
      const desiredTargetCount = result.targetingHint?.desiredTargetCount ?? skill.targeting?.maxTargets ?? 1;
      const normalizedTargeting = normalizeTargeting(skill.targeting?.shape, skill.targeting, desiredTargetCount);
      const cooldown = selectCooldown(technique, result);
      const costMultiplier = selectCostMultiplier(technique, result);

      const migratedSkill = {
        ...result.skill,
        cooldown,
        costMultiplier,
        ...(normalizedTargeting ? { targeting: normalizedTargeting } : {}),
      };

      technique.skills[index] = migratedSkill;
      report.push({
        file: filePath,
        techniqueId: technique.id,
        skillId: skill.id,
        skillName: skill.name,
        scores: result.scores,
        cooldown,
        costMultiplier,
      });
    }
  }

  writeJson(filePath, techniques);
  return report;
}

function main() {
  const allReports = [];
  for (const filePath of TARGET_FILES) {
    allReports.push(...migrateFile(filePath));
  }
  process.stdout.write(`${JSON.stringify(allReports, null, 2)}\n`);
}

main();
