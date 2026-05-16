/**
 * 投影器深拷贝工具。
 * 提供各类投影实体的结构化深拷贝函数，用于快照保存和 diff 基线。
 */

import type {
  Attributes,
  BuffSustainCostDef,
  EquipmentBuffDef,
  EquipmentConditionDef,
  EquipmentConditionGroup,
  NumericRatioDivisors,
  NumericStats,
  PartialNumericStats,
  PlayerSpecialStats,
  PlayerWalletState,
  QiProjectionModifier,
  SyncedItemStack,
  TechniqueUpdateEntryView,
  VisibleBuffState,
  AttrBonus,
} from '@mud/shared';
import { cloneVisibleBuffProjection } from '../runtime/player/player-buff-projection.helpers';
import {
  ATTRIBUTE_KEYS,
  NUMERIC_STAT_KEYS,
  type AttrBonusMetaRecord,
  type AttrBonusMetaValue,
} from './projector-types';

export function cloneSyncedItemStack(source: SyncedItemStack): SyncedItemStack {
    return {
        ...source,
        equipAttrs: source.equipAttrs ? clonePartialAttributes(source.equipAttrs) : undefined,
        equipStats: clonePartialNumericStats(source.equipStats),
        equipValueStats: clonePartialNumericStats(source.equipValueStats),
        equipSpecialStats: source.equipSpecialStats ? { ...source.equipSpecialStats } : undefined,
        materialValues: cloneMaterialValues(source.materialValues),
        effects: source.effects?.map((entry) => cloneEquipmentEffectDef(entry)),
        consumeBuffs: source.consumeBuffs?.map((entry) => cloneConsumableBuffDef(entry)),
        tags: source.tags?.slice(),
        mapUnlockIds: source.mapUnlockIds?.slice(),
        tileResourceGains: source.tileResourceGains?.map((entry) => ({ ...entry })),
    };
}

export function cloneMaterialValues(source: SyncedItemStack['materialValues']): SyncedItemStack['materialValues'] {
    if (!source) {
        return undefined;
    }
    return {
        elements: source.elements ? { ...source.elements } : undefined,
        scalars: source.scalars ? { ...source.scalars } : undefined,
    };
}

export function cloneEquipmentEffectDef(source: NonNullable<SyncedItemStack['effects']>[number]) {
    switch (source.type) {
        case 'stat_aura':
            return {
                ...source,
                conditions: source.conditions ? cloneEquipmentConditionGroup(source.conditions) : undefined,
                attrs: source.attrs ? clonePartialAttributes(source.attrs) : undefined,
                stats: clonePartialNumericStats(source.stats),
                qiProjection: source.qiProjection?.map((entry) => cloneQiProjectionModifier(entry)),
                valueStats: clonePartialNumericStats(source.valueStats),
            };
        case 'progress_boost':
            return {
                ...source,
                conditions: source.conditions ? cloneEquipmentConditionGroup(source.conditions) : undefined,
                attrs: source.attrs ? clonePartialAttributes(source.attrs) : undefined,
                stats: clonePartialNumericStats(source.stats),
                qiProjection: source.qiProjection?.map((entry) => cloneQiProjectionModifier(entry)),
                valueStats: clonePartialNumericStats(source.valueStats),
            };
        case 'periodic_cost':
            return {
                ...source,
                conditions: source.conditions ? cloneEquipmentConditionGroup(source.conditions) : undefined,
            };
        case 'timed_buff':
            return {
                ...source,
                conditions: source.conditions ? cloneEquipmentConditionGroup(source.conditions) : undefined,
                buff: cloneEquipmentBuffDef(source.buff),
            };
    }
}

export function cloneConsumableBuffDef(source: NonNullable<SyncedItemStack['consumeBuffs']>[number]) {
    return {
        ...source,
        attrs: source.attrs ? clonePartialAttributes(source.attrs) : undefined,
        stats: clonePartialNumericStats(source.stats),
        qiProjection: source.qiProjection?.map((entry) => cloneQiProjectionModifier(entry)),
        valueStats: clonePartialNumericStats(source.valueStats),
        sustainCost: source.sustainCost ? cloneBuffSustainCostDef(source.sustainCost) : undefined,
    };
}

export function cloneEquipmentConditionGroup(source: EquipmentConditionGroup): EquipmentConditionGroup {
    return {
        mode: source.mode,
        items: source.items.map((entry) => cloneEquipmentConditionDef(entry)),
    };
}

