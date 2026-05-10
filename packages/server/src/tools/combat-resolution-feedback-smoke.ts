import assert from 'node:assert/strict';

import {
  cloneNumericRatioDivisors,
  cloneNumericStats,
  DEFAULT_PLAYER_REALM_STAGE,
  PLAYER_REALM_NUMERIC_TEMPLATES,
} from '@mud/shared';

import { PlayerCombatService } from '../runtime/combat/player-combat.service';
import {
  formatCombatResolutionFloatText,
  formatCombatResolutionOutcome,
} from '../runtime/world/query/world-runtime.observation.helpers';
import { WorldRuntimeCombatEffectsService } from '../runtime/world/combat/world-runtime-combat-effects.service';
import { emitCombatPresentation } from '../runtime/world/combat/world-runtime-combat-presentation.helpers';

function createCombatStats(overrides: Record<string, unknown> = {}) {
  return {
    ...cloneNumericStats(PLAYER_REALM_NUMERIC_TEMPLATES[DEFAULT_PLAYER_REALM_STAGE].stats),
    ...overrides,
  };
}

function createCombatant(overrides: Record<string, unknown> = {}) {
  return {
    playerId: 'combatant',
    hp: 100,
    maxHp: 100,
    qi: 100,
    maxQi: 100,
    realm: { realmLv: 1 },
    realmLv: 1,
    combatExp: 0,
    attrs: {
      finalAttrs: {
        constitution: 1,
        spirit: 1,
        perception: 1,
        talent: 1,
        strength: 1,
        meridians: 1,
      },
      numericStats: createCombatStats(),
      ratioDivisors: cloneNumericRatioDivisors(PLAYER_REALM_NUMERIC_TEMPLATES[DEFAULT_PLAYER_REALM_STAGE].ratioDivisors),
    },
    buffs: [],
    ...overrides,
  };
}

function testSkillResolutionKeepsDodgedFeedback(): void {
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const service = new PlayerCombatService({} as never);
    const attacker = createCombatant({
      playerId: 'player:attacker',
      attrs: {
        ...createCombatant().attrs,
        numericStats: createCombatStats({
          spellAtk: 10,
          hit: 0,
          crit: 0,
          breakPower: 0,
        }),
      },
    });
    const target = createCombatant({
      playerId: 'monster:target',
      attrs: {
        ...createCombatant().attrs,
        numericStats: createCombatStats({
          maxHp: 100,
          dodge: 1000,
          antiCrit: 0,
          resolvePower: 0,
        }),
      },
    });
    const result = service.executeResolvedSkillCast(
      attacker as never,
      target as never,
      {
        skill: {
          id: 'skill.feedback_smoke',
          name: '反馈测试',
          cost: 0,
          cooldown: 0,
          range: 1,
          effects: [{
            type: 'damage',
            damageKind: 'spell',
            formula: 10,
          }],
        },
        level: 1,
        readyTick: 0,
      } as never,
      1,
      1,
      {
        setCooldownReadyTick: () => undefined,
      } as never,
    );

    assert.equal(result.totalDamage, 0);
    assert.equal(result.dodged, true);
    assert.equal(result.damageRolls.length, 1);
    assert.equal(result.damageRolls[0].dodged, true);
    assert.equal(formatCombatResolutionFloatText(result.damageRolls[0]), '闪避');
    assert.match(formatCombatResolutionOutcome(result.damageRolls[0], 'spell', undefined), /闪避/);
  }
  finally {
    Math.random = originalRandom;
  }
}

function testCombatPresentationSuppressesJudgementFloatText(): void {
  const service = new WorldRuntimeCombatEffectsService();
  const notices: string[] = [];
  emitCombatPresentation({
    deps: {
      worldRuntimeCombatEffectsService: service,
      queuePlayerNotice(_playerId: string, text: string) {
        notices.push(text);
      },
    },
    instanceId: 'instance:feedback',
    actionLabel: { x: 1, y: 2, text: '攻击' },
    resolutionFloat: { x: 1, y: 2, resolution: { dodged: true, damage: 0 }, fallbackColor: '#7dd3fc' },
    notices: [{ playerId: 'player:1', text: '你对目标发起攻击，被闪避，未造成伤害。' }],
  });
  assert.deepEqual(service.getCombatEffects('instance:feedback'), [{
    type: 'float',
    x: 1,
    y: 2,
    text: '攻击',
    color: '#efe3c2',
    variant: 'action',
    actionStyle: undefined,
    durationMs: undefined,
  }]);
  assert.equal(notices[0], '你对目标发起攻击，被闪避，未造成伤害。');
}

function main(): void {
  testSkillResolutionKeepsDodgedFeedback();
  testCombatPresentationSuppressesJudgementFloatText();
  console.log(JSON.stringify({
    ok: true,
    case: 'combat-resolution-feedback',
    answers: '技能结算仍保留闪避/破招/拆招/暴击判定并写入战斗日志；地图飘字保留攻击/技能名和实际伤害数字，不再发送判定短文本。',
  }, null, 2));
}

main();
