import assert from 'node:assert/strict';

import { TechniqueActivityPipelineService } from '../runtime/craft/pipeline/technique-activity-pipeline.service';
import { FormationStrategy } from '../runtime/craft/pipeline/strategies/formation.strategy';
import { WorldRuntimeFormationService } from '../runtime/world/world-runtime-formation.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  const playerId = 'player:formation-maintenance-durable';
  const instanceId = 'instance:formation-maintenance-durable';
  const formationInstanceId = 'formation:maintenance:durable';
  const player = {
    playerId,
    runtimeOwnerId: 'runtime:formation-maintenance-durable',
    sessionEpoch: 7,
    templateId: 'yunlai_town',
    instanceId,
    x: 4,
    y: 5,
    qi: 100,
    maxQi: 100,
    selfRevision: 1,
    persistentRevision: 1,
    persistedRevision: 1,
    stagedRevision: 1,
    suppressImmediateDomainPersistence: false,
    attrs: { numericStats: { maxQiOutputPerTick: 16 } },
    formationSkill: { level: 2, exp: 0, expToNext: 60 },
    dirtyDomains: new Set<string>(),
    formationJob: {
      jobRunId: 'job:formation-maintenance:durable',
      jobType: 'formation',
      formationInstanceId,
      formationName: '聚灵阵',
      instanceId,
      phase: 'maintaining',
      startedAt: 100,
      remainingTicks: 1,
      totalTicks: 1,
      workRemainingTicks: 1,
      workTotalTicks: 1,
      pausedTicks: 0,
      interruptWaitRemainingTicks: 0,
      interruptState: null,
      maintenanceRate: 1,
      successRate: 1,
      jobVersion: 1,
    },
  };
  const formation = buildFormation(formationInstanceId, instanceId);
  const instance = {
    meta: {
      instanceId,
      assignedNodeId: 'node:formation-maintenance',
      leaseToken: 'lease:formation-maintenance',
      leaseExpireAt: new Date(Date.now() + 60_000).toISOString(),
      ownershipEpoch: 9,
    },
    worldRevision: 3,
  };
  const durableCalls: Array<Record<string, any>> = [];
  let releaseFirstCommit: (() => void) | null = null;
  let rejectNextCommit = false;
  const firstCommitGate = new Promise<void>((resolve) => {
    releaseFirstCommit = resolve;
  });
  const durableOperationService = {
    isEnabled: () => true,
    async commitFormationMaintenanceMutation(input: Record<string, any>) {
      durableCalls.push(input);
      if (durableCalls.length === 1) {
        await firstCommitGate;
      }
      if (rejectNextCommit) {
        rejectNextCommit = false;
        throw new Error('simulated_formation_maintenance_commit_failure');
      }
      return {
        ok: true,
        alreadyCommitted: false,
        formationInstanceId,
        jobRunId: input.nextActiveJob.jobRunId,
        jobVersion: input.nextActiveJob.jobVersion,
      };
    },
  };
  const persistedDomains: string[][] = [];
  const playerRuntimeService = {
    getPlayerOrThrow(targetPlayerId: string) {
      assert.equal(targetPlayerId, playerId);
      return player;
    },
    getSessionFence(targetPlayerId: string) {
      assert.equal(targetPlayerId, playerId);
      return { runtimeOwnerId: player.runtimeOwnerId, sessionEpoch: player.sessionEpoch };
    },
    runExclusiveAssetMutation(_playerIds: string[], action: () => unknown) {
      return action();
    },
    recordActivity(): void {},
    spendQi(targetPlayerId: string, amount: number): void {
      assert.equal(targetPlayerId, playerId);
      player.qi -= amount;
      player.selfRevision += 1;
      player.dirtyDomains.add('vitals');
      player.persistentRevision += 1;
    },
    markPersistenceDirtyDomains(_activePlayer: typeof player, domains: string[]): void {
      for (const domain of domains) player.dirtyDomains.add(domain);
    },
    bumpPersistentRevision(activePlayer: typeof player): void {
      activePlayer.persistentRevision += 1;
    },
    buildPersistenceSnapshot(targetPlayerId: string) {
      assert.equal(targetPlayerId, playerId);
      return {
        version: 1,
        savedAt: 1_000 + player.persistentRevision,
        placement: { instanceId, templateId: player.templateId, x: player.x, y: player.y, facing: 1 },
        vitals: { hp: 100, maxHp: 100, qi: player.qi, maxQi: player.maxQi },
        progression: {
          formationSkill: { ...player.formationSkill },
          formationJob: player.formationJob ? { ...player.formationJob } : null,
        },
        inventory: { revision: 1, capacity: 24, items: [] },
        wallet: { balances: [] },
      };
    },
    markPersisted(_targetPlayerId: string, domains: Set<string>): void {
      persistedDomains.push(Array.from(domains).sort());
      for (const domain of domains) player.dirtyDomains.delete(domain);
      player.persistedRevision = player.persistentRevision;
    },
  };
  const deps = {
    tick: 321,
    playerRuntimeService,
    getInstanceRuntime: (targetInstanceId: string) => targetInstanceId === instanceId ? instance : null,
    isInstanceLeaseWritable: (targetInstance: unknown) => targetInstance === instance,
  };
  const service = new WorldRuntimeFormationService(
    {},
    playerRuntimeService as never,
    null,
    durableOperationService as never,
  );
  service.formationsByInstanceId.set(instanceId, [formation]);
  const pipeline = new TechniqueActivityPipelineService();
  pipeline.register(new FormationStrategy());
  const tickAction = (tickDeps: typeof deps) => pipeline.tick(player, 'formation', {
    contentTemplateRepository: {
      getItemName(): string | null { return null; },
      normalizeItem(item: unknown): unknown { return item; },
    },
    resolveExpToNextByLevel(): number { return 60; },
    getInstanceRuntime: deps.getInstanceRuntime,
    deps: {
      ...tickDeps,
      worldRuntimeFormationService: service,
      playerRuntimeService,
    },
  });

  const firstTick = service.tickFormationMaintenanceDurably(player, tickAction, deps);
  await new Promise<void>((resolve) => setImmediate(resolve));
  if (durableCalls.length === 0) {
    await firstTick;
  }
  assert.equal(durableCalls.length, 1);
  assert.equal(player.qi, 100, 'durable 提交前不得扣除运行态灵力');
  assert.equal(formation.remainingQiBudget, 100, 'durable 提交前不得暴露阵法后态');
  assert.equal(player.formationJob.jobVersion, 1, 'durable 提交前不得推进 job version');
  assert.equal(instance.worldRevision, 3, 'durable 提交前不得推进实例 revision');

  releaseFirstCommit?.();
  const firstResult = await firstTick;
  assert.equal(firstResult.ok, true);
  assert.equal(player.qi, 84);
  assert.equal(formation.remainingQiBudget, 132);
  assert.equal(formation.remainingAuraBudget, 132);
  assert.equal(player.formationSkill.exp, 1);
  assert.equal(player.formationJob.jobVersion, 2);
  assert.equal(instance.worldRevision, 4);
  assert.deepEqual(persistedDomains, [['active_job', 'profession', 'vitals']]);
  assert.equal(durableCalls[0]?.expectedLeaseToken, 'lease:formation-maintenance');
  assert.equal(durableCalls[0]?.expectedJobVersion, 1);
  assert.equal(durableCalls[0]?.nextActiveJob.jobVersion, 2);
  assert.equal(durableCalls[0]?.qiAmount, 16);
  assert.equal(durableCalls[0]?.formationQiAmount, 32);

  const beforeFailedTick = {
    qi: player.qi,
    formationQi: formation.remainingQiBudget,
    skillExp: player.formationSkill.exp,
    jobVersion: player.formationJob.jobVersion,
    worldRevision: instance.worldRevision,
  };
  rejectNextCommit = true;
  await assert.rejects(
    service.tickFormationMaintenanceDurably(player, tickAction, deps),
    /simulated_formation_maintenance_commit_failure/,
  );
  assert.deepEqual({
    qi: player.qi,
    formationQi: formation.remainingQiBudget,
    skillExp: player.formationSkill.exp,
    jobVersion: player.formationJob.jobVersion,
    worldRevision: instance.worldRevision,
  }, beforeFailedTick, 'durable 失败必须恢复玩家、job、技艺与阵法运行态');

  console.log(JSON.stringify({
    ok: true,
    case: 'formation-maintenance-durable-entry',
    answers: [
      '阵法维护继续走统一 formation strategy/pipeline，提交前玩家、job、阵法与实例 revision 均不可见。',
      'durable 成功后一次应用玩家灵力、阵法灵力、技艺经验与 job version；失败完整回滚。',
      '维护事务携带实例 node/token/epoch 与玩家 session fence。',
    ],
  }, null, 2));
}

function buildFormation(formationInstanceId: string, instanceId: string): Record<string, any> {
  return {
    id: formationInstanceId,
    instanceId,
    ownerPlayerId: 'player:formation-maintenance-durable',
    ownerSectId: null,
    formationId: 'spirit_gathering',
    lifecycle: 'deployed',
    name: '聚灵阵',
    template: { id: 'spirit_gathering' },
    diskItemId: 'formation_disk.mortal',
    diskTier: 'mortal',
    diskMultiplier: 1,
    spiritStoneCount: 100,
    qiCost: 100,
    x: 4,
    y: 5,
    eyeInstanceId: instanceId,
    eyeX: 4,
    eyeY: 5,
    allocation: {},
    stats: { radius: 1 },
    active: true,
    remainingQiBudget: 100,
    remainingAuraBudget: 100,
    remainingSpiritStoneBudget: 100,
    createdAt: 90,
    updatedAt: 100,
  };
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
