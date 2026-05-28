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
    pendingTechniqueComprehensions: [{
      techId: 'gen_task_view_transmission',
      name: '试炼传法诀',
      progress: 20,
      requiredProgress: 100,
      activeTransferJob: {
        jobId: 'transmission:learner:gen_task_view_transmission:123',
        teacherName: '传功者',
        status: 'running',
      },
    }, {
      techId: 'gen_task_view_blocked',
      name: '阻滞传法诀',
      progress: 5,
      requiredProgress: 50,
      activeTransferJob: {
        jobId: 'transmission:learner:gen_task_view_blocked:124',
        teacherName: '传功者',
        status: 'blocked',
        blockedReason: 'teacher_out_of_range',
      },
    }],
  }, 123);

  assert.equal(view.serverTick, 123);
  assert.equal(view.tasks.length, 7);

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

  const transmission = view.tasks.find((task) => task.cancelRef.techId === 'gen_task_view_transmission');
  assert.equal(transmission?.kind, 'transmission');
  assert.equal(transmission?.state, 'running');
  assert.equal(transmission?.label, '传法');
  assert.equal(transmission?.targetLabel, '试炼传法诀');
  assert.equal(transmission?.workTotalTicks, 100);
  assert.equal(transmission?.workRemainingTicks, 80);
  assert.deepEqual(transmission?.cancelRef, {
    kind: 'transmission',
    jobRunId: 'transmission:learner:gen_task_view_transmission:123',
    techId: 'gen_task_view_transmission',
  });

  const blockedTransmission = view.tasks.find((task) => task.cancelRef.techId === 'gen_task_view_blocked');
  assert.equal(blockedTransmission?.state, 'blocked');
  assert.equal(blockedTransmission?.sleepReason, '传授者不在 2 格范围内');

  console.log(JSON.stringify({
    ok: true,
    tasks: view.tasks.length,
    answers: '统一技艺任务视图能同时投影 active job、旧制造队列、统一技艺队列和学习者传法 job；打断等待独立于实际 workRemainingTicks。',
  }, null, 2));
}

main();
