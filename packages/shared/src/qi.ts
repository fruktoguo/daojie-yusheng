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

/** QiFamilyKey：定义该类型的结构与数据语义。 */
export type QiFamilyKey = typeof QI_FAMILY_KEYS[number];
/** QiFormKey：定义该类型的结构与数据语义。 */
export type QiFormKey = typeof QI_FORM_KEYS[number];
/** QiElementKey：定义该类型的结构与数据语义。 */
export type QiElementKey = typeof QI_ELEMENT_KEYS[number];
/** QiVisibilityLevel：定义该类型的结构与数据语义。 */
export type QiVisibilityLevel = typeof QI_VISIBILITY_LEVELS[number];

/** QiResourceDescriptor：定义该接口的能力与字段约束。 */
export interface QiResourceDescriptor {
/** family：定义该变量以承载业务值。 */
  family: QiFamilyKey;
/** form：定义该变量以承载业务值。 */
  form: QiFormKey;
/** element：定义该变量以承载业务值。 */
  element: QiElementKey;
}

/** QiProjectionSelector：定义该接口的能力与字段约束。 */
export interface QiProjectionSelector {
  resourceKeys?: string[];
  families?: QiFamilyKey[];
  forms?: QiFormKey[];
  elements?: QiElementKey[];
}

/** QiProjectionModifier：定义该接口的能力与字段约束。 */
export interface QiProjectionModifier {
  selector?: QiProjectionSelector;
  visibility?: Exclude<QiVisibilityLevel, 'hidden'>;
  efficiencyBpMultiplier?: number;
}

/** CompiledQiResourceProjection：定义该接口的能力与字段约束。 */
export interface CompiledQiResourceProjection {
/** visibility：定义该变量以承载业务值。 */
  visibility: QiVisibilityLevel;
/** efficiencyBp：定义该变量以承载业务值。 */
  efficiencyBp: number;
/** descriptor：定义该变量以承载业务值。 */
  descriptor: QiResourceDescriptor;
}

/** CompiledQiProjectionProfile：定义该接口的能力与字段约束。 */
export interface CompiledQiProjectionProfile {
/** revision：定义该变量以承载业务值。 */
  revision: number;
/** resourceProfiles：定义该变量以承载业务值。 */
  resourceProfiles: Record<string, CompiledQiResourceProjection>;
/** familyVisibility：定义该变量以承载业务值。 */
  familyVisibility: Partial<Record<QiFamilyKey, QiVisibilityLevel>>;
}

/** QiRuntimeFlowConfig：定义该接口的能力与字段约束。 */
export interface QiRuntimeFlowConfig {
/** halfLifeRateScale：定义该变量以承载业务值。 */
  halfLifeRateScale: number;
/** halfLifeRateScaled：定义该变量以承载业务值。 */
  halfLifeRateScaled: number;
/** minimumDecayPerTick：定义该变量以承载业务值。 */
  minimumDecayPerTick: number;
}

/** DEFAULT_QI_RESOURCE_DESCRIPTOR：定义该变量以承载业务值。 */
export const DEFAULT_QI_RESOURCE_DESCRIPTOR: QiResourceDescriptor = {
  family: 'aura',
  form: 'refined',
  element: 'neutral',
};

/** DISPERSED_AURA_RESOURCE_DESCRIPTOR：定义该变量以承载业务值。 */
export const DISPERSED_AURA_RESOURCE_DESCRIPTOR: QiResourceDescriptor = {
  family: 'aura',
  form: 'dispersed',
  element: 'neutral',
};

/** ALL_QI_RESOURCE_DESCRIPTORS：定义该变量以承载业务值。 */
export const ALL_QI_RESOURCE_DESCRIPTORS: QiResourceDescriptor[] = QI_FAMILY_KEYS.flatMap((family) => (
  QI_FORM_KEYS.flatMap((form) => (
    QI_ELEMENT_KEYS.map((element) => ({
      family,
      form,
      element,
    }))
  ))
));

/** ALL_QI_RESOURCE_KEYS：定义该变量以承载业务值。 */
export const ALL_QI_RESOURCE_KEYS = ALL_QI_RESOURCE_DESCRIPTORS.map((descriptor) => buildQiResourceKey(descriptor));

