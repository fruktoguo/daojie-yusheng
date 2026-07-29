/**
 * 术法权重反推器。
 *
 * 该模块只在冷路径工具中使用，所有候选都交给正式 GM 功法展开器计算，
 * 不复制冷却、范围、伤害或预算换算规则，也不会读写数据库。
 */
import type {
  GmCustomArtsTechniqueInput,
  SkillFormula,
  TechniqueArtsStrengthPercentBonusKey,
} from '@mud/shared';
import { TECHNIQUE_ARTS_STRENGTH_PERCENT_BONUS_KEYS } from '@mud/shared';

import { buildGmCustomTechnique } from '../../runtime/technique-generation/gm-custom-technique-builder';

const STRUCTURE_WEIGHT_NAMES = [
  'damage',
  'cost',
  'cooldown',
  'chant',
  'castRange',
  'area',
] as const;
const STRUCTURE_WEIGHT_NAME_SET = new Set<string>(STRUCTURE_WEIGHT_NAMES);
const PERCENT_WEIGHT_NAME_SET = new Set<string>(TECHNIQUE_ARTS_STRENGTH_PERCENT_BONUS_KEYS);
const TARGET_METRICS = [
  'cooldown',
  'radius',
  'maxTargets',
  'range',
  'cost',
  'spellAtkScale',
  'formulaBudget',
  'referenceFormulaValue',
] as const;
const TARGET_METRIC_SET = new Set<string>(TARGET_METRICS);
const TARGET_OPERATORS = new Set(['eq', 'lte', 'gte']);
const OBJECTIVES = new Set([
  'minWeightDelta',
  'maxSpellAtkScale',
  'maxFormulaBudget',
  'maxReferenceFormulaValue',
]);
const SEARCH_MODES = new Set(['auto', 'exhaustive', 'adaptive']);
const HALTON_PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37] as const;

type StructureWeightName = typeof STRUCTURE_WEIGHT_NAMES[number];
export type TechniqueArtsSolverWeightKey =
  | `structure.${StructureWeightName}`
  | `percent.${TechniqueArtsStrengthPercentBonusKey}`;
export type TechniqueArtsSolverMetric = typeof TARGET_METRICS[number];
export type TechniqueArtsSolverTargetOperator = 'eq' | 'lte' | 'gte';
export type TechniqueArtsSolverObjective =
  | 'minWeightDelta'
  | 'maxSpellAtkScale'
  | 'maxFormulaBudget'
  | 'maxReferenceFormulaValue';
export type TechniqueArtsSolverSearchMode = 'auto' | 'exhaustive' | 'adaptive';

export interface TechniqueArtsSolverVariableInput {
  id: string;
  keys: TechniqueArtsSolverWeightKey[];
  min: number;
  max: number;
  step: number;
}

export interface TechniqueArtsSolverTargetInput {
  metric: TechniqueArtsSolverMetric;
  value: number;
  operator?: TechniqueArtsSolverTargetOperator;
  tolerance?: number;
}

export interface TechniqueArtsSolverSearchInput {
  mode?: TechniqueArtsSolverSearchMode;
  maxEvaluations?: number;
  sampleCount?: number;
  beamWidth?: number;
  top?: number;
}

export interface TechniqueArtsWeightSolverInput {
  technique: GmCustomArtsTechniqueInput;
  targets: TechniqueArtsSolverTargetInput[];
  variables: TechniqueArtsSolverVariableInput[];
  objective?: TechniqueArtsSolverObjective;
  referenceFormulaVars?: Record<string, number>;
  search?: TechniqueArtsSolverSearchInput;
}

export interface TechniqueArtsSolverMetrics {
  cooldown: number;
  radius: number;
  maxTargets: number;
  range: number;
  cost: number;
  spellAtkScale: number;
  formulaBudget: number;
  referenceFormulaValue?: number;
}

export interface TechniqueArtsSolverTargetResult extends TechniqueArtsSolverTargetInput {
  operator: TechniqueArtsSolverTargetOperator;
  tolerance: number;
  actual: number;
  matched: boolean;
  normalizedDistance: number;
}

export interface TechniqueArtsSolverSolution {
  rank: number;
  exact: boolean;
  groupValues: Record<string, number>;
  weightChanges: Partial<Record<TechniqueArtsSolverWeightKey, { before: number; after: number }>>;
  weightDelta: number;
  objectiveValue: number;
  metrics: TechniqueArtsSolverMetrics;
  targets: TechniqueArtsSolverTargetResult[];
  formula: SkillFormula | null;
  budgetBreakdown: unknown;
}

