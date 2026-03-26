import { ATTR_KEYS } from './attributes';
import type { AttrKey, Attributes, TechniqueGrade } from '../../types';

/**
 * 修炼、功法与品阶规则常量。
 */

/** 修炼每 tick 获得经验 */
export const CULTIVATE_EXP_PER_TICK = 10;

/** 闲置自动修炼延迟（息） */
export const AUTO_IDLE_CULTIVATION_DELAY_TICKS = 10;

/** 功法层级经验基准值 */
export const TECHNIQUE_EXP_BASE = 100;

/** 各品阶功法默认经验倍率基线 */
export const TECHNIQUE_GRADE_EXP_BASE_FACTORS: Record<TechniqueGrade, number> = {
  mortal: 10,
  yellow: 30,
  mystic: 90,
  earth: 270,
  heaven: 810,
  spirit: 2430,
  saint: 7290,
  emperor: 21870,
};

/** 六维属性键顺序。 */
export const TECHNIQUE_ATTR_KEYS: AttrKey[] = ATTR_KEYS;

/** 功法品阶从低到高排序 */
export const TECHNIQUE_GRADE_ORDER: TechniqueGrade[] = [
  'mortal',
  'yellow',
  'mystic',
  'earth',
  'heaven',
  'spirit',
  'saint',
  'emperor',
];

/** 技能灵力消耗中各功法品阶对应的倍率 */
export const TECHNIQUE_GRADE_QI_COST_MULTIPLIERS: Record<TechniqueGrade, number> = {
  mortal: 1,
  yellow: 2,
  mystic: 3,
  earth: 4,
  heaven: 5,
  spirit: 6,
  saint: 7,
  emperor: 8,
};

/** 旧版固定功法经验表，当前内容已按逐层配置为准 */
export const TECHNIQUE_EXP_TABLE: Record<number, number> = {
  0: 100,
  1: 300,
  2: 1000,
  3: 0,
};

/** 各品阶属性无衰减上限（超出后进入软衰减区间） */
export const TECHNIQUE_GRADE_ATTR_FREE_LIMITS: Record<TechniqueGrade, Attributes> = {
  mortal: { constitution: 44, spirit: 44, perception: 44, talent: 44, comprehension: 44, luck: 44 },
  yellow: { constitution: 64, spirit: 64, perception: 64, talent: 64, comprehension: 64, luck: 64 },
  mystic: { constitution: 140, spirit: 140, perception: 140, talent: 140, comprehension: 140, luck: 140 },
  earth: { constitution: 220, spirit: 220, perception: 220, talent: 220, comprehension: 220, luck: 220 },
  heaven: { constitution: 440, spirit: 440, perception: 440, talent: 440, comprehension: 440, luck: 440 },
  spirit: { constitution: 880, spirit: 880, perception: 880, talent: 880, comprehension: 880, luck: 880 },
  saint: { constitution: 1760, spirit: 1760, perception: 1760, talent: 1760, comprehension: 1760, luck: 1760 },
  emperor: { constitution: 3520, spirit: 3520, perception: 3520, talent: 3520, comprehension: 3520, luck: 3520 },
};

/** 软衰减对数曲线的缩放系数 */
export const TECHNIQUE_GRADE_ATTR_DECAY_K = 0.8;

/** 各品阶属性软衰减跨度（控制衰减速率） */
export const TECHNIQUE_GRADE_ATTR_DECAY_SPANS: Record<TechniqueGrade, Attributes> = {
  mortal: { constitution: 35.2, spirit: 35.2, perception: 35.2, talent: 35.2, comprehension: 35.2, luck: 35.2 },
  yellow: { constitution: 51.2, spirit: 51.2, perception: 51.2, talent: 51.2, comprehension: 51.2, luck: 51.2 },
  mystic: { constitution: 112, spirit: 112, perception: 112, talent: 112, comprehension: 112, luck: 112 },
  earth: { constitution: 176, spirit: 176, perception: 176, talent: 176, comprehension: 176, luck: 176 },
  heaven: { constitution: 352, spirit: 352, perception: 352, talent: 352, comprehension: 352, luck: 352 },
  spirit: { constitution: 704, spirit: 704, perception: 704, talent: 704, comprehension: 704, luck: 704 },
  saint: { constitution: 1408, spirit: 1408, perception: 1408, talent: 1408, comprehension: 1408, luck: 1408 },
  emperor: { constitution: 2816, spirit: 2816, perception: 2816, talent: 2816, comprehension: 2816, luck: 2816 },
};
