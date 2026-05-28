/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/** 可并入统一技艺活动框架的技艺键。 */
export type TechniqueActivityKind = 'alchemy' | 'forging' | 'enhancement' | 'transmission' | 'gather' | 'building' | 'mining' | 'formation';

/** 当前已经接入 runtime 活动主链的技艺键。 */
export type RuntimeTechniqueActivityKind = 'alchemy' | 'forging' | 'enhancement' | 'transmission' | 'gather' | 'building' | 'mining' | 'formation';

/** 统一任务列表可展示的任务键。 */
export type TechniqueActivityTaskKind = RuntimeTechniqueActivityKind;

/** 技艺活动通用中断原因。 */
export type TechniqueActivityInterruptReason = 'move' | 'attack' | 'cancel' | 'cultivate' | 'defeat';

/** 技艺活动任务视图状态。 */
export type TechniqueActivityTaskState =
  | 'running'
  | 'interrupt_wait'
  | 'queued'
  | 'sleeping'
  | 'blocked'
  | 'completing';

/** 技艺经验成长公共状态。 */
export interface TechniqueSkillProgressState {
  level: number;
  exp: number;
  expToNext: number;
}

/** 技艺活动打断等待状态：只控制恢复等待，不计入实际工作量。 */
export interface TechniqueActivityInterruptState {
  reason: TechniqueActivityInterruptReason;
  waitTotalTicks: number;
  waitRemainingTicks: number;
  startedAtTick: number;
}

/** 技艺任务取消引用，既可指向当前 job，也可指向队列项。 */
export interface TechniqueActivityCancelRef {
  kind: TechniqueActivityTaskKind;
  jobRunId?: string;
  queueId?: string;
  techId?: string;
}

/** 技艺活动生命周期公共状态。 */
export interface TechniqueActivityJobBase {
  startedAt: number;
  /**
   * 目标态实际工作总量。旧 job 兼容期仍可只写 totalTicks。
   * UI 进度应优先使用 workTotalTicks/workRemainingTicks。
   */
  workTotalTicks?: number;
  /** 目标态实际剩余工作量，不包含打断等待。 */
  workRemainingTicks?: number;
  /** 目标态打断等待剩余息数，不参与实际进度百分比。 */
  interruptWaitRemainingTicks?: number;
  /** 目标态结构化打断等待状态。 */
  interruptState?: TechniqueActivityInterruptState | null;
  /** 旧字段：兼容历史 job，总量可能被暂停逻辑污染。 */
  totalTicks: number;
  /** 旧字段：兼容历史 job，剩余量可能被暂停逻辑污染。 */
  remainingTicks: number;
  /** 旧字段：兼容历史 job，后续应迁移为 interruptState。 */
  pausedTicks: number;
  successRate: number;
  spiritStoneCost: number;
}

/** 技艺面板统一任务视图。 */
export interface TechniqueActivityTaskView {
  id: string;
  kind: TechniqueActivityTaskKind;
  label: string;
  targetLabel?: string;
  state: TechniqueActivityTaskState;
  workTotalTicks?: number;
  workRemainingTicks?: number;
  /** 当前每息可推进的工作量，主要用于传法/领悟估算。 */
  progressGainPerTick?: number;
  /** 按当前速率估算的剩余完成息数。 */
  estimatedRemainingTicks?: number;
  interruptWaitRemainingTicks?: number;
  sleepReason?: string;
  canCancel: boolean;
  cancelRef: TechniqueActivityCancelRef;
}

/** 技艺任务列表增量。 */
export interface TechniqueActivityTaskPatch {
  upsert?: TechniqueActivityTaskView[];
  removeIds?: string[];
  serverTick?: number;
}

/** 技艺任务列表完整同步。 */
export interface TechniqueActivityTaskListView {
  tasks: TechniqueActivityTaskView[];
  serverTick?: number;
}

/** 已接入 runtime 的技艺活动顺序。 */
export const RUNTIME_TECHNIQUE_ACTIVITY_KINDS = [
  'alchemy',
  'forging',
  'enhancement',
  'transmission',
  'formation',
  'gather',
  'mining',
  'building',
] as const satisfies readonly RuntimeTechniqueActivityKind[];
