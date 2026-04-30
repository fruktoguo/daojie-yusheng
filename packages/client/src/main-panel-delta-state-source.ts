import {
  type ActionDef,
  type ActionUpdateEntry,
  type Attributes,
  type Inventory,
  type S2C_ActionsUpdate,
  type S2C_AttrUpdate,
  type S2C_EquipmentUpdate,
  type S2C_InventoryUpdate,
  type S2C_PanelActionDelta,
  type S2C_PanelTechniqueDelta,
  type S2C_TechniqueUpdate,
  type NumericRatioDivisors,
  type NumericStats,
  type PartialNumericRatioDivisors,
  type PartialNumericStats,
  type PlayerState,
  type SyncedItemStack,
  type TechniqueState,
  buildDefaultCombatTargetingRules,
  clonePlainValue,
  EQUIP_SLOTS,
  isPlainEqual,
  normalizeAutoBattleTargetingMode,
  normalizeCombatTargetingRules,
  TechniqueRealm,
} from '@mud/shared';
import {
  getLocalItemTemplate,
  getLocalSkillTemplate,
  getLocalTechniqueTemplate,
  resolvePreviewTechnique,
} from './content/local-templates';
import { getStaticClientActionDef } from './constants/ui/action';
/**
 * MainPanelDeltaStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainPanelDeltaStateSourceOptions = {
/**
 * getPlayer：玩家引用。
 */

  getPlayer: () => PlayerState | null;  
  /**
 * refreshObservedDecorations：刷新地图实体展示装饰。
 */

  refreshObservedDecorations: () => void;  
  /**
 * attrPanel：attr面板相关字段。
 */

  attrPanel: {  
  /**
 * update：update相关字段。
 */

    update: (value: S2C_AttrUpdate) => void;
    /**
 * invalidateDetail：标记属性详情过期。
 */

    invalidateDetail?: () => void;
  };  
  /**
 * equipmentPanel：装备面板相关字段。
 */

  equipmentPanel: {  
  /**
 * update：update相关字段。
 */

    update: (equipment: PlayerState['equipment']) => void;
  };  
  /**
 * bodyTrainingPanel：bodyTraining面板相关字段。
 */

  bodyTrainingPanel: {  
  /**
 * syncFoundation：Foundation相关字段。
 */

    syncFoundation: (foundation?: number) => void;    
    /**
 * syncDynamic：Dynamic相关字段。
 */

    syncDynamic: (state: PlayerState['bodyTraining'] | undefined, foundation?: number) => void;
  };  
  /**
 * craftWorkbenchModal：炼制Workbench弹层相关字段。
 */

  craftWorkbenchModal: {  
  /**
 * syncAttrUpdate：AttrUpdate相关字段。
 */

    syncAttrUpdate: (value: S2C_AttrUpdate) => void;    
    /**
 * syncEquipment：装备相关字段。
 */

    syncEquipment: (equipment?: PlayerState['equipment']) => void;
  };  
  /**
 * inventoryStateSource：背包状态来源相关字段。
 */

  inventoryStateSource: {  
  /**
 * syncInventory：背包相关字段。
 */

    syncInventory: (inventory: Inventory, player: PlayerState | null) => void;    
    /**
 * syncPlayerContext：玩家上下文状态或数据块。
 */

    syncPlayerContext: (player?: PlayerState) => void;
  };  
  /**
 * techniqueStateSource：功法状态来源相关字段。
 */

  techniqueStateSource: {  
  /**
 * update：update相关字段。
 */

    update: (techniques: TechniqueState[], cultivatingTechId?: string, player?: PlayerState) => void;    
    /**
 * syncDynamic：Dynamic相关字段。
 */

    syncDynamic: (techniques: TechniqueState[], cultivatingTechId?: string, player?: PlayerState) => void;
  };  
  /**
 * actionStateSource：action状态来源相关字段。
 */

  actionStateSource: {  
  /**
 * update：update相关字段。
 */

    update: (actions: ActionDef[], autoBattle?: boolean, autoRetaliate?: boolean, player?: PlayerState) => void;    
    /**
 * syncDynamic：Dynamic相关字段。
 */

    syncDynamic: (actions: ActionDef[], autoBattle?: boolean, autoRetaliate?: boolean, player?: PlayerState) => void;
  };  
  /**
 * syncInventoryBridgeState：背包桥接状态状态或数据块。
 */

  syncInventoryBridgeState: (inventory: Inventory | null) => void;  
  /**
 * syncEquipmentBridgeState：装备桥接状态状态或数据块。
 */

  syncEquipmentBridgeState: (equipment: PlayerState['equipment'] | null) => void;  
  /**
 * syncTechniquesBridgeState：功法桥接状态状态或数据块。
 */

  syncTechniquesBridgeState: (techniques: PlayerState['techniques'], cultivatingTechId?: string) => void;  
  /**
 * syncActionsBridgeState：Action桥接状态状态或数据块。
 */

  syncActionsBridgeState: (actions: PlayerState['actions'], autoBattle: boolean, autoRetaliate: boolean) => void;  
  /**
 * syncAttrBridgeState：Attr桥接状态状态或数据块。
 */

  syncAttrBridgeState: (value: S2C_AttrUpdate | null) => void;  
  /**
 * syncPlayerBridgeState：玩家桥接状态状态或数据块。
 */

  syncPlayerBridgeState: (player: PlayerState | null) => void;  
  /**
 * refreshHeavenGateModal：refreshHeavenGate弹层相关字段。
 */

  refreshHeavenGateModal: (player: PlayerState | null) => void;  
  /**
 * refreshUiChrome：refreshUiChrome相关字段。
 */

  refreshUiChrome: () => void;  
  /**
 * syncEstimatedServerTick：EstimatedServertick相关字段。
 */

  syncEstimatedServerTick: (tick: number | null) => void;  
  /**
 * navigation：导航相关字段。
 */

  navigation: {  
  /**
 * hasActivePath：启用开关或状态标识。
 */

    hasActivePath: () => boolean;    
    /**
 * clearCurrentPath：clearCurrent路径相关字段。
 */

    clearCurrentPath: () => void;
  };  
  /**
 * targeting：targeting相关字段。
 */

  targeting: {  
  /**
 * syncSenseQiOverlay：SenseQiOverlay相关字段。
 */

    syncSenseQiOverlay: () => void;
  };
};

/**
 * applyNullablePatch：处理NullablePatch并更新相关状态。
 * @param value T | null | undefined 参数说明。
 * @param fallback T | undefined 参数说明。
 * @returns 返回NullablePatch。
 */


function applyNullablePatch<T>(value: T | null | undefined, fallback: T | undefined): T | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (value === null) {
    return undefined;
  }
  if (value !== undefined) {
    return value;
  }
  return fallback;
}
/**
 * cloneJson：构建Json。
 * @param value T 参数说明。
 * @returns 返回Json。
 */


