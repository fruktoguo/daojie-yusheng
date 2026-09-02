import assert from 'node:assert/strict';

import {
  createEmptyCraftEffectStats,
  getTechniquePassiveExpToNext,
  getTechniquePassiveSkillStrengthMultiplier,
  getTechniqueTrainingMaxLevel,
  getPlayerEnabledSkillSlotLimitByLevel,
  isPassiveOnlySkill,
  isPassiveTechnique,
  isTechniqueFullyMastered,
  type SkillDef,
  getSkillPassiveEffects,
} from '@mud/shared';
import {
  addEnabledSkillPassiveCraftEffects,
  collectEnabledCultivationTileQiPassives,
  collectEnabledSkillPassiveBuffs,
} from '../runtime/player/player-skill-passive.helpers';
import { resolveCultivationPassiveTileQiAmount } from '../runtime/player/player-cultivation-passive.helpers';
import { projectVisiblePlayerBuffs } from '../runtime/player/player-buff-projection.helpers';
import { resolvePlayerQiResourceProjection } from '../runtime/world/world-runtime-qi-projection.helpers';
import { ContentTemplateRepository } from '../content/content-template.repository';

function createPassiveSkill(overrides: Partial<SkillDef> = {}): SkillDef {
  return {
    id: 'skill.passive.test',
    name: '被动测试',
    desc: '被动测试技能',
    cooldown: 0,
    cost: 0,
    range: 0,
    effects: [],
    unlockLevel: 1,
    active: false,
    passiveEffects: [
      {
        type: 'buff',
        buffId: 'passive.test.buff',
        name: '被动测试投影',
        shortMark: '被',
        stats: { physAtk: 12, spellAtk: -4 },
        statMode: 'percent',
        qiProjection: [
          {
            selector: { families: ['aura'], elements: ['yang'] },
            visibility: 'absorbable',
            efficiencyBpMultiplier: 10100,
          },
        ],
        craftEffectStats: {
          alchemy: { speedRate: 0.12 },
          gather: { speedRate: 0.08 },
        },
      },
      {
        type: 'cultivation_tile_qi',
        resourceKey: 'aura.refined.yang',
        radius: 1,
        amountSource: 'max_qi_output_sqrt',
      },
    ],
    ...overrides,
  };
}

function createPlayer(level = 1) {
  return {
    playerId: 'player:passive-smoke',
    realmLv: 23,
    combat: {
      cultivationActive: true,
      autoBattleSkills: [
        { skillId: 'skill.passive.test', skillEnabled: true },
        { skillId: 'skill.passive.disabled', skillEnabled: false },
      ],
    },
    techniques: {
      revision: 1,
      techniques: [
        {
          techId: 'passive_test_technique',
          name: '测试被动功法',
          level,
          realmLv: 23,
          skills: [
            createPassiveSkill(),
            createPassiveSkill({ id: 'skill.passive.locked', unlockLevel: 9 }),
            createPassiveSkill({ id: 'skill.passive.disabled' }),
          ],
        },
      ],
    },
    buffs: { buffs: [] },
    attrs: { numericStats: { viewRange: 5, maxQiOutputPerTick: 100 } },
  };
}

function testEnabledPassiveBuffProjection(): void {
  const player = createPlayer();
  const passiveBuffs = collectEnabledSkillPassiveBuffs(player as never);
  assert.equal(passiveBuffs.length, 1, '只投影已启用且已解锁的被动 Buff');
  assert.equal(passiveBuffs[0]?.buffId, 'passive.test.buff');
  assert.equal(passiveBuffs[0]?.infiniteDuration, true);
  assert.equal(passiveBuffs[0]?.sourceSkillId, 'skill.passive.test');
  assert.deepEqual(passiveBuffs[0]?.stats, { physAtk: 12, spellAtk: -4 });
  assert.equal(passiveBuffs[0]?.qiProjection?.[0]?.selector?.elements?.[0], 'yang');

  const projected = projectVisiblePlayerBuffs(player as never);
  assert.ok(projected.some((buff) => buff.buffId === 'passive.test.buff'), '可见 Buff 投影包含启用被动');
}

