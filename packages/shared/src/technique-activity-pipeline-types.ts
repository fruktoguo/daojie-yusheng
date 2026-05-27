/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
import type { CraftSkillExpComputationParams } from './craft-skill';
import type { NoticeKind, StructuredNoticePayload } from './notice-types';
import type {
  RuntimeTechniqueActivityKind,
  TechniqueActivityCancelRef,
  TechniqueActivityInterruptState,
} from './technique-activity-types';

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
  kind: NoticeKind;
  /** 旧字段：兼容现有服务端文本通知。新链路应优先使用 structured。 */
  text?: string;
  /** 结构化通知载荷；服务端传 key/vars，客户端负责拼接和渲染。 */
  structured?: StructuredNoticePayload;
  /** 结构化消息 key。 */
  key?: string;
  /** 结构化消息变量。 */
  vars?: StructuredNoticePayload['vars'];
  /** 结构化消息胶囊配置。 */
  pills?: StructuredNoticePayload['pills'];
  /** 结构化消息标签。 */
  badges?: StructuredNoticePayload['badges'];
}

/** 背包 delta。公共 pipeline 只根据此 delta 执行入包/掉地，`outputs` 仅作结算摘要。 */
export interface TechniqueActivityInventoryDelta {
  consumed?: TechniqueActivityOutputItem[];
  granted?: TechniqueActivityOutputItem[];
  dropped?: TechniqueActivityOutputItem[];
  changed?: boolean;
}

/** 钱包 delta。负数表示扣除，正数表示返还或获得。 */
export interface TechniqueActivityWalletDelta {
  spiritStones?: number;
  changed?: boolean;
}

/** 装备/锁定空间 delta。 */
export interface TechniqueActivityEquipmentDelta {
  lockedItemInstanceIds?: string[];
  unlockedItemInstanceIds?: string[];
  updatedItemInstanceIds?: string[];
  changed?: boolean;
}

/** 领域记录 delta，例如强化记录。 */
export interface TechniqueActivityRecordDelta {
  recordType: 'alchemy' | 'forging' | 'enhancement' | RuntimeTechniqueActivityKind | string;
  entries?: unknown[];
  changed?: boolean;
}

/** 面板 dirty 信息。高频任务视图仍单独走 task patch，不混入 catalog/detail。 */
export interface TechniqueActivityPanelDirty {
  changed: boolean;
  kinds?: RuntimeTechniqueActivityKind[];
  reason?: string;
}

/** 策略 resolve 返回的结算结果。 */
export interface TechniqueActivityResolveResult {
  /** 本批次成功数。 */
  successCount: number;
  /** 本批次失败数。 */
  failureCount: number;
  /** 产出物品摘要；不会被公共 pipeline 自动入包，入包必须写入 `inventoryDelta.granted`。 */
  outputs: TechniqueActivityOutputItem[];
  /** 背包 delta。 */
  inventoryDelta?: TechniqueActivityInventoryDelta;
  /** 钱包 delta。 */
  walletDelta?: TechniqueActivityWalletDelta;
  /** 装备/锁定空间 delta。 */
  equipmentDelta?: TechniqueActivityEquipmentDelta;
  /** 领域记录 delta。 */
  recordDelta?: TechniqueActivityRecordDelta | TechniqueActivityRecordDelta[];
  /** 面板 dirty。 */
  panelDirty?: TechniqueActivityPanelDirty;
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
  /** 可选的新工作进度剩余值；不包含打断等待。 */
  workRemainingTicks?: number;
  /** 可选的结构化打断等待状态。 */
  interruptState?: TechniqueActivityInterruptState | null;
}

// ─── 管线取消/退还结果 ───

/** 取消时的退还结果。 */
export interface TechniqueActivityRefundResult {
  items: TechniqueActivityOutputItem[];
  spiritStones: number;
  inventoryDelta?: TechniqueActivityInventoryDelta;
  walletDelta?: TechniqueActivityWalletDelta;
  equipmentDelta?: TechniqueActivityEquipmentDelta;
  recordDelta?: TechniqueActivityRecordDelta | TechniqueActivityRecordDelta[];
  panelDirty?: TechniqueActivityPanelDirty;
  messages?: TechniqueActivityNoticeMessage[];
  groundDrops?: TechniqueActivityOutputItem[];
  attrChanged?: boolean;
}

/** 启动结果、tick 结果、取消结果的公共字段。 */
export interface TechniqueActivityLifecycleResultBase {
  ok: boolean;
  kind?: RuntimeTechniqueActivityKind;
  panelChanged?: boolean;
  inventoryDelta?: TechniqueActivityInventoryDelta;
  walletDelta?: TechniqueActivityWalletDelta;
  equipmentDelta?: TechniqueActivityEquipmentDelta;
  recordDelta?: TechniqueActivityRecordDelta | TechniqueActivityRecordDelta[];
  panelDirty?: TechniqueActivityPanelDirty;
  messages?: TechniqueActivityNoticeMessage[];
  error?: string;
}

/** start 结果：只表达启动或排队，不承载 tick 结算。 */
export interface TechniqueActivityStartResult extends TechniqueActivityLifecycleResultBase {
  lifecycle: 'start';
  started?: boolean;
  queued?: boolean;
}

/** tick 结果：表达推进、结算、休眠或完成。 */
export interface TechniqueActivityTickResult extends TechniqueActivityLifecycleResultBase {
  lifecycle: 'tick';
  completed?: boolean;
  sleepPayload?: unknown;
  craftRealmExpGain?: number;
}

/** cancel 结果：表达取消、退款、释放占用。 */
export interface TechniqueActivityCancelResult extends TechniqueActivityLifecycleResultBase {
  lifecycle: 'cancel';
  cancelled?: boolean;
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
  targetLabel?: string;
  sleepReason?: string;
  sleepingSince?: number;
  /** 休眠后多少 tick 重试条件检查（避免每 tick 检查）。 */
  retryAfterTicks?: number;
  /** 取消引用，供统一任务列表直接取消队列项。 */
  cancelRef?: TechniqueActivityCancelRef;
  createdAt: number;
}

/** 队列入队模式。 */
export type TechniqueActivityQueueMode = 'append' | 'prepend' | 'replace';

/** 队列最大长度。 */
export const TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH = 20;

/** 条件型技艺休眠后默认重试间隔（tick 数）。 */
export const TECHNIQUE_ACTIVITY_SLEEP_RETRY_TICKS = 5;
