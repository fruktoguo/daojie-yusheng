/**
 * 价值量化系统：将属性、数值、装备、Buff、技能、功法等游戏要素
 * 统一折算为可比较的"价值点"，用于平衡性分析。
 */
import { ELEMENT_KEYS, NUMERIC_SCALAR_STAT_KEYS } from './constants/gameplay/attributes';
import type { PartialNumericStats } from './numeric';
import { calcTechniqueAttrValues } from './technique';
import type {
  AttrBonus,
  AttrKey,
  Attributes,
  ItemStack,
  SkillBuffEffectDef,
  SkillDef,
  SkillFormula,
  SkillFormulaVar,
  TechniqueLayerDef,
  TechniqueState,
} from './types';

/** 六维属性每点对应的价值 */
export const ATTRIBUTE_VALUE_PER_POINT: Record<AttrKey, number> = {
  constitution: 3,
  spirit: 3,
  perception: 3,
  talent: 3,
  comprehension: 3,
  luck: 3,
};

/** 各数值属性折算为 1 价值所需的点数 */
export const NUMERIC_STAT_POINTS_PER_VALUE = {
  maxHp: 12,
  maxQi: 8,
  physAtk: 1,
  spellAtk: 1,
  physDef: 1,
  spellDef: 1,
  hit: 1,
  dodge: 1,
  crit: 1,
  critDamage: 1,
  breakPower: 1,
  resolvePower: 1,
  maxQiOutputPerTick: 1,
  qiRegenRate: 1,
  hpRegenRate: 1,
  cooldownSpeed: 1,
  auraCostReduce: 1,
  auraPowerRate: 1,
  playerExpRate: 1,
  techniqueExpRate: 1,
  realmExpPerTick: 1,
  techniqueExpPerTick: 1,
  lootRate: 1,
  rareLootRate: 1,
  viewRange: 1,
  moveSpeed: 1,
} satisfies Record<typeof NUMERIC_SCALAR_STAT_KEYS[number], number>;

type QuantifiableFormulaVar =
  | 'caster.maxHp'
  | 'caster.maxQi'
  | 'caster.stat.maxHp'
  | 'caster.stat.maxQi'
  | `caster.stat.${typeof NUMERIC_SCALAR_STAT_KEYS[number]}`;

const FORMULA_VAR_VALUE_UNITS: Partial<Record<QuantifiableFormulaVar, number>> = {
  'caster.maxHp': NUMERIC_STAT_POINTS_PER_VALUE.maxHp,
  'caster.maxQi': NUMERIC_STAT_POINTS_PER_VALUE.maxQi,
  'caster.stat.maxHp': NUMERIC_STAT_POINTS_PER_VALUE.maxHp,
  'caster.stat.maxQi': NUMERIC_STAT_POINTS_PER_VALUE.maxQi,
  'caster.stat.physAtk': NUMERIC_STAT_POINTS_PER_VALUE.physAtk,
  'caster.stat.spellAtk': NUMERIC_STAT_POINTS_PER_VALUE.spellAtk,
  'caster.stat.physDef': NUMERIC_STAT_POINTS_PER_VALUE.physDef,
  'caster.stat.spellDef': NUMERIC_STAT_POINTS_PER_VALUE.spellDef,
  'caster.stat.hit': NUMERIC_STAT_POINTS_PER_VALUE.hit,
  'caster.stat.dodge': NUMERIC_STAT_POINTS_PER_VALUE.dodge,
  'caster.stat.crit': NUMERIC_STAT_POINTS_PER_VALUE.crit,
  'caster.stat.critDamage': NUMERIC_STAT_POINTS_PER_VALUE.critDamage,
  'caster.stat.breakPower': NUMERIC_STAT_POINTS_PER_VALUE.breakPower,
  'caster.stat.resolvePower': NUMERIC_STAT_POINTS_PER_VALUE.resolvePower,
  'caster.stat.maxQiOutputPerTick': NUMERIC_STAT_POINTS_PER_VALUE.maxQiOutputPerTick,
  'caster.stat.qiRegenRate': NUMERIC_STAT_POINTS_PER_VALUE.qiRegenRate,
  'caster.stat.hpRegenRate': NUMERIC_STAT_POINTS_PER_VALUE.hpRegenRate,
  'caster.stat.cooldownSpeed': NUMERIC_STAT_POINTS_PER_VALUE.cooldownSpeed,
  'caster.stat.auraCostReduce': NUMERIC_STAT_POINTS_PER_VALUE.auraCostReduce,
  'caster.stat.auraPowerRate': NUMERIC_STAT_POINTS_PER_VALUE.auraPowerRate,
  'caster.stat.playerExpRate': NUMERIC_STAT_POINTS_PER_VALUE.playerExpRate,
  'caster.stat.techniqueExpRate': NUMERIC_STAT_POINTS_PER_VALUE.techniqueExpRate,
  'caster.stat.realmExpPerTick': NUMERIC_STAT_POINTS_PER_VALUE.realmExpPerTick,
  'caster.stat.techniqueExpPerTick': NUMERIC_STAT_POINTS_PER_VALUE.techniqueExpPerTick,
  'caster.stat.lootRate': NUMERIC_STAT_POINTS_PER_VALUE.lootRate,
  'caster.stat.rareLootRate': NUMERIC_STAT_POINTS_PER_VALUE.rareLootRate,
  'caster.stat.viewRange': NUMERIC_STAT_POINTS_PER_VALUE.viewRange,
  'caster.stat.moveSpeed': NUMERIC_STAT_POINTS_PER_VALUE.moveSpeed,
};

