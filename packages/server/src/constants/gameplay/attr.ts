/**
 * 属性成长计算常量。
 */

/** 采用指数型成长的核心数值键。 */
export const REALM_EXPONENTIAL_NUMERIC_KEYS = [
  'maxHp',
  'physAtk',
  'spellAtk',
] as const;

/** 采用线性成长的辅助数值键。 */
export const REALM_LINEAR_NUMERIC_KEYS = [
  'maxQi',
  'physDef',
  'spellDef',
  'hit',
  'dodge',
  'crit',
  'critDamage',
  'breakPower',
  'resolvePower',
  'maxQiOutputPerTick',
  'qiRegenRate',
  'hpRegenRate',
  'cooldownSpeed',
] as const;

/** 玩家特殊养成数值的客户端同步间隔。 */
export const PLAYER_SPECIAL_STATS_SYNC_INTERVAL_MS = 5000;
