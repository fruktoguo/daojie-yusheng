import { buildQiResourceKey } from '@mud/shared';

/** 血精石物品 ID。 */
export const BLOOD_ESSENCE_ITEM_ID = 'stone.blood_essence';
/** 血精石每颗捏碎提供的煞气。 */
export const BLOOD_ESSENCE_SHA_GAIN = 10;

/** 玩家互杀后附加的神魂受损 Debuff ID。 */
export const PVP_SOUL_INJURY_BUFF_ID = 'pvp.soul_injury';
/** 神魂受损的来源标识。 */
export const PVP_SOUL_INJURY_SOURCE_ID = 'pvp.kill';
/** 神魂受损持续时间。 */
export const PVP_SOUL_INJURY_DURATION_TICKS = 3600;

/** 玩家击杀后叠加的煞气入体 Buff ID。 */
export const PVP_SHA_INFUSION_BUFF_ID = 'pvp.sha_infusion';
/** 煞气入体的来源标识。 */
export const PVP_SHA_INFUSION_SOURCE_ID = 'pvp.kill';
/** 煞气入体提供的攻击增幅上限百分比。 */
export const PVP_SHA_INFUSION_ATTACK_CAP_PERCENT = 100;
/** 煞气入体每层衰减间隔。 */
export const PVP_SHA_INFUSION_DECAY_TICKS = 600;
/** 煞气反噬 Debuff ID。 */
export const PVP_SHA_BACKLASH_BUFF_ID = 'pvp.sha_backlash';
/** 煞气反噬来源标识。 */
export const PVP_SHA_BACKLASH_SOURCE_ID = 'pvp.sha_backlash';
/** 煞气反噬每层攻击/防御降低百分比。 */
export const PVP_SHA_BACKLASH_PERCENT_PER_STACK = 2;
/** 煞气反噬每层衰减间隔。 */
export const PVP_SHA_BACKLASH_DECAY_TICKS = 600;
/** 煞气反噬按煞气入体层数折算时的除数。 */
export const PVP_SHA_BACKLASH_STACK_DIVISOR = 2;
/** 煞气入体超过该层数后会被视为魔染目标。 */
export const PVP_SHA_DEMONIZED_STACK_THRESHOLD = 20;

/** 血精石与尸身残煞注入的凝练煞气资源键。 */
export const REFINED_SHA_RESOURCE_KEY = buildQiResourceKey({
  family: 'sha',
  form: 'refined',
  element: 'neutral',
});