const MULTIPLIER_BASELINE = 100;
const BUFF_DURATION_BASELINE = 10;
const BUFF_DURATION_SHORT_EXPONENT = 0.5;
const BUFF_DURATION_LONG_LOG_FACTOR = 1.5;
const BUFF_DURATION_MAX_MULTIPLIER = 8;

/** 价值分解条目 */
export interface ValueBreakdownEntry {
  kind: 'attr' | 'stat' | 'element' | 'skill' | 'buff' | 'technique';
  key: string;
  amount: number;
  quantifiedValue: number;
  note?: string;
}

/** 价值汇总结果 */
export interface ValueSummary {
  quantifiedValue: number;
  breakdown: ValueBreakdownEntry[];
  unquantified: string[];
}

/** 技能价值汇总（含基础价值和乘区倍率） */
export interface SkillValueSummary extends ValueSummary {
  baseQuantifiedValue: number;
  multiplier: number;
}

type FormulaQuantification = {
  quantifiedValue: number;
  unquantified: string[];
};

type MultiplierEvaluation = {
  ok: boolean;
  value: number;
  containsVariable: boolean;
};

function roundValue(value: number): number {
  return Math.round(value * 100) / 100;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((entry) => entry.trim()).filter((entry) => entry.length > 0))];
}

function finalizeSummary(breakdown: ValueBreakdownEntry[], unquantified: string[]): ValueSummary {
  return {
    quantifiedValue: roundValue(breakdown.reduce((sum, entry) => sum + entry.quantifiedValue, 0)),
    breakdown: breakdown.map((entry) => ({
      ...entry,
      amount: roundValue(entry.amount),
      quantifiedValue: roundValue(entry.quantifiedValue),
    })),
    unquantified: uniqueStrings(unquantified),
  };
}

function mergeFormulaParts(parts: FormulaQuantification[]): FormulaQuantification {
  return {
    quantifiedValue: roundValue(parts.reduce((sum, part) => sum + part.quantifiedValue, 0)),
    unquantified: uniqueStrings(parts.flatMap((part) => part.unquantified)),
  };
}

