import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { InstanceStatePurgeWorker } from '../runtime/world/worker/instance-state-purge.worker';

interface CatalogEntry {
  instance_id: string;
  status: string;
  runtime_status: string;
}

const EMPTY_RECOVERY = {
  ok: true,
  recoveredVaults: 0,
  recoveredItems: 0,
  blockedVaults: 0,
};

async function main(): Promise<void> {
  await proveBoundedKeysetPagination();
  await proveRuntimeAndVaultGuards();

  console.log(JSON.stringify({
    ok: true,
    case: 'instance-state-purge',
    answers: '实例状态清理只按稳定游标读取 destroyed/stopped 小批次，并继续保留运行态与宝库资产安全保护。',
    excludes: '不连接真实 PostgreSQL；子表空状态快速路径由服务端编译和 with-db 门禁覆盖。',
  }, null, 2));
}

async function proveBoundedKeysetPagination(): Promise<void> {
  const entries = Array.from({ length: 34 }, (_, index): CatalogEntry => ({
    instance_id: `instance:dead:${String(index).padStart(3, '0')}`,
    status: 'destroyed',
    runtime_status: 'stopped',
  }));
  entries.push({ instance_id: 'instance:alive', status: 'active', runtime_status: 'running' });
  const purged: string[] = [];
  const pageInputs: Array<{ afterInstanceId?: string | null; limit?: number }> = [];
  const orphanLimits: number[] = [];
  const worker = new InstanceStatePurgeWorker(
    {
      async listPurgeableInstanceCatalogEntries(input = {}) {
        pageInputs.push({ ...input });
        const after = input.afterInstanceId ?? '';
        const limit = input.limit ?? 32;
        return entries
          .filter((entry) => (entry.status === 'destroyed' || entry.runtime_status === 'stopped') && entry.instance_id > after)
          .slice(0, limit);
      },
    },
    {
      async purgeInstanceState(instanceId) {
        purged.push(instanceId);
        return 8;
      },
    },
    {
      getInstanceRuntime() {
        return null;
      },
    },
    {
      async recoverOrphanedVaultItems(input = {}) {
        orphanLimits.push(input.limit ?? 0);
        return EMPTY_RECOVERY;
      },
      async recoverVaultItemsForInstance() {
        return EMPTY_RECOVERY;
      },
    },
  );

  assert.equal(await worker.runOnce(), 16);
  assert.equal(await worker.runOnce(), 16);
  assert.equal(await worker.runOnce(), 2);
  assert.equal(purged.length, 34);
  assert.deepEqual(pageInputs.map((input) => input.afterInstanceId ?? null), [null, 'instance:dead:015', 'instance:dead:031']);
  assert.ok(pageInputs.every((input) => input.limit === 16));
  assert.deepEqual(orphanLimits, [16, 16, 16]);
}

async function proveRuntimeAndVaultGuards(): Promise<void> {
  const purged: string[] = [];
  const recovered: string[] = [];
  const entries: CatalogEntry[] = [
    { instance_id: 'instance:runtime-active', status: 'destroyed', runtime_status: 'stopped' },
    { instance_id: 'instance:vault-blocked', status: 'destroyed', runtime_status: 'stopped' },
  ];
  const worker = new InstanceStatePurgeWorker(
    {
      async listPurgeableInstanceCatalogEntries() {
        return entries;
      },
    },
    {
      async purgeInstanceState(instanceId) {
        purged.push(instanceId);
        return 1;
      },
    },
    {
      getInstanceRuntime(instanceId) {
        return instanceId === 'instance:runtime-active'
          ? { meta: { status: 'active', runtimeStatus: 'running' } }
          : null;
      },
    },
    {
      async recoverOrphanedVaultItems() {
        return EMPTY_RECOVERY;
      },
      async recoverVaultItemsForInstance(input) {
        recovered.push(input.instanceId ?? '');
        return {
          ok: false,
          recoveredVaults: 0,
          recoveredItems: 0,
          blockedVaults: 1,
          reason: 'simulated_vault_block',
        };
      },
    },
  );

  assert.equal(await worker.runOnce(), 0);
  assert.deepEqual(recovered, ['instance:vault-blocked']);
  assert.deepEqual(purged, []);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
