/**
 * 内容服务加载与校验常量。
 */

import { GAME_TIME_PHASES, PlayerRealmStage, type EquipmentTrigger, type TimePhaseId } from '@mud/shared';

/** 玩家大境界对应的等级区间。 */
export const PLAYER_REALM_STAGE_LEVEL_RANGES: Record<PlayerRealmStage, { levelFrom: number; levelTo: number }> = {
  [PlayerRealmStage.Mortal]: { levelFrom: 1, levelTo: 5 },
  [PlayerRealmStage.BodyTempering]: { levelFrom: 6, levelTo: 8 },
  [PlayerRealmStage.BoneForging]: { levelFrom: 9, levelTo: 12 },
  [PlayerRealmStage.Meridian]: { levelFrom: 13, levelTo: 15 },
  [PlayerRealmStage.Innate]: { levelFrom: 16, levelTo: 18 },
  [PlayerRealmStage.QiRefining]: { levelFrom: 19, levelTo: 30 },
  [PlayerRealmStage.Foundation]: { levelFrom: 31, levelTo: 42 },
};

/** 合法的装备触发器列表。 */
export const EQUIPMENT_TRIGGERS: readonly EquipmentTrigger[] = [
  'on_equip',
  'on_unequip',
  'on_tick',
  'on_move',
  'on_attack',
  'on_hit',
  'on_kill',
  'on_skill_cast',
  'on_cultivation_tick',
  'on_time_segment_changed',
  'on_enter_map',
];

/** 合法的时间阶段 ID 列表。 */
export const TIME_PHASE_IDS: readonly TimePhaseId[] = GAME_TIME_PHASES.map((phase) => phase.id);
