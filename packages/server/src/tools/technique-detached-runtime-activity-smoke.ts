import assert from 'node:assert/strict';

import { installSmokeTimeout } from './smoke-timeout';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldRuntimePlayerLocationService } from '../runtime/world/world-runtime-player-location.service';

installSmokeTimeout(__filename);

function main(): void {
  const service = createPlayerRuntimeService();
  const persistentService = createPlayerRuntimeService({
    isEnabled() {
      return true;
    },
  });

  assertReconnectDoesNotMutateTechniqueActivity(service);
  assertDetachedSessionRetainsPendingAutomation(persistentService);
  assertDetachedPlayerRemainsInRuntimeLocationIndex();

  assert.equal(
    canUnload(service, createDetachedPlayer('player:detached:idle')),
    true,
    'idle detached player without technique activity can be unloaded after reaper flush',
  );
  assert.equal(
    canUnload(service, createDetachedPlayer('player:detached:cultivation', {
      combat: {
        cultivationActive: true,
        autoRootFoundation: false,
        autoBattle: false,
        autoIdleCultivation: true,
      },
    })),
    false,
    'detached cultivation must keep runtime alive so cultivation ticks continue',
  );
  assert.equal(
    canUnload(service, createDetachedPlayer('player:detached:auto-battle', {
      combat: {
        cultivationActive: false,
        autoRootFoundation: false,
        autoBattle: true,
        autoIdleCultivation: false,
      },
    })),
    false,
    'detached auto battle must keep runtime alive so combat ticks continue',
  );
  assert.equal(
    canUnload(service, createDetachedPlayer('player:detached:active-job', {
      alchemyJob: {
        jobRunId: 'job:alchemy:detached',
        remainingTicks: 4,
        workRemainingTicks: 4,
      },
    })),
    false,
    'detached active technique job must keep runtime alive for continued job lifecycle',
  );
  assert.equal(
    canUnload(service, createDetachedPlayer('player:detached:work-only-job', {
      miningJob: {
        jobRunId: 'job:mining:detached',
        remainingTicks: 0,
        workRemainingTicks: 3,
      },
    })),
    false,
    'detached job with workRemainingTicks must keep runtime alive even if legacy remainingTicks is stale',
  );
  assert.equal(
    canUnload(service, createDetachedPlayer('player:detached:queue', {
      techniqueActivityQueue: [{
        queueId: 'queue:gather:detached',
        kind: 'gather',
        payload: { resourceNodeId: 'herb:detached' },
        label: '采集灵草',
        state: 'sleeping',
        createdAt: 1,
      }],
    })),
    false,
    'detached unified technique queue must keep runtime alive until queue lifecycle resolves or persists safely',
  );
  assert.equal(
    canUnload(service, createDetachedPlayer('player:detached:legacy-queue', {
      forgingJob: {
        jobRunId: 'job:forging:legacy-queue',
        remainingTicks: 0,
        workRemainingTicks: 0,
        queuedJobs: [{
          queueId: 'legacy:forging:queued',
          kind: 'forging',
          payload: { recipeId: 'recipe:forging:detached' },
          label: '旧队列炼器',
          createdAt: 2,
        }],
      },
    })),
    false,
    'detached legacy craft queuedJobs must keep runtime alive until hydrate migrates them into the unified queue',
  );

  console.log(JSON.stringify({
    ok: true,
    answers: [
      '断线窗口过期后的运行态卸载会保留仍有 active 技艺 job 的玩家。',
      '自动战斗、打坐修炼、待启动的自动打坐、已有目标的自动反击以及待执行交战意图都会阻止离线运行态被提前卸载。',
      '断线只解绑 session，不会改写自动战斗、修炼或采矿 job 状态。',
      '统一 techniqueActivityQueue 存在 pending/sleeping 项时也会阻止 detached runtime 卸载，避免重连/恢复前队列丢失。',
      '旧 queuedJobs 兼容形态在水合迁移前同样被视为技艺活动，避免旧存档队列被会话回收清掉。',
    ],
  }, null, 2));
}

function assertDetachedPlayerRemainsInRuntimeLocationIndex(): void {
  const locationService = new WorldRuntimePlayerLocationService();
  locationService.setPlayerLocation('player:detached:location-index', {
    instanceId: 'instance:detached:location-index',
  });
  assert.deepEqual(
    Array.from(locationService.listConnectedPlayerIds()),
    ['player:detached:location-index'],
    'runtime location index must keep detached map residents available to auto-combat tick materialization',
  );
}

function assertDetachedSessionRetainsPendingAutomation(service: PlayerRuntimeService): void {
  const idleCultivationPlayer = createDetachedPlayer('player:detached:pending-idle-cultivation', {
    combat: {
      cultivationActive: false,
      autoRootFoundation: false,
      autoBattle: false,
      autoIdleCultivation: true,
      autoRetaliate: false,
    },
  });
  assert.equal(
    canUnloadWithOfflineSession(service, idleCultivationPlayer),
    false,
    'active offline session must survive the reaper while auto idle cultivation is waiting to start',
  );

  const retaliatingPlayer = createDetachedPlayer('player:detached:pending-retaliation', {
    combat: {
      cultivationActive: false,
      autoRootFoundation: false,
      autoBattle: false,
      autoIdleCultivation: false,
      autoRetaliate: true,
      combatTargetId: 'monster:detached:target',
    },
  });
  assert.equal(
    canUnloadWithOfflineSession(service, retaliatingPlayer),
    false,
    'active offline session must survive the reaper while automatic retaliation has a target',
  );

  const pendingEngagePlayer = createDetachedPlayer('player:detached:pending-engage', {
    combat: {
      cultivationActive: false,
      autoRootFoundation: false,
      autoBattle: false,
      autoIdleCultivation: false,
      autoRetaliate: false,
      manualEngagePending: true,
    },
  });
  assert.equal(
    canUnloadWithOfflineSession(service, pendingEngagePlayer),
    false,
    'active offline session must survive the reaper while an engage intent is waiting to execute',
  );

  const deadIdlePlayer = createDetachedPlayer('player:detached:dead-idle', {
    hp: 0,
    combat: {
      cultivationActive: false,
      autoRootFoundation: false,
      autoBattle: false,
      autoIdleCultivation: true,
      autoRetaliate: false,
    },
  });
  assert.equal(
    canUnloadWithOfflineSession(service, deadIdlePlayer),
    true,
    'dead player must not be retained only by automation that cannot start',
  );
}

