import { buildQiResourceKey } from '@mud/shared-next';

export const BLOOD_ESSENCE_ITEM_ID = 'stone.blood_essence';
export const BLOOD_ESSENCE_SHA_GAIN = 10;

export const PVP_SOUL_INJURY_BUFF_ID = 'pvp.soul_injury';
export const PVP_SOUL_INJURY_SOURCE_ID = 'pvp.kill';
export const PVP_SOUL_INJURY_DURATION_TICKS = 3600;

export const PVP_SHA_INFUSION_BUFF_ID = 'pvp.sha_infusion';
export const PVP_SHA_INFUSION_SOURCE_ID = 'pvp.kill';
export const PVP_SHA_INFUSION_ATTACK_CAP_PERCENT = 100;
export const PVP_SHA_INFUSION_DECAY_TICKS = 600;

export const PVP_SHA_BACKLASH_BUFF_ID = 'pvp.sha_backlash';
export const PVP_SHA_BACKLASH_SOURCE_ID = 'pvp.sha_backlash';
export const PVP_SHA_BACKLASH_PERCENT_PER_STACK = 2;
export const PVP_SHA_BACKLASH_DECAY_TICKS = 600;
export const PVP_SHA_BACKLASH_STACK_DIVISOR = 2;
export const PVP_SHA_DEMONIZED_STACK_THRESHOLD = 20;

export const REFINED_SHA_RESOURCE_KEY = buildQiResourceKey({
  family: 'sha',
  form: 'refined',
  element: 'neutral',
});
