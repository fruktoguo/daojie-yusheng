import assert from 'node:assert/strict';

import { executeBuildingTick } from '../runtime/craft/pipeline/strategies/building-tick.helpers';
import {
  handleBuildPlaceIntent,
  handleStartBuildingConstruction,
} from '../runtime/world/world-runtime-building.service';
import { isVirtualPublicWorldInstance } from '../runtime/world/world-runtime.normalization.helpers';

function main(): void {
  testVirtualWorldClassification();
  testVirtualWorldRejectsPlacementAndConstructionStart();
  testVirtualWorldStopsActiveConstructionButAllowsDeconstruction();
  console.log(JSON.stringify({ ok: true, case: 'virtual-world-building-rules' }, null, 2));
}

function testVirtualWorldClassification(): void {
  assert.equal(isVirtualPublicWorldInstance({ meta: { instanceId: 'public:test', kind: 'public', linePreset: 'peaceful' } }), true);
  assert.equal(isVirtualPublicWorldInstance({ meta: { instanceId: 'line:test:peaceful:2', kind: 'public', linePreset: 'peaceful' } }), true);
  assert.equal(isVirtualPublicWorldInstance({ meta: { instanceId: 'real:test', kind: 'public', linePreset: 'real' } }), false);
  assert.equal(isVirtualPublicWorldInstance({ meta: { instanceId: 'tower:1', kind: 'dungeon', linePreset: 'peaceful' } }), false);
  assert.equal(isVirtualPublicWorldInstance({ meta: { instanceId: 'sect:1', kind: 'sect', linePreset: 'peaceful' } }), false);
  assert.equal(isVirtualPublicWorldInstance({ meta: { instanceId: 'time_chamber:1', kind: 'player_owned', linePreset: 'peaceful' } }), false);
}

function testVirtualWorldRejectsPlacementAndConstructionStart(): void {
  let placementCalled = false;
  let constructionStarted = false;
  const player = { playerId: 'player:virtual-building' };
  const instance = {
    meta: { instanceId: 'public:test', kind: 'public', linePreset: 'peaceful', persistent: true },
    placeBuildingInstance() {
      placementCalled = true;
      return { ok: true };
    },
    startBuildingConstruction() {
      constructionStarted = true;
      return { ok: true };
    },
  };
  const runtime = {
    tick: 10,
    buildingOperationResultsByKey: new Map(),
    buildingOperationAuditLog: [],
    getPlayerLocationOrThrow() {
      return { instanceId: instance.meta.instanceId };
    },
    getInstanceRuntimeOrThrow() {
      return instance;
    },
    playerRuntimeService: {
      getPlayer() {
        return player;
      },
    },
  };

  const placement = handleBuildPlaceIntent(runtime, player.playerId, {
    requestId: 'build:virtual:1',
    defId: 'scripture_platform',
    x: 1,
    y: 1,
  });
  assert.equal(placement.ok, false);
  assert.equal(placement.reason, 'virtual_world_building_forbidden');
  assert.equal(placementCalled, false);

  const start = handleStartBuildingConstruction(runtime, player.playerId, 'building:virtual:1');
  assert.equal(start.ok, false);
  assert.equal(start.reason, 'virtual_world_building_forbidden');
  assert.equal(constructionStarted, false);
}

function testVirtualWorldStopsActiveConstructionButAllowsDeconstruction(): void {
  const player = {
    playerId: 'player:virtual-building-tick',
    x: 1,
    y: 1,
    buildingJob: createBuildingJob('construct'),
  };
  const building = {
    id: 'building:virtual:1',
    defId: 'stone_wall',
    x: 1,
    y: 1,
    state: 'building',
    activeBuilderPlayerId: player.playerId,
    activeDeconstructorPlayerId: null as string | null,
    buildRemainingTicks: 10,
  };
  let stoppedConstruction = false;
  const instance = {
    tick: 20,
    meta: { instanceId: 'public:test', kind: 'public', linePreset: 'peaceful' },
    buildingById: new Map([[building.id, building]]),
    stopBuildingConstruction(buildingId: string, playerId: string) {
      assert.equal(buildingId, building.id);
      assert.equal(playerId, player.playerId);
      stoppedConstruction = true;
      building.activeBuilderPlayerId = null;
      return { ok: true, changed: true };
    },
  };
  const dirtyDomains: string[][] = [];
  const runtime = {
    playerRuntimeService: {
      getPlayer() {
        return player;
      },
      markPersistenceDirtyDomains(_player: unknown, domains: string[]) {
        dirtyDomains.push(domains);
      },
      bumpPersistentRevision() {},
    },
    getInstanceRuntime() {
      return instance;
    },
  };

  const constructResult = executeBuildingTick(player.playerId, { deps: runtime } as never, runtime);
  assert.equal(constructResult instanceof Promise, false);
  assert.equal(stoppedConstruction, true);
  assert.equal(player.buildingJob, null);
  assert.deepEqual(dirtyDomains, [['active_job']]);
  assert.equal((constructResult as { messages: Array<{ key: string }> }).messages[0]?.key, 'notice.craft.building.virtual-world-forbidden');

  player.buildingJob = createBuildingJob('deconstruct');
  building.state = 'deconstructing';
  building.activeDeconstructorPlayerId = player.playerId;
  const deconstructResult = executeBuildingTick(player.playerId, { deps: runtime } as never, runtime);
  assert.equal(deconstructResult instanceof Promise, true);
}

function createBuildingJob(operation: 'construct' | 'deconstruct') {
  return {
    jobRunId: `job:virtual:${operation}`,
    jobType: 'building',
    buildingId: 'building:virtual:1',
    buildingName: '测试建筑',
    instanceId: 'public:test',
    operation,
    totalTicks: 10,
    remainingTicks: 10,
    workTotalTicks: 10,
    workRemainingTicks: 10,
  };
}

main();
