import type { CombatEffect } from './action-combat-types';
import type { NoticeItemView } from './notice-types';

/** 战斗协议层：只描述同步边界，不表示运行时必须直接发包。 */
export type CombatProtocolLayer =
  | 'world_delta_fx'
  | 'notice'
  | 'audit_internal'
  | 'diagnostic_internal';

export type CombatProtocolDelivery = 'aoi' | 'unicast' | 'internal';

export type CombatProtocolFrequency = 'high' | 'low' | 'internal';

export type CombatOutcomeResult = 'hit' | 'dodged' | 'no_damage' | 'immune' | 'resisted' | 'blocked';

export type CombatProtocolResult = CombatOutcomeResult | 'rejected';

export type CombatAuditAction =
  | 'damage'
  | 'defeat'
  | 'destroy'
  | 'dodge'
  | 'immune'
  | 'resolve'
  | 'kill'
  | 'death'
  | 'loot_drop'
  | 'loot_grant'
  | 'exp_gain';

export interface CombatProtocolLayerSpec {
  layer: CombatProtocolLayer;
  channel: 'S2C.WorldDelta.fx' | 'S2C.Notice' | 'internal';
  delivery: CombatProtocolDelivery;
  frequency: CombatProtocolFrequency;
  payload: 'CombatEffect' | 'CombatNoticeEvent' | 'CombatAuditEvent' | 'CombatDiagnosticEvent';
  maxTopLevelFields: number | null;
  allowsStaticConfig: boolean;
  allowsDiagnostics: boolean;
  allowsAudit: boolean;
}

export const COMBAT_PROTOCOL_LAYERS = {
  WorldDeltaFx: 'world_delta_fx',
  Notice: 'notice',
  AuditInternal: 'audit_internal',
  DiagnosticInternal: 'diagnostic_internal',
} as const;

export const COMBAT_AOI_RESULT_FIELD_BUDGET = 10;
export const COMBAT_AOI_EFFECT_FIELD_BUDGET = 10;
export const COMBAT_AOI_EFFECT_WIRE_BYTE_BUDGET = 200;

export const COMBAT_PROTOCOL_LAYER_SPECS: Record<CombatProtocolLayer, CombatProtocolLayerSpec> = {
  world_delta_fx: {
    layer: 'world_delta_fx',
    channel: 'S2C.WorldDelta.fx',
    delivery: 'aoi',
    frequency: 'high',
    payload: 'CombatEffect',
    maxTopLevelFields: COMBAT_AOI_EFFECT_FIELD_BUDGET,
    allowsStaticConfig: false,
    allowsDiagnostics: false,
    allowsAudit: false,
  },
  notice: {
    layer: 'notice',
    channel: 'S2C.Notice',
    delivery: 'unicast',
    frequency: 'low',
    payload: 'CombatNoticeEvent',
    maxTopLevelFields: null,
    allowsStaticConfig: false,
    allowsDiagnostics: false,
    allowsAudit: false,
  },
  audit_internal: {
    layer: 'audit_internal',
    channel: 'internal',
    delivery: 'internal',
    frequency: 'internal',
    payload: 'CombatAuditEvent',
    maxTopLevelFields: null,
    allowsStaticConfig: true,
    allowsDiagnostics: false,
    allowsAudit: true,
  },
  diagnostic_internal: {
    layer: 'diagnostic_internal',
    channel: 'internal',
    delivery: 'internal',
    frequency: 'internal',
    payload: 'CombatDiagnosticEvent',
    maxTopLevelFields: null,
    allowsStaticConfig: true,
    allowsDiagnostics: true,
    allowsAudit: false,
  },
};

/** 战斗 outcome 到 AOI 表现层的最小结果事件，供服务端运行时到网络层转换使用。 */
export interface CombatAoiResultEvent {
  type: 'combat_result';
  instanceId: string | null;
  actorId: string | null;
  actionId: string | null;
  targetKind: string | null;
  targetId: string | null;
  x: number | null;
  y: number | null;
  result: CombatProtocolResult;
  damage: number;
}

/** 当前客户端已经消费的 AOI 表现载荷。 */
export type CombatAoiEffect = CombatEffect;

/** 战斗玩家通知只允许进入 Notice 单播层。 */
export type CombatNoticeEvent = Omit<NoticeItemView, 'kind'> & {
  kind: 'combat';
};

