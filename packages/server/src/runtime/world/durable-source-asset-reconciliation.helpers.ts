import {
  DurableOperationCommitOutcomeUnknownError,
  type DurableInventoryItemSnapshot,
} from '../../persistence/durable-operation.service';

export interface DurableInventoryMutationRequest {
  operationId: string;
  sourceType: string;
  sourceRefId?: string | null;
  nextInventoryItems: DurableInventoryItemSnapshot[];
  [key: string]: unknown;
}

export interface DurableInventoryMutationClient {
  grantInventoryItems(input: DurableInventoryMutationRequest): Promise<unknown>;
  getOperationStatus?(operationId: string): Promise<'pending' | 'committed' | null>;
  getOperationReplay?(operationId: string): Promise<{
    operation: Record<string, unknown> | null;
  }>;
  isShuttingDown?(): boolean;
}

export type DurableInventoryCommitReconciliation =
  | {
      outcome: 'committed';
      inventoryItems: Array<Record<string, unknown>>;
      replayReadFailed: boolean;
    }
  | {
      outcome: 'failed';
      error: unknown;
    }
  | {
      outcome: 'unknown';
      error?: unknown;
    };

/** 识别 COMMIT 已发出但数据库响应丢失；兼容测试替身与跨模块错误实例。 */
export function isDurableCommitOutcomeUnknownError(error: unknown): boolean {
  return error instanceof DurableOperationCommitOutcomeUnknownError
    || (error instanceof Error && error.name === 'DurableOperationCommitOutcomeUnknownError')
    || String(error instanceof Error ? error.message : error)
      .startsWith('durable_operation_commit_outcome_unknown:');
}

/**
 * 用新连接先查 operation 状态；未提交时再以同 operationId 幂等重放一次。
 * 只有明确的普通事务失败才返回 failed，查询不可达或再次丢失 COMMIT 回包均保持 unknown。
 */
export async function reconcileDurableInventoryCommitOutcome(
  durable: DurableInventoryMutationClient,
  request: DurableInventoryMutationRequest,
): Promise<DurableInventoryCommitReconciliation> {
  // DurableOperationService 在正常运行期会自行持锁收敛；只有关停打断时才会把 unknown 交回调用方。
  // 此时不能再开启 status/replay/幂等事务，否则会挤占主进程的优雅关闭预算。
  if (durable.isShuttingDown?.() === true) {
    return { outcome: 'unknown' };
  }
  let status: 'pending' | 'committed' | null;
  try {
    status = durable.getOperationStatus
      ? await durable.getOperationStatus(request.operationId)
      : null;
  }
  catch (error) {
    return { outcome: 'unknown', error };
  }

  if (status !== 'committed') {
    if (durable.isShuttingDown?.() === true) {
      return { outcome: 'unknown' };
    }
    try {
      await durable.grantInventoryItems(request);
      status = 'committed';
    }
    catch (error) {
      if (!isDurableCommitOutcomeUnknownError(error)) {
        return { outcome: 'failed', error };
      }
      if (durable.isShuttingDown?.() === true) {
        return { outcome: 'unknown', error };
      }
      try {
        status = durable.getOperationStatus
          ? await durable.getOperationStatus(request.operationId)
          : null;
      }
      catch (statusError) {
        return { outcome: 'unknown', error: statusError };
      }
      if (status !== 'committed') {
        return { outcome: 'unknown', error };
      }
    }
  }

  if (durable.isShuttingDown?.() === true) {
    return { outcome: 'unknown' };
  }
  try {
    const snapshots = await readCommittedInventorySnapshots(durable, request);
    return {
      outcome: 'committed',
      inventoryItems: buildRuntimeInventoryItems(snapshots),
      replayReadFailed: false,
    };
  }
  catch (error) {
    if (String(error instanceof Error ? error.message : error)
      .startsWith('durable_source_replay_identity_conflict:')) {
      return { outcome: 'unknown', error };
    }
    return {
      outcome: 'committed',
      inventoryItems: buildRuntimeInventoryItems(request.nextInventoryItems),
      replayReadFailed: true,
    };
  }
}

async function readCommittedInventorySnapshots(
  durable: DurableInventoryMutationClient,
  request: DurableInventoryMutationRequest,
): Promise<DurableInventoryItemSnapshot[]> {
  if (!durable.getOperationReplay) {
    return request.nextInventoryItems;
  }
  const replay = await durable.getOperationReplay(request.operationId);
  const payload = normalizeReplayPayload(replay.operation?.payload_jsonb);
  if (!payload) {
    return request.nextInventoryItems;
  }
  if (payload.sourceType !== request.sourceType || payload.sourceRefId !== (request.sourceRefId ?? null)) {
    throw new Error(`durable_source_replay_identity_conflict:${request.operationId}`);
  }
  return Array.isArray(payload.nextInventoryItems)
    ? payload.nextInventoryItems.filter(isDurableInventoryItemSnapshot)
    : request.nextInventoryItems;
}

function buildRuntimeInventoryItems(
  snapshots: readonly DurableInventoryItemSnapshot[],
): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];
  for (const entry of snapshots) {
    if (typeof entry?.itemId !== 'string' || !entry.itemId.trim()) {
      continue;
    }
    const rawPayload = isRecord(entry.rawPayload) ? entry.rawPayload : {};
    const itemInstanceId = typeof entry.itemInstanceId === 'string' && entry.itemInstanceId.trim()
      ? entry.itemInstanceId
      : typeof rawPayload.itemInstanceId === 'string' && rawPayload.itemInstanceId.trim()
        ? rawPayload.itemInstanceId
        : null;
    result.push({
      ...rawPayload,
      itemId: entry.itemId,
      ...(itemInstanceId ? { itemInstanceId } : {}),
      count: Math.max(1, Math.trunc(Number(entry.count ?? 1))),
    });
  }
  return result;
}

function normalizeReplayPayload(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) {
    return value;
  }
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  }
  catch {
    return null;
  }
}

function isDurableInventoryItemSnapshot(value: unknown): value is DurableInventoryItemSnapshot {
  return isRecord(value)
    && typeof value.itemId === 'string'
    && Number.isFinite(Number(value.count));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