export interface TechniqueArtsWeightSolverSuccess {
  ok: true;
  exactMatchFound: boolean;
  request: {
    objective: TechniqueArtsSolverObjective;
    targets: TechniqueArtsSolverTargetInput[];
    variables: TechniqueArtsSolverVariableInput[];
  };
  search: {
    requestedMode: TechniqueArtsSolverSearchMode;
    usedMode: Exclude<TechniqueArtsSolverSearchMode, 'auto'>;
    exhaustive: boolean;
    totalCombinations: number;
    evaluatedCandidates: number;
    evaluatedExactMatches: number;
    maxEvaluations: number;
    truncated: boolean;
  };
  base: {
    metrics: TechniqueArtsSolverMetrics;
    targets: TechniqueArtsSolverTargetResult[];
  };
  solutions: TechniqueArtsSolverSolution[];
  nearest: TechniqueArtsSolverSolution[];
  recommendedTechnique: GmCustomArtsTechniqueInput;
}

export interface TechniqueArtsWeightSolverFailure {
  ok: false;
  errors: string[];
}

export type TechniqueArtsWeightSolverResult =
  | TechniqueArtsWeightSolverSuccess
  | TechniqueArtsWeightSolverFailure;

interface NormalizedVariable extends TechniqueArtsSolverVariableInput {
  values: number[];
}

interface NormalizedSolverRequest {
  technique: GmCustomArtsTechniqueInput;
  targets: Array<Required<Omit<TechniqueArtsSolverTargetInput, 'metric' | 'value'>> & {
    metric: TechniqueArtsSolverMetric;
    value: number;
  }>;
  variables: NormalizedVariable[];
  objective: TechniqueArtsSolverObjective;
  referenceFormulaVars: Record<string, number>;
  search: Required<TechniqueArtsSolverSearchInput>;
  totalCombinations: number;
}

interface EvaluatedCandidate {
  signature: string;
  values: number[];
  metrics: TechniqueArtsSolverMetrics;
  targetResults: TechniqueArtsSolverTargetResult[];
  targetViolationCount: number;
  targetDistance: number;
  weightDelta: number;
  objectiveValue: number;
}

interface CandidateTracker {
  exactCount: number;
  exactTop: EvaluatedCandidate[];
  nearestTop: EvaluatedCandidate[];
}

export function solveTechniqueArtsWeights(rawInput: unknown): TechniqueArtsWeightSolverResult {
  const normalized = normalizeSolverRequest(rawInput);
  if (normalized.ok === false) {
    return normalized;
  }
  const request = normalized.request;
  const baseBuild = buildCandidate(request.technique, request.referenceFormulaVars);
  if (!baseBuild) {
    return { ok: false, errors: ['基础功法无法通过正式展开器构建'] };
  }
  const baseTargets = evaluateTargets(baseBuild.metrics, request.targets);
  const maxEvaluations = request.search.maxEvaluations;
  const requestedMode = request.search.mode;
  const usedMode = requestedMode === 'auto'
    ? request.totalCombinations <= maxEvaluations ? 'exhaustive' : 'adaptive'
    : requestedMode;
  if (usedMode === 'exhaustive' && request.totalCombinations > maxEvaluations) {
    return {
      ok: false,
      errors: [
        `穷举组合数 ${request.totalCombinations} 超过 maxEvaluations=${maxEvaluations}，请增大步长、绑定变量或改用 adaptive`,
      ],
    };
  }

  const tracker: CandidateTracker = { exactCount: 0, exactTop: [], nearestTop: [] };
  const evaluated = new Map<string, EvaluatedCandidate>();
  let truncated = false;
  const evaluate = (values: number[]): EvaluatedCandidate | null => {
    const normalizedValues = values.map((value, index) => snapVariableValue(request.variables[index], value));
    const signature = normalizedValues.map(formatNumber).join('|');
    const cached = evaluated.get(signature);
    if (cached) return cached;
    if (evaluated.size >= maxEvaluations) {
      truncated = true;
      return null;
    }
    const technique = applyVariableValues(request.technique, request.variables, normalizedValues);
    const built = buildCandidate(technique, request.referenceFormulaVars);
    if (!built) return null;
    const targetResults = evaluateTargets(built.metrics, request.targets);
    const candidate: EvaluatedCandidate = {
      signature,
      values: normalizedValues,
      metrics: built.metrics,
      targetResults,
      targetViolationCount: targetResults.reduce((sum, target) => sum + (target.matched ? 0 : 1), 0),
      targetDistance: roundTo(targetResults.reduce((sum, target) => sum + target.normalizedDistance, 0), 9),
      weightDelta: calculateWeightDelta(request.technique, request.variables, normalizedValues),
      objectiveValue: resolveObjectiveValue(request.objective, built.metrics),
    };
    evaluated.set(signature, candidate);
    trackCandidate(tracker, candidate, request.objective, request.search.top);
    return candidate;
  };

  if (usedMode === 'exhaustive') {
    enumerateCartesian(request.variables, 0, [], evaluate);
  } else {
    runAdaptiveSearch(request, evaluate, evaluated);
  }

  const exactCandidates = [...tracker.exactTop].sort((left, right) => (
    compareCandidates(left, right, request.objective)
  ));
  const nearestCandidates = [...tracker.nearestTop].sort((left, right) => (
    compareCandidates(left, right, request.objective)
  ));
  const selected = exactCandidates.length > 0 ? exactCandidates : nearestCandidates;
  if (selected.length <= 0) {
    return { ok: false, errors: ['没有生成任何有效候选，请检查变量范围与正式功法输入'] };
  }
  const solutions = exactCandidates.map((candidate, index) => (
    materializeSolution(request, candidate, index + 1)
  ));
  const nearest = exactCandidates.length > 0
    ? nearestCandidates.filter((candidate) => candidate.targetViolationCount > 0).map((candidate, index) => (
      materializeSolution(request, candidate, index + 1)
    ))
    : nearestCandidates.map((candidate, index) => materializeSolution(request, candidate, index + 1));
  const recommendedTechnique = applyVariableValues(request.technique, request.variables, selected[0].values);

  return {
    ok: true,
    exactMatchFound: exactCandidates.length > 0,
    request: {
      objective: request.objective,
      targets: request.targets,
      variables: request.variables.map(({ values: _values, ...variable }) => variable),
    },
    search: {
      requestedMode,
      usedMode,
      exhaustive: usedMode === 'exhaustive',
      totalCombinations: request.totalCombinations,
      evaluatedCandidates: evaluated.size,
      evaluatedExactMatches: tracker.exactCount,
      maxEvaluations,
      truncated,
    },
    base: {
      metrics: baseBuild.metrics,
      targets: baseTargets,
    },
    solutions,
    nearest,
    recommendedTechnique,
  };
}

