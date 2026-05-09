// @ts-nocheck

import assert from 'node:assert/strict';

import { installSmokeTimeout } from './smoke-timeout';
import {
  createMonsterPendingCombatCast,
  createPlayerPendingCombatCast,
  CombatPendingCastCancelReason,
} from '../runtime/combat/pending-combat-cast.helpers';
import {
  buildPendingCombatCastRedisKey,
  PendingCombatCastRestoreRejectReason,
  restorePendingCombatCastFromRedis,
  serializePendingCombatCastForRedis,
} from '../runtime/combat/pending-combat-cast-recovery.helpers';

installSmokeTimeout(__filename);

function main(): void {
  const cases = [
    verifyPlayerPendingCastRoundTrip(),
    verifyCrossNodeFencingRejectsStaleOwner(),
    verifyExpiredAndConfigMismatchCancel(),
    verifyMonsterPendingCastRoundTrip(),
  ];

  console.log(JSON.stringify({
    ok: true,
    case: 'pending-combat-cast-redis-recovery',
    cases,
    answers: '验证 pending cast Redis 记录格式、key、TTL、<1KB 预算、跨节点 owner/lease fencing、过期/配置变更取消策略；这是 Redis 接入前的恢复契约层 smoke',
    excludes: '不证明生产已有 Redis 客户端/provider，不证明玩家或怪物 pending cast 已在 tick 中真实写入 Redis',
  }, null, 2));
}

function verifyPlayerPendingCastRoundTrip() {
  const pendingCast = createPlayerPendingCombatCast({
    playerId: 'player:caster',
    instanceId: 'instance:a',
    skillId: 'skill:chant',
    targetRef: 'monster:target',
    anchor: { x: 3, y: 4 },
    warningCells: [{ x: 3, y: 4 }, { x: 4, y: 4 }],
    warningOrigin: { x: 3, y: 4 },
    remainingTicks: 2,
    qiCost: 7,
    startedTick: 10,
    resolveTick: 12,
    configRevision: 5,
    committedCooldownSnapshot: { actionId: 'skill:chant', readyTick: 18 },
  });
  const serialized = serializePendingCombatCastForRedis(pendingCast, {
    currentTick: 10,
    ownerNodeId: 'node:a',
    leaseToken: 'lease:1',
    instanceId: 'instance:a',
  });
  assert.equal(serialized.ok, true);
  assert.equal(serialized.key, 'combat:pending-cast:player:player:caster');
  assert.ok(serialized.ttlSeconds >= 30);
  assert.ok(serialized.byteLength > 0 && serialized.byteLength < 1024, `pending cast redis payload too large: ${serialized.byteLength}`);

  const restored = restorePendingCombatCastFromRedis(serialized.json, {
    actorKind: 'player',
    actorId: 'player:caster',
    instanceId: 'instance:a',
    ownerNodeId: 'node:a',
    leaseToken: 'lease:1',
    currentTick: 11,
    configRevision: 5,
    actorAlive: true,
  });
  assert.equal(restored.ok, true);
  assert.equal(restored.pendingCast.actionId, 'skill:chant');
  assert.equal(restored.pendingCast.remainingTicks, 2);
  assert.deepEqual(restored.pendingCast.warningCells, [{ x: 3, y: 4 }, { x: 4, y: 4 }]);
  assert.equal(restored.deleteRedisKey, false);

  return {
    name: 'player_round_trip',
    key: serialized.key,
    ttlSeconds: serialized.ttlSeconds,
    byteLength: serialized.byteLength,
  };
}

