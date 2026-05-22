/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/** 可并入统一技艺活动框架的技艺键。 */
export type TechniqueActivityKind = 'alchemy' | 'forging' | 'enhancement' | 'gather' | 'building' | 'mining';

/** 当前已经接入 runtime 活动主链的技艺键。 */
export type RuntimeTechniqueActivityKind = 'alchemy' | 'forging' | 'enhancement' | 'gather' | 'building' | 'mining';

/** 技艺活动通用中断原因。 */
export type TechniqueActivityInterruptReason = 'move' | 'attack' | 'cancel' | 'cultivate';

/** 技艺经验成长公共状态。 */
export interface TechniqueSkillProgressState {
  level: number;
  exp: number;
  expToNext: number;
}

/** 技艺活动生命周期公共状态。 */
export interface TechniqueActivityJobBase {
  startedAt: number;
  totalTicks: number;
  remainingTicks: number;
  pausedTicks: number;
  successRate: number;
  spiritStoneCost: number;
}

/** 已接入 runtime 的技艺活动顺序。 */
export const RUNTIME_TECHNIQUE_ACTIVITY_KINDS = [
  'alchemy',
  'forging',
  'enhancement',
  'gather',
  'building',
  'mining',
] as const satisfies readonly RuntimeTechniqueActivityKind[];
