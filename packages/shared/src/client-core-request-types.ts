import type { ElementKey } from './numeric';
import type { AutoBattleSkillConfig, AutoBattleTargetingMode, AutoUsePillConfig, CombatTargetingRules } from './automation-types';
import type { Direction } from './world-core-types';

/** 握手就绪声明。 */
export interface HelloRequestView {
  sessionId?: string;
  mapId?: string;
  preferredX?: number;
  preferredY?: number;
}

/** 移动指令。 */
export interface MoveRequestView {
  d: Direction;
}

/** 点击目标点移动。 */
export interface MoveToRequestView {
  x: number;
  y: number;
  ignoreVisibilityLimit?: boolean;
  allowNearestReachable?: boolean;
  packedPath?: string;
  packedPathSteps?: number;
  pathStartX?: number;
  pathStartY?: number;
}

/** 任务自动导航请求。 */
export interface NavigateQuestRequestView {
  questId: string;
}

/** 在线心跳。 */
export interface HeartbeatRequestView {
  clientAt?: number;
}

/** 主动延迟探测。 */
export interface PingRequestView {
  clientAt: number;
}

/** 地图格子运行时详情查询。 */
export interface InspectTileRuntimeRequestView {
  x: number;
  y: number;
}

/** 动作指令。 */
export interface ActionRequestView {
  type?: string;
  actionId?: string;
  target?: string;
}

/** 自动战斗技能配置更新。 */
export interface UpdateAutoBattleSkillsRequestView {
  skills: AutoBattleSkillConfig[];
}

/** 自动用药配置更新。 */
export interface UpdateAutoUsePillsRequestView {
  pills: AutoUsePillConfig[];
}

/** 自动战斗目标规则更新。 */
export interface UpdateCombatTargetingRulesRequestView {
  combatTargetingRules: CombatTargetingRules;
}

/** 自动战斗目标模式更新。 */
export interface UpdateAutoBattleTargetingModeRequestView {
  mode: AutoBattleTargetingMode;
}

/** 功法技能开关更新。 */
export interface UpdateTechniqueSkillAvailabilityRequestView {
  techId: string;
  enabled: boolean;
}

/** 调试回出生点。 */
export interface DebugResetSpawnRequestView {
  force?: boolean;
}

/** 聊天消息。 */
export interface ChatRequestView {
  message: string;
}

/** 系统消息已读回执。 */
export interface AckSystemMessagesRequestView {
  ids: string[];
}

/** 请求触发当前位置传送点。 */
export interface UsePortalRequestView {}

/** 天门功能操作。 */
export interface HeavenGateActionRequestView {
  action: 'sever' | 'restore' | 'open' | 'reroll' | 'enter';
  element?: ElementKey;
}
