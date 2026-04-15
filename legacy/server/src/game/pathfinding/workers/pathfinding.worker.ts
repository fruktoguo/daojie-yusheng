/**
 * 寻路 worker：只处理纯计算，不接触运行时世界状态。
 */
import { parentPort } from 'node:worker_threads';
import { findBoundedPath } from '../pathfinding-core';
import { PathfindingTask, PathfindingTaskResult } from '../pathfinding.types';

if (!parentPort) {
  throw new Error('pathfinding.worker 必须运行在 worker 线程中');
}

parentPort.on('message', (task: PathfindingTask) => {
/** startedAt：定义该变量以承载业务值。 */
  const startedAt = process.hrtime.bigint();
/** result：定义该变量以承载业务值。 */
  const result = findBoundedPath(
    task.staticGrid,
    task.blocked,
    task.startX,
    task.startY,
    task.goals,
    task.limits,
    {
      cancelFlag: task.cancelFlag,
    },
  );
/** elapsedMs：定义该变量以承载业务值。 */
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
/** payload：定义该变量以承载业务值。 */
  const payload: PathfindingTaskResult = {
    ...result,
    requestId: task.requestId,
    actorId: task.actorId,
    kind: task.kind,
    mapId: task.staticGrid.mapId,
    mapRevision: task.staticGrid.mapRevision,
    elapsedMs,
  };
  parentPort?.postMessage(payload);
});
