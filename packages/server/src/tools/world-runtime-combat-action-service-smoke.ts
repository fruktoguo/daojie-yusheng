// @ts-nocheck

const assert = require('node:assert/strict');

const {
  COMBAT_AOI_RESULT_FIELD_BUDGET,
  COMBAT_PROTOCOL_LAYER_SPECS,
  estimateCombatAoiResultEventFieldCount,
} = require('@mud/shared');
const {
  CombatActionPhase,
  CombatActionSource,
  CombatEffectKind,
  CombatRejectReason,
  CombatTargetKind,
  WorldRuntimeCombatActionService,
} = require('../runtime/world/combat/world-runtime-combat-action.service');
const {
  cancelPendingCombatCast,
  CombatPendingCastCancelReason,
  CombatPendingCastStatus,
  createCombatActionFromPendingCast,
  createMonsterPendingCombatCast,
  createMonsterSkillActionFromPendingCast,
  createPlayerPendingCombatCast,
  createPlayerSkillActionFromPendingCast,
  resolvePendingCombatCastCancellation,
} = require('../runtime/combat/pending-combat-cast.helpers');
const {
  createCombatOutcomeApplyAdapters,
} = require('../runtime/combat/combat-outcome-apply-adapters');
const {
  aggregateCombatDiagnostics,
  buildCombatAuditHeatmap,
  queryMonsterSkillFailureReasons,
  queryRecentCombatAuditEvents,
} = require('../runtime/combat/combat-event-query');
const { WorldRuntimeMonsterActionApplyService } = require('../runtime/world/combat/world-runtime-monster-action-apply.service');
const { WorldRuntimePlayerSkillDispatchService } = require('../runtime/world/combat/world-runtime-player-skill-dispatch.service');

