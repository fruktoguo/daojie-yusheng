// @ts-nocheck

import {
  DEFAULT_PLAYER_QI_RESOURCE_KEYS,
  DEFAULT_QI_EFFICIENCY_BP,
  calcTechniqueQiProjectionModifiers,
  matchesQiProjectionSelector,
  parseQiResourceKey,
  projectQiValue,
  stackQiEfficiencyBp,
} from '@mud/shared';

const QI_VISIBILITY_RANK = {
  hidden: 0,
  observable: 1,
  absorbable: 2,
};

export function projectPlayerQiResourceValue(player, resourceKey, rawValue) {
  const projection = resolvePlayerQiResourceProjection(player, resourceKey);
  if (!projection || projection.visibility !== 'absorbable') {
    return 0;
  }
  return projectQiValue(rawValue, projection.efficiencyBp);
}

export function resolvePlayerQiResourceProjection(player, resourceKey) {
  const descriptor = parseQiResourceKey(resourceKey);
  if (!descriptor) {
    return null;
  }
  const defaultVisible = DEFAULT_PLAYER_QI_RESOURCE_KEYS.includes(resourceKey);
  let visibility = defaultVisible ? 'absorbable' : 'hidden';
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

function collectPlayerQiProjectionModifiers(player) {
  const modifiers = [];
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
