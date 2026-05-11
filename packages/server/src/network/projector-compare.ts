/**
 * 投影器比较工具。
 * 提供各类投影实体（玩家、怪物、NPC、容器等）的深度相等比较函数，用于 diff 判断。
 */

import type {
  Attributes,
  BuffSustainCostDef,
  EquipmentBuffDef,
  EquipmentConditionDef,
  EquipmentConditionGroup,
  GroundItemEntryView,
  NpcQuestMarker,
  PartialNumericStats,
  PlayerSpecialStats,
  PlayerWalletState,
  QiProjectionModifier,
  S2C_PanelAttrDelta,
  SkillDef,
  SkillEffectDef,
  SkillFormula,
  SkillMonsterCastDef,
  SkillPlayerCastDef,
  SkillTargetingDef,
  SyncedItemStack,
  TechniqueAttrCurveSegment,
  TechniqueLayerDef,
  TechniqueUpdateEntryView,
  VisibleBuffState,
  AttrBonus,
} from '@mud/shared';
import {
  ATTRIBUTE_KEYS,
  NUMERIC_STAT_KEYS,
  ELEMENT_GROUP_KEYS,
  type AttrBonusMetaRecord,
  type AttrBonusMetaValue,
  type ProjectedActionEntry,
  type ProjectedElementGroup,
  type ProjectedGroundPileEntry,
} from './projector-types';

/** 深度比较两个物品栈是否完全相同（所有可见字段）。 */
export function isSameItem(left: SyncedItemStack | null | undefined, right: SyncedItemStack | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.itemId === right.itemId
        && left.count === right.count
        && left.name === right.name
        && left.type === right.type
        && left.desc === right.desc
        && left.groundLabel === right.groundLabel
        && left.grade === right.grade
        && left.level === right.level
        && left.materialCategory === right.materialCategory
        && isSameMaterialValues(left.materialValues, right.materialValues)
        && left.enhanceLevel === right.enhanceLevel
        && left.equipSlot === right.equipSlot
        && isSameAttributes(left.equipAttrs, right.equipAttrs)
        && isSamePartialNumericStats(left.equipStats, right.equipStats)
        && isSamePartialNumericStats(left.equipValueStats, right.equipValueStats)
        && isSameItemSpecialStats(left.equipSpecialStats, right.equipSpecialStats)
        && isSameEquipmentEffectList(left.effects, right.effects)
        && left.healAmount === right.healAmount
        && left.healPercent === right.healPercent
        && left.qiPercent === right.qiPercent
        && isSameConsumableBuffList(left.consumeBuffs, right.consumeBuffs)
        && isSameStringList(left.tags, right.tags)
        && left.mapUnlockId === right.mapUnlockId
        && isSameStringList(left.mapUnlockIds, right.mapUnlockIds)
        && left.respawnBindMapId === right.respawnBindMapId
        && left.tileAuraGainAmount === right.tileAuraGainAmount
        && isSameTileResourceGainList(left.tileResourceGains, right.tileResourceGains)
        && left.spiritualRootSeedTier === right.spiritualRootSeedTier
        && left.alchemySuccessRate === right.alchemySuccessRate
        && left.alchemySpeedRate === right.alchemySpeedRate
        && left.enhancementSuccessRate === right.enhancementSuccessRate
        && left.enhancementSpeedRate === right.enhancementSpeedRate
        && left.allowBatchUse === right.allowBatchUse;
}

export function isSameItemSpecialStats(left: SyncedItemStack['equipSpecialStats'], right: SyncedItemStack['equipSpecialStats']) {
    return Math.trunc(Number(left?.comprehension ?? 0) || 0) === Math.trunc(Number(right?.comprehension ?? 0) || 0)
        && Math.trunc(Number(left?.luck ?? 0) || 0) === Math.trunc(Number(right?.luck ?? 0) || 0);
}

