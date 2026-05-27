import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { buildTechniqueActivityTaskListView } from '../runtime/craft/technique-activity-task-view.helpers';
import { WorldRuntimePlayerCommandService } from '../runtime/world/command/world-runtime-player-command.service';

async function main(): Promise<void> {
  const player = {
    playerId: 'player:cancel-ref-smoke',
    techniqueActivityQueue: [
      { queueId: 'queue:formation:1', kind: 'formation', label: '维护阵法', state: 'pending', payload: {}, createdAt: 1 },
      { queueId: 'queue:building:sleeping', kind: 'building', label: '继续建造', state: 'sleeping', payload: {}, createdAt: 3 },
    ],
    alchemyJob: {
      jobRunId: 'job:alchemy:1',
      jobType: 'alchemy',
      phase: 'paused',
      interruptWaitRemainingTicks: 7,
      totalTicks: 10,
      remainingTicks: 5,
      workTotalTicks: 10,
      workRemainingTicks: 5,
      queuedJobs: [
        { queueId: 'legacy:alchemy:1', kind: 'alchemy', label: '炼丹队列', createdAt: 2 },
      ],
    },
    miningJob: {
      jobRunId: 'job:mining:1',
      jobType: 'mining',
      phase: 'mining',
      totalTicks: 8,
      remainingTicks: 4,
      workTotalTicks: 8,
      workRemainingTicks: 4,
    },
  };
  const flushed: unknown[] = [];
  const activeCancels: unknown[] = [];
  const service = Object.create(WorldRuntimePlayerCommandService.prototype) as WorldRuntimePlayerCommandService & {
    playerRuntimeService: { getPlayer(playerId: string): unknown };
    dispatchCancelTechniqueActivity(playerId: string, kind: string, deps: unknown): Promise<void>;
  };
  service.playerRuntimeService = {
    getPlayer(playerId: string): unknown {
      return playerId === player.playerId ? player : null;
    },
  };
  service.dispatchCancelTechniqueActivity = async (playerId: string, kind: string): Promise<void> => {
    activeCancels.push([playerId, kind]);
  };
  const deps = {
    worldRuntimeCraftMutationService: {
      flushCraftMutation(playerId: string, result: unknown, panel: string): void {
        flushed.push([playerId, result, panel]);
      },
    },
  };

  const initialTaskView = buildTechniqueActivityTaskListView(player as never);
  const interruptWaitTask = initialTaskView.tasks.find((task) => task.kind === 'alchemy' && task.state === 'interrupt_wait');
  const runningTask = initialTaskView.tasks.find((task) => task.kind === 'mining' && task.state === 'running');
  const queuedTask = initialTaskView.tasks.find((task) => task.cancelRef.queueId === 'queue:formation:1');
  const sleepingTask = initialTaskView.tasks.find((task) => task.cancelRef.queueId === 'queue:building:sleeping');
  assert.equal(interruptWaitTask?.canCancel, true);
  assert.equal(runningTask?.canCancel, true);
  assert.equal(queuedTask?.canCancel, true);
  assert.equal(sleepingTask?.canCancel, true);

  await service.dispatchCancelTechniqueActivityByRef(player.playerId, queuedTask?.cancelRef, deps);
  assert.equal(player.techniqueActivityQueue.length, 1);
  assert.equal(flushed.length, 1);
  assert.deepEqual(activeCancels, []);

  await service.dispatchCancelTechniqueActivityByRef(player.playerId, sleepingTask?.cancelRef, deps);
  assert.equal(player.techniqueActivityQueue.length, 0);
  assert.equal(flushed.length, 2);

  await service.dispatchCancelTechniqueActivityByRef(player.playerId, { kind: 'alchemy', queueId: 'legacy:alchemy:1' }, deps);
  assert.equal(player.alchemyJob.queuedJobs.length, 0);
  assert.equal(flushed.length, 3);

  await service.dispatchCancelTechniqueActivityByRef(player.playerId, { kind: 'alchemy', jobRunId: 'stale-job' }, deps);
  assert.deepEqual(activeCancels, []);

  await service.dispatchCancelTechniqueActivityByRef(player.playerId, interruptWaitTask?.cancelRef, deps);
  await service.dispatchCancelTechniqueActivityByRef(player.playerId, runningTask?.cancelRef, deps);
  assert.deepEqual(activeCancels, [[player.playerId, 'alchemy'], [player.playerId, 'mining']]);

  console.log(JSON.stringify({
    ok: true,
    flushed: flushed.length,
    activeCancels: activeCancels.length,
    answers: '统一任务列表 cancelRef 能取消 running、interrupt_wait、queued、sleeping 项；取消当前 job 时会校验 jobRunId，避免旧按钮误取消新任务。',
  }, null, 2));
}

void main();