function normalizeSolverRequest(rawInput: unknown):
  | { ok: true; request: NormalizedSolverRequest }
  | TechniqueArtsWeightSolverFailure {
  const errors: string[] = [];
  const source = asRecord(rawInput);
  if (!source) {
    return { ok: false, errors: ['请求必须是 JSON 对象'] };
  }
  const baseBuild = buildGmCustomTechnique(source.technique, 'solver_base');
  if (baseBuild.ok === false) {
    return {
      ok: false,
      errors: baseBuild.errors.map((entry) => `${entry.field}: ${entry.message}`),
    };
  }
  if (baseBuild.normalizedInput.category !== 'arts') {
    return { ok: false, errors: ['反推器只接受 category=arts 的 GM 手工术法输入'] };
  }
  const technique = baseBuild.normalizedInput;
  const targets = normalizeTargets(source.targets, errors);
  const variables = normalizeVariables(source.variables, errors);
  const objective = source.objective === undefined
    ? 'minWeightDelta'
    : typeof source.objective === 'string' && OBJECTIVES.has(source.objective)
      ? source.objective as TechniqueArtsSolverObjective
      : null;
  if (!objective) errors.push('objective 不受支持');
  const referenceFormulaVars = normalizeReferenceFormulaVars(source.referenceFormulaVars, errors);
  if (objective === 'maxReferenceFormulaValue' && Object.keys(referenceFormulaVars).length <= 0) {
    errors.push('objective=maxReferenceFormulaValue 时必须提供 referenceFormulaVars');
  }
  if (targets.some((target) => target.metric === 'referenceFormulaValue') && Object.keys(referenceFormulaVars).length <= 0) {
    errors.push('target.metric=referenceFormulaValue 时必须提供 referenceFormulaVars');
  }
  const search = normalizeSearch(source.search, errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const totalCombinations = variables.reduce((product, variable) => {
    if (!Number.isSafeInteger(product) || product > Number.MAX_SAFE_INTEGER / variable.values.length) {
      return Number.MAX_SAFE_INTEGER;
    }
    return product * variable.values.length;
  }, 1);
  return {
    ok: true,
    request: {
      technique,
      targets,
      variables,
      objective: objective ?? 'minWeightDelta',
      referenceFormulaVars,
      search,
      totalCombinations,
    },
  };
}

function normalizeTargets(raw: unknown, errors: string[]): NormalizedSolverRequest['targets'] {
  if (!Array.isArray(raw) || raw.length <= 0) {
    errors.push('targets 必须是至少包含一项的数组');
    return [];
  }
  return raw.flatMap((entry, index) => {
    const source = asRecord(entry);
    if (!source) {
      errors.push(`targets[${index}] 必须是对象`);
      return [];
    }
    const metric = typeof source.metric === 'string' && TARGET_METRIC_SET.has(source.metric)
      ? source.metric as TechniqueArtsSolverMetric
      : null;
    const value = readFiniteNumber(source.value);
    const operator = source.operator === undefined
      ? 'eq'
      : typeof source.operator === 'string' && TARGET_OPERATORS.has(source.operator)
        ? source.operator as TechniqueArtsSolverTargetOperator
        : null;
    const tolerance = source.tolerance === undefined ? 0 : readFiniteNumber(source.tolerance);
    if (!metric) errors.push(`targets[${index}].metric 不受支持`);
    if (value === null) errors.push(`targets[${index}].value 必须是有限数字`);
    if (!operator) errors.push(`targets[${index}].operator 仅允许 eq/lte/gte`);
    if (tolerance === null || tolerance < 0) errors.push(`targets[${index}].tolerance 必须是非负有限数字`);
    if (!metric || value === null || !operator || tolerance === null || tolerance < 0) return [];
    return [{ metric, value, operator, tolerance }];
  });
}

function normalizeVariables(raw: unknown, errors: string[]): NormalizedVariable[] {
  if (!Array.isArray(raw) || raw.length <= 0) {
    errors.push('variables 必须是至少包含一项的数组');
    return [];
  }
  if (raw.length > HALTON_PRIMES.length) {
    errors.push(`variables 最多支持 ${HALTON_PRIMES.length} 组`);
    return [];
  }
  const ids = new Set<string>();
  const claimedKeys = new Set<string>();
  return raw.flatMap((entry, index) => {
    const source = asRecord(entry);
    if (!source) {
      errors.push(`variables[${index}] 必须是对象`);
      return [];
    }
    const id = typeof source.id === 'string' ? source.id.trim() : '';
    if (!id || !/^[A-Za-z0-9._:-]{1,64}$/.test(id)) {
      errors.push(`variables[${index}].id 必须是 1-64 位安全标识`);
    } else if (ids.has(id)) {
      errors.push(`variables[${index}].id 重复: ${id}`);
    } else {
      ids.add(id);
    }
    const keys = Array.isArray(source.keys)
      ? source.keys.filter((key): key is TechniqueArtsSolverWeightKey => typeof key === 'string' && isWeightKey(key))
      : [];
    if (!Array.isArray(source.keys) || source.keys.length <= 0 || keys.length !== source.keys.length) {
      errors.push(`variables[${index}].keys 包含不支持的权重键`);
    }
    for (const key of keys) {
      if (claimedKeys.has(key)) errors.push(`权重键不能被多个变量组重复控制: ${key}`);
      claimedKeys.add(key);
    }
    const min = readFiniteNumber(source.min);
    const max = readFiniteNumber(source.max);
    const step = readFiniteNumber(source.step);
    if (min === null || max === null || step === null || step <= 0 || min > max) {
      errors.push(`variables[${index}] 的 min/max/step 无效`);
      return [];
    }
    for (const key of keys) {
      const range = getWeightRange(key);
      if (min < range.min || max > range.max) {
        errors.push(`variables[${index}] 超出 ${key} 的合法范围 ${range.min}..${range.max}`);
      }
    }
    const values = buildVariableValues(min, max, step);
    if (values.length > 2001) {
      errors.push(`variables[${index}] 候选值超过 2001 个，请增大 step`);
    }
    if (!id || keys.length <= 0) return [];
    return [{ id, keys, min, max, step, values }];
  });
}

function normalizeReferenceFormulaVars(raw: unknown, errors: string[]): Record<string, number> {
  if (raw === undefined) return {};
  const source = asRecord(raw);
  if (!source) {
    errors.push('referenceFormulaVars 必须是对象');
    return {};
  }
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = key.trim();
    const numeric = readFiniteNumber(value);
    if (!normalizedKey || numeric === null) {
      errors.push(`referenceFormulaVars.${key} 必须是有限数字`);
      continue;
    }
    result[normalizedKey] = numeric;
  }
  return result;
}