export function isSameTileResourceGainList(
    left: SyncedItemStack['tileResourceGains'],
    right: SyncedItemStack['tileResourceGains'],
) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (left[index]?.resourceKey !== right[index]?.resourceKey || left[index]?.amount !== right[index]?.amount) {
            return false;
        }
    }
    return true;
}

export function isSameMaterialValues(
    left: SyncedItemStack['materialValues'],
    right: SyncedItemStack['materialValues'],
) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return isSamePartialElementGroup(left.elements, right.elements)
        && isSameNumberRecord(left.scalars, right.scalars);
}

export function isSameNumberRecord(left: Record<string, number> | null | undefined, right: Record<string, number> | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) {
        return false;
    }
    for (let index = 0; index < leftKeys.length; index += 1) {
        const key = leftKeys[index];
        if (key !== rightKeys[index] || left[key] !== right[key]) {
            return false;
        }
    }
    return true;
}

export function isSameStringList(left: readonly string[] | null | undefined, right: readonly string[] | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) {
            return false;
        }
    }
    return true;
}

export function isSameAttributes(left: Partial<Attributes> | null | undefined, right: Partial<Attributes> | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.constitution === right.constitution
        && left.spirit === right.spirit
        && left.perception === right.perception
        && left.talent === right.talent
        && left.strength === right.strength
        && left.meridians === right.meridians;
}

export function isSamePartialNumericStats(left: PartialNumericStats | null | undefined, right: PartialNumericStats | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    for (const key of NUMERIC_STAT_KEYS) {
        if (left[key] !== right[key]) {
            return false;
        }
    }
    return isSamePartialElementGroup(left.elementDamageBonus, right.elementDamageBonus)
        && isSamePartialElementGroup(left.elementDamageReduce, right.elementDamageReduce);
}

export function isSamePartialElementGroup(
    left: Partial<ProjectedElementGroup> | null | undefined,
    right: Partial<ProjectedElementGroup> | null | undefined,
) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    for (const key of ELEMENT_GROUP_KEYS) {
        if (left[key] !== right[key]) {
            return false;
        }
    }
    return true;
}

export function isSameEquipmentEffectList(
    left: SyncedItemStack['effects'],
    right: SyncedItemStack['effects'],
) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (!isSameEquipmentEffectDef(left[index] ?? null, right[index] ?? null)) {
            return false;
        }
    }
    return true;
}

export function isSameEquipmentEffectDef(
    left: NonNullable<SyncedItemStack['effects']>[number] | null | undefined,
    right: NonNullable<SyncedItemStack['effects']>[number] | null | undefined,
) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.type !== right.type || left.effectId !== right.effectId) {
        return false;
    }
    switch (left.type) {
        case 'stat_aura':
            return right.type === 'stat_aura'
                && isSameEquipmentConditionGroup(left.conditions, right.conditions)
                && isSameAttributes(left.attrs, right.attrs)
                && isSamePartialNumericStats(left.stats, right.stats)
                && isSameQiProjectionModifierList(left.qiProjection, right.qiProjection)
                && isSamePartialNumericStats(left.valueStats, right.valueStats)
                && left.presentationScale === right.presentationScale;
        case 'progress_boost':
            return right.type === 'progress_boost'
                && isSameEquipmentConditionGroup(left.conditions, right.conditions)
                && isSameAttributes(left.attrs, right.attrs)
                && isSamePartialNumericStats(left.stats, right.stats)
                && isSameQiProjectionModifierList(left.qiProjection, right.qiProjection)
                && isSamePartialNumericStats(left.valueStats, right.valueStats);
        case 'periodic_cost':
            return right.type === 'periodic_cost'
                && left.trigger === right.trigger
                && isSameEquipmentConditionGroup(left.conditions, right.conditions)
                && left.resource === right.resource
                && left.mode === right.mode
                && left.value === right.value
                && left.minRemain === right.minRemain;
        case 'timed_buff':
            return right.type === 'timed_buff'
                && left.trigger === right.trigger
                && left.target === right.target
                && left.cooldown === right.cooldown
                && left.chance === right.chance
                && isSameEquipmentConditionGroup(left.conditions, right.conditions)
                && isSameEquipmentBuffDef(left.buff, right.buff);
    }
}

