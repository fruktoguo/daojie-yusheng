import assert from 'node:assert/strict';

import { WorldRuntimeCraftMutationService } from '../runtime/world/world-runtime-craft-mutation.service';
import { WorldRuntimeCraftTickService } from '../runtime/world/world-runtime-craft-tick.service';

async function testCraftTickDefersImmediatePersistence(): Promise<void> {
  const player: any = {
    playerId: 'player:craft-tick-deferred',
    alchemyJob: { remainingTicks: 2 },
    techniqueActivityQueue: [],
  };
  let observedSuppression = false;
  const flushes: any[] = [];
  const service = new WorldRuntimeCraftTickService(
    {
      getPlayer(playerId: string) {
        return playerId === player.playerId ? player : null;
      },
    },
    {
      listActiveTechniqueActivityKinds() {
        return ['alchemy'];
      },
      tickTechniqueActivity() {
        return Promise.resolve().then(() => {
          observedSuppression = player.suppressImmediateDomainPersistence === true;
          player.alchemyJob.remainingTicks -= 1;
          return {
            ok: true,
            panelChanged: true,
            inventoryChanged: false,
            equipmentChanged: false,
            attrChanged: false,
            messages: [],
            groundDrops: [],
            craftRealmExpGain: 0,
          };
        });
      },
      hasAnyActiveTechniqueActivity() {
        return true;
      },
    },
    {
      flushCraftMutation(...args: any[]) {
        flushes.push(args);
      },
    },
  );

  await service.advanceCraftJobs([player.playerId], {}, { deferRuntimeUpdates: true });
  assert.equal(observedSuppression, true);
  assert.equal(player.suppressImmediateDomainPersistence, undefined);
  assert.equal(flushes.length, 1);
  assert.deepEqual(flushes[0][4], {
    skipActiveJobPersistence: true,
    deferRuntimeUpdates: true,
  });
}

async function testDeferredRuntimeUpdatesCoalescePerFrame(): Promise<void> {
  const player = { playerId: 'player:craft-runtime-coalesce', alchemyJob: { remainingTicks: 3 } };
  let fallbackPersistenceCount = 0;
  const service = new WorldRuntimeCraftMutationService(
    {
      getPlayer(playerId: string) {
        return playerId === player.playerId ? player : null;
      },
    },
    {
      persistTechniqueActivitySnapshot() {
        fallbackPersistenceCount += 1;
      },
      hasAnyActiveTechniqueActivity() {
        return true;
      },
      hasActiveTechniqueActivity() {
        return true;
      },
    },
    { getSocketByPlayerId() { return null; } },
    { prefersMainline() { return false; } },
  );
  let taskUpdateCount = 0;
  const panelUpdates: string[] = [];
  service.emitTechniqueActivityTaskUpdate = () => {
    taskUpdateCount += 1;
  };
  service.emitCraftPanelUpdate = (_playerId, panel) => {
    panelUpdates.push(panel);
  };
  const result = {
    ok: true,
    panelChanged: true,
    messages: [],
    groundDrops: [],
    craftRealmExpGain: 0,
  };
  const options = { skipActiveJobPersistence: true, deferRuntimeUpdates: true };

  service.flushCraftMutation(player.playerId, result, 'alchemy', {}, options);
  service.flushCraftMutation(player.playerId, result, 'alchemy', {}, options);
  service.flushCraftMutation(player.playerId, result, 'forging', {}, options);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fallbackPersistenceCount, 0);
  assert.equal(taskUpdateCount, 0);
  assert.deepEqual(panelUpdates, []);

  service.flushDeferredRuntimeUpdates({});
  assert.equal(taskUpdateCount, 1);
  assert.deepEqual(panelUpdates, ['alchemy', 'forging']);
  service.flushDeferredRuntimeUpdates({});
  assert.equal(taskUpdateCount, 1);
  assert.deepEqual(panelUpdates, ['alchemy', 'forging']);
}

async function main(): Promise<void> {
  await testCraftTickDefersImmediatePersistence();
  await testDeferredRuntimeUpdatesCoalescePerFrame();
  console.log(JSON.stringify({
    ok: true,
    case: 'craft-tick-coalescing',
  }, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
