import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { NativeDatabaseRestoreCoordinatorService } from '../http/native/native-database-restore-coordinator.service';
import { NATIVE_GM_RESTORE_CONTRACT } from '../http/native/native-gm-contract';
import { NativeGmAdminService } from '../http/native/native-gm-admin.service';

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
    { kind: 'reload-gm-auth' },
    { kind: 'reload-player-auth' },
  ]);

  let exitCode: number | null = null;
  await new Promise<void>((resolve) => {
    service.scheduleProcessRestartAfterCommit({
      delayMs: 0,
      exitProcess(code) {
        exitCode = code;
        resolve();
      },
    });
  });
  assert.equal(exitCode, 0);
  assert.equal(NATIVE_GM_RESTORE_CONTRACT.processHandoffAfterCommit, 'fail_stop_restart');
  assert.equal(NATIVE_GM_RESTORE_CONTRACT.gracefulShutdownAfterCommit, false);

  const triggerRestoreSource = NativeGmAdminService.prototype.triggerDatabaseRestore.toString();
  assert.match(triggerRestoreSource, /scheduleProcessRestartAfterCommit/);
  assert.doesNotMatch(triggerRestoreSource, /process\.kill|SIGTERM/);
  assert.ok(
    triggerRestoreSource.indexOf('runDatabaseJob') < triggerRestoreSource.indexOf('scheduleProcessRestartAfterCommit'),
    '必须在 runDatabaseJob 统一收尾后才安排进程交接',
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        calls,
        answers:
          'NativeDatabaseRestoreCoordinatorService.prepareForRestore 会完整清理 detached-only、expired detached 与 runtime player，并保留 sessionEpoch 围栏。恢复 SQL 提交后由 NativeGmAdminService 等待 runDatabaseJob 统一状态落库，再调用恢复协调器以退出码 0 直接结束当前进程，不进入 SIGTERM 优雅关服刷盘链路。',
        excludes:
          '不执行真实 pg_restore、真实进程退出或守护进程重启；只证明恢复协调器的清理语义、fail-stop 退出码和 GM 恢复入口的调用契约。',
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
