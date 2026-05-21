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
  let playerRuntimeFallbackCount = 0;
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
  const instanceRuntime = new FlushTaskRuntimeService(
    { listDirtyPlayerDomains: () => new Map() } as never,
    {
      listDirtyPersistentInstanceDomains: () => [],
      getInstanceRuntime: () => null,
    } as never,
    { flushPlayerDomains: async () => { playerRuntimeFallbackCount += 1; return true; } } as never,
    ledger as never,
    { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
  );

  try {
    const processed = await instanceRuntime.runOnce('flush-task-noop-retry-smoke');
    assert.equal(processed, 0);
    assert.equal(retryCount, 1);
    assert.equal(flushedCount, 0);

    claimed = false;
    const destroyedLedger = {
      ...ledger,
      async claimReadyFlushTasks(input: { scope: string }) {
        if (input.scope !== 'instance' || claimed) {
          return [];
        }
        claimed = true;
        return [{
          scope: 'instance',
          id: 'tower:tongtian:layer:destroyed',
          domain: 'time',
          priority: 'low',
          latestRevision: 2,
          ownershipEpoch: 2,
        }];
      },
    };
    const destroyedRuntime = new FlushTaskRuntimeService(
      { listDirtyPlayerDomains: () => new Map() } as never,
      {
        listDirtyPersistentInstanceDomains: () => [],
        getInstanceRuntime: () => null,
      } as never,
      { flushPlayerDomains: async () => { playerRuntimeFallbackCount += 1; return true; } } as never,
      destroyedLedger as never,
      { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
      undefined,
      undefined,
      undefined,
      undefined,
      { isEnabled: () => true, loadInstanceCatalog: async () => ({ status: 'destroyed', runtime_status: 'stopped', ownership_epoch: 2 }) } as never,
    );
    const destroyedProcessed = await destroyedRuntime.runOnce('flush-task-destroyed-missing-runtime-smoke');
    assert.equal(destroyedProcessed, 1);
    assert.equal(retryCount, 1);
    assert.equal(flushedCount, 1);

    claimed = false;
    const playerLedger = {
      ...ledger,
      async claimReadyFlushTasks(input: { scope: string }) {
        if (input.scope !== 'player' || claimed) {
          return [];
        }
        claimed = true;
        return [{
          scope: 'player',
          id: 'player-unsupported-domain',
          domain: 'mail',
          priority: 'high',
          latestRevision: 1,
        }];
      },
    };
    const playerRuntime = new FlushTaskRuntimeService(
      { listDirtyPlayerDomains: () => new Map() } as never,
      { listDirtyPersistentInstanceDomains: () => [] } as never,
      { flushPlayerDomains: async () => { playerRuntimeFallbackCount += 1; return true; } } as never,
      playerLedger as never,
      { signalPlayerFlush() {}, signalInstanceFlush() {} } as never,
    );
    const playerProcessed = await playerRuntime.runOnce('flush-task-player-unsupported-retry-smoke');
    assert.equal(playerProcessed, 0);
    assert.equal(retryCount, 2);
    assert.equal(flushedCount, 1);
    assert.equal(playerRuntimeFallbackCount, 0);
  } finally {
    restoreEnv('SERVER_RUNTIME_ROLE', previousRole);
    restoreEnv('SERVER_FLUSH_TASK_RUNTIME_MODE', previousMode);
  }

  console.log(JSON.stringify({
    ok: true,
    answers: '实例 flush task 在 worker 无运行态/no-op 路径下会 retry；catalog 已 destroyed/stopped 的旧实例任务会 mark flushed；unsupported player domain 在 worker role 下不会回退到 runtime flush，也不会 mark flushed。',
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
