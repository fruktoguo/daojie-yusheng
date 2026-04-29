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

/** 灵力族枚举，区分灵气、散气等不同资源大类。 */
export type QiFamilyKey = typeof QI_FAMILY_KEYS[number];
/** 灵力形态键名，描述资源是元气态、炼化态还是散逸态。 */
export type QiFormKey = typeof QI_FORM_KEYS[number];
/** 五行元素键名。 */
export type QiElementKey = typeof QI_ELEMENT_KEYS[number];
/** 灵力可见性等级，越高表示越容易被感知。 */
export type QiVisibilityLevel = typeof QI_VISIBILITY_LEVELS[number];

/** 灵力资源描述符：由族、形态、元素三元信息唯一确定。 */
export interface QiResourceDescriptor {
/**
 * family：family相关字段。
 */

  family: QiFamilyKey;  
  /**
 * form：form相关字段。
 */

  form: QiFormKey;  
  /**
 * element：element相关字段。
 */

  element: QiElementKey;
}

/** 灵力投影筛选条件：按资源键、族、形态或元素筛选命中项。 */
export interface QiProjectionSelector {
/**
 * resourceKeys：resourceKey相关字段。
 */

  resourceKeys?: string[];  
  /**
 * families：family相关字段。
 */

  families?: QiFamilyKey[];  
  /**
 * forms：form相关字段。
 */

  forms?: QiFormKey[];  
  /**
 * elements：element相关字段。
 */

  elements?: QiElementKey[];
}

/** 单条灵力投影规则：控制资源可见性和效率倍率。 */
export interface QiProjectionModifier {
/**
 * selector：selector相关字段。
 */

  selector?: QiProjectionSelector;  
  /**
 * visibility：可见性相关字段。
 */

  visibility?: Exclude<QiVisibilityLevel, 'hidden'>;  
  /**
 * efficiencyBpMultiplier：efficiencyBpMultiplier相关字段。
 */

  efficiencyBpMultiplier?: number;
}

/** 编译后的单条灵力投影结果，供运行时直接查表使用。 */
export interface CompiledQiResourceProjection {
/**
 * visibility：可见性相关字段。
 */

  visibility: QiVisibilityLevel;  
  /**
 * efficiencyBp：efficiencyBp相关字段。
 */

  efficiencyBp: number;  
  /**
 * descriptor：descriptor相关字段。
 */

  descriptor: QiResourceDescriptor;
}

/** 当前角色的灵力投影快照，便于缓存和增量对比。 */
export interface CompiledQiProjectionProfile {
/**
 * revision：revision相关字段。
 */

  revision: number;  
  /**
 * resourceProfiles：resourceProfile相关字段。
 */

  resourceProfiles: Record<string, CompiledQiResourceProjection>;  
  /**
 * familyVisibility：family可见性相关字段。
 */

  familyVisibility: Partial<Record<QiFamilyKey, QiVisibilityLevel>>;
}

/** 灵力流衰减参数，决定资源随时间的递减速度。 */
export interface QiRuntimeFlowConfig {
/**
 * halfLifeRateScale：halfLifeRateScale相关字段。
 */

  halfLifeRateScale: number;  
  /**
 * halfLifeRateScaled：halfLifeRateScaled相关字段。
 */

  halfLifeRateScaled: number;  
  /**
 * minimumDecayPerTick：minimumDecayPertick相关字段。
 */

  minimumDecayPerTick: number;
}

export const DEFAULT_QI_RESOURCE_DESCRIPTOR: QiResourceDescriptor = {
  family: 'aura',
  form: 'refined',
  element: 'neutral',
};

/** 散气资源的标准描述符。 */
export const DISPERSED_AURA_RESOURCE_DESCRIPTOR: QiResourceDescriptor = {
  family: 'aura',
  form: 'dispersed',
  element: 'neutral',
};

/** 全量灵力资源描述符表，用于初始化和遍历。 */
export const ALL_QI_RESOURCE_DESCRIPTORS: QiResourceDescriptor[] = QI_FAMILY_KEYS.flatMap((family) => (
  QI_FORM_KEYS.flatMap((form) => (
    QI_ELEMENT_KEYS.map((element) => ({
      family,
      form,
      element,
    }))
  ))
));

/** 所有灵力资源键，供配置校验和批量遍历。 */
export const ALL_QI_RESOURCE_KEYS = ALL_QI_RESOURCE_DESCRIPTORS.map((descriptor) => buildQiResourceKey(descriptor));

/** 默认角色会携带的灵气资源键集合。 */
export const DEFAULT_PLAYER_QI_RESOURCE_KEYS = ALL_QI_RESOURCE_DESCRIPTORS
  .filter((descriptor) => descriptor.family === 'aura' && descriptor.element === 'neutral')
  .map((descriptor) => buildQiResourceKey(descriptor));

/** 散气资源键。 */
export const DISPERSED_AURA_RESOURCE_KEY = buildQiResourceKey(DISPERSED_AURA_RESOURCE_DESCRIPTOR);

/** 散气资源默认衰减配置。 */
export const DEFAULT_QI_RUNTIME_FLOW_CONFIGS: Partial<Record<string, QiRuntimeFlowConfig>> = {
  [DISPERSED_AURA_RESOURCE_KEY]: {
    halfLifeRateScale: QI_HALF_LIFE_RATE_SCALE,
    halfLifeRateScaled: DISPERSED_AURA_HALF_LIFE_RATE_SCALED,
    minimumDecayPerTick: DISPERSED_AURA_MIN_DECAY_PER_TICK,
  },
};

