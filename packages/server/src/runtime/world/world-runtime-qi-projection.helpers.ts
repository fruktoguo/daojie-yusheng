/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 灵气投影计算辅助函数
 * 根据玩家功法、buff、属性加成计算灵气资源的可见性和吸收效率
 */
import {
  DEFAULT_PLAYER_QI_RESOURCE_KEYS,
  DEFAULT_QI_EFFICIENCY_BP,
  calcTechniqueQiProjectionModifiers,
  matchesQiProjectionSelector,
  parseQiResourceKey,
  projectQiValue,
  stackQiEfficiencyBp,
  type QiProjectionModifier,
  type QiResourceDescriptor,
  type QiVisibilityLevel,
  type TechniqueLayerDef,
} from '@mud/shared';

const QI_VISIBILITY_RANK: Record<QiVisibilityLevel, number> = {
  hidden: 0,
  observable: 1,
  absorbable: 2,
};

interface QiProjectionTechniqueState {
  level?: number;
  layers?: TechniqueLayerDef[];
}

interface QiProjectionBuffState {
  remainingTicks?: number;
  stacks?: number;
  qiProjection?: QiProjectionModifier[];
}

interface QiProjectionBonusState {
  qiProjection?: QiProjectionModifier[];
}

interface QiProjectionPlayerView {
  techniques?: {
    techniques?: QiProjectionTechniqueState[];
  };
  buffs?: {
    buffs?: QiProjectionBuffState[];
  };
  attrBonuses?: QiProjectionBonusState[];
  runtimeBonuses?: QiProjectionBonusState[];
}

/** 玩家对单个灵气资源的投影结果 */
export interface PlayerQiResourceProjection {
  descriptor: QiResourceDescriptor;
  visibility: QiVisibilityLevel;
  efficiencyBp: number;
}

/** 计算玩家对指定灵气资源的实际吸收值（不可吸收返回 0） */
export function projectPlayerQiResourceValue(
  player: QiProjectionPlayerView | null | undefined,
  resourceKey: string,
  rawValue: number,
): number {
  const projection = resolvePlayerQiResourceProjection(player, resourceKey);
  if (!projection || projection.visibility !== 'absorbable') {
    return 0;
  }
  return projectQiValue(rawValue, projection.efficiencyBp);
}

/** 解析玩家对指定灵气资源的完整投影（可见性 + 效率） */
export function resolvePlayerQiResourceProjection(
  player: QiProjectionPlayerView | null | undefined,
  resourceKey: string,
): PlayerQiResourceProjection | null {
  const descriptor = parseQiResourceKey(resourceKey);
  if (!descriptor) {
    return null;
  }
  const defaultVisible = DEFAULT_PLAYER_QI_RESOURCE_KEYS.includes(resourceKey);
  let visibility: QiVisibilityLevel = defaultVisible ? 'absorbable' : 'hidden';
  let efficiencyBp = defaultVisible ? DEFAULT_QI_EFFICIENCY_BP : 0;
  for (const modifier of collectPlayerQiProjectionModifiers(player)) {
    if (!matchesQiProjectionSelector(descriptor, resourceKey, modifier.selector)) {
      continue;
    }
    if (modifier.visibility && QI_VISIBILITY_RANK[modifier.visibility] > QI_VISIBILITY_RANK[visibility]) {
      visibility = modifier.visibility;
    }
    if (modifier.efficiencyBpMultiplier !== undefined) {
      efficiencyBp = defaultVisible
        ? stackQiEfficiencyBp(efficiencyBp, modifier.efficiencyBpMultiplier)
        : Math.max(0, efficiencyBp + modifier.efficiencyBpMultiplier - DEFAULT_QI_EFFICIENCY_BP);
    }
  }
  return {
    descriptor,
    visibility,
    efficiencyBp,
  };
}

function collectPlayerQiProjectionModifiers(player: QiProjectionPlayerView | null | undefined): QiProjectionModifier[] {
  const modifiers: QiProjectionModifier[] = [];
  for (const technique of player?.techniques?.techniques ?? []) {
    modifiers.push(...calcTechniqueQiProjectionModifiers(technique.level ?? 1, technique.layers ?? undefined));
  }
  for (const buff of player?.buffs?.buffs ?? []) {
    if ((buff.remainingTicks ?? 0) <= 0 || (buff.stacks ?? 0) <= 0 || !Array.isArray(buff.qiProjection)) {
      continue;
    }
    modifiers.push(...buff.qiProjection);
  }
  for (const bonus of player?.attrBonuses ?? []) {
    if (Array.isArray(bonus.qiProjection)) {
      modifiers.push(...bonus.qiProjection);
    }
  }
  for (const bonus of player?.runtimeBonuses ?? []) {
    if (Array.isArray(bonus.qiProjection)) {
      modifiers.push(...bonus.qiProjection);
    }
  }
  return modifiers;
}
