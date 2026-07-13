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
      revision: 11,
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
      renewFlushTaskClaim: async () => true,
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
    await verifySupersededGroundPayloadStopsBeforeWatermark();
  } finally {
    restoreEnv('SERVER_RUNTIME_ROLE', previousRole);
    restoreEnv('SERVER_FLUSH_TASK_RUNTIME_MODE', previousMode);
  }
  console.log(JSON.stringify({
    ok: true,
    answers: '实例 tile_damage/tile_resource 可从 staging delta payload 写入批量持久化 API；ground_item 会透传精确 ledger claim，writer 判定旧 payload 已被取代时不推进实例 watermark 或运行态 persisted 标记。',
    excludes: '不证明 time/monster_runtime/fengshui/overlay/room/building，也不替代真实 DB ground/container 竞争证明。',
    completionMapping: 'flush-instance-delta-payload',
  }, null, 2));
}

async function verifySupersededGroundPayloadStopsBeforeWatermark(): Promise<void> {
  let claimed = false;
  let watermarkWrites = 0;
  let markAttempts = 0;
  const task: FlushTask = {
    scope: 'instance',
    id: 'instance-ground-stale',
    domain: 'ground_item',
    priority: 'high',
    latestRevision: 21,
    ownershipEpoch: 7,
    claimOwnerId: 'ground-old-worker:claim',
    fencingToken: 'ground-old-fence',
    payloadJson: {
      kind: 'instance_domain_state',
      domain: 'ground_item',
      payload: {
        fullReplace: false,
        tileIndices: [4],
        entries: [{ tileIndex: 4, items: [{ itemId: 'rat_tail', count: 1 }] }],
      },
      revision: 21,
      watermarkPayload: { revision: 21 },
    },
  };
  const runtime = new FlushTaskRuntimeService(
    {} as never,
    {
      instanceDomainPersistenceService: {
        async replaceGroundItemTiles(
          instanceId: string,
          tileIndices: number[],
          _entries: unknown[],
          ledgerClaim: Record<string, unknown>,
        ) {
          assert.equal(instanceId, task.id);
          assert.deepEqual(tileIndices, [4]);
          assert.deepEqual(ledgerClaim, {
            ownershipEpoch: 7,
            latestVersion: 21,
            claimOwnerId: 'ground-old-worker:claim',
            fencingToken: 'ground-old-fence',
          });
          return false;
        },
        async saveInstanceRecoveryWatermark() {
          watermarkWrites += 1;
        },
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
      markFlushTaskFlushed: async () => {
        markAttempts += 1;
        return false;
      },
      renewFlushTaskClaim: async () => true,
      markFlushTaskRetry: async () => true,
      markFlushTasksRetry: async () => 0,
    } as never,
    { signalPlayerFlush: () => undefined, signalInstanceFlush: () => undefined } as never,
  );
  const processed = await runtime.runOnce('instance-ground-stale-payload-smoke');
  assert.equal(processed, 0);
  assert.equal(markAttempts, 1);
  assert.equal(watermarkWrites, 0);
}

function restoreEnv(name: string, value: string | undefined): void {
  if (typeof value === 'string') process.env[name] = value;
  else delete process.env[name];
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
