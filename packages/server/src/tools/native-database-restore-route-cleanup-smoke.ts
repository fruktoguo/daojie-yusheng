import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { NativeDatabaseRestoreCoordinatorService } from '../http/native/native-database-restore-coordinator.service';

async function main(): Promise<void> {
  const calls: Array<Record<string, unknown>> = [];
  const service = new NativeDatabaseRestoreCoordinatorService(
    {
      purgeAllSessions(reason: string) {
        calls.push({ kind: 'purge-all-sessions', reason });
        return ['player:purged', 'player:runtime'];
      },
      consumeExpiredBindings() {
        calls.push({ kind: 'consume-expired-bindings' });
        return [
          { playerId: 'player:expired-detached', sessionId: 'sid:expired-detached', sessionEpoch: 17, connected: false, detachedAt: 101, expireAt: 202 },
          { playerId: 'player:runtime', sessionId: 'sid:runtime', sessionEpoch: 23, connected: false, detachedAt: 303, expireAt: 404 },
        ];
      },
      requeueExpiredBinding(binding: { playerId?: string; sessionId?: string } | null | undefined) {
        calls.push({
          kind: 'requeue-expired-binding',
          playerId: binding?.playerId ?? null,
          sessionId: binding?.sessionId ?? null,
        });
        return true;
      },
      acknowledgePurgedPlayerIds(playerIds: string[]) {
        calls.push({ kind: 'acknowledge-purged-player-ids', playerIds: [...playerIds] });
      },
    } as never,
    {
      worldRuntimePlayerSessionService: {
        removePlayer(playerId: string, reason: string, deps: unknown) {
          calls.push({
            kind: 'remove-player',
            playerId,
            reason,
            depsMatched: deps === service['worldRuntimeService'],
          });
        },
      },
      async rebuildPersistentRuntimeAfterRestore() {
        calls.push({ kind: 'rebuild-runtime' });
      },
    } as never,
    {
      clearDetachedPlayerCaches(playerId: string) {
        calls.push({ kind: 'clear-detached-cache', playerId });
      },
    } as never,
    {
      async flushAllNow() {
        calls.push({ kind: 'flush-players' });
      },
    } as never,
    {
      async flushAllNow() {
        calls.push({ kind: 'flush-maps' });
      },
    } as never,
    {
      listPlayerSnapshots() {
        return [{ playerId: 'player:runtime' }, { playerId: 'player:other-runtime' }];
      },
    } as never,
    {
      async clearLocalRoutes(playerIds: string[]) {
        calls.push({ kind: 'clear-local-routes', playerIds: [...playerIds] });
      },
      async clearLocalRoute(playerId: string, sessionEpoch?: number | null) {
        calls.push({ kind: 'direct-clear-local-route', playerId, sessionEpoch: sessionEpoch ?? null });
      },
    } as never,
    {
      clearRuntimeCache() {
        calls.push({ kind: 'clear-mail-cache' });
      },
    } as never,
    {
      async reloadFromPersistence() {
        calls.push({ kind: 'reload-market' });
      },
    } as never,
    {
      async reloadFromPersistence() {
        calls.push({ kind: 'reload-suggestion' });
      },
    } as never,
    {
      async reloadPasswordRecordFromPersistence() {
        calls.push({ kind: 'reload-gm-auth' });
      },
    } as never,
    {
      async reloadFromPersistence() {
        calls.push({ kind: 'reload-player-auth' });
      },
    } as never,
  );

  await service.prepareForRestore();

  assert.deepEqual(calls, [
    { kind: 'flush-players' },
    { kind: 'flush-maps' },
    { kind: 'purge-all-sessions', reason: 'database_restore' },
    { kind: 'consume-expired-bindings' },
    { kind: 'clear-local-routes', playerIds: ['player:purged'] },
    { kind: 'direct-clear-local-route', playerId: 'player:expired-detached', sessionEpoch: 17 },
    { kind: 'clear-detached-cache', playerId: 'player:purged' },
    { kind: 'clear-detached-cache', playerId: 'player:expired-detached' },
    {
      kind: 'remove-player',
      playerId: 'player:runtime',
      reason: 'removed',
      depsMatched: true,
    },
    { kind: 'clear-detached-cache', playerId: 'player:runtime' },
    {
      kind: 'remove-player',
      playerId: 'player:other-runtime',
      reason: 'removed',
      depsMatched: true,
    },
    { kind: 'clear-detached-cache', playerId: 'player:other-runtime' },
    { kind: 'acknowledge-purged-player-ids', playerIds: ['player:purged', 'player:runtime', 'player:other-runtime'] },
    { kind: 'clear-mail-cache' },
  ]);

  calls.length = 0;
  await service.reloadAfterRestore();
  assert.deepEqual(calls, [
    { kind: 'rebuild-runtime' },
    { kind: 'reload-market' },
    { kind: 'clear-mail-cache' },
    { kind: 'reload-suggestion' },
    { kind: 'reload-gm-auth' },
    { kind: 'reload-player-auth' },
  ]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        calls,
        answers:
          'NativeDatabaseRestoreCoordinatorService.prepareForRestore 现在会把 detached-only 的 purge 玩家与 expired detached bindings 分开清理：前者继续批量 clearLocalRoutes，后者改为逐个 clearLocalRoute(playerId, sessionEpoch)，并同步清掉 detached player caches；同时仍在线的 runtime player 会跳过这次批量清理，统一委托给 removePlayer 做带 sessionEpoch 的 route cleanup。若 detached cleanup 失败，expired bindings 会被 requeue 回 worldSessionService；成功路径下手动清过的玩家还会从 purgedPlayerIds 中显式确认消费，避免后续 world sync 再重复清一次。',
        excludes:
          '不证明真实 DB route 删除、restore 后 runtime 重建或 market/suggestion reload，只证明 restore 协调器不会遗漏 expired detached bindings，也不会在 purge/runtime 重叠玩家上重复触发提前 route cleanup；当前进一步要求 expired detached route cleanup 会保留 sessionEpoch。成功路径下不会误 requeue，失败时才应把 expired bindings 放回队列。',
        completionMapping: 'release:proof:native-database-restore-route-cleanup',
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
