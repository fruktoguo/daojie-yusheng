/**
 * Persistence Build Worker 入口。
 * 在 worker_threads 中运行，处理持久化序列化（SQL 构造、bigint 转换、JSON.stringify）。
 * 不依赖 NestJS 容器。
 */
import { parentPort } from 'node:worker_threads';

import type { WorkerTaskEnvelope, WorkerTaskResult } from '../worker-task.types';

if (!parentPort) {
  throw new Error('persistence-build.worker.ts must be run as a worker_threads Worker');
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
    case 'persistence-build':
      return handlePersistenceBuild(envelope.payload);
    default:
      throw new Error(`Unknown task kind: ${envelope.kind}`);
  }
}

/** 持久化序列化：将 snapshot 转为 SQL 参数 */
function handlePersistenceBuild(payload: unknown): { jsonPayloads: string[] } {
  const input = payload as { snapshots: unknown[] };
  const jsonPayloads: string[] = [];

  for (const snapshot of input.snapshots ?? []) {
    // 核心序列化：JSON.stringify + bigint 转换
    jsonPayloads.push(JSON.stringify(snapshot, bigintReplacer));
  }

  return { jsonPayloads };
}

/** bigint → string 替换器 */
function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}
