import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import {
  describeServerRuntimeRole,
  resolveServerRuntimeRole,
  shouldStartAuthoritativeRuntime,
  shouldStartBackgroundWorkers,
  shouldStartBackupWorker,
  shouldStartHttpServer,
  shouldStartInlineFlushConsumer,
  shouldStartOutboxDispatcher,
} from '../config/runtime-role';
import {
  resolveFlushTaskRuntimeMode,
  shouldRunLegacyFlushIntervals,
} from '../persistence/flush-task-runtime-mode';

const RUNTIME_ENV_KEYS = [
  'SERVER_RUNTIME_ROLE',
  'DAOJIE_RUNTIME_ROLE',
  'SERVER_FLUSH_TASK_RUNTIME_MODE',
  'FLUSH_TASK_RUNTIME_MODE',
  'SERVER_ALLOW_API_INLINE_FLUSH_FALLBACK',
  'DAOJIE_ALLOW_API_INLINE_FLUSH_FALLBACK',
  'SERVER_RUNTIME_ENV',
  'APP_ENV',
  'NODE_ENV',
  'SERVER_SMOKE_PORT',
  'SERVER_SMOKE_ALLOW_UNREADY',
];

function main(): void {
  withRuntimeEnv({}, () => {
    assert.equal(resolveServerRuntimeRole(), 'api');
    assert.equal(resolveFlushTaskRuntimeMode(), 'off');
    assert.equal(shouldStartHttpServer(), true);
    assert.equal(shouldStartAuthoritativeRuntime(), true);
    assert.equal(shouldStartInlineFlushConsumer(), false);
    assert.equal(shouldStartBackgroundWorkers(), false);
    assert.match(describeServerRuntimeRole(), /role=api/);
  });

  withRuntimeEnv({ SERVER_RUNTIME_ROLE: 'all' }, () => {
    assert.equal(resolveServerRuntimeRole(), 'all');
    assert.equal(resolveFlushTaskRuntimeMode(), 'inline');
    assert.equal(shouldStartHttpServer(), true);
    assert.equal(shouldStartAuthoritativeRuntime(), true);
    assert.equal(shouldStartInlineFlushConsumer(), true);
    assert.equal(shouldStartBackgroundWorkers(), true);
  });

  withRuntimeEnv({ SERVER_RUNTIME_ROLE: 'api' }, () => {
    assert.equal(resolveServerRuntimeRole(), 'api');
    assert.equal(resolveFlushTaskRuntimeMode(), 'off');
    assert.equal(shouldStartHttpServer(), true);
    assert.equal(shouldStartAuthoritativeRuntime(), true);
    assert.equal(shouldStartInlineFlushConsumer(), false);
    assert.equal(shouldStartBackgroundWorkers(), false);
    assert.equal(shouldStartOutboxDispatcher(), false);
    assert.equal(shouldStartBackupWorker(), false);
  });

  withRuntimeEnv({ SERVER_RUNTIME_ROLE: 'api', SERVER_FLUSH_TASK_RUNTIME_MODE: 'inline' }, () => {
    assert.equal(resolveFlushTaskRuntimeMode(), 'inline');
    assert.equal(shouldStartInlineFlushConsumer(), false);
  });

  withRuntimeEnv({
    SERVER_RUNTIME_ROLE: 'api',
    SERVER_FLUSH_TASK_RUNTIME_MODE: 'inline',
    SERVER_ALLOW_API_INLINE_FLUSH_FALLBACK: '1',
  }, () => {
    assert.equal(resolveFlushTaskRuntimeMode(), 'inline');
    assert.equal(shouldStartInlineFlushConsumer(), true);
  });

  withRuntimeEnv({ SERVER_RUNTIME_ROLE: 'worker' }, () => {
    assert.equal(resolveServerRuntimeRole(), 'worker');
    assert.equal(resolveFlushTaskRuntimeMode(), 'worker');
    assert.equal(shouldStartHttpServer(), false);
    assert.equal(shouldStartAuthoritativeRuntime(), false);
    assert.equal(shouldStartInlineFlushConsumer(), false);
    assert.equal(shouldStartBackgroundWorkers(), true);
    assert.equal(shouldStartOutboxDispatcher(), true);
    assert.equal(shouldStartBackupWorker(), true);
  });

  withRuntimeEnv({ SERVER_RUNTIME_ROLE: 'worker', SERVER_FLUSH_TASK_RUNTIME_MODE: 'direct' }, () => {
    assert.equal(resolveFlushTaskRuntimeMode(), 'direct');
    assert.equal(shouldRunLegacyFlushIntervals(), false);
  });

  withRuntimeEnv({ DAOJIE_RUNTIME_ROLE: 'api', SERVER_FLUSH_TASK_RUNTIME_MODE: 'direct' }, () => {
    assert.equal(resolveServerRuntimeRole(), 'api');
    assert.equal(shouldRunLegacyFlushIntervals(), true);
  });

  withRuntimeEnv({ SERVER_RUNTIME_ROLE: 'invalid-role' }, () => {
    assert.equal(resolveServerRuntimeRole(), 'api');
    assert.equal(resolveFlushTaskRuntimeMode(), 'off');
  });

  console.log(JSON.stringify({
    ok: true,
    answers: 'SERVER_RUNTIME_ROLE/DAOJIE_RUNTIME_ROLE 已按生产友好默认 api/off 与显式 all/api/worker 解析，HTTP、权威 runtime、inline flush、background worker、outbox、backup 守卫矩阵符合预期。',
    excludes: '不证明 Phase 2 durable staging payload、生产 docker 拓扑或真实 DB 多 worker 竞争。',
    completionMapping: 'runtime-role-policy',
  }, null, 2));
}

function withRuntimeEnv(overrides: Record<string, string>, fn: () => void): void {
  const previous = new Map<string, string | undefined>();
  for (const key of RUNTIME_ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (typeof value === 'string') {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  }
}

main();