export function isSameEquipmentConditionGroup(left: EquipmentConditionGroup | null | undefined, right: EquipmentConditionGroup | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.mode === right.mode
        && isSameEquipmentConditionList(left.items, right.items);
}

export function isSameEquipmentConditionList(left: EquipmentConditionDef[], right: EquipmentConditionDef[]) {
    if (left === right) {
        return true;
    }
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (!isSameEquipmentConditionDef(left[index] ?? null, right[index] ?? null)) {
            return false;
        }
    }
    return true;
}

export function isSameEquipmentConditionDef(left: EquipmentConditionDef | null | undefined, right: EquipmentConditionDef | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.type !== right.type) {
        return false;
    }
    switch (left.type) {
        case 'time_segment':
            return right.type === 'time_segment' && isSameStringList(left.in, right.in);
        case 'map':
            return right.type === 'map' && isSameStringList(left.mapIds, right.mapIds);
        case 'target_kind':
            return right.type === 'target_kind' && isSameStringList(left.in, right.in);
        case 'hp_ratio':
        case 'qi_ratio':
            return right.type === left.type && left.op === right.op && left.value === right.value;
        case 'is_cultivating':
            return right.type === 'is_cultivating' && left.value === right.value;
        case 'has_buff':
            return right.type === 'has_buff' && left.buffId === right.buffId && left.minStacks === right.minStacks;
    }
}

export function isSameEquipmentBuffDef(left: EquipmentBuffDef | null | undefined, right: EquipmentBuffDef | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.buffId === right.buffId
        && left.name === right.name
        && left.desc === right.desc
        && left.shortMark === right.shortMark
        && left.category === right.category
        && left.visibility === right.visibility
        && left.color === right.color
        && left.duration === right.duration
        && left.stacks === right.stacks
        && left.maxStacks === right.maxStacks
        && isSameAttributes(left.attrs, right.attrs)
        && isSamePartialNumericStats(left.stats, right.stats)
        && isSameQiProjectionModifierList(left.qiProjection, right.qiProjection)
        && isSamePartialNumericStats(left.valueStats, right.valueStats)
        && left.presentationScale === right.presentationScale;
}

export function isSameConsumableBuffList(
    left: SyncedItemStack['consumeBuffs'],
    right: SyncedItemStack['consumeBuffs'],
) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (!isSameConsumableBuffDef(left[index] ?? null, right[index] ?? null)) {
            return false;
        }
    }
    return true;
}

export function isSameConsumableBuffDef(
    left: NonNullable<SyncedItemStack['consumeBuffs']>[number] | null | undefined,
    right: NonNullable<SyncedItemStack['consumeBuffs']>[number] | null | undefined,
) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.buffId === right.buffId
        && left.name === right.name
        && left.desc === right.desc
        && left.shortMark === right.shortMark
        && left.category === right.category
        && left.visibility === right.visibility
        && left.color === right.color
        && left.duration === right.duration
        && left.maxStacks === right.maxStacks
        && isSameAttributes(left.attrs, right.attrs)
        && isSamePartialNumericStats(left.stats, right.stats)
        && isSameQiProjectionModifierList(left.qiProjection, right.qiProjection)
        && isSamePartialNumericStats(left.valueStats, right.valueStats)
        && left.presentationScale === right.presentationScale
        && isSameBuffSustainCostDef(left.sustainCost, right.sustainCost)
        && left.infiniteDuration === right.infiniteDuration
        && left.expireWithBuffId === right.expireWithBuffId
        && left.sourceSkillId === right.sourceSkillId;
}

export function isSameBuffSustainCostDef(left: BuffSustainCostDef | null | undefined, right: BuffSustainCostDef | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.resource === right.resource
        && left.baseCost === right.baseCost
        && left.growthRate === right.growthRate;
}

