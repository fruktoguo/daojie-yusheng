/** 副本专用行动效果常量与纯规则。 */
import { ELEMENT_KEYS } from './attributes';
import type { NumericScalarStatKey } from '../../numeric';

export const DUNGEON_PRESSURE_BUFF_ID = 'dungeon.pressure';
export const DUNGEON_PRESSURE_SOURCE_ID = 'dungeon.presentation.pressure';
export const DUNGEON_PRESSURE_DURATION_TICKS = 1;
export const DUNGEON_PRESSURE_QI_DRAIN_PERCENT = 0.01;
export const DUNGEON_PRESSURE_MOVE_SPEED_MULTIPLIER = 0.5;
export const DUNGEON_ENTRY_REJECTION_DELAY_MS = 3_000;
export const DUNGEON_MEMORY_STONE_NPC_ID_SUFFIX = '_memory_stone';
export const DUNGEON_EXIT_MEMORY_STONE_NPC_ID = 'npc_dungeon_memory_stone';
export const DUNGEON_MEMORY_STONE_INTERACTION_RADIUS = 2;

/** 入口/撤离忆梦石均使用 `_memory_stone` 后缀，避免再硬编码单图 NPC id。 */
export function isDungeonMemoryStoneNpcId(npcId: unknown): boolean {
  return typeof npcId === 'string' && npcId.endsWith(DUNGEON_MEMORY_STONE_NPC_ID_SUFFIX);
}


/** 威压每层影响的战斗数值；移速按每层减半单独处理。 */
export const DUNGEON_PRESSURE_COMBAT_STAT_KEYS = [
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
  'extraAggroRate',
  'extraRange',
  'extraArea',
  'actionsPerTurn',
] as const satisfies readonly NumericScalarStatKey[];

export const DUNGEON_PRESSURE_ELEMENT_KEYS = ELEMENT_KEYS;

/** 境界差每一级对应一层；高境界目标不受威压。 */
export function resolveDungeonPressureStacks(sourceRealmLvInput: unknown, targetRealmLvInput: unknown): number {
  const sourceRealmLv = normalizeRealmLv(sourceRealmLvInput);
  const targetRealmLv = normalizeRealmLv(targetRealmLvInput);
  if (sourceRealmLv === null || targetRealmLv === null) return 0;
  return Math.max(0, sourceRealmLv - targetRealmLv);
}

/** 每层减少 10%，按百分比减益的加法口径计算。 */
export function resolveDungeonPressureCombatMultiplier(stacksInput: unknown): number {
  const stacks = Math.max(0, Math.trunc(Number(stacksInput) || 0));
  return Math.max(0, 1 - stacks * 0.1);
}

/** 每层移速减半；多层按乘算，避免两层直接把移动锁死。 */
export function resolveDungeonPressureMoveSpeedMultiplier(stacksInput: unknown): number {
  const stacks = Math.max(0, Math.trunc(Number(stacksInput) || 0));
  return Math.pow(DUNGEON_PRESSURE_MOVE_SPEED_MULTIPLIER, stacks);
}

function normalizeRealmLv(input: unknown): number | null {
  const value = Number(input);
  return Number.isFinite(value) && value >= 1 ? Math.trunc(value) : null;
}
