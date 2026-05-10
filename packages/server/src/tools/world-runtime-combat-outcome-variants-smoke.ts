// @ts-nocheck

/**
 * 用途：验证统一战斗编排器的 outcomeResult 字段对 dodged / immune / resisted /
 * blocked / hit / no_damage 六种结局都能一致分派到 aoiEvent.result 和 audit.result，
 * 并且审计记录的 action/outcomeResult 可按 outcome 语义查询。
 *
 * 作为验证矩阵补齐的一部分：覆盖"闪避/免疫/未造成伤害"统一协议表达，不依赖真实 socket。
 */

const assert = require('node:assert/strict');

const {
  WorldRuntimeCombatActionService,
} = require('../runtime/world/combat/world-runtime-combat-action.service');
const { CombatActionKind, CombatTargetKind } = require('../runtime/world/combat/combat-action.types');
const { installSmokeTimeout } = require('./smoke-timeout');

installSmokeTimeout(__filename);

function buildAction(service, actor) {
  return service.createPlayerSkillAction({
    playerId: actor.playerId,
    instanceId: actor.instanceId,
    skillId: 'skill.qingmu_slash',
    targetMonsterId: 'monster:1',
  });
}

function runOutcomeVariant(service, expected) {
  const outcomes = [];
  const combatEvents = [];
  const actor = {
    playerId: 'player:outcome_variant',
    instanceId: 'instance:outcome',
    maxHp: 100,
    hp: 100,
  };
  const action = buildAction(service, actor);
  const outcomeInput = expected.input;
  const outcome = service.recordMonsterActionOutcome({
    combatOutcomes: outcomes,
    combatEvents,
  }, action, { kind: CombatTargetKind.Monster, id: 'monster:1' }, outcomeInput, {
    buildEvents: true,
    eventContext: { playerId: actor.playerId, tags: ['outcome-variant', expected.key] },
  });
  assert.equal(outcome.ok, true, `outcome should be ok for ${expected.key}`);
  assert.equal(outcomes.length, 1, `outcome recorded for ${expected.key}`);
  assert.equal(combatEvents.length, 1, `combat event emitted for ${expected.key}`);
  assert.equal(outcomes[0].result.outcomeResult, expected.key, `outcomeResult=${expected.key}`);
  assert.equal(combatEvents[0].aoiEvent.result, expected.key, `aoiEvent.result=${expected.key}`);
  assert.equal(combatEvents[0].auditEvent.result.outcomeResult, expected.key, `audit outcomeResult=${expected.key}`);
  return {
    outcomeResult: outcomes[0].result.outcomeResult,
    aoiResult: combatEvents[0].aoiEvent.result,
    auditResult: combatEvents[0].auditEvent.result.outcomeResult,
  };
}

function main() {
  const service = new WorldRuntimeCombatActionService();

  const variants = [
    { key: 'dodged', input: { damage: 0, dodged: true } },
    { key: 'immune', input: { damage: 0, immune: true } },
    { key: 'resisted', input: { damage: 0, resisted: true } },
    { key: 'blocked', input: { damage: 2, blocked: true } },
    { key: 'hit', input: { damage: 7, rawDamage: 9 } },
    { key: 'no_damage', input: { damage: 0 } },
  ];

  const results = variants.map((variant) => ({
    variant: variant.key,
    ...runOutcomeVariant(service, variant),
  }));

  // 进一步验证：审计查询能按 outcome 语义枚举。
  const recent = service.listCombatEvents(32);
  assert.equal(recent.length >= variants.length, true, 'expected runtime event ring to retain all variants');
  const seenResults = new Set(recent.map((event) => event.aoiEvent.result));
  for (const variant of variants) {
    assert.equal(seenResults.has(variant.key), true, `event ring must expose ${variant.key}`);
  }

  // 命中场景的伤害字段应该落到 damage / rawDamage 审计侧。
  const hitEvent = recent.find((event) => event.aoiEvent.result === 'hit');
  assert.equal(hitEvent.auditEvent.result.damage, 7);
  assert.equal(hitEvent.auditEvent.result.rawDamage, 9);

  // 闪避场景在 outcome.effects 里保留 damage:0 + dodged:true，供下游 UI 判定。
  const dodgedEvent = recent.find((event) => event.aoiEvent.result === 'dodged');
  assert.equal(dodgedEvent.auditEvent.result.damage, 0);
  assert.equal(dodgedEvent.auditEvent.result.dodged, true);

  console.log(JSON.stringify({
    ok: true,
    case: 'world-runtime-combat-outcome-variants',
    variants: results,
    answers: '统一战斗 outcomeResult 映射 dodged/immune/resisted/blocked/hit/no_damage 六类均能正确写入 outcome、aoiEvent 和 auditEvent',
    excludes: '不证明生产 S2C envelope 已按 outcome 分层发包，也不证明真实玩家客户端能识别',
  }, null, 2));
}

main();
