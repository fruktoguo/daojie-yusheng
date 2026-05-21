import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { FlushTaskRuntimeService } from '../persistence/flush-task-runtime.service';

async function main(): Promise<void> {
  const previousRole = process.env.SERVER_RUNTIME_ROLE;
  const previousMode = process.env.SERVER_FLUSH_TASK_RUNTIME_MODE;
  process.env.SERVER_RUNTIME_ROLE = 'worker';
  process.env.SERVER_FLUSH_TASK_RUNTIME_MODE = 'worker';

  let claimed = false;
  let retryCount = 0;
  let flushedCount = 0;
  const ledger = {
    isEnabled: () => true,
    async claimReadyFlushTasks(input: { scope: string }) {
      if (input.scope !== 'instance' || claimed) {
        return [];
      }
      claimed = true;
      return [{
        scope: 'instance',
        id: 'public:missing-runtime',
        domain: 'tile_resource',
        priority: 'normal',
        latestRevision: 1,
        ownershipEpoch: 1,
      }];
    },
    async markFlushTasksRetry(tasks: unknown[]) {
      retryCount += tasks.length;
    },
    async markFlushTaskRetry() {
      retryCount += 1;
    },
    async markFlushTasksFlushed(tasks: unknown[]) {
      flushedCount += tasks.length;
    },
    async markFlushTaskFlushed() {
      flushedCount += 1;
    },
  };
  const runtime = new FlushTaskRuntimeService(
    { listDirtyPlayerDomains: () => new Map() } as never,
    {
      listDirtyPersistentInstanceDomains: () => [],
      getInstanceRuntime: () => null,
    } as never,
    { flushPlayerDomains: async () => true } as never,
    ledger as never,
    { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
  );

  try {
    const processed = await runtime.runOnce('flush-task-noop-retry-smoke');
    assert.equal(processed, 0);
    assert.equal(retryCount, 1);
    assert.equal(flushedCount, 0);
  } finally {
    restoreEnv('SERVER_RUNTIME_ROLE', previousRole);
    restoreEnv('SERVER_FLUSH_TASK_RUNTIME_MODE', previousMode);
  }

  console.log(JSON.stringify({
    ok: true,
    answers: '实例 flush task 在 worker 无运行态/no-op 路径下会 retry，不会 mark flushed。',
    excludes: '不证明 durable staging payload 或真实 DB claim 竞争。',
    completionMapping: 'flush-task-noop-retry',
  }, null, 2));
}

function restoreEnv(name: string, value: string | undefined): void {
  if (typeof value === 'string') {
    process.env[name] = value;
  } else {
    delete process.env[name];
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