function normalizeSearch(raw: unknown, errors: string[]): Required<TechniqueArtsSolverSearchInput> {
  const source = raw === undefined ? {} : asRecord(raw);
  if (!source) errors.push('search 必须是对象');
  const mode = !source || source.mode === undefined
    ? 'auto'
    : typeof source.mode === 'string' && SEARCH_MODES.has(source.mode)
      ? source.mode as TechniqueArtsSolverSearchMode
      : null;
  if (!mode) errors.push('search.mode 仅允许 auto/exhaustive/adaptive');
  const maxEvaluations = normalizeIntegerOption(source?.maxEvaluations, 100_000, 100, 2_000_000, 'search.maxEvaluations', errors);
  const sampleCount = normalizeIntegerOption(source?.sampleCount, 4096, 32, 100_000, 'search.sampleCount', errors);
  const beamWidth = normalizeIntegerOption(source?.beamWidth, 64, 4, 512, 'search.beamWidth', errors);
  const top = normalizeIntegerOption(source?.top, 5, 1, 50, 'search.top', errors);
  return { mode: mode ?? 'auto', maxEvaluations, sampleCount, beamWidth, top };
}

function normalizeIntegerOption(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  label: string,
  errors: string[],
): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    errors.push(`${label} 必须是 ${min}..${max} 的整数`);
    return fallback;
  }
  return value;
}