/** DEFAULT_PLAYER_QI_RESOURCE_KEYS：定义该变量以承载业务值。 */
export const DEFAULT_PLAYER_QI_RESOURCE_KEYS = ALL_QI_RESOURCE_DESCRIPTORS
  .filter((descriptor) => descriptor.family === 'aura' && descriptor.element === 'neutral')
  .map((descriptor) => buildQiResourceKey(descriptor));

/** DISPERSED_AURA_RESOURCE_KEY：定义该变量以承载业务值。 */
export const DISPERSED_AURA_RESOURCE_KEY = buildQiResourceKey(DISPERSED_AURA_RESOURCE_DESCRIPTOR);

/** DEFAULT_QI_RUNTIME_FLOW_CONFIGS：定义该变量以承载业务值。 */
export const DEFAULT_QI_RUNTIME_FLOW_CONFIGS: Partial<Record<string, QiRuntimeFlowConfig>> = {
  [DISPERSED_AURA_RESOURCE_KEY]: {
    halfLifeRateScale: QI_HALF_LIFE_RATE_SCALE,
    halfLifeRateScaled: DISPERSED_AURA_HALF_LIFE_RATE_SCALED,
    minimumDecayPerTick: DISPERSED_AURA_MIN_DECAY_PER_TICK,
  },
};

/** buildQiResourceKey：执行对应的业务逻辑。 */
export function buildQiResourceKey(descriptor: QiResourceDescriptor): string {
  return `${descriptor.family}.${descriptor.form}.${descriptor.element}`;
}

/** parseQiResourceKey：执行对应的业务逻辑。 */
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

/** isQiFamilyResource：执行对应的业务逻辑。 */
export function isQiFamilyResource(resourceKey: string, family: QiFamilyKey): boolean {
  return parseQiResourceKey(resourceKey)?.family === family;
}

/** isAuraQiResourceKey：执行对应的业务逻辑。 */
export function isAuraQiResourceKey(resourceKey: string): boolean {
  return isQiFamilyResource(resourceKey, 'aura');
}

/** normalizeQiEfficiencyBp：执行对应的业务逻辑。 */
export function normalizeQiEfficiencyBp(value: unknown, fallback = DEFAULT_QI_EFFICIENCY_BP): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.round(Number(value)));
}

/** getQiVisibilityRank：执行对应的业务逻辑。 */
export function getQiVisibilityRank(visibility: QiVisibilityLevel): number {
  return QI_VISIBILITY_LEVELS.indexOf(visibility);
}

/** maxQiVisibility：执行对应的业务逻辑。 */
export function maxQiVisibility(left: QiVisibilityLevel, right: QiVisibilityLevel): QiVisibilityLevel {
  return getQiVisibilityRank(left) >= getQiVisibilityRank(right) ? left : right;
}

/** matchesQiProjectionSelector：执行对应的业务逻辑。 */
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

/** applyQiEfficiencyBp：执行对应的业务逻辑。 */
export function applyQiEfficiencyBp(baseBp: number, multiplierBp: number): number {
/** normalizedBase：定义该变量以承载业务值。 */
  const normalizedBase = normalizeQiEfficiencyBp(baseBp);
/** normalizedMultiplier：定义该变量以承载业务值。 */
  const normalizedMultiplier = normalizeQiEfficiencyBp(multiplierBp);
  return Math.max(0, Math.round((normalizedBase * normalizedMultiplier) / QI_PROJECTION_BP_SCALE));
}

/** projectQiValue：执行对应的业务逻辑。 */
export function projectQiValue(rawValue: number, efficiencyBp: number): number {
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return 0;
  }
  return Math.max(0, Math.round((Math.round(rawValue) * normalizeQiEfficiencyBp(efficiencyBp)) / QI_PROJECTION_BP_SCALE));
}

/** getProjectedAuraLevel：执行对应的业务逻辑。 */
export function getProjectedAuraLevel(auraValue: number, efficiencyBp = DEFAULT_QI_EFFICIENCY_BP, baseValue = DEFAULT_AURA_LEVEL_BASE_VALUE): number {
  return getAuraLevel(projectQiValue(auraValue, efficiencyBp), baseValue);
}

