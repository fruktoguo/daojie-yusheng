/**
 * 世界服务编排常量。
 */

import { DEFAULT_RATIO_DIVISOR, type NumericRatioDivisors } from '@mud/shared';

/** 空世界更新结果，占位表示本次没有任何变化。 */
export const EMPTY_UPDATE = {
  messages: [] as Array<{
    playerId: string;
    text: string;
    kind?: 'system' | 'quest' | 'combat' | 'loot';
    floating?: {
      x: number;
      y: number;
      text: string;
      color?: string;
    };
  }>,
  dirty: [] as Array<'inv' | 'quest' | 'actions' | 'tech' | 'attr' | 'loot'>,
};

/** 怪物观测数值缺省分母。 */
export const DEFAULT_MONSTER_RATIO_DIVISORS: NumericRatioDivisors = {
  dodge: DEFAULT_RATIO_DIVISOR,
  crit: DEFAULT_RATIO_DIVISOR,
  breakPower: DEFAULT_RATIO_DIVISOR,
  resolvePower: DEFAULT_RATIO_DIVISOR,
  cooldownSpeed: DEFAULT_RATIO_DIVISOR,
  moveSpeed: DEFAULT_RATIO_DIVISOR,
  elementDamageReduce: {
    metal: DEFAULT_RATIO_DIVISOR,
    wood: DEFAULT_RATIO_DIVISOR,
    water: DEFAULT_RATIO_DIVISOR,
    fire: DEFAULT_RATIO_DIVISOR,
    earth: DEFAULT_RATIO_DIVISOR,
  },
};

/** 观察达到完全识别所需的神识比值。 */
export const OBSERVATION_FULL_RATIO = 1.2;

/** 观察近似失明时的神识比值。 */
export const OBSERVATION_BLIND_RATIO = 0.2;

/** 同格玩家达到该人数后，地图广播改为单个人群实体。 */
export const PLAYER_CROWD_RENDER_THRESHOLD = 5;

/** 人群人数超过该值后，地图名称改为“人山人海”。 */
export const PLAYER_CROWD_DENSE_NAME_THRESHOLD = 20;

/** 人群实体在地图上的单字符标记。 */
export const PLAYER_CROWD_CHAR = '众';

/** 普通人群实体颜色。 */
export const PLAYER_CROWD_COLOR = '#d8c27a';

/** 高密度人群实体颜色。 */
export const PLAYER_CROWD_DENSE_COLOR = '#e7a95f';

/** 不同 NPC 角色的存在感预设。 */
export const NPC_ROLE_PROFILES: Record<string, { title: string; spirit: number; hp: number; qi: number }> = {
  quest_giver: { title: '引路前辈', spirit: 30, hp: 96, qi: 132 },
  support: { title: '养脉修者', spirit: 26, hp: 82, qi: 120 },
  craft: { title: '炉火匠人', spirit: 18, hp: 108, qi: 74 },
  lore: { title: '守卷旧识', spirit: 28, hp: 72, qi: 118 },
  quest_hint: { title: '路引修者', spirit: 14, hp: 64, qi: 52 },
  warning: { title: '示警修士', spirit: 16, hp: 70, qi: 58 },
  scene: { title: '器物残痕', spirit: 2, hp: 44, qi: 0 },
};