export function cloneEquipmentConditionDef(source: EquipmentConditionDef): EquipmentConditionDef {
    switch (source.type) {
        case 'time_segment':
            return { type: source.type, in: source.in.slice() };
        case 'map':
            return { type: source.type, mapIds: source.mapIds.slice() };
        case 'target_kind':
            return { type: source.type, in: source.in.slice() };
        case 'hp_ratio':
        case 'qi_ratio':
            return { type: source.type, op: source.op, value: source.value };
        case 'is_cultivating':
            return { type: source.type, value: source.value };
        case 'has_buff':
            return { type: source.type, buffId: source.buffId, minStacks: source.minStacks };
    }
}

export function cloneEquipmentBuffDef(source: EquipmentBuffDef): EquipmentBuffDef {
    return {
        ...source,
        attrs: source.attrs ? clonePartialAttributes(source.attrs) : undefined,
        stats: clonePartialNumericStats(source.stats),
        qiProjection: source.qiProjection?.map((entry) => cloneQiProjectionModifier(entry)),
        valueStats: clonePartialNumericStats(source.valueStats),
    };
}

export function cloneBuffSustainCostDef(source: BuffSustainCostDef): BuffSustainCostDef {
    return {
        resource: source.resource,
        baseCost: source.baseCost,
        growthRate: source.growthRate,
    };
}

export function cloneTechniqueEntry(source: TechniqueUpdateEntryView): TechniqueUpdateEntryView {
    return {
        ...source,
        skillsEnabled: source.skillsEnabled !== false,
        // skills/layers 来自模板，运行时只读共享，投影/diff 不需要克隆。
        skills: source.skills,
        layers: source.layers,
    };
}

export function cloneAttributes(source: Attributes) {
    return {
        constitution: source.constitution,
        spirit: source.spirit,
        perception: source.perception,
        talent: source.talent,
        strength: source.strength ?? (source as Record<string, number>).comprehension ?? 0,
        meridians: source.meridians ?? (source as Record<string, number>).luck ?? 0,
    };
}

export function clonePartialAttributes(source: Partial<Attributes>): Partial<Attributes> {
    const clone: Partial<Attributes> = {};
    for (const key of ATTRIBUTE_KEYS) {
        if (source[key] !== undefined) {
            clone[key] = source[key];
        }
    }
    return clone;
}

export function cloneSpecialStats(source: PlayerSpecialStats): PlayerSpecialStats {
    return {
        foundation: source.foundation,
        rootFoundation: source.rootFoundation,
        bodyTrainingLevel: source.bodyTrainingLevel,
        combatExp: source.combatExp,
        comprehension: source.comprehension,
        luck: source.luck,
    };
}

export function cloneWalletState(source: PlayerWalletState | null | undefined): PlayerWalletState | null {
    if (!source || !Array.isArray(source.balances)) {
        return null;
    }
    return {
        balances: source.balances
            .map((entry) => ({
            walletType: typeof entry?.walletType === 'string' ? entry.walletType.trim() : '',
            balance: Math.max(0, Math.trunc(Number(entry?.balance ?? 0))),
            frozenBalance: Math.max(0, Math.trunc(Number(entry?.frozenBalance ?? 0))),
            version: Math.max(1, Math.trunc(Number(entry?.version ?? 1))),
        }))
            .filter((entry) => entry.walletType),
    };
}

export function cloneAttrBonus(source: AttrBonus): AttrBonus {
    return {
        source: source.source,
        label: source.label,
        attrs: clonePartialAttributes(source.attrs),
        attrMode: source.attrMode,
        stats: clonePartialNumericStats(source.stats),
        qiProjection: source.qiProjection ? source.qiProjection.map((entry) => cloneQiProjectionModifier(entry)) : undefined,
        meta: cloneAttrBonusMetaRecord(source.meta),
    };
}