function cloneJson<T>(value: T): T {
  return clonePlainValue(value);
}

function mergeAttrValuePatch(base: Partial<Attributes> | undefined, patch: Partial<Attributes> | undefined, fallback: Attributes): Attributes {
  return {
    constitution: patch?.constitution ?? base?.constitution ?? fallback.constitution,
    spirit: patch?.spirit ?? base?.spirit ?? fallback.spirit,
    perception: patch?.perception ?? base?.perception ?? fallback.perception,
    talent: patch?.talent ?? base?.talent ?? fallback.talent,
    strength: patch?.strength ?? base?.strength ?? fallback.strength,
    meridians: patch?.meridians ?? base?.meridians ?? fallback.meridians,
  };
}

function mergeElementGroupPatch<T extends Record<'metal' | 'wood' | 'water' | 'fire' | 'earth', number>>(
  base: T | undefined,
  patch: Partial<T> | undefined,
): T | undefined {
  if (!base && !patch) {
    return undefined;
  }
  return {
    metal: patch?.metal ?? base?.metal ?? 0,
    wood: patch?.wood ?? base?.wood ?? 0,
    water: patch?.water ?? base?.water ?? 0,
    fire: patch?.fire ?? base?.fire ?? 0,
    earth: patch?.earth ?? base?.earth ?? 0,
  } as T;
}

function mergeNumericStatsPatch(base: PartialNumericStats | undefined, patch: PartialNumericStats | undefined): NumericStats | undefined {
  if (!base && !patch) {
    return undefined;
  }
  const previous: NumericStats = {
    maxHp: base?.maxHp ?? 0,
    maxQi: base?.maxQi ?? 0,
    physAtk: base?.physAtk ?? 0,
    spellAtk: base?.spellAtk ?? 0,
    physDef: base?.physDef ?? 0,
    spellDef: base?.spellDef ?? 0,
    hit: base?.hit ?? 0,
    dodge: base?.dodge ?? 0,
    crit: base?.crit ?? 0,
    antiCrit: base?.antiCrit ?? 0,
    critDamage: base?.critDamage ?? 0,
    breakPower: base?.breakPower ?? 0,
    resolvePower: base?.resolvePower ?? 0,
    maxQiOutputPerTick: base?.maxQiOutputPerTick ?? 0,
    qiRegenRate: base?.qiRegenRate ?? 0,
    hpRegenRate: base?.hpRegenRate ?? 0,
    cooldownSpeed: base?.cooldownSpeed ?? 0,
    auraCostReduce: base?.auraCostReduce ?? 0,
    auraPowerRate: base?.auraPowerRate ?? 0,
    playerExpRate: base?.playerExpRate ?? 0,
    techniqueExpRate: base?.techniqueExpRate ?? 0,
    realmExpPerTick: base?.realmExpPerTick ?? 0,
    techniqueExpPerTick: base?.techniqueExpPerTick ?? 0,
    lootRate: base?.lootRate ?? 0,
    rareLootRate: base?.rareLootRate ?? 0,
    viewRange: base?.viewRange ?? 0,
    moveSpeed: base?.moveSpeed ?? 0,
    extraAggroRate: base?.extraAggroRate ?? 0,
    extraRange: base?.extraRange ?? 0,
    extraArea: base?.extraArea ?? 0,
    actionsPerTurn: base?.actionsPerTurn ?? 1,
    elementDamageBonus: mergeElementGroupPatch(undefined, base?.elementDamageBonus) ?? { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 },
    elementDamageReduce: mergeElementGroupPatch(undefined, base?.elementDamageReduce) ?? { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 },
  };
  return {
    maxHp: patch?.maxHp ?? previous.maxHp,
    maxQi: patch?.maxQi ?? previous.maxQi,
    physAtk: patch?.physAtk ?? previous.physAtk,
    spellAtk: patch?.spellAtk ?? previous.spellAtk,
    physDef: patch?.physDef ?? previous.physDef,
    spellDef: patch?.spellDef ?? previous.spellDef,
    hit: patch?.hit ?? previous.hit,
    dodge: patch?.dodge ?? previous.dodge,
    crit: patch?.crit ?? previous.crit,
    antiCrit: patch?.antiCrit ?? previous.antiCrit,
    critDamage: patch?.critDamage ?? previous.critDamage,
    breakPower: patch?.breakPower ?? previous.breakPower,
    resolvePower: patch?.resolvePower ?? previous.resolvePower,
    maxQiOutputPerTick: patch?.maxQiOutputPerTick ?? previous.maxQiOutputPerTick,
    qiRegenRate: patch?.qiRegenRate ?? previous.qiRegenRate,
    hpRegenRate: patch?.hpRegenRate ?? previous.hpRegenRate,
    cooldownSpeed: patch?.cooldownSpeed ?? previous.cooldownSpeed,
    auraCostReduce: patch?.auraCostReduce ?? previous.auraCostReduce,
    auraPowerRate: patch?.auraPowerRate ?? previous.auraPowerRate,
    playerExpRate: patch?.playerExpRate ?? previous.playerExpRate,
    techniqueExpRate: patch?.techniqueExpRate ?? previous.techniqueExpRate,
    realmExpPerTick: patch?.realmExpPerTick ?? previous.realmExpPerTick,
    techniqueExpPerTick: patch?.techniqueExpPerTick ?? previous.techniqueExpPerTick,
    lootRate: patch?.lootRate ?? previous.lootRate,
    rareLootRate: patch?.rareLootRate ?? previous.rareLootRate,
    viewRange: patch?.viewRange ?? previous.viewRange,
    moveSpeed: patch?.moveSpeed ?? previous.moveSpeed,
    extraAggroRate: patch?.extraAggroRate ?? previous.extraAggroRate,
    extraRange: patch?.extraRange ?? previous.extraRange,
    extraArea: patch?.extraArea ?? previous.extraArea,
    actionsPerTurn: patch?.actionsPerTurn ?? previous.actionsPerTurn,
    elementDamageBonus: mergeElementGroupPatch(previous.elementDamageBonus, patch?.elementDamageBonus) ?? previous.elementDamageBonus,
    elementDamageReduce: mergeElementGroupPatch(previous.elementDamageReduce, patch?.elementDamageReduce) ?? previous.elementDamageReduce,
  } as NumericStats;
}

