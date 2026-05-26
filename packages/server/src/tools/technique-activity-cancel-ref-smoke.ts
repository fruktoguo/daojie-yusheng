import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { WorldRuntimePlayerCommandService } from '../runtime/world/command/world-runtime-player-command.service';

async function main(): Promise<void> {
  const player = {
    playerId: 'player:cancel-ref-smoke',
    techniqueActivityQueue: [
      { queueId: 'queue:formation:1', kind: 'formation', label: '维护阵法', state: 'pending', payload: {}, createdAt: 1 },
    ],
    alchemyJob: {
      jobRunId: 'job:alchemy:1',
      jobType: 'alchemy',
      totalTicks: 10,
      remainingTicks: 5,
      queuedJobs: [
        { queueId: 'legacy:alchemy:1', kind: 'alchemy', label: '炼丹队列', createdAt: 2 },
      ],
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

  await service.dispatchCancelTechniqueActivityByRef(player.playerId, { kind: 'formation', queueId: 'queue:formation:1' }, deps);
  assert.equal(player.techniqueActivityQueue.length, 0);
  assert.equal(flushed.length, 1);
  assert.deepEqual(activeCancels, []);

  await service.dispatchCancelTechniqueActivityByRef(player.playerId, { kind: 'alchemy', queueId: 'legacy:alchemy:1' }, deps);
  assert.equal(player.alchemyJob.queuedJobs.length, 0);
  assert.equal(flushed.length, 2);

  await service.dispatchCancelTechniqueActivityByRef(player.playerId, { kind: 'alchemy', jobRunId: 'stale-job' }, deps);
  assert.deepEqual(activeCancels, []);

  await service.dispatchCancelTechniqueActivityByRef(player.playerId, { kind: 'alchemy', jobRunId: 'job:alchemy:1' }, deps);
  assert.deepEqual(activeCancels, [[player.playerId, 'alchemy']]);

  console.log(JSON.stringify({
    ok: true,
    flushed: flushed.length,
    activeCancels: activeCancels.length,
    answers: '统一取消引用能删除统一队列和旧制造队列；取消当前 job 时会校验 jobRunId，避免旧按钮误取消新任务。',
  }, null, 2));
}

void main();