function enumerateCartesian(
  variables: NormalizedVariable[],
  index: number,
  values: number[],
  evaluate: (values: number[]) => EvaluatedCandidate | null,
): void {
  if (index >= variables.length) {
    evaluate(values);
    return;
  }
  for (const value of variables[index].values) {
    values[index] = value;
    enumerateCartesian(variables, index + 1, values, evaluate);
  }
}

function runAdaptiveSearch(
  request: NormalizedSolverRequest,
  evaluate: (values: number[]) => EvaluatedCandidate | null,
  evaluated: Map<string, EvaluatedCandidate>,
): void {
  const baseValues = request.variables.map((variable) => {
    const average = variable.keys.reduce((sum, key) => sum + readWeight(request.technique, key), 0) / variable.keys.length;
    return snapVariableValue(variable, average);
  });
  evaluate(baseValues);
  evaluate(request.variables.map((variable) => variable.min));
  evaluate(request.variables.map((variable) => variable.max));
  for (let index = 0; index < request.variables.length; index += 1) {
    for (const value of [request.variables[index].min, midpoint(request.variables[index]), request.variables[index].max]) {
      const candidate = [...baseValues];
      candidate[index] = value;
      evaluate(candidate);
    }
  }
  const seedGrid = request.variables.map((variable, index) => buildAdaptiveSeedValues(variable, baseValues[index]));
  const seedCombinationCount = seedGrid.reduce((product, values) => product * values.length, 1);
  if (seedCombinationCount <= 5000) {
    enumerateValueGrid(seedGrid, 0, [], evaluate);
  } else {
    const boundedSamples = Math.min(2000, request.search.sampleCount);
    for (let sample = 1; sample <= boundedSamples; sample += 1) {
      evaluate(seedGrid.map((values, index) => (
        values[Math.min(values.length - 1, Math.floor(halton(sample, HALTON_PRIMES[index]) * values.length))]
      )));
    }
  }
  for (let sample = 1; sample <= request.search.sampleCount; sample += 1) {
    const values = request.variables.map((variable, index) => {
      const ratio = halton(sample, HALTON_PRIMES[index]);
      return snapVariableValue(variable, variable.min + (variable.max - variable.min) * ratio);
    });
    if (!evaluate(values) && evaluated.size >= request.search.maxEvaluations) break;
  }

  const factors = [0.25, 0.1, 0.05, 0.02, 0.01, 0] as const;
  for (const factor of factors) {
    const deltas = request.variables.map((variable) => {
      const raw = factor <= 0 ? variable.step : Math.max(variable.step, (variable.max - variable.min) * factor);
      return Math.max(variable.step, roundTo(Math.ceil(raw / variable.step) * variable.step, 6));
    });
    for (let pass = 0; pass < 3; pass += 1) {
      const before = evaluated.size;
      const beam = [...evaluated.values()]
        .sort((left, right) => compareCandidates(left, right, request.objective))
        .slice(0, request.search.beamWidth);
      for (const origin of beam) {
        for (let variableIndex = 0; variableIndex < request.variables.length; variableIndex += 1) {
          for (const multiplier of [-2, -1, 1, 2]) {
            const values = [...origin.values];
            values[variableIndex] += deltas[variableIndex] * multiplier;
            evaluate(values);
          }
        }
      }
      const pairOrigins = beam.slice(0, Math.min(12, beam.length));
      for (const origin of pairOrigins) {
        for (let left = 0; left < request.variables.length; left += 1) {
          for (let right = left + 1; right < request.variables.length; right += 1) {
            for (const leftDirection of [-1, 1]) {
              for (const rightDirection of [-1, 1]) {
                const values = [...origin.values];
                values[left] += deltas[left] * leftDirection;
                values[right] += deltas[right] * rightDirection;
                evaluate(values);
              }
            }
          }
        }
      }
      if (evaluated.size === before || evaluated.size >= request.search.maxEvaluations) break;
    }
    if (evaluated.size >= request.search.maxEvaluations) break;
  }
}

