/**
 * 排行榜构建 worker 入口。
 *
 * 在 worker_threads 中运行，专门处理排行榜的 8 个 board 排序/截断/映射。
 * 不依赖 NestJS 容器；调用方负责把扁平 snapshot 与 sects 透传过来。
 */
import { parentPort } from 'node:worker_threads';

import type {
  LeaderboardBuildPayload,
  LeaderboardBuildResult,
  WorkerTaskEnvelope,
  WorkerTaskResult,
} from '../worker-task.types';
import {
  buildAllLeaderboards,
  type LeaderboardFlatSnapshot,
} from '../../runtime/player/leaderboard-projection';

if (!parentPort) {
  throw new Error('leaderboard-build.worker.ts must be run as a worker_threads Worker');
}

parentPort.on('message', (envelope: WorkerTaskEnvelope) => {
  const startedAt = performance.now();
  try {
    if (envelope.kind !== 'leaderboard-build') {
      throw new Error(`Unknown task kind: ${envelope.kind}`);
    }
    const payload = envelope.payload as LeaderboardBuildPayload;
    const snapshots = (payload.snapshots ?? []) as LeaderboardFlatSnapshot[];
    const sects = Array.isArray(payload.sects) ? payload.sects : [];
    const limit = typeof payload.limit === 'number' && Number.isFinite(payload.limit) ? payload.limit : 10;
    const boards = buildAllLeaderboards(snapshots, sects, limit);
    const result: LeaderboardBuildResult = { boards };
    const response: WorkerTaskResult<LeaderboardBuildResult> = {
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
