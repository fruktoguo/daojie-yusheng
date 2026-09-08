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

  // Case C: P2 阶段 (血量跌入 70% 且尚未开启法相) -> 必须优先释放【残丹法相虚影】(skill.huanling_candan_faxiang)
  {
    const bossP2NoBuff = createTestBoss({ hp: 70000000, maxHp: 100000000, buffs: [] });
    const selected = chooseMonsterSkill(bossP2NoBuff, targetPlayer, 2, 1);
    assert.equal(selected?.id, 'skill.huanling_candan_faxiang', '血量 <= 75% 且无法相时必须立即触发残丹法相虚影');
  }

  // Case D: P2 阶段已拥有法相 -> 贴身释放【移脉熔宫】(skill.huanling_lieqi_zhixian)
  {
    const bossP2WithBuff = createTestBoss({
      hp: 70000000,
      maxHp: 100000000,
      buffs: [
        {
          buffId: 'buff.huanling_candan_faxiang',
          remainingTicks: 300,
          stacks: 1,
        },
      ],
    });
    const selected = chooseMonsterSkill(bossP2WithBuff, targetPlayer, 2, 1);
    assert.equal(
      selected?.id,
      'skill.huanling_lieqi_zhixian',
      `拥有法相且处于P2阶段时应优先释放移脉熔宫铺场，实际=${selected?.id}`,
    );
  }

  // Case E: P3 阶段 (血量跌入 20% 绝境) -> 必须优先释放绝境沉印或外环
  {
    const bossP3 = createTestBoss({
      hp: 20000000,
      maxHp: 100000000,
      buffs: [
        {
          buffId: 'buff.huanling_candan_faxiang',
          remainingTicks: 300,
          stacks: 1,
        },
      ],
    });
    const selected = chooseMonsterSkill(bossP3, targetPlayer, 2, 1);
    assert.equal(
      selected?.id,
      'skill.huanling_difu_chenyin',
      `P3 绝境阶段贴身必须优先释放地府沉印，实际=${selected?.id}`,
    );
  }

  // Case F: P3 绝境且目标被锁步且挂有阴痕 -> 优先地府沉印终结斩杀
  {
    const bossFinisher = createTestBoss({
      hp: 20000000,
      maxHp: 100000000,
      buffs: [
        {
          buffId: 'buff.huanling_candan_faxiang',
          remainingTicks: 300,
          stacks: 1,
        },
      ],
    });
    const lockedPlayer = {
      ...targetPlayer,
      buffs: [
        {
          buffId: 'buff.huanling_canmai_suobu',
          remainingTicks: 20,
          stacks: 1,
        },
        {
          buffId: 'buff.huanling_rongmai_yin',
          remainingTicks: 60,
          stacks: 5,
        },
      ],
    };
    const selected = chooseMonsterSkill(bossFinisher, lockedPlayer, 2, 1);
    assert.equal(selected?.id, 'skill.huanling_difu_chenyin', 'P3阶段目标被锁步且叠满阴痕时，必须立即释放地府沉印斩杀');
  }

  // Case G: 法相技能转成运行时 Buff 后必须保持无限持续，下一息才能解锁阶段技能
  {
    const boss = createTestBoss({ hp: 70000000, maxHp: 100000000, buffs: [] }) as MonsterRuntimeLike & Record<string, any>;
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
    assert.equal(selected?.id, 'skill.huanling_lieqi_zhixian', '法相落地后的下一息必须解锁移脉熔宫，而不是退回两个 P1 技能');
  }

  console.log('✅ monster-ai-strategy-smoke: 全部 7 项独立怪物 AI 策略验证全部通过！');
}

runMonsterAiStrategySmoke().catch((err) => {
  console.error('❌ monster-ai-strategy-smoke 失败:', err);
  process.exit(1);
});
