import assert from 'node:assert/strict';

import { installSmokeTimeout } from './smoke-timeout';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';

installSmokeTimeout(__filename);

function main(): void {
  const service = createPlayerRuntimeService();

  assertReconnectDoesNotMutateTechniqueActivity(service);

  assert.equal(
    canUnload(service, createDetachedPlayer('player:detached:idle')),
    true,
    'idle detached player without technique activity can be unloaded after reaper flush',
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
      '统一 techniqueActivityQueue 存在 pending/sleeping 项时也会阻止 detached runtime 卸载，避免重连/恢复前队列丢失。',
      '旧 queuedJobs 兼容形态在水合迁移前同样被视为技艺活动，避免旧存档队列被会话回收清掉。',
    ],
  }, null, 2));
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
  });
  service.players.set(player.playerId as string, player);

  service.detachSession(player.playerId as string);
  assert.equal((player.alchemyJob as { workTotalTicks: number }).workTotalTicks, 10);
  assert.equal((player.alchemyJob as { workRemainingTicks: number }).workRemainingTicks, 7);
  assert.equal((player.alchemyJob as { interruptWaitRemainingTicks: number }).interruptWaitRemainingTicks, 3);
  assert.equal((player.techniqueActivityQueue as unknown[]).length, 1);

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
}

function createDetachedPlayer(
  playerId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    playerId,
    sessionId: null,
    combat: {
      cultivationActive: false,
      autoRootFoundation: false,
      autoBattle: false,
    },
    ...overrides,
  };
}

function createPlayerRuntimeService(): PlayerRuntimeService {
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
    undefined,
    undefined,
  );
}

main();
