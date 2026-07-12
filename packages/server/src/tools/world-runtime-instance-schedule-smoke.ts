import assert from 'node:assert/strict';

import { WorldRuntimeInstanceScheduleService } from '../runtime/world/world-runtime-instance-schedule.service';
import { WorldRuntimeInstanceStateService } from '../runtime/world/world-runtime-instance-state.service';
import { WorldRuntimeInstanceTickOrchestrationService } from '../runtime/world/world-runtime-instance-tick-orchestration.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

type FakeInstance = {
  meta: { instanceId: string; runtimeStatus: string; status: string };
  tickSpeed: number;
  paused: boolean;
};

function createInstance(instanceId: string, tickSpeed: number): FakeInstance {
  return {
    meta: { instanceId, runtimeStatus: 'running', status: 'active' },
    tickSpeed,
    paused: false,
  };
}

function verifyTenThousandNormalInstancesFitTenHertzDispatcher(): void {
  const service = new WorldRuntimeInstanceScheduleService();
  const instances = new Map<string, FakeInstance>();
  for (let index = 0; index < 10_000; index += 1) {
    const instance = createInstance(`instance:scale:${index}`, 1);
    instances.set(instance.meta.instanceId, instance);
  }
  service.rebuild(instances.entries(), 0);

  let totalPlans = 0;
  let maxBatchSize = 0;
  for (let nowMs = 100; nowMs <= 1_000; nowMs += 100) {
    const plans = service.collectDue(nowMs, (instanceId) => instances.get(instanceId) ?? null);
    totalPlans += plans.length;
    maxBatchSize = Math.max(maxBatchSize, plans.length);
  }

  assert.equal(totalPlans, 10_000, '10000 个 1x 实例必须在十个 100ms dispatcher 量子内各推进一次');
  assert.ok(maxBatchSize <= 2_048, '单个 100ms 量子必须受 2048 实例批次上限保护');
  assert.equal(service.getDroppedLogicalStepCount(), 0, '正常规模错峰不能制造逻辑息丢弃');
}

async function main(): Promise<void> {
  const service = new WorldRuntimeInstanceScheduleService();
  let scheduleChangeCount = 0;
  service.setScheduleChangedListener(() => {
    scheduleChangeCount += 1;
  });
  const normal = createInstance('instance:normal', 1);
  const accelerated = createInstance('instance:accelerated', 10);
  const instances = new Map<string, FakeInstance>([
    [normal.meta.instanceId, normal],
    [accelerated.meta.instanceId, accelerated],
  ]);
  const resolveInstance = (instanceId: string) => instances.get(instanceId) ?? null;

  service.rebuild(instances.entries(), 0);
  assert.equal(scheduleChangeCount, 1, '重建索引只能发出一次调度变更通知');
  const isolatedAcceleratedSchedule = new WorldRuntimeInstanceScheduleService();
  isolatedAcceleratedSchedule.registerOrUpdate(accelerated.meta.instanceId, accelerated, 0);
  assert.deepEqual(isolatedAcceleratedSchedule.collectDue(99, resolveInstance), []);
  assert.deepEqual(isolatedAcceleratedSchedule.collectDue(100, resolveInstance).map((plan) => [plan.instanceId, plan.steps, plan.speed]), [
    ['instance:accelerated', 1, 10],
  ]);

  const firstSecond = service.collectDue(1000, resolveInstance);
  assert.equal(firstSecond[0]?.instanceId, 'instance:normal', '同一 deadline 下必须优先普通实例');
  assert.equal(new Set(firstSecond.map((plan) => plan.instanceId)).size, firstSecond.length, '同一实例单批只能形成一个计划');
  assert.deepEqual(firstSecond.map((plan) => [plan.instanceId, plan.steps]), [
    ['instance:normal', 1],
    ['instance:accelerated', 4],
  ]);
  assert.equal(firstSecond[1]?.steps, 4, '单批补帧必须受上限保护');
  assert.deepEqual(service.collectDue(1000, resolveInstance), [], '超过补帧上限的历史债务必须丢弃，不能同一时刻持续追债');
  assert.equal(service.getDroppedLogicalStepCount(), 6, '应记录被过载保护丢弃的逻辑息');

  normal.tickSpeed = 10;
  service.registerOrUpdate(normal.meta.instanceId, normal, 1000);
  assert.equal(scheduleChangeCount, 2, '改速必须通知世界唤醒器重排定时器');
  const acceleratedNormal = service.collectDue(1100, resolveInstance);
  assert.equal(acceleratedNormal.some((plan) => plan.instanceId === normal.meta.instanceId && plan.speed === 10), true);

  normal.tickSpeed = 1;
  service.registerOrUpdate(normal.meta.instanceId, normal, 1100);
  assert.equal(
    service.collectDue(1200, resolveInstance).some((plan) => plan.instanceId === normal.meta.instanceId),
    false,
    '降速后不能继承高倍速 deadline 额外推进',
  );
  assert.equal(service.collectDue(2100, resolveInstance)[0]?.speed, 1);

  normal.meta.runtimeStatus = 'lease_degraded';
  assert.deepEqual(service.collectDue(3100, resolveInstance, () => false), [], '临时不可写实例不得执行');
  assert.equal(service.getScheduledInstanceCount(), 2, '临时不可写实例必须保留调度索引等待恢复');
  normal.meta.runtimeStatus = 'running';
  assert.equal(service.collectDue(4100, resolveInstance, () => true)[0]?.instanceId, normal.meta.instanceId);

  accelerated.paused = true;
  service.registerOrUpdate(accelerated.meta.instanceId, accelerated, 4100);
  assert.equal(service.getScheduledInstanceCount(), 1);
  assert.ok(service.resolveNextDelayMs(4100) >= 5);

  const stateSchedule = new WorldRuntimeInstanceScheduleService();
  const stateService = new WorldRuntimeInstanceStateService<FakeInstance>(stateSchedule);
  const transient = createInstance('instance:transient', 1);
  stateService.setInstanceRuntime(transient.meta.instanceId, transient);
  assert.equal(stateSchedule.getScheduledInstanceCount(), 1, '实例注册必须同步进入 deadline 索引');
  stateService.deleteInstanceRuntime(transient.meta.instanceId);
  assert.equal(stateSchedule.getScheduledInstanceCount(), 0, '实例删除必须立即退出 deadline 索引');

  verifyTenThousandNormalInstancesFitTenHertzDispatcher();
  await verifyStaleScheduledPlanIsRejected();

  console.log(JSON.stringify({
    ok: true,
    answers: '实例 deadline 调度能让 10 倍实例独立到期，10000 个 1 倍实例可在 10Hz dispatcher 下完成每秒一息，普通实例同批优先，补帧单实例最多 4 步且超额债务丢弃。',
    excludes: '不证明完整世界帧内各领域业务逻辑，只验证调度索引、优先级和补帧边界。',
    completionMapping: 'instance-deadline-scheduler',
  }, null, 2));
}