function formatNumber(value: number): string {
  if (Math.abs(value % 1) < 1e-6) {
    return String(Math.round(value));
  }
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function formatPercent(scale: number): string {
  return `${formatNumber(scale * 100)}%`;
}

function getNumericStatLabel(key: string): string {
  const labels: Record<string, string> = {
    maxHp: '最大生命',
    maxQi: '最大灵力',
    physAtk: '物攻',
    spellAtk: '法攻',
    physDef: '物防',
    spellDef: '法防',
    hit: '命中',
    dodge: '闪避',
    crit: '暴击',
    critDamage: '暴伤',
    breakPower: '破招',
    resolvePower: '化解',
    moveSpeed: '移速',
    qiRegenRate: '灵力回复',
    hpRegenRate: '生命回复',
    cooldownSpeed: '冷却速度',
    auraPowerRate: '灵气强度',
  };
  return labels[key] ?? key;
}

function getFormulaVarLabel(variable: SkillFormulaVar): string {
  const labels: Partial<Record<SkillFormulaVar, string>> = {
    techLevel: '功法层数',
    targetCount: '目标数量',
    'caster.hp': '自身当前生命',
    'caster.maxHp': '自身最大生命',
    'caster.qi': '自身当前灵力',
    'caster.maxQi': '自身最大灵力',
    'target.hp': '目标当前生命',
    'target.maxHp': '目标最大生命',
    'target.qi': '目标当前灵力',
    'target.maxQi': '目标最大灵力',
  };
  if (labels[variable]) {
    return labels[variable]!;
  }
  if (variable.startsWith('caster.buff.') && variable.endsWith('.stacks')) {
    return '自身对应状态层数';
  }
  if (variable.startsWith('target.buff.') && variable.endsWith('.stacks')) {
    return '目标对应状态层数';
  }
  if (variable.startsWith('caster.stat.')) {
    return `自身${getNumericStatLabel(variable.slice('caster.stat.'.length))}`;
  }
  if (variable.startsWith('target.stat.')) {
    return `目标${getNumericStatLabel(variable.slice('target.stat.'.length))}`;
  }
  return variable;
}

function describeFormulaVar(variable: SkillFormulaVar, scale: number): string {
  return `${getFormulaVarLabel(variable)}×${formatPercent(scale)}`;
}

function getFormulaVarPointsPerValue(variable: SkillFormulaVar): number | null {
  if (variable in FORMULA_VAR_VALUE_UNITS) {
    return FORMULA_VAR_VALUE_UNITS[variable as QuantifiableFormulaVar] ?? null;
  }
  return null;
}

function quantifyFormulaVar(variable: SkillFormulaVar, scale: number): FormulaQuantification {
  if ((variable.startsWith('caster.buff.') || variable.startsWith('target.buff.')) && variable.endsWith('.stacks')) {
    return {
      quantifiedValue: 0,
      unquantified: [describeFormulaVar(variable, scale)],
    };
  }
  if (variable === 'target.maxHp' || variable === 'target.hp' || variable.startsWith('target.stat.')) {
    return {
      quantifiedValue: 0,
      unquantified: [describeFormulaVar(variable, scale)],
    };
  }

  if (variable === 'techLevel' || variable === 'targetCount' || variable === 'caster.hp' || variable === 'caster.qi') {
    return {
      quantifiedValue: 0,
      unquantified: [describeFormulaVar(variable, scale)],
    };
  }

  const pointsPerValue = getFormulaVarPointsPerValue(variable);
  if (!pointsPerValue) {
    return {
      quantifiedValue: 0,
      unquantified: [describeFormulaVar(variable, scale)],
    };
  }

  return {
    quantifiedValue: scale * pointsPerValue,
    unquantified: [],
  };
}

function evaluateMultiplierWithBaseline(formula: SkillFormula, baseline: number): MultiplierEvaluation {
  if (typeof formula === 'number') {
    return { ok: true, value: formula, containsVariable: false };
  }
  if ('var' in formula) {
    const pointsPerValue = getFormulaVarPointsPerValue(formula.var);
    if (!pointsPerValue || Math.abs(formula.scale ?? 1) > 0.01 + 1e-9) {
      return { ok: false, value: 0, containsVariable: false };
    }
    return {
      ok: true,
      value: baseline * (formula.scale ?? 1),
      containsVariable: true,
    };
  }
  if (formula.op === 'clamp' || formula.op === 'min' || formula.op === 'max') {
    return { ok: false, value: 0, containsVariable: false };
  }

  const parts = formula.args.map((entry) => evaluateMultiplierWithBaseline(entry, baseline));
  if (parts.some((entry) => !entry.ok)) {
    return { ok: false, value: 0, containsVariable: false };
  }

  const values = parts.map((entry) => entry.value);
  const containsVariable = parts.some((entry) => entry.containsVariable);
  switch (formula.op) {
    case 'add':
      return { ok: true, value: values.reduce((sum, value) => sum + value, 0), containsVariable };
    case 'sub':
      return { ok: true, value: values.slice(1).reduce((sum, value) => sum - value, values[0] ?? 0), containsVariable };
    case 'mul':
      return { ok: true, value: values.reduce((product, value) => product * value, 1), containsVariable };
    case 'div':
      return {
        ok: true,
        value: values.slice(1).reduce((quotient, value) => (value === 0 ? quotient : quotient / value), values[0] ?? 0),
        containsVariable,
      };
    default:
      return { ok: false, value: 0, containsVariable: false };
  }
}

function tryExtractMultiplier(formula: SkillFormula): number | null {
  if (typeof formula === 'number') {
    return formula;
  }
  const zero = evaluateMultiplierWithBaseline(formula, 0);
  const baseline = evaluateMultiplierWithBaseline(formula, MULTIPLIER_BASELINE);
  if (!zero.ok || !baseline.ok) {
    return null;
  }
  if (!baseline.containsVariable) {
    return baseline.value;
  }
  if (Math.abs(zero.value - 1) > 1e-6) {
    return null;
  }
  return baseline.value;
}

function quantifySkillFormula(formula: SkillFormula): SkillValueSummary {
  if (typeof formula === 'number') {
    return {
      quantifiedValue: 0,
      breakdown: [],
      unquantified: [`基础值 ${formatNumber(formula)}`],
      baseQuantifiedValue: 0,
      multiplier: 1,
    };
  }

  if ('var' in formula) {
    const quantified = quantifyFormulaVar(formula.var, formula.scale ?? 1);
    return {
      quantifiedValue: roundValue(quantified.quantifiedValue),
      breakdown: quantified.quantifiedValue === 0 ? [] : [{
        kind: 'skill',
        key: formula.var,
        amount: formula.scale ?? 1,
        quantifiedValue: quantified.quantifiedValue,
      }],
      unquantified: quantified.unquantified,
      baseQuantifiedValue: roundValue(quantified.quantifiedValue),
      multiplier: 1,
    };
  }

  if (formula.op === 'add') {
    const parts = formula.args.map((entry) => quantifySkillFormula(entry));
    const breakdown = parts.flatMap((entry) => entry.breakdown);
    return {
      quantifiedValue: roundValue(parts.reduce((sum, entry) => sum + entry.quantifiedValue, 0)),
      breakdown,
      unquantified: uniqueStrings(parts.flatMap((entry) => entry.unquantified)),
      baseQuantifiedValue: roundValue(parts.reduce((sum, entry) => sum + entry.baseQuantifiedValue, 0)),
      multiplier: 1,
    };
  }

  if (formula.op === 'mul') {
    let multiplier = 1;
    const bodyParts: SkillValueSummary[] = [];

    for (const arg of formula.args) {
      const extracted = tryExtractMultiplier(arg);
      if (extracted !== null) {
        multiplier *= extracted;
        continue;
      }
      bodyParts.push(quantifySkillFormula(arg));
    }

    if (bodyParts.length === 1) {
      const body = bodyParts[0];
      return {
        quantifiedValue: roundValue(body.quantifiedValue * multiplier),
        breakdown: body.breakdown.map((entry) => ({
          ...entry,
          quantifiedValue: entry.quantifiedValue * multiplier,
          note: multiplier !== 1 ? `乘区 x${formatNumber(multiplier)}` : entry.note,
        })),
        unquantified: body.unquantified,
        baseQuantifiedValue: body.baseQuantifiedValue,
        multiplier: roundValue(body.multiplier * multiplier),
      };
    }

    if (bodyParts.length === 0) {
      return {
        quantifiedValue: 0,
        breakdown: [],
        unquantified: [],
        baseQuantifiedValue: 0,
        multiplier: roundValue(multiplier),
      };
    }

    const quantifiedBodies = bodyParts.filter((entry) => entry.breakdown.length > 0 || entry.quantifiedValue !== 0 || entry.baseQuantifiedValue !== 0);
    const multiplierLikeBodies = bodyParts.filter((entry) => !quantifiedBodies.includes(entry));
    if (quantifiedBodies.length === 1) {
      const body = quantifiedBodies[0];
      const multiplierUnquantified = uniqueStrings(multiplierLikeBodies.flatMap((entry) => entry.unquantified));
      return {
        quantifiedValue: roundValue(body.quantifiedValue * multiplier),
        breakdown: body.breakdown.map((entry) => ({
          ...entry,
          quantifiedValue: entry.quantifiedValue * multiplier,
          note: multiplier !== 1 ? `乘区 x${formatNumber(multiplier)}` : entry.note,
        })),
        unquantified: uniqueStrings([...body.unquantified, ...multiplierUnquantified]),
        baseQuantifiedValue: body.baseQuantifiedValue,
        multiplier: roundValue(body.multiplier * multiplier),
      };
    }

    return {
      quantifiedValue: 0,
      breakdown: [],
      unquantified: ['复合乘法结构'],
      baseQuantifiedValue: 0,
      multiplier: 1,
    };
  }

  if (formula.op === 'sub') {
    const parts = formula.args.map((entry) => quantifySkillFormula(entry));
    const base = parts[0];
    const deducted = parts.slice(1).reduce((sum, entry) => sum + entry.quantifiedValue, 0);
    return {
      quantifiedValue: roundValue((base?.quantifiedValue ?? 0) - deducted),
      breakdown: parts.flatMap((entry) => entry.breakdown),
      unquantified: uniqueStrings(parts.flatMap((entry) => entry.unquantified)),
      baseQuantifiedValue: roundValue((base?.baseQuantifiedValue ?? 0) - parts.slice(1).reduce((sum, entry) => sum + entry.baseQuantifiedValue, 0)),
      multiplier: 1,
    };
  }

  return {
    quantifiedValue: 0,
    breakdown: [],
    unquantified: ['复杂公式结构'],
    baseQuantifiedValue: 0,
    multiplier: 1,
  };
}

/** 计算六维属性的价值 */
export function calculateAttributesValue(attrs?: Partial<Attributes>): ValueSummary {
  const breakdown: ValueBreakdownEntry[] = [];
  if (attrs) {
    for (const key of Object.keys(ATTRIBUTE_VALUE_PER_POINT) as AttrKey[]) {
      const amount = attrs[key] ?? 0;
      if (!amount) continue;
      breakdown.push({
        kind: 'attr',
        key,
        amount,
        quantifiedValue: amount * ATTRIBUTE_VALUE_PER_POINT[key],
        note: `每点 ${ATTRIBUTE_VALUE_PER_POINT[key]} 价值`,
      });
    }
  }
  return finalizeSummary(breakdown, []);
}

/** 计算数值属性的价值 */
export function calculateNumericStatsValue(stats?: PartialNumericStats): ValueSummary {
  const breakdown: ValueBreakdownEntry[] = [];
  if (stats) {
    for (const key of NUMERIC_SCALAR_STAT_KEYS) {
      const amount = stats[key] ?? 0;
      if (!amount) continue;
      const pointsPerValue = NUMERIC_STAT_POINTS_PER_VALUE[key];
      breakdown.push({
        kind: 'stat',
        key,
        amount,
        quantifiedValue: amount / pointsPerValue,
        note: `${pointsPerValue} 点 = 1 价值`,
      });
    }
    for (const element of ELEMENT_KEYS) {
      const bonus = stats.elementDamageBonus?.[element] ?? 0;
      if (bonus) {
        breakdown.push({
          kind: 'element',
          key: `elementDamageBonus.${element}`,
          amount: bonus,
          quantifiedValue: bonus,
          note: '按 1 点 = 1 价值',
        });
      }
      const reduce = stats.elementDamageReduce?.[element] ?? 0;
      if (reduce) {
        breakdown.push({
          kind: 'element',
          key: `elementDamageReduce.${element}`,
          amount: reduce,
          quantifiedValue: reduce,
          note: '按 1 点 = 1 价值',
        });
      }
    }
  }
  return finalizeSummary(breakdown, []);
}

/** 计算属性加成来源的价值（六维 + 数值） */
export function calculateAttrBonusValue(bonus: Pick<AttrBonus, 'attrs' | 'stats'>): ValueSummary {
  const attrSummary = calculateAttributesValue(bonus.attrs);
  const statSummary = calculateNumericStatsValue(bonus.stats);
  return finalizeSummary(
    [...attrSummary.breakdown, ...statSummary.breakdown],
    [...attrSummary.unquantified, ...statSummary.unquantified],
  );
}

/** 计算装备的价值 */
export function calculateEquipmentValue(item: Pick<ItemStack, 'equipAttrs' | 'equipStats' | 'desc'>): ValueSummary {
  const summary = calculateAttrBonusValue({
    attrs: item.equipAttrs ?? {},
    stats: item.equipStats,
  });
  const unquantified = [...summary.unquantified];
  const hasNumeric = summary.breakdown.length > 0;
  if (!hasNumeric && item.desc) {
    unquantified.push(item.desc);
  }
  return finalizeSummary(summary.breakdown, unquantified);
}

/** 计算 Buff 效果的价值（按持续时间折算） */
export function calculateBuffValue(
  effect: Pick<SkillBuffEffectDef, 'buffId' | 'name' | 'desc' | 'duration' | 'attrs' | 'stats'>,
): ValueSummary {
  const duration = Math.max(1, effect.duration);
  const durationMultiplier = duration <= BUFF_DURATION_BASELINE
    ? Math.pow(duration / BUFF_DURATION_BASELINE, BUFF_DURATION_SHORT_EXPONENT)
    : Math.min(
        BUFF_DURATION_MAX_MULTIPLIER,
        1 + BUFF_DURATION_LONG_LOG_FACTOR * Math.log(duration / BUFF_DURATION_BASELINE),
      );
  const summary = calculateAttrBonusValue({
    attrs: effect.attrs ?? {},
    stats: effect.stats,
  });
  const breakdown = summary.breakdown.map((entry) => ({
    ...entry,
    kind: 'buff' as const,
    key: `${effect.buffId}.${entry.key}`,
    quantifiedValue: entry.quantifiedValue * durationMultiplier,
    note: `持续 ${duration} 息，折算 x${formatNumber(durationMultiplier)}`,
  }));
  const unquantified = [...summary.unquantified];
  if (effect.desc) {
    unquantified.push(effect.desc);
  }
  return finalizeSummary(breakdown, unquantified);
}

/** 计算技能的价值（含伤害公式量化） */
export function calculateSkillValue(skill: Pick<SkillDef, 'id' | 'name' | 'desc' | 'cost' | 'cooldown' | 'effects'>): SkillValueSummary {
  const breakdown: ValueBreakdownEntry[] = [];
  const unquantified: string[] = [];
  let baseQuantifiedValue = 0;
  let multiplier = 1;

  for (const effect of skill.effects) {
    if (effect.type === 'damage') {
      const quantified = quantifySkillFormula(effect.formula);
      baseQuantifiedValue += quantified.baseQuantifiedValue;
      multiplier = Math.max(multiplier, quantified.multiplier);
      breakdown.push(...quantified.breakdown);
      unquantified.push(...quantified.unquantified);
      continue;
    }
  }

  const summary = finalizeSummary(breakdown, unquantified);
  return {
    quantifiedValue: summary.quantifiedValue,
    breakdown: summary.breakdown,
    unquantified: summary.unquantified,
    baseQuantifiedValue: roundValue(baseQuantifiedValue),
    multiplier: roundValue(multiplier),
  };
}

/** 计算功法单层的价值 */
export function calculateTechniqueLayerValue(layer: TechniqueLayerDef): ValueSummary {
  return calculateAttributesValue(layer.attrs);
}

/** 计算功法在当前层数下的总价值 */
export function calculateTechniqueValue(technique: Pick<TechniqueState, 'level' | 'layers' | 'attrCurves'>): ValueSummary {
  const attrs = calcTechniqueAttrValues(technique.level, technique.layers, technique.attrCurves);
  const summary = calculateAttributesValue(attrs);
  return finalizeSummary(
    summary.breakdown.map((entry) => ({
      ...entry,
      kind: 'technique',
    })),
    summary.unquantified,
  );
}
