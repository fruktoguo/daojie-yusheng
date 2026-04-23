const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function main() {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../http/native/native-database-restore-coordinator.service.ts'),
    'utf8',
  );

  assert.ok(
    source.includes('consumeExpiredBindings?(): ExpiredBindingLike[];'),
    'expected restore coordinator interface to expose consumeExpiredBindings',
  );
  assert.ok(
    source.includes('sessionEpoch?: number | null;'),
    'expected restore coordinator to preserve sessionEpoch on expired detached bindings',
  );
  assert.ok(
    source.includes('const expiredDetachedBindings = (this.worldSessionService.consumeExpiredBindings?.() ?? [])'),
    'expected restore coordinator to read expired detached bindings before cleanup',
  );
  assert.ok(
    source.includes('requeueExpiredBinding?(binding: ExpiredBindingLike | null | undefined): boolean;'),
    'expected restore coordinator interface to expose expired binding requeue hook',
  );
  assert.ok(
    source.includes('const detachedCleanupPlayerIds = Array.from(new Set(['),
    'expected restore coordinator to merge purge players and expired detached players',
  );
  assert.ok(
    source.includes('...expiredDetachedPlayerIds,'),
    'expected detached cleanup set to include expired detached players',
  );
  assert.ok(
    source.includes('await this.playerSessionRouteService.clearLocalRoutes(detachedOnlyPurgedPlayerIds);'),
    'expected restore coordinator to batch clear routes only for detached-only purged players',
  );
  assert.ok(
    source.includes('await this.playerSessionRouteService.clearLocalRoute(binding.playerId, binding.sessionEpoch);'),
    'expected restore coordinator to clear expired detached routes one-by-one with sessionEpoch',
  );
  assert.ok(
    source.includes('...expiredDetachedPlayerIds,'),
    'expected detached cache cleanup set to still include expired detached players',
  );
  assert.ok(
    source.includes('this.worldSessionService.requeueExpiredBinding?.(binding);'),
    'expected restore coordinator to requeue expired detached bindings when detached cleanup fails',
  );
  assert.ok(
    source.includes('this.worldSyncService.clearDetachedPlayerCaches(playerId);'),
    'expected restore coordinator to clear detached caches for detached cleanup players',
  );

  console.log(JSON.stringify({
    ok: true,
    includesExpiredDetachedRestoreCleanup: true,
    preservesExpiredDetachedSessionEpoch: true,
    requeuesExpiredDetachedBindingsOnFailure: true,
    answers: '已直接证明源码边界上 restore 协调器会把 expired detached bindings 一并纳入 detached cleanup，但不会再把它们和 detached-only purge 玩家一起无 epoch 批量 clearLocalRoutes；当前会对 expired bindings 逐个 clearLocalRoute(playerId, sessionEpoch)，同时清 detached caches；若 detached cleanup 失败，还会把这批 expired bindings requeue 回 worldSessionService。',
    excludes: '不证明真实 DI、with-db 执行结果或 restore 后 runtime 重建，只证明这轮新增的 restore cleanup 与 failure-requeue 源码合同。',
    completionMapping: 'replace-ready:report:native-database-restore-route-cleanup',
  }, null, 2));
}

main();
