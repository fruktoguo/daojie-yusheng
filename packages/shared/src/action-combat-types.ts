import type { GridPoint } from './targeting';

/**
 * 行动定义与战斗表现相关的共享类型。
 */

/** 行动类型。 */
export type ActionType = 'skill' | 'gather' | 'interact' | 'quest' | 'toggle' | 'battle' | 'travel' | 'breakthrough';

/** 行动定义。 */
export interface ActionDef {
/**
 * id：ActionDef 内部字段。
 */

  id: string;  
  /**
 * name：ActionDef 内部字段。
 */

  name: string;  
  /**
 * type：ActionDef 内部字段。
 */

  type: ActionType;  
  /**
 * desc：ActionDef 内部字段。
 */

  desc: string;  
  /**
 * cooldownLeft：ActionDef 内部字段。
 */

  cooldownLeft: number;  
  /**
 * range：ActionDef 内部字段。
 */

  range?: number;  
  /**
 * requiresTarget：ActionDef 内部字段。
 */

  requiresTarget?: boolean;  
  /**
 * targetMode：ActionDef 内部字段。
 */

  targetMode?: 'any' | 'entity' | 'tile';  
  /**
 * autoBattleEnabled：ActionDef 内部字段。
 */

  autoBattleEnabled?: boolean;  
  /**
 * autoBattleOrder：ActionDef 内部字段。
 */

  autoBattleOrder?: number;  
  /**
 * skillEnabled：ActionDef 内部字段。
 */

  skillEnabled?: boolean;
}

/** 战斗攻击特效。 */
export interface CombatEffectAttack {
/**
 * type：CombatEffectAttack 内部字段。
 */

  type: 'attack';  
  /**
 * fromX：CombatEffectAttack 内部字段。
 */

  fromX: number;  
  /**
 * fromY：CombatEffectAttack 内部字段。
 */

  fromY: number;  
  /**
 * toX：CombatEffectAttack 内部字段。
 */

  toX: number;  
  /**
 * toY：CombatEffectAttack 内部字段。
 */

  toY: number;  
  /**
 * color：CombatEffectAttack 内部字段。
 */

  color?: string;
}

/** 战斗飘字特效。 */
export interface CombatEffectFloat {
/**
 * type：CombatEffectFloat 内部字段。
 */

  type: 'float';  
  /**
 * x：CombatEffectFloat 内部字段。
 */

  x: number;  
  /**
 * y：CombatEffectFloat 内部字段。
 */

  y: number;  
  /**
 * text：CombatEffectFloat 内部字段。
 */

  text: string;  
  /**
 * color：CombatEffectFloat 内部字段。
 */

  color?: string;  
  /**
 * variant：CombatEffectFloat 内部字段。
 */

  variant?: 'damage' | 'action';  
  /**
 * actionStyle：CombatEffectFloat 内部字段。
 */

  actionStyle?: 'default' | 'divine' | 'chant';  
  /**
 * durationMs：CombatEffectFloat 内部字段。
 */

  durationMs?: number;
}

/** 战斗地块警戒特效。 */
export interface CombatEffectWarningZone {
/**
 * type：CombatEffectWarningZone 内部字段。
 */

  type: 'warning_zone';  
  /**
 * cells：CombatEffectWarningZone 内部字段。
 */

  cells: GridPoint[];  
  /**
 * color：CombatEffectWarningZone 内部字段。
 */

  color?: string;  
  /**
 * baseColor：CombatEffectWarningZone 内部字段。
 */

  baseColor?: string;  
  /**
 * originX：CombatEffectWarningZone 内部字段。
 */

  originX?: number;  
  /**
 * originY：CombatEffectWarningZone 内部字段。
 */

  originY?: number;  
  /**
 * durationMs：CombatEffectWarningZone 内部字段。
 */

  durationMs?: number;
}

/** 战斗特效联合类型。 */
export type CombatEffect = CombatEffectAttack | CombatEffectFloat | CombatEffectWarningZone;
