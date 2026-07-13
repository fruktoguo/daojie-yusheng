import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { CraftPanelRuntimeService } from '../runtime/craft/craft-panel-runtime.service';
import { buildTechniqueActivityTaskListView } from '../runtime/craft/technique-activity-task-view.helpers';
import { WorldRuntimePlayerCommandEnqueueService } from '../runtime/world/command/world-runtime-player-command-enqueue.service';
import { WorldRuntimePlayerCommandService } from '../runtime/world/command/world-runtime-player-command.service';

type QueueEntry = {
  queueId: string;
  kind: string;
  label: string;
  state: string;
  createdAt: number;
  payload: Record<string, never>;
};

function queueEntry(queueId: string, kind: string, createdAt: number): QueueEntry {
  return {
    queueId,
    kind,
    label: queueId,
    state: 'pending',
    createdAt,
    payload: {},
  };
}

async function main(): Promise<void> {
  const dirtyDomains: string[][] = [];
  let revisionBumps = 0;
  const player = {
    playerId: 'player:queue-reorder-smoke',
    hp: 100,
    techniqueActivityQueue: [
      queueEntry('queue:1', 'alchemy', 1),
      queueEntry('queue:2', 'formation', 2),
      queueEntry('queue:3', 'building', 3),
    ],
    alchemyJob: {
      jobRunId: 'job:alchemy:1',
      jobType: 'alchemy',
      phase: 'running',
      totalTicks: 10,
      remainingTicks: 8,
      jobVersion: 1,
      queuedJobs: [
        queueEntry('legacy:1', 'alchemy', 4),
        queueEntry('legacy:2', 'alchemy', 5),
      ],
    },
  };
  const craftService = Object.create(CraftPanelRuntimeService.prototype) as CraftPanelRuntimeService & {
    playerRuntimeService: {
      markPersistenceDirtyDomains(_player: unknown, domains: string[]): void;
      bumpPersistentRevision(_player: unknown): void;
    };
  };
  craftService.playerRuntimeService = {
    markPersistenceDirtyDomains(_player: unknown, domains: string[]): void {
      dirtyDomains.push([...domains]);
    },
    bumpPersistentRevision(): void {
      revisionBumps += 1;
    },
  };

  const movedTop = craftService.reorderTechniqueActivityQueue(player, 'queue:3', 'move_to_top');
  assert.equal(movedTop.panelChanged, true);
  assert.deepEqual(player.techniqueActivityQueue.map((entry) => entry.queueId), ['queue:3', 'queue:1', 'queue:2']);
  assert.deepEqual(dirtyDomains, [['active_job']]);
  assert.equal(revisionBumps, 1);
  assert.equal(player.alchemyJob.jobVersion, 2);

  const topNoop = craftService.reorderTechniqueActivityQueue(player, 'queue:3', 'move_to_top');
  assert.equal(topNoop.panelChanged, false);
  assert.equal(revisionBumps, 1);

  craftService.reorderTechniqueActivityQueue(player, 'queue:3', 'move_down');
  assert.deepEqual(player.techniqueActivityQueue.map((entry) => entry.queueId), ['queue:1', 'queue:3', 'queue:2']);
  assert.equal(revisionBumps, 2);

  const tailNoop = craftService.reorderTechniqueActivityQueue(player, 'queue:2', 'move_down');
  const staleNoop = craftService.reorderTechniqueActivityQueue(player, 'queue:missing', 'move_to_top');
  assert.equal(tailNoop.panelChanged, false);
  assert.equal(staleNoop.panelChanged, false);
  assert.equal(revisionBumps, 2);

  craftService.reorderTechniqueActivityQueue(player, 'legacy:2', 'move_to_top');
  assert.deepEqual(player.alchemyJob.queuedJobs.map((entry) => entry.queueId), ['legacy:2', 'legacy:1']);
  assert.equal(revisionBumps, 3);

  const queuedTaskIds = buildTechniqueActivityTaskListView(player as never).tasks
    .map((task) => task.cancelRef.queueId)
    .filter((queueId): queueId is string => Boolean(queueId));
  assert.deepEqual(queuedTaskIds, ['legacy:2', 'legacy:1', 'queue:1', 'queue:3', 'queue:2']);

  const capturedCommands: unknown[] = [];
  const enqueueService = Object.create(WorldRuntimePlayerCommandEnqueueService.prototype) as WorldRuntimePlayerCommandEnqueueService;
  enqueueService.enqueueReorderTechniqueActivityQueue(player.playerId, '  queue:2  ', 'move_to_top', {
    getPlayerLocationOrThrow(): void {},
    enqueuePendingCommand(_playerId: string, command: unknown): void {
      capturedCommands.push(command);
    },
    getPlayerViewOrThrow(): object {
      return {};
    },
  });
  assert.deepEqual(capturedCommands, [{
    kind: 'reorderTechniqueActivityQueue',
    queueId: 'queue:2',
    action: 'move_to_top',
  }]);
  assert.throws(
    () => enqueueService.enqueueReorderTechniqueActivityQueue(player.playerId, 'queue:2', 'invalid', {}),
    /行动队列调整参数无效/,
  );

  const flushed: unknown[] = [];
  const commandService = Object.create(WorldRuntimePlayerCommandService.prototype) as WorldRuntimePlayerCommandService & {
    playerRuntimeService: { getPlayer(playerId: string): typeof player | null };
  };
  commandService.playerRuntimeService = {
    getPlayer(playerId: string): typeof player | null {
      return playerId === player.playerId ? player : null;
    },
  };
  await commandService.dispatchPlayerCommand(player.playerId, {
    kind: 'reorderTechniqueActivityQueue',
    queueId: 'queue:2',
    action: 'move_to_top',
  }, {
    craftPanelRuntimeService: craftService,
    worldRuntimeCraftMutationService: {
      flushCraftMutation(playerId: string, result: unknown, kind: string): void {
        flushed.push([playerId, result, kind]);
      },
    },
  });
  assert.deepEqual(player.techniqueActivityQueue.map((entry) => entry.queueId), ['queue:2', 'queue:1', 'queue:3']);
  assert.equal(flushed.length, 1);
  assert.equal(revisionBumps, 4);

  console.log(JSON.stringify({
    ok: true,
    persistedMutations: revisionBumps,
    flushedMutations: flushed.length,
    answers: '行动队列支持服务端权威置顶、下移和边界幂等；统一队列与旧 active job 队列均保持数组顺序，并进入 active_job 持久化与任务列表刷新链。',
  }, null, 2));
}

void main();
