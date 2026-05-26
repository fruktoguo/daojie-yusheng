import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import {
  DEFAULT_BASE_ATTRS,
  DEFAULT_INVENTORY_CAPACITY,
  Direction,
  createNumericRatioDivisors,
  createNumericStats,
} from '@mud/shared';

import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldRuntimePlayerCommandService } from '../runtime/world/command/world-runtime-player-command.service';

function createPlayerRuntimeService(): PlayerRuntimeService {
  return new PlayerRuntimeService(
    {
      createStarterInventory() {
        return {
          capacity: DEFAULT_INVENTORY_CAPACITY,
          items: [],
        };
      },
      createItem(itemId: string, count = 1) {
        return { itemId, count };
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
      has(mapId: string) {
        return mapId === 'yunlai_town';
      },
      getOrThrow(mapId: string) {
        return {
          id: mapId,
          spawnX: 32,
          spawnY: 5,
        };
      },
      list() {
        return [{ id: 'yunlai_town', spawnX: 32, spawnY: 5 }];
      },
    } as never,
    {
      createInitialState() {
        const baseAttrs = { ...DEFAULT_BASE_ATTRS };
        return {
          revision: 1,
          stage: '炼气',
          rawBaseAttrs: null,
          baseAttrs: { ...baseAttrs },
          finalAttrs: { ...baseAttrs },
          numericStats: createNumericStats(),
          ratioDivisors: createNumericRatioDivisors(),
        };
      },
      recalculate() {
        return undefined;
      },
      markPanelDirty() {
        return undefined;
      },
    } as never,
    {
      getRealmRuntimeExpToNext() {
        return 60;
      },
      initializePlayer() {
        return undefined;
      },
    } as never,
    undefined,
    undefined,
  );
}

function testTechniqueActivityQueueSnapshotRoundtrip(): void {
  const service = createPlayerRuntimeService();
  const playerId = 'player:technique-queue-persistence';
  const player = service.createFreshPlayer(playerId, null);
  player.templateId = 'yunlai_town';
  player.instanceId = 'public:yunlai_town';
  player.x = 32;
  player.y = 5;
  player.facing = Direction.South;
  player.unlockedMapIds = ['yunlai_town'];
  player.techniqueActivityQueue = [{
    queueId: 'queue:gather:1',
    kind: 'gather',
    payload: {
      resourceNodeId: 'herb:1',
      nested: { amount: 2 },
    },
    label: '采集灵草',
    targetLabel: '灵草丛',
    state: 'sleeping',
    sleepReason: '距离过远',
    sleepingSince: 100,
    retryAfterTicks: 4,
    cancelRef: {
      kind: 'gather',
      queueId: 'queue:gather:1',
    },
    createdAt: 99,
  }];
  service.players.set(playerId, player);

  const snapshot = service.buildPersistenceSnapshot(playerId, ['active_job']);
  const queue = snapshot?.progression?.techniqueActivityQueue as Array<Record<string, unknown>> | undefined;
  assert.equal(queue?.length, 1);
  assert.equal(queue?.[0]?.queueId, 'queue:gather:1');
  assert.equal(queue?.[0]?.kind, 'gather');
  assert.equal((queue?.[0]?.payload as { nested?: { amount?: number } })?.nested?.amount, 2);

  (player.techniqueActivityQueue[0].payload as { nested: { amount: number } }).nested.amount = 9;
  assert.equal((queue?.[0]?.payload as { nested?: { amount?: number } })?.nested?.amount, 2);

  const restored = service.hydrateFromSnapshot(`${playerId}:restored`, null, snapshot as never);
  assert.equal(restored.techniqueActivityQueue.length, 1);
  assert.equal(restored.techniqueActivityQueue[0]?.cancelRef?.queueId, 'queue:gather:1');
  assert.equal(restored.techniqueActivityQueue[0]?.sleepReason, '距离过远');
  assert.equal((restored.techniqueActivityQueue[0]?.payload as { nested?: { amount?: number } })?.nested?.amount, 2);

  service.players.set(restored.playerId, restored);
  const runtimeSnapshot = service.snapshot(restored.playerId);
  assert.equal(runtimeSnapshot?.techniqueActivityQueue?.length, 1);
  (restored.techniqueActivityQueue[0].payload as { nested: { amount: number } }).nested.amount = 12;
  assert.equal(
    (runtimeSnapshot?.techniqueActivityQueue?.[0]?.payload as { nested?: { amount?: number } })?.nested?.amount,
    2,
  );
}

async function testQueueCancelMarksActiveJobDirty(): Promise<void> {
  const player = {
    playerId: 'player:queue-cancel',
    persistentRevision: 1,
    dirtyDomains: new Set<string>(),
    techniqueActivityQueue: [{
      queueId: 'queue:mining:1',
      kind: 'mining',
      payload: { miningNodeId: 'ore:1' },
      label: '挖矿',
      state: 'pending',
      createdAt: 1,
    }],
  };
  const flushes: string[] = [];
  const commandService = Object.create(WorldRuntimePlayerCommandService.prototype) as WorldRuntimePlayerCommandService;
  (commandService as unknown as { playerRuntimeService: unknown }).playerRuntimeService = {
    getPlayer(playerId: string) {
      return playerId === player.playerId ? player : null;
    },
    markPersistenceDirtyDomains(target: typeof player, domains: string[]) {
      for (const domain of domains) {
        target.dirtyDomains.add(domain);
      }
    },
    bumpPersistentRevision(target: typeof player) {
      target.persistentRevision += 1;
    },
  };

  await commandService.dispatchCancelTechniqueActivityByRef(
    player.playerId,
    { kind: 'mining', queueId: 'queue:mining:1' },
    {
      worldRuntimeCraftMutationService: {
        flushCraftMutation(playerId: string, _result: unknown, kind: string) {
          flushes.push(`${playerId}:${kind}`);
        },
      },
    } as never,
  );

  assert.equal(player.techniqueActivityQueue.length, 0);
  assert.equal(player.dirtyDomains.has('active_job'), true);
  assert.equal(player.persistentRevision, 2);
  assert.deepEqual(flushes, ['player:queue-cancel:mining']);
}

async function main(): Promise<void> {
  testTechniqueActivityQueueSnapshotRoundtrip();
  await testQueueCancelMarksActiveJobDirty();

  console.log(JSON.stringify({
    ok: true,
    answers: [
      'techniqueActivityQueue 随 active_job 域进入玩家快照，payload 深拷贝后不会共享引用。',
      'hydrateFromSnapshot 和 snapshot clone 会恢复/复制统一技艺队列。',
      '统一任务列表取消队列项会标记 active_job 脏域并递增持久化版本。',
    ],
  }, null, 2));
}

void main();
