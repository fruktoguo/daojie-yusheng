import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { MapPersistenceFlushService } from '../persistence/map-persistence-flush.service';

async function main(): Promise<void> {
  const batchCalls: Array<{ kind: string; payload: unknown }> = [];
  const deltaBatchCalls: Array<{ domain: string; instanceIds: string[] }> = [];
  const watermarkBatchCalls: Array<Array<{ instanceId: string; payload: unknown }>> = [];
  const persistedBatchCalls: Array<{ domain: string; instanceIds: string[] }> = [];
  const legacyFlushCalls: Array<{ instanceId: string; domains: string[] | null }> = [];

  const service = new MapPersistenceFlushService(
    {
      instanceDomainPersistenceService: {
        isEnabled() {
          return true;
        },
        async saveTileDamageDeltaBatch(batch: Array<{ instanceId: string; [key: string]: unknown }>) {
          batchCalls.push({ kind: 'tile_damage', payload: batch });
        },
        async saveTileResourceDeltaBatch(batch: Array<{ instanceId: string; [key: string]: unknown }>) {
          batchCalls.push({ kind: 'tile_resource', payload: batch });
        },
        async saveInstanceRecoveryWatermarkBatch(batch: Array<{ instanceId: string; payload: unknown }>) {
          watermarkBatchCalls.push(batch);
        },
      },
      listDirtyPersistentInstanceDomains() {
        return [
          { instanceId: 'map:a', domains: ['tile_damage', 'tile_resource'], domainMeta: { tile_damage: { firstMarkedAt: Date.now() - 5_000, highPriority: false }, tile_resource: { firstMarkedAt: Date.now() - 5_000, highPriority: false } } },
          { instanceId: 'map:b', domains: ['tile_damage'], domainMeta: { tile_damage: { firstMarkedAt: Date.now() - 5_000, highPriority: false } } },
          { instanceId: 'map:c', domains: ['building'] },
        ];
      },
      buildDomainDeltaBatch(domain: string, instanceIds: string[]) {
        deltaBatchCalls.push({ domain, instanceIds: [...instanceIds] });
        return instanceIds.map((instanceId) => ({
          instanceId,
          domain,
          upserts: [{ domain, instanceId }],
          deletes: [],
          watermarkPayload: { instanceId, domain },
        }));
      },
      async flushInstanceDomains(instanceId: string, domains: string[] | null) {
        legacyFlushCalls.push({ instanceId, domains });
        return { skipped: false, persistedDomains: domains ?? [] };
      },
      markDomainBatchPersisted(domain: string, instanceIds: string[]) {
        persistedBatchCalls.push({ domain, instanceIds: [...instanceIds] });
      },
    } as never,
  );

  await service.flushDirtyInstances();

  assert.deepEqual(deltaBatchCalls, [
    { domain: 'tile_damage', instanceIds: ['map:a', 'map:b'] },
    { domain: 'tile_resource', instanceIds: ['map:a'] },
  ]);
  assert.deepEqual(batchCalls, [
    { kind: 'tile_damage', payload: [{ instanceId: 'map:a', upserts: [{ domain: 'tile_damage', instanceId: 'map:a' }], deletes: [] }, { instanceId: 'map:b', upserts: [{ domain: 'tile_damage', instanceId: 'map:b' }], deletes: [] }] },
    { kind: 'tile_resource', payload: [{ instanceId: 'map:a', upserts: [{ domain: 'tile_resource', instanceId: 'map:a' }], deletes: [] }] },
  ]);
  assert.deepEqual(watermarkBatchCalls, [
    [{ instanceId: 'map:a', payload: { instanceId: 'map:a', domain: 'tile_damage' } }, { instanceId: 'map:b', payload: { instanceId: 'map:b', domain: 'tile_damage' } }],
    [{ instanceId: 'map:a', payload: { instanceId: 'map:a', domain: 'tile_resource' } }],
  ]);
  assert.deepEqual(persistedBatchCalls, [
    { domain: 'tile_damage', instanceIds: ['map:a', 'map:b'] },
    { domain: 'tile_resource', instanceIds: ['map:a'] },
  ]);
  assert.deepEqual(legacyFlushCalls, [
    { instanceId: 'map:c', domains: ['building'] },
  ]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        case: 'map-domain-batch-flush',
        answers: 'tile_damage / tile_resource 通过 domain batch API 归并，同批写 watermark；其余 domain 保持 per-instance 刷盘',
        excludes: '不证明真实 PostgreSQL 性能，只证明分组与调用顺序',
        completionMapping: 'persistence-root-fix.phase2.domain-batch',
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