export function isSameQiProjectionModifierList(
    left: QiProjectionModifier[] | null | undefined,
    right: QiProjectionModifier[] | null | undefined,
) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (!isSameQiProjectionModifier(left[index] ?? null, right[index] ?? null)) {
            return false;
        }
    }
    return true;
}

export function isSameQiProjectionModifier(left: QiProjectionModifier | null | undefined, right: QiProjectionModifier | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.visibility === right.visibility
        && left.efficiencyBpMultiplier === right.efficiencyBpMultiplier
        && isSameQiProjectionSelector(left.selector, right.selector);
}

export function isSameQiProjectionSelector(
    left: QiProjectionModifier['selector'],
    right: QiProjectionModifier['selector'],
) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return isSameStringList(left.resourceKeys, right.resourceKeys)
        && isSameStringList(left.families, right.families)
        && isSameStringList(left.forms, right.forms)
        && isSameStringList(left.elements, right.elements);
}

export function isSameBuffEntry(left: VisibleBuffState | null | undefined, right: VisibleBuffState | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.buffId === right.buffId
        && left.name === right.name
        && left.desc === right.desc
        && left.shortMark === right.shortMark
        && left.category === right.category
        && left.visibility === right.visibility
        && left.remainingTicks === right.remainingTicks
        && left.duration === right.duration
        && left.stacks === right.stacks
        && left.maxStacks === right.maxStacks
        && left.sourceSkillId === right.sourceSkillId
        && left.sourceSkillName === right.sourceSkillName
        && left.color === right.color
        && isSameAttributes(left.attrs, right.attrs)
        && isSamePartialNumericStats(left.stats, right.stats)
        && isSameQiProjectionModifierList(left.qiProjection, right.qiProjection);
}

export function isSameBuffList(left: VisibleBuffState[], right: VisibleBuffState[]): boolean {
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (!isSameBuffEntry(left[index], right[index])) {
            return false;
        }
    }
    return true;
}

export function isSameActionEntry(left: ProjectedActionEntry | null | undefined, right: ProjectedActionEntry | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.id === right.id
        && left.name === right.name
        && left.type === right.type
        && left.desc === right.desc
        && left.cooldownLeft === right.cooldownLeft
        && left.range === right.range
        && left.requiresTarget === right.requiresTarget
        && left.targetMode === right.targetMode
        && left.autoBattleEnabled === right.autoBattleEnabled
        && left.autoBattleOrder === right.autoBattleOrder
        && left.skillEnabled === right.skillEnabled;
}

export function isSameActionOrder(previous: ProjectedActionEntry[], current: ProjectedActionEntry[]): boolean {
    if (previous.length !== current.length) {
        return false;
    }
    for (let index = 0; index < previous.length; index += 1) {
        if (previous[index]?.id !== current[index]?.id) {
            return false;
        }
    }
    return true;
}

export function isSameGroundPile(left: ProjectedGroundPileEntry | null | undefined, right: ProjectedGroundPileEntry | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    if (left.x !== right.x || left.y !== right.y || left.items.length !== right.items.length) {
        return false;
    }
    for (let index = 0; index < left.items.length; index += 1) {
        if (!isSameGroundItemEntry(left.items[index] ?? null, right.items[index] ?? null)) {
            return false;
        }
    }
    return true;
}

export function isSameGroundItemEntry(left: GroundItemEntryView | null | undefined, right: GroundItemEntryView | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.itemKey === right.itemKey
        && left.itemId === right.itemId
        && left.name === right.name
        && left.type === right.type
        && left.count === right.count
        && left.grade === right.grade
        && left.groundLabel === right.groundLabel;
}

export function isSameNpcQuestMarker(left: NpcQuestMarker | null | undefined, right: NpcQuestMarker | null | undefined) {
    return left?.line === right?.line && left?.state === right?.state;
}