function mergeRatioDivisorsPatch(
  base: PartialNumericRatioDivisors | undefined,
  patch: PartialNumericRatioDivisors | undefined,
): NumericRatioDivisors | undefined {
  if (!base && !patch) {
    return undefined;
  }
  const previous: NumericRatioDivisors = {
    dodge: base?.dodge ?? 0,
    crit: base?.crit ?? 0,
    breakPower: base?.breakPower ?? 0,
    resolvePower: base?.resolvePower ?? 0,
    cooldownSpeed: base?.cooldownSpeed ?? 0,
    moveSpeed: base?.moveSpeed ?? 0,
    elementDamageReduce: mergeElementGroupPatch(undefined, base?.elementDamageReduce) ?? { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 },
  };
  return {
    dodge: patch?.dodge ?? previous.dodge,
    crit: patch?.crit ?? previous.crit,
    breakPower: patch?.breakPower ?? previous.breakPower,
    resolvePower: patch?.resolvePower ?? previous.resolvePower,
    cooldownSpeed: patch?.cooldownSpeed ?? previous.cooldownSpeed,
    moveSpeed: patch?.moveSpeed ?? previous.moveSpeed,
    elementDamageReduce: mergeElementGroupPatch(previous.elementDamageReduce, patch?.elementDamageReduce) ?? previous.elementDamageReduce,
  } as NumericRatioDivisors;
}
/**
 * MainPanelDeltaStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainPanelDeltaStateSource = ReturnType<typeof createMainPanelDeltaStateSource>;
/**
 * createMainPanelDeltaStateSource：构建并返回目标对象。
 * @param options MainPanelDeltaStateSourceOptions 选项参数。
 * @returns 无返回值，直接更新Main面板Delta状态来源相关状态。
 */