function buildAdaptiveSeedValues(variable: NormalizedVariable, baseValue: number): number[] {
  const midpointValue = midpoint(variable);
  const anchors = [
    variable.min,
    variable.max,
    baseValue,
    midpointValue,
    midpointValue - variable.step,
    midpointValue + variable.step,
    variable.min + (variable.max - variable.min) * 0.25,
    variable.min + (variable.max - variable.min) * 0.75,
    0,
    1,
    5,
    10,
  ];
  return [...new Set(anchors.map((value) => snapVariableValue(variable, value)).map(formatNumber))]
    .map(Number)
    .sort((left, right) => left - right);
}

function enumerateValueGrid(
  grid: number[][],
  index: number,
  values: number[],
  evaluate: (values: number[]) => EvaluatedCandidate | null,
): void {
  if (index >= grid.length) {
    evaluate(values);
    return;
  }
  for (const value of grid[index]) {
    values[index] = value;
    enumerateValueGrid(grid, index + 1, values, evaluate);
  }
}

function buildCandidate(
  technique: GmCustomArtsTechniqueInput,
  referenceFormulaVars: Record<string, number>,
): { metrics: TechniqueArtsSolverMetrics; formula: SkillFormula | null; budgetBreakdown: unknown } | null {
  const built = buildGmCustomTechnique(technique, 'solver_preview');
  if (built.ok === false) return null;
  const skill = built.template.skills[0];
  const targeting = skill.targeting;
  const formula = extractPrimaryFormula(skill.effects);
  const metrics: TechniqueArtsSolverMetrics = {
    cooldown: Number(skill.cooldown) || 0,
    radius: Number(targeting?.radius) || 0,
    maxTargets: Number(targeting?.maxTargets) || 0,
    range: Number(skill.range) || 0,
    cost: Number(skill.cost) || 0,
    spellAtkScale: formula ? roundTo(findFormulaVarScale(formula, 'caster.stat.spellAtk'), 9) : 0,
    formulaBudget: roundTo(readFormulaBudget(built.validationReport), 9),
    ...(formula && Object.keys(referenceFormulaVars).length > 0
      ? { referenceFormulaValue: roundTo(evaluateFormula(formula, referenceFormulaVars), 9) }
      : {}),
  };
  return {
    metrics,
    formula,
    budgetBreakdown: readBudgetBreakdown(built.validationReport),
  };
}

function materializeSolution(
  request: NormalizedSolverRequest,
  candidate: EvaluatedCandidate,
  rank: number,
): TechniqueArtsSolverSolution {
  const technique = applyVariableValues(request.technique, request.variables, candidate.values);
  const built = buildCandidate(technique, request.referenceFormulaVars);
  if (!built) throw new Error(`候选 ${candidate.signature} 在结果物化阶段构建失败`);
  const groupValues: Record<string, number> = {};
  const weightChanges: TechniqueArtsSolverSolution['weightChanges'] = {};
  request.variables.forEach((variable, index) => {
    const value = candidate.values[index];
    groupValues[variable.id] = value;
    for (const key of variable.keys) {
      const before = readWeight(request.technique, key);
      if (Math.abs(before - value) > 1e-9) {
        weightChanges[key] = { before, after: value };
      }
    }
  });
  return {
    rank,
    exact: candidate.targetViolationCount === 0,
    groupValues,
    weightChanges,
    weightDelta: candidate.weightDelta,
    objectiveValue: candidate.objectiveValue,
    metrics: built.metrics,
    targets: evaluateTargets(built.metrics, request.targets),
    formula: built.formula,
    budgetBreakdown: built.budgetBreakdown,
  };
}

function evaluateTargets(
  metrics: TechniqueArtsSolverMetrics,
  targets: NormalizedSolverRequest['targets'],
): TechniqueArtsSolverTargetResult[] {
  return targets.map((target) => {
    const actual = metrics[target.metric];
    const numericActual = typeof actual === 'number' && Number.isFinite(actual) ? actual : 0;
    const difference = numericActual - target.value;
    let matched = false;
    let miss = 0;
    if (target.operator === 'lte') {
      matched = numericActual <= target.value + target.tolerance;
      miss = Math.max(0, difference - target.tolerance);
    } else if (target.operator === 'gte') {
      matched = numericActual >= target.value - target.tolerance;
      miss = Math.max(0, -difference - target.tolerance);
    } else {
      matched = Math.abs(difference) <= target.tolerance;
      miss = Math.max(0, Math.abs(difference) - target.tolerance);
    }
    return {
      ...target,
      actual: numericActual,
      matched,
      normalizedDistance: roundTo(miss / Math.max(1, Math.abs(target.value)), 9),
    };
  });
}

function trackCandidate(
  tracker: CandidateTracker,
  candidate: EvaluatedCandidate,
  objective: TechniqueArtsSolverObjective,
  top: number,
): void {
  if (candidate.targetViolationCount === 0) {
    tracker.exactCount += 1;
    insertRanked(tracker.exactTop, candidate, objective, top);
    return;
  }
  insertRanked(tracker.nearestTop, candidate, objective, top);
}

