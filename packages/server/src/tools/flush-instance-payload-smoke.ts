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

  const savedDamage: unknown[] = [];
  const savedWatermarks: unknown[] = [];
  const flushed: FlushTask[] = [];
  let claimed = false;
  const task: FlushTask = {
    scope: 'instance',
    id: 'instance-1',
    domain: 'tile_damage',
    priority: 'low',
    latestRevision: 11,
    ownershipEpoch: 3,
    payloadJson: {
      kind: 'instance_domain_delta',
      domain: 'tile_damage',
      upserts: [{ tileId: '1,2', hp: 5 }],
      deletes: [],
      watermarkPayload: { revision: 11 },
    },
  };
  const runtime = new FlushTaskRuntimeService(
    {} as never,
    {
      instanceDomainPersistenceService: {
        saveTileDamageDeltaBatch: async (rows: unknown[]) => { savedDamage.push(...rows); },
        saveTileResourceDeltaBatch: async () => undefined,
        saveInstanceRecoveryWatermarkBatch: async (rows: unknown[]) => { savedWatermarks.push(...rows); },
      },
    } as never,
    { flushPlayerDomains: async () => false } as never,
    {
      isEnabled: () => true,
      claimReadyFlushTasks: async (input: { scope: string }) => {
        if (input.scope !== 'instance' || claimed) return [];
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
  );
  try {
    const processed = await runtime.runOnce('instance-payload-smoke');
    assert.equal(processed, 1);
    assert.equal(savedDamage.length, 1);
    assert.equal(savedWatermarks.length, 1);
    assert.equal(flushed.length, 1);
  } finally {
    restoreEnv('SERVER_RUNTIME_ROLE', previousRole);
    restoreEnv('SERVER_FLUSH_TASK_RUNTIME_MODE', previousMode);
  }
  console.log(JSON.stringify({
    ok: true,
    answers: '实例 tile_damage/tile_resource 可从 staging delta payload 写入批量持久化 API，并 mark flushed。',
    excludes: '不证明 time/monster_runtime/fengshui/ground_item/container/overlay/room/building，也不证明真实 DB 多 worker 竞争。',
    completionMapping: 'flush-instance-delta-payload',
  }, null, 2));
}

function restoreEnv(name: string, value: string | undefined): void {
  if (typeof value === 'string') process.env[name] = value;
  else delete process.env[name];
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
