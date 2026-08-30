import type { SkillDef } from '@mud/shared';
import { DefaultMonsterAiStrategy } from './strategies/default-monster-ai.strategy.js';
import { HuanlingZhenrenAiStrategy } from './strategies/huanling-zhenren-ai.strategy.js';
import type { MonsterAiContext, MonsterAiStrategy, MonsterAiTarget, MonsterRuntimeLike } from './monster-ai.types.js';

export class MonsterAiRegistry {
  private readonly strategiesById = new Map<string, MonsterAiStrategy>();
  private readonly strategiesByMonsterId = new Map<string, MonsterAiStrategy>();
  private readonly customStrategies: MonsterAiStrategy[] = [];
  private readonly defaultStrategy = new DefaultMonsterAiStrategy();

  public constructor() {
    this.registerStrategy(this.defaultStrategy);
    this.registerStrategy(new HuanlingZhenrenAiStrategy());
  }

  /**
   * 注册独立的怪物 AI 策略脚本
   */
  public registerStrategy(strategy: MonsterAiStrategy): void {
    this.strategiesById.set(strategy.id, strategy);
    if (strategy.targetMonsterIds) {
      for (const monsterId of strategy.targetMonsterIds) {
        this.strategiesByMonsterId.set(monsterId, strategy);
      }
    }
    if (!this.customStrategies.some((s) => s.id === strategy.id)) {
      this.customStrategies.push(strategy);
    }
  }

  /**
   * 根据怪物元数据与 ID，解析对应的怪物 AI 策略
   * 优先级：显式 aiStrategyId > 精确 monsterId > supports() 动态匹配 > 默认通用 AI
   */
  public resolveStrategy(monster: MonsterRuntimeLike): MonsterAiStrategy {
    if (monster.aiStrategyId) {
      const matched = this.strategiesById.get(monster.aiStrategyId);
      if (matched) {
        return matched;
      }
    }

    const byMonsterId = this.strategiesByMonsterId.get(monster.monsterId);
    if (byMonsterId) {
      return byMonsterId;
    }

    for (const strategy of this.customStrategies) {
      if (typeof strategy.supports === 'function' && strategy.supports(monster)) {
        return strategy;
      }
    }

    return this.defaultStrategy;
  }

  /**
   * 统一入口：为指定怪物挑选当前 tick 最适合施放的技能
   */
  public chooseSkill(
    monster: MonsterRuntimeLike,
    target: MonsterAiTarget | null,
    distance: number,
    currentTick: number,
  ): SkillDef | null {
    const strategy = this.resolveStrategy(monster);
    const context: MonsterAiContext = {
      monster,
      target,
      distance,
      currentTick,
    };
    return strategy.chooseSkill(context);
  }
}

/** 全局单例注册表实例 */
export const monsterAiRegistry = new MonsterAiRegistry();

/**
 * 便捷导出函数：为怪物选择当前 tick 技能
 */
export function chooseMonsterSkill(
  monster: MonsterRuntimeLike,
  target: MonsterAiTarget | null,
  distance: number,
  currentTick: number,
): SkillDef | null {
  return monsterAiRegistry.chooseSkill(monster, target, distance, currentTick);
}
