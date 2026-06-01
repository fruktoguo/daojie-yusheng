/**
 * 本文件定义内功量化模板的共享归一化与展开函数。
 *
 * 维护时保持纯函数，不引入服务端持久化、客户端 UI 或运行时状态。
 */
import type { Attributes } from './attribute-types';
import type { AttrKey } from './attribute-types';
import type {
  TechniqueCategory,
  TechniqueGrade,
  TechniqueLayerDef,
  TechniqueTemplate,
  TechniqueTemplateSparseLayer,
} from './cultivation-types';
import {
  TECHNIQUE_ATTR_KEYS,
  TECHNIQUE_EXP_BASE,
} from './constants/gameplay/technique';

/** 功法模板 schema 版本，便于后续 AI 生成入库时做兼容迁移。 */
export const TECHNIQUE_SCHEMA_VERSION = 1 as const;

/** 量化功法展开默认总层数。 */
export const TECHNIQUE_INTERNAL_DEFAULT_MAX_LAYER = 9 as const;

/** 量化功法总层数允许范围（含端点）。 */
export const TECHNIQUE_INTERNAL_MAX_LAYER_RANGE: readonly [number, number] = [3, 49];

/** 量化功法属性浮动系数 `attrFloat` 允许范围（含端点）。 */
export const TECHNIQUE_INTERNAL_ATTR_FLOAT_RANGE: readonly [number, number] = [-0.15, 0.10];

/** 经验难度系数 `expDifficulty` 允许范围（含端点）。 */
export const TECHNIQUE_INTERNAL_EXP_DIFFICULTY_RANGE: readonly [number, number] = [0.5, 2.0];

/** 生成模板的服务端总预算百分比范围。 */
export const TECHNIQUE_INTERNAL_BUDGET_PERCENT_RANGE: readonly [number, number] = [0.8, 1.2];

/** 每层经验增长公比（阶段内部平滑递增基底）。 */
export const TECHNIQUE_INTERNAL_K = 1.10 as const;

/**
 * 阶段经验 / 属性权重 `[入门, 小成, 大成]`。
 *
 * 既作为每层经验倍乘 `stageStep`，也作为阶段属性总量分配比例。
 */
export const TECHNIQUE_INTERNAL_STAGE_WEIGHT: readonly [number, number, number] = [1, 2, 4];

/** 各分类的经验系数 `catFactor`。 */
export const TECHNIQUE_CATEGORY_EXP_FACTOR: Record<TechniqueCategory, number> = {
  internal: 1.0,
  arts: 0.5,
  secret: 1.0,
  divine: 1.0,
};

/** 品阶索引：`mortal = 1` ... `emperor = 8`。 */
const TECHNIQUE_GRADE_INDEX: Record<TechniqueGrade, number> = {
  mortal: 1,
  yellow: 2,
  mystic: 3,
  earth: 4,
  heaven: 5,
  spirit: 6,
  saint: 7,
  emperor: 8,
};

/** 读取功法品阶索引。 */
export function getTechniqueGradeIndex(grade: TechniqueGrade): number {
  return TECHNIQUE_GRADE_INDEX[grade] ?? 1;
}

/** 在 `[min, max]` 之间夹住 `value`。 */
function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * 按阶段（入门/小成/大成）切分总层数。
 *
 * 规则：入门 = `floor(n/3)`，小成 = `floor(n/3)`，大成 = `n - 2·floor(n/3)`（余数归大成）。
 *
 * 下限取 1（容纳 legacy monster arts 等单层模板）；上限仍为 `TECHNIQUE_INTERNAL_MAX_LAYER_RANGE[1]`。
 */
export function resolveTechniqueStageLayers(maxLayer: number): [number, number, number] {
  const normalized = Math.max(
    1,
    Math.min(TECHNIQUE_INTERNAL_MAX_LAYER_RANGE[1], Math.trunc(maxLayer || TECHNIQUE_INTERNAL_DEFAULT_MAX_LAYER)),
  );
  const per = Math.floor(normalized / 3);
  return [per, per, normalized - 2 * per];
}

/** 按 1-based 层号返回阶段索引 0/1/2（入门/小成/大成）。 */
export function resolveTechniqueStageIndex(level: number, stageLayers: readonly [number, number, number]): 0 | 1 | 2 {
  if (level <= stageLayers[0]) return 0;
  if (level <= stageLayers[0] + stageLayers[1]) return 1;
  return 2;
}