export function isSameWalletState(left: PlayerWalletState | null | undefined, right: PlayerWalletState | null | undefined): boolean {
    const leftBalances = Array.isArray(left?.balances) ? left.balances : [];
    const rightBalances = Array.isArray(right?.balances) ? right.balances : [];
    if (leftBalances.length !== rightBalances.length) {
        return false;
    }
    for (let index = 0; index < leftBalances.length; index += 1) {
        const leftEntry = leftBalances[index];
        const rightEntry = rightBalances[index];
        if (!leftEntry || !rightEntry) {
            return false;
        }
        if (leftEntry.walletType !== rightEntry.walletType
            || Number(leftEntry.balance ?? 0) !== Number(rightEntry.balance ?? 0)
            || Number(leftEntry.frozenBalance ?? 0) !== Number(rightEntry.frozenBalance ?? 0)
            || Number(leftEntry.version ?? 0) !== Number(rightEntry.version ?? 0)) {
            return false;
        }
    }
    return true;
}

export function isSameSpecialStats(left: PlayerSpecialStats, right: PlayerSpecialStats) {
    return left.foundation === right.foundation
        && left.rootFoundation === right.rootFoundation
        && left.bodyTrainingLevel === right.bodyTrainingLevel
        && left.combatExp === right.combatExp
        && left.comprehension === right.comprehension
        && left.luck === right.luck;
}

export function isSameAttrBonuses(left: AttrBonus[], right: AttrBonus[]) {
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        const leftEntry = left[index];
        const rightEntry = right[index];
        if (leftEntry.source !== rightEntry.source
            || leftEntry.label !== rightEntry.label
            || !isSameAttributes(leftEntry.attrs, rightEntry.attrs)
            || leftEntry.attrMode !== rightEntry.attrMode
            || !isSamePartialNumericStats(leftEntry.stats, rightEntry.stats)
            || !isSameQiProjectionModifierList(leftEntry.qiProjection, rightEntry.qiProjection)
            || !isSameAttrBonusMeta(leftEntry.meta, rightEntry.meta)) {
            return false;
        }
    }
    return true;
}

export function isSameCraftSkillState(
  left: S2C_PanelAttrDelta['alchemySkill'],
  right: S2C_PanelAttrDelta['alchemySkill'],
): boolean {
  if (!left && !right) {
    return true;
  }
  return Boolean(
    left
    && right
    && left.level === right.level
    && left.exp === right.exp
    && left.expToNext === right.expToNext,
  );
}

export function isSameTechniqueEntry(left: TechniqueUpdateEntryView | null | undefined, right: TechniqueUpdateEntryView | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.techId === right.techId
        && left.level === right.level
        && left.exp === right.exp
        && left.expToNext === right.expToNext
        && left.realmLv === right.realmLv
        && left.realm === right.realm
        && (left.skillsEnabled !== false) === (right.skillsEnabled !== false)
        && left.name === right.name
        && left.grade === right.grade
        && left.category === right.category
        && isSameTechniqueSkillList(left.skills, right.skills)
        && isSameTechniqueLayerList(left.layers, right.layers)
        && isSameTechniqueAttrCurves(left.attrCurves, right.attrCurves);
}

export function isSameTechniqueSkillList(left: TechniqueUpdateEntryView['skills'], right: TechniqueUpdateEntryView['skills']) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (!isSameSkillDef(left[index] ?? null, right[index] ?? null)) {
            return false;
        }
    }
    return true;
}

export function isSameTechniqueLayerList(left: TechniqueUpdateEntryView['layers'], right: TechniqueUpdateEntryView['layers']) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (!isSameTechniqueLayerDef(left[index] ?? null, right[index] ?? null)) {
            return false;
        }
    }
    return true;
}

export function isSameTechniqueAttrCurves(left: TechniqueUpdateEntryView['attrCurves'], right: TechniqueUpdateEntryView['attrCurves']) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    for (const key of ATTRIBUTE_KEYS) {
        if (!isSameTechniqueAttrCurveSegmentList(left[key], right[key])) {
            return false;
        }
    }
    return true;
}

