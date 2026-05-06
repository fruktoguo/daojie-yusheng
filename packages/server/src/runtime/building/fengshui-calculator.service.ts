import {
  FENGSHUI_BASE_SCORE,
  FENGSHUI_CONTROLS,
  FENGSHUI_DEFAULT_FUNCTION_ELEMENT_BY_ROOM_ROLE,
  FENGSHUI_ELEMENT_INDEX,
  FENGSHUI_ELEMENT_KEYS,
  FENGSHUI_GENERATES,
  FENGSHUI_GRADE_THRESHOLDS,
  FENGSHUI_SCORE_MAX,
  FENGSHUI_SCORE_MIN,
  type CompiledBuildingCatalog,
  type FengShuiReason,
  type FengShuiReasonSeverity,
  type FengShuiSnapshot,
  type FiveElement,
  type RoomInstance,
  type RoomRole,
} from '@mud/shared';

export interface RoomAggregate {
  roomId: string;
  area: number;
  perimeter: number;
  doorCount: number;
  windowCount: number;
  roofCoverage: number;
  elementVector: Int32Array;
  traitCounts: Map<number, number>;
  traitKeys?: Set<string>;
  comfort: number;
  stability: number;
  qiRaw: number;
  qiAffinity?: number;
  qiLeak?: number;
  shaRaw: number;
  shaEmit?: number;
  shaReduce?: number;
  integrityPenalty: number;
  formationScore: number;
  topologyRevision: number;
  aggregateRevision: number;
}

export type FengShuiMetricKey =
  | 'area'
  | 'perimeter'
  | 'doorCount'
  | 'windowCount'
  | 'roofCoverage'
  | 'comfort'
  | 'stability'
  | 'qiDensity'
  | 'shaRaw'
  | 'integrityPenalty'
  | 'formationScore';

export type FengShuiCondition =
  | { roomRoleIs: RoomRole }
  | { enclosedIs: boolean }
  | { traitAtLeast: [string, number] }
  | { traitMissing: string }
  | { metricGte: [FengShuiMetricKey, number] }
  | { metricLte: [FengShuiMetricKey, number] }
  | { primaryElementIs: FiveElement }
  | { elementGeneratesFunction: true }
  | { elementConflictsFunction: true };

export interface FengShuiRuleDef {
  id: string;
  priority?: number;
  when: FengShuiCondition[];
  scoreDelta: number;
  capGroup?: string;
  reasonCode: string;
  severity: FengShuiReasonSeverity;
}

export interface CompiledFengShuiRule {
  id: string;
  priority: number;
  when: CompiledFengShuiCondition[];
  scoreDelta: number;
  capGroup?: string;
  reasonCode: string;
  severity: FengShuiReasonSeverity;
}

export interface RoomRoleInference {
  role: RoomRole;
  confidence: number;
  secondRole?: RoomRole;
  secondConfidence?: number;
  reasons: Array<{ role: RoomRole; score: number; reasonCode: string }>;
}

type CompiledFengShuiCondition =
  | { kind: 'roomRoleIs'; role: RoomRole }
  | { kind: 'enclosedIs'; enclosed: boolean }
  | { kind: 'traitAtLeast'; traitId: number; count: number }
  | { kind: 'traitMissing'; traitId: number }
  | { kind: 'metricGte'; metric: FengShuiMetricKey; value: number }
  | { kind: 'metricLte'; metric: FengShuiMetricKey; value: number }
  | { kind: 'primaryElementIs'; element: FiveElement }
  | { kind: 'elementGeneratesFunction' }
  | { kind: 'elementConflictsFunction' };

export class FengShuiCalculatorService {
  compileRules(catalog: CompiledBuildingCatalog, rules: readonly FengShuiRuleDef[]): CompiledFengShuiRule[] {
    return compileFengShuiRules(catalog, rules);
  }

  calculate(
    room: RoomInstance,
    aggregate: RoomAggregate,
    rules: readonly CompiledFengShuiRule[],
    options: { instanceId?: string; updatedAtTick?: number; revision?: number } = {},
  ): FengShuiSnapshot {
    return calculateFengShuiSnapshot(room, aggregate, rules, options);
  }

  inferRoomRole(catalog: CompiledBuildingCatalog, room: RoomInstance, aggregate: RoomAggregate): RoomRoleInference {
    return inferRoomRole(catalog, room, aggregate);
  }
}