/**
 * 根据单次灵力消耗，计算每个 3x3 地块应注入的逸散灵气值。
 *
 * 说明：
 * - `100` 以内维持原本每格 `10%` 的线性转化。
 * - 超过 `100` 后按对数曲线衰减，保证单次消耗越大，单位灵力可转化出的逸散越低。
 * - 该函数返回“每格”注入值；外围 3x3 的总注入量由调用方决定。
 */
export function calculateDispersedAuraGainPerTile(qiCost: number): number {
  const normalizedCost = Number.isFinite(qiCost) ? Math.max(0, Math.floor(qiCost)) : 0;
  if (normalizedCost <= 0) {
    return 0;
  }
  const overflowLogFactor = normalizedCost <= 100 ? 0 : Math.log10(normalizedCost / 100);
  const conversionDivisor = 10 * (1 + Math.max(0, overflowLogFactor));
  return Math.max(0, Math.floor(normalizedCost / conversionDivisor));
}

/** 拼接灵力资源键，便于配置和查表。 */
export function buildQiResourceKey(descriptor: QiResourceDescriptor): string {
  return `${descriptor.family}.${descriptor.form}.${descriptor.element}`;
}

/** 拆解灵力资源键并校验三段枚举是否合法。 */
export function parseQiResourceKey(resourceKey: string): QiResourceDescriptor | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 判断资源键是否属于指定灵力族。 */
export function isQiFamilyResource(resourceKey: string, family: QiFamilyKey): boolean {
  return parseQiResourceKey(resourceKey)?.family === family;
}

/** 判断资源键是否属于灵气族。 */
export function isAuraQiResourceKey(resourceKey: string): boolean {
  return isQiFamilyResource(resourceKey, 'aura');
}

/** 返回资源键对应的显示标签。 */
export function getQiResourceDisplayLabel(resourceKey: string): string {
  const parsed = parseQiResourceKey(resourceKey);
  if (!parsed) {
    return resourceKey;
  }
  if (parsed.family === 'aura' && parsed.form === 'refined' && parsed.element === 'neutral') {
    return '灵气';
  }
  const elementLabel = parsed.element === 'neutral'
    ? ''
    : ({
      metal: '金',
      wood: '木',
      water: '水',
      fire: '火',
      earth: '土',
    }[parsed.element] ?? parsed.element);
  const formLabel = parsed.form === 'dispersed' ? '逸散' : '';
  const familyLabel = ({
    aura: '灵气',
    sha: '煞气',
    demonic: '魔气',
  }[parsed.family] ?? parsed.family);
  return `${elementLabel}${formLabel}${familyLabel}` || resourceKey;
}

/** 按资源类型推导默认等级语义；当前仅灵气族映射等级。 */
export function getQiResourceDefaultLevel(
  resourceKey: string,
  value: number,
  auraLevelBaseValue = DEFAULT_AURA_LEVEL_BASE_VALUE,
): number | undefined {
  const normalizedValue = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  if (normalizedValue <= 0) {
    return 0;
  }
  return isAuraQiResourceKey(resourceKey)
    ? getAuraLevel(normalizedValue, auraLevelBaseValue)
    : undefined;
}

/** 将灵力效率倍率归一化为 basis point 口径。 */
export function normalizeQiEfficiencyBp(value: unknown, fallback = DEFAULT_QI_EFFICIENCY_BP): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.round(Number(value)));
}

/** 返回灵力可见性的排序值，数值越大表示越显眼。 */
export function getQiVisibilityRank(visibility: QiVisibilityLevel): number {
  return QI_VISIBILITY_LEVELS.indexOf(visibility);
}

/** 取两种灵力可见性中更高的一档。 */
export function maxQiVisibility(left: QiVisibilityLevel, right: QiVisibilityLevel): QiVisibilityLevel {
  return getQiVisibilityRank(left) >= getQiVisibilityRank(right) ? left : right;
}

/** 判断资源描述符是否命中投影筛选条件。 */
export function matchesQiProjectionSelector(
  descriptor: QiResourceDescriptor,
  resourceKey: string,
  selector?: QiProjectionSelector,
): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 按倍率叠加灵力效率，结果仍按 basis point 口径返回。 */
export function applyQiEfficiencyBp(baseBp: number, multiplierBp: number): number {
  const normalizedBase = normalizeQiEfficiencyBp(baseBp);
  const normalizedMultiplier = normalizeQiEfficiencyBp(multiplierBp);
  return Math.max(0, Math.round((normalizedBase * normalizedMultiplier) / QI_PROJECTION_BP_SCALE));
}

/** 按偏移量叠加灵力效率，用于同类气机投影来源合并。 */
export function stackQiEfficiencyBp(baseBp: number, modifierBp: number): number {
  const normalizedBase = normalizeQiEfficiencyBp(baseBp);
  const normalizedModifier = normalizeQiEfficiencyBp(modifierBp);
  return Math.max(0, normalizedBase + normalizedModifier - DEFAULT_QI_EFFICIENCY_BP);
}

/** 按效率折算原始灵力数值。 */
export function projectQiValue(rawValue: number, efficiencyBp: number): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return 0;
  }
  return Math.max(0, Math.round((Math.round(rawValue) * normalizeQiEfficiencyBp(efficiencyBp)) / QI_PROJECTION_BP_SCALE));
}

/** 将折算后的灵力值映射为灵气等级。 */
export function getProjectedAuraLevel(auraValue: number, efficiencyBp = DEFAULT_QI_EFFICIENCY_BP, baseValue = DEFAULT_AURA_LEVEL_BASE_VALUE): number {
  return getAuraLevel(projectQiValue(auraValue, efficiencyBp), baseValue);
}
