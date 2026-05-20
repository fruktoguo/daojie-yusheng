/**
 * Persistence Build Worker 入口。
 * 在 worker_threads 中运行，负责把玩家分域快照构造成可执行的 write plan。
 * 不依赖 NestJS 容器。
 */
import { parentPort } from 'node:worker_threads';

import type { WorkerTaskEnvelope, WorkerTaskResult } from '../worker-task.types';
import {
  buildPlayerSnapshotProjectionWritePlan,
  type PlayerDomainWritePlan,
  type PlayerDomainWritePlanPayload,
} from '../../persistence/player-domain-write-plan';

if (!parentPort) {
  throw new Error('persistence-build.worker.ts must be run as a worker_threads Worker');
}

parentPort.on('message', async (envelope: WorkerTaskEnvelope) => {
  const startedAt = performance.now();
  try {
    const result = await handleTask(envelope);
    const response: WorkerTaskResult = {
      taskId: envelope.taskId,
      ok: true,
      result,
      durationMs: performance.now() - startedAt,
    };
    parentPort!.postMessage(response);
  } catch (err: unknown) {
    const response: WorkerTaskResult = {
      taskId: envelope.taskId,
      ok: false,
      errorMessage: err instanceof Error ? err.message : String(err),
      durationMs: performance.now() - startedAt,
    };
    parentPort!.postMessage(response);
  }
});

async function handleTask(envelope: WorkerTaskEnvelope): Promise<unknown> {
  switch (envelope.kind) {
    case 'persistence-build':
      return handlePersistenceBuild(envelope.payload);
    default:
      throw new Error(`Unknown task kind: ${envelope.kind}`);
  }
}

/** 持久化写计划构造：将 snapshot 的分域投影编译成可执行 SQL 计划。 */
async function handlePersistenceBuild(payload: unknown): Promise<PlayerDomainWritePlan> {
  const input = payload as PlayerDomainWritePlanPayload;
  return buildPlayerSnapshotProjectionWritePlan(
    input.playerId,
    input.snapshot,
    input.domains,
    input.options,
  );
}
