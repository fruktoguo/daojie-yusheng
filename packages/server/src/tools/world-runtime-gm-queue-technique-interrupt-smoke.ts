import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { WorldRuntimeGmQueueService } from '../runtime/world/command/world-runtime-gm-queue.service';

function main(): void {
  testGmRelocationInterruptsTechniqueActivity();
  testGmVitalsOnlyDoesNotInterruptTechniqueActivity();

  console.log(JSON.stringify({
    ok: true,
    answers: [
      'GM 强迁和重定位会先触发统一技艺中断器，位置依赖 job 不会绕过 pipeline。',
      'GM 只改血量/自动战斗时不会误触发技艺中断。',
    ],
  }, null, 2));
}

function testGmRelocationInterruptsTechniqueActivity(): void {
  for (const command of [
    { playerId: 'player:gm-relocate', instanceId: 'instance:next', x: 8, y: 9 },
    { playerId: 'player:gm-relocate', x: 4, y: 5 },
  ]) {
    const log: Array<[string, ...unknown[]]> = [];
    const { player, deps } = createGmDeps(log);
    const beforeProgress = pickProgressFields(player.alchemyJob);
    new WorldRuntimeGmQueueService().dispatchGmUpdatePlayer(command, deps);

    assert.equal(log.some((entry) => entry[0] === 'interruptCraftForReason'), true);
    assert.deepEqual(pickProgressFields(player.alchemyJob), beforeProgress);
    assert.equal(player.alchemyJob.interruptWaitRemainingTicks, 10);
    assert.equal(player.alchemyJob.interruptState?.reason, 'move');
  }
}

function testGmVitalsOnlyDoesNotInterruptTechniqueActivity(): void {
  const log: Array<[string, ...unknown[]]> = [];
  const { player, deps } = createGmDeps(log);
  const beforeProgress = pickProgressFields(player.alchemyJob);

  new WorldRuntimeGmQueueService().dispatchGmUpdatePlayer({
    playerId: player.playerId,
    hp: 12,
    autoBattle: true,
  }, deps);

  assert.equal(log.some((entry) => entry[0] === 'interruptCraftForReason'), false);
  assert.deepEqual(pickProgressFields(player.alchemyJob), beforeProgress);
  assert.equal(player.alchemyJob.interruptWaitRemainingTicks, 0);
}

