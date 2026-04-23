import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { MapPersistenceFlushService } from '../persistence/map-persistence-flush.service';

async function main(): Promise<void> {
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

  console.log(
    JSON.stringify(
      {
        ok: true,
        case: 'map-persistence-flush-throttle',
        buildCalls,
        saveCalls,
        persistedCalls,
        answers: '第二次 interval flush 在第一次耗时偏高后被 throttle 拦截，说明数据库慢时会自动退避最终一致 flush',
        excludes: '不证明 500/1000 真实压测、跨节点竞争或故障注入',
        completionMapping: 'replace-ready:proof:stage7.flush-throttle',
      },
      null,
      2,
    ),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