/** 战斗审计事件是服务端内部事件，不属于普通客户端 S2C 协议。 */
export interface CombatAuditEvent {
  type: 'combat_audit';
  action?: CombatAuditAction;
  instanceId: string | null;
  phase: string | null;
  actor: unknown;
  actionId: string | null;
  target: unknown;
  result: Record<string, unknown>;
  application?: unknown;
  createdAt: string;
  tags: string[];
}

/** 战斗诊断事件是服务端内部事件，不属于普通客户端 S2C 协议。 */
export interface CombatDiagnosticEvent {
  type: 'combat_diagnostic';
  instanceId: string | null;
  phase: string | null;
  actor: unknown;
  actionId: string | null;
  target: unknown;
  reason: string;
  details: Record<string, unknown>;
  createdAt: string;
  severity: 'debug' | 'info' | 'warn' | 'error';
}

export interface CombatLayeredEvents {
  aoiEvent: CombatAoiResultEvent | null;
  notificationEvent: CombatNoticeEvent | null;
  auditEvent: CombatAuditEvent | null;
  diagnosticEvent: CombatDiagnosticEvent | null;
}

export function normalizeCombatProtocolResult(result: {
  outcomeResult?: CombatOutcomeResult;
  dodged?: boolean;
  damage?: number;
  immune?: boolean;
  resisted?: boolean;
  resolved?: boolean;
  blocked?: boolean;
} | null | undefined): CombatProtocolResult {
  if (isCombatOutcomeResult(result?.outcomeResult)) return result.outcomeResult;
  if (result?.dodged === true) return 'dodged';
  if (result?.immune === true) return 'immune';
  if (result?.resisted === true || result?.resolved === true) return 'resisted';
  if (result?.blocked === true) return 'blocked';
  return Number(result?.damage ?? 0) > 0 ? 'hit' : 'no_damage';
}

export function isCombatOutcomeResult(value: unknown): value is CombatOutcomeResult {
  return value === 'hit'
    || value === 'dodged'
    || value === 'no_damage'
    || value === 'immune'
    || value === 'resisted'
    || value === 'blocked';
}

export function estimateTopLevelFieldCount(value: object | null | undefined): number {
  if (!value) return 0;
  return Object.keys(value as Record<string, unknown>).length;
}

export function estimateCombatAoiResultEventFieldCount(event: CombatAoiResultEvent): number {
  return estimateTopLevelFieldCount(event);
}

export function assertCombatAoiResultEventBudget(event: CombatAoiResultEvent): boolean {
  const fieldCount = estimateCombatAoiResultEventFieldCount(event);
  if (fieldCount > COMBAT_AOI_RESULT_FIELD_BUDGET) {
    // 降级：超预算时返回 false 而非 throw，避免中断 tick 主流程
    return false;
  }
  return true;
}

export function isCombatNoticeEvent(item: NoticeItemView): item is CombatNoticeEvent {
  return item.kind === 'combat';
}

/**
 * 吟唱生命周期协议分层：开始 / 进度 / 完成 / 取消。
 *
 * 设计口径：
 * - 吟唱开始（chant_start）：AOI 高频表现，只携带预警格、吟唱时长、动画类型、可打断标记；不携带完整技能配置或长文本。
 * - 吟唱进度（chant_progress）：可选 AOI 高频更新，默认前端自行按 resolveTick 推导，不重复下发每 tick。
 *   只有玩家吟唱自身进度走 unicast Notice 或 player-scoped delta，不走 AOI，避免 50 玩家同屏广播 pending cast 进度。
 * - 吟唱完成（chant_resolve）：复用 world_delta_fx 和 combat_result 语义，不新增独立 S2C 事件。
 * - 吟唱取消（chant_cancel）：单播 Notice 玩家可读原因 + internal 诊断，不进 AOI；资源/冷却策略由运行时统一。
 *
 * 本轮只定义协议形态与边界，不新增 S2C 事件名、不替换旧的 warning_zone/action_label 发包真源。
 */
export type CombatPendingCastProtocolLayer =
  | 'chant_start'
  | 'chant_progress'
  | 'chant_resolve'
  | 'chant_cancel';

