/**
 * 法宝纯规则计算。
 *
 * 这些函数同时供服务端权威运行时和客户端展示预览使用，避免法宝灵力上限、
 * 强化倍率和固定消耗公式在多端分叉。
 */
import { ARTIFACT_BASELINE_REALM_LV } from './constants/gameplay/equipment';
import { getEnhancementPercent } from './enhancement';
import type { ItemStack } from './item-runtime-types';
import { getTechniqueStandardMaxQiBaseline } from './technique';

type ArtifactQiItemLike = Pick<ItemStack, 'artifactMaxQiFactor' | 'artifactEffects' | 'enhanceLevel'> | null | undefined;

const ARTIFACT_BASELINE_MAX_QI = getTechniqueStandardMaxQiBaseline(ARTIFACT_BASELINE_REALM_LV);

export function resolveArtifactBaseMaxQi(item: ArtifactQiItemLike): number {
  const factor = Number.isFinite(Number(item?.artifactMaxQiFactor))
    ? Math.max(0, Number(item?.artifactMaxQiFactor))
    : 0;
  if (factor <= 0) {
    return 0;
  }
  return Math.max(0, Math.round(ARTIFACT_BASELINE_MAX_QI * factor));
}

export function resolveArtifactMaxQi(item: ArtifactQiItemLike): number {
  const baseMaxQi = resolveArtifactBaseMaxQi(item);
  if (baseMaxQi <= 0) {
    return 0;
  }
  return Math.max(0, Math.round(baseMaxQi * getEnhancementPercent(item?.enhanceLevel) / 100));
}

export function resolveArtifactSustainCostPerTick(item: ArtifactQiItemLike): number {
  const baseMaxQi = resolveArtifactBaseMaxQi(item);
  if (baseMaxQi <= 0 || !Array.isArray(item?.artifactEffects)) {
    return 0;
  }
  let cost = 0;
  for (const effect of item.artifactEffects) {
    if (effect.type !== 'traverse_unwalkable') {
      continue;
    }
    const ratio = Number(effect.costMaxQiRatio);
    if (!Number.isFinite(ratio) || ratio <= 0) {
      continue;
    }
    cost += Math.max(1, Math.ceil(baseMaxQi * Math.min(1, ratio)));
  }
  return cost;
}
