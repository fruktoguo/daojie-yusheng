import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { WorldRuntimeController } from '../runtime/world/world-runtime.controller';

async function main(): Promise<void> {
  const playerId = 'player:controller-lease-guard';
  const instanceId = 'instance:controller-lease-guard';
  const runtimeInstance = {
    meta: {
      instanceId,
      assignedNodeId: 'node:controller-lease-guard',
      leaseToken: 'lease:controller-lease-guard',
      leaseExpireAt: new Date(Date.now() + 45_000).toISOString(),
      runtimeStatus: 'leased',
    },
  };
  let registeredGuard: { isPlayerPersistenceWritable(playerId: string): boolean } | null = null;
  let runtimeLookupCount = 0;
  const worldRuntimeService = {
    worldRuntimePlayerLocationService: {
      getPlayerLocation(requestedPlayerId: string) {
        return requestedPlayerId === playerId ? { instanceId } : null;
      },
    },
    getInstanceRuntime(requestedInstanceId: string) {
      runtimeLookupCount += 1;
      return requestedInstanceId === instanceId ? runtimeInstance : null;
    },
    getInstance() {
      throw new Error('玩家刷盘租约守卫不得读取对外实例快照');
    },
    isInstanceLeaseWritable(instance: unknown) {
      assert.equal(instance, runtimeInstance, '租约校验必须接收包含 lease 元数据的权威实例');
      return true;
    },
  };
  const controller = new WorldRuntimeController(
    worldRuntimeService as never,
    {} as never,
    {} as never,
    {} as never,
    {
      setLeaseGuard(guard: { isPlayerPersistenceWritable(playerId: string): boolean }) {
        registeredGuard = guard;
      },
    } as never,
    {} as never,
    {} as never,
    { getMetrics: () => ({}) } as never,
  );

  controller.onModuleInit();

  assert.ok(registeredGuard, 'controller 初始化时必须注册玩家刷盘租约守卫');
  assert.equal(registeredGuard.isPlayerPersistenceWritable(playerId), true);
  assert.equal(runtimeLookupCount, 1, '玩家仍挂在实例中时必须读取一次权威实例');
  assert.equal(registeredGuard.isPlayerPersistenceWritable('player:detached'), true, '无运行时位置的玩家不受实例租约阻断');
  assert.equal(runtimeLookupCount, 1, '无运行时位置时不得查询实例');

  console.log(
    JSON.stringify(
      {
        ok: true,
        runtimeLookupCount,
        answers: '玩家刷盘租约守卫使用权威实例校验 lease，不会再把缺少 lease 元数据的对外快照误判为租约失效。',
        excludes: '不证明真实数据库写入或实例续租，只证明 controller 到玩家刷盘服务的租约守卫接线。',
        completionMapping: 'release:proof:world-runtime.controller.player-flush-lease-guard',
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
