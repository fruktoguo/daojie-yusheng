/**
 * 本文件定义技艺加成属性的标准四属性结构。
 *
 * 它只描述玩家最终技艺效果投影，不直接承载装备、buff、建筑、风水等来源生命周期。
 */
import type { CraftEquipmentStats } from './constants/gameplay/equipment';

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

/** 把旧技艺工具隐藏投影映射成标准四属性结构。 */
export function craftEquipmentStatsToCraftEffectStats(source: Partial<CraftEquipmentStats> | null | undefined): CraftEffectStats {
  const result = createEmptyCraftEffectStats();
  if (!source || typeof source !== 'object') {
    return result;
  }
  result.alchemy.successRate = readFiniteNumber(source.alchemySuccessRate);
  result.alchemy.speedRate = readFiniteNumber(source.alchemySpeedRate);
  result.forging.successRate = readFiniteNumber(source.forgingSuccessRate);
  result.forging.speedRate = readFiniteNumber(source.forgingSpeedRate);
  result.enhancement.successRate = readFiniteNumber(source.enhancementSuccessRate);
  result.enhancement.speedRate = readFiniteNumber(source.enhancementSpeedRate);
  result.mining.speedRate = readFiniteNumber(source.miningDamageRate);
  result.mining.outputRate = readFiniteNumber(source.miningDropRate);
  result.building.speedRate = readFiniteNumber(source.buildingSpeedRate);
  return result;
}

function readFiniteNumber(value: unknown): number {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}
