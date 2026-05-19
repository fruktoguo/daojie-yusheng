import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { MapPersistenceFlushService } from '../persistence/map-persistence-flush.service';

interface FlushCall {
  instanceId: string;
  domains: string[] | null;
}

async function main(): Promise<void> {
  await testIntervalCoalescesLowPriorityDomains();
  await testShutdownBypassesCoalescingWindow();

  console.log(
    JSON.stringify(
      {
        ok: true,
        case: 'map-domain-coalescing',
        answers: '低优先级 tile_damage/tile_resource/fengshui 在合并窗口内会延迟；高优先级玩家操作立即刷盘；shutdown 强刷绕过合并窗口',
        excludes: '不证明真实 PG 写入性能或跨进程 worker 编排',
        completionMapping: 'persistence-root-fix.phase3.coalescing-window',
      },
      null,
      2,
    ),
  );
}

async function testIntervalCoalescesLowPriorityDomains(): Promise<void> {
  const now = Date.now();
  const flushCalls: FlushCall[] = [];
  const diagnostics: unknown[] = [];
  const service = new MapPersistenceFlushService(
    {
      instanceDomainPersistenceService: {
        isEnabled() {
          return true;
        },
      },
      listDirtyPersistentInstanceDomains() {
        return [
          {
            instanceId: 'i:low-recent',
            domains: ['tile_damage'],
            domainMeta: { tile_damage: { firstMarkedAt: now, highPriority: false } },
          },
          {
            instanceId: 'i:high-recent',
            domains: ['tile_damage'],
            domainMeta: { tile_damage: { firstMarkedAt: now, highPriority: true } },
          },
          {
            instanceId: 'i:old-resource',
            domains: ['tile_resource'],
            domainMeta: { tile_resource: { firstMarkedAt: now - 10_000, highPriority: false } },
          },
          { instanceId: 'i:building', domains: ['building'] },
        ];
      },
      async flushInstanceDomains(instanceId: string, domains: string[] | null) {
        flushCalls.push({ instanceId, domains });
        return { skipped: false, persistedDomains: domains ?? [] };
      },
    } as never,
    {
      reportMapFlush(diag: unknown) {
        diagnostics.push(diag);
      },
    } as never,
  );

  await service.flushDirtyInstances();

  assert.deepEqual(flushCalls, [
    { instanceId: 'i:building', domains: ['building'] },
    { instanceId: 'i:high-recent', domains: ['tile_damage'] },
    { instanceId: 'i:old-resource', domains: ['tile_resource'] },
  ]);
  assert.equal((diagnostics[0] as { coalescedDomainCount?: number }).coalescedDomainCount, 1);
}

async function testShutdownBypassesCoalescingWindow(): Promise<void> {
  const now = Date.now();
  const flushCalls: FlushCall[] = [];
  const service = new MapPersistenceFlushService(
    {
      instanceDomainPersistenceService: {
        isEnabled() {
          return true;
        },
      },
      listDirtyPersistentInstanceDomains() {
        return [
          {
            instanceId: 'i:shutdown-low-recent',
            domains: ['tile_damage'],
            domainMeta: { tile_damage: { firstMarkedAt: now, highPriority: false } },
          },
        ];
      },
      async flushInstanceDomains(instanceId: string, domains: string[] | null) {
        flushCalls.push({ instanceId, domains });
        return { skipped: false, persistedDomains: domains ?? [] };
      },
    } as never,
  );

  await service.flushAllNow();

  assert.deepEqual(flushCalls, [
    { instanceId: 'i:shutdown-low-recent', domains: ['tile_damage'] },
  ]);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
