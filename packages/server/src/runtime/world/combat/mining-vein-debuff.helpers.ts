import {
  MINING_VEIN_CURSE_BUFF_ID,
  MINING_VEIN_CURSE_DURATION_TICKS,
  MINING_VEIN_DEBUFF_MAX_STACKS,
  MINING_VEIN_STAGNATION_BUFF_ID,
  MINING_VEIN_STAGNATION_DURATION_TICKS,
  TileType,
} from '@mud/shared';

type RuntimeRecord = Record<PropertyKey, unknown>;

type RuntimeBuffInput = {
  buffId: string;
  name: string;
  desc: string;
  baseDesc: string;
  shortMark: string;
  category: 'debuff';
  visibility: 'public';
  duration: number;
  remainingTicks: number;
  stacks: number;
  maxStacks: number;
  sourceSkillId: string;
  sourceSkillName: string;
  realmLv: number;
  color: string;
  stats?: Readonly<{ maxQiOutputPerTick: number }>;
  statMode?: 'percent';
  ignoreRealmEffectiveness: true;
  persistOnDeath: true;
  persistOnReturnToSpawn: true;
  immuneToCleanse: true;
};

const MINING_VEIN_CURSE_BUFF_BASE = Object.freeze({
  buffId: MINING_VEIN_CURSE_BUFF_ID,
  name: '灵脉的诅咒',
  desc: '每层使挖矿最终爆率按 90% 复利保留；再次击碎灵石矿会叠层并刷新 24 小时。无法被净化，身死与遁返均不会清除。',
  baseDesc: '每层使挖矿最终爆率按 90% 复利保留；再次击碎灵石矿会叠层并刷新 24 小时。无法被净化，身死与遁返均不会清除。',
  shortMark: '咒',
  category: 'debuff',
  visibility: 'public',
  duration: MINING_VEIN_CURSE_DURATION_TICKS,
  remainingTicks: MINING_VEIN_CURSE_DURATION_TICKS,
  maxStacks: MINING_VEIN_DEBUFF_MAX_STACKS,
  sourceSkillId: 'mining.spirit_ore_break',
  sourceSkillName: '灵脉反噬',
  realmLv: 1,
  color: '#6f5b87',
  ignoreRealmEffectiveness: true,
  persistOnDeath: true,
  persistOnReturnToSpawn: true,
  immuneToCleanse: true,
} satisfies Omit<RuntimeBuffInput, 'stacks'>);

const MINING_VEIN_STAGNATION_BUFF_BASE = Object.freeze({
  buffId: MINING_VEIN_STAGNATION_BUFF_ID,
  name: '灵脉阻滞',
  desc: '每层降低 10% 最终灵力输出效率；再次击碎灵石矿会叠层并刷新 1 小时。无法被净化，身死与遁返均不会清除。',
  baseDesc: '每层降低 10% 最终灵力输出效率；再次击碎灵石矿会叠层并刷新 1 小时。无法被净化，身死与遁返均不会清除。',
  shortMark: '滞',
  category: 'debuff',
  visibility: 'public',
  duration: MINING_VEIN_STAGNATION_DURATION_TICKS,
  remainingTicks: MINING_VEIN_STAGNATION_DURATION_TICKS,
  maxStacks: MINING_VEIN_DEBUFF_MAX_STACKS,
  sourceSkillId: 'mining.spirit_ore_break',
  sourceSkillName: '灵脉反噬',
  realmLv: 1,
  color: '#4f7187',
  stats: Object.freeze({ maxQiOutputPerTick: 0 }),
  statMode: 'percent',
  ignoreRealmEffectiveness: true,
  persistOnDeath: true,
  persistOnReturnToSpawn: true,
  immuneToCleanse: true,
} satisfies Omit<RuntimeBuffInput, 'stacks'>);

export function applyMiningVeinBreakDebuffs(
  playerRuntimeService: unknown,
  playerId: unknown,
  destroyedSpiritOreCountInput: unknown,
): void {
  const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
  const destroyedSpiritOreCount = Math.max(0, Math.trunc(Number(destroyedSpiritOreCountInput) || 0));
  if (!normalizedPlayerId || destroyedSpiritOreCount <= 0 || !isRuntimeRecord(playerRuntimeService)) return;
  const applyTemporaryBuff = playerRuntimeService.applyTemporaryBuff;
  if (typeof applyTemporaryBuff !== 'function') return;
  const apply = () => {
    const curseBuff: RuntimeBuffInput = {
      ...MINING_VEIN_CURSE_BUFF_BASE,
      stacks: destroyedSpiritOreCount,
    };
    const stagnationBuff: RuntimeBuffInput = {
      ...MINING_VEIN_STAGNATION_BUFF_BASE,
      stacks: destroyedSpiritOreCount,
    };
    Reflect.apply(applyTemporaryBuff, playerRuntimeService, [normalizedPlayerId, curseBuff]);
    Reflect.apply(applyTemporaryBuff, playerRuntimeService, [normalizedPlayerId, stagnationBuff]);
  };
  const deferAttributeRecalculation = playerRuntimeService.withDeferredAttributeRecalculation;
  if (typeof deferAttributeRecalculation === 'function') {
    Reflect.apply(deferAttributeRecalculation, playerRuntimeService, [normalizedPlayerId, apply]);
    return;
  }
  apply();
}

export function resolveActiveMiningVeinBuffStacks(source: unknown, buffId: string): number {
  const buffs = Array.isArray(source)
    ? source
    : isRuntimeRecord(source) && isRuntimeRecord(source.buffs) && Array.isArray(source.buffs.buffs)
      ? source.buffs.buffs
      : [];
  const buff = buffs.find((entry) => isActiveBuff(entry, buffId));
  return buff ? Math.max(0, Math.trunc(buff.stacks)) : 0;
}

export function countDestroyedSpiritOreBatchEntries(entries: unknown, results: unknown): number {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  const normalizedResults = Array.isArray(results) ? results : [];
  let count = 0;
  for (let index = 0; index < normalizedResults.length; index += 1) {
    if (
      isDestroyedResult(normalizedResults[index])
      && resolveTileType(normalizedEntries[index]) === TileType.SpiritOre
    ) {
      count += 1;
    }
  }
  return count;
}

function isActiveBuff(entry: unknown, buffId: string): entry is {
  buffId: string;
  remainingTicks: number;
  stacks: number;
} {
  return Boolean(
    isRuntimeRecord(entry)
    && entry.buffId === buffId
    && Number(entry.remainingTicks) > 0
    && Number(entry.stacks) > 0
  );
}

function isDestroyedResult(value: unknown): boolean {
  return isRuntimeRecord(value) && value.destroyed === true;
}

function resolveTileType(entry: unknown): unknown {
  if (!isRuntimeRecord(entry)) return undefined;
  if ('tileType' in entry) return entry.tileType;
  const state = entry.state;
  return isRuntimeRecord(state) ? state.tileType : undefined;
}

function isRuntimeRecord(value: unknown): value is RuntimeRecord {
  return Boolean(value && typeof value === 'object');
}
