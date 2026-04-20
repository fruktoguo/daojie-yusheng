import {
  type ActionDef,
  type ActionUpdateEntry,
  type Inventory,
  type NEXT_S2C_ActionsUpdate,
  type NEXT_S2C_AttrUpdate,
  type NEXT_S2C_EquipmentUpdate,
  type NEXT_S2C_InventoryUpdate,
  type NEXT_S2C_PanelActionDelta,
  type NEXT_S2C_PanelTechniqueDelta,
  type NEXT_S2C_TechniqueUpdate,
  type PlayerState,
  type SyncedItemStack,
  type TechniqueState,
  clonePlainValue,
  EQUIP_SLOTS,
  isPlainEqual,
  TechniqueRealm,
} from '@mud/shared-next';
import {
  getLocalItemTemplate,
  getLocalSkillTemplate,
  getLocalTechniqueTemplate,
  resolvePreviewTechnique,
} from './content/local-templates';
/**
 * MainPanelDeltaStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainPanelDeltaStateSourceOptions = {
/**
 * getPlayer：对象字段。
 */

  getPlayer: () => PlayerState | null;  
  /**
 * attrPanel：对象字段。
 */

  attrPanel: {  
  /**
 * update：对象字段。
 */

    update: (value: NEXT_S2C_AttrUpdate) => void;
  };  
  /**
 * equipmentPanel：对象字段。
 */

  equipmentPanel: {  
  /**
 * update：对象字段。
 */

    update: (equipment: PlayerState['equipment']) => void;
  };  
  /**
 * bodyTrainingPanel：对象字段。
 */

  bodyTrainingPanel: {  
  /**
 * syncFoundation：对象字段。
 */

    syncFoundation: (foundation?: number) => void;    
    /**
 * syncDynamic：对象字段。
 */

    syncDynamic: (state: PlayerState['bodyTraining'] | undefined, foundation?: number) => void;
  };  
  /**
 * craftWorkbenchModal：对象字段。
 */

  craftWorkbenchModal: {  
  /**
 * syncAttrUpdate：对象字段。
 */

    syncAttrUpdate: (value: NEXT_S2C_AttrUpdate) => void;    
    /**
 * syncEquipment：对象字段。
 */

    syncEquipment: () => void;
  };  
  /**
 * inventoryStateSource：对象字段。
 */

  inventoryStateSource: {  
  /**
 * syncInventory：对象字段。
 */

    syncInventory: (inventory: Inventory, player: PlayerState | null) => void;    
    /**
 * syncPlayerContext：对象字段。
 */

    syncPlayerContext: (player?: PlayerState) => void;
  };  
  /**
 * techniqueStateSource：对象字段。
 */

  techniqueStateSource: {  
  /**
 * update：对象字段。
 */

    update: (techniques: TechniqueState[], cultivatingTechId?: string, player?: PlayerState) => void;    
    /**
 * syncDynamic：对象字段。
 */

    syncDynamic: (techniques: TechniqueState[], cultivatingTechId?: string, player?: PlayerState) => void;
  };  
  /**
 * actionStateSource：对象字段。
 */

  actionStateSource: {  
  /**
 * update：对象字段。
 */

    update: (actions: ActionDef[], autoBattle?: boolean, autoRetaliate?: boolean, player?: PlayerState) => void;    
    /**
 * syncDynamic：对象字段。
 */

    syncDynamic: (actions: ActionDef[], autoBattle?: boolean, autoRetaliate?: boolean, player?: PlayerState) => void;
  };  
  /**
 * syncInventoryBridgeState：对象字段。
 */

  syncInventoryBridgeState: (inventory: Inventory | null) => void;  
  /**
 * syncEquipmentBridgeState：对象字段。
 */

  syncEquipmentBridgeState: (equipment: PlayerState['equipment'] | null) => void;  
  /**
 * syncTechniquesBridgeState：对象字段。
 */

  syncTechniquesBridgeState: (techniques: PlayerState['techniques'], cultivatingTechId?: string) => void;  
  /**
 * syncActionsBridgeState：对象字段。
 */

  syncActionsBridgeState: (actions: PlayerState['actions'], autoBattle: boolean, autoRetaliate: boolean) => void;  
  /**
 * syncAttrBridgeState：对象字段。
 */

  syncAttrBridgeState: (value: NEXT_S2C_AttrUpdate | null) => void;  
  /**
 * syncPlayerBridgeState：对象字段。
 */

  syncPlayerBridgeState: (player: PlayerState | null) => void;  
  /**
 * refreshHeavenGateModal：对象字段。
 */

  refreshHeavenGateModal: (player: PlayerState | null) => void;  
  /**
 * refreshUiChrome：对象字段。
 */

  refreshUiChrome: () => void;  
  /**
 * syncEstimatedServerTick：对象字段。
 */

  syncEstimatedServerTick: (tick: number | null) => void;  
  /**
 * navigation：对象字段。
 */

  navigation: {  
  /**
 * hasActivePath：对象字段。
 */

    hasActivePath: () => boolean;    
    /**
 * clearCurrentPath：对象字段。
 */

    clearCurrentPath: () => void;
  };  
  /**
 * targeting：对象字段。
 */

  targeting: {  
  /**
 * syncSenseQiOverlay：对象字段。
 */

    syncSenseQiOverlay: () => void;
  };
};
/**
 * applyNullablePatch：更新/写入相关状态。
 * @param value T | null | undefined 参数说明。
 * @param fallback T | undefined 参数说明。
 * @returns T | undefined。
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
 * cloneJson：执行核心业务逻辑。
 * @param value T 参数说明。
 * @returns T。
 */