function verifyCrossNodeFencingRejectsStaleOwner() {
  const pendingCast = createPlayerPendingCombatCast({
    playerId: 'player:fenced',
    instanceId: 'instance:a',
    skillId: 'skill:chant',
    targetRef: 'monster:target',
    anchor: { x: 1, y: 2 },
    remainingTicks: 3,
    startedTick: 20,
    resolveTick: 23,
  });
  const serialized = serializePendingCombatCastForRedis(pendingCast, {
    currentTick: 20,
    ownerNodeId: 'node:old',
    leaseToken: 'lease:old',
  });
  const restored = restorePendingCombatCastFromRedis(serialized.record, {
    actorKind: 'player',
    actorId: 'player:fenced',
    instanceId: 'instance:a',
    ownerNodeId: 'node:new',
    leaseToken: 'lease:new',
    currentTick: 21,
  });
  assert.equal(restored.ok, false);
  assert.equal(restored.reason, PendingCombatCastRestoreRejectReason.FencingMismatch);
  assert.equal(restored.deleteRedisKey, false);
  return {
    name: 'fencing_reject',
    reason: restored.reason,
  };
}

function verifyExpiredAndConfigMismatchCancel() {
  const pendingCast = createPlayerPendingCombatCast({
    playerId: 'player:expired',
    instanceId: 'instance:a',
    skillId: 'skill:chant',
    targetRef: 'monster:target',
    anchor: { x: 5, y: 6 },
    remainingTicks: 1,
    startedTick: 30,
    resolveTick: 31,
    configRevision: 1,
  });
  const serialized = serializePendingCombatCastForRedis(pendingCast, {
    currentTick: 30,
    ownerNodeId: 'node:a',
    leaseToken: 'lease:1',
  });
  const expired = restorePendingCombatCastFromRedis(serialized.json, {
    actorKind: 'player',
    actorId: 'player:expired',
    instanceId: 'instance:a',
    ownerNodeId: 'node:a',
    leaseToken: 'lease:1',
    currentTick: 32,
  });
  assert.equal(expired.ok, false);
  assert.equal(expired.reason, PendingCombatCastRestoreRejectReason.Expired);
  assert.equal(expired.cancelAction.cancelReason, CombatPendingCastCancelReason.Expired);

  const configMismatch = restorePendingCombatCastFromRedis(serialized.json, {
    actorKind: 'player',
    actorId: 'player:expired',
    instanceId: 'instance:a',
    ownerNodeId: 'node:a',
    leaseToken: 'lease:1',
    currentTick: 31,
    configRevision: 2,
  });
  assert.equal(configMismatch.ok, false);
  assert.equal(configMismatch.reason, PendingCombatCastRestoreRejectReason.ConfigRevisionMismatch);
  assert.equal(configMismatch.cancelAction.cancelReason, CombatPendingCastCancelReason.ConfigRevisionMismatch);
  return {
    name: 'cancel_on_restore',
    expiredReason: expired.cancelAction.cancelReason,
    configReason: configMismatch.cancelAction.cancelReason,
  };
}

function verifyMonsterPendingCastRoundTrip() {
  const pendingCast = createMonsterPendingCombatCast({
    runtimeId: 'monster:caster',
    instanceId: 'instance:m',
    skillId: 'skill:monster-chant',
    targetPlayerId: 'player:target',
    anchor: { x: 8, y: 9 },
    warningCells: [{ x: 8, y: 9 }],
    remainingTicks: 1,
    startedTick: 40,
    resolveTick: 41,
    configRevision: 9,
  });
  const serialized = serializePendingCombatCastForRedis(pendingCast, {
    currentTick: 40,
    ownerNodeId: 'node:m',
    leaseToken: 'lease:m',
  });
  assert.equal(buildPendingCombatCastRedisKey({ pendingCast }), 'combat:pending-cast:monster:monster:caster');
  const restored = restorePendingCombatCastFromRedis(serialized.record, {
    actorKind: 'monster',
    actorId: 'monster:caster',
    instanceId: 'instance:m',
    ownerNodeId: 'node:m',
    leaseToken: 'lease:m',
    currentTick: 40,
    configRevision: 9,
  });
  assert.equal(restored.ok, true);
  assert.equal(restored.pendingCast.targetPlayerId, 'player:target');
  return {
    name: 'monster_round_trip',
    key: serialized.key,
    byteLength: serialized.byteLength,
  };
}

main();