async function run() {
  const service = new WorldRuntimeCombatActionService();
  const diagnostics = [];
  const logs = [];
  const deps = {
    combatDiagnostics: diagnostics,
    logger: {
      warn: (message) => logs.push(['warn', message]),
      debug: (message) => logs.push(['debug', message]),
      log: (message) => logs.push(['log', message]),
    },
  };
  const action = {
    kind: 'skill',
    instanceId: 'instance:test',
    runtimeId: 'monster:1',
    targetPlayerId: 'player:1',
    skillId: 'monster:test_skill',
    targetX: 12,
    targetY: 8,
    warningCells: [{ x: 12, y: 8 }],
  };

  const normalized = service.createMonsterAction(action, CombatActionPhase.ChantResolve);
  assert.equal(normalized.actor.kind, 'monster');
  assert.equal(normalized.actor.id, 'monster:1');
  assert.equal(normalized.kind, 'skill');
  assert.equal(normalized.source, 'monster_ai');
  assert.equal(normalized.instanceId, 'instance:test');
  assert.deepEqual(normalized.anchor, { x: 12, y: 8 });
  assert.equal(normalized.warningCells.length, 1);

  const playerPending = createPlayerPendingCombatCast({
    playerId: 'player:caster',
    instanceId: 'instance:test',
    skillId: 'skill:chant',
    anchor: { x: 3, y: 4 },
    targetRef: 'monster:target',
    warningCells: [{ x: 3, y: 4 }],
    warningOrigin: { x: 2, y: 4 },
    remainingTicks: 2,
    qiCost: 7,
    warningColor: '#ff9a30',
    startedTick: 10,
    resolveTick: 12,
    committedCooldownSnapshot: { actionId: 'skill:chant', readyTick: 20 },
    configRevision: 5,
  });
  assert.equal(playerPending.kind, 'combat_pending_cast');
  assert.equal(playerPending.actorKind, 'player');
  assert.equal(playerPending.actorId, 'player:caster');
  assert.equal(playerPending.source, CombatActionSource.PlayerInput);
  assert.equal(playerPending.actionKind, 'skill');
  assert.equal(playerPending.actionId, 'skill:chant');
  assert.deepEqual(playerPending.anchor, { x: 3, y: 4 });
  assert.deepEqual(playerPending.warningCells, [{ x: 3, y: 4 }]);
  assert.equal(playerPending.startedTick, 10);
  assert.equal(playerPending.resolveTick, 12);
  assert.equal(playerPending.remainingTicks, 2);
  assert.equal(playerPending.qiCost, 7);
  assert.equal(playerPending.committedCooldownSnapshot.readyTick, 20);
  assert.equal(playerPending.configRevision, 5);
  const playerPendingAction = createPlayerSkillActionFromPendingCast(playerPending);
  assert.equal(playerPendingAction.phase, CombatActionPhase.ChantResolve);
  assert.equal(playerPendingAction.actor.kind, 'player');
  assert.equal(playerPendingAction.actor.id, 'player:caster');
  assert.deepEqual(playerPendingAction.target, { kind: CombatTargetKind.Monster, id: 'target' });
  assert.deepEqual(playerPendingAction.anchor, { x: 3, y: 4 });
  const cancelledPlayerPending = cancelPendingCombatCast(playerPending, {
    reason: CombatPendingCastCancelReason.Interrupted,
    message: 'player_moved',
    cancelledTick: 11,
  });
  assert.equal(cancelledPlayerPending.status, CombatPendingCastStatus.Cancelled);
  assert.equal(cancelledPlayerPending.cancelReason, CombatPendingCastCancelReason.Interrupted);
  assert.equal(cancelledPlayerPending.remainingTicks, 0);
  assert.equal(cancelledPlayerPending.cancellation.resourcePolicy, 'committed_no_refund');
  assert.equal(cancelledPlayerPending.cancellation.cooldownPolicy, 'committed_no_rollback');
  const cancelledPlayerPendingAction = createPlayerSkillActionFromPendingCast(cancelledPlayerPending, {
    phase: CombatActionPhase.Cancel,
  });
  assert.equal(cancelledPlayerPendingAction.phase, CombatActionPhase.Cancel);
  const actorDeadCancellation = resolvePendingCombatCastCancellation(playerPending, {
    actorAlive: false,
    cancelledTick: 12,
  });
  assert.equal(actorDeadCancellation.cancelReason, CombatPendingCastCancelReason.ActorDead);
  const expiredCancellation = resolvePendingCombatCastCancellation({
    ...playerPending,
    remainingTicks: 1,
    resolveTick: 10,
  }, {
    currentTick: 12,
  });
  assert.equal(expiredCancellation.cancelReason, CombatPendingCastCancelReason.Expired);
  const revisionCancellation = resolvePendingCombatCastCancellation(playerPending, {
    configRevision: 6,
  });
  assert.equal(revisionCancellation.cancelReason, CombatPendingCastCancelReason.ConfigRevisionMismatch);

  const beginCastAttacker = {
    playerId: 'player:begin-chant',
    instanceId: 'instance:test',
    x: 0,
    y: 0,
    qi: 100,
    attrs: { numericStats: { maxQiOutputPerTick: 999 }, ratioDivisors: {} },
    combat: { cooldownReadyTickBySkillId: {}, autoBattle: false },
  };
  const beginCastDispatch = new WorldRuntimePlayerSkillDispatchService(
    {
      getPlayer: (playerId) => playerId === beginCastAttacker.playerId ? beginCastAttacker : null,
      spendQi: (playerId, amount) => {
        assert.equal(playerId, beginCastAttacker.playerId);
        beginCastAttacker.qi -= amount;
      },
      setSkillCooldownReadyTick: (playerId, skillId, readyTick) => {
        assert.equal(playerId, beginCastAttacker.playerId);
        beginCastAttacker.combat.cooldownReadyTickBySkillId[skillId] = readyTick;
      },
      listPlayerSnapshots: () => [],
    },
    {},
    service,
  );
  beginCastDispatch.beginPlayerSkillCast(beginCastAttacker, {
    id: 'skill:begin-chant',
    name: '起手吟唱术',
    cost: 5,
    cooldown: 3,
    range: 4,
    targetMode: 'entity',
    targeting: { shape: 'single', maxTargets: 1 },
    effects: [{ type: 'damage' }],
    playerCast: { windupTicks: 2, warningColor: '#ffaa00' },
    version: 9,
  }, { x: 1, y: 0 }, 'monster:target', {
    resolveCurrentTickForPlayerId: () => 40,
    worldRuntimeNavigationService: { clearNavigationIntent: () => {} },
    pushActionLabelEffect: () => {},
    pushCombatEffect: () => {},
  });
  assert.equal(beginCastAttacker.combat.pendingSkillCast.kind, 'combat_pending_cast');
  assert.equal(beginCastAttacker.combat.pendingSkillCast.actionId, 'skill:begin-chant');
  assert.equal(beginCastAttacker.combat.pendingSkillCast.actorId, beginCastAttacker.playerId);
  assert.deepEqual(beginCastAttacker.combat.pendingSkillCast.anchor, { x: 1, y: 0 });
  assert.equal(beginCastAttacker.combat.pendingSkillCast.startedTick, 40);
  assert.equal(beginCastAttacker.combat.pendingSkillCast.resolveTick, 43);
  assert.equal(beginCastAttacker.combat.pendingSkillCast.committedResourceSnapshot.spent, 5);
  assert.equal(beginCastAttacker.combat.pendingSkillCast.committedCooldownSnapshot.readyTick, 43);
  assert.equal(beginCastAttacker.combat.pendingSkillCast.configRevision, 9);
  const interruptDiagnostics = [];
  const interruptNotices = [];
  const interrupted = beginCastDispatch.interruptPendingPlayerSkillCast(beginCastAttacker.playerId, 'player_moved', {
    resolveCurrentTickForPlayerId: () => 41,
    combatDiagnostics: interruptDiagnostics,
    queuePlayerNotice: (playerId, text, kind) => interruptNotices.push({ playerId, text, kind }),
    logger: { debug: () => {}, warn: () => {}, log: () => {} },
  });
  assert.equal(interrupted, true);
  assert.equal(beginCastAttacker.combat.pendingSkillCast, undefined);
  assert.equal(interruptDiagnostics.length, 1);
  assert.equal(interruptDiagnostics[0].phase, CombatActionPhase.Cancel);
  assert.equal(interruptDiagnostics[0].reason, CombatRejectReason.PendingCastCancelled);
  assert.equal(interruptDiagnostics[0].details.cancelReason, CombatPendingCastCancelReason.Interrupted);
  assert.equal(interruptNotices.length, 1);
  assert.equal(interruptNotices[0].kind, 'combat');

  const expiredPendingPlayer = {
    playerId: 'player:expired-chant',
    name: '过期吟唱者',
    instanceId: 'instance:test',
    x: 0,
    y: 0,
    hp: 100,
    combat: {
      pendingSkillCast: createPlayerPendingCombatCast({
        playerId: 'player:expired-chant',
        instanceId: 'instance:test',
        skillId: 'skill:expired-chant',
        anchor: { x: 1, y: 0 },
        remainingTicks: 2,
        startedTick: 10,
        resolveTick: 11,
      }),
    },
    techniques: { techniques: [] },
  };
  const expiredDiagnostics = [];
  const expiredNotices = [];
  const expiredDispatch = new WorldRuntimePlayerSkillDispatchService(
    {
      getPlayer: (playerId) => (playerId === expiredPendingPlayer.playerId ? expiredPendingPlayer : null),
      listPlayerSnapshots: () => [],
    },
    {},
    service,
  );
  const resolvedExpiredPending = await expiredDispatch.resolvePendingPlayerSkillCast(expiredPendingPlayer.playerId, {
    resolveCurrentTickForPlayerId: () => 12,
    combatDiagnostics: expiredDiagnostics,
    queuePlayerNotice: (playerId, text, kind) => expiredNotices.push({ playerId, text, kind }),
    logger: { debug: () => {}, warn: () => {}, log: () => {} },
  });
  assert.equal(resolvedExpiredPending, true);
  assert.equal(expiredPendingPlayer.combat.pendingSkillCast, undefined);
  assert.equal(expiredDiagnostics.length, 1);
  assert.equal(expiredDiagnostics[0].phase, CombatActionPhase.Cancel);
  assert.equal(expiredDiagnostics[0].reason, CombatRejectReason.PendingCastExpired);
  assert.equal(expiredDiagnostics[0].details.cancelReason, CombatPendingCastCancelReason.Expired);
  assert.equal(expiredNotices.length, 1);
  assert.equal(expiredNotices[0].kind, 'combat');

  const revisionPendingPlayer = {
    playerId: 'player:revision-chant',
    name: '版本吟唱者',
    instanceId: 'instance:test',
    x: 0,
    y: 0,
    hp: 100,
    combat: {
      pendingSkillCast: createPlayerPendingCombatCast({
        playerId: 'player:revision-chant',
        instanceId: 'instance:test',
        skillId: 'skill:revision-chant',
        anchor: { x: 1, y: 0 },
        remainingTicks: 1,
        startedTick: 20,
        resolveTick: 21,
        configRevision: 1,
      }),
    },
    techniques: {
      techniques: [{
        skills: [{
          id: 'skill:revision-chant',
          name: '版本吟唱术',
          range: 2,
          targetMode: 'entity',
          targeting: { shape: 'single', maxTargets: 1 },
          effects: [{ type: 'damage' }],
          version: 2,
        }],
      }],
    },
  };
  const revisionDiagnostics = [];
  const revisionNotices = [];
  const revisionDispatch = new WorldRuntimePlayerSkillDispatchService(
    {
      getPlayer: (playerId) => (playerId === revisionPendingPlayer.playerId ? revisionPendingPlayer : null),
      listPlayerSnapshots: () => [],
    },
    {},
    service,
  );
  const resolvedRevisionPending = await revisionDispatch.resolvePendingPlayerSkillCast(revisionPendingPlayer.playerId, {
    resolveCurrentTickForPlayerId: () => 21,
    combatDiagnostics: revisionDiagnostics,
    queuePlayerNotice: (playerId, text, kind) => revisionNotices.push({ playerId, text, kind }),
    logger: { debug: () => {}, warn: () => {}, log: () => {} },
    pushActionLabelEffect: () => {},
  });
  assert.equal(resolvedRevisionPending, true);
  assert.equal(revisionPendingPlayer.combat.pendingSkillCast, undefined);
  assert.equal(revisionDiagnostics.length, 1);
  assert.equal(revisionDiagnostics[0].phase, CombatActionPhase.Cancel);
  assert.equal(revisionDiagnostics[0].reason, CombatRejectReason.PendingCastConfigRevisionMismatch);
  assert.equal(revisionDiagnostics[0].details.cancelReason, CombatPendingCastCancelReason.ConfigRevisionMismatch);
  assert.equal(revisionDiagnostics[0].details.expectedConfigRevision, 2);
  assert.equal(revisionDiagnostics[0].details.pendingConfigRevision, 1);
  assert.equal(revisionNotices.length, 1);
  assert.equal(revisionNotices[0].kind, 'combat');

  const monsterPending = createMonsterPendingCombatCast({
    runtimeId: 'monster:caster',
    instanceId: 'instance:test',
    skillId: 'monster:chant',
    targetPlayerId: 'player:target',
    anchor: { x: 12, y: 8 },
    warningCells: [{ x: 12, y: 8 }],
    warningOrigin: { x: 10, y: 8 },
    remainingTicks: 1,
    warningColor: '#aa5500',
    startedTick: 30,
    committedCooldownSnapshot: { actionId: 'monster:chant', readyTick: 38 },
  });
  assert.equal(monsterPending.kind, 'combat_pending_cast');
  assert.equal(monsterPending.actorKind, 'monster');
  assert.equal(monsterPending.actorId, 'monster:caster');
  assert.equal(monsterPending.source, 'monster_ai');
  assert.equal(monsterPending.targetRef, 'player:target');
  const monsterPendingAction = createCombatActionFromPendingCast(monsterPending);
  assert.equal(monsterPendingAction.phase, CombatActionPhase.ChantResolve);
  assert.equal(monsterPendingAction.actor.kind, 'monster');
  assert.equal(monsterPendingAction.target.id, 'player:target');
  const legacyMonsterAction = createMonsterSkillActionFromPendingCast(monsterPending);
  assert.equal(legacyMonsterAction.kind, 'skill');
  assert.equal(legacyMonsterAction.skillId, 'monster:chant');
  assert.equal(legacyMonsterAction.targetPlayerId, 'player:target');
  assert.deepEqual(legacyMonsterAction.warningCells, [{ x: 12, y: 8 }]);
  assert.equal(legacyMonsterAction.combatAction.actionId, 'monster:chant');

  const reject = service.recordMonsterActionReject(
    deps,
    action,
    CombatRejectReason.NoRuntimeTargetsInWarningCells,
    { warningCellCount: 1 },
    { severity: 'debug' },
  );
  assert.equal(reject.ok, false);
  assert.equal(reject.reason, CombatRejectReason.NoRuntimeTargetsInWarningCells);
  assert.equal(reject.phase, CombatActionPhase.ChantResolve);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].reason, CombatRejectReason.NoRuntimeTargetsInWarningCells);
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], 'debug');
  assert.equal(logs[0][1].includes('actor=monster:monster:1'), true);
  assert.equal(logs[0][1].includes('action=monster:test_skill'), true);
  assert.equal(logs[0][1].includes('instance=instance:test'), true);
  assert.equal(logs[0][1].includes('phase=chant_resolve'), true);
  assert.equal(logs[0][1].includes('target_count=1'), true);

  const recordedByRuntime = [];
  const runtimeDeps = {
    recordCombatDiagnostic: (entry) => recordedByRuntime.push(entry),
    logger: deps.logger,
  };
  service.recordMonsterActionReject(
    runtimeDeps,
    action,
    CombatRejectReason.MissingRuntimeTargetPosition,
    {},
    { log: false },
  );
  assert.equal(recordedByRuntime.length, 1);
  assert.equal(recordedByRuntime[0].reason, CombatRejectReason.MissingRuntimeTargetPosition);

  const outcomes = [];
  const combatEvents = [];
  const outcome = service.recordMonsterActionOutcome({
    combatOutcomes: outcomes,
    combatEvents,
  }, action, { kind: 'player', id: 'player:1' }, {
    damage: 0,
    dodged: true,
  }, { buildEvents: true, eventContext: { playerId: 'player:1', tags: ['smoke'] } });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.phase, CombatActionPhase.ChantResolve);
  assert.equal(outcomes.length, 1);
  assert.equal(combatEvents.length, 1);
  assert.equal(combatEvents[0].aoiEvent.result, 'dodged');
  assert.equal(combatEvents[0].auditEvent.application.targetKind, CombatTargetKind.Player);
  assert.equal(outcomes[0].result.dodged, true);
  assert.equal(outcomes[0].result.outcomeResult, 'dodged');
  assert.equal(outcomes[0].result.effects.length, 1);
  assert.equal(outcomes[0].result.effects[0].kind, CombatEffectKind.Damage);
  assert.equal(outcomes[0].result.effects[0].damage, 0);
  assert.equal(outcomes[0].result.effects[0].dodged, true);
  assert.equal(outcomes[0].application.targetKind, CombatTargetKind.Player);
  assert.equal(outcomes[0].application.writesDatabaseInTick, false);
  assert.equal(outcomes[0].application.appliesOnlySettledOutcome, true);
  assert.deepEqual(outcomes[0].application.dirtyDomains, ['player:vitals']);

  const runtimeEventCountBefore = service.listCombatEvents(200).length;
  const runtimeEventOutcome = service.recordMonsterActionOutcome({
  }, action, { kind: 'player', id: 'player:runtime_sink' }, {
    damage: 5,
    rawDamage: 5,
  }, { log: false, eventContext: { playerId: 'player:runtime_sink', tags: ['runtime-sink'] } });
  assert.equal(runtimeEventOutcome.ok, true);
  const listedRuntimeEvents = service.listCombatEvents(1);
  assert.equal(service.listCombatEvents(200).length, runtimeEventCountBefore + 1);
  assert.equal(listedRuntimeEvents[0].aoiEvent.result, 'hit');
  assert.equal(listedRuntimeEvents[0].auditEvent.application.targetKind, CombatTargetKind.Player);
  assert.equal(service.queryRecentCombatAuditEvents({ playerId: 'player:runtime_sink' }).length, 1);

  const damageEffect = service.createDamageEffectResult({
    damage: 13.4,
    rawDamage: 20,
    damageKind: 'spell',
    element: 'fire',
    crit: true,
  });
  assert.equal(damageEffect.kind, CombatEffectKind.Damage);
  assert.equal(damageEffect.damage, 13);
  assert.equal(damageEffect.rawDamage, 20);
  assert.equal(damageEffect.damageKind, 'spell');
  assert.equal(damageEffect.element, 'fire');
  assert.equal(damageEffect.crit, true);

  const resolvedEffects = service.resolveCombatEffects({
    definition: {
      effects: [
        { type: CombatEffectKind.Damage, damageKind: 'spell' },
        { type: CombatEffectKind.Buff, buffId: 'buff:test' },
        { type: CombatEffectKind.Heal },
        { type: CombatEffectKind.Cleanse },
      ],
    },
    result: {
      damage: 7,
      rawDamage: 9,
      heal: 3,
      buffApplied: true,
      buffId: 'buff:test',
      cleansed: true,
      cleanseCount: 2,
    },
  });
  assert.equal(resolvedEffects.some((effect) => effect.kind === CombatEffectKind.Damage && effect.damage === 7), true);
  assert.equal(resolvedEffects.some((effect) => effect.kind === CombatEffectKind.Buff && effect.buffId === 'buff:test'), true);
  assert.equal(resolvedEffects.some((effect) => effect.kind === CombatEffectKind.Heal && effect.amount === 3), true);
  assert.equal(resolvedEffects.some((effect) => effect.kind === CombatEffectKind.Cleanse && effect.count === 2), true);

  const resistedOutcome = service.recordOutcome({ combatEvents: [] }, {
    phase: CombatActionPhase.Instant,
    actor: { kind: 'monster', id: 'monster:1' },
    actionId: 'skill:resist',
    instanceId: 'instance:test',
    target: { kind: CombatTargetKind.Player, id: 'player:resist' },
    result: {
      damage: 0,
      resolved: true,
      immune: true,
      blocked: true,
    },
  }, { buildEvents: true, eventContext: { playerId: 'player:resist', tags: ['resist'] } });
  assert.equal(resistedOutcome.result.outcomeResult, 'immune');
  assert.equal(resistedOutcome.result.immune, true);
  assert.equal(resistedOutcome.result.resisted, true);
  assert.equal(resistedOutcome.result.blocked, true);
  assert.equal(resistedOutcome.result.effects.some((effect) => effect.kind === CombatEffectKind.Immune), true);
  assert.equal(resistedOutcome.result.effects.some((effect) => effect.kind === CombatEffectKind.Resist), true);
  assert.equal(resistedOutcome.result.effects.some((effect) => effect.kind === CombatEffectKind.Block), true);

  const events = service.buildCombatEvents(outcome, { playerId: 'player:1', tags: ['smoke'] });
  assert.equal(events.aoiEvent.type, 'combat_result');
  assert.equal(COMBAT_PROTOCOL_LAYER_SPECS.world_delta_fx.delivery, 'aoi');
  assert.equal(COMBAT_PROTOCOL_LAYER_SPECS.notice.delivery, 'unicast');
  assert.equal(COMBAT_PROTOCOL_LAYER_SPECS.audit_internal.channel, 'internal');
  assert.equal(COMBAT_PROTOCOL_LAYER_SPECS.diagnostic_internal.channel, 'internal');
  assert.equal(estimateCombatAoiResultEventFieldCount(events.aoiEvent) <= COMBAT_AOI_RESULT_FIELD_BUDGET, true);
  assert.equal(events.aoiEvent.result, 'dodged');
  assert.equal(events.notificationEvent.type, 'combat_notice');
  assert.equal(events.notificationEvent.kind, 'combat');
  assert.equal(events.auditEvent.type, 'combat_audit');
  assert.deepEqual(events.auditEvent.tags, ['smoke']);
  assert.equal(events.diagnosticEvent, null);

  const rejectEvents = service.buildCombatEvents(reject, { severity: 'warn' });
  assert.equal(rejectEvents.aoiEvent, null);
  assert.equal(rejectEvents.notificationEvent, null);
  assert.equal(rejectEvents.auditEvent, null);
  assert.equal(rejectEvents.diagnosticEvent.type, 'combat_diagnostic');
  assert.equal(rejectEvents.diagnosticEvent.reason, CombatRejectReason.NoRuntimeTargetsInWarningCells);

  const rejectCombatEvents = [];
  service.recordMonsterActionReject({
    combatEvents: rejectCombatEvents,
    logger: deps.logger,
  }, action, CombatRejectReason.MissingTarget, {}, { log: false });
  assert.equal(rejectCombatEvents.length, 1);
  assert.equal(rejectCombatEvents[0].aoiEvent, null);
  assert.equal(rejectCombatEvents[0].notificationEvent, null);
  assert.equal(rejectCombatEvents[0].auditEvent, null);
  assert.equal(rejectCombatEvents[0].diagnosticEvent.reason, CombatRejectReason.MissingTarget);

  const explainLog = [];
  const explainPlayer = {
    playerId: 'player:1',
    instanceId: 'instance:test',
    hp: 100,
  };
  const explainInstance = {
    getMonster: () => ({
      runtimeId: 'monster:1',
      alive: true,
      x: 10,
      y: 10,
      attackRange: 2,
    }),
    getPlayerPosition: () => ({ x: 11, y: 10 }),
    canSeeTileFrom: () => true,
  };
  const explain = service.explainMonsterBasicAttack({
    action: {
      kind: 'basic',
      instanceId: 'instance:test',
      runtimeId: 'monster:1',
      targetPlayerId: 'player:1',
    },
    deps: {
      getPlayerLocation: (playerId) => {
        explainLog.push(['getPlayerLocation', playerId]);
        return { instanceId: 'instance:test', x: 11, y: 10 };
      },
      getInstanceRuntime: (instanceId) => {
        explainLog.push(['getInstanceRuntime', instanceId]);
        return explainInstance;
      },
    },
    playerRuntimeService: {
      getPlayer: () => explainPlayer,
    },
  });
  assert.equal(explain.ok, true);
  assert.equal(explain.targetCount, 1);
  assert.equal(explain.targets[0].id, 'player:1');
  assert.equal(explainLog.some((entry) => entry[0] === 'getPlayerLocation'), true);

  const basicAction = service.createPlayerBasicAttackAction({
    playerId: 'player:attacker',
    targetMonsterId: 'monster:target',
  });
  assert.equal(basicAction.actor.kind, 'player');
  assert.equal(basicAction.kind, 'basic_attack');
  assert.equal(basicAction.target.kind, 'monster');

  const skillAction = service.createPlayerSkillAction({
    playerId: 'player:attacker',
    skillId: 'skill:test',
    targetRef: 'tile:12:8',
  });
  assert.equal(skillAction.actionId, 'skill:test');
  assert.equal(skillAction.kind, 'skill');
  assert.equal(skillAction.target.kind, 'tile');

  const basicDefinition = service.resolveActionDefinition({
    action: basicAction,
    actor: {
      attackRange: 2,
      attackCooldownTicks: 3,
    },
  });
  assert.equal(basicDefinition.ok, true);
  assert.equal(basicDefinition.definition.actionId, 'basic_attack');
  assert.equal(basicDefinition.definition.kind, 'basic_attack');
  assert.equal(basicDefinition.definition.range, 2);
  assert.equal(basicDefinition.definition.cooldownTicks, 3);
  assert.equal(basicDefinition.definition.geometry.shape, 'single');
  assert.equal(basicDefinition.definition.allowedTargetKinds.includes(CombatTargetKind.Monster), true);

  const playerSkillDefinition = service.resolveActionDefinition({
    action: skillAction,
    player: {
      techniques: {
        techniques: [{
          skills: [{
            id: 'skill:test',
            name: '测试术',
            cost: 4,
            cooldown: 7,
            range: 5,
            targetMode: 'any',
            targeting: {
              shape: 'line',
              width: 2,
              maxTargets: 4,
            },
            effects: [{ type: 'damage', damageKind: 'spell' }],
          }],
        }],
      },
    },
  });
  assert.equal(playerSkillDefinition.ok, true);
  assert.equal(playerSkillDefinition.definition.actionId, 'skill:test');
  assert.equal(playerSkillDefinition.definition.name, '测试术');
  assert.equal(playerSkillDefinition.definition.range, 5);
  assert.equal(playerSkillDefinition.definition.geometry.shape, 'line');
  assert.equal(playerSkillDefinition.definition.geometry.width, 2);
  assert.equal(playerSkillDefinition.definition.cost.qi, 4);
  assert.equal(playerSkillDefinition.definition.cooldownTicks, 7);
  assert.equal(playerSkillDefinition.definition.maxTargets, 4);
  assert.equal(playerSkillDefinition.definition.effects[0].type, 'damage');

  const playerSkillCells = service.computeCombatTargetCells({
    action: playerSkillDefinition.action,
    definition: playerSkillDefinition.definition,
    origin: { x: 10, y: 8 },
    anchor: { x: 12, y: 8 },
  });
  assert.equal(playerSkillCells.ok, true);
  assert.equal(playerSkillCells.cells.some((cell) => cell.x === 12 && cell.y === 8), true);
  assert.equal(playerSkillCells.cells.some((cell) => cell.x === 10 && cell.y === 8), false);

  const monsterSkillAction = service.createMonsterAction({
    kind: 'skill',
    instanceId: 'instance:test',
    runtimeId: 'monster:1',
    targetPlayerId: 'player:1',
    skillId: 'monster:test_skill',
  });
  const monsterSkillDefinition = service.resolveActionDefinition({
    action: monsterSkillAction,
    monster: {
      skills: [{
        id: 'monster:test_skill',
        name: '妖术',
        cost: { qi: 2 },
        cooldown: { ticks: 5 },
        range: 4,
        targeting: { shape: 'box', width: 3, height: 2 },
        monsterCast: { windupTicks: 1 },
        effects: [{ type: 'buff', buffId: 'buff:test' }],
      }],
    },
  });
  assert.equal(monsterSkillDefinition.ok, true);
  assert.equal(monsterSkillDefinition.definition.actionId, 'monster:test_skill');
  assert.equal(monsterSkillDefinition.definition.geometry.shape, 'box');
  assert.equal(monsterSkillDefinition.definition.maxTargets, 6);
  assert.equal(monsterSkillDefinition.definition.windupTicks, 1);
  assert.equal(monsterSkillDefinition.definition.effects[0].buffId, 'buff:test');

  const monsterSkillCells = service.computeCombatTargetCells({
    action: monsterSkillDefinition.action,
    definition: monsterSkillDefinition.definition,
    origin: { x: 10, y: 10 },
    anchor: { x: 12, y: 10 },
  });
  assert.equal(monsterSkillCells.ok, true);
  assert.equal(monsterSkillCells.cellCount, 6);
  assert.equal(monsterSkillCells.cells.some((cell) => cell.x === 12 && cell.y === 10), true);

  const missingSkillDefinition = service.resolveActionDefinition({
    action: service.createPlayerSkillAction({
      playerId: 'player:attacker',
      skillId: 'skill:missing',
    }),
    player: { techniques: { techniques: [] } },
  });
  assert.equal(missingSkillDefinition.ok, false);
  assert.equal(missingSkillDefinition.reason, CombatRejectReason.MissingSkill);

  const dryRun = service.explainCombatAction({
    action: playerSkillDefinition.action,
    player: {
      techniques: {
        techniques: [{
          skills: [playerSkillDefinition.definition.raw],
        }],
      },
    },
    targets: [{ kind: CombatTargetKind.Tile, x: 12, y: 8 }],
  });
  assert.equal(dryRun.ok, true);
  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRun.targetCount, 1);
  assert.equal(dryRun.definition.actionId, 'skill:test');

  const dryRunMissingTarget = service.explainCombatAction({
    action: playerSkillDefinition.action,
    player: {
      techniques: {
        techniques: [{
          skills: [playerSkillDefinition.definition.raw],
        }],
      },
    },
    targets: [],
  });
  assert.equal(dryRunMissingTarget.ok, false);
  assert.equal(dryRunMissingTarget.reason, CombatRejectReason.MissingTargetLocation);

  const targetInstance = {
    getPlayerPosition: (playerId) => (playerId === 'player:target' ? { x: 11, y: 10 } : null),
    getPlayersAtTile: (x, y) => (x === 12 && y === 10 ? [{ playerId: 'player:tile-target' }] : []),
    getMonster: (monsterId) => (monsterId === 'monster:target'
      ? { runtimeId: 'monster:target', x: 12, y: 10, alive: true }
      : null),
    getTileCombatState: (x, y) => ({ x, y, hp: 10, maxHp: 10, destroyed: false }),
    getContainerAtTile: (x, y) => (x === 14 && y === 10 ? { id: 'container:tile', x, y, remainingUses: 1 } : null),
    getContainerState: (containerId) => ({ id: containerId, x: 14, y: 10, remainingUses: 1 }),
  };
  const playerTargets = service.collectCombatTargets({
    action: service.createPlayerBasicAttackAction({
      playerId: 'player:attacker',
      targetPlayerId: 'player:target',
    }),
    actor: { attackRange: 1 },
    instance: targetInstance,
    playerRuntimeService: {
      getPlayer: (playerId) => ({ playerId, hp: 100 }),
    },
  });
  assert.equal(playerTargets.ok, true);
  assert.equal(playerTargets.targets.length, 1);
  assert.equal(playerTargets.targets[0].kind, CombatTargetKind.Player);
  assert.equal(playerTargets.targets[0].x, 11);

  const monsterTargets = service.collectCombatTargets({
    action: service.createPlayerBasicAttackAction({
      playerId: 'player:attacker',
      targetMonsterId: 'monster:target',
    }),
    actor: { attackRange: 1 },
    instance: targetInstance,
  });
  assert.equal(monsterTargets.ok, true);
  assert.equal(monsterTargets.targets[0].kind, CombatTargetKind.Monster);
  assert.equal(monsterTargets.targets[0].id, 'monster:target');

  const playerBasicAttackPlan = service.resolvePlayerBasicAttackActionPlan({
    playerId: 'player:attacker',
    targetMonsterId: 'monster:near',
    attacker: {
      playerId: 'player:attacker',
      hp: 100,
      instanceId: 'instance:test',
      x: 10,
      y: 10,
    },
    instance: {
      getMonster: (monsterId) => ({ runtimeId: monsterId, x: 11, y: 10, alive: true }),
      canSeeTileFrom: () => true,
    },
    resolveCombatRelation: () => ({ hostile: true }),
  });
  assert.equal(playerBasicAttackPlan.ok, true);
  assert.equal(playerBasicAttackPlan.action.kind, 'basic_attack');
  assert.equal(playerBasicAttackPlan.definition.actionId, 'basic_attack');
  assert.equal(playerBasicAttackPlan.selectedTargets.length, 1);
  assert.equal(playerBasicAttackPlan.selectedTargets[0].kind, CombatTargetKind.Monster);

  const playerBasicAttackFormationPlan = service.resolvePlayerBasicAttackActionPlan({
    playerId: 'player:attacker',
    targetMonsterId: 'formation:target',
    attacker: {
      playerId: 'player:attacker',
      hp: 100,
      instanceId: 'instance:test',
      x: 10,
      y: 10,
    },
    instance: {
      getMonster: () => null,
      canSeeTileFrom: () => true,
    },
    formationService: {
      getFormationCombatState: () => ({ id: 'formation:target', x: 11, y: 10, name: '测试阵法' }),
    },
    resolveCombatRelation: () => ({ hostile: true }),
  });
  assert.equal(playerBasicAttackFormationPlan.ok, true);
  assert.equal(playerBasicAttackFormationPlan.selectedTargets[0].kind, CombatTargetKind.Formation);
  assert.equal(playerBasicAttackFormationPlan.selectedTargets[0].id, 'formation:target');

  const playerBasicAttackBoundaryPlan = service.resolvePlayerBasicAttackActionPlan({
    playerId: 'player:attacker',
    targetX: 11,
    targetY: 10,
    attacker: {
      playerId: 'player:attacker',
      hp: 100,
      instanceId: 'instance:test',
      x: 10,
      y: 10,
    },
    instance: {
      canSeeTileFrom: () => true,
    },
    formationService: {
      getBoundaryBarrierCombatState: () => ({ id: 'boundary:target', formationId: 'formation:target', x: 11, y: 10 }),
    },
    canDamageTile: false,
    resolveCombatRelation: () => ({ hostile: true }),
  });
  assert.equal(playerBasicAttackBoundaryPlan.ok, true);
  assert.equal(playerBasicAttackBoundaryPlan.selectedTargets[0].kind, CombatTargetKind.Formation);
  assert.equal(playerBasicAttackBoundaryPlan.selectedTargets[0].source, 'formation_boundary');

  const playerBasicAttackContainerPlan = service.resolvePlayerBasicAttackActionPlan({
    playerId: 'player:attacker',
    targetX: 14,
    targetY: 10,
    attacker: {
      playerId: 'player:attacker',
      hp: 100,
      instanceId: 'instance:test',
      x: 13,
      y: 10,
    },
    instance: targetInstance,
    canDamageTile: false,
    resolveCombatRelation: () => ({ hostile: true }),
  });
  assert.equal(playerBasicAttackContainerPlan.ok, true);
  assert.equal(playerBasicAttackContainerPlan.selectedTargets[0].kind, CombatTargetKind.Container);
  assert.equal(playerBasicAttackContainerPlan.selectedTargets[0].id, 'container:tile');

  const playerBasicAttackExplicitTilePlan = service.resolvePlayerBasicAttackActionPlan({
    playerId: 'player:attacker',
    targetX: 14,
    targetY: 10,
    targetKind: CombatTargetKind.Tile,
    attacker: {
      playerId: 'player:attacker',
      hp: 100,
      instanceId: 'instance:test',
      x: 13,
      y: 10,
    },
    instance: targetInstance,
    canDamageTile: true,
    resolveCombatRelation: () => ({ hostile: true }),
  });
  assert.equal(playerBasicAttackExplicitTilePlan.ok, true);
  assert.equal(playerBasicAttackExplicitTilePlan.selectedTargets[0].kind, CombatTargetKind.Tile);
  assert.equal(playerBasicAttackExplicitTilePlan.selectedTargets[0].x, 14);
  assert.equal(playerBasicAttackExplicitTilePlan.selectedTargets[0].y, 10);

  const playerBasicAttackExplicitContainerPlan = service.resolvePlayerBasicAttackActionPlan({
    playerId: 'player:attacker',
    targetX: 14,
    targetY: 10,
    targetKind: CombatTargetKind.Container,
    attacker: {
      playerId: 'player:attacker',
      hp: 100,
      instanceId: 'instance:test',
      x: 13,
      y: 10,
    },
    instance: targetInstance,
    canDamageTile: false,
    resolveCombatRelation: () => ({ hostile: true }),
  });
  assert.equal(playerBasicAttackExplicitContainerPlan.ok, true);
  assert.equal(playerBasicAttackExplicitContainerPlan.selectedTargets[0].kind, CombatTargetKind.Container);
  assert.equal(playerBasicAttackExplicitContainerPlan.selectedTargets[0].id, 'container:tile');

  const deadMonsterBasicAttackPlan = service.resolvePlayerBasicAttackActionPlan({
    playerId: 'player:attacker',
    targetMonsterId: 'monster:dead',
    attacker: {
      playerId: 'player:attacker',
      hp: 100,
      instanceId: 'instance:test',
      x: 10,
      y: 10,
    },
    instance: {
      getMonster: (monsterId) => ({ runtimeId: monsterId, x: 11, y: 10, alive: false }),
      canSeeTileFrom: () => true,
    },
    resolveCombatRelation: () => ({ hostile: true }),
  });
  assert.equal(deadMonsterBasicAttackPlan.ok, false);
  assert.equal(deadMonsterBasicAttackPlan.reason, CombatRejectReason.MonsterDead);

  const playerSkillPlan = service.resolvePlayerSkillActionPlan({
    playerId: 'player:attacker',
    skillId: 'skill:test',
    attacker: {
      playerId: 'player:attacker',
      hp: 100,
      qi: 20,
      instanceId: 'instance:test',
      x: 10,
      y: 10,
      combat: {
        cooldownReadyTickBySkillId: {
          'skill:test': 0,
        },
      },
    },
    skill: playerSkillDefinition.definition.raw,
    instance: {
      getMonster: (monsterId) => ({ runtimeId: monsterId, x: 11, y: 10, alive: true }),
      canSeeTileFrom: () => true,
    },
    resolvedTargets: [{ kind: 'monster', monsterId: 'monster:target', x: 11, y: 10 }],
    currentTick: 10,
    effectiveGeometry: { range: 5, shape: 'single' },
    resolveCombatRelation: () => ({ hostile: true }),
  });
  assert.equal(playerSkillPlan.ok, true);
  assert.equal(playerSkillPlan.action.kind, 'skill');
  assert.equal(playerSkillPlan.definition.actionId, 'skill:test');
  assert.equal(playerSkillPlan.selectedTargets.length, 1);
  assert.equal(playerSkillPlan.selectedTargets[0].kind, CombatTargetKind.Monster);
  assert.equal(playerSkillPlan.timing.ok, true);

  const playerSkillChantResolvePlan = service.resolvePlayerSkillActionPlan({
    playerId: 'player:attacker',
    skillId: 'skill:test',
    phase: CombatActionPhase.ChantResolve,
    attacker: {
      playerId: 'player:attacker',
      hp: 100,
      qi: 0,
      instanceId: 'instance:test',
      x: 10,
      y: 10,
      combat: {
        cooldownReadyTickBySkillId: {
          'skill:test': 99,
        },
      },
    },
    skill: playerSkillDefinition.definition.raw,
    instance: {
      getMonster: (monsterId) => ({ runtimeId: monsterId, x: 11, y: 10, alive: true }),
      canSeeTileFrom: () => true,
    },
    resolvedTargets: [{ kind: 'monster', monsterId: 'monster:target', x: 11, y: 10 }],
    currentTick: 10,
    skipResourceAndCooldown: true,
    effectiveGeometry: { range: 5, shape: 'single' },
    resolveCombatRelation: () => ({ hostile: true }),
  });
  assert.equal(playerSkillChantResolvePlan.ok, true);
  assert.equal(playerSkillChantResolvePlan.action.phase, CombatActionPhase.ChantResolve);
  assert.equal(playerSkillChantResolvePlan.timing.ok, true);

  const rejectedPlayerSkillPlan = service.resolvePlayerSkillActionPlan({
    playerId: 'player:attacker',
    skillId: 'skill:test',
    attacker: {
      playerId: 'player:attacker',
      hp: 100,
      qi: 1,
      instanceId: 'instance:test',
      x: 10,
      y: 10,
      combat: {
        cooldownReadyTickBySkillId: {
          'skill:test': 20,
        },
      },
    },
    skill: playerSkillDefinition.definition.raw,
    instance: {
      getMonster: (monsterId) => ({ runtimeId: monsterId, x: 20, y: 10, alive: true }),
      canSeeTileFrom: () => true,
    },
    resolvedTargets: [{ kind: 'monster', monsterId: 'monster:far', x: 20, y: 10 }],
    currentTick: 10,
    effectiveGeometry: { range: 5, shape: 'single' },
    resolveCombatRelation: () => ({ hostile: true }),
  });
  assert.equal(rejectedPlayerSkillPlan.ok, false);
  assert.equal(rejectedPlayerSkillPlan.details.rejectedTargets.some((entry) => entry.reason === CombatRejectReason.OutOfRange), true);
  assert.equal(rejectedPlayerSkillPlan.details.rejectedTargets.some((entry) => entry.reason === CombatRejectReason.InsufficientResource), true);
  assert.equal(rejectedPlayerSkillPlan.details.rejectedTargets.some((entry) => entry.reason === CombatRejectReason.CooldownNotReady), true);

  const playerBasicAttackPvpRejected = service.resolvePlayerBasicAttackActionPlan({
    playerId: 'player:attacker',
    targetPlayerId: 'player:pvp-target',
    attacker: {
      playerId: 'player:attacker',
      hp: 100,
      instanceId: 'instance:test',
      x: 10,
      y: 10,
    },
    instance: {
      getPlayerPosition: () => ({ x: 11, y: 10 }),
      canSeeTileFrom: () => true,
      supportsPvp: false,
    },
    playerRuntimeService: {
      getPlayer: (playerId) => ({ playerId, hp: 100, instanceId: 'instance:test' }),
    },
    resolveCombatRelation: () => ({ hostile: true }),
  });
  assert.equal(playerBasicAttackPvpRejected.ok, false);
  assert.equal(playerBasicAttackPvpRejected.reason, CombatRejectReason.MapCapabilityDisabled);
  assert.equal(playerBasicAttackPvpRejected.details.rejectedTargets[0].details.capability, 'supportsPvp');

  const tileTargets = service.collectCombatTargets({
    action: service.createPlayerSkillAction({
      playerId: 'player:attacker',
      skillId: 'skill:test',
      targetRef: 'tile:12:8',
    }),
    skill: playerSkillDefinition.definition.raw,
    instance: targetInstance,
  });
  assert.equal(tileTargets.ok, true);
  assert.equal(tileTargets.targets[0].kind, CombatTargetKind.Tile);
  assert.equal(tileTargets.targets[0].state.hp, 10);

  const formationTargets = service.collectCombatTargets({
    action: service.createPlayerBasicAttackAction({
      playerId: 'player:attacker',
      targetFormationId: 'formation:test',
    }),
    actor: { attackRange: 1 },
    formationService: {
      getFormationCombatState: () => ({ id: 'formation:test', x: 15, y: 10 }),
    },
  });
  assert.equal(formationTargets.ok, true);
  assert.equal(formationTargets.targets[0].kind, CombatTargetKind.Formation);
  assert.equal(formationTargets.targets[0].x, 15);

  const containerTargets = service.collectCombatTargets({
    action: service.createPlayerBasicAttackAction({
      playerId: 'player:attacker',
      targetContainerId: 'container:test',
    }),
    actor: { attackRange: 1 },
    instance: targetInstance,
  });
  assert.equal(containerTargets.ok, true);
  assert.equal(containerTargets.targets[0].kind, CombatTargetKind.Container);
  assert.equal(containerTargets.targets[0].x, 14);

  const warningTargets = service.collectCombatTargets({
    action: service.createMonsterAction({
      kind: 'skill',
      instanceId: 'instance:test',
      runtimeId: 'monster:1',
      targetPlayerId: 'player:missing',
      skillId: 'monster:test_skill',
      warningCells: [{ x: 12, y: 10 }],
    }, CombatActionPhase.ChantResolve),
    skill: monsterSkillDefinition.definition.raw,
    instance: targetInstance,
  });
  assert.equal(warningTargets.ok, true);
  assert.equal(warningTargets.targets.length, 1);
  assert.equal(warningTargets.targets[0].id, 'player:tile-target');
  assert.equal(warningTargets.targets[0].source, 'warning_cell');

  const emptyWarningTargets = service.collectCombatTargets({
    action: service.createMonsterAction({
      kind: 'skill',
      instanceId: 'instance:test',
      runtimeId: 'monster:1',
      skillId: 'monster:test_skill',
      warningCells: [{ x: 99, y: 99 }],
    }, CombatActionPhase.ChantResolve),
    skill: monsterSkillDefinition.definition.raw,
    instance: {
      getPlayersAtTile: () => [],
    },
  });
  assert.equal(emptyWarningTargets.ok, false);
  assert.equal(emptyWarningTargets.targets.length, 0);
  assert.equal(emptyWarningTargets.rejected[0].reason, CombatRejectReason.NoTargets);

  const dedupedWarningTargets = service.collectCombatTargets({
    action: service.createMonsterAction({
      kind: 'skill',
      instanceId: 'instance:test',
      runtimeId: 'monster:1',
      skillId: 'monster:test_skill',
      warningCells: [{ x: 12, y: 10 }, { x: 13, y: 10 }],
    }, CombatActionPhase.ChantResolve),
    skill: monsterSkillDefinition.definition.raw,
    instance: {
      getPlayersAtTile: (x) => (x === 12
        ? [{ playerId: 'player:repeat' }, { playerId: 'player:second' }]
        : [{ playerId: 'player:repeat' }]),
    },
  });
  assert.deepEqual(dedupedWarningTargets.targets.map((target) => target.id), ['player:repeat', 'player:second']);

  const cappedWarningTargets = service.collectCombatTargets({
    action: service.createMonsterAction({
      kind: 'skill',
      instanceId: 'instance:test',
      runtimeId: 'monster:1',
      skillId: 'monster:capped_skill',
      warningCells: [{ x: 12, y: 10 }],
    }, CombatActionPhase.ChantResolve),
    skill: {
      id: 'monster:capped_skill',
      range: 4,
      targeting: { shape: 'box', width: 3, height: 1, maxTargets: 1 },
      effects: [{ type: 'damage' }],
    },
    instance: {
      getPlayersAtTile: () => [{ playerId: 'player:first' }, { playerId: 'player:second' }],
    },
  });
  assert.equal(cappedWarningTargets.ok, true);
  assert.deepEqual(cappedWarningTargets.targets.map((target) => target.id), ['player:first']);

  const monsterSkillPlan = service.resolveMonsterSkillActionPlan({
    action: service.createMonsterAction({
      kind: 'skill',
      instanceId: 'instance:test',
      runtimeId: 'monster:1',
      targetPlayerId: 'player:plan-primary',
      skillId: 'monster:plan_skill',
      targetX: 12,
      targetY: 10,
      warningCells: [{ x: 12, y: 10 }],
    }, CombatActionPhase.ChantResolve).raw,
    instance: {
      getPlayerPosition: () => null,
      getPlayersAtTile: (x, y) => (x === 12 && y === 10 ? [{ playerId: 'player:plan-warning' }] : []),
      canSeeTileFrom: () => true,
    },
    deps: {
      getPlayerLocation: () => null,
    },
    monster: {
      runtimeId: 'monster:1',
      x: 10,
      y: 10,
      skills: [{
        id: 'monster:plan_skill',
        range: 4,
        targeting: { shape: 'box', width: 3, height: 1, maxTargets: 2 },
        effects: [{ type: 'damage' }],
      }],
    },
    skill: {
      id: 'monster:plan_skill',
      range: 4,
      targeting: { shape: 'box', width: 3, height: 1, maxTargets: 2 },
      effects: [{ type: 'damage' }],
    },
    playerRuntimeService: {
      getPlayer: (playerId) => ({
        playerId,
        hp: 100,
        instanceId: 'stale:previous',
        x: 12,
        y: 10,
      }),
    },
  });
  assert.equal(monsterSkillPlan.ok, true);
  assert.equal(monsterSkillPlan.action.kind, 'skill');
  assert.equal(monsterSkillPlan.definition.actionId, 'monster:plan_skill');
  assert.equal(monsterSkillPlan.distance, 2);
  assert.deepEqual(monsterSkillPlan.distanceAnchor, { x: 12, y: 10 });
  assert.equal(monsterSkillPlan.targetEntries.length, 1);
  assert.equal(monsterSkillPlan.targetEntries[0].player.playerId, 'player:plan-warning');
  assert.equal(monsterSkillPlan.targetEntries[0].source, 'warning_cell');
  assert.equal(monsterSkillPlan.validation.ok, true);

  const emptyMonsterSkillPlan = service.resolveMonsterSkillActionPlan({
    action: {
      kind: 'skill',
      instanceId: 'instance:test',
      runtimeId: 'monster:1',
      targetPlayerId: 'player:missing',
      skillId: 'monster:plan_skill',
      targetX: 99,
      targetY: 99,
      warningCells: [{ x: 99, y: 99 }],
    },
    instance: {
      getPlayerPosition: () => null,
      getPlayersAtTile: () => [],
      canSeeTileFrom: () => true,
    },
    deps: {
      getPlayerLocation: () => null,
    },
    monster: {
      runtimeId: 'monster:1',
      x: 10,
      y: 10,
    },
    skill: {
      id: 'monster:plan_skill',
      range: 4,
      targeting: { shape: 'single', maxTargets: 1 },
      effects: [{ type: 'damage' }],
    },
    playerRuntimeService: {
      getPlayer: () => null,
    },
  });
  assert.equal(emptyMonsterSkillPlan.ok, false);
  assert.equal(emptyMonsterSkillPlan.reason, CombatRejectReason.NoRuntimeTargetsInWarningCells);
  assert.equal(emptyMonsterSkillPlan.details.warningCellCount, 1);

  const missingMonsterSkillIdPlan = service.resolveMonsterSkillActionPlan({
    action: {
      kind: 'skill',
      instanceId: 'instance:test',
      runtimeId: 'monster:1',
      targetPlayerId: 'player:missing',
    },
    instance: {},
    monster: { runtimeId: 'monster:1', alive: true, x: 10, y: 10 },
    skill: null,
  });
  assert.equal(missingMonsterSkillIdPlan.ok, false);
  assert.equal(missingMonsterSkillIdPlan.reason, CombatRejectReason.MissingSkillId);

  const missingMonsterPlan = service.resolveMonsterSkillActionPlan({
    action: {
      kind: 'skill',
      instanceId: 'instance:test',
      runtimeId: 'monster:missing',
      targetPlayerId: 'player:missing',
      skillId: 'monster:plan_skill',
    },
    instance: {},
    monster: null,
    skill: { id: 'monster:plan_skill', effects: [] },
  });
  assert.equal(missingMonsterPlan.ok, false);
  assert.equal(missingMonsterPlan.reason, CombatRejectReason.MissingMonster);

  const deadMonsterPlan = service.resolveMonsterSkillActionPlan({
    action: {
      kind: 'skill',
      instanceId: 'instance:test',
      runtimeId: 'monster:dead',
      targetPlayerId: 'player:missing',
      skillId: 'monster:plan_skill',
    },
    instance: {},
    monster: { runtimeId: 'monster:dead', alive: false, x: 10, y: 10 },
    skill: { id: 'monster:plan_skill', effects: [] },
  });
  assert.equal(deadMonsterPlan.ok, false);
  assert.equal(deadMonsterPlan.reason, CombatRejectReason.MonsterDead);

  const missingSkillPlan = service.resolveMonsterSkillActionPlan({
    action: {
      kind: 'skill',
      instanceId: 'instance:test',
      runtimeId: 'monster:1',
      targetPlayerId: 'player:missing',
      skillId: 'monster:missing_skill',
    },
    instance: {},
    monster: { runtimeId: 'monster:1', alive: true, x: 10, y: 10 },
    skill: null,
  });
  assert.equal(missingSkillPlan.ok, false);
  assert.equal(missingSkillPlan.reason, CombatRejectReason.MissingSkill);

  const monsterSkillChantStartPlan = service.resolveMonsterSkillChantStartPlan({
    action: {
      kind: 'skill_chant',
      instanceId: 'instance:test',
      runtimeId: 'monster:chant',
      targetPlayerId: 'player:plan-primary',
      skillId: 'monster:chant_skill',
      durationMs: 1500,
      warningCells: [{ x: 12.8, y: 10.2 }],
      warningColor: ' #ff6600 ',
    },
    instance: {},
    monster: {
      runtimeId: 'monster:chant',
      alive: true,
      x: 10,
      y: 10,
      skills: [{
        id: 'monster:chant_skill',
        name: '吟唱测试术',
        effects: [{ type: 'damage' }],
      }],
    },
    skill: {
      id: 'monster:chant_skill',
      name: '吟唱测试术',
      effects: [{ type: 'damage' }],
    },
  });
  assert.equal(monsterSkillChantStartPlan.ok, true);
  assert.equal(monsterSkillChantStartPlan.action.phase, CombatActionPhase.ChantStart);
  assert.equal(monsterSkillChantStartPlan.definition.actionId, 'monster:chant_skill');
  assert.deepEqual(monsterSkillChantStartPlan.warningCells, [{ x: 12, y: 10 }]);
  assert.equal(monsterSkillChantStartPlan.durationMs, 1500);
  assert.equal(monsterSkillChantStartPlan.warningColor, '#ff6600');

  const missingMonsterSkillChantStartSkillIdPlan = service.resolveMonsterSkillChantStartPlan({
    action: {
      kind: 'skill_chant',
      instanceId: 'instance:test',
      runtimeId: 'monster:chant',
    },
    instance: {},
    monster: { runtimeId: 'monster:chant', alive: true, x: 10, y: 10 },
    skill: null,
  });
  assert.equal(missingMonsterSkillChantStartSkillIdPlan.ok, false);
  assert.equal(missingMonsterSkillChantStartSkillIdPlan.reason, CombatRejectReason.MissingSkillId);

  const missingMonsterSkillChantStartInstancePlan = service.resolveMonsterSkillChantStartPlan({
    action: {
      kind: 'skill_chant',
      instanceId: 'instance:missing',
      runtimeId: 'monster:chant',
      skillId: 'monster:chant_skill',
    },
    instance: null,
    monster: { runtimeId: 'monster:chant', alive: true, x: 10, y: 10 },
    skill: { id: 'monster:chant_skill', effects: [] },
  });
  assert.equal(missingMonsterSkillChantStartInstancePlan.ok, false);
  assert.equal(missingMonsterSkillChantStartInstancePlan.reason, CombatRejectReason.MissingInstance);

  const missingMonsterSkillChantStartMonsterPlan = service.resolveMonsterSkillChantStartPlan({
    action: {
      kind: 'skill_chant',
      instanceId: 'instance:test',
      runtimeId: 'monster:missing',
      skillId: 'monster:chant_skill',
    },
    instance: {},
    monster: null,
    skill: { id: 'monster:chant_skill', effects: [] },
  });
  assert.equal(missingMonsterSkillChantStartMonsterPlan.ok, false);
  assert.equal(missingMonsterSkillChantStartMonsterPlan.reason, CombatRejectReason.MissingMonster);

  const deadMonsterSkillChantStartPlan = service.resolveMonsterSkillChantStartPlan({
    action: {
      kind: 'skill_chant',
      instanceId: 'instance:test',
      runtimeId: 'monster:dead',
      skillId: 'monster:chant_skill',
    },
    instance: {},
    monster: { runtimeId: 'monster:dead', alive: false, x: 10, y: 10 },
    skill: { id: 'monster:chant_skill', effects: [] },
  });
  assert.equal(deadMonsterSkillChantStartPlan.ok, false);
  assert.equal(deadMonsterSkillChantStartPlan.reason, CombatRejectReason.MonsterDead);

  const missingMonsterSkillChantStartSkillPlan = service.resolveMonsterSkillChantStartPlan({
    action: {
      kind: 'skill_chant',
      instanceId: 'instance:test',
      runtimeId: 'monster:chant',
      skillId: 'monster:missing_skill',
    },
    instance: {},
    monster: { runtimeId: 'monster:chant', alive: true, x: 10, y: 10 },
    skill: null,
  });
  assert.equal(missingMonsterSkillChantStartSkillPlan.ok, false);
  assert.equal(missingMonsterSkillChantStartSkillPlan.reason, CombatRejectReason.MissingSkill);

  const shadowAttacker = {
    playerId: 'player:shadow',
    instanceId: 'instance:test',
    hp: 100,
    qi: 20,
    x: 10,
    y: 10,
    combat: { cooldownReadyTickBySkillId: {} },
  };
  const shadowDeps = {
    combatDiagnostics: [],
    combatActionPlanShadows: [],
    combatActionPlanShadowDiagnostics: [],
    getInstanceRuntimeOrThrow: () => ({
      meta: { supportsPvp: false, canDamageTile: false },
      getMonster: (monsterId) => ({ runtimeId: monsterId, x: 11, y: 10, alive: true }),
      canSeeTileFrom: () => true,
    }),
    resolveCurrentTickForPlayerId: () => 7,
  };
  const shadowDispatch = new WorldRuntimePlayerSkillDispatchService(
    {
      getPlayer: (playerId) => (playerId === shadowAttacker.playerId ? shadowAttacker : null),
      listPlayerSnapshots: () => [],
    },
    {},
    service,
  );
  shadowDispatch.resolvePlayerSkillActionPlanShadow(
    shadowAttacker,
    playerSkillDefinition.definition.raw,
    {
      resolvedTargets: [{ kind: 'monster', monsterId: 'monster:shadow', x: 11, y: 10 }],
      currentTick: 7,
      effectiveGeometry: { range: 5, shape: 'single' },
    },
    shadowDeps.getInstanceRuntimeOrThrow(),
    shadowDeps,
  );
  assert.equal(shadowDeps.combatActionPlanShadows.length, 1);
  assert.equal(shadowDeps.combatActionPlanShadows[0].ok, true);
  assert.equal(shadowDeps.combatDiagnostics.length, 0);

  const validationDefinition = service.createSkillDefinition(
    skillAction,
    {
      id: 'skill:validate',
      range: 2,
      targetMode: 'entity',
      effects: [{ type: 'damage' }],
    },
  );
  const allowedValidation = service.validateCombatTargets({
    action: skillAction,
    definition: validationDefinition,
    actorPosition: { x: 10, y: 10 },
    targets: [{ kind: CombatTargetKind.Monster, id: 'monster:target', x: 11, y: 10 }],
    instance: {
      canSeeTileFrom: () => true,
      getMonster: (monsterId) => ({ runtimeId: monsterId, x: 11, y: 10, alive: true }),
    },
    resolveCombatRelation: () => ({ hostile: true }),
  });
  assert.equal(allowedValidation.ok, true);
  assert.equal(allowedValidation.allowedCount, 1);

  const dryRunFull = service.dryRunCombatAction({
    action: skillAction,
    player: {
      techniques: {
        techniques: [{
          skills: [playerSkillDefinition.definition.raw],
        }],
      },
    },
    actorPosition: { x: 10, y: 10 },
    targets: [{ kind: CombatTargetKind.Monster, id: 'monster:target', x: 11, y: 10 }],
    instance: {
      canSeeTileFrom: () => true,
      getMonster: (monsterId) => ({ runtimeId: monsterId, x: 11, y: 10, alive: true }),
    },
    resources: { qi: 10 },
    cooldownReadyTickByActionId: { 'skill:test': 0 },
    currentTick: 1,
    resolveCombatRelation: () => ({ hostile: true }),
  });
  assert.equal(dryRunFull.ok, true);
  assert.equal(dryRunFull.dryRun, true);
  assert.equal(dryRunFull.allowedCount, 1);
  assert.equal(dryRunFull.phases.map((phase) => phase.name).join(','), 'action_definition,target_collection,target_validation,resource_cooldown');
  assert.equal(dryRunFull.phases.every((phase) => Number.isFinite(phase.durationMs) && phase.durationMs >= 0), true);
  assert.equal(dryRunFull.phases.every((phase) => phase.heapDeltaBytes === null || (Number.isFinite(phase.heapDeltaBytes) && phase.heapDeltaBytes >= 0)), true);
  assert.equal(dryRunFull.heapDeltaBytes === null || (Number.isFinite(dryRunFull.heapDeltaBytes) && dryRunFull.heapDeltaBytes >= 0), true);
  assert.equal(dryRunFull.durationMs < 10, true);
  assert.equal(dryRunFull.phases.every((phase) => phase.durationMs < 10), true);
  assert.equal(dryRunFull.rejectedCount, 0);

  const dryRunRejected = service.dryRunCombatAction({
    action: skillAction,
    player: {
      techniques: {
        techniques: [{
          skills: [playerSkillDefinition.definition.raw],
        }],
      },
    },
    actorPosition: { x: 10, y: 10 },
    targets: [{ kind: CombatTargetKind.Monster, id: 'monster:far', x: 20, y: 10 }],
    instance: {
      canSeeTileFrom: () => true,
      getMonster: (monsterId) => ({ runtimeId: monsterId, x: 20, y: 10, alive: true }),
    },
    resources: { qi: 1 },
    cooldownReadyTickByActionId: { 'skill:test': 12 },
    currentTick: 9,
    resolveCombatRelation: () => ({ hostile: true }),
  });
  assert.equal(dryRunRejected.ok, false);
  assert.equal(dryRunRejected.rejected.some((entry) => entry.reason === CombatRejectReason.OutOfRange), true);
  assert.equal(dryRunRejected.rejected.some((entry) => entry.reason === CombatRejectReason.InsufficientResource), true);
  assert.equal(dryRunRejected.rejected.some((entry) => entry.reason === CombatRejectReason.CooldownNotReady), true);

  const noTargets = service.collectCombatTargets({
    action: service.createPlayerSkillAction({
      playerId: 'player:attacker',
      skillId: 'skill:test',
    }),
    skill: playerSkillDefinition.definition.raw,
  });
  assert.equal(noTargets.ok, false);
  assert.equal(noTargets.rejected[0].reason, CombatRejectReason.NoTargets);

  const typeRejected = service.validateCombatTargets({
    action: skillAction,
    definition: validationDefinition,
    actorPosition: { x: 10, y: 10 },
    targets: [{ kind: CombatTargetKind.Tile, x: 11, y: 10 }],
    instance: { canSeeTileFrom: () => true },
  });
  assert.equal(typeRejected.ok, false);
  assert.equal(typeRejected.rejected[0].reason, CombatRejectReason.TargetTypeNotAllowed);

  const rangeRejected = service.validateCombatTargets({
    action: skillAction,
    definition: validationDefinition,
    actorPosition: { x: 10, y: 10 },
    targets: [{ kind: CombatTargetKind.Monster, id: 'monster:far', x: 14, y: 10 }],
    instance: { canSeeTileFrom: () => true },
  });
  assert.equal(rangeRejected.rejected[0].reason, CombatRejectReason.OutOfRange);

  const losRejected = service.validateCombatTargets({
    action: skillAction,
    definition: validationDefinition,
    actorPosition: { x: 10, y: 10 },
    targets: [{ kind: CombatTargetKind.Monster, id: 'monster:block', x: 11, y: 10 }],
    instance: { canSeeTileFrom: () => false },
  });
  assert.equal(losRejected.rejected[0].reason, CombatRejectReason.LineOfSightBlocked);

  const relationRejected = service.validateCombatTargets({
    action: skillAction,
    definition: validationDefinition,
    actorPosition: { x: 10, y: 10 },
    targets: [{ kind: CombatTargetKind.Monster, id: 'monster:friendly', x: 11, y: 10 }],
    instance: { canSeeTileFrom: () => true },
    resolveCombatRelation: () => ({ hostile: false }),
  });
  assert.equal(relationRejected.rejected[0].reason, CombatRejectReason.CombatRelationNotAllowed);

  const instanceRejected = service.validateCombatTargets({
    action: service.createPlayerSkillAction({
      playerId: 'player:attacker',
      skillId: 'skill:test',
      instanceId: 'instance:a',
    }),
    definition: validationDefinition,
    actorPosition: { x: 10, y: 10 },
    targets: [{
      kind: CombatTargetKind.Player,
      id: 'player:other-instance',
      x: 11,
      y: 10,
      runtime: { instanceId: 'instance:b' },
    }],
    instance: { canSeeTileFrom: () => true },
  });
  assert.equal(instanceRejected.rejected[0].reason, CombatRejectReason.TargetInstanceMismatch);

  const mapCapabilityRejected = service.validateCombatTargets({
    action: service.createPlayerBasicAttackAction({
      playerId: 'player:attacker',
      targetRef: 'tile:11:10',
    }),
    definition: service.createBasicAttackDefinition(basicAction, {
      allowedTargetKinds: [CombatTargetKind.Tile],
      range: 2,
    }),
    actorPosition: { x: 10, y: 10 },
    targets: [{ kind: CombatTargetKind.Tile, x: 11, y: 10 }],
    canDamageTile: false,
  });
  assert.equal(mapCapabilityRejected.rejected[0].reason, CombatRejectReason.MapCapabilityDisabled);

  const costReady = service.validateActionCostAndCooldown({
    action: playerSkillDefinition.action,
    definition: playerSkillDefinition.definition,
    resources: { qi: 10 },
    cooldownReadyTickByActionId: { 'skill:test': 8 },
    currentTick: 9,
  });
  assert.equal(costReady.ok, true);

  const costRejected = service.validateActionCostAndCooldown({
    action: playerSkillDefinition.action,
    definition: playerSkillDefinition.definition,
    resources: { qi: 1 },
    cooldownReadyTickByActionId: { 'skill:test': 12 },
    currentTick: 9,
  });
  assert.equal(costRejected.ok, false);
  assert.equal(costRejected.rejected.length, 2);
  assert.equal(costRejected.rejected[0].reason, CombatRejectReason.InsufficientResource);
  assert.equal(costRejected.rejected[1].reason, CombatRejectReason.CooldownNotReady);

  const monsterApplication = service.createCombatResultApplication({
    actor: { kind: 'player', id: 'player:attacker' },
    target: { kind: CombatTargetKind.Monster, id: 'monster:target' },
    result: {
      damage: 5,
      defeated: true,
      effects: [{ kind: CombatEffectKind.Damage }],
    },
  });
  assert.deepEqual(monsterApplication.dirtyDomains, ['instance:monster_runtime', 'instance:ground_items', 'player:progression']);
  assert.equal(monsterApplication.persistenceTransfer, 'dirty_domain_flush');

  const tileApplication = service.createCombatResultApplication({
    target: { kind: CombatTargetKind.Tile, x: 12, y: 8 },
    result: { damage: 1 },
  });
  assert.deepEqual(tileApplication.dirtyDomains, ['instance:tile_damage']);

  const playerDeathBuffApplication = service.createCombatResultApplication({
    target: { kind: CombatTargetKind.Player, id: 'player:target' },
    result: {
      damage: 100,
      defeated: true,
      buffApplied: true,
      buffId: 'buff:test',
    },
  });
  assert.deepEqual(playerDeathBuffApplication.dirtyDomains, ['player:vitals', 'player:buff', 'player:attr', 'player:death']);

  const formationApplication = service.createCombatResultApplication({
    target: { kind: CombatTargetKind.Formation, id: 'formation:test' },
    result: { damage: 3 },
  });
  assert.deepEqual(formationApplication.dirtyDomains, ['instance:formation']);

  const containerApplication = service.createCombatResultApplication({
    target: { kind: CombatTargetKind.Container, id: 'container:test' },
    result: { damage: 1 },
  });
  assert.deepEqual(containerApplication.dirtyDomains, ['instance:container']);

  const appliedTargets = [];
  const applyOutcome = service.recordOutcome({ combatOutcomes: [] }, {
    phase: CombatActionPhase.Instant,
    actor: { kind: 'player', id: 'player:attacker' },
    actionId: 'skill:test',
    instanceId: 'instance:test',
    target: { kind: CombatTargetKind.Player, id: 'player:target' },
    result: { damage: 5 },
  });
  const applyResult = service.applyCombatOutcome({
    outcome: applyOutcome,
    adapters: {
      player: ({ target, result, application }) => {
        appliedTargets.push({ target, result, application });
        return { ok: true, appliedDamage: result.damage };
      },
    },
  });
  assert.equal(applyResult.ok, true);
  assert.equal(applyResult.targetKind, CombatTargetKind.Player);
  assert.equal(applyResult.adapterResult.appliedDamage, 5);
  assert.equal(appliedTargets.length, 1);
  assert.deepEqual(applyResult.dirtyDomains, ['player:vitals']);

  const missingAdapterResult = service.applyCombatOutcome({
    outcome: applyOutcome,
    adapters: {},
  });
  assert.equal(missingAdapterResult.ok, false);
  assert.equal(missingAdapterResult.reason, CombatRejectReason.TargetTypeNotAllowed);

  const adapterCalls = [];
  const adapters = createCombatOutcomeApplyAdapters({
    applyPlayerDamage: ({ playerId, damage }) => {
      adapterCalls.push(['player_damage', playerId, damage]);
      return damage - 1;
    },
    applyPlayerBuff: ({ playerId, buff }) => {
      adapterCalls.push(['player_buff', playerId, buff.id]);
      return true;
    },
    recordPlayerActivity: ({ playerId }) => {
      adapterCalls.push(['player_activity', playerId]);
      return true;
    },
    activateAutoRetaliate: ({ playerId }) => {
      adapterCalls.push(['player_retaliate', playerId]);
      return true;
    },
    handlePlayerDefeat: ({ playerId, attackerId }) => {
      adapterCalls.push(['player_defeat', playerId, attackerId]);
      return true;
    },
    applyMonsterDamage: ({ runtimeId, damage }) => {
      adapterCalls.push(['monster_damage', runtimeId, damage]);
      return { appliedDamage: damage, defeated: true, monster: { runtimeId } };
    },
    applyMonsterBuff: ({ runtimeId, buff }) => {
      adapterCalls.push(['monster_buff', runtimeId, buff.id]);
      return true;
    },
    handleMonsterDefeat: ({ runtimeId, attackerId }) => {
      adapterCalls.push(['monster_defeat', runtimeId, attackerId]);
      return true;
    },
    applyTileDamage: ({ x, y, damage }) => {
      adapterCalls.push(['tile_damage', x, y, damage]);
      return { appliedDamage: damage, destroyed: true };
    },
    handleTileDestroyed: ({ x, y }) => {
      adapterCalls.push(['tile_destroyed', x, y]);
      return true;
    },
    applyFormationDamage: ({ formationId, damage }) => {
      adapterCalls.push(['formation_damage', formationId, damage]);
      return { appliedDamage: damage, auraDamage: 3 };
    },
    applyFormationBoundaryDamage: ({ x, y, damage }) => {
      adapterCalls.push(['formation_boundary_damage', x, y, damage]);
      return { appliedDamage: damage, auraDamage: 2 };
    },
    applyContainerDamage: ({ targetId, x, y, damage }) => {
      adapterCalls.push(['container_damage', targetId, x, y, damage]);
      return { appliedDamage: damage, consumed: true };
    },
  });
  const playerApply = service.applyCombatOutcome({
    actor: { kind: 'monster', id: 'monster:1' },
    actionId: 'monster:attack',
    instanceId: 'instance:test',
    target: { kind: CombatTargetKind.Player, id: 'player:target' },
    result: { damage: 6, buff: { id: 'buff:slow' }, defeated: true, autoRetaliate: true },
    adapters,
  });
  assert.equal(playerApply.ok, true);
  assert.equal(playerApply.adapterResult.appliedDamage, 5);
  assert.deepEqual(playerApply.dirtyDomains, ['player:vitals', 'player:death']);
  const monsterAdapterApply = service.applyCombatOutcome({
    actor: { kind: 'player', id: 'player:attacker' },
    actionId: 'basic_attack',
    instanceId: 'instance:test',
    target: { kind: CombatTargetKind.Monster, id: 'monster:target' },
    result: { damage: 7, buff: { id: 'buff:burn' }, defeated: true },
    adapters,
  });
  assert.equal(monsterAdapterApply.ok, true);
  assert.equal(monsterAdapterApply.adapterResult.defeated, true);
  assert.deepEqual(monsterAdapterApply.adapterResult.monster, { runtimeId: 'monster:target' });
  assert.deepEqual(monsterAdapterApply.dirtyDomains, ['instance:monster_runtime', 'instance:ground_items', 'player:progression']);
  const tileAdapterApply = service.applyCombatOutcome({
    actor: { kind: 'player', id: 'player:attacker' },
    actionId: 'basic_attack',
    instanceId: 'instance:test',
    target: { kind: CombatTargetKind.Tile, x: 4, y: 5 },
    result: { damage: 8 },
    adapters,
  });
  assert.equal(tileAdapterApply.ok, true);
  assert.equal(tileAdapterApply.adapterResult.destroyed, true);
  assert.deepEqual(tileAdapterApply.dirtyDomains, ['instance:tile_damage']);
  const formationAdapterApply = service.applyCombatOutcome({
    actor: { kind: 'player', id: 'player:attacker' },
    actionId: 'skill:test',
    instanceId: 'instance:test',
    target: { kind: CombatTargetKind.Formation, id: 'formation:target' },
    result: { damage: 9 },
    adapters,
  });
  assert.equal(formationAdapterApply.ok, true);
  assert.equal(formationAdapterApply.adapterResult.auraDamage, 3);
  const formationBoundaryAdapterApply = service.applyCombatOutcome({
    actor: { kind: 'player', id: 'player:attacker' },
    actionId: 'skill:test',
    instanceId: 'instance:test',
    target: { kind: CombatTargetKind.Formation, id: 'formation:target', x: 6, y: 7 },
    result: { damage: 4, targetType: 'formation_boundary' },
    adapters,
  });
  assert.equal(formationBoundaryAdapterApply.ok, true);
  assert.equal(formationBoundaryAdapterApply.adapterResult.auraDamage, 2);
  const containerAdapterApply = service.applyCombatOutcome({
    actor: { kind: 'player', id: 'player:attacker' },
    actionId: 'basic_attack',
    instanceId: 'instance:test',
    target: { kind: CombatTargetKind.Container, id: 'container:target', x: 8, y: 9 },
    result: { damage: 2 },
    adapters,
  });
  assert.equal(containerAdapterApply.ok, true);
  assert.equal(containerAdapterApply.adapterResult.consumed, true);
  assert.deepEqual(adapterCalls, [
    ['player_damage', 'player:target', 6],
    ['player_buff', 'player:target', 'buff:slow'],
    ['player_activity', 'player:target'],
    ['player_retaliate', 'player:target'],
    ['player_defeat', 'player:target', 'monster:1'],
    ['monster_damage', 'monster:target', 7],
    ['monster_buff', 'monster:target', 'buff:burn'],
    ['monster_defeat', 'monster:target', 'player:attacker'],
    ['tile_damage', 4, 5, 8],
    ['tile_destroyed', 4, 5],
    ['formation_damage', 'formation:target', 9],
    ['formation_boundary_damage', 6, 7, 4],
    ['container_damage', 'container:target', 8, 9, 2],
  ]);

  const effectEvents = [];
  const effectOutcome = service.recordOutcome({ combatEvents: effectEvents }, {
    phase: CombatActionPhase.Instant,
    actor: { kind: 'player', id: 'player:healer' },
    actionId: 'skill:utility',
    instanceId: 'instance:test',
    target: { kind: CombatTargetKind.Player, id: 'player:target' },
    result: {
      damage: 0,
      heal: 12,
      buffApplied: true,
      buffId: 'buff:guard',
      cleansed: true,
      cleanseCount: 1,
    },
  }, { buildEvents: true, eventContext: { playerId: 'player:target', tags: ['utility'] } });
  assert.equal(effectOutcome.ok, true);
  assert.equal(effectEvents.length, 1);
  assert.equal(effectEvents[0].aoiEvent.result, 'no_damage');
  assert.equal(effectEvents[0].notificationEvent.kind, 'combat');
  assert.equal(effectEvents[0].auditEvent.tags.includes('utility'), true);
  assert.equal(effectOutcome.result.effects.some((effect) => effect.kind === CombatEffectKind.Damage && effect.damage === 0), true);
  assert.equal(effectOutcome.result.effects.some((effect) => effect.kind === CombatEffectKind.Heal && effect.amount === 12), true);
  assert.equal(effectOutcome.result.effects.some((effect) => effect.kind === CombatEffectKind.Buff && effect.buffId === 'buff:guard'), true);
  assert.equal(effectOutcome.result.effects.some((effect) => effect.kind === CombatEffectKind.Cleanse && effect.count === 1), true);

  const opsEvents = [
    {
      auditEvent: {
        ...events.auditEvent,
        actor: { kind: 'player', id: 'player:1' },
        target: { kind: CombatTargetKind.Monster, id: 'monster:target', x: 4, y: 5 },
        result: { damage: 7 },
        createdAt: '2026-05-09T00:00:01.000Z',
      },
    },
    {
      auditEvent: {
        ...effectEvents[0].auditEvent,
        actor: { kind: 'player', id: 'player:1' },
        target: { kind: CombatTargetKind.Monster, id: 'monster:target', x: 4, y: 5 },
        result: { damage: 3 },
        createdAt: '2026-05-09T00:00:02.000Z',
      },
    },
    {
      diagnosticEvent: {
        ...rejectEvents.diagnosticEvent,
        instanceId: 'instance:test',
        actor: { kind: 'monster', id: 'monster:1' },
        actionId: 'skill:bad',
        reason: CombatRejectReason.NoRuntimeTargetsInWarningCells,
        createdAt: '2026-05-09T00:00:03.000Z',
        severity: 'warn',
      },
    },
    {
      diagnosticEvent: {
        ...rejectCombatEvents[0].diagnosticEvent,
        instanceId: 'instance:test',
        actor: { kind: 'monster', id: 'monster:1' },
        actionId: 'skill:bad',
        reason: CombatRejectReason.NoRuntimeTargetsInWarningCells,
        createdAt: '2026-05-09T00:00:04.000Z',
        severity: 'error',
      },
    },
  ];
  const recentAudits = queryRecentCombatAuditEvents(opsEvents, {
    playerId: 'player:1',
    instanceId: 'instance:test',
    limit: 1,
  });
  assert.equal(recentAudits.length, 1);
  assert.equal(recentAudits[0].result.damage, 3);
  const diagnosticSummary = aggregateCombatDiagnostics(opsEvents, {
    instanceId: 'instance:test',
    since: '2026-05-09T00:00:00.000Z',
    until: '2026-05-09T00:00:05.000Z',
  });
  assert.equal(diagnosticSummary.total, 2);
  assert.equal(diagnosticSummary.buckets[0].reason, CombatRejectReason.NoRuntimeTargetsInWarningCells);
  assert.equal(diagnosticSummary.buckets[0].count, 2);
  assert.equal(diagnosticSummary.buckets[0].severityCounts.warn, 1);
  assert.equal(diagnosticSummary.buckets[0].severityCounts.error, 1);
  const monsterSkillFailures = queryMonsterSkillFailureReasons(opsEvents, {
    monsterRuntimeId: 'monster:1',
    actionId: 'skill:bad',
  });
  assert.equal(monsterSkillFailures.length, 2);
  assert.equal(monsterSkillFailures[0].createdAt, '2026-05-09T00:00:04.000Z');
  const heatmap = buildCombatAuditHeatmap(opsEvents, { instanceId: 'instance:test' });
  assert.equal(heatmap.length, 1);
  assert.equal(heatmap[0].x, 4);
  assert.equal(heatmap[0].y, 5);
  assert.equal(heatmap[0].count, 2);
  assert.equal(heatmap[0].totalDamage, 10);

  let delegated = false;
  const delegatedResult = await service.dispatchPlayerBasicAttack({
    playerId: 'player:attacker',
    targetPlayerId: 'player:target',
  }, deps, () => {
    delegated = true;
    return 'delegated';
  });
  assert.equal(delegated, true);
  assert.equal(delegatedResult, 'delegated');

  const monsterDiagnostics = [];
  const monsterApply = new WorldRuntimeMonsterActionApplyService(
    { getPlayer: () => null },
    {},
    {},
    service,
  );
  monsterApply.applyMonsterBasicAttack({
    kind: 'basic',
    instanceId: 'instance:test',
    runtimeId: 'monster:1',
    targetPlayerId: 'player:missing',
  }, {
    combatDiagnostics: monsterDiagnostics,
    logger: deps.logger,
    getPlayerLocation: () => null,
  });
  assert.equal(monsterDiagnostics.length, 1);
  assert.equal(monsterDiagnostics[0].reason, CombatRejectReason.MissingTargetLocation);
  assert.equal(monsterDiagnostics[0].actionId, 'basic_attack');
  assert.equal(logs.filter((entry) => entry[0] === 'debug').length, 1);
  assert.equal(logs.filter((entry) => entry[0] === 'log').length, 0);

  const chantDiagnostics = [];
  monsterApply.applyMonsterSkillChant({
    kind: 'skill_chant',
    instanceId: 'instance:test',
    runtimeId: 'monster:1',
  }, {
    combatDiagnostics: chantDiagnostics,
    logger: deps.logger,
    getInstanceRuntime: () => null,
  });
  monsterApply.applyMonsterSkillChant({
    kind: 'skill_chant',
    instanceId: 'instance:test',
    runtimeId: 'monster:1',
    skillId: 'monster:missing',
  }, {
    combatDiagnostics: chantDiagnostics,
    logger: deps.logger,
    getInstanceRuntime: () => null,
  });
  monsterApply.applyMonsterSkillChant({
    kind: 'skill_chant',
    instanceId: 'instance:test',
    runtimeId: 'monster:1',
    skillId: 'monster:missing',
  }, {
    combatDiagnostics: chantDiagnostics,
    logger: deps.logger,
    getInstanceRuntime: () => ({
      getMonster: () => ({ runtimeId: 'monster:1', alive: true, skills: [] }),
    }),
  });
  assert.deepEqual(chantDiagnostics.map((entry) => entry.reason), [
    CombatRejectReason.MissingSkillId,
    CombatRejectReason.MissingInstance,
    CombatRejectReason.MissingSkill,
  ]);
  assert.equal(chantDiagnostics.every((entry) => entry.phase === CombatActionPhase.ChantStart), true);

  const cancelDiagnostics = [];
  monsterApply.applyMonsterAction({
    kind: 'skill_cancel',
    instanceId: 'instance:test',
    runtimeId: 'monster:1',
    skillId: 'monster:chant',
    targetPlayerId: 'player:1',
    cancelReason: CombatPendingCastCancelReason.ConfigRevisionMismatch,
    cancelledTick: 42,
    warningCells: [{ x: 1, y: 1 }],
  }, {
    combatDiagnostics: cancelDiagnostics,
    logger: deps.logger,
  });
  assert.equal(cancelDiagnostics.length, 1);
  assert.equal(cancelDiagnostics[0].reason, CombatRejectReason.PendingCastConfigRevisionMismatch);
  assert.equal(cancelDiagnostics[0].phase, CombatActionPhase.Cancel);
  assert.equal(cancelDiagnostics[0].details.cancelledTick, 42);

  const pendingSkillDiagnostics = [];
  const pendingSkillPlayer = {
    playerId: 'player:caster',
    name: '施法者',
    instanceId: 'instance:test',
    x: 0,
    y: 0,
    hp: 100,
    combat: {
      pendingSkillCast: {
        skillId: 'skill:pending',
        targetX: 50,
        targetY: 50,
        remainingTicks: 1,
      },
    },
    techniques: {
      techniques: [{
        skills: [{
          id: 'skill:pending',
          name: '远处术',
          range: 1,
          targetMode: 'entity',
          effects: [{ type: 'damage' }],
        }],
      }],
    },
  };
  const playerSkillDispatch = new WorldRuntimePlayerSkillDispatchService(
    {
      getPlayer: (playerId) => (playerId === pendingSkillPlayer.playerId ? pendingSkillPlayer : null),
      listPlayerSnapshots: () => [],
    },
    {},
    service,
  );
  const resolvedPending = await playerSkillDispatch.resolvePendingPlayerSkillCast(pendingSkillPlayer.playerId, {
    combatDiagnostics: pendingSkillDiagnostics,
    logger: deps.logger,
    getInstanceRuntimeOrThrow: () => ({
      meta: { canDamageTile: false, supportsPvp: false },
      listMonsters: () => [],
      getTileCombatState: () => null,
    }),
    pushActionLabelEffect: () => {},
  });
  assert.equal(resolvedPending, true);
  assert.equal(pendingSkillPlayer.combat.pendingSkillCast, undefined);
  assert.equal(pendingSkillDiagnostics.some((entry) => (
    entry.reason === CombatRejectReason.NoTargets
    && entry.phase === CombatActionPhase.ChantResolve
  )), true);

  const missingSkillPendingPlayer = {
    playerId: 'player:missing-skill',
    name: '缺技能施法者',
    instanceId: 'instance:test',
    x: 0,
    y: 0,
    hp: 100,
    combat: {
      pendingSkillCast: {
        skillId: 'skill:removed',
        targetX: 0,
        targetY: 0,
        remainingTicks: 1,
      },
    },
    techniques: { techniques: [] },
  };
  const missingSkillPendingDiagnostics = [];
  const missingSkillDispatch = new WorldRuntimePlayerSkillDispatchService(
    {
      getPlayer: (playerId) => (playerId === missingSkillPendingPlayer.playerId ? missingSkillPendingPlayer : null),
      listPlayerSnapshots: () => [],
    },
    {},
    service,
  );
  const resolvedMissingSkillPending = await missingSkillDispatch.resolvePendingPlayerSkillCast(missingSkillPendingPlayer.playerId, {
    combatDiagnostics: missingSkillPendingDiagnostics,
    combatOutcomes: [],
    logger: deps.logger,
    pushActionLabelEffect: () => {},
  });
  assert.equal(resolvedMissingSkillPending, true);
  assert.equal(missingSkillPendingPlayer.combat.pendingSkillCast, undefined);
  assert.equal(missingSkillPendingDiagnostics.length, 1);
  assert.equal(missingSkillPendingDiagnostics[0].reason, CombatRejectReason.MissingSkill);
  assert.equal(missingSkillPendingDiagnostics[0].phase, CombatActionPhase.ChantResolve);

  const resolvingSelfPlayer = {
    playerId: 'player:self-chant',
    name: '自身吟唱者',
    instanceId: 'instance:test',
    x: 0,
    y: 0,
    hp: 100,
    qi: 100,
    attrs: { numericStats: { maxQiOutputPerTick: 999 }, ratioDivisors: {} },
    combat: {
      cooldownReadyTickBySkillId: {},
      pendingSkillCast: createPlayerPendingCombatCast({
        playerId: 'player:self-chant',
        instanceId: 'instance:test',
        skillId: 'skill:self-chant',
        anchor: { x: 0, y: 0 },
        targetRef: 'self',
        remainingTicks: 1,
        startedTick: 20,
        skipProgressThisTick: false,
      }),
    },
    techniques: {
      techniques: [{
        level: 1,
        skills: [{
          id: 'skill:self-chant',
          name: '自身吟唱术',
          range: 1,
          requiresTarget: false,
          targeting: { shape: 'single', maxTargets: 1 },
          effects: [{ type: 'buff', target: 'self', buffId: 'buff:self' }],
        }],
      }],
    },
  };
  const resolvingSelfOutcomes = [];
  const resolvingSelfDispatch = new WorldRuntimePlayerSkillDispatchService(
    {
      getPlayer: (playerId) => (playerId === resolvingSelfPlayer.playerId ? resolvingSelfPlayer : null),
      listPlayerSnapshots: () => [],
    },
    {
      castSelfSkill: () => ({
        skillId: 'skill:self-chant',
        qiCost: 0,
        hitCount: 1,
        targetCount: 1,
        totalDamage: 0,
        totalRawDamage: 0,
      }),
    },
    service,
  );
  const resolvedSelfPending = await resolvingSelfDispatch.resolvePendingPlayerSkillCast(resolvingSelfPlayer.playerId, {
    combatDiagnostics: [],
    combatOutcomes: resolvingSelfOutcomes,
    logger: deps.logger,
    resolveCurrentTickForPlayerId: () => 21,
    getInstanceRuntimeOrThrow: () => ({
      meta: { canDamageTile: false, supportsPvp: false },
      listMonsters: () => [],
      getTileCombatState: () => null,
    }),
    pushActionLabelEffect: () => {},
  });
  assert.equal(resolvedSelfPending, true);
  assert.equal(resolvingSelfPlayer.combat.pendingSkillCast, undefined);
  assert.equal(resolvingSelfOutcomes.length, 1);
  assert.equal(resolvingSelfOutcomes[0].phase, CombatActionPhase.ChantResolve);
  assert.equal(resolvingSelfOutcomes[0].target.kind, CombatTargetKind.Self);

  const resolvingAoeChantPlayer = {
    playerId: 'player:aoe-chant',
    name: '原地吟唱者',
    instanceId: 'instance:test',
    x: 0,
    y: 0,
    hp: 100,
    qi: 100,
    attrs: { numericStats: { maxQiOutputPerTick: 999 }, ratioDivisors: {} },
    combat: {
      cooldownReadyTickBySkillId: {},
      pendingSkillCast: createPlayerPendingCombatCast({
        playerId: 'player:aoe-chant',
        instanceId: 'instance:test',
        skillId: 'skill:center-aoe',
        anchor: { x: 0, y: 0 },
        remainingTicks: 1,
        startedTick: 30,
        skipProgressThisTick: false,
      }),
    },
    techniques: {
      techniques: [{
        level: 1,
        skills: [{
          id: 'skill:center-aoe',
          name: '原地震荡',
          range: 0,
          requiresTarget: false,
          targeting: { shape: 'area', radius: 1, maxTargets: 3 },
          effects: [{ type: 'damage', formula: 1 }],
        }],
      }],
    },
  };
  const aoeMonster = {
    runtimeId: 'monster:aoe-target',
    monsterId: 'monster:aoe-target',
    name: '受击妖兽',
    instanceId: 'instance:test',
    x: 1,
    y: 0,
    hp: 20,
    maxHp: 20,
    alive: true,
    level: 1,
    attrs: {},
    numericStats: {},
    ratioDivisors: {},
    buffs: [],
  };
  const resolvingAoeCalls = [];
  const resolvingAoeOutcomes = [];
  const resolvingAoeDispatch = new WorldRuntimePlayerSkillDispatchService(
    {
      getPlayer: (playerId) => (playerId === resolvingAoeChantPlayer.playerId ? resolvingAoeChantPlayer : null),
      listPlayerSnapshots: () => [],
    },
    {
      castSkillToMonster: (_attacker, target, skillId, currentTick, distance) => {
        resolvingAoeCalls.push(['castSkillToMonster', target.runtimeId, skillId, currentTick, distance]);
        return {
          skillId,
          qiCost: 0,
          hitCount: 1,
          targetCount: 1,
          totalDamage: 0,
          totalRawDamage: 0,
        };
      },
    },
    service,
  );
  const resolvedAoePending = await resolvingAoeDispatch.resolvePendingPlayerSkillCast(resolvingAoeChantPlayer.playerId, {
    combatDiagnostics: [],
    combatOutcomes: resolvingAoeOutcomes,
    logger: deps.logger,
    resolveCurrentTickForPlayerId: () => 31,
    getInstanceRuntimeOrThrow: () => ({
      meta: { canDamageTile: false, supportsPvp: false },
      listMonsters: () => [aoeMonster],
      getMonster: (runtimeId) => (runtimeId === aoeMonster.runtimeId ? aoeMonster : null),
      getMonsterAtTile: (x, y) => (x === aoeMonster.x && y === aoeMonster.y ? aoeMonster : null),
      getTileCombatState: () => null,
    }),
    pushActionLabelEffect: () => {},
  });
  assert.equal(resolvedAoePending, true);
  assert.equal(resolvingAoeChantPlayer.combat.pendingSkillCast, undefined);
  assert.deepEqual(resolvingAoeCalls, [
    ['castSkillToMonster', 'monster:aoe-target', 'skill:center-aoe', 31, 1],
  ]);
  assert.equal(resolvingAoeOutcomes.some((entry) => (
    entry.phase === CombatActionPhase.ChantResolve
    && entry.target.kind === CombatTargetKind.Monster
    && entry.target.id === 'monster:aoe-target'
  )), true);

  const selfRefAoePlayer = {
    playerId: 'player:self-ref-aoe',
    name: '自锚点吟唱者',
    instanceId: 'instance:test',
    x: 0,
    y: 0,
    hp: 100,
    qi: 100,
    attrs: { numericStats: { maxQiOutputPerTick: 999 }, ratioDivisors: {} },
    combat: {
      cooldownReadyTickBySkillId: {},
    },
    actions: {
      actions: [{
        id: 'skill:self-ref-center-aoe',
        type: 'skill',
        requiresTarget: false,
        skillEnabled: true,
      }],
    },
    techniques: {
      techniques: [{
        level: 1,
        skills: [{
          id: 'skill:self-ref-center-aoe',
          name: '自锚点震荡',
          range: 0,
          requiresTarget: false,
          targeting: { shape: 'box', width: 5, height: 5, maxTargets: 3 },
          playerCast: { windupTicks: 1 },
          effects: [{ type: 'damage', formula: 1 }],
        }],
      }],
    },
  };
  const selfRefMonster = {
    runtimeId: 'monster:self-ref-target',
    monsterId: 'monster:self-ref-target',
    name: '自锚点受击妖兽',
    instanceId: 'instance:test',
    x: 2,
    y: 0,
    hp: 20,
    maxHp: 20,
    alive: true,
    level: 1,
    attrs: {},
    numericStats: {},
    ratioDivisors: {},
    buffs: [],
  };
  const selfRefCalls = [];
  const selfRefOutcomes = [];
  const selfRefPlayerRuntime = {
    getPlayer: (playerId) => (playerId === selfRefAoePlayer.playerId ? selfRefAoePlayer : null),
    getPlayerOrThrow: (playerId) => {
      if (playerId === selfRefAoePlayer.playerId) return selfRefAoePlayer;
      throw new Error(`unexpected player ${playerId}`);
    },
    listPlayerSnapshots: () => [],
    recordActivity: () => {},
    spendQi: () => {},
    setSkillCooldownReadyTick: (_playerId, skillId, readyTick) => {
      selfRefAoePlayer.combat.cooldownReadyTickBySkillId[skillId] = readyTick;
    },
  };
  const selfRefDispatch = new WorldRuntimePlayerSkillDispatchService(
    selfRefPlayerRuntime,
    {
      castSkillToMonster: (_attacker, target, skillId, currentTick, distance) => {
        selfRefCalls.push(['castSkillToMonster', target.runtimeId, skillId, currentTick, distance]);
        return {
          skillId,
          qiCost: 0,
          hitCount: 1,
          targetCount: 1,
          totalDamage: 0,
          totalRawDamage: 0,
        };
      },
    },
    service,
  );
  const selfRefInstance = {
    meta: { canDamageTile: false, supportsPvp: false },
    listMonsters: () => [selfRefMonster],
    getMonster: (runtimeId) => (runtimeId === selfRefMonster.runtimeId ? selfRefMonster : null),
    getMonsterAtTile: (x, y) => (x === selfRefMonster.x && y === selfRefMonster.y ? selfRefMonster : null),
    getTileCombatState: () => null,
  };
  await selfRefDispatch.dispatchCastSkill(selfRefAoePlayer.playerId, 'skill:self-ref-center-aoe', null, null, 'self', {
    resolveCurrentTickForPlayerId: () => 40,
    worldRuntimeCraftInterruptService: { interruptCraftForReason: () => {} },
    ensureAttackAllowed: () => {},
    getInstanceRuntimeOrThrow: () => selfRefInstance,
    pushActionLabelEffect: () => {},
  });
  assert.equal(selfRefAoePlayer.combat.pendingSkillCast?.targetRef ?? null, null);
  selfRefAoePlayer.combat.pendingSkillCast.skipProgressThisTick = false;
  const resolvedSelfRefPending = await selfRefDispatch.resolvePendingPlayerSkillCast(selfRefAoePlayer.playerId, {
    combatDiagnostics: [],
    combatOutcomes: selfRefOutcomes,
    logger: deps.logger,
    resolveCurrentTickForPlayerId: () => 41,
    getInstanceRuntimeOrThrow: () => selfRefInstance,
    pushActionLabelEffect: () => {},
  });
  assert.equal(resolvedSelfRefPending, true);
  assert.deepEqual(selfRefCalls, [
    ['castSkillToMonster', 'monster:self-ref-target', 'skill:self-ref-center-aoe', 41, 2],
  ]);
  assert.equal(selfRefOutcomes.some((entry) => (
    entry.phase === CombatActionPhase.ChantResolve
    && entry.target.kind === CombatTargetKind.Monster
    && entry.target.id === 'monster:self-ref-target'
  )), true);

  const staleSkillDiagnostics = [];
  const staleSkillOutcomes = [];
  const staleSkillAttacker = {
    playerId: 'player:stale-caster',
    name: '执行阶段施法者',
    instanceId: 'instance:test',
    x: 0,
    y: 0,
    hp: 100,
  };
  const staleSkillDispatch = new WorldRuntimePlayerSkillDispatchService(
    {
      getPlayer: (playerId) => {
        if (playerId === staleSkillAttacker.playerId) {
          return staleSkillAttacker;
        }
        if (playerId === 'player:other-instance') {
          return { playerId, instanceId: 'instance:other', x: 1, y: 0, hp: 100 };
        }
        return null;
      },
      listPlayerSnapshots: () => [],
    },
    {},
    service,
  );
  await assert.rejects(
    () => staleSkillDispatch.dispatchSkillTargets(staleSkillAttacker, 'skill:stale', {
      id: 'skill:stale',
      name: '执行阶段检测术',
      range: 3,
      targetMode: 'any',
      effects: [{ type: 'damage' }],
    }, [
      { kind: 'monster', monsterId: 'monster:missing' },
      { kind: 'player', playerId: 'player:other-instance' },
      { kind: 'formation', formationId: 'formation:missing' },
      { kind: 'formation_boundary', formationId: 'formation:missing', x: 2, y: 0 },
      { kind: 'tile', x: 3, y: 0 },
    ], {
      combatDiagnostics: staleSkillDiagnostics,
      combatOutcomes: staleSkillOutcomes,
      logger: deps.logger,
      getInstanceRuntimeOrThrow: () => ({
        getMonster: () => null,
        getTileCombatState: () => ({ destroyed: true }),
      }),
      resolveCurrentTickForPlayerId: () => 1,
      pushActionLabelEffect: () => {},
      worldRuntimeFormationService: {
        getFormationCombatState: () => null,
        getBoundaryBarrierCombatState: () => null,
      },
    }, { showActionLabel: false }),
    /没有可命中的目标/,
  );
  assert.equal(staleSkillOutcomes.length, 0);
  assert.equal(staleSkillDiagnostics.length, 5);
  assert.ok(staleSkillDiagnostics.some((entry) => entry.reason === CombatRejectReason.MissingMonster));
  assert.ok(staleSkillDiagnostics.some((entry) => entry.reason === CombatRejectReason.TargetInstanceMismatch));
  assert.equal(staleSkillDiagnostics.filter((entry) => entry.reason === CombatRejectReason.MissingTargetRuntimeState).length, 2);
  assert.ok(staleSkillDiagnostics.some((entry) => entry.reason === CombatRejectReason.MapCapabilityDisabled));
  assert.equal(staleSkillDiagnostics.every((entry) => entry.phase === CombatActionPhase.ChantResolve), true);
  assert.ok(staleSkillDiagnostics.some((entry) => entry.details.targetRef === 'player:player:other-instance'));
  assert.ok(staleSkillDiagnostics.some((entry) => entry.details.capability === 'canDamageTile'));

  let monsterTargetHpReads = 0;
  const monsterSkillTarget = {
    playerId: 'player:monster-skill-target',
    instanceId: 'instance:test',
    x: 12,
    y: 8,
    get hp() {
      monsterTargetHpReads += 1;
      return monsterTargetHpReads === 1 ? 100 : 0;
    },
  };
  const monsterSkillDiagnostics = [];
  const monsterSkillOutcomes = [];
  const monsterSkillApply = new WorldRuntimeMonsterActionApplyService(
    {
      getPlayer: (playerId) => (playerId === monsterSkillTarget.playerId ? monsterSkillTarget : null),
      applyTemporaryBuff: () => {},
      recordActivity: () => {},
      activateAutoRetaliate: () => {},
    },
    {
      castMonsterSkill: () => {
        throw new Error('stale monster skill target should not be settled');
      },
    },
    {
      pushActionLabelEffect: () => {},
      pushAttackEffect: () => {},
      pushDamageFloatEffect: () => {},
      pushCombatTextFloatEffect: () => {},
    },
    service,
  );
  monsterSkillApply.applyMonsterSkill({
    kind: 'skill',
    instanceId: 'instance:test',
    runtimeId: 'monster:caster',
    targetPlayerId: monsterSkillTarget.playerId,
    skillId: 'monster:stale_skill',
    targetX: 12,
    targetY: 8,
    warningCells: [{ x: 12, y: 8 }],
  }, {
    combatDiagnostics: monsterSkillDiagnostics,
    combatOutcomes: monsterSkillOutcomes,
    logger: deps.logger,
    getInstanceRuntime: () => ({
      tick: 7,
      getMonster: () => ({
        runtimeId: 'monster:caster',
        monsterId: 'monster:caster',
        name: '跳过检测妖',
        alive: true,
        x: 10,
        y: 8,
        hp: 100,
        maxHp: 100,
        qi: 20,
        maxQi: 20,
        level: 1,
        skills: [{
          id: 'monster:stale_skill',
          name: '跳过检测术',
          range: 4,
          targeting: { shape: 'single', maxTargets: 1 },
          effects: [{ type: 'damage' }],
        }],
        cooldownReadyTickBySkillId: {},
        attrs: {},
        numericStats: {},
        ratioDivisors: {},
        buffs: [],
      }),
      getPlayerPosition: () => ({ x: 12, y: 8 }),
      getPlayersAtTile: () => [{ playerId: monsterSkillTarget.playerId }],
      canSeeTileFrom: () => true,
      markMonsterRuntimePersistenceDirty: () => {},
    }),
    getPlayerLocation: () => ({ instanceId: 'instance:test', x: 12, y: 8 }),
    queuePlayerNotice: () => {},
    handlePlayerDefeat: () => {},
  });
  assert.equal(monsterSkillOutcomes.length, 0);
  assert.equal(monsterSkillDiagnostics.length, 2);
  assert.equal(monsterSkillDiagnostics[0].reason, CombatRejectReason.TargetDead);
  assert.equal(monsterSkillDiagnostics[0].details.targetPlayerId, monsterSkillTarget.playerId);
  assert.equal(monsterSkillDiagnostics[1].reason, CombatRejectReason.MissingTargetRuntimeState);
  assert.equal(monsterSkillDiagnostics[1].details.skippedTargets[0].reason, CombatRejectReason.TargetDead);

  console.log('world-runtime-combat-action-service-smoke ok');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
