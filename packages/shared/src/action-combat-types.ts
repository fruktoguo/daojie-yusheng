import type { GridPoint } from './targeting';

/**
 * 行动定义与战斗表现相关的共享类型。
 */

/** 行动类型。 */
export type ActionType = 'skill' | 'gather' | 'interact' | 'quest' | 'toggle' | 'battle' | 'travel' | 'breakthrough';

/** 行动定义。 */
export interface ActionDef {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * type：type相关字段。
 */

  type: ActionType;  
  /**
 * desc：desc相关字段。
 */

  desc: string;  
  /**
 * cooldownLeft：冷却Left相关字段。
 */

  cooldownLeft: number;  
  /**
 * range：范围相关字段。
 */

  range?: number;  
  /**
 * requiresTarget：require目标相关字段。
 */

  requiresTarget?: boolean;  
  /**
 * targetMode：目标Mode相关字段。
 */

  targetMode?: 'any' | 'entity' | 'tile';  
  /**
 * autoBattleEnabled：启用开关或状态标识。
 */

  autoBattleEnabled?: boolean;  
  /**
 * autoBattleOrder：autoBattle订单相关字段。
 */

  autoBattleOrder?: number;  
  /**
 * skillEnabled：启用开关或状态标识。
 */

  skillEnabled?: boolean;
}

/** 战斗攻击特效。 */
export interface CombatEffectAttack {
/**
 * type：type相关字段。
 */

  type: 'attack';  
  /**
 * fromX：fromX相关字段。
 */

  fromX: number;  
  /**
 * fromY：fromY相关字段。
 */

  fromY: number;  
  /**
 * toX：toX相关字段。
 */

  toX: number;  
  /**
 * toY：toY相关字段。
 */

  toY: number;  
  /**
 * color：color相关字段。
 */

  color?: string;
}

/** 战斗飘字特效。 */
export interface CombatEffectFloat {
/**
 * type：type相关字段。
 */

  type: 'float';  
  /**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;  
  /**
 * text：text名称或显示文本。
 */

  text: string;  
  /**
 * color：color相关字段。
 */

  color?: string;  
  /**
 * variant：variant相关字段。
 */

  variant?: 'damage' | 'action';  
  /**
 * actionStyle：actionStyle相关字段。
 */

  actionStyle?: 'default' | 'divine' | 'chant';  
  /**
 * durationMs：durationM相关字段。
 */

  durationMs?: number;
}

/** 战斗地块警戒特效。 */
export interface CombatEffectWarningZone {
/**
 * type：type相关字段。
 */

  type: 'warning_zone';  
  /**
 * cells：cell相关字段。
 */

  cells: GridPoint[];  
  /**
 * color：color相关字段。
 */

  color?: string;  
  /**
 * baseColor：baseColor相关字段。
 */

  baseColor?: string;  
  /**
 * originX：originX相关字段。
 */

  originX?: number;  
  /**
 * originY：originY相关字段。
 */

  originY?: number;  
  /**
 * durationMs：durationM相关字段。
 */

  durationMs?: number;
}

/** 战斗特效联合类型。 */
export type CombatEffect = CombatEffectAttack | CombatEffectFloat | CombatEffectWarningZone;
