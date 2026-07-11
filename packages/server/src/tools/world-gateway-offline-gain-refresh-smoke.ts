import assert from 'node:assert/strict';

import { S2C } from '@mud/shared';

import { WorldGatewayPlayerControlsHelper } from '../network/world-gateway-player-controls.helper';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function createDeferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value: T): void {
      assert.ok(resolvePromise);
      resolvePromise(value);
    },
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function main(): Promise<void> {
  let activePlayerId: string | null = 'player:offline-gain-refresh';
  const pendingLoads: Array<Deferred<unknown[]>> = [];
  const emitted: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const errors: string[] = [];
  const helper = new WorldGatewayPlayerControlsHelper({
    gatewayGuardHelper: {
      requirePlayerId() {
        return activePlayerId;
      },
    },
    worldClientEventService: {
      emitGatewayError(_client: unknown, code: string) {
        errors.push(code);
      },
    },
    playerRuntimeService: {
      async hasActiveOfflineGainSession() {
        return true;
      },
      loadOfflineGainPreviewReports() {
        const deferred = createDeferred<unknown[]>();
        pendingLoads.push(deferred);
        return deferred.promise;
      },
    },
  } as never);
  const client = {
    emit(event: string, payload: Record<string, unknown>) {
      emitted.push({ event, payload });
    },
  } as never;

  const olderRequest = helper.handleRequestOfflineGainReports(client, { requestId: 'refresh:older' });
  const newerRequest = helper.handleRequestOfflineGainReports(client, { requestId: 'refresh:newer' });
  await flushMicrotasks();
  assert.equal(pendingLoads.length, 2);

  pendingLoads[1]?.resolve([{ id: 'preview:newer', durationMs: 63_000 }]);
  await newerRequest;
  pendingLoads[0]?.resolve([{ id: 'preview:older', durationMs: 60_000 }]);
  await olderRequest;
  assert.deepEqual(emitted, [
    {
      event: S2C.OfflineGainReports,
      payload: {
        requestId: 'refresh:newer',
        reports: [{ id: 'preview:newer', durationMs: 63_000 }],
        preview: true,
        blocking: true,
      },
    },
    {
      event: S2C.OfflineGainReports,
      payload: {
        requestId: 'refresh:older',
        reports: [{ id: 'preview:older', durationMs: 60_000 }],
        preview: true,
        blocking: true,
      },
    },
  ], '每个异步回包必须回显自己的请求 ID，不能按完成顺序串线');

  const supersededRequest = helper.handleRequestOfflineGainReports(client, { requestId: 'refresh:superseded' });
  await flushMicrotasks();
  assert.equal(pendingLoads.length, 3);
  activePlayerId = 'player:replacement-session';
  pendingLoads[2]?.resolve([{ id: 'preview:superseded' }]);
  await supersededRequest;
  assert.equal(emitted.length, 2, 'socket 已切换玩家后不得投递旧玩家的异步预览');

  activePlayerId = 'player:offline-gain-refresh';
  await helper.handleRequestOfflineGainReports(client, { requestId: '' });
  await helper.handleRequestOfflineGainReports(client, { requestId: 'x'.repeat(97) });
  assert.equal(pendingLoads.length, 3, '空或超长请求 ID 必须在触发查询前拒绝');
  assert.deepEqual(errors, []);

  console.log(JSON.stringify({
    ok: true,
    case: 'world-gateway-offline-gain-refresh',
    answers: [
      '主动刷新回包逐条回显原请求 ID，乱序完成时仍可由客户端准确拒绝旧结果。',
      'socket 玩家绑定变化后不再下发旧玩家预览。',
      '非法请求 ID 不进入离线收益查询。',
    ],
  }, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
