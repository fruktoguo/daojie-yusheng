/**
 * 本文件定义制造技艺的五行投料匹配公式，前后端共用同一套纯计算口径。
 */
import { ELEMENT_KEYS } from './constants/gameplay/attributes';
import type { ElementKey, ElementStatGroup, PartialElementStatGroup } from './numeric';

export type CraftElementKey = ElementKey;
export type CraftElementVector = PartialElementStatGroup;

export interface CraftElementMatchSnapshot {
  targetElements: CraftElementVector;
  inputElements: CraftElementVector;
  perElementScore: ElementStatGroup;
  targetTotalAbs: number;
  zeroBase: number;
  baseElementSuccessRate: number;
}

export function createEmptyCraftElementVector(): ElementStatGroup {
  return {
    metal: 0,
    wood: 0,
    water: 0,
    fire: 0,
    earth: 0,
  };
}

export function normalizeCraftElementVector(value: unknown): CraftElementVector {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const source = value as Partial<Record<ElementKey, unknown>>;
  const result: CraftElementVector = {};
  for (const element of ELEMENT_KEYS) {
    const numeric = Number(source[element]);
    if (!Number.isFinite(numeric)) {
      continue;
    }
    const normalized = Math.trunc(numeric);
    if (normalized !== 0) {
      result[element] = normalized;
    }
  }
  return result;
}

export function cloneCraftElementVector(value: CraftElementVector | undefined): CraftElementVector {
  return normalizeCraftElementVector(value);
}

export function getCraftElementValue(value: CraftElementVector | undefined, element: ElementKey): number {
  const numeric = Number(value?.[element]);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function addCraftElementVector(
  target: ElementStatGroup,
  source: CraftElementVector | undefined,
  multiplier = 1,
): ElementStatGroup {
  const normalizedMultiplier = Number.isFinite(multiplier) ? Number(multiplier) : 0;
  if (normalizedMultiplier === 0) {
    return target;
  }
  for (const element of ELEMENT_KEYS) {
    const value = getCraftElementValue(source, element);
    if (value !== 0) {
      target[element] += value * normalizedMultiplier;
    }
  }
  return target;
}

export function compactCraftElementVector(value: CraftElementVector | ElementStatGroup | undefined): CraftElementVector {
  const result: CraftElementVector = {};
  for (const element of ELEMENT_KEYS) {
    const numeric = Number(value?.[element]);
    if (!Number.isFinite(numeric)) {
      continue;
    }
    const normalized = Math.trunc(numeric);
    if (normalized !== 0) {
      result[element] = normalized;
    }
  }
  return result;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function computeFivePhaseElementMatch(
  inputElementsInput: CraftElementVector | undefined,
  targetElementsInput: CraftElementVector | undefined,
): CraftElementMatchSnapshot {
  const inputElements = normalizeCraftElementVector(inputElementsInput);
  const targetElements = normalizeCraftElementVector(targetElementsInput);
  const targetTotalAbs = ELEMENT_KEYS.reduce(
    (total, element) => total + Math.abs(getCraftElementValue(targetElements, element)),
    0,
  );
  const zeroBase = Math.max(1, targetTotalAbs * 0.2);
  const perElementScore = createEmptyCraftElementVector();
  let baseElementSuccessRate = targetTotalAbs > 0 ? 1 : 0;

  for (const element of ELEMENT_KEYS) {
    const target = getCraftElementValue(targetElements, element);
    const input = getCraftElementValue(inputElements, element);
    const diffRate = target !== 0
      ? Math.abs(input - target) / Math.abs(target)
      : Math.abs(input) / zeroBase;
    const matchRate = clampUnit(1 - diffRate);
    const elementScore = matchRate ** 2;
    perElementScore[element] = elementScore;
    baseElementSuccessRate *= elementScore;
  }

  return {
    targetElements: compactCraftElementVector(targetElements),
    inputElements: compactCraftElementVector(inputElements),
    perElementScore,
    targetTotalAbs,
    zeroBase,
    baseElementSuccessRate: clampUnit(baseElementSuccessRate),
  };
}

export function computeFivePhaseBaseSuccessRate(
  inputElements: CraftElementVector | undefined,
  targetElements: CraftElementVector | undefined,
): number {
  return computeFivePhaseElementMatch(inputElements, targetElements).baseElementSuccessRate;
}
