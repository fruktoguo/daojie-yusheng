import { ATTR_KEYS } from './attributes';
import type { AttrKey, Attributes, TechniqueGrade } from '../../types';

/**
 * 修炼、功法与品阶规则常量。
 */

/** 修炼每 tick 获得经验 */
export const CULTIVATE_EXP_PER_TICK = 5;

/** 修炼每 tick 获得境界修为 */
export const CULTIVATION_REALM_EXP_PER_TICK = 1;

/** 修炼状态的可见 Buff 标识。 */
export const CULTIVATION_BUFF_ID = 'cultivation:active';

/** 开启或关闭修炼状态所依赖的行动 ID。 */
export const CULTIVATION_ACTION_ID = 'cultivation:toggle';

/** 修炼状态 Buff 的展示持续期，按 tick 刷新。 */
export const CULTIVATION_BUFF_DURATION = 1;

/** 闲置自动修炼延迟（息） */
export const AUTO_IDLE_CULTIVATION_DELAY_TICKS = 10;

/** 玩家境界与功法境界存在差距时，每级功法经验乘算修正幅度。 */
export const TECHNIQUE_EXP_LEVEL_DELTA_MULTIPLIER_STEP = 0.3;

/** 学习高于自身过多境界的功法时，触发学习前确认提示的境界差阈值。 */
export const TECHNIQUE_LEARNING_HEAVY_DECAY_WARNING_DELTA = 5;

/** 斩断或补回单系灵根时，按当前境界修为上限扣除的比例。 */
export const HEAVEN_GATE_SEVER_COST_RATIO = 0.1;

/** 逆天改命与灵根幼苗折算底蕴时，按当前境界修为上限扣除的比例。 */
export const HEAVEN_GATE_REROLL_COST_RATIO = 0.25;

/** 使用碎灵丹时，按当前已有境界修为扣除的比例。 */
export const SHATTER_SPIRIT_PILL_COST_RATIO = 0.25;

/** 炼体第一层所需经验 */
export const BODY_TRAINING_EXP_BASE = 10000;

/** 炼体每层经验增长倍率 */
export const BODY_TRAINING_EXP_GROWTH_RATE = 1.2;

/** 灌注 1 点底蕴可转化的炼体经验 */
export const BODY_TRAINING_FOUNDATION_EXP_MULTIPLIER = 5;

/** 炼体百分比提升覆盖的六维属性键 */
export const BODY_TRAINING_ATTR_KEYS: AttrKey[] = ATTR_KEYS;

/** 炼体每层提供的全属性百分比加成 */
export const BODY_TRAINING_ATTR_PERCENT_PER_LEVEL = 1;

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
  mortal: { constitution: 44, spirit: 44, perception: 44, talent: 44, strength: 44, meridians: 44 },
  yellow: { constitution: 64, spirit: 64, perception: 64, talent: 64, strength: 64, meridians: 64 },
  mystic: { constitution: 140, spirit: 140, perception: 140, talent: 140, strength: 140, meridians: 140 },
  earth: { constitution: 220, spirit: 220, perception: 220, talent: 220, strength: 220, meridians: 220 },
  heaven: { constitution: 440, spirit: 440, perception: 440, talent: 440, strength: 440, meridians: 440 },
  spirit: { constitution: 880, spirit: 880, perception: 880, talent: 880, strength: 880, meridians: 880 },
  saint: { constitution: 1760, spirit: 1760, perception: 1760, talent: 1760, strength: 1760, meridians: 1760 },
  emperor: { constitution: 3520, spirit: 3520, perception: 3520, talent: 3520, strength: 3520, meridians: 3520 },
};

/** 软衰减对数曲线的缩放系数 */
export const TECHNIQUE_GRADE_ATTR_DECAY_K = 0.8;

/** 各品阶属性软衰减跨度（控制衰减速率） */
export const TECHNIQUE_GRADE_ATTR_DECAY_SPANS: Record<TechniqueGrade, Attributes> = {
  mortal: { constitution: 35.2, spirit: 35.2, perception: 35.2, talent: 35.2, strength: 35.2, meridians: 35.2 },
  yellow: { constitution: 51.2, spirit: 51.2, perception: 51.2, talent: 51.2, strength: 51.2, meridians: 51.2 },
  mystic: { constitution: 112, spirit: 112, perception: 112, talent: 112, strength: 112, meridians: 112 },
  earth: { constitution: 176, spirit: 176, perception: 176, talent: 176, strength: 176, meridians: 176 },
  heaven: { constitution: 352, spirit: 352, perception: 352, talent: 352, strength: 352, meridians: 352 },
  spirit: { constitution: 704, spirit: 704, perception: 704, talent: 704, strength: 704, meridians: 704 },
  saint: { constitution: 1408, spirit: 1408, perception: 1408, talent: 1408, strength: 1408, meridians: 1408 },
  emperor: { constitution: 2816, spirit: 2816, perception: 2816, talent: 2816, strength: 2816, meridians: 2816 },
};