function createGmDeps(log: Array<[string, ...unknown[]]>): { player: any; deps: any } {
  let viewInstanceId = 'instance:old';
  let viewTemplateId = 'old_map';
  let viewX = 1;
  let viewY = 2;
  const player = {
    playerId: 'player:gm-relocate',
    sessionId: 'session:gm-relocate',
    instanceId: 'instance:old',
    templateId: 'old_map',
    x: 1,
    y: 2,
    hp: 30,
    attrs: { numericStats: { moveSpeed: 11 } },
    alchemyJob: createProgressJob('alchemy', 'brewing'),
  };
  const oldInstance = {
    meta: { instanceId: 'instance:old' },
    disconnectPlayer(playerId: string): void {
      log.push(['disconnectPlayer', playerId]);
    },
    relocatePlayer(playerId: string, x: number, y: number): void {
      log.push(['oldRelocatePlayer', playerId, x, y]);
    },
  };
  const nextInstance = {
    meta: { instanceId: 'instance:next' },
    connectPlayer(payload: { playerId: string; sessionId: string; preferredX?: number; preferredY?: number }): { sessionId: string } {
      log.push(['connectPlayer', payload.playerId, payload.preferredX ?? null, payload.preferredY ?? null]);
      viewInstanceId = 'instance:next';
      viewTemplateId = 'next_map';
      viewX = Math.trunc(Number(payload.preferredX) || 0);
      viewY = Math.trunc(Number(payload.preferredY) || 0);
      return { sessionId: payload.sessionId };
    },
    setPlayerMoveSpeed(playerId: string, speed: number): void {
      log.push(['setPlayerMoveSpeed', playerId, speed]);
    },
    relocatePlayer(playerId: string, x: number, y: number): void {
      log.push(['relocatePlayer', playerId, x, y]);
      viewInstanceId = 'instance:old';
      viewTemplateId = 'old_map';
      viewX = x;
      viewY = y;
    },
  };
  const deps = {
    playerRuntimeService: {
      getPlayer(playerId: string): any | null {
        return playerId === player.playerId ? player : null;
      },
      ensurePlayer(playerId: string): any {
        assert.equal(playerId, player.playerId);
        log.push(['ensurePlayer', playerId]);
        return player;
      },
      syncFromWorldView(playerId: string, sessionId: string, view: { instance: { instanceId: string; templateId: string }; self: { x: number; y: number } }): void {
        assert.equal(playerId, player.playerId);
        player.sessionId = sessionId;
        player.instanceId = view.instance.instanceId;
        player.templateId = view.instance.templateId;
        player.x = view.self.x;
        player.y = view.self.y;
        log.push(['syncFromWorldView', playerId, view.instance.instanceId, view.self.x, view.self.y]);
      },
      setVitals(playerId: string, vitals: { hp?: number }): void {
        assert.equal(playerId, player.playerId);
        if (vitals.hp !== undefined) {
          player.hp = vitals.hp;
        }
        log.push(['setVitals', playerId, vitals.hp ?? null]);
      },
      deferVitalRecoveryUntilTick(playerId: string, tick: number): void {
        log.push(['deferVitalRecoveryUntilTick', playerId, tick]);
      },
      updateCombatSettings(playerId: string, settings: { autoBattle?: boolean }): void {
        log.push(['updateCombatSettings', playerId, settings.autoBattle ?? null]);
      },
    },
    getInstanceRuntime(instanceId: string): unknown {
      if (instanceId === 'instance:old') return oldInstance;
      if (instanceId === 'instance:next') return nextInstance;
      return null;
    },
    getOrCreatePublicInstance(): unknown {
      return oldInstance;
    },
    getPlayerLocation(): { instanceId: string; sessionId: string } {
      return { instanceId: player.instanceId, sessionId: player.sessionId };
    },
    setPlayerLocation(playerId: string, location: { instanceId: string; sessionId: string }): void {
      assert.equal(playerId, player.playerId);
      log.push(['setPlayerLocation', playerId, location.instanceId]);
    },
    getPlayerViewOrThrow(): { instance: { instanceId: string; templateId: string }; self: { x: number; y: number } } {
      return {
        instance: {
          instanceId: viewInstanceId,
          templateId: viewTemplateId,
        },
        self: { x: viewX, y: viewY },
      };
    },
    refreshPlayerContextActions(playerId: string): void {
      log.push(['refreshPlayerContextActions', playerId]);
    },
    resolveDefaultRespawnMapId(): string {
      return 'old_map';
    },
    resolveCurrentTickForPlayerId(): number {
      return 100;
    },
    worldRuntimeCraftInterruptService: {
      interruptCraftForReason(playerId: string, activePlayer: typeof player, reason: string): void {
        assert.equal(playerId, player.playerId);
        assert.equal(activePlayer, player);
        assert.equal(reason, 'move');
        log.push(['interruptCraftForReason', playerId, reason]);
        activePlayer.alchemyJob.phase = 'paused';
        activePlayer.alchemyJob.pausedTicks = 10;
        activePlayer.alchemyJob.interruptWaitRemainingTicks = 10;
        activePlayer.alchemyJob.interruptState = {
          reason: 'move',
          waitTotalTicks: 10,
          waitRemainingTicks: 10,
          startedAtTick: 100,
        };
      },
    },
  };
  return { player, deps };
}

function createProgressJob(jobType: string, phase: string): any {
  return {
    jobRunId: `job:${jobType}:gm-proof`,
    jobType,
    phase,
    totalTicks: 20,
    remainingTicks: 12,
    workTotalTicks: 20,
    workRemainingTicks: 12,
    pausedTicks: 0,
    interruptWaitRemainingTicks: 0,
    interruptState: null,
    successRate: 1,
    spiritStoneCost: 0,
    startedAt: 1,
    outputItemId: 'pill.gm',
  };
}

function pickProgressFields(job: { totalTicks: number; remainingTicks: number; workTotalTicks: number; workRemainingTicks: number }): Record<string, number> {
  return {
    totalTicks: job.totalTicks,
    remainingTicks: job.remainingTicks,
    workTotalTicks: job.workTotalTicks,
    workRemainingTicks: job.workRemainingTicks,
  };
}

main();
