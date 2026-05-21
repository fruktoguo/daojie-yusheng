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
  } finally {
    restoreEnv('SERVER_RUNTIME_ROLE', previousRole);
    restoreEnv('SERVER_FLUSH_TASK_RUNTIME_MODE', previousMode);
  }
  console.log(JSON.stringify({
    ok: true,
    answers: 'presence flush task 可在 worker role 下从 staging payload 写入 PlayerDomainPersistenceService，并 mark flushed。',
    excludes: '只覆盖玩家 presence 域；不证明其他玩家/实例 domain，也不证明真实 DB with-db 竞争。',
    completionMapping: 'flush-presence-payload',
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
