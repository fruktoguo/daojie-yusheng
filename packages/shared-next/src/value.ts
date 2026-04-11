/**
 * 价值量化系统：将属性、数值、装备、Buff、技能、功法等游戏要素
 * 统一折算为可比较的"价值点"，用于平衡性分析。
 */
import { ELEMENT_KEYS, NUMERIC_SCALAR_STAT_KEYS } from './constants/gameplay/attributes';
import { TECHNIQUE_GRADE_ORDER } from './constants/gameplay/technique';
import type { PartialNumericStats } from './numeric';
import { calcTechniqueAttrValues } from './technique';
import type {
  AttrBonus,
  AttrKey,
  Attributes,
  EquipmentEffectDef,
  ItemStack,
  SkillBuffEffectDef,
  SkillDef,
  SkillFormula,
  SkillFormulaVar,
  TechniqueLayerDef,
  TechniqueGrade,
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
  antiCrit: 1,
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
  extraAggroRate: 1,
  extraRange: 1,
  extraArea: 1,
} satisfies Record<typeof NUMERIC_SCALAR_STAT_KEYS[number], number>;

/** 配置层每 1 价值对应的真实数值点数 */
export const NUMERIC_STAT_ACTUAL_POINTS_PER_CONFIG_VALUE = {
  maxHp: 12,
  maxQi: 8,
  physAtk: 1,
  spellAtk: 1,
  physDef: 1,
  spellDef: 1,
  hit: 1,
  dodge: 1,
  crit: 1,
  antiCrit: 1,
  critDamage: 1,
  breakPower: 1,
  resolvePower: 1,
  maxQiOutputPerTick: 1,
  qiRegenRate: 100,
  hpRegenRate: 100,
  cooldownSpeed: 1,
  auraCostReduce: 100,
  auraPowerRate: 100,
  playerExpRate: 100,
  techniqueExpRate: 100,
  realmExpPerTick: 1,
  techniqueExpPerTick: 1,
  lootRate: 100,
  rareLootRate: 100,
  viewRange: 1,
  moveSpeed: 1,
  extraAggroRate: 1,
  extraRange: 1,
  extraArea: 1,
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
  'caster.stat.antiCrit': NUMERIC_STAT_POINTS_PER_VALUE.antiCrit,
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
  'caster.stat.extraAggroRate': NUMERIC_STAT_POINTS_PER_VALUE.extraAggroRate,
  'caster.stat.extraRange': NUMERIC_STAT_POINTS_PER_VALUE.extraRange,
  'caster.stat.extraArea': NUMERIC_STAT_POINTS_PER_VALUE.extraArea,
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

/** 装备价值汇总（区分基准价值与实际价值） */
export interface EquipmentValueSummary extends ValueSummary {
  baseQuantifiedValue: number;
  actualQuantifiedValue: number;
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

const UNLIMITED_STACK_DISPLAY_THRESHOLD = 1_000_000;

export function formatBuffMaxStacks(maxStacks?: number): string | null {
  if (!Number.isFinite(maxStacks) || (maxStacks ?? 0) <= 1) {
    return null;
  }
  return maxStacks! >= UNLIMITED_STACK_DISPLAY_THRESHOLD
    ? '无限'
    : formatNumber(maxStacks!);
}

function formatPercent(scale: number): string {
  return `${formatNumber(scale * 100)}%`;
}

export function compileValueStatsToActualStats(valueStats?: PartialNumericStats): PartialNumericStats | undefined {
  if (!valueStats) {
    return undefined;
  }

  const actual: PartialNumericStats = {};
  for (const key of NUMERIC_SCALAR_STAT_KEYS) {
    const amount = valueStats[key];
    if (!amount) {
      continue;
    }
    // 运行时真实数值仍沿用整数口径，避免价值配置换算后的浮点噪声渗入结算。
    actual[key] = Math.round(amount * NUMERIC_STAT_ACTUAL_POINTS_PER_CONFIG_VALUE[key]);
  }

  if (valueStats.elementDamageBonus) {
    const elementBonus: NonNullable<PartialNumericStats['elementDamageBonus']> = {};
    for (const element of ELEMENT_KEYS) {
      const amount = valueStats.elementDamageBonus[element];
      if (!amount) {
        continue;
      }
      elementBonus[element] = amount;
    }
    if (Object.keys(elementBonus).length > 0) {
      actual.elementDamageBonus = elementBonus;
    }
  }

  if (valueStats.elementDamageReduce) {
    const elementReduce: NonNullable<PartialNumericStats['elementDamageReduce']> = {};
    for (const element of ELEMENT_KEYS) {
      const amount = valueStats.elementDamageReduce[element];
      if (!amount) {
        continue;
      }
      elementReduce[element] = amount;
    }
    if (Object.keys(elementReduce).length > 0) {
      actual.elementDamageReduce = elementReduce;
    }
  }

  return Object.keys(actual).length > 0 ? actual : undefined;
}

export function calculateConfiguredValueStatsValue(valueStats?: PartialNumericStats): ValueSummary {
  const breakdown: ValueBreakdownEntry[] = [];
  if (valueStats) {
    for (const key of NUMERIC_SCALAR_STAT_KEYS) {
      const amount = valueStats[key] ?? 0;
      if (!amount) {
        continue;
      }
      breakdown.push({
        kind: 'stat',
        key,
        amount,
        quantifiedValue: amount,
        note: '配置值 1 = 1 价值',
      });
    }
    for (const element of ELEMENT_KEYS) {
      const bonus = valueStats.elementDamageBonus?.[element] ?? 0;
      if (bonus) {
        breakdown.push({
          kind: 'element',
          key: `elementDamageBonus.${element}`,
          amount: bonus,
          quantifiedValue: bonus,
          note: '配置值 1 = 1 价值',
        });
      }
      const reduce = valueStats.elementDamageReduce?.[element] ?? 0;
      if (reduce) {
        breakdown.push({
          kind: 'element',
          key: `elementDamageReduce.${element}`,
          amount: reduce,
          quantifiedValue: reduce,
          note: '配置值 1 = 1 价值',
        });
      }
    }
  }
  return finalizeSummary(breakdown, []);
}

function getAttrLabel(key: string): string {
  const labels: Record<string, string> = {
    constitution: '体魄',
    spirit: '神识',
    perception: '身法',
    talent: '根骨',
    comprehension: '悟性',
    luck: '气运',
  };
  return labels[key] ?? key;
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
    antiCrit: '免爆',
    critDamage: '暴伤',
    breakPower: '破招',
    resolvePower: '化解',
    maxQiOutputPerTick: '每息灵力输出上限',
    moveSpeed: '移速',
    qiRegenRate: '灵力回复',
    hpRegenRate: '生命回复',
    cooldownSpeed: '冷却速度',
    auraCostReduce: '灵气消耗减免',
    auraPowerRate: '灵气强度',
    playerExpRate: '境界修为倍率',
    techniqueExpRate: '功法经验倍率',
    realmExpPerTick: '境界修炼效率',
    techniqueExpPerTick: '功法修炼效率',
    lootRate: '掉落倍率',
    rareLootRate: '稀有掉落倍率',
    viewRange: '视野范围',
    extraRange: '额外射程',
    extraArea: '额外范围',
  };
  return labels[key] ?? key;
}

function getEquipmentLevelLinearMultiplier(level: number | undefined): number {
  const normalizedLevel = Math.max(1, Math.floor(level ?? 1));
  return 1 + (normalizedLevel - 1) * 0.1;
}

function getEquipmentLevelExponentialMultiplier(level: number | undefined): number {
  const normalizedLevel = Math.max(1, Math.floor(level ?? 1));
  return Math.pow(1.1, normalizedLevel - 1);
}

function isExponentialEquipmentStat(key: typeof NUMERIC_SCALAR_STAT_KEYS[number]): boolean {
  return key === 'physAtk' || key === 'spellAtk' || key === 'maxHp' || key === 'maxQi';
}

function getEquipmentGradeMultiplier(grade: TechniqueGrade | undefined): number {
  const gradeIndex = Math.max(0, TECHNIQUE_GRADE_ORDER.indexOf(grade ?? 'mortal'));
  return 2 ** gradeIndex;
}

function scaleAttributes(attrs: Partial<Attributes> | undefined, multiplier: number): Partial<Attributes> | undefined {
  if (!attrs) {
    return undefined;
  }
  const scaled: Partial<Attributes> = {};
  for (const key of Object.keys(ATTRIBUTE_VALUE_PER_POINT) as AttrKey[]) {
    const amount = attrs[key];
    if (!amount) {
      continue;
    }
    scaled[key] = amount * multiplier;
  }
  return Object.keys(scaled).length > 0 ? scaled : undefined;
}

function scaleNumericStats(
  stats: PartialNumericStats | undefined,
  gradeMultiplier: number,
  level: number | undefined,
): PartialNumericStats | undefined {
  if (!stats) {
    return undefined;
  }

  const scaled: PartialNumericStats = {};
  for (const key of NUMERIC_SCALAR_STAT_KEYS) {
    const amount = stats[key];
    if (!amount) {
      continue;
    }
    const levelMultiplier = isExponentialEquipmentStat(key)
      ? getEquipmentLevelExponentialMultiplier(level)
      : getEquipmentLevelLinearMultiplier(level);
    scaled[key] = amount * gradeMultiplier * levelMultiplier;
  }

  if (stats.elementDamageBonus) {
    const scaledBonus: NonNullable<PartialNumericStats['elementDamageBonus']> = {};
    const levelMultiplier = getEquipmentLevelLinearMultiplier(level);
    for (const element of ELEMENT_KEYS) {
      const amount = stats.elementDamageBonus[element];
      if (!amount) {
        continue;
      }
      scaledBonus[element] = amount * gradeMultiplier * levelMultiplier;
    }
    if (Object.keys(scaledBonus).length > 0) {
      scaled.elementDamageBonus = scaledBonus;
    }
  }

  if (stats.elementDamageReduce) {
    const scaledReduce: NonNullable<PartialNumericStats['elementDamageReduce']> = {};
    const levelMultiplier = getEquipmentLevelLinearMultiplier(level);
    for (const element of ELEMENT_KEYS) {
      const amount = stats.elementDamageReduce[element];
      if (!amount) {
        continue;
      }
      scaledReduce[element] = amount * gradeMultiplier * levelMultiplier;
    }
    if (Object.keys(scaledReduce).length > 0) {
      scaled.elementDamageReduce = scaledReduce;
    }
  }

  return Object.keys(scaled).length > 0 ? scaled : undefined;
}

function sumAttributePoints(attrs: Partial<Attributes> | undefined): number {
  if (!attrs) {
    return 0;
  }
  let total = 0;
  for (const key of Object.keys(ATTRIBUTE_VALUE_PER_POINT) as AttrKey[]) {
    total += attrs[key] ?? 0;
  }
  return total;
}

function formatEquipmentStatValue(key: string, value: number): string {
  if (key === 'critDamage') {
    return `${formatNumber(value / 10)}%`;
  }
  if ([
    'qiRegenRate',
    'hpRegenRate',
    'auraCostReduce',
    'auraPowerRate',
    'playerExpRate',
    'techniqueExpRate',
    'lootRate',
    'rareLootRate',
  ].includes(key)) {
    return `${formatNumber(value / 100)}%`;
  }
  return formatNumber(value);
}

function describeAttrBonus(attrs?: Partial<Attributes>): string[] {
  if (!attrs) {
    return [];
  }
  const parts: string[] = [];
  for (const key of Object.keys(ATTRIBUTE_VALUE_PER_POINT) as AttrKey[]) {
    const amount = attrs[key];
    if (!amount) {
      continue;
    }
    parts.push(`${getAttrLabel(key)}+${formatNumber(amount)}`);
  }
  return parts;
}

function describeStatBonus(stats?: PartialNumericStats): string[] {
  if (!stats) {
    return [];
  }
  const parts: string[] = [];
  for (const key of NUMERIC_SCALAR_STAT_KEYS) {
    const amount = stats[key];
    if (!amount) {
      continue;
    }
    parts.push(`${getNumericStatLabel(key)}+${formatEquipmentStatValue(key, amount)}`);
  }
  for (const element of ELEMENT_KEYS) {
    const bonus = stats.elementDamageBonus?.[element];
    if (bonus) {
      parts.push(`${element}行增伤+${formatNumber(bonus)}`);
    }
    const reduce = stats.elementDamageReduce?.[element];
    if (reduce) {
      parts.push(`${element}行减伤+${formatNumber(reduce)}`);
    }
  }
  return parts;
}

function describeEquipmentConditions(effect: EquipmentEffectDef): string {
  const conditions = effect.conditions?.items ?? [];
  if (conditions.length === 0) {
    return '';
  }
  const parts = conditions.map((condition) => {
    switch (condition.type) {
      case 'time_segment':
        return `时段:${condition.in.join('/')}`;
      case 'map':
        return `地图:${condition.mapIds.join('/')}`;
      case 'hp_ratio':
        return `生命${condition.op}${Math.round(condition.value * 100)}%`;
      case 'qi_ratio':
        return `灵力${condition.op}${Math.round(condition.value * 100)}%`;
      case 'is_cultivating':
        return condition.value ? '修炼中' : '未修炼';
      case 'has_buff':
        return `需带有${condition.buffId}${condition.minStacks ? `${condition.minStacks}层` : ''}`;
      case 'target_kind':
        return `目标:${condition.in.join('/')}`;
      default:
        return '';
    }
  }).filter((entry) => entry.length > 0);
  return parts.length > 0 ? ` [${parts.join('，')}]` : '';
}

function getEquipmentTriggerLabel(trigger: string): string {
  const labels: Record<string, string> = {
    on_equip: '装备时',
    on_unequip: '卸下时',
    on_tick: '每息',
    on_move: '移动后',
    on_attack: '攻击后',
    on_hit: '受击后',
    on_kill: '击杀后',
    on_skill_cast: '施法后',
    on_cultivation_tick: '修炼时',
    on_time_segment_changed: '时段切换时',
    on_enter_map: '入图时',
  };
  return labels[trigger] ?? trigger;
}

function describeEquipmentEffect(effect: EquipmentEffectDef): string {
  const conditionText = describeEquipmentConditions(effect);
  switch (effect.type) {
    case 'stat_aura':
      return `常驻特效:${[...describeAttrBonus(effect.attrs), ...describeStatBonus(effect.stats)].join(' / ') || '无数值变化'}${conditionText}`;
    case 'progress_boost':
      return `推进特效:${[...describeAttrBonus(effect.attrs), ...describeStatBonus(effect.stats)].join(' / ') || '无数值变化'}${conditionText}`;
    case 'periodic_cost': {
      const amount = effect.mode === 'flat'
        ? formatNumber(effect.value)
        : `${formatNumber(effect.value / 100)}% ${effect.mode === 'max_ratio_bp' ? '最大' : '当前'}${effect.resource === 'hp' ? '生命' : '灵力'}`;
      const triggerLabel = effect.trigger === 'on_cultivation_tick' ? '修炼时每息' : '每息';
      return `持续代价:${triggerLabel}损失 ${amount}${conditionText}`;
    }
    case 'timed_buff': {
      const stackLimit = formatBuffMaxStacks(effect.buff.maxStacks);
      const metaParts = [
        getEquipmentTriggerLabel(effect.trigger),
        effect.target === 'target' ? '目标' : '自身',
        `${effect.buff.duration}息`,
      ];
      if (stackLimit) {
        metaParts.push(`最多${stackLimit}层`);
      }
      if (effect.cooldown !== undefined) {
        metaParts.push(`冷却${formatNumber(effect.cooldown)}息`);
      }
      if (effect.chance !== undefined) {
        metaParts.push(`概率${formatNumber(effect.chance * 100)}%`);
      }
      const effectParts = [...describeAttrBonus(effect.buff.attrs), ...describeStatBonus(effect.buff.stats)];
      const descPart = effect.buff.desc ? `；${effect.buff.desc}` : '';
      return `触发特效:${metaParts.join(' · ')}，获得${effect.buff.name}${conditionText}${effectParts.length > 0 ? `，效果:${effectParts.join(' / ')}` : ''}${descPart}`;
    }
  }
}

function getFormulaVarLabel(variable: SkillFormulaVar): string {
  const labels: Partial<Record<SkillFormulaVar, string>> = {
    techLevel: '功法层数',
    targetCount: '目标数量',
    'caster.hp': '自身当前生命',
    'caster.maxHp': '自身最大生命',
    'caster.qi': '自身当前灵力',
    'caster.maxQi': '自身最大灵力',
    'target.debuffCount': '目标减益数量',
    'target.distance': '目标距离',
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
  if (variable.startsWith('caster.attr.')) {
    return `自身${getAttrLabel(variable.slice('caster.attr.'.length))}`;
  }
  if (variable.startsWith('target.stat.')) {
    return `目标${getNumericStatLabel(variable.slice('target.stat.'.length))}`;
  }
  if (variable.startsWith('target.attr.')) {
    return `目标${getAttrLabel(variable.slice('target.attr.'.length))}`;
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
  if (
    variable === 'target.maxHp'
    || variable === 'target.hp'
    || variable === 'target.distance'
    || variable.startsWith('target.stat.')
    || variable.startsWith('target.attr.')
  ) {
    return {
      quantifiedValue: 0,
      unquantified: [describeFormulaVar(variable, scale)],
    };
  }

  if (variable === 'techLevel' || variable === 'targetCount' || variable === 'caster.hp' || variable === 'caster.qi' || variable === 'target.debuffCount') {
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
export function calculateEquipmentValue(
  item: Pick<ItemStack, 'equipAttrs' | 'equipStats' | 'effects' | 'grade' | 'level'> & {
    equipValueStats?: PartialNumericStats;
  },
): EquipmentValueSummary {
  const baseAttrSummary = calculateAttributesValue(item.equipAttrs ?? {});
  const baseStatSummary = item.equipValueStats
    ? calculateConfiguredValueStatsValue(item.equipValueStats)
    : calculateNumericStatsValue(item.equipStats);
  const baseSummary = finalizeSummary(
    [...baseAttrSummary.breakdown, ...baseStatSummary.breakdown],
    [...baseAttrSummary.unquantified, ...baseStatSummary.unquantified],
  );

  const gradeMultiplier = getEquipmentGradeMultiplier(item.grade);
  const scaledAttrs = scaleAttributes(item.equipAttrs, gradeMultiplier);
  const actualBaseStats = item.equipValueStats
    ? compileValueStatsToActualStats(item.equipValueStats)
    : item.equipStats;
  const scaledStats = scaleNumericStats(actualBaseStats, gradeMultiplier, item.level);
  const attrPoints = sumAttributePoints(scaledAttrs);
  const attrValueMultiplier = 1 + attrPoints * 0.03;

  const actualAttrSummary = calculateAttributesValue(scaledAttrs);
  const actualStatSummary = calculateNumericStatsValue(scaledStats);
  const actualBreakdown = [...actualAttrSummary.breakdown, ...actualStatSummary.breakdown]
    .map((entry) => ({
      ...entry,
      quantifiedValue: entry.quantifiedValue * attrValueMultiplier,
      note: `${entry.note ?? '装备价值'}；六维乘区 x${formatNumber(attrValueMultiplier)}`,
    }));
  const effectDescriptions = (item.effects ?? []).map((effect) => describeEquipmentEffect(effect));
  const summary = finalizeSummary(actualBreakdown, effectDescriptions);
  return {
    ...summary,
    quantifiedValue: summary.quantifiedValue,
    baseQuantifiedValue: roundValue(baseSummary.quantifiedValue),
    actualQuantifiedValue: roundValue(summary.quantifiedValue),
  };
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
