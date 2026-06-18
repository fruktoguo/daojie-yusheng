import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { WorldRuntimeInstanceTickOrchestrationService } from '../runtime/world/world-runtime-instance-tick-orchestration.service';

interface SubmittedInstanceTask {
  kind: string;
  payload: {
    instanceId: string;
    mirror: {
      monsters: unknown[];
      players: unknown[];
    };
  };
  deadlineMs: number;
}

async function main(): Promise<void> {
  const expectedIntents = [{ monsterId: 'monster:precompute', action: 'idle' }];
  const submitted: SubmittedInstanceTask[] = [];
  let capturedIntents: unknown = null;
  let capturedOptions: unknown = null;
  const progress = new Map<string, number>([['instance:precompute', 0]]);

  const instance = {
    meta: { instanceId: 'instance:precompute' },
    template: { id: 'yunlai_town' },
    tick: 10,
    playersById: new Map([['player:precompute', { playerId: 'player:precompute', x: 2, y: 2 }]]),
    listMonsterAiWorkerMirrors() {
      return [{
        monsterId: 'monster:precompute',
        x: 1,
        y: 1,
        hp: 10,
        maxHp: 10,
        alive: true,
        aggroTargetId: null,
        aggroRange: 5,
        leashRange: 10,
        spawnX: 1,
        spawnY: 1,
      }];
    },
    listPlayerPositionWorkerMirrors() {
      return [{ playerId: 'player:precompute', x: 2, y: 2 }];
    },
    tickOnce(intents: unknown, options: unknown) {
      capturedIntents = intents;
      capturedOptions = options;
      this.tick += 1;
      return { transfers: [], monsterActions: [] };
    },
    advanceTileResourceFlow() {
      return false;
    },
    listPlayerIds() {
      return ['player:precompute'];
    },
  };

  const deps = {
    tick: 100,
    listInstanceRuntimes() {
      return [instance];
    },
    worldRuntimeCombatEffectsService: {
      resetFrameEffects() {},
    },
    worldRuntimeTickProgressService: {
      getProgress(instanceId: string) {
        return progress.get(instanceId) ?? 0;
      },
      setProgress(instanceId: string, value: number) {
        progress.set(instanceId, value);
      },
    },
    worldRuntimeMetricsService: {
      recordIdleFrame() {
        throw new Error('active instance should not record idle frame');
      },
      recordFrameResult() {},
    },
    processPendingRespawns() {},
    async materializeNavigationCommands() {},
    materializeAutoUsePills() {},
    materializeAutoCombatCommands() {},
    async dispatchPendingCommands() {},
    dispatchPendingSystemCommands() {},
    worldRuntimeNavigationService: {
      getBlockedPlayerIds() {
        return new Set<string>();
      },
    },
    applyTransfer() {},
    applyMonsterAction() {},
    playerRuntimeService: {
      getPlayer(playerId: string) {
        return playerId === 'player:precompute'
          ? { playerId, techniques: { techniques: [] }, buffs: { buffs: [] }, runtimeBonuses: [] }
          : null;
      },
      advanceTickForPlayerIds() {},
    },
    worldRuntimeCraftTickService: {
      async advanceCraftJobs() {},
    },
    worldRuntimeLootContainerService: {
      advanceContainerSearches() {},
    },
    refreshQuestStates() {},
  };

  const instanceWorkerPool = {
    async submit(kind: string, payload: SubmittedInstanceTask['payload'], _fallback: unknown, deadlineMs: number) {
      submitted.push({ kind, payload, deadlineMs });
      return {
        ok: true,
        result: {
          instanceId: payload.instanceId,
          monsterIntents: expectedIntents,
          resourceMutations: [],
          buildingMutations: [],
        },
        durationMs: 1,
      };
    },
  };

  const service = new WorldRuntimeInstanceTickOrchestrationService(instanceWorkerPool as never);
  const ticks = await service.advanceFrame(deps, 1000, null);

  assert.equal(ticks, 1);
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].kind, 'instance-advance');
  assert.equal(submitted[0].payload.instanceId, 'instance:precompute');
  assert.equal(submitted[0].payload.mirror.monsters.length, 1);
  assert.equal(submitted[0].payload.mirror.players.length, 1);
  assert.equal(submitted[0].deadlineMs, 800);
  assert.deepEqual(capturedIntents, expectedIntents);
  assert.deepEqual(capturedOptions, { sleepMonsterAi: false });

  console.log(JSON.stringify({
    ok: true,
    answers: '实例 worker 预计算默认提交有玩家且有妖兽的实例，并将 intent proposals 传入 tickOnce；空实例和无妖兽实例仍由编排过滤。',
    excludes: '不证明真实 worker 线程执行耗时、完整怪物仇恨结果或资源流动外移。',
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
