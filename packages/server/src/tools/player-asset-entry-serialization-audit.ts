import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { resolveProjectPath } from '../common/project-path';

type EntryProof = {
  file: string;
  entryMarkers: readonly string[];
};

const proofs: readonly EntryProof[] = [
  {
    file: 'packages/server/src/runtime/world/world-runtime-npc-shop.service.ts',
    entryMarkers: [
      'dispatchBuyNpcShopItemLocked',
      'runExclusivePlayerAssetMutation',
      'runExclusiveAssetMutation',
    ],
  },
  {
    file: 'packages/server/src/runtime/world/world-runtime-npc-quest-write.service.ts',
    entryMarkers: [
      'dispatchSubmitNpcQuestLocked',
      'runExclusivePlayerAssetMutation',
      'runExclusiveAssetMutation',
    ],
  },
  {
    file: 'packages/server/src/runtime/redeem/redeem-code-runtime.service.ts',
    entryMarkers: [
      'return this.runExclusivePlayerAssetMutation(playerId, () => this.runExclusive',
      'runExclusiveAssetMutation',
    ],
  },
  {
    file: 'packages/server/src/runtime/world/world-runtime.controller.ts',
    entryMarkers: [
      'applyDurableWalletMutationLocked',
      'applyDurableInventoryGrantLocked',
      'runExclusivePlayerAssetMutation',
      'runExclusiveAssetMutation',
    ],
  },
  {
    file: 'packages/server/src/runtime/craft/craft-panel-runtime.service.ts',
    entryMarkers: [
      'startEnhancementDurablyLocked',
      'cancelEnhancementDurablyLocked',
      'tickEnhancementDurablyLocked',
      'runExclusivePlayerAssetMutation',
      'runExclusiveAssetMutation',
    ],
  },
  {
    file: 'packages/server/src/runtime/world/world-runtime-inventory-grant.helpers.ts',
    entryMarkers: [
      'applyDurableInventoryGrantLocked',
      'runExclusiveAssetMutation',
    ],
  },
];

for (const proof of proofs) {
  const source = readFileSync(resolveProjectPath(proof.file), 'utf8');
  for (const marker of proof.entryMarkers) {
    assert.equal(
      source.includes(marker),
      true,
      `${proof.file} 缺少玩家资产串行边界标记：${marker}`,
    );
  }
}

const genericGrantSource = readFileSync(
  resolveProjectPath('packages/server/src/runtime/world/world-runtime-inventory-grant.helpers.ts'),
  'utf8',
);
assertOrdered(genericGrantSource, [
  'await input.buildNextInventoryItems(currentRuntimeItems)',
  'const nextInventoryItems = buildNextInventorySnapshots(nextRuntimeItems)',
  'await input.durableOperationService.grantInventoryItems',
  'input.playerRuntimeService.replaceInventoryItems',
]);

const gmSource = readFileSync(
  resolveProjectPath('packages/server/src/runtime/world/world-runtime.controller.ts'),
  'utf8',
);
assertOrdered(gmSource.slice(gmSource.indexOf('async applyDurableInventoryGrantLocked')), [
  'const nextRuntimeItems',
  'await this.durableOperationService.grantInventoryItems',
  'return this.playerRuntimeService.replaceInventoryItems',
]);

console.log(JSON.stringify({
  ok: true,
  coveredEntries: proofs.map((proof) => proof.file),
  guarantees: [
    'P0 玩家资产入口统一经过 runExclusiveAssetMutation',
    '通用背包发放在 durable 成功前不暴露 next runtime snapshot',
    'GM 背包发放按 next snapshot -> durable -> runtime apply 执行',
  ],
}, null, 2));

function assertOrdered(source: string, markers: readonly string[]): void {
  let offset = -1;
  for (const marker of markers) {
    const nextOffset = source.indexOf(marker, offset + 1);
    assert.notEqual(nextOffset, -1, `缺少顺序边界：${marker}`);
    assert.equal(nextOffset > offset, true, `顺序边界错误：${marker}`);
    offset = nextOffset;
  }
}