export function isSameSkillDef(left: SkillDef | null | undefined, right: SkillDef | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.id === right.id
        && left.name === right.name
        && left.desc === right.desc
        && left.cooldown === right.cooldown
        && left.cost === right.cost
        && left.costMultiplier === right.costMultiplier
        && left.range === right.range
        && isSameSkillTargetingDef(left.targeting, right.targeting)
        && isSameSkillEffectList(left.effects, right.effects)
        && left.unlockLevel === right.unlockLevel
        && left.unlockRealm === right.unlockRealm
        && left.unlockPlayerRealm === right.unlockPlayerRealm
        && left.requiresTarget === right.requiresTarget
        && left.targetMode === right.targetMode
        && isSameSkillPlayerCastDef(left.playerCast, right.playerCast)
        && isSameSkillMonsterCastDef(left.monsterCast, right.monsterCast);
}

export function isSameSkillTargetingDef(left: SkillTargetingDef | null | undefined, right: SkillTargetingDef | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.shape === right.shape
        && left.range === right.range
        && left.radius === right.radius
        && left.innerRadius === right.innerRadius
        && left.width === right.width
        && left.height === right.height
        && left.checkerParity === right.checkerParity
        && left.maxTargets === right.maxTargets
        && left.requiresTarget === right.requiresTarget
        && left.targetMode === right.targetMode;
}

export function isSameSkillEffectList(left: SkillEffectDef[] | null | undefined, right: SkillEffectDef[] | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (!isSameSkillEffectDef(left[index] ?? null, right[index] ?? null)) {
            return false;
        }
    }
    return true;
}

export function isSameSkillEffectDef(left: SkillEffectDef | null | undefined, right: SkillEffectDef | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.type !== right.type) {
        return false;
    }
    switch (left.type) {
        case 'damage':
            return right.type === 'damage'
                && left.damageKind === right.damageKind
                && left.element === right.element
                && isSameSkillFormula(left.formula, right.formula);
        case 'heal':
            return right.type === 'heal'
                && left.target === right.target
                && isSameSkillFormula(left.formula, right.formula);
        case 'buff':
            return right.type === 'buff'
                && left.target === right.target
                && left.buffId === right.buffId
                && left.name === right.name
                && left.desc === right.desc
                && left.shortMark === right.shortMark
                && left.category === right.category
                && left.visibility === right.visibility
                && left.color === right.color
                && left.duration === right.duration
                && left.stacks === right.stacks
                && left.maxStacks === right.maxStacks
                && isSameAttributes(left.attrs, right.attrs)
                && isSamePartialNumericStats(left.stats, right.stats)
                && isSameQiProjectionModifierList(left.qiProjection, right.qiProjection)
                && isSamePartialNumericStats(left.valueStats, right.valueStats)
                && left.presentationScale === right.presentationScale
                && left.infiniteDuration === right.infiniteDuration
                && isSameBuffSustainCostDef(left.sustainCost, right.sustainCost)
                && left.expireWithBuffId === right.expireWithBuffId;
        case 'cleanse':
            return right.type === 'cleanse'
                && left.target === right.target
                && left.category === right.category
                && left.removeCount === right.removeCount;
        case 'temporary_tile':
            return right.type === 'temporary_tile'
                && left.tileType === right.tileType
                && left.durationTicks === right.durationTicks
                && left.excludeAnchor === right.excludeAnchor
                && isSameSkillFormula(left.hpFormula, right.hpFormula);
    }
}

