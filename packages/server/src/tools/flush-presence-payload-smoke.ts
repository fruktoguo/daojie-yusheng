import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { FlushTaskRuntimeService } from '../persistence/flush-task-runtime.service';
import type { FlushTask } from '../persistence/flush-task.types';

async function main(): Promise<void> {
  const previousRole = process.env.SERVER_RUNTIME_ROLE;
  const previousMode = process.env.SERVER_FLUSH_TASK_RUNTIME_MODE;
  process.env.SERVER_RUNTIME_ROLE = 'worker';
  process.env.SERVER_FLUSH_TASK_RUNTIME_MODE = 'worker';

  const saved: Array<{ playerId: string; payload: unknown }> = [];
  const savedProjections: Array<{ playerId: string; domains: string[]; snapshot: unknown }> = [];
  const flushed: FlushTask[] = [];
  let claimed = false;
  const task: FlushTask = {
    scope: 'player',
    id: 'player-presence-1',
    domain: 'presence',
    priority: 'high',
    latestRevision: 7,
    payloadJson: {
      online: true,
      inWorld: true,
      lastHeartbeatAt: 12345,
      offlineSinceAt: null,
      runtimeOwnerId: 'api-1',
      sessionEpoch: 9,
      versionSeed: 7,
    },
  };
  const runtime = new FlushTaskRuntimeService(
    {} as never,
    {} as never,
    { flushPlayerDomains: async () => { throw new Error('presence payload should not use runtime flush fallback'); } } as never,
    {
      isEnabled: () => true,
      claimReadyFlushTasks: async () => {
        if (claimed) return [];
        claimed = true;
        return [task];
      },
      markFlushTaskFlushed: async (flushedTask: FlushTask) => {
        flushed.push(flushedTask);
        return true;
      },
      markFlushTaskRetry: async () => true,
      markFlushTasksRetry: async () => 0,
    } as never,
    { signalPlayerFlush: () => undefined, signalInstanceFlush: () => undefined } as never,
    undefined,
    undefined,
    {
      isEnabled: () => true,
      savePlayerPresence: async (playerId: string, payload: unknown) => {
        saved.push({ playerId, payload });
      },
      savePlayerSnapshotProjectionDomains: async (playerId: string, snapshot: unknown, domains: Iterable<string>) => {
        savedProjections.push({ playerId, snapshot, domains: Array.from(domains).sort() });
      },
    } as never,
  );
  try {
    const processed = await runtime.runOnce('presence-payload-smoke');
    assert.equal(processed, 1);
    assert.equal(saved.length, 1);
    assert.equal(saved[0]?.playerId, 'player-presence-1');
    assert.deepEqual(saved[0]?.payload, {
      ...task.payloadJson as Record<string, unknown>,
      transferState: null,
      transferTargetNodeId: null,
    });
    assert.equal(flushed.length, 1);

    const projectionTask: FlushTask = {
      scope: 'player',
      id: 'player-snapshot-1',
      domain: 'inventory',
      priority: 'high',
      latestRevision: 8,
      payloadJson: {
        kind: 'player_snapshot_projection',
        snapshot: { version: 1, savedAt: 88, placement: { templateId: 'map-1', x: 1, y: 2 }, inventory: { items: [{ itemId: 'ore' }] } },
      },
    };
    const questProjectionTask: FlushTask = {
      scope: 'player',
      id: 'player-snapshot-1',
      domain: 'quest',
      priority: 'normal',
      latestRevision: 9,
      payloadJson: {
        kind: 'player_snapshot_projection',
        snapshot: { version: 1, savedAt: 99, placement: { templateId: 'map-1', x: 1, y: 2 }, quests: { entries: [{ questId: 'quest-1' }] } },
      },
    };
    let projectionClaimed = false;
    const projectionRuntime = new FlushTaskRuntimeService(
      {} as never,
      {} as never,
      { flushPlayerDomains: async () => { throw new Error('snapshot payload should not use runtime flush fallback'); } } as never,
      {
        isEnabled: () => true,
        claimReadyFlushTasks: async () => {
          if (projectionClaimed) return [];
          projectionClaimed = true;
          return [projectionTask, questProjectionTask];
        },
        markFlushTaskFlushed: async (flushedTask: FlushTask) => {
          flushed.push(flushedTask);
          return true;
        },
        markFlushTaskRetry: async () => true,
        markFlushTasksRetry: async () => 0,
      } as never,
      { signalPlayerFlush: () => undefined, signalInstanceFlush: () => undefined } as never,
      undefined,
      undefined,
      {
        isEnabled: () => true,
        savePlayerPresence: async () => undefined,
        savePlayerSnapshotProjectionDomains: async (playerId: string, snapshot: unknown, domains: Iterable<string>) => {
          savedProjections.push({ playerId, snapshot, domains: Array.from(domains).sort() });
        },
      } as never,
    );
    const projectionProcessed = await projectionRuntime.runOnce('snapshot-payload-smoke');
    assert.equal(projectionProcessed, 2);
    assert.equal(savedProjections.length, 2);
    assert.equal(savedProjections[0]?.playerId, 'player-snapshot-1');
    assert.deepEqual(savedProjections[0]?.domains, ['inventory']);
    assert.deepEqual(savedProjections[1]?.domains, ['quest']);
    assert.deepEqual((savedProjections[0]?.snapshot as { inventory?: unknown })?.inventory, { items: [{ itemId: 'ore' }] });
    assert.deepEqual((savedProjections[1]?.snapshot as { quests?: unknown })?.quests, { entries: [{ questId: 'quest-1' }] });
    assert.equal(flushed.length, 3);
  } finally {
    restoreEnv('SERVER_RUNTIME_ROLE', previousRole);
    restoreEnv('SERVER_FLUSH_TASK_RUNTIME_MODE', previousMode);
  }
  console.log(JSON.stringify({
    ok: true,
    answers: '玩家 presence 与 snapshot projectable flush task 可在 worker role 下从 staging payload 写入 PlayerDomainPersistenceService，并 mark flushed。',
    excludes: '不证明邮件/市场/GM edit 或实例 domain，也不证明真实 DB with-db 竞争。',
    completionMapping: 'flush-player-payload',
  }, null, 2));
}

function restoreEnv(name: string, value: string | undefined): void {
  if (typeof value === 'string') {
    process.env[name] = value;
  } else {
    delete process.env[name];
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
