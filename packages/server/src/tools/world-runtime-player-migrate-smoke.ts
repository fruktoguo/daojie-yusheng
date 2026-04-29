// @ts-nocheck

Object.defineProperty(exports, "__esModule", { value: true });

const assert = require('node:assert/strict');
const { WorldRuntimeService } = require('../runtime/world/world-runtime.service');

async function main() {
  const routeCalls = [];
  const flushCalls = [];
  const player = {
    playerId: 'player:route-handoff',
    sessionId: 'sid:route-handoff',
    sessionEpoch: 7,
    runtimeOwnerId: 'runtime:route-handoff:7',
    transferState: null,
    transferTargetNodeId: null,
  };

  const service = Object.create(WorldRuntimeService.prototype);
  service.playerPersistenceFlushService = {
    async flushPlayer(playerId) {
      flushCalls.push(playerId);
    },
  };
  service.playerRuntimeService = {
    getPlayer(playerId) {
      return playerId === player.playerId ? player : null;
    },
    beginTransfer(runtimePlayer, targetNodeId) {
      runtimePlayer.sessionEpoch = Math.max(1, Math.trunc(Number(runtimePlayer.sessionEpoch ?? 0)) + 1);
      runtimePlayer.runtimeOwnerId = `runtime:${runtimePlayer.playerId}:${runtimePlayer.sessionEpoch}`;
      runtimePlayer.transferState = 'in_transfer';
      runtimePlayer.transferTargetNodeId = targetNodeId;
    },
  };
  service.worldRuntimePlayerSessionService = {
    async assignPlayerRoute(input) {
      routeCalls.push({ ...input });
    },
  };

  const result = await service.migratePlayerToNode(player.playerId, 'node:remote');

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(flushCalls, ['player:route-handoff']);
  assert.equal(player.sessionEpoch, 8);
  assert.equal(player.transferState, 'in_transfer');
  assert.equal(player.transferTargetNodeId, 'node:remote');
  assert.deepEqual(routeCalls, [
    {
      playerId: 'player:route-handoff',
      nodeId: 'node:remote',
      sessionEpoch: 8,
      routeStatus: 'assigned',
    },
  ]);

  console.log(JSON.stringify({
    ok: true,
    case: 'world-runtime-player-migrate',
    flushCalls,
    answers: 'WorldRuntimeService.migratePlayerToNode 现已直接证明：会先 flushPlayer，再执行 beginTransfer() 递增 session_epoch，并把目标 node_id + 新 session_epoch 以 assigned 路由写入 player_session_route handoff 主链。',
    excludes: '不证明目标节点按新 session_epoch 完成 bootstrap 接管、真实跨节点 socket redirect 或 transfer 完成后的路由清理',
    completionMapping: 'replace-ready:proof:world-runtime.player-migrate-route',
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