/**
 * 功法六维总量公式：`T = (g²·(realmLv+25) + 50) × (1 + attrFloat)`。
 */
export function calcInternalTechniqueAttrTotal(
  grade: TechniqueGrade,
  realmLv: number,
  attrFloat = 0,
): number {
  const g = getTechniqueGradeIndex(grade);
  const normalizedRealmLv = Number.isFinite(realmLv) ? Math.max(1, Math.trunc(realmLv)) : 1;
  const normalizedFloat = clampRange(
    Number(attrFloat ?? 0),
    TECHNIQUE_INTERNAL_ATTR_FLOAT_RANGE[0],
    TECHNIQUE_INTERNAL_ATTR_FLOAT_RANGE[1],
  );
  return (g * g * (normalizedRealmLv + 25) + 50) * (1 + normalizedFloat);
}

/** 按服务端确定的预算百分比计算内功六维总量。 */
export function calcInternalTechniqueAttrTotalByBudgetPercent(
  grade: TechniqueGrade,
  realmLv: number,
  budgetPercent = 1,
): number {
  const g = getTechniqueGradeIndex(grade);
  const normalizedRealmLv = Number.isFinite(realmLv) ? Math.max(1, Math.trunc(realmLv)) : 1;
  const normalizedBudgetPercent = clampRange(
    Number(budgetPercent ?? 1),
    TECHNIQUE_INTERNAL_BUDGET_PERCENT_RANGE[0],
    TECHNIQUE_INTERNAL_BUDGET_PERCENT_RANGE[1],
  );
  return (g * g * (normalizedRealmLv + 25) + 50) * normalizedBudgetPercent;
}

/**
 * 功法总经验：`BASE × catFactor × (K^maxLayer - 1)/(K-1) × expDifficulty`，`BASE = g²·(realmLv+5)`。
 *
 * 返回值已乘以 `TECHNIQUE_EXP_BASE × realmLv`，与 `scaleTechniqueExp(expFactor, realmLv)` 的
 * 运行时单位对齐；这样展开后的 `expToNext` 可直接作为 `TechniqueLayerDef.expToNext` 使用，
 * 不需要下游再做额外缩放，也避免与老逐层配置的数量级出现 ~1700x 偏差。
 */
export function calcInternalTechniqueTotalExp(
  grade: TechniqueGrade,
  realmLv: number,
  maxLayer: number,
  expDifficulty = 1,
  category: TechniqueCategory = 'internal',
): number {
  const g = getTechniqueGradeIndex(grade);
  const normalizedRealmLv = Number.isFinite(realmLv) ? Math.max(1, Math.trunc(realmLv)) : 1;
  const [entry, minor, major] = resolveTechniqueStageLayers(maxLayer);
  const layersCount = entry + minor + major;
  const catFactor = TECHNIQUE_CATEGORY_EXP_FACTOR[category] ?? 1;
  const difficulty = clampRange(
    Number(expDifficulty ?? 1),
    TECHNIQUE_INTERNAL_EXP_DIFFICULTY_RANGE[0],
    TECHNIQUE_INTERNAL_EXP_DIFFICULTY_RANGE[1],
  );
  const K = TECHNIQUE_INTERNAL_K;
  const base = g * g * (normalizedRealmLv + 5);
  const rawTotal = base * catFactor * ((K ** layersCount - 1) / (K - 1)) * difficulty;
  return rawTotal * TECHNIQUE_EXP_BASE * normalizedRealmLv;
}

const TECHNIQUE_ATTR_KEY_ALIAS_ENTRIES: Array<[string, AttrKey]> = [
  ['constitution', 'constitution'],
  ['体魄', 'constitution'],
  ['体质', 'constitution'],
  ['肉身', 'constitution'],
  ['体力', 'constitution'],
  ['spirit', 'spirit'],
  ['神识', 'spirit'],
  ['元神', 'spirit'],
  ['精神', 'spirit'],
  ['魂力', 'spirit'],
  ['perception', 'perception'],
  ['身法', 'perception'],
  ['感知', 'perception'],
  ['洞察', 'perception'],
  ['灵觉', 'perception'],
  ['talent', 'talent'],
  ['根骨', 'talent'],
  ['天赋', 'talent'],
  ['资质', 'talent'],
  ['悟性', 'talent'],
  ['strength', 'strength'],
  ['力道', 'strength'],
  ['力量', 'strength'],
  ['蛮力', 'strength'],
  ['气力', 'strength'],
  ['meridians', 'meridians'],
  ['经脉', 'meridians'],
  ['灵脉', 'meridians'],
  ['脉络', 'meridians'],
  ['真元', 'meridians'],
];

