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

  const flushed: string[] = [];
  const persistence = {
    replaceGroundItemTiles: async (instanceId: string, tileIndices: unknown[], entries: unknown[]) => {
      flushed.push(`ground_item:${instanceId}:${tileIndices.length}:${entries.length}`);
    },
    saveContainerState: async (input: { instanceId: string; containerId?: unknown; sourceId?: unknown }) => {
      flushed.push(`container_state:${input.instanceId}:${String(input.containerId ?? '')}`);
    },
    saveOverlayChunk: async (input: { instanceId: string; chunkKey?: unknown }) => {
      flushed.push(`overlay:${input.instanceId}:${String(input.chunkKey ?? '')}`);
    },
    saveMonsterRuntimeDelta: async (instanceId: string, upserts: unknown[], deletes: unknown[]) => {
      flushed.push(`monster_runtime:${instanceId}:${upserts.length}:${deletes.length}`);
    },
    saveBuildingRoomFengShuiState: async (instanceId: string) => {
      flushed.push(`building:${instanceId}`);
    },
    saveInstanceCheckpoint: async (instanceId: string) => {
      flushed.push(`time:${instanceId}`);
    },
  };

  const scenarios: Array<{
    id: string;
    domain: string;
    payloadJson: unknown;
    expected: string;
  }> = [
    { id: 'instance-ground', domain: 'ground_item', payloadJson: { kind: 'instance_domain_state', domain: 'ground_item', payload: { tileIndices: [1], entries: [{ id: 'g1' }] } }, expected: 'ground_item:instance-ground:1:1' },
    { id: 'instance-overlay', domain: 'overlay', payloadJson: { kind: 'instance_domain_state', domain: 'overlay', payload: [{ chunkKey: 'overlay-1', patchKind: 'replace', patchVersion: 1, patchPayload: { x: 1 } }] }, expected: 'overlay:instance-overlay:overlay-1' },
    { id: 'instance-monster', domain: 'monster_runtime', payloadJson: { kind: 'instance_domain_state', domain: 'monster_runtime', payload: { fullReplace: false, upserts: [{ monsterId: 'm1' }], deletes: [] } }, expected: 'monster_runtime:instance-monster:1:0' },
    { id: 'instance-container', domain: 'container_state', payloadJson: { kind: 'instance_domain_state', domain: 'container_state', payload: [{ containerId: 'c1', sourceId: 's1', items: [] }] }, expected: 'container_state:instance-container:c1' },
    { id: 'instance-building', domain: 'building', payloadJson: { kind: 'instance_domain_state', domain: 'building', payload: { buildings: [{ id: 'b1' }], rooms: [], fengShui: [] } }, expected: 'building:instance-building' },
    { id: 'instance-time', domain: 'time', payloadJson: { kind: 'instance_domain_state', domain: 'time', payload: { version: 2, savedAt: 1, templateId: 't1', tick: 3, tickSpeed: 1, paused: false } }, expected: 'time:instance-time' },
  ];

  try {
    for (const scenario of scenarios) {
      let claimed = false;
      const ledger = {
        isEnabled: () => true,
        claimReadyFlushTasks: async (input: { scope: string }) => {
          if (input.scope !== 'instance' || claimed) return [];
          claimed = true;
          const task: FlushTask = { scope: 'instance', id: scenario.id, domain: scenario.domain, priority: 'normal', latestRevision: 1, ownershipEpoch: 1, payloadJson: scenario.payloadJson };
          return [task];
        },
        markFlushTaskFlushed: async () => true,
        markFlushTasksRetry: async () => 0,
        markFlushTaskRetry: async () => true,
      };
      const runtime = new FlushTaskRuntimeService(
        { listDirtyPlayerDomains: () => new Map() } as never,
        {
          instanceDomainPersistenceService: persistence,
          listDirtyPersistentInstanceDomains: () => [],
          getInstanceRuntime: () => ({
            meta: { persistent: true, ownershipEpoch: 1 },
            buildGroundPersistenceDelta: () => ({ fullReplace: false, tileIndices: [1], entries: [{ id: 'g1' }] }),
            buildOverlayPersistenceChunks: () => [{ chunkKey: 'overlay-1', patchKind: 'replace', patchVersion: 1, patchPayload: { x: 1 } }],
            buildMonsterRuntimePersistenceDelta: () => ({ fullReplace: false, upserts: [{ monsterId: 'm1' }], deletes: [] }),
            buildBuildingRoomFengShuiPersistenceState: () => ({ buildings: [{ id: 'b1' }], rooms: [], fengShui: [] }),
          }) as never,
        } as never,
        { flushPlayerDomains: async () => true } as never,
        ledger as never,
        { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
        undefined,
        persistence as never,
      );
      const processed = await runtime.runOnce(`instance-state-payload:${scenario.id}`);
      assert.equal(processed, 1);
      assert.equal(flushed.at(-1), scenario.expected);
    }
    assert.equal(flushed.length, scenarios.length);

    process.env.SERVER_RUNTIME_ROLE = 'api';
    process.env.SERVER_FLUSH_TASK_RUNTIME_MODE = 'off';
    const staged: unknown[] = [];
    const stagingLedger = {
      isEnabled: () => true,
      upsertFlushTask: async (task: unknown) => {
        staged.push(task);
      },
    };
    const stagingRuntime = new FlushTaskRuntimeService(
      { listDirtyPlayerDomains: () => new Map() } as never,
      {
        listDirtyPersistentInstanceDomains: () => [{ instanceId: 'stage-time', domains: ['time'] }],
        getInstanceRuntime: () => ({
          meta: { persistent: true, ownershipEpoch: 7 },
          template: { id: 'stage-template' },
          tick: 42,
          tickSpeed: 1,
          paused: false,
          getPersistenceRevision: () => 11,
        }) as never,
      } as never,
      { flushPlayerDomains: async () => true } as never,
      stagingLedger as never,
      { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
      undefined,
      persistence as never,
    );
    await stagingRuntime.stageDirtyTasksOnce();
    assert.equal(staged.length, 1);
    const stagedTask = staged[0] as { domain?: string; payloadJson?: { kind?: string; domain?: string; payload?: { tick?: number; templateId?: string } } | null };
    assert.equal(stagedTask.domain, 'time');
    assert.equal(stagedTask.payloadJson?.kind, 'instance_domain_state');
    assert.equal(stagedTask.payloadJson?.domain, 'time');
    assert.equal(stagedTask.payloadJson?.payload?.tick, 42);
    assert.equal(stagedTask.payloadJson?.payload?.templateId, 'stage-template');
  } finally {
    restoreEnv('SERVER_RUNTIME_ROLE', previousRole);
    restoreEnv('SERVER_FLUSH_TASK_RUNTIME_MODE', previousMode);
  }

  console.log(JSON.stringify({
    ok: true,
    answers: '实例 ground_item/overlay/monster_runtime/container_state/building-room-fengshui/time 可从 staging state payload 写入持久化 API，并 mark flushed。',
    excludes: '不证明真实 DB with-db 竞争。',
    completionMapping: 'flush-instance-state-payload',
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
