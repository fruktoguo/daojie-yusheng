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
  dirtySinceAt?: string | null;
  nextAttemptAt?: string | null;
}

export interface ClaimFlushTaskInput {
  workerId: string;
  scope: FlushTaskScope;
  domain?: string | null;
  ownershipEpoch?: number | null;
  limit?: number;
}
