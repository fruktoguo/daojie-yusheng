/**
 * Encoding Worker 入口。
 * 在 worker_threads 中运行，处理 AOI envelope 编码、A* 寻路、FOV 计算。
 * 不依赖 NestJS 容器，直接 import shared 纯函数。
 */
import { parentPort } from 'node:worker_threads';

import type { WorkerTaskEnvelope, WorkerTaskResult } from '../worker-task.types';

if (!parentPort) {
  throw new Error('encoding.worker.ts must be run as a worker_threads Worker');
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
    case 'envelope-encode':
      return handleEnvelopeEncode(envelope.payload);
    case 'pathfind':
      return handlePathfind(envelope.payload);
    case 'fov':
      return handleFov(envelope.payload);
    default:
      throw new Error(`Unknown task kind: ${envelope.kind}`);
  }
}

function handleEnvelopeEncode(payload: unknown): Buffer {
  // 将 envelope POJO 编码为 UTF-8 JSON bytes
  return Buffer.from(JSON.stringify(payload), 'utf-8');
}

function handlePathfind(_payload: unknown): unknown {
  // TODO: Phase 2 实现 A* 寻路
  return null;
}

function handleFov(_payload: unknown): unknown {
  // TODO: Phase 3 实现 FOV 计算
  return null;
}
