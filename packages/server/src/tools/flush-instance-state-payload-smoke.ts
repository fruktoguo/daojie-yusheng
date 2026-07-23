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
    replaceRuntimeTileCells: async (instanceId: string, entries: unknown[]) => {
      flushed.push(`tile_cell:${instanceId}:${entries.length}`);
    },
    replaceTemporaryTileStates: async (instanceId: string, entries: unknown[]) => {
      flushed.push(`temporary_tile:${instanceId}:${entries.length}`);
    },
    replaceGroundItems: async (instanceId: string, entries: unknown[]) => {
      flushed.push(`ground_item_full:${instanceId}:${entries.length}`);
    },
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
    saveBuildingRoomFengShuiState: async (instanceId: string, _state: unknown, domains: readonly string[]) => {
      flushed.push(`building:${instanceId}:${domains.join(',')}`);
    },
    saveInstanceCheckpoint: async (instanceId: string) => {
      flushed.push(`time:${instanceId}`);
    },
  };
  const deduped: string[] = [];
  const dedupePersistence = {
    saveContainerState: async (input: { instanceId: string; containerId?: unknown; sourceId?: unknown }) => {
      deduped.push(`container_state:${input.instanceId}:${String(input.containerId ?? '')}:${String(input.sourceId ?? '')}`);
    },
    saveOverlayChunk: async (input: { instanceId: string; patchKind?: unknown; chunkKey?: unknown; patchVersion?: unknown }) => {
      deduped.push(`overlay:${input.instanceId}:${String(input.patchKind ?? '')}:${String(input.chunkKey ?? '')}:${String(input.patchVersion ?? '')}`);
    },
    saveBuildingRoomFengShuiState: async (instanceId: string, state: unknown, domains: readonly string[]) => {
      const record = state as { buildings?: Array<{ id?: string; cells?: unknown[] }>; rooms?: Array<{ id?: string }>; roomCells?: unknown[]; fengShui?: Array<{ roomId?: string }> };
      deduped.push(`building:${instanceId}:${record.buildings?.map((entry) => `${entry.id}:${entry.cells?.length ?? 0}`).join(',') ?? ''}:${record.rooms?.map((entry) => entry.id).join(',') ?? ''}:${record.roomCells?.length ?? 0}:${record.fengShui?.map((entry) => entry.roomId).join(',') ?? ''}:${domains.join(',')}`);
    },
  };

  const scenarios: Array<{
    id: string;
    domain: string;
    payloadJson: unknown;
    expected: string;
  }> = [
    { id: 'instance-tile-cell', domain: 'tile_cell', payloadJson: { kind: 'instance_domain_state', domain: 'tile_cell', revision: 1, payload: [{ tileIndex: 1 }] }, expected: 'tile_cell:instance-tile-cell:1' },
    { id: 'instance-temporary-tile', domain: 'temporary_tile', payloadJson: { kind: 'instance_domain_state', domain: 'temporary_tile', revision: 1, payload: [{ tileIndex: 2 }] }, expected: 'temporary_tile:instance-temporary-tile:1' },
    { id: 'instance-ground-full', domain: 'ground_item', payloadJson: { kind: 'instance_domain_state', domain: 'ground_item', revision: 1, payload: { fullReplace: true, entries: [{ tileIndex: 3 }] } }, expected: 'ground_item_full:instance-ground-full:1' },
    { id: 'instance-ground', domain: 'ground_item', payloadJson: { kind: 'instance_domain_state', domain: 'ground_item', revision: 1, payload: { tileIndices: [1], entries: [{ id: 'g1' }] } }, expected: 'ground_item:instance-ground:1:1' },
    { id: 'instance-overlay', domain: 'overlay', payloadJson: { kind: 'instance_domain_state', domain: 'overlay', revision: 1, payload: [{ chunkKey: 'overlay-1', patchKind: 'replace', patchVersion: 1, patchPayload: { x: 1 } }] }, expected: 'overlay:instance-overlay:overlay-1' },
    { id: 'instance-monster', domain: 'monster_runtime', payloadJson: { kind: 'instance_domain_state', domain: 'monster_runtime', revision: 1, payload: { fullReplace: false, upserts: [{ monsterId: 'm1' }], deletes: [] } }, expected: 'monster_runtime:instance-monster:1:0' },
    { id: 'instance-container', domain: 'container_state', payloadJson: { kind: 'instance_domain_state', domain: 'container_state', revision: 1, payload: [{ containerId: 'c1', sourceId: 's1', items: [] }] }, expected: 'container_state:instance-container:c1' },
    { id: 'instance-building', domain: 'building', payloadJson: { kind: 'instance_domain_state', domain: 'building', revision: 1, stagedDomains: ['building'], payload: { buildings: [{ id: 'b1' }] } }, expected: 'building:instance-building:building' },
    { id: 'instance-time', domain: 'time', payloadJson: { kind: 'instance_domain_state', domain: 'time', revision: 1, payload: { version: 2, savedAt: 1, templateId: 't1', tick: 3, tickSpeed: 1, paused: false } }, expected: 'time:instance-time' },
  ];

  try {
    for (const scenario of scenarios) {
      let claimed = false;
      const ledger = {
        isEnabled: () => true,
        renewFlushTaskClaim: async () => true,
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
        undefined,
        undefined,
      );
      const processed = await runtime.runOnce(`instance-state-payload:${scenario.id}`);
      assert.equal(processed, 1);
      assert.equal(flushed.at(-1), scenario.expected);
    }
    assert.equal(flushed.length, scenarios.length);

    let mixedClaimed = false;
    const mixedRetriedDomains: string[] = [];
    const mixedFlushedDomains: string[] = [];
    const mixedLedger = {
      isEnabled: () => true,
      renewFlushTaskClaim: async () => true,
      claimReadyFlushTasks: async (input: { scope: string }) => {
        if (input.scope !== 'instance' || mixedClaimed) return [];
        mixedClaimed = true;
        return [
          {
            scope: 'instance',
            id: 'instance-mixed',
            domain: 'monster_runtime',
            priority: 'low',
            latestRevision: 2,
            ownershipEpoch: 9,
            payloadJson: {
              kind: 'instance_domain_state',
              domain: 'monster_runtime',
              revision: 2,
              payload: { fullReplace: false, upserts: [{ monsterId: 'm2' }], deletes: [] },
            },
          },
          {
            scope: 'instance',
            id: 'instance-mixed',
            domain: 'time',
            priority: 'low',
            latestRevision: 2,
            ownershipEpoch: 9,
            payloadJson: null,
          },
        ] satisfies FlushTask[];
      },
      markFlushTaskFlushed: async (task: FlushTask) => {
        mixedFlushedDomains.push(task.domain);
        return true;
      },
      markFlushTasksRetry: async (tasks: FlushTask[]) => {
        mixedRetriedDomains.push(...tasks.map((task) => task.domain));
        return tasks.length;
      },
      markFlushTaskRetry: async (task: FlushTask) => {
        mixedRetriedDomains.push(task.domain);
        return true;
      },
    };
    const mixedRuntime = new FlushTaskRuntimeService(
      { listDirtyPlayerDomains: () => new Map() } as never,
      {
        instanceDomainPersistenceService: persistence,
        listDirtyPersistentInstanceDomains: () => [],
        getInstanceRuntime: () => null,
      } as never,
      { flushPlayerDomains: async () => true } as never,
      mixedLedger as never,
      { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
      undefined,
      undefined,
      undefined,
    );
    const mixedProcessed = await mixedRuntime.runOnce('instance-state-payload:mixed');
    assert.equal(mixedProcessed, 1);
    assert.deepEqual(mixedFlushedDomains, ['monster_runtime']);
    assert.deepEqual(mixedRetriedDomains, ['time']);
    assert.equal(flushed.at(-1), 'monster_runtime:instance-mixed:1:0');

    const staleStateRetriedDomains: string[] = [];
    const staleStateFlushedDomains: string[] = [];
    let staleStateClaimed = false;
    const staleStateLedger = {
      isEnabled: () => true,
      renewFlushTaskClaim: async () => true,
      claimReadyFlushTasks: async (input: { scope: string }) => {
        if (input.scope !== 'instance' || staleStateClaimed) return [];
        staleStateClaimed = true;
        return [
          {
            scope: 'instance',
            id: 'instance-stale-ground',
            domain: 'ground_item',
            priority: 'normal',
            latestRevision: 9,
            ownershipEpoch: 1,
            payloadJson: {
              kind: 'instance_domain_state',
              domain: 'ground_item',
              revision: 8,
              stagingGenerationId: 'new-generation-mismatch',
              payload: { tileIndices: [2195], entries: [] },
            },
          },
          {
            scope: 'instance',
            id: 'instance-stale-time',
            domain: 'time',
            priority: 'low',
            latestRevision: 11,
            ownershipEpoch: 1,
            payloadJson: {
              kind: 'instance_domain_state',
              domain: 'time',
              revision: 10,
              payload: { version: 2, savedAt: 1, templateId: 'old', tick: 1, tickSpeed: 1, paused: false },
            },
          },
        ] satisfies FlushTask[];
      },
      markFlushTaskFlushed: async (task: FlushTask) => {
        staleStateFlushedDomains.push(task.domain);
        return true;
      },
      markFlushTasksRetry: async () => 0,
      markFlushTaskRetry: async (task: FlushTask) => {
        staleStateRetriedDomains.push(task.domain);
        return true;
      },
    };
    const staleStateRuntime = new FlushTaskRuntimeService(
      { listDirtyPlayerDomains: () => new Map() } as never,
      {
        instanceDomainPersistenceService: persistence,
        listDirtyPersistentInstanceDomains: () => [],
        getInstanceRuntime: () => null,
      } as never,
      { flushPlayerDomains: async () => true } as never,
      staleStateLedger as never,
      { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
      undefined,
      undefined,
      undefined,
    );
    const staleStateProcessed = await staleStateRuntime.runOnce('instance-state-payload:stale-state');
    assert.equal(staleStateProcessed, 2);
    assert.deepEqual(staleStateRetriedDomains, []);
    assert.deepEqual(staleStateFlushedDomains.sort(), ['ground_item', 'time']);
    assert.equal(flushed.includes('ground_item:instance-stale-ground:1:0'), false, '新 generation revision mismatch 必须拒绝写入并收敛');
    assert.equal(flushed.includes('time:instance-stale-time'), true, 'legacy payload revision 低于 ledger latest 仍必须按当前 ownership epoch replay');

    const dedupeTasks = [
      {
        scope: 'instance',
        id: 'instance-dedupe-overlay',
        domain: 'overlay',
        priority: 'low',
        latestRevision: 3,
        ownershipEpoch: 1,
        payloadJson: {
          kind: 'instance_domain_state',
          domain: 'overlay',
          revision: 3,
          payload: [
            { patchKind: 'tile', chunkKey: 'same', patchVersion: 1, patchPayload: { stale: true } },
            { patchKind: 'tile', chunkKey: 'same', patchVersion: 2, patchPayload: { fresh: true } },
          ],
        },
      },
      {
        scope: 'instance',
        id: 'instance-dedupe-container',
        domain: 'container_state',
        priority: 'low',
        latestRevision: 3,
        ownershipEpoch: 1,
        payloadJson: {
          kind: 'instance_domain_state',
          domain: 'container_state',
          revision: 3,
          payload: [
            { containerId: 'same', sourceId: 'old', entries: [] },
            { containerId: 'same', sourceId: 'new', entries: [] },
          ],
        },
      },
      {
        scope: 'instance',
        id: 'instance-dedupe-building',
        domain: 'building',
        priority: 'low',
        latestRevision: 3,
        ownershipEpoch: 1,
        payloadJson: {
          kind: 'instance_domain_state',
          domain: 'building',
          revision: 3,
          payload: {
            buildings: [
              { id: 'b1', cells: [{ tileIndex: 1 }, { tileIndex: 1 }, { tileIndex: 2 }] },
              { id: 'b1', cells: [{ tileIndex: 3 }] },
            ],
            rooms: [{ id: 'r1' }, { id: 'r1' }],
            roomCells: [{ tileIndex: 7 }, { tileIndex: 7 }, { tileIndex: 8 }],
            fengShui: [{ roomId: 'r1' }, { roomId: 'r1' }],
          },
        },
      },
    ] satisfies FlushTask[];
    const dedupeFlushedDomains: string[] = [];
    let dedupeProcessed = 0;
    for (const dedupeTask of dedupeTasks) {
      let claimed = false;
      const dedupeLedger = {
        isEnabled: () => true,
        renewFlushTaskClaim: async () => true,
        claimReadyFlushTasks: async (input: { scope: string }) => {
          if (input.scope !== 'instance' || claimed) return [];
          claimed = true;
          return [dedupeTask];
        },
        markFlushTaskFlushed: async (task: FlushTask) => {
          dedupeFlushedDomains.push(task.domain);
          return true;
        },
        markFlushTasksRetry: async () => 0,
        markFlushTaskRetry: async () => true,
      };
      const dedupeRuntime = new FlushTaskRuntimeService(
        { listDirtyPlayerDomains: () => new Map() } as never,
        {
          instanceDomainPersistenceService: dedupePersistence,
          listDirtyPersistentInstanceDomains: () => [],
          getInstanceRuntime: () => null,
        } as never,
        { flushPlayerDomains: async () => true } as never,
        dedupeLedger as never,
        { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
        undefined,
        undefined,
        undefined,
      );
      dedupeProcessed += await dedupeRuntime.runOnce(`instance-state-payload:dedupe:${dedupeTask.domain}`);
    }
    assert.equal(dedupeProcessed, 3);
    assert.deepEqual(dedupeFlushedDomains, ['overlay', 'container_state', 'building']);
    assert.deepEqual(deduped, [
      'overlay:instance-dedupe-overlay:tile:same:2',
      'container_state:instance-dedupe-container:same:new',
      'building:instance-dedupe-building:b1:1:r1:2:r1:building',
    ]);

    process.env.SERVER_RUNTIME_ROLE = 'api';
    process.env.SERVER_FLUSH_TASK_RUNTIME_MODE = 'off';
    const staged: unknown[] = [];
    const stagingLedger = {
      isEnabled: () => true,
      upsertFlushTasks: async (tasks: unknown[]) => {
        staged.push(...tasks);
        return tasks.length;
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
      undefined,
      undefined,
    );
    await stagingRuntime.stageDirtyTasksOnce();
    assert.equal(staged.length, 1);
    const stagedTask = staged[0] as { domain?: string; latestRevision?: number; payloadJson?: { kind?: string; domain?: string; revision?: number; payload?: { tick?: number; templateId?: string } } | null };
    assert.equal(stagedTask.domain, 'time');
    assert.ok((stagedTask.latestRevision ?? 0) > 11);
    assert.equal(stagedTask.payloadJson?.kind, 'instance_domain_state');
    assert.equal(stagedTask.payloadJson?.domain, 'time');
    assert.equal(stagedTask.payloadJson?.revision, stagedTask.latestRevision);
    assert.equal(stagedTask.payloadJson?.payload?.tick, 42);
    assert.equal(stagedTask.payloadJson?.payload?.templateId, 'stage-template');

    staged.length = 0;
    const stagingGroundRuntime = new FlushTaskRuntimeService(
      { listDirtyPlayerDomains: () => new Map() } as never,
      {
        listDirtyPersistentInstanceDomains: () => [{ instanceId: 'stage-ground', domains: ['ground_item'] }],
        getInstanceRuntime: () => ({
          meta: { persistent: true, ownershipEpoch: 3 },
          getPersistenceRevision: () => 12,
          buildGroundPersistenceDelta: () => ({ fullReplace: false, tileIndices: [7], entries: [{ tileIndex: 7, items: [{ itemId: 'stone', count: 1 }] }] }),
        }) as never,
      } as never,
      { flushPlayerDomains: async () => true } as never,
      stagingLedger as never,
      { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
      undefined,
      undefined,
      undefined,
    );
    await stagingGroundRuntime.stageDirtyTasksOnce();
    assert.equal(staged.length, 1);
    const stagedGroundTask = staged[0] as { domain?: string; latestRevision?: number; payloadJson?: { kind?: string; domain?: string; revision?: number; payload?: { tileIndices?: number[] } } | null };
    assert.equal(stagedGroundTask.domain, 'ground_item');
    assert.ok((stagedGroundTask.latestRevision ?? 0) > 12);
    assert.equal(stagedGroundTask.payloadJson?.kind, 'instance_domain_state');
    assert.equal(stagedGroundTask.payloadJson?.domain, 'ground_item');
    assert.equal(stagedGroundTask.payloadJson?.revision, stagedGroundTask.latestRevision);
    assert.deepEqual(stagedGroundTask.payloadJson?.payload?.tileIndices, [7]);

    staged.length = 0;
    const stagingFengShuiRuntime = new FlushTaskRuntimeService(
      { listDirtyPlayerDomains: () => new Map() } as never,
      {
        listDirtyPersistentInstanceDomains: () => [{ instanceId: 'stage-fengshui', domains: ['fengshui'] }],
        getInstanceRuntime: () => ({
          meta: { persistent: true, ownershipEpoch: 4 },
          getPersistenceRevision: () => 13,
          buildBuildingRoomFengShuiPersistenceState: () => ({
            buildings: [{ id: 'building:unchanged' }],
            rooms: [{ id: 'room:unchanged' }],
            roomCells: [{ roomId: 'room:unchanged', tileIndex: 1 }],
            fengShui: [{ roomId: 'room:changed', score: 100 }],
          }),
        }) as never,
      } as never,
      { flushPlayerDomains: async () => true } as never,
      stagingLedger as never,
      { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
      undefined,
      undefined,
      undefined,
    );
    await stagingFengShuiRuntime.stageDirtyTasksOnce();
    assert.equal(staged.length, 1);
    const stagedFengShuiTask = staged[0] as {
      domain?: string;
      payloadJson?: {
        stagedDomains?: string[];
        payload?: Record<string, unknown>;
      } | null;
    };
    assert.equal(stagedFengShuiTask.domain, 'building');
    assert.deepEqual(stagedFengShuiTask.payloadJson?.stagedDomains, ['fengshui']);
    assert.deepEqual(stagedFengShuiTask.payloadJson?.payload, {
      fengShui: [{ roomId: 'room:changed', score: 100 }],
    });

    process.env.SERVER_RUNTIME_ROLE = 'worker';
    process.env.SERVER_FLUSH_TASK_RUNTIME_MODE = 'worker';
    const deltaFlushed: string[] = [];
    const deltaPersistence = {
      saveTileDamageStates: async (instanceId: string, entries: unknown[]) => {
        deltaFlushed.push(`tile_damage_full:${instanceId}:${entries.length}`);
      },
      saveTileDamageDeltaBatch: async (rows: Array<{ instanceId: string; upserts: unknown[]; deletes: unknown[] }>) => {
        deltaFlushed.push(...rows.map((row) => `tile_damage:${row.instanceId}:${row.upserts.length}:${row.deletes.length}`));
      },
      saveTileResourceDeltaBatch: async (rows: Array<{ instanceId: string; upserts: unknown[]; deletes: unknown[] }>) => {
        deltaFlushed.push(...rows.map((row) => `tile_resource:${row.instanceId}:${row.upserts.length}:${row.deletes.length}`));
      },
      saveInstanceRecoveryWatermarkBatch: async () => undefined,
    };
    const deltaFlushedTasks: string[] = [];
    let deltaClaimed = false;
    const deltaLedger = {
      isEnabled: () => true,
      renewFlushTaskClaim: async () => true,
      claimReadyFlushTasks: async (input: { scope: string }) => {
        if (input.scope !== 'instance' || deltaClaimed) return [];
        deltaClaimed = true;
        return [
          {
            scope: 'instance',
            id: 'instance-current-damage',
            domain: 'tile_damage',
            priority: 'low',
            latestRevision: 8,
            ownershipEpoch: 1,
            payloadJson: {
              kind: 'instance_domain_delta',
              domain: 'tile_damage',
              revision: 8,
              upserts: [{ tileIndex: 1 }],
              deletes: [2],
            },
          },
          {
            scope: 'instance',
            id: 'instance-full-damage',
            domain: 'tile_damage',
            priority: 'low',
            latestRevision: 8,
            ownershipEpoch: 1,
            payloadJson: {
              kind: 'instance_domain_delta',
              domain: 'tile_damage',
              revision: 8,
              fullReplace: true,
              upserts: [],
              deletes: [],
              entries: [{ tileIndex: 3 }],
            },
          },
          {
            scope: 'instance',
            id: 'instance-stale-damage',
            domain: 'tile_damage',
            priority: 'low',
            latestRevision: 9,
            ownershipEpoch: 1,
            payloadJson: {
              kind: 'instance_domain_delta',
              domain: 'tile_damage',
              revision: 8,
              stagingGenerationId: 'new-generation-mismatch',
              upserts: [],
              deletes: [2195],
            },
          },
        ] satisfies FlushTask[];
      },
      markFlushTaskFlushed: async (task: FlushTask) => {
        deltaFlushedTasks.push(`${task.domain}:${task.id}`);
        return true;
      },
      markFlushTasksRetry: async () => 0,
      markFlushTaskRetry: async () => true,
    };
    const deltaRuntime = new FlushTaskRuntimeService(
      { listDirtyPlayerDomains: () => new Map() } as never,
      {
        instanceDomainPersistenceService: deltaPersistence,
        buildDomainDeltaBatch: () => [],
        markDomainBatchPersisted: () => undefined,
        listDirtyPersistentInstanceDomains: () => [],
        getInstanceRuntime: () => null,
      } as never,
      { flushPlayerDomains: async () => true } as never,
      deltaLedger as never,
      { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
      undefined,
      undefined,
      undefined,
    );
    const deltaProcessed = await deltaRuntime.runOnce('instance-delta-payload:revision');
    assert.equal(deltaProcessed, 3);
    assert.deepEqual(deltaFlushed, [
      'tile_damage_full:instance-full-damage:1',
      'tile_damage:instance-current-damage:1:1',
    ]);
    assert.deepEqual(deltaFlushedTasks.sort(), [
      'tile_damage:instance-current-damage',
      'tile_damage:instance-full-damage',
      'tile_damage:instance-stale-damage',
    ]);
  } finally {
    restoreEnv('SERVER_RUNTIME_ROLE', previousRole);
    restoreEnv('SERVER_FLUSH_TASK_RUNTIME_MODE', previousMode);
  }

  console.log(JSON.stringify({
    ok: true,
      answers: '实例 tile_cell/temporary_tile/ground_item fullReplace 与增量、overlay/monster_runtime/container_state/building-room-fengshui/time 均可从 durable state payload 写入持久化 API，并 mark flushed；building-room-fengshui 只暂存和回放实际脏领域；混合分组中缺 payload 的 domain 会单独 retry。',
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