const TECHNIQUE_ATTR_KEY_ALIASES = new Map<string, AttrKey>(
  TECHNIQUE_ATTR_KEY_ALIAS_ENTRIES.flatMap(([alias, key]) => {
    const normalized = normalizeTechniqueAttrRatioKeyText(alias);
    return normalized === alias ? [[alias, key]] : [[alias, key], [normalized, key]];
  }),
);

/** 归一化 AI / 内容输入的六维权重键，兼容中文标签与少量常见同义词。 */
export function normalizeTechniqueAttrRatio(
  attrRatio: Partial<Record<string, unknown>> | undefined,
): Partial<Record<AttrKey, number>> | undefined {
  if (!attrRatio || typeof attrRatio !== 'object') return undefined;
  const result: Partial<Record<AttrKey, number>> = {};
  for (const [rawKey, rawValue] of Object.entries(attrRatio)) {
    const key = resolveTechniqueAttrRatioKey(rawKey);
    const value = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (!key || !Number.isFinite(value) || value <= 0) continue;
    result[key] = (result[key] ?? 0) + value;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function resolveTechniqueAttrRatioKey(rawKey: string): AttrKey | null {
  const key = rawKey.trim();
  if ((TECHNIQUE_ATTR_KEYS as readonly string[]).includes(key)) {
    return key as AttrKey;
  }
  return TECHNIQUE_ATTR_KEY_ALIASES.get(key)
    ?? TECHNIQUE_ATTR_KEY_ALIASES.get(normalizeTechniqueAttrRatioKeyText(key))
    ?? null;
}

function normalizeTechniqueAttrRatioKeyText(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

/** attrRatio 的非零权重总和。 */
function sumAttrRatioWeights(attrRatio: Partial<Record<string, unknown>> | undefined): number {
  const normalized = normalizeTechniqueAttrRatio(attrRatio);
  if (!normalized) return 0;
  let sum = 0;
  for (const value of Object.values(normalized)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      sum += value;
    }
  }
  return sum;
}

/** 把 sparse overlay layers（只含 qiProjection）按 `level` merge 进展开结果。 */
function mergeSparseQiProjection(
  expandedLayers: TechniqueLayerDef[],
  sparse: readonly (TechniqueLayerDef | TechniqueTemplateSparseLayer)[] | undefined,
): void {
  if (!sparse || sparse.length === 0) return;
  const byLevel = new Map<number, TechniqueLayerDef>();
  for (const layer of expandedLayers) {
    byLevel.set(layer.level, layer);
  }
  for (const entry of sparse) {
    if (!entry || !Number.isFinite((entry as TechniqueTemplateSparseLayer).level)) continue;
    const target = byLevel.get(Math.trunc((entry as TechniqueTemplateSparseLayer).level));
    if (!target) continue;
    const qiProjection = (entry as TechniqueTemplateSparseLayer).qiProjection;
    if (Array.isArray(qiProjection) && qiProjection.length > 0) {
      target.qiProjection = qiProjection.map((modifier) => ({ ...modifier }));
    }
  }
}

/** 判断模板是否需要走 `attrRatio` 六维量化展开。 */
export function shouldExpandTechniqueAttrRatio(template: Pick<TechniqueTemplate, 'attrRatio'>): boolean {
  return sumAttrRatioWeights(template.attrRatio) > 0;
}

/** @deprecated 使用 shouldExpandTechniqueAttrRatio；保留给历史迁移工具兼容。 */
export const shouldExpandInternalTechnique = shouldExpandTechniqueAttrRatio;

/** `attrRatio` 功法展开结果（仅包含运行时需要的 layers 与诊断性统计）。 */
export interface InternalTechniqueExpansion {
  /** 展开后的完整 layers，可直接挂到 TechniqueState.layers。 */
  layers: TechniqueLayerDef[];
  /** 六维总量（浮点，按公式计算，用于 diff 报告）。 */
  attrTotal: number;
  /** 总经验（浮点，按公式计算，用于 diff 报告）。 */
  totalExp: number;
  /** 各阶段层数 `[入门, 小成, 大成]`。 */
  stageLayers: [number, number, number];
}

/**
 * 展开 `attrRatio` 量化模板：生成逐层 `{ level, expToNext, attrs, qiProjection? }`。
 *
 * 数值按 `AI功法生成方案.md §4 / §6 / §7.4`：
 * - 六维总量 `T = (g²·(realmLv+25) + 50) × (1 + attrFloat)`；
 * - 按阶段权重 `[1, 2, 4]` 分配到入门/小成/大成，阶段内每层均分；
 * - 每层经验 `raw = BASE × catFactor × K^(L-1) × stageStep × expDifficulty`，再归一到 `totalExp`。
 *
 * sparse overlay `template.layers` 仅保留 `{ level, qiProjection }` 的条目会被 merge 进结果。
 */
export function expandTechniqueAttrRatio(template: TechniqueTemplate): InternalTechniqueExpansion {
  const grade = template.grade;
  const category = template.category ?? 'internal';
  const realmLv = Number.isFinite(template.realmLv) ? Math.max(1, Math.trunc(template.realmLv)) : 1;
  const rawBudgetPercent = Number(template.budgetPercent);
  const hasBudgetPercent = Number.isFinite(rawBudgetPercent);
  const attrFloat = clampRange(
    Number(template.attrFloat ?? 0),
    TECHNIQUE_INTERNAL_ATTR_FLOAT_RANGE[0],
    TECHNIQUE_INTERNAL_ATTR_FLOAT_RANGE[1],
  );
  const maxLayer = Math.max(
    TECHNIQUE_INTERNAL_MAX_LAYER_RANGE[0],
    Math.min(
      TECHNIQUE_INTERNAL_MAX_LAYER_RANGE[1],
      Math.trunc(template.maxLayer ?? TECHNIQUE_INTERNAL_DEFAULT_MAX_LAYER),
    ),
  );
  const expDifficulty = clampRange(
    Number(template.expDifficulty ?? 1),
    TECHNIQUE_INTERNAL_EXP_DIFFICULTY_RANGE[0],
    TECHNIQUE_INTERNAL_EXP_DIFFICULTY_RANGE[1],
  );

  const attrTotal = hasBudgetPercent
    ? calcInternalTechniqueAttrTotalByBudgetPercent(grade, realmLv, rawBudgetPercent)
    : calcInternalTechniqueAttrTotal(grade, realmLv, attrFloat);
  const expCurve = expandTechniqueExpCurve(grade, realmLv, maxLayer, expDifficulty, category);
  const totalExp = expCurve.totalExp;

  const stageLayers = expCurve.stageLayers;
  const stageWeight = TECHNIQUE_INTERNAL_STAGE_WEIGHT;
  const stageWeightSum = stageWeight[0] + stageWeight[1] + stageWeight[2];
  const stageAttrTotals: [number, number, number] = [
    (attrTotal * stageWeight[0]) / stageWeightSum,
    (attrTotal * stageWeight[1]) / stageWeightSum,
    (attrTotal * stageWeight[2]) / stageWeightSum,
  ];

  const perLayerExp = expCurve.perLayerExp;
  const attrRatio = normalizeTechniqueAttrRatio(template.attrRatio) ?? {};
  const ratioSum = sumAttrRatioWeights(attrRatio);

  const layers: TechniqueLayerDef[] = [];
  for (let level = 1; level <= maxLayer; level += 1) {
    const stageIdx = resolveTechniqueStageIndex(level, stageLayers);
    const layersInStage = stageLayers[stageIdx] > 0 ? stageLayers[stageIdx] : 1;
    const stagePerLayer = stageAttrTotals[stageIdx] / layersInStage;

    const attrs: Partial<Attributes> = {};
    if (ratioSum > 0) {
      for (const key of TECHNIQUE_ATTR_KEYS) {
        const weight = attrRatio[key];
        if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) continue;
        const raw = (stagePerLayer * weight) / ratioSum;
        const rounded = Math.max(0, Math.round(raw));
        if (rounded > 0) {
          attrs[key] = rounded;
        }
      }
    }

    layers.push({
      level,
      expToNext: perLayerExp[level - 1] ?? 0,
      attrs: Object.keys(attrs).length > 0 ? attrs : undefined,
    });
  }

  mergeSparseQiProjection(layers, template.layers as TechniqueTemplateSparseLayer[] | undefined);

  return {
    layers,
    attrTotal,
    totalExp,
    stageLayers,
  };
}

/** @deprecated 使用 expandTechniqueAttrRatio；保留给历史迁移工具兼容。 */
export const expandInternalTechnique = expandTechniqueAttrRatio;

/**
 * 通用功法经验曲线展开：产出每一层已缩放的 `expToNext`，并把末层强制置 0。
 *
 * 适用于所有 category（`internal / arts / divine / secret`）。经验公式统一为：
 * - `BASE = g²·(realmLv + 5)`，`K = 1.10`，`catFactor` 由 `TECHNIQUE_CATEGORY_EXP_FACTOR` 分派
 * - 阶段划分 1/3 入门 / 1/3 小成 / 余数归大成，阶段权重 `[1, 2, 4]`
 * - `rawLayer(L) = BASE × catFactor × K^(L-1) × stageStep × expDifficulty`
 * - 归一到 `totalExp = BASE × catFactor × (K^maxLayer - 1)/(K-1) × expDifficulty × TECHNIQUE_EXP_BASE × realmLv`
 * - 末层 `expToNext = 0`（沿用 legacy 约定，顶层不再消耗经验）
 */
export function expandTechniqueExpCurve(
  grade: TechniqueGrade,
  realmLv: number,
  maxLayer: number,
  expDifficulty = 1,
  category: TechniqueCategory = 'internal',
): {
  /** 每一层的 `expToNext`（已缩放到 runtime 单位），末层为 0。 */
  perLayerExp: number[];
  /** 总经验（含末层的理论贡献，仅用于 diff/验证）。 */
  totalExp: number;
  /** 各阶段层数 `[入门, 小成, 大成]`。 */
  stageLayers: [number, number, number];
} {
  const stageLayers = resolveTechniqueStageLayers(maxLayer);
  const resolvedMaxLayer = stageLayers[0] + stageLayers[1] + stageLayers[2];
  const normalizedRealmLv = Number.isFinite(realmLv) ? Math.max(1, Math.trunc(realmLv)) : 1;
  const difficulty = clampRange(
    Number(expDifficulty ?? 1),
    TECHNIQUE_INTERNAL_EXP_DIFFICULTY_RANGE[0],
    TECHNIQUE_INTERNAL_EXP_DIFFICULTY_RANGE[1],
  );

  const totalExp = calcInternalTechniqueTotalExp(grade, normalizedRealmLv, resolvedMaxLayer, difficulty, category);

  const g = getTechniqueGradeIndex(grade);
  const expBaseRaw = g * g * (normalizedRealmLv + 5);
  const catFactor = TECHNIQUE_CATEGORY_EXP_FACTOR[category] ?? 1;
  const K = TECHNIQUE_INTERNAL_K;
  const stageWeight = TECHNIQUE_INTERNAL_STAGE_WEIGHT;

  const rawPerLayer: number[] = [];
  let rawTotal = 0;
  for (let level = 1; level <= resolvedMaxLayer; level += 1) {
    const stageIdx = resolveTechniqueStageIndex(level, stageLayers);
    const stageStep = stageWeight[stageIdx];
    const raw = expBaseRaw * catFactor * (K ** (level - 1)) * stageStep * difficulty;
    rawPerLayer.push(raw);
    rawTotal += raw;
  }
  const normFactor = rawTotal > 0 ? totalExp / rawTotal : 0;

  const perLayerExp: number[] = [];
  for (let level = 1; level <= resolvedMaxLayer; level += 1) {
    if (level === resolvedMaxLayer) {
      perLayerExp.push(0);
    } else {
      perLayerExp.push(Math.max(1, Math.round(rawPerLayer[level - 1] * normFactor)));
    }
  }

  return { perLayerExp, totalExp, stageLayers };
}

/**
 * `calcInternalTechniqueTotalExp` 的通用别名，便于 tooling / 非内功调用方表达意图。
 */
export function calcTechniqueTotalExp(
  grade: TechniqueGrade,
  realmLv: number,
  maxLayer: number,
  expDifficulty = 1,
  category: TechniqueCategory = 'internal',
): number {
  return calcInternalTechniqueTotalExp(grade, realmLv, maxLayer, expDifficulty, category);
}