function canUnloadWithOfflineSession(
  service: PlayerRuntimeService,
  player: Record<string, unknown>,
): boolean {
  const playerId = player.playerId as string;
  service.players.set(playerId, player);
  service.offlineGainSessionsByPlayerId.set(playerId, {
    sessionId: `offline:${playerId}`,
  });
  return service.canUnloadDetachedPlayerRuntime(playerId);
}

function canUnload(service: PlayerRuntimeService, player: Record<string, unknown>): boolean {
  service.players.set(player.playerId as string, player);
  return service.canUnloadDetachedPlayerRuntime(player.playerId as string);
}

function assertReconnectDoesNotMutateTechniqueActivity(service: PlayerRuntimeService): void {
  const player = createDetachedPlayer('player:detached:reconnect', {
    sessionId: 'session:old',
    instanceId: 'instance:old',
    templateId: 'yunlai_town',
    x: 3,
    y: 4,
    facing: 'south',
    combat: {
      cultivationActive: true,
      autoRootFoundation: false,
      autoBattle: true,
      autoIdleCultivation: true,
      autoRetaliate: true,
      combatTargetId: 'monster:detached:reconnect',
    },
    alchemyJob: {
      jobRunId: 'job:alchemy:reconnect',
      remainingTicks: 7,
      totalTicks: 10,
      workRemainingTicks: 7,
      workTotalTicks: 10,
      interruptWaitRemainingTicks: 3,
    },
    techniqueActivityQueue: [{
      queueId: 'queue:alchemy:reconnect',
      kind: 'alchemy',
      payload: { recipeId: 'alchemy.qi_pill' },
      label: '炼丹任务',
      state: 'pending',
      createdAt: 1,
    }],
    miningJob: {
      jobRunId: 'job:mining:reconnect',
      remainingTicks: 0,
      workRemainingTicks: 9,
      workTotalTicks: 12,
    },
  });
  service.players.set(player.playerId as string, player);

  service.detachSession(player.playerId as string);
  assert.equal((player.alchemyJob as { workTotalTicks: number }).workTotalTicks, 10);
  assert.equal((player.alchemyJob as { workRemainingTicks: number }).workRemainingTicks, 7);
  assert.equal((player.alchemyJob as { interruptWaitRemainingTicks: number }).interruptWaitRemainingTicks, 3);
  assert.equal((player.techniqueActivityQueue as unknown[]).length, 1);
  assert.equal((player.combat as { cultivationActive: boolean }).cultivationActive, true);
  assert.equal((player.combat as { autoBattle: boolean }).autoBattle, true);
  assert.equal((player.miningJob as { workRemainingTicks: number }).workRemainingTicks, 9);

  const synced = service.syncFromWorldView(player.playerId as string, 'session:new', {
    instance: {
      instanceId: 'instance:new',
      templateId: 'yunlai_town',
    },
    self: {
      x: 5,
      y: 6,
      facing: 'east',
      fengShuiLuck: 0,
    },
  } as never) as typeof player;

  assert.equal(synced.sessionId, 'session:new');
  assert.equal((synced.alchemyJob as { workTotalTicks: number }).workTotalTicks, 10);
  assert.equal((synced.alchemyJob as { workRemainingTicks: number }).workRemainingTicks, 7);
  assert.equal((synced.alchemyJob as { interruptWaitRemainingTicks: number }).interruptWaitRemainingTicks, 3);
  assert.equal((synced.techniqueActivityQueue as unknown[]).length, 1);
  assert.equal((synced.combat as { cultivationActive: boolean }).cultivationActive, true);
  assert.equal((synced.combat as { autoBattle: boolean }).autoBattle, true);
  assert.equal((synced.miningJob as { workRemainingTicks: number }).workRemainingTicks, 9);
}

function createDetachedPlayer(
  playerId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    playerId,
    sessionId: null,
    hp: 100,
    combat: {
      cultivationActive: false,
      autoRootFoundation: false,
      autoBattle: false,
    },
    ...overrides,
  };
}

function createPlayerRuntimeService(playerDomainPersistenceService: unknown = undefined): PlayerRuntimeService {
  return new PlayerRuntimeService(
    {
      createStarterInventory() {
        return { capacity: 20, items: [] };
      },
      createDefaultEquipment() {
        return {};
      },
      normalizeItem(item: unknown) {
        return item;
      },
      hydrateTechniqueState(entry: unknown) {
        return entry;
      },
    } as never,
    {
      has() {
        return true;
      },
      list() {
        return [{ id: 'yunlai_town', spawnX: 1, spawnY: 1 }];
      },
      getOrThrow() {
        return { id: 'yunlai_town', spawnX: 1, spawnY: 1 };
      },
    } as never,
    {
      createInitialState() {
        return {};
      },
      recalculate() {
        return undefined;
      },
    } as never,
    {
      initializePlayer() {
        return undefined;
      },
    } as never,
    playerDomainPersistenceService as never,
    undefined,
  );
}

main();