const ROOM_ROLE_MIN_CONFIDENCE = 60;
const ROOM_ROLE_MIN_LEAD = 30;
const FENGSHUI_FIRST_PASS_SCORE_SCALE = 3;

const ROOM_ROLE_TRAIT_HINTS: ReadonlyArray<{
  trait: string;
  role: RoomRole;
  score: number;
  reasonCode: string;
}> = [
  { trait: 'facility.alchemy.heat_source', role: 'alchemy', score: 100, reasonCode: 'room.role.alchemy' },
  { trait: 'facility.meditation', role: 'meditation', score: 90, reasonCode: 'room.role.meditation' },
  { trait: 'comfort.rest', role: 'bedroom', score: 90, reasonCode: 'room.role.bedroom' },
  { trait: 'storage.shelf', role: 'storage', score: 70, reasonCode: 'room.role.storage' },
  { trait: 'semi_outdoor.corridor', role: 'courtyard', score: 60, reasonCode: 'room.role.courtyard' },
];

export function inferRoomRole(
  catalog: CompiledBuildingCatalog,
  room: RoomInstance,
  aggregate: RoomAggregate,
): RoomRoleInference {
  const scores = new Map<RoomRole, number>();
  const reasons: RoomRoleInference['reasons'] = [];
  for (const hint of ROOM_ROLE_TRAIT_HINTS) {
    if (readTraitCount(catalog, aggregate, hint.trait) <= 0) {
      continue;
    }
    scores.set(hint.role, (scores.get(hint.role) ?? 0) + hint.score);
    reasons.push({ role: hint.role, score: hint.score, reasonCode: hint.reasonCode });
  }
  if (room.roofCoverageRatio < 80 && room.area >= 16) {
    scores.set('courtyard', (scores.get('courtyard') ?? 0) + 30);
    reasons.push({ role: 'courtyard', score: 30, reasonCode: 'room.role.courtyard_low_roof' });
  }
  const ranked = Array.from(scores.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const [bestRole, bestScore] = ranked[0] ?? ['generic', 0];
  const [secondRole, secondScore] = ranked[1] ?? [undefined, 0];
  if (bestScore < ROOM_ROLE_MIN_CONFIDENCE || bestScore - secondScore < ROOM_ROLE_MIN_LEAD) {
    return {
      role: 'generic',
      confidence: bestScore,
      secondRole,
      secondConfidence: secondScore,
      reasons: bestScore > 0 ? reasons.concat([{ role: 'generic', score: 0, reasonCode: 'room.role.generic_mixed' }]) : reasons,
    };
  }
  return {
    role: bestRole,
    confidence: bestScore,
    secondRole,
    secondConfidence: secondScore,
    reasons,
  };
}

export function compileFengShuiRules(
  catalog: CompiledBuildingCatalog,
  rules: readonly FengShuiRuleDef[],
): CompiledFengShuiRule[] {
  return (Array.isArray(rules) ? rules : []).map((rule, index) => ({
    id: normalizeRequiredText(rule.id, `fengshui_rules[${index}].id`),
    priority: normalizeInt(rule.priority, 0),
    when: (Array.isArray(rule.when) ? rule.when : []).map((condition) => compileCondition(catalog, condition)),
    scoreDelta: normalizeInt(rule.scoreDelta, 0),
    capGroup: normalizeOptionalText(rule.capGroup) || undefined,
    reasonCode: normalizeRequiredText(rule.reasonCode, `${rule.id}.reasonCode`),
    severity: rule.severity,
  })).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

export function calculateFengShuiSnapshot(
  room: RoomInstance,
  aggregate: RoomAggregate,
  rules: readonly CompiledFengShuiRule[],
  options: { instanceId?: string; updatedAtTick?: number; revision?: number } = {},
): FengShuiSnapshot {
  void rules;
  const primaryElement = resolvePrimaryElement(aggregate.elementVector);
  const functionElement = FENGSHUI_DEFAULT_FUNCTION_ELEMENT_BY_ROOM_ROLE[room.role] ?? 'neutral';
  const reasons: FengShuiReason[] = [];
  let score = FENGSHUI_BASE_SCORE;
  let shapeScore = 0;
  let enclosureScore = 0;
  let qiScore = 0;
  let shaScore = 0;
  let comfortScore = 0;
  let integrityScore = 0;
  let elementScore = 0;
  let formationScore = normalizeInt(aggregate.formationScore, 0);

  if (room.role !== 'generic') {
    addReason(reasons, `room.role.${room.role}`, 0, 'info');
  }

  if (room.enclosed) {
    enclosureScore += addReason(reasons, 'shell.closed', 80, 'good');
  } else {
    enclosureScore += addReason(reasons, 'shell.open', -120, 'bad');
  }
  if (room.enclosed && room.doorCount <= 0) {
    enclosureScore += addReason(reasons, 'shell.no_door', -80, 'warning');
  }
  if (room.area >= 6 && room.area <= 64) {
    shapeScore += addReason(reasons, 'shell.area_balanced', 40, 'good');
  }
  const roofCoverage = aggregate.roofCoverage || room.roofCoverageRatio;
  if (roofCoverage >= 80) {
    shapeScore += addReason(reasons, 'shell.roof_covered', 30, 'good');
  }

  const roleScore = calculateRoleScore(room, aggregate, reasons);
  comfortScore += roleScore;

  const elementDelta = calculateElementScore(primaryElement, functionElement, reasons);
  elementScore += elementDelta;

  const qiDensity = room.area > 0 ? aggregate.qiRaw / room.area : 0;
  if (qiDensity >= 80) {
    qiScore += addReason(reasons, 'qi.dense', 40, 'good');
  } else if (qiDensity < 20) {
    qiScore += addReason(reasons, 'qi.low', -30, 'warning');
  }
  const qiLeak = Math.max(0, normalizeInt(aggregate.qiLeak, 0));
  if (qiLeak > 0) {
    qiScore += addReason(reasons, 'qi.leak', -Math.min(80, qiLeak * 10), 'bad');
  }
  const qiAffinity = Math.max(0, normalizeInt(aggregate.qiAffinity, 0));
  if (qiAffinity > 0) {
    qiScore += addReason(reasons, 'qi.affinity', Math.min(60, qiAffinity * 10), 'good');
  }

  if (aggregate.comfort >= 12) {
    comfortScore += addReason(reasons, 'comfort.good', 30, 'good');
  } else if (aggregate.comfort <= -6) {
    comfortScore += addReason(reasons, 'comfort.bad', -30, 'bad');
  }
  if (aggregate.stability >= 12) {
    shapeScore += addReason(reasons, 'stability.good', 20, 'good');
  } else if (aggregate.stability <= 0) {
    shapeScore += addReason(reasons, 'stability.bad', -20, 'warning');
  }

  const shaEmit = Math.max(0, normalizeInt(aggregate.shaEmit, aggregate.shaRaw));
  const shaReduce = Math.max(0, normalizeInt(aggregate.shaReduce, 0));
  const shaExposure = Math.max(0, normalizeInt(aggregate.shaRaw, shaEmit - shaReduce));
  if (shaExposure <= 0 && shaReduce > 0) {
    shaScore += addReason(reasons, 'sha.reduced', 20, 'good');
  } else if (shaExposure > 15) {
    shaScore += addReason(reasons, 'sha.exposed', -90, 'bad');
  } else if (shaExposure > 5) {
    shaScore += addReason(reasons, 'sha.exposed', -50, 'bad');
  } else if (shaExposure > 0) {
    shaScore += addReason(reasons, 'sha.exposed', -20, 'warning');
  }
  if (hasTrait(aggregate, 'sha.screen')) {
    shaScore += addReason(reasons, 'sha.screen', 20, 'good');
  }

  shapeScore *= FENGSHUI_FIRST_PASS_SCORE_SCALE;
  enclosureScore *= FENGSHUI_FIRST_PASS_SCORE_SCALE;
  qiScore *= FENGSHUI_FIRST_PASS_SCORE_SCALE;
  shaScore *= FENGSHUI_FIRST_PASS_SCORE_SCALE;
  comfortScore *= FENGSHUI_FIRST_PASS_SCORE_SCALE;
  elementScore *= FENGSHUI_FIRST_PASS_SCORE_SCALE;
  formationScore *= FENGSHUI_FIRST_PASS_SCORE_SCALE;
  for (const reason of reasons) {
    reason.delta *= FENGSHUI_FIRST_PASS_SCORE_SCALE;
  }

  score += shapeScore + enclosureScore + qiScore + shaScore + comfortScore + elementScore + formationScore;
  if (room.role === 'generic' && score > 520) {
    const delta = 520 - score;
    comfortScore += delta;
    reasons.push({
      code: 'room.role.generic_cap',
      delta,
      severity: 'info',
    });
    score = 520;
  }
  score = clamp(score - Math.max(0, aggregate.integrityPenalty), FENGSHUI_SCORE_MIN, FENGSHUI_SCORE_MAX);
  if (aggregate.integrityPenalty > 0) {
    integrityScore -= aggregate.integrityPenalty;
    reasons.push({
      code: 'integrity.penalty',
      delta: -aggregate.integrityPenalty,
      severity: 'bad',
    });
  }

  return {
    instanceId: options.instanceId ?? room.instanceId,
    roomId: room.id,
    score,
    grade: resolveFengShuiGrade(score),
    primaryElement,
    functionElement,
    shapeScore,
    enclosureScore,
    qiScore,
    shaScore,
    comfortScore,
    integrityScore,
    elementScore,
    formationScore,
    reasons,
    revision: normalizeInt(options.revision, aggregate.aggregateRevision),
    updatedAtTick: normalizeInt(options.updatedAtTick, 0),
  };
}

function calculateRoleScore(room: RoomInstance, aggregate: RoomAggregate, reasons: FengShuiReason[]): number {
  switch (room.role) {
    case 'alchemy':
      return hasTrait(aggregate, 'facility.alchemy.heat_source') ? addReason(reasons, 'trait.alchemy_heat_source', 60, 'good') : 0;
    case 'meditation':
      return hasTrait(aggregate, 'facility.meditation') ? addReason(reasons, 'trait.meditation_facility', 50, 'good') : 0;
    case 'bedroom':
      return hasTrait(aggregate, 'comfort.rest') ? addReason(reasons, 'trait.rest_comfort', 50, 'good') : 0;
    case 'storage':
      return hasTrait(aggregate, 'storage.shelf') ? addReason(reasons, 'trait.storage_shelf', 45, 'good') : 0;
    case 'courtyard':
      return hasTrait(aggregate, 'semi_outdoor.corridor') ? addReason(reasons, 'trait.courtyard_corridor', 30, 'good') : 0;
    default:
      return 0;
  }
}

function calculateElementScore(
  primaryElement: FiveElement,
  functionElement: FiveElement,
  reasons: FengShuiReason[],
): number {
  if (primaryElement === 'neutral' || functionElement === 'neutral') {
    return 0;
  }
  if (primaryElement === functionElement) {
    return addReason(reasons, 'element.same_function', 25, 'good');
  }
  if (generates(primaryElement, functionElement)) {
    return addReason(reasons, 'element.generates_function', 45, 'good');
  }
  if (FENGSHUI_CONTROLS[primaryElement] === functionElement) {
    return addReason(reasons, 'element.conflicts_function', -60, 'bad');
  }
  if (FENGSHUI_CONTROLS[functionElement] === primaryElement) {
    return addReason(reasons, 'element.conflicts_function', -40, 'bad');
  }
  return 0;
}

function addReason(reasons: FengShuiReason[], code: string, delta: number, severity: FengShuiReasonSeverity): number {
  reasons.push({ code, delta, severity });
  return delta;
}

function readTraitCount(catalog: CompiledBuildingCatalog, aggregate: RoomAggregate, trait: string): number {
  const traitId = catalog.traitIdsByKey.get(trait);
  return traitId ? aggregate.traitCounts.get(traitId) ?? 0 : 0;
}

function hasTrait(aggregate: RoomAggregate, trait: string): boolean {
  return aggregate.traitKeys instanceof Set && aggregate.traitKeys.has(trait);
}

function compileCondition(catalog: CompiledBuildingCatalog, condition: FengShuiCondition): CompiledFengShuiCondition {
  if ('roomRoleIs' in condition) return { kind: 'roomRoleIs', role: condition.roomRoleIs };
  if ('enclosedIs' in condition) return { kind: 'enclosedIs', enclosed: condition.enclosedIs };
  if ('traitAtLeast' in condition) {
    const [trait, count] = condition.traitAtLeast;
    return {
      kind: 'traitAtLeast',
      traitId: resolveRuleTraitId(catalog, trait),
      count: Math.max(0, normalizeInt(count, 0)),
    };
  }
  if ('traitMissing' in condition) return { kind: 'traitMissing', traitId: resolveRuleTraitId(catalog, condition.traitMissing) };
  if ('metricGte' in condition) return { kind: 'metricGte', metric: condition.metricGte[0], value: Number(condition.metricGte[1]) || 0 };
  if ('metricLte' in condition) return { kind: 'metricLte', metric: condition.metricLte[0], value: Number(condition.metricLte[1]) || 0 };
  if ('primaryElementIs' in condition) return { kind: 'primaryElementIs', element: condition.primaryElementIs };
  if ('elementGeneratesFunction' in condition) return { kind: 'elementGeneratesFunction' };
  if ('elementConflictsFunction' in condition) return { kind: 'elementConflictsFunction' };
  throw new Error('fengshui_rule_condition_invalid');
}

function evaluateCondition(
  condition: CompiledFengShuiCondition,
  context: {
    room: RoomInstance;
    aggregate: RoomAggregate;
    primaryElement: FiveElement;
    functionElement: FiveElement;
  },
): boolean {
  switch (condition.kind) {
    case 'roomRoleIs':
      return context.room.role === condition.role;
    case 'enclosedIs':
      return context.room.enclosed === condition.enclosed;
    case 'traitAtLeast':
      return (context.aggregate.traitCounts.get(condition.traitId) ?? 0) >= condition.count;
    case 'traitMissing':
      return (context.aggregate.traitCounts.get(condition.traitId) ?? 0) <= 0;
    case 'metricGte':
      return readMetric(context.room, context.aggregate, condition.metric) >= condition.value;
    case 'metricLte':
      return readMetric(context.room, context.aggregate, condition.metric) <= condition.value;
    case 'primaryElementIs':
      return context.primaryElement === condition.element;
    case 'elementGeneratesFunction':
      return generates(context.primaryElement, context.functionElement);
    case 'elementConflictsFunction':
      return conflicts(context.primaryElement, context.functionElement);
    default:
      return false;
  }
}

function readMetric(room: RoomInstance, aggregate: RoomAggregate, metric: FengShuiMetricKey): number {
  switch (metric) {
    case 'area':
      return room.area;
    case 'perimeter':
      return room.perimeter;
    case 'doorCount':
      return room.doorCount;
    case 'windowCount':
      return room.windowCount;
    case 'roofCoverage':
      return aggregate.roofCoverage || room.roofCoverageRatio;
    case 'comfort':
      return aggregate.comfort;
    case 'stability':
      return aggregate.stability;
    case 'qiDensity':
      return room.area > 0 ? aggregate.qiRaw / room.area : 0;
    case 'shaRaw':
      return aggregate.shaRaw;
    case 'integrityPenalty':
      return aggregate.integrityPenalty;
    case 'formationScore':
      return aggregate.formationScore;
    default:
      return 0;
  }
}

function resolvePrimaryElement(vector: Int32Array): FiveElement {
  let bestElement: FiveElement = 'neutral';
  let bestValue = 0;
  for (const element of FENGSHUI_ELEMENT_KEYS) {
    const value = vector[FENGSHUI_ELEMENT_INDEX[element]] ?? 0;
    if (value > bestValue) {
      bestValue = value;
      bestElement = element;
    }
  }
  return bestElement;
}

function generates(source: FiveElement, target: FiveElement): boolean {
  return source !== 'neutral' && target !== 'neutral' && FENGSHUI_GENERATES[source] === target;
}

function conflicts(source: FiveElement, target: FiveElement): boolean {
  return source !== 'neutral'
    && target !== 'neutral'
    && (FENGSHUI_CONTROLS[source] === target || FENGSHUI_CONTROLS[target] === source);
}

function resolveFengShuiGrade(score: number) {
  for (const threshold of FENGSHUI_GRADE_THRESHOLDS) {
    if (score >= threshold.minScore) {
      return threshold.grade;
    }
  }
  return 'disaster' as const;
}

function resolveRuleTraitId(catalog: CompiledBuildingCatalog, trait: string): number {
  const key = normalizeRequiredText(trait, 'fengshui_rule.trait');
  const existing = catalog.traitIdsByKey.get(key);
  if (!existing) {
    throw new Error(`fengshui_rule_unknown_trait:${key}`);
  }
  return existing;
}

function normalizeRequiredText(value: unknown, field: string): string {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    throw new Error(`fengshui_rule_required:${field}`);
  }
  return normalized;
}

function normalizeOptionalText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeInt(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}
