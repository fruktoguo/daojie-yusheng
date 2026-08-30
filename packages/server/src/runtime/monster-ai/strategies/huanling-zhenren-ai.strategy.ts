import type { SkillDef } from '@mud/shared';
import {
  entityHasActiveBuff,
  getEntityBuffStacks,
  pickFirstCastableMonsterSkill,
} from '../monster-ai.helpers.js';
import type { MonsterAiContext, MonsterAiStrategy, MonsterRuntimeLike } from '../monster-ai.types.js';

const HUANLING_MONSTER_IDS = [
  'm_huanling_zhenren',
  'm_huanling_zhenren_instance',
  'm_huanling_zhenren_dungeon',
] as const;

const HUANLING_FAXIANG_SKILL_ID = 'skill.huanling_candan_faxiang';
const HUANLING_LIEFU_WAIHUAN_SKILL_ID = 'skill.huanling_liefu_waihuan';
const HUANLING_XINGLUO_CANPAN_SKILL_ID = 'skill.huanling_xingluo_canpan';
const HUANLING_RONGHE_GUANMAI_SKILL_ID = 'skill.huanling_ronghe_guanmai';
const HUANLING_LIEQI_ZHIXIAN_SKILL_ID = 'skill.huanling_lieqi_zhixian';
const HUANLING_SUOGONG_NEIHUAN_SKILL_ID = 'skill.huanling_suogong_neihuan';
const HUANLING_DIFU_CHENYIN_SKILL_ID = 'skill.huanling_difu_chenyin';
const HUANLING_DUANHUN_DING_SKILL_ID = 'skill.huanling_duanhun_ding';
const HUANLING_CANPO_ZHANG_SKILL_ID = 'skill.huanling_canpo_zhang';

const HUANLING_FAXIANG_BUFF_ID = 'buff.huanling_candan_faxiang';
const HUANLING_RONGMAI_YIN_BUFF_ID = 'buff.huanling_rongmai_yin';
const HUANLING_CANMAI_SUOBU_BUFF_ID = 'buff.huanling_canmai_suobu';
const TERRAIN_MOLTEN_POOL_BURN_BUFF_ID = 'terrain_molten_pool_burn';

/**
 * 唤灵真人专属独立 AI 策略脚本：
 * 负责唤灵真人（包含破败洞府大世界、副本体、梦境实例等所有变体）的阶段转换与连招状态机：
 * 1. P1 (100%~75%): 试探阶段，断魂灵钉点名 + 残魄掌普攻
 * 2. P2 (75%~25%): 触发残丹法相变身，展开移脉熔宫与熔河贯脉火海
 * 3. P3 (25%及以下): 残阵绝杀，锁宫内环与裂府外环交替绞杀，地府沉印复合终结
 */
export class HuanlingZhenrenAiStrategy implements MonsterAiStrategy {
  public readonly id = 'huanling_zhenren';

  public readonly targetMonsterIds = HUANLING_MONSTER_IDS;

  public supports(monster: MonsterRuntimeLike): boolean {
    if (monster.aiStrategyId === this.id) {
      return true;
    }
    return (
      this.targetMonsterIds.includes(monster.monsterId as any) ||
      monster.monsterId.startsWith('m_huanling_zhenren')
    );
  }

