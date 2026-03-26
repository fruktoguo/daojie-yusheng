import {
  DEFAULT_QI_EFFICIENCY_BP,
  DISPERSED_AURA_HALF_LIFE_RATE_SCALED,
  DISPERSED_AURA_MIN_DECAY_PER_TICK,
  QI_ELEMENT_KEYS,
  QI_FAMILY_KEYS,
  QI_FORM_KEYS,
  QI_HALF_LIFE_RATE_SCALE,
  QI_PROJECTION_BP_SCALE,
  QI_VISIBILITY_LEVELS,
} from './constants/gameplay/qi';
import { getAuraLevel } from './aura';
import { DEFAULT_AURA_LEVEL_BASE_VALUE } from './constants/gameplay/aura';

export type QiFamilyKey = typeof QI_FAMILY_KEYS[number];
export type QiFormKey = typeof QI_FORM_KEYS[number];
export type QiElementKey = typeof QI_ELEMENT_KEYS[number];
export type QiVisibilityLevel = typeof QI_VISIBILITY_LEVELS[number];

export interface QiResourceDescriptor {
  family: QiFamilyKey;
  form: QiFormKey;
  element: QiElementKey;
}

export interface QiProjectionSelector {
  resourceKeys?: string[];
  families?: QiFamilyKey[];
  forms?: QiFormKey[];
  elements?: QiElementKey[];
}

export interface QiProjectionModifier {
  selector?: QiProjectionSelector;
  visibility?: Exclude<QiVisibilityLevel, 'hidden'>;
  efficiencyBpMultiplier?: number;
}

export interface CompiledQiResourceProjection {
  visibility: QiVisibilityLevel;
  efficiencyBp: number;
  descriptor: QiResourceDescriptor;
}

export interface CompiledQiProjectionProfile {
  revision: number;
  resourceProfiles: Record<string, CompiledQiResourceProjection>;
  familyVisibility: Partial<Record<QiFamilyKey, QiVisibilityLevel>>;
}

export interface QiRuntimeFlowConfig {
  halfLifeRateScale: number;
  halfLifeRateScaled: number;
  minimumDecayPerTick: number;
}

export const DEFAULT_QI_RESOURCE_DESCRIPTOR: QiResourceDescriptor = {
  family: 'aura',
  form: 'refined',
  element: 'neutral',
};

export const DISPERSED_AURA_RESOURCE_DESCRIPTOR: QiResourceDescriptor = {
  family: 'aura',
  form: 'dispersed',
  element: 'neutral',
};

export const ALL_QI_RESOURCE_DESCRIPTORS: QiResourceDescriptor[] = QI_FAMILY_KEYS.flatMap((family) => (
  QI_FORM_KEYS.flatMap((form) => (
    QI_ELEMENT_KEYS.map((element) => ({
      family,
      form,
      element,
    }))
  ))
));

export const ALL_QI_RESOURCE_KEYS = ALL_QI_RESOURCE_DESCRIPTORS.map((descriptor) => buildQiResourceKey(descriptor));

export const DEFAULT_PLAYER_QI_RESOURCE_KEYS = ALL_QI_RESOURCE_DESCRIPTORS
  .filter((descriptor) => descriptor.family === 'aura')
  .map((descriptor) => buildQiResourceKey(descriptor));

export const DISPERSED_AURA_RESOURCE_KEY = buildQiResourceKey(DISPERSED_AURA_RESOURCE_DESCRIPTOR);

export const DEFAULT_QI_RUNTIME_FLOW_CONFIGS: Partial<Record<string, QiRuntimeFlowConfig>> = {
  [DISPERSED_AURA_RESOURCE_KEY]: {
    halfLifeRateScale: QI_HALF_LIFE_RATE_SCALE,
    halfLifeRateScaled: DISPERSED_AURA_HALF_LIFE_RATE_SCALED,
    minimumDecayPerTick: DISPERSED_AURA_MIN_DECAY_PER_TICK,
  },
};

export function buildQiResourceKey(descriptor: QiResourceDescriptor): string {
  return `${descriptor.family}.${descriptor.form}.${descriptor.element}`;
}

export function parseQiResourceKey(resourceKey: string): QiResourceDescriptor | null {
  const [family, form, element] = resourceKey.split('.');
  if (!QI_FAMILY_KEYS.includes(family as QiFamilyKey)) {
    return null;
  }
  if (!QI_FORM_KEYS.includes(form as QiFormKey)) {
    return null;
  }
  if (!QI_ELEMENT_KEYS.includes(element as QiElementKey)) {
    return null;
  }
  return {
    family: family as QiFamilyKey,
    form: form as QiFormKey,
    element: element as QiElementKey,
  };
}

export function isQiFamilyResource(resourceKey: string, family: QiFamilyKey): boolean {
  return parseQiResourceKey(resourceKey)?.family === family;
}

export function isAuraQiResourceKey(resourceKey: string): boolean {
  return isQiFamilyResource(resourceKey, 'aura');
}

export function normalizeQiEfficiencyBp(value: unknown, fallback = DEFAULT_QI_EFFICIENCY_BP): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.round(Number(value)));
}

export function getQiVisibilityRank(visibility: QiVisibilityLevel): number {
  return QI_VISIBILITY_LEVELS.indexOf(visibility);
}

export function maxQiVisibility(left: QiVisibilityLevel, right: QiVisibilityLevel): QiVisibilityLevel {
  return getQiVisibilityRank(left) >= getQiVisibilityRank(right) ? left : right;
}

export function matchesQiProjectionSelector(
  descriptor: QiResourceDescriptor,
  resourceKey: string,
  selector?: QiProjectionSelector,
): boolean {
  if (!selector) {
    return true;
  }
  if (selector.resourceKeys && selector.resourceKeys.length > 0 && !selector.resourceKeys.includes(resourceKey)) {
    return false;
  }
  if (selector.families && selector.families.length > 0 && !selector.families.includes(descriptor.family)) {
    return false;
  }
  if (selector.forms && selector.forms.length > 0 && !selector.forms.includes(descriptor.form)) {
    return false;
  }
  if (selector.elements && selector.elements.length > 0 && !selector.elements.includes(descriptor.element)) {
    return false;
  }
  return true;
}

export function applyQiEfficiencyBp(baseBp: number, multiplierBp: number): number {
  const normalizedBase = normalizeQiEfficiencyBp(baseBp);
  const normalizedMultiplier = normalizeQiEfficiencyBp(multiplierBp);
  return Math.max(0, Math.round((normalizedBase * normalizedMultiplier) / QI_PROJECTION_BP_SCALE));
}

export function projectQiValue(rawValue: number, efficiencyBp: number): number {
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return 0;
  }
  return Math.max(0, Math.round((Math.round(rawValue) * normalizeQiEfficiencyBp(efficiencyBp)) / QI_PROJECTION_BP_SCALE));
}

export function getProjectedAuraLevel(auraValue: number, efficiencyBp = DEFAULT_QI_EFFICIENCY_BP, baseValue = DEFAULT_AURA_LEVEL_BASE_VALUE): number {
  return getAuraLevel(projectQiValue(auraValue, efficiencyBp), baseValue);
}
