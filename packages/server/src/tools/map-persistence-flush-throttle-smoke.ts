import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { MapPersistenceFlushService } from '../persistence/map-persistence-flush.service';

async function main(): Promise<void> {
  await testIntervalThrottle();
  await testIntervalSkipsDeferredTimeCheckpoint();
  await testDomainOnlyShutdownFlush();

  console.log(
    JSON.stringify(
      {
        ok: true,
        case: 'map-persistence-flush-throttle',
        answers: 'interval 慢刷盘会退避；未到期的纯 time checkpoint 不进入普通 interval 刷盘；shutdown 强刷在只启用 instance domain persistence 时仍会落地分域脏状态',
        excludes: '不证明 500/1000 真实压测、跨节点竞争或故障注入',
        completionMapping: 'replace-ready:proof:stage7.flush-throttle',
      },
      null,
      2,
    ),
  );
}

async function testIntervalThrottle(): Promise<void> {
  const buildCalls: string[] = [];
  const saveCalls: string[] = [];
  const persistedCalls: string[] = [];
  const service = new MapPersistenceFlushService(
    {
      listDirtyPersistentInstances() {
        return ['instance:slow'];
      },
      buildMapPersistenceSnapshot(instanceId: string) {
        buildCalls.push(instanceId);
        return {
          version: 1,
          savedAt: Date.now(),
          templateId: 'yunlai_town',
          tileResourceEntries: [{ resourceKey: 'qi', tileIndex: 1, value: 2 }],
          groundPileEntries: [],
          containerStates: [],
        };
      },
      markMapPersisted(instanceId: string) {
        persistedCalls.push(instanceId);
      },
    } as never,
    {
      isEnabled() {
        return true;
      },
      async saveMapSnapshot(instanceId: string) {
        saveCalls.push(instanceId);
        await sleep(120);
      },
    } as never,
  );

  await service.flushDirtyInstances();
  await service.flushDirtyInstances();

  assert.deepEqual(buildCalls, ['instance:slow']);
  assert.deepEqual(saveCalls, ['instance:slow']);
  assert.deepEqual(persistedCalls, ['instance:slow']);
}

async function testIntervalSkipsDeferredTimeCheckpoint(): Promise<void> {
  const flushCalls: Array<{ instanceId: string; domains: string[] | null }> = [];
  const service = new MapPersistenceFlushService(
    {
      instanceDomainPersistenceService: {
        isEnabled() {
          return true;
        },
      },
      listDirtyPersistentInstanceDomains() {
        return [
          { instanceId: 'public:time_only', domains: ['time'] },
          { instanceId: 'public:mixed', domains: ['time', 'tile_damage'] },
        ];
      },
      listDirtyPersistentInstances() {
        throw new Error('domain entries should not fall back to legacy full-instance scan');
      },
      async flushInstanceDomains(instanceId: string, domains: string[] | null) {
        flushCalls.push({ instanceId, domains });
        return { skipped: false };
      },
    } as never,
    {
      isEnabled() {
        return false;
      },
    } as never,
  );
  (service as unknown as { nextTimeCheckpointFlushAt: number }).nextTimeCheckpointFlushAt = Date.now() + 60_000;

  await service.flushDirtyInstances();
  assert.deepEqual(flushCalls, [
    { instanceId: 'public:mixed', domains: ['tile_damage'] },
  ]);

  await service.flushAllNow();
  assert.deepEqual(flushCalls, [
    { instanceId: 'public:mixed', domains: ['tile_damage'] },
    { instanceId: 'public:mixed', domains: ['time', 'tile_damage'] },
    { instanceId: 'public:time_only', domains: ['time'] },
  ]);
}

async function testDomainOnlyShutdownFlush(): Promise<void> {
  const flushCalls: Array<{ instanceId: string; domains: string[] | null }> = [];
  const service = new MapPersistenceFlushService(
    {
      instanceDomainPersistenceService: {
        isEnabled() {
          return true;
        },
      },
      listDirtyPersistentInstanceDomains() {
        return [{ instanceId: 'sect:stabilized:main', domains: ['tile_damage'] }];
      },
      async flushInstanceDomains(instanceId: string, domains: string[] | null) {
        flushCalls.push({ instanceId, domains });
        return { skipped: false };
      },
    } as never,
    {
      isEnabled() {
        return false;
      },
    } as never,
  );

  await service.flushAllNow();

  assert.deepEqual(flushCalls, [
    { instanceId: 'sect:stabilized:main', domains: ['tile_damage'] },
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
