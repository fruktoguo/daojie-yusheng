import type { ElementKey } from './numeric';
import type { AutoBattleSkillConfig, AutoBattleTargetingMode, AutoUsePillConfig, CombatTargetingRules } from './automation-types';
import type { Direction } from './world-core-types';

/** 握手就绪声明。 */
export interface HelloRequestView {
/**
 * sessionId：HelloRequestView 内部字段。
 */

  sessionId?: string;  
  /**
 * mapId：HelloRequestView 内部字段。
 */

  mapId?: string;  
  /**
 * preferredX：HelloRequestView 内部字段。
 */

  preferredX?: number;  
  /**
 * preferredY：HelloRequestView 内部字段。
 */

  preferredY?: number;
}

/** 移动指令。 */
export interface MoveRequestView {
/**
 * d：MoveRequestView 内部字段。
 */

  d: Direction;
}

/** 点击目标点移动。 */
export interface MoveToRequestView {
/**
 * x：MoveToRequestView 内部字段。
 */

  x: number;  
  /**
 * y：MoveToRequestView 内部字段。
 */

  y: number;  
  /**
 * ignoreVisibilityLimit：MoveToRequestView 内部字段。
 */

  ignoreVisibilityLimit?: boolean;  
  /**
 * allowNearestReachable：MoveToRequestView 内部字段。
 */

  allowNearestReachable?: boolean;  
  /**
 * packedPath：MoveToRequestView 内部字段。
 */

  packedPath?: string;  
  /**
 * packedPathSteps：MoveToRequestView 内部字段。
 */

  packedPathSteps?: number;  
  /**
 * pathStartX：MoveToRequestView 内部字段。
 */

  pathStartX?: number;  
  /**
 * pathStartY：MoveToRequestView 内部字段。
 */

  pathStartY?: number;
}

/** 任务自动导航请求。 */
export interface NavigateQuestRequestView {
/**
 * questId：NavigateQuestRequestView 内部字段。
 */

  questId: string;
}

/** 在线心跳。 */
export interface HeartbeatRequestView {
/**
 * clientAt：HeartbeatRequestView 内部字段。
 */

  clientAt?: number;
}

/** 主动延迟探测。 */
export interface PingRequestView {
/**
 * clientAt：PingRequestView 内部字段。
 */

  clientAt: number;
}

/** 地图格子运行时详情查询。 */
export interface InspectTileRuntimeRequestView {
/**
 * x：InspectTileRuntimeRequestView 内部字段。
 */

  x: number;  
  /**
 * y：InspectTileRuntimeRequestView 内部字段。
 */

  y: number;
}

/** 动作指令。 */
export interface ActionRequestView {
/**
 * type：ActionRequestView 内部字段。
 */

  type?: string;  
  /**
 * actionId：ActionRequestView 内部字段。
 */

  actionId?: string;  
  /**
 * target：ActionRequestView 内部字段。
 */

  target?: string;
}

/** 自动战斗技能配置更新。 */
export interface UpdateAutoBattleSkillsRequestView {
/**
 * skills：UpdateAutoBattleSkillsRequestView 内部字段。
 */

  skills: AutoBattleSkillConfig[];
}

/** 自动用药配置更新。 */
export interface UpdateAutoUsePillsRequestView {
/**
 * pills：UpdateAutoUsePillsRequestView 内部字段。
 */

  pills: AutoUsePillConfig[];
}

/** 自动战斗目标规则更新。 */
export interface UpdateCombatTargetingRulesRequestView {
/**
 * combatTargetingRules：UpdateCombatTargetingRulesRequestView 内部字段。
 */

  combatTargetingRules: CombatTargetingRules;
}

/** 自动战斗目标模式更新。 */
export interface UpdateAutoBattleTargetingModeRequestView {
/**
 * mode：UpdateAutoBattleTargetingModeRequestView 内部字段。
 */

  mode: AutoBattleTargetingMode;
}

/** 功法技能开关更新。 */
export interface UpdateTechniqueSkillAvailabilityRequestView {
/**
 * techId：UpdateTechniqueSkillAvailabilityRequestView 内部字段。
 */

  techId: string;  
  /**
 * enabled：UpdateTechniqueSkillAvailabilityRequestView 内部字段。
 */

  enabled: boolean;
}

/** 调试回出生点。 */
export interface DebugResetSpawnRequestView {
/**
 * force：DebugResetSpawnRequestView 内部字段。
 */

  force?: boolean;
}

/** 聊天消息。 */
export interface ChatRequestView {
/**
 * message：ChatRequestView 内部字段。
 */

  message: string;
}

/** 系统消息已读回执。 */
export interface AckSystemMessagesRequestView {
/**
 * ids：AckSystemMessagesRequestView 内部字段。
 */

  ids: string[];
}

/** 请求触发当前位置传送点。 */
export interface UsePortalRequestView {}

/** 天门功能操作。 */
export interface HeavenGateActionRequestView {
/**
 * action：HeavenGateActionRequestView 内部字段。
 */

  action: 'sever' | 'restore' | 'open' | 'reroll' | 'enter';  
  /**
 * element：HeavenGateActionRequestView 内部字段。
 */

  element?: ElementKey;
}
