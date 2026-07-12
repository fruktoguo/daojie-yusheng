import assert from 'node:assert/strict';

import { buildHealthResponse } from '../health/health-readiness';
import { NativePlayerAuthStoreService } from '../http/native/native-player-auth-store.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

const ENV_KEYS = [
  'SERVER_DATABASE_URL',
  'DATABASE_URL',
  'SERVER_DATABASE_POOLER_URL',
  'DATABASE_POOLER_URL',
  'SERVER_PLAYER_AUTH_POOL_CONNECTION_TIMEOUT_MS',
  'PLAYER_AUTH_POOL_CONNECTION_TIMEOUT_MS',
] as const;

async function main(): Promise<void> {
  const previousEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  let store: NativePlayerAuthStoreService | null = null;
  try {
    process.env.SERVER_DATABASE_URL = 'postgresql://auth_smoke:auth_smoke@127.0.0.1:1/auth_smoke';
    process.env.DATABASE_URL = '';
    process.env.SERVER_DATABASE_POOLER_URL = '';
    process.env.DATABASE_POOLER_URL = '';
    process.env.SERVER_PLAYER_AUTH_POOL_CONNECTION_TIMEOUT_MS = '250';
    process.env.PLAYER_AUTH_POOL_CONNECTION_TIMEOUT_MS = '';

    store = new NativePlayerAuthStoreService();
    await store.onModuleInit();

    assert.equal(store.isEnabled(), false);
    assert.equal(store.isOperational(), false);
    assert.throws(() => store?.assertOperational(), isServiceUnavailable);
    await assert.rejects(
      () => store!.saveUser({} as never),
      isServiceUnavailable,
    );
    assert.equal((store as unknown as { usersById: Map<string, unknown> }).usersById.size, 0);

    const health = buildHealthResponse({
      playerPersistenceService: { enabled: true, pool: {} },
      mailPersistenceService: { enabled: true, pool: {} },
      marketPersistenceService: { enabled: true, pool: {} },
      activityPersistenceService: { enabled: true, pool: {} },
      authStoreService: store,
      worldRuntimeService: {
        getRuntimeSummary: () => ({
          tick: 1,
          instanceCount: 1,
          leaseDegradedInstanceCount: 0,
          fencedInstanceCount: 0,
          quarantineInstanceCount: 0,
          quarantineInstances: [],
          playerCount: 0,
          pendingCommandCount: 0,
        }),
      },
    });
    assert.equal(health.readiness.auth.ready, false);
    assert.equal(health.readiness.auth.reason, 'init_incomplete_or_failed');
    assert.equal(health.readiness.ok, false);

    let reconnectError: unknown = null;
    await assert.rejects(
      () => store!.reloadFromPersistence(),
      (error: unknown) => {
        reconnectError = error;
        return !isServiceUnavailable(error);
      },
    );
    assert.ok(reconnectError);
    assert.equal(store.isOperational(), false);

    console.log(JSON.stringify({
      ok: true,
      case: 'native-auth-persistence-failure',
      answers: [
        '数据库已配置但账号库初始化失败时，账号读写返回 503，不会创建易失内存账号。',
        '账号真源未就绪会直接把整体 readiness 降为 false。',
        '数据库恢复后的 reload 在连接池缺失时会真实重连，失败会向恢复流程冒泡而非静默跳过。',
      ],
    }, null, 2));
  } finally {
    await store?.onModuleDestroy().catch(() => undefined);
    for (const key of ENV_KEYS) {
      const previous = previousEnv.get(key);
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    }
  }
}

function isServiceUnavailable(error: unknown): boolean {
  const candidate = error as { getStatus?: () => unknown; status?: unknown; statusCode?: unknown };
  const status = typeof candidate?.getStatus === 'function'
    ? candidate.getStatus()
    : (candidate?.status ?? candidate?.statusCode);
  return status === 503;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
