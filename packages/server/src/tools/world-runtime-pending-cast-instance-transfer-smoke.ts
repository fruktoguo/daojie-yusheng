// @ts-nocheck

/**
 * 用途：验证玩家地图实例迁移时，pending cast 会被静默清理，
 * 且写入结构化 `instance_transfer` 诊断；不发玩家通知、不回滚资源/冷却。
 *
 * 对应计划 §阶段 9：吟唱生命周期 / 地图实例迁移 pending cast 迁移策略。
 */

const assert = require('node:assert/strict');

const {
  CombatActionPhase,
  CombatActionSource,
  CombatEffectKind,
  CombatRejectReason,
  CombatTargetKind,
  WorldRuntimeCombatActionService,
} = require('../runtime/world/combat/world-runtime-combat-action.service');
const {
  WorldRuntimePlayerSkillDispatchService,
} = require('../runtime/world/combat/world-runtime-player-skill-dispatch.service');
const {
  WorldRuntimeTransferService,
} = require('../runtime/world/world-runtime-transfer.service');
const {
  CombatPendingCastCancelReason,
  CombatPendingCastStatus,
  createPlayerPendingCombatCast,
} = require('../runtime/combat/pending-combat-cast.helpers');

function createSkill() {
  return {
    id: 'skill:chant-transfer',
    name: '迁移吟唱术',
    cost: 5,
    cooldown: 3,
    range: 4,
    targetMode: 'entity',
    targeting: { shape: 'single', maxTargets: 1 },
    effects: [{ type: 'damage' }],
    playerCast: { windupTicks: 2, warningColor: '#ffaa00' },
    version: 3,
  };
}