  public chooseSkill(context: MonsterAiContext): SkillDef | null {
    const { monster, target, distance, currentTick } = context;

    const maxHp = Math.max(1, Math.round(monster.maxHp));
    const hpRatio = maxHp > 0 ? monster.hp / maxHp : 1;
    const hasFaxiang = entityHasActiveBuff(monster.buffs, HUANLING_FAXIANG_BUFF_ID);
    const targetBuffs =
      (target?.buffs as any)?.buffs ?? target?.buffs ?? target?.temporaryBuffs ?? [];
    const targetYinStacks = getEntityBuffStacks(targetBuffs, HUANLING_RONGMAI_YIN_BUFF_ID);
    const targetBurnStacks = getEntityBuffStacks(targetBuffs, TERRAIN_MOLTEN_POOL_BURN_BUFF_ID);
    const targetLocked = entityHasActiveBuff(targetBuffs, HUANLING_CANMAI_SUOBU_BUFF_ID);
    const targetPrimed = targetYinStacks + targetBurnStacks;

    // 1. 血量跌破 75% 且尚未开启法相：优先释放【残丹法相虚影】变身
    if (!hasFaxiang && hpRatio <= 0.75) {
      const phaseAwaken = pickFirstCastableMonsterSkill(monster, target, distance, currentTick, [
        HUANLING_FAXIANG_SKILL_ID,
        HUANLING_LIEQI_ZHIXIAN_SKILL_ID,
        HUANLING_CANPO_ZHANG_SKILL_ID,
      ]);
      if (phaseAwaken) {
        return phaseAwaken;
      }
    }

    // 2. 血量跌破 25% 绝境暴怒阶段：狂暴倾泻沉印、外环与内环
    if (hpRatio <= 0.25) {
      const desperation = pickFirstCastableMonsterSkill(monster, target, distance, currentTick, [
        HUANLING_DIFU_CHENYIN_SKILL_ID,
        HUANLING_LIEFU_WAIHUAN_SKILL_ID,
        HUANLING_SUOGONG_NEIHUAN_SKILL_ID,
      ]);
      if (desperation) {
        return desperation;
      }
    }

    // 3. 血量跌破 50% 崩解阶段：星罗残盘与熔河贯脉压制
    if (hpRatio <= 0.5) {
      const collapse = pickFirstCastableMonsterSkill(monster, target, distance, currentTick, [
        HUANLING_XINGLUO_CANPAN_SKILL_ID,
        HUANLING_RONGHE_GUANMAI_SKILL_ID,
      ]);
      if (collapse) {
        return collapse;
      }
    }

    // 4. 未开启法相前的常规 P1 循环：断魂灵钉 + 残魄掌
    if (!hasFaxiang) {
      return pickFirstCastableMonsterSkill(monster, target, distance, currentTick, [
        HUANLING_DUANHUN_DING_SKILL_ID,
        HUANLING_CANPO_ZHANG_SKILL_ID,
      ]);
    }

    // 5. 目标被锁步禁足或阴痕/灼伤层数较高：地府沉印致命爆发
    if (targetLocked || targetPrimed >= 4) {
      const finisher = pickFirstCastableMonsterSkill(monster, target, distance, currentTick, [
        HUANLING_DIFU_CHENYIN_SKILL_ID,
        HUANLING_LIEFU_WAIHUAN_SKILL_ID,
        HUANLING_DUANHUN_DING_SKILL_ID,
      ]);
      if (finisher) {
        return finisher;
      }
    }

    // 6. 贴身近距离 (distance <= 2)：锁宫内环绞杀近战 / 移脉熔宫
    if (distance <= 2) {
      const closeControl = pickFirstCastableMonsterSkill(monster, target, distance, currentTick, [
        HUANLING_SUOGONG_NEIHUAN_SKILL_ID,
        HUANLING_DIFU_CHENYIN_SKILL_ID,
        HUANLING_XINGLUO_CANPAN_SKILL_ID,
        HUANLING_LIEQI_ZHIXIAN_SKILL_ID,
        HUANLING_DUANHUN_DING_SKILL_ID,
      ]);
      if (closeControl) {
        return closeControl;
      }
    }

    // 7. 远距离拉扯 (distance >= 4)：裂府外环与熔河贯脉全场压迫
    if (distance >= 4) {
      const longRangePressure = pickFirstCastableMonsterSkill(monster, target, distance, currentTick, [
        HUANLING_LIEFU_WAIHUAN_SKILL_ID,
        HUANLING_RONGHE_GUANMAI_SKILL_ID,
        HUANLING_XINGLUO_CANPAN_SKILL_ID,
        HUANLING_DUANHUN_DING_SKILL_ID,
      ]);
      if (longRangePressure) {
        return longRangePressure;
      }
    }

    // 8. 目标未被锁步时的铺场起手：移脉熔宫火海 + 星罗棋盘 + 熔河贯脉
    if (!targetLocked) {
      const setup = pickFirstCastableMonsterSkill(monster, target, distance, currentTick, [
        HUANLING_LIEQI_ZHIXIAN_SKILL_ID,
        HUANLING_XINGLUO_CANPAN_SKILL_ID,
        HUANLING_RONGHE_GUANMAI_SKILL_ID,
        HUANLING_SUOGONG_NEIHUAN_SKILL_ID,
        HUANLING_DUANHUN_DING_SKILL_ID,
      ]);
      if (setup) {
        return setup;
      }
    }

    // 9. 目标身上已有 2 层以上易伤：优先引爆沉印与外环
    if (targetPrimed >= 2) {
      const cashOut = pickFirstCastableMonsterSkill(monster, target, distance, currentTick, [
        HUANLING_DIFU_CHENYIN_SKILL_ID,
        HUANLING_LIEFU_WAIHUAN_SKILL_ID,
        HUANLING_SUOGONG_NEIHUAN_SKILL_ID,
        HUANLING_DUANHUN_DING_SKILL_ID,
      ]);
      if (cashOut) {
        return cashOut;
      }
    }

    // 10. 全局兜底决策优先级 (按威力与控制优先级排序，最后残魄掌兜底)
    return pickFirstCastableMonsterSkill(monster, target, distance, currentTick, [
      HUANLING_DIFU_CHENYIN_SKILL_ID,
      HUANLING_LIEFU_WAIHUAN_SKILL_ID,
      HUANLING_SUOGONG_NEIHUAN_SKILL_ID,
      HUANLING_XINGLUO_CANPAN_SKILL_ID,
      HUANLING_RONGHE_GUANMAI_SKILL_ID,
      HUANLING_LIEQI_ZHIXIAN_SKILL_ID,
      HUANLING_DUANHUN_DING_SKILL_ID,
      HUANLING_CANPO_ZHANG_SKILL_ID,
    ]);
  }
}