export function createMainPanelDeltaStateSource(options: MainPanelDeltaStateSourceOptions) {
  let latestAttrUpdate: S2C_AttrUpdate | null = null;
  let latestTechniqueMap = new Map<string, TechniqueState>();
  let latestActionMap = new Map<string, ActionDef>();  
  /**
 * buildAttrStateFromPlayer：构建并返回目标对象。
 * @param player PlayerState 玩家对象。
 * @returns 返回Attr状态From玩家。
 */


  function buildAttrStateFromPlayer(player: PlayerState): S2C_AttrUpdate {
    return {
      baseAttrs: cloneJson(player.baseAttrs),
      bonuses: cloneJson(player.bonuses),
      finalAttrs: cloneJson(player.finalAttrs ?? player.baseAttrs),
      numericStats: player.numericStats ? cloneJson(player.numericStats) : undefined,
      ratioDivisors: player.ratioDivisors ? cloneJson(player.ratioDivisors) : undefined,
      maxHp: player.maxHp,
      qi: player.qi,
      specialStats: {
        foundation: Math.max(0, Math.floor(player.foundation ?? 0)),
        rootFoundation: Math.max(0, Math.floor(player.rootFoundation ?? 0)),
        bodyTrainingLevel: Math.max(0, Math.floor(player.bodyTraining?.level ?? 0)),
        combatExp: Math.max(0, Math.floor(player.combatExp ?? 0)),
        comprehension: Math.max(0, Math.floor(player.comprehension ?? 0)),
        luck: Math.max(0, Math.floor(player.luck ?? 0)),
      },
      boneAgeBaseYears: player.boneAgeBaseYears,
      lifeElapsedTicks: player.lifeElapsedTicks,
      lifespanYears: player.lifespanYears ?? null,
      realmProgress: player.realm?.progress,
      realmProgressToNext: player.realm?.progressToNext,
      realmBreakthroughReady: player.realm?.breakthroughReady ?? player.breakthroughReady,
      alchemySkill: player.alchemySkill ? cloneJson(player.alchemySkill) : undefined,
      gatherSkill: player.gatherSkill ? cloneJson(player.gatherSkill) : undefined,
      enhancementSkill: player.enhancementSkill ? cloneJson(player.enhancementSkill) : undefined,
    };
  }
  /**
 * mergeAttrUpdatePatch：处理AttrUpdatePatch并更新相关状态。
 * @param previous S2C_AttrUpdate | null 参数说明。
 * @param patch S2C_AttrUpdate 参数说明。
 * @returns 返回AttrUpdatePatch。
 */


  function mergeAttrUpdatePatch(previous: S2C_AttrUpdate | null, patch: S2C_AttrUpdate): S2C_AttrUpdate {
    const player = options.getPlayer();
    const fallbackBaseAttrs = player?.baseAttrs ?? {
      constitution: 0,
      spirit: 0,
      perception: 0,
      talent: 0,
      strength: 0,
      meridians: 0,
    };
    const fallbackFinalAttrs = (player?.finalAttrs ?? player?.baseAttrs ?? fallbackBaseAttrs) as Attributes;
    return {
      baseAttrs: cloneJson(mergeAttrValuePatch(previous?.baseAttrs as Attributes | undefined, patch.baseAttrs, fallbackBaseAttrs)),
      bonuses: patch.bonuses ? cloneJson(patch.bonuses) : cloneJson(previous?.bonuses ?? player?.bonuses ?? []),
      finalAttrs: cloneJson(mergeAttrValuePatch(previous?.finalAttrs as Attributes | undefined, patch.finalAttrs, fallbackFinalAttrs)),
      numericStats: mergeNumericStatsPatch((previous?.numericStats as NumericStats | undefined) ?? player?.numericStats, patch.numericStats),
      ratioDivisors: mergeRatioDivisorsPatch((previous?.ratioDivisors as NumericRatioDivisors | undefined) ?? player?.ratioDivisors, patch.ratioDivisors),
      numericStatBreakdowns: patch.numericStatBreakdowns
        ? cloneJson(patch.numericStatBreakdowns)
        : previous?.numericStatBreakdowns
          ? cloneJson(previous.numericStatBreakdowns)
          : undefined,
      maxHp: patch.maxHp ?? previous?.maxHp ?? player?.maxHp ?? 0,
      qi: patch.qi,
      specialStats: {
        foundation: patch.specialStats?.foundation
          ?? previous?.specialStats?.foundation
          ?? Math.max(0, Math.floor(player?.foundation ?? 0)),
        rootFoundation: patch.specialStats?.rootFoundation
          ?? previous?.specialStats?.rootFoundation
          ?? Math.max(0, Math.floor(player?.rootFoundation ?? 0)),
        bodyTrainingLevel: patch.specialStats?.bodyTrainingLevel
          ?? previous?.specialStats?.bodyTrainingLevel
          ?? Math.max(0, Math.floor(player?.bodyTraining?.level ?? 0)),
        combatExp: patch.specialStats?.combatExp
          ?? previous?.specialStats?.combatExp
          ?? Math.max(0, Math.floor(player?.combatExp ?? 0)),
        comprehension: patch.specialStats?.comprehension
          ?? previous?.specialStats?.comprehension
          ?? Math.max(0, Math.floor(player?.comprehension ?? 0)),
        luck: patch.specialStats?.luck
          ?? previous?.specialStats?.luck
          ?? Math.max(0, Math.floor(player?.luck ?? 0)),
      },
      boneAgeBaseYears: patch.boneAgeBaseYears ?? previous?.boneAgeBaseYears ?? player?.boneAgeBaseYears ?? undefined,
      lifeElapsedTicks: patch.lifeElapsedTicks ?? previous?.lifeElapsedTicks ?? player?.lifeElapsedTicks ?? undefined,
      lifespanYears: patch.lifespanYears === null
        ? null
        : patch.lifespanYears ?? previous?.lifespanYears ?? player?.lifespanYears ?? null,
      realmProgress: patch.realmProgress ?? previous?.realmProgress ?? player?.realm?.progress ?? undefined,
      realmProgressToNext: patch.realmProgressToNext ?? previous?.realmProgressToNext ?? player?.realm?.progressToNext ?? undefined,
      realmBreakthroughReady: patch.realmBreakthroughReady
        ?? previous?.realmBreakthroughReady
        ?? player?.realm?.breakthroughReady
        ?? player?.breakthroughReady
        ?? undefined,
      alchemySkill: patch.alchemySkill
        ? cloneJson(patch.alchemySkill)
        : (previous?.alchemySkill ? cloneJson(previous.alchemySkill) : (player?.alchemySkill ? cloneJson(player.alchemySkill) : undefined)),
      gatherSkill: patch.gatherSkill
        ? cloneJson(patch.gatherSkill)
        : (previous?.gatherSkill ? cloneJson(previous.gatherSkill) : (player?.gatherSkill ? cloneJson(player.gatherSkill) : undefined)),
      enhancementSkill: patch.enhancementSkill
        ? cloneJson(patch.enhancementSkill)
        : (previous?.enhancementSkill ? cloneJson(previous.enhancementSkill) : (player?.enhancementSkill ? cloneJson(player.enhancementSkill) : undefined)),
    };
  }  

  /** attrPatchInvalidatesDetail：判断属性详情构成是否需要重新拉取。 */
  function attrPatchInvalidatesDetail(patch: S2C_AttrUpdate): boolean {
    return Boolean(
      patch.baseAttrs
      || patch.bonuses
      || patch.finalAttrs
      || patch.numericStats
      || patch.ratioDivisors
      || patch.numericStatBreakdowns,
    );
  }
  /**
 * mergeTechniquePatch：读取功法Patch并返回结果。
 * @param patch import('@mud/shared').TechniqueUpdateEntry 参数说明。
 * @param previous TechniqueState 参数说明。
 * @returns 返回功法Patch。
 */


  function mergeTechniquePatch(patch: import('@mud/shared').TechniqueUpdateEntry, previous?: TechniqueState): TechniqueState {
    const previousSameTechnique = previous?.techId === patch.techId ? previous : undefined;
    const template = getLocalTechniqueTemplate(patch.techId);
    const mergedSkills = applyNullablePatch(patch.skills, previousSameTechnique?.skills);
    const mergedLayers = applyNullablePatch(patch.layers, previousSameTechnique?.layers);
    const mergedAttrCurves = applyNullablePatch(patch.attrCurves, previousSameTechnique?.attrCurves);
    return resolvePreviewTechnique({
      techId: patch.techId,
      level: patch.level ?? previousSameTechnique?.level ?? 1,
      exp: patch.exp ?? previousSameTechnique?.exp ?? 0,
      expToNext: patch.expToNext ?? previousSameTechnique?.expToNext ?? 0,
      realmLv: patch.realmLv ?? previousSameTechnique?.realmLv ?? template?.realmLv ?? 1,
      realm: patch.realm ?? previousSameTechnique?.realm ?? TechniqueRealm.Entry,
      name: applyNullablePatch(patch.name, previousSameTechnique?.name) ?? template?.name ?? patch.techId,
      skills: mergedSkills
        ? cloneJson(mergedSkills)
        : cloneJson(template?.skills ?? []),
      grade: applyNullablePatch(patch.grade, previousSameTechnique?.grade) ?? template?.grade,
      category: applyNullablePatch(patch.category, previousSameTechnique?.category) ?? template?.category,
      layers: mergedLayers
        ? cloneJson(mergedLayers)
        : template?.layers
          ? cloneJson(template.layers)
          : undefined,
      attrCurves: mergedAttrCurves
        ? cloneJson(mergedAttrCurves)
        : undefined,
    });
  }  
  /**
 * hydrateSyncedItemStack：处理hydrateSynced道具Stack并更新相关状态。
 * @param item SyncedItemStack 道具。
 * @param previous Inventory['items'][number] 参数说明。
 * @returns 返回hydrateSynced道具Stack数值。
 */


  function hydrateSyncedItemStack(item: SyncedItemStack, previous?: Inventory['items'][number]): Inventory['items'][number] {
    const nextEnhanceLevel = item.enhanceLevel ?? 0;
    const previousSameItem = previous?.itemId === item.itemId && (previous.enhanceLevel ?? 0) === nextEnhanceLevel
      ? previous
      : undefined;
    const template = getLocalItemTemplate(item.itemId);
    return {
      itemId: item.itemId,
      count: item.count,
      name: item.name ?? previousSameItem?.name ?? template?.name ?? item.itemId,
      type: item.type ?? previousSameItem?.type ?? template?.type ?? 'material',
      desc: item.desc ?? previousSameItem?.desc ?? template?.desc ?? '',
      groundLabel: item.groundLabel ?? previousSameItem?.groundLabel ?? template?.groundLabel,
      grade: item.grade ?? previousSameItem?.grade ?? template?.grade,
      level: item.level ?? previousSameItem?.level ?? template?.level,
      equipSlot: item.equipSlot ?? previousSameItem?.equipSlot ?? template?.equipSlot,
      equipAttrs: item.equipAttrs
        ? cloneJson(item.equipAttrs)
        : previousSameItem?.equipAttrs
          ? cloneJson(previousSameItem.equipAttrs)
          : template?.equipAttrs
            ? cloneJson(template.equipAttrs)
            : undefined,
      equipStats: item.equipStats
        ? cloneJson(item.equipStats)
        : previousSameItem?.equipStats
          ? cloneJson(previousSameItem.equipStats)
          : template?.equipStats
            ? cloneJson(template.equipStats)
            : undefined,
      equipValueStats: item.equipValueStats
        ? cloneJson(item.equipValueStats)
        : previousSameItem?.equipValueStats
          ? cloneJson(previousSameItem.equipValueStats)
          : template?.equipValueStats
            ? cloneJson(template.equipValueStats)
            : undefined,
      effects: item.effects
        ? cloneJson(item.effects)
        : previousSameItem?.effects
          ? cloneJson(previousSameItem.effects)
          : template?.effects
            ? cloneJson(template.effects)
            : undefined,
      tags: item.tags
        ? [...item.tags]
        : previousSameItem?.tags
          ? [...previousSameItem.tags]
          : template?.tags
            ? [...template.tags]
            : undefined,
      cooldown: item.cooldown ?? previousSameItem?.cooldown ?? template?.cooldown,
      enhanceLevel: item.enhanceLevel ?? previousSameItem?.enhanceLevel ?? template?.enhanceLevel,
      alchemySuccessRate: item.alchemySuccessRate ?? previousSameItem?.alchemySuccessRate ?? template?.alchemySuccessRate,
      alchemySpeedRate: item.alchemySpeedRate ?? previousSameItem?.alchemySpeedRate ?? template?.alchemySpeedRate,
      enhancementSuccessRate: item.enhancementSuccessRate ?? previousSameItem?.enhancementSuccessRate ?? template?.enhancementSuccessRate,
      enhancementSpeedRate: item.enhancementSpeedRate ?? previousSameItem?.enhancementSpeedRate ?? template?.enhancementSpeedRate,
      mapUnlockId: item.mapUnlockId ?? previousSameItem?.mapUnlockId,
      mapUnlockIds: item.mapUnlockIds ?? previousSameItem?.mapUnlockIds ?? template?.mapUnlockIds,
      respawnBindMapId: item.respawnBindMapId ?? previousSameItem?.respawnBindMapId ?? template?.respawnBindMapId,
      tileAuraGainAmount: item.tileAuraGainAmount ?? previousSameItem?.tileAuraGainAmount,
      tileResourceGains: item.tileResourceGains
        ? cloneJson(item.tileResourceGains)
        : previousSameItem?.tileResourceGains
          ? cloneJson(previousSameItem.tileResourceGains)
          : template?.tileResourceGains
            ? cloneJson(template.tileResourceGains)
            : undefined,
      allowBatchUse: item.allowBatchUse ?? previousSameItem?.allowBatchUse,
    };
  }  
  /**
 * mergeInventoryUpdate：处理背包Update并更新相关状态。
 * @param previous Inventory | undefined 参数说明。
 * @param patch S2C_InventoryUpdate 参数说明。
 * @returns 返回背包Update。
 */


  function mergeInventoryUpdate(previous: Inventory | undefined, patch: S2C_InventoryUpdate): Inventory {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (patch.inventory) {
      return {
        capacity: patch.inventory.capacity,
        items: patch.inventory.items.map((item) => hydrateSyncedItemStack(item)),
        cooldowns: patch.inventory.cooldowns
          ? cloneJson(patch.inventory.cooldowns)
          : undefined,
        serverTick: patch.inventory.serverTick,
      };
    }

    const next: Inventory = previous
      ? cloneJson(previous)
      : { items: [], capacity: 0 };
    if (patch.capacity !== undefined) {
      next.capacity = patch.capacity;
    }
    if (patch.size !== undefined) {
      next.items.length = Math.max(0, patch.size);
    }
    if (patch.cooldowns !== undefined) {
      next.cooldowns = cloneJson(patch.cooldowns);
    }
    if (patch.serverTick !== undefined) {
      next.serverTick = patch.serverTick;
    }
    for (const slotPatch of patch.slots ?? []) {
      if (slotPatch.item) {
        next.items[slotPatch.slotIndex] = hydrateSyncedItemStack(slotPatch.item, next.items[slotPatch.slotIndex]);
        continue;
      }
      next.items.splice(slotPatch.slotIndex, 1);
    }
    return next;
  }  
  /**
 * mergeEquipmentUpdate：处理装备Update并更新相关状态。
 * @param previous PlayerState['equipment'] | undefined 参数说明。
 * @param patch S2C_EquipmentUpdate 参数说明。
 * @returns 返回装备Update。
 */


  function mergeEquipmentUpdate(previous: PlayerState['equipment'] | undefined, patch: S2C_EquipmentUpdate): PlayerState['equipment'] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const next = previous
      ? cloneJson(previous)
      : {
          weapon: null,
          head: null,
          body: null,
          legs: null,
          accessory: null,
        };

    for (const slot of EQUIP_SLOTS) {
      if (!(slot in next)) {
        next[slot] = null;
      }
    }

    for (const slotPatch of patch.slots) {
      next[slotPatch.slot] = slotPatch.item
        ? hydrateSyncedItemStack(slotPatch.item, next[slotPatch.slot] ?? undefined)
        : null;
    }

    return next;
  }  
  /**
 * mergeTechniqueStates：读取功法状态并返回结果。
 * @param patches import('@mud/shared').TechniqueUpdateEntry[] 参数说明。
 * @param removeTechniqueIds string[] removeTechnique ID 集合。
 * @returns 返回功法状态列表。
 */


  function mergeTechniqueStates(patches: import('@mud/shared').TechniqueUpdateEntry[], removeTechniqueIds: string[] = []): TechniqueState[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const removedIdSet = new Set(removeTechniqueIds);
    const merged = [...latestTechniqueMap.values()]
      .filter((technique) => !removedIdSet.has(technique.techId))
      .map((technique) => cloneJson(technique));
    const nextMap = new Map(merged.map((technique) => [technique.techId, technique] as const));

    for (const patch of patches) {
      const previous = nextMap.get(patch.techId);
      const next = mergeTechniquePatch(patch, previous);
      if (previous) {
        const index = merged.findIndex((technique) => technique.techId === patch.techId);
        if (index >= 0) {
          merged[index] = next;
        }
      } else {
        merged.push(next);
      }
      nextMap.set(next.techId, next);
    }

    latestTechniqueMap = nextMap;
    return merged;
  }  
  /**
 * mergeActionPatch：处理ActionPatch并更新相关状态。
 * @param patch ActionUpdateEntry 参数说明。
 * @param previous ActionDef 参数说明。
 * @returns 返回ActionPatch。
 */


  function mergeActionPatch(patch: ActionUpdateEntry, previous?: ActionDef): ActionDef {
    const previousSameAction = previous?.id === patch.id ? previous : undefined;
    const skillTemplate = getLocalSkillTemplate(patch.id);
    const staticAction = getStaticClientActionDef(patch.id);
    const nextType = applyNullablePatch(patch.type, previousSameAction?.type ?? staticAction?.type) ?? (skillTemplate ? 'skill' : 'interact');
    const isSkillAction = nextType === 'skill';
    return {
      id: patch.id,
      cooldownLeft: patch.cooldownLeft ?? previousSameAction?.cooldownLeft ?? staticAction?.cooldownLeft ?? 0,
      autoBattleEnabled: applyNullablePatch(patch.autoBattleEnabled, previousSameAction?.autoBattleEnabled),
      autoBattleOrder: applyNullablePatch(patch.autoBattleOrder, previousSameAction?.autoBattleOrder),
      skillEnabled: applyNullablePatch(patch.skillEnabled, previousSameAction?.skillEnabled),
      name: applyNullablePatch(patch.name, previousSameAction?.name ?? staticAction?.name) ?? skillTemplate?.name ?? patch.id,
      type: nextType,
      desc: applyNullablePatch(patch.desc, previousSameAction?.desc ?? staticAction?.desc) ?? skillTemplate?.desc ?? '',
      range: applyNullablePatch(patch.range, previousSameAction?.range ?? staticAction?.range) ?? skillTemplate?.range,
      requiresTarget: applyNullablePatch(patch.requiresTarget, previousSameAction?.requiresTarget ?? staticAction?.requiresTarget)
        ?? skillTemplate?.requiresTarget
        ?? (isSkillAction ? true : undefined),
      targetMode: applyNullablePatch(patch.targetMode, previousSameAction?.targetMode ?? staticAction?.targetMode)
        ?? skillTemplate?.targetMode
        ?? (isSkillAction ? 'any' : undefined),
    };
  }  
  /**
 * mergeActionStates：处理Action状态并更新相关状态。
 * @param patches ActionUpdateEntry[] 参数说明。
 * @param removeActionIds string[] removeAction ID 集合。
 * @param actionOrder string[] 参数说明。
 * @returns 返回Action状态列表。
 */


  function mergeActionStates(
    patches: ActionUpdateEntry[],
    removeActionIds: string[] = [],
    actionOrder?: string[],
  ): ActionDef[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const removedIdSet = new Set(removeActionIds);
    const merged = [...latestActionMap.values()]
      .filter((action) => !removedIdSet.has(action.id))
      .map((action) => cloneJson(action));
    const nextMap = new Map(merged.map((action) => [action.id, action] as const));

    for (const patch of patches) {
      const previous = nextMap.get(patch.id);
      const next = mergeActionPatch(patch, previous);
      if (previous) {
        const index = merged.findIndex((action) => action.id === patch.id);
        if (index >= 0) {
          merged[index] = next;
        }
      } else {
        merged.push(next);
      }
      nextMap.set(next.id, next);
    }

    if (actionOrder && actionOrder.length > 0) {
      const orderIndex = new Map(actionOrder.map((actionId, index) => [actionId, index] as const));
      merged.sort((left, right) => (
        (orderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER)
        - (orderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER)
      ));
    }

    latestActionMap = nextMap;
    return merged;
  }  
  /**
 * haveActionRenderStructureChanges：执行haveActionRenderStructureChange相关逻辑。
 * @param previousActions ActionDef[] 参数说明。
 * @param nextActions ActionDef[] 参数说明。
 * @returns 返回是否满足haveActionRenderStructureChange条件。
 */


  function haveActionRenderStructureChanges(previousActions: ActionDef[], nextActions: ActionDef[]): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (previousActions.length !== nextActions.length) {
      return true;
    }
    for (let index = 0; index < previousActions.length; index += 1) {
      const previous = previousActions[index]!;
      const next = nextActions[index]!;
      if (
        previous.id !== next.id
        || previous.name !== next.name
        || previous.desc !== next.desc
        || previous.type !== next.type
        || previous.range !== next.range
        || previous.requiresTarget !== next.requiresTarget
        || previous.targetMode !== next.targetMode
        || previous.autoBattleEnabled !== next.autoBattleEnabled
        || previous.skillEnabled !== next.skillEnabled
      ) {
        return true;
      }
    }
    return false;
  }  
  /**
 * haveTechniqueStructureChanges：执行have功法StructureChange相关逻辑。
 * @param previousTechniques TechniqueState[] 参数说明。
 * @param previousCultivatingTechId string | undefined previousCultivatingTech ID。
 * @param nextTechniques TechniqueState[] 参数说明。
 * @param nextCultivatingTechId string | undefined nextCultivatingTech ID。
 * @returns 返回是否满足have功法StructureChange条件。
 */


  function haveTechniqueStructureChanges(
    previousTechniques: TechniqueState[],
    previousCultivatingTechId: string | undefined,
    nextTechniques: TechniqueState[],
    nextCultivatingTechId: string | undefined,
  ): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if ((previousCultivatingTechId ?? null) !== (nextCultivatingTechId ?? null)) {
      return true;
    }
    if (previousTechniques.length !== nextTechniques.length) {
      return true;
    }
    for (let index = 0; index < previousTechniques.length; index += 1) {
      const previous = previousTechniques[index]!;
      const next = nextTechniques[index]!;
      if (
        previous.techId !== next.techId
        || previous.name !== next.name
        || previous.level !== next.level
        || previous.realmLv !== next.realmLv
        || previous.realm !== next.realm
        || previous.grade !== next.grade
      ) {
        return true;
      }
      if (previous.skills.length !== next.skills.length) {
        return true;
      }
      for (let skillIndex = 0; skillIndex < previous.skills.length; skillIndex += 1) {
        if (previous.skills[skillIndex]!.id !== next.skills[skillIndex]!.id) {
          return true;
        }
      }
      if (!isPlainEqual(previous.layers ?? null, next.layers ?? null)) {
        return true;
      }
      if (!isPlainEqual(previous.attrCurves ?? null, next.attrCurves ?? null)) {
        return true;
      }
    }
    return false;
  }

  return {  
  /**
 * getLatestAttrUpdate：读取最新AttrUpdate。
 * @returns 返回LatestAttrUpdate。
 */

    getLatestAttrUpdate(): S2C_AttrUpdate | null {
      return latestAttrUpdate;
    },    
    /**
 * setLatestAttrUpdate：写入最新AttrUpdate。
 * @param value S2C_AttrUpdate | null 参数说明。
 * @returns 无返回值，直接更新LatestAttrUpdate相关状态。
 */


    setLatestAttrUpdate(value: S2C_AttrUpdate | null): void {
      latestAttrUpdate = value;
    },

    buildAttrStateFromPlayer,

    mergeAttrUpdatePatch,    
    /**
 * seedFromPlayer：执行seedFrom玩家相关逻辑。
 * @param player PlayerState 玩家对象。
 * @returns 无返回值，直接更新seedFrom玩家相关状态。
 */


    seedFromPlayer(player: PlayerState): void {
      latestTechniqueMap = new Map((player.techniques ?? []).map((technique) => [technique.techId, cloneJson(technique)]));
      latestActionMap = new Map((player.actions ?? []).map((action) => [action.id, cloneJson(action)]));
    },    
    /**
 * clearCachedState：执行clearCached状态相关逻辑。
 * @returns 无返回值，直接更新clearCached状态相关状态。
 */


    clearCachedState(): void {
      latestAttrUpdate = null;
      latestTechniqueMap.clear();
      latestActionMap.clear();
    },    
    /**
 * hydrateSyncedItemStack：处理hydrateSynced道具Stack并更新相关状态。
 * @param item SyncedItemStack 道具。
 * @param previous Inventory['items'][number] 参数说明。
 * @returns 返回hydrateSynced道具Stack数值。
 */


    hydrateSyncedItemStack(item: SyncedItemStack, previous?: Inventory['items'][number]): Inventory['items'][number] {
      return hydrateSyncedItemStack(item, previous);
    },    
    /**
 * handleAttrUpdate：处理AttrUpdate并更新相关状态。
 * @param data S2C_AttrUpdate 原始数据。
 * @returns 无返回值，直接更新AttrUpdate相关状态。
 */


    handleAttrUpdate(data: S2C_AttrUpdate): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (attrPatchInvalidatesDetail(data)) {
        options.attrPanel.invalidateDetail?.();
      }
      latestAttrUpdate = mergeAttrUpdatePatch(latestAttrUpdate, data);
      const player = options.getPlayer();
      if (player) {
        player.baseAttrs = (latestAttrUpdate.baseAttrs as Attributes | undefined) ?? player.baseAttrs;
        player.bonuses = latestAttrUpdate.bonuses ?? player.bonuses;
        player.finalAttrs = (latestAttrUpdate.finalAttrs as Attributes | undefined) ?? player.finalAttrs;
        player.numericStats = (latestAttrUpdate.numericStats as NumericStats | undefined) ?? player.numericStats;
        player.ratioDivisors = (latestAttrUpdate.ratioDivisors as NumericRatioDivisors | undefined) ?? player.ratioDivisors;
        player.maxHp = latestAttrUpdate.maxHp ?? player.maxHp;
        if (typeof data.qi === 'number') {
          player.qi = data.qi;
        }
        player.foundation = latestAttrUpdate.specialStats?.foundation ?? player.foundation;
        player.rootFoundation = latestAttrUpdate.specialStats?.rootFoundation ?? player.rootFoundation;
        player.combatExp = latestAttrUpdate.specialStats?.combatExp ?? player.combatExp;
        player.comprehension = latestAttrUpdate.specialStats?.comprehension ?? player.comprehension;
        player.luck = latestAttrUpdate.specialStats?.luck ?? player.luck;
        player.boneAgeBaseYears = latestAttrUpdate.boneAgeBaseYears ?? player.boneAgeBaseYears;
        player.lifeElapsedTicks = latestAttrUpdate.lifeElapsedTicks ?? player.lifeElapsedTicks;
        player.lifespanYears = latestAttrUpdate.lifespanYears === undefined
          ? player.lifespanYears
          : latestAttrUpdate.lifespanYears;
        if (latestAttrUpdate.numericStats?.viewRange !== undefined) {
          player.viewRange = Math.max(1, Math.round(latestAttrUpdate.numericStats.viewRange || player.viewRange));
        }
        player.breakthroughReady = latestAttrUpdate.realmBreakthroughReady ?? player.breakthroughReady;
        player.alchemySkill = latestAttrUpdate.alchemySkill ?? player.alchemySkill;
        if (player.realm) {
          player.realm.progress = latestAttrUpdate.realmProgress ?? player.realm.progress;
          player.realm.progressToNext = latestAttrUpdate.realmProgressToNext ?? player.realm.progressToNext;
          player.realm.breakthroughReady = latestAttrUpdate.realmBreakthroughReady ?? player.realm.breakthroughReady;
          player.breakthroughReady = player.realm.breakthroughReady;
        }
        options.bodyTrainingPanel.syncFoundation(player.foundation);
      }
      options.attrPanel.update(latestAttrUpdate);
      options.craftWorkbenchModal.syncAttrUpdate(latestAttrUpdate);
      options.refreshHeavenGateModal(player);
      options.inventoryStateSource.syncPlayerContext(player ?? undefined);
      options.syncAttrBridgeState(latestAttrUpdate);
      options.refreshUiChrome();
    },    
    /**
 * handleInventoryUpdate：处理背包Update并更新相关状态。
 * @param data S2C_InventoryUpdate 原始数据。
 * @returns 无返回值，直接更新背包Update相关状态。
 */


    handleInventoryUpdate(data: S2C_InventoryUpdate): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const player = options.getPlayer();
      const mergedInventory = mergeInventoryUpdate(player?.inventory, data);
      if (mergedInventory.serverTick !== undefined) {
        options.syncEstimatedServerTick(mergedInventory.serverTick);
      }
      if (player) {
        player.inventory = mergedInventory;
      }
      options.inventoryStateSource.syncInventory(mergedInventory, player);
    },    
    /**
 * handleEquipmentUpdate：处理装备Update并更新相关状态。
 * @param data S2C_EquipmentUpdate 原始数据。
 * @returns 无返回值，直接更新装备Update相关状态。
 */


    handleEquipmentUpdate(data: S2C_EquipmentUpdate): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const player = options.getPlayer();
      const mergedEquipment = mergeEquipmentUpdate(player?.equipment, data);
      if (player) {
        player.equipment = mergedEquipment;
        options.inventoryStateSource.syncPlayerContext(player);
      }
      options.equipmentPanel.update(mergedEquipment);
      options.craftWorkbenchModal.syncEquipment(mergedEquipment);
      options.syncEquipmentBridgeState(mergedEquipment);
      options.syncPlayerBridgeState(player);
    },    
    /**
 * handleTechniqueUpdate：处理功法Update并更新相关状态。
 * @param data S2C_TechniqueUpdate | S2C_PanelTechniqueDelta 原始数据。
 * @returns 无返回值，直接更新功法Update相关状态。
 */


    handleTechniqueUpdate(data: S2C_TechniqueUpdate | S2C_PanelTechniqueDelta): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const player = options.getPlayer();
      const mergedTechniques = mergeTechniqueStates(data.techniques ?? [], data.removeTechniqueIds ?? []);
      const nextCultivatingTechId = data.cultivatingTechId === undefined
        ? player?.cultivatingTechId
        : data.cultivatingTechId ?? undefined;
      const nextBodyTraining = data.bodyTraining === undefined
        ? player?.bodyTraining
        : data.bodyTraining ?? undefined;
      const shouldRefreshTechniquePanel = !player
        || haveTechniqueStructureChanges(player.techniques, player.cultivatingTechId, mergedTechniques, nextCultivatingTechId);
      if (player) {
        player.techniques = mergedTechniques;
        player.cultivatingTechId = nextCultivatingTechId;
        player.bodyTraining = nextBodyTraining;
        options.inventoryStateSource.syncPlayerContext(player);
      }
      if (shouldRefreshTechniquePanel) {
        options.techniqueStateSource.update(mergedTechniques, nextCultivatingTechId, player ?? undefined);
        options.refreshUiChrome();
      } else {
        options.techniqueStateSource.syncDynamic(mergedTechniques, nextCultivatingTechId, player ?? undefined);
      }
      options.bodyTrainingPanel.syncDynamic(nextBodyTraining, player?.foundation);
      if (player) {
        options.actionStateSource.syncDynamic(player.actions, player.autoBattle, player.autoRetaliate, player);
      }
      options.syncTechniquesBridgeState(mergedTechniques, nextCultivatingTechId);
      options.syncPlayerBridgeState(player);
    },    
    /**
 * handleActionsUpdate：处理ActionUpdate并更新相关状态。
 * @param data S2C_ActionsUpdate | S2C_PanelActionDelta 原始数据。
 * @returns 无返回值，直接更新ActionUpdate相关状态。
 */


    handleActionsUpdate(data: S2C_ActionsUpdate | S2C_PanelActionDelta): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const player = options.getPlayer();
      const mergedActions = mergeActionStates(data.actions ?? [], data.removeActionIds ?? [], data.actionOrder);
      const previousActions = player?.actions ?? [];
      const previousAutoBattle = player?.autoBattle ?? false;
      const previousAutoUsePills = player?.autoUsePills ?? [];
      const previousCombatTargetingRules = player?.combatTargetingRules;
      const previousAutoBattleTargetingMode = player?.autoBattleTargetingMode ?? 'auto';
      const previousAutoRetaliate = player?.autoRetaliate ?? true;
      const previousAutoBattleStationary = player?.autoBattleStationary ?? false;
      const previousAllowAoePlayerHit = player?.allowAoePlayerHit ?? false;
      const previousRetaliatePlayerTargetId = player?.retaliatePlayerTargetId ?? null;
      const previousAutoIdleCultivation = player?.autoIdleCultivation ?? true;
      const previousAutoSwitchCultivation = player?.autoSwitchCultivation ?? false;
      const previousCultivationActive = player?.cultivationActive ?? false;
      const nextAutoBattle = data.autoBattle ?? player?.autoBattle ?? false;
      const nextAutoUsePills = data.autoUsePills ?? player?.autoUsePills ?? [];
      const nextAutoRetaliate = data.autoRetaliate ?? player?.autoRetaliate ?? true;
      const nextAutoBattleStationary = data.autoBattleStationary ?? player?.autoBattleStationary ?? false;
      const nextAllowAoePlayerHit = data.allowAoePlayerHit ?? player?.allowAoePlayerHit ?? false;
      const nextCombatTargetingRules = normalizeCombatTargetingRules(
        data.combatTargetingRules ?? player?.combatTargetingRules,
        buildDefaultCombatTargetingRules({
          includeAllPlayersHostile: nextAllowAoePlayerHit === true,
        }),
      );
      const nextAutoBattleTargetingMode = normalizeAutoBattleTargetingMode(data.autoBattleTargetingMode ?? player?.autoBattleTargetingMode);
      const nextRetaliatePlayerTargetId = data.retaliatePlayerTargetId ?? player?.retaliatePlayerTargetId ?? null;
      const nextAutoIdleCultivation = data.autoIdleCultivation ?? player?.autoIdleCultivation ?? true;
      const nextAutoSwitchCultivation = data.autoSwitchCultivation ?? player?.autoSwitchCultivation ?? false;
      const nextCultivationActive = data.cultivationActive ?? player?.cultivationActive ?? false;
      const nextSenseQiActive = data.senseQiActive ?? player?.senseQiActive ?? false;
      const shouldRefreshActionPanel = !player
        || previousAutoBattle !== nextAutoBattle
        || !isPlainEqual(previousAutoUsePills, nextAutoUsePills)
        || !isPlainEqual(previousCombatTargetingRules ?? null, nextCombatTargetingRules)
        || previousAutoBattleTargetingMode !== nextAutoBattleTargetingMode
        || previousAutoRetaliate !== nextAutoRetaliate
        || previousAutoBattleStationary !== nextAutoBattleStationary
        || previousAllowAoePlayerHit !== nextAllowAoePlayerHit
        || previousRetaliatePlayerTargetId !== nextRetaliatePlayerTargetId
        || previousAutoIdleCultivation !== nextAutoIdleCultivation
        || previousAutoSwitchCultivation !== nextAutoSwitchCultivation
        || previousCultivationActive !== nextCultivationActive
        || haveActionRenderStructureChanges(previousActions, mergedActions);
      if (player) {
        player.actions = mergedActions;
        player.autoBattleSkills = mergedActions
          .filter((action) => action.type === 'skill')
          .map((action) => ({
            skillId: action.id,
            enabled: action.autoBattleEnabled !== false,
            skillEnabled: action.skillEnabled !== false,
          }));
        player.autoBattle = data.autoBattle ?? player.autoBattle;
        player.autoUsePills = cloneJson(nextAutoUsePills);
        player.combatTargetingRules = cloneJson(nextCombatTargetingRules);
        player.autoBattleTargetingMode = nextAutoBattleTargetingMode;
        player.autoRetaliate = data.autoRetaliate ?? (player.autoRetaliate !== false);
        player.autoBattleStationary = nextAutoBattleStationary;
        player.allowAoePlayerHit = nextAllowAoePlayerHit;
        player.retaliatePlayerTargetId = nextRetaliatePlayerTargetId;
        player.autoIdleCultivation = nextAutoIdleCultivation;
        player.autoSwitchCultivation = nextAutoSwitchCultivation;
        player.cultivationActive = nextCultivationActive;
        player.senseQiActive = nextSenseQiActive;
        if (previousAllowAoePlayerHit !== nextAllowAoePlayerHit || previousRetaliatePlayerTargetId !== nextRetaliatePlayerTargetId) {
          options.refreshObservedDecorations();
        }
      }
      if (!previousAutoBattle && nextAutoBattle && options.navigation.hasActivePath()) {
        options.navigation.clearCurrentPath();
      }
      if (shouldRefreshActionPanel) {
        options.actionStateSource.update(mergedActions, nextAutoBattle, nextAutoRetaliate, player ?? undefined);
        options.refreshUiChrome();
      } else {
        options.actionStateSource.syncDynamic(mergedActions, nextAutoBattle, nextAutoRetaliate, player ?? undefined);
      }
      options.targeting.syncSenseQiOverlay();
      options.syncActionsBridgeState(mergedActions, nextAutoBattle, nextAutoRetaliate);
      options.syncPlayerBridgeState(player);
    },
  };
}
