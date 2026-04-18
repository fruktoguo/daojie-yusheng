import type { GridPoint } from './targeting';

/**
 * 行动定义与战斗表现相关的共享类型。
 */

/** 行动类型。 */
export type ActionType = 'skill' | 'gather' | 'interact' | 'quest' | 'toggle' | 'battle' | 'travel' | 'breakthrough';

/** 行动定义。 */
export interface ActionDef {
  id: string;
  name: string;
  type: ActionType;
  desc: string;
  cooldownLeft: number;
  range?: number;
  requiresTarget?: boolean;
  targetMode?: 'any' | 'entity' | 'tile';
  autoBattleEnabled?: boolean;
  autoBattleOrder?: number;
  skillEnabled?: boolean;
}

/** 战斗攻击特效。 */
export interface CombatEffectAttack {
  type: 'attack';
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color?: string;
}

/** 战斗飘字特效。 */
export interface CombatEffectFloat {
  type: 'float';
  x: number;
  y: number;
  text: string;
  color?: string;
  variant?: 'damage' | 'action';
  actionStyle?: 'default' | 'divine' | 'chant';
  durationMs?: number;
}

/** 战斗地块警戒特效。 */
export interface CombatEffectWarningZone {
  type: 'warning_zone';
  cells: GridPoint[];
  color?: string;
  baseColor?: string;
  originX?: number;
  originY?: number;
  durationMs?: number;
}

/** 战斗特效联合类型。 */
export type CombatEffect = CombatEffectAttack | CombatEffectFloat | CombatEffectWarningZone;
