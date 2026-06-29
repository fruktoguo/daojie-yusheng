/**
 * 本文件定义技艺加成属性的标准四属性结构。
 *
 * 它只描述玩家最终技艺效果投影，不直接承载装备、buff、建筑、风水等来源生命周期。
 */

/** 技艺加成维度：成功率、速度、产出、经验。 */
export const CRAFT_EFFECT_KINDS = ['successRate', 'speedRate', 'outputRate', 'expRate'] as const;
export type CraftEffectKind = typeof CRAFT_EFFECT_KINDS[number];

/** 可承载标准四属性的技艺分类。 */
export const CRAFT_EFFECT_SKILL_KINDS = [
  'alchemy',
  'forging',
  'enhancement',
  'transmission',
  'gather',
  'mining',
  'building',
  'formation',
] as const;
export type CraftEffectSkillKind = typeof CRAFT_EFFECT_SKILL_KINDS[number];

/** 单个技艺的标准效果属性。 */
export interface CraftEffectStatBlock {
  successRate: number;
  speedRate: number;
  outputRate: number;
  expRate: number;
}

/** 玩家技艺效果属性快照。 */
export type CraftEffectStats = Record<CraftEffectSkillKind, CraftEffectStatBlock>;

/** 可叠加的技艺效果属性补丁。 */
export type CraftEffectStatsPatch = Partial<Record<CraftEffectSkillKind, Partial<CraftEffectStatBlock>>>;

export function createEmptyCraftEffectStatBlock(): CraftEffectStatBlock {
  return {
    successRate: 0,
    speedRate: 0,
    outputRate: 0,
    expRate: 0,
  };
}

export function createEmptyCraftEffectStats(): CraftEffectStats {
  return {
    alchemy: createEmptyCraftEffectStatBlock(),
    forging: createEmptyCraftEffectStatBlock(),
    enhancement: createEmptyCraftEffectStatBlock(),
    transmission: createEmptyCraftEffectStatBlock(),
    gather: createEmptyCraftEffectStatBlock(),
    mining: createEmptyCraftEffectStatBlock(),
    building: createEmptyCraftEffectStatBlock(),
    formation: createEmptyCraftEffectStatBlock(),
  };
}

export function cloneCraftEffectStats(source: CraftEffectStatsPatch | null | undefined): CraftEffectStats {
  const result = createEmptyCraftEffectStats();
  if (!source || typeof source !== 'object') {
    return result;
  }
  for (const skillKind of CRAFT_EFFECT_SKILL_KINDS) {
    const sourceBlock = source[skillKind];
    if (!sourceBlock || typeof sourceBlock !== 'object') {
      continue;
    }
    for (const effectKind of CRAFT_EFFECT_KINDS) {
      const value = Number(sourceBlock[effectKind]);
      result[skillKind][effectKind] = Number.isFinite(value) ? value : 0;
    }
  }
  return result;
}

export function addCraftEffectStatsPatch(target: CraftEffectStats, patch: CraftEffectStatsPatch | null | undefined): void {
  if (!patch || typeof patch !== 'object') {
    return;
  }
  for (const skillKind of CRAFT_EFFECT_SKILL_KINDS) {
    const sourceBlock = patch[skillKind];
    if (!sourceBlock || typeof sourceBlock !== 'object') {
      continue;
    }
    for (const effectKind of CRAFT_EFFECT_KINDS) {
      const value = Number(sourceBlock[effectKind]);
      if (Number.isFinite(value) && value !== 0) {
        target[skillKind][effectKind] += value;
      }
    }
  }
}

export function normalizeCraftEffectStatsPatch(source: CraftEffectStatsPatch | null | undefined): CraftEffectStatsPatch | undefined {
  if (!source || typeof source !== 'object') {
    return undefined;
  }
  const result: CraftEffectStatsPatch = {};
  for (const skillKind of CRAFT_EFFECT_SKILL_KINDS) {
    const sourceBlock = source[skillKind];
    if (!sourceBlock || typeof sourceBlock !== 'object') {
      continue;
    }
    const block: Partial<CraftEffectStatBlock> = {};
    for (const effectKind of CRAFT_EFFECT_KINDS) {
      const value = Number(sourceBlock[effectKind]);
      if (Number.isFinite(value) && value !== 0) {
        block[effectKind] = value;
      }
    }
    if (Object.keys(block).length > 0) {
      result[skillKind] = block;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function readCraftEffectStat(
  source: CraftEffectStatsPatch | null | undefined,
  skillKind: CraftEffectSkillKind,
  effectKind: CraftEffectKind,
): number {
  if (!source || typeof source !== 'object') {
    return 0;
  }
  const block = source[skillKind];
  if (!block || typeof block !== 'object') {
    return 0;
  }
  return readFiniteNumber(block[effectKind]);
}

export function scaleCraftEffectStatsPatch(
  source: CraftEffectStatsPatch | null | undefined,
  scale: (value: number) => number,
): CraftEffectStatsPatch | undefined {
  if (!source || typeof source !== 'object') {
    return undefined;
  }
  const result: CraftEffectStatsPatch = {};
  for (const skillKind of CRAFT_EFFECT_SKILL_KINDS) {
    const sourceBlock = source[skillKind];
    if (!sourceBlock || typeof sourceBlock !== 'object') {
      continue;
    }
    const block: Partial<CraftEffectStatBlock> = {};
    for (const effectKind of CRAFT_EFFECT_KINDS) {
      const value = Number(sourceBlock[effectKind]);
      if (Number.isFinite(value)) {
        const scaled = scale(value);
        if (Number.isFinite(scaled)) {
          block[effectKind] = scaled;
        }
      }
    }
    if (Object.keys(block).length > 0) {
      result[skillKind] = block;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * 按百分比额外产出率计算整数产出。
 * 例如 base=1, outputRate=3.5 时固定额外 3 个，并有 50% 概率再额外 1 个。
 */
export function applyCraftOutputRate(baseCount: number, outputRate: number, random: () => number = Math.random): number {
  const base = Math.max(0, Math.floor(Number(baseCount) || 0));
  if (base <= 0) {
    return 0;
  }
  const rate = Math.max(0, Number(outputRate) || 0);
  if (rate <= 0) {
    return base;
  }
  const expectedExtra = base * rate;
  const fixedExtra = Math.floor(expectedExtra);
  const chanceExtra = expectedExtra - fixedExtra;
  const rolledExtra = chanceExtra > 0 && random() < chanceExtra ? 1 : 0;
  return base + fixedExtra + rolledExtra;
}

export function applyCraftExpRate(baseGain: number, expRate: number): number {
  const gain = Math.max(0, Math.floor(Number(baseGain) || 0));
  if (gain <= 0) {
    return 0;
  }
  const multiplier = 1 + Math.max(0, Number(expRate) || 0);
  if (multiplier <= 0) {
    return 0;
  }
  return Math.max(1, Math.round(gain * multiplier));
}

function readFiniteNumber(value: unknown): number {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}
