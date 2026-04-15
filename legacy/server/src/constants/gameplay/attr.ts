import type { NumericScalarStatKey } from '@mud/shared';

/**
 * 属性成长计算常量。
 */

/** 采用指数型成长的数值键。 */
export const REALM_EXPONENTIAL_NUMERIC_KEYS = [
  'maxHp',
  'maxQi',
  'physAtk',
  'spellAtk',
  'physDef',
  'spellDef',
  'hit',
  'dodge',
  'crit',
  'antiCrit',
  'breakPower',
  'resolvePower',
] as const;

/** 采用线性成长的数值键。 */
export const REALM_LINEAR_NUMERIC_KEYS = [
  'critDamage',
  'maxQiOutputPerTick',
  'qiRegenRate',
  'hpRegenRate',
  'realmExpPerTick',
  'techniqueExpPerTick',
] as const satisfies readonly NumericScalarStatKey[];

/** 各线性成长数值按境界等级使用的增幅率。 */
export const REALM_LINEAR_NUMERIC_GROWTH_RATES: Record<typeof REALM_LINEAR_NUMERIC_KEYS[number], number> = {
  critDamage: 0.1,
  maxQiOutputPerTick: 0.1,
  qiRegenRate: 0.02,
  hpRegenRate: 0.02,
  realmExpPerTick: 0.1,
  techniqueExpPerTick: 0.1,
};

/** 玩家特殊养成数值的客户端同步间隔。 */
export const PLAYER_SPECIAL_STATS_SYNC_INTERVAL_MS = 5000;
