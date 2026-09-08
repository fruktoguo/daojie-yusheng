import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  chooseMonsterSkill,
  DefaultMonsterAiStrategy,
  HuanlingZhenrenAiStrategy,
  monsterAiRegistry,
} from '../runtime/monster-ai/index.js';
import type { MonsterRuntimeLike } from '../runtime/monster-ai/monster-ai.types.js';
import { PlayerCombatService } from '../runtime/combat/player-combat.service.js';


async function runMonsterAiStrategySmoke(): Promise<void> {
  // 1. 验证策略注册表单例
  const defaultStrategy = monsterAiRegistry.resolveStrategy({ monsterId: 'm_wild_wolf', skills: [], cooldownReadyTickBySkillId: {} } as any);
  assert.equal(defaultStrategy.id, 'default', '未匹配独立策略的普通怪物必须回退到通用 default 策略');

  // 2. 验证唤灵真人多 ID 变体匹配
  const huanlingVariants = [
    'm_huanling_zhenren',
    'm_huanling_zhenren_instance',
    'm_huanling_zhenren_dungeon',
  ];
  for (const monsterId of huanlingVariants) {
    const strategy = monsterAiRegistry.resolveStrategy({ monsterId, skills: [], cooldownReadyTickBySkillId: {} } as any);
    assert.equal(strategy.id, 'huanling_zhenren', `变体 ID [${monsterId}] 必须正确路由到 huanling_zhenren 独立 AI 策略`);
  }

  // 3. 读取真源唤灵真人技能定义进行实战决策推演
  const techniques = JSON.parse(
    fs.readFileSync('/home/yuohira/mud-mmo-next/packages/server/data/content/techniques/凡人期/术法/地阶.json', 'utf8'),
  );
  const huanlingTech = techniques.find((t: any) => t.id === 'monster_huanling_arts');
  assert.ok(huanlingTech && Array.isArray(huanlingTech.skills), '必须成功读取唤灵真人技能库');

  const createTestBoss = (overrides: Partial<MonsterRuntimeLike> = {}): MonsterRuntimeLike => ({
    runtimeId: 'monster_test_1',
    monsterId: 'm_huanling_zhenren_instance', // 副本 Boss ID
    name: '唤灵真人(测试)',
    x: 10,
    y: 10,
    hp: 100000000,
    maxHp: 100000000,
    qi: 100000000,
    maxQi: 100000000,
    skills: huanlingTech.skills,
    buffs: [],
    numericStats: {
      extraRange: 0,
      extraArea: 0,
      maxQiOutputPerTick: 1000000,
    },
    cooldownReadyTickBySkillId: {},
    ...overrides,
  });

  const targetPlayer = {
    id: 'p_test_player',
    x: 12,
    y: 10, // 距离为 2
    buffs: [],
  };

  // Case A: P1 阶段 (满血 100%) -> 必须优先释放【断魂灵钉】(skill.huanling_duanhun_ding)
  {
    const bossP1 = createTestBoss({ hp: 100000000, maxHp: 100000000 });
    const selected = chooseMonsterSkill(bossP1, targetPlayer, 2, 1);
    assert.equal(selected?.id, 'skill.huanling_duanhun_ding', 'P1 满血初战必须优先释放断魂灵钉');
  }

  // Case B: P1 阶段 断魂灵钉 CD 中 -> 必须使用【残魄掌】(skill.huanling_canpo_zhang) 平 A
  {
    const bossP1Cd = createTestBoss({
      hp: 100000000,
      maxHp: 100000000,
      cooldownReadyTickBySkillId: {
        'skill.huanling_duanhun_ding': 100, // 冷却中
      },
    });
    const selected = chooseMonsterSkill(bossP1Cd, targetPlayer, 2, 1);
    assert.equal(selected?.id, 'skill.huanling_canpo_zhang', 'P1 灵钉冷却期间必须使用残魄掌');
  }

  // Case C: 法相仅允许在 25% 血量触发，其他阶段技能不得依赖法相 Buff
  {
    const faxiangSkill = huanlingTech.skills.find((skill: any) => skill.id === 'skill.huanling_candan_faxiang');
    const faxiangConditions = faxiangSkill?.monsterCast?.conditions?.items ?? [];
    assert.equal(
      faxiangConditions.find((condition: any) => condition.type === 'hp_ratio')?.value,
      0.25,
      '残丹法相虚影必须到 25% 血量才允许释放',
    );
    const independentPhaseSkills = [
      'skill.huanling_lieqi_zhixian',
      'skill.huanling_ronghe_guanmai',
      'skill.huanling_xingluo_canpan',
      'skill.huanling_suogong_neihuan',
      'skill.huanling_liefu_waihuan',
      'skill.huanling_difu_chenyin',
    ];
    for (const skillId of independentPhaseSkills) {
      const skill = huanlingTech.skills.find((entry: any) => entry.id === skillId);
      const conditions = skill?.monsterCast?.conditions?.items ?? [];
      assert.equal(
        conditions.some((condition: any) => condition.type === 'has_buff' && condition.buffId === 'buff.huanling_candan_faxiang'),
        false,
        `${skillId} 不得要求残丹法相 Buff`,
      );
    }
  }

  // Case D: 70% 血量且无法相 -> 必须进入移脉熔宫阶段
  {
    const bossP2NoBuff = createTestBoss({ hp: 70000000, maxHp: 100000000, buffs: [] });
    const selected = chooseMonsterSkill(bossP2NoBuff, targetPlayer, 2, 1);
    assert.equal(selected?.id, 'skill.huanling_lieqi_zhixian', '70% 血量时应释放移脉熔宫，不应提前释放法相');
  }

  // Case E: 70% 血量远距离 -> 必须进入远距战术，而非被阶段兜底提前截断
  {
    const bossP2Far = createTestBoss({ hp: 70000000, maxHp: 100000000, buffs: [] });
    const farTarget = { ...targetPlayer, x: 14, y: 10 };
    const selected = chooseMonsterSkill(bossP2Far, farTarget, 4, 1);
    assert.equal(selected?.id, 'skill.huanling_duanhun_ding', '75% 以下远距离必须让位给远距拉扯策略');
  }

  // Case F: 45% 血量且无法相 -> 星罗残盘仍可独立释放
  {
    const bossP3NoBuff = createTestBoss({ hp: 45000000, maxHp: 100000000, buffs: [] });
    const selected = chooseMonsterSkill(bossP3NoBuff, targetPlayer, 2, 1);
    assert.equal(selected?.id, 'skill.huanling_xingluo_canpan', '50% 阶段技能不得依赖法相 Buff');
  }

  // Case G: 20% 血量且无法相 -> 必须先释放残丹法相虚影
  {
    const bossP4NoBuff = createTestBoss({ hp: 20000000, maxHp: 100000000, buffs: [] });
    const selected = chooseMonsterSkill(bossP4NoBuff, targetPlayer, 2, 1);
    assert.equal(selected?.id, 'skill.huanling_candan_faxiang', '法相必须在 25% 以下优先触发');
  }

  // Case H: 20% 血量但法相不可用 -> 地府沉印仍可独立释放
  {
    const bossP4FaxiangCd = createTestBoss({
      hp: 20000000,
      maxHp: 100000000,
      buffs: [],
      cooldownReadyTickBySkillId: { 'skill.huanling_candan_faxiang': 301 },
    });
    const selected = chooseMonsterSkill(bossP4FaxiangCd, targetPlayer, 2, 1);
    assert.equal(selected?.id, 'skill.huanling_difu_chenyin', '25% 阶段绝杀技能不得因缺少法相而锁死');
  }

  // Case I: 法相转成运行时 Buff 后保留永久持续、维持费与附属关系
  {
    const boss = createTestBoss({ hp: 20000000, maxHp: 100000000, buffs: [] }) as MonsterRuntimeLike & Record<string, any>;
    boss.level = 43;
    const target = {
      playerId: 'p_test_player',
      hp: 100000000,
      maxHp: 100000000,
      qi: 100000000,
      maxQi: 100000000,
      realm: { realmLv: 43 },
      attrs: {
        numericStats: { physAtk: 1, spellAtk: 1 },
        ratioDivisors: {},
        revision: 1,
      },
      buffs: { buffs: [], revision: 1 },
    };
    const appliedBuffs: Array<Record<string, any>> = [];
    const combatService = new PlayerCombatService({
      ensurePlayerAttributesFresh: () => ({ requested: false, changed: false }),
    } as any);
    combatService.castMonsterSkill(
      boss,
      target,
      'skill.huanling_candan_faxiang',
      1,
      0,
      (buff: Record<string, any>) => appliedBuffs.push(buff),
      () => undefined,
      () => undefined,
      {
        attackerCombatState: {
          hp: boss.hp,
          maxHp: boss.maxHp,
          qi: boss.qi,
          maxQi: boss.maxQi,
          level: 43,
          attrs: {
            numericStats: { physAtk: 1, spellAtk: 1 },
            ratioDivisors: {},
          },
          buffs: [],
        },
      },
    );
    const faxiang = appliedBuffs.find((buff) => buff.buffId === 'buff.huanling_candan_faxiang');
    const kuoyu = appliedBuffs.find((buff) => buff.buffId === 'buff.huanling_candan_kuoyu');
    assert.equal(faxiang?.infiniteDuration, true, '残丹法相虚影转运行时 Buff 时不得丢失 infiniteDuration');
    assert.deepEqual(faxiang?.sustainCost, { resource: 'qi', baseCost: 100, growthRate: 0.2 });
    assert.equal(faxiang?.sustainTicksElapsed, 0);
    assert.equal(kuoyu?.infiniteDuration, true, '虚影扩域必须跟随法相保持无限持续');
    assert.equal(kuoyu?.expireWithBuffId, 'buff.huanling_candan_faxiang');

    boss.buffs = appliedBuffs;
    boss.cooldownReadyTickBySkillId['skill.huanling_candan_faxiang'] = 301;
    const selected = chooseMonsterSkill(boss, targetPlayer, 2, 2);
    assert.equal(selected?.id, 'skill.huanling_difu_chenyin', '法相落地后应继续执行 25% 阶段绝杀技能');
  }

  console.log('✅ monster-ai-strategy-smoke: 全部 9 项独立怪物 AI 策略验证全部通过！');
}

runMonsterAiStrategySmoke().catch((err) => {
  console.error('❌ monster-ai-strategy-smoke 失败:', err);
  process.exit(1);
});
