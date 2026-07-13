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
  {
    file: 'packages/server/src/runtime/world/world-runtime-formation.service.ts',
    entryMarkers: [
      'runExclusivePlayerFormationResourceMutation',
      'runExclusiveAssetMutation',
      'commitFormationResourceMutation',
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

const npcQuestSource = readFileSync(
  resolveProjectPath('packages/server/src/runtime/world/world-runtime-npc-quest-write.service.ts'),
  'utf8',
);
const npcQuestSubmitSource = npcQuestSource.slice(
  npcQuestSource.indexOf('async dispatchSubmitNpcQuestLocked'),
  npcQuestSource.indexOf('enqueueNpcInteraction'),
);
assert.equal(
  npcQuestSubmitSource.includes('replaceWalletBalances'),
  false,
  'NPC 任务提交后不得用 player_wallet 快照覆盖背包派生钱包投影',
);
assertOrdered(npcQuestSubmitSource, [
  'const nextInventoryItems = buildNextQuestInventorySnapshots',
  'const nextWalletBalances = buildWalletBalancesFromInventory',
  'await runSubmit()',
  'this.playerRuntimeService.replaceInventoryItems',
]);

const npcShopSource = readFileSync(
  resolveProjectPath('packages/server/src/runtime/world/world-runtime-npc-shop.service.ts'),
  'utf8',
);
const npcShopDispatchStart = npcShopSource.indexOf('async dispatchBuyNpcShopItemLocked');
const npcShopDispatchSource = npcShopSource.slice(
  npcShopDispatchStart,
  npcShopSource.indexOf('async runExclusivePlayerAssetMutation', npcShopDispatchStart),
);
assert.equal(
  npcShopDispatchSource.includes('this.playerRuntimeService.debitWallet'),
  false,
  'NPC 商店 fallback 不得先扣钱包再单独发物',
);
assertOrdered(npcShopDispatchSource, [
  'const nextInventoryItems = applyNpcShopPurchaseToInventory',
  'const nextWalletBalances = applyNpcShopPurchaseToWallet',
  'await runPurchase()',
  'this.playerRuntimeService.replaceInventoryItems',
]);

const mailSource = readFileSync(
  resolveProjectPath('packages/server/src/runtime/mail/mail-runtime.service.ts'),
  'utf8',
);
assert.equal(
  mailSource.includes('mergeWalletCredits'),
  false,
  '邮件灵石附件不得以旧钱包投影为基线做增量累加',
);
const mailDurableStart = mailSource.indexOf('async claimAttachmentsDurably');
const mailDurableSource = mailSource.slice(
  mailDurableStart,
  mailSource.indexOf('async syncCurrentPresenceFence', mailDurableStart),
);
assertOrdered(mailDurableSource, [
  'const nextWalletBalances = currentSnapshot && hasWalletAttachments',
  'buildWalletBalancesFromInventory',
  'await this.durableOperationService.claimMailAttachments',
]);

const formationSource = readFileSync(
  resolveProjectPath('packages/server/src/runtime/world/world-runtime-formation.service.ts'),
  'utf8',
);
const formationDeployStart = formationSource.indexOf('async commitCreateFormationPlan');
const formationDeploySource = formationSource.slice(
  formationDeployStart,
  formationSource.indexOf('applyFormationResourceFallback', formationDeployStart),
);
assertOrdered(formationDeploySource, [
  'buildFormationResourceInventoryPlan',
  'await this.commitFormationResourcePlan',
  'this.playerRuntimeService.replaceInventoryItems',
  'this.playerRuntimeService.setVitals',
  'this.applyCreatedFormationRuntime',
]);
const formationDurableSource = readFileSync(
  resolveProjectPath('packages/server/src/persistence/durable-operation.service.ts'),
  'utf8',
);
const formationDurableStart = formationDurableSource.indexOf('async commitFormationResourceMutation');
const formationDurableMethod = formationDurableSource.slice(
  formationDurableStart,
  formationDurableSource.indexOf('async submitNpcQuestRewards', formationDurableStart),
);
assertOrdered(formationDurableMethod, [
  'persistDurableFormationWriteWithClient',
  'savePlayerSnapshotProjectionDomainsWithClient',
  'insertDurableOutboxEvent',
  'insertAssetAuditLog',
]);
const playerCommandSource = readFileSync(
  resolveProjectPath('packages/server/src/runtime/world/command/world-runtime-player-command.service.ts'),
  'utf8',
);
assert.equal(
  playerCommandSource.includes('await deps.worldRuntimeFormationService.dispatchCreateFormation'),
  true,
  'tick 命令必须等待布阵 durable 提交后再继续同步',
);
assert.equal(
  playerCommandSource.includes('await deps.worldRuntimeFormationService.dispatchRefillFormation'),
  true,
  'tick 命令必须等待阵法补给 durable 提交后再继续同步',
);

const gmSource = readFileSync(
  resolveProjectPath('packages/server/src/runtime/world/world-runtime.controller.ts'),
  'utf8',
);
const gmWalletSource = gmSource.slice(
  gmSource.indexOf('async applyDurableWalletMutationLocked'),
  gmSource.indexOf('async applyDurableInventoryGrant'),
);
assert.equal(
  gmWalletSource.includes('mutatePlayerWallet({'),
  false,
  'Runtime wallet 管理入口不得绕过背包真源写 player_wallet',
);
assertOrdered(gmWalletSource, [
  'await this.isCommittedRuntimeAssetOperation',
  'const result = await this.durableOperationService.grantInventoryItems',
  'return this.playerRuntimeService.replaceInventoryItems',
]);
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
    'NPC 任务奖励把灵石纳入背包真源，并按 inventory plan -> wallet projection -> durable -> runtime apply 执行',
    'NPC 商店先预演扣款与发物，再执行 durable 和一次性运行态背包替换',
    '邮件灵石附件的钱包投影从最终背包重建，不使用旧钱包增量',
    '布阵与阵法补给按 inventory/vitals plan -> formation durable -> runtime apply 执行，并由 tick 命令等待提交',
    'Runtime wallet 管理入口只写背包真源，并按 replay -> durable -> runtime apply 执行',
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
