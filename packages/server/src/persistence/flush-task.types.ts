/**
 * 本文件属于持久化边界，负责数据库真源、flush、兼容转换或失败策略等可靠性逻辑。
 *
 * 维护时要优先考虑幂等、崩溃恢复和自动清理，避免在 tick 内直接引入阻塞 IO。
 */
/**
 * 统一刷盘任务模型。
 * 任务落点仍复用现有 player_flush_ledger / instance_flush_ledger，
 * 这里提供跨玩家与地图实例的一致调度视图。
 */
export type FlushTaskScope = 'player' | 'instance';

export type FlushTaskPriority = 'high' | 'normal' | 'low';

export interface FlushTask {
  scope: FlushTaskScope;
  id: string;
  domain: string;
  priority: FlushTaskPriority;
  latestRevision: number;
  ownershipEpoch?: number | null;
  runtimeOwnerId?: string | null;
  fencingToken?: string | null;
  /** 单次认领生成的唯一所有权令牌；完成、重试和续租必须原样回传。 */
  claimOwnerId?: string | null;
  idempotencyKey?: string | null;
  payloadJson?: unknown;
  failureCategory?: string | null;
  dirtySinceAt?: string | null;
  nextAttemptAt?: string | null;
  createdAt?: string | null;
}

export interface ClaimFlushTaskInput {
  workerId: string;
  scope: FlushTaskScope;
  id?: string | null;
  domain?: string | null;
  ownershipEpoch?: number | null;
  priority?: FlushTaskPriority | null;
  limit?: number;
  claimTtlMs?: number;
  /** 仅认领仍保有 durable payload、可在启动期直接 replay 的任务。 */
  payloadRequired?: boolean;
  /** 启动 drain 使用：忽略 retry 时间，但仍尊重尚未过期的 claim。 */
  includeDelayed?: boolean;
}