function run() {
  const combatActionService = new WorldRuntimeCombatActionService();
  const attacker = {
    playerId: 'player:instance-transfer',
    instanceId: 'instance:src',
    x: 0,
    y: 0,
    qi: 100,
    attrs: { numericStats: { maxQiOutputPerTick: 999 }, ratioDivisors: {} },
    combat: { cooldownReadyTickBySkillId: {}, autoBattle: false },
    techniques: { techniques: [{ skills: [createSkill()] }] },
  };
  const dispatchService = new WorldRuntimePlayerSkillDispatchService(
    {
      getPlayer: (playerId) => playerId === attacker.playerId ? attacker : null,
      spendQi: (_playerId, amount) => { attacker.qi -= amount; },
      setSkillCooldownReadyTick: (_playerId, skillId, readyTick) => {
        attacker.combat.cooldownReadyTickBySkillId[skillId] = readyTick;
      },
      listPlayerSnapshots: () => [],
    },
    {},
    combatActionService,
  );

  // 触发 pending cast 起手。
  dispatchService.beginPlayerSkillCast(attacker, createSkill(), { x: 1, y: 0 }, 'monster:target', {
    resolveCurrentTickForPlayerId: () => 40,
    worldRuntimeNavigationService: { clearNavigationIntent: () => {} },
    pushActionLabelEffect: () => {},
    pushCombatEffect: () => {},
  });
  assert.equal(attacker.combat.pendingSkillCast.kind, 'combat_pending_cast');
  assert.equal(attacker.combat.pendingSkillCast.status, CombatPendingCastStatus.Casting);
  const committedQi = 100 - attacker.qi;
  assert.equal(committedQi, 5);
  assert.equal(attacker.combat.cooldownReadyTickBySkillId['skill:chant-transfer'], 43);

  // 模拟迁移 helper：手工调用 cancel 入口，不发玩家通知。
  const diagnostics = [];
  const notices = [];
  const cancelled = dispatchService.cancelPendingPlayerSkillCastForInstanceTransfer(attacker.playerId, {
    resolveCurrentTickForPlayerId: () => 41,
    combatDiagnostics: diagnostics,
    queuePlayerNotice: (playerId, text, kind) => notices.push({ playerId, text, kind }),
    logger: { debug: () => {}, warn: () => {}, log: () => {} },
  });

  assert.equal(cancelled, true);
  assert.equal(attacker.combat.pendingSkillCast, undefined);
  assert.equal(notices.length, 0, '实例迁移不应发送玩家通知');
  // 资源/冷却保持提交，不回滚。
  assert.equal(attacker.qi, 95);
  assert.equal(attacker.combat.cooldownReadyTickBySkillId['skill:chant-transfer'], 43);

  // 诊断应包含 instance_transfer 与 committed_no_refund / committed_no_rollback。
  const cancelDiagnostic = diagnostics.find((entry) => entry?.reason === CombatRejectReason.PendingCastCancelled);
  assert.ok(cancelDiagnostic, `expected PendingCastCancelled diagnostic, got ${JSON.stringify(diagnostics)}`);
  assert.equal(cancelDiagnostic.details?.cancelReason, CombatPendingCastCancelReason.InstanceTransfer);
  assert.equal(cancelDiagnostic.details?.resourcePolicy, 'committed_no_refund');
  assert.equal(cancelDiagnostic.details?.cooldownPolicy, 'committed_no_rollback');

  // 没有 pending cast 时 helper 应幂等返回 false。
  const second = dispatchService.cancelPendingPlayerSkillCastForInstanceTransfer(attacker.playerId, {});
  assert.equal(second, false);

  // 验证 WorldRuntimeTransferService.applyTransfer 会调用 cancel helper。
  const transferService = new WorldRuntimeTransferService();
  const calls = [];
  const source = {
    meta: { instanceId: 'instance:src' },
    disconnectPlayer: () => { calls.push('disconnectPlayer'); return true; },
    tick: 0,
  };
  const target = {
    meta: { instanceId: 'instance:dst' },
    connectPlayer: () => { calls.push('connectPlayer'); },
    setPlayerMoveSpeed: () => {},
    tick: 0,
  };
  attacker.combat.pendingSkillCast = createPlayerPendingCombatCast({
    playerId: attacker.playerId,
    instanceId: 'instance:src',
    skillId: 'skill:chant-transfer',
    anchor: { x: 1, y: 0 },
    targetRef: 'monster:target',
    warningCells: [{ x: 1, y: 0 }],
    remainingTicks: 2,
    qiCost: 5,
    startedTick: 40,
    resolveTick: 42,
    configRevision: 3,
  });
  const transferDiagnostics = [];
  transferService.applyTransfer({
    playerId: attacker.playerId,
    sessionId: 'session:1',
    fromInstanceId: 'instance:src',
    targetMapId: 'map:dst',
    targetInstanceId: 'instance:dst',
    targetX: 10,
    targetY: 10,
    reason: 'test',
  }, {
    getInstanceRuntime: (id) => id === 'instance:src' ? source : id === 'instance:dst' ? target : null,
    isInstanceLeaseWritable: () => true,
    playerRuntimeService: {
      getPlayer: (id) => id === attacker.playerId ? attacker : null,
      beginTransfer: () => {},
      completeTransfer: () => {},
    },
    worldRuntimePlayerSkillDispatchService: dispatchService,
    setPlayerLocation: () => {},
    getPlayerViewOrThrow: () => ({}),
    refreshPlayerContextActions: () => {},
    worldRuntimeNavigationService: { handleTransfer: () => {} },
    getOrCreateDefaultLineInstance: () => target,
    getOrCreatePublicInstance: () => target,
    combatDiagnostics: transferDiagnostics,
    resolveCurrentTickForPlayerId: () => 41,
    logger: { debug: () => {}, warn: () => {}, log: () => {} },
  });

  assert.equal(attacker.combat.pendingSkillCast, undefined, '迁移后 pending cast 应被清理');
  const transferCancel = transferDiagnostics.find((entry) => entry?.reason === CombatRejectReason.PendingCastCancelled);
  assert.ok(transferCancel, `expected PendingCastCancelled from applyTransfer, got ${JSON.stringify(transferDiagnostics)}`);
  assert.equal(transferCancel.details?.cancelReason, CombatPendingCastCancelReason.InstanceTransfer);

  console.log(JSON.stringify({
    ok: true,
    case: 'world-runtime-pending-cast-instance-transfer',
    answers: 'applyTransfer 前会静默清理玩家 pending cast，诊断 action=pending_cast_cancelled reason=instance_transfer，资源/冷却保持 committed_no_refund / committed_no_rollback，不发玩家通知',
    excludes: '不证明 Redis 跨进程恢复、不证明玩家重连时 pending cast 的恢复链',
  }, null, 2));
}

run();
