// @ts-nocheck

import assert from 'node:assert/strict';

import { installSmokeTimeout } from './smoke-timeout';
import { WorldRuntimeCombatActionService } from '../runtime/world/combat/world-runtime-combat-action.service';
import {
  CombatActorKind,
  CombatActionKind,
  CombatActionPhase,
  CombatEffectKind,
  CombatRejectReason,
  CombatTargetKind,
} from '../runtime/world/combat/combat-action.types';
import { createCombatOutcomeApplyAdapters } from '../runtime/combat/combat-outcome-apply-adapters';

installSmokeTimeout(__filename);

function main(): void {
  const service = new WorldRuntimeCombatActionService();
  const adapters = createCombatOutcomeApplyAdapters();
  const cases = [
    verifyMonsterKillLootProgress(service, adapters),
    verifyPlayerDeathRetaliate(service, adapters),
    verifyAutoRetaliateDisabledKeepsNavigation(service, adapters),
    verifyAutoRetaliateEnabledClearsNavigation(service, adapters),
    verifyTileDestroyPersistence(service, adapters),
    verifyFormationAuraDamage(service, adapters),
    verifyContainerConsumeRefresh(service, adapters),
    verifyBuffHealAndNoTarget(service, adapters),
    verifyDirtyDomainFlushStrategy(service),
  ];

  console.log(JSON.stringify({
    ok: true,
    case: 'combat-e2e-outcome-matrix',
    cases,
    answers: '统一 applyCombatOutcome 矩阵覆盖击杀+掉落/经验脏域、死亡+反击、地块破坏、阵法扣灵力、容器扣次数+刷新、buff/治疗 outcome 和无目标拒绝；所有成功结果只输出 dirtyDomains/persistenceTransfer，不在 tick 内写库',
    excludes: '不证明真实 HTTP/socket 客户端流程、Redis pending cast 恢复、真实数据库 flush worker 已提交，也不证明旧生产 wrapper 已删除',
  }, null, 2));
}