export interface CombatPendingCastProtocolSpec {
  layer: CombatPendingCastProtocolLayer;
  delivery: 'aoi' | 'unicast' | 'internal' | 'reuse_existing';
  frequency: 'once' | 'low' | 'high' | 'internal';
  channelHint: string;
  payloadShape: 'chant_start' | 'chant_progress' | 'chant_resolve_ref' | 'chant_cancel' | 'reuse';
  allowsStaticConfig: boolean;
  allowsDiagnostics: boolean;
}

export const COMBAT_PENDING_CAST_PROTOCOL_SPECS: Record<CombatPendingCastProtocolLayer, CombatPendingCastProtocolSpec> = {
  chant_start: {
    layer: 'chant_start',
    delivery: 'aoi',
    frequency: 'once',
    // 复用现有 warning_zone/action_label 发包入口；不新增专门事件，避免 envelope 膨胀。
    channelHint: 'S2C.WorldDelta.fx#warning_zone',
    payloadShape: 'chant_start',
    allowsStaticConfig: false,
    allowsDiagnostics: false,
  },
  chant_progress: {
    layer: 'chant_progress',
    delivery: 'unicast',
    frequency: 'low',
    // 玩家自身吟唱进度默认从 resolveTick 自行推导；服务端不按 tick 广播 pending cast 进度。
    // 只有极少异常场景（例如剩余 tick 被配置版本差异修正）才下发 chant_progress 单播。
    channelHint: 'S2C.Notice#chant_progress_hint (optional)',
    payloadShape: 'chant_progress',
    allowsStaticConfig: false,
    allowsDiagnostics: false,
  },
  chant_resolve: {
    layer: 'chant_resolve',
    delivery: 'reuse_existing',
    frequency: 'internal',
    // 吟唱完成继续走 combat_result / damage float / notice；不增加独立 S2C 事件。
    channelHint: 'reuse world_delta_fx & notice',
    payloadShape: 'chant_resolve_ref',
    allowsStaticConfig: false,
    allowsDiagnostics: false,
  },
  chant_cancel: {
    layer: 'chant_cancel',
    delivery: 'unicast',
    frequency: 'low',
    // 取消通知走玩家单播；诊断走 internal；资源/冷却策略不通过协议字段下发，由运行时口径决定。
    channelHint: 'S2C.Notice + internal diagnostic',
    payloadShape: 'chant_cancel',
    allowsStaticConfig: false,
    allowsDiagnostics: true,
  },
};

/** 吟唱开始事件（AOI 高频表现层）。服务端运行时产出，不直接发包；网络层按 warning_zone 入口广播。 */
export interface CombatChantStartEvent {
  type: 'combat_chant_start';
  instanceId: string | null;
  actorKind: 'player' | 'monster' | null;
  actorId: string | null;
  actionId: string | null;
  anchor: { x: number; y: number } | null;
  warningCells: Array<{ x: number; y: number }>;
  warningColor: string | null;
  durationTicks: number;
  resolveTick: number;
  interruptible: boolean;
}

/** 吟唱进度事件（单播低频，仅玩家自身用于修正本地推导偏差）。 */
export interface CombatChantProgressEvent {
  type: 'combat_chant_progress';
  actorKind: 'player' | 'monster' | null;
  actorId: string | null;
  actionId: string | null;
  remainingTicks: number;
  resolveTick: number;
  cancellable: boolean;
}

/** 吟唱取消事件（单播低频通知 + internal 诊断）。 */
export interface CombatChantCancelEvent {
  type: 'combat_chant_cancel';
  actorKind: 'player' | 'monster' | null;
  actorId: string | null;
  actionId: string | null;
  reason:
    | 'actor_dead'
    | 'interrupted'
    | 'expired'
    | 'target_invalid'
    | 'config_revision_mismatch'
    | 'instance_transfer'
    | 'server_restart';
  resourcePolicy: 'committed_no_refund' | 'partial_refund' | 'full_refund';
  cooldownPolicy: 'committed_no_rollback' | 'full_rollback';
  message: string | null;
}

/** 吟唱生命周期所有事件的联合类型。 */
export type CombatPendingCastLifecycleEvent =
  | CombatChantStartEvent
  | CombatChantProgressEvent
  | CombatChantCancelEvent;

/** 吟唱生命周期事件分层封装，便于运行时统一构建/审计。 */
export interface CombatPendingCastLifecycleLayeredEvents {
  chantStart: CombatChantStartEvent | null;
  chantProgress: CombatChantProgressEvent | null;
  chantCancel: CombatChantCancelEvent | null;
}