export function cloneNumericStats(source: NumericStats): NumericStats {
    return {
        maxHp: source.maxHp,
        maxQi: source.maxQi,
        physAtk: source.physAtk,
        spellAtk: source.spellAtk,
        physDef: source.physDef,
        spellDef: source.spellDef,
        hit: source.hit,
        dodge: source.dodge,
        crit: source.crit,
        antiCrit: source.antiCrit,
        critDamage: source.critDamage,
        breakPower: source.breakPower,
        resolvePower: source.resolvePower,
        maxQiOutputPerTick: source.maxQiOutputPerTick,
        qiRegenRate: source.qiRegenRate,
        hpRegenRate: source.hpRegenRate,
        cooldownSpeed: source.cooldownSpeed,
        auraCostReduce: source.auraCostReduce,
        auraPowerRate: source.auraPowerRate,
        playerExpRate: source.playerExpRate,
        techniqueExpRate: source.techniqueExpRate,
        realmExpPerTick: source.realmExpPerTick,
        techniqueExpPerTick: source.techniqueExpPerTick,
        lootRate: source.lootRate,
        rareLootRate: source.rareLootRate,
        viewRange: source.viewRange,
        moveSpeed: source.moveSpeed,
        extraAggroRate: source.extraAggroRate,
        extraRange: source.extraRange,
        extraArea: source.extraArea,
        actionsPerTurn: source.actionsPerTurn ?? 1,
        elementDamageBonus: {
            metal: source.elementDamageBonus.metal,
            wood: source.elementDamageBonus.wood,
            water: source.elementDamageBonus.water,
            fire: source.elementDamageBonus.fire,
            earth: source.elementDamageBonus.earth,
        },
        elementDamageReduce: {
            metal: source.elementDamageReduce.metal,
            wood: source.elementDamageReduce.wood,
            water: source.elementDamageReduce.water,
            fire: source.elementDamageReduce.fire,
            earth: source.elementDamageReduce.earth,
        },
    };
}

export function clonePartialNumericStats(source: PartialNumericStats | null | undefined): PartialNumericStats | undefined {
    if (!source) {
        return undefined;
    }
    const clone: PartialNumericStats = {};
    for (const key of NUMERIC_STAT_KEYS) {
        if (source[key] !== undefined) {
            clone[key] = source[key];
        }
    }
    if (source.elementDamageBonus) {
        clone.elementDamageBonus = { ...source.elementDamageBonus };
    }
    if (source.elementDamageReduce) {
        clone.elementDamageReduce = { ...source.elementDamageReduce };
    }
    return Object.keys(clone).length > 0 ? clone : undefined;
}

export function cloneNumericRatioDivisors(source: NumericRatioDivisors): NumericRatioDivisors {
    return {
        dodge: source.dodge,
        crit: source.crit,
        breakPower: source.breakPower,
        resolvePower: source.resolvePower,
        cooldownSpeed: source.cooldownSpeed,
        moveSpeed: source.moveSpeed,
        elementDamageReduce: {
            metal: source.elementDamageReduce.metal,
            wood: source.elementDamageReduce.wood,
            water: source.elementDamageReduce.water,
            fire: source.elementDamageReduce.fire,
            earth: source.elementDamageReduce.earth,
        },
    };
}

export function cloneQiProjectionModifier(source: QiProjectionModifier): QiProjectionModifier {
    return {
        ...source,
        selector: source.selector
            ? {
                ...source.selector,
                resourceKeys: source.selector.resourceKeys ? source.selector.resourceKeys.slice() : undefined,
                families: source.selector.families ? source.selector.families.slice() : undefined,
                forms: source.selector.forms ? source.selector.forms.slice() : undefined,
                elements: source.selector.elements ? source.selector.elements.slice() : undefined,
            }
            : undefined,
    };
}

export function cloneVisibleBuff(source: VisibleBuffState): VisibleBuffState {
    return cloneVisibleBuffProjection(source);
}

export function cloneAttrBonusMetaRecord(
    source: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
    const normalizedSource = normalizeAttrBonusMetaRecord(source);
    return normalizedSource ? cloneAttrBonusMetaRecordValue(normalizedSource) : undefined;
}

function cloneAttrBonusMetaValue(value: AttrBonusMetaValue): AttrBonusMetaValue {
    if (Array.isArray(value)) {
        return value.map((entry) => cloneAttrBonusMetaValue(entry));
    }
    if (value && typeof value === 'object') {
        const clone: AttrBonusMetaRecord = {};
        for (const [key, entry] of Object.entries(value)) {
            clone[key] = cloneAttrBonusMetaValue(entry);
        }
        return clone;
    }
    return value;
}

function cloneAttrBonusMetaRecordValue(value: AttrBonusMetaRecord): AttrBonusMetaRecord {
    return cloneAttrBonusMetaValue(value) as AttrBonusMetaRecord;
}

function normalizeAttrBonusMetaRecord(
    value: Record<string, unknown> | null | undefined,
): AttrBonusMetaRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value as AttrBonusMetaRecord;
}
