/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
import type { CraftSkillExpComputationParams } from './craft-skill';
import type { RuntimeTechniqueActivityKind } from './technique-activity-types';

// ─── 管线启动结果 ───

/** 启动校验成功。 */
export interface TechniqueActivityStartValidationSuccess<TValidated = unknown> {
  ok: true;
  validated: TValidated;
}

/** 启动校验失败。 */
export interface TechniqueActivityStartValidationError {
  ok: false;
  error: string;
}

export type TechniqueActivityStartValidationResult<TValidated = unknown> =
  | TechniqueActivityStartValidationSuccess<TValidated>
  | TechniqueActivityStartValidationError;

// ─── 管线结算结果 ───

/** 单次结算产出物品。 */
export interface TechniqueActivityOutputItem {
  itemId: string;
  count: number;
  name?: string;
}

/** 通知消息。 */
export interface TechniqueActivityNoticeMessage {
  kind: 'quest' | 'system' | 'loot' | 'warn' | 'info';
  text: string;
}

/** 策略 resolve 返回的结算结果。 */
export interface TechniqueActivityResolveResult {
  /** 本批次成功数。 */
  successCount: number;
  /** 本批次失败数。 */
  failureCount: number;
  /** 产出物品列表。 */
  outputs: TechniqueActivityOutputItem[];
  /** 经验计算参数。 */
  expParams: CraftSkillExpComputationParams;
  /** true=还有后续批次/步骤，不清理 job。 */
  advance?: boolean;
  /** true=整个 job 完成。 */
  completed?: boolean;
  /** 通知消息。 */
  messages?: TechniqueActivityNoticeMessage[];
  /** 附带的境界修为。 */
  craftRealmExpGain?: number;
}

// ─── 管线取消/退还结果 ───

/** 取消时的退还结果。 */
export interface TechniqueActivityRefundResult {
  items: TechniqueActivityOutputItem[];
  spiritStones: number;
  messages?: TechniqueActivityNoticeMessage[];
}

// ─── 条件检查结果 ───

/** 条件型技艺的条件检查结果。 */
export interface TechniqueActivityConditionCheckResult {
  satisfied: boolean;
  /** 不满足时的原因（显示用）。 */
  reason?: string;
  /** 不满足时是否应该彻底取消而非休眠（如资源已消失）。 */
  shouldCancel?: boolean;
}

// ─── 统一队列 ───

/** 队列项状态。 */
export type TechniqueActivityQueueItemState = 'pending' | 'sleeping';

/** 统一技艺队列项。 */
export interface TechniqueActivityQueueItem {
  queueId: string;
  kind: RuntimeTechniqueActivityKind;
  payload: unknown;
  label: string;
  state: TechniqueActivityQueueItemState;
  sleepReason?: string;
  sleepingSince?: number;
  /** 休眠后多少 tick 重试条件检查（避免每 tick 检查）。 */
  retryAfterTicks?: number;
  createdAt: number;
}

/** 队列入队模式。 */
export type TechniqueActivityQueueMode = 'append' | 'prepend' | 'replace';

/** 队列最大长度。 */
export const TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH = 20;

/** 条件型技艺休眠后默认重试间隔（tick 数）。 */
export const TECHNIQUE_ACTIVITY_SLEEP_RETRY_TICKS = 5;
