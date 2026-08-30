import type { SkillDef } from '@mud/shared';

export interface MonsterAiTarget {
  id?: string;
  x: number;
  y: number;
  buffs?: unknown;
  temporaryBuffs?: unknown;
}

export interface MonsterRuntimeLike {
  runtimeId?: string;
  monsterId: string;
  aiStrategyId?: string;
  name?: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  qi?: number;
  maxQi?: number;
  skills: SkillDef[];
  buffs?: unknown;
  numericStats?: {
    extraRange?: number;
    extraArea?: number;
    maxQiOutputPerTick?: number;
    maxQi?: number;
    hpRegenRate?: number;
    qiRegenRate?: number;
    [key: string]: unknown;
  };
  cooldownReadyTickBySkillId: Record<string, number>;
}

export interface MonsterAiContext {
  monster: MonsterRuntimeLike;
  target: MonsterAiTarget | null;
  distance: number;
  currentTick: number;
}

export interface MonsterAiStrategy {
  /** 策略唯一标识符 */
  readonly id: string;

  /** 显式绑定的怪物模板 ID 列表（支持多个变体如大世界、副本、梦境等） */
  readonly targetMonsterIds?: readonly string[];

  /** 是否支持/匹配指定的怪物实例 */
  supports?(monster: MonsterRuntimeLike): boolean;

  /** 根据当前战况选择需要释放的技能，无合适技能时返回 null */
  chooseSkill(context: MonsterAiContext): SkillDef | null;
}