function insertRanked(
  list: EvaluatedCandidate[],
  candidate: EvaluatedCandidate,
  objective: TechniqueArtsSolverObjective,
  limit: number,
): void {
  list.push(candidate);
  list.sort((left, right) => compareCandidates(left, right, objective));
  if (list.length > limit) list.length = limit;
}

function compareCandidates(
  left: EvaluatedCandidate,
  right: EvaluatedCandidate,
  objective: TechniqueArtsSolverObjective,
): number {
  if (left.targetViolationCount !== right.targetViolationCount) {
    return left.targetViolationCount - right.targetViolationCount;
  }
  if (Math.abs(left.targetDistance - right.targetDistance) > 1e-12) {
    return left.targetDistance - right.targetDistance;
  }
  if (objective === 'minWeightDelta') {
    if (Math.abs(left.weightDelta - right.weightDelta) > 1e-12) {
      return left.weightDelta - right.weightDelta;
    }
  } else if (Math.abs(left.objectiveValue - right.objectiveValue) > 1e-12) {
    return right.objectiveValue - left.objectiveValue;
  }
  if (Math.abs(left.weightDelta - right.weightDelta) > 1e-12) {
    return left.weightDelta - right.weightDelta;
  }
  return left.signature.localeCompare(right.signature);
}

function resolveObjectiveValue(
  objective: TechniqueArtsSolverObjective,
  metrics: TechniqueArtsSolverMetrics,
): number {
  if (objective === 'maxSpellAtkScale') return metrics.spellAtkScale;
  if (objective === 'maxFormulaBudget') return metrics.formulaBudget;
  if (objective === 'maxReferenceFormulaValue') return metrics.referenceFormulaValue ?? 0;
  return 0;
}

function calculateWeightDelta(
  technique: GmCustomArtsTechniqueInput,
  variables: NormalizedVariable[],
  values: number[],
): number {
  return roundTo(variables.reduce((sum, variable, index) => (
    sum + variable.keys.reduce((groupSum, key) => groupSum + Math.abs(readWeight(technique, key) - values[index]), 0)
  ), 0), 9);
}

function applyVariableValues(
  source: GmCustomArtsTechniqueInput,
  variables: NormalizedVariable[],
  values: number[],
): GmCustomArtsTechniqueInput {
  const skill = source.skills[0];
  const technique: GmCustomArtsTechniqueInput = {
    ...source,
    skills: [{
      ...skill,
      target: { ...skill.target },
      structureStrength: { ...skill.structureStrength },
      formulaStrength: {
        ...skill.formulaStrength,
        attributeBases: { ...skill.formulaStrength.attributeBases },
        percentBonuses: { ...(skill.formulaStrength.percentBonuses ?? {}) },
      },
    }],
  };
  variables.forEach((variable, index) => {
    for (const key of variable.keys) writeWeight(technique, key, values[index]);
  });
  return technique;
}

function readWeight(technique: GmCustomArtsTechniqueInput, key: TechniqueArtsSolverWeightKey): number {
  const [scope, name] = key.split('.', 2);
  if (scope === 'structure') {
    return Number(technique.skills[0].structureStrength[name as StructureWeightName]) || 0;
  }
  return Number(technique.skills[0].formulaStrength.percentBonuses?.[name as TechniqueArtsStrengthPercentBonusKey]) || 0;
}

function writeWeight(
  technique: GmCustomArtsTechniqueInput,
  key: TechniqueArtsSolverWeightKey,
  value: number,
): void {
  const [scope, name] = key.split('.', 2);
  if (scope === 'structure') {
    technique.skills[0].structureStrength[name as StructureWeightName] = value;
    return;
  }
  const percentBonuses = technique.skills[0].formulaStrength.percentBonuses ?? {};
  percentBonuses[name as TechniqueArtsStrengthPercentBonusKey] = value;
  technique.skills[0].formulaStrength.percentBonuses = percentBonuses;
}

function isWeightKey(value: string): value is TechniqueArtsSolverWeightKey {
  const [scope, name, extra] = value.split('.');
  if (extra !== undefined || !scope || !name) return false;
  if (scope === 'structure') return STRUCTURE_WEIGHT_NAME_SET.has(name);
  if (scope === 'percent') return PERCENT_WEIGHT_NAME_SET.has(name);
  return false;
}

function getWeightRange(key: TechniqueArtsSolverWeightKey): { min: number; max: number } {
  return key.startsWith('structure.') ? { min: -100, max: 100 } : { min: 0, max: 100 };
}

