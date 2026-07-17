import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import type { TechniqueActivityResolveResult } from '@mud/shared';
import {
  applyTechniqueActivityResolveInventory,
} from '../runtime/craft/pipeline/technique-activity-pipeline.service';
import type { PipelineContext } from '../runtime/craft/pipeline/technique-activity-strategy';

type SmokePlayer = {
  inventory: {
    capacity: number;
    items: Array<{ itemId: string; count: number; name?: string }>;
  };
};

function createContext(): PipelineContext {
  return {
    contentTemplateRepository: {
      getItemName(itemId: string) {
        return itemId;
      },
      normalizeItem(item: { itemId: string; count: number }) {
        return { ...item, name: `normalized:${item.itemId}` };
      },
    },
    resolveExpToNextByLevel() {
      return 100;
    },
    getInstanceRuntime() {
      return null;
    },
    deps: null,
  };
}

function createResolved(partial: Partial<TechniqueActivityResolveResult>): TechniqueActivityResolveResult {
  return {
    successCount: 1,
    failureCount: 0,
    outputs: [],
    expParams: {
      playerRealmLevel: 1,
      skillLevel: 1,
      targetLevel: 1,
      baseActionTicks: 1,
      getExpToNextByLevel: () => 100,
    },
    completed: true,
    ...partial,
  };
}

function main(): void {
  const ctx = createContext();

  const summaryOnlyPlayer: SmokePlayer = { inventory: { capacity: 4, items: [] } };
  const summaryOnly = createResolved({
    outputs: [{ itemId: 'pill.summary_only', count: 2 }],
  });
  const summaryOnlyResult = applyTechniqueActivityResolveInventory(summaryOnlyPlayer, summaryOnly, ctx);
  assert.equal(summaryOnlyResult.inventoryChanged, false);
  assert.equal(summaryOnlyPlayer.inventory.items.length, 0);
  assert.deepEqual(summaryOnly.inventoryDelta?.granted, []);
  assert.deepEqual(summaryOnly.inventoryDelta?.dropped, []);

  const grantedPlayer: SmokePlayer = { inventory: { capacity: 4, items: [] } };
  const granted = createResolved({
    outputs: [{ itemId: 'pill.summary', count: 1 }],
    inventoryDelta: {
      granted: [{ itemId: 'pill.granted', count: 3 }],
    },
  });
  const grantedResult = applyTechniqueActivityResolveInventory(grantedPlayer, granted, ctx);
  assert.equal(grantedResult.inventoryChanged, true);
  assert.equal(grantedPlayer.inventory.items.length, 1);
  assert.equal(grantedPlayer.inventory.items[0]?.itemId, 'pill.granted');
  assert.equal(grantedPlayer.inventory.items[0]?.count, 3);
  assert.equal(grantedPlayer.inventory.items[0]?.name, 'normalized:pill.granted');
  assert.equal(typeof (grantedPlayer.inventory.items[0] as { itemInstanceId?: unknown })?.itemInstanceId, 'string');
  assert.equal(granted.inventoryDelta?.granted?.[0]?.itemId, 'pill.granted');

  const fullPlayer: SmokePlayer = { inventory: { capacity: 0, items: [] } };
  const forced = createResolved({
    inventoryDelta: {
      granted: [{ itemId: 'pill.full', count: 1 }],
    },
  });
  const forcedResult = applyTechniqueActivityResolveInventory(fullPlayer, forced, ctx);
  assert.equal(forcedResult.inventoryChanged, true);
  assert.equal(fullPlayer.inventory.items.length, 1);
  assert.equal(fullPlayer.inventory.items[0]?.itemId, 'pill.full');
  assert.deepEqual(forced.inventoryDelta?.dropped, []);
  assert.deepEqual(forcedResult.groundDrops, []);

  const mergePlayer: SmokePlayer = {
    inventory: {
      capacity: 1,
      items: [{ itemId: 'pill.merge', count: 2, name: 'normalized:pill.merge' }],
    },
  };
  const merge = createResolved({
    inventoryDelta: {
      granted: [{ itemId: 'pill.merge', count: 3 }],
    },
  });
  const mergeResult = applyTechniqueActivityResolveInventory(mergePlayer, merge, ctx);
  assert.equal(mergeResult.inventoryChanged, true);
  assert.equal(mergePlayer.inventory.items.length, 1);
  assert.equal(mergePlayer.inventory.items[0]?.count, 5);
  assert.deepEqual(mergeResult.groundDrops, []);

  console.log(JSON.stringify({
    ok: true,
    answers: '公共 pipeline 只根据 inventoryDelta.granted 执行任务结算入包；满包时可合并项直接合并，不可合并项强制超过容量入包，outputs 仅作为结算摘要。',
  }, null, 2));
}

main();