function testPassiveCraftAndCultivationEffects(): void {
  const player = createPlayer();
  const craftStats = createEmptyCraftEffectStats();
  addEnabledSkillPassiveCraftEffects(craftStats, player as never);
  assert.equal(craftStats.alchemy.speedRate, 0.12);
  assert.equal(craftStats.gather.speedRate, 0.08);
  assert.equal(craftStats.transmission.speedRate, 0);

  const tileEffects = collectEnabledCultivationTileQiPassives(player as never);
  assert.equal(tileEffects.length, 1, '只收集已启用且已解锁的修炼地块被动');
  assert.equal(tileEffects[0]?.effect.resourceKey, 'aura.refined.yang');
  assert.equal(tileEffects[0]?.effect.radius, 1);
  assert.equal(tileEffects[0]?.effect.amountSource, 'max_qi_output_sqrt');
  assert.equal(resolveCultivationPassiveTileQiAmount(player as never, tileEffects[0]!.effect), 10, '每格注入量使用灵力输出的平方根');
}

function testPassiveStrengthScalesWithLevel(): void {
  const player = createPlayer(21);
  const passiveBuff = collectEnabledSkillPassiveBuffs(player as never)[0];
  assert.equal(getTechniquePassiveSkillStrengthMultiplier(21), 2);
  assert.deepEqual(passiveBuff?.stats, { physAtk: 24, spellAtk: -8 });
  assert.equal(passiveBuff?.qiProjection?.[0]?.efficiencyBpMultiplier, 10200);

  const craftStats = createEmptyCraftEffectStats();
  addEnabledSkillPassiveCraftEffects(craftStats, player as never);
  assert.equal(craftStats.alchemy.speedRate, 0.24);
  assert.equal(craftStats.gather.speedRate, 0.16);

  const tileEffect = collectEnabledCultivationTileQiPassives(player as never)[0]?.effect;
  assert.equal(tileEffect?.multiplier, 2);
  assert.equal(resolveCultivationPassiveTileQiAmount(player as never, tileEffect!), 20);
  const qiProjection = resolvePlayerQiResourceProjection(player as never, 'aura.refined.yang');
  assert.equal(qiProjection?.efficiencyBp, 200);
}

function testDisableInvalidatesPassiveProfile(): void {
  const player = createPlayer();
  assert.equal(collectEnabledSkillPassiveBuffs(player as never).length, 1);
  player.combat.autoBattleSkills = [{ skillId: 'skill.passive.test', skillEnabled: false }];
  assert.equal(collectEnabledSkillPassiveBuffs(player as never).length, 0, 'skillEnabled=false 后被动立即失效');
}

function testPurePassiveAndSlotFormula(): void {
  assert.equal(isPassiveOnlySkill(createPassiveSkill()), true);
  assert.equal(isPassiveOnlySkill(createPassiveSkill({ active: true })), false);
  assert.equal(getPlayerEnabledSkillSlotLimitByLevel(1), 4);
  assert.equal(getPlayerEnabledSkillSlotLimitByLevel(12), 14);
  assert.equal(getPlayerEnabledSkillSlotLimitByLevel(23), 18);
  assert.equal(getPlayerEnabledSkillSlotLimitByLevel(60), 35);
}

function testPassiveTechniqueProgressionRule(): void {
  const technique = {
    level: 21,
    layers: [{ level: 1, expToNext: 100 }],
    skills: [createPassiveSkill()],
  };
  assert.equal(isPassiveTechnique(technique), true);
  assert.equal(getTechniqueTrainingMaxLevel(technique), Number.MAX_SAFE_INTEGER);
  assert.equal(isTechniqueFullyMastered(technique), false);
  assert.equal(getTechniquePassiveExpToNext(2, technique.layers), 140);
  assert.equal(getTechniquePassiveExpToNext(21, technique.layers), 83_668);
  assert.equal(getTechniquePassiveExpToNext(100, [{ level: 1, expToNext: 115 }]), 33_680_100_015_552_810);
  assert.equal(getTechniquePassiveExpToNext(3_000, [{ level: 1, expToNext: 115 }]), Number.MAX_VALUE);
}

