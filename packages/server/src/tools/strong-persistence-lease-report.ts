import { installSmokeTimeout } from './smoke-timeout.js';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { resolveToolPackageRoot } from './stable-dist';

const packageRoot = resolveToolPackageRoot(__dirname);
const repoRoot = path.resolve(packageRoot, '..', '..');

const COVERED_METHODS = [
  'claimMarketStorage',
  'purchaseNpcShopItem',
  'mutatePlayerWallet',
  'updateEquipmentLoadout',
  'settleMarketSellNow',
  'settleMarketBuyNow',
  'settleMarketCancelOrder',
  'updateActiveJobState',
  'startActiveJobWithAssets',
  'cancelActiveJobWithAssets',
  'completeActiveJobWithAssets',
  'claimMailAttachments',
];

async function main(): Promise<void> {
  const durableOperationSource = readSource('packages/server/src/persistence/durable-operation.service.ts');
  const durableOperationSmokeSource = readSource('packages/server/src/tools/durable-operation-smoke.ts');
  const worldRuntimeEnhancementSmokeSource = readSource('packages/server/src/tools/world-runtime-enhancement-smoke.ts');
  const worldRuntimeAlchemySmokeSource = readSource('packages/server/src/tools/world-runtime-alchemy-smoke.ts');
  const worldRuntimeNpcShopSmokeSource = readSource('packages/server/src/tools/world-runtime-npc-shop-smoke.ts');
  const worldRuntimeEquipmentSmokeSource = readSource('packages/server/src/tools/world-runtime-equipment-smoke.ts');
  const worldRuntimeWalletSmokeSource = readSource('packages/server/src/tools/world-runtime-wallet-route-smoke.ts');

  const coverage = COVERED_METHODS.map((method) => ({
    method,
    hasServiceImplementation: durableOperationSource.includes(`async ${method}(`),
    hasExpectedInstanceId: durableOperationSource.includes('expectedInstanceId') && durableOperationSource.includes(method),
    hasExactLeaseProof:
      durableOperationSmokeSource.includes(method)
      || worldRuntimeNpcShopSmokeSource.includes(method)
      || worldRuntimeEquipmentSmokeSource.includes(method)
      || worldRuntimeAlchemySmokeSource.includes(method)
      || worldRuntimeEnhancementSmokeSource.includes(method)
      || worldRuntimeWalletSmokeSource.includes(method),
  }));

  const fullyCoveredMethods = coverage.filter((entry) => entry.hasServiceImplementation && entry.hasExpectedInstanceId && entry.hasExactLeaseProof);
  assert.equal(fullyCoveredMethods.length, COVERED_METHODS.length, 'all strong persistence methods should have exact lease proof coverage');

  console.log(
    JSON.stringify(
      {
        ok: true,
        coveredMethods: coverage,
        answers: '已确认强持久化主链的 lease 二次校验在现有 durable service 与 smoke proof 中可见，作为阶段 2.5 / 6.1 的覆盖报告',
        excludes: '不证明未列出的新事务已自动接入 durable 主链',
        completionMapping: 'release:proof:stage6.strong-persistence-lease-coverage',
      },
      null,
      2,
    ),
  );
}

function readSource(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
