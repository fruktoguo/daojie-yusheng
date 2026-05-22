/**
 * 本文件定义前后端共享的玩法常量，是协议和运行规则共同依赖的稳定来源。
 *
 * 维护时要同步检查客户端展示、服务端结算和配置编辑器，避免同一数值在多端分叉。
 */
import type { FengShuiGrade, RoomRole } from '../../fengshui-types';
import type { FiveElement } from '../../building-types';

export const FENGSHUI_ELEMENT_KEYS: readonly Exclude<FiveElement, 'neutral'>[] = [
  'metal',
  'wood',
  'water',
  'fire',
  'earth',
] as const;

export const FENGSHUI_ELEMENT_INDEX: Record<Exclude<FiveElement, 'neutral'>, number> = {
  metal: 0,
  wood: 1,
  water: 2,
  fire: 3,
  earth: 4,
};

export const FENGSHUI_GENERATES: Record<Exclude<FiveElement, 'neutral'>, Exclude<FiveElement, 'neutral'>> = {
  wood: 'fire',
  fire: 'earth',
  earth: 'metal',
  metal: 'water',
  water: 'wood',
};

export const FENGSHUI_CONTROLS: Record<Exclude<FiveElement, 'neutral'>, Exclude<FiveElement, 'neutral'>> = {
  wood: 'earth',
  earth: 'water',
  water: 'fire',
  fire: 'metal',
  metal: 'wood',
};

export const FENGSHUI_GRADE_THRESHOLDS: ReadonlyArray<{ grade: FengShuiGrade; minScore: number }> = [
  { grade: 'paradise', minScore: 900 },
  { grade: 'blessed', minScore: 750 },
  { grade: 'great_good', minScore: 600 },
  { grade: 'good', minScore: 400 },
  { grade: 'minor_good', minScore: 200 },
  { grade: 'plain', minScore: 0 },
  { grade: 'minor_bad', minScore: -200 },
  { grade: 'bad', minScore: -400 },
  { grade: 'great_bad', minScore: -600 },
  { grade: 'disaster', minScore: -800 },
  { grade: 'calamity', minScore: -1000 },
] as const;

export const FENGSHUI_DEFAULT_FUNCTION_ELEMENT_BY_ROOM_ROLE: Record<RoomRole, FiveElement> = {
  generic: 'neutral',
  outdoor: 'neutral',
  courtyard: 'wood',
  meditation: 'water',
  alchemy: 'fire',
  artifact: 'metal',
  storage: 'earth',
  bedroom: 'wood',
  sect_hall: 'earth',
  formation_core: 'neutral',
};

export const FENGSHUI_SCORE_MIN = -1000;
export const FENGSHUI_SCORE_MAX = 1000;
export const FENGSHUI_BASE_SCORE = 0;