function testYinYangMeridiansFixedAndDualCultivateCancel(): void {
  const repository = new ContentTemplateRepository();
  repository.loadAll();
  const yin = repository.hydrateTechniqueState({
    techId: 'passive_yinyang_qi_earth_pure_yin',
    level: 21,
  }) as { skills?: SkillDef[] } | null;
  const yang = repository.hydrateTechniqueState({
    techId: 'passive_yinyang_qi_earth_pure_yang',
    level: 21,
  }) as { skills?: SkillDef[] } | null;
  assert.ok(yin, '缺少九阳化阴真经');
  assert.ok(yang, '缺少玄牝生阳宝典');

  const yinSkill = yin.skills?.[0];
  const yangSkill = yang.skills?.[0];
  assert.ok(yinSkill && yangSkill, '阴阳功法缺少常驻技能');
  const yinTile = getSkillPassiveEffects(yinSkill).find((effect) => effect.type === 'cultivation_tile_qi');
  const yangTile = getSkillPassiveEffects(yangSkill).find((effect) => effect.type === 'cultivation_tile_qi');
  assert.equal(yinTile?.resourceKey, 'aura.refined.yang', '阴功法常驻技能必须灌注阳灵气');
  assert.equal(yangTile?.resourceKey, 'aura.refined.yin', '阳功法常驻技能必须灌注阴灵气');

  const createPlayerWithTechniques = (techniques: unknown[]) => ({
    techniques: { techniques },
    buffs: { buffs: [] },
    attrBonuses: [],
    runtimeBonuses: [],
  });

  const yangOnly = createPlayerWithTechniques([yang]);
  assert.equal(resolvePlayerQiResourceProjection(yangOnly as never, 'aura.refined.yang')?.efficiencyBp, 10_000);
  assert.equal(resolvePlayerQiResourceProjection(yangOnly as never, 'aura.refined.yin')?.efficiencyBp, 0);

  const yinOnly = createPlayerWithTechniques([yin]);
  assert.equal(resolvePlayerQiResourceProjection(yinOnly as never, 'aura.refined.yin')?.efficiencyBp, 10_000);
  assert.equal(resolvePlayerQiResourceProjection(yinOnly as never, 'aura.refined.yang')?.efficiencyBp, 0);

  for (const techniques of [[yang, yin], [yin, yang]]) {
    const both = createPlayerWithTechniques(techniques);
    assert.equal(
      resolvePlayerQiResourceProjection(both as never, 'aura.refined.yang')?.efficiencyBp,
      0,
      '两本同修时阳灵脉必须归零',
    );
    assert.equal(
      resolvePlayerQiResourceProjection(both as never, 'aura.refined.yin')?.efficiencyBp,
      0,
      '两本同修时阴灵脉必须归零',
    );
  }

  const yangLevelOne = repository.hydrateTechniqueState({
    techId: 'passive_yinyang_qi_earth_pure_yang',
    level: 1,
  });
  assert.equal(
    resolvePlayerQiResourceProjection(createPlayerWithTechniques([yangLevelOne]) as never, 'aura.refined.yang')?.efficiencyBp,
    10_000,
    '阳灵脉学会即为 +100，不随层数变化',
  );
}

function main(): void {
  testEnabledPassiveBuffProjection();
  testPassiveCraftAndCultivationEffects();
  testPassiveStrengthScalesWithLevel();
  testDisableInvalidatesPassiveProfile();
  testPurePassiveAndSlotFormula();
  testPassiveTechniqueProgressionRule();
  testYinYangMeridiansFixedAndDualCultivateCancel();
  console.log(JSON.stringify({
    ok: true,
    case: 'player-skill-passive',
    cases: [
      'enabled_passive_buff_projection',
      'passive_craft_and_cultivation_effects',
      'passive_strength_scales_with_level',
      'disable_invalidates_passive_profile',
      'pure_passive_slot_formula',
      'passive_technique_progression_rule',
      'yin_yang_meridians_fixed_and_dual_cultivate_cancel',
    ],
  }, null, 2));
}

main();
