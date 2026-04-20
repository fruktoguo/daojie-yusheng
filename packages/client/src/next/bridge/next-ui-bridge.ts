import type {
  ActionDef,
  Inventory,
  NEXT_S2C_AttrUpdate,
  PlayerState,
  TechniqueState,
} from '@mud/shared-next';
import type { PanelCapabilities, PanelRuntimeState } from '../../ui/panel-system/types';
import { panelDataStore } from '../stores/panel-data-store';
import { shellStore } from '../stores/shell-store';

export const nextUiBridge = {
/**
 * syncMounted：处理Mounted并更新相关状态。
 * @param mounted boolean 参数说明。
 * @returns 无返回值，直接更新Mounted相关状态。
 */

  syncMounted(mounted: boolean): void {
    shellStore.patchState({ mounted });
  },  
  /**
 * syncEnabled：处理启用并更新相关状态。
 * @param enabled boolean 参数说明。
 * @returns 无返回值，直接更新启用相关状态。
 */


  syncEnabled(enabled: boolean): void {
    shellStore.patchState({ enabled });
  },  
  /**
 * syncRuntime：处理运行态并更新相关状态。
 * @param runtime PanelRuntimeState 参数说明。
 * @returns 无返回值，直接更新运行态相关状态。
 */


  syncRuntime(runtime: PanelRuntimeState): void {
    shellStore.patchState({ runtime: { ...runtime } });
  },  
  /**
 * syncCapabilities：处理Capability并更新相关状态。
 * @param capabilities PanelCapabilities 参数说明。
 * @returns 无返回值，直接更新Capability相关状态。
 */


  syncCapabilities(capabilities: PanelCapabilities): void {
    shellStore.patchState({
      capabilities: {
        ...capabilities,
        safeAreaInsets: { ...capabilities.safeAreaInsets },
      },
    });
  },  
  /**
 * syncPlayer：处理玩家并更新相关状态。
 * @param player PlayerState | null 玩家对象。
 * @returns 无返回值，直接更新玩家相关状态。
 */


  syncPlayer(player: PlayerState | null): void {
    panelDataStore.patchState({ player });
  },  
  /**
 * syncAttrUpdate：处理AttrUpdate并更新相关状态。
 * @param attrUpdate NEXT_S2C_AttrUpdate | null 参数说明。
 * @returns 无返回值，直接更新AttrUpdate相关状态。
 */


  syncAttrUpdate(attrUpdate: NEXT_S2C_AttrUpdate | null): void {
    panelDataStore.patchState({ attrUpdate });
  },  
  /**
 * syncInventory：处理背包并更新相关状态。
 * @param inventory Inventory | null 参数说明。
 * @returns 无返回值，直接更新背包相关状态。
 */


  syncInventory(inventory: Inventory | null): void {
    panelDataStore.patchState({ inventory });
  },  
  /**
 * syncEquipment：处理装备并更新相关状态。
 * @param equipment PlayerState['equipment'] | null 参数说明。
 * @returns 无返回值，直接更新装备相关状态。
 */


  syncEquipment(equipment: PlayerState['equipment'] | null): void {
    panelDataStore.patchState({ equipment });
  },  
  /**
 * syncTechniques：处理功法并更新相关状态。
 * @param techniques TechniqueState[] 参数说明。
 * @param cultivatingTechId string | undefined cultivatingTech ID。
 * @returns 无返回值，直接更新功法相关状态。
 */


  syncTechniques(
    techniques: TechniqueState[],
    cultivatingTechId: string | undefined,
  ): void {
    panelDataStore.patchState({
      techniques,
      cultivatingTechId,
    });
  },  
  /**
 * syncActions：处理Action并更新相关状态。
 * @param actions ActionDef[] 参数说明。
 * @param autoBattle boolean 参数说明。
 * @param autoRetaliate boolean 参数说明。
 * @returns 无返回值，直接更新Action相关状态。
 */


  syncActions(
    actions: ActionDef[],
    autoBattle: boolean,
    autoRetaliate: boolean,
  ): void {
    panelDataStore.patchState({
      actions,
      autoBattle,
      autoRetaliate,
    });
  },  
  /**
 * syncQuests：处理任务并更新相关状态。
 * @param quests PlayerState['quests'] | null 参数说明。
 * @returns 无返回值，直接更新任务相关状态。
 */


  syncQuests(quests: PlayerState['quests'] | null): void {
    panelDataStore.patchState({ quests });
  },  
  /**
 * reset：执行reset相关逻辑。
 * @returns 无返回值，直接更新reset相关状态。
 */


  reset(): void {
    panelDataStore.setState({
      player: null,
      attrUpdate: null,
      inventory: null,
      equipment: null,
      techniques: [],
      cultivatingTechId: undefined,
      actions: [],
      autoBattle: false,
      autoRetaliate: true,
      quests: null,
    });
  },
};
