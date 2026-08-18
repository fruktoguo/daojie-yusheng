import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { WorkerPoolModule } from '../concurrency/worker-pool.module';

interface ShutdownPoolStub {
  initialize(): void;
  shutdown(): Promise<void>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main(): Promise<void> {
  const events: string[] = [];
  const delays = [30, 10, 20, 5];
  const pools: ShutdownPoolStub[] = delays.map((delayMs, index) => ({
    initialize: () => { events.push(`init:${index}`); },
    shutdown: async () => {
      events.push(`start:${index}`);
      await delay(delayMs);
      events.push(`done:${index}`);
    },
  }));
  const module = new WorkerPoolModule(
    pools[0] as never,
    pools[1] as never,
    pools[2] as never,
    pools[3] as never,
  );

  module.onModuleInit();
  assert.deepEqual(events, ['init:0', 'init:1', 'init:2', 'init:3']);

  const destroyPromise = module.onModuleDestroy();
  assert.deepEqual(
    events.slice(4).sort(),
    ['start:0', 'start:1', 'start:2', 'start:3'],
    'onModuleDestroy 必须同步触发全部 worker pool shutdown',
  );
  await destroyPromise;
  assert.deepEqual(
    events.filter((event) => event.startsWith('done:')).sort(),
    ['done:0', 'done:1', 'done:2', 'done:3'],
    'onModuleDestroy 返回前必须等待全部 worker pool terminate/drain 完成',
  );

  console.log(JSON.stringify({
    ok: true,
    case: 'worker-pool-shutdown-await',
    answers: 'WorkerPoolModule 关闭钩子会并发触发四类 worker pool shutdown，并等待全部异步关闭完成后才返回。',
    excludes: '不证明真实 worker 任务语义，只证明 Nest module destroy 对 worker pool 关闭 Promise 的等待边界。',
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
