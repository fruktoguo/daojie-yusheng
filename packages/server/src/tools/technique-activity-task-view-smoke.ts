import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { buildTechniqueActivityTaskListView } from '../runtime/craft/technique-activity-task-view.helpers';

function main(): void {
  const view = buildTechniqueActivityTaskListView({
    playerId: 'player:task-view-smoke',
    alchemyJob: {
      jobRunId: 'job:alchemy:1',
      jobType: 'alchemy',
      outputItemId: 'pill.qi',
      phase: 'paused',
      totalTicks: 100,
      remainingTicks: 80,
      workTotalTicks: 100,
      workRemainingTicks: 70,
      pausedTicks: 10,
      queuedJobs: [{
        queueId: 'legacy-queue:forging:1',
        kind: 'forging',
        label: '青铜剑',
        createdAt: 1,
      }],
    },
    enhancementJob: {
      jobRunId: 'job:enhancement:1',
      jobType: 'enhancement',
      targetItemName: '试炼剑',
      phase: 'enhancing',
      totalTicks: 50,
      remainingTicks: 25,
      workTotalTicks: 50,
      workRemainingTicks: 25,
    },
    miningJob: {
      jobRunId: 'job:mining:1',
      jobType: 'mining',
      miningNodeName: '黑铁矿脉',
      phase: 'mining',
      totalTicks: 30,
      remainingTicks: 12,
      workTotalTicks: 30,
      workRemainingTicks: 12,
    },
    techniqueActivityQueue: [{
      queueId: 'queue:formation:1',
      kind: 'formation',
      payload: { formationInstanceId: 'formation:1' },
      label: '维护聚灵阵',
      targetLabel: '聚灵阵',
      state: 'sleeping',
      sleepReason: '不在控制点范围内',
      createdAt: 2,
    }],
  }, 123);

  assert.equal(view.serverTick, 123);
  assert.equal(view.tasks.length, 5);

  const alchemy = view.tasks.find((task) => task.kind === 'alchemy');
  assert.equal(alchemy?.state, 'interrupt_wait');
  assert.equal(alchemy?.workRemainingTicks, 70);
  assert.equal(alchemy?.interruptWaitRemainingTicks, 10);
  assert.deepEqual(alchemy?.cancelRef, { kind: 'alchemy', jobRunId: 'job:alchemy:1' });

  const enhancement = view.tasks.find((task) => task.kind === 'enhancement');
  assert.equal(enhancement?.state, 'running');
  assert.equal(enhancement?.targetLabel, '试炼剑');
  assert.equal(enhancement?.workRemainingTicks, 25);

  const mining = view.tasks.find((task) => task.kind === 'mining');
  assert.equal(mining?.state, 'running');
  assert.equal(mining?.targetLabel, '黑铁矿脉');
  assert.equal(mining?.workRemainingTicks, 12);
  assert.deepEqual(mining?.cancelRef, { kind: 'mining', jobRunId: 'job:mining:1' });

  const legacyQueue = view.tasks.find((task) => task.cancelRef.queueId === 'legacy-queue:forging:1');
  assert.equal(legacyQueue?.state, 'queued');
  assert.equal(legacyQueue?.label, '青铜剑');

  const formationQueue = view.tasks.find((task) => task.cancelRef.queueId === 'queue:formation:1');
  assert.equal(formationQueue?.state, 'sleeping');
  assert.equal(formationQueue?.targetLabel, '聚灵阵');
  assert.equal(formationQueue?.sleepReason, '不在控制点范围内');

  console.log(JSON.stringify({
    ok: true,
    tasks: view.tasks.length,
    answers: '统一技艺任务视图能同时投影 active job、旧制造队列和统一技艺队列；打断等待独立于实际 workRemainingTicks。',
  }, null, 2));
}

main();
