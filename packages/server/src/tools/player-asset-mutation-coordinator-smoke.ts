import assert from 'node:assert/strict';

import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';

function createService(): PlayerRuntimeService {
  return new PlayerRuntimeService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function nextTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function main(): Promise<void> {
  const service = createService();
  const firstGate = createDeferred();
  const log: string[] = [];

  const first = service.runExclusiveAssetMutation(['player:a'], async () => {
    log.push('a:first:start');
    await firstGate.promise;
    log.push('a:first:end');
  });
  const second = service.runExclusiveAssetMutation(['player:a'], async () => {
    log.push('a:second');
  });
  const independent = service.runExclusiveAssetMutation(['player:b'], async () => {
    log.push('b:independent');
  });
  let synchronousMutationCount = 0;
  assert.equal(
    service.tryRunSynchronousPlayerMutationWhileAssetIdle('player:a', () => {
      synchronousMutationCount += 1;
    }),
    false,
  );
  assert.equal(synchronousMutationCount, 0, '同玩家资产事务排队期间不得插入同步状态推进');

  await nextTurn();
  assert.deepEqual(log, ['a:first:start', 'b:independent']);
  firstGate.resolve();
  await Promise.all([first, second, independent]);
  assert.deepEqual(log, ['a:first:start', 'b:independent', 'a:first:end', 'a:second']);
  await nextTurn();
  assert.equal(
    service.tryRunSynchronousPlayerMutationWhileAssetIdle('player:a', () => {
      synchronousMutationCount += 1;
    }),
    true,
  );
  assert.equal(synchronousMutationCount, 1, '资产队列释放后应允许同步状态推进');

  const nested: string[] = [];
  await service.runExclusiveAssetMutation(['player:nested'], async () => {
    nested.push('outer');
    await service.runExclusiveAssetMutation(['player:nested'], async () => {
      nested.push('inner');
    });
  });
  assert.deepEqual(nested, ['outer', 'inner']);

  await assert.rejects(
    () => service.runExclusiveAssetMutation(['player:held'], async () => {
      await service.runExclusiveAssetMutation(['player:new'], async () => undefined);
    }),
    /player_asset_mutation_nested_lock_expansion_forbidden/,
  );

  const multiGate = createDeferred();
  const multiLog: string[] = [];
  const multiFirst = service.runExclusiveAssetMutation(['player:x', 'player:y'], async () => {
    multiLog.push('xy:start');
    await multiGate.promise;
    multiLog.push('xy:end');
  });
  const multiSecond = service.runExclusiveAssetMutation(['player:y', 'player:x'], async () => {
    multiLog.push('yx');
  });
  await nextTurn();
  assert.deepEqual(multiLog, ['xy:start']);
  multiGate.resolve();
  await Promise.all([multiFirst, multiSecond]);
  await nextTurn();
  assert.deepEqual(multiLog, ['xy:start', 'xy:end', 'yx']);

  const queue = (service as unknown as {
    assetMutationQueueByPlayerId: Map<string, Promise<void>>;
  }).assetMutationQueueByPlayerId;
  assert.equal(queue.size, 0);

  const playerId = 'player:deferred-dirty';
  const player = {
    persistentRevision: 3,
    persistedRevision: 1,
    dirtyDomains: new Set(['inventory']),
  };
  (service as unknown as { players: Map<string, typeof player> }).players.set(playerId, player);
  service.markPersisted(playerId, new Set(['inventory']), 2);
  assert.equal(player.persistedRevision, 2);
  assert.deepEqual(Array.from(player.dirtyDomains), ['inventory']);
  service.markPersisted(playerId, new Set(['inventory']), 3);
  assert.equal(player.persistedRevision, 3);
  assert.equal(player.dirtyDomains.size, 0);

  console.log(JSON.stringify({
    ok: true,
    case: 'player-asset-mutation-coordinator',
    answers: '同玩家资产写严格串行，不同玩家可并行；多玩家反向入参不会死锁；已持有玩家允许同异步链重入，禁止嵌套扩张锁集合；同步非资产推进只在资产队列空闲时执行；队列完成后自动释放；IO 期间 revision 已推进时 markPersisted 保留同域 dirty，当前 revision 完整落库后才清除。',
  }));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