function buildVariableValues(min: number, max: number, step: number): number[] {
  const values: number[] = [];
  const count = Math.floor((max - min) / step + 1e-9);
  for (let index = 0; index <= count; index += 1) {
    values.push(roundTo(min + index * step, 6));
  }
  if (values.length <= 0 || Math.abs(values[values.length - 1] - max) > 1e-9) {
    values.push(roundTo(max, 6));
  }
  return values;
}

function snapVariableValue(variable: NormalizedVariable, value: number): number {
  const clamped = Math.min(variable.max, Math.max(variable.min, Number.isFinite(value) ? value : variable.min));
  const steps = Math.round((clamped - variable.min) / variable.step);
  return roundTo(Math.min(variable.max, Math.max(variable.min, variable.min + steps * variable.step)), 6);
}

function midpoint(variable: NormalizedVariable): number {
  return snapVariableValue(variable, (variable.min + variable.max) / 2);
}

function halton(index: number, base: number): number {
  let result = 0;
  let fraction = 1 / base;
  let remaining = index;
  while (remaining > 0) {
    result += fraction * (remaining % base);
    remaining = Math.floor(remaining / base);
    fraction /= base;
  }
  return result;
}

function extractPrimaryFormula(effects: unknown): SkillFormula | null {
  if (!Array.isArray(effects)) return null;
  for (const effect of effects) {
    const source = asRecord(effect);
    if (source && isSkillFormula(source.formula)) return source.formula;
  }
  return null;
}

function findFormulaVarScale(formula: SkillFormula, variable: string): number {
  if (typeof formula === 'number') return 0;
  if ('var' in formula) return formula.var === variable ? Number(formula.scale ?? 1) : 0;
  if (formula.op === 'clamp') {
    return findFormulaVarScale(formula.value, variable)
      + (formula.min === undefined ? 0 : findFormulaVarScale(formula.min, variable))
      + (formula.max === undefined ? 0 : findFormulaVarScale(formula.max, variable));
  }
  return formula.args.reduce<number>((sum, entry) => sum + findFormulaVarScale(entry, variable), 0);
}

function evaluateFormula(formula: SkillFormula, variables: Record<string, number>): number {
  if (typeof formula === 'number') return formula;
  if ('var' in formula) return (variables[formula.var] ?? 0) * Number(formula.scale ?? 1);
  if (formula.op === 'clamp') {
    const value = evaluateFormula(formula.value, variables);
    const min = formula.min === undefined ? Number.NEGATIVE_INFINITY : evaluateFormula(formula.min, variables);
    const max = formula.max === undefined ? Number.POSITIVE_INFINITY : evaluateFormula(formula.max, variables);
    return Math.min(max, Math.max(min, value));
  }
  const args = formula.args.map((entry) => evaluateFormula(entry, variables));
  if (formula.op === 'add') return args.reduce((sum, value) => sum + value, 0);
  if (formula.op === 'mul') return args.reduce((product, value) => product * value, 1);
  if (formula.op === 'sub') return args.slice(1).reduce((value, entry) => value - entry, args[0] ?? 0);
  if (formula.op === 'div') {
    return args.slice(1).reduce((value, entry) => entry === 0 ? value : value / entry, args[0] ?? 0);
  }
  if (formula.op === 'min') return args.length > 0 ? Math.min(...args) : 0;
  if (formula.op === 'max') return args.length > 0 ? Math.max(...args) : 0;
  return 0;
}

function isSkillFormula(value: unknown): value is SkillFormula {
  if (typeof value === 'number') return Number.isFinite(value);
  const source = asRecord(value);
  if (!source) return false;
  if (typeof source.var === 'string') {
    return source.scale === undefined || (typeof source.scale === 'number' && Number.isFinite(source.scale));
  }
  if (source.op === 'clamp') {
    return isSkillFormula(source.value)
      && (source.min === undefined || isSkillFormula(source.min))
      && (source.max === undefined || isSkillFormula(source.max));
  }
  return typeof source.op === 'string'
    && ['add', 'sub', 'mul', 'div', 'min', 'max'].includes(source.op)
    && Array.isArray(source.args)
    && source.args.every(isSkillFormula);
}

function readFormulaBudget(validationReport: Record<string, unknown>): number {
  const artsStrength = asRecord(validationReport.artsStrength);
  const expansion = Array.isArray(artsStrength?.expansion) ? artsStrength.expansion : [];
  const first = asRecord(expansion[0]);
  return Number(first?.targetBudget) || 0;
}

function readBudgetBreakdown(validationReport: Record<string, unknown>): unknown {
  const artsStrength = asRecord(validationReport.artsStrength);
  const expansion = Array.isArray(artsStrength?.expansion) ? artsStrength.expansion : [];
  return asRecord(expansion[0])?.budgetBreakdown ?? null;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}