export function isSameSkillFormula(left: SkillFormula | null | undefined, right: SkillFormula | null | undefined) {
    if (left === right) {
        return true;
    }
    if (typeof left === 'number' || typeof right === 'number') {
        return left === right;
    }
    if (!left || !right) {
        return false;
    }
    if ('var' in left || 'var' in right) {
        return 'var' in left
            && 'var' in right
            && left.var === right.var
            && left.scale === right.scale;
    }
    if (left.op === 'clamp' || right.op === 'clamp') {
        return left.op === 'clamp'
            && right.op === 'clamp'
            && isSameSkillFormula(left.value, right.value)
            && isSameSkillFormula(left.min, right.min)
            && isSameSkillFormula(left.max, right.max);
    }
    if (left.op !== right.op || left.args.length !== right.args.length) {
        return false;
    }
    for (let index = 0; index < left.args.length; index += 1) {
        if (!isSameSkillFormula(left.args[index], right.args[index])) {
            return false;
        }
    }
    return true;
}

export function isSameSkillMonsterCastDef(left: SkillMonsterCastDef | null | undefined, right: SkillMonsterCastDef | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.windupTicks === right.windupTicks
        && left.warningColor === right.warningColor
        && isSameEquipmentConditionGroup(left.conditions, right.conditions);
}

export function isSameSkillPlayerCastDef(left: SkillPlayerCastDef | null | undefined, right: SkillPlayerCastDef | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.windupTicks === right.windupTicks
        && left.warningColor === right.warningColor;
}

export function isSameTechniqueLayerDef(left: TechniqueLayerDef | null | undefined, right: TechniqueLayerDef | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.level === right.level
        && left.expToNext === right.expToNext
        && isSameAttributes(left.attrs, right.attrs)
        && isSameQiProjectionModifierList(left.qiProjection, right.qiProjection);
}

export function isSameTechniqueAttrCurveSegmentList(
    left: TechniqueAttrCurveSegment[] | null | undefined,
    right: TechniqueAttrCurveSegment[] | null | undefined,
) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        const leftEntry = left[index];
        const rightEntry = right[index];
        if (!leftEntry || !rightEntry) {
            return false;
        }
        if (
            leftEntry.startLevel !== rightEntry.startLevel
            || leftEntry.endLevel !== rightEntry.endLevel
            || leftEntry.gainPerLevel !== rightEntry.gainPerLevel
        ) {
            return false;
        }
    }
    return true;
}

export function isSameAttrBonusMeta(left: Record<string, unknown> | null | undefined, right: Record<string, unknown> | null | undefined) {
    return isSameAttrBonusMetaRecord(left, right);
}

export function isSameAttrBonusMetaRecord(
    left: Record<string, unknown> | null | undefined,
    right: Record<string, unknown> | null | undefined,
): boolean {
    if (left === right) {
        return true;
    }
    const normalizedLeft = normalizeAttrBonusMetaRecord(left);
    const normalizedRight = normalizeAttrBonusMetaRecord(right);
    if (!normalizedLeft || !normalizedRight) {
        return false;
    }
    const leftKeys = Object.keys(normalizedLeft);
    const rightKeys = Object.keys(normalizedRight);
    if (leftKeys.length !== rightKeys.length) {
        return false;
    }
    for (const key of leftKeys) {
        if (!Object.prototype.hasOwnProperty.call(normalizedRight, key)) {
            return false;
        }
        if (!isSameAttrBonusMetaValue(normalizedLeft[key], normalizedRight[key])) {
            return false;
        }
    }
    return true;
}

function isSameAttrBonusMetaValue(left: AttrBonusMetaValue, right: AttrBonusMetaValue): boolean {
    if (left === right) {
        return true;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
            return false;
        }
        for (let index = 0; index < left.length; index += 1) {
            if (!isSameAttrBonusMetaValue(left[index], right[index] ?? null)) {
                return false;
            }
        }
        return true;
    }
    if (left && typeof left === 'object' && right && typeof right === 'object') {
        return isSameAttrBonusMetaRecord(left, right);
    }
    return false;
}

function normalizeAttrBonusMetaRecord(
    value: Record<string, unknown> | null | undefined,
): AttrBonusMetaRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value as AttrBonusMetaRecord;
}
