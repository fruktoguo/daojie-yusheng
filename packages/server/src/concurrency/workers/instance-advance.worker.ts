/**
 * Instance Advance Worker 入口。
 * 在 worker_threads 中运行，处理实例级 tick 子阶段。
 * 不依赖 NestJS 容器。
 */
import { parentPort } from 'node:worker_threads';

import type { WorkerTaskEnvelope, WorkerTaskResult } from '../worker-task.types';

if (!parentPort) {
  throw new Error('instance-advance.worker.ts must be run as a worker_threads Worker');
}

parentPort.on('message', (envelope: WorkerTaskEnvelope) => {
  const startedAt = performance.now();
  try {
    const result = handleTask(envelope);
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

function handleTask(envelope: WorkerTaskEnvelope): unknown {
  switch (envelope.kind) {
    case 'instance-advance':
      return handleInstanceAdvance(envelope.payload);
    default:
      throw new Error(`Unknown task kind: ${envelope.kind}`);
  }
}

function handleInstanceAdvance(_payload: unknown): unknown {
  // TODO: Phase 4 实现实例 tick 子阶段
  return { mutations: [] };
}
