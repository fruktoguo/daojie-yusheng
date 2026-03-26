/**
 * 通用气机系统常量。
 */

/**
 * 气机家族键集合。
 *
 * 说明：
 * - `aura`：灵气。
 * - `demonic`：魔气。
 * - `sha`：煞气。
 */
export const QI_FAMILY_KEYS = ['aura', 'demonic', 'sha'] as const;

/**
 * 气机形态键集合。
 *
 * 说明：
 * - `refined`：凝练气机，通常对应地脉、福地、阵法等长期稳定来源。
 * - `dispersed`：逸散气机，通常对应技能外泄、战斗残留等短时来源。
 */
export const QI_FORM_KEYS = ['refined', 'dispersed'] as const;

/**
 * 气机属性键集合。
 *
 * 说明：
 * - `neutral`：无属性气机。
 * - 其余五项对应五行属性气机。
 */
export const QI_ELEMENT_KEYS = ['neutral', 'metal', 'wood', 'water', 'fire', 'earth'] as const;

/**
 * 气机可见性层级集合。
 *
 * 说明：
 * - `hidden`：完全不可见，也不参与吸收。
 * - `observable`：可见但不可吸收。
 * - `absorbable`：可见且可吸收，会参与有效总值与等级计算。
 */
export const QI_VISIBILITY_LEVELS = ['hidden', 'observable', 'absorbable'] as const;

/**
 * 气机系数固定点基数。
 *
 * 说明：
 * - 采用整数基点表达效率、倍率与投影系数。
 * - `10000 = 1.0`，`8000 = 0.8`，`12000 = 1.2`。
 */
export const QI_PROJECTION_BP_SCALE = 10_000;

/**
 * 默认气机效率系数。
 *
 * 说明：
 * - 表示不加成也不减成的标准效率。
 */
export const DEFAULT_QI_EFFICIENCY_BP = QI_PROJECTION_BP_SCALE;
