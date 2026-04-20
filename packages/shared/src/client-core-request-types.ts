import type { ElementKey } from './numeric';
import type { AutoBattleSkillConfig, AutoBattleTargetingMode, AutoUsePillConfig, CombatTargetingRules } from './automation-types';
import type { Direction } from './world-core-types';

/** 握手就绪声明。 */
export interface HelloRequestView {
/**
 * sessionId：sessionID标识。
 */

  sessionId?: string;  
  /**
 * mapId：地图ID标识。
 */

  mapId?: string;  
  /**
 * preferredX：preferredX相关字段。
 */

  preferredX?: number;  
  /**
 * preferredY：preferredY相关字段。
 */

  preferredY?: number;
}

/** 移动指令。 */
export interface MoveRequestView {
/**
 * d：d相关字段。
 */

  d: Direction;
}

/** 点击目标点移动。 */
export interface MoveToRequestView {
/**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;  
  /**
 * ignoreVisibilityLimit：ignore可见性Limit相关字段。
 */

  ignoreVisibilityLimit?: boolean;  
  /**
 * allowNearestReachable：allowNearestReachable相关字段。
 */

  allowNearestReachable?: boolean;  
  /**
 * packedPath：packed路径相关字段。
 */

  packedPath?: string;  
  /**
 * packedPathSteps：packed路径Step相关字段。
 */

  packedPathSteps?: number;  
  /**
 * pathStartX：路径StartX相关字段。
 */

  pathStartX?: number;  
  /**
 * pathStartY：路径StartY相关字段。
 */

  pathStartY?: number;
}

/** 任务自动导航请求。 */
export interface NavigateQuestRequestView {
/**
 * questId：任务ID标识。
 */

  questId: string;
}

/** 在线心跳。 */
export interface HeartbeatRequestView {
/**
 * clientAt：clientAt相关字段。
 */

  clientAt?: number;
}

/** 主动延迟探测。 */
export interface PingRequestView {
/**
 * clientAt：clientAt相关字段。
 */

  clientAt: number;
}

/** 地图格子运行时详情查询。 */
export interface InspectTileRuntimeRequestView {
/**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;
}

/** 动作指令。 */
export interface ActionRequestView {
/**
 * type：type相关字段。
 */

  type?: string;  
  /**
 * actionId：actionID标识。
 */

  actionId?: string;  
  /**
 * target：目标相关字段。
 */

  target?: string;
}

/** 自动战斗技能配置更新。 */
export interface UpdateAutoBattleSkillsRequestView {
/**
 * skills：技能相关字段。
 */

  skills: AutoBattleSkillConfig[];
}

/** 自动用药配置更新。 */
export interface UpdateAutoUsePillsRequestView {
/**
 * pills：pill相关字段。
 */

  pills: AutoUsePillConfig[];
}

/** 自动战斗目标规则更新。 */
export interface UpdateCombatTargetingRulesRequestView {
/**
 * combatTargetingRules：战斗TargetingRule相关字段。
 */

  combatTargetingRules: CombatTargetingRules;
}

/** 自动战斗目标模式更新。 */
export interface UpdateAutoBattleTargetingModeRequestView {
/**
 * mode：mode相关字段。
 */

  mode: AutoBattleTargetingMode;
}

/** 功法技能开关更新。 */
export interface UpdateTechniqueSkillAvailabilityRequestView {
/**
 * techId：techID标识。
 */

  techId: string;  
  /**
 * enabled：启用开关或状态标识。
 */

  enabled: boolean;
}

/** 调试回出生点。 */
export interface DebugResetSpawnRequestView {
/**
 * force：force相关字段。
 */

  force?: boolean;
}

/** 聊天消息。 */
export interface ChatRequestView {
/**
 * message：message相关字段。
 */

  message: string;
}

/** 系统消息已读回执。 */
export interface AckSystemMessagesRequestView {
/**
 * ids：ID相关字段。
 */

  ids: string[];
}

/** 请求触发当前位置传送点。 */
export interface UsePortalRequestView {}

/** 天门功能操作。 */
export interface HeavenGateActionRequestView {
/**
 * action：action相关字段。
 */

  action: 'sever' | 'restore' | 'open' | 'reroll' | 'enter';  
  /**
 * element：element相关字段。
 */

  element?: ElementKey;
}