function verifyMonsterKillLootProgress(service, adapters) {
  const events = [];
  const calls = [];
  const instance = {
    applyDamageToMonster(runtimeId, damage, attackerId) {
      calls.push(['applyDamageToMonster', runtimeId, damage, attackerId]);
      return {
        appliedDamage: damage,
        defeated: true,
        monster: { runtimeId, monsterId: 'monster:matrix', name: '矩阵妖兽' },
      };
    },
  };
  const result = service.applyCombatOutcome({
    actor: { kind: CombatActorKind.Player, id: 'player:killer' },
    actionId: 'attack:basic',
    phase: CombatActionPhase.Instant,
    instanceId: 'instance:matrix',
    target: { kind: CombatTargetKind.Monster, id: 'monster:matrix:1', x: 5, y: 6 },
    result: { damage: 99, rawDamage: 120, defeated: true },
    deps: {
      instance,
      combatEvents: events,
      handlePlayerMonsterKill(targetInstance, monster, playerId) {
        calls.push(['handlePlayerMonsterKill', targetInstance === instance, monster?.runtimeId, playerId]);
      },
    },
    adapters,
    record: true,
    mergeAdapterResultToOutcome: true,
    recordOptions: { playerId: 'player:killer', tags: ['matrix', 'kill_loot_progress'] },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.dirtyDomains, ['instance:monster_runtime', 'instance:ground_items', 'player:progression']);
  assert.equal(result.application.persistenceTransfer, 'dirty_domain_flush');
  assert.equal(result.application.writesDatabaseInTick, false);
  assert.deepEqual(calls, [
    ['applyDamageToMonster', 'monster:matrix:1', 99, 'player:killer'],
    ['handlePlayerMonsterKill', true, 'monster:matrix:1', 'player:killer'],
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].auditEvent.result.defeated, true);
  return {
    name: 'kill_loot_progress',
    dirtyDomains: result.dirtyDomains,
    eventResult: events[0].aoiEvent.result,
  };
}

function verifyPlayerDeathRetaliate(service, adapters) {
  const events = [];
  const calls = [];
  const result = service.applyCombatOutcome({
    actor: { kind: CombatActorKind.Monster, id: 'monster:attacker' },
    actionId: 'monster:claw',
    phase: CombatActionPhase.Instant,
    instanceId: 'instance:matrix',
    target: { kind: CombatTargetKind.Player, id: 'player:victim', x: 3, y: 4 },
    result: {
      damage: 40,
      defeated: true,
      autoRetaliate: true,
      retaliatePlayerTargetId: 'monster:attacker',
    },
    deps: {
      combatEvents: events,
      playerRuntimeService: {
        setRetaliatePlayerTarget(playerId, targetId) {
          calls.push(['setRetaliatePlayerTarget', playerId, targetId]);
        },
        applyDamage(playerId, damage, attackerId) {
          calls.push(['applyDamage', playerId, damage, attackerId]);
          return damage;
        },
        recordActivity(playerId) {
          calls.push(['recordActivity', playerId]);
        },
        activateAutoRetaliate(playerId) {
          calls.push(['activateAutoRetaliate', playerId]);
        },
      },
      handlePlayerDefeat(playerId, attackerId) {
        calls.push(['handlePlayerDefeat', playerId, attackerId]);
        return true;
      },
    },
    adapters,
    record: true,
    mergeAdapterResultToOutcome: true,
    recordOptions: { playerId: 'player:victim', tags: ['matrix', 'death_retaliate'] },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.dirtyDomains, ['player:vitals', 'player:death']);
  assert.equal(calls.some((entry) => entry[0] === 'activateAutoRetaliate'), true);
  assert.equal(calls.some((entry) => entry[0] === 'handlePlayerDefeat'), true);
  assert.equal(events[0].auditEvent.result.handledDefeat, true);
  return {
    name: 'death_retaliate',
    dirtyDomains: result.dirtyDomains,
    handledDefeat: events[0].auditEvent.result.handledDefeat,
  };
}

function verifyAutoRetaliateDisabledKeepsNavigation(service, adapters) {
  const calls = [];
  const player = {
    playerId: 'player:pathing',
    hp: 100,
    combat: {
      autoBattle: false,
      autoRetaliate: false,
    },
  };
  const result = service.applyCombatOutcome({
    actor: { kind: CombatActorKind.Monster, id: 'monster:ambusher' },
    actionId: 'monster:claw',
    phase: CombatActionPhase.Instant,
    instanceId: 'instance:matrix',
    target: { kind: CombatTargetKind.Player, id: player.playerId, x: 3, y: 4 },
    result: {
      damage: 1,
      autoRetaliate: true,
      defeated: false,
      applyDefeat: false,
    },
    deps: {
      playerRuntimeService: {
        getPlayer(playerId) {
          calls.push(['getPlayer', playerId]);
          return player;
        },
        applyDamage(playerId, damage, attackerId) {
          calls.push(['applyDamage', playerId, damage, attackerId]);
          return damage;
        },
        recordActivity(playerId) {
          calls.push(['recordActivity', playerId]);
        },
        activateAutoRetaliate(playerId) {
          calls.push(['activateAutoRetaliate', playerId]);
          return player;
        },
      },
      worldRuntimeNavigationService: {
        clearNavigationIntent(playerId) {
          calls.push(['clearNavigationIntent', playerId]);
        },
      },
    },
    adapters,
    mergeAdapterResultToOutcome: true,
  });

  assert.equal(result.ok, true);
  assert.equal(calls.some((entry) => entry[0] === 'activateAutoRetaliate'), true);
  assert.equal(calls.some((entry) => entry[0] === 'clearNavigationIntent'), false);
  return {
    name: 'auto_retaliate_disabled_keeps_navigation',
    navigationCleared: false,
  };
}

function verifyAutoRetaliateEnabledClearsNavigation(service, adapters) {
  const calls = [];
  const player = {
    playerId: 'player:retaliator',
    hp: 100,
    combat: {
      autoBattle: false,
      autoRetaliate: true,
    },
  };
  const result = service.applyCombatOutcome({
    actor: { kind: CombatActorKind.Monster, id: 'monster:ambusher' },
    actionId: 'monster:claw',
    phase: CombatActionPhase.Instant,
    instanceId: 'instance:matrix',
    target: { kind: CombatTargetKind.Player, id: player.playerId, x: 3, y: 4 },
    result: {
      damage: 1,
      autoRetaliate: true,
      defeated: false,
      applyDefeat: false,
    },
    deps: {
      playerRuntimeService: {
        getPlayer(playerId) {
          calls.push(['getPlayer', playerId]);
          return player;
        },
        applyDamage(playerId, damage, attackerId) {
          calls.push(['applyDamage', playerId, damage, attackerId]);
          return damage;
        },
        recordActivity(playerId) {
          calls.push(['recordActivity', playerId]);
        },
        activateAutoRetaliate(playerId) {
          calls.push(['activateAutoRetaliate', playerId]);
          player.combat.autoBattle = true;
          return player;
        },
      },
      worldRuntimeNavigationService: {
        clearNavigationIntent(playerId) {
          calls.push(['clearNavigationIntent', playerId]);
        },
      },
    },
    adapters,
    mergeAdapterResultToOutcome: true,
  });

  assert.equal(result.ok, true);
  assert.equal(calls.some((entry) => entry[0] === 'activateAutoRetaliate'), true);
  assert.equal(calls.some((entry) => entry[0] === 'clearNavigationIntent'), true);
  return {
    name: 'auto_retaliate_enabled_clears_navigation',
    navigationCleared: true,
  };
}

function verifyTileDestroyPersistence(service, adapters) {
  const events = [];
  const calls = [];
  const instance = {
    damageTile(x, y, damage) {
      calls.push(['damageTile', x, y, damage]);
      return { appliedDamage: damage, destroyed: true };
    },
  };
  const result = service.applyCombatOutcome({
    actor: { kind: CombatActorKind.Player, id: 'player:breaker' },
    actionId: 'attack:tile',
    instanceId: 'instance:matrix',
    target: { kind: CombatTargetKind.Tile, x: 7, y: 8 },
    result: { damage: 12, destroyed: true },
    deps: {
      instance,
      combatEvents: events,
      worldRuntimeSectService: {
        expandSectForDestroyedTile(instanceId, x, y) {
          calls.push(['expandSectForDestroyedTile', instanceId, x, y]);
        },
      },
    },
    adapters,
    record: true,
    mergeAdapterResultToOutcome: true,
    recordOptions: { playerId: 'player:breaker', tags: ['matrix', 'tile_destroy'] },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.dirtyDomains, ['instance:tile_damage']);
  assert.equal(events[0].auditEvent.result.destroyed, true);
  assert.deepEqual(calls, [
    ['damageTile', 7, 8, 12],
    ['expandSectForDestroyedTile', 'instance:matrix', 7, 8],
  ]);
  return {
    name: 'tile_destroy_restore_domain',
    dirtyDomains: result.dirtyDomains,
    destroyed: events[0].auditEvent.result.destroyed,
  };
}

function verifyFormationAuraDamage(service, adapters) {
  const calls = [];
  const result = service.applyCombatOutcome({
    actor: { kind: CombatActorKind.Player, id: 'player:formation-attacker' },
    actionId: 'attack:formation',
    instanceId: 'instance:matrix',
    target: { kind: CombatTargetKind.Formation, id: 'formation:1', x: 9, y: 9 },
    result: { damage: 30, auraDamage: 30 },
    deps: {
      worldRuntimeFormationService: {
        applyDamageToFormation(instanceId, formationId, damage, attackerId) {
          calls.push(['applyDamageToFormation', instanceId, formationId, damage, attackerId]);
          return { appliedDamage: damage, auraDamage: 30 };
        },
      },
    },
    adapters,
    mergeAdapterResultToOutcome: true,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.dirtyDomains, ['instance:formation']);
  assert.equal(result.outcome.result.auraDamage, 30);
  assert.deepEqual(calls, [
    ['applyDamageToFormation', 'instance:matrix', 'formation:1', 30, 'player:formation-attacker'],
  ]);
  return {
    name: 'formation_aura_damage',
    dirtyDomains: result.dirtyDomains,
    auraDamage: result.outcome.result.auraDamage,
  };
}

function verifyContainerConsumeRefresh(service, adapters) {
  const calls = [];
  const container = { id: 'herb:1', variant: 'herb', name: '凝露草', x: 2, y: 3 };
  const result = service.applyCombatOutcome({
    actor: { kind: CombatActorKind.Player, id: 'player:gather-hit' },
    actionId: 'attack:container',
    instanceId: 'instance:matrix',
    target: { kind: CombatTargetKind.Container, id: container.id, x: 2, y: 3, runtime: container },
    result: { damage: 1, currentTick: 100 },
    deps: {
      worldRuntimeLootContainerService: {
        damageAttackableContainerAtTile(instanceId, targetContainer, currentTick) {
          calls.push(['damageAttackableContainerAtTile', instanceId, targetContainer.id, currentTick]);
          return {
            title: targetContainer.name,
            appliedDamage: 1,
            remainingCount: 0,
            respawnRemainingTicks: 60,
            consumed: true,
          };
        },
      },
    },
    adapters,
    mergeAdapterResultToOutcome: true,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.dirtyDomains, ['instance:container']);
  assert.equal(result.outcome.result.consumed, true);
  assert.equal(result.outcome.result.remainingCount, 0);
  assert.equal(result.outcome.result.respawnRemainingTicks, 60);
  assert.deepEqual(calls, [
    ['damageAttackableContainerAtTile', 'instance:matrix', 'herb:1', 100],
  ]);
  return {
    name: 'container_consume_refresh',
    dirtyDomains: result.dirtyDomains,
    respawnRemainingTicks: result.outcome.result.respawnRemainingTicks,
  };
}

function verifyBuffHealAndNoTarget(service, adapters) {
  const calls = [];
  const buffResult = service.applyCombatOutcome({
    actor: { kind: CombatActorKind.Player, id: 'player:support' },
    actionId: 'skill:buff',
    instanceId: 'instance:matrix',
    target: { kind: CombatTargetKind.Player, id: 'player:support', x: 1, y: 1 },
    result: {
      damage: 0,
      effects: [
        { kind: CombatEffectKind.Buff, type: CombatEffectKind.Buff },
        { kind: CombatEffectKind.Heal, type: CombatEffectKind.Heal, amount: 10 },
      ],
      buff: { buffId: 'buff:matrix', remainingTicks: 3, stacks: 1 },
    },
    deps: {
      playerRuntimeService: {
        applyTemporaryBuff(playerId, buff) {
          calls.push(['applyTemporaryBuff', playerId, buff.buffId]);
        },
        recordActivity(playerId) {
          calls.push(['recordActivity', playerId]);
        },
      },
    },
    adapters,
  });
  assert.equal(buffResult.ok, true);
  assert.deepEqual(buffResult.dirtyDomains, ['player:vitals', 'player:buff', 'player:attr']);
  assert.deepEqual(buffResult.application.effectKinds, [
    CombatEffectKind.Damage,
    CombatEffectKind.Buff,
    CombatEffectKind.Heal,
  ]);
  assert.equal(calls.some((entry) => entry[0] === 'applyTemporaryBuff'), true);

  const reject = service.recordReject({
    combatDiagnostics: [],
    logger: { warn() {}, debug() {}, log() {} },
  }, {
    ok: false,
    phase: CombatActionPhase.Instant,
    reason: CombatRejectReason.NoTargets,
    actor: { kind: CombatActorKind.Player, id: 'player:support' },
    actionId: 'skill:no-target',
    instanceId: 'instance:matrix',
    target: { kind: CombatTargetKind.Empty },
    details: { targetCount: 0 },
    createdAt: new Date().toISOString(),
  });
  assert.equal(reject.reason, CombatRejectReason.NoTargets);
  assert.equal(reject.target.kind, CombatTargetKind.Empty);
  return {
    name: 'buff_heal_no_target',
    dirtyDomains: buffResult.dirtyDomains,
    effectKinds: buffResult.application.effectKinds,
    rejectReason: reject.reason,
  };
}

function verifyDirtyDomainFlushStrategy(service) {
  const matrix = [
    {
      name: 'player_damage',
      actor: { kind: CombatActorKind.Monster, id: 'monster:1' },
      target: { kind: CombatTargetKind.Player, id: 'player:1' },
      result: { damage: 1 },
      expected: ['player:vitals'],
    },
    {
      name: 'monster_resource_commit',
      actor: { kind: CombatActorKind.Monster, id: 'monster:1' },
      target: { kind: CombatTargetKind.Player, id: 'player:1' },
      result: { damage: 1, resourceSpent: true, cooldownWritten: true },
      expected: ['player:vitals', 'instance:monster_runtime'],
    },
    {
      name: 'player_resource_commit',
      actor: { kind: CombatActorKind.Player, id: 'player:1' },
      target: { kind: CombatTargetKind.Monster, id: 'monster:1' },
      result: { damage: 1, resourceSpent: true, cooldownWritten: true },
      expected: ['instance:monster_runtime', 'player:combat'],
    },
    {
      name: 'explicit_domains_override',
      actor: { kind: CombatActorKind.Player, id: 'player:1' },
      target: { kind: CombatTargetKind.Tile, x: 1, y: 1 },
      result: { damage: 1, dirtyDomains: ['instance:tile_damage', 'instance:tile_damage'] },
      expected: ['instance:tile_damage'],
    },
  ];
  for (const entry of matrix) {
    const application = service.createCombatResultApplication({
      actor: entry.actor,
      target: entry.target,
      result: entry.result,
      actionId: 'matrix:dirty-domain',
      kind: CombatActionKind.Skill,
    });
    assert.deepEqual(application.dirtyDomains, entry.expected, entry.name);
    assert.equal(application.persistenceTransfer, 'dirty_domain_flush');
    assert.equal(application.writesDatabaseInTick, false);
    assert.equal(application.appliesOnlySettledOutcome, true);
  }
  return {
    name: 'dirty_domain_flush_strategy',
    cases: matrix.map((entry) => entry.name),
  };
}

main();
