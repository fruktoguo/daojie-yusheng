const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function main() {
  const gatewaySource = readToolTarget('../network/world.gateway.ts');
  const reaperSource = readToolTarget('../network/world-session-reaper.service.ts');

  const handleDisconnectBody = sliceFunctionBody(gatewaySource, 'async handleDisconnect(client)');
  assert.ok(handleDisconnectBody, 'expected to locate WorldGateway.handleDisconnect body');
  assert.equal(
    handleDisconnectBody.includes('clearLocalRoute('),
    false,
    'expected detached disconnect path to preserve local route during detach window',
  );

  const reaperBody = sliceFunctionBody(reaperSource, 'async reapExpiredSessions()');
  assert.ok(reaperBody, 'expected to locate WorldSessionReaperService.reapExpiredSessions body');
  assert.ok(
    reaperBody.includes('resolveRouteSessionEpoch(binding, this.playerRuntimeService.getPlayer?.(binding.playerId))'),
    'expected reaper to derive route sessionEpoch from binding fallback when runtime player is absent',
  );

  const flushIndex = reaperBody.indexOf('flushPlayer(binding.playerId)');
  const clearRouteIndex = reaperBody.indexOf('clearLocalRoute(binding.playerId, routeSessionEpoch)');
  const clearCacheIndex = reaperBody.indexOf('clearDetachedPlayerCaches(binding.playerId)');
  assert.ok(flushIndex >= 0, 'expected reaper to flush player before cleanup');
  assert.ok(clearRouteIndex >= 0, 'expected reaper to clear local route after flush');
  assert.ok(clearCacheIndex >= 0, 'expected reaper to clear detached caches after route cleanup');
  assert.ok(
    flushIndex < clearRouteIndex && clearRouteIndex < clearCacheIndex,
    'expected reaper cleanup order flush -> clearLocalRoute -> clearDetachedPlayerCaches',
  );

  console.log(JSON.stringify({
    ok: true,
    gatewayDisconnectPreservesDetachedRoute: true,
    reaperClearsRouteAfterFlush: true,
    reaperUsesBindingSessionEpochFallback: true,
    answers: '已直接证明源码边界上 detached 窗口内不会在 handleDisconnect 抢删本地 route，过期回收会按 flush -> clearLocalRoute(sessionEpoch) -> clearDetachedPlayerCaches 顺序执行；当 runtime player 已不在场时，reaper 也会回退使用 binding 中保存的 sessionEpoch 清 route。',
    excludes: '不证明真实 socket/bootstrap/with-db 执行结果，只证明本轮改动后的源码合同与调用顺序。',
    completionMapping: 'release:report:detached-route-cleanup',
  }, null, 2));
}

function readToolTarget(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

function sliceFunctionBody(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) {
    return '';
  }
  const braceStart = source.indexOf('{', start);
  if (braceStart < 0) {
    return '';
  }
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStart + 1, index);
      }
    }
  }
  return '';
}

main();
