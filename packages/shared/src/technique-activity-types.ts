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
