import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { MapPersistenceFlushService } from '../persistence/map-persistence-flush.service';

async function main(): Promise<void> {
  await testLegacySnapshotWriteDisabledByDefault();
  await testIntervalThrottle();
  await testIntervalSkipsDeferredTimeCheckpoint();
  await testIntervalSkipsDeferredMonsterRuntime();
  await testDomainOnlyShutdownFlush();

  console.log(
    JSON.stringify(
      {
        ok: true,
        case: 'map-persistence-flush-throttle',
        answers: '旧全量 map snapshot 写入已退役；instance domain interval 慢刷盘会退避；未到期的纯 time checkpoint 不进入普通 interval 刷盘；未到期的高频 monster_runtime 不进入普通 interval 刷盘；shutdown 强刷在只启用 instance domain persistence 时仍会落地分域脏状态',
        excludes: '不证明 500/1000 真实压测、跨节点竞争或故障注入',
        completionMapping: 'replace-ready:proof:stage7.flush-throttle',
      },
      null,
      2,
    ),
  );
}

async function testLegacySnapshotWriteDisabledByDefault(): Promise<void> {
  const buildCalls: string[] = [];
  const saveCalls: string[] = [];
  const previousServerEnv = process.env.SERVER_MAP_LEGACY_SNAPSHOT_WRITE;
  const previousEnv = process.env.MAP_LEGACY_SNAPSHOT_WRITE;
  delete process.env.SERVER_MAP_LEGACY_SNAPSHOT_WRITE;
  delete process.env.MAP_LEGACY_SNAPSHOT_WRITE;
  try {
    const service = new MapPersistenceFlushService(
      {
        listDirtyPersistentInstances() {
          return ['instance:legacy-default-off'];
        },
        buildMapPersistenceSnapshot(instanceId: string) {
          buildCalls.push(instanceId);
          return {
            version: 1,
            savedAt: Date.now(),
            templateId: 'yunlai_town',
            tileResourceEntries: [],
            groundPileEntries: [],
            containerStates: [],
          };
        },
      } as never,
      {
        isEnabled() {
          return true;
        },
        async saveMapSnapshot(instanceId: string) {
          saveCalls.push(instanceId);
        },
      } as never,
    );

    await service.flushDirtyInstances();

    assert.deepEqual(buildCalls, []);
    assert.deepEqual(saveCalls, []);
  } finally {
    restoreEnv('SERVER_MAP_LEGACY_SNAPSHOT_WRITE', previousServerEnv);
    restoreEnv('MAP_LEGACY_SNAPSHOT_WRITE', previousEnv);
  }
}

async function testIntervalThrottle(): Promise<void> {
  const flushCalls: Array<{ instanceId: string; domains: string[] | null }> = [];
  const service = new MapPersistenceFlushService(
    {
      instanceDomainPersistenceService: {
        isEnabled() {
          return true;
        },
      },
      listDirtyPersistentInstanceDomains() {
        return [{ instanceId: 'instance:slow', domains: ['tile_resource'] }];
      },
      listDirtyPersistentInstances() {
        throw new Error('domain entries should not fall back to legacy full-instance scan');
      },
      async flushInstanceDomains(instanceId: string, domains: string[] | null) {
        flushCalls.push({ instanceId, domains });
        await sleep(120);
        return { skipped: false };
      },
    } as never,
    {
      isEnabled() {
        return true;
      },
    } as never,
  );

  await service.flushDirtyInstances();
  await service.flushDirtyInstances();

  assert.deepEqual(flushCalls, [
    { instanceId: 'instance:slow', domains: ['tile_resource'] },
  ]);
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

async function testIntervalSkipsDeferredMonsterRuntime(): Promise<void> {
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
          { instanceId: 'real:monster_only', domains: ['monster_runtime'] },
          { instanceId: 'real:mixed', domains: ['monster_runtime', 'tile_resource'] },
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
  (service as unknown as { nextMonsterRuntimeFlushAt: number }).nextMonsterRuntimeFlushAt = Date.now() + 60_000;

  await service.flushDirtyInstances();
  assert.deepEqual(flushCalls, [
    { instanceId: 'real:mixed', domains: ['tile_resource'] },
  ]);

  await service.flushAllNow();
  assert.deepEqual(flushCalls, [
    { instanceId: 'real:mixed', domains: ['tile_resource'] },
    { instanceId: 'real:mixed', domains: ['monster_runtime', 'tile_resource'] },
    { instanceId: 'real:monster_only', domains: ['monster_runtime'] },
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

function restoreEnv(name: string, previousValue: string | undefined): void {
  if (typeof previousValue === 'undefined') {
    delete process.env[name];
    return;
  }
  process.env[name] = previousValue;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
