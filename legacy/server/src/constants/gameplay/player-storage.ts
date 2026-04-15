/**
 * 玩家存档序列化相关常量。
 */

import { TECHNIQUE_GRADE_ORDER, type TechniqueGrade } from '@mud/shared';

/** 合法的功法品阶顺序。 */
export const TECHNIQUE_GRADES: readonly TechniqueGrade[] = TECHNIQUE_GRADE_ORDER;

/** 修炼状态 Buff ID。 */
export const CULTIVATION_BUFF_ID = 'cultivation:active';

/** 修炼开关动作 ID。 */
export const CULTIVATION_ACTION_ID = 'cultivation:toggle';