async function verifyStaleScheduledPlanIsRejected(): Promise<void> {
  const plannedInstance = {
    meta: { instanceId: 'instance:stale', runtimeStatus: 'running', status: 'active' },
    template: { id: 'time-chamber-template:stale' },
    tick: 0,
    tickSpeed: 10,
    paused: false,
    playerCount: 0,
    listPlayerIds: () => [],
    tickOnce(): never {
      throw new Error('过期计划不得执行实例核心逻辑');
    },
  };
  const buildDeps = (resolveCurrent: () => any) => ({
    tick: 0,
    getInstanceRuntime: () => resolveCurrent(),
    isInstanceLeaseWritable: () => true,
    worldRuntimeCombatEffectsService: { resetFrameEffects(): void {} },
    worldRuntimeNavigationService: {
      async materializeNavigationCommandsForInstance(): Promise<void> {},
      getBlockedPlayerIdsForInstance: () => undefined,
    },
    worldSessionService: { listInstancePlayerIds: () => [] },
    async dispatchPendingCommands(): Promise<void> {},
    worldRuntimeMetricsService: {
      recordIdleFrame(): void {},
      recordFrameResult(): void {},
    },
    refreshQuestStates(): void {},
  });
  const orchestration = new WorldRuntimeInstanceTickOrchestrationService();
  const plan = [{
    instanceId: plannedInstance.meta.instanceId,
    instance: plannedInstance,
    steps: 1,
    speed: 10,
  }];

  const replacedTicks = await orchestration.advanceFrame(
    buildDeps(() => ({ ...plannedInstance })),
    100,
    null,
    plan,
  );
  assert.equal(replacedTicks, 0, '实例引用被替换后必须丢弃已生成的旧计划');

  plannedInstance.tickSpeed = 1;
  const downshiftedTicks = await orchestration.advanceFrame(
    buildDeps(() => plannedInstance),
    100,
    null,
    plan,
  );
  assert.equal(downshiftedTicks, 0, '异步预计算期间降速后必须丢弃旧高倍计划');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
