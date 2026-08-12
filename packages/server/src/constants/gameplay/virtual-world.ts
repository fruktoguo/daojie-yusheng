/** 虚境低等级击杀惩罚的运行时常量与纯规则。 */
import { ELEMENT_KEYS, HEAVENLY_DAO_SUPPRESSION_BUFF_ID, type NumericScalarStatKey } from '@mud/shared';

export { HEAVENLY_DAO_SUPPRESSION_BUFF_ID };
export const HEAVENLY_DAO_SUPPRESSION_SOURCE_ID = 'virtual_world.low_level_monster_kill';
export const HEAVENLY_DAO_SUPPRESSION_DURATION_TICKS = 60 * 60;
export const HEAVENLY_DAO_SUPPRESSION_MAX_STACKS = 999_999;
export const HEAVENLY_DAO_SUPPRESSION_MIN_REALM_GAP = 6;
export const HEAVENLY_DAO_SUPPRESSION_DIVISOR = 1_000;

/** 六维之外所有会直接参与战斗、施法或战斗机动的数值属性。 */
export const HEAVENLY_DAO_SUPPRESSION_COMBAT_STAT_KEYS = [
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
  'critDamage',
  'breakPower',
  'resolvePower',
  'maxQiOutputPerTick',
  'qiRegenRate',
  'hpRegenRate',
  'cooldownSpeed',
  'auraCostReduce',
  'auraPowerRate',
  'moveSpeed',
  'extraAggroRate',
  'extraRange',
  'extraArea',
  'actionsPerTurn',
] as const satisfies readonly NumericScalarStatKey[];

const HEAVENLY_DAO_SUPPRESSION_COMBAT_STAT_KEY_SET: ReadonlySet<NumericScalarStatKey> = new Set(
  HEAVENLY_DAO_SUPPRESSION_COMBAT_STAT_KEYS,
);

export const HEAVENLY_DAO_SUPPRESSION_ELEMENT_KEYS = ELEMENT_KEYS;

/** 境界差六级时一层，之后每多一级再增加一层。 */
export function resolveHeavenlyDaoSuppressionStacksForKill(
  playerRealmLevelInput: unknown,
  monsterRealmLevelInput: unknown,
): number {
  const playerRealmLevel = normalizeRealmLevel(playerRealmLevelInput);
  const monsterRealmLevel = normalizeRealmLevel(monsterRealmLevelInput);
  if (playerRealmLevel === null || monsterRealmLevel === null) {
    return 0;
  }
  const realmGap = playerRealmLevel - monsterRealmLevel;
  return realmGap >= HEAVENLY_DAO_SUPPRESSION_MIN_REALM_GAP
    ? realmGap - HEAVENLY_DAO_SUPPRESSION_MIN_REALM_GAP + 1
    : 0;
}

/** n 层保留 1000 / (1000 + n)，即 1000 层保留 50%。 */
export function resolveHeavenlyDaoSuppressionMultiplier(stacksInput: unknown): number {
  const stacks = normalizeHeavenlyDaoSuppressionStacks(stacksInput);
  return HEAVENLY_DAO_SUPPRESSION_DIVISOR / (HEAVENLY_DAO_SUPPRESSION_DIVISOR + stacks);
}

/** 转成项目负向百分比口径：每层 -0.1%，由反比公式得到最终保留倍率。 */
export function resolveHeavenlyDaoSuppressionPercentModifier(stacksInput: unknown): number {
  return -normalizeHeavenlyDaoSuppressionStacks(stacksInput) / 10;
}

export function isHeavenlyDaoSuppressionCombatStatKey(key: NumericScalarStatKey): boolean {
  return HEAVENLY_DAO_SUPPRESSION_COMBAT_STAT_KEY_SET.has(key);
}

function normalizeRealmLevel(input: unknown): number | null {
  const value = Number(input);
  return Number.isFinite(value) && value >= 1 ? Math.trunc(value) : null;
}

function normalizeHeavenlyDaoSuppressionStacks(input: unknown): number {
  return Math.min(
    HEAVENLY_DAO_SUPPRESSION_MAX_STACKS,
    Math.max(0, Math.trunc(Number(input) || 0)),
  );
}