function cloneJson<T>(value: T): T {
  return clonePlainValue(value);
}
/**
 * MainPanelDeltaStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainPanelDeltaStateSource = ReturnType<typeof createMainPanelDeltaStateSource>;
/**
 * createMainPanelDeltaStateSource：构建并返回目标对象。
 * @param options MainPanelDeltaStateSourceOptions 选项参数。
 * @returns 函数返回值。
 */


export function createMainPanelDeltaStateSource(options: MainPanelDeltaStateSourceOptions) {
  let latestAttrUpdate: NEXT_S2C_AttrUpdate | null = null;
  let latestTechniqueMap = new Map<string, TechniqueState>();
  let latestActionMap = new Map<string, ActionDef>();  
  /**
 * buildAttrStateFromPlayer：构建并返回目标对象。
 * @param player PlayerState 玩家对象。
 * @returns NEXT_S2C_AttrUpdate。
 */


  function buildAttrStateFromPlayer(player: PlayerState): NEXT_S2C_AttrUpdate {
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
        combatExp: Math.max(0, Math.floor(player.combatExp ?? 0)),
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
 * mergeAttrUpdatePatch：执行核心业务逻辑。
 * @param previous NEXT_S2C_AttrUpdate | null 参数说明。
 * @param patch NEXT_S2C_AttrUpdate 参数说明。
 * @returns NEXT_S2C_AttrUpdate。
 */


  function mergeAttrUpdatePatch(previous: NEXT_S2C_AttrUpdate | null, patch: NEXT_S2C_AttrUpdate): NEXT_S2C_AttrUpdate {
    const player = options.getPlayer();
    return {
      baseAttrs: patch.baseAttrs ? cloneJson(patch.baseAttrs) : cloneJson(previous?.baseAttrs ?? player?.baseAttrs ?? {
        constitution: 0,
        spirit: 0,
        perception: 0,
        talent: 0,
        comprehension: 0,
        luck: 0,
      }),
      bonuses: patch.bonuses ? cloneJson(patch.bonuses) : cloneJson(previous?.bonuses ?? player?.bonuses ?? []),
      finalAttrs: patch.finalAttrs ? cloneJson(patch.finalAttrs) : cloneJson(previous?.finalAttrs ?? player?.finalAttrs ?? previous?.baseAttrs ?? player?.baseAttrs ?? {
        constitution: 0,
        spirit: 0,
        perception: 0,
        talent: 0,
        comprehension: 0,
        luck: 0,
      }),
      numericStats: patch.numericStats ? cloneJson(patch.numericStats) : (previous?.numericStats ? cloneJson(previous.numericStats) : undefined),
      ratioDivisors: patch.ratioDivisors ? cloneJson(patch.ratioDivisors) : (previous?.ratioDivisors ? cloneJson(previous.ratioDivisors) : undefined),
      maxHp: patch.maxHp ?? previous?.maxHp ?? player?.maxHp ?? 0,
      qi: patch.qi ?? previous?.qi ?? player?.qi ?? 0,
      specialStats: patch.specialStats
        ? cloneJson(patch.specialStats)
        : cloneJson(previous?.specialStats ?? {
          foundation: Math.max(0, Math.floor(player?.foundation ?? 0)),
          combatExp: Math.max(0, Math.floor(player?.combatExp ?? 0)),
        }),
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
  /**
 * mergeTechniquePatch：执行核心业务逻辑。
 * @param patch import('@mud/shared-next').TechniqueUpdateEntry 参数说明。
 * @param previous TechniqueState 参数说明。
 * @returns TechniqueState。
 */


  function mergeTechniquePatch(patch: import('@mud/shared-next').TechniqueUpdateEntry, previous?: TechniqueState): TechniqueState {
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
 * hydrateSyncedItemStack：执行核心业务逻辑。
 * @param item SyncedItemStack 道具。
 * @param previous Inventory['items'][number] 参数说明。
 * @returns Inventory['items'][number]。
 */


  function hydrateSyncedItemStack(item: SyncedItemStack, previous?: Inventory['items'][number]): Inventory['items'][number] {
    const previousSameItem = previous?.itemId === item.itemId ? previous : undefined;
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
      alchemySuccessRate: item.alchemySuccessRate ?? previousSameItem?.alchemySuccessRate ?? template?.alchemySuccessRate,
      alchemySpeedRate: item.alchemySpeedRate ?? previousSameItem?.alchemySpeedRate ?? template?.alchemySpeedRate,
      mapUnlockId: item.mapUnlockId ?? previousSameItem?.mapUnlockId,
      mapUnlockIds: item.mapUnlockIds ?? previousSameItem?.mapUnlockIds ?? template?.mapUnlockIds,
      tileAuraGainAmount: item.tileAuraGainAmount ?? previousSameItem?.tileAuraGainAmount,
      allowBatchUse: item.allowBatchUse ?? previousSameItem?.allowBatchUse,
    };
  }  
  /**
 * mergeInventoryUpdate：执行核心业务逻辑。
 * @param previous Inventory | undefined 参数说明。
 * @param patch NEXT_S2C_InventoryUpdate 参数说明。
 * @returns Inventory。
 */


  function mergeInventoryUpdate(previous: Inventory | undefined, patch: NEXT_S2C_InventoryUpdate): Inventory {
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
 * mergeEquipmentUpdate：执行核心业务逻辑。
 * @param previous PlayerState['equipment'] | undefined 参数说明。
 * @param patch NEXT_S2C_EquipmentUpdate 参数说明。
 * @returns PlayerState['equipment']。
 */


  function mergeEquipmentUpdate(previous: PlayerState['equipment'] | undefined, patch: NEXT_S2C_EquipmentUpdate): PlayerState['equipment'] {
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
 * mergeTechniqueStates：执行核心业务逻辑。
 * @param patches import('@mud/shared-next').TechniqueUpdateEntry[] 参数说明。
 * @param removeTechniqueIds string[] removeTechnique ID 集合。
 * @returns TechniqueState[]。
 */


  function mergeTechniqueStates(patches: import('@mud/shared-next').TechniqueUpdateEntry[], removeTechniqueIds: string[] = []): TechniqueState[] {
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
 * mergeActionPatch：执行核心业务逻辑。
 * @param patch ActionUpdateEntry 参数说明。
 * @param previous ActionDef 参数说明。
 * @returns ActionDef。
 */


  function mergeActionPatch(patch: ActionUpdateEntry, previous?: ActionDef): ActionDef {
    const previousSameAction = previous?.id === patch.id ? previous : undefined;
    const skillTemplate = getLocalSkillTemplate(patch.id);
    const nextType = applyNullablePatch(patch.type, previousSameAction?.type) ?? (skillTemplate ? 'skill' : 'interact');
    const isSkillAction = nextType === 'skill';
    return {
      id: patch.id,
      cooldownLeft: patch.cooldownLeft ?? previousSameAction?.cooldownLeft ?? 0,
      autoBattleEnabled: applyNullablePatch(patch.autoBattleEnabled, previousSameAction?.autoBattleEnabled),
      autoBattleOrder: applyNullablePatch(patch.autoBattleOrder, previousSameAction?.autoBattleOrder),
      skillEnabled: applyNullablePatch(patch.skillEnabled, previousSameAction?.skillEnabled),
      name: applyNullablePatch(patch.name, previousSameAction?.name) ?? skillTemplate?.name ?? patch.id,
      type: nextType,
      desc: applyNullablePatch(patch.desc, previousSameAction?.desc) ?? skillTemplate?.desc ?? '',
      range: applyNullablePatch(patch.range, previousSameAction?.range) ?? skillTemplate?.range,
      requiresTarget: applyNullablePatch(patch.requiresTarget, previousSameAction?.requiresTarget)
        ?? skillTemplate?.requiresTarget
        ?? (isSkillAction ? true : undefined),
      targetMode: applyNullablePatch(patch.targetMode, previousSameAction?.targetMode)
        ?? skillTemplate?.targetMode
        ?? (isSkillAction ? 'any' : undefined),
    };
  }  
  /**
 * mergeActionStates：执行核心业务逻辑。
 * @param patches ActionUpdateEntry[] 参数说明。
 * @param removeActionIds string[] removeAction ID 集合。
 * @param actionOrder string[] 参数说明。
 * @returns ActionDef[]。
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
 * haveActionRenderStructureChanges：执行核心业务逻辑。
 * @param previousActions ActionDef[] 参数说明。
 * @param nextActions ActionDef[] 参数说明。
 * @returns boolean。
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
 * haveTechniqueStructureChanges：执行核心业务逻辑。
 * @param previousTechniques TechniqueState[] 参数说明。
 * @param previousCultivatingTechId string | undefined previousCultivatingTech ID。
 * @param nextTechniques TechniqueState[] 参数说明。
 * @param nextCultivatingTechId string | undefined nextCultivatingTech ID。
 * @returns boolean。
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
 * getLatestAttrUpdate：按给定条件读取/查询数据。
 * @returns NEXT_S2C_AttrUpdate | null。
 */

    getLatestAttrUpdate(): NEXT_S2C_AttrUpdate | null {
      return latestAttrUpdate;
    },    
    /**
 * setLatestAttrUpdate：更新/写入相关状态。
 * @param value NEXT_S2C_AttrUpdate | null 参数说明。
 * @returns void。
 */


    setLatestAttrUpdate(value: NEXT_S2C_AttrUpdate | null): void {
      latestAttrUpdate = value;
    },

    buildAttrStateFromPlayer,

    mergeAttrUpdatePatch,    
    /**
 * seedFromPlayer：执行核心业务逻辑。
 * @param player PlayerState 玩家对象。
 * @returns void。
 */


    seedFromPlayer(player: PlayerState): void {
      latestTechniqueMap = new Map((player.techniques ?? []).map((technique) => [technique.techId, cloneJson(technique)]));
      latestActionMap = new Map((player.actions ?? []).map((action) => [action.id, cloneJson(action)]));
    },    
    /**
 * clearCachedState：执行核心业务逻辑。
 * @returns void。
 */


    clearCachedState(): void {
      latestAttrUpdate = null;
      latestTechniqueMap.clear();
      latestActionMap.clear();
    },    
    /**
 * hydrateSyncedItemStack：执行核心业务逻辑。
 * @param item SyncedItemStack 道具。
 * @param previous Inventory['items'][number] 参数说明。
 * @returns Inventory['items'][number]。
 */


    hydrateSyncedItemStack(item: SyncedItemStack, previous?: Inventory['items'][number]): Inventory['items'][number] {
      return hydrateSyncedItemStack(item, previous);
    },    
    /**
 * handleAttrUpdate：处理事件并驱动执行路径。
 * @param data NEXT_S2C_AttrUpdate 原始数据。
 * @returns void。
 */


    handleAttrUpdate(data: NEXT_S2C_AttrUpdate): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      latestAttrUpdate = mergeAttrUpdatePatch(latestAttrUpdate, data);
      const player = options.getPlayer();
      if (player) {
        player.baseAttrs = latestAttrUpdate.baseAttrs ?? player.baseAttrs;
        player.bonuses = latestAttrUpdate.bonuses ?? player.bonuses;
        player.finalAttrs = latestAttrUpdate.finalAttrs ?? player.finalAttrs;
        player.numericStats = latestAttrUpdate.numericStats ?? player.numericStats;
        player.ratioDivisors = latestAttrUpdate.ratioDivisors ?? player.ratioDivisors;
        player.maxHp = latestAttrUpdate.maxHp ?? player.maxHp;
        player.qi = latestAttrUpdate.qi ?? player.qi;
        player.foundation = latestAttrUpdate.specialStats?.foundation ?? player.foundation;
        player.combatExp = latestAttrUpdate.specialStats?.combatExp ?? player.combatExp;
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
 * handleInventoryUpdate：处理事件并驱动执行路径。
 * @param data NEXT_S2C_InventoryUpdate 原始数据。
 * @returns void。
 */


    handleInventoryUpdate(data: NEXT_S2C_InventoryUpdate): void {
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
 * handleEquipmentUpdate：处理事件并驱动执行路径。
 * @param data NEXT_S2C_EquipmentUpdate 原始数据。
 * @returns void。
 */


    handleEquipmentUpdate(data: NEXT_S2C_EquipmentUpdate): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const player = options.getPlayer();
      const mergedEquipment = mergeEquipmentUpdate(player?.equipment, data);
      if (player) {
        player.equipment = mergedEquipment;
        options.inventoryStateSource.syncPlayerContext(player);
      }
      options.equipmentPanel.update(mergedEquipment);
      options.craftWorkbenchModal.syncEquipment();
      options.syncEquipmentBridgeState(mergedEquipment);
      options.syncPlayerBridgeState(player);
    },    
    /**
 * handleTechniqueUpdate：处理事件并驱动执行路径。
 * @param data NEXT_S2C_TechniqueUpdate | NEXT_S2C_PanelTechniqueDelta 原始数据。
 * @returns void。
 */


    handleTechniqueUpdate(data: NEXT_S2C_TechniqueUpdate | NEXT_S2C_PanelTechniqueDelta): void {
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
 * handleActionsUpdate：处理事件并驱动执行路径。
 * @param data NEXT_S2C_ActionsUpdate | NEXT_S2C_PanelActionDelta 原始数据。
 * @returns void。
 */


    handleActionsUpdate(data: NEXT_S2C_ActionsUpdate | NEXT_S2C_PanelActionDelta): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const player = options.getPlayer();
      const mergedActions = mergeActionStates(data.actions ?? [], data.removeActionIds ?? [], data.actionOrder);
      const previousActions = player?.actions ?? [];
      const previousAutoBattle = player?.autoBattle ?? false;
      const previousAutoRetaliate = player?.autoRetaliate ?? true;
      const previousAutoBattleStationary = player?.autoBattleStationary ?? false;
      const previousAllowAoePlayerHit = player?.allowAoePlayerHit ?? false;
      const previousAutoIdleCultivation = player?.autoIdleCultivation ?? true;
      const previousAutoSwitchCultivation = player?.autoSwitchCultivation ?? false;
      const previousCultivationActive = player?.cultivationActive ?? false;
      const nextAutoBattle = data.autoBattle ?? player?.autoBattle ?? false;
      const nextAutoRetaliate = data.autoRetaliate ?? player?.autoRetaliate ?? true;
      const nextAutoBattleStationary = data.autoBattleStationary ?? player?.autoBattleStationary ?? false;
      const nextAllowAoePlayerHit = data.allowAoePlayerHit ?? player?.allowAoePlayerHit ?? false;
      const nextAutoIdleCultivation = data.autoIdleCultivation ?? player?.autoIdleCultivation ?? true;
      const nextAutoSwitchCultivation = data.autoSwitchCultivation ?? player?.autoSwitchCultivation ?? false;
      const nextCultivationActive = data.cultivationActive ?? player?.cultivationActive ?? false;
      const nextSenseQiActive = data.senseQiActive ?? player?.senseQiActive ?? false;
      const shouldRefreshActionPanel = !player
        || previousAutoBattle !== nextAutoBattle
        || previousAutoRetaliate !== nextAutoRetaliate
        || previousAutoBattleStationary !== nextAutoBattleStationary
        || previousAllowAoePlayerHit !== nextAllowAoePlayerHit
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
        player.autoRetaliate = data.autoRetaliate ?? (player.autoRetaliate !== false);
        player.autoBattleStationary = nextAutoBattleStationary;
        player.allowAoePlayerHit = nextAllowAoePlayerHit;
        player.autoIdleCultivation = nextAutoIdleCultivation;
        player.autoSwitchCultivation = nextAutoSwitchCultivation;
        player.cultivationActive = nextCultivationActive;
        player.senseQiActive = nextSenseQiActive;
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
